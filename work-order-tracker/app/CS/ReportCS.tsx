"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import {
  RefreshCw, Search, Plus, X, Eye, Edit2,
  ChevronLeft, ChevronRight, ExternalLink,
  Headphones, MapPin, Lock, Unlock,
} from "lucide-react";

// ── Supabase ──────────────────────────────────────────────────
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Color tokens ──────────────────────────────────────────────
const C = {
  base:         "var(--bg-base)",
  surface:      "var(--bg-surface)",
  elevated:     "var(--bg-elevated)",
  border:       "var(--border-default)",
  borderMid:    "var(--border-mid)",
  text:         "var(--text-primary)",
  textSec:      "var(--text-secondary)",
  textMuted:    "var(--text-muted)",
  accent:       "#3b82f6",
  accentBg:     "rgba(59,130,246,0.15)",
  accentBorder: "rgba(59,130,246,0.3)",
};

// ── Types ─────────────────────────────────────────────────────
type CSRow = Record<string, any>;
type FormMode = "open" | "close" | "edit";

// ══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

/** Format Date → "Rabu, 7 Mei 2026" */
function formatTanggal(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Format Date → "HH:MM" */
function formatTime(d: Date): string {
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Format Date → "DD/MM/YYYY HH:MM" untuk disimpan di Down Time / UP Time */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const wib = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  return `${pad(wib.getDate())}/${pad(wib.getMonth()+1)}/${wib.getFullYear()} ${pad(wib.getHours())}:${pad(wib.getMinutes())}`;
}

/** Parse berbagai format datetime → Date | null */
function parseDateTime(s: string): Date | null {
  if (!s) return null;
  // DD/MM/YYYY HH:MM
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m1) return new Date(+m1[3], +m1[2]-1, +m1[1], +m1[4], +m1[5]);
  // YYYY-MM-DDTHH:MM
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3], +m2[4], +m2[5]);
  // ISO string
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Hitung MTTR dalam jam (2 desimal) dari dua datetime string */
function calcMTTRHour(downStr: string, upStr: string): number | null {
  const down = parseDateTime(downStr);
  const up   = parseDateTime(upStr);
  if (!down || !up) return null;
  const diffMs = up.getTime() - down.getTime();
  if (diffMs <= 0) return null;
  return Math.round((diffMs / 3_600_000) * 100) / 100;
}

/** SLA berdasarkan jam: < 7j → OK, >= 7j → NOK */
function calcSLA(hours: number | null): string {
  if (hours === null) return "";
  return hours < 7 ? "OK" : "NOK";
}

/** Total SLA Akhir = MTTR (HOUR) - Stop Clock */
function calcTotalSLAAkhir(mttrHour: number | null, stopClockHours: number): number | null {
  if (mttrHour === null) return null;
  return Math.max(0, Math.round((mttrHour - stopClockHours) * 100) / 100);
}

/** Elapsed dari datetime string sampai sekarang → "Xj Ym" */
function calcElapsed(downStr: string, nowMs: number): string {
  const down = parseDateTime(downStr);
  if (!down) return "—";
  const diffMs = nowMs - down.getTime();
  if (diffMs <= 0) return "0j 0m";
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}j ${m}m`;
}

/** Hitung Quantity Impact: jumlah baris non-kosong di textarea */
function calcQuantityImpact(text: string): number {
  return text.split("\n").filter(l => l.trim() !== "").length;
}

// ══════════════════════════════════════════════════════════════
// BADGE COMPONENTS
// ══════════════════════════════════════════════════════════════
function PrioritasBadge({ v }: { v?: string }) {
  if (!v) return <span style={{ color: C.textMuted }}>—</span>;
  const up    = v.toUpperCase();
  const color = up.includes("CRITICAL") ? "#ef4444"
              : up.includes("MAJOR")    ? "#f97316"
              : up.includes("MINOR")    ? "#f5c842"
              :                           "#10b981";
  return <span className="text-[9px] font-black px-1.5 py-0.5 rounded whitespace-nowrap"
               style={{ background: color + "22", color }}>{v}</span>;
}

function StatusTicketBadge({ v }: { v?: string }) {
  if (!v) return <span style={{ color: C.textMuted }}>—</span>;
  const up    = v.toUpperCase();
  const color = up === "OPEN" || up === "ON PROGRESS" || up === "PROGRESS" ? "#f97316"
              : up === "CLOSE" || up === "CLOSED" || up === "SOLVED"       ? "#10b981"
              :                                                               "#6366f1";
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
               style={{ background: color + "22", color }}>{v}</span>;
}

function StatusLinkBadge({ v }: { v?: string }) {
  if (!v) return <span style={{ color: C.textMuted }}>—</span>;
  const up    = v.toUpperCase();
  const color = up === "UP" ? "#10b981" : up === "DOWN" ? "#ef4444" : "#f97316";
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
               style={{ background: color + "22", color }}>{v}</span>;
}

function SlaBadge({ v }: { v?: string }) {
  if (!v) return <span style={{ color: C.textMuted }}>—</span>;
  const color = v.toUpperCase() === "OK" ? "#10b981" : "#ef4444";
  return <span className="text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
               style={{ background: color + "22", color }}>{v}</span>;
}

function Field({ label, value, fullWidth, mono }: { label: string; value?: any; fullWidth?: boolean; mono?: boolean }) {
  const display = value !== null && value !== undefined && value !== "" ? String(value) : "—";
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.textMuted }}>{label}</p>
      <p className={`text-[12px] break-words ${mono ? "font-mono" : ""}`}
         style={{ color: display === "—" ? C.textMuted : C.text }}>{display}</p>
    </div>
  );
}

// ── Form input wrappers ───────────────────────────────────────
function FormInput({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none";
const inputStyle = { background: "var(--bg-surface)", border: `1px solid var(--border-default)`, color: "var(--text-primary)" };
const readOnlyStyle = { background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.25)`, color: "var(--text-primary)" };

