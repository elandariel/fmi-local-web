'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  AlertTriangle, ChevronLeft, ChevronRight,
  X, XCircle, CheckCircle, Loader2, Search
} from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { toast } from 'sonner';

export default function AlertBanner() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [teamList, setTeamList] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Record<number, string>>({});

  // ── SEARCH & FILTER STATE ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const extractDateFromText = (text: string, defaultDate: string) => {
    if (!text) return new Date(defaultDate);
    const regex = /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)[a-z]*\s+(\d{4})/i;
    const match = text.match(regex);
    if (match) {
      const monthMap: Record<string, number> = {
        januari: 0, jan: 0, februari: 1, feb: 1, maret: 2, mar: 2,
        april: 3, apr: 3, mei: 4, juni: 5, jun: 5, juli: 6, jul: 6,
        agustus: 7, agu: 7, september: 8, sep: 8, oktober: 9, okt: 9,
        november: 10, nov: 10, desember: 11, des: 11
      };
      const monthStr = match[2].toLowerCase();
      if (monthMap.hasOwnProperty(monthStr))
        return new Date(parseInt(match[3]), monthMap[monthStr], parseInt(match[1]));
    }
    return new Date(defaultDate);
  };

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role as Role);
      }
      const { data: woData } = await supabase
        .from('Report Bulanan').select('*')
        .in('STATUS', ['PENDING', 'PROGRESS', 'ON PROGRESS', 'OPEN'])
        .order('id', { ascending: false });
      if (woData) setAlerts(woData);

      const { data: teamData } = await supabase.from('Index').select('TEAM').not('TEAM', 'is', null);
      if (teamData) setTeamList(Array.from(new Set(teamData.map((t: any) => t.TEAM))) as string[]);
    } catch (err) {
      console.error('Error AlertBanner:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setToday(new Date()); fetchData(); }, []);

  // ── FILTERED + SEARCHED ALERTS ──
  const filteredAlerts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return alerts.filter(alert => {
      const matchSearch = !q ||
        (alert['SUBJECT WO'] || '').toLowerCase().includes(q) ||
        (alert['KETERANGAN'] || '').toLowerCase().includes(q) ||
        (alert['NAMA TEAM'] || '').toLowerCase().includes(q) ||
        String(alert.id).includes(q);
      const matchStatus = statusFilter === 'ALL' || alert['STATUS'] === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [alerts, searchQuery, statusFilter]);

  const uniqueStatuses = useMemo(() =>
    ['ALL', ...Array.from(new Set(alerts.map(a => a['STATUS'])))],
    [alerts]
  );

  const handleUpdateStatus = async (id: number, actionType: string) => {
    if (!hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION)) {
      toast.error('Izin ditolak.'); return;
    }
    const teamName = selectedTeams[id];
    if (actionType === 'SOLVED' && !teamName) {
      toast.error('Pilih Team Eksekutor dulu!'); return;
    }
    setProcessingId(id);
    const toastId = toast.loading('Memproses...');
    const { error } = await supabase.from('Report Bulanan').update({
      'STATUS': actionType,
      'KETERANGAN': actionType === 'SOLVED' ? 'DONE' : 'CANCELLED',
      'SELESAI ACTION': new Date().toISOString().split('T')[0],
      'NAMA TEAM': teamName || 'System'
    }).eq('id', id);

    if (error) {
      toast.error('Gagal: ' + error.message, { id: toastId });
    } else {
      toast.success(actionType === 'SOLVED' ? 'WO ditandai Solved!' : 'WO dibatalkan', { id: toastId });
      setAlerts(prev => {
        const updated = prev.filter(item => item.id !== id);
        if (currentIndex >= updated.length) setCurrentIndex(Math.max(0, updated.length - 1));
        return updated;
      });
      if (alerts.length <= 1) setIsModalOpen(false);
    }
    setProcessingId(null);
  };

  // Helper: highlight search match
  const highlight = (text: string) => {
    if (!searchQuery.trim()) return <>{text}</>;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>{parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic">{part}</mark>
          : part
      )}</>
    );
  };

  // Helper: badge styling by status
  const statusBadgeClass = (status: string, overdue: boolean) => {
    if (overdue) return 'bg-rose-50 text-rose-600 border-rose-200';
    if (status === 'OPEN') return 'bg-blue-50 text-blue-600 border-blue-200';
    if (status === 'PROGRESS' || status === 'ON PROGRESS') return 'bg-indigo-50 text-indigo-600 border-indigo-200';
    return 'bg-amber-50 text-amber-600 border-amber-200';
  };

  if (loading) return <div className="h-[72px] bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse mb-6" />;
  if (alerts.length === 0) return null;

  const item = alerts[currentIndex];
  const targetDate = extractDateFromText(item['KETERANGAN'], item['TANGGAL']);
  const diffDays = today ? differenceInDays(today, targetDate) : 0;
  const isOverdue = diffDays > 1;

  return (
    <>
      {/* ── BANNER ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden relative" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: isOverdue ? '#e11d48' : '#f59e0b' }} />
        <div className="pl-5 pr-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${isOverdue ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
              <AlertTriangle size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isOverdue ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                  {isOverdue ? `+${diffDays}d OVERDUE` : item['STATUS']}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{currentIndex + 1}/{alerts.length}</span>
              </div>
              <p className="text-sm font-bold text-slate-800 truncate leading-tight">{item['SUBJECT WO']}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-1">
              <button onClick={() => setCurrentIndex(p => (p - 1 + alerts.length) % alerts.length)} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"><ChevronLeft size={14} /></button>
              <button onClick={() => setCurrentIndex(p => (p + 1) % alerts.length)} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"><ChevronRight size={14} /></button>
            </div>
            <button
              onClick={() => { setIsModalOpen(true); setSearchQuery(''); setStatusFilter('ALL'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-sm"
            >
              <AlertTriangle size={11} /> Lihat Semua ({alerts.length})
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl max-h-[88vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-200" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <div className="p-1.5 bg-rose-50 rounded-lg text-rose-500"><AlertTriangle size={15} /></div>
                  Antrean WO Pending & Progress
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 ml-0.5">
                  {filteredAlerts.length} dari {alerts.length} item ditampilkan
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* ── SEARCH + FILTER BAR ── */}
            <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0 space-y-2.5">

              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari subject WO, keterangan, tim, atau ID..."
                  className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700 placeholder:text-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status filter tabs */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400 mr-0.5">Filter:</span>
                {uniqueStatuses.map((status) => {
                  const count = status === 'ALL' ? alerts.length : alerts.filter(a => a['STATUS'] === status).length;
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                        statusFilter === status
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {status} <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}

                {(searchQuery || statusFilter !== 'ALL') && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
                    className="ml-auto text-[10px] font-semibold text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    <X size={10} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50">
              {filteredAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                    <Search size={20} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Tidak ada hasil</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery ? `Tidak ada WO yang cocok dengan "${searchQuery}"` : 'Coba ubah filter status'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Reset filter
                  </button>
                </div>
              ) : (
                filteredAlerts.map((alert) => {
                  const aDate = extractDateFromText(alert['KETERANGAN'], alert['TANGGAL']);
                  const aDiff = today ? differenceInDays(today, aDate) : 0;
                  const aOverdue = aDiff > 1;

                  return (
                    <div key={alert.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className={`h-0.5 w-full ${aOverdue ? 'bg-rose-400' : 'bg-amber-300'}`} />
                      <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass(alert['STATUS'], aOverdue)}`}>
                              {aOverdue ? `+${aDiff}d OVERDUE` : alert['STATUS']}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">#{highlight(String(alert.id))}</span>
                            {alert['NAMA TEAM'] && (
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                {highlight(alert['NAMA TEAM'])}
                              </span>
                            )}
                          </div>

                          <p className="font-semibold text-slate-800 text-sm leading-tight">
                            {highlight(alert['SUBJECT WO'] || '')}
                          </p>
                          {alert['KETERANGAN'] && (
                            <p className="text-[11px] text-slate-400 italic mt-0.5 line-clamp-2">
                              "{highlight(alert['KETERANGAN'])}"
                            </p>
                          )}

                          {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-400 shrink-0">Eksekutor:</span>
                              <select
                                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                value={selectedTeams[alert.id] || alert['NAMA TEAM'] || ''}
                                onChange={(e) => setSelectedTeams({ ...selectedTeams, [alert.id]: e.target.value })}
                              >
                                <option value="">— Pilih Team —</option>
                                {teamList.map((t, i) => <option key={i} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                        </div>

                        {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) ? (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleUpdateStatus(alert.id, 'CANCEL')}
                              disabled={processingId === alert.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {processingId === alert.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                              Cancel
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(alert.id, 'SOLVED')}
                              disabled={processingId === alert.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {processingId === alert.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                              Solved
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 italic shrink-0">View Only</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
              <p className="text-xs text-slate-400">
                {filteredAlerts.length > 0
                  ? `Menampilkan ${filteredAlerts.length} dari ${alerts.length} WO`
                  : 'Tidak ada hasil ditemukan'}
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}