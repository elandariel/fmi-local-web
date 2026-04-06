'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Bell, AlertTriangle, X, RefreshCw, 
  Trash2, ShieldQuestion, Send, ExternalLink, 
  Calendar, CheckCircle2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';

const TYPE_COLOR: Record<string, { border: string; badge: string; text: string }> = {
  blue:    { border: 'border-l-blue-500',    badge: 'bg-blue-50 text-blue-600 border-blue-100',    text: 'text-blue-600' },
  red:     { border: 'border-l-rose-500',    badge: 'bg-rose-50 text-rose-600 border-rose-100',    text: 'text-rose-600' },
  orange:  { border: 'border-l-amber-500',   badge: 'bg-amber-50 text-amber-600 border-amber-100', text: 'text-amber-600' },
  emerald: { border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', text: 'text-emerald-600' },
  yellow:  { border: 'border-l-yellow-500',  badge: 'bg-yellow-50 text-yellow-700 border-yellow-100', text: 'text-yellow-600' },
};

export function NotificationBell() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [currentUser, setCurrentUser] = useState<string>('USER');
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingItems, setMissingItems] = useState<any[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

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
        { keyword: 'Pelurusan VLAN',         targetTable: 'Berlangganan 2026',         targetCol: 'SUBJECT BERLANGGANAN',         label: 'Pelanggan Baru', color: 'blue' },
        { keyword: 'Berhenti Berlangganan',   targetTable: 'Berhenti Berlangganan 2026', targetCol: 'SUBJECT BERHENTI BERLANGGANAN', label: 'Berhenti',       color: 'red' },
        { keyword: 'Berhenti Sementara',      targetTable: 'Berhenti Sementara 2026',   targetCol: 'SUBJECT BERHENTI SEMENTARA',   label: 'Cuti',           color: 'orange' },
        { keyword: ['Upgrade Bandwith', 'Upgrade Kapasitas'],   targetTable: 'Upgrade 2026',   targetCol: 'SUBJECT UPGRADE',   label: 'Upgrade',   color: 'emerald' },
        { keyword: ['Downgrade Bandwith', 'Downgrade Kapasitas'], targetTable: 'Downgrade 2026', targetCol: 'SUBJECT DOWNGRADE', label: 'Downgrade', color: 'yellow' }
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
              missing.push({
                id: wo.id,
                date: wo['TANGGAL'],
                subject: wo['SUBJECT WO'],
                type: rule.label,
                targetTable: rule.targetTable,
                themeColor: rule.color
              });
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
        REQUESTED_BY: currentUser
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

  return (
    <>
      {/* ── BELL BUTTON ── */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
      >
        <Bell size={20} />
        {!loading && missingItems.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {missingItems.length > 9 ? '9+' : missingItems.length}
          </span>
        )}
      </button>

      {/* ── NOTIFICATION PANEL ── */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div
            className="bg-white w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200"
            style={{ maxHeight: '85vh', fontFamily: "'IBM Plex Sans', sans-serif" }}
          >

            {/* Panel header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-rose-50 rounded-lg text-rose-500">
                  <AlertTriangle size={15} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">Missing Data Sinkronisasi</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {missingItems.length > 0
                      ? `${missingItems.length} item perlu ditindaklanjuti`
                      : 'Semua data terintegrasi'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={checkMissingData}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50">
              {loading ? (
                <div className="flex flex-col gap-2.5 pt-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-20 bg-white border border-slate-200 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : missingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 size={26} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700 text-sm">Database Terintegrasi</p>
                    <p className="text-xs text-slate-400 mt-0.5">Semua WO sudah tersinkronisasi dengan baik</p>
                  </div>
                </div>
              ) : (
                missingItems.map((item, idx) => {
                  const conf = TYPE_COLOR[item.themeColor] || TYPE_COLOR.blue;
                  return (
                    <div
                      key={idx}
                      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${conf.border} p-4 flex items-center justify-between gap-4 hover:shadow-sm transition-shadow`}
                    >
                      <div className="flex-1 min-w-0">
                        {/* Meta */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                            <Calendar size={10} /> {item.date}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.badge}`}>
                            {item.type}
                          </span>
                        </div>
                        {/* Subject */}
                        <p className="font-semibold text-slate-800 text-sm truncate mb-1">{item.subject}</p>
                        {/* Target table */}
                        <p className="text-[10px] text-slate-400">
                          Missing di:{' '}
                          <span className={`font-bold ${conf.text}`}>{item.targetTable}</span>
                        </p>
                      </div>

                      {/* Actions */}
                      {hasAccess(userRole, PERMISSIONS.CLIENT_ADD) ? (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            onClick={() => handleFixData(item.subject)}
                            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-sm"
                          >
                            <ExternalLink size={11} /> Input
                          </button>
                          <button
                            onClick={() => { setSelectedItem(item); setReason(''); setShowReasonModal(true); }}
                            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 rounded-lg font-semibold text-xs transition-all"
                          >
                            <Trash2 size={11} /> Abaikan
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-300 italic shrink-0">View Only</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REASON MODAL ── */}
      {showReasonModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldQuestion size={22} className="text-amber-500" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Konfirmasi Abaikan</h3>
              <p className="text-xs text-slate-400 mt-1">
                Berikan alasan mengapa WO ini diabaikan dari sinkronisasi
              </p>
            </div>

            <div className="p-5">
              {/* Selected item info */}
              {selectedItem && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Subject</p>
                  <p className="text-xs font-semibold text-slate-700">{selectedItem.subject}</p>
                </div>
              )}

              <textarea
                placeholder="Kenapa WO ini diabaikan?..."
                className="w-full h-28 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all resize-none bg-slate-50 focus:bg-white"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => setShowReasonModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={submitDiscard}
                  disabled={!reason.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
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