// ══════════════════════════════════════════════════════════════
// TABLE COLUMNS
// ══════════════════════════════════════════════════════════════
const TABLE_COLS = [
  { key: "No",                       label: "No",        width: "3rem"  },
  { key: "Tanggal",                  label: "Tanggal",   width: "7rem"  },
  { key: "TICKET",                   label: "Tiket",     width: "8rem"  },
  { key: "Prioritas Level Gangguan", label: "Prioritas", width: "7rem"  },
  { key: "ISP",                      label: "ISP",       width: "6rem"  },
  { key: "Team",                     label: "Team",      width: "6rem"  },
  { key: "Regional",                 label: "Regional",  width: "6rem"  },
  { key: "POP",                      label: "POP",       width: "8rem"  },
  { key: "Status Ticket",            label: "Sts Tiket", width: "7rem"  },
  { key: "Status Link",              label: "Sts Link",  width: "6rem"  },
  { key: "_waktuAktif",              label: "Waktu Aktif",width: "6rem" },
  { key: "MTTR (HOUR)",              label: "MTTR (H)",  width: "5rem"  },
  { key: "SLA",                      label: "SLA",       width: "5rem"  },
];

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function ReportCS() {

  // ── Data ─────────────────────────────────────────────────
  const [rows,     setRows]     = useState<CSRow[]>([]);
  const [fetching, setFetching] = useState(false);

  // ── Live clock for Total Waktu Aktif ─────────────────────
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 30_000); // update tiap 30s
    return () => clearInterval(iv);
  }, []);

  // ── Filters ───────────────────────────────────────────────
  const [search,          setSearch]          = useState("");
  const [filterStatus,    setFilterStatus]    = useState("Semua");
  const [filterRegional,  setFilterRegional]  = useState("Semua");
  const [filterTeam,      setFilterTeam]      = useState("Semua");
  const [filterPrioritas, setFilterPrioritas] = useState("Semua");

  // ── Modals ────────────────────────────────────────────────
  const [detailRow,  setDetailRow]  = useState<CSRow | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [formMode,   setFormMode]   = useState<FormMode>("open");
  const [editRow,    setEditRow]    = useState<CSRow | null>(null);
  const [formData,   setFormData]   = useState<CSRow>({});
  const [saving,     setSaving]     = useState(false);

  // ── Pagination ────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const PAGE_SIZE       = 25;

  // ── Fetch ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from("Report Customer Service")
      .select("*")
      .order("id", { ascending: false });
    if (error) toast.error("Gagal fetch: " + error.message);
    else setRows(data ?? []);
    setFetching(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Dropdown options ──────────────────────────────────────
  const regionalOptions  = useMemo(() => ["Semua", ...Array.from(new Set(rows.map(r => r["Regional"]).filter(Boolean))).sort()], [rows]);
  const teamOptions      = useMemo(() => ["Semua", ...Array.from(new Set(rows.map(r => r["Team"]).filter(Boolean))).sort()], [rows]);
  const prioritasOptions = useMemo(() => ["Semua", ...Array.from(new Set(rows.map(r => r["Prioritas Level Gangguan"]).filter(Boolean)))], [rows]);

  // ── Filter logic ──────────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => {
    const st = (r["Status Ticket"] || "").toUpperCase();
    if (filterStatus === "Open"  && st !== "OPEN" && st !== "ON PROGRESS" && st !== "PROGRESS") return false;
    if (filterStatus === "Close" && st !== "CLOSE" && st !== "CLOSED" && st !== "SOLVED")       return false;
    if (filterStatus === "NOK"   && (r["SLA"] || "").toUpperCase() !== "NOK")                   return false;
    if (filterRegional  !== "Semua" && r["Regional"]                 !== filterRegional)  return false;
    if (filterTeam      !== "Semua" && r["Team"]                     !== filterTeam)      return false;
    if (filterPrioritas !== "Semua" && r["Prioritas Level Gangguan"] !== filterPrioritas) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [r["TICKET"], r["Customer ID"], r["POP"], r["ISP"],
                   r["Impact Customer"], r["Alamat Client"], r["Ticket Client Terimpact"],
                   r["Tanggal"]].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, search, filterStatus, filterRegional, filterTeam, filterPrioritas]);

  const paginated  = useMemo(() => filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [search, filterStatus, filterRegional, filterTeam, filterPrioritas]);

  // ── Stats ─────────────────────────────────────────────────
  const statOpen  = rows.filter(r => { const s=(r["Status Ticket"]||"").toUpperCase(); return s==="OPEN"||s==="ON PROGRESS"||s==="PROGRESS"; }).length;
  const statClose = rows.filter(r => { const s=(r["Status Ticket"]||"").toUpperCase(); return s==="CLOSE"||s==="CLOSED"||s==="SOLVED"; }).length;
  const statNOK   = rows.filter(r => (r["SLA"]||"").toUpperCase() === "NOK").length;

  // ══════════════════════════════════════════════════════════
  // FORM LOGIC
  // ══════════════════════════════════════════════════════════

  const setField = (key: string, val: any) => setFormData(prev => ({ ...prev, [key]: val }));

  /** Auto-kalkulasi yang berjalan setiap kali formData berubah */
  const autoCalcClose = useCallback((data: CSRow): CSRow => {
    const updated = { ...data };

    // Quantity Impact = jumlah baris non-kosong di Impact Customer
    const impactText = updated["Impact Customer"] || "";
    updated["Quantity Impact"] = calcQuantityImpact(impactText);

    // MTTR (HOUR) = Down Time → UP Time
    const mttr = calcMTTRHour(
      updated["Down Time Link (Ticket Client Open)"] || "",
      updated["UP Time Link"] || ""
    );
    if (mttr !== null) {
      updated["MTTR (HOUR)"] = mttr;
      updated["SLA"]         = calcSLA(mttr);
    }

    // Total SLA Akhir = MTTR - Stop Clock
    const stopClock = parseFloat(updated["Akumulasi Stop Clock (Hours)"] || "0") || 0;
    const totalSLA  = calcTotalSLAAkhir(
      updated["MTTR (HOUR)"] !== undefined ? +updated["MTTR (HOUR)"] : null,
      stopClock
    );
    if (totalSLA !== null) {
      updated["Total SLA Akhir"] = totalSLA;
      updated["SLA_1"] = calcSLA(totalSLA);
    }

    return updated;
  }, []);

  /** Update field + jalankan auto-calc */
  const handleFieldChange = (key: string, val: any) => {
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      return autoCalcClose(next);
    });
  };

  /** Hitung No untuk hari ini */
  const getNextNo = useCallback(async (): Promise<string> => {
    const today = formatTanggal(new Date());
    const { count } = await supabase
      .from("Report Customer Service")
      .select("id", { count: "exact", head: true })
      .eq("Tanggal", today);
    return String((count ?? 0) + 1);
  }, []);

  /** Buka form Open Tiket */
  const openNewTicket = async () => {
    const now  = new Date();
    const no   = await getNextNo();
    setEditRow(null);
    setFormMode("open");
    setFormData({
      No:             no,
      Tanggal:        formatTanggal(now),
      Open:           formatTime(now),
      "Status Ticket": "OPEN",
      "Status Link":   "DOWN",
      "Down Time Link (Ticket Client Open)": formatDateTime(now),
    });
    setShowForm(true);
  };

  /** Buka form Close Tiket */
  const openCloseTicket = (row: CSRow) => {
    const now = new Date();
    setEditRow(row);
    setFormMode("close");
    const data: CSRow = {
      ...row,
      Close:          formatTime(now),
      "UP Time Link": formatDateTime(now),
      "Status Ticket": "CLOSE",
      "Status Link":   "UP",
    };
    setFormData(autoCalcClose(data));
    setShowForm(true);
  };

  /** Buka form Edit (semua field) */
  const openEditTicket = (row: CSRow) => {
    setEditRow(row);
    setFormMode("edit");
    setFormData(autoCalcClose({ ...row }));
    setShowForm(true);
  };

  /** Validasi sebelum save */
  const validateForm = (): string | null => {
    const d = formData;
    if (formMode === "open" || formMode === "edit") {
      const required = ["TICKET","Tanggal","Open","Prioritas Level Gangguan","ISP","Team","Regional","POP",
                        "Ticket Client Terimpact","Customer ID","Impact Customer","Alamat Client",
                        "Keterangan","Status Link","Status Ticket",
                        "Down Time Link (Ticket Client Open)","Waktu Responsif CS NOC FMI","Waktu Eskalasi ke Team"];
      for (const k of required) {
        if (!d[k] || String(d[k]).trim() === "") return `Kolom "${k}" wajib diisi`;
      }
    }
    if (formMode === "close" || formMode === "edit") {
      if (d["UP Time Link"]) { // hanya validasi close fields kalau UP Time diisi
        const required = ["Close","Categori Problem","Reason Problem","Power Sebelum Perbaikan",
                          "Power Setelah Perbaikan","Action","Note","UP Time Link",
                          "Akumulasi Stop Clock (Hours)","Note Stop Clock"];
        for (const k of required) {
          if (formMode === "close" && (!d[k] || String(d[k]).trim() === "")) return `Kolom "${k}" wajib diisi`;
        }
      }
    }
    return null;
  };

  /** Save */
  const handleSave = async () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }

    setSaving(true);
    const payload = { ...formData };
    delete payload.id;

    // Total Waktu Aktif saat save
    const downStr = payload["Down Time Link (Ticket Client Open)"] || "";
    payload["Total Waktu Aktif"] = calcElapsed(downStr, Date.now());

    let error;
    if (editRow?.id) {
      ({ error } = await supabase.from("Report Customer Service").update(payload).eq("id", editRow.id));
    } else {
      ({ error } = await supabase.from("Report Customer Service").insert([payload]));
    }
    setSaving(false);
    if (error) { toast.error("Gagal simpan: " + error.message); return; }
    toast.success(formMode === "open" ? "Tiket berhasil dibuka ✓" : formMode === "close" ? "Tiket berhasil ditutup ✓" : "Tiket berhasil diupdate ✓");
    setShowForm(false);
    setEditRow(null);
    setFormData({});
    fetchData();
  };

  // ── Is ticket open? ───────────────────────────────────────
  const isOpen = (r: CSRow) => {
    const s = (r["Status Ticket"] || "").toUpperCase();
    return s === "OPEN" || s === "ON PROGRESS" || s === "PROGRESS";
  };

  // ══════════════════════════════════════════════════════════
  // STATUS TABS
  // ══════════════════════════════════════════════════════════
  const STATUS_TABS = [
    { key: "Semua", label: "Semua",   count: rows.length },
    { key: "Open",  label: "Open",    count: statOpen,  color: "#f97316" },
    { key: "Close", label: "Close",   count: statClose, color: "#10b981" },
    { key: "NOK",   label: "SLA NOK", count: statNOK,   color: "#ef4444" },
  ];

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100%", background: C.base, color: C.text }}>

      {/* ══ HEADER ══ */}
      <header className="flex items-center gap-2 px-5 py-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${C.border}`, background: C.base }}>
        <div className="flex items-center gap-2.5 mr-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}` }}>
            <Headphones size={16} style={{ color: C.accent }} />
          </div>
          <div>
            <h1 className="text-[13px] font-black tracking-tight leading-none" style={{ color: C.text }}>CS Monitor</h1>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: C.textMuted }}>Customer Service · NOC FMI</p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={fetchData} disabled={fetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
          <RefreshCw size={12} className={fetching ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
        <button onClick={openNewTicket}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
          style={{ background: C.accent, color: "#fff" }}>
          <Plus size={12} />
          <span>Open Tiket</span>
        </button>
      </header>

      {/* ══ STAT CARDS ══ */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 flex-shrink-0"
           style={{ borderBottom: `1px solid ${C.border}` }}>
        {([
          { label: "Total Tiket", value: rows.length, color: C.accent,  icon: "📋" },
          { label: "Open",        value: statOpen,    color: "#f97316", icon: "🔴" },
          { label: "Close",       value: statClose,   color: "#10b981", icon: "✅" },
          { label: "SLA NOK",     value: statNOK,     color: "#ef4444", icon: "⚠️" },
        ] as const).map(card => (
          <div key={card.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
               style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <span className="text-xl">{card.icon}</span>
            <div>
              <p className="text-[10px]" style={{ color: C.textMuted }}>{card.label}</p>
              <p className="text-[22px] font-black leading-none tabular-nums" style={{ color: card.color }}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ══ FILTER BAR ══ */}
      <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 flex-wrap"
           style={{ borderBottom: `1px solid ${C.border}` }}>
        {STATUS_TABS.map(tab => {
          const active = filterStatus === tab.key;
          return (
            <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
              style={{
                background: active ? ((tab as any).color ? (tab as any).color+"22" : C.accentBg) : "transparent",
                color:      active ? ((tab as any).color || C.accent) : C.textMuted,
                border:     `1px solid ${active ? ((tab as any).color || C.accent)+"44" : "transparent"}`,
              }}>
              {tab.label}
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black"
                    style={{ background: active ? ((tab as any).color||C.accent)+"33" : C.elevated, color: active ? ((tab as any).color||C.accent) : C.textMuted }}>
                {tab.count}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
             style={{ background: C.surface, border: `1px solid ${C.border}`, minWidth: 200 }}>
          <Search size={12} style={{ color: C.textMuted }} />
          <input type="text" placeholder="Cari tiket, POP, customer..."
                 value={search} onChange={e => setSearch(e.target.value)}
                 className="bg-transparent outline-none text-[11px] flex-1" style={{ color: C.text }} />
          {search && <button onClick={() => setSearch("")} style={{ color: C.textMuted }}><X size={11} /></button>}
        </div>
        <select value={filterRegional} onChange={e => setFilterRegional(e.target.value)}
          className="text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
          {regionalOptions.map(o => <option key={o} value={o}>{o === "Semua" ? "Semua Regional" : o}</option>)}
        </select>
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
          className="text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
          {teamOptions.map(o => <option key={o} value={o}>{o === "Semua" ? "Semua Team" : o}</option>)}
        </select>
        <select value={filterPrioritas} onChange={e => setFilterPrioritas(e.target.value)}
          className="text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
          {prioritasOptions.map(o => <option key={o} value={o}>{o === "Semua" ? "Semua Prioritas" : o}</option>)}
        </select>
      </div>

      {/* ══ TABLE ══ */}
      <div className="flex-1 flex flex-col min-h-0 px-5 py-3">
        <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: 960 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                <tr style={{ background: C.elevated }}>
                  {TABLE_COLS.map(col => (
                    <th key={col.key}
                        className="text-left px-3 py-2.5 font-black uppercase tracking-wide text-[9px] whitespace-nowrap"
                        style={{ color: C.textMuted, borderBottom: `1px solid ${C.border}`, width: col.width, minWidth: col.width }}>
                      {col.label}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-black uppercase tracking-wide text-[9px]"
                      style={{ color: C.textMuted, borderBottom: `1px solid ${C.border}`, width: "8rem" }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {fetching && rows.length === 0 ? (
                  <tr><td colSpan={TABLE_COLS.length + 1} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw size={20} className="animate-spin" style={{ color: C.textMuted }} />
                      <span style={{ color: C.textMuted }}>Memuat data...</span>
                    </div>
                  </td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={TABLE_COLS.length + 1} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">📭</span>
                      <span className="text-[12px]" style={{ color: C.textMuted }}>Tidak ada data</span>
                    </div>
                  </td></tr>
                ) : paginated.map((row, i) => {
                  const ticketIsOpen = isOpen(row);
                  const elapsed      = row["Down Time Link (Ticket Client Open)"]
                    ? calcElapsed(row["Down Time Link (Ticket Client Open)"], nowMs)
                    : "—";
                  return (
                    <tr key={row.id ?? i}
                        className="transition-colors cursor-pointer"
                        style={{ borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        onClick={() => { setDetailRow(row); setShowDetail(true); }}>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: C.textMuted }}>{row["No"] ?? ((page-1)*PAGE_SIZE+i+1)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[10px]" style={{ color: C.textSec }}>{row["Tanggal"] || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono font-black" style={{ color: C.accent }}>{row["TICKET"] || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5"><PrioritasBadge v={row["Prioritas Level Gangguan"]} /></td>
                      <td className="px-3 py-2.5 truncate max-w-[6rem]" style={{ color: C.textSec }}>{row["ISP"] || "—"}</td>
                      <td className="px-3 py-2.5 truncate max-w-[6rem]" style={{ color: C.textSec }}>{row["Team"] || "—"}</td>
                      <td className="px-3 py-2.5 truncate max-w-[6rem]" style={{ color: C.textSec }}>{row["Regional"] || "—"}</td>
                      <td className="px-3 py-2.5 truncate max-w-[8rem]" style={{ color: C.text }}>{row["POP"] || "—"}</td>
                      <td className="px-3 py-2.5"><StatusTicketBadge v={row["Status Ticket"]} /></td>
                      <td className="px-3 py-2.5"><StatusLinkBadge v={row["Status Link"]} /></td>
                      {/* Waktu Aktif — live counter */}
                      <td className="px-3 py-2.5 font-mono text-[10px] font-bold tabular-nums"
                          style={{ color: ticketIsOpen ? "#f97316" : C.textMuted }}>
                        {elapsed}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums" style={{ color: C.textSec }}>
                        {row["MTTR (HOUR)"] != null ? row["MTTR (HOUR)"] : "—"}
                      </td>
                      <td className="px-3 py-2.5"><SlaBadge v={row["SLA"]} /></td>
                      {/* Action */}
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setDetailRow(row); setShowDetail(true); }}
                            className="p-1.5 rounded-lg" title="Detail"
                            style={{ background: C.accentBg, color: C.accent }}>
                            <Eye size={11} />
                          </button>
                          {ticketIsOpen && (
                            <button onClick={() => openCloseTicket(row)}
                              className="p-1.5 rounded-lg text-[9px] font-black px-2"
                              title="Close Tiket"
                              style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                              CLOSE
                            </button>
                          )}
                          <button onClick={() => openEditTicket(row)}
                            className="p-1.5 rounded-lg" title="Edit"
                            style={{ background: "rgba(245,200,66,0.15)", color: "#f5c842" }}>
                            <Edit2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
               style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
            <span className="text-[10px]" style={{ color: C.textMuted }}>
              {filtered.length} tiket · halaman {page} dari {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="p-1.5 rounded-lg disabled:opacity-40"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
                <ChevronLeft size={12} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                const pg = Math.max(1, Math.min(totalPages-4, page-2)) + idx;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className="w-7 h-7 rounded-lg text-[10px] font-bold"
                    style={{ background: pg===page ? C.accent : C.surface, border: `1px solid ${pg===page ? C.accent : C.border}`, color: pg===page ? "#fff" : C.textSec }}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                className="p-1.5 rounded-lg disabled:opacity-40"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DETAIL MODAL
      ══════════════════════════════════════════════════════ */}
      {showDetail && detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
             onClick={() => setShowDetail(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
               style={{ background: C.surface, border: `1px solid ${C.borderMid}` }}
               onClick={e => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
                 style={{ borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-[16px]" style={{ color: C.accent }}>{detailRow["TICKET"] || "—"}</span>
                <PrioritasBadge v={detailRow["Prioritas Level Gangguan"]} />
                <StatusTicketBadge v={detailRow["Status Ticket"]} />
                <StatusLinkBadge v={detailRow["Status Link"]} />
                <SlaBadge v={detailRow["SLA"]} />
                {detailRow["SLA_1"] && <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background:"rgba(99,102,241,0.2)", color:"#818cf8"}}>SLA Akhir: {detailRow["SLA_1"]}</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isOpen(detailRow) && (
                  <button onClick={() => { setShowDetail(false); openCloseTicket(detailRow); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black"
                    style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <Lock size={11} /> Close Tiket
                  </button>
                )}
                <button onClick={() => { setShowDetail(false); openEditTicket(detailRow); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{ background: "rgba(245,200,66,0.15)", color: "#f5c842", border: "1px solid rgba(245,200,66,0.3)" }}>
                  <Edit2 size={11} /> Edit
                </button>
                <button onClick={() => setShowDetail(false)} style={{ color: C.textMuted }}><X size={16} /></button>
              </div>
            </div>
            {/* body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Info Tiket */}
              <section>
                <h3 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>📋 Info Tiket</h3>
                <div className="grid grid-cols-4 gap-3 p-3 rounded-xl" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <Field label="No" value={detailRow["No"]} />
                  <Field label="Tanggal" value={detailRow["Tanggal"]} />
                  <Field label="Open" value={detailRow["Open"]} />
                  <Field label="Close" value={detailRow["Close"]} />
                  <Field label="ISP" value={detailRow["ISP"]} />
                  <Field label="Team" value={detailRow["Team"]} />
                  <Field label="Regional" value={detailRow["Regional"]} />
                  <Field label="POP" value={detailRow["POP"]} />
                </div>
              </section>
              {/* Info Client */}
              <section>
                <h3 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>👤 Info Client</h3>
                <div className="grid grid-cols-4 gap-3 p-3 rounded-xl" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <Field label="Ticket Client Terimpact" value={detailRow["Ticket Client Terimpact"]} />
                  <Field label="Customer ID" value={detailRow["Customer ID"]} />
                  <Field label="Quantity Impact" value={detailRow["Quantity Impact"]} />
                  <Field label="Alamat Client" value={detailRow["Alamat Client"]} />
                  <div className="col-span-4">
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.textMuted }}>Impact Customer</p>
                    <pre className="text-[11px] whitespace-pre-wrap" style={{ color: C.text, fontFamily: "inherit" }}>{detailRow["Impact Customer"] || "—"}</pre>
                  </div>
                </div>
              </section>
              {/* Problem */}
              <section>
                <h3 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>🔧 Problem & Technical</h3>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <Field label="Kategori Problem" value={detailRow["Categori Problem"]} />
                  <Field label="Reason Problem" value={detailRow["Reason Problem"]} />
                  <Field label="Power Sebelum Perbaikan" value={detailRow["Power Sebelum Perbaikan"]} />
                  <Field label="Power Setelah Perbaikan" value={detailRow["Power Setelah Perbaikan"]} />
                  <Field label="Keterangan" value={detailRow["Keterangan"]} fullWidth />
                  {detailRow["Maps"] ? (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.textMuted }}>Maps</p>
                      <a href={detailRow["Maps"]} target="_blank" rel="noreferrer"
                         className="flex items-center gap-1 text-[11px] font-bold" style={{ color: C.accent }}>
                        <MapPin size={11} /> Buka Maps <ExternalLink size={10} />
                      </a>
                    </div>
                  ) : <Field label="Maps" value={detailRow["Maps"]} />}
                  <Field label="Action" value={detailRow["Action"]} />
                  <Field label="Note" value={detailRow["Note"]} />
                </div>
              </section>
              {/* Timeline */}
              <section>
                <h3 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>⏱️ Timeline</h3>
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <Field label="Down Time Link" value={detailRow["Down Time Link (Ticket Client Open)"]} />
                  <Field label="Waktu Responsif CS NOC FMI" value={detailRow["Waktu Responsif CS NOC FMI"]} />
                  <Field label="MTTR Responsif (Menit)" value={detailRow["MTTR (MINUTE)"]} />
                  <Field label="Waktu Eskalasi ke Team" value={detailRow["Waktu Eskalasi ke Team"]} />
                  <Field label="MTTR Eskalasi (Menit)" value={detailRow["MTTR (MINUTE)_1"]} />
                  <Field label="UP Time Link" value={detailRow["UP Time Link"]} />
                  {/* Live waktu aktif */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.textMuted }}>Total Waktu Aktif (Live)</p>
                    <p className="text-[13px] font-black tabular-nums font-mono"
                       style={{ color: isOpen(detailRow) ? "#f97316" : C.text }}>
                      {detailRow["Down Time Link (Ticket Client Open)"]
                        ? calcElapsed(detailRow["Down Time Link (Ticket Client Open)"], nowMs)
                        : "—"}
                    </p>
                  </div>
                </div>
              </section>
              {/* SLA */}
              <section>
                <h3 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>📊 SLA & Stop Clock</h3>
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <Field label="MTTR (Hour)" value={detailRow["MTTR (HOUR)"]} />
                  <Field label="SLA (dari MTTR)" value={detailRow["SLA"]} />
                  <Field label="Akumulasi Stop Clock (Hours)" value={detailRow["Akumulasi Stop Clock (Hours)"]} />
                  <Field label="Total SLA Akhir (Hours)" value={detailRow["Total SLA Akhir"]} />
                  <Field label="SLA Final (setelah stop clock)" value={detailRow["SLA_1"]} />
                  <Field label="Total Waktu Aktif (tersimpan)" value={detailRow["Total Waktu Aktif"]} />
                  <Field label="Note Stop Clock" value={detailRow["Note Stop Clock"]} fullWidth />
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          FORM MODAL (Open / Close / Edit)
      ══════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
             onClick={() => setShowForm(false)}>
          <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden"
               style={{ background: C.surface, border: `1px solid ${C.borderMid}` }}
               onClick={e => e.stopPropagation()}>

            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
                 style={{ borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
              <div className="flex items-center gap-2">
                {formMode === "open"  && <><Plus size={16} style={{ color: C.accent }} /><h2 className="text-[14px] font-black" style={{ color: C.text }}>Open Tiket Baru</h2></>}
                {formMode === "close" && <><Lock size={16} style={{ color: "#10b981" }} /><h2 className="text-[14px] font-black" style={{ color: C.text }}>Close Tiket — {editRow?.["TICKET"]}</h2></>}
                {formMode === "edit"  && <><Edit2 size={16} style={{ color: "#f5c842" }} /><h2 className="text-[14px] font-black" style={{ color: C.text }}>Edit Tiket — {editRow?.["TICKET"]}</h2></>}
              </div>
              <button onClick={() => setShowForm(false)} style={{ color: C.textMuted }}><X size={16} /></button>
            </div>

            {/* form body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* ── OPEN TIKET FIELDS ── */}
              {(formMode === "open" || formMode === "edit") && (
                <>
                  <Section title="📋 Info Tiket">
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="No (auto)" ><input value={formData["No"]||""} readOnly className={inputCls} style={readOnlyStyle} /></FormInput>
                      <FormInput label="Tanggal" required><input value={formData["Tanggal"]||""} onChange={e=>handleFieldChange("Tanggal",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Open (jam buka)" required><input value={formData["Open"]||""} onChange={e=>handleFieldChange("Open",e.target.value)} placeholder="12:30" className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="TICKET *" required><input value={formData["TICKET"]||""} onChange={e=>handleFieldChange("TICKET",e.target.value)} placeholder="HT191234" className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Prioritas Level Gangguan" required>
                        <select value={formData["Prioritas Level Gangguan"]||""} onChange={e=>handleFieldChange("Prioritas Level Gangguan",e.target.value)} className={inputCls} style={inputStyle}>
                          <option value="">— Pilih —</option>
                          {["CRITICAL","MAJOR","MINOR","LOW"].map(o=><option key={o}>{o}</option>)}
                        </select>
                      </FormInput>
                      <FormInput label="ISP" required><input value={formData["ISP"]||""} onChange={e=>handleFieldChange("ISP",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Team" required><input value={formData["Team"]||""} onChange={e=>handleFieldChange("Team",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Regional" required><input value={formData["Regional"]||""} onChange={e=>handleFieldChange("Regional",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="POP" required><input value={formData["POP"]||""} onChange={e=>handleFieldChange("POP",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Status Link" required>
                        <select value={formData["Status Link"]||""} onChange={e=>handleFieldChange("Status Link",e.target.value)} className={inputCls} style={inputStyle}>
                          <option value="">— Pilih —</option>
                          {["UP","DOWN","UNMONITOR"].map(o=><option key={o}>{o}</option>)}
                        </select>
                      </FormInput>
                      <FormInput label="Status Ticket" required>
                        <select value={formData["Status Ticket"]||""} onChange={e=>handleFieldChange("Status Ticket",e.target.value)} className={inputCls} style={inputStyle}>
                          <option value="">— Pilih —</option>
                          {["OPEN","ON PROGRESS","CLOSE","SOLVED","CANCEL"].map(o=><option key={o}>{o}</option>)}
                        </select>
                      </FormInput>
                    </div>
                  </Section>

                  <Section title="👤 Info Client">
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="Ticket Client Terimpact" required><input value={formData["Ticket Client Terimpact"]||""} onChange={e=>handleFieldChange("Ticket Client Terimpact",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Customer ID" required><input value={formData["Customer ID"]||""} onChange={e=>handleFieldChange("Customer ID",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Alamat Client" required><input value={formData["Alamat Client"]||""} onChange={e=>handleFieldChange("Alamat Client",e.target.value)} className={inputCls} style={inputStyle} /></FormInput>
                      <FormInput label="Quantity Impact (auto-hitung)">
                        <input value={formData["Quantity Impact"]||0} readOnly className={inputCls} style={readOnlyStyle} />
                      </FormInput>
                      <div className="col-span-2">
                        <FormInput label="Impact Customer (pisah Enter per baris)" required>
                          <textarea rows={4} value={formData["Impact Customer"]||""}
                            onChange={e=>handleFieldChange("Impact Customer",e.target.value)}
                            placeholder={"Pelanggan A\nPelanggan B\nPelanggan C"}
                            className={inputCls+" resize-none"} style={inputStyle} />
                        </FormInput>
                        <p className="text-[10px] mt-1" style={{ color: C.textMuted }}>
                          Quantity terhitung: <strong style={{ color: C.accent }}>{calcQuantityImpact(formData["Impact Customer"]||"")}</strong> baris
                        </p>
                      </div>
                    </div>
                  </Section>

                  <Section title="⏱️ Timeline Awal">
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="Down Time Link (Ticket Client Open)" required>
                        <input value={formData["Down Time Link (Ticket Client Open)"]||""} onChange={e=>handleFieldChange("Down Time Link (Ticket Client Open)",e.target.value)} placeholder="DD/MM/YYYY HH:MM" className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Waktu Responsif CS NOC FMI" required>
                        <input value={formData["Waktu Responsif CS NOC FMI"]||""} onChange={e=>handleFieldChange("Waktu Responsif CS NOC FMI",e.target.value)} placeholder="DD/MM/YYYY HH:MM" className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="MTTR Responsif (Menit)">
                        <input type="number" value={formData["MTTR (MINUTE)"]||""} onChange={e=>handleFieldChange("MTTR (MINUTE)",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Waktu Eskalasi ke Team" required>
                        <input value={formData["Waktu Eskalasi ke Team"]||""} onChange={e=>handleFieldChange("Waktu Eskalasi ke Team",e.target.value)} placeholder="DD/MM/YYYY HH:MM" className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="MTTR Eskalasi (Menit)">
                        <input type="number" value={formData["MTTR (MINUTE)_1"]||""} onChange={e=>handleFieldChange("MTTR (MINUTE)_1",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                    </div>
                  </Section>

                  <Section title="📝 Keterangan">
                    <FormInput label="Keterangan (update per jam)" required>
                      <textarea rows={4} value={formData["Keterangan"]||""} onChange={e=>handleFieldChange("Keterangan",e.target.value)}
                        placeholder="Update kondisi terkini..." className={inputCls+" resize-none"} style={inputStyle} />
                    </FormInput>
                  </Section>
                </>
              )}

              {/* ── CLOSE TIKET FIELDS ── */}
              {(formMode === "close" || formMode === "edit") && (
                <>
                  <Section title="🔒 Close Tiket" accent="#10b981">
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="Close (jam tutup)" required={formMode==="close"}>
                        <input value={formData["Close"]||""} onChange={e=>handleFieldChange("Close",e.target.value)} placeholder="HH:MM" className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="UP Time Link" required={formMode==="close"}>
                        <input value={formData["UP Time Link"]||""} onChange={e=>handleFieldChange("UP Time Link",e.target.value)} placeholder="DD/MM/YYYY HH:MM" className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Kategori Problem" required={formMode==="close"}>
                        <input value={formData["Categori Problem"]||""} onChange={e=>handleFieldChange("Categori Problem",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Reason Problem" required={formMode==="close"}>
                        <input value={formData["Reason Problem"]||""} onChange={e=>handleFieldChange("Reason Problem",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Power Sebelum Perbaikan" required={formMode==="close"}>
                        <input value={formData["Power Sebelum Perbaikan"]||""} onChange={e=>handleFieldChange("Power Sebelum Perbaikan",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Power Setelah Perbaikan" required={formMode==="close"}>
                        <input value={formData["Power Setelah Perbaikan"]||""} onChange={e=>handleFieldChange("Power Setelah Perbaikan",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Maps (URL Google Maps)" required={formMode==="close"}>
                        <input value={formData["Maps"]||""} onChange={e=>handleFieldChange("Maps",e.target.value)} placeholder="https://maps.google.com/..." className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Action" required={formMode==="close"}>
                        <input value={formData["Action"]||""} onChange={e=>handleFieldChange("Action",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <FormInput label="Akumulasi Stop Clock (Hours)" required={formMode==="close"}>
                        <input type="number" step="0.01" value={formData["Akumulasi Stop Clock (Hours)"]||""} onChange={e=>handleFieldChange("Akumulasi Stop Clock (Hours)",e.target.value)} className={inputCls} style={inputStyle} />
                      </FormInput>
                      <div className="col-span-2">
                        <FormInput label="Note Stop Clock" required={formMode==="close"}>
                          <textarea rows={2} value={formData["Note Stop Clock"]||""} onChange={e=>handleFieldChange("Note Stop Clock",e.target.value)} className={inputCls+" resize-none"} style={inputStyle} />
                        </FormInput>
                      </div>
                      <div className="col-span-2">
                        <FormInput label="Note" required={formMode==="close"}>
                          <textarea rows={3} value={formData["Note"]||""} onChange={e=>handleFieldChange("Note",e.target.value)} className={inputCls+" resize-none"} style={inputStyle} />
                        </FormInput>
                      </div>
                    </div>
                  </Section>

                  {/* Auto-calculated preview */}
                  <Section title="🤖 Auto-Kalkulasi (read-only)" accent={C.accent}>
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="MTTR (HOUR) = Down Time → UP Time">
                        <input value={formData["MTTR (HOUR)"] !== undefined ? formData["MTTR (HOUR)"] : "— (isi UP Time)"} readOnly className={inputCls} style={readOnlyStyle} />
                      </FormInput>
                      <FormInput label="SLA (<7j = OK, ≥7j = NOK)">
                        <input value={formData["SLA"] || "—"} readOnly className={inputCls} style={readOnlyStyle} />
                      </FormInput>
                      <FormInput label="Total SLA Akhir = MTTR − Stop Clock">
                        <input value={formData["Total SLA Akhir"] !== undefined ? formData["Total SLA Akhir"] : "—"} readOnly className={inputCls} style={readOnlyStyle} />
                      </FormInput>
                      <FormInput label="SLA Final (Total SLA Akhir)">
                        <input value={formData["SLA_1"] || "—"} readOnly className={inputCls} style={readOnlyStyle} />
                      </FormInput>
                    </div>
                  </Section>
                </>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
                 style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-[11px] font-medium"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
                Batal
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold disabled:opacity-60"
                style={{
                  background: formMode === "close" ? "#10b981" : C.accent,
                  color: "#fff",
                }}>
                {saving ? <RefreshCw size={11} className="animate-spin" /> : null}
                {saving ? "Menyimpan..." : formMode === "open" ? "Buka Tiket" : formMode === "close" ? "Tutup Tiket" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper helper ────────────────────────────────────
function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div>
      <h3 className="text-[9px] font-black uppercase tracking-widest mb-2"
          style={{ color: accent || "var(--text-muted)" }}>{title}</h3>
      <div className="p-4 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
        {children}
      </div>
    </div>
  );
}
