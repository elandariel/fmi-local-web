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
function LiveMTTR({ startTime }: { startTime: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return <>{formatMTTR(calcMTTRMinutes(startTime, now.toISOString()))}</>;
}

// ─────────────────────────────────────────────────────────────
// SLA COUNTDOWN (updates every 1 s)
// ─────────────────────────────────────────────────────────────
// Set untuk track tiket yang sudah dapat notifikasi (hindari spam)
const slaNotifiedSet = new Set<string>();

function SLACountdown({ startTime, compact, ticketNo }: { startTime: string; compact?: boolean; ticketNo?: string }) {
  const C = useTheme();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const diffMs  = now.getTime() - parseDateTime(startTime).getTime();
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
function KanbanCard({ group, ticketNo, onDetail, onUpdate, onDragStart, onDragEnd, isDragging }: {
  group: any[];
  ticketNo: string;
  onDetail: () => void;
  onUpdate: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
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
      {active && first["Start Time"] && (
        <div className="pt-1 border-t" style={{ borderColor: C.border }}>
          <SLACountdown startTime={first["Start Time"]} compact ticketNo={ticketNo} />
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

function InfoRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  const C = useTheme();
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: C.textSec }}>{label}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`} style={{ color: color ?? C.text }}>{value}</span>
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
    const hwHost  = firstLn.match(/\[~?([A-Za-z0-9._-]+)\]/)?.[1] ?? "";
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
      if (ne) { txt += `\n${neLabel}\n${parseDevicePower(ne)}\n`; }
      if (fe) { txt += `\n${feLabel}\n${parseDevicePower(fe)}\n`; }
    });
  }

  return txt.trim();
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
  tickets:     any[][];
  monthlyData: { month: string; count: number; solved: number }[];
}): string {
  const { periodLabel, pdfType, total, solved, byStatus, byRegional, byJenis, byPriority,
          byKode, byProblem, slaOK, slaNOK, slaRate, avgMTTR, tickets, monthlyData } = opts;

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

  const mttrAvgFmt = avgMTTR != null ? `${Math.floor(avgMTTR / 60)}j ${avgMTTR % 60}m` : "—";
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
      <div class="kpi inf"><div class="lbl">Avg MTTR</div><div class="val" style="color:#3b82f6">${mttrAvgFmt}</div></div>
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

  // ── Add Backbone modal ──
  const [showAddBBModal,  setShowAddBBModal]  = useState(false);
  const [newBBKode,       setNewBBKode]       = useState("");
  const [newBBNama,       setNewBBNama]       = useState("");
  const [addBBLoading,    setAddBBLoading]    = useState(false);

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
  const [linkNearFar,         setLinkNearFar]         = useState<Record<number, { nearEnd: string; farEnd: string }>>({});

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
    const init: Record<number, { nearEnd: string; farEnd: string }> = {};
    group.forEach((r: any) => { init[r.id] = { nearEnd: r["Near End"] || "", farEnd: r["Far End"] || "" }; });
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
      const mttr         = startTime ? calcMTTRMinutes(startTime, endFormatted) : null;
      const sla          = startTime ? calcSLA(startTime, endFormatted) : null;
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
        "MTTR":                         mttr,
        "SLA":                          sla ? (sla.isOK ? "OK" : "NOK") : "",
      };
      let hasError = false;
      for (const row of selectedTicketGroup) {
        const { error } = await supabase.from("Report Backbone").update({
          ...shared,
          "Near End": linkNearFar[row.id]?.nearEnd || "",
          "Far End":  linkNearFar[row.id]?.farEnd  || "",
        }).eq("id", row.id);
        if (error) { hasError = true; toast.error(`Gagal update ${row["Nama Link"]}: ${error.message}`); }
      }
      if (!hasError) {
        // Build summary → sync Odoo → buka WA modal
        const summary = buildSolvedSummary(selectedTicketGroup, solveFormData, linkNearFar);
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
        const existing = (selectedTicketGroup[0]["Problem & Action"] || "").trim();
        const newLine  = `> ${timelineInput.trim()}`;
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
        if (mttrMin > 0) { mttrSum += mttrMin; mttrCount++; }
      } else {
        // Fallback ke nilai DB jika belum ada End Time
        if (f["SLA"] === "OK") slaOK++;
        else if (f["SLA"] === "NOK") slaNOK++;
        if (f["MTTR"] != null && !isNaN(Number(f["MTTR"]))) {
          mttrSum += Number(f["MTTR"]); mttrCount++;
        }
      }
    });

    const solved   = byStatus["SOLVED"] || 0;   // Terselesaikan = SOLVED saja
    const avgMTTR  = mttrCount > 0 ? Math.round(mttrSum / mttrCount) : null;
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

    const html = buildPDFHTML({ periodLabel, pdfType, total, solved, byStatus, byRegional, byJenis, byPriority, byKode, byProblem, slaOK, slaNOK, slaRate, avgMTTR, tickets, monthlyData });

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up diblokir! Ijinkan pop-up untuk generate PDF."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.print(); } catch {} }, 800);
    setShowPDFModal(false);
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

      {/* ══ TOP BAR ══ */}
      <header className="flex items-center gap-2 px-5 py-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${C.border}`, background: C.base }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}` }}>
            <Network size={16} style={{ color: C.accent }} />
          </div>
          <div>
            <h1 className="text-[13px] font-black tracking-tight leading-none" style={{ color: C.text }}>Backbone Monitor</h1>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: C.textMuted }}>NOC FMI · <LiveClock /></p>
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

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {(["table","kanban"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: view === v ? C.accent : C.surface, color: view === v ? (darkMode ? "#111110" : "#f6f7ed") : C.textSec }}>
                {v === "table" ? <List size={12} /> : <LayoutGrid size={12} />}
                <span className="hidden sm:inline">{v === "table" ? "Table" : "Kanban"}</span>
              </button>
            ))}
          </div>

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
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-5">

        {/* ══ STAT CARDS ══ */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Active Incidents" value={totalOpen}   accent="#f5c842" icon={Activity} />
          <StatCard label="Resolved"         value={totalSolved} accent="#10b981" icon={CheckCircle2} />
          <StatCard label="SLA Breached"     value={totalNOK}    accent="#f87171" icon={XCircle} />
        </div>

        {/* ══ STATUS TABS + SEARCH + VIEW ══ */}
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
        <div className="rounded-2xl overflow-hidden"
             style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12px]">
              <thead>
                <tr style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                  {["Nomor Ticket","Subject","Jenis Problem","Status","Start Time","MTTR","SLA / Countdown","Priority","Action"].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left"
                        style={{ color: C.textMuted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                          ? <SLACountdown startTime={first["Start Time"]} ticketNo={ticketNo} />
                          : <span className="text-xs font-black font-mono"
                                  style={{ color: first["SLA"] === "OK" ? "#10b981" : first["SLA"] === "NOK" ? "#f87171" : C.textMuted }}>
                              {first["SLA"] || "—"}
                            </span>
                        }
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
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          MODAL: REASON (CANCEL / UNSOLVED drag)
      ══════════════════════════════════════════ */}
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
            onClose={() => setShowAddBBModal(false)}>
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
                    "pending_approval": false,
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
                    {/* Badge pending approval — hanya muncul kalau ada pending & user bisa approve */}
                    {canApproveKode && pendingItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setNewBBKode(""); setNewBBNama(""); setShowAddBBModal(true); }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold animate-pulse"
                        style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)" }}
                        title="Ada request kode backbone yang menunggu persetujuan">
                        ⏳ Pending
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black"
                              style={{ background: "#f59e0b", color: "#111" }}>
                          {pendingItems.length}
                        </span>
                      </button>
                    )}
                    {/* Tambah kode backbone baru ke index */}
                    <button
                      type="button"
                      onClick={() => { setNewBBKode(""); setNewBBNama(""); setShowAddBBModal(true); }}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold"
                      style={{ background: "rgba(251,146,60,0.1)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}
                      title="Tambah kode backbone baru ke database">
                      + Kode Baru
                    </button>
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
                        {/* Near End — tampilkan hasil parse, bukan raw CLI */}
                        <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]" style={{ color: C.textSec }}>
                          {item["Near End"] ? (() => {
                            const p = parseDevicePower(item["Near End"]);
                            // Jika hasil parse sama dengan raw (format tidak dikenal), potong
                            const display = p.startsWith(">") ? p : (p.length > 50 ? p.slice(0, 50) + "…" : p);
                            return (
                              <span title={item["Near End"]} className="cursor-help leading-relaxed">
                                {display || "—"}
                              </span>
                            );
                          })() : "—"}
                        </td>
                        {/* Far End — tampilkan hasil parse, bukan raw CLI */}
                        <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]" style={{ color: C.textSec }}>
                          {item["Far End"] ? (() => {
                            const p = parseDevicePower(item["Far End"]);
                            const display = p.startsWith(">") ? p : (p.length > 50 ? p.slice(0, 50) + "…" : p);
                            return (
                              <span title={item["Far End"]} className="cursor-help leading-relaxed">
                                {display || "—"}
                              </span>
                            );
                          })() : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-center" style={{ color: C.textSec }}>
                          {(() => {
                            const st = selectedTicketGroup[0]["Start Time"];
                            const et = selectedTicketGroup[0]["End Time"];
                            if (st && et) return formatMTTR(calcMTTRMinutes(st, et));
                            return item["MTTR"] != null ? formatMTTR(item["MTTR"]) : "—";
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-[10px] font-black">
                          {(() => {
                            const st = selectedTicketGroup[0]["Start Time"];
                            const et = selectedTicketGroup[0]["End Time"];
                            if (st && et) {
                              const ok = calcSLA(st, et).isOK;
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
                  // Selalu kalkulasi live dari Start Time + End Time agar konsisten
                  // (nilai tersimpan di DB bisa salah akibat import spreadsheet)
                  const st  = selectedTicketGroup[0]["Start Time"];
                  const et  = selectedTicketGroup[0]["End Time"];
                  if (st && et) {
                    const mins = calcMTTRMinutes(st, et);
                    const sla  = calcSLA(st, et);
                    return <>
                      <InfoRow label="MTTR" value={formatMTTR(mins)} mono />
                      <InfoRow label="SLA"  value={sla.isOK ? "OK" : "NOK"}
                        color={sla.isOK ? "#10b981" : "#f87171"} />
                    </>;
                  }
                  // Fallback: baca dari DB jika belum ada End Time (tiket aktif)
                  return <>
                    <InfoRow label="MTTR" value={selectedTicketGroup[0]["MTTR"] != null ? formatMTTR(selectedTicketGroup[0]["MTTR"]) : "—"} mono />
                    <InfoRow label="SLA"  value={selectedTicketGroup[0]["SLA"] || "—"}
                      color={selectedTicketGroup[0]["SLA"] === "OK" ? "#10b981" : selectedTicketGroup[0]["SLA"] === "NOK" ? "#f87171" : C.textSec} />
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

                  {/* Timeline update */}
                  <div className="rounded-xl p-4"
                       style={{ background: C.base, border: `1px solid ${C.borderMid}` }}>
                    <label className="block text-[10px] font-black uppercase mb-2" style={{ color: C.textMuted }}>
                      Timeline Update Team{" "}
                      <span className="normal-case font-normal" style={{ color: C.textMuted }}>(opsional)</span>
                    </label>
                    <div className="relative">
                      {/* Preview prefix ">" */}
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
                      <p className="text-[10px] mt-1.5 font-mono"
                         style={{ color: C.accentBorder }}>
                        Preview: <span style={{ color: C.accent }}>{`> ${timelineInput.trim()}`}</span>
                      </p>
                    )}
                    <p className="text-[9px] mt-1" style={{ color: C.textMuted }}>
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
                      <span className="normal-case font-normal" style={{ color: C.accent }}>(paste raw CLI output per backbone)</span>
                    </label>
                    <div className="space-y-3">
                      {selectedTicketGroup.map((row: any) => (
                        <div key={row.id} className="p-3 rounded-xl space-y-3"
                             style={{ background: C.base, border: `1px solid ${C.border}` }}>
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
                          </div>
                          {/* Near End + Far End side-by-side */}
                          <div className="grid grid-cols-2 gap-3">
                            {/* Near End */}
                            <div>
                              <p className="text-[9px] font-black uppercase mb-1.5" style={{ color: C.textMuted }}>Near End</p>
                              <textarea
                                rows={5}
                                placeholder={"Paste raw CLI output Near End...\n(Alcatel / Nexus / Extreme / Huawei)"}
                                value={linkNearFar[row.id]?.nearEnd || ""}
                                onChange={e => setLinkNearFar(prev => ({ ...prev, [row.id]: { ...prev[row.id], nearEnd: e.target.value } }))}
                                style={{ ...getInputStyle(C), resize: "vertical", lineHeight: 1.4, fontSize: 11, fontFamily: "var(--font-mono)" }}
                              />
                              {linkNearFar[row.id]?.nearEnd && (
                                <p className="text-[9px] mt-1 font-mono truncate" style={{ color: C.accent }}>
                                  ⚡ {parseDevicePower(linkNearFar[row.id].nearEnd)}
                                </p>
                              )}
                            </div>
                            {/* Far End */}
                            <div>
                              <p className="text-[9px] font-black uppercase mb-1.5" style={{ color: C.textMuted }}>Far End</p>
                              <textarea
                                rows={5}
                                placeholder={"Paste raw CLI output Far End...\n(Alcatel / Nexus / Extreme / Huawei)"}
                                value={linkNearFar[row.id]?.farEnd || ""}
                                onChange={e => setLinkNearFar(prev => ({ ...prev, [row.id]: { ...prev[row.id], farEnd: e.target.value } }))}
                                style={{ ...getInputStyle(C), resize: "vertical", lineHeight: 1.4, fontSize: 11, fontFamily: "var(--font-mono)" }}
                              />
                              {linkNearFar[row.id]?.farEnd && (
                                <p className="text-[9px] mt-1 font-mono truncate" style={{ color: C.accent }}>
                                  ⚡ {parseDevicePower(linkNearFar[row.id].farEnd)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
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
