"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS — dual theme
// ─────────────────────────────────────────────────────────────
const DARK_C = {
  base:      "#0f172a",
  surface:   "#1e293b",
  elevated:  "#263447",
  border:    "rgba(148,163,184,0.12)",
  text:      "#f8fafc",
  textSec:   "#94a3b8",
  textMuted: "#64748b",
  accent:    "#34d399",
  popupBg:   "#1e293b",
  popupText: "#f1f5f9",
  popupSub:  "#94a3b8",
  popupBdr:  "rgba(148,163,184,0.15)",
  ticketNo:  "#93c5fd",
};
const LIGHT_C = {
  base:      "#f8fafc",
  surface:   "#ffffff",
  elevated:  "#f1f5f9",
  border:    "rgba(148,163,184,0.25)",
  text:      "#0f172a",
  textSec:   "#475569",
  textMuted: "#94a3b8",
  accent:    "#059669",
  popupBg:   "#ffffff",
  popupText: "#0f172a",
  popupSub:  "#64748b",
  popupBdr:  "#e2e8f0",
  ticketNo:  "#1e40af",
};

// Tile URLs
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Strip Google Plus Code dari awal alamat.
 * Contoh: "J9M9+2CR Duren, Karawang" → "Duren, Karawang"
 * Full code contoh: "6FP22Q34+2V" → ""  (lalu fallback ke locality)
 */
function stripPlusCode(raw: string): string {
  return raw.replace(/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}\s*/i, "").trim();
}

/** Hapus duplikat spasi dan perbaiki format */
function cleanAddress(raw: string): string {
  return stripPlusCode(raw).replace(/\s{2,}/g, " ").trim();
}

// Cache key — sama untuk sessionStorage & localStorage agar bisa dibaca Interactive Summary HTML
const CACHE_KEY = "noc_geocode_v1";

function loadCache(): Record<string, [number, number] | null> {
  try {
    const sess = sessionStorage.getItem(CACHE_KEY);
    if (sess) return JSON.parse(sess);
    // Seed dari localStorage (diisi sesi sebelumnya / tab lain)
    const local = localStorage.getItem(CACHE_KEY);
    if (local) {
      sessionStorage.setItem(CACHE_KEY, local); // copy ke session agar akses berikutnya cepat
      return JSON.parse(local);
    }
    return {};
  } catch {
    return {};
  }
}

