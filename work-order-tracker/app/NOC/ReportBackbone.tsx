"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import {
  Network, Plus, RefreshCw, LayoutGrid, List, Search, Sheet, FileDown,
  MessageSquare, Copy, Check, Bell, AlertTriangle, Clock, MapPin,
  Activity, CheckCircle2, XCircle, BellOff, Code2,
} from "lucide-react";

const BackboneHeatmap = dynamic(() => import("./BackboneHeatmap"), {
  ssr:     false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm" style={{ color: "#6a6a64" }}>Loading heatmap...</div>
    </div>
  ),
});

const CalendarHeatmap = dynamic(() => import("./CalendarHeatmap"), {
  ssr:     false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm" style={{ color: "#6a6a64" }}>Loading kalender...</div>
    </div>
  ),
});

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS  — dual-theme system
// ─────────────────────────────────────────────────────────────
const C_DARK = {
  base:        "#111110",
  surface:     "#1c1c1a",
  elevated:    "#242422",
  subtle:      "#2e2e2c",
  border:      "rgba(255,255,255,0.07)",
  borderMid:   "rgba(255,255,255,0.12)",
  text:        "#f0efe8",
  textSec:     "#c8c8c0",
  textMuted:   "#909088",
  accent:      "#f0efe8",
  accentBg:    "rgba(240,239,232,0.08)",
  accentBorder:"rgba(240,239,232,0.15)",
  // Primary action button: light background + dark text (readable in dark mode)
  btnBg:       "#f0efe8",
  btnText:     "#111110",
};
const C_LIGHT = {
  base:        "#f6f7ed",
  surface:     "#ffffff",
  elevated:    "#f0f1e8",
  subtle:      "#e8e9e0",
  border:      "#e5e6dd",
  borderMid:   "#d5d6cd",
  text:        "#1a1a18",
  textSec:     "#323230",
  textMuted:   "#585856",
  accent:      "#1a1a18",
  accentBg:    "rgba(26,26,24,0.06)",
  accentBorder:"rgba(26,26,24,0.15)",
  // Primary action button: dark background + light text (readable in light mode)
  btnBg:       "#1a1a18",
  btnText:     "#f6f7ed",
};
type Theme = typeof C_DARK;
const ThemeCtx = React.createContext<Theme>(C_DARK);
const useTheme  = () => React.useContext(ThemeCtx);
const getInputStyle = (C: Theme): React.CSSProperties => ({
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "10px 14px", color: C.text,
  fontSize: 13, outline: "none", fontFamily: "var(--font-sans)",
  // Auto-detect dark/light from surface color so native elements (select, date) follow theme
  colorScheme: C.surface === "#ffffff" ? "light" : "dark",
});

// C_DARK used as fallback in module-level helper functions
const C = C_DARK;

// ── Stop Clock Info helper ──────────────────────────────────────
// Komputasi info stop clock untuk sebuah tiket (pure function, bisa dipanggil di mana saja)
function getStopClockInfo(ticketNo: string, stopClocks: any[], nowMs = Date.now()) {
  const clocks = stopClocks.filter(c => c.ticket_no === ticketNo);
  let totalPausedMin = 0;
  let hasActive = false;
  let activeId: number | null = null;
  let activeStartedAt: string | null = null;
  clocks.forEach(c => {
    const s = new Date(c.started_at).getTime();
    if (c.ended_at) {
      totalPausedMin += Math.floor((new Date(c.ended_at).getTime() - s) / 60_000);
    } else {
      hasActive = true;
      activeId = c.id;
      activeStartedAt = c.started_at;
      totalPausedMin += Math.floor((nowMs - s) / 60_000);
    }
  });
  return { totalPausedMin, hasActive, activeId, activeStartedAt, count: clocks.length };
}

// Status color map
const STATUS_COLOR: Record<string, string> = {
  "OPEN":        "#f5c842",
  "ON PROGRESS": "#60a5fa",
  "PENDING":     "#fb923c",
  "UNSOLVED":    "#f87171",
  "SOLVED":      "#10b981",
  "CANCEL":      "#9496a8",
};

// Kanban columns (OPEN dihapus — tidak terpakai)
const KANBAN_COLS = [
  { status: "ON PROGRESS", label: "On Progress" },
  { status: "PENDING",     label: "Pending"     },
  { status: "UNSOLVED",    label: "Unsolved"    },
  { status: "SOLVED",      label: "Solved"      },
  { status: "CANCEL",      label: "Cancel"      },
];

// Status tabs (table view — termasuk OPEN untuk filter)
const STATUS_TABS = [
  { key: "ALL",         label: "Semua"       },
  { key: "ON PROGRESS", label: "On Progress" },
  { key: "PENDING",     label: "Pending"     },
  { key: "UNSOLVED",    label: "Unsolved"    },
  { key: "SOLVED",      label: "Solved"      },
  { key: "CANCEL",      label: "Cancel"      },
];

// ─────────────────────────────────────────────────────────────
// LIVE CLOCK
// ─────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{now.toLocaleString("id-ID")}</>;
}

// ─────────────────────────────────────────────────────────────
// LIVE MTTR (updates every 60 s)
// ─────────────────────────────────────────────────────────────
function LiveMTTR({ startTime, stopClocksForTicket = [] }: { startTime: string; stopClocksForTicket?: any[] }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Kurangi total pause stop clock dari elapsed time
  const pausedMs = stopClocksForTicket.reduce((acc, c) => {
    const s = new Date(c.started_at).getTime();
    const e = c.ended_at ? new Date(c.ended_at).getTime() : now.getTime();
    return acc + Math.max(0, e - s);
  }, 0);
  const rawMs  = Math.max(0, now.getTime() - parseDateTime(startTime).getTime() - pausedMs);
  const rawMin = Math.floor(rawMs / 60_000);
  return <>{formatMTTR(rawMin)}</>;
}

// ─────────────────────────────────────────────────────────────
// SLA COUNTDOWN (updates every 1 s)
// ─────────────────────────────────────────────────────────────
// Set untuk track tiket yang sudah dapat notifikasi (hindari spam)
const slaNotifiedSet = new Set<string>();

function SLACountdown({ startTime, compact, ticketNo, stopClocksForTicket = [] }: {
  startTime: string; compact?: boolean; ticketNo?: string; stopClocksForTicket?: any[];
}) {
  const C = useTheme();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Kurangi waktu pause stop clock dari elapsed time
  const pausedMs = stopClocksForTicket.reduce((acc, c) => {
    const s = new Date(c.started_at).getTime();
    const e = c.ended_at ? new Date(c.ended_at).getTime() : now.getTime();
    return acc + Math.max(0, e - s);
  }, 0);
  const diffMs  = Math.max(0, now.getTime() - parseDateTime(startTime).getTime() - pausedMs);
  const diffH   = diffMs / 3_600_000;
  const h       = Math.floor(diffH);
  const m       = Math.floor((diffH % 1) * 60);
  const s       = Math.floor((diffMs % 60_000) / 1000);
  const minsLeft = Math.max(0, (7 * 60) - Math.floor(diffMs / 60_000));
  const isWarn  = diffH >= 6 && diffH < 7;   // ≤ 60 menit lagi
  const isCrit  = diffH >= 6.5 && diffH < 7; // ≤ 30 menit lagi
  const isOver  = diffH >= 7;
  const pct     = Math.min(100, (diffH / 7) * 100);
  const color   = isOver ? "#f87171" : isWarn ? "#f5c842" : "#10b981";
  const barCls  = isOver ? "bg-red-500" : isWarn ? "bg-amber-400" : "bg-emerald-500";

  // Browser notification saat ≤ 30 menit menuju breach (sekali saja per tiket per-session)
  useEffect(() => {
    if (!isCrit || !ticketNo || slaNotifiedSet.has(ticketNo)) return;
    slaNotifiedSet.add(ticketNo);
    const body = `Tiket ${ticketNo} — ${minsLeft} menit lagi sebelum SLA breach!`;
    const fire = () => new Notification("⚠️ SLA Hampir Habis!", { body, icon: "/favicon.ico" });
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") { fire(); }
    else if (Notification.permission !== "denied") { Notification.requestPermission().then(p => { if (p === "granted") fire(); }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrit, ticketNo]); // minsLeft intentionally excluded — notification fires once when isCrit first becomes true

  if (compact) {
    return (
      <span className={`font-mono text-[10px] font-black tabular-nums ${isOver || isCrit ? "animate-pulse" : ""}`}
            style={{ color }}>
        {String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px]">
      {/* Warning label saat kritis */}
      {isCrit && !isOver && (
        <span className="text-[8px] font-black tracking-wide px-1.5 py-0.5 rounded animate-pulse"
              style={{ background: "rgba(245,200,66,0.2)", color: "#f5c842" }}>
          ⚠ {minsLeft}m lagi
        </span>
      )}
      <span className={`font-mono text-[11px] font-black tabular-nums ${isOver || isCrit ? "animate-pulse" : ""}`}
            style={{ color }}>
        {String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </span>
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: C.subtle }}>
        <div className={`h-full rounded-full transition-[width] duration-1000 ${barCls} ${isOver || isCrit ? "animate-pulse" : ""}`}
             style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[9px] font-black tracking-wide ${isOver ? "animate-pulse" : ""}`} style={{ color }}>
        {isOver ? `NOK +${Math.floor(diffH - 7)}j${Math.floor(((diffH - 7) % 1) * 60)}m` : "OK"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const C = useTheme();
  const s  = normalizeStatus(status || "OPEN");
  const ac = STATUS_COLOR[s] ?? STATUS_COLOR["OPEN"];
  const pulse = ["OPEN","ON PROGRESS","UNSOLVED"].includes(s);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold"
          style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pulse ? "animate-pulse" : ""}`}
            style={{ background: ac }} />
      {s}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, icon: Icon }: { label: string; value: number; accent: string; icon?: React.ElementType }) {
  const C = useTheme();
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {Icon && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
      )}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>{label}</p>
        <p className="text-2xl font-black" style={{ color: accent }}>{value}</p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// KANBAN CARD (draggable)
// ─────────────────────────────────────────────────────────────
function KanbanCard({ group, ticketNo, onDetail, onUpdate, onDragStart, onDragEnd, isDragging, stopClocksForTicket = [], onStopClock }: {
  group: any[];
  ticketNo: string;
  onDetail: () => void;
  onUpdate: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  stopClocksForTicket?: any[];
  onStopClock?: () => void;
}) {
  const C = useTheme();
  const first  = group[0];
  const active = isActive(group);
  const status = getTicketStatus(group);
  const ac     = STATUS_COLOR[status] ?? STATUS_COLOR["OPEN"];

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      className="rounded-xl p-3.5 space-y-2.5 transition-all select-none"
      style={{
        background:   C.surface,
        border:       `1px solid ${C.border}`,
        cursor:       "grab",
        opacity:      isDragging ? 0.4 : 1,
        transform:    isDragging ? "scale(0.97)" : "scale(1)",
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = C.borderMid; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
    >
      {/* Drag handle hint */}
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[10px] tracking-widest" style={{ color: C.textMuted }}>⠿ drag</span>
        {first["Priority"] && (
          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: first["Priority"] === "CRITICAL" ? "rgba(248,113,113,0.12)" : "rgba(251,146,60,0.12)",
                  color:      first["Priority"] === "CRITICAL" ? "#f87171" : "#fb923c",
                  border:     `1px solid ${first["Priority"] === "CRITICAL" ? "rgba(248,113,113,0.3)" : "rgba(251,146,60,0.3)"}`,
                }}>
            {first["Priority"]}
          </span>
        )}
      </div>

      {/* Ticket number */}
      <button onClick={onDetail}
        className="font-mono font-black text-[11px] text-left leading-tight transition-opacity hover:opacity-70 block"
        style={{ color: ac }}>
        {ticketNo}
      </button>

      {/* Subject */}
      <p className="text-[11px] leading-snug line-clamp-2" style={{ color: C.textSec }}>
        {first["Subject Ticket / Email"] || "No Subject"}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: C.elevated, color: C.textMuted }}>
          {group.length} link
        </span>
        {first["Jenis Problem"] && (
          <span className="text-[9px]" style={{ color: C.textMuted }}>{first["Jenis Problem"]}</span>
        )}
      </div>

      {/* SLA countdown */}
      {/* Stop Clock badge */}
      {stopClocksForTicket.length > 0 && (
        <div className="flex items-center gap-1.5">
          {stopClocksForTicket.some(c => !c.ended_at) && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded animate-pulse"
                  style={{ background: "rgba(251,146,60,0.2)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.4)" }}>
              ⏸ SLA PAUSED
            </span>
          )}
          {stopClocksForTicket.length >= 3 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
              ⚠ {stopClocksForTicket.length}× pause
            </span>
          )}
        </div>
      )}

      {active && first["Start Time"] && (
        <div className="pt-1 border-t" style={{ borderColor: C.border }}>
          <SLACountdown startTime={first["Start Time"]} compact ticketNo={ticketNo} stopClocksForTicket={stopClocksForTicket} />
        </div>
      )}

      {/* Update button */}
      {active && (
        <button onClick={e => { e.stopPropagation(); onUpdate(); }}
          className="w-full py-1.5 rounded-lg text-[10px] font-bold transition-all"
          style={{ background: `${ac}15`, color: ac, border: `1px solid ${ac}30` }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = ac; (e.currentTarget as HTMLElement).style.color = status === "PENDING" ? "#0f172a" : "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${ac}15`; (e.currentTarget as HTMLElement).style.color = ac; }}>
          UPDATE
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const SLA_MAX_HOURS = 7;

// Ekstrak 5-digit numeric prefix dari kode backbone (support old combined format)
// "00458/PoP ABDUL WAHAB" → "00458"   |   "00001" → "00001"   |   "00001/TAMBORA <>" → "00001"
const extractKodeNum = (s: string): string => {
  const m = (s || "").match(/^(\d+)/);
  return m ? m[1].padStart(5, "0") : s;
};

// Apakah entry ini adalah PoP (bukan backbone link)?
const isPopEntry = (d: any): boolean => {
  const kode = (d["KODE BACKBONE"] || "").toUpperCase();
  const nama = (d["NAMA BACKBONE"] || "").toUpperCase();
  return kode.includes("/POP") || kode.startsWith("POP") || nama.startsWith("POP") || nama.includes(" POP ");
};

// Apakah entry ini adalah backbone link (bukan PoP)?
const isLinkEntry = (d: any): boolean => {
  const kode = (d["KODE BACKBONE"] || "");
  const nama = (d["NAMA BACKBONE"] || "");
  return kode.includes("<>") || nama.includes("<>");
};

const EMPTY_HEADER = {
  "Hari dan Tanggal Report": new Date().toISOString().split("T")[0],
  "Open Ticket":             "",
  "NOMOR TICKET":            "",
  "Subject Ticket / Email":  "",
  "Jenis Problem":           "",
  "Status Case":             "OPEN",
  "Start Time":              "",
  "Priority":                "",
};
const EMPTY_LINK = { namaLink: "", kodeBackbone: "", capacity: "" };

type SolveAction = "SOLVED" | "CANCEL" | "ON PROGRESS" | "PENDING" | "UNSOLVED";
type ViewMode    = "table" | "kanban";

const EMPTY_SOLVE = {
  "Closed Ticket":               "",
  "Near End":                    "",
  "Far End":                     "",
  "Problem":                     "",
  "Status Case":                 "SOLVED",
  "Problem & Action":            "",
  "Titik Kordinat Cut / Bending":"",
  "Alamat Problem":              "",
  "Regional":                    "",
  "Hari dan Tanggal Closed":     "",
  "End Time":                    "",
  "Cancel Reason":               "",
};

type LinkRow = { namaLink: string; kodeBackbone: string; capacity: string };

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

// Parse berbagai format tanggal/waktu ke Date object
// Mendukung: DD/MM/YYYY HH:MM:SS | DD/MM/YYYY HH:MM | DD/MM/YYYY | YYYY-MM-DD... | ISO
function parseDateTime(str: string): Date {
  if (!str) return new Date(NaN);
  const s = str.trim();
  // DD/MM/YYYY HH:MM:SS
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m1) return new Date(`${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}T${m1[4].padStart(2,"0")}:${m1[5]}:${m1[6]}`);
  // DD/MM/YYYY HH:MM
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m2) return new Date(`${m2[3]}-${m2[2].padStart(2,"0")}-${m2[1].padStart(2,"0")}T${m2[4].padStart(2,"0")}:${m2[5]}:00`);
  // DD/MM/YYYY
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return new Date(`${m3[3]}-${m3[2].padStart(2,"0")}-${m3[1].padStart(2,"0")}`);
  // Fallback: native parsing (ISO, "YYYY-MM-DD HH:MM:SS", dll.)
  return new Date(s);
}

// YYYY-MM-DD → "17 April 2026"
function toIndonesianDate(isoDate: string): string {
  if (!isoDate) return "";
  const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli",
                  "Agustus","September","Oktober","November","Desember"];
  const [yyyy, mm, dd] = isoDate.split("-");
  if (!yyyy || !mm || !dd) return isoDate;
  return `${parseInt(dd)} ${months[parseInt(mm) - 1]} ${yyyy}`;
}

// YYYY-MM-DD → "17/04/2026"
function toDDMMYYYY(isoDate: string): string {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  if (!yyyy || !mm || !dd) return isoDate;
  return `${dd}/${mm}/${yyyy}`;
}

// Format Date → "Jumat, 17 April 2026"
const HARI_ID  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli",
                  "Agustus","September","Oktober","November","Desember"];
function formatHariTanggal(date: Date): string {
  return `${HARI_ID[date.getDay()]}, ${date.getDate()} ${BULAN_ID[date.getMonth()]} ${date.getFullYear()}`;
}

// Render teks dengan URL → clickable link
function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
             style={{ color: "#34d399", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
      : <span key={i}>{part}</span>
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Normalisasi status dari DB → canonical status key
// Menangani typo / variasi penulisan dari Supabase
function normalizeStatus(raw: string | null | undefined): string {
  if (!raw) return "OPEN";
  const s = raw.toString().trim().toUpperCase();
  if (s === "ON PROGRESS" || s === "ONPROGRES" || s === "ONPROGRESS" || s === "ON PROGRES") return "ON PROGRESS";
  if (s === "SOLVED")   return "SOLVED";
  if (s === "PENDING")  return "PENDING";
  if (s === "UNSOLVED") return "UNSOLVED";
  if (s === "CANCEL" || s === "CANCELLED" || s === "CANCELED") return "CANCEL";
  if (s === "OPEN")     return "OPEN";
  return s; // fallback ke raw (uppercase)
}

function calcMTTRMinutes(startStr: string, endStr: string): number {
  return Math.max(0, Math.floor(
    (parseDateTime(endStr).getTime() - parseDateTime(startStr).getTime()) / 60_000
  ));
}

function formatMTTR(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(Number(minutes))) return "—";
  const m = Number(minutes);
  return `${Math.floor(m / 60)}j ${m % 60}m`;
}

function calcSLA(startStr: string, endStr?: string) {
  if (!startStr) return { isOK: true, text: "—", percentage: 100 };
  const start = parseDateTime(startStr);
  const end   = endStr ? parseDateTime(endStr) : new Date();
  const diffH = (end.getTime() - start.getTime()) / 3_600_000;
  return {
    isOK: diffH <= SLA_MAX_HOURS,
    text: `${Math.floor(diffH)}j ${Math.floor((diffH % 1) * 60)}m`,
    percentage: Math.max(0, Math.min(100, ((SLA_MAX_HOURS - diffH) / SLA_MAX_HOURS) * 100)),
  };
}

/**
 * Hitung SLA dari MTTR efektif (menit) — sudah dikurangi stop clock.
 * Digunakan saat SOLVED agar MTTR & SLA tersimpan akurat ke DB.
 */
function calcSLAFromMinutes(effectiveMinutes: number) {
  const diffH = effectiveMinutes / 60;
  return {
    isOK:       diffH <= SLA_MAX_HOURS,
    text:       `${Math.floor(diffH)}j ${effectiveMinutes % 60}m`,
    percentage: Math.max(0, Math.min(100, ((SLA_MAX_HOURS - diffH) / SLA_MAX_HOURS) * 100)),
  };
}

/**
 * Hitung total menit pause dari array stop_clocks satu tiket.
 * Jika ada stop clock yang belum di-end (ended_at null), dihitung sampai endedAt (waktu solved).
 */
function calcTotalPausedMinutes(ticketStopClocks: any[], endedAt?: Date): number {
  const endMs = (endedAt ?? new Date()).getTime();
  return ticketStopClocks.reduce((acc, c) => {
    const s = new Date(c.started_at).getTime();
    const e = c.ended_at ? new Date(c.ended_at).getTime() : endMs;
    return acc + Math.max(0, Math.floor((e - s) / 60_000));
  }, 0);
}

function isActive(group: any[]) {
  return group.some(r => {
    const s = normalizeStatus(r["Status Case"]);
    return s !== "SOLVED" && s !== "CANCEL";
  });
}

function getTicketStatus(group: any[]): string {
  if (group.every((r: any) => normalizeStatus(r["Status Case"]) === "SOLVED")) return "SOLVED";
  if (group.every((r: any) => normalizeStatus(r["Status Case"]) === "CANCEL")) return "CANCEL";
  const active = group.find((r: any) => {
    const s = normalizeStatus(r["Status Case"]);
    return s !== "SOLVED" && s !== "CANCEL";
  });
  return active ? normalizeStatus(active["Status Case"]) : "OPEN";
}

// ─────────────────────────────────────────────────────────────
// INPUT STYLE
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// MICRO COMPONENTS
// ─────────────────────────────────────────────────────────────
function SectionLabel({ num, text }: { num: string; text: string }) {
  const C = useTheme();
  return (
    <p className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest"
       style={{ color: C.accent }}>
      <span className="w-5 h-5 rounded flex items-center justify-center text-[9px]"
            style={{ background: C.accentBg, color: C.accent }}>{num}</span>
      {text}
    </p>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  const C = useTheme();
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase mb-1.5" style={{ color: C.textMuted }}>{label}</label>
      {children}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  const C = useTheme();
  return (
    <div className="rounded-xl p-4 space-y-3"
         style={{ background: C.base, border: `1px solid ${C.border}` }}>
      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.accent }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono, color, children }: { label: string; value: string; mono?: boolean; color?: string; children?: React.ReactNode }) {
  const C = useTheme();
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: C.textSec }}>{label}</span>
      {children
        ? <span>{children}</span>
        : <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`} style={{ color: color ?? C.text }}>{value}</span>
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SEARCHABLE COMBOBOX
// ─────────────────────────────────────────────────────────────
function SearchableCombobox({
  value, onChange, options, placeholder, accentColor,
}: {
  value:       string;
  onChange:    (val: string) => void;
  options:     { value: string; label: string; sub?: string }[];
  placeholder?: string;
  accentColor?: string;
}) {
  const C = useTheme();
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => {
    const q = query.toLowerCase();
    return o.value.toLowerCase().includes(q) || (o.sub || "").toLowerCase().includes(q);
  });

  const displayLabel = options.find(o => o.value === value)?.label || value;
  const ac = accentColor || C.accent;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {/* Trigger input */}
      <div
        onClick={() => { setOpen(p => !p); setQuery(""); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.base, border: `1px solid ${open ? ac : C.borderMid}`,
          borderRadius: 8, padding: "7px 10px", cursor: "pointer",
          color: value ? ac : C.textMuted, fontSize: 12, fontFamily: "var(--font-sans)",
          transition: "border-color 0.15s",
        }}>
        <span className="truncate" style={{ flex: 1, minWidth: 0 }}>
          {value ? displayLabel : placeholder || "— Pilih —"}
        </span>
        <span style={{ color: C.textMuted, fontSize: 10, flexShrink: 0, marginLeft: 6 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: C.elevated, border: `1px solid ${C.borderMid}`,
          borderRadius: 10, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}>
          {/* Search input */}
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ketik untuk cari..."
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", background: C.base, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "5px 8px", color: C.text,
                fontSize: 11, outline: "none", fontFamily: "var(--font-sans)",
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textAlign: "center" }}>
                Tidak ditemukan
              </div>
            )}
            {filtered.map(opt => {
              const isSelected = opt.value === value;
              return (
                <div key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
                  style={{
                    padding: "8px 12px", cursor: "pointer",
                    background: isSelected ? `${ac}15` : "transparent",
                    borderLeft: isSelected ? `3px solid ${ac}` : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `${ac}08`; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? ac : C.text,
                                fontFamily: "var(--font-mono)" }}>
                    {opt.label}
                  </div>
                  {opt.sub && (
                    <div style={{ fontSize: 10, color: C.textSec, marginTop: 1, whiteSpace: "nowrap",
                                  overflow: "hidden", textOverflow: "ellipsis" }}>
                      {opt.sub}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL WRAPPER
// ─────────────────────────────────────────────────────────────
function Modal({ title, sub, onClose, children, wide }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  const C = useTheme();
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[70]"
         style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
           style={{ maxWidth: wide ? 1000 : 720, maxHeight: "95vh", background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between items-start px-6 py-5 shrink-0"
             style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="text-base font-black" style={{ color: C.text }}>{title}</h2>
            {sub && <p className="text-xs mt-0.5 italic" style={{ color: C.textSec }}>{sub}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl leading-none"
            style={{ color: C.textSec }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>×</button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  return (
    <div className="flex justify-between items-center px-6 py-4 shrink-0"
         style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DEVICE POWER PARSER
// Deteksi otomatis tipe perangkat dari raw CLI paste, ekstrak
// hostname + port + Rx/Input power + threshold High/Low
//
// Output: "> HOSTNAME P.PORT : Actual VALUE [dBm] | High H | Low L"
//   Alcatel : > ABADI-JAYA-PE-X24 P.1/28 : Actual 0.382 | High 4.500 | Low -10.600
//   Extreme : > APJI-MMR-X670-72X.5 P.71 : Actual -4.33 dBm | High 2.50 | Low -14.40
//   Nexus   : > NX-Babelan P.48 : Actual -13.76 dBm | High -5.00 | Low -25.22
//   Huawei  : > NE-HOST P.0/2/0 : Actual -6.695 dBm | High 0.499 | Low -14.400
// ─────────────────────────────────────────────────────────────
/** Hitung jumlah port yang diharapkan dari kapasitas backbone */
function calcPortCount(capacity: string): number {
  const m = (capacity || "").match(/(\d+(?:\.\d+)?)\s*G/i);
  if (!m) return 1;
  const g = parseFloat(m[1]);
  if (g >= 100 && g % 100 === 0) return Math.round(g / 100); // 200G→2, 400G→4
  if (g >= 10  && g % 10  === 0) return Math.round(g / 10);  // 20G→2, 40G→4
  return 1;
}

function parseDevicePower(raw: string): string {
  const s      = raw.trim();
  if (!s) return "";
  const lines   = s.split(/\r?\n/);
  const firstLn = lines[0]?.trim() ?? "";

  // ── Alcatel ──────────────────────────────────────────────────
  // Prompt:    "ABADI-JAYA-PE-X24-> sh int 1/1/28 dd"
  // Port line: " 1/1/28A   Actual  40.0  3.249  42.156  2.554  0.382"
  //            Cols: Chas/Slot/Port | Actual | Temp | Volt | TxBias | Output | Input
  //            Last value = Input (dBm)
  // Port fmt:  Slot/Port (drop chassis, drop A/B suffix) → "1/28"
  {
    const alcHost = firstLn.match(/^([A-Za-z0-9._-]+)->/)?.[1] ?? "";
    let portFull = "", actualInput = "", wHigh = "", wLow = "";
    for (const ln of lines) {
      const t = ln.trim();
      if (/^\d+\/\d+\/\d+[AB]?\s+Actual/.test(t)) {
        const parts = t.split(/\s+/);
        const raw0  = parts[0].replace(/[AB]$/, "");        // "1/1/28"
        const segs  = raw0.split("/");
        portFull    = segs.length >= 2 ? segs.slice(-2).join("/") : segs[segs.length - 1]; // "1/28"
        actualInput = parts[parts.length - 1];
      }
      if (/^\bW-High\b/.test(t)) { const p = t.split(/\s+/); wHigh = p[p.length - 1]; }
      if (/^\bW-Low\b/.test(t))  { const p = t.split(/\s+/); wLow  = p[p.length - 1]; }
    }
    if (actualInput) {
      const host = alcHost ? `${alcHost} ` : "";
      const port = portFull ? `P.${portFull} ` : "";
      return `> ${host}${port}: Actual ${actualInput} | High ${wHigh || "?"} | Low ${wLow || "?"}`;
    }
  }

  // ── Nexus ────────────────────────────────────────────────────
  // Prompt:    "NX-Babelan# sh int eth 1/48 transceiver details"
  // Interface: "Ethernet1/48"
  // Data row:  "  Rx Power  -13.76 dBm  -5.00 dBm  -25.22 dBm  ..."
  //            Cols: Current | AlarmHigh | AlarmLow | WarnHigh | WarnLow
  {
    const nexusHost = firstLn.match(/^([A-Za-z0-9._-]+)#/)?.[1] ?? "";
    const nexusRx   = s.match(/Rx Power\s+([-\d.]+)\s+dBm\s+([-\d.]+)\s+dBm\s+([-\d.]+)\s+dBm/i);
    if (nexusRx) {
      let nexusPort = "";
      for (const ln of lines) {
        const em = ln.trim().match(/^Ethernet\d+\/(\d+)/i);
        if (em) { nexusPort = em[1]; break; }
      }
      if (!nexusPort) nexusPort = firstLn.match(/eth\s+\d+\/(\d+)/i)?.[1] ?? "";
      const host = nexusHost ? `${nexusHost} ` : "";
      const port = nexusPort ? `P.${nexusPort} ` : "";
      return `> ${host}${port}: Actual ${nexusRx[1]} dBm | High ${nexusRx[2]} | Low ${nexusRx[3]}`;
    }
  }

  // ── Extreme ───────────────────────────────────────────────────
  // Prompt:    "APJI-MMR-X670-72X.5 # sh port 71 transceiver inf d"
  // Port line: "Port :  71"
  // Data:      "    Rx Power (dBm)  : -4.33  Status : Normal"
  //            next lines: "Low Warn Threshold : -14.40  High Warn Threshold : 2.50"
  // Fix: scan only lines AFTER "Rx Power (dBm)" to avoid Temp's High/Low Warn
  {
    const exHost  = firstLn.match(/^([A-Za-z0-9._-]+)\s+#/)?.[1] ?? "";
    const exRxIdx = lines.findIndex(ln => /Rx Power\s*\(dBm\)\s*:/i.test(ln));
    if (exRxIdx >= 0) {
      const exRxVal = lines[exRxIdx].match(/:\s*([-\d.]+)/)?.[1] ?? "?";
      const after   = lines.slice(exRxIdx + 1, exRxIdx + 5);
      let exHigh = "?", exLow = "?";
      for (const ln of after) {
        const hm = ln.match(/High Warn Threshold\s*:\s*([-\d.]+)/i);
        const lm = ln.match(/Low Warn Threshold\s*:\s*([-\d.]+)/i);
        if (hm) exHigh = hm[1];
        if (lm) exLow  = lm[1];
      }
      let exPort = "";
      for (const ln of lines) {
        const pm = ln.trim().match(/^Port\s*:\s*(\d+)/i);
        if (pm) { exPort = pm[1]; break; }
      }
      if (!exPort) exPort = firstLn.match(/sh\s+port\s+(\d+)/i)?.[1] ?? "";
      const host = exHost ? `${exHost} ` : "";
      const port = exPort ? `P.${exPort} ` : "";
      return `> ${host}${port}: Actual ${exRxVal} dBm | High ${exHigh} | Low ${exLow}`;
    }
  }

  // ── Huawei NE ─────────────────────────────────────────────────
  // Prompt: "[~NE-HOSTNAME]display optical-module ... interface GigabitEthernet 0/2/0"
  // Data:   "Rx Power(avg dBm)  -6.695  2.500  0.499  -14.400  -16.401  Normal"
  //         Cols: actual | HighAlarm | HighWarn | LowWarn | LowAlarm | Status
  {
    const hwHost  = (firstLn.match(/\[~?([A-Za-z0-9._-]+)\]/) ?? firstLn.match(/^<([A-Za-z0-9._-]+)>/))?.[1] ?? "";
    const hwPort  = (firstLn.match(/GigabitEthernet\s+([\d/]+)/i)
                 ?? s.match(/GigabitEthernet\s+([\d/]+)/i))?.[1] ?? "";
    const hwMatch = s.match(/Rx Power\(avg dBm\)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
    if (hwMatch) {
      const host = hwHost ? `${hwHost} ` : "";
      const port = hwPort ? `P.${hwPort} ` : "";
      return `> ${host}${port}: Actual ${hwMatch[1]} dBm | High ${hwMatch[3]} | Low ${hwMatch[4]}`;
    }
  }

  // Unknown — return raw trimmed
  return s;
}
// ─────────────────────────────────────────────────────────────
// SOLVED SUMMARY BUILDER
// Generate teks summary untuk WA Report + Odoo log note
// ─────────────────────────────────────────────────────────────
function buildSolvedSummary(
  group:    any[],
  solve:    Record<string, any>,
  nearFar:  Record<number, { nearEnd: string; farEnd: string }>
): string {
  const f        = group[0];
  const today    = formatHariTanggal(new Date());
  const priority = f["Priority"] ? ` ${f["Priority"]}` : "";
  const subject  = (f["Subject Ticket / Email"] || "").toUpperCase();
  const ticketNo = f["NOMOR TICKET"] || "—";
  const tglRep   = (f["Hari dan Tanggal Report"] || "").toUpperCase();

  // Impact: Nama Link jika ada, fallback ke Kode Backbone; sertakan kapasitas jika ada
  const links = [...new Set(
    group.map((r: any) => {
      const label = (r["Nama Link"] || r["Kode Backbone"] || "").trim();
      const cap   = (r["Kapasitas"] || "").trim();
      return cap ? `${label} (${cap})` : label;
    }).filter(Boolean)
  )] as string[];

  let txt = `*SUMMARY REPORT BACKBONE PROBLEM | ${today}*\n`;
  txt += `======================================================\n\n`;
  txt += `Tiket\t: ${ticketNo}${priority} | BACKBONE | ${subject}`;
  if (tglRep) txt += ` [${tglRep}]`;
  txt += `\nImpact\t:\n`;
  links.forEach(l => { txt += `- ${l}\n`; });
  txt += `Status\t: Solved\n`;

  if (solve["Problem & Action"]) {
    txt += `\nProblem analysis & Action :\n${solve["Problem & Action"].trim()}\n`;
  }

  if (solve["Titik Kordinat Cut / Bending"]) {
    txt += `\nData Tagging\n\n${solve["Titik Kordinat Cut / Bending"].trim()}\n`;
  }

  // Power records per backbone link
  const powerRows = group.filter((r: any) => nearFar[r.id]?.nearEnd || nearFar[r.id]?.farEnd);
  if (powerRows.length > 0) {
    txt += `\nRecord Power After Maintenance :\n`;
    powerRows.forEach((r: any) => {
      const ne       = (nearFar[r.id]?.nearEnd || "").trim();
      const fe       = (nearFar[r.id]?.farEnd  || "").trim();
      const linkName = r["Nama Link"] || r["Kode Backbone"] || "—";

      // Ekstrak label sisi dari nama link: "DCI <> DHI V XMALANG" → NE="SISI DCI", FE="SISI DHI"
      // Pola: "A <> B ..." → ambil A untuk NE, B untuk FE
      const chevronMatch = linkName.match(/^(.+?)\s*<>\s*(.+?)(?:\s+[A-Z].*)?$/);
      // Strip kode numerik "00182/" dari awal nama sisi agar label lebih bersih
      const stripCode = (s: string) => s.replace(/^\d+\//, "").trim().toUpperCase();
      const neLabel = chevronMatch ? `SISI ${stripCode(chevronMatch[1])}` : "SISI NEAR END";
      const feLabel = chevronMatch ? `SISI ${stripCode(chevronMatch[2].split(/\s+/)[0])}` : "SISI FAR END";

      txt += `\n- ${linkName}\n`;
      if (ne) { txt += `\n${neLabel}\n${parseMultiPortPower(ne)}\n`; }
      if (fe) { txt += `\n${feLabel}\n${parseMultiPortPower(fe)}\n`; }
    });
  }

  return txt.trim();
}

/**
 * parseMultiPortPower — ekstrak power readings dari SATU atau LEBIH port dalam satu paste.
 * Mendukung multi-port Nexus, Alcatel, Extreme, Huawei.
 * Jika hanya 1 port, fallback ke parseDevicePower.
 * Output: multi-line string, satu baris per port.
 */
function parseMultiPortPower(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  const lines   = s.split(/\r?\n/);
  const firstLn = lines[0]?.trim() ?? "";

  // Host dari prompt baris pertama (Nexus: "HOSTNAME#" atau "HOSTNAME(config)#")
  const hostNexus = firstLn.match(/^([A-Za-z0-9._-]+)(?:\([^)]*\))?[#>]/)?.[1] ?? "";

  // ── Nexus multi-port: beberapa "EthernetX/Y" section dengan Rx Power masing-masing ──
  const ethIdxs = lines
    .map((l, i) => ({ i, m: l.trim().match(/^Ethernet(\d+\/\d+)/i) }))
    .filter(x => x.m);

  if (ethIdxs.length >= 2) {
    const results: string[] = [];
    for (let k = 0; k < ethIdxs.length; k++) {
      const start   = ethIdxs[k].i;
      const end     = k + 1 < ethIdxs.length ? ethIdxs[k + 1].i : lines.length;
      const secText = lines.slice(start, end).join("\n");
      const portNum = ethIdxs[k].m![1].split("/").pop();
      const rxM     = secText.match(/Rx Power\s+([-\d.]+)\s+dBm\s+([-\d.]+)\s+dBm\s+([-\d.]+)\s+dBm/i);
      if (rxM) {
        const host = hostNexus ? `${hostNexus} ` : "";
        results.push(`> ${host}P.${portNum} : Actual ${rxM[1]} dBm | High ${rxM[2]} | Low ${rxM[3]}`);
      }
    }
    if (results.length) return results.join("\n");
  }

  // ── Alcatel multi-port: beberapa "HOSTNAME->" prompt ──
  const alcIdxs = lines
    .map((l, i) => ({ i, isPrompt: /^[A-Za-z0-9._-]+->/.test(l.trim()) }))
    .filter(x => x.isPrompt);

  if (alcIdxs.length >= 2) {
    const results: string[] = [];
    for (let k = 0; k < alcIdxs.length; k++) {
      const start = alcIdxs[k].i;
      const end   = k + 1 < alcIdxs.length ? alcIdxs[k + 1].i : lines.length;
      const r     = parseDevicePower(lines.slice(start, end).join("\n"));
      if (r) results.push(r);
    }
    if (results.length >= 2) return results.join("\n");
  }

  // ── Extreme multi-port: beberapa "Port : X" section ──
  const exIdxs = lines
    .map((l, i) => ({ i, isPort: /^Port\s*:\s*\d+/i.test(l.trim()) }))
    .filter(x => x.isPort);

  if (exIdxs.length >= 2) {
    const results: string[] = [];
    for (let k = 0; k < exIdxs.length; k++) {
      const start = exIdxs[k].i;
      const end   = k + 1 < exIdxs.length ? exIdxs[k + 1].i : lines.length;
      const r     = parseDevicePower(lines.slice(start, end).join("\n"));
      if (r) results.push(r);
    }
    if (results.length >= 2) return results.join("\n");
  }

  // ── Huawei multi-port: beberapa "[~HOSTNAME]" prompt ──
  const hwIdxs = lines
    .map((l, i) => ({ i, isPrompt: /^\[~?[A-Za-z0-9._-]+\]/.test(l.trim()) || /^<[A-Za-z0-9._-]+>/.test(l.trim()) }))
    .filter(x => x.isPrompt);

  if (hwIdxs.length >= 2) {
    const results: string[] = [];
    for (let k = 0; k < hwIdxs.length; k++) {
      const start = hwIdxs[k].i;
      const end   = k + 1 < hwIdxs.length ? hwIdxs[k + 1].i : lines.length;
      const r     = parseDevicePower(lines.slice(start, end).join("\n"));
      if (r) results.push(r);
    }
    if (results.length >= 2) return results.join("\n");
  }

  // ── Single port / format manual → fallback ke parseDevicePower ──
  return parseDevicePower(s);
}

// ─────────────────────────────────────────────────────────────
// INTERACTIVE SUMMARY HTML BUILDER  (rewritten — reliable approach)
// • All ticket HTML generated in TypeScript (no nested template literals in JS)
// • Browser JS only handles show/hide filtering + Leaflet map
// • Uses blob URL (not document.write) for reliable CDN loading
// ─────────────────────────────────────────────────────────────
/**
 * Cek apakah lat/lng valid untuk bounding box Indonesia + Singapore
 * Lat: -11 s/d 7 | Lng: 95 s/d 142
 */
function isValidIndo(lat: number, lng: number): boolean {
  return lat >= -11 && lat <= 7 && lng >= 95 && lng <= 142;
}

/**
 * parseCoords — ekstrak koordinat pertama yang valid dari string apapun.
 * Mendukung:
 *   • Satu atau lebih Google Maps URL dalam satu string (dipisah newline/spasi)
 *   • Format ?q=lat,lng | @lat,lng | /place/@lat,lng
 *   • Raw "lat, lng" tanpa URL
 */
function parseCoords(raw: string): [number, number] | null {
  if (!raw) return null;

  // ── Pass 1: cari semua Google Maps URL patterns ──────────────
  // Pola yang bisa muncul di "Titik Kordinat Cut / Bending":
  //   https://maps.google.com/?q=-6.285,106.879
  //   https://www.google.com/maps/@-6.285,106.879,15z
  //   https://maps.app.goo.gl/... (shortened — tidak bisa tanpa fetch)
  const URL_PATTERNS = [
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/g,           // ?q=lat,lng
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/g,                 // @lat,lng
    /\/place\/[^/@]*@(-?\d+\.\d+),\s*(-?\d+\.\d+)/g, // /place/@lat,lng
    /maps\.google\.[^"'\s]*?(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/g,
  ];
  for (const pat of URL_PATTERNS) {
    const matches = [...raw.matchAll(pat)];
    for (const m of matches) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (isValidIndo(lat, lng)) return [lat, lng];
    }
  }

  // ── Pass 2: raw decimal pair per baris (lat, lng atau lat lng) ─
  const lines = raw.split(/[\n\r;|]+/);
  for (const line of lines) {
    const m = line.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (isValidIndo(lat, lng)) return [lat, lng];
    }
  }

  // ── Pass 3: fallback — decimal pair di mana saja dalam string ─
  const fallback = [...raw.matchAll(/(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{2,3}\.\d{4,})/g)];
  for (const m of fallback) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (isValidIndo(lat, lng)) return [lat, lng];
  }

  return null;
}

/**
 * parseAllCoords — ekstrak SEMUA koordinat unik dari string (untuk multi-link).
 * Berguna jika satu tiket punya beberapa titik koordinat (mis. cut di 2 lokasi).
 */
function parseAllCoords(raw: string): [number, number][] {
  if (!raw) return [];
  const results: [number, number][] = [];
  const seen = new Set<string>();

  const URL_PATTERNS = [
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/g,
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/g,
    /\/place\/[^/@]*@(-?\d+\.\d+),\s*(-?\d+\.\d+)/g,
  ];
  for (const pat of URL_PATTERNS) {
    for (const m of raw.matchAll(pat)) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (isValidIndo(lat, lng) && !seen.has(key)) {
        seen.add(key);
        results.push([lat, lng]);
      }
    }
  }
  // Fallback raw pairs jika tidak ada URL
  if (!results.length) {
    const c = parseCoords(raw);
    if (c) results.push(c);
  }
  return results;
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildInteractiveSummaryHTML(opts: {
  periodLabel: string;
  pdfType: "monthly" | "quarterly" | "yearly";
  total: number; solved: number; slaOK: number; slaNOK: number;
  slaRate: number | null; avgMTTR: number | null; totalOverSLA: number | null; avgOverSLA: number | null;
  byStatus: Record<string, number>;
  byRegional: Record<string, number>;
  byKode: Record<string, number>;
  byProblem: Record<string, number>;
  byJenis: Record<string, number>;
  byPriority: Record<string, number>;
  monthlyData: { month: string; count: number; solved: number }[];
  tickets: any[][];
  generatedAt: string;
  geocodeCache: Record<string, [number, number]>; // dari localStorage BackboneHeatmap
}): string {
  const { periodLabel, pdfType, total, solved, slaOK, slaNOK, slaRate, avgMTTR, totalOverSLA, avgOverSLA,
          byStatus, byRegional, byKode, byProblem, byJenis, byPriority,
          monthlyData, tickets, generatedAt, geocodeCache } = opts;

  // Helper: bersihkan Plus Code prefix (sama persis dengan BackboneHeatmap stripPlusCode)
  const stripPC = (s: string) =>
    s.replace(/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}\s*/i, "")
     .replace(/\s{2,}/g, " ").trim();
  const solveRate = total > 0 ? Math.round((solved / total) * 100) : 0;
  const SC: Record<string, string> = {
    "SOLVED":"#10b981","CANCEL":"#6b7280","UNSOLVED":"#ef4444",
    "PENDING":"#f59e0b","ON PROGRESS":"#3b82f6","OPEN":"#f5c842",
  };

  const totalOverSLADisplay = totalOverSLA != null ? `${Math.floor(totalOverSLA / 60)}j ${totalOverSLA % 60}m` : "—";
  const avgOverSLADisplay   = avgOverSLA   != null ? `${Math.floor(avgOverSLA   / 60)}j ${avgOverSLA   % 60}m` : "—";
  const slaColor    = (slaRate ?? 0) >= 70 ? "#10b981" : "#f43f5e";

  // ── Predefined master lists (sama seperti PDF) ──
  const JENIS_ORDER    = ["CRC","DOWN","UNMONITOR","HIGH POWER","LOW POWER","OVERHEAT"];
  const PRIORITY_ORDER = ["CRITICAL","MAJOR","MINOR"];
  const PROBLEM_ORDER  = ["FO CUT","BENDING","ELECTRICAL","DEVICE","PATCHCORE","SFP","TEMPERATURE","ATTENUATOR","BARELL OTB","SIGNAL DROP"];
  const REGIONAL_ORDER = ["Bogor","Depok","Kab Bekasi","Kota Bekasi","Karawang","Jakarta Selatan","Jakarta Utara","Jakarta Barat","Jakarta Timur","Purwakarta","Tangerang","Cirebon"];

  // ── Helpers (same as buildPDFHTML) ──
  const mergeWithPredefined = (predefined: string[], actual: Record<string,number>): [string,number][] => {
    const findActual = (key: string): number => {
      const upper = key.toUpperCase();
      for (const [k,v] of Object.entries(actual)) if (k.toUpperCase() === upper) return v;
      return 0;
    };
    const result: [string,number][] = predefined.map(k => [k, findActual(k)]);
    const predUpper = predefined.map(p => p.toUpperCase());
    for (const [k,v] of Object.entries(actual)) if (!predUpper.includes(k.toUpperCase())) result.push([k,v]);
    return result;
  };

  const compactListDark = (entries: [string,number][], colorFn: (i:number,key:string)=>string): string => {
    const nonZero = entries.filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
    const zeros   = entries.filter(([,v])=>v===0);
    const sorted  = [...nonZero,...zeros];
    const listTotal = nonZero.reduce((s,[,v])=>s+v,0);
    return sorted.map(([label,cnt],i) => {
      const isZero = cnt === 0;
      const rank   = !isZero ? (["🥇","🥈","🥉"][i] ?? `${i+1}.`) : "—";
      const pct    = listTotal > 0 && cnt > 0 ? ((cnt/listTotal)*100).toFixed(1) : "0.0";
      const col    = colorFn(i, label);
      return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);opacity:${isZero?"0.35":"1"}">
        <span style="font-size:10px;width:20px;text-align:center;flex-shrink:0">${rank}</span>
        <span style="flex:1;font-size:10px;color:#cbd5e1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(label)}">${esc(label)}</span>
        <span style="font-size:9px;color:#64748b;flex-shrink:0">${pct}%</span>
        <span style="font-size:10px;font-weight:900;color:#fff;background:${col};border-radius:5px;padding:1px 7px;flex-shrink:0;min-width:24px;text-align:center">${cnt}</span>
      </div>`;
    }).join("");
  };

  const jenisColor    = (_i:number,key:string):string => {
    const k=key.toUpperCase();
    if(k==="DOWN")       return "#f43f5e";
    if(k==="CRC")        return "#f59e0b";
    if(k==="UNMONITOR")  return "#64748b";
    if(k==="LOW POWER")  return "#3b82f6";
    if(k==="HIGH POWER") return "#f97316";
    if(k==="OVERHEAT")   return "#ec4899";
    return "#34d399";
  };
  const priorityColor = (_i:number,key:string):string => {
    const k=key.toUpperCase();
    if(k==="CRITICAL") return "#f43f5e";
    if(k==="MAJOR")    return "#f97316";
    return "#10b981";
  };
  const problemColor  = (_i:number,key:string):string => {
    const idx=PROBLEM_ORDER.map(p=>p.toUpperCase()).indexOf(key.toUpperCase());
    if(idx<0) return "#94a3b8";
    return idx<3?"#f43f5e":idx<6?"#f59e0b":"#34d399";
  };

  const jenisEntries    = mergeWithPredefined(JENIS_ORDER,    byJenis);
  const priorityEntries = mergeWithPredefined(PRIORITY_ORDER, byPriority);
  const problemEntries  = mergeWithPredefined(PROBLEM_ORDER,  byProblem);
  const regionalEntries = mergeWithPredefined(REGIONAL_ORDER, byRegional);
  const problemWithData = problemEntries.filter(([,v])=>v>0).length;

  const jenisRows    = compactListDark(jenisEntries,    jenisColor);
  const priorityRows = compactListDark(priorityEntries, priorityColor);
  const problemRows  = compactListDark(problemEntries,  problemColor);

  // ── By Status ranked list ──
  const STATUS_ORDER = ["SOLVED","ON PROGRESS","PENDING","UNSOLVED","CANCEL","OPEN"];
  const statusTotal  = STATUS_ORDER.reduce((s,k)=>s+(byStatus[k]||0),0);
  const statusRows   = STATUS_ORDER.map((label,i) => {
    const cnt = byStatus[label]||0;
    const pct = statusTotal>0 ? ((cnt/statusTotal)*100).toFixed(1) : "0.0";
    const rank= ["🥇","🥈","🥉"][i] ?? `${i+1}.`;
    const col = SC[label]||"#94a3b8";
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);opacity:${cnt===0?"0.35":"1"}">
      <span style="font-size:10px;width:20px;text-align:center;flex-shrink:0">${rank}</span>
      <span style="flex:1;font-size:10px;color:#cbd5e1;font-weight:600">${label}</span>
      <span style="font-size:9px;color:#64748b;flex-shrink:0">${pct}%</span>
      <span style="font-size:10px;font-weight:900;color:#fff;background:${col};border-radius:5px;padding:1px 7px;flex-shrink:0;min-width:24px;text-align:center">${cnt}</span>
    </div>`;
  }).join("");

  // ── Regional bar chart (dark) ──
  const nonZeroReg = regionalEntries.filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
  const zeroReg    = regionalEntries.filter(([,v])=>v===0);
  const sortedReg  = [...nonZeroReg,...zeroReg];
  const regMax     = Math.max(...sortedReg.map(([,v])=>v),1);
  const regionalRows = sortedReg.map(([k,v]) => {
    const pct  = v>0 ? Math.round((v/regMax)*100) : 0;
    const rPct = total>0&&v>0 ? ((v/total)*100).toFixed(1) : "0.0";
    return `<div data-reg-row="${esc(k)}" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;opacity:${v===0?"0.35":"1"}">
      <div style="width:110px;font-size:10px;color:#94a3b8;font-weight:600;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k)}</div>
      <div style="flex:1;background:#0f172a;border-radius:4px;height:16px;overflow:hidden">
        <div data-reg-fill style="width:${pct>0?pct:2}%;background:${v>0?"#10b981":"#334155"};height:100%;border-radius:4px;display:flex;align-items:center;padding-left:${v>0?"6px":"0"}">
          <span data-reg-count style="font-size:9px;color:white;font-weight:700">${v>0?v:""}</span>
        </div>
      </div>
      <div data-reg-pct style="font-size:9px;color:#64748b;width:38px;flex-shrink:0;text-align:right">${v>0?rPct+"%":"0"}</div>
    </div>`;
  }).join("");

  // ── Monthly grid (yearly) ──
  const monthSection = pdfType==="yearly" && monthlyData.length>0
    ? `<div class="sec">
        <div class="sec-title">Breakdown Bulanan</div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px">
          ${monthlyData.map(m=>`
            <div style="text-align:center;background:#1e293b;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px 4px">
              <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase">${m.month}</div>
              <div style="font-size:18px;font-weight:900;color:${m.count===0?"#334155":"#f0efe8"};line-height:1.3">${m.count}</div>
              <div style="font-size:9px;color:#10b981;font-weight:700">${m.count>0?`✓${m.solved}`:"—"}</div>
            </div>`).join("")}
        </div>
      </div>`
    : "";

  // ── Top Backbone with detail tables ──
  const liveSLA  = (g:any[]) => { const f=g[0]; if(f["Start Time"]&&f["End Time"]) return calcSLA(f["Start Time"],f["End Time"]); return null; };
  const liveMTTR = (g:any[]) => { const f=g[0]; if(f["Start Time"]&&f["End Time"]) return calcMTTRMinutes(f["Start Time"],f["End Time"]); return f["MTTR"]!=null?Number(f["MTTR"]):null; };
  const fmtM     = (m:number|null) => m!=null?`${Math.floor(m/60)}j${m%60}m`:"—";

  const topBackboneSection = (() => {
    const limit   = pdfType==="monthly"?10:15;
    const topKode = Object.entries(byKode).sort(([,a],[,b])=>b-a).slice(0,limit);
    if(topKode.length===0) return "";
    const rows = topKode.map(([kode,count],ki) => {
      const related  = tickets.filter(g=>g.some((r:any)=>r["Kode Backbone"]===kode));
      const namaLink = related[0]?.find((r:any)=>r["Kode Backbone"]===kode)?.["Nama Link"]||"";
      const rowsSt   = getTicketStatus;
      const ticketRows = related.map((g:any[]) => {
        const f   = g[0];
        const st  = rowsSt(g);
        const sla = liveSLA(g);
        const mtr = liveMTTR(g);
        const stC  = SC[st]||"#94a3b8";
        const slaC = sla?(sla.isOK?"#10b981":"#f43f5e"):"#64748b";
        const slaT = sla?(sla.isOK?"OK":"NOK"):(f["SLA"]||"—");
        return `<tr>
          <td style="font-family:monospace;font-weight:700;font-size:9px;color:#e2e8f0">${esc(f["NOMOR TICKET"]||"—")}</td>
          <td style="color:#94a3b8;font-size:9px">${esc(f["Hari dan Tanggal Report"]||"—")}</td>
          <td style="color:#94a3b8;font-size:9px">${esc(f["Jenis Problem"]||"—")}</td>
          <td style="color:#cbd5e1;font-size:8.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f["Problem"]||"")}">${esc(f["Problem"]||"—")}</td>
          <td style="color:${f["Priority"]==="CRITICAL"?"#ef4444":f["Priority"]?"#f59e0b":"#64748b"};font-weight:700;font-size:9px">${esc(f["Priority"]||"—")}</td>
          <td><span style="background:${stC}22;color:${stC};border:1px solid ${stC}44;display:inline-block;padding:2px 6px;border-radius:5px;font-size:8px;font-weight:700">${st}</span></td>
          <td><span style="background:${slaC}22;color:${slaC};border:1px solid ${slaC}44;display:inline-block;padding:2px 6px;border-radius:5px;font-size:8px;font-weight:700">${slaT}</span></td>
          <td style="font-family:monospace;font-size:9px;color:#94a3b8">${fmtM(mtr)}</td>
        </tr>`;
      }).join("");
      return `<div style="margin-bottom:16px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;background:#1e293b;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.07)">
          <span style="font-size:9px;color:#64748b;font-weight:700;width:18px;flex-shrink:0">${ki+1}</span>
          <span style="font-family:monospace;font-size:11px;font-weight:900;color:#f0efe8;background:#334155;padding:2px 8px;border-radius:4px;flex-shrink:0">${esc(kode)}</span>
          ${namaLink?`<span style="font-size:10px;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(namaLink)}</span>`:""}
          <span style="font-size:9px;font-weight:800;color:#10b981;flex-shrink:0;margin-left:auto">${count} insiden</span>
        </div>
        ${related.length>0?`
        <div style="overflow-x:auto;padding:8px">
          <table style="width:100%;border-collapse:collapse;font-size:9px;min-width:600px">
            <thead><tr style="background:#242422">
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Nomor Tiket</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Tanggal</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Jenis</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Problem</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Priority</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">Status</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">SLA</th>
              <th style="padding:5px 8px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.08)">MTTR</th>
            </tr></thead>
            <tbody>${ticketRows}</tbody>
          </table>
        </div>`:""}
      </div>`;
    }).join("");
    return `<div class="sec">
      <div class="sec-title">Top ${limit} Kode Backbone — Detail Insiden per Link</div>
      ${rows}
    </div>`;
  })();

  // ── Top Kode ≥3 table ──
  const kodeSection = (() => {
    const filtered = Object.entries(byKode).filter(([,v])=>v>=3).sort(([,a],[,b])=>b-a);
    if(filtered.length===0) return "";
    const kodeToNama: Record<string,string> = {};
    tickets.forEach(g=>g.forEach((r:any)=>{ const kd=r["Kode Backbone"]; if(kd&&!kodeToNama[kd]) kodeToNama[kd]=r["Nama Link"]||""; }));
    const rows = filtered.map(([k,v],i) =>
      `<tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:6px 10px;color:#64748b;text-align:center;font-size:10px">${i+1}</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:700;color:#f0efe8;font-size:10px">${esc(k)}</td>
        <td style="padding:6px 10px;color:#94a3b8;font-size:10px">${esc(kodeToNama[k]||"")}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:900;color:#10b981;font-size:11px">${v}</td>
      </tr>`
    ).join("");
    return `<div class="sec">
      <div class="sec-title">Top Kode Backbone (Frekuensi Insiden ≥ 3)</div>
      <div class="card">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#242422">
            <th style="padding:6px 10px;text-align:center;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;width:36px">#</th>
            <th style="padding:6px 10px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase">Kode</th>
            <th style="padding:6px 10px;text-align:left;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase">Nama Backbone</th>
            <th style="padding:6px 10px;text-align:right;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase">Insiden</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  })();

  // ── All ticket cards (static HTML; data-* attrs enable multi-filter in browser JS) ──
  interface TInfo2 {
    ticketNo:string; subject:string; status:string; regional:string;
    jenis:string; problem:string; priority:string; sla:string;
    mttr:number|null; alamat:string; titikKoordinat:string; timeline:string;
    backbones:string[]; namaLinks:string[]; coords:[number,number]|null;
    tanggal:string;
  }
  const tInfos: TInfo2[] = tickets.map(g => {
    const f  = g[0];
    const st = getTicketStatus(g);
    return {
      ticketNo:  f["NOMOR TICKET"]||"—",
      subject:   f["Subject Ticket / Email"]||"—",
      status:    st,
      regional:  f["Regional"]||"",
      jenis:     f["Jenis Problem"]||"",
      problem:   f["Problem"]||"",
      priority:  f["Priority"]||"",
      sla:       f["SLA"]||"",
      mttr:      f["MTTR"]!=null?Number(f["MTTR"]):null,
      alamat:    f["Alamat Problem"]||"",
      timeline:  (g.find((r:any)=>r["Problem & Action"])?.["Problem & Action"]||""),
      backbones: [...new Set(g.map((r:any)=>r["Kode Backbone"]||"").filter(Boolean))] as string[],
      namaLinks: [...new Set(g.map((r:any)=>r["Nama Link"]||"").filter(Boolean))] as string[],
      // Prioritas: Titik Kordinat (Google Maps URL exact) → Alamat Problem (Plus Code, kurang presisi)
      titikKoordinat: f["Titik Kordinat Cut / Bending"]||"",
      coords: (
        parseCoords(f["Titik Kordinat Cut / Bending"]||"")   // ← exact dari Google Maps URL
        || parseCoords(f["Alamat Problem"]||"")               // ← fallback (jarang berhasil)
      ),
      tanggal:   f["Hari dan Tanggal Report"]||"",
    };
  });

  const ticketCardsHTML = tInfos.map(t => {
    const col    = SC[t.status]||"#94a3b8";
    const bbStr  = t.namaLinks.length?t.namaLinks.join(" · "):t.backbones.length?t.backbones.join(", "):"";
    const mttrStr= t.mttr!=null?`${Math.floor(t.mttr/60)}j${t.mttr%60}m`:"";
    const slaCol = t.sla==="OK"?"#10b981":t.sla==="NOK"?"#f43f5e":"#64748b";
    return `<div class="tc" data-status="${esc(t.status)}" data-jenis="${esc(t.jenis)}" data-problem="${esc(t.problem)}" data-priority="${esc(t.priority)}" data-regional="${esc(t.regional)}">
  <div class="tc-head">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="tc-no" style="color:${col}">${esc(t.ticketNo)}</span>
      ${t.priority?`<span class="pill" style="background:${t.priority==="CRITICAL"?"rgba(248,113,113,0.15)":"rgba(251,146,60,0.12)"};color:${t.priority==="CRITICAL"?"#f87171":"#fb923c"}">${esc(t.priority)}</span>`:""}
      ${t.tanggal?`<span style="font-size:9px;color:#64748b">${esc(t.tanggal)}</span>`:""}
    </div>
    <span class="spill" style="background:${col}22;color:${col};border:1px solid ${col}44">${esc(t.status)}</span>
  </div>
  <div class="tc-subj">${esc(t.subject)}</div>
  <div class="tc-meta">
    ${t.regional?`<span class="pill" style="background:rgba(96,165,250,0.1);color:#60a5fa">📍 ${esc(t.regional)}</span>`:""}
    ${t.jenis?`<span class="pill" style="background:rgba(255,255,255,0.07);color:#94a3b8">${esc(t.jenis)}</span>`:""}
    ${t.sla?`<span class="pill" style="background:${slaCol}18;color:${slaCol}">SLA ${esc(t.sla)}</span>`:""}
    ${mttrStr?`<span class="pill" style="background:rgba(255,255,255,0.07);color:#94a3b8">MTTR ${mttrStr}</span>`:""}
  </div>
  ${bbStr?`<div class="tc-bb">🔗 ${esc(bbStr)}</div>`:""}
  <div class="tc-detail">
    ${t.alamat?`<div><b>Alamat:</b> ${esc(t.alamat)}</div>`:""}
    ${t.problem?`<div><b>Problem:</b> ${esc(t.problem)}</div>`:""}
    ${t.titikKoordinat?`<div style="margin-top:4px"><b>Titik Koordinat:</b> ${
      // Render setiap URL sebagai link yang bisa diklik
      t.titikKoordinat.split(/[\n\r]+/).map(u => u.trim()).filter(Boolean).map(u =>
        u.startsWith("http")
          ? `<a href="${esc(u)}" target="_blank" style="color:#60a5fa;font-size:10px;word-break:break-all">📍 ${esc(u)}</a>`
          : `<span style="color:#94a3b8;font-size:10px">${esc(u)}</span>`
      ).join("<br/>")
    }</div>`:""}
    ${t.timeline?`<div style="margin-top:6px"><b>Timeline:</b><pre style="margin:4px 0 0;white-space:pre-wrap;font-size:10px;color:#94a3b8">${esc(t.timeline)}</pre></div>`:""}
    ${!t.alamat&&!t.problem&&!t.titikKoordinat&&!t.timeline?"<i>Tidak ada detail tambahan.</i>":""}
  </div>
</div>`;
  }).join("\n");

  // ── Group tiket per Alamat Problem + embed koordinat ──────────
  // Sumber koordinat (prioritas):
  //   1. t.coords dari "Titik Kordinat Cut / Bending" (Google Maps URL → exact, instant)
  //   2. geocodeCache dari BackboneHeatmap (window.__nocGeocodeCache / localStorage)
  //   3. null → titik tidak ditampilkan di map
  const locMap: Record<string, {
    alamatRaw: string;
    _lat: number | null; _lng: number | null;
    _source: "titik"|"cache"|"none";  // debug info
    tickets: { ticketNo:string; status:string; jenis:string; problem:string; priority:string; regional:string; subject:string; backbones:string[] }[];
  }> = {};
  tInfos.forEach(t => {
    if (!t.alamat) return;
    if (!locMap[t.alamat]) {
      // 1. Koordinat langsung dari "Titik Kordinat Cut / Bending"
      const directCoords = t.coords;

      // 2. Fallback: geocodeCache dari BackboneHeatmap (via window.__nocGeocodeCache / storage)
      const cacheKey = stripPC(t.alamat).toLowerCase();
      const cached   = geocodeCache[cacheKey];

      const lat = directCoords?.[0] ?? cached?.[0] ?? null;
      const lng = directCoords?.[1] ?? cached?.[1] ?? null;
      const src = directCoords ? "titik" : cached ? "cache" : "none";

      locMap[t.alamat] = {
        alamatRaw: t.alamat,
        _lat: lat,
        _lng: lng,
        _source: src,
        tickets: [],
      };
    }
    locMap[t.alamat].tickets.push({
      ticketNo: t.ticketNo, status: t.status, jenis: t.jenis,
      problem:  t.problem,  priority: t.priority, regional: t.regional,
      subject:  t.subject,  backbones: t.backbones,
    });
  });
  const locGroups   = Object.values(locMap);
  const withCoords  = locGroups.filter(l => l._lat !== null).length;
  const fromTitik   = locGroups.filter(l => l._source === "titik").length;
  const fromCache   = locGroups.filter(l => l._source === "cache").length;
  // Embed summary ke HTML sebagai komentar — berguna saat debugging
  const coordSummary = `titik=${fromTitik} cache=${fromCache} total=${withCoords}/${locGroups.length}`;
  const mapJSON = JSON.stringify(locGroups);
  const scJSON  = JSON.stringify(SC);

  // ── Build filter button rows (TypeScript side, counts pre-computed) ──
  const buildFilterRow = (
    entries: [string,number][],
    colorFn: (k:string)=>string,
    dim: string
  ): string =>
    entries.filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([k,v]) => {
      const col = colorFn(k);
      return `<button class="fbtn" data-dim="${dim}" data-val="${esc(k)}" data-col="${col}" style="color:${col};border-color:${col}55">${esc(k)} <span style="opacity:0.6;font-size:9px">(${v})</span></button>`;
    }).join("");

  const statusBtns   = buildFilterRow(Object.entries(byStatus),   k=>SC[k]||"#94a3b8",    "status");
  const jenisBtns    = buildFilterRow(Object.entries(byJenis).filter(([k])=>k.toUpperCase()!=="UNMONITOR"), k=>jenisColor(0,k), "jenis");
  const problemBtns  = buildFilterRow(Object.entries(byProblem),  k=>problemColor(0,k),    "problem");
  const priorityBtns = buildFilterRow(Object.entries(byPriority), k=>priorityColor(0,k),   "priority");
  const regionalBtns = buildFilterRow(Object.entries(byRegional), ()=>"#60a5fa",           "regional");

  const filterRowHTML = (label:string, btns:string, dim:string) => !btns ? "" :
    `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
      <span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding-top:7px;flex-shrink:0;width:62px">${label}</span>
      <div class="filter-bar" style="flex:1;margin:0">
        <button class="fbtn" data-dim="${dim}" data-val="ALL" data-col="#94a3b8" style="color:#94a3b8;border-color:rgba(148,163,184,0.4)">Semua</button>
        ${btns}
      </div>
    </div>`;

  return `<!DOCTYPE html>
<!-- coord-debug: ${coordSummary} -->
<html lang="id">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Summary Backbone NOC — ${esc(periodLabel)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0}
.page{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
.hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #10b981}
.brand-title{font-size:20px;font-weight:900;color:#f0efe8}
.brand-sub{font-size:11px;color:#64748b;margin-top:2px}
.period-badge{background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);border-radius:10px;padding:8px 16px;text-align:right}
.period-label{font-size:15px;font-weight:800;color:#60a5fa}
.period-gen{font-size:10px;color:#64748b;margin-top:3px}
.badge-noc{background:#0f172a;color:#10b981;border:1px solid #10b981;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:900;letter-spacing:2px;display:inline-block;margin-bottom:5px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
@media(max-width:700px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}
.kpi{background:#1e293b;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px}
.kpi.acc{border-top:3px solid #10b981}
.kpi.dng{border-top:3px solid #f43f5e}
.kpi.inf{border-top:3px solid #3b82f6}
.kpi.wrn{border-top:3px solid #f59e0b}
.kpi .lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:5px}
.kpi .val{font-size:24px;font-weight:900;line-height:1}
.sec{margin-bottom:24px}
.sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;margin-bottom:14px}
.card{background:#1e293b;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px}
.card-title{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:10px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
@media(max-width:800px){.two-col,.three-col{grid-template-columns:1fr}}
.sla-bar{width:100%;background:#0f172a;border-radius:4px;height:8px;overflow:hidden;margin-top:4px}
/* Filter panel */
.filter-panel{background:#1e293b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:14px}
.filter-bar{display:flex;flex-wrap:wrap;gap:6px}
.fbtn{padding:5px 12px;border-radius:7px;border:1px solid;font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;background:transparent;font-family:inherit}
.fbtn.is-active{font-weight:900}
/* ── Critical Leaflet CSS (inlined — tidak bergantung CDN) ─────── */
.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}
.leaflet-container{overflow:hidden;position:relative;outline-offset:1px}
.leaflet-tile-container{pointer-events:none}
.leaflet-pane{z-index:400}.leaflet-tile-pane{z-index:200}.leaflet-overlay-pane{z-index:400}.leaflet-shadow-pane{z-index:500}.leaflet-marker-pane{z-index:600}.leaflet-tooltip-pane{z-index:650}.leaflet-popup-pane{z-index:700}
.leaflet-tile{filter:inherit;visibility:inherit}
.leaflet-zoom-animated{transform-origin:0 0}
.leaflet-container img.leaflet-tile{padding:0;max-width:none!important;max-height:none!important}
.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}
.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}
.leaflet-control{float:left;clear:both;position:relative;z-index:800;pointer-events:auto}
.leaflet-right .leaflet-control{float:right}
.leaflet-top .leaflet-control{margin-top:10px}.leaflet-bottom .leaflet-control{margin-bottom:10px}
.leaflet-left .leaflet-control{margin-left:10px}.leaflet-right .leaflet-control{margin-right:10px}
.leaflet-bar a{background:#fff;border-bottom:1px solid #ccc;width:26px;height:26px;line-height:26px;display:block;text-align:center;text-decoration:none;color:#000;font-size:18px}
.leaflet-bar a:first-child{border-top-left-radius:4px;border-top-right-radius:4px}
.leaflet-bar a:last-child{border-bottom-left-radius:4px;border-bottom-right-radius:4px;border-bottom:none}
.leaflet-control-attribution{background:rgba(255,255,255,.7);padding:0 5px;font-size:10px}
.leaflet-popup{position:absolute;text-align:center;margin-bottom:20px}
.leaflet-popup-content-wrapper{padding:1px;text-align:left;border-radius:12px;background:#fff;color:#333;box-shadow:0 3px 14px rgba(0,0,0,.4)}
.leaflet-popup-content{margin:13px 24px 13px 20px;line-height:1.3;min-height:1px}
.leaflet-popup-tip-container{width:40px;height:20px;position:absolute;left:50%;margin-left:-20px;overflow:hidden;pointer-events:none}
.leaflet-popup-tip{width:17px;height:17px;padding:1px;margin:-10px auto 0;transform:rotate(45deg);background:#fff;box-shadow:0 3px 14px rgba(0,0,0,.4)}
.leaflet-container a.leaflet-popup-close-button{position:absolute;top:0;right:0;border:none;width:24px;height:24px;font:16px/24px Tahoma,sans-serif;color:#757575;text-decoration:none;background:transparent;cursor:pointer}
.leaflet-zoom-anim .leaflet-zoom-animated{will-change:transform;transition:transform .25s cubic-bezier(0,0,.25,1)}
.leaflet-zoom-anim .leaflet-tile,.leaflet-pan-anim .leaflet-tile{transition:none}
/* Map */
#map{height:480px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);position:relative;z-index:0;background:#0f172a}
.no-map{display:flex;align-items:center;justify-content:center;height:100px;color:#64748b;font-size:13px;font-style:italic;background:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.07)}
/* Ticket cards */
.tc{background:#1e293b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;transition:border-color .15s}
.tc:hover{border-color:rgba(255,255,255,0.2)}
.tc.hidden{display:none}
.tc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
.tc-no{font-family:monospace;font-weight:900;font-size:13px}
.tc-subj{font-size:12px;color:#94a3b8;margin-bottom:8px;line-height:1.4}
.tc-meta{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px}
.tc-bb{font-size:10px;color:#64748b;margin-top:4px}
.pill{display:inline-flex;padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700}
.spill{padding:3px 10px;border-radius:8px;font-size:9px;font-weight:800;flex-shrink:0}
.tc-detail{display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;line-height:1.6;color:#94a3b8}
.tc.open .tc-detail{display:block}
#ticket-count{font-size:11px;color:#64748b;margin-bottom:12px}
.print-btn{position:fixed;bottom:24px;right:24px;background:#10b981;color:#0f172a;border:none;padding:12px 20px;border-radius:12px;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 4px 20px rgba(16,185,129,0.4);z-index:999;transition:all .15s}
.print-btn:hover{transform:translateY(-1px);background:#059669}
@media print{
  body{background:#fff!important;color:#000!important}
  .print-btn,.filter-panel{display:none!important}
  .kpi,.card,.tc{background:#f8fafc!important;border-color:#e2e8f0!important}
  .tc.hidden{display:block!important}
  #map{display:none!important}
  .tc-detail{display:block!important}
  .kpi .lbl,.card-title,.sec-title,.tc-subj,.period-gen,.brand-sub{color:#475569!important}
  .kpi .val,.brand-title,.period-label,.tc-no{color:#0f172a!important}
}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr">
    <div>
      <div class="badge-noc">NOC FMI</div>
      <div class="brand-title">Backbone Incident Report</div>
      <div class="brand-sub">Fibermedia Infrastructure · Backbone Monitoring System</div>
    </div>
    <div class="period-badge">
      <div class="period-label">${esc(periodLabel)}</div>
      <div class="period-gen">Generated: ${esc(generatedAt)}</div>
    </div>
  </div>

  <!-- KPI -->
  <div class="sec">
    <div class="sec-title">Ringkasan Eksekutif</div>
    <div class="kpi-grid">
      <div class="kpi acc"><div class="lbl">Total Insiden</div><div class="val" style="color:#f0efe8">${total}</div></div>
      <div class="kpi acc"><div class="lbl">Terselesaikan</div><div class="val" style="color:#10b981">${solved} <span style="font-size:13px">(${solveRate}%)</span></div></div>
      <div class="kpi ${(slaRate??0)>=70?"acc":"dng"}"><div class="lbl">SLA Compliance</div><div class="val" style="color:${slaColor}">${slaRate!=null?slaRate+"%":"—"}</div></div>
      <div class="kpi dng"><div class="lbl">Over SLA</div><div class="val" style="color:#f87171">${totalOverSLADisplay}</div></div>
      <div class="kpi inf"><div class="lbl">AVG SLA</div><div class="val" style="color:#60a5fa">${avgOverSLADisplay}</div></div>
    </div>
  </div>

  <!-- Status + SLA -->
  <div class="two-col sec">
    <div class="card">
      <div class="card-title">By Status</div>
      ${statusRows}
    </div>
    <div class="card">
      <div class="card-title">SLA Overview</div>
      <div style="display:flex;gap:24px;margin-bottom:12px">
        <div style="text-align:center"><div style="font-size:26px;font-weight:900;color:#10b981">${slaOK}</div><div style="font-size:9px;color:#64748b;font-weight:700">OK (≤7j)</div></div>
        <div style="text-align:center"><div style="font-size:26px;font-weight:900;color:#f43f5e">${slaNOK}</div><div style="font-size:9px;color:#64748b;font-weight:700">NOK (&gt;7j)</div></div>
      </div>
      ${slaRate!=null?`<div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:4px">
          <span>Compliance Rate</span>
          <span style="font-weight:700;color:${slaColor}">${slaRate}%</span>
        </div>
        <div class="sla-bar"><div style="width:${slaRate}%;background:${slaColor};height:100%;border-radius:4px"></div></div>
      </div>`:""}
    </div>
  </div>

  ${monthSection}

  <!-- Jenis + Problem + Priority -->
  <div class="three-col sec">
    <div class="card">
      <div class="card-title">By Jenis Problem</div>
      ${jenisRows}
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <div class="card-title" style="margin:0">Summary Problem</div>
        <span style="font-size:9px;color:#64748b;margin-left:auto">${problemWithData} active</span>
      </div>
      ${problemRows}
    </div>
    <div class="card">
      <div class="card-title">By Priority</div>
      ${priorityRows}
      <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Klasifikasi Gangguan</div>
        <div style="display:flex;flex-direction:column;gap:7px">
          <div style="border-radius:7px;overflow:hidden;border:1px solid rgba(239,68,68,0.3)">
            <div style="background:rgba(239,68,68,0.12);padding:5px 10px;display:flex;align-items:center;gap:6px">
              <span style="color:#ef4444;font-weight:900;font-size:10px">🔴 CRITICAL</span>
              <span style="color:#94a3b8;font-size:8.5px">Berpotensi / sudah menyebabkan layanan terhenti total</span>
            </div>
            <ul style="margin:0;padding:5px 10px 6px 24px;list-style:disc;color:#94a3b8;font-size:8px;line-height:1.8;background:rgba(239,68,68,0.04)">
              <li>POP mengalami down total (blackout)</li>
              <li>Backbone Level 0 down</li>
              <li>Tersisa 1 link aktif — jika terputus akan menyebabkan blackout</li>
            </ul>
          </div>
          <div style="border-radius:7px;overflow:hidden;border:1px solid rgba(245,158,11,0.3)">
            <div style="background:rgba(245,158,11,0.12);padding:5px 10px;display:flex;align-items:center;gap:6px">
              <span style="color:#f59e0b;font-weight:900;font-size:10px">🟠 MAJOR</span>
              <span style="color:#94a3b8;font-size:8.5px">Berpotensi menjadi critical jika tidak segera ditangani</span>
            </div>
            <ul style="margin:0;padding:5px 10px 6px 24px;list-style:disc;color:#94a3b8;font-size:8px;line-height:1.8;background:rgba(245,158,11,0.04)">
              <li>Tersisa 2 link aktif — risiko blackout jika ada gangguan lanjutan</li>
              <li>Up/down flapping intens</li>
              <li>Salah satu PSU (Power Supply Unit) gangguan/down</li>
            </ul>
          </div>
          <div style="border-radius:7px;overflow:hidden;border:1px solid rgba(16,185,129,0.3)">
            <div style="background:rgba(16,185,129,0.12);padding:5px 10px;display:flex;align-items:center;gap:6px">
              <span style="color:#10b981;font-weight:900;font-size:10px">🟢 MINOR</span>
              <span style="color:#94a3b8;font-size:8.5px">Tidak berdampak langsung pada ketersediaan layanan</span>
            </div>
            <ul style="margin:0;padding:5px 10px 6px 24px;list-style:disc;color:#94a3b8;font-size:8px;line-height:1.8;background:rgba(16,185,129,0.04)">
              <li>Terdapat CRC (error pada link)</li>
              <li>Low power — tidak menyebabkan link down</li>
              <li>1 link down, masih tersedia ≥2 link aktif dengan jalur berbeda (redundant)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Regional -->
  <div class="sec">
    <div class="sec-title">By Regional</div>
    <div class="card" style="padding:14px 18px">
      ${regionalRows}
    </div>
  </div>

  <!-- Filter Panel + Map -->
  <div class="sec">
    <div class="sec-title">🗺 Peta Lokasi Gangguan</div>

    <!-- Multi-dimension filter panel -->
    <div class="filter-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b">🔍 Filter Tiket &amp; Peta (kombinasi AND)</span>
        <button id="reset-filter" style="font-size:10px;font-weight:700;color:#f87171;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.3);border-radius:6px;padding:3px 12px;cursor:pointer;font-family:inherit">✕ Reset Semua</button>
      </div>
      ${filterRowHTML("Status",   statusBtns,   "status")}
      ${filterRowHTML("Jenis",    jenisBtns,    "jenis")}
      ${filterRowHTML("Problem",  problemBtns,  "problem")}
      ${filterRowHTML("Priority", priorityBtns, "priority")}
      ${filterRowHTML("Regional", regionalBtns, "regional")}
    </div>

    <div id="map-info" style="font-size:11px;color:#64748b;margin-bottom:8px;display:flex;justify-content:space-between">
      <span id="map-count">Memuat peta...</span>
      <span id="active-filter-label" style="color:#60a5fa;font-weight:700"></span>
    </div>
    <div id="map" style="width:100%"></div>
  </div>

  <!-- Top Backbone -->
  ${pdfType!=="yearly"?topBackboneSection:""}

  <!-- Kode ≥3 -->
  ${kodeSection}

  <!-- All Tickets -->
  <div class="sec">
    <div class="sec-title" id="list-title">📋 Daftar Semua Tiket</div>
    <div id="ticket-count">${tInfos.length} tiket · klik untuk lihat detail</div>
    <div id="ticket-list">
      ${ticketCardsHTML||`<div style="text-align:center;padding:40px;color:#64748b;font-style:italic">Tidak ada tiket untuk periode ini.</div>`}
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;font-size:9px;color:#64748b">
    <span>NOC FMI — Backbone Monitoring System</span>
    <span>${total} insiden · ${pdfType==="yearly"?"Laporan Tahunan":pdfType==="quarterly"?"Laporan Triwulan":"Laporan Bulanan"} · ${esc(generatedAt)}</span>
  </div>

</div>

<button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>

<script>
(function(){
  var SC        = ${scJSON};
  var LOCATIONS = ${mapJSON};

  // ── Debug: cek berapa lokasi punya koordinat ──────────────────
  var locWithCoords = LOCATIONS.filter(function(l){ return l._lat != null; }).length;
  var mc = document.getElementById('map-count');
  if (mc) mc.textContent = 'Memuat peta... (' + locWithCoords + '/' + LOCATIONS.length + ' lokasi punya koordinat)';

  // ── Filter state ──────────────────────────────────────────────
  var ACTIVE = {status:'ALL',jenis:'ALL',problem:'ALL',priority:'ALL',regional:'ALL'};
  var DIMS   = ['status','jenis','problem','priority','regional'];

  function ticketMatchesFilter(t) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i];
      if (ACTIVE[d] === 'ALL') continue;
      if (t[d] !== ACTIVE[d]) return false;
    }
    return true;
  }

  function cardMatches(el) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i];
      if (ACTIVE[d] === 'ALL') continue;
      if (el.getAttribute('data-' + d) !== ACTIVE[d]) return false;
    }
    return true;
  }

  // Ticket card expand/collapse
  document.querySelectorAll('.tc').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (e.target.closest && e.target.closest('.tc-detail') && el.classList.contains('open')) return;
      el.classList.toggle('open');
    });
  });

  function updateRegional() {
    var counts = {};
    document.querySelectorAll('.tc').forEach(function(c) {
      if (c.classList.contains('hidden')) return;
      var reg = c.getAttribute('data-regional') || '';
      if (!reg) return;
      counts[reg] = (counts[reg] || 0) + 1;
    });
    var maxVal = 1;
    Object.keys(counts).forEach(function(k) { if (counts[k] > maxVal) maxVal = counts[k]; });
    var totalVis = Object.keys(counts).reduce(function(a,k) { return a + counts[k]; }, 0);

    document.querySelectorAll('[data-reg-row]').forEach(function(row) {
      var reg  = row.getAttribute('data-reg-row');
      var cnt  = counts[reg] || 0;
      var pct  = maxVal > 0 ? Math.round((cnt / maxVal) * 100) : 0;
      var rPct = totalVis > 0 && cnt > 0 ? ((cnt / totalVis) * 100).toFixed(1) : '0.0';
      row.style.opacity = cnt === 0 ? '0.35' : '1';
      var fill = row.querySelector('[data-reg-fill]');
      if (fill) {
        fill.style.width      = (pct > 0 ? pct : 2) + '%';
        fill.style.background = cnt > 0 ? '#10b981' : '#334155';
        fill.style.paddingLeft = cnt > 0 ? '6px' : '0';
      }
      var countEl = row.querySelector('[data-reg-count]');
      if (countEl) countEl.textContent = cnt > 0 ? String(cnt) : '';
      var pctEl = row.querySelector('[data-reg-pct]');
      if (pctEl) pctEl.textContent = cnt > 0 ? rPct + '%' : '0';
    });
  }

  function applyAllFilters() {
    // 1. Filter ticket list
    var shown = 0;
    document.querySelectorAll('.tc').forEach(function(c) {
      var hide = !cardMatches(c);
      c.classList.toggle('hidden', hide);
      if (!hide) shown++;
    });
    var activeLabels = DIMS.filter(function(d) { return ACTIVE[d] !== 'ALL'; }).map(function(d) { return ACTIVE[d]; });
    var ce = document.getElementById('ticket-count');
    if (ce) ce.textContent = shown + ' tiket' + (activeLabels.length ? ' · ' + activeLabels.join(' + ') : '') + ' · klik untuk lihat detail';
    var te = document.getElementById('list-title');
    if (te) te.textContent = '📋 Daftar Semua Tiket' + (activeLabels.length ? ' — ' + activeLabels.join(' + ') : '');

    // 2. Update map
    updateMap();

    // 3. Update Regional chart
    updateRegional();

    // 4. Update button styles
    document.querySelectorAll('.fbtn').forEach(function(btn) {
      var dim = btn.getAttribute('data-dim');
      var val = btn.getAttribute('data-val');
      var col = btn.getAttribute('data-col') || '#94a3b8';
      var isAct = (ACTIVE[dim] === val) || (val === 'ALL' && ACTIVE[dim] === 'ALL');
      btn.style.background = isAct ? col + '20' : 'transparent';
      btn.style.borderColor = isAct ? col : col + '44';
      btn.style.fontWeight = isAct ? '900' : '700';
    });

    // 5. Active filter label
    var fl = document.getElementById('active-filter-label');
    if (fl) fl.textContent = activeLabels.length ? 'Filter aktif: ' + activeLabels.join(' + ') : '';
  }

  function setFilter(dim, val) {
    ACTIVE[dim] = (ACTIVE[dim] === val) ? 'ALL' : val;
    applyAllFilters();
  }

  document.querySelectorAll('.fbtn[data-dim]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setFilter(btn.getAttribute('data-dim'), btn.getAttribute('data-val'));
    });
  });

  var rb = document.getElementById('reset-filter');
  if (rb) rb.addEventListener('click', function() {
    ACTIVE = {status:'ALL',jenis:'ALL',problem:'ALL',priority:'ALL',regional:'ALL'};
    applyAllFilters();
  });

  // ── Map rendering (bubble circles, sama seperti BackboneHeatmap) ──
  function updateMap() {
    if (!window._map || !window._circleLayer) return;
    window._circleLayer.clearLayers();
    var totalShown = 0, locShown = 0;
    var bounds = [];

    LOCATIONS.forEach(function(loc) {
      if (loc._lat == null || loc._lng == null) return;

      // Filter tiket di lokasi ini
      var filtered = loc.tickets.filter(ticketMatchesFilter);
      if (filtered.length === 0) return;

      var cnt = filtered.length;
      totalShown += cnt;
      locShown++;
      bounds.push([loc._lat, loc._lng]);

      // Warna & ukuran bubble — sama seperti BackboneHeatmap
      var color = cnt >= 6 ? '#f43f5e' : cnt >= 3 ? '#f97316' : '#f59e0b';
      var radius = Math.max(8, Math.min(38, 8 + Math.sqrt(cnt) * 6));

      var circle = L.circleMarker([loc._lat, loc._lng], {
        radius: radius,
        fillColor: color, fillOpacity: 0.65,
        color: 'rgba(255,255,255,0.25)', weight: 1.5
      });

      // Popup dengan daftar tiket di lokasi ini
      var rows = filtered.slice(0, 12).map(function(t) {
        var col = SC[t.status] || '#94a3b8';
        return '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:6px">'
          + '<span style="font-family:monospace;font-size:10px;font-weight:700;color:' + col + '">' + t.ticketNo + '</span>'
          + '<span style="font-size:9px;color:#9ca3af">' + [t.jenis, t.problem].filter(Boolean).join(' · ') + '</span>'
          + '<span style="margin-left:auto;font-size:8px;font-weight:800;color:' + col + ';background:' + col + '22;padding:1px 5px;border-radius:4px">' + t.status + '</span>'
          + '</div>';
      }).join('');
      if (filtered.length > 12) rows += '<div style="font-size:9px;color:#6b7280;padding-top:4px">+' + (filtered.length - 12) + ' tiket lainnya</div>';

      var popup = '<div style="min-width:240px;max-height:300px;overflow-y:auto;font-family:sans-serif;background:#1e293b;color:#e2e8f0;border-radius:8px;padding:2px">'
        + '<div style="font-size:11px;font-weight:700;color:#f0efe8;margin-bottom:4px;line-height:1.3">' + loc.alamatRaw + '</div>'
        + '<div style="font-size:10px;color:#64748b;margin-bottom:8px">' + cnt + ' insiden di lokasi ini</div>'
        + rows + '</div>';

      circle.bindPopup(popup, { maxWidth: 300, className: 'dark-popup' });
      circle.addTo(window._circleLayer);
    });

    var mc = document.getElementById('map-count');
    if (mc) mc.textContent = totalShown + ' insiden · ' + locShown + ' lokasi dipetakan';

    if (bounds.length === 0) return;
    try {
      if (bounds.length === 1) { window._map.setView(bounds[0], 14); }
      else { window._map.fitBounds(L.latLngBounds(bounds), {padding:[40,40], maxZoom:14}); }
    } catch(e) {}
  }

  function initMap() {
    var el = document.getElementById('map');
    if (!el || !window.L) {
      var mc2 = document.getElementById('map-count');
      if (mc2) mc2.textContent = '⚠️ window.L tidak tersedia — Leaflet belum dimuat';
      return;
    }

    // CARTO dark_all — sama persis BackboneHeatmap
    window._map = L.map('map', {preferCanvas: true}).setView([-6.2, 106.8], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19
    }).addTo(window._map);

    window._circleLayer = L.layerGroup().addTo(window._map);

    // Paksa recalculate ukuran setelah layout stabil (blob URL butuh lebih lama)
    function doInvalidate(attempt) {
      window._map.invalidateSize({ animate: false });
      updateMap();
      // Retry sekali lagi setelah 800ms (untuk memastikan semua tiles ter-render)
      if (attempt < 2) setTimeout(function() { doInvalidate(attempt + 1); }, 800);
    }
    setTimeout(function() { doInvalidate(1); }, 200);

    // Juga invalidate saat window di-resize
    window.addEventListener('resize', function() {
      if (window._map) window._map.invalidateSize({ animate: false });
    });
  }

  // ── Load Leaflet JS dengan 3 CDN fallback ─────────────────────
  // CSS sudah di-inline di atas — tidak perlu CDN untuk CSS
  var LEAFLET_CDNS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.min.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
  ];

  function loadLeafletJS(idx, onSuccess, onAllFail) {
    if (idx >= LEAFLET_CDNS.length) { onAllFail(); return; }
    var s = document.createElement('script');
    s.src = LEAFLET_CDNS[idx];
    s.onload = function() { onSuccess(); };
    s.onerror = function() {
      console.warn('Leaflet CDN gagal:', LEAFLET_CDNS[idx], '— coba berikutnya...');
      loadLeafletJS(idx + 1, onSuccess, onAllFail);
    };
    document.head.appendChild(s);
  }

  function startMap() {
    var mc0 = document.getElementById('map-count');
    if (mc0) mc0.textContent = 'Memuat library peta...';
    loadLeafletJS(0, function() {
      initMap();
    }, function() {
      var mc = document.getElementById('map-count');
      var mapEl = document.getElementById('map');
      if (mc) mc.textContent = '⚠️ Library peta gagal dimuat — cek koneksi internet';
      if (mapEl) mapEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px;padding:40px"><div style="font-size:32px">🗺️</div><div style="font-size:12px;text-align:center">Tidak dapat memuat peta.<br/>Buka file ini saat ada koneksi internet.</div></div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMap);
  } else {
    startMap();
  }
})();
<\/script>
<style>
.dark-popup .leaflet-popup-content-wrapper{background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.6);color:#e2e8f0}
.dark-popup .leaflet-popup-tip{background:#1e293b}
.dark-popup .leaflet-popup-close-button{color:#64748b}
<\/style>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// PDF REPORT HTML BUILDER  (module-level, bisa panggil helper)
// ─────────────────────────────────────────────────────────────
function buildPDFHTML(opts: {
  periodLabel: string;
  pdfType: "monthly" | "quarterly" | "yearly";
  total:   number;
  solved:  number;
  byStatus:   Record<string, number>;
  byRegional: Record<string, number>;
  byJenis:    Record<string, number>;
  byPriority: Record<string, number>;
  byKode:     Record<string, number>;
  byProblem:  Record<string, number>;
  slaOK:   number;
  slaNOK:  number;
  slaRate: number | null;
  avgMTTR: number | null;
  totalOverSLA: number | null;
  avgOverSLA: number | null;
  tickets:     any[][];
  monthlyData: { month: string; count: number; solved: number }[];
}): string {
  const { periodLabel, pdfType, total, solved, byStatus, byRegional, byJenis, byPriority,
          byKode, byProblem, slaOK, slaNOK, slaRate, avgMTTR, totalOverSLA, avgOverSLA, tickets, monthlyData } = opts;

  const solveRate = total > 0 ? Math.round((solved / total) * 100) : 0;

  const SC: Record<string, string> = {
    "SOLVED":"#10b981","CANCEL":"#6b7280","UNSOLVED":"#ef4444",
    "PENDING":"#f59e0b","ON PROGRESS":"#3b82f6","OPEN":"#f5c842",
  };

  const bar = (stats: Record<string, number>, colors: Record<string,string> = {}) => {
    const entries = Object.entries(stats).sort(([,a],[,b]) => b - a);
    const max = Math.max(...entries.map(([,v]) => v), 1);
    return entries.map(([k, v]) => {
      const pct   = Math.round((v / max) * 100);
      const color = colors[k] || "#34d399";
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">` +
        `<div style="width:90px;font-size:10px;color:#475569;font-weight:600;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k}</div>` +
        `<div style="flex:1;background:#f1f5f9;border-radius:4px;height:16px;overflow:hidden">` +
        `<div style="width:${pct}%;background:${color};height:100%;border-radius:4px;min-width:24px;display:flex;align-items:center;padding-left:6px">` +
        `<span style="font-size:9px;color:white;font-weight:700">${v}</span></div></div></div>`;
    }).join("");
  };

  const totalOverSLAFmt = totalOverSLA != null ? `${Math.floor(totalOverSLA / 60)}j ${totalOverSLA % 60}m` : "—";
  const avgOverSLAFmt   = avgOverSLA   != null ? `${Math.floor(avgOverSLA   / 60)}j ${avgOverSLA   % 60}m` : "—";
  const slaColor   = (slaRate ?? 0) >= 70 ? "#10b981" : "#f43f5e";
  const slaClass   = (slaRate ?? 0) >= 70 ? "acc" : "dng";

  // Helper: live SLA & MTTR per ticket group
  const liveSLA  = (g: any[]) => {
    const f = g[0];
    if (f["Start Time"] && f["End Time"]) return calcSLA(f["Start Time"], f["End Time"]);
    return null;
  };
  const liveMTTR = (g: any[]) => {
    const f = g[0];
    if (f["Start Time"] && f["End Time"]) return calcMTTRMinutes(f["Start Time"], f["End Time"]);
    return f["MTTR"] != null ? Number(f["MTTR"]) : null;
  };
  const fmtMTTRpdf = (m: number | null) =>
    m != null ? `${Math.floor(m / 60)}j ${m % 60}m` : "—";

  // ── Top Backbone + tiket terkait (monthly & quarterly) ──
  const topBackboneSection = (() => {
    const limit = pdfType === "monthly" ? 10 : 15;
    const topKode = Object.entries(byKode)
      .sort(([,a],[,b]) => b - a)
      .slice(0, limit);

    if (topKode.length === 0) return "";

    const rows = topKode.map(([kode, count], ki) => {
      // Tiket yang mengandung kode ini
      const related = tickets.filter(g => g.some((r: any) => r["Kode Backbone"] === kode));
      const namaLink = related[0]?.find((r: any) => r["Kode Backbone"] === kode)?.["Nama Link"] || "";

      const ticketMiniRows = related.map((g: any[]) => {
        const f   = g[0];
        const st  = getTicketStatus(g);
        const sla = liveSLA(g);
        const mtr = liveMTTR(g);
        const stColor = st === "SOLVED" ? "#065f46" : st === "CANCEL" ? "#475569"
                      : st === "UNSOLVED" ? "#991b1b" : st === "PENDING" ? "#92400e" : "#1e40af";
        const stBg    = st === "SOLVED" ? "#d1fae5" : st === "CANCEL" ? "#f1f5f9"
                      : st === "UNSOLVED" ? "#fee2e2" : st === "PENDING" ? "#fef3c7" : "#dbeafe";
        const slaColor = sla ? (sla.isOK ? "#065f46" : "#991b1b") : "#94a3b8";
        const slaBg    = sla ? (sla.isOK ? "#d1fae5" : "#fee2e2") : "#f1f5f9";
        const slaText  = sla ? (sla.isOK ? "OK" : "NOK") : (f["SLA"] || "—");
        return `<tr>
          <td style="font-family:monospace;font-weight:700;font-size:9px;color:#0f172a">${f["NOMOR TICKET"] || "—"}</td>
          <td style="color:#475569;font-size:9px">${f["Hari dan Tanggal Report"] || "—"}</td>
          <td style="color:#475569;font-size:9px">${f["Jenis Problem"] || "—"}</td>
          <td style="color:#334155;font-size:8.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f["Problem"] || ""}">${f["Problem"] || "—"}</td>
          <td style="color:${f["Priority"]==="CRITICAL"?"#ef4444":f["Priority"]?"#f59e0b":"#94a3b8"};font-weight:700;font-size:9px">${f["Priority"] || "—"}</td>
          <td><span class="b" style="background:${stBg};color:${stColor}">${st}</span></td>
          <td><span class="b" style="background:${slaBg};color:${slaColor}">${slaText}</span></td>
          <td style="font-family:monospace;font-size:9px">${fmtMTTRpdf(mtr)}</td>
        </tr>`;
      }).join("");

      return `<div class="bb-group">
        <div class="bb-hdr">
          <span class="bb-num">${ki + 1}</span>
          <span class="bb-kode">${kode}</span>
          ${namaLink ? `<span class="bb-nama">${namaLink}</span>` : ""}
          <span class="bb-cnt">${count} insiden</span>
        </div>
        ${related.length > 0 ? `
        <table style="margin-top:5px">
          <thead><tr>
            <th>Nomor Tiket</th><th>Tanggal</th><th>Jenis Problem</th>
            <th>Problem</th><th>Priority</th><th>Status</th><th>SLA</th><th>MTTR</th>
          </tr></thead>
          <tbody>${ticketMiniRows}</tbody>
        </table>` : ""}
      </div>`;
    }).join("");

    return `<div class="sec">
      <div class="sec-title">Top ${limit} Kode Backbone — Detail Insiden per Link</div>
      ${rows}
    </div>`;
  })();

  const monthSection = pdfType === "yearly" && monthlyData.length > 0
    ? `<div class="sec">
        <div class="sec-title">Breakdown Bulanan ${monthlyData[0]?.count != null ? "(insiden per bulan)" : ""}</div>
        <div class="month-grid">${monthlyData.map(m =>
          `<div class="mc">
            <div class="ml">${m.month}</div>
            <div class="mt" style="${m.count === 0 ? "color:#94a3b8" : ""}">${m.count}</div>
            <div class="ms">${m.count > 0 ? `✓${m.solved}` : "—"}</div>
          </div>`
        ).join("")}</div>
      </div>`
    : "";

  const kodeSection = (() => {
    const filtered = Object.entries(byKode).filter(([, v]) => v >= 3).sort(([, a], [, b]) => b - a);
    if (filtered.length === 0) return "";
    // Bangun lookup kode → nama link dari tickets
    const kodeToNama: Record<string, string> = {};
    tickets.forEach(g => {
      g.forEach((r: any) => {
        const kd = r["Kode Backbone"];
        if (kd && !kodeToNama[kd]) kodeToNama[kd] = r["Nama Link"] || "";
      });
    });
    const rows = filtered.map(([k, v], i) => {
      const nama = kodeToNama[k] || "";
      return `<tr>
        <td style="color:#94a3b8;text-align:center;width:32px">${i + 1}</td>
        <td style="font-family:monospace;font-weight:700;color:#0f172a;width:72px">${k}</td>
        <td style="color:#334155;font-size:9.5px">${nama}</td>
        <td style="text-align:right;font-weight:900;color:#10b981;width:56px">${v}</td>
      </tr>`;
    }).join("");
    return `<div class="sec">
      <div class="sec-title">Top Kode Backbone (Frekuensi Insiden ≥ 3)</div>
      <div class="card"><table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th style="width:72px">Kode</th>
          <th>Nama Backbone</th>
          <th style="text-align:right;width:56px">Insiden</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  })();

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>Backbone Report — ${periodLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#fff;font-size:11px}
@page{size:A4 landscape;margin:12mm}
@media print{.np{display:none!important}}
.page{max-width:1060px;margin:0 auto;padding:16px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #34d399;margin-bottom:18px}
.hdr h1{font-size:18px;font-weight:900;color:#0f172a}
.hdr .per{font-size:12px;color:#64748b;margin-top:3px}
.hdr .gen{font-size:9px;color:#94a3b8;margin-top:5px}
.badge-noc{background:#0f172a;color:#34d399;padding:4px 12px;border-radius:6px;font-size:10px;font-weight:900;letter-spacing:2px}
.sec{margin-bottom:20px}
.sec-title{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:10px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px}
.kpi .lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px}
.kpi .val{font-size:22px;font-weight:900}
.kpi.acc{border-top:3px solid #34d399}
.kpi.dng{border-top:3px solid #f43f5e}
.kpi.wrn{border-top:3px solid #f59e0b}
.kpi.inf{border-top:3px solid #3b82f6}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}
.card-title{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:9px}
th{background:#f1f5f9;padding:5px 7px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;border:1px solid #e2e8f0}
td{padding:5px 7px;border:1px solid #e2e8f0;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.b{display:inline-block;padding:2px 5px;border-radius:3px;font-size:7px;font-weight:700}
.sla-bar{width:100%;background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden;margin-top:3px}
.month-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:5px}
.mc{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:6px 3px}
.mc .ml{font-size:7px;color:#64748b;font-weight:700;text-transform:uppercase}
.mc .mt{font-size:15px;font-weight:900;color:#0f172a;line-height:1.2}
.mc .ms{font-size:8px;color:#10b981;font-weight:700}
.bb-group{margin-bottom:14px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
.bb-hdr{display:flex;align-items:center;gap:10px;background:#f1f5f9;padding:7px 10px;border-bottom:1px solid #e2e8f0}
.bb-num{font-size:8px;color:#94a3b8;font-weight:700;width:18px;flex-shrink:0}
.bb-kode{font-family:monospace;font-size:10px;font-weight:900;color:#0f172a;background:#e2e8f0;padding:2px 6px;border-radius:3px;flex-shrink:0}
.bb-nama{font-size:9px;color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bb-cnt{font-size:8px;font-weight:800;color:#10b981;flex-shrink:0;margin-left:auto}
.footer{margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#94a3b8;font-size:8px}
.pbtn{position:fixed;top:14px;right:14px;background:#0f172a;color:#34d399;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
</style></head>
<body>
<button class="pbtn np" onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
<div class="page">
  <div class="hdr">
    <div>
      <h1>Backbone Incident Report</h1>
      <div class="per">Periode: ${periodLabel}</div>
      <div class="gen">Digenerate: ${new Date().toLocaleString("id-ID")}</div>
    </div>
    <div><div class="badge-noc">NOC FMI</div><div style="font-size:9px;color:#94a3b8;margin-top:5px;text-align:right">Backbone Monitor</div></div>
  </div>

  <div class="sec">
    <div class="sec-title">Ringkasan Eksekutif</div>
    <div class="kpi-grid">
      <div class="kpi acc"><div class="lbl">Total Insiden</div><div class="val" style="color:#0f172a">${total}</div></div>
      <div class="kpi acc"><div class="lbl">Terselesaikan</div><div class="val" style="color:#10b981">${solved}<span style="font-size:12px"> (${solveRate}%)</span></div></div>
      <div class="kpi ${slaClass}"><div class="lbl">SLA Compliance</div><div class="val" style="color:${slaColor}">${slaRate != null ? slaRate + "%" : "—"}</div></div>
      <div class="kpi dng"><div class="lbl">Over SLA</div><div class="val" style="color:#ef4444">${totalOverSLAFmt}</div></div>
      <div class="kpi inf"><div class="lbl">AVG SLA</div><div class="val" style="color:#3b82f6">${avgOverSLAFmt}</div></div>
    </div>
  </div>

  <div class="two-col sec">
    <div class="card">
      <div class="card-title">By Status</div>
      ${(() => {
        // Urutan tetap sesuai NOC Index + OPEN sebagai fallback
        // "ONPROGRES" di DB sudah dinormalisasi → "ON PROGRESS" oleh normalizeStatus()
        const STATUS_ORDER = ["SOLVED","ON PROGRESS","PENDING","UNSOLVED","CANCEL","OPEN"];
        const statusTotal  = STATUS_ORDER.reduce((s, k) => s + (byStatus[k] || 0), 0);
        return STATUS_ORDER.map((label, i) => {
          const cnt  = byStatus[label] || 0;
          const pct  = statusTotal > 0 ? ((cnt / statusTotal) * 100).toFixed(1) : "0.0";
          const rank = ["🥇","🥈","🥉"][i] ?? `${i + 1}.`;
          const col  = SC[label] || "#94a3b8";
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f1f5f9;opacity:${cnt === 0 ? "0.4" : "1"}">
            <span style="font-size:10px;width:20px;text-align:center;flex-shrink:0">${rank}</span>
            <span style="flex:1;font-size:9.5px;color:#1e293b;font-weight:600">${label}</span>
            <span style="font-size:8.5px;color:#94a3b8;flex-shrink:0">${pct}%</span>
            <span style="font-size:10px;font-weight:900;color:#fff;background:${col};border-radius:5px;padding:1px 6px;flex-shrink:0;min-width:22px;text-align:center">${cnt}</span>
          </div>`;
        }).join("");
      })()}
    </div>
    <div class="card">
      <div class="card-title">SLA Overview</div>
      <div style="display:flex;gap:20px;margin-bottom:10px">
        <div style="text-align:center"><div style="font-size:22px;font-weight:900;color:#10b981">${slaOK}</div><div style="font-size:9px;color:#64748b;font-weight:700">OK (≤7j)</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:900;color:#f43f5e">${slaNOK}</div><div style="font-size:9px;color:#64748b;font-weight:700">NOK (&gt;7j)</div></div>
      </div>
      ${slaRate != null
        ? `<div><div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:3px"><span>Compliance</span><span style="font-weight:700;color:${slaColor}">${slaRate}%</span></div><div class="sla-bar"><div style="width:${slaRate}%;background:${slaColor};height:100%;border-radius:4px"></div></div></div>`
        : ""}
    </div>
  </div>

  ${monthSection}

  ${/* ── LAYOUT: [Jenis Problem | Summary Problem | Priority] + [Regional full-width] ── */
  (() => {
    // ── Predefined master lists (sesuai NOC Index table) ──
    const JENIS_ORDER    = ["CRC","DOWN","UNMONITOR","HIGH POWER","LOW POWER","OVERHEAT"];
    const PRIORITY_ORDER = ["CRITICAL","MAJOR","MINOR"];
    const PROBLEM_ORDER  = ["FO CUT","BENDING","ELECTRICAL","DEVICE","PATCHCORE","SFP","TEMPERATURE","ATTENUATOR","BARELL OTB","SIGNAL DROP"];
    const REGIONAL_ORDER = ["Bogor","Depok","Kab Bekasi","Kota Bekasi","Karawang","Jakarta Selatan","Jakarta Utara","Jakarta Barat","Jakarta Timur","Purwakarta","Tangerang","Cirebon"];

    // ── Merge predefined list with actual data (fill 0 for missing, append extras) ──
    const mergeWithPredefined = (
      predefined: string[],
      actual: Record<string, number>,
    ): [string, number][] => {
      // Case-insensitive lookup helper
      const findActual = (key: string): number => {
        const upper = key.toUpperCase();
        for (const [k, v] of Object.entries(actual)) {
          if (k.toUpperCase() === upper) return v;
        }
        return 0;
      };
      const result: [string, number][] = predefined.map(k => [k, findActual(k)]);
      // Append any extras in actual not covered by predefined
      const predUpper = predefined.map(p => p.toUpperCase());
      for (const [k, v] of Object.entries(actual)) {
        if (!predUpper.includes(k.toUpperCase())) result.push([k, v]);
      }
      return result;
    };

    // ── Shared: compact ranked list — 0-count items dimmed at bottom ──
    const compactList = (
      entries: [string, number][],
      colorFn: (i: number, key: string) => string,
    ) => {
      const nonZero = entries.filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a);
      const zeros   = entries.filter(([,v]) => v === 0);
      const sorted  = [...nonZero, ...zeros];
      const listTotal = nonZero.reduce((s,[,v]) => s + v, 0);
      return sorted.map(([label, cnt], i) => {
        const isZero = cnt === 0;
        const rank   = !isZero ? (["🥇","🥈","🥉"][i] ?? `${i + 1}.`) : "—";
        const pct    = listTotal > 0 && cnt > 0 ? ((cnt / listTotal) * 100).toFixed(1) : "0.0";
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f1f5f9;opacity:${isZero ? "0.4" : "1"}">
          <span style="font-size:10px;width:20px;text-align:center;flex-shrink:0">${rank}</span>
          <span style="flex:1;font-size:9.5px;color:#1e293b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${label}</span>
          <span style="font-size:8.5px;color:#94a3b8;flex-shrink:0">${pct}%</span>
          <span style="font-size:10px;font-weight:900;color:#fff;background:${colorFn(i, label)};border-radius:5px;padding:1px 6px;flex-shrink:0;min-width:22px;text-align:center">${cnt}</span>
        </div>`;
      }).join("");
    };

    // Color functions per card
    const jenisColor = (_i: number, key: string): string => {
      const k = key.toUpperCase();
      if (k === "DOWN")       return "#f43f5e";
      if (k === "CRC")        return "#f59e0b";
      if (k === "UNMONITOR")  return "#64748b";
      if (k === "LOW POWER")  return "#3b82f6";
      if (k === "HIGH POWER") return "#f97316";
      if (k === "OVERHEAT")   return "#ec4899";
      return "#34d399";
    };
    const priorityColor = (_i: number, key: string): string => {
      const k = key.toUpperCase();
      if (k === "CRITICAL") return "#f43f5e";
      if (k === "MAJOR")    return "#f97316";
      return "#10b981"; // MINOR
    };
    const problemColor = (_i: number, key: string): string => {
      const PROBLEM_ORDER_UPPER = PROBLEM_ORDER.map(p => p.toUpperCase());
      const idx = PROBLEM_ORDER_UPPER.indexOf(key.toUpperCase());
      if (idx < 0) return "#94a3b8";
      return idx < 3 ? "#f43f5e" : idx < 6 ? "#f59e0b" : "#34d399";
    };

    // ── Build merged entry lists ──
    const jenisEntries    = mergeWithPredefined(JENIS_ORDER,    byJenis);
    const priorityEntries = mergeWithPredefined(PRIORITY_ORDER, byPriority);
    const problemEntries  = mergeWithPredefined(PROBLEM_ORDER,  byProblem);

    const jenisRows    = compactList(jenisEntries,    jenisColor);
    const priorityRows = compactList(priorityEntries, priorityColor);
    const problemRows  = compactList(problemEntries,  problemColor);

    // Count how many problem types actually have data
    const problemWithData = problemEntries.filter(([,v]) => v > 0).length;

    // ── Bottom: Regional full-width (bar chart + predefined list) ──
    const regionalEntries = mergeWithPredefined(REGIONAL_ORDER, byRegional);
    const nonZeroRegional = regionalEntries.filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a);
    const zeroRegional    = regionalEntries.filter(([,v]) => v === 0);
    const sortedRegional  = [...nonZeroRegional, ...zeroRegional];
    const regionalRows = (() => {
      const max = Math.max(...sortedRegional.map(([,v]) => v), 1);
      return sortedRegional.map(([k, v]) => {
        const barPct = v > 0 ? Math.round((v / max) * 100) : 0;
        const rPct   = total > 0 && v > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
        const opacity = v === 0 ? "0.4" : "1";
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;opacity:${opacity}">
          <div style="width:110px;font-size:10px;color:#475569;font-weight:600;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k}</div>
          <div style="flex:1;background:#f1f5f9;border-radius:4px;height:16px;overflow:hidden">
            <div style="width:${barPct > 0 ? barPct : 2}%;background:${v > 0 ? "#34d399" : "#cbd5e1"};height:100%;border-radius:4px;min-width:${v > 0 ? "24px" : "0"};display:flex;align-items:center;padding-left:${v > 0 ? "6px" : "0"}">
              ${v > 0 ? `<span style="font-size:9px;color:white;font-weight:700">${v}</span>` : ""}
            </div>
          </div>
          <div style="font-size:9px;color:#94a3b8;width:38px;flex-shrink:0;text-align:right">${v > 0 ? rPct + "%" : "0"}</div>
        </div>`;
      }).join("");
    })();

    return `
  <div class="three-col sec">
    <div class="card">
      <div class="card-title">By Jenis Problem</div>
      ${jenisRows}
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;margin-bottom:8px">
        <div class="card-title" style="margin:0">Summary Problem</div>
        <span style="font-size:8px;color:#94a3b8;margin-left:auto">${problemWithData} active</span>
      </div>
      ${problemRows}
    </div>
    <div class="card">
      <div class="card-title">By Priority</div>
      ${priorityRows}
      <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:9px">
        <div style="font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px">Klasifikasi Gangguan</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="border-radius:6px;overflow:hidden;border:1px solid rgba(239,68,68,0.3)">
            <div style="background:rgba(239,68,68,0.12);padding:4px 9px;display:flex;align-items:center;gap:5px">
              <span style="color:#ef4444;font-weight:900;font-size:9px">🔴 CRITICAL</span>
              <span style="color:#94a3b8;font-size:8px">Berpotensi / sudah menyebabkan layanan terhenti total</span>
            </div>
            <ul style="margin:0;padding:4px 9px 5px 22px;list-style:disc;color:#94a3b8;font-size:7.5px;line-height:1.75;background:rgba(239,68,68,0.04)">
              <li>POP mengalami down total (blackout)</li>
              <li>Backbone Level 0 down</li>
              <li>Tersisa 1 link aktif — jika terputus akan menyebabkan blackout</li>
            </ul>
          </div>
          <div style="border-radius:6px;overflow:hidden;border:1px solid rgba(245,158,11,0.3)">
            <div style="background:rgba(245,158,11,0.12);padding:4px 9px;display:flex;align-items:center;gap:5px">
              <span style="color:#f59e0b;font-weight:900;font-size:9px">🟠 MAJOR</span>
              <span style="color:#94a3b8;font-size:8px">Berpotensi menjadi critical jika tidak segera ditangani</span>
            </div>
            <ul style="margin:0;padding:4px 9px 5px 22px;list-style:disc;color:#94a3b8;font-size:7.5px;line-height:1.75;background:rgba(245,158,11,0.04)">
              <li>Tersisa 2 link aktif — risiko blackout jika ada gangguan lanjutan</li>
              <li>Up/down flapping intens</li>
              <li>Salah satu PSU (Power Supply Unit) gangguan/down</li>
            </ul>
          </div>
          <div style="border-radius:6px;overflow:hidden;border:1px solid rgba(16,185,129,0.3)">
            <div style="background:rgba(16,185,129,0.12);padding:4px 9px;display:flex;align-items:center;gap:5px">
              <span style="color:#10b981;font-weight:900;font-size:9px">🟢 MINOR</span>
              <span style="color:#94a3b8;font-size:8px">Tidak berdampak langsung pada ketersediaan layanan</span>
            </div>
            <ul style="margin:0;padding:4px 9px 5px 22px;list-style:disc;color:#94a3b8;font-size:7.5px;line-height:1.75;background:rgba(16,185,129,0.04)">
              <li>Terdapat CRC (error pada link)</li>
              <li>Low power — tidak menyebabkan link down</li>
              <li>1 link down, masih tersedia ≥2 link aktif dengan jalur berbeda (redundant)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">By Regional</div>
    <div class="card" style="padding:12px 16px">
      ${regionalRows}
    </div>
  </div>`;
  })()}

  ${kodeSection}

  ${pdfType === "yearly"
    ? ""   // Tahunan: tidak ada detail tabel — terlalu panjang
    : topBackboneSection
  }

  <div class="footer">
    <span>NOC FMI — Backbone Monitoring System</span>
    <span>Dicetak: ${new Date().toLocaleString("id-ID")} · ${total} insiden · ${pdfType === "yearly" ? "Laporan Tahunan" : pdfType === "quarterly" ? "Laporan Triwulan" : "Laporan Bulanan"}</span>
  </div>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
// Local date as YYYY-MM-DD (avoids UTC offset shifting)
function localDateISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Current time in DD/MM/YYYY HH:MM:SS format
function nowDisplayFormat(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// formatHariTanggalFull — alias of formatHariTanggal
function formatHariTanggalFull(d: Date): string {
  return formatHariTanggal(d);
}

// Extract date parts from "17 April 2026" or "2026-04-17" or "17/04/2026"
function extractDateParts(s: string): { day: number; month: number; year: number; monthStr: string } | null {
  // Try "DD MMMM YYYY" (Indonesian)
  const id = s.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (id) {
    const monthIdx = BULAN_ID.findIndex(m => m.toLowerCase() === id[2].toLowerCase());
    if (monthIdx >= 0) return { day: +id[1], month: monthIdx + 1, year: +id[3], monthStr: `${id[3]}-${String(monthIdx+1).padStart(2,"0")}` };
  }
  // Try "YYYY-MM-DD"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { day: +iso[3], month: +iso[2], year: +iso[1], monthStr: `${iso[1]}-${iso[2]}` };
  // Try "DD/MM/YYYY"
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return { day: +dmy[1], month: +dmy[2], year: +dmy[3], monthStr: `${dmy[3]}-${String(+dmy[2]).padStart(2,"0")}` };
  return null;
}

export default function ReportBackbone() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL    || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );

    // ── Theme state — sync dengan layout.tsx global theme ──
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { return (localStorage.getItem("noc-theme") || "dark") !== "light"; } catch { return true; }
  });
  const theme = darkMode ? C_DARK : C_LIGHT;
  const C     = theme;

  // Sync dengan data-theme attribute dari layout.tsx
  useEffect(() => {
    const sync = () => setDarkMode(document.documentElement.dataset.theme !== "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // ── Bell / alert state ──
  const [showBell,       setShowBell]       = useState(false);
  const [inactiveAlerts, setInactiveAlerts] = useState<{ ticketNo: string; status: string; diffMin: number; exempt: boolean }[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  // ── Heatmap state ──
  const [showHeatmap,         setShowHeatmap]         = useState(false);
  const [showCalendarHeatmap, setShowCalendarHeatmap] = useState(false);

  // ── SUPER_DEV state ──
  const [showSDModal,    setShowSDModal]    = useState(false);
  const [sdPinVerified,  setSdPinVerified]  = useState(false);
  const [sdPin,          setSdPin]          = useState("");
  const [sdLoading,      setSdLoading]      = useState(false);
  const [sdTab,          setSdTab]          = useState<"creds"|"backbone"|"info">("creds");
  const [odooCredList,   setOdooCredList]   = useState<any[]>([]);
  const [odooCredLoading,setOdooCredLoading]= useState(false);
  const [newBBName,      setNewBBName]      = useState("");
  const [newBBLoading,   setNewBBLoading]   = useState(false);

  // ── Odoo integration state ──
  const [odooResult,      setOdooResult]      = useState<{ ticketNumber: string; ticketId: number; odooUrl: string; subject: string } | null>(null);
  const [odooLoading,     setOdooLoading]     = useState(false);
  const [odooSubject,     setOdooSubject]     = useState("");
  const [odooDescription, setOdooDescription] = useState("");
  const [odooExpanded,    setOdooExpanded]    = useState(true);
  const [syncingOdoo,     setSyncingOdoo]     = useState(false);
  const [lastSyncTime,    setLastSyncTime]    = useState<Date | null>(null);

  // ── WA Report state ──
  const [showWAModal, setShowWAModal] = useState(false);
  const [waCopied,    setWaCopied]    = useState(false);

  // ── Summary Report state ──
  const [showSummaryModal,  setShowSummaryModal]  = useState(false);
  const [summaryText,       setSummaryText]       = useState("");

  // ── Add Backbone modal (Index NOC) ──
  const [showAddBBModal,  setShowAddBBModal]  = useState(false);
  const [newBBKode,       setNewBBKode]       = useState("");
  const [newBBNama,       setNewBBNama]       = useState("");
  const [addBBLoading,    setAddBBLoading]    = useState(false);
  // ── Add Impact Backbone (tambah link ke tiket yang sudah ada) ──
  const [showAddImpactModal,  setShowAddImpactModal]  = useState(false);
  const [impactRows, setImpactRows] = useState<{ kode: string; nama: string; kapasitas: string }[]>([{ kode: "", nama: "", kapasitas: "" }]);
  const [addImpactLoading,    setAddImpactLoading]    = useState(false);

  // ── Page sub-tabs: overview / tiket / pop-kaki ──
  const [pageTab, setPageTab] = useState<"overview" | "tiket" | "pop-kaki">("tiket");
  // ── Overview left panel search ──
  const [popAlertSearch, setPopAlertSearch] = useState("");
  // ── Overview right panel search ──
  const [slaTicketSearch, setSlaTicketSearch] = useState("");

  // ── Management Backbone PoP modal ──
  const [showBBMgmtModal,  setShowBBMgmtModal]  = useState(false);
  const [bbMgmtSelPop,     setBBMgmtSelPop]     = useState<any | null>(null);
  const [bbMgmtPopSearch,  setBBMgmtPopSearch]  = useState("");
  const [bbMgmtLinkSearch, setBBMgmtLinkSearch] = useState("");
  const [bbMgmtDraft,      setBBMgmtDraft]      = useState<string[]>([]);
  const [bbMgmtDirty,      setBBMgmtDirty]      = useState(false);
  const [bbMgmtSaving,     setBBMgmtSaving]     = useState(false);
  const [bbMgmtEditMode,   setBBMgmtEditMode]   = useState(false); // false = summary, true = edit checklist
  // Track per-session alerts agar tidak spam (key = popKode_downN)
  const kakiAlertSentRef = useRef<Set<string>>(new Set());

  // ── Stale Ticket Alert state ──────────────────────────────────
  // Data stale diambil dari inactiveAlerts (sudah dihitung dari Problem & Action Timeline / Start Time)
  // Tidak perlu query DB atau kolom updated_at
  const [showStalePopup,   setShowStalePopup]   = useState(false);
  const [staleSentAt,      setStaleSentAt]      = useState<Date | null>(null);
  const [staleSending,     setStaleSending]     = useState(false);
  // Ref untuk track kapan terakhir kali kita kirim — hindari spam
  const staleLastSentRef = useRef<number>(0);
  // Ref mirror groupedReports agar bisa diakses di useCallback tanpa masuk deps array
  // (groupedReports sendiri baru di-declare di bawah via useMemo — ini hindari TDZ)
  const groupedReportsRef = useRef<Record<string, any[]>>({});

  // ── Current user role + permissions (for backbone.approve_kode gate) ──
  const [currentUserRole,      setCurrentUserRole]      = useState<string | null>(null);
  const [currentUserOverrides, setCurrentUserOverrides] = useState<Record<string,boolean> | null>(null);
  const [currentRolePerms,     setCurrentRolePerms]     = useState<Record<string,boolean> | null>(null);

  // ── Pending items dari backbone_pending table ──
  const [pendingItems, setPendingItems] = useState<any[]>([]);

  // Computed: can this user directly approve backbone index additions?
  const canApproveKode = React.useMemo(() => {
    if (!currentUserRole) return false;
    if (currentUserRole === "SUPER_DEV") return true;
    if (currentUserOverrides && "backbone.approve_kode" in currentUserOverrides)
      return Boolean(currentUserOverrides["backbone.approve_kode"]);
    if (currentRolePerms && "backbone.approve_kode" in currentRolePerms)
      return Boolean(currentRolePerms["backbone.approve_kode"]);
    return ["ADMIN"].includes(currentUserRole);
  }, [currentUserRole, currentUserOverrides, currentRolePerms]);

  // Computed: can this user edit Kaki Backbone per PoP?
  const canEditKakiBackbone = React.useMemo(() => {
    if (!currentUserRole) return false;
    if (["SUPER_DEV", "ADMIN", "NOC"].includes(currentUserRole)) return true;
    if (currentUserOverrides && "backbone.edit_kaki" in currentUserOverrides)
      return Boolean(currentUserOverrides["backbone.edit_kaki"]);
    if (currentRolePerms && "backbone.edit_kaki" in currentRolePerms)
      return Boolean(currentRolePerms["backbone.edit_kaki"]);
    return false;
  }, [currentUserRole, currentUserOverrides, currentRolePerms]);


// ── Data state ──
  const [fetching,            setFetching]            = useState(true);
  const [loading,             setLoading]             = useState(false);
  const [syncing,             setSyncing]             = useState(false);
  const [reports,             setReports]             = useState<any[]>([]);
  const [indexData,           setIndexData]           = useState<any[]>([]);

  // ── UI state ──
  const [view,                setView]                = useState<ViewMode>("table");
  const [search,              setSearch]              = useState("");
  const [statusFilter,        setStatusFilter]        = useState("ALL");
  const [regionalFilter,      setRegionalFilter]      = useState("ALL");

  // ── Pagination (table view) ──
  const TABLE_PAGE_SIZE = 20;
  const [tablePage,           setTablePage]           = useState(1);
  const [draggingTicket,      setDraggingTicket]      = useState<string | null>(null);
  const [dragOverCol,         setDragOverCol]         = useState<string | null>(null);

  // ── Modal state ──
  const [showInputModal,      setShowInputModal]      = useState(false);
  const [showSolveModal,      setShowSolveModal]      = useState(false);
  const [showDetailModal,     setShowDetailModal]     = useState(false);
  const [selectedTicketGroup, setSelectedTicketGroup] = useState<any[]>([]);

  // ── Reason modal (CANCEL / UNSOLVED drag) ──
  const [showReasonModal,     setShowReasonModal]     = useState(false);
  const [reasonTarget,        setReasonTarget]        = useState<"CANCEL"|"UNSOLVED">("CANCEL");
  const [reasonText,          setReasonText]          = useState("");
  const [pendingDropTicketNo, setPendingDropTicketNo] = useState<string|null>(null);

  // ── Timeline input (ON PROGRESS / PENDING update) ──
  const [timelineInput,       setTimelineInput]       = useState("");

  // ── Pending Alert Modal (tiket PENDING > 60 menit tanpa update) ──
  const [showPendingModal,       setShowPendingModal]       = useState(false);
  const [pendingAlertTickets,    setPendingAlertTickets]    = useState<{ ticketNo: string; group: any[]; diffMin: number }[]>([]);
  const [pendingAlertDismissed,  setPendingAlertDismissed]  = useState<Set<string>>(new Set());
  const [pendingAlertSelected,   setPendingAlertSelected]   = useState<Set<string>>(new Set());
  const [pendingAlertReason,     setPendingAlertReason]     = useState("");
  const [pendingAlertCustom,     setPendingAlertCustom]     = useState("");
  const [pendingAlertLoading,    setPendingAlertLoading]    = useState(false);
  const pendingAlertDismissedRef = React.useRef<Set<string>>(new Set());
  useEffect(() => { pendingAlertDismissedRef.current = pendingAlertDismissed; }, [pendingAlertDismissed]);

  // ── Stop Clock SLA ──
  const [stopClocks,             setStopClocks]             = useState<any[]>([]);
  const [showStopClockModal,     setShowStopClockModal]     = useState(false);
  const [stopClockTicketNo,      setStopClockTicketNo]      = useState("");
  const [stopClockReason,        setStopClockReason]        = useState("");
  const [stopClockCustomReason,  setStopClockCustomReason]  = useState("");
  const [stopClockLoading,       setStopClockLoading]       = useState(false);
  const [htmlGenProgress,        setHtmlGenProgress]        = useState<{ done:number; total:number; running:boolean }>({ done:0, total:0, running:false });

  // ── PDF modal ──
  const [showPDFModal,        setShowPDFModal]        = useState(false);
  const [pdfType,             setPdfType]             = useState<"monthly"|"quarterly"|"yearly">("monthly");
  const [pdfMonth,            setPdfMonth]            = useState(() => new Date().toISOString().slice(0, 7));
  const [pdfQuarter,      setPdfQuarter]      = useState("1");
  const [pdfYear,             setPdfYear]             = useState(() => String(new Date().getFullYear()));

  // ── Form state ──
  const [newReport,           setNewReport]           = useState({ ...EMPTY_HEADER });
  const [linkRows,            setLinkRows]            = useState<LinkRow[]>([{ ...EMPTY_LINK }]);
  const [solveFormData,       setSolveFormData]       = useState({ ...EMPTY_SOLVE });
  const [solveAction,         setSolveAction]         = useState<SolveAction>("SOLVED");
  const [linkNearFar, setLinkNearFar] = useState<Record<number, { nearPorts: string[]; farPorts: string[] }>>({});

  // Fetch pending requests dari backbone_pending (via API — bypass RLS)
  const fetchPending = React.useCallback(async () => {
    if (!canApproveKode) return;
    try {
      const res  = await fetch("/api/backbone/pending");
      const data = await res.json();
      setPendingItems(data.items ?? []);
    } catch { /* silent */ }
  }, [canApproveKode]);

  useEffect(() => { fetchData(); fetchIndex(); }, []);
  useEffect(() => { fetchPending(); }, [fetchPending]);

  // ── Fetch current user role + overrides (for permission check) ──
  useEffect(() => {
    async function loadUserPerms() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, permission_overrides")
        .eq("id", user.id)
        .single();
      if (!profile) return;
      setCurrentUserRole(profile.role);
      setCurrentUserOverrides(profile.permission_overrides ?? null);
      if (profile.role && profile.role !== "SUPER_DEV") {
        const { data: roleRow } = await supabase
          .from("roles")
          .select("permissions")
          .eq("name", profile.role)
          .single();
        if (roleRow?.permissions) setCurrentRolePerms(roleRow.permissions);
      }
    }
    loadUserPerms();
  }, []);

  // ── Bell: inactivity watcher (cek tiap 60 detik) ──
  const reportsRef = React.useRef<any[]>([]);
  useEffect(() => { reportsRef.current = reports; }, [reports]);

  const checkInactivity = React.useCallback(() => {
    const now = new Date();
    const alerts: typeof inactiveAlerts = [];
    const grouped: Record<string, any[]> = {};
    reportsRef.current.forEach(r => {
      const k = r["NOMOR TICKET"] || `ID-${r.id}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(r);
    });
    Object.entries(grouped).forEach(([ticketNo, group]) => {
      const status = getTicketStatus(group);
      if (status !== "ON PROGRESS" && status !== "PENDING") return;
      // Find latest timeline entry
      const timelines = group.map(r => r["Problem & Action Timeline"] || "").filter(Boolean);
      const exempt = group.some(r => {
        const s = (r["Problem & Action Timeline"] || "").toLowerCase();
        return s.includes("terjadwal") || s.includes("team full");
      });
      let diffMin = 0;
      if (timelines.length > 0) {
        // Parse last timestamp from timeline
        const last = timelines[timelines.length - 1];
        const tsMatch = last.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/);
        if (tsMatch) {
          const ts = parseDateTime(tsMatch[1]);
          diffMin = Math.floor((now.getTime() - ts.getTime()) / 60000);
        } else {
          diffMin = 60; // no parseable timestamp → assume overdue
        }
      } else {
        const start = parseDateTime(group[0]["Start Time"] || "");
        diffMin = Math.floor((now.getTime() - start.getTime()) / 60000);
      }
      if (diffMin >= 30) alerts.push({ ticketNo, status, diffMin, exempt });
    });
    setInactiveAlerts(alerts);
  }, []);

  useEffect(() => {
    checkInactivity();
    const t = setInterval(checkInactivity, 60_000);
    return () => clearInterval(t);
  }, [checkInactivity]);

  // (fetchStopClocks and checkPendingAlert useEffects are placed after their declarations below)

  // Close bell dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowBell(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  const fetchData = async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from("Report Backbone").select("*").order("id", { ascending: false });
    if (error) toast.error("Gagal memuat data: " + error.message);
    else if (data) setReports(data);
    setFetching(false);
  };

  const fetchIndex = async () => {
    const { data, error } = await supabase.from("Index NOC").select("*");
    if (error) toast.error("Gagal memuat index: " + error.message);
    else if (data) setIndexData(data);
  };

  // ── Stop Clock: fetch semua data ──
  const fetchStopClocks = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("stop_clocks")
      .select("*")
      .order("started_at", { ascending: false });
    if (!error && data) setStopClocks(data);
  }, [supabase]);

  // ── Stop Clock: mulai pause SLA ──
  const startStopClock = async (ticketNo: string, reason: string) => {
    setStopClockLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("stop_clocks").insert({
        ticket_no:   ticketNo,
        reason:      reason,
        started_at:  new Date().toISOString(),
        created_by:  user?.email || null,
      });
      if (error) { toast.error("Gagal mulai Stop Clock: " + error.message); return; }
      // Ubah status tiket ke PENDING
      await supabase.from("Report Backbone")
        .update({ "Status Case": "PENDING" })
        .eq("NOMOR TICKET", ticketNo);
      // Tambahkan ke timeline
      const group = groupedReports[ticketNo];
      if (group) {
        const existing = (group[0]["Problem & Action"] || "").trim();
        const nowTs    = nowDisplayFormat();
        const line     = `> [${nowTs}] ⏸ Stop Clock aktif — ${reason}`;
        await supabase.from("Report Backbone")
          .update({ "Problem & Action": existing ? `${existing}\n${line}` : line })
          .eq("NOMOR TICKET", ticketNo);
      }
      toast.success(`⏸ Stop Clock dimulai untuk ${ticketNo}`);
      setShowStopClockModal(false);
      setStopClockReason("");
      setStopClockCustomReason("");
      await fetchStopClocks();
      await fetchData();
    } finally {
      setStopClockLoading(false);
    }
  };

  // ── Stop Clock: akhiri pause, lanjutkan SLA ──
  const endStopClock = async (stopClockId: number, ticketNo: string) => {
    setStopClockLoading(true);
    try {
      const endedAt = new Date().toISOString();
      const { error } = await supabase.from("stop_clocks")
        .update({ ended_at: endedAt })
        .eq("id", stopClockId);
      if (error) { toast.error("Gagal akhiri Stop Clock: " + error.message); return; }
      // Tambahkan ke timeline
      const group = groupedReports[ticketNo];
      if (group) {
        const existing = (group[0]["Problem & Action"] || "").trim();
        const nowTs    = nowDisplayFormat();
        const sc       = stopClocks.find(c => c.id === stopClockId);
        const pausedMin = sc ? Math.floor((new Date(endedAt).getTime() - new Date(sc.started_at).getTime()) / 60_000) : 0;
        const line     = `> [${nowTs}] ▶ Stop Clock selesai — SLA dilanjutkan (pause: ${pausedMin}m)`;
        await supabase.from("Report Backbone")
          .update({ "Problem & Action": existing ? `${existing}\n${line}` : line })
          .eq("NOMOR TICKET", ticketNo);
      }
      toast.success(`▶ SLA dilanjutkan untuk ${ticketNo}`);
      await fetchStopClocks();
      await fetchData();
    } finally {
      setStopClockLoading(false);
    }
  };

  // ── Hapus satu baris dari timeline (Problem & Action) ──
  const handleDeleteTimelineLine = async (lineIndex: number) => {
    if (!selectedTicketGroup.length) return;
    const ticketNo = selectedTicketGroup[0]["NOMOR TICKET"];
    const existing = (selectedTicketGroup[0]["Problem & Action"] || "").trim();
    const lines    = existing.split("\n").filter(Boolean);
    lines.splice(lineIndex, 1);
    const updated  = lines.join("\n");
    const { error } = await supabase
      .from("Report Backbone")
      .update({ "Problem & Action": updated })
      .eq("NOMOR TICKET", ticketNo);
    if (error) { toast.error("Gagal hapus: " + error.message); return; }
    // Update selectedTicketGroup langsung agar UI re-render tanpa tunggu fetchData
    setSelectedTicketGroup(prev =>
      prev.map((r, i) => i === 0 ? { ...r, "Problem & Action": updated } : r)
    );
    toast.success("Entry timeline dihapus");
    fetchData();
  };

  // ── Pending Alert: cek tiket PENDING > 60 menit ──
  const checkPendingAlert = React.useCallback(() => {
    const now = new Date();
    const alerts: { ticketNo: string; group: any[]; diffMin: number }[] = [];
    const grouped: Record<string, any[]> = {};
    reportsRef.current.forEach(r => {
      const k = r["NOMOR TICKET"] || `ID-${r.id}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(r);
    });
    Object.entries(grouped).forEach(([ticketNo, group]) => {
      const status = getTicketStatus(group);
      if (status !== "PENDING") return;
      if (pendingAlertDismissedRef.current.has(ticketNo)) return;
      // Cari last update dari Problem & Action timeline
      const rawTimeline = (group.find(r => r["Problem & Action"])?.["Problem & Action"] || "").trim();
      let diffMin = 0;
      if (rawTimeline) {
        const lines = rawTimeline.split("\n").filter(Boolean);
        const lastLine = lines[lines.length - 1] || "";
        const tsMatch = lastLine.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/);
        if (tsMatch) {
          diffMin = Math.floor((now.getTime() - parseDateTime(tsMatch[1]).getTime()) / 60_000);
        } else {
          diffMin = Math.floor((now.getTime() - parseDateTime(group[0]["Start Time"] || "").getTime()) / 60_000);
        }
      } else {
        diffMin = Math.floor((now.getTime() - parseDateTime(group[0]["Start Time"] || "").getTime()) / 60_000);
      }
      if (diffMin >= 60) alerts.push({ ticketNo, group, diffMin });
    });
    if (alerts.length > 0) {
      setPendingAlertTickets(alerts);
      setPendingAlertSelected(new Set(alerts.map(a => a.ticketNo)));
      setShowPendingModal(true);
    }
  }, []);

  // ── Pending Alert: submit alasan ──
  const handlePendingAlertSubmit = async () => {
    const reason = pendingAlertReason === "Lainnya" ? pendingAlertCustom.trim() : pendingAlertReason;
    if (!reason) { toast.error("Pilih atau tulis alasan terlebih dahulu."); return; }
    setPendingAlertLoading(true);
    const selected = Array.from(pendingAlertSelected);
    for (const ticketNo of selected) {
      const group = reportsRef.current.filter(r => (r["NOMOR TICKET"] || `ID-${r.id}`) === ticketNo);
      if (!group.length) continue;
      const existing = (group.find(r => r["Problem & Action"])?.["Problem & Action"] || "").trim();
      const nowTs    = nowDisplayFormat();
      const line     = `> [${nowTs}] Pending Update: ${reason}`;
      await supabase.from("Report Backbone")
        .update({ "Problem & Action": existing ? `${existing}\n${line}` : line })
        .eq("NOMOR TICKET", ticketNo);
    }
    // Dismiss semua yang sudah dihandle
    setPendingAlertDismissed(prev => { const s = new Set(prev); selected.forEach(t => s.add(t)); return s; });
    setPendingAlertLoading(false);
    setShowPendingModal(false);
    setPendingAlertReason("");
    setPendingAlertCustom("");
    fetchData();
    toast.success(`Alasan pending dicatat untuk ${selected.length} tiket.`);
  };

  // ── useEffects untuk Stop Clock & Pending Alert (setelah deklarasi fungsi) ──
  useEffect(() => { fetchStopClocks(); }, [fetchStopClocks]);
  useEffect(() => {
    const init = setTimeout(checkPendingAlert, 30_000);
    const t    = setInterval(checkPendingAlert, 5 * 60_000);
    return () => { clearTimeout(init); clearInterval(t); };
  }, [checkPendingAlert]);

  const getOptions = (key: string): string[] =>
    [...new Set(indexData.map((d: any) => d[key]).filter(Boolean))] as string[];

  // ── Backbone lookup maps (kode ↔ nama) ──
  // Supports two storage formats in Supabase:
  //   NEW (preferred): KODE BACKBONE = "00458", NAMA BACKBONE = "TAMBORA <> TANJUNG DUREN UTARA V DIRECT"
  //   OLD (legacy):    KODE BACKBONE = "00457/TAMBORA <> TANJUNG DUREN UTARA V DIRECT", NAMA BACKBONE = null
  const backboneKodeToNama = React.useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    indexData.forEach((d: any) => {
      const kode = d["KODE BACKBONE"];
      if (!kode) return;
      if (d["NAMA BACKBONE"]) {
        // New format: kode is just the number, nama is separate
        m[kode] = d["NAMA BACKBONE"];
      } else {
        // Old/legacy format: extract nama from combined string "00457/TAMBORA <> ..."
        const nama = kode.replace(/^\d+[/\s]*/, "").trim();
        if (nama) m[kode] = nama;
      }
    });
    return m;
  }, [indexData]);

  const backboneNamaToKode = React.useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    indexData.forEach((d: any) => {
      const kode = d["KODE BACKBONE"];
      if (!kode) return;
      if (d["NAMA BACKBONE"]) {
        m[d["NAMA BACKBONE"]] = kode;
      } else {
        const nama = kode.replace(/^\d+[/\s]*/, "").trim();
        if (nama) m[nama] = kode;
      }
    });
    return m;
  }, [indexData]);

  // Options for combobox: semua kode dari Index NOC (tidak ada pending di sini)
  const kodeOptions = React.useMemo(() =>
    indexData
      .filter((d: any) => d["KODE BACKBONE"])
      .map((d: any) => {
        const kode = d["KODE BACKBONE"] as string;
        const nama = d["NAMA BACKBONE"] || kode.replace(/^\d+[/\s]*/, "").trim() || "";
        return { value: kode, label: kode, sub: nama };
      })
      .filter((v, i, arr) => arr.findIndex(x => x.value === v.value) === i)
      .sort((a: any, b: any) => {
        // Sort by numeric prefix (new format first, then old)
        const na = parseInt(a.value.match(/^(\d+)/)?.[1] ?? "0", 10);
        const nb = parseInt(b.value.match(/^(\d+)/)?.[1] ?? "0", 10);
        return na - nb;
      })
  , [indexData]);

  // Options for combobox: nama list (with kode as sub)
  const namaOptions = React.useMemo(() =>
    indexData
      .filter((d: any) => d["NAMA BACKBONE"] || d["KODE BACKBONE"])
      .map((d: any) => {
        const kode = d["KODE BACKBONE"] as string;
        const nama = d["NAMA BACKBONE"] || kode.replace(/^\d+[/\s]*/, "").trim() || "";
        return { value: nama, label: nama, sub: kode };
      })
      .filter((v, i, arr) => v.value && arr.findIndex(x => x.value === v.value) === i)
      .sort((a: any, b: any) => a.value.localeCompare(b.value))
  , [indexData]);

  // ── PoP Kaki Backbone status ──
  // Hitung sisa kaki per PoP: total − jumlah kaki yang sedang down (active incident)
  const popKakiStatus = React.useMemo(() => {
    // Build lookup: numeric prefix → display nama (works for both old and new format)
    const numToNama: Record<string, string> = {};
    indexData.forEach(d => {
      const kode = d["KODE BACKBONE"] || "";
      const num  = extractKodeNum(kode);
      const nama = d["NAMA BACKBONE"] || kode.replace(/^\d+[/\s]*/, "").trim() || kode;
      if (num && nama) numToNama[num] = nama;
    });

    // Semua backbone numeric codes yang sedang ada insiden aktif (OPEN / PENDING)
    // Support both formats: "00001" and "00001/TAMBORA <>"
    const activeNumKodes = new Set(
      reports
        .filter(r => ["OPEN","PENDING"].includes(r["Status Case"] || ""))
        .map(r => extractKodeNum(r["Kode Backbone"] as string || ""))
        .filter(Boolean)
    );

    // Tiket aktif per numeric kode
    const activeTicketsByNum: Record<string, string[]> = {};
    reports
      .filter(r => ["OPEN","PENDING"].includes(r["Status Case"] || ""))
      .forEach(r => {
        const k = extractKodeNum(r["Kode Backbone"] as string || "");
        const t = r["NOMOR TICKET"] as string;
        if (!k || !t) return;
        if (!activeTicketsByNum[k]) activeTicketsByNum[k] = [];
        if (!activeTicketsByNum[k].includes(t)) activeTicketsByNum[k].push(t);
      });

    return indexData
      .filter(d => isPopEntry(d))
      .map(pop => {
        const kode    = pop["KODE BACKBONE"] as string;
        const numKode = extractKodeNum(kode);
        // Display nama: prefer NAMA BACKBONE, fallback to stripping prefix from KODE BACKBONE
        const nama    = pop["NAMA BACKBONE"] as string
                     || kode.replace(/^\d+[/\s]*/, "").trim()
                     || kode;
        // Kaki Backbone: array of 5-digit numeric codes
        const kakiArr: string[] = Array.isArray(pop["Kaki Backbone"]) ? pop["Kaki Backbone"] : [];
        const downKodes  = kakiArr.filter(k => activeNumKodes.has(extractKodeNum(k)));
        const aliveKodes = kakiArr.filter(k => !activeNumKodes.has(extractKodeNum(k)));
        const remaining  = aliveKodes.length;

        // Tiket aktif yang terkait dengan PoP ini
        const relatedTickets = [...new Set(
          downKodes.flatMap(k => activeTicketsByNum[extractKodeNum(k)] || [])
        )];

        return {
          kode: numKode,
          rawKode: kode,
          nama,
          total:     kakiArr.length,
          kakiArr,
          downKodes:  downKodes.map(k => extractKodeNum(k)),
          downNamas:  downKodes.map(k => numToNama[extractKodeNum(k)] || extractKodeNum(k)),
          aliveKodes: aliveKodes.map(k => extractKodeNum(k)),
          aliveNamas: aliveKodes.map(k => numToNama[extractKodeNum(k)] || extractKodeNum(k)),
          remaining,
          activeTickets: relatedTickets,
          shouldAlert: kakiArr.length > 0 && remaining === 1,
          severity: remaining === 0 && kakiArr.length > 0 ? "blackout"
                  : remaining === 1 ? "critical"
                  : remaining === 2 ? "warning"
                  : "ok",
        };
      });
  }, [indexData, reports]);

  // ── Effect: kirim notifikasi Telegram ketika sisa 1 kaki ──
  useEffect(() => {
    popKakiStatus.forEach(pop => {
      if (!pop.shouldAlert) return;
      // Key unik: popKode + jumlah down (supaya alert ulang kalau situasi berubah & kembali jadi 1)
      const alertKey = `${pop.kode}_down${pop.downKodes.length}`;
      if (kakiAlertSentRef.current.has(alertKey)) return;
      kakiAlertSentRef.current.add(alertKey);

      // Kirim API non-blocking
      fetch("/api/backbone/notif-sisa-kaki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popKode:       pop.kode,
          popNama:       pop.nama,
          total:         pop.total,
          downKodes:     pop.downKodes,
          downNamas:     pop.downNamas,
          remainingKode: pop.aliveKodes[0] || "",
          remainingNama: pop.aliveNamas[0] || "",
          activeTickets: pop.activeTickets,
        }),
      }).catch(err => console.warn("[notif-sisa-kaki]", err));
    });
  }, [popKakiStatus]);

  // ── Stale Ticket Alert: kirim ke Telegram Bot 1 pakai data inactiveAlerts ──
  // inactiveAlerts sudah berisi tiket OPEN/ON PROGRESS/PENDING dengan diffMin >= 30
  // kita filter yang >= 60 menit (1 jam) untuk dikirim ke Telegram
  const runStaleCheck = React.useCallback(async (force = false) => {
    const staleOnes = inactiveAlerts.filter(a => a.diffMin >= 60 && !a.exempt);
    if (staleOnes.length === 0) return;

    // Jangan spam: kirim maks 1x per jam (kecuali force = true dari tombol manual)
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    if (!force && now - staleLastSentRef.current < HOUR_MS) return;

    try {
      setStaleSending(true);

      // Ambil data subjek dari groupedReportsRef (ref — tidak masuk deps, hindari TDZ)
      const tickets = staleOnes.map(a => {
        const group = groupedReportsRef.current[a.ticketNo];
        const first = group?.[0];
        return {
          ticketNo: a.ticketNo,
          subject:  first?.["Subject Ticket / Email"] || "—",
          status:   a.status,
          diffMin:  a.diffMin,
        };
      });

      const res  = await fetch("/api/backbone/stale-alert", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tickets }),
      });
      const data = await res.json();

      if (data.sent) {
        staleLastSentRef.current = now;
        setStaleSentAt(new Date());
      }

      // Selalu tampilkan popup kalau ada stale tickets
      setShowStalePopup(true);
    } catch (err) {
      console.warn("[stale-alert]", err);
    } finally {
      setStaleSending(false);
    }
  // groupedReports sengaja tidak masuk deps — diakses via groupedReportsRef.current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inactiveAlerts]);

  // Jalankan setiap kali inactiveAlerts berubah — effect ini sudah jalan tiap menit
  // karena checkInactivity dipanggil tiap 60 detik
  useEffect(() => {
    const staleOnes = inactiveAlerts.filter(a => a.diffMin >= 60 && !a.exempt);
    if (staleOnes.length > 0) {
      // Auto-tampilkan popup
      setShowStalePopup(true);
      // Auto-kirim ke Telegram (throttled: maks 1x/jam)
      runStaleCheck(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inactiveAlerts]);

  // ── Link helpers ──
  const addLink    = () => setLinkRows(p => [...p, { ...EMPTY_LINK }]);
  const removeLink = (i: number) => setLinkRows(p => p.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: keyof LinkRow, val: string) =>
    setLinkRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  // Helper: apakah backbone ini adalah MON-CORE?
  // Supports both direct string "MON-CORE" and numeric code whose nama is "MON-CORE"
  const isMonCore = (kode: string) =>
    kode === "MON-CORE" || (backboneKodeToNama[kode] || "").toUpperCase() === "MON-CORE";

  // When kode selected → auto-fill nama, and vice versa
  const updateLinkKode = (i: number, kode: string) => {
    // MON-CORE → kosongkan namaLink agar user bisa isi label Near End <> Far End sendiri
    const nama = isMonCore(kode) ? "" : (backboneKodeToNama[kode] || "");
    setLinkRows(p => p.map((r, idx) => idx === i ? { ...r, kodeBackbone: kode, namaLink: nama } : r));
  };
  const updateLinkNama = (i: number, nama: string) => {
    const kode = backboneNamaToKode[nama] || "";
    setLinkRows(p => p.map((r, idx) => idx === i ? { ...r, namaLink: nama, kodeBackbone: kode } : r));
  };

  // ── Create ──
  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLinks = linkRows.filter(l => l.kodeBackbone.trim());
    if (!validLinks.length) { toast.error("Pilih Kode Backbone terlebih dahulu!"); return; }
    setLoading(true);
    const base = {
      "Hari dan Tanggal Report": toIndonesianDate(newReport["Hari dan Tanggal Report"]),
      "Open Ticket":             newReport["Open Ticket"],
      "NOMOR TICKET":            newReport["NOMOR TICKET"],
      "Subject Ticket / Email":  newReport["Subject Ticket / Email"],
      "Jenis Problem":           newReport["Jenis Problem"],
      "Status Case":             newReport["Status Case"] || "OPEN",
      "Start Time":              newReport["Start Time"].trim(), // already DD/MM/YYYY HH:MM:SS
      "Priority":                newReport["Priority"],
    };
    const { error } = await supabase.from("Report Backbone").insert(
      validLinks.map(l => ({
        ...base,
        "Nama Link":    l.namaLink.trim(),
        "Kode Backbone": l.kodeBackbone.trim(),
        "Kapasitas":    l.capacity.trim() || null,
      }))
    );
    if (error) toast.error("Gagal menyimpan: " + error.message);
    else {
      toast.success(validLinks.length > 1
        ? `${validLinks.length} backbone berhasil dicatat dalam 1 tiket!`
        : `Incident dicatat: ${validLinks[0].kodeBackbone}`);
      setShowInputModal(false);
      setNewReport({ ...EMPTY_HEADER });
      setLinkRows([{ ...EMPTY_LINK }]);
      setOdooResult(null);
      setOdooSubject("");
      setOdooDescription("");
      fetchData();
    }
    setLoading(false);
  };

  // ── Open solve modal ──
  const openSolveModal = (group: any[]) => {
    setSelectedTicketGroup(group);
    const init: Record<number, { nearPorts: string[]; farPorts: string[] }> = {};
    group.forEach((r: any) => {
      const n = calcPortCount(r["Kapasitas"] || "");
      init[r.id] = {
        nearPorts: Array.from({ length: n }, (_, k) => k === 0 ? (r["Near End"] || "") : ""),
        farPorts:  Array.from({ length: n }, (_, k) => k === 0 ? (r["Far End"]  || "") : ""),
      };
    });
    setLinkNearFar(init);
    // Pre-fill End Time & Tanggal Closed dengan waktu sekarang (bisa diubah)
    const nowFmt = nowDisplayFormat(); // DD/MM/YYYY HH:MM:SS
    setSolveFormData({
      ...EMPTY_SOLVE,
      "Hari dan Tanggal Closed": nowFmt,
      "End Time":                nowFmt,
    });
    setShowSolveModal(true);
  };


  // ── Sync status tiket ke Odoo ──
  const syncOdooStatus = async (
    ticketNumber: string,
    status: string,
    logNote?: string,
    openedBy?: string,
  ) => {
    try {
      const res  = await fetch("/api/odoo-status", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ticketNumber, status, logNote, openedBy }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.needsApiKey) {
          toast.error("⚠️ Odoo API Key belum dikonfigurasi", {
            description: "Buka Profil → Integrasi Odoo untuk input API Key kamu.",
            duration: 7000,
            action: { label: "Buka Profil", onClick: () => window.open("/profile", "_blank") },
          });
        } else {
          console.warn("Odoo sync failed:", data?.error);
        }
      }
    } catch (e) {
      console.warn("Odoo sync failed:", e);
    }
  };

  // ── Sync stage DARI Odoo → update Supabase jika ada perubahan ──
  // Membaca stage tiket aktif dari Odoo lalu update Status Case jika berbeda
  const syncFromOdoo = async () => {
    setSyncingOdoo(true);
    try {
      const activeTickets = Object.entries(groupedReports)
        .filter(([ticketNo, group]) =>
          ticketNo?.startsWith("HT") &&
          !["SOLVED","UNSOLVED","CANCEL"].includes(getTicketStatus(group as any[]))
        )
        .map(([ticketNo]) => ticketNo);

      if (activeTickets.length === 0) {
        toast("Tidak ada tiket aktif dengan nomor HT untuk disinkronkan.");
        return;
      }

      // ── Parallel fetch semua tiket sekaligus (lebih cepat) ──
      const results = await Promise.all(
        activeTickets.map(async ticketNo => {
          try {
            const res  = await fetch(`/api/odoo-status?ticketNumber=${encodeURIComponent(ticketNo)}`);
            const data = await res.json();
            return { ticketNo, data };
          } catch {
            return { ticketNo, data: { success: false } };
          }
        })
      );

      // ── Update ke Supabase hanya yang berbeda ──
      let updated = 0, unchanged = 0;
      await Promise.all(
        results.map(async ({ ticketNo, data }) => {
          if (!data.success) return;
          const odooStatus    = data.status as string;
          const currentStatus = getTicketStatus(groupedReports[ticketNo] as any[]);
          if (odooStatus !== currentStatus) {
            const { error } = await supabase
              .from("Report Backbone")
              .update({ "Status Case": odooStatus })
              .eq("NOMOR TICKET", ticketNo);
            if (!error) updated++;
          } else {
            unchanged++;
          }
        })
      );

      setLastSyncTime(new Date());
      if (updated > 0) {
        toast.success(`Sync Odoo: ${updated} tiket diperbarui, ${unchanged} sama.`);
        fetchData();
      } else {
        toast(`Sync Odoo: semua ${activeTickets.length} tiket sudah sesuai.`);
      }
    } catch (err: any) {
      toast.error("Sync Odoo gagal: " + err.message);
    } finally {
      setSyncingOdoo(false);
    }
  };

  const closeSolveModal = () => {
    setShowSolveModal(false);
    setSolveFormData({ ...EMPTY_SOLVE });
    setSolveAction("SOLVED");
    setLinkNearFar({});
    setTimelineInput("");
  };

  // ── Drag & drop ──
  const handleDrop = async (targetStatus: string) => {
    const ticketNo = draggingTicket;
    setDraggingTicket(null);
    setDragOverCol(null);
    if (!ticketNo) return;

    const group = groupedReports[ticketNo];
    if (!group) return;

    const currentStatus = getTicketStatus(group);
    if (currentStatus === targetStatus) return;

    // SOLVED → buka form detail
    if (targetStatus === "SOLVED") {
      openSolveModal(group);
      return;
    }

    // CANCEL / UNSOLVED → popup isi alasan
    if (targetStatus === "CANCEL" || targetStatus === "UNSOLVED") {
      setPendingDropTicketNo(ticketNo);
      setReasonTarget(targetStatus as "CANCEL" | "UNSOLVED");
      setReasonText("");
      setShowReasonModal(true);
      return;
    }

    // Langsung update status lainnya
    setLoading(true);
    const { error } = await supabase
      .from("Report Backbone")
      .update({ "Status Case": targetStatus })
      .eq("NOMOR TICKET", ticketNo);

    if (error) toast.error("Gagal update: " + error.message);
    else {
      const ac = STATUS_COLOR[targetStatus] || C.accent;
      toast.success(`${ticketNo} dipindahkan ke ${targetStatus}`, {
        style: { borderLeft: `3px solid ${ac}` },
      });
      // Sync ke Odoo (background — tidak blocking UI)
      syncOdooStatus(ticketNo, targetStatus, undefined, group[0]["Open Ticket"]);
      fetchData();
    }
    setLoading(false);
  };

  // ── Reason submit (CANCEL / UNSOLVED) ──
  const handleReasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDropTicketNo || !reasonText.trim()) return;
    setLoading(true);
    const { error } = await supabase
      .from("Report Backbone")
      .update({ "Status Case": reasonTarget, "Problem & Action": reasonText.trim() })
      .eq("NOMOR TICKET", pendingDropTicketNo);
    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      const ac = STATUS_COLOR[reasonTarget];
      toast.success(`${pendingDropTicketNo} → ${reasonTarget}`, { style: { borderLeft: `3px solid ${ac}` } });
      // Sync ke Odoo dengan log note alasan
      const openedBy = groupedReports[pendingDropTicketNo!]?.[0]["Open Ticket"];
      const logNote  = `${reasonTarget === "CANCEL" ? "Alasan Cancel" : "Alasan Unsolved"}:\n${reasonText.trim()}`;
      syncOdooStatus(pendingDropTicketNo!, reasonTarget, logNote, openedBy);
      setShowReasonModal(false);
      setPendingDropTicketNo(null);
      setReasonText("");
      fetchData();
    }
    setLoading(false);
  };

  // ── Update (SOLVED / status change from modal) ──
  const handleSolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketGroup.length) return;
    setLoading(true);
    const ticketNo = selectedTicketGroup[0]["NOMOR TICKET"];

    if (solveAction === "SOLVED") {
      const endFormatted = solveFormData["End Time"].trim(); // already DD/MM/YYYY HH:MM:SS
      const startTime    = selectedTicketGroup[0]["Start Time"];

      // ── Hitung MTTR efektif (dikurangi stop clock) ──────────────
      const endDate        = startTime ? parseDateTime(endFormatted) : null;
      const mttrRaw        = startTime ? calcMTTRMinutes(startTime, endFormatted) : null;
      const ticketSCs      = stopClocks.filter(c => c.ticket_no === ticketNo);
      const totalPausedMin = ticketSCs.length > 0 && endDate
        ? calcTotalPausedMinutes(ticketSCs, endDate)
        : 0;
      // MTTR efektif = MTTR kotor - total pause stop clock (min 0)
      const mttr = mttrRaw != null ? Math.max(0, mttrRaw - totalPausedMin) : null;
      const sla  = mttr != null ? calcSLAFromMinutes(mttr) : null;

      // Log ke console untuk audit (bisa dihapus nanti)
      if (totalPausedMin > 0) {
        console.info(
          `[StopClock] ${ticketNo}: MTTR raw=${mttrRaw}m | pause=${totalPausedMin}m | efektif=${mttr}m | SLA=${sla?.isOK ? "OK" : "NOK"}`
        );
      }

      const shared = {
        "Status Case":                  "SOLVED",
        "Closed Ticket":                solveFormData["Closed Ticket"],
        "Problem":                      solveFormData["Problem"],
        "Problem & Action":             solveFormData["Problem & Action"],
        "Titik Kordinat Cut / Bending": solveFormData["Titik Kordinat Cut / Bending"],
        "Alamat Problem":               solveFormData["Alamat Problem"],
        "Regional":                     solveFormData["Regional"],
        "Hari dan Tanggal Closed":      solveFormData["Hari dan Tanggal Closed"].trim(),
        "End Time":                     endFormatted,
        "MTTR":                         mttr,           // ← efektif (sudah dikurangi pause)
        "SLA":                          sla ? (sla.isOK ? "OK" : "NOK") : "",
      };
      // ── Compute formatted Near/Far End dari array port ──
      const nearFarComputed: Record<number, { nearEnd: string; farEnd: string }> = {};
      for (const row of selectedTicketGroup) {
        nearFarComputed[row.id] = {
          nearEnd: (linkNearFar[row.id]?.nearPorts || []).map(p => parseDevicePower(p.trim())).filter(Boolean).join("\n"),
          farEnd:  (linkNearFar[row.id]?.farPorts  || []).map(p => parseDevicePower(p.trim())).filter(Boolean).join("\n"),
        };
      }

      let hasError = false;
      for (const row of selectedTicketGroup) {
        const { error } = await supabase.from("Report Backbone").update({
          ...shared,
          "Near End": nearFarComputed[row.id]?.nearEnd || "",
          "Far End":  nearFarComputed[row.id]?.farEnd  || "",
        }).eq("id", row.id);
        if (error) { hasError = true; toast.error(`Gagal update ${row["Nama Link"]}: ${error.message}`); }
      }
      if (!hasError) {
        // Build summary → sync Odoo → buka WA modal
        const summary = buildSolvedSummary(selectedTicketGroup, solveFormData, nearFarComputed);
        syncOdooStatus(ticketNo, "SOLVED", summary, selectedTicketGroup[0]["Open Ticket"]);
        setSummaryText(summary);
        toast.success(`${selectedTicketGroup.length} backbone berhasil di-SOLVED!`);
        closeSolveModal();
        fetchData();
        setShowWAModal(true);
      }
    } else {
      let payload: Record<string, any> = { "Status Case": solveAction };
      if (solveAction === "CANCEL")   payload["Problem & Action"] = solveFormData["Cancel Reason"];
      if (solveAction === "UNSOLVED") payload["Problem & Action"] = solveFormData["Cancel Reason"];
      if ((solveAction === "ON PROGRESS" || solveAction === "PENDING") && timelineInput.trim()) {
        // ── Append ke timeline yang sudah ada, bukan overwrite ──
        const existing  = (selectedTicketGroup[0]["Problem & Action"] || "").trim();
        const cleanInput = timelineInput.trim().replace(/^[>\s]+/, ""); // strip leading > agar tidak double
        const newLine   = `> ${cleanInput}`;
        payload["Problem & Action"] = existing ? `${existing}\n${newLine}` : newLine;
      }
      const { error } = await supabase.from("Report Backbone").update(payload).eq("NOMOR TICKET", ticketNo);
      if (error) toast.error("Gagal update: " + error.message);
      else {
        // Sync Odoo dengan log note sesuai action
        const openedBy = selectedTicketGroup[0]["Open Ticket"];
        if (solveAction === "CANCEL" || solveAction === "UNSOLVED") {
          const logNote = `${solveAction === "CANCEL" ? "Alasan Cancel" : "Alasan Unsolved"}:\n${solveFormData["Cancel Reason"]}`;
          syncOdooStatus(ticketNo, solveAction, logNote, openedBy);
        } else {
          syncOdooStatus(ticketNo, solveAction, timelineInput.trim() || undefined, openedBy);
        }
        toast.success(`Status diubah ke ${solveAction}!`);
        closeSolveModal();
        fetchData();
      }
    }
    setLoading(false);
  };

  // ── Sync to Google Sheets ──
  const syncToSheets = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-sheets", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(reports),
      });
      const result = await res.json();
      if (result.success) {
        const added   = result.added   ?? 0;
        const updated = result.updated ?? 0;
        if (added > 0 || updated > 0) {
          toast.success(`Sync selesai! +${added} baru, ${updated} diperbarui.`);
        } else {
          toast.success("Sync selesai — semua data sudah up-to-date.");
        }
      } else {
        toast.error("Sync gagal: " + (result.error || "Unknown error"));
      }
    } catch (err: any) {
      toast.error("Sync gagal: " + err.message);
    }
    setSyncing(false);
  };

  // ── Generate WA Report ──
  const generateWAReport = (): string => {
    const todayStr = formatHariTanggal(new Date());
    const activeTickets = Object.entries(groupedReports).filter(([, g]) => isActive(g));

    let txt = `*REPORT BACKBONE PROBLEM | ${todayStr}*\n`;

    activeTickets.forEach(([ticketNo, group], idx) => {
      const f        = group[0];
      const status   = getTicketStatus(group);
      const subject  = (f["Subject Ticket / Email"] || "").trim();
      const problem  = f["Problem"] || f["Jenis Problem"] || "—";
      // Ambil timeline dari row yang punya Problem & Action (biasanya row pertama)
      const timeline = (group.find((r: any) => r["Problem & Action"])?.["Problem & Action"] || "").trim();

      // Impact: Nama Link jika ada, fallback ke Kode Backbone; sertakan kapasitas jika ada
      const links = [...new Set(
        group.map((r: any) => {
          const label = (r["Nama Link"] || r["Kode Backbone"] || "").trim();
          const cap   = (r["Kapasitas"] || "").trim();
          return cap ? `${label} (${cap})` : label;
        }).filter(Boolean)
      )];

      txt += `\n===================================\n`;
      txt += `${idx + 1}. ${ticketNo} - ${subject}\n\n`;
      txt += `Problem\t\t: ${problem}\n`;
      txt += `Impact\t\t:\n`;
      links.forEach(l => { txt += `- ${l}\n`; });
      txt += `Status\t\t: ${status}\n`;

      if (timeline) {
        txt += `\n`;
        // Pastikan setiap baris punya prefix ">"
        timeline.split("\n").forEach(line => {
          const l = line.trim();
          if (l) txt += `${l.startsWith(">") ? l : `> ${l}`}\n`;
        });
      }
    });

    if (activeTickets.length === 0) {
      txt += `\n===================================\n`;
      txt += `✅ Tidak ada incident aktif saat ini.\n`;
    }

    return txt;
  };

  // ── Generate PDF Report ──
  const generatePDFReport = () => {
    const selYear = parseInt(pdfYear);
    const selQ    = pdfQuarter ? parseInt(pdfQuarter) : 0;

    const filtered = reports.filter(r => {
      const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
      if (!p) return false;
      if (pdfType === "monthly")    return p.monthStr === pdfMonth;
      if (pdfType === "quarterly")  return p.year === selYear && (selQ === 0 || Math.ceil(p.month / 3) === selQ);
      return p.year === selYear;
    });

    // Group by ticket
    const grp: Record<string, any[]> = {};
    filtered.forEach(r => {
      const k = r["NOMOR TICKET"] || `ID-${r.id}`;
      if (!grp[k]) grp[k] = [];
      grp[k].push(r);
    });
    const tickets = Object.values(grp);
    const total   = tickets.length;

    if (total === 0) { toast.error("Tidak ada data untuk periode yang dipilih!"); return; }

    // ── Aggregations (SLA & MTTR dikalkulasi live dari Start/End Time) ──
    const byStatus:   Record<string,number> = {};
    const byRegional: Record<string,number> = {};
    const byJenis:    Record<string,number> = {};
    const byPriority: Record<string,number> = {};
    const byKode:     Record<string,number> = {};
    const byProblem:  Record<string,number> = {};
    let slaOK = 0, slaNOK = 0, mttrSum = 0, mttrCount = 0;
    let nokOverSum = 0, nokOverCount = 0;

    tickets.forEach(g => {
      const f  = g[0];
      const st = getTicketStatus(g);
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (f["Regional"])     byRegional[f["Regional"]]     = (byRegional[f["Regional"]]     || 0) + 1;
      if (f["Jenis Problem"]) byJenis[f["Jenis Problem"]]  = (byJenis[f["Jenis Problem"]]   || 0) + 1;
      if (f["Priority"])     byPriority[f["Priority"]]     = (byPriority[f["Priority"]]     || 0) + 1;
      if (f["Problem"]) {
        const prob = String(f["Problem"]).trim();
        if (prob) byProblem[prob] = (byProblem[prob] || 0) + 1;
      }

      // Kode backbone per row
      g.forEach((r: any) => {
        if (r["Kode Backbone"]) byKode[r["Kode Backbone"]] = (byKode[r["Kode Backbone"]] || 0) + 1;
      });

      // Live SLA & MTTR per tiket
      const startT = f["Start Time"];
      const endT   = f["End Time"];
      if (startT && endT) {
        const slaRes  = calcSLA(startT, endT);
        const mttrMin = calcMTTRMinutes(startT, endT);
        if (slaRes.isOK) slaOK++; else slaNOK++;
        if (mttrMin > 0) {
          mttrSum += mttrMin; mttrCount++;
          if (!slaRes.isOK) { nokOverSum += (mttrMin - 420); nokOverCount++; }
        }
      } else {
        // Fallback ke nilai DB jika belum ada End Time
        if (f["SLA"] === "OK") slaOK++;
        else if (f["SLA"] === "NOK") slaNOK++;
        const dbMttr = Number(f["MTTR"]);
        if (f["MTTR"] != null && !isNaN(dbMttr) && dbMttr > 0) {
          mttrSum += dbMttr; mttrCount++;
          if (f["SLA"] === "NOK") { nokOverSum += Math.max(0, dbMttr - 420); nokOverCount++; }
        }
      }
    });

    const solved      = byStatus["SOLVED"] || 0;   // Terselesaikan = SOLVED saja
    const avgMTTR     = mttrCount    > 0 ? Math.round(mttrSum    / mttrCount)    : null;
    const totalOverSLA = nokOverCount > 0 ? nokOverSum                           : null;
    const avgOverSLA  = nokOverCount > 0 ? Math.round(nokOverSum / nokOverCount) : null;
    const slaTotal = slaOK + slaNOK;
    const slaRate  = slaTotal > 0 ? Math.round((slaOK / slaTotal) * 100) : null;

    // ── Period label ──
    const periodLabel = pdfType === "monthly"
      ? `${BULAN_ID[parseInt(pdfMonth.split("-")[1]) - 1]} ${pdfMonth.split("-")[0]}`
      : pdfType === "quarterly"
      ? (() => {
          const q  = selQ || 1;
          const s  = (q - 1) * 3;        // start month index (0-based)
          const e  = s + 2;              // end month index
          return `Q${q} ${selYear}: ${BULAN_ID[s]} – ${BULAN_ID[e]} ${selYear}`;
        })()
      : `Tahun ${selYear}`;

    // ── Monthly breakdown (yearly only) — pakai extractDateParts ──
    const monthlyData: { month: string; count: number; solved: number }[] = [];
    if (pdfType === "yearly") {
      for (let m = 1; m <= 12; m++) {
        const mGrp: Record<string,any[]> = {};
        reports.forEach(r => {
          const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
          if (!p || p.year !== selYear || p.month !== m) return;
          const k = r["NOMOR TICKET"] || `ID-${r.id}`;
          if (!mGrp[k]) mGrp[k] = [];
          mGrp[k].push(r);
        });
        const mTickets = Object.values(mGrp);
        monthlyData.push({
          month:  BULAN_ID[m - 1].slice(0, 3),   // "Jan", "Feb", ...
          count:  mTickets.length,
          solved: mTickets.filter(g => getTicketStatus(g) === "SOLVED").length,
        });
      }
    }

    const html = buildPDFHTML({ periodLabel, pdfType, total, solved, byStatus, byRegional, byJenis, byPriority, byKode, byProblem, slaOK, slaNOK, slaRate, avgMTTR, totalOverSLA, avgOverSLA, tickets, monthlyData });

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up diblokir! Ijinkan pop-up untuk generate PDF."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.print(); } catch {} }, 800);
    setShowPDFModal(false);
  };

  // ── Generate Interactive Summary HTML ──
  const generateInteractiveSummary = async () => {
    const selYear = parseInt(pdfYear);
    const selQ    = pdfQuarter ? parseInt(pdfQuarter) : 0;

    const filtered = reports.filter(r => {
      const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
      if (!p) return false;
      if (pdfType === "monthly")   return p.monthStr === pdfMonth;
      if (pdfType === "quarterly") return p.year === selYear && (selQ === 0 || Math.ceil(p.month / 3) === selQ);
      return p.year === selYear;
    });

    const grp: Record<string, any[]> = {};
    filtered.forEach(r => {
      const k = r["NOMOR TICKET"] || `ID-${r.id}`;
      if (!grp[k]) grp[k] = [];
      grp[k].push(r);
    });
    const tickets = Object.values(grp);
    if (tickets.length === 0) { toast.error("Tidak ada data untuk periode yang dipilih!"); return; }

    // Aggregasi sama seperti generatePDFReport
    const byStatus: Record<string,number>   = {};
    const byRegional: Record<string,number> = {};
    const byKode: Record<string,number>     = {};
    const byProblem: Record<string,number>  = {};
    const byJenis: Record<string,number>    = {};
    const byPriority: Record<string,number> = {};
    let slaOK = 0, slaNOK = 0, mttrSum = 0, mttrCount = 0;
    let nokOverSum = 0, nokOverCount = 0;
    let solved = 0;

    tickets.forEach(g => {
      const f  = g[0];
      const st = (() => {
        if (g.every((r: any) => normalizeStatus(r["Status Case"]) === "SOLVED")) return "SOLVED";
        if (g.every((r: any) => normalizeStatus(r["Status Case"]) === "CANCEL")) return "CANCEL";
        const a = g.find((r: any) => !["SOLVED","CANCEL"].includes(normalizeStatus(r["Status Case"])));
        return a ? normalizeStatus(a["Status Case"]) : "OPEN";
      })();
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (st === "SOLVED") solved++;
      if (f["Regional"]) byRegional[f["Regional"]] = (byRegional[f["Regional"]] || 0) + 1;
      if (f["Jenis Problem"]) byJenis[f["Jenis Problem"]] = (byJenis[f["Jenis Problem"]] || 0) + 1;
      if (f["Priority"]) byPriority[f["Priority"]] = (byPriority[f["Priority"]] || 0) + 1;
      if (f["Problem"]) byProblem[f["Problem"]] = (byProblem[f["Problem"]] || 0) + 1;
      g.forEach((r: any) => {
        if (r["Kode Backbone"]) byKode[r["Kode Backbone"]] = (byKode[r["Kode Backbone"]] || 0) + 1;
      });
      if (f["Start Time"] && f["End Time"]) {
        const s = calcSLA(f["Start Time"], f["End Time"]);
        const m = calcMTTRMinutes(f["Start Time"], f["End Time"]);
        if (s.isOK) slaOK++; else slaNOK++;
        if (m > 0) {
          mttrSum += m; mttrCount++;
          if (!s.isOK) { nokOverSum += (m - 420); nokOverCount++; }
        }
      } else {
        if (f["SLA"] === "OK") slaOK++; else if (f["SLA"] === "NOK") slaNOK++;
        const dbMttr = Number(f["MTTR"]);
        if (f["MTTR"] != null && !isNaN(dbMttr) && dbMttr > 0) {
          mttrSum += dbMttr; mttrCount++;
          if (f["SLA"] === "NOK") { nokOverSum += Math.max(0, dbMttr - 420); nokOverCount++; }
        }
      }
    });

    const slaTotal    = slaOK + slaNOK;
    const slaRate     = slaTotal     > 0 ? Math.round((slaOK / slaTotal) * 100) : null;
    const avgMTTR     = mttrCount    > 0 ? Math.round(mttrSum    / mttrCount)    : null;
    const totalOverSLA = nokOverCount > 0 ? nokOverSum                           : null;
    const avgOverSLA  = nokOverCount > 0 ? Math.round(nokOverSum / nokOverCount) : null;
    const periodLabel = pdfType === "monthly"
      ? `${BULAN_ID[parseInt(pdfMonth.split("-")[1]) - 1]} ${pdfMonth.split("-")[0]}`
      : pdfType === "quarterly"
      ? `Q${selQ} ${selYear}: ${BULAN_ID[(selQ-1)*3]} – ${BULAN_ID[(selQ-1)*3+2]} ${selYear}`
      : `Tahun ${selYear}`;

    // Monthly breakdown (yearly only)
    const monthlyData: { month: string; count: number; solved: number }[] = [];
    if (pdfType === "yearly") {
      for (let m = 1; m <= 12; m++) {
        const mGrp: Record<string,any[]> = {};
        reports.forEach(r => {
          const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
          if (!p || p.year !== selYear || p.month !== m) return;
          const k = r["NOMOR TICKET"] || `ID-${r.id}`;
          if (!mGrp[k]) mGrp[k] = [];
          mGrp[k].push(r);
        });
        const mTickets = Object.values(mGrp);
        monthlyData.push({
          month:  BULAN_ID[m - 1].slice(0, 3),
          count:  mTickets.length,
          solved: mTickets.filter(g => getTicketStatus(g) === "SOLVED").length,
        });
      }
    }

    // ── Geocoding: baca cache → geocode yang belum ada → embed ke HTML ──
    const CACHE_KEY = "noc_geocode_v1";
    const STRIP_PC  = (s: string) =>
      s.replace(/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}\s*/i, "")
       .replace(/\s{2,}/g, " ").trim();

    // ① Prioritas tertinggi: window.__nocGeocodeCache (in-memory dari BackboneHeatmap, always fresh)
    // ② Fallback: sessionStorage → localStorage (untuk sesi/tab berbeda)
    let geocodeCache: Record<string, [number, number] | null> = {};
    try {
      const rawLocal = localStorage.getItem(CACHE_KEY);
      if (rawLocal) geocodeCache = JSON.parse(rawLocal);
    } catch {}
    try {
      const rawSession = sessionStorage.getItem(CACHE_KEY);
      if (rawSession) {
        Object.assign(geocodeCache, JSON.parse(rawSession));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache)); } catch {}
      }
    } catch {}
    // ① window.__nocGeocodeCache — paling fresh, langsung dari React state BackboneHeatmap
    try {
      const winCache = (window as any).__nocGeocodeCache;
      if (winCache && typeof winCache === "object") {
        Object.assign(geocodeCache, winCache);
        // Sync ke storage supaya sesi berikutnya juga dapat manfaatnya
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache)); } catch {}
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache)); } catch {}
      }
    } catch {}

    // Kumpulkan alamat unik yang belum ada di cache
    const uniqueAlamats: { raw: string; key: string }[] = [];
    const seen = new Set<string>();
    tickets.forEach(g => {
      const a = (g[0]["Alamat Problem"] || "").trim();
      if (!a) return;
      const key = STRIP_PC(a).toLowerCase();
      if (!key || seen.has(key) || key in geocodeCache) return;
      seen.add(key);
      uniqueAlamats.push({ raw: a, key });
    });

    if (uniqueAlamats.length > 0) {
      setHtmlGenProgress({ done: 0, total: uniqueAlamats.length, running: true });
      toast(`🗺 Geocoding ${uniqueAlamats.length} lokasi baru...`);
      for (let i = 0; i < uniqueAlamats.length; i++) {
        const { raw: rawAddr, key } = uniqueAlamats[i];
        try {
          const res  = await fetch(`/api/geocode?q=${encodeURIComponent(key + ", Indonesia")}`);
          const data = await res.json();
          geocodeCache[key] = data.lat && data.lon ? [data.lat, data.lon] : null;
        } catch {
          geocodeCache[key] = null;
        }
        // Simpan progress ke localStorage (BackboneHeatmap juga bisa pakai)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache)); } catch {}
        setHtmlGenProgress({ done: i + 1, total: uniqueAlamats.length, running: true });
        if (i < uniqueAlamats.length - 1) await new Promise(r => setTimeout(r, 1200));
      }
      setHtmlGenProgress({ done: uniqueAlamats.length, total: uniqueAlamats.length, running: false });
    }

    // Filter hanya yang berhasil (non-null)
    const geocodeCacheClean: Record<string, [number, number]> = {};
    Object.entries(geocodeCache).forEach(([k, v]) => { if (v) geocodeCacheClean[k] = v; });

    const totalLocs = Object.keys(geocodeCacheClean).length;
    if (totalLocs > 0) toast.success(`✅ Geocache: ${totalLocs} lokasi tersedia dari heatmap`);

    const generatedAt = new Date().toLocaleString("id-ID");
    const html = buildInteractiveSummaryHTML({
      periodLabel, pdfType, total: tickets.length, solved, slaOK, slaNOK, slaRate, avgMTTR, totalOverSLA, avgOverSLA,
      byStatus, byRegional, byKode, byProblem, byJenis, byPriority, monthlyData, tickets,
      generatedAt, geocodeCache: geocodeCacheClean,
    });

    // Download sebagai .html file (standalone, shareable)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Summary-Backbone-NOC-${periodLabel.replace(/\s+/g, "-")}.html`;
    a.click();
    // Buka di tab baru via blob URL (lebih reliable dari document.write)
    const previewWin = window.open(url, "_blank");
    if (!previewWin) toast("File sudah di-download. Buka manual dari folder Downloads.");
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    setShowPDFModal(false);
    toast.success(`Interactive Summary berhasil di-generate dan di-download!`);
  };

  const previewMTTR = (() => {
    if (!solveFormData["End Time"] || !selectedTicketGroup.length) return null;
    const st = selectedTicketGroup[0]?.["Start Time"];
    if (!st) return null;
    const endFmt = solveFormData["End Time"].trim();
    const mins   = calcMTTRMinutes(st, endFmt);
    const sla    = calcSLA(st, endFmt);
    return { mttr: formatMTTR(mins), label: sla.isOK ? "OK (≤ 7 Jam)" : "NOK (> 7 Jam)", isOK: sla.isOK };
  })();

  // ── Group & filter ──
  const groupedReports = useMemo<Record<string, any[]>>(() =>
    reports.reduce((acc: any, curr: any) => {
      const key = curr["NOMOR TICKET"] || `NO-TKT-${curr.id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(curr);
      return acc;
    }, {}),
  [reports]);

  const allGroups = useMemo(() => Object.entries(groupedReports), [groupedReports]);

  // Sync ref setiap kali groupedReports berubah (dipakai runStaleCheck tanpa masuk deps)
  useEffect(() => { groupedReportsRef.current = groupedReports; }, [groupedReports]);

  const filteredGroups = useMemo(() => {
    const result = allGroups.filter(([ticketNo, group]) => {
      if (search) {
        const q = search.toLowerCase();
        const hit = ticketNo.toLowerCase().includes(q)
          || (group[0]["Subject Ticket / Email"] || "").toLowerCase().includes(q)
          || (group[0]["Jenis Problem"] || "").toLowerCase().includes(q)
          || (group[0]["Open Ticket"] || "").toLowerCase().includes(q)
          || (group[0]["Kode Backbone"] || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter !== "ALL" && getTicketStatus(group) !== statusFilter) return false;
      if (regionalFilter !== "ALL" && (group[0]["Regional"] || "") !== regionalFilter) return false;
      return true;
    });
    // Reset ke halaman 1 setiap kali filter berubah
    setTablePage(1);
    return result;
  }, [allGroups, search, statusFilter, regionalFilter]);

  // Pagination derived values
  const tableTotalPages = Math.max(1, Math.ceil(filteredGroups.length / TABLE_PAGE_SIZE));
  const pagedGroups     = filteredGroups.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE
  );

  const groups      = useMemo(() => Object.values(groupedReports), [groupedReports]);
  const totalOpen   = groups.filter(g => isActive(g)).length;
  const totalSolved = groups.filter(g => g.every((r: any) => r["Status Case"] === "SOLVED")).length;
  const totalNOK    = groups.filter(g => isActive(g) && !calcSLA(g[0]["Start Time"]).isOK).length;

  // Status counts for tabs — memoized
  const statusCounts = useMemo(() => {
    const counts: Record<string,number> = { ALL: allGroups.length };
    STATUS_TABS.filter(t => t.key !== "ALL").forEach(t => {
      counts[t.key] = allGroups.filter(([, g]) => getTicketStatus(g) === t.key).length;
    });
    return counts;
  }, [allGroups]);

  // Regional options for filter dropdown — memoized
  const regionalOptions = useMemo(() => {
    const regions = [...new Set(
      reports.map(r => (r["Regional"] || "").trim()).filter(Boolean)
    )].sort();
    return regions;
  }, [reports]);

  // Available years for PDF selector
  const availableYears = useMemo(() => {
    const years = [...new Set(
      reports.map(r => {
        const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
        return p ? String(p.year) : "";
      }).filter(Boolean)
    )];
    return years.sort((a, b) => Number(b) - Number(a));
  }, [reports]);
  if (!availableYears.length) availableYears.push(String(new Date().getFullYear()));

  // PDF preview count
  const pdfPreviewCount = (() => {
    const f = reports.filter(r => {
      const p = extractDateParts(r["Hari dan Tanggal Report"] || "");
      if (!p) return false;
      if (pdfType === "monthly")    return p.monthStr === pdfMonth;
      if (pdfType === "quarterly") {
        const q = Math.ceil(p.month / 3);
        return p.year === parseInt(pdfYear) && q === parseInt(pdfQuarter);
      }
      return p.year === parseInt(pdfYear);
    });
    const g: Record<string,any[]> = {};
    f.forEach(r => { const k = r["NOMOR TICKET"] || `ID-${r.id}`; if (!g[k]) g[k] = []; g[k].push(r); });
    return { rows: f.length, tickets: Object.keys(g).length };
  })();

  // ─────────────────────────────────────────────
  return (
  <ThemeCtx.Provider value={theme}>
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: C.base, fontFamily: "var(--font-sans)", transition: "background 0.3s ease" }}>

      {/* ══ STALE TICKET POPUP (fixed floating — bottom-right) ══ */}
      {(() => {
        const staleOnes = inactiveAlerts.filter(a => a.diffMin >= 60 && !a.exempt);
        if (!showStalePopup || staleOnes.length === 0) return null;
        return (
          <div
            className="fixed bottom-5 right-5 z-[9990] w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: C.surface,
              border: `1px solid rgba(234,179,8,0.35)`,
              boxShadow: `0 0 0 1px rgba(234,179,8,0.15), 0 20px 60px rgba(0,0,0,0.35)`,
              animation: "popup-in 0.25s ease-out",
            }}
          >
            {/* Accent strip */}
            <div className="h-1 w-full" style={{ background: "linear-gradient(to right,#f59e0b,#eab308)" }} />

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                <span className="text-base">⏰</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black tracking-wide" style={{ color: "#eab308" }}>STALE TICKET ALERT</p>
                <p className="text-[10px]" style={{ color: C.textMuted }}>
                  {staleOnes.length} tiket tidak ada update &gt; 1 jam
                </p>
              </div>
              <button
                onClick={() => setShowStalePopup(false)}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: C.textMuted, background: "transparent" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.elevated; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                ✕
              </button>
            </div>

            {/* Ticket list */}
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 280 }}>
              {staleOnes.sort((a, b) => b.diffMin - a.diffMin).map((al, i) => {
                const group = groupedReports[al.ticketNo];
                const first = group?.[0];
                const subject = first?.["Subject Ticket / Email"] || "—";
                const statusColor = al.status === "ON PROGRESS" ? "#f59e0b" : "#94a3b8";
                const h = Math.floor(al.diffMin / 60);
                const m = al.diffMin % 60;
                const durStr = h > 0 ? `${h}j ${m}m` : `${m}m`;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: statusColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black font-mono truncate" style={{ color: C.text }}>
                        {al.ticketNo}
                      </p>
                      <p className="text-[10px] truncate mt-0.5" style={{ color: C.textSec }}>
                        {subject}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: `${statusColor}20`, color: statusColor }}>
                          {al.status}
                        </span>
                        <span className="text-[9px]" style={{ color: C.textMuted }}>
                          ⏱ {durStr} tanpa update
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: C.elevated }}>
              {staleSentAt ? (
                <span className="text-[10px] font-semibold" style={{ color: "#22c55e" }}>
                  ✓ Terkirim ke Telegram {staleSentAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : (
                <span className="text-[10px]" style={{ color: C.textMuted }}>Auto kirim tiap jam</span>
              )}
              <button
                onClick={() => runStaleCheck(true)}
                disabled={staleSending}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid rgba(234,179,8,0.3)" }}
              >
                {staleSending ? "Mengirim..." : "Kirim Ulang"}
              </button>
            </div>

            <style>{`
              @keyframes popup-in {
                from { opacity: 0; transform: translateY(12px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)     scale(1); }
              }
            `}</style>
          </div>
        );
      })()}

      {/* ══ TOP BAR ══ */}
      <header className="flex items-center gap-2 px-5 py-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${C.border}`, background: C.base }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-3">
          <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/backbone-monitor.png" alt="Backbone Monitor" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-[13px] font-black tracking-tight leading-none" style={{ color: C.text }}>Backbone Monitor</h1>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: C.textMuted }} suppressHydrationWarning>NOC FMI · <LiveClock /></p>
          </div>
        </div>

        {/* Action buttons — left group */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowWAModal(true)} disabled={fetching}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderMid; (e.currentTarget as HTMLElement).style.color = C.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSec; }}>
            <MessageSquare size={12} /> <span className="hidden sm:inline">WA Report</span>
          </button>

          <button onClick={() => setShowPDFModal(true)} disabled={fetching}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderMid; (e.currentTarget as HTMLElement).style.color = C.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSec; }}>
            <FileDown size={12} /> <span className="hidden sm:inline">PDF</span>
          </button>

          <button onClick={syncToSheets} disabled={syncing || fetching}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderMid; (e.currentTarget as HTMLElement).style.color = C.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSec; }}>
            <Sheet size={12} className={syncing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync"}</span>
          </button>

          {/* Sync Stage dari Odoo */}
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={syncFromOdoo} disabled={syncingOdoo || fetching}
              title={lastSyncTime ? `Terakhir sync: ${lastSyncTime.toLocaleTimeString("id-ID")}` : "Sinkronisasi status tiket dari Odoo ke web"}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: syncingOdoo ? C.accent : C.textSec }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = syncingOdoo ? C.accent : C.textSec; }}>
              <RefreshCw size={12} className={syncingOdoo ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{syncingOdoo ? "Sync Odoo..." : "Odoo"}</span>
            </button>
            {lastSyncTime && (
              <span className="text-[8px] font-mono tabular-nums" style={{ color: C.textMuted }}>
                {lastSyncTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <div className="w-px h-4 mx-0.5" style={{ background: C.border }} />

          {/* Heatmap peta */}
          <button onClick={() => setShowHeatmap(true)} disabled={fetching}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}
            title="Sebaran Insiden Backbone">
            <MapPin size={12} /> <span className="hidden sm:inline">Heatmap</span>
          </button>

          {/* Calendar Heatmap */}
          <button onClick={() => setShowCalendarHeatmap(true)} disabled={fetching}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}
            title="Kalender Frekuensi Insiden">
            <Activity size={12} /> <span className="hidden sm:inline">Kalender</span>
          </button>

          {/* Stale Alert button — badge merah kalau ada tiket ≥ 1 jam tanpa update */}
          {(() => {
            const staleCount = inactiveAlerts.filter(a => a.diffMin >= 60 && !a.exempt).length;
            return (
              <button
                onClick={() => {
                  if (staleCount > 0) setShowStalePopup(p => !p);
                  else runStaleCheck(true);
                }}
                disabled={staleSending}
                title={staleCount > 0 ? `${staleCount} tiket > 1 jam tanpa update` : "Semua tiket up-to-date"}
                className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
                style={{
                  background: staleCount > 0 ? "rgba(234,179,8,0.12)" : C.surface,
                  border: `1px solid ${staleCount > 0 ? "rgba(234,179,8,0.4)" : C.border}`,
                  color: staleCount > 0 ? "#eab308" : C.textSec,
                }}
              >
                <span>⏰</span>
                <span className="hidden sm:inline">{staleSending ? "..." : "Stale"}</span>
                {staleCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    {staleCount}
                  </span>
                )}
              </button>
            );
          })()}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right group */}
        <div className="flex items-center gap-1.5">

          {/* Bell */}
          <div ref={bellRef} style={{ position: "relative" }}>
            <button onClick={() => setShowBell(p => !p)}
              className="relative p-2 rounded-lg transition-colors"
              style={{
                background: C.surface,
                border: `1px solid ${inactiveAlerts.length > 0 ? (inactiveAlerts.some(a => a.diffMin >= 60 && !a.exempt) ? "rgba(248,113,113,0.5)" : "rgba(251,191,36,0.5)") : C.border}`,
                color: inactiveAlerts.length > 0 ? (inactiveAlerts.some(a => a.diffMin >= 60 && !a.exempt) ? "#f87171" : "#f5c842") : C.textSec,
              }}
              title="Notifikasi tiket">
              <Bell size={13} className={inactiveAlerts.some(a => a.diffMin >= 60 && !a.exempt) ? "animate-bounce" : ""} />
              {inactiveAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: inactiveAlerts.some(a => a.diffMin >= 60) ? "#f87171" : "#f5c842", color: "#0f172a" }}>
                  {inactiveAlerts.length}
                </span>
              )}
            </button>

            {showBell && (
              <div className="absolute right-0 top-full mt-2 rounded-2xl shadow-2xl overflow-hidden z-[90]"
                   style={{ width: 300, background: C.surface, border: `1px solid ${C.borderMid}` }}>
                <div className="px-4 py-3 flex items-center justify-between"
                     style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.text }}>
                    <Bell size={11} style={{ display: "inline", marginRight: 6, color: C.accent }} />Notifikasi
                  </span>
                  <span className="text-[9px]" style={{ color: C.textMuted }}>tiap 60 detik</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {inactiveAlerts.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-[11px]" style={{ color: C.textMuted }}>Semua tiket aktif up-to-date ✓</p>
                    </div>
                  ) : (
                    inactiveAlerts.sort((a, b) => b.diffMin - a.diffMin).map(al => {
                      const isUrgent = al.diffMin >= 60 && !al.exempt;
                      const ac = isUrgent ? "#f87171" : al.diffMin >= 30 ? "#f5c842" : "#94a3b8";
                      return (
                        <div key={al.ticketNo} className="flex items-start gap-3 px-4 py-3"
                             style={{ borderBottom: `1px solid ${C.border}` }}
                             onMouseEnter={e => (e.currentTarget.style.background = C.elevated)}
                             onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <AlertTriangle size={13} style={{ color: ac, flexShrink: 0, marginTop: 2 }} className={isUrgent ? "animate-pulse" : ""} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-[11px]" style={{ color: ac }}>{al.ticketNo}</span>
                              <span className="text-[9px] px-1.5 rounded font-bold"
                                    style={{ background: `${STATUS_COLOR[al.status] || C.subtle}20`, color: STATUS_COLOR[al.status] || C.textSec }}>
                                {al.status}
                              </span>
                              {al.exempt && <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>TERJADWAL</span>}
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                              {isUrgent ? "⚠ Perlu segera diupdate!" : "Belum ada update"} · <span className="font-mono font-bold" style={{ color: ac }}>{al.diffMin} mnt</span>
                            </p>
                          </div>
                          <button onClick={() => { const g = groupedReports[al.ticketNo]; if (g) { openSolveModal(g); setShowBell(false); } }}
                            className="text-[9px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                            style={{ background: `${ac}20`, color: ac }}>Update</button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* View toggle — hanya tampil di tab Tiket */}
          {pageTab === "tiket" && <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {(["table","kanban"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: view === v ? C.accent : C.surface, color: view === v ? (darkMode ? "#111110" : "#f6f7ed") : C.textSec }}>
                {v === "table" ? <List size={12} /> : <LayoutGrid size={12} />}
                <span className="hidden sm:inline">{v === "table" ? "Table" : "Kanban"}</span>
              </button>
            ))}
          </div>}

          {/* Refresh */}
          <button onClick={fetchData} disabled={fetching}
            className="p-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
            <RefreshCw size={13} className={fetching ? "animate-spin" : ""} />
          </button>

          {/* Pending Approval Badge — hanya muncul untuk approver kalau ada pending */}
          {canApproveKode && pendingItems.length > 0 && (
            <button
              onClick={() => { setNewBBKode(""); setNewBBNama(""); setShowAddBBModal(true); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[12px] transition-all active:scale-95"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)" }}
              title="Ada request kode backbone menunggu persetujuan kamu">
              ⏳ <span className="hidden sm:inline">Acc Kode</span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black animate-bounce"
                    style={{ background: "#f59e0b", color: "#111" }}>
                {pendingItems.length}
              </span>
            </button>
          )}


          {/* New Incident */}
          <button onClick={() => { setNewReport(r => ({ ...r, "Hari dan Tanggal Report": localDateISO(), "Start Time": nowDisplayFormat() })); setOdooResult(null); setOdooSubject(""); setOdooDescription(""); setShowInputModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[12px] transition-all active:scale-95"
            style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
            <Plus size={13} /> <span className="hidden sm:inline">Open New Ticket</span>
          </button>
        </div>
      </header>

      {/* ══ SCROLLABLE CONTENT ══ */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>

        {/* ══ PAGE SUB-TABS NAV ══ */}
        {(() => {
          const critCount  = popKakiStatus.filter(p => p.severity === "critical" || p.severity === "blackout").length;
          const tabs: { key: "overview" | "tiket" | "pop-kaki"; label: string; icon: string; badge?: number }[] = [
            { key: "overview",  label: "Overview",  icon: "📊" },
            { key: "tiket",     label: "Tiket",     icon: "🎫", badge: totalOpen || undefined },
            { key: "pop-kaki",  label: "Management Backbone & PoP",  icon: "📍", badge: critCount || undefined },
          ];
          return (
            <div className="flex-shrink-0 flex items-center gap-1 px-6 pt-4 pb-0"
                 style={{ borderBottom: `1px solid ${C.border}` }}>
              {tabs.map(t => {
                const isActive = pageTab === t.key;
                return (
                  <button key={t.key}
                    onClick={() => setPageTab(t.key)}
                    className="relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold transition-all"
                    style={{
                      color:        isActive ? C.accent : C.textSec,
                      borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                      marginBottom: -1,
                      background:   "transparent",
                    }}>
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                    {t.badge !== undefined && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black"
                            style={{
                              background: t.key === "pop-kaki" ? (isActive ? "#f97316" : "rgba(249,115,22,0.7)") : C.accentBg,
                              color:      t.key === "pop-kaki" ? "#fff" : C.accent,
                            }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* ══ TAB: OVERVIEW ══ */}
        {pageTab === "overview" && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-5">

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Active Incidents" value={totalOpen}   accent="#f5c842" icon={Activity} />
          <StatCard label="Resolved"         value={totalSolved} accent="#10b981" icon={CheckCircle2} />
          <StatCard label="SLA Breached"     value={totalNOK}    accent="#f87171" icon={XCircle} />
        </div>

        {/* ── TWO-COLUMN PANEL ── */}
        {(() => {
          const SLA_THRESHOLD_HOURS = 7;

          // ── Left: PoP alerts ──
          const blackoutPops  = popKakiStatus.filter(p => p.severity === "blackout");
          const criticalPops  = popKakiStatus.filter(p => p.severity === "critical");
          // Hanya tampilkan blackout (0 kaki) dan critical (sisa 1 kaki)
          const alertPops     = [...blackoutPops, ...criticalPops];
          const alertPopsFiltered = popAlertSearch.trim()
            ? alertPops.filter(p =>
                p.nama.toLowerCase().includes(popAlertSearch.toLowerCase()) ||
                p.kode.toLowerCase().includes(popAlertSearch.toLowerCase()) ||
                p.aliveNamas.some(n => n.toLowerCase().includes(popAlertSearch.toLowerCase()))
              )
            : alertPops;

          // ── Right: active tickets elapsed > 7 jam ──
          const now = Date.now();
          const overdueTickets = allGroups
            .filter(([, g]) => isActive(g))
            .map(([ticketNo, g]) => {
              const first      = g[0];
              const startMs    = parseDateTime(first["Start Time"] || "").getTime();
              const elapsedMin = isNaN(startMs) ? 0 : Math.max(0, Math.floor((now - startMs) / 60_000));
              return { ticketNo, group: g, first, elapsedMin };
            })
            .filter(t => t.elapsedMin >= SLA_THRESHOLD_HOURS * 60)
            .sort((a, b) => b.elapsedMin - a.elapsedMin);

          const overdueFiltered = slaTicketSearch.trim()
            ? overdueTickets.filter(({ ticketNo, first }) =>
                ticketNo.toLowerCase().includes(slaTicketSearch.toLowerCase()) ||
                (first["Subject Ticket / Email"] || "").toLowerCase().includes(slaTicketSearch.toLowerCase()) ||
                (first["Jenis Problem"] || "").toLowerCase().includes(slaTicketSearch.toLowerCase())
              )
            : overdueTickets;

          const fmtElapsed = (min: number) => {
            const h = Math.floor(min / 60);
            const m = min % 60;
            return h > 0 ? `${h}j ${m}m` : `${m}m`;
          };

          return (
            <div className="grid grid-cols-2 gap-4" style={{ minHeight: 320 }}>

              {/* ══ LEFT: STATUS PoP BACKBONE ══ */}
              <div className="flex flex-col rounded-2xl overflow-hidden"
                   style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {/* header */}
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                     style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📍</span>
                    <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: C.text }}>
                      Status PoP Backbone
                    </span>
                  </div>
                  {alertPops.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(249,115,22,0.2)", color: "#f97316" }}>
                      {alertPops.length} alert
                    </span>
                  )}
                </div>
                {/* search */}
                {alertPops.length > 0 && (
                  <div className="px-3 py-2 flex-shrink-0"
                       style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                         style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                      <span className="text-[11px]" style={{ color: C.textMuted }}>🔍</span>
                      <input
                        type="text"
                        placeholder="Cari PoP atau backbone..."
                        value={popAlertSearch}
                        onChange={e => setPopAlertSearch(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-[11px]"
                        style={{ color: C.text }}
                      />
                      {popAlertSearch && (
                        <button onClick={() => setPopAlertSearch("")}
                          className="text-[10px] leading-none"
                          style={{ color: C.textMuted }}>✕</button>
                      )}
                    </div>
                  </div>
                )}
                {/* body — max 5 item, scroll */}
                <div style={{ maxHeight: "calc(5 * 72px)", overflowY: "auto" }}>
                  {alertPops.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <span className="text-2xl">✅</span>
                      <p className="text-[12px] font-bold" style={{ color: "#10b981" }}>Semua PoP normal</p>
                      <p className="text-[11px]" style={{ color: C.textMuted }}>Tidak ada kaki backbone yang down</p>
                    </div>
                  ) : alertPopsFiltered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <span className="text-xl">🔍</span>
                      <p className="text-[11px]" style={{ color: C.textMuted }}>Tidak ditemukan untuk &ldquo;{popAlertSearch}&rdquo;</p>
                    </div>
                  ) : (
                    <div>
                      {alertPopsFiltered.map(pop => {
                        const isBlackout = pop.severity === "blackout";
                        return (
                          <div key={pop.kode}
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:opacity-80"
                            style={{
                              background: isBlackout ? "rgba(239,68,68,0.07)" : "rgba(249,115,22,0.07)",
                              borderBottom: `1px solid ${C.border}`,
                            }}
                            onClick={() => setPageTab("pop-kaki")}>
                            <span className="text-base flex-shrink-0 mt-0.5" style={isBlackout ? {} : { animation: "pulse 2s infinite" }}>
                              {isBlackout ? "🔴" : "🚨"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-[10px] font-black uppercase tracking-widest"
                                      style={{ color: isBlackout ? "#ef4444" : "#f97316" }}>
                                  {isBlackout ? "BLACKOUT" : "SISA 1 KAKI"}
                                </span>
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                                      style={{
                                        background: isBlackout ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
                                        color: isBlackout ? "#ef4444" : "#f97316",
                                      }}>{pop.kode}</span>
                              </div>
                              <p className="text-[12px] font-bold truncate" style={{ color: C.text }}>{pop.nama}</p>
                              <p className="text-[10px] mt-0.5" style={{ color: isBlackout ? "#fca5a5" : "#fdba74" }}>
                                {isBlackout
                                  ? `Semua ${pop.total} kaki down · ${pop.activeTickets.join(", ") || "—"}`
                                  : <>Sisa hidup: <strong>{pop.aliveNamas[0] || pop.aliveKodes[0] || "—"}</strong>
                                      {pop.activeTickets.length > 0 && ` · ${pop.activeTickets.join(", ")}`}</>
                                }
                              </p>
                            </div>
                            <span className="text-[9px] flex-shrink-0 mt-0.5"
                                  style={{ color: isBlackout ? "#ef4444" : "#f97316" }}>→</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* footer */}
                <div className="px-4 py-2 flex-shrink-0 flex items-center justify-between"
                     style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
                  <span className="text-[10px]" style={{ color: C.textMuted }}>
                    {popAlertSearch
                      ? `${alertPopsFiltered.length} / ${alertPops.length} alert`
                      : `${popKakiStatus.filter(p => p.total > 0).length} PoP terpantau`}
                  </span>
                  <button onClick={() => setPageTab("pop-kaki")}
                    className="text-[10px] font-bold underline"
                    style={{ color: C.accent }}>
                    Kelola PoP →
                  </button>
                </div>
              </div>

              {/* ══ RIGHT: TIKET SLA &gt; 7 JAM ══ */}
              <div className="flex flex-col rounded-2xl overflow-hidden"
                   style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {/* header */}
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                     style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⏱️</span>
                    <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: C.text }}>
                      Tiket SLA &gt; {SLA_THRESHOLD_HOURS} Jam
                    </span>
                  </div>
                  {overdueTickets.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(248,113,113,0.2)", color: "#f87171" }}>
                      {overdueTickets.length} tiket
                    </span>
                  )}
                </div>
                {/* search */}
                {overdueTickets.length > 0 && (
                  <div className="px-3 py-2 flex-shrink-0"
                       style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                         style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                      <span className="text-[11px]" style={{ color: C.textMuted }}>🔍</span>
                      <input
                        type="text"
                        placeholder="Cari nomor tiket atau subject..."
                        value={slaTicketSearch}
                        onChange={e => setSlaTicketSearch(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-[11px]"
                        style={{ color: C.text }}
                      />
                      {slaTicketSearch && (
                        <button onClick={() => setSlaTicketSearch("")}
                          className="text-[10px] leading-none"
                          style={{ color: C.textMuted }}>✕</button>
                      )}
                    </div>
                  </div>
                )}
                {/* body — max 5 item, scroll */}
                <div style={{ maxHeight: "calc(5 * 72px)", overflowY: "auto" }}>
                  {overdueTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <span className="text-2xl">✅</span>
                      <p className="text-[12px] font-bold" style={{ color: "#10b981" }}>Semua tiket dalam SLA</p>
                      <p className="text-[11px]" style={{ color: C.textMuted }}>Tidak ada tiket aktif melewati {SLA_THRESHOLD_HOURS} jam</p>
                    </div>
                  ) : overdueFiltered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <span className="text-xl">🔍</span>
                      <p className="text-[11px]" style={{ color: C.textMuted }}>Tidak ditemukan untuk &ldquo;{slaTicketSearch}&rdquo;</p>
                    </div>
                  ) : (
                    <div>
                      {overdueFiltered.map(({ ticketNo, first, elapsedMin }) => {
                        const isNOK = first["SLA"] === "NOK";
                        const h     = Math.floor(elapsedMin / 60);
                        const urgentColor = h >= 24 ? "#ef4444"
                                          : h >= 12 ? "#f97316"
                                          : "#f5c842";
                        return (
                          <div key={ticketNo}
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:opacity-80"
                            style={{ borderBottom: `1px solid ${C.border}` }}
                            onClick={() => {
                              const g = allGroups.find(([t]) => t === ticketNo)?.[1];
                              if (g) { setSelectedTicketGroup(g); setShowDetailModal(true); }
                            }}>
                            <span className="text-base flex-shrink-0 mt-0.5"
                                  style={{ color: urgentColor }}>🔔</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="font-mono text-[11px] font-black" style={{ color: C.accent }}>
                                  {ticketNo}
                                </span>
                                {isNOK && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                                        style={{ background: "rgba(248,113,113,0.2)", color: "#f87171" }}>SLA NOK</span>
                                )}
                              </div>
                              <p className="text-[11px] truncate" style={{ color: C.textSec }}>
                                {first["Subject Ticket / Email"] || "—"}
                              </p>
                              <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                                {first["Jenis Problem"] || "—"} · {first["Start Time"] || "—"}
                              </p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="text-[12px] font-black tabular-nums" style={{ color: urgentColor }}>
                                {fmtElapsed(elapsedMin)}
                              </p>
                              <p className="text-[9px]" style={{ color: C.textMuted }}>elapsed</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* footer */}
                <div className="px-4 py-2 flex-shrink-0 flex items-center justify-between"
                     style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
                  <span className="text-[10px]" style={{ color: C.textMuted }}>
                    {slaTicketSearch
                      ? `${overdueFiltered.length} / ${overdueTickets.length} tiket`
                      : `${totalOpen} tiket aktif total`}
                  </span>
                  <button onClick={() => setPageTab("tiket")}
                    className="text-[10px] font-bold underline"
                    style={{ color: C.accent }}>
                    Lihat semua tiket →
                  </button>
                </div>
              </div>

            </div>
          );
        })()}

        {/* ── INCIDENT CARDS PER TIKET ── */}
        {(() => {
          // Build numToNama dari indexData
          const numToNama: Record<string, string> = {};
          indexData.forEach(d => {
            const kode = d["KODE BACKBONE"] || "";
            const num  = extractKodeNum(kode);
            const nama = d["NAMA BACKBONE"] || kode.replace(/^\d+[/\s]*/, "").trim() || kode;
            if (num && nama) numToNama[num] = nama;
          });

          // Hanya ambil tiket yang masih aktif
          const activeTicketGroups = allGroups.filter(([, g]) => isActive(g));
          if (activeTicketGroups.length === 0) return null;

          const fmtE = (min: number) => {
            if (min <= 0) return "—";
            const h = Math.floor(min / 60);
            const m = min % 60;
            return h > 0 ? `${h}j ${m}m` : `${m}m`;
          };

          // Build card data per tiket
          const cards = activeTicketGroups
            .map(([ticketNo, group]) => {
              const first      = group[0];
              const startTime  = first["Start Time"] as string || "";
              const startMs    = parseDateTime(startTime).getTime();
              const scInfo     = getStopClockInfo(ticketNo, stopClocks);
              const pausedMin  = scInfo.totalPausedMin;
              const rawElapsed = isNaN(startMs) ? 0 : Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
              const netElapsed = Math.max(0, rawElapsed - pausedMin);

              // Backbone links dalam tiket ini (unik per numKode)
              const seenKodes = new Set<string>();
              const links = group
                .map((r: any) => {
                  const numKode  = extractKodeNum(r["Kode Backbone"] as string || "");
                  if (!numKode || seenKodes.has(numKode)) return null;
                  seenKodes.add(numKode);
                  const namaLink = (r["Nama Link"] as string || numToNama[numKode] || numKode).trim();
                  return { numKode, namaLink };
                })
                .filter(Boolean) as { numKode: string; namaLink: string }[];

              return {
                ticketNo,
                group,
                first,
                startTime,
                netElapsed,
                rawElapsed,
                pausedMin,
                scInfo,
                links,
                status: getTicketStatus(group),
                subject: first["Subject Ticket / Email"] as string || "",
                jenis:   first["Jenis Problem"] as string || "",
              };
            })
            .sort((a, b) => b.netElapsed - a.netElapsed);

          return (
            <div>
              {/* Section header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔗</span>
                  <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: C.text }}>
                    Insiden Aktif — Detail per Tiket
                  </span>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: C.accentBg, color: C.accent }}>
                  {cards.length} tiket
                </span>
              </div>

              {/* Cards grid */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
                {cards.map(card => {
                  const elH   = Math.floor(card.netElapsed / 60);
                  const elColor = elH >= 24 ? "#ef4444"
                                : elH >= 12 ? "#f97316"
                                : elH >= 7  ? "#f5c842"
                                : "#10b981";
                  const stColor = STATUS_COLOR[card.status] || C.textSec;
                  const hasStop = card.scInfo.count > 0;
                  const isStopActive = card.scInfo.hasActive;

                  return (
                    <div key={card.ticketNo}
                      className="rounded-2xl overflow-hidden flex flex-col"
                      style={{ background: C.surface, border: `1px solid ${C.border}` }}>

                      {/* Card header */}
                      <div className="flex items-start justify-between px-4 py-3 gap-2"
                           style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Nomor tiket — klik buka detail */}
                            <button
                              onClick={() => { setSelectedTicketGroup(card.group); setShowDetailModal(true); }}
                              className="font-mono font-black text-[13px] hover:underline"
                              style={{ color: C.accent }}>
                              {card.ticketNo}
                            </button>
                            {/* Status badge */}
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                  style={{ background: `${stColor}20`, color: stColor, border: `1px solid ${stColor}40` }}>
                              {card.status}
                            </span>
                            {/* Jenis problem */}
                            {card.jenis && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: C.elevated, color: C.textMuted, border: `1px solid ${C.border}` }}>
                                {card.jenis}
                              </span>
                            )}
                          </div>
                          {card.subject && (
                            <p className="text-[11px] mt-1 truncate" style={{ color: C.textSec }} title={card.subject}>
                              {card.subject}
                            </p>
                          )}
                        </div>

                        {/* Elapsed + stop clock */}
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[14px] font-black tabular-nums leading-none" style={{ color: elColor }}>
                            {fmtE(card.netElapsed)}
                          </p>
                          <p className="text-[9px] mt-0.5" style={{ color: C.textMuted }}>
                            {card.pausedMin > 0 ? `−${fmtE(card.pausedMin)} pause` : "elapsed"}
                          </p>
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
                           style={{ borderBottom: `1px solid ${C.border}` }}>
                        <span className="text-[10px]" style={{ color: C.textMuted }}>
                          ⏱ {card.startTime || "—"}
                        </span>
                        <span className="text-[10px] ml-auto flex items-center gap-1" style={{
                          color: isStopActive ? "#f5c842" : hasStop ? C.textMuted : C.textMuted
                        }}>
                          {isStopActive
                            ? <><span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "#f5c842" }} />Stop Clock AKTIF</>
                            : hasStop
                            ? <>⏸ {card.scInfo.count}× stop clock ({fmtE(card.pausedMin)} total)</>
                            : <>— Tidak ada stop clock</>
                          }
                        </span>
                      </div>

                      {/* Backbone link list */}
                      <div className="flex-1 px-4 py-2.5">
                        {card.links.length === 0 ? (
                          <p className="text-[11px]" style={{ color: C.textMuted }}>—</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {card.links.map(lnk => (
                              <div key={lnk.numKode} className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold flex-shrink-0 w-11 tabular-nums"
                                      style={{ color: C.textMuted }}>{lnk.numKode}</span>
                                <span className="text-[11px] truncate" style={{ color: C.text }}
                                      title={lnk.namaLink}>
                                  {lnk.namaLink}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        </div>
        )} {/* end overview tab */}

        {/* ══ TAB: TIKET ══ */}
        {pageTab === "tiket" && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-5">

        {/* ── STATUS TABS + SEARCH + VIEW ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {STATUS_TABS.map(tab => (
            <TabBtn key={tab.key}
              active={statusFilter === tab.key}
              color={tab.key === "ALL" ? C.accent : STATUS_COLOR[tab.key]}
              onClick={() => setStatusFilter(tab.key)}
              count={statusCounts[tab.key] || 0}
              label={tab.label} />
          ))}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {/* Regional filter */}
            {regionalOptions.length > 0 && (
              <select
                value={regionalFilter}
                onChange={e => setRegionalFilter(e.target.value)}
                className="py-1.5 px-2 rounded-xl text-[11px] outline-none cursor-pointer"
                style={{
                  background: regionalFilter !== "ALL" ? C.accentBg : C.surface,
                  border: `1px solid ${regionalFilter !== "ALL" ? C.accentBorder : C.border}`,
                  color: regionalFilter !== "ALL" ? C.accent : C.textSec,
                  fontWeight: 600,
                  colorScheme: darkMode ? "dark" : "light",
                }}>
                <option value="ALL" style={{ background: darkMode ? "#1c1c1a" : "#fff", color: darkMode ? "#f0efe8" : "#1a1a18" }}>
                  Semua Regional
                </option>
                {regionalOptions.map(r => (
                  <option key={r} value={r} style={{ background: darkMode ? "#1c1c1a" : "#fff", color: darkMode ? "#f0efe8" : "#1a1a18" }}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.textMuted }} />
              <input type="text"
                placeholder="Cari tiket..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 pr-6 py-1.5 rounded-xl text-[12px] outline-none"
                style={{ width: search ? 180 : 140, background: C.surface, border: `1px solid ${search ? C.accentBorder : C.border}`, color: C.text, transition: "width 0.2s" }} />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-[10px]"
                  style={{ background: C.subtle, color: C.textMuted }}>×</button>
              )}
            </div>
          </div>
        </div>

      {/* ══ TABLE VIEW ══ */}
      {view === "table" && (
        <div className="rounded-2xl"
             style={{ background: C.surface, border: `1px solid ${C.border}`, overflow: "clip" }}>
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table className="min-w-full text-[12px]">
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                <tr style={{ background: C.elevated, borderBottom: `2px solid ${C.border}` }}>
                  {["Nomor Ticket","Subject","Jenis Problem","Status","Start Time","MTTR","SLA / Countdown","Stop Clock","Priority","Action"].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left whitespace-nowrap"
                        style={{ color: C.textMuted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", background: C.elevated }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fetching && [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded animate-pulse" style={{ background: C.elevated }} />
                      </td>
                    ))}
                  </tr>
                ))}

                {!fetching && filteredGroups.length === 0 && (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search size={28} style={{ color: C.textMuted }} />
                      <p className="text-sm font-semibold" style={{ color: C.textSec }}>
                        {search ? "Tidak ada tiket yang cocok" : "Tidak ada incident"}
                      </p>
                    </div>
                  </td></tr>
                )}

                {!fetching && pagedGroups.map(([ticketNo, group]) => {
                  const first  = group[0];
                  const active = isActive(group);
                  const status = getTicketStatus(group);
                  return (
                    <tr key={ticketNo} style={{ borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.elevated)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                      <td className="px-5 py-4">
                        <button onClick={() => { setSelectedTicketGroup(group); setShowDetailModal(true); }}
                          className="font-mono font-black text-[12px] transition-opacity hover:opacity-70 text-left"
                          style={{ color: C.accent }}>{ticketNo}</button>
                        <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{group.length} link</p>
                      </td>

                      <td className="px-5 py-4 max-w-[200px]">
                        <p className="font-semibold truncate text-[12px]" style={{ color: C.text }}>
                          {first["Subject Ticket / Email"] || "N/A"}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{first["Hari dan Tanggal Report"]}</p>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-[11px] font-bold" style={{ color: C.textSec }}>{first["Jenis Problem"] || "—"}</span>
                      </td>

                      <td className="px-5 py-4"><StatusBadge status={status} /></td>

                      <td className="px-5 py-4">
                        <span className="font-mono text-[11px]" style={{ color: C.textSec }}>{first["Start Time"] || "—"}</span>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg"
                              style={{ background: C.elevated, color: C.textSec, border: `1px solid ${C.border}` }}>
                          {active
                            ? (first["Start Time"] ? <LiveMTTR startTime={first["Start Time"]} /> : "—")
                            : formatMTTR(first["MTTR"])}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-center">
                        {active && first["Start Time"]
                          ? <SLACountdown startTime={first["Start Time"]} ticketNo={ticketNo}
                              stopClocksForTicket={stopClocks.filter(c => c.ticket_no === ticketNo)} />
                          : <span className="text-xs font-black font-mono"
                                  style={{ color: first["SLA"] === "OK" ? "#10b981" : first["SLA"] === "NOK" ? "#f87171" : C.textMuted }}>
                              {first["SLA"] || "—"}
                            </span>
                        }
                      </td>

                      {/* Stop Clock — selalu render td agar kolom sejajar */}
                      <td className="px-3 py-4 text-center">
                        {(() => {
                          const sc = stopClocks.filter(c => c.ticket_no === ticketNo);
                          if (!active || sc.length === 0) return <span style={{ color: C.textMuted }}>—</span>;
                          const hasActive = sc.some(c => !c.ended_at);
                          return (
                            <div className="flex flex-col items-center gap-1">
                              {hasActive && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded animate-pulse"
                                      style={{ background: "rgba(251,146,60,0.2)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.4)" }}>
                                  ⏸ PAUSE
                                </span>
                              )}
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                                    style={{
                                      background: sc.length >= 3 ? "rgba(248,113,113,0.12)" : "rgba(100,116,139,0.12)",
                                      color: sc.length >= 3 ? "#f87171" : C.textMuted,
                                      border: `1px solid ${sc.length >= 3 ? "rgba(248,113,113,0.25)" : "rgba(100,116,139,0.2)"}`,
                                    }}>
                                {sc.length}×
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-5 py-4 text-center">
                        {first["Priority"]
                          ? <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                  style={{
                                    background: first["Priority"] === "CRITICAL" ? "rgba(248,113,113,0.1)" : "rgba(251,146,60,0.1)",
                                    color:      first["Priority"] === "CRITICAL" ? "#f87171" : "#fb923c",
                                    border:     `1px solid ${first["Priority"] === "CRITICAL" ? "rgba(248,113,113,0.25)" : "rgba(251,146,60,0.25)"}`,
                                  }}>{first["Priority"]}</span>
                          : <span style={{ color: C.textMuted }}>—</span>}
                      </td>

                      <td className="px-5 py-4 text-center">
                        {active
                          ? <button onClick={() => openSolveModal(group)}
                              className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                              style={{ background: C.elevated, color: C.textSec, border: `1px solid ${C.border}` }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.accent; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.elevated; (e.currentTarget as HTMLElement).style.color = C.textSec; }}>
                              UPDATE
                            </button>
                          : <span className="text-[10px] italic" style={{ color: C.textMuted }}>CLOSED</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TABLE PAGINATION ══ */}
      {view === "table" && !fetching && filteredGroups.length > TABLE_PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 px-1">
          {/* Info */}
          <p className="text-[11px]" style={{ color: C.textMuted }}>
            Menampilkan{" "}
            <span style={{ color: C.textSec, fontWeight: 700 }}>
              {(tablePage - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(tablePage * TABLE_PAGE_SIZE, filteredGroups.length)}
            </span>{" "}
            dari{" "}
            <span style={{ color: C.textSec, fontWeight: 700 }}>{filteredGroups.length}</span>{" "}
            tiket
          </p>

          {/* Page controls */}
          <div className="flex items-center gap-1">
            {/* Prev */}
            <button
              disabled={tablePage === 1}
              onClick={() => setTablePage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: C.elevated, color: C.textSec, border: `1px solid ${C.border}` }}
            >
              ‹ Prev
            </button>

            {/* Page numbers — sliding window */}
            {(() => {
              const pages: (number | "…")[] = [];
              if (tableTotalPages <= 7) {
                for (let i = 1; i <= tableTotalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (tablePage > 3) pages.push("…");
                for (let i = Math.max(2, tablePage - 1); i <= Math.min(tableTotalPages - 1, tablePage + 1); i++) pages.push(i);
                if (tablePage < tableTotalPages - 2) pages.push("…");
                pages.push(tableTotalPages);
              }
              return pages.map((p, idx) =>
                p === "…" ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-[11px]" style={{ color: C.textMuted }}>···</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setTablePage(p as number)}
                    className="w-8 h-8 rounded-lg text-[11px] font-bold transition-all"
                    style={{
                      background: tablePage === p ? C.accent : C.elevated,
                      color:      tablePage === p ? "#fff"    : C.textSec,
                      border:     `1px solid ${tablePage === p ? C.accent : C.border}`,
                    }}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            {/* Next */}
            <button
              disabled={tablePage === tableTotalPages}
              onClick={() => setTablePage(p => Math.min(tableTotalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: C.elevated, color: C.textSec, border: `1px solid ${C.border}` }}
            >
              Next ›
            </button>
          </div>
        </div>
      )}

      {/* ══ KANBAN VIEW ══ */}
      {view === "kanban" && (
        <>
          <p className="text-[10px] mb-3 flex items-center gap-1.5" style={{ color: C.textMuted }}>
            <span>⠿</span>
            Geser tiket antar kolom untuk mengubah status ·
            <span style={{ color: STATUS_COLOR["SOLVED"] }}>SOLVED</span> → form detail ·
            <span style={{ color: STATUS_COLOR["CANCEL"] }}>CANCEL</span> /
            <span style={{ color: STATUS_COLOR["UNSOLVED"] }}>UNSOLVED</span> → isi alasan
          </p>

          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
            {KANBAN_COLS.map(col => {
              const colGroups = filteredGroups.filter(([, g]) => getTicketStatus(g) === col.status);
              const ac        = STATUS_COLOR[col.status];
              const isOver    = dragOverCol === col.status;
              const isSolved  = col.status === "SOLVED";
              const needsForm = col.status === "SOLVED" || col.status === "CANCEL" || col.status === "UNSOLVED";

              return (
                <div key={col.status}
                  className="flex-shrink-0 flex flex-col rounded-2xl transition-all"
                  style={{
                    width:      272,
                    background: isOver ? `${ac}08` : C.surface,
                    border:     `1px solid ${isOver ? ac : C.border}`,
                    boxShadow:  isOver ? `0 0 0 2px ${ac}30` : "none",
                  }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverCol(col.status); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
                  onDrop={e => { e.preventDefault(); handleDrop(col.status); }}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
                       style={{ background: `${ac}10`, borderBottom: `1px solid ${ac}25` }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: ac }} />
                      <span className="text-xs font-black uppercase tracking-wide" style={{ color: ac }}>
                        {col.label}
                      </span>
                      {needsForm && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                              style={{ background: `${ac}20`, color: ac }}>+ form</span>
                      )}
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ background: `${ac}20`, color: ac }}>
                      {colGroups.length}
                    </span>
                  </div>

                  {/* Drop indicator */}
                  {isOver && (
                    <div className="mx-3 mt-3 rounded-xl border-2 border-dashed py-3 flex items-center justify-center text-xs font-bold"
                         style={{ borderColor: ac, color: ac, background: `${ac}08` }}>
                      {isSolved ? "Drop → isi form detail"
                        : needsForm ? `Drop → isi alasan`
                        : `Pindahkan ke ${col.label}`}
                    </div>
                  )}

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5" style={{ maxHeight: 560 }}>
                    {fetching && [...Array(2)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: C.elevated }} />
                    ))}
                    {!fetching && colGroups.length === 0 && !isOver && (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <span className="text-xl opacity-40">⠿</span>
                        <p className="text-[10px] text-center" style={{ color: C.textMuted }}>
                          {col.status === "SOLVED" ? "Belum ada yang selesai" : "Tidak ada tiket"}
                        </p>
                      </div>
                    )}
                    {!fetching && colGroups.map(([ticketNo, group]) => (
                      <KanbanCard
                        key={ticketNo}
                        ticketNo={ticketNo}
                        group={group}
                        isDragging={draggingTicket === ticketNo}
                        onDragStart={() => setDraggingTicket(ticketNo)}
                        onDragEnd={() => { setDraggingTicket(null); setDragOverCol(null); }}
                        onDetail={() => { setSelectedTicketGroup(group); setShowDetailModal(true); }}
                        onUpdate={() => openSolveModal(group)}
                        stopClocksForTicket={stopClocks.filter(c => c.ticket_no === ticketNo)}
                        onStopClock={() => { setStopClockTicketNo(ticketNo); setShowStopClockModal(true); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

        </div>
        )} {/* end tiket tab */}

        {/* ══ TAB: POP KAKI (inline panel) ══ */}
        {pageTab === "pop-kaki" && (() => {
          // ── Helpers & derived data (same as modal) ──
          const allPops = [...indexData]
            .filter(d => isPopEntry(d))
            .sort((a, b) => extractKodeNum(a["KODE BACKBONE"] || "").localeCompare(extractKodeNum(b["KODE BACKBONE"] || "")));

          const allLinks = [...indexData]
            .filter(d => isLinkEntry(d))
            .sort((a, b) => extractKodeNum(a["KODE BACKBONE"] || "").localeCompare(extractKodeNum(b["KODE BACKBONE"] || "")));

          const filteredPops = allPops.filter(d => {
            if (!bbMgmtPopSearch) return true;
            const s = bbMgmtPopSearch.toLowerCase();
            const kode = (d["KODE BACKBONE"] || "").toLowerCase();
            const nama = (d["NAMA BACKBONE"] || kode.replace(/^\d+\//, "")).toLowerCase();
            return kode.includes(s) || nama.includes(s);
          });

          const filteredLinks = allLinks.filter(d => {
            if (!bbMgmtLinkSearch) return true;
            const s = bbMgmtLinkSearch.toLowerCase();
            const kode = (d["KODE BACKBONE"] || "").toLowerCase();
            const nama = (d["NAMA BACKBONE"] || kode.replace(/^\d+\//, "")).toLowerCase();
            return kode.includes(s) || nama.includes(s);
          });

          const handleSelectPop = (d: any) => {
            setBBMgmtSelPop(d);
            setBBMgmtDraft(Array.isArray(d["Kaki Backbone"]) ? [...d["Kaki Backbone"]] : []);
            setBBMgmtDirty(false);
            setBBMgmtEditMode(false);
            setBBMgmtLinkSearch("");
          };

          const handleToggleLink = (linkRaw: any) => {
            if (!canEditKakiBackbone) return;
            const numK = extractKodeNum(linkRaw["KODE BACKBONE"] || "");
            setBBMgmtDraft(prev => {
              const normPrev = prev.map(k => extractKodeNum(k));
              if (normPrev.includes(numK)) {
                return prev.filter(k => extractKodeNum(k) !== numK);
              } else {
                return [...prev, numK];
              }
            });
            setBBMgmtDirty(true);
          };

          const handleSaveDraft = async () => {
            if (!bbMgmtSelPop) return;
            setBBMgmtSaving(true);
            const { error } = await supabase.from("Index NOC")
              .update({ "Kaki Backbone": bbMgmtDraft })
              .eq("KODE BACKBONE", bbMgmtSelPop["KODE BACKBONE"]);
            setBBMgmtSaving(false);
            if (error) { toast.error("Gagal simpan: " + error.message); return; }
            const updated = { ...bbMgmtSelPop, "Kaki Backbone": bbMgmtDraft };
            setBBMgmtSelPop(updated);
            setIndexData(prev => prev.map(d =>
              d["KODE BACKBONE"] === bbMgmtSelPop["KODE BACKBONE"] ? updated : d
            ));
            setBBMgmtDirty(false);
            setBBMgmtEditMode(false);
            const popNamaDisplay = bbMgmtSelPop["NAMA BACKBONE"]
              || (bbMgmtSelPop["KODE BACKBONE"] || "").replace(/^\d+\//, "");
            toast.success(`${popNamaDisplay} — ${bbMgmtDraft.length} kaki backbone disimpan`);
          };

          return (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>

              {/* ── Top bar ── */}
              <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
                   style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <p className="text-[13px] font-black" style={{ color: C.text }}>
                    Management Backbone & PoP
                  </p>
                  <p className="text-[11px]" style={{ color: C.textSec }}>
                    {allPops.length} PoP · {allLinks.length} backbone link terdaftar
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setBBMgmtSelPop(null); setBBMgmtDraft([]); setBBMgmtDirty(false); setBBMgmtPopSearch(""); setBBMgmtLinkSearch(""); setNewBBKode(""); setNewBBNama("PoP "); setShowAddBBModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                    style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <Plus size={12} /> Tambah PoP
                  </button>
                  <button
                    onClick={() => { setBBMgmtSelPop(null); setBBMgmtDraft([]); setBBMgmtDirty(false); setBBMgmtPopSearch(""); setBBMgmtLinkSearch(""); setNewBBKode(""); setNewBBNama(""); setShowAddBBModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                    style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBorder}` }}>
                    <Plus size={12} /> Tambah Link
                  </button>
                </div>
              </div>

              {/* ── Two-panel body ── */}
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT: PoP list */}
                <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
                     style={{ borderRight: `1px solid ${C.border}` }}>
                  <div className="p-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="relative">
                      <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: C.textMuted }} />
                      <input type="text" placeholder="Cari PoP..."
                        value={bbMgmtPopSearch}
                        onChange={e => setBBMgmtPopSearch(e.target.value)}
                        style={{ ...getInputStyle(C), paddingLeft: 28, fontSize: 12, padding: "7px 10px 7px 28px" }} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredPops.length === 0 && (
                      <div className="p-6 text-center">
                        <p className="text-[11px]" style={{ color: C.textMuted }}>
                          {allPops.length === 0 ? "Belum ada PoP. Klik + Tambah PoP." : "Tidak ditemukan"}
                        </p>
                      </div>
                    )}
                    {filteredPops.map(d => {
                      const kode        = d["KODE BACKBONE"] as string;
                      const numK        = extractKodeNum(kode);
                      const namaDisplay = d["NAMA BACKBONE"] as string
                                       || kode.replace(/^\d+[/\s]*/, "").trim();
                      const stat        = popKakiStatus.find(p => p.kode === numK);
                      const sev         = stat?.severity || "ok";
                      const rem         = stat?.remaining ?? 0;
                      const tot         = stat?.total ?? 0;
                      const isSelected  = bbMgmtSelPop?.["KODE BACKBONE"] === kode;

                      const sevColor = sev === "blackout" ? "#ef4444"
                                     : sev === "critical"  ? "#f97316"
                                     : sev === "warning"   ? "#f5c842"
                                     : tot === 0           ? C.textMuted
                                     : "#10b981";
                      const sevIcon  = sev === "blackout" ? "🔴"
                                     : sev === "critical"  ? "🚨"
                                     : sev === "warning"   ? "⚠️"
                                     : tot === 0           ? "○"
                                     : "✅";
                      return (
                        <div key={kode}
                          onClick={() => handleSelectPop(d)}
                          className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all"
                          style={{
                            background:  isSelected ? C.accentBg : "transparent",
                            borderLeft:  `3px solid ${isSelected ? C.accent : "transparent"}`,
                            borderBottom: `1px solid ${C.border}`,
                          }}>
                          <span className="text-base flex-shrink-0 w-5 text-center">{sevIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold truncate" style={{ color: C.text }}>
                              {namaDisplay}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: C.textMuted }}>{numK}</p>
                          </div>
                          <span className="text-[11px] font-black flex-shrink-0 tabular-nums"
                                style={{ color: sevColor }}>
                            {tot === 0 ? "—" : `${rem}/${tot}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT: Summary / Edit */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {!bbMgmtSelPop ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <MapPin size={36} className="mx-auto mb-3 opacity-30" style={{ color: C.textMuted }} />
                        <p className="text-sm font-bold" style={{ color: C.textMuted }}>Pilih PoP di sebelah kiri</p>
                        <p className="text-[11px] mt-1" style={{ color: C.textMuted }}>untuk melihat & mengatur kaki backbone-nya</p>
                      </div>
                    </div>
                  ) : (() => {
                    const selKode   = bbMgmtSelPop["KODE BACKBONE"] as string;
                    const selNumK   = extractKodeNum(selKode);
                    const selNama   = bbMgmtSelPop["NAMA BACKBONE"] as string
                                   || selKode.replace(/^\d+[/\s]*/, "").trim();
                    const selStat   = popKakiStatus.find(p => p.kode === selNumK);
                    const normDraft = bbMgmtDraft.map(k => extractKodeNum(k));

                    // Hitung berapa kali tiap kaki pernah muncul di report (unique tickets)
                    const downCountByKode: Record<string, Set<string>> = {};
                    reports.forEach((r: any) => {
                      const numK   = extractKodeNum(r["Kode Backbone"] as string || "");
                      const ticket = (r["NOMOR TICKET"] as string || "").trim();
                      if (!numK || !ticket) return;
                      if (!downCountByKode[numK]) downCountByKode[numK] = new Set();
                      downCountByKode[numK].add(ticket);
                    });

                    // ── SHARED: header ──
                    const rightHeader = (
                      <div className="px-4 py-3 flex-shrink-0"
                           style={{ borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-black truncate" style={{ color: C.text }}>{selNama}</p>
                            <p className="text-[10px] font-mono" style={{ color: C.textMuted }}>
                              {selNumK} · {bbMgmtDraft.length} kaki terdaftar
                              {bbMgmtDirty && <span style={{ color: "#f5c842" }}> · ⚠ belum disimpan</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Tombol Edit / Selesai */}
                            {canEditKakiBackbone && !bbMgmtEditMode && (
                              <button type="button"
                                onClick={() => setBBMgmtEditMode(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBorder}` }}>
                                ✏️ Edit Kaki
                              </button>
                            )}
                            {bbMgmtEditMode && (
                              <>
                                {bbMgmtDirty && (
                                  <button type="button"
                                    onClick={() => { setBBMgmtDraft(Array.isArray(bbMgmtSelPop["Kaki Backbone"]) ? [...bbMgmtSelPop["Kaki Backbone"]] : []); setBBMgmtDirty(false); }}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                    style={{ color: C.textSec, border: `1px solid ${C.border}` }}>
                                    Batalkan
                                  </button>
                                )}
                                <button type="button"
                                  disabled={!bbMgmtDirty || bbMgmtSaving}
                                  onClick={handleSaveDraft}
                                  className="px-4 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40"
                                  style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
                                  {bbMgmtSaving ? "Menyimpan..." : "💾 Simpan"}
                                </button>
                                {!bbMgmtDirty && (
                                  <button type="button"
                                    onClick={() => setBBMgmtEditMode(false)}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                    style={{ color: C.textSec, border: `1px solid ${C.border}` }}>
                                    Selesai
                                  </button>
                                )}
                              </>
                            )}
                            {!canEditKakiBackbone && (
                              <span className="text-[10px] px-3 py-1.5 rounded-lg"
                                    style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                                Read-only
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Status bar */}
                        {selStat && selStat.total > 0 && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{
                                    background: selStat.severity === "ok" ? "rgba(16,185,129,0.15)"
                                             : selStat.severity === "critical" || selStat.severity === "blackout" ? "rgba(249,115,22,0.15)"
                                             : "rgba(245,200,66,0.15)",
                                    color: selStat.severity === "ok" ? "#10b981"
                                         : selStat.severity === "critical" || selStat.severity === "blackout" ? "#f97316"
                                         : "#f5c842",
                                  }}>
                              {selStat.severity === "blackout" ? "⛔ BLACKOUT" : `Sisa ${selStat.remaining}/${selStat.total} kaki aktif`}
                            </span>
                            {selStat.downKodes.length > 0 && (
                              <span className="text-[10px]" style={{ color: "#fca5a5" }}>
                                Down: {selStat.downKodes.slice(0, 3).join(", ")}
                                {selStat.downKodes.length > 3 ? ` +${selStat.downKodes.length - 3}` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );

                    // ── MODE: SUMMARY ──
                    if (!bbMgmtEditMode) {
                      return (
                        <>
                          {rightHeader}
                          <div className="flex-1 overflow-y-auto">
                            {bbMgmtDraft.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
                                <span className="text-2xl opacity-40">🔗</span>
                                <p className="text-[12px] font-bold" style={{ color: C.textMuted }}>Belum ada kaki backbone</p>
                                {canEditKakiBackbone && (
                                  <button onClick={() => setBBMgmtEditMode(true)}
                                    className="mt-1 text-[11px] font-bold underline"
                                    style={{ color: C.accent }}>+ Tambah kaki backbone</button>
                                )}
                              </div>
                            ) : (
                              <>
                                {/* Summary header row */}
                                <div className="grid px-4 py-2 text-[10px] font-black uppercase tracking-widest flex-shrink-0"
                                     style={{ gridTemplateColumns: "3rem 1fr 5rem 4rem 3.5rem", color: C.textMuted, borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
                                  <span>Kode</span>
                                  <span>Nama Link</span>
                                  <span className="text-center">Status</span>
                                  <span className="text-center">Insiden</span>
                                  <span className="text-center">Tiket</span>
                                </div>
                                {normDraft.map(numK => {
                                  const linkEntry = allLinks.find(l => extractKodeNum(l["KODE BACKBONE"] || "") === numK);
                                  const namaRaw   = linkEntry
                                    ? ((linkEntry["NAMA BACKBONE"] as string) || (linkEntry["KODE BACKBONE"] as string).replace(/^\d+[/\s]*/, "").trim())
                                    : numK;
                                  const isDown    = selStat?.downKodes.includes(numK) ?? false;
                                  const ticketSet = downCountByKode[numK];
                                  const ticketCnt = ticketSet ? ticketSet.size : 0;
                                  // Active ticket for this kode
                                  const activeTickets = selStat?.downKodes.includes(numK)
                                    ? (selStat?.activeTickets || [])
                                    : [];

                                  return (
                                    <div key={numK}
                                      className="grid items-center px-4 py-2.5"
                                      style={{
                                        gridTemplateColumns: "3rem 1fr 5rem 4rem 3.5rem",
                                        borderBottom: `1px solid ${C.border}`,
                                        background: isDown ? "rgba(239,68,68,0.05)" : "transparent",
                                      }}>
                                      <span className="font-mono text-[10px] font-black" style={{ color: C.textMuted }}>{numK}</span>
                                      <span className="text-[12px] truncate pr-2" style={{ color: C.text }} title={namaRaw}>{namaRaw}</span>
                                      <div className="flex justify-center">
                                        {isDown ? (
                                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>DOWN</span>
                                        ) : (
                                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                                style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>UP</span>
                                        )}
                                      </div>
                                      <p className="text-[11px] font-black text-center tabular-nums"
                                         style={{ color: ticketCnt > 0 ? C.text : C.textMuted }}>
                                        {ticketCnt > 0 ? ticketCnt : "—"}
                                      </p>
                                      <p className="text-[10px] text-center truncate"
                                         style={{ color: isDown ? "#f97316" : C.textMuted }}>
                                        {isDown && activeTickets.length > 0 ? activeTickets[0] : "—"}
                                      </p>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        </>
                      );
                    }

                    // ── MODE: EDIT CHECKLIST ──
                    return (
                      <>
                        {rightHeader}
                        {/* Search */}
                        <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
                          <div className="relative">
                            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: C.textMuted }} />
                            <input type="text" placeholder="Cari backbone link..."
                              value={bbMgmtLinkSearch}
                              onChange={e => setBBMgmtLinkSearch(e.target.value)}
                              style={{ ...getInputStyle(C), paddingLeft: 28, fontSize: 12, padding: "7px 10px 7px 28px" }} />
                          </div>
                        </div>
                        {/* Checklist */}
                        <div className="flex-1 overflow-y-auto">
                          {filteredLinks.length === 0 && (
                            <div className="p-6 text-center">
                              <p className="text-[11px]" style={{ color: C.textMuted }}>
                                {allLinks.length === 0 ? "Belum ada backbone link. Klik + Tambah Link." : "Tidak ditemukan"}
                              </p>
                            </div>
                          )}
                          {filteredLinks.map((d: any) => {
                            const kode    = d["KODE BACKBONE"] as string;
                            const numK    = extractKodeNum(kode);
                            const namaRaw = d["NAMA BACKBONE"] as string || kode.replace(/^\d+[/\s]*/, "").trim();
                            const checked = normDraft.includes(numK);
                            const isDown  = selStat?.downKodes.includes(numK) ?? false;
                            return (
                              <div key={kode}
                                onClick={() => handleToggleLink(d)}
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                                style={{
                                  cursor: "pointer",
                                  borderBottom: `1px solid ${C.border}`,
                                  background: checked ? (isDown ? "rgba(239,68,68,0.07)" : C.accentBg) : "transparent",
                                }}>
                                <input type="checkbox" checked={checked} readOnly
                                  className="w-4 h-4 flex-shrink-0 rounded"
                                  style={{ accentColor: isDown ? "#ef4444" : (darkMode ? "#f0efe8" : "#1a1a18"), cursor: "pointer" }} />
                                <span className="font-mono text-[10px] font-bold w-12 flex-shrink-0"
                                      style={{ color: C.textMuted }}>{numK}</span>
                                <span className="flex-1 text-[12px] truncate" style={{ color: C.text }}>{namaRaw}</span>
                                {isDown && checked && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                                        style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>DOWN</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* ── Footer hint ── */}
              <div className="flex items-center px-6 py-3 flex-shrink-0"
                   style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
                <span className="text-[10px]" style={{ color: C.textMuted }}>
                  {canEditKakiBackbone
                    ? "Pilih PoP → centang backbone yang terhubung → Simpan"
                    : "Role kamu tidak punya akses edit kaki backbone (NOC / ADMIN / SUPER_DEV)"}
                </span>
              </div>
            </div>
          );
        })()}

      </main>

      {/* ══ MODAL: HEATMAP — Sebaran Insiden Backbone ══ */}
      {showHeatmap && (
        <div className="fixed inset-0 flex items-center justify-center z-[70] p-3 sm:p-5"
             style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
          <div className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
               style={{ maxWidth: 1100, height: "92vh", background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex justify-between items-center px-5 py-4 shrink-0"
                 style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
              <div>
                <h2 className="text-base font-black flex items-center gap-2" style={{ color: C.text }}>
                  <MapPin size={16} style={{ color: C.accent }} /> Sebaran Insiden Backbone
                </h2>
                <p className="text-xs mt-0.5" style={{ color: C.textSec }}>
                  Berdasarkan kolom <span style={{ color: C.accent }}>Alamat Problem</span> · Ukuran lingkaran = jumlah insiden
                </p>
              </div>
              <button onClick={() => setShowHeatmap(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xl"
                style={{ color: C.textSec, background: C.surface, border: `1px solid ${C.border}` }}>×</button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
              <BackboneHeatmap reports={reports} darkMode={darkMode} />
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: CALENDAR HEATMAP ══ */}
      {showCalendarHeatmap && (
        <div className="fixed inset-0 flex items-center justify-center z-[70] p-3 sm:p-5"
             style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
          <div className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
               style={{ maxWidth: 1100, height: "92vh", background: C.surface, border: `1px solid ${C.border}` }}>
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 shrink-0"
                 style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
              <div>
                <h2 className="text-base font-black flex items-center gap-2" style={{ color: C.text }}>
                  <Activity size={16} style={{ color: C.accent }} /> Kalender Frekuensi Insiden
                </h2>
                <p className="text-xs mt-0.5" style={{ color: C.textSec }}>
                  Visualisasi insiden per hari · Hover sel untuk detail tiket
                </p>
              </div>
              <button onClick={() => setShowCalendarHeatmap(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xl"
                style={{ color: C.textSec, background: C.surface, border: `1px solid ${C.border}` }}>×</button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
              <CalendarHeatmap reports={reports} darkMode={darkMode} />
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: MANAGEMENT BACKBONE PoP ══ */}
      {showBBMgmtModal && (() => {
        // ── Helpers & derived data ──
        const allPops = [...indexData]
          .filter(d => isPopEntry(d))
          .sort((a, b) => extractKodeNum(a["KODE BACKBONE"] || "").localeCompare(extractKodeNum(b["KODE BACKBONE"] || "")));

        const allLinks = [...indexData]
          .filter(d => isLinkEntry(d))
          .sort((a, b) => extractKodeNum(a["KODE BACKBONE"] || "").localeCompare(extractKodeNum(b["KODE BACKBONE"] || "")));

        const filteredPops = allPops.filter(d => {
          if (!bbMgmtPopSearch) return true;
          const s = bbMgmtPopSearch.toLowerCase();
          const kode = (d["KODE BACKBONE"] || "").toLowerCase();
          const nama = (d["NAMA BACKBONE"] || kode.replace(/^\d+\//, "")).toLowerCase();
          return kode.includes(s) || nama.includes(s);
        });

        const filteredLinks = allLinks.filter(d => {
          if (!bbMgmtLinkSearch) return true;
          const s = bbMgmtLinkSearch.toLowerCase();
          const kode = (d["KODE BACKBONE"] || "").toLowerCase();
          const nama = (d["NAMA BACKBONE"] || kode.replace(/^\d+\//, "")).toLowerCase();
          return kode.includes(s) || nama.includes(s);
        });

        // Select a PoP → load its Kaki Backbone as draft
        const handleSelectPop = (d: any) => {
          setBBMgmtSelPop(d);
          setBBMgmtDraft(Array.isArray(d["Kaki Backbone"]) ? [...d["Kaki Backbone"]] : []);
          setBBMgmtDirty(false);
          setBBMgmtLinkSearch("");
        };

        // Toggle checkbox for a backbone link
        const handleToggleLink = (linkRaw: any) => {
          if (!canEditKakiBackbone) return;
          const numK = extractKodeNum(linkRaw["KODE BACKBONE"] || "");
          setBBMgmtDraft(prev => {
            const normPrev = prev.map(k => extractKodeNum(k));
            if (normPrev.includes(numK)) {
              return prev.filter(k => extractKodeNum(k) !== numK);
            } else {
              return [...prev, numK];
            }
          });
          setBBMgmtDirty(true);
        };

        // Save draft to Supabase
        const handleSaveDraft = async () => {
          if (!bbMgmtSelPop) return;
          setBBMgmtSaving(true);
          const { error } = await supabase.from("Index NOC")
            .update({ "Kaki Backbone": bbMgmtDraft })
            .eq("KODE BACKBONE", bbMgmtSelPop["KODE BACKBONE"]);
          setBBMgmtSaving(false);
          if (error) { toast.error("Gagal simpan: " + error.message); return; }
          // Sync local state
          const updated = { ...bbMgmtSelPop, "Kaki Backbone": bbMgmtDraft };
          setBBMgmtSelPop(updated);
          setIndexData(prev => prev.map(d =>
            d["KODE BACKBONE"] === bbMgmtSelPop["KODE BACKBONE"] ? updated : d
          ));
          setBBMgmtDirty(false);
          const popNamaDisplay = bbMgmtSelPop["NAMA BACKBONE"]
            || (bbMgmtSelPop["KODE BACKBONE"] || "").replace(/^\d+\//, "");
          toast.success(`${popNamaDisplay} — ${bbMgmtDraft.length} kaki backbone disimpan`);
        };

        const closeMgmt = () => {
          setShowBBMgmtModal(false);
          setBBMgmtSelPop(null);
          setBBMgmtDraft([]);
          setBBMgmtDirty(false);
          setBBMgmtPopSearch("");
          setBBMgmtLinkSearch("");
        };

        return (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[70]"
               style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
            <div className="w-full max-w-5xl flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                 style={{ background: C.surface, border: `1px solid ${C.border}`, height: "85vh" }}>

              {/* ── Header ── */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                   style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <h2 className="text-base font-black flex items-center gap-2" style={{ color: C.text }}>
                    <MapPin size={16} />
                    Management Backbone PoP
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: C.textSec }}>
                    {allPops.length} PoP · {allLinks.length} backbone link terdaftar
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* + Tambah PoP */}
                  <button
                    onClick={() => { closeMgmt(); setNewBBKode(""); setNewBBNama("PoP "); setShowAddBBModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                    style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <Plus size={12} /> Tambah PoP
                  </button>
                  {/* + Tambah Link */}
                  <button
                    onClick={() => { closeMgmt(); setNewBBKode(""); setNewBBNama(""); setShowAddBBModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                    style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBorder}` }}>
                    <Plus size={12} /> Tambah Link
                  </button>
                  <button onClick={closeMgmt}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
                    ×
                  </button>
                </div>
              </div>

              {/* ── Two-panel body ── */}
              <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: PoP list ── */}
                <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
                     style={{ borderRight: `1px solid ${C.border}` }}>
                  {/* Search PoP */}
                  <div className="p-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="relative">
                      <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: C.textMuted }} />
                      <input type="text" placeholder="Cari PoP..."
                        value={bbMgmtPopSearch}
                        onChange={e => setBBMgmtPopSearch(e.target.value)}
                        style={{ ...getInputStyle(C), paddingLeft: 28, fontSize: 12, padding: "7px 10px 7px 28px" }} />
                    </div>
                  </div>
                  {/* PoP list */}
                  <div className="flex-1 overflow-y-auto">
                    {filteredPops.length === 0 && (
                      <div className="p-6 text-center">
                        <p className="text-[11px]" style={{ color: C.textMuted }}>
                          {allPops.length === 0 ? "Belum ada PoP. Klik + Tambah PoP." : "Tidak ditemukan"}
                        </p>
                      </div>
                    )}
                    {filteredPops.map(d => {
                      const kode       = d["KODE BACKBONE"] as string;
                      const numK       = extractKodeNum(kode);
                      const namaDisplay = d["NAMA BACKBONE"] as string
                                       || kode.replace(/^\d+[/\s]*/, "").trim();
                      const stat       = popKakiStatus.find(p => p.kode === numK);
                      const sev        = stat?.severity || "ok";
                      const rem        = stat?.remaining ?? 0;
                      const tot        = stat?.total ?? 0;
                      const isSelected = bbMgmtSelPop?.["KODE BACKBONE"] === kode;

                      const sevColor = sev === "blackout" ? "#ef4444"
                                     : sev === "critical"  ? "#f97316"
                                     : sev === "warning"   ? "#f5c842"
                                     : tot === 0           ? C.textMuted
                                     : "#10b981";
                      const sevIcon  = sev === "blackout" ? "🔴"
                                     : sev === "critical"  ? "🚨"
                                     : sev === "warning"   ? "⚠️"
                                     : tot === 0           ? "○"
                                     : "✅";

                      return (
                        <div key={kode}
                          onClick={() => handleSelectPop(d)}
                          className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all"
                          style={{
                            background: isSelected ? C.accentBg : "transparent",
                            borderLeft: `3px solid ${isSelected ? C.accent : "transparent"}`,
                            borderBottom: `1px solid ${C.border}`,
                          }}>
                          <span className="text-base flex-shrink-0 w-5 text-center">{sevIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold truncate" style={{ color: C.text }}>
                              {namaDisplay}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: C.textMuted }}>{numK}</p>
                          </div>
                          <span className="text-[11px] font-black flex-shrink-0 tabular-nums"
                                style={{ color: sevColor }}>
                            {tot === 0 ? "—" : `${rem}/${tot}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── RIGHT: Checklist ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {!bbMgmtSelPop ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <MapPin size={36} className="mx-auto mb-3 opacity-30" style={{ color: C.textMuted }} />
                        <p className="text-sm font-bold" style={{ color: C.textMuted }}>Pilih PoP di sebelah kiri</p>
                        <p className="text-[11px] mt-1" style={{ color: C.textMuted }}>
                          untuk mengatur kaki backbone-nya
                        </p>
                      </div>
                    </div>
                  ) : (() => {
                    const selKode    = bbMgmtSelPop["KODE BACKBONE"] as string;
                    const selNumK    = extractKodeNum(selKode);
                    const selNama    = bbMgmtSelPop["NAMA BACKBONE"] as string
                                    || selKode.replace(/^\d+[/\s]*/, "").trim();
                    const selStat    = popKakiStatus.find(p => p.kode === selNumK);
                    const normDraft  = bbMgmtDraft.map(k => extractKodeNum(k));

                    return (
                      <>
                        {/* Right header */}
                        <div className="px-4 py-3 flex-shrink-0"
                             style={{ borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-black truncate" style={{ color: C.text }}>
                                {selNama}
                              </p>
                              <p className="text-[10px] font-mono" style={{ color: C.textMuted }}>
                                {selNumK} · {bbMgmtDraft.length} kaki dipilih
                                {bbMgmtDirty && (
                                  <span style={{ color: "#f5c842" }}> · ⚠ belum disimpan</span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {bbMgmtDirty && (
                                <button type="button"
                                  onClick={() => {
                                    setBBMgmtDraft(
                                      Array.isArray(bbMgmtSelPop["Kaki Backbone"])
                                        ? [...bbMgmtSelPop["Kaki Backbone"]] : []
                                    );
                                    setBBMgmtDirty(false);
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                  style={{ color: C.textSec, border: `1px solid ${C.border}` }}>
                                  Batalkan
                                </button>
                              )}
                              {canEditKakiBackbone ? (
                                <button type="button"
                                  disabled={!bbMgmtDirty || bbMgmtSaving}
                                  onClick={handleSaveDraft}
                                  className="px-4 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40"
                                  style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
                                  {bbMgmtSaving ? "Menyimpan..." : "💾 Simpan"}
                                </button>
                              ) : (
                                <span className="text-[10px] px-3 py-1.5 rounded-lg"
                                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                                  Read-only
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Status ringkas */}
                          {selStat && selStat.total > 0 && (
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                      background: selStat.severity === "ok" ? "rgba(16,185,129,0.15)"
                                               : selStat.severity === "warning" ? "rgba(245,200,66,0.15)"
                                               : "rgba(249,115,22,0.15)",
                                      color: selStat.severity === "ok" ? "#10b981"
                                           : selStat.severity === "warning" ? "#f5c842"
                                           : "#f97316",
                                    }}>
                                Sisa {selStat.remaining}/{selStat.total} kaki aktif
                              </span>
                              {selStat.downKodes.length > 0 && (
                                <span className="text-[10px]" style={{ color: "#fca5a5" }}>
                                  Down: {selStat.downKodes.slice(0, 3).join(", ")}
                                  {selStat.downKodes.length > 3 ? ` +${selStat.downKodes.length - 3}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Search link */}
                          <div className="relative">
                            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: C.textMuted }} />
                            <input type="text" placeholder="Cari backbone link..."
                              value={bbMgmtLinkSearch}
                              onChange={e => setBBMgmtLinkSearch(e.target.value)}
                              style={{ ...getInputStyle(C), paddingLeft: 28, fontSize: 12, padding: "7px 10px 7px 28px" }} />
                          </div>
                        </div>

                        {/* Checklist */}
                        <div className="flex-1 overflow-y-auto">
                          {filteredLinks.length === 0 && (
                            <div className="p-6 text-center">
                              <p className="text-[11px]" style={{ color: C.textMuted }}>
                                {allLinks.length === 0
                                  ? "Belum ada backbone link. Klik + Tambah Link."
                                  : "Tidak ditemukan"}
                              </p>
                            </div>
                          )}
                          {filteredLinks.map((d: any) => {
                            const kode       = d["KODE BACKBONE"] as string;
                            const numK       = extractKodeNum(kode);
                            const namaRaw    = d["NAMA BACKBONE"] as string
                                            || kode.replace(/^\d+[/\s]*/, "").trim();
                            const checked    = normDraft.includes(numK);
                            // Is this link currently DOWN for this PoP?
                            const isDown     = selStat?.downKodes.includes(numK) ?? false;

                            return (
                              <div key={kode}
                                onClick={() => handleToggleLink(d)}
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                                style={{
                                  cursor: canEditKakiBackbone ? "pointer" : "default",
                                  borderBottom: `1px solid ${C.border}`,
                                  background: checked
                                    ? (isDown ? "rgba(239,68,68,0.07)" : C.accentBg)
                                    : "transparent",
                                }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  readOnly
                                  disabled={!canEditKakiBackbone}
                                  className="w-4 h-4 flex-shrink-0 rounded"
                                  style={{ accentColor: isDown ? "#ef4444" : (darkMode ? "#f0efe8" : "#1a1a18"), cursor: canEditKakiBackbone ? "pointer" : "default" }}
                                />
                                <span className="font-mono text-[10px] font-bold w-12 flex-shrink-0"
                                      style={{ color: C.textMuted }}>{numK}</span>
                                <span className="flex-1 text-[12px] truncate" style={{ color: C.text }}>
                                  {namaRaw}
                                </span>
                                {isDown && checked && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                                        style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                                    DOWN
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
                   style={{ borderTop: `1px solid ${C.border}`, background: C.elevated }}>
                <span className="text-[10px]" style={{ color: C.textMuted }}>
                  {canEditKakiBackbone
                    ? "Pilih PoP → centang backbone yang terhubung → Simpan"
                    : "Role kamu tidak punya akses edit kaki backbone (NOC / ADMIN / SUPER_DEV)"}
                </span>
                <button onClick={closeMgmt}
                  className="px-4 py-2 rounded-lg text-sm font-bold"
                  style={{ color: C.textSec, border: `1px solid ${C.border}` }}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ MODAL: TAMBAH KODE BACKBONE BARU ══ */}
      {showAddBBModal && (() => {
        // ── Hitung nomor urut berikutnya ──
        // Handles both old format ("00457/TAMBORA...") and new pure-number format ("00458")
        const existingNums = indexData
          .map(d => parseInt((d["KODE BACKBONE"] || "").match(/^(\d+)/)?.[1] ?? "0", 10))
          .filter(n => n > 0);
        const lastNum = existingNums.length ? Math.max(...existingNums) : 0;
        const nextNum = String(lastNum + 1).padStart(5, "0");

        // Nomor yang digunakan: override dari user atau auto
        const codeToUse = newBBKode.trim()
          ? newBBKode.trim().padStart(5, "0")
          : nextNum;

        // 5 entri terakhir untuk referensi (exclude pending)
        const lastFive = [...indexData]
          .filter(d => d["KODE BACKBONE"])
          .sort((a, b) => {
            const na = parseInt((a["KODE BACKBONE"] || "").match(/^(\d+)/)?.[1] ?? "0", 10);
            const nb = parseInt((b["KODE BACKBONE"] || "").match(/^(\d+)/)?.[1] ?? "0", 10);
            return nb - na;
          })
          .slice(0, 5);

        return (
          <Modal
            title="Tambah Kode Backbone Baru"
            sub={`Terakhir: ${lastNum > 0 ? String(lastNum).padStart(5, "0") : "—"} · Berikutnya: ${nextNum}`}
            onClose={() => { setShowAddBBModal(false); setNewBBKode(""); setNewBBNama(""); }}>
            <form onSubmit={async e => {
              e.preventDefault();
              if (!newBBNama.trim()) return;
              setAddBBLoading(true);
              try {
                const namaUpper = newBBNama.trim().toUpperCase();
                if (canApproveKode) {
                  // ── Punya hak: langsung simpan ke index ──
                  const { error } = await supabase.from("Index NOC").insert([{
                    "KODE BACKBONE": codeToUse,
                    "NAMA BACKBONE": namaUpper,
                  }]);
                  if (error) {
                    toast.error("Gagal simpan: " + error.message);
                  } else {
                    toast.success(`${codeToUse} — "${namaUpper}" ditambahkan ke index!`);
                    fetchIndex();
                    setShowAddBBModal(false);
                    setNewBBKode("");
                    setNewBBNama("");
                  }
                } else {
                  // ── Tidak punya hak: kirim ke backbone_pending via API ──
                  const { data: { user } } = await supabase.auth.getUser();
                  const requestedBy = user?.email ?? currentUserRole ?? "unknown";
                  try {
                    const res    = await fetch("/api/backbone/notify-telegram", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ kode: codeToUse, nama: namaUpper, requestedBy }),
                    });
                    const data = await res.json();
                    if (!res.ok || data.error) {
                      toast.error("Gagal kirim request: " + data.error);
                    } else if (data.sent === 0) {
                      const errDetail = data.errors
                        ? Object.values(data.errors).join(", ")
                        : "tidak ada admin Telegram terdaftar";
                      toast.warning(`Request disimpan, tapi notif Telegram gagal: ${errDetail}`);
                      setShowAddBBModal(false);
                      setNewBBKode(""); setNewBBNama("");
                    } else {
                      toast.success(`Request ${codeToUse} dikirim! Admin dinotifikasi via Telegram (${data.sent}/${data.total}).`);
                      setShowAddBBModal(false);
                      setNewBBKode(""); setNewBBNama("");
                    }
                  } catch (err: any) {
                    toast.error("Error: " + err.message);
                  }
                }
              } finally {
                setAddBBLoading(false);
              }
            }}>
              <div className="p-6 space-y-5">

                {/* ── Pending Approval (hanya untuk approver) ── */}
                {canApproveKode && pendingItems.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(245,158,11,0.4)" }}>
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "rgba(245,158,11,0.1)" }}>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                        ⏳ Menunggu Persetujuan ({pendingItems.length})
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "rgba(245,158,11,0.2)" }}>
                      {pendingItems.map((item: any, i: number) => {
                        const kode = item.kode || "—";
                        const nama = item.nama || "—";
                        const req  = item.requested_by || "—";
                        return (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="font-mono text-[11px] font-black flex-shrink-0"
                                  style={{ color: "#f59e0b" }}>{kode}</span>
                            <span className="flex-1 text-[10px] truncate" style={{ color: C.text }}>{nama}</span>
                            <span className="text-[9px] flex-shrink-0" style={{ color: C.textMuted }}>by {req}</span>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  const res  = await fetch("/api/backbone/pending", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "approve", id: item.id }),
                                  });
                                  const data = await res.json();
                                  if (!data.success) toast.error("Gagal approve: " + data.error);
                                  else { toast.success(data.message); fetchIndex(); fetchPending(); }
                                }}
                                className="px-2.5 py-1 rounded text-[9px] font-bold"
                                style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                                ✓ Setuju
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm(`Tolak request "${kode} — ${nama}"?`)) return;
                                  const res  = await fetch("/api/backbone/pending", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "reject", id: item.id }),
                                  });
                                  const data = await res.json();
                                  if (!data.success) toast.error("Gagal tolak: " + data.error);
                                  else { toast.success(`${kode} ditolak.`); fetchPending(); }
                                }}
                                className="px-2.5 py-1 rounded text-[9px] font-bold"
                                style={{ background: "rgba(244,63,94,0.15)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.3)" }}>
                                ✗ Tolak
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Referensi 5 entri terakhir ── */}
                <div className="rounded-xl p-3 space-y-1.5"
                     style={{ background: C.base, border: `1px solid ${C.border}` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2.5" style={{ color: C.textMuted }}>
                    5 Kode Terakhir (referensi urutan)
                  </p>
                  {lastFive.map((d, i) => {
                    // Support both old combined format and new split format
                    const numPart  = ((d["KODE BACKBONE"] || "").match(/^(\d+)/)?.[1] || d["KODE BACKBONE"] || "").padStart(5, "0");
                    const namePart = d["NAMA BACKBONE"] || (d["KODE BACKBONE"] || "").replace(/^\d+[/\s]*/, "") || "—";
                    return (
                      <div key={i} className="flex items-baseline gap-2.5">
                        <span className="font-mono text-[11px] font-black flex-shrink-0 w-[52px]"
                              style={{ color: i === 0 ? C.accent : C.textMuted }}>
                          {i === 0 ? "→ " : "  "}{numPart}
                        </span>
                        <span className="font-mono text-[10px] truncate" style={{ color: i === 0 ? C.text : C.textSec }}>
                          {namePart}
                        </span>
                      </div>
                    );
                  })}
                  {/* Berikutnya */}
                  <div className="flex items-baseline gap-2.5 pt-1.5" style={{ borderTop: `1px dashed ${C.border}` }}>
                    <span className="font-mono text-[11px] font-black flex-shrink-0 w-[52px]" style={{ color: "#fb923c" }}>
                      + {codeToUse}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "#fb923c" }}>
                      {newBBNama.trim().toUpperCase() || "(nama link belum diisi)"}
                    </span>
                  </div>
                </div>

                {/* ── Input: nomor (opsional override) + nama link ── */}
                <div className="space-y-3">
                  <div className="flex gap-3 items-end">
                    {/* Nomor urut — auto, tapi bisa dioverride */}
                    <div className="flex-shrink-0">
                      <p className="text-[9px] font-black uppercase tracking-wide mb-1.5" style={{ color: C.textMuted }}>
                        Nomor <span style={{ color: C.textMuted, fontWeight: 400 }}>(otomatis)</span>
                      </p>
                      <input
                        type="text"
                        maxLength={5}
                        placeholder={nextNum}
                        value={newBBKode}
                        onChange={e => setNewBBKode(e.target.value.replace(/\D/g, ""))}
                        className="font-mono font-black text-center"
                        style={{ ...getInputStyle(C), width: 88, color: C.accent, flexShrink: 0 }}
                        title={`Nomor otomatis: ${nextNum}. Kosongkan untuk auto.`}
                      />
                    </div>

                    {/* Nama link: Near End <> Far End */}
                    <div className="flex-1">
                      <p className="text-[9px] font-black uppercase tracking-wide mb-1.5" style={{ color: C.textMuted }}>
                        Nama Link (Near End {"<>"} Far End) *
                      </p>
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="TAMBORA <> TANJUNG DUREN UTARA V DIRECT"
                        value={newBBNama}
                        onChange={e => setNewBBNama(e.target.value.toUpperCase())}
                        style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)" }}
                      />
                    </div>
                  </div>
                  <p className="text-[9px]" style={{ color: C.textMuted }}>
                    Nomor dikosongkan → otomatis lanjut dari <span className="font-mono">{nextNum}</span>.
                    Format nama: <span className="font-mono">NEAR_END {"<>"} FAR_END VARIANT</span>
                  </p>
                </div>

                {/* ── Preview ── */}
                {newBBNama.trim() && (
                  <div className="rounded-xl p-3.5" style={{ background: C.base, border: `1px solid ${C.accentBorder}` }}>
                    <p className="text-[9px] uppercase font-black tracking-wide mb-2" style={{ color: C.textMuted }}>
                      Preview — tersimpan ke Supabase
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] uppercase font-bold mb-0.5" style={{ color: C.textMuted }}>KODE BACKBONE</p>
                        <p className="font-mono text-[14px] font-black" style={{ color: C.accent }}>{codeToUse}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase font-bold mb-0.5" style={{ color: C.textMuted }}>NAMA BACKBONE</p>
                        <p className="font-mono text-[11px] break-all" style={{ color: C.text }}>{newBBNama.trim().toUpperCase()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Hint: atur kaki backbone via Management Backbone PoP ── */}
                {newBBNama.trim() && !newBBNama.toUpperCase().startsWith("POP") && (
                  <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                       style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <MapPin size={12} style={{ color: "#10b981", flexShrink: 0 }} />
                    <p className="text-[10px]" style={{ color: "#10b981" }}>
                      Setelah disimpan, link ke PoP via tombol <strong>"BB PoP"</strong> di header.
                    </p>
                  </div>
                )}
              </div>

              <ModalFooter>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-mono" style={{ color: C.textMuted }}>
                    {newBBNama.trim()
                      ? `${codeToUse} — ${newBBNama.trim().toUpperCase()}`
                      : "Isi nama link terlebih dahulu"}
                  </span>
                  {!canApproveKode && (
                    <span className="text-[9px] font-semibold" style={{ color: "#f59e0b" }}>
                      ⚠ Request akan menunggu persetujuan ADMIN
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowAddBBModal(false); setNewBBKode(""); setNewBBNama(""); }}
                    className="px-5 py-2 text-sm font-semibold rounded-lg"
                    style={{ color: C.textSec }}>Batal</button>
                  <button type="submit" disabled={!newBBNama.trim() || addBBLoading}
                    className="px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-40"
                    style={{
                      background: canApproveKode ? C.accent : "#f59e0b",
                      color: "#111110"
                    }}>
                    {addBBLoading
                      ? "Menyimpan..."
                      : canApproveKode
                        ? "Simpan ke Index"
                        : "Kirim Request"}
                  </button>
                </div>
              </ModalFooter>
            </form>
          </Modal>
        );
      })()}

      {/* ══ MODAL: SUPER_DEV Panel ══ */}
      {showSDModal && (
        <Modal title="🔐 SUPER_DEV Panel"
               sub={sdPinVerified ? "Login sebagai: SUPER_DEV" : "Masukkan PIN untuk akses"}
               onClose={() => { setShowSDModal(false); setSdPinVerified(false); setSdPin(""); setSdTab("creds"); }}>
          <div className="p-4 sm:p-6 space-y-4">
            {!sdPinVerified ? (
              /* PIN entry */
              <div className="max-w-xs mx-auto space-y-3">
                <p className="text-sm text-center" style={{ color: C.textSec }}>Masukkan SUPER_DEV PIN</p>
                <input
                  type="password"
                  value={sdPin}
                  onChange={e => setSdPin(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter") {
                      setSdLoading(true);
                      const res = await fetch("/api/odoo-credentials", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "verify", pin: sdPin }),
                      });
                      setSdLoading(false);
                      if (res.ok) { setSdPinVerified(true); }
                      else { toast.error("PIN salah"); setSdPin(""); }
                    }
                  }}
                  placeholder="PIN..."
                  className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-xl outline-none"
                  style={getInputStyle(C)}
                  autoFocus
                />
                <button disabled={sdLoading}
                  onClick={async () => {
                    setSdLoading(true);
                    const res = await fetch("/api/odoo-credentials", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "verify", pin: sdPin }),
                    });
                    setSdLoading(false);
                    if (res.ok) { setSdPinVerified(true); }
                    else { toast.error("PIN salah"); setSdPin(""); }
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
                  {sdLoading ? "Verifying..." : "Masuk"}
                </button>
              </div>
            ) : (
              /* Verified — tab view */
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
                  {(["creds","backbone","info"] as const).map(tab => (
                    <button key={tab} onClick={() => setSdTab(tab)}
                      className="px-3 py-2 text-[11px] font-bold transition-colors -mb-px border-b-2"
                      style={{
                        borderColor: sdTab === tab ? C.accent : "transparent",
                        color: sdTab === tab ? C.accent : C.textSec,
                      }}>
                      {tab === "creds" ? "Odoo Credentials" : tab === "backbone" ? "Request Backbone" : "Build Info"}
                    </button>
                  ))}
                </div>

                {sdTab === "creds" && (
                  <div className="space-y-3">
                    <p className="text-[11px]" style={{ color: C.textSec }}>Status integrasi Odoo per user</p>
                    <div className="rounded-xl p-3 text-[11px] space-y-2" style={{ background: C.base, border: `1px solid ${C.border}` }}>
                      <p style={{ color: C.text }}>🔗 <strong>Sistem baru:</strong> setiap user input API Key Odoo sendiri.</p>
                      <p style={{ color: C.textMuted }}>• User: <strong>Profil → Integrasi Odoo</strong></p>
                      <p style={{ color: C.textMuted }}>• Admin: <strong>Team Management → Tab Integrasi Odoo</strong></p>
                      <p style={{ color: C.textMuted }}>• Fallback: ENV <code>ODOO_USERNAME</code> + <code>ODOO_API_KEY</code></p>
                    </div>
                  </div>
                )}

                {sdTab === "backbone" && (
                  <div className="space-y-3">
                    <p className="text-[11px]" style={{ color: C.textSec }}>Tambah backbone baru ke Index NOC</p>
                    <input type="text" value={newBBName} onChange={e => setNewBBName(e.target.value.toUpperCase())}
                      placeholder="Nama link: TAMBORA <> TANJUNG DUREN UTARA V DIRECT"
                      style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)" }} />
                    <p className="text-[9px]" style={{ color: C.textMuted }}>
                      Nomor urut akan di-auto dari index. Format: NEAR_END {"<>"} FAR_END VARIANT
                    </p>
                    <button disabled={newBBLoading || !newBBName.trim()}
                      onClick={async () => {
                        setNewBBLoading(true);
                        try {
                          // Auto-compute next number from existing index
                          const existingNums = indexData
                            .map((d: any) => parseInt((d["KODE BACKBONE"] || "").match(/^(\d+)/)?.[1] ?? "0", 10))
                            .filter((n: number) => n > 0);
                          const nextN = String((existingNums.length ? Math.max(...existingNums) : 0) + 1).padStart(5, "0");
                          const { error } = await supabase.from("Index NOC").insert([{
                            "KODE BACKBONE": nextN,
                            "NAMA BACKBONE": newBBName.trim(),
                          }]);
                          if (error) toast.error("Gagal tambah backbone: " + error.message);
                          else { toast.success(`${nextN} — "${newBBName.trim()}" ditambahkan!`); setNewBBName(""); fetchIndex(); }
                        } finally { setNewBBLoading(false); }
                      }}
                      className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-40"
                      style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
                      {newBBLoading ? "Menambahkan..." : "Tambah Backbone"}
                    </button>
                  </div>
                )}

                {sdTab === "info" && (
                  <div className="rounded-xl p-4 space-y-2 text-[11px]" style={{ background: C.base, border: `1px solid ${C.border}` }}>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Version</span><span className="font-mono font-bold" style={{ color: C.text }}>BizLink v2.0</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Theme</span><span className="font-mono font-bold" style={{ color: C.text }}>{darkMode ? "Dark" : "Light"}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Reports</span><span className="font-mono font-bold" style={{ color: C.text }}>{reports.length} rows</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Build</span><span className="font-mono font-bold" style={{ color: C.text }}>NOC FMI Backbone Monitor</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
          <ModalFooter>
            <span className="text-[10px]" style={{ color: C.textMuted }}>
              {sdPinVerified ? "SUPER_DEV mode aktif" : "Akses terbatas"}
            </span>
            <button onClick={() => { setShowSDModal(false); setSdPinVerified(false); setSdPin(""); setSdTab("creds"); }}
              className="px-4 py-2 text-sm rounded-lg" style={{ color: C.textSec }}>Tutup</button>
          </ModalFooter>
        </Modal>
      )}

      {showReasonModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[80]"
             style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}>
          <form onSubmit={handleReasonSubmit}
                className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {/* Header */}
            <div className="px-6 py-5" style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
              <h2 className="text-base font-black flex items-center gap-2" style={{ color: C.text }}>
                <span className="w-2.5 h-2.5 rounded-full"
                      style={{ background: STATUS_COLOR[reasonTarget] }} />
                Pindahkan ke {reasonTarget}
              </h2>
              <p className="text-xs mt-1 italic" style={{ color: C.textSec }}>
                {pendingDropTicketNo} · Isi alasan untuk melanjutkan
              </p>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="rounded-xl p-4"
                   style={{
                     background: reasonTarget === "CANCEL" ? "rgba(248,113,113,0.05)" : "rgba(251,146,60,0.05)",
                     border:     `1px solid ${reasonTarget === "CANCEL" ? "rgba(248,113,113,0.25)" : "rgba(251,146,60,0.25)"}`,
                   }}>
                <label className="block text-[10px] font-black uppercase mb-2"
                       style={{ color: reasonTarget === "CANCEL" ? "#f87171" : "#fb923c" }}>
                  {reasonTarget === "CANCEL" ? "Alasan Cancel *" : "Alasan Unsolved *"}
                </label>
                <textarea required rows={4} value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  placeholder={
                    reasonTarget === "CANCEL"
                      ? "Jelaskan alasan pembatalan tiket ini..."
                      : "Jelaskan mengapa tiket tidak dapat diselesaikan..."
                  }
                  style={{
                    ...getInputStyle(C), resize: "none", lineHeight: 1.6,
                    border: `1px solid ${reasonTarget === "CANCEL" ? "rgba(248,113,113,0.3)" : "rgba(251,146,60,0.3)"}`,
                  }} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4"
                 style={{ borderTop: `1px solid ${C.border}` }}>
              <button type="button"
                onClick={() => { setShowReasonModal(false); setPendingDropTicketNo(null); setReasonText(""); }}
                className="px-5 py-2 text-sm font-semibold rounded-lg"
                style={{ color: C.textSec }}>
                Batal
              </button>
              <button type="submit" disabled={loading || !reasonText.trim()}
                className="px-6 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40 active:scale-95"
                style={{ background: STATUS_COLOR[reasonTarget] }}>
                {loading ? "Updating..." : `Set ${reasonTarget}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: WA REPORT
      ══════════════════════════════════════════ */}
      {showWAModal && (
        <Modal title="WA Report" sub={`${Object.values(groupedReports).filter(g => isActive(g)).length} tiket aktif · ${formatHariTanggal(new Date())}`}
               onClose={() => { setShowWAModal(false); setWaCopied(false); }} wide>
          <div className="flex flex-col" style={{ maxHeight: "80vh" }}>

            {/* ── Summary Solved (muncul otomatis setelah tiket di-SOLVED) ── */}
            {summaryText && (
              <div className="shrink-0" style={{ borderBottom: `2px solid rgba(52,211,153,0.3)` }}>
                <div className="flex items-center justify-between px-6 py-3"
                     style={{ background: "rgba(52,211,153,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#34d399" }} />
                    <p className="text-[11px] font-black" style={{ color: "#10b981" }}>
                      Summary Tiket Solved — siap kirim ke WA
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(summaryText);
                        toast.success("Summary tersalin!");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      style={{ background: "rgba(52,211,153,0.15)", color: "#10b981", border: "1px solid rgba(52,211,153,0.35)" }}>
                      <Copy size={12} /> Copy Summary
                    </button>
                    <button onClick={() => setSummaryText("")}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none"
                      style={{ color: C.textMuted }}>×</button>
                  </div>
                </div>
                <div className="px-6 pb-4 pt-2">
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono rounded-xl p-4 select-all"
                       style={{ background: C.base, border: `1px solid rgba(52,211,153,0.25)`, color: C.text, maxHeight: 280, overflowY: "auto" }}>
                    {summaryText}
                  </pre>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0"
                 style={{ borderBottom: `1px solid ${C.border}` }}>
              <p className="text-[11px]" style={{ color: C.textMuted }}>
                Report tiket aktif · Copy → kirim ke WA Group
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateWAReport());
                  setWaCopied(true);
                  setTimeout(() => setWaCopied(false), 2500);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: waCopied ? "rgba(52,211,153,0.15)" : C.accentBg,
                  color:      C.accent,
                  border:     `1px solid ${C.accentBorder}`,
                }}>
                {waCopied ? <Check size={14} /> : <Copy size={14} />}
                {waCopied ? "Tersalin!" : "Copy Report"}
              </button>
            </div>

            {/* Report text */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre
                className="text-sm leading-relaxed whitespace-pre-wrap font-mono rounded-xl p-5 select-all"
                style={{
                  background: C.base,
                  border:     `1px solid ${C.border}`,
                  color:      C.text,
                  minHeight:  200,
                  userSelect: "all",
                }}>
                {generateWAReport()}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL: PDF REPORT
      ══════════════════════════════════════════ */}
      {showPDFModal && (
        <Modal title="Download PDF Report" sub="Summary insiden backbone bulanan atau tahunan" onClose={() => setShowPDFModal(false)}>
          <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: "60vh" }}>
            {/* Period type */}
            <div>
              <p className="text-[10px] font-black uppercase mb-2.5" style={{ color: C.textMuted }}>Jenis Laporan</p>
              <div className="flex gap-3">
                {(["monthly","quarterly","yearly"] as ("monthly" | "quarterly" | "yearly")[]).map(t => (
                  <button key={t} type="button" onClick={() => setPdfType(t as "monthly" | "quarterly" | "yearly")}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: pdfType === t ? C.accentBg : C.elevated,
                      color:      pdfType === t ? C.accent   : C.textSec,
                      border:     `1px solid ${pdfType === t ? C.accentBorder : C.border}`,
                    }}>
                    {t === "monthly" ? "📅 Bulanan" : t === "quarterly" ? "📆 Triwulan" : "📆 Tahunan"}
                  </button>
                ))}
              </div>
            </div>

            {/* Period selector */}
            {pdfType === "monthly" ? (
              <FieldWrap label="Pilih Bulan">
                <input type="month" value={pdfMonth}
                  onChange={e => setPdfMonth(e.target.value)}
                  style={getInputStyle(C)} />
              </FieldWrap>
            ) : (
              <div className="space-y-3">
                <FieldWrap label="Pilih Tahun">
                  <select value={pdfYear} onChange={e => setPdfYear(e.target.value)} style={getInputStyle(C)}>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </FieldWrap>
                {pdfType === "quarterly" && (
                  <div>
                    <p className="text-[10px] font-black uppercase mb-2" style={{ color: C.textMuted }}>Pilih Kuartal</p>
                    <div className="flex gap-2">
                      {(["1","2","3","4"] as const).map(q => (
                        <button key={q} type="button" onClick={() => setPdfQuarter(q)}
                          className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                          style={{
                            background: pdfQuarter === q ? C.accentBg : C.elevated,
                            color:      pdfQuarter === q ? C.accent   : C.textSec,
                            border:     `1px solid ${pdfQuarter === q ? C.accentBorder : C.border}`,
                          }}>
                          Q{q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview info */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: C.base, border: `1px solid ${C.border}` }}>
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: C.textMuted }}>Preview Data</p>
              <div className="flex gap-6">
                <div>
                  <p className="text-2xl font-black" style={{ color: C.text }}>{pdfPreviewCount.tickets}</p>
                  <p className="text-[10px]" style={{ color: C.textSec }}>Tiket unik</p>
                </div>
                <div>
                  <p className="text-2xl font-black" style={{ color: C.textSec }}>{pdfPreviewCount.rows}</p>
                  <p className="text-[10px]" style={{ color: C.textSec }}>Total baris</p>
                </div>
              </div>
              {pdfPreviewCount.tickets === 0 && (
                <p className="text-[11px]" style={{ color: "#f87171" }}>⚠ Tidak ada data untuk periode ini</p>
              )}
              <p className="text-[10px]" style={{ color: C.textMuted }}>
                Report akan dibuka di tab baru. Gunakan tombol Cetak untuk simpan sebagai PDF.
              </p>
            </div>

            {/* What's included */}
            <div className="grid grid-cols-3 gap-2">
              {["Kode Backbone","Tanggal","Problem","Jenis Problem","Status Case","SLA","Status","Regional","Priority"].map(item => (
                <div key={item} className="flex items-center gap-1.5 text-[10px]" style={{ color: C.textSec }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.accent }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <ModalFooter>
            <span className="text-[10px]" style={{ color: C.textMuted }}>
              {pdfType === "monthly"   ? `Periode: ${new Date(pdfMonth + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`
                : pdfType === "quarterly" ? `Kuartal Q${pdfQuarter} · ${pdfYear}`
                : `Tahun: ${pdfYear}`}
            </span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPDFModal(false)}
                className="px-5 py-2 text-sm font-semibold rounded-lg" style={{ color: C.textSec }}>
                Batal
              </button>
              <button onClick={generateInteractiveSummary}
                disabled={pdfPreviewCount.tickets === 0 || htmlGenProgress.running}
                className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm disabled:opacity-40 active:scale-95"
                style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                {htmlGenProgress.running
                  ? <>
                      <span className="animate-spin text-xs">⏳</span>
                      Geocoding {htmlGenProgress.done}/{htmlGenProgress.total}...
                    </>
                  : <>🗺 Interactive HTML</>}
              </button>
              <button onClick={generatePDFReport} disabled={pdfPreviewCount.tickets === 0}
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-40 active:scale-95"
                style={{ background: C.btnBg, color: C.btnText }}>
                <FileDown size={14} /> Generate PDF
              </button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL: CREATE INCIDENT
      ══════════════════════════════════════════ */}
      {showInputModal && (
        <Modal title="Input New Backbone Report"
               sub="Satu tiket dapat berisi lebih dari satu backbone link"
               onClose={() => { setShowInputModal(false); setOdooResult(null); setOdooSubject(""); setOdooDescription(""); setLinkRows([{ ...EMPTY_LINK }]); }}>
          <form onSubmit={handleCreateReport}>
            <div className="p-6 space-y-6 overflow-y-auto" style={{ maxHeight: "65vh" }}>

              {/* ── Section 0: Odoo integration ── */}
              <div>
                <SectionLabel num="0" text="Buat Tiket Odoo (Opsional)" />
                <div className="rounded-xl p-4 space-y-3"
                     style={{ background: C.base, border: `1px solid ${C.border}` }}>
                  {odooResult ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#34d399" }} />
                        <span className="text-[11px] font-bold" style={{ color: C.text }}>Tiket Odoo berhasil dibuat</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div><span style={{ color: C.textMuted }}>Nomor: </span>
                          <span className="font-mono font-bold" style={{ color: C.accent }}>{odooResult.ticketNumber}</span></div>
                        <div><span style={{ color: C.textMuted }}>Start: </span>
                          <span className="font-mono" style={{ color: C.text }}>{newReport["Start Time"]}</span></div>
                      </div>
                      <div className="text-[10px] truncate" style={{ color: C.textSec }}>
                        <span style={{ color: C.textMuted }}>Subject: </span>{odooResult.subject}
                      </div>
                      <div className="flex items-center gap-3">
                        <a href={odooResult.odooUrl} target="_blank" rel="noreferrer"
                           className="text-[10px] underline" style={{ color: C.accent }}>Buka di Odoo →</a>
                        <button type="button"
                          onClick={() => { setOdooResult(null); setOdooSubject(""); setOdooDescription(""); }}
                          className="text-[10px]" style={{ color: C.textMuted }}>Reset</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px]" style={{ color: C.textSec }}>
                        Isi subject &amp; description, lalu klik tombol. Nomor tiket, subject, dan start time akan terisi otomatis.
                      </p>

                      {/* ── Subject ── */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>
                          Subject Tiket
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="contoh: MINOR | BACKBONE | MR <> BGS | LOW POWER"
                            value={odooSubject}
                            onChange={e => setOdooSubject(e.target.value)}
                            style={{ ...getInputStyle(C), flex: 1 }}
                          />
                          {/* Auto-generate dari backbone */}
                          {linkRows.some(l => l.kodeBackbone.trim()) && (
                            <button
                              type="button"
                              title="Generate subject dari backbone yang dipilih"
                              onClick={() => {
                                const names = linkRows
                                  .filter(l => l.kodeBackbone.trim())
                                  .map(l => l.namaLink.trim() || l.kodeBackbone.trim());
                                const jenisProb = newReport["Jenis Problem"] || "BACKBONE";
                                const generated = names.length > 1
                                  ? `${jenisProb} | ${names.join(" | ")}`
                                  : `${jenisProb} | ${names[0]}`;
                                setOdooSubject(generated);
                              }}
                              className="px-3 rounded-lg text-xs font-bold flex-shrink-0"
                              style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}` }}>
                              ✨ Auto
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── Description (= Escalation Description) ── */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>
                          Description / Escalation Description
                        </label>
                        <textarea
                          rows={5}
                          placeholder={"Isi detail gangguan, backbone terdampak, tindakan awal, dsb.\n(akan digunakan sebagai Description dan Escalation Description di Odoo)"}
                          value={odooDescription}
                          onChange={e => setOdooDescription(e.target.value)}
                          style={{ ...getInputStyle(C), resize: "vertical", lineHeight: 1.6, fontSize: 12, fontFamily: "var(--font-mono)" }}
                        />
                        <p className="text-[9px]" style={{ color: C.textMuted }}>
                          Teks ini akan diisi ke Description dan Escalation Description secara bersamaan.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!odooSubject.trim() || odooLoading}
                        onClick={async () => {
                          setOdooLoading(true);
                          try {
                            const res = await fetch("/api/odoo-ticket", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                subject:     odooSubject.trim(),
                                description: odooDescription.trim(),
                              }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setOdooResult({ ticketNumber: data.ticketNumber, ticketId: data.ticketId, odooUrl: data.odooUrl, subject: data.subject });
                              setNewReport(r => ({ ...r, "NOMOR TICKET": data.ticketNumber, "Subject Ticket / Email": data.subject, "Start Time": data.startTime }));
                              toast.success(`Tiket Odoo ${data.ticketNumber} berhasil dibuat!`);
                            } else if (data.needsApiKey) {
                              toast.error("⚠️ Odoo API Key belum dikonfigurasi", {
                                description: "Buka Profil → Integrasi Odoo untuk input API Key kamu.",
                                duration: 7000,
                                action: { label: "Buka Profil", onClick: () => window.open("/profile", "_blank") },
                              });
                            } else {
                              toast.error("Gagal buat tiket: " + data.error);
                            }
                          } catch (err: any) {
                            toast.error("Error: " + err.message);
                          } finally {
                            setOdooLoading(false);
                          }
                        }}
                        className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-40"
                        style={{ background: C.accent, color: darkMode ? "#111110" : "#f6f7ed" }}>
                        {odooLoading ? "Membuat tiket Odoo... (escalating)" : "🎫 Buat Tiket Odoo"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <SectionLabel num="1" text="Informasi Tiket" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldWrap label="Hari dan Tanggal Report">
                    <input type="date" required style={getInputStyle(C)} value={newReport["Hari dan Tanggal Report"]}
                      onChange={e => setNewReport({ ...newReport, "Hari dan Tanggal Report": e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Open Ticket (Team)">
                    <select required style={getInputStyle(C)} value={newReport["Open Ticket"]}
                      onChange={e => setNewReport({ ...newReport, "Open Ticket": e.target.value })}>
                      <option value="">-- Pilih Team --</option>
                      {getOptions("TEAM").map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </FieldWrap>
                  <FieldWrap label="Nomor Ticket">
                    <input type="text" required placeholder="TKT-XXXXXXXX"
                      style={{ ...getInputStyle(C), color: C.accent, fontFamily: "var(--font-mono)", fontWeight: 700 }}
                      value={newReport["NOMOR TICKET"]}
                      onChange={e => setNewReport({ ...newReport, "NOMOR TICKET": e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Subject Ticket / Email">
                    <input type="text" required style={getInputStyle(C)} value={newReport["Subject Ticket / Email"]}
                      onChange={e => setNewReport({ ...newReport, "Subject Ticket / Email": e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Jenis Problem">
                    <select required style={getInputStyle(C)} value={newReport["Jenis Problem"]}
                      onChange={e => setNewReport({ ...newReport, "Jenis Problem": e.target.value })}>
                      <option value="">-- Pilih Jenis Problem --</option>
                      {getOptions("JENIS PROBLEM").map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </FieldWrap>
                  <FieldWrap label="Status Case">
                    <select required style={getInputStyle(C)} value={newReport["Status Case"]}
                      onChange={e => setNewReport({ ...newReport, "Status Case": e.target.value })}>
                      <option value="">-- Pilih Status --</option>
                      {getOptions("STATUS CASE").map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </FieldWrap>
                  <FieldWrap label="Start Time">
                    <input type="text" required placeholder="01/03/2026 11:47:00"
                      style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)" }}
                      value={newReport["Start Time"]}
                      onChange={e => setNewReport({ ...newReport, "Start Time": e.target.value })} />
                    <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>Format: DD/MM/YYYY HH:MM:SS — bisa di-copy paste</p>
                  </FieldWrap>
                  <FieldWrap label="Priority">
                    <select required style={getInputStyle(C)} value={newReport["Priority"]}
                      onChange={e => setNewReport({ ...newReport, "Priority": e.target.value })}>
                      <option value="">-- Pilih Priority --</option>
                      {getOptions("PRIORITY").map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </FieldWrap>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <SectionLabel num="2" text={`Kode Backbone${linkRows.filter(l => l.kodeBackbone.trim()).length > 1 ? ` (${linkRows.filter(l => l.kodeBackbone.trim()).length} link)` : ""}`} />
                  <div className="flex gap-2">
                    {/* Tambah baris backbone di form ini */}
                    <button
                      type="button"
                      onClick={addLink}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold"
                      style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}` }}>
                      + Tambah Backbone
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {linkRows.map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        {/* ── Kode Backbone combobox ── */}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <SearchableCombobox
                              value={row.kodeBackbone}
                              onChange={kode => updateLinkKode(i, kode)}
                              options={kodeOptions}
                              placeholder={`Backbone ${i + 1} — pilih kode...`}
                              accentColor={C.accent}
                            />
                          </div>
                          {/* Kapasitas input — selalu tampil jika kode sudah dipilih */}
                          {row.kodeBackbone && (
                            <input
                              type="text"
                              maxLength={10}
                              value={row.capacity}
                              onChange={e => updateLink(i, "capacity", e.target.value.toUpperCase())}
                              placeholder="10G"
                              title="Kapasitas yang down (contoh: 10G, 100G)"
                              style={{
                                ...getInputStyle(C),
                                width: 72,
                                flexShrink: 0,
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                textAlign: "center",
                                paddingLeft: 8,
                                paddingRight: 8,
                              }}
                            />
                          )}
                        </div>

                        {/* ── MON-CORE: input label Near End <> Far End ── */}
                        {isMonCore(row.kodeBackbone) && (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded"
                                  style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", fontFamily: "var(--font-mono)" }}>
                              MON-CORE
                            </span>
                            <input
                              type="text"
                              value={row.namaLink}
                              onChange={e => updateLink(i, "namaLink", e.target.value.toUpperCase())}
                              placeholder="MR <> VETERAN V PETOJO"
                              title="Isi Near End <> Far End untuk backbone MON-CORE ini"
                              style={{ ...getInputStyle(C), flex: 1, fontFamily: "var(--font-mono)", fontSize: 11 }}
                            />
                          </div>
                        )}

                        {/* ── Info: kode + nama untuk backbone biasa ── */}
                        {row.kodeBackbone && !isMonCore(row.kodeBackbone) && (
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: C.textSec }}>
                            <span className="font-mono px-1.5 py-0.5 rounded"
                                  style={{ background: C.accentBg, color: C.accent }}>
                              {row.kodeBackbone}
                            </span>
                            {backboneKodeToNama[row.kodeBackbone] && (
                              <>
                                <span style={{ color: C.textMuted }}>↔</span>
                                <span className="truncate">{backboneKodeToNama[row.kodeBackbone]}</span>
                              </>
                            )}
                            {row.capacity && (
                              <span className="font-mono font-bold px-1.5 py-0.5 rounded ml-1"
                                    style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                                {row.capacity}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Tombol hapus (hanya tampil jika lebih dari 1 row) */}
                      {linkRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLink(i)}
                          className="mt-1 w-7 h-7 flex items-center justify-center rounded-lg text-sm flex-shrink-0"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
                          title="Hapus backbone ini">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <ModalFooter>
              {(() => {
                const valid = linkRows.filter(l => l.kodeBackbone.trim());
                const label = (l: LinkRow) => {
                  const base = isMonCore(l.kodeBackbone) && l.namaLink
                    ? `MON-CORE (${l.namaLink})`
                    : l.kodeBackbone;
                  return l.capacity ? `${base} ${l.capacity}` : base;
                };
                return (
                  <span className="text-[10px]" style={{ color: C.textMuted }}>
                    {valid.length === 0
                      ? "Belum ada kode backbone dipilih"
                      : valid.length === 1
                        ? `1 backbone: ${label(valid[0])}`
                        : `${valid.length} backbone: ${valid.map(label).join(", ")}`}
                  </span>
                );
              })()}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowInputModal(false); setOdooResult(null); setOdooSubject(""); setOdooDescription(""); setLinkRows([{ ...EMPTY_LINK }]); }}
                  className="px-5 py-2 text-sm font-semibold rounded-lg" style={{ color: C.textSec }}>Batal</button>
                <button type="submit" disabled={loading}
                  className="px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50 active:scale-95"
                  style={{ background: C.btnBg, color: C.btnText }}>
                  {loading ? "Menyimpan..." : (() => {
                    const n = linkRows.filter(l => l.kodeBackbone.trim()).length;
                    return n > 1 ? `Simpan ${n} Backbone` : "Simpan Report";
                  })()}
                </button>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL: DETAIL TICKET
      ══════════════════════════════════════════ */}
      {showDetailModal && selectedTicketGroup.length > 0 && (
        <Modal title={selectedTicketGroup[0]["NOMOR TICKET"]}
               sub={selectedTicketGroup[0]["Subject Ticket / Email"] || "No Subject"}
               onClose={() => setShowDetailModal(false)} wide>
          <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: "70vh" }}>
            <div className="flex gap-3 flex-wrap">
              {[
                { l: "Total Link",    v: `${selectedTicketGroup.length}`,                                                          c: C.text    },
                { l: "Pending",       v: `${selectedTicketGroup.filter((r:any) => r["Status Case"] !== "SOLVED").length}`,         c: "#f5c842" },
                { l: "Solved",        v: `${selectedTicketGroup.filter((r:any) => r["Status Case"] === "SOLVED").length}`,         c: "#10b981" },
                { l: "Jenis Problem", v: selectedTicketGroup[0]["Jenis Problem"] || "—",                                          c: "#fb923c" },
                { l: "Priority",      v: selectedTicketGroup[0]["Priority"] || "—",
                  c: selectedTicketGroup[0]["Priority"] === "CRITICAL" ? "#f87171" : "#fb923c" },
              ].map(({ l, v, c }) => (
                <div key={l} className="px-4 py-2.5 rounded-xl"
                     style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>{l}</p>
                  <p className="text-sm font-black" style={{ color: c }}>{v}</p>
                </div>
              ))}
            </div>

            {/* ── SLA LIVE COUNTDOWN — hanya untuk tiket aktif ── */}
            {(() => {
              const tNo    = selectedTicketGroup[0]["NOMOR TICKET"];
              const st     = selectedTicketGroup[0]["Start Time"];
              const et     = selectedTicketGroup[0]["End Time"];
              const status = getTicketStatus(selectedTicketGroup);
              if (!st || et || ["SOLVED","UNSOLVED","CANCEL"].includes(status)) return null;
              const ticketSCs = stopClocks.filter(c => c.ticket_no === tNo);
              const scInfo    = getStopClockInfo(tNo, stopClocks);
              // Hitung pause menit untuk label
              const pausedMs  = ticketSCs.reduce((acc, c) => {
                const s = new Date(c.started_at).getTime();
                const e = c.ended_at ? new Date(c.ended_at).getTime() : Date.now();
                return acc + Math.max(0, e - s);
              }, 0);
              const pausedMin = Math.floor(pausedMs / 60_000);
              return (
                <div className="rounded-xl p-4 flex items-center gap-5 flex-wrap"
                     style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  {/* Countdown widget */}
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <SLACountdown startTime={st} ticketNo={tNo} stopClocksForTicket={ticketSCs} />
                  </div>
                  {/* Info teks */}
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: "#10b981" }}>
                      SLA Live Countdown
                    </p>
                    <p className="text-[11px] leading-relaxed" style={{ color: C.textMuted }}>
                      Batas SLA 7 jam sejak insiden.<br />
                      Countdown otomatis berhenti saat Stop Clock aktif.
                    </p>
                    {scInfo.hasActive && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold mt-2 px-2 py-0.5 rounded"
                            style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                        Stop Clock sedang aktif
                      </span>
                    )}
                    {!scInfo.hasActive && pausedMin > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: "#fb923c" }}>
                        ⏸ Total jeda: {formatMTTR(pausedMin)} (sudah dikurangi)
                      </p>
                    )}
                  </div>
                  {/* MTTR live — sudah dikurangi stop clock */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>MTTR Live</p>
                    <p className="text-lg font-black font-mono" style={{ color: C.text }}>
                      <LiveMTTR startTime={st} stopClocksForTicket={ticketSCs} />
                    </p>
                    {pausedMin > 0 && (
                      <p className="text-[9px] mt-0.5" style={{ color: C.textMuted }}>efektif (−{formatMTTR(pausedMin)})</p>
                    )}
                  </div>
                </div>
              );
            })()}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.accent }}>Backbone Links</p>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                      {["#","Kode","Near End","Far End","MTTR","SLA","Status"].map(h => (
                        <th key={h} className="px-4 py-3 text-left"
                            style={{ color: C.textMuted, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing:"0.08em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTicketGroup.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.elevated)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td className="px-4 py-3 font-mono text-[10px]" style={{ color: C.textMuted }}>{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="font-mono text-[10px] px-2 py-0.5 rounded"
                                 style={{ background: C.accentBg, color: C.accent }}>{item["Kode Backbone"] || "—"}</div>
                            {item["Kapasitas"] && (
                              <div className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                                   style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                                {item["Kapasitas"]}
                              </div>
                            )}
                          </div>
                          {item["Nama Link"] && (
                            <div className="text-[9px] mt-0.5 truncate max-w-[160px]" style={{ color: C.textMuted }}>{item["Nama Link"]}</div>
                          )}
                        </td>
                        {/* Near End — tampilkan hasil parse multi-port */}
                        <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]" style={{ color: C.textSec }}>
                          {item["Near End"] ? (() => {
                            const parsed = parseMultiPortPower(item["Near End"]);
                            const portLines = parsed.split("\n").filter(l => l.startsWith(">"));
                            if (portLines.length >= 2) {
                              return (
                                <span title={item["Near End"]} className="cursor-help">
                                  <div className="space-y-0.5">
                                    {portLines.map((pl, pi) => <div key={pi}>{pl}</div>)}
                                  </div>
                                </span>
                              );
                            }
                            const display = parsed.startsWith(">") ? parsed : (parsed.length > 50 ? parsed.slice(0, 50) + "…" : parsed);
                            return <span title={item["Near End"]} className="cursor-help">{display || "—"}</span>;
                          })() : "—"}
                        </td>
                        {/* Far End — tampilkan hasil parse multi-port */}
                        <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]" style={{ color: C.textSec }}>
                          {item["Far End"] ? (() => {
                            const parsed = parseMultiPortPower(item["Far End"]);
                            const portLines = parsed.split("\n").filter(l => l.startsWith(">"));
                            if (portLines.length >= 2) {
                              return (
                                <span title={item["Far End"]} className="cursor-help">
                                  <div className="space-y-0.5">
                                    {portLines.map((pl, pi) => <div key={pi}>{pl}</div>)}
                                  </div>
                                </span>
                              );
                            }
                            const display = parsed.startsWith(">") ? parsed : (parsed.length > 50 ? parsed.slice(0, 50) + "…" : parsed);
                            return <span title={item["Far End"]} className="cursor-help">{display || "—"}</span>;
                          })() : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-center" style={{ color: C.textSec }}>
                          {(() => {
                            const st  = selectedTicketGroup[0]["Start Time"];
                            const et  = selectedTicketGroup[0]["End Time"];
                            const tNo = selectedTicketGroup[0]["NOMOR TICKET"];
                            if (st && et) {
                              const raw     = calcMTTRMinutes(st, et);
                              const paused  = calcTotalPausedMinutes(
                                stopClocks.filter(c => c.ticket_no === tNo),
                                parseDateTime(et)
                              );
                              return formatMTTR(Math.max(0, raw - paused));
                            }
                            return item["MTTR"] != null ? formatMTTR(item["MTTR"]) : "—";
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-[10px] font-black">
                          {(() => {
                            const st  = selectedTicketGroup[0]["Start Time"];
                            const et  = selectedTicketGroup[0]["End Time"];
                            const tNo = selectedTicketGroup[0]["NOMOR TICKET"];
                            if (st && et) {
                              const raw    = calcMTTRMinutes(st, et);
                              const paused = calcTotalPausedMinutes(
                                stopClocks.filter(c => c.ticket_no === tNo),
                                parseDateTime(et)
                              );
                              const ok = calcSLAFromMinutes(Math.max(0, raw - paused)).isOK;
                              return <span style={{ color: ok ? "#10b981" : "#f87171" }}>{ok ? "OK" : "NOK"}</span>;
                            }
                            return <span style={{ color: item["SLA"] === "OK" ? "#10b981" : item["SLA"] === "NOK" ? "#f87171" : C.textMuted }}>
                              {item["SLA"] || "—"}
                            </span>;
                          })()}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={item["Status Case"] || "OPEN"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoCard title="Personil">
                <InfoRow label="Open By"     value={selectedTicketGroup[0]["Open Ticket"] || "—"} />
                <InfoRow label="Closed By"   value={selectedTicketGroup[0]["Closed Ticket"] || "—"} />
                <InfoRow label="Report Date" value={selectedTicketGroup[0]["Hari dan Tanggal Report"] || "—"} />
                <InfoRow label="Closed Date" value={selectedTicketGroup[0]["Hari dan Tanggal Closed"] || "—"} />
              </InfoCard>
              <InfoCard title="Timeline">
                <InfoRow label="Start Time" value={selectedTicketGroup[0]["Start Time"] || "—"} mono />
                <InfoRow label="End Time"   value={selectedTicketGroup[0]["End Time"] || "—"} mono />
                <InfoRow label="Problem"    value={selectedTicketGroup[0]["Problem"] || "—"} color="#fb923c" />
              </InfoCard>
              <InfoCard title="SLA & Metrics">
                <InfoRow label="Priority" value={selectedTicketGroup[0]["Priority"] || "—"}
                  color={selectedTicketGroup[0]["Priority"] === "CRITICAL" ? "#f87171" : "#fb923c"} />
                {(() => {
                  const tNo = selectedTicketGroup[0]["NOMOR TICKET"];
                  const st  = selectedTicketGroup[0]["Start Time"];
                  const et  = selectedTicketGroup[0]["End Time"];
                  const ticketSCs = stopClocks.filter(c => c.ticket_no === tNo);
                  const pausedMin = ticketSCs.length > 0
                    ? calcTotalPausedMinutes(ticketSCs, et ? parseDateTime(et) : undefined)
                    : 0;

                  if (st && et) {
                    // Tiket sudah SOLVED — tampilkan MTTR efektif (dikurangi stop clock)
                    const mttrRaw  = calcMTTRMinutes(st, et);
                    const mttrEff  = Math.max(0, mttrRaw - pausedMin);
                    const sla      = calcSLAFromMinutes(mttrEff);
                    return <>
                      <InfoRow label="MTTR (efektif)" value={formatMTTR(mttrEff)} mono />
                      {pausedMin > 0 && (
                        <InfoRow label="Stop Clock" value={`−${formatMTTR(pausedMin)}`} color="#fb923c" />
                      )}
                      <InfoRow label="SLA" value={sla.isOK ? "OK" : "NOK"}
                        color={sla.isOK ? "#10b981" : "#f87171"} />
                    </>;
                  }
                  // Tiket masih aktif — tampilkan MTTR live
                  return <>
                    <InfoRow label="MTTR Live" value="" mono>
                      <span className="text-sm font-black font-mono" style={{ color: C.text }}>
                        <LiveMTTR startTime={st} stopClocksForTicket={ticketSCs} />
                      </span>
                    </InfoRow>
                    {pausedMin > 0 && (
                      <InfoRow label="Jeda (Stop Clock)" value={`−${formatMTTR(pausedMin)}`} color="#fb923c" />
                    )}
                    <InfoRow label="SLA" value="↑ Lihat countdown" color="#10b981" />
                  </>;
                })()}
              </InfoCard>
            </div>

            {/* Lokasi: Regional + Alamat Problem */}
            {(selectedTicketGroup[0]["Regional"] || selectedTicketGroup[0]["Alamat Problem"]) && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: C.base, border: `1px solid ${C.border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.accent }}>Lokasi</p>
                <div className="flex gap-8 flex-wrap">
                  {[
                    { l: "Regional",       v: selectedTicketGroup[0]["Regional"] },
                    { l: "Alamat Problem", v: selectedTicketGroup[0]["Alamat Problem"] },
                  ].filter(x => x.v).map(({ l, v }) => (
                    <div key={l}>
                      <span className="text-xs block mb-0.5" style={{ color: C.textSec }}>{l}</span>
                      <span className="text-sm font-semibold" style={{ color: C.text }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Koordinat — card penuh dengan URL clickable */}
            {selectedTicketGroup[0]["Titik Kordinat Cut / Bending"] && (
              <div className="rounded-xl p-5" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.accent }}>
                  Koordinat
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.textSec }}>
                  {renderWithLinks(selectedTicketGroup[0]["Titik Kordinat Cut / Bending"])}
                </p>
              </div>
            )}

            {/* Problem & Action */}
            <div className="rounded-xl p-5" style={{ background: C.elevated, border: `1px solid ${C.accentBorder}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.accent }}>Problem & Action</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.textSec }}>
                {selectedTicketGroup[0]["Problem & Action"]
                  ? renderWithLinks(selectedTicketGroup[0]["Problem & Action"])
                  : "Belum ada tindakan yang dicatat."}
              </p>
            </div>
          </div>
          <ModalFooter>
            <span />
            <div className="flex gap-3">
              {/* Tambah Impact Backbone — selalu tersedia */}
              <button
                onClick={() => {
                  setImpactRows([{ kode: "", nama: "", kapasitas: "" }]);
                  setShowAddImpactModal(true);
                }}
                className="px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5"
                style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
                <Plus size={13} /> Tambah Impact
              </button>

              {/* Tombol "Lihat Summary" — hanya untuk tiket SOLVED */}
              {getTicketStatus(selectedTicketGroup) === "SOLVED" && (
                <button
                  onClick={() => {
                    // Rekonstruksi summary dari data yang sudah tersimpan
                    const f = selectedTicketGroup[0];
                    const solveData = {
                      "Problem":                      f["Problem"] || "",
                      "Problem & Action":             f["Problem & Action"] || "",
                      "Titik Kordinat Cut / Bending": f["Titik Kordinat Cut / Bending"] || "",
                      "End Time":                     f["End Time"] || "",
                      "Closed Ticket":                f["Closed Ticket"] || "",
                      "Hari dan Tanggal Closed":      f["Hari dan Tanggal Closed"] || "",
                    };
                    const nearFarData: Record<number, { nearEnd: string; farEnd: string }> = {};
                    selectedTicketGroup.forEach((r: any) => {
                      nearFarData[r.id] = { nearEnd: r["Near End"] || "", farEnd: r["Far End"] || "" };
                    });
                    const summary = buildSolvedSummary(selectedTicketGroup, solveData, nearFarData);
                    setSummaryText(summary);
                    setShowDetailModal(false);
                    setShowWAModal(true);
                  }}
                  className="px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                  <MessageSquare size={13} /> Lihat Summary
                </button>
              )}
              <button onClick={() => setShowDetailModal(false)}
                className="px-6 py-2 rounded-lg font-bold text-sm"
                style={{ background: C.elevated, color: C.text, border: `1px solid ${C.border}` }}>Tutup</button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL: TAMBAH IMPACT BACKBONE
      ══════════════════════════════════════════ */}
      {showAddImpactModal && selectedTicketGroup.length > 0 && (() => {
        const base = selectedTicketGroup[0];
        const ticketNo = base["NOMOR TICKET"];
        const subject  = base["Subject Ticket / Email"];

        // Backbone lookup: kode → nama (sama seperti form create)
        const kodeToNama: Record<string, string> = {};
        const namaToKode: Record<string, string> = {};
        indexData.forEach((d: any) => {
          const raw = (d["KODE BACKBONE"] || "").trim();
          const m   = raw.match(/^(\d+)(?:\/(.+))?$/);
          const kode = m ? m[1] : raw;
          const nama = (d["NAMA BACKBONE"] || m?.[2] || "").trim();
          if (kode) { kodeToNama[kode] = nama; namaToKode[nama] = kode; }
        });
        const kodeOptions = Object.keys(kodeToNama).sort();

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          const valid = impactRows.filter(r => r.kode.trim() || r.nama.trim());
          if (!valid.length) { toast.error("Isi minimal 1 kode backbone."); return; }
          setAddImpactLoading(true);
          try {
            const rows = valid.map(r => ({
              "NOMOR TICKET":            ticketNo,
              "Subject Ticket / Email":  subject,
              "Hari dan Tanggal Report": base["Hari dan Tanggal Report"] || "",
              "Open Ticket":             base["Open Ticket"] || "",
              "Jenis Problem":           base["Jenis Problem"] || "",
              "Status Case":             base["Status Case"] || "OPEN",
              "Start Time":              base["Start Time"] || "",
              "Priority":                base["Priority"] || "",
              "Regional":                base["Regional"] || "",
              "Alamat Problem":          base["Alamat Problem"] || "",
              "Titik Kordinat Cut / Bending": base["Titik Kordinat Cut / Bending"] || "",
              "Kode Backbone":           r.kode.trim(),
              "Nama Link":               r.nama.trim() || kodeToNama[r.kode.trim()] || "",
              "Kapasitas":               r.kapasitas.trim() || null,
            }));
            const { error } = await supabase.from("Report Backbone").insert(rows);
            if (error) throw error;
            toast.success(`✅ ${rows.length} backbone tambahan berhasil ditambahkan ke ${ticketNo}`);
            setShowAddImpactModal(false);
            setShowDetailModal(false);
            await fetchData();
          } catch (err: any) {
            toast.error("Gagal: " + err.message);
          } finally {
            setAddImpactLoading(false);
          }
        };

        return (
          <Modal
            title="Tambah Impact Backbone"
            sub={`${ticketNo} · ${subject}`}
            onClose={() => setShowAddImpactModal(false)}
            wide>
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>

                {/* Info tiket */}
                <div className="rounded-xl p-4" style={{ background: C.base, border: `1px solid ${C.border}` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>Info Tiket Induk</p>
                  <div className="flex gap-6 flex-wrap text-xs">
                    {[
                      ["Status",   base["Status Case"] || "—"],
                      ["Jenis",    base["Jenis Problem"] || "—"],
                      ["Priority", base["Priority"] || "—"],
                      ["Regional", base["Regional"] || "—"],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <span style={{ color: C.textMuted }} className="block text-[9px] font-bold uppercase mb-0.5">{l}</span>
                        <span style={{ color: C.text }} className="font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Existing links */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.textMuted }}>
                    Backbone Existing ({selectedTicketGroup.length} link)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicketGroup.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                           style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                        <span className="font-mono font-black" style={{ color: C.accent }}>{r["Kode Backbone"] || "—"}</span>
                        {r["Nama Link"] && <span style={{ color: C.textSec }}>{r["Nama Link"]}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rows baru */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.textMuted }}>
                      Backbone Tambahan
                    </p>
                    <button type="button"
                      onClick={() => setImpactRows(r => [...r, { kode: "", nama: "", kapasitas: "" }])}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold"
                      style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}` }}>
                      <Plus size={11} /> Tambah Baris
                    </button>
                  </div>

                  <div className="space-y-3">
                    {impactRows.map((row, idx) => (
                      <div key={idx} className="rounded-xl p-4 space-y-3" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black" style={{ color: C.textMuted }}>Link #{idx + 1}</span>
                          {impactRows.length > 1 && (
                            <button type="button"
                              onClick={() => setImpactRows(r => r.filter((_, i) => i !== idx))}
                              className="text-[11px] font-bold px-2 py-0.5 rounded"
                              style={{ color: "#f87171", background: "rgba(248,113,113,0.1)" }}>✕</button>
                          )}
                        </div>

                        {/* Kode Backbone — datalist untuk autocomplete */}
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wide block mb-1" style={{ color: C.textMuted }}>
                            Kode Backbone <span style={{ color: "#f87171" }}>*</span>
                          </label>
                          <input
                            list={`kode-list-${idx}`}
                            type="text"
                            placeholder="Cari kode atau nama..."
                            value={row.kode}
                            required
                            onChange={e => {
                              const val = e.target.value;
                              // Auto-fill nama dari kode
                              const nama = kodeToNama[val.trim()] || namaToKode[val.trim()] ? val.trim() : "";
                              setImpactRows(r => r.map((x, i) => i === idx
                                ? { ...x, kode: val, nama: kodeToNama[val.trim()] || x.nama }
                                : x));
                            }}
                            className="w-full font-mono"
                            style={getInputStyle(C)}
                          />
                          <datalist id={`kode-list-${idx}`}>
                            {kodeOptions.map(k => (
                              <option key={k} value={k}>{kodeToNama[k]}</option>
                            ))}
                          </datalist>
                        </div>

                        {/* Nama Link — auto-fill dari kode, bisa override */}
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wide block mb-1" style={{ color: C.textMuted }}>
                            Nama Link
                          </label>
                          <input
                            type="text"
                            placeholder={kodeToNama[row.kode.trim()] || "Auto dari kode atau isi manual"}
                            value={row.nama}
                            onChange={e => setImpactRows(r => r.map((x, i) => i === idx ? { ...x, nama: e.target.value.toUpperCase() } : x))}
                            style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)", fontSize: 11 }}
                            className="w-full"
                          />
                          {kodeToNama[row.kode.trim()] && !row.nama && (
                            <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>
                              Auto: {kodeToNama[row.kode.trim()]}
                            </p>
                          )}
                        </div>

                        {/* Kapasitas */}
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wide block mb-1" style={{ color: C.textMuted }}>
                            Kapasitas (opsional)
                          </label>
                          <input
                            type="text"
                            placeholder="mis. 10G, 100G"
                            value={row.kapasitas}
                            onChange={e => setImpactRows(r => r.map((x, i) => i === idx ? { ...x, kapasitas: e.target.value.toUpperCase() } : x))}
                            style={{ ...getInputStyle(C), width: 140 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview summary */}
                {impactRows.some(r => r.kode.trim()) && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "#60a5fa" }}>Preview — akan ditambahkan</p>
                    <div className="space-y-1.5">
                      {impactRows.filter(r => r.kode.trim()).map((r, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-black w-14" style={{ color: "#60a5fa" }}>{r.kode.trim()}</span>
                          <span style={{ color: C.textSec }}>{r.nama.trim() || kodeToNama[r.kode.trim()] || "—"}</span>
                          {r.kapasitas && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>{r.kapasitas}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <ModalFooter>
                <p className="text-[10px]" style={{ color: C.textMuted }}>
                  {impactRows.filter(r => r.kode.trim()).length} backbone akan ditambahkan ke {ticketNo}
                </p>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setShowAddImpactModal(false)}
                    className="px-5 py-2 text-sm font-semibold rounded-lg"
                    style={{ color: C.textSec }}>Batal</button>
                  <button type="submit"
                    disabled={addImpactLoading || !impactRows.some(r => r.kode.trim())}
                    className="px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-40 flex items-center gap-2"
                    style={{ background: "#60a5fa", color: "#0f172a" }}>
                    {addImpactLoading ? <><span className="animate-spin text-xs">⏳</span> Menyimpan...</> : <><Plus size={13} /> Simpan Impact</>}
                  </button>
                </div>
              </ModalFooter>
            </form>
          </Modal>
        );
      })()}

      {/* ══════════════════════════════════════════
          MODAL: UPDATE TICKET
      ══════════════════════════════════════════ */}
      {showSolveModal && selectedTicketGroup.length > 0 && (
        <Modal title="Update Ticket"
               sub={`${selectedTicketGroup[0]?.["NOMOR TICKET"]} · ${selectedTicketGroup[0]?.["Subject Ticket / Email"]}`}
               onClose={closeSolveModal}>
          <form onSubmit={handleSolveSubmit}>
            <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: "65vh" }}>

              <div>
                <p className="text-[10px] font-black uppercase mb-2.5" style={{ color: C.textMuted }}>Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {(["ON PROGRESS","PENDING","UNSOLVED","SOLVED","CANCEL"] as SolveAction[]).map(action => {
                    const ac     = STATUS_COLOR[action];
                    const active = solveAction === action;
                    return (
                      <button key={action} type="button" onClick={() => setSolveAction(action)}
                        className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all"
                        style={{
                          background: active ? ac : `${ac}15`,
                          color:      active ? (action === "PENDING" ? "#0f172a" : "#fff") : ac,
                          border:     `1px solid ${active ? ac : `${ac}40`}`,
                        }}>{action}</button>
                    );
                  })}
                </div>
                <p className="text-[10px] mt-2" style={{ color: C.textMuted }}>
                  Update berlaku untuk semua {selectedTicketGroup.length} backbone link dalam tiket ini
                </p>
              </div>

              {(solveAction === "CANCEL" || solveAction === "UNSOLVED") && (
                <div className="rounded-xl p-4"
                     style={{
                       background: solveAction === "CANCEL" ? "rgba(248,113,113,0.05)" : "rgba(251,146,60,0.05)",
                       border: `1px solid ${solveAction === "CANCEL" ? "rgba(248,113,113,0.2)" : "rgba(251,146,60,0.2)"}`,
                     }}>
                  <label className="block text-[10px] font-black uppercase mb-2"
                         style={{ color: solveAction === "CANCEL" ? "#f87171" : "#fb923c" }}>
                    {solveAction === "CANCEL" ? "Alasan Cancel *" : "Alasan Unsolved *"}
                  </label>
                  <textarea required rows={3} value={solveFormData["Cancel Reason"]}
                    onChange={e => setSolveFormData({ ...solveFormData, "Cancel Reason": e.target.value })}
                    placeholder={solveAction === "CANCEL" ? "Jelaskan alasan pembatalan..." : "Jelaskan mengapa tiket tidak dapat diselesaikan..."}
                    style={{
                      ...getInputStyle(C), resize: "none", lineHeight: 1.6,
                      border: `1px solid ${solveAction === "CANCEL" ? "rgba(248,113,113,0.3)" : "rgba(251,146,60,0.3)"}`,
                    }} />
                </div>
              )}

              {(solveAction === "ON PROGRESS" || solveAction === "PENDING") && (
                <div className="space-y-3">
                  <div className="rounded-xl p-4 flex items-center gap-3"
                       style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                         style={{ background: STATUS_COLOR[solveAction] }} />
                    <p className="text-sm" style={{ color: C.textSec }}>
                      Status semua backbone akan diubah ke{" "}
                      <span className="font-black" style={{ color: C.text }}>{solveAction}</span>.
                    </p>
                  </div>

                  {/* ── Stop Clock Section ── */}
                  {(() => {
                    const ticketNo = selectedTicketGroup[0]?.["NOMOR TICKET"];
                    if (!ticketNo) return null;
                    const sc = stopClocks.filter(c => c.ticket_no === ticketNo);
                    const { hasActive, activeId, count } = getStopClockInfo(ticketNo, sc);
                    return (
                      <div className="rounded-xl p-4 space-y-3"
                           style={{ background: hasActive ? "rgba(251,146,60,0.05)" : C.base,
                                    border: `1px solid ${hasActive ? "rgba(251,146,60,0.3)" : C.borderMid}` }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest"
                             style={{ color: hasActive ? "#fb923c" : C.textMuted }}>
                            ⏸ Stop Clock SLA {hasActive ? "— AKTIF" : count > 0 ? `(${count}× riwayat)` : ""}
                          </p>
                          {count >= 3 && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                                  style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}>
                              ⚠ {count}× pause — perlu perhatian
                            </span>
                          )}
                        </div>
                        {hasActive ? (
                          <div className="space-y-2">
                            <p className="text-xs animate-pulse" style={{ color: "#fb923c" }}>
                              SLA sedang dijeda. Klik <strong>Lanjutkan SLA</strong> jika hambatan sudah teratasi.
                            </p>
                            <button type="button" disabled={stopClockLoading}
                              onClick={() => activeId && endStopClock(activeId, ticketNo)}
                              className="px-4 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                              style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                              ▶ Lanjutkan SLA
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[10px]" style={{ color: C.textMuted }}>
                              Aktifkan jika ada hambatan lapangan — SLA akan dijeda selama hambatan berlangsung.
                            </p>
                            <button type="button"
                              onClick={() => { setStopClockTicketNo(ticketNo); setShowStopClockModal(true); }}
                              className="px-4 py-2 rounded-lg text-xs font-black transition-all"
                              style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                              ⏸ Aktifkan Stop Clock
                            </button>
                          </div>
                        )}
                        {/* Riwayat stop clocks */}
                        {sc.length > 0 && (
                          <div className="space-y-1 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                            {sc.map((c: any, i: number) => {
                              const dur = c.ended_at
                                ? Math.floor((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 60_000)
                                : null;
                              return (
                                <div key={c.id} className="flex items-start justify-between gap-2 text-[10px]"
                                     style={{ color: C.textSec }}>
                                  <span>{i + 1}. {c.reason}</span>
                                  <span className="flex-shrink-0 font-mono" style={{ color: C.textMuted }}>
                                    {c.ended_at ? `${dur}m` : <span style={{ color: "#fb923c" }}>aktif</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Timeline update */}
                  <div className="rounded-xl p-4 space-y-3"
                       style={{ background: C.base, border: `1px solid ${C.borderMid}` }}>
                    <label className="block text-[10px] font-black uppercase" style={{ color: C.textMuted }}>
                      Timeline Update Team{" "}
                      <span className="normal-case font-normal" style={{ color: C.textMuted }}>(opsional)</span>
                    </label>

                    {/* ── Riwayat timeline yang sudah ada ── */}
                    {(() => {
                      const raw   = (selectedTicketGroup[0]?.["Problem & Action"] || "").trim();
                      const lines = raw ? raw.split("\n").filter(Boolean) : [];
                      if (!lines.length) return null;
                      return (
                        <div className="rounded-lg overflow-hidden"
                             style={{ border: `1px solid ${C.border}` }}>
                          <div className="px-3 py-1.5 flex items-center justify-between"
                               style={{ background: "rgba(96,165,250,0.06)", borderBottom: `1px solid ${C.border}` }}>
                            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#60a5fa" }}>
                              Riwayat Timeline ({lines.length} entry)
                            </p>
                            <p className="text-[9px]" style={{ color: C.textMuted }}>Klik × untuk hapus</p>
                          </div>
                          <div className="divide-y" style={{ maxHeight: 180, overflowY: "auto", divideColor: C.border }}>
                            {lines.map((line: string, idx: number) => (
                              <div key={idx}
                                   className="flex items-start justify-between gap-2 px-3 py-2 group"
                                   style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                                <p className="text-[10px] font-mono leading-relaxed flex-1 break-all"
                                   style={{ color: C.textSec }}>{line}</p>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTimelineLine(idx)}
                                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}
                                  title="Hapus entry ini">
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Input baru */}
                    <div className="relative">
                      {timelineInput && (
                        <div className="absolute left-3 top-3 text-sm font-bold select-none"
                             style={{ color: C.accent }}>{">"}</div>
                      )}
                      <textarea
                        rows={3}
                        value={timelineInput}
                        onChange={e => setTimelineInput(e.target.value)}
                        placeholder="Team dalam perjalanan..."
                        style={{
                          ...getInputStyle(C), resize: "none", lineHeight: 1.7,
                          paddingLeft: timelineInput ? 22 : 14,
                        }}
                      />
                    </div>
                    {timelineInput && (
                      <p className="text-[10px] font-mono"
                         style={{ color: C.accentBorder }}>
                        Preview: <span style={{ color: C.accent }}>{`> ${timelineInput.trim().replace(/^[>\s]+/, "")}`}</span>
                      </p>
                    )}
                    <p className="text-[9px]" style={{ color: C.textMuted }}>
                      Prefix {">"} ditambahkan otomatis · akan tersimpan di field Problem & Action
                    </p>
                  </div>
                </div>
              )}

              {solveAction === "SOLVED" && (
                <div className="space-y-5">
                  <div className="h-px" style={{ background: C.border }} />
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#10b981" }}>Detail Penyelesaian</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldWrap label="1. Closed Ticket (Team)">
                      <select required style={getInputStyle(C)} value={solveFormData["Closed Ticket"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Closed Ticket": e.target.value })}>
                        <option value="">-- Pilih Team --</option>
                        {getOptions("TEAM").map((o, i) => <option key={i} value={o}>{o}</option>)}
                      </select>
                    </FieldWrap>
                    <FieldWrap label="4. Problem">
                      <select style={getInputStyle(C)} value={solveFormData["Problem"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Problem": e.target.value })}>
                        <option value="">-- Pilih Problem --</option>
                        {getOptions("PROBLEM").map((o, i) => <option key={i} value={o}>{o}</option>)}
                      </select>
                    </FieldWrap>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase mb-2" style={{ color: C.textMuted }}>
                      2–3. Near End & Far End{" "}
                      <span className="normal-case font-normal" style={{ color: C.accent }}>(paste raw CLI output — 1 port per form)</span>
                    </label>
                    <div className="space-y-3">
                      {selectedTicketGroup.map((row: any) => {
                        const portCount = calcPortCount(row["Kapasitas"] || "");
                        const multiPort = portCount > 1;
                        const nearPorts = linkNearFar[row.id]?.nearPorts ?? Array(portCount).fill("");
                        const farPorts  = linkNearFar[row.id]?.farPorts  ?? Array(portCount).fill("");

                        const renderSinglePreview = (raw: string) => {
                          const parsed = parseDevicePower(raw.trim());
                          if (!parsed || parsed === raw.trim()) return null; // no match
                          return (
                            <div className="mt-1 rounded-lg px-2 py-1.5"
                                 style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
                              <p className="text-[9px] font-mono leading-relaxed" style={{ color: "#34d399" }}>⚡ {parsed}</p>
                            </div>
                          );
                        };

                        return (
                          <div key={row.id} className="p-3 rounded-xl space-y-3"
                               style={{ background: C.base, border: `1px solid ${multiPort ? "rgba(251,146,60,0.25)" : C.border}` }}>
                            {/* Link header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold" style={{ color: C.text }}>{row["Nama Link"] || "—"}</p>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: C.accentBg, color: C.accent }}>{row["Kode Backbone"] || "—"}</span>
                              {row["Kapasitas"] && (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                                      style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                                  {row["Kapasitas"]}
                                </span>
                              )}
                              {multiPort && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                      style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                                  {portCount} PORT — isi {portCount} form di bawah
                                </span>
                              )}
                            </div>

                            {/* Per-port textarea pairs */}
                            {Array.from({ length: portCount }, (_, portIdx) => (
                              <div key={portIdx}>
                                {/* Port divider label */}
                                {multiPort && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                          style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
                                      PORT {portIdx + 1}
                                    </span>
                                    <div className="flex-1 h-px" style={{ background: C.border }} />
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                  {/* Near End */}
                                  <div>
                                    <p className="text-[9px] font-black uppercase mb-1.5" style={{ color: C.textMuted }}>
                                      Near End{multiPort ? ` — Port ${portIdx + 1}` : ""}
                                    </p>
                                    <textarea
                                      rows={5}
                                      placeholder={`Paste raw CLI Near End${multiPort ? ` Port ${portIdx + 1}` : ""}...\n(Alcatel / Nexus / Extreme / Huawei)`}
                                      value={nearPorts[portIdx] || ""}
                                      onChange={e => {
                                        const updated = [...(linkNearFar[row.id]?.nearPorts ?? Array(portCount).fill(""))];
                                        updated[portIdx] = e.target.value;
                                        setLinkNearFar(prev => ({ ...prev, [row.id]: { ...prev[row.id], nearPorts: updated } }));
                                      }}
                                      style={{ ...getInputStyle(C), resize: "vertical", lineHeight: 1.4, fontSize: 11, fontFamily: "var(--font-mono)" }}
                                    />
                                    {nearPorts[portIdx] && renderSinglePreview(nearPorts[portIdx])}
                                  </div>
                                  {/* Far End */}
                                  <div>
                                    <p className="text-[9px] font-black uppercase mb-1.5" style={{ color: C.textMuted }}>
                                      Far End{multiPort ? ` — Port ${portIdx + 1}` : ""}
                                    </p>
                                    <textarea
                                      rows={5}
                                      placeholder={`Paste raw CLI Far End${multiPort ? ` Port ${portIdx + 1}` : ""}...\n(Alcatel / Nexus / Extreme / Huawei)`}
                                      value={farPorts[portIdx] || ""}
                                      onChange={e => {
                                        const updated = [...(linkNearFar[row.id]?.farPorts ?? Array(portCount).fill(""))];
                                        updated[portIdx] = e.target.value;
                                        setLinkNearFar(prev => ({ ...prev, [row.id]: { ...prev[row.id], farPorts: updated } }));
                                      }}
                                      style={{ ...getInputStyle(C), resize: "vertical", lineHeight: 1.4, fontSize: 11, fontFamily: "var(--font-mono)" }}
                                    />
                                    {farPorts[portIdx] && renderSinglePreview(farPorts[portIdx])}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldWrap label="5. Status Case">
                      <select style={getInputStyle(C)} value={solveFormData["Status Case"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Status Case": e.target.value })}>
                        <option value="">-- Pilih Status Case --</option>
                        {getOptions("STATUS CASE").map((o, i) => <option key={i} value={o}>{o}</option>)}
                      </select>
                    </FieldWrap>
                    <FieldWrap label="9. Regional">
                      <select style={getInputStyle(C)} value={solveFormData["Regional"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Regional": e.target.value })}>
                        <option value="">-- Pilih Regional --</option>
                        {getOptions("REGIONAL").map((o, i) => <option key={i} value={o}>{o}</option>)}
                      </select>
                    </FieldWrap>
                  </div>

                  <FieldWrap label="6. Problem & Action">
                    <textarea rows={3} style={{ ...getInputStyle(C), resize: "none", lineHeight: 1.6 }}
                      value={solveFormData["Problem & Action"]} placeholder="Kronologi masalah dan tindakan..."
                      onChange={e => setSolveFormData({ ...solveFormData, "Problem & Action": e.target.value })} />
                  </FieldWrap>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldWrap label="7. Titik Kordinat / Data Tagging">
                      <textarea rows={4}
                        placeholder={"Paste raw data tagging...\n-6.2766, 107.1706\nhttp://maps.google.com/?q=..."}
                        style={{ ...getInputStyle(C), resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.5, fontSize: 12 }}
                        value={solveFormData["Titik Kordinat Cut / Bending"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Titik Kordinat Cut / Bending": e.target.value })} />
                      <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>Raw text — copy paste apa adanya</p>
                    </FieldWrap>
                    <FieldWrap label="8. Alamat Problem">
                      <input type="text" placeholder="Alamat lokasi gangguan..." style={getInputStyle(C)}
                        value={solveFormData["Alamat Problem"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Alamat Problem": e.target.value })} />
                    </FieldWrap>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldWrap label="10. Hari dan Tanggal Closed">
                      <input type="text" required placeholder="25/04/2026 07:25:14"
                        style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)" }}
                        value={solveFormData["Hari dan Tanggal Closed"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "Hari dan Tanggal Closed": e.target.value })} />
                      <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>Format: DD/MM/YYYY HH:MM:SS — bisa di-copy paste</p>
                    </FieldWrap>
                    <FieldWrap label="11. End Time *">
                      <input type="text" required placeholder="25/04/2026 07:25:14"
                        style={{ ...getInputStyle(C), fontFamily: "var(--font-mono)" }}
                        value={solveFormData["End Time"]}
                        onChange={e => setSolveFormData({ ...solveFormData, "End Time": e.target.value })} />
                      <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>Format: DD/MM/YYYY HH:MM:SS — bisa di-copy paste</p>
                    </FieldWrap>
                  </div>

                  {previewMTTR && (
                    <div className="grid grid-cols-2 gap-4 rounded-xl p-4"
                         style={{ background: C.base, border: `1px solid ${C.border}` }}>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>MTTR (auto)</p>
                        <p className="text-xl font-black font-mono" style={{ color: C.text }}>{previewMTTR.mttr}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>SLA (auto)</p>
                        <p className="text-xl font-black font-mono"
                           style={{ color: previewMTTR.isOK ? "#10b981" : "#f87171" }}>{previewMTTR.label}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ModalFooter>
              <span />
              <div className="flex gap-3">
                <button type="button" onClick={closeSolveModal}
                  className="px-5 py-2 text-sm font-semibold rounded-lg" style={{ color: C.textSec }}>Tutup</button>
                <button type="submit" disabled={loading}
                  className="px-7 py-2 rounded-lg font-bold text-sm disabled:opacity-40 active:scale-95"
                  style={{
                    background: STATUS_COLOR[solveAction] || C.accent,
                    color: solveAction === "PENDING" ? "#0f172a" : "#fff",
                  }}>
                  {loading ? "Updating..." : `Set ${solveAction}`}
                </button>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}
      {/* ══════════════════════════════════════════
          MODAL: PENDING ALERT
          Muncul otomatis tiap 5 menit jika ada tiket
          PENDING > 60 menit tanpa update timeline
      ══════════════════════════════════════════ */}
      {showPendingModal && pendingAlertTickets.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[90]"
             style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
               style={{ background: C.surface, border: `1px solid rgba(251,146,60,0.4)` }}>

            {/* Header */}
            <div className="px-6 py-5 flex items-start gap-3"
                 style={{ background: "rgba(251,146,60,0.08)", borderBottom: `1px solid rgba(251,146,60,0.2)` }}>
              <span className="text-xl mt-0.5">⏰</span>
              <div className="flex-1">
                <h2 className="text-base font-black" style={{ color: "#fb923c" }}>
                  Tiket PENDING Perlu Update
                </h2>
                <p className="text-xs mt-0.5" style={{ color: C.textSec }}>
                  {pendingAlertTickets.length} tiket belum diperbarui lebih dari 1 jam.
                  Catat alasan atau perkembangan terkini.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Pilih tiket */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.textMuted }}>
                  Tiket yang terdeteksi
                </p>
                {pendingAlertTickets.map(({ ticketNo, group, diffMin }) => (
                  <label key={ticketNo}
                    className="flex items-center gap-3 rounded-xl p-3 cursor-pointer transition-all"
                    style={{
                      background: pendingAlertSelected.has(ticketNo) ? "rgba(251,146,60,0.08)" : C.elevated,
                      border: `1px solid ${pendingAlertSelected.has(ticketNo) ? "rgba(251,146,60,0.35)" : C.border}`,
                    }}>
                    <input type="checkbox" checked={pendingAlertSelected.has(ticketNo)}
                      onChange={e => {
                        setPendingAlertSelected(prev => {
                          const s = new Set(prev);
                          e.target.checked ? s.add(ticketNo) : s.delete(ticketNo);
                          return s;
                        });
                      }} className="w-4 h-4 accent-orange-400" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-black text-sm" style={{ color: "#fb923c" }}>{ticketNo}</p>
                      <p className="text-[10px] truncate" style={{ color: C.textMuted }}>
                        {group[0]["Subject Ticket / Email"] || "—"}
                      </p>
                    </div>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded flex-shrink-0"
                          style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                      {Math.floor(diffMin / 60)}j {diffMin % 60}m
                    </span>
                  </label>
                ))}
              </div>

              {/* Pilih alasan */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.textMuted }}>
                  Alasan / Perkembangan
                </p>
                {[
                  "Dalam Penjadwalan Team FO",
                  "Team Full Maintenance, akan di progress jika ada team idle",
                  "Menunggu Perizinan",
                  "Terkendala Cuaca / Hujan",
                  "Lainnya",
                ].map(opt => (
                  <label key={opt}
                    className="flex items-center gap-2.5 rounded-xl p-3 cursor-pointer transition-all"
                    style={{
                      background: pendingAlertReason === opt ? "rgba(251,146,60,0.08)" : C.elevated,
                      border: `1px solid ${pendingAlertReason === opt ? "rgba(251,146,60,0.35)" : C.border}`,
                    }}>
                    <input type="radio" name="pendingReason" value={opt}
                      checked={pendingAlertReason === opt}
                      onChange={() => setPendingAlertReason(opt)}
                      className="accent-orange-400" />
                    <span className="text-sm" style={{ color: pendingAlertReason === opt ? "#fb923c" : C.textSec }}>{opt}</span>
                  </label>
                ))}
                {pendingAlertReason === "Lainnya" && (
                  <textarea rows={2} placeholder="Tulis alasan lain..."
                    value={pendingAlertCustom}
                    onChange={e => setPendingAlertCustom(e.target.value)}
                    style={{ ...getInputStyle(C), resize: "none", marginTop: 4 }} />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4"
                 style={{ background: C.elevated, borderTop: `1px solid ${C.border}` }}>
              <button type="button"
                onClick={() => {
                  // Dismiss tanpa menyimpan (hanya untuk sesi ini)
                  setPendingAlertDismissed(prev => {
                    const s = new Set(prev);
                    pendingAlertTickets.forEach(t => s.add(t.ticketNo));
                    return s;
                  });
                  setShowPendingModal(false);
                }}
                className="text-sm px-4 py-2 rounded-lg" style={{ color: C.textSec }}>
                Ingatkan Nanti
              </button>
              <button type="button"
                disabled={pendingAlertLoading || pendingAlertSelected.size === 0 || !pendingAlertReason}
                onClick={handlePendingAlertSubmit}
                className="px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-40 transition-all"
                style={{ background: "#fb923c", color: "#0f172a" }}>
                {pendingAlertLoading ? "Menyimpan..." : `Simpan Alasan (${pendingAlertSelected.size} tiket)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: STOP CLOCK SLA
          Diaktifkan dari button "⏸ Aktifkan Stop Clock"
          di Update modal atau dari Kanban card
      ══════════════════════════════════════════ */}
      {showStopClockModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[90]"
             style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
               style={{ background: C.surface, border: `1px solid rgba(251,146,60,0.4)` }}>

            {/* Header */}
            <div className="px-6 py-5 flex items-start justify-between"
                 style={{ background: "rgba(251,146,60,0.08)", borderBottom: `1px solid rgba(251,146,60,0.2)` }}>
              <div>
                <h2 className="text-base font-black" style={{ color: "#fb923c" }}>⏸ Stop Clock SLA</h2>
                <p className="text-xs mt-0.5 font-mono" style={{ color: C.textMuted }}>{stopClockTicketNo}</p>
              </div>
              <button onClick={() => { setShowStopClockModal(false); setStopClockReason(""); setStopClockCustomReason(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xl"
                style={{ color: C.textSec }}>×</button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: C.textSec }}>
                SLA tiket akan <strong style={{ color: "#fb923c" }}>dijeda</strong> sementara hambatan lapangan berlangsung.
                Status tiket otomatis berubah ke <strong>PENDING</strong>.
              </p>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.textMuted }}>
                  Pilih Alasan Hambatan
                </p>
                {[
                  "Hujan / Cuaca Buruk",
                  "Dialihkan ke Tiket Lain",
                  "Terkendala Perlengkapan / Gear",
                  "Hold Perizinan Giat",
                  "Lainnya",
                ].map(opt => (
                  <label key={opt}
                    className="flex items-center gap-2.5 rounded-xl p-3 cursor-pointer transition-all"
                    style={{
                      background: stopClockReason === opt ? "rgba(251,146,60,0.08)" : C.elevated,
                      border: `1px solid ${stopClockReason === opt ? "rgba(251,146,60,0.35)" : C.border}`,
                    }}>
                    <input type="radio" name="stopClockReason" value={opt}
                      checked={stopClockReason === opt}
                      onChange={() => setStopClockReason(opt)}
                      className="accent-orange-400" />
                    <span className="text-sm" style={{ color: stopClockReason === opt ? "#fb923c" : C.textSec }}>{opt}</span>
                  </label>
                ))}
                {stopClockReason === "Lainnya" && (
                  <textarea rows={2} placeholder="Tulis alasan hambatan..."
                    value={stopClockCustomReason}
                    onChange={e => setStopClockCustomReason(e.target.value)}
                    style={{ ...getInputStyle(C), resize: "none", marginTop: 4 }} />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4"
                 style={{ background: C.elevated, borderTop: `1px solid ${C.border}` }}>
              <button type="button"
                onClick={() => { setShowStopClockModal(false); setStopClockReason(""); setStopClockCustomReason(""); }}
                className="text-sm px-4 py-2 rounded-lg" style={{ color: C.textSec }}>
                Batal
              </button>
              <button type="button"
                disabled={stopClockLoading || !stopClockReason || (stopClockReason === "Lainnya" && !stopClockCustomReason.trim())}
                onClick={() => {
                  const reason = stopClockReason === "Lainnya" ? stopClockCustomReason.trim() : stopClockReason;
                  startStopClock(stopClockTicketNo, reason);
                }}
                className="px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-40 transition-all"
                style={{ background: "#fb923c", color: "#0f172a" }}>
                {stopClockLoading ? "Memulai..." : "⏸ Mulai Stop Clock"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </ThemeCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB BUTTON
// ─────────────────────────────────────────────────────────────
function TabBtn({ label, count, active, color, onClick }: {
  label: string; count: number; active: boolean; color: string; onClick: () => void;
}) {
  const C = useTheme();
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all"
      style={{
        background: active ? `${color}18` : C.surface,
        color:      active ? color : C.textSec,
        border:     `1px solid ${active ? `${color}40` : C.border}`,
      }}>
      {label}
      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black"
            style={{ background: active ? `${color}25` : C.elevated, color: active ? color : C.textMuted }}>
        {count}
      </span>
    </button>
  );
}
