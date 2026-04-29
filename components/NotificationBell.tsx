'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Bell, AlertTriangle, X, RefreshCw,
  Trash2, ShieldQuestion, Send, ExternalLink,
  Calendar, CheckCircle2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';

// These are always used inside the dark-glass dropdown, so colors are hardcoded light
const TYPE_COLOR: Record<string, { glow: string; badge: string; text: string; border: string }> = {
  blue:    { glow: '#3b82f6', badge: 'rgba(59,130,246,0.18)',  text: '#93c5fd',  border: 'rgba(59,130,246,0.3)' },
  red:     { glow: '#f43f5e', badge: 'rgba(244,63,94,0.18)',   text: '#fda4af',  border: 'rgba(244,63,94,0.3)' },
  orange:  { glow: '#f59e0b', badge: 'rgba(245,158,11,0.18)',  text: '#fcd34d',  border: 'rgba(245,158,11,0.3)' },
  emerald: { glow: '#10b981', badge: 'rgba(16,185,129,0.18)',  text: '#6ee7b7',  border: 'rgba(16,185,129,0.3)' },
  yellow:  { glow: '#eab308', badge: 'rgba(234,179,8,0.18)',   text: '#fef08a',  border: 'rgba(234,179,8,0.3)' },
};

// Always-white text tokens for inside the dark-glass dropdown
const DT = {
  textPrimary:   '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted:     '#64748b',
  border:        'rgba(255,255,255,0.08)',
  hoverBg:       'rgba(255,255,255,0.06)',
};

