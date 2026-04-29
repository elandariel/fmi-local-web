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
  const [alerts, setAlerts]           = useState<any[]>([]);
  const [teamList, setTeamList]       = useState<string[]>([]);
  const [userRole, setUserRole]       = useState<Role | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [today, setToday]             = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Record<number, string>>({});
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
        november: 10, nov: 10, desember: 11, des: 11,
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
      'NAMA TEAM': teamName || 'System',
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

  const highlight = (text: string) => {
    if (!searchQuery.trim()) return <>{text}</>;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>{parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase()
          ? <mark key={i} style={{ background: 'rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: 2, padding: '0 2px' }}>{part}</mark>
          : part
      )}</>
    );
  };

  if (loading) return (
    <div className="h-[60px] rounded-xl mb-5 animate-pulse"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
  );
  if (alerts.length === 0) return null;

  const item = alerts[currentIndex];
  const targetDate = extractDateFromText(item['KETERANGAN'], item['TANGGAL']);
  const diffDays = today ? differenceInDays(today, targetDate) : 0;
  const isOverdue = diffDays > 1;

  const accentColor  = isOverdue ? '#f43f5e' : '#f59e0b';
  const accentBg     = isOverdue ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)';
  const accentBorder = isOverdue ? 'rgba(244,63,94,0.25)' : 'rgba(245,158,11,0.25)';
  const accentText   = isOverdue ? '#fda4af' : '#fcd34d';

  return (
    <>
      {/* ── BANNER ── */}
      <div
        className="rounded-xl mb-5 overflow-hidden relative"
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${accentBorder}`,
          boxShadow: `0 0 20px ${accentBg}, 0 2px 8px rgba(0,0,0,0.3)`,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: accentColor }} />

        <div className="pl-5 pr-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-1.5 rounded-lg shrink-0" style={{ background: accentBg, color: accentColor }}>
              <AlertTriangle size={14} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: accentBg, color: accentText, borderColor: accentBorder }}>
                  {isOverdue ? `+${diffDays}d OVERDUE` : item['STATUS']}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {currentIndex + 1}/{alerts.length}
                </span>
              </div>
              <p className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                {item['SUBJECT WO']}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentIndex(p => (p - 1 + alerts.length) % alerts.length)}
                className="p-1.5 rounded-lg transition-all"
                style={{ border: '1px solid var(--border-mid)', color: 'var(--text-muted)', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentIndex(p => (p + 1) % alerts.length)}
                className="p-1.5 rounded-lg transition-all"
                style={{ border: '1px solid var(--border-mid)', color: 'var(--text-muted)', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                <ChevronRight size={13} />
              </button>
            </div>
            <button
              onClick={() => { setIsModalOpen(true); setSearchQuery(''); setStatusFilter('ALL'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, ${isOverdue ? '#e11d48' : '#d97706'})`,
                color: '#fff',
                boxShadow: `0 2px 12px ${accentBg}`,
              }}
            >
              <AlertTriangle size={11} /> Lihat Semua ({alerts.length})
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-4xl max-h-[88vh] rounded-2xl flex flex-col overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-mid)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex justify-between items-center shrink-0"
              style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}
            >
              <div>
                <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <div className="p-1.5 rounded-lg" style={{ background: 'rgba(244,63,94,0.12)', color: '#fb7185' }}>
                    <AlertTriangle size={14} />
                  </div>
                  Antrean WO Pending & Progress
                </h2>
                <p className="text-xs mt-0.5 ml-0.5" style={{ color: 'var(--text-muted)' }}>
                  {filteredAlerts.length} dari {alerts.length} item ditampilkan
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Search + Filter */}
            <div
              className="px-4 py-3 shrink-0 space-y-2.5"
              style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}
            >
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari subject WO, keterangan, tim, atau ID..."
                  className="w-full pl-9 pr-9 py-2 text-xs rounded-xl outline-none transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-mid)',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-bg)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold mr-0.5" style={{ color: 'var(--text-muted)' }}>Filter:</span>
                {uniqueStatuses.map(status => {
                  const count = status === 'ALL' ? alerts.length : alerts.filter(a => a['STATUS'] === status).length;
                  const isActive = statusFilter === status;
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all"
                      style={isActive
                        ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border-mid)' }
                      }
                    >
                      {status} <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  );
                })}
                {(searchQuery || statusFilter !== 'ALL') && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
                    className="ml-auto text-[10px] font-semibold flex items-center gap-1 transition-colors"
                    style={{ color: 'var(--accent)' }}
                  >
                    <X size={10} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5" style={{ background: 'var(--bg-base)' }}>
              {filteredAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <Search size={20} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Tidak ada hasil</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {searchQuery ? `Tidak ada WO yang cocok dengan "${searchQuery}"` : 'Coba ubah filter status'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
                    className="text-xs font-semibold transition-colors"
                    style={{ color: 'var(--accent)' }}
                  >
                    Reset filter
                  </button>
                </div>
              ) : (
                filteredAlerts.map(alert => {
                  const aDate = extractDateFromText(alert['KETERANGAN'], alert['TANGGAL']);
                  const aDiff = today ? differenceInDays(today, aDate) : 0;
                  const aOverdue = aDiff > 1;
                  const aAccent = aOverdue ? '#f43f5e' : '#f59e0b';
                  const aAccentBg = aOverdue ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)';
                  const aAccentText = aOverdue ? '#fda4af' : '#fcd34d';
                  const aAccentBorder = aOverdue ? 'rgba(244,63,94,0.25)' : 'rgba(245,158,11,0.25)';

                  return (
                    <div
                      key={alert.id}
                      className="rounded-xl overflow-hidden transition-all"
                      style={{
                        background: 'var(--bg-surface)',
                        border: `1px solid var(--border-light)`,
                        borderLeft: `3px solid ${aAccent}`,
                      }}
                    >
                      <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                              style={{ background: aAccentBg, color: aAccentText, borderColor: aAccentBorder }}>
                              {aOverdue ? `+${aDiff}d OVERDUE` : alert['STATUS']}
                            </span>
                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                              #{highlight(String(alert.id))}
                            </span>
                            {alert['NAMA TEAM'] && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' }}>
                                {highlight(alert['NAMA TEAM'])}
                              </span>
                            )}
                          </div>

                          <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                            {highlight(alert['SUBJECT WO'] || '')}
                          </p>
                          {alert['KETERANGAN'] && (
                            <p className="text-[11px] italic mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                              "{highlight(alert['KETERANGAN'])}"
                            </p>
                          )}

                          {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>Eksekutor:</span>
                              <select
                                className="text-xs rounded-lg px-2 py-1 outline-none transition-all"
                                style={{
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-mid)',
                                  color: 'var(--text-primary)',
                                  fontFamily: 'inherit',
                                }}
                                value={selectedTeams[alert.id] || alert['NAMA TEAM'] || ''}
                                onChange={e => setSelectedTeams({ ...selectedTeams, [alert.id]: e.target.value })}
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
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                              style={{ background: 'rgba(244,63,94,0.1)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.25)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.2)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.1)'; }}
                            >
                              {processingId === alert.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                              Cancel
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(alert.id, 'SOLVED')}
                              disabled={processingId === alert.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                              style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.2)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.1)'; }}
                            >
                              {processingId === alert.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                              Solved
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] italic shrink-0" style={{ color: 'var(--text-muted)' }}>View Only</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div
              className="px-5 py-3.5 flex items-center justify-between shrink-0"
              style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {filteredAlerts.length > 0
                  ? `Menampilkan ${filteredAlerts.length} dari ${alerts.length} WO`
                  : 'Tidak ada hasil ditemukan'}
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2 rounded-xl font-semibold text-sm transition-all"
                style={{ background: 'var(--bg-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)'; }}
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