function saveToCache(key: string, val: [number, number] | null) {
  try {
    const c = loadCache();
    c[key] = val;
    const json = JSON.stringify(c);
    sessionStorage.setItem(CACHE_KEY, json);
    localStorage.setItem(CACHE_KEY, json); // juga simpan ke localStorage → bisa dibaca tab lain
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface TicketDetail {
  ticketNo:  string;
  namaLinks: string[];   // semua Nama Link untuk tiket ini
  problem:   string;     // Problem atau Jenis Problem
  status:    string;
}

interface AddrEntry {
  rawAddr:       string;
  ticketDetails: TicketDetail[];
}

interface GeoPoint {
  lat:           number;
  lng:           number;
  count:         number;        // jumlah tiket unik
  rawAddr:       string;
  ticketDetails: TicketDetail[];
}

interface Props {
  reports:   any[];
  darkMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function BackboneHeatmap({ reports, darkMode = true }: Props) {
  const C = darkMode ? DARK_C : LIGHT_C;
  const mapDivRef    = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);      // L.Map instance
  const layerGrpRef  = useRef<any>(null);      // L.LayerGroup for markers
  const tileRef      = useRef<any>(null);      // current tile layer
  const [cache,      setCache]      = useState<Record<string, [number, number] | null>>(loadCache);
  const [progress,   setProgress]   = useState({ done: 0, total: 0, running: false });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showOnlyAlamat, setShowOnlyAlamat] = useState(true);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [filterRegional, setFilterRegional] = useState<string>("ALL");

  // ── Group reports by address → ticket → detail ────────────
  const addressMap = useMemo(() => {
    // Intermediate: address key → ticketNo → row accumulator
    const addrTicket: Record<string, Record<string, {
      namaLinks: string[];
      problem:   string;
      status:    string;
    }>> = {};

    reports.forEach(r => {
      const raw = (r["Alamat Problem"] || "").trim();
      if (!raw) return;
      const cleaned = cleanAddress(raw);
      if (!cleaned) return;

      const addrKey  = cleaned.toLowerCase();
      const ticketNo = (r["NOMOR TICKET"] || String(r.id)).trim();
      const namaLink = (r["Nama Link"] || "").trim();
      const problem  = (r["Problem"] || r["Jenis Problem"] || "").trim();
      const status   = (r["Status Case"] || "").trim();

      if (!addrTicket[addrKey]) addrTicket[addrKey] = {};
      if (!addrTicket[addrKey][ticketNo]) {
        addrTicket[addrKey][ticketNo] = { namaLinks: [], problem, status };
      }
      // Accumulate backbone links per ticket
      if (namaLink && !addrTicket[addrKey][ticketNo].namaLinks.includes(namaLink)) {
        addrTicket[addrKey][ticketNo].namaLinks.push(namaLink);
      }
      // Keep the most descriptive problem
      if (!addrTicket[addrKey][ticketNo].problem && problem) {
        addrTicket[addrKey][ticketNo].problem = problem;
      }
    });

    // Convert to AddrEntry map
    const map: Record<string, AddrEntry> = {};
    Object.entries(addrTicket).forEach(([addrKey, ticketMap]) => {
      // Rebuild rawAddr from first entry
      const rawAddr = cleanAddress(
        (reports.find(r => cleanAddress(r["Alamat Problem"] || "").toLowerCase() === addrKey) || {})["Alamat Problem"] || addrKey
      );
      map[addrKey] = {
        rawAddr,
        ticketDetails: Object.entries(ticketMap).map(([ticketNo, d]) => ({
          ticketNo, ...d,
        })),
      };
    });
    return map;
  }, [reports]);

  // ── All unique Regional values ─────────────────────────────
  const allRegionals = useMemo(() => {
    const set = new Set<string>();
    reports.forEach(r => {
      const reg = (r["Regional"] || "").trim();
      if (reg) set.add(reg);
    });
    return [...set].sort();
  }, [reports]);

  // ── Ticket-to-regional map ─────────────────────────────────
  const ticketRegionalMap = useMemo(() => {
    const m: Record<string, string> = {};
    reports.forEach(r => {
      const tkt = (r["NOMOR TICKET"] || String(r.id)).trim();
      const reg = (r["Regional"] || "").trim();
      if (!m[tkt] && reg) m[tkt] = reg;
    });
    return m;
  }, [reports]);

  // ── Filtered by status ─────────────────────────────────────
  const filteredAddrMap = useMemo(() => {
    const result: Record<string, AddrEntry> = {};
    Object.entries(addressMap).forEach(([k, v]) => {
      let filtered = v.ticketDetails;

      // Status filter
      if (statusFilter !== "ALL") {
        filtered = filtered.filter(td => {
          const st = td.status.toUpperCase();
          if (statusFilter === "ACTIVE") return st !== "SOLVED" && st !== "CANCEL";
          return st === statusFilter;
        });
      }

      // Regional filter
      if (filterRegional !== "ALL") {
        filtered = filtered.filter(td => ticketRegionalMap[td.ticketNo] === filterRegional);
      }

      // Search filter — match backbone name or ticket number
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        filtered = filtered.filter(td =>
          td.ticketNo.toLowerCase().includes(q) ||
          td.namaLinks.some(l => l.toLowerCase().includes(q)) ||
          td.problem.toLowerCase().includes(q)
        );
      }

      if (filtered.length > 0) result[k] = { ...v, ticketDetails: filtered };
    });
    return result;
  }, [addressMap, statusFilter, filterRegional, searchQuery, ticketRegionalMap]);

  // ── Geocode missing addresses (1 req/sec, Nominatim limit) ─
  const geocodeAll = useCallback(async () => {
    const missing = Object.keys(filteredAddrMap).filter(k => !(k in cache));
    if (!missing.length) return;

    setProgress({ done: 0, total: missing.length, running: true });
    const newCache = { ...cache };

    for (let i = 0; i < missing.length; i++) {
      const key   = missing[i];
      const query = (filteredAddrMap[key]?.rawAddr || key) + ", Indonesia";
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const val: [number, number] | null =
          data.lat && data.lon ? [data.lat, data.lon] : null;
        newCache[key] = val;
        saveToCache(key, val);
      } catch {
        newCache[key] = null;
      }
      setCache({ ...newCache });
      setProgress(p => ({ ...p, done: i + 1 }));
      // Nominatim: 1 req/sec
      if (i < missing.length - 1) await new Promise(r => setTimeout(r, 1200));
    }
    setProgress(p => ({ ...p, running: false }));
  }, [filteredAddrMap, cache]);

  // ── Expose cache to window so ReportBackbone can read it instantly ──
  // window.__nocGeocodeCache selalu up-to-date dengan in-memory cache BackboneHeatmap
  useEffect(() => {
    (window as any).__nocGeocodeCache = cache;
  }, [cache]);

  // ── Build GeoPoints from cache ─────────────────────────────
  const geoPoints: GeoPoint[] = useMemo(() => {
    // Cluster by ~2km grid (0.02° ≈ 2.2 km)
    const grid: Record<string, GeoPoint> = {};
    Object.entries(filteredAddrMap).forEach(([key, info]) => {
      const coords = cache[key];
      if (!coords) return;
      const [lat, lng] = coords;
      const gridKey = `${(lat / 0.02).toFixed(0)}_${(lng / 0.02).toFixed(0)}`;
      if (!grid[gridKey]) {
        grid[gridKey] = { lat, lng, count: 0, rawAddr: info.rawAddr, ticketDetails: [] };
      }
      grid[gridKey].count         += info.ticketDetails.length;
      grid[gridKey].ticketDetails  = [...grid[gridKey].ticketDetails, ...info.ticketDetails];
    });
    return Object.values(grid).sort((a, b) => b.count - a.count);
  }, [filteredAddrMap, cache]);

  // ── Init Leaflet map (once) ────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    let cancelled = false;
    import("leaflet").then(Lmod => {
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      const L = Lmod.default ?? Lmod;

      // Fix default marker icon path in Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapDivRef.current!, {
        center:          [-2.5, 118],
        zoom:            5,
        zoomControl:     true,
        scrollWheelZoom: true,
      });

      const tile = L.tileLayer(darkMode ? TILE_DARK : TILE_LIGHT, {
        attribution: TILE_ATTR,
        subdomains:  "abcd",
        maxZoom:     19,
      });
      tile.addTo(map);
      tileRef.current = tile;

      const lg = L.layerGroup().addTo(map);
      mapRef.current   = map;
      layerGrpRef.current = lg;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current      = null;
        layerGrpRef.current = null;
      }
    };
  }, []);

  // ── Swap tile layer saat darkMode berubah ────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then(Lmod => {
      const L = Lmod.default ?? Lmod;
      if (tileRef.current) {
        mapRef.current.removeLayer(tileRef.current);
      }
      const tile = L.tileLayer(darkMode ? TILE_DARK : TILE_LIGHT, {
        attribution: TILE_ATTR,
        subdomains: "abcd",
        maxZoom: 19,
      });
      tile.addTo(mapRef.current);
      tileRef.current = tile;
    });
  }, [darkMode]);

  // ── Update markers when geoPoints change ──────────────────
  useEffect(() => {
    if (!layerGrpRef.current) return;
    import("leaflet").then(Lmod => {
      const L = Lmod.default ?? Lmod;
      layerGrpRef.current.clearLayers();

      if (!geoPoints.length) return;
      const maxCount = Math.max(1, ...geoPoints.map(p => p.count));

      geoPoints.forEach(pt => {
        const intensity = pt.count / maxCount;
        const radius    = Math.max(10, Math.min(50, 10 + intensity * 40));
        const color     = intensity > 0.65 ? "#f87171"
                        : intensity > 0.35 ? "#fb923c"
                        : "#fbbf24";

        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius,
          fillColor:   color,
          fillOpacity: 0.55 + intensity * 0.25,
          color:       color,
          weight:      2,
          opacity:     0.85,
          className:   "backbone-heatpoint",
        });

        // De-duplicate tickets (in case of cluster merge)
        const seenTickets = new Map<string, TicketDetail>();
        pt.ticketDetails.forEach(td => {
          if (!seenTickets.has(td.ticketNo)) seenTickets.set(td.ticketNo, td);
          else {
            // merge namaLinks
            const existing = seenTickets.get(td.ticketNo)!;
            td.namaLinks.forEach(l => {
              if (!existing.namaLinks.includes(l)) existing.namaLinks.push(l);
            });
          }
        });
        const uniqueDetails = [...seenTickets.values()];

        const STATUS_C: Record<string,string> = {
          SOLVED: "#10b981", CANCEL: "#9496a8", PENDING: "#fb923c",
          UNSOLVED: "#f87171", "ON PROGRESS": "#60a5fa", OPEN: "#f5c842",
        };

        const ticketRows = uniqueDetails.slice(0, 6).map((td) => {
          const sc = STATUS_C[td.status.toUpperCase()] || "#94a3b8";
          const namaStr = td.namaLinks.length > 0 ? td.namaLinks.join(", ") : "—";
          return `
            <div style="padding:6px 0;border-bottom:1px solid ${C.popupBdr}">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-family:monospace;font-weight:800;color:${C.ticketNo};font-size:11px">${td.ticketNo}</span>
                <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${sc}25;color:${sc};font-weight:700;border:1px solid ${sc}50">${td.status || "—"}</span>
              </div>
              <div style="display:flex;align-items:flex-start;gap:4px;margin-top:3px">
                <span style="font-size:9px;color:${C.popupSub};flex-shrink:0;margin-top:1px">BB</span>
                <span style="font-size:10px;color:${C.popupText};font-family:sans-serif;line-height:1.4">${namaStr}</span>
              </div>
              ${td.problem ? `
              <div style="display:flex;align-items:flex-start;gap:4px;margin-top:2px">
                <span style="font-size:9px;color:${C.popupSub};flex-shrink:0;margin-top:1px">⚡</span>
                <span style="font-size:10px;color:#f59e0b;font-weight:600;font-family:sans-serif">${td.problem}</span>
              </div>` : ""}
            </div>
          `;
        }).join("");

        const popupHtml = `
          <div style="min-width:240px;max-width:300px;font-size:11px;background:${C.popupBg};color:${C.popupText}">
            <div style="font-size:14px;font-weight:900;color:${color};margin-bottom:2px">
              ${pt.count} Tiket
            </div>
            <div style="color:${C.popupSub};font-size:10px;margin-bottom:8px;font-family:sans-serif;font-style:italic;line-height:1.4">
              📍 ${pt.rawAddr}
            </div>
            <div style="border-top:2px solid ${color}40;padding-top:6px">
              ${ticketRows}
            </div>
            ${uniqueDetails.length > 6 ? `
            <div style="text-align:center;padding:4px 0;font-size:10px;color:${C.popupSub};font-family:sans-serif">
              +${uniqueDetails.length - 6} tiket lainnya
            </div>` : ""}
          </div>
        `;

        circle.bindPopup(popupHtml, { maxWidth: 260 });
        circle.addTo(layerGrpRef.current);
      });

      // Auto-fit bounds to markers
      if (geoPoints.length > 0) {
        const bounds = L.latLngBounds(geoPoints.map(p => [p.lat, p.lng] as [number, number]));
        mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    });
  }, [geoPoints]);

  // ── Stats ─────────────────────────────────────────────────
  const totalAddresses = Object.keys(filteredAddrMap).length;
  const totalMapped    = geoPoints.reduce((s, p) => s + p.count, 0);
  const pctDone        = totalAddresses > 0 ? Math.round((Object.keys(cache).filter(k => k in filteredAddrMap).length / totalAddresses) * 100) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.base }}>

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", flexWrap: "wrap", gap: 8,
        background: C.elevated, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        {/* Left: Status filter + search + regional */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {/* Status filter */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "ALL",      label: "Semua",  color: C.accent   },
              { key: "ACTIVE",   label: "Aktif",  color: "#f5c842"  },
              { key: "SOLVED",   label: "Solved", color: "#10b981"  },
              { key: "CANCEL",   label: "Cancel", color: "#9496a8"  },
            ].map(f => (
              <button key={f.key}
                onClick={() => setStatusFilter(f.key)}
                style={{
                  padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", border: `1px solid ${statusFilter === f.key ? f.color + "60" : C.border}`,
                  background: statusFilter === f.key ? f.color + "18" : C.surface,
                  color: statusFilter === f.key ? f.color : C.textSec,
                  transition: "all 0.15s",
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div style={{ position: "relative", minWidth: 180, maxWidth: 260 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari backbone / tiket..."
              style={{
                width: "100%", background: C.surface, border: `1px solid ${searchQuery ? C.accent + "60" : C.border}`,
                borderRadius: 8, padding: "5px 28px 5px 10px", color: C.text,
                fontSize: 11, outline: "none", fontFamily: "sans-serif",
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: C.textMuted,
                  fontSize: 14, lineHeight: 1, padding: 0,
                }}>×</button>
            )}
          </div>

          {/* Regional filter */}
          {allRegionals.length > 0 && (
            <select
              value={filterRegional}
              onChange={e => setFilterRegional(e.target.value)}
              style={{
                background: C.surface, border: `1px solid ${filterRegional !== "ALL" ? C.accent + "60" : C.border}`,
                borderRadius: 8, padding: "5px 10px", color: filterRegional !== "ALL" ? C.accent : C.textSec,
                fontSize: 11, outline: "none", cursor: "pointer",
              }}>
              <option value="ALL">Semua Regional</option>
              {allRegionals.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {/* Active filters indicator */}
          {(searchQuery || filterRegional !== "ALL") && (
            <button onClick={() => { setSearchQuery(""); setFilterRegional("ALL"); }}
              style={{
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                padding: "4px 10px", borderRadius: 6,
                background: "rgba(248,113,113,0.1)", color: "#f87171",
                border: "1px solid rgba(248,113,113,0.3)",
              }}>
              ✕ Reset Filter
            </button>
          )}
        </div>

        {/* Stats + progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textSec }}>
            <span style={{ color: C.accent, fontWeight: 900 }}>{totalMapped}</span> insiden ·{" "}
            <span style={{ color: C.accent, fontWeight: 900 }}>{geoPoints.length}</span> lokasi dipetakan
          </span>

          {progress.running ? (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#fbbf24",
              background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
              padding: "3px 10px", borderRadius: 6,
            }}>
              ⏳ Geocoding {progress.done}/{progress.total} alamat...
            </span>
          ) : totalAddresses > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: pctDone === 100 ? C.accent : "#f5c842",
              background: pctDone === 100 ? C.border : "rgba(245,200,66,0.1)",
              padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
            }}>
              {pctDone === 100 ? "✓ Semua terpetakan" : `${pctDone}% terpetakan`}
            </span>
          )}

          {/* Geocode button */}
          {!progress.running && Object.keys(filteredAddrMap).some(k => !(k in cache)) && (
            <button onClick={geocodeAll} style={{
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              padding: "4px 12px", borderRadius: 8,
              background: "rgba(52,211,153,0.10)", color: C.accent,
              border: "1px solid rgba(52,211,153,0.25)",
            }}>
              🗺 Geocode Alamat
            </button>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "6px 16px",
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Intensitas
        </span>
        {[
          { color: "#fbbf24", label: "1–2 insiden"  },
          { color: "#fb923c", label: "3–5 insiden"  },
          { color: "#f87171", label: "6+ insiden"   },
        ].map(l => (
          <div key={l.color} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, opacity: 0.85, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.textSec }}>{l.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: C.textMuted, marginLeft: "auto" }}>
          Klik lingkaran untuk melihat detail tiket
        </span>
      </div>

      {/* ── Empty state ── */}
      {!progress.running && geoPoints.length === 0 && totalAddresses === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 28 }}>🗺️</span>
          <p style={{ color: C.textSec, fontSize: 13, fontWeight: 600 }}>Belum ada data Alamat Problem</p>
          <p style={{ color: C.textMuted, fontSize: 11 }}>Isi kolom "Alamat Problem" saat tiket di-SOLVED</p>
        </div>
      )}

      {/* ── No geocoded yet ── */}
      {!progress.running && geoPoints.length === 0 && totalAddresses > 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>📍</span>
          <p style={{ color: C.textSec, fontSize: 13, fontWeight: 600 }}>
            {totalAddresses} alamat ditemukan, belum di-geocode
          </p>
          <button onClick={geocodeAll} style={{
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            padding: "8px 20px", borderRadius: 10,
            background: C.accent, color: "#fff", border: "none",
          }}>
            🗺 Mulai Geocoding
          </button>
          <p style={{ color: C.textMuted, fontSize: 10 }}>
            Proses ~{totalAddresses * 1.2}s · Hasil disimpan di cache browser
          </p>
        </div>
      )}

      {/* ── Map container ── */}
      <div
        ref={mapDivRef}
        style={{
          flex: 1,
          display: (geoPoints.length > 0 || progress.running) ? "block" : "none",
          minHeight: 0,
        }}
      />

      {/* Leaflet CSS — inject if not present */}
      <LeafletCSS />
    </div>
  );
}

// ── Inject Leaflet CSS dynamically ────────────────────────────
function LeafletCSS() {
  useEffect(() => {
    const id = "leaflet-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }, []);
  return null;
}