export function NotificationBell() {
  const router = useRouter();
  const bellRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted]           = useState(false);
  const [isOpen, setIsOpen]             = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [reason, setReason]             = useState('');
  const [currentUser, setCurrentUser]   = useState<string>('USER');
  const [userRole, setUserRole]         = useState<Role | null>(null);
  const [loading, setLoading]           = useState(true);
  const [missingItems, setMissingItems] = useState<any[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'USER';
      setCurrentUser(name.toUpperCase());
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setUserRole(profile.role as Role);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchUserData();
    checkMissingData();
    const interval = setInterval(checkMissingData, 300000);
    return () => clearInterval(interval);
  }, []);

  const checkMissingData = async () => {
    setLoading(true);
    const missing: any[] = [];
    try {
      const { data: ignoredData } = await supabase.from('Ignored_Items').select('SUBJECT_IGNORED');
      const ignoredSet = new Set(ignoredData?.map(i => i.SUBJECT_IGNORED?.toLowerCase().trim()) || []);

      const { data: solvedWO } = await supabase.from('Report Bulanan').select('*').eq('STATUS', 'SOLVED');
      if (!solvedWO || solvedWO.length === 0) {
        setMissingItems([]);
        setLoading(false);
        return;
      }

      const rules = [
        { keyword: 'Pelurusan VLAN',         targetTable: 'Berlangganan 2026',          targetCol: 'SUBJECT BERLANGGANAN',          label: 'Pelanggan Baru', color: 'blue' },
        { keyword: 'Berhenti Berlangganan',   targetTable: 'Berhenti Berlangganan 2026', targetCol: 'SUBJECT BERHENTI BERLANGGANAN', label: 'Berhenti',       color: 'red' },
        { keyword: 'Berhenti Sementara',      targetTable: 'Berhenti Sementara 2026',    targetCol: 'SUBJECT BERHENTI SEMENTARA',    label: 'Cuti',           color: 'orange' },
        { keyword: ['Upgrade Bandwith', 'Upgrade Kapasitas'],    targetTable: 'Upgrade 2026',   targetCol: 'SUBJECT UPGRADE',   label: 'Upgrade',   color: 'emerald' },
        { keyword: ['Downgrade Bandwith', 'Downgrade Kapasitas'], targetTable: 'Downgrade 2026', targetCol: 'SUBJECT DOWNGRADE', label: 'Downgrade', color: 'yellow' },
      ];

      for (const rule of rules) {
        const candidates = solvedWO.filter((wo) => {
          const subject = (wo['SUBJECT WO'] || '').toLowerCase();
          return Array.isArray(rule.keyword)
            ? rule.keyword.some(k => subject.includes(k.toLowerCase()))
            : subject.includes(rule.keyword.toLowerCase());
        });
        if (candidates.length > 0) {
          const { data: existingData } = await supabase.from(rule.targetTable).select('*');
          const existingSubjects = new Set(existingData?.map((item) => (item[rule.targetCol] || '').toLowerCase().trim()) || []);
          candidates.forEach((wo) => {
            const woSubjectClean = (wo['SUBJECT WO'] || '').toLowerCase().trim();
            if (!existingSubjects.has(woSubjectClean) && !ignoredSet.has(woSubjectClean)) {
              missing.push({ id: wo.id, date: wo['TANGGAL'], subject: wo['SUBJECT WO'], type: rule.label, targetTable: rule.targetTable, themeColor: rule.color });
            }
          });
        }
      }
      setMissingItems(missing);
    } catch (err) {
      console.error('Notification Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFixData = (subject: string) => {
    if (!hasAccess(userRole, PERMISSIONS.CLIENT_ADD)) return;
    router.push(`/tracker/create?subject=${encodeURIComponent(subject)}`);
    setIsOpen(false);
  };

  const submitDiscard = async () => {
    if (!hasAccess(userRole, PERMISSIONS.CLIENT_ADD)) return;
    if (!reason.trim()) return;
    try {
      const { error } = await supabase.from('Ignored_Items').insert({
        SUBJECT_IGNORED: selectedItem.subject,
        ALASAN: reason,
        STATUS: 'PENDING',
        REQUESTED_BY: currentUser,
      });
      if (error) throw error;
      setShowReasonModal(false);
      setReason('');
      checkMissingData();
    } catch (err: any) {
      alert('Gagal discard: ' + err.message);
    }
  };

  if (!mounted) return null;

  const hasAlerts = !loading && missingItems.length > 0;

  return (
    <>
      {/* ── BELL + DROPDOWN WRAPPER ── */}
      <div ref={bellRef} className="relative">

        {/* Bell button */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className="relative p-2 rounded-xl transition-all"
          style={{
            background: isOpen ? 'rgba(16,185,129,0.12)' : 'transparent',
            border: `1px solid ${isOpen ? 'rgba(16,185,129,0.3)' : 'transparent'}`,
            color: isOpen ? '#10b981' : 'var(--text-muted)',
          }}
          onMouseEnter={e => {
            if (!isOpen) {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={e => {
            if (!isOpen) {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            }
          }}
        >
          <Bell size={18} />
          {hasAlerts && (
            <span
              className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#f43f5e,#e11d48)', boxShadow: '0 0 8px rgba(244,63,94,0.6)' }}
            >
              {missingItems.length > 9 ? '9+' : missingItems.length}
            </span>
          )}
        </button>

        {/* ── DROPDOWN PANEL ── */}
        {isOpen && (
          <div
            className="absolute right-0 top-full mt-2 flex flex-col overflow-hidden"
            style={{
              width: 'min(480px, calc(100vw - 32px))',
              maxHeight: '75vh',
              zIndex: 9999,
              background: 'rgba(10,18,32,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.08), 0 0 40px rgba(16,185,129,0.05)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {/* Panel header */}
            <div
              className="px-4 py-3.5 flex items-center justify-between shrink-0"
              style={{ borderBottom: `1px solid ${DT.border}` }}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(244,63,94,0.15)', color: '#fda4af' }}>
                  <AlertTriangle size={14} />
                </div>
                <div>
                  <h2 className="font-bold text-sm" style={{ color: DT.textPrimary }}>
                    Missing Data Sinkronisasi
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: DT.textMuted }}>
                    {missingItems.length > 0
                      ? `${missingItems.length} item perlu ditindaklanjuti`
                      : 'Semua data terintegrasi'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={checkMissingData}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: DT.textMuted, background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = DT.hoverBg; (e.currentTarget as HTMLButtonElement).style.color = DT.textPrimary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = DT.textMuted; }}
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: DT.textMuted, background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = DT.hoverBg; (e.currentTarget as HTMLButtonElement).style.color = DT.textPrimary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = DT.textMuted; }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {loading ? (
                <div className="flex flex-col gap-2 pt-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${DT.border}` }} />
                  ))}
                </div>
              ) : missingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <CheckCircle2 size={26} style={{ color: '#10b981' }} />
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: DT.textPrimary }}>Database Terintegrasi</p>
                    <p className="text-xs mt-0.5" style={{ color: DT.textMuted }}>Semua WO sudah tersinkronisasi</p>
                  </div>
                </div>
              ) : (
                missingItems.map((item, idx) => {
                  const conf = TYPE_COLOR[item.themeColor] || TYPE_COLOR.blue;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-3.5 flex items-start justify-between gap-3 transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${DT.border}`,
                        borderLeft: `3px solid ${conf.glow}`,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.055)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    >
                      <div className="flex-1 min-w-0">
                        {/* Meta */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-medium flex items-center gap-1 px-2 py-0.5 rounded-full"
                            style={{ background: DT.hoverBg, color: DT.textMuted, border: `1px solid ${DT.border}` }}>
                            <Calendar size={9} /> {item.date}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: conf.badge, color: conf.text, border: `1px solid ${conf.border}` }}>
                            {item.type}
                          </span>
                        </div>
                        {/* Subject */}
                        <p className="font-semibold text-xs leading-snug mb-1.5 line-clamp-2" style={{ color: DT.textPrimary }}>
                          {item.subject}
                        </p>
                        {/* Target table */}
                        <p className="text-[10px]" style={{ color: DT.textMuted }}>
                          Missing di:{' '}
                          <span className="font-bold" style={{ color: conf.text }}>{item.targetTable}</span>
                        </p>
                      </div>

                      {/* Actions */}
                      {hasAccess(userRole, PERMISSIONS.CLIENT_ADD) ? (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            onClick={() => handleFixData(item.subject)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all"
                            style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(37,99,235,0.55)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
                          >
                            <ExternalLink size={11} /> Input
                          </button>
                          <button
                            onClick={() => { setSelectedItem(item); setReason(''); setIsOpen(false); setShowReasonModal(true); }}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all"
                            style={{ background: 'rgba(255,255,255,0.07)', color: DT.textSecondary, border: `1px solid ${DT.border}` }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#fda4af'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,63,94,0.3)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = DT.textSecondary; (e.currentTarget as HTMLButtonElement).style.borderColor = DT.border; }}
                          >
                            <Trash2 size={11} /> Abaikan
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold italic shrink-0" style={{ color: DT.textMuted }}>View Only</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── REASON MODAL ── */}
      {showReasonModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(10,18,32,0.95)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <div className="p-6 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <ShieldQuestion size={22} style={{ color: '#fbbf24' }} />
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Konfirmasi Abaikan</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Berikan alasan mengapa WO ini diabaikan dari sinkronisasi
              </p>
            </div>

            <div className="p-5">
              {selectedItem && (
                <div className="rounded-xl px-3 py-2.5 mb-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Subject</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedItem.subject}</p>
                </div>
              )}

              <textarea
                placeholder="Kenapa WO ini diabaikan?..."
                className="w-full h-28 rounded-xl p-3 text-sm outline-none resize-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.08)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.boxShadow = 'none'; }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => setShowReasonModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                >
                  Batal
                </button>
                <button
                  onClick={submitDiscard}
                  disabled={!reason.trim()}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', boxShadow: reason.trim() ? '0 4px 16px rgba(37,99,235,0.4)' : 'none' }}
                >
                  <Send size={14} /> Kirim Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
