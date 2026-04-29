'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  History, Search, RefreshCcw, User, Clock,
  Trash2, PlusCircle, Edit, AlertCircle, CheckCircle,
  XCircle, Send, Filter, ChevronDown, LayoutGrid,
  ClipboardList, TrendingUp, Users, Server, Megaphone,
  Settings, Shield, Wrench, X
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

// ── CONFIG ────────────────────────────────────────────────────
const MODULE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  'Monthly Report':  { icon: <ClipboardList size={12}/>, color: '#60a5fa', bg: 'var(--info-bg)',     border: 'rgba(56,189,248,0.25)' },
  'Weekly Report':   { icon: <TrendingUp   size={12}/>, color: '#34d399', bg: 'var(--success-bg)',   border: 'var(--accent-border)' },
  'Data Client':     { icon: <Users        size={12}/>, color: '#a78bfa', bg: 'var(--bg-elevated)',  border: 'rgba(139,92,246,0.25)' },
  'VLAN':            { icon: <Server       size={12}/>, color: '#fbbf24', bg: 'var(--warning-bg)',   border: 'rgba(251,191,36,0.25)' },
  'Interkoneksi':    { icon: <LayoutGrid   size={12}/>, color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.25)' },
  'Broadcast':       { icon: <Megaphone    size={12}/>, color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.25)' },
  'User Management': { icon: <Shield       size={12}/>, color: '#60a5fa', bg: 'var(--info-bg)',      border: 'rgba(56,189,248,0.25)' },
  'Profile':         { icon: <Settings     size={12}/>, color: '#94a3b8', bg: 'var(--bg-elevated)',  border: 'var(--border-light)' },
  'Tools':           { icon: <Wrench       size={12}/>, color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.25)' },
  'System':          { icon: <AlertCircle  size={12}/>, color: '#94a3b8', bg: 'var(--bg-elevated)',  border: 'var(--border-light)' },
};

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; border: string; dot: string }> = {
  create:  { icon: <PlusCircle  size={10}/>, label: 'Tambah',  color: '#34d399', bg: 'var(--success-bg)',  border: 'var(--accent-border)',          dot: 'bg-emerald-500' },
  edit:    { icon: <Edit        size={10}/>, label: 'Edit',    color: '#60a5fa', bg: 'var(--info-bg)',      border: 'rgba(56,189,248,0.25)',          dot: 'bg-blue-500'    },
  delete:  { icon: <Trash2      size={10}/>, label: 'Hapus',   color: '#fb7185', bg: 'var(--danger-bg)',   border: 'rgba(248,113,113,0.25)',         dot: 'bg-rose-500'    },
  request: { icon: <Send        size={10}/>, label: 'Request', color: '#fbbf24', bg: 'var(--warning-bg)',  border: 'rgba(251,191,36,0.25)',          dot: 'bg-amber-500'   },
  approve: { icon: <CheckCircle size={10}/>, label: 'Approve', color: '#34d399', bg: 'var(--success-bg)',  border: 'var(--accent-border)',           dot: 'bg-emerald-600' },
  reject:  { icon: <XCircle     size={10}/>, label: 'Tolak',   color: '#fb7185', bg: 'var(--danger-bg)',   border: 'rgba(248,113,113,0.25)',         dot: 'bg-rose-600'    },
  system:  { icon: <AlertCircle size={10}/>, label: 'Sistem',  color: '#94a3b8', bg: 'var(--bg-elevated)', border: 'var(--border-light)',            dot: 'bg-slate-400'   },
};

// Fallback untuk log lama yang belum punya ACTIVITY type baru
function getCategoryFromLegacy(activity: string): string {
  const a = (activity || '').toUpperCase();
  if (a.includes('DELETE') || a.includes('HAPUS') || a.includes('RESET')) return 'delete';
  if (a.includes('EDIT') || a.includes('UPDATE'))                          return 'edit';
  if (a.includes('INPUT') || a.includes('CREATE') || a.includes('BARU') || a.includes('ADD') || a.includes('TAMBAH') || a.includes('KIRIM') || a.includes('IMPORT')) return 'create';
  if (a.includes('REQUEST'))  return 'request';
  if (a.includes('APPROVED') || a.includes('APPROVE')) return 'approve';
  if (a.includes('REJECTED') || a.includes('REJECT') || a.includes('TOLAK')) return 'reject';
  return 'system';
}

// ── ACTIVITY_META map untuk log lama (dari ACTIVITY string langsung)
const LEGACY_MODULE_FROM_SUBJECT: Record<string, string> = {
  'Input Work Order':  'Monthly Report',
  'Input Tracker':     'Weekly Report',
  'Input Client Corp': 'Data Client',
  'Delete Client Corp': 'Data Client',
  'Edit Client Corp':  'Data Client',
};

