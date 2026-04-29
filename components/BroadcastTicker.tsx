'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { X, Zap, Info, ClipboardList, Megaphone, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';

// ── Types ────────────────────────────────────────────────────────
interface Broadcast {
  id: number;
  type: string;
  message: string;
  sender: string;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────
const LS_LAST_ID      = 'bc_last_seen_id';
const LS_LAST_POPUP   = 'bc_last_popup_ms';
const HOUR_MS         = 60 * 60 * 1000;

const TYPE_CONFIG: Record<string, {
  bar: string; bg: string; text: string; badge: string;
  popupBg: string; popupBorder: string; popupAccent: string;
  icon: React.ReactNode;
  label: string;
}> = {
  URGENT: {
    bar: '#ef4444', bg: 'rgba(239,68,68,0.12)', text: '#fca5a5', badge: 'rgba(239,68,68,0.25)',
    popupBg: '#1a0808', popupBorder: '#7f1d1d', popupAccent: '#ef4444',
    icon: <Zap size={11} />, label: 'URGENT',
  },
  ASSIGNMENT: {
    bar: '#f59e0b', bg: 'rgba(245,158,11,0.12)', text: '#fcd34d', badge: 'rgba(245,158,11,0.25)',
    popupBg: '#1a1200', popupBorder: '#78350f', popupAccent: '#f59e0b',
    icon: <ClipboardList size={11} />, label: 'ASSIGNMENT',
  },
  INFO: {
    bar: '#3b82f6', bg: 'rgba(59,130,246,0.12)', text: '#93c5fd', badge: 'rgba(59,130,246,0.25)',
    popupBg: '#05101f', popupBorder: '#1e3a5f', popupAccent: '#3b82f6',
    icon: <Info size={11} />, label: 'INFO',
  },
};

// ── Helpers ──────────────────────────────────────────────────────
function parseMessage(raw: string): { title: string; body: string } {
  const match = raw?.match(/^\[(.*?)\]\n\n([\s\S]*)$/);
  return match
    ? { title: match[1], body: match[2] }
    : { title: 'BROADCAST', body: raw || '' };
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}

// ── Detail Popup ─────────────────────────────────────────────────
function BroadcastPopup({ broadcast, onClose }: { broadcast: Broadcast; onClose: () => void }) {
  const conf = TYPE_CONFIG[broadcast.type] || TYPE_CONFIG.INFO;
  const { title, body } = parseMessage(broadcast.message);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${conf.popupAccent}44`,
          boxShadow: `0 0 40px ${conf.popupAccent}22, 0 20px 60px rgba(0,0,0,0.5)`,
          animation: 'popup-in 0.2s ease-out',
        }}
      >
        {/* Header strip */}
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(to right, ${conf.popupAccent}, ${conf.popupAccent}66)` }}
        />

        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: `1px solid ${conf.popupAccent}22` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${conf.popupAccent}18`, border: `1px solid ${conf.popupAccent}33` }}
            >
              <Megaphone size={18} style={{ color: conf.popupAccent }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: `${conf.popupAccent}20`, color: conf.popupAccent, border: `1px solid ${conf.popupAccent}33` }}
                >
                  {conf.icon} {conf.label}
                </span>
              </div>
              <h3 className="text-sm font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg shrink-0 transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div
            className="rounded-xl p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto custom-scrollbar"
            style={{
              background: 'var(--bg-elevated)',
              border: `1px solid var(--border-light)`,
              color: 'var(--text-secondary)',
            }}
          >
            {body.trim()}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: `1px solid var(--border-light)`, background: 'var(--bg-elevated)' }}
        >
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1">
              <User size={11} /> {broadcast.sender}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {broadcast.created_at
                ? format(new Date(broadcast.created_at), 'dd MMM yyyy · HH:mm', { locale: indonesia })
                : '—'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
            style={{ background: conf.popupAccent, color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            Mengerti
          </button>
        </div>
      </div>

      <style>{`
        @keyframes popup-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function BroadcastTicker() {
  const [broadcast, setBroadcast]     = useState<Broadcast | null>(null);
  const [tickerVisible, setTickerVisible] = useState(false);
  const [showPopup, setShowPopup]     = useState(false);
  const [dismissed, setDismissed]     = useState<number | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Cek apakah perlu show popup (login baru atau sudah > 1 jam)
  const shouldShowPopup = useCallback((bc: Broadcast): boolean => {
    try {
      const lastId   = localStorage.getItem(LS_LAST_ID);
      const lastTime = parseInt(localStorage.getItem(LS_LAST_POPUP) || '0', 10);
      const isNewBroadcast = String(bc.id) !== lastId;
      const isOverAnHour   = Date.now() - lastTime > HOUR_MS;
      return isNewBroadcast || isOverAnHour;
    } catch { return true; }
  }, []);

  const openPopup = useCallback((bc: Broadcast) => {
    setShowPopup(true);
    try {
      localStorage.setItem(LS_LAST_ID,    String(bc.id));
      localStorage.setItem(LS_LAST_POPUP, String(Date.now()));
    } catch { /* ignore */ }
  }, []);

  const handleClosePopup = () => setShowPopup(false);

  // Fetch latest + setup realtime + hourly timer
  useEffect(() => {
    let hourlyTimer: ReturnType<typeof setInterval>;

    async function fetchLatest() {
      const { data } = await supabase
        .from('Broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setBroadcast(data);
        setTickerVisible(true);

        // Popup on login (or overdue)
        if (shouldShowPopup(data)) {
          openPopup(data);
          playBeep();
        }

        // Auto popup every hour
        hourlyTimer = setInterval(() => {
          setShowPopup(true);
          try { localStorage.setItem(LS_LAST_POPUP, String(Date.now())); } catch { /* ignore */ }
        }, HOUR_MS);
      }
    }

    fetchLatest();

    // Realtime
    const channel = supabase
      .channel('ticker-broadcast')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Broadcasts' },
        (payload) => {
          const newBc = payload.new as Broadcast;
          setBroadcast(newBc);
          setDismissed(null);
          setTickerVisible(true);
          openPopup(newBc);
          playBeep();
          // Reset timer jam — mulai ulang dari sekarang
          clearInterval(hourlyTimer);
          hourlyTimer = setInterval(() => {
            setShowPopup(true);
            try { localStorage.setItem(LS_LAST_POPUP, String(Date.now())); } catch { /* ignore */ }
          }, HOUR_MS);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(hourlyTimer);
    };
  }, [shouldShowPopup, openPopup]);

  const handleDismissTicker = () => {
    setTickerVisible(false);
    if (broadcast) setDismissed(broadcast.id);
  };

  // Ticker tidak render jika tidak ada data atau di-dismiss
  const showTicker = broadcast && tickerVisible && dismissed !== broadcast.id;

  const conf = broadcast ? (TYPE_CONFIG[broadcast.type] || TYPE_CONFIG.INFO) : TYPE_CONFIG.INFO;
  const parsed = broadcast ? parseMessage(broadcast.message) : { title: '', body: '' };
  const tickerText = `${parsed.title}  ·  ${parsed.body.replace(/\n/g, ' · ')}  ·  — ${broadcast?.sender ?? ''}`;

  return (
    <>
      {/* ── TICKER BAR ── */}
      {showTicker && broadcast && (
        <div
          className="w-full flex items-center gap-2 px-3 shrink-0"
          style={{
            height: 32,
            background: conf.bg,
            borderBottom: `1px solid ${conf.bar}33`,
            borderLeft: `3px solid ${conf.bar}`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Type badge */}
          <div
            className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black uppercase cursor-default"
            style={{ background: conf.badge, color: conf.text }}
          >
            {conf.icon}
            <span>{broadcast.type}</span>
          </div>

          {/* Separator */}
          <div className="shrink-0 w-px h-4" style={{ background: `${conf.bar}44` }} />

          {/* Marquee — clickable */}
          <button
            onClick={() => openPopup(broadcast)}
            className="flex-1 overflow-hidden text-left"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
            }}
            title="Klik untuk lihat detail pesan"
          >
            <div
              className="flex items-center whitespace-nowrap text-[11px] font-semibold"
              style={{
                color: conf.text,
                animation: 'ticker-scroll 32s linear infinite',
              }}
            >
              <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
              <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </div>
          </button>

          {/* Dismiss */}
          <button
            onClick={handleDismissTicker}
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded transition-opacity hover:opacity-100 opacity-40"
            style={{ color: conf.text }}
            title="Tutup ticker"
          >
            <X size={12} />
          </button>

          <style>{`
            @keyframes ticker-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </div>
      )}

      {/* ── DETAIL POPUP ── */}
      {showPopup && broadcast && (
        <BroadcastPopup broadcast={broadcast} onClose={handleClosePopup} />
      )}
    </>
  );
}
