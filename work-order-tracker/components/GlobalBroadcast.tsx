'use client';

import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { X, Megaphone, AlertTriangle, Info, CheckCircle, BellRing } from 'lucide-react';
import type { Role } from '@/lib/permissions';

// ── localStorage keys (shared namespace dengan BroadcastTicker) ─
// BroadcastTicker sudah pakai bc_last_seen_id & bc_last_popup_ms
// GlobalBroadcast pakai key terpisah agar tidak saling override
const LS_GB_LAST_ID  = 'gb_last_seen_id';   // ID broadcast terakhir yang ditampilkan
const LS_GB_LAST_MS  = 'gb_last_popup_ms';  // Timestamp terakhir popup ditampilkan
const HOUR_MS        = 60 * 60 * 1000;      // 1 jam dalam ms

export default function GlobalBroadcast() {
  const [notification, setNotification] = useState<any>(null);
  const [isVisible, setIsVisible]       = useState(false);
  const userRoleRef = useRef<Role | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL     || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // ── Fetch current user's role once ──────────────────────
  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role) {
        userRoleRef.current = profile.role as Role;
      }
    }
    loadRole();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: apakah broadcast ini ditujukan ke role saya? ─
  function isTargetedToMe(broadcast: any): boolean {
    const roles: string[] | null = broadcast.target_roles ?? null;
    if (!roles || roles.length === 0) return true;
    const role = userRoleRef.current;
    if (!role) return false;
    if (role === 'SUPER_DEV') return true;
    return roles.includes(role);
  }

  // ── Helper: apakah perlu tampilkan popup? ───────────────
  // Aturan:
  //  - Broadcast baru (ID berbeda dari yang terakhir) → SELALU tampilkan
  //  - Broadcast sama tapi sudah > 1 jam lalu ditampilkan → tampilkan lagi
  //  - Broadcast sama dan baru < 1 jam ditampilkan → SKIP
  function shouldShow(broadcast: any): boolean {
    try {
      const lastId  = localStorage.getItem(LS_GB_LAST_ID);
      const lastMs  = parseInt(localStorage.getItem(LS_GB_LAST_MS) || '0', 10);
      const isNew   = String(broadcast.id) !== lastId;
      const expired = Date.now() - lastMs > HOUR_MS;
      return isNew || expired;
    } catch {
      return true; // localStorage tidak tersedia → selalu tampilkan
    }
  }

  // ── Simpan ke localStorage setelah popup ditampilkan ────
  function markAsSeen(broadcast: any) {
    try {
      localStorage.setItem(LS_GB_LAST_ID, String(broadcast.id));
      localStorage.setItem(LS_GB_LAST_MS, String(Date.now()));
    } catch { /* ignore */ }
  }

  // ── Play notification beep ───────────────────────────────
  function playBeep() {
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* ignore */ }
  }

  // ── Show broadcast (dengan throttle check) ──────────────
  function showBroadcast(broadcast: any, beep = true) {
    if (!isTargetedToMe(broadcast)) return;
    if (!shouldShow(broadcast)) return;     // throttle: skip kalau < 1 jam
    setNotification(broadcast);
    setIsVisible(true);
    markAsSeen(broadcast);
    if (beep) playBeep();
  }

  // ── Realtime listener ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('global-broadcast')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Broadcasts' },
        (payload) => showBroadcast(payload.new, true)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => setNotification(null), 500);
  };

  if (!notification) return null;

  // ── Tampilan ─────────────────────────────────────────────
  const type = notification.type || 'INFO';
  let containerStyle = 'bg-white border-blue-100 text-slate-800';
  let iconBg         = 'bg-blue-100 text-blue-600';
  let Icon           = Info;
  let labelColor     = 'text-blue-600 bg-blue-50';

  if (type === 'URGENT' || type.includes('GANGGUAN')) {
    containerStyle = 'bg-white border-rose-100 text-slate-800 ring-4 ring-rose-50';
    iconBg         = 'bg-rose-100 text-rose-600 animate-pulse';
    Icon           = AlertTriangle;
    labelColor     = 'text-rose-600 bg-rose-50';
  } else if (type === 'MAINTENANCE') {
    containerStyle = 'bg-white border-amber-100 text-slate-800 ring-4 ring-amber-50';
    iconBg         = 'bg-amber-100 text-amber-600';
    Icon           = Megaphone;
    labelColor     = 'text-amber-600 bg-amber-50';
  } else if (type === 'SUCCESS') {
    containerStyle = 'bg-white border-emerald-100 text-slate-800';
    iconBg         = 'bg-emerald-100 text-emerald-600';
    Icon           = CheckCircle;
    labelColor     = 'text-emerald-600 bg-emerald-50';
  }

  const match = notification.message?.match(/^\[(.*?)\]([\s\S]*)$/);
  const title = match ? match[1] : 'BROADCAST MESSAGE';
  const body  = match ? match[2] : notification.message;

  return (
    <div
      className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-xl px-4 transition-all duration-500 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0 pointer-events-none'
      }`}
    >
      <div className={`relative flex gap-4 p-5 rounded-2xl shadow-2xl border ${containerStyle} overflow-hidden backdrop-blur-sm`}>

        {/* Accent strip */}
        <div className={`absolute top-0 left-0 w-1 h-full ${
          type === 'URGENT'      ? 'bg-rose-500'  :
          type === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-blue-500'
        }`} />

        {/* Icon */}
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={24} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${labelColor}`}>
              {type}
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <BellRing size={10} /> {notification.sender || 'Admin'}
            </span>
            <span className="text-[10px] text-slate-300">• Now</span>
            {notification.target_roles && notification.target_roles.length > 0 && (
              <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                → {notification.target_roles.join(', ')}
              </span>
            )}
          </div>

          <h4 className="font-bold text-lg text-slate-900 leading-tight mb-1">
            {title}
          </h4>

          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
            {body?.trim()}
          </p>
        </div>

        {/* Close */}
        <button
          onClick={handleClose}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