function getLogMeta(log: any) {
  const category = log.ACTIVITY
    ? getCategoryFromLegacy(log.ACTIVITY)
    : 'system';

  const module = log.MODULE
    || LEGACY_MODULE_FROM_SUBJECT[log.ACTIVITY]
    || 'System';

  const label = log.ACTIVITY_LABEL
    || log.ACTIVITY
    || 'Aktivitas';

  return { category, module, label };
}

// ── DATE GROUP LABEL ─────────────────────────────────────────
function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d))     return 'Hari Ini';
  if (isYesterday(d)) return 'Kemarin';
  return format(d, 'EEEE, dd MMMM yyyy', { locale: indonesia });
}

const ALL_MODULES = Object.keys(MODULE_CONFIG);

// ── PAGE ─────────────────────────────────────────────────────
export default function LogActivityPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const [initialLogs, setInitialLogs] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [isLive, setIsLive]           = useState(false);
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showFilter, setShowFilter]   = useState(false);
  const [totalCount, setTotalCount]   = useState(0);
  const ITEMS_PER_PAGE = 25;

  // Stats untuk header
  const [todayStats, setTodayStats] = useState({ total: 0, byModule: {} as Record<string, number> });

  const realtimeLogs = useRealtimeTable('Log_Aktivitas', initialLogs, ['INSERT']);
  const logs = (page === 1 && !search && moduleFilter === 'ALL' && categoryFilter === 'ALL')
    ? realtimeLogs
    : initialLogs;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to   = from + ITEMS_PER_PAGE - 1;

    let query = supabase
      .from('Log_Aktivitas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search)         query = query.or(`actor.ilike.%${search}%,SUBJECT.ilike.%${search}%,ACTIVITY_LABEL.ilike.%${search}%`);
    if (moduleFilter   !== 'ALL') query = query.eq('MODULE', moduleFilter);
    if (categoryFilter !== 'ALL') query = query.eq('ACTIVITY', categoryFilter);

    const { data, error, count } = await query;
    if (!error) {
      setInitialLogs(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [page, search, moduleFilter, categoryFilter]);

  const fetchTodayStats = useCallback(async () => {
    const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
    const { data } = await supabase
      .from('Log_Aktivitas')
      .select('MODULE')
      .gte('created_at', todayStart);

    if (data) {
      const byModule: Record<string, number> = {};
      data.forEach(r => { const m = r.MODULE || 'System'; byModule[m] = (byModule[m] || 0) + 1; });
      setTodayStats({ total: data.length, byModule });
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [page, search, moduleFilter, categoryFilter]);
  useEffect(() => { fetchTodayStats(); }, []);
  useEffect(() => {
    const t = setTimeout(() => setIsLive(true), 1000);
    return () => clearTimeout(t);
  }, []);

  // Reset ke page 1 kalau filter berubah
  useEffect(() => { setPage(1); }, [search, moduleFilter, categoryFilter]);

  // Group logs by date
  const groupedLogs: { dateLabel: string; items: any[] }[] = [];
  logs.forEach(log => {
    const label = log.created_at ? getDateGroup(log.created_at) : 'Tanggal Tidak Diketahui';
    const last = groupedLogs[groupedLogs.length - 1];
    if (last && last.dateLabel === label) {
      last.items.push(log);
    } else {
      groupedLogs.push({ dateLabel: label, items: [log] });
    }
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const activeFilters = (moduleFilter !== 'ALL' ? 1 : 0) + (categoryFilter !== 'ALL' ? 1 : 0);

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><History size={17} /></div>
            Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">Rekaman jejak seluruh aktivitas di sistem NOC</p>
        </div>
        <div className="flex items-center gap-2">
          {page === 1 && !search && moduleFilter === 'ALL' && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-all duration-500 bg-emerald-50 text-emerald-700 border-emerald-200">
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isLive ? 'Live' : 'Connecting'}
            </span>
          )}
          <button onClick={() => { fetchLogs(); fetchTodayStats(); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 shadow-sm transition-colors">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── TODAY STATS STRIP ───────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hari Ini</span>
            <span className="text-lg font-bold text-slate-800">{todayStats.total}</span>
            <span className="text-[10px] text-slate-400">aktivitas</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(todayStats.byModule)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([mod, count]) => {
                const cfg = MODULE_CONFIG[mod] || MODULE_CONFIG['System'];
                return (
                  <button
                    key={mod}
                    onClick={() => setModuleFilter(mod === moduleFilter ? 'ALL' : mod)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all hover:opacity-80"
                    style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                  >
                    {cfg.icon}
                    {mod}
                    <span className="ml-0.5 opacity-70">{count}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── SEARCH + FILTER ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 mb-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
          <input
            type="text"
            placeholder="Cari nama user, aktivitas, atau subject data..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-slate-50 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold transition-all ${
              activeFilters > 0
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter size={12} />
            Filter
            {activeFilters > 0 && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{activeFilters}</span>}
            <ChevronDown size={12} className={`transition-transform ${showFilter ? 'rotate-180' : ''}`} />
          </button>
          {activeFilters > 0 && (
            <button
              onClick={() => { setModuleFilter('ALL'); setCategoryFilter('ALL'); }}
              className="flex items-center gap-1 px-2.5 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              <X size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── FILTER PANEL ────────────────────────────── */}
      {showFilter && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-4">
          {/* Module filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Modul</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setModuleFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${moduleFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Semua
              </button>
              {ALL_MODULES.map(mod => {
                const cfg = MODULE_CONFIG[mod];
                const active = moduleFilter === mod;
                return (
                  <button
                    key={mod}
                    onClick={() => setModuleFilter(mod)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
                    style={active
                      ? { background: cfg.color, color: '#fff', borderColor: cfg.color }
                      : { background: cfg.bg, color: cfg.color, borderColor: cfg.border }
                    }
                  >
                    {cfg.icon} {mod}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Jenis Aksi</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${categoryFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Semua
              </button>
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                const active = categoryFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
                    style={active
                      ? { background: cfg.color, color: '#fff', borderColor: cfg.color }
                      : { background: cfg.bg, color: cfg.color, borderColor: cfg.border }
                    }
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── LOG TIMELINE ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Count bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {loading ? 'Memuat...' : (
              <>
                <span className="font-semibold text-slate-700">{totalCount.toLocaleString()}</span> total log
                {(search || activeFilters > 0) && (
                  <span className="text-slate-400"> · menampilkan {logs.length} hasil</span>
                )}
              </>
            )}
          </p>
          <p className="text-[10px] text-slate-400">
            Halaman {page} {totalPages > 0 && `dari ${totalPages}`}
          </p>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0 mt-1" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-slate-100 rounded w-40" />
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                    <div className="h-2.5 bg-slate-100 rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <History size={22} className="text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm font-medium">Tidak ada aktivitas ditemukan</p>
              <p className="text-slate-400 text-xs mt-1">Coba ubah filter atau kata kunci pencarian</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groupedLogs.map(({ dateLabel, items }) => (
                <div key={dateLabel}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{dateLabel}</span>
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[10px] text-slate-400 shrink-0">{items.length} aktivitas</span>
                  </div>

                  {/* Timeline items */}
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-100" />

                    <div className="space-y-1">
                      {items.map((log, idx) => {
                        const { category, module, label } = getLogMeta(log);
                        const catCfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG['system'];
                        const modCfg = MODULE_CONFIG[module]     || MODULE_CONFIG['System'];
                        const isFirst = idx === 0 && page === 1 && dateLabel === 'Hari Ini';

                        return (
                          <div
                            key={log.id}
                            className={`relative flex gap-4 pl-10 pr-3 py-3 rounded-xl transition-colors hover:bg-slate-50 group ${isFirst ? 'ring-1 ring-emerald-100' : ''}`}
                          >
                            {/* Timeline dot */}
                            <div
                              className={`absolute left-1.5 top-4 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0 ${catCfg.dot}`}
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                            </div>

                            {/* Avatar */}
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border"
                              style={{ background: modCfg.bg, color: modCfg.color, borderColor: modCfg.border }}
                            >
                              {(log.actor || 'S').charAt(0).toUpperCase()}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                {/* Actor */}
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                  <User size={11} className="text-slate-400" />
                                  {log.actor || 'System'}
                                </span>

                                {/* Category badge */}
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase"
                                  style={{ background: catCfg.bg, color: catCfg.color, borderColor: catCfg.border }}
                                >
                                  {catCfg.icon} {catCfg.label}
                                </span>

                                {/* Module badge */}
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border"
                                  style={{ background: modCfg.bg, color: modCfg.color, borderColor: modCfg.border }}
                                >
                                  {modCfg.icon} {module}
                                </span>
                              </div>

                              {/* Activity label + subject */}
                              <p className="text-xs text-slate-700 leading-relaxed">
                                <span className="font-semibold">{label}</span>
                                {log.SUBJECT && (
                                  <span className="text-slate-500"> — <span className="font-medium text-slate-700">{log.SUBJECT}</span></span>
                                )}
                              </p>

                              {/* Detail (opsional) */}
                              {log.DETAIL && (
                                <p className="text-[11px] text-slate-400 mt-0.5 italic">{log.DETAIL}</p>
                              )}
                            </div>

                            {/* Timestamp */}
                            <div className="text-right shrink-0 ml-2">
                              <p className="text-[10px] font-semibold text-slate-600">
                                {log.created_at ? format(new Date(log.created_at), 'HH:mm') : '—'}
                              </p>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                {log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: indonesia }) : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3.5 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 font-semibold transition-colors"
            >
              ← Sebelumnya
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                      page === p
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              {totalPages > 7 && <span className="text-slate-400 text-xs">···</span>}
            </div>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3.5 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 font-semibold transition-colors"
            >
              Berikutnya →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}