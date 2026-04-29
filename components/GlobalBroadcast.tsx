'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { X, Megaphone, Zap, Info, ClipboardList, ChevronRight } from 'lucide-react';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ─── TYPE CONFIG ──────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, {
  icon: React.ReactNode;
  popupGradient: string;
  popupBorder: string;
  accent: string;
  tickerBg: string;
  tickerText: string;
  badgeBg: string;
}> = {
  URGENT: {
    icon: <Zap size={13} />,
    popupGradient: 'linear-gradient(145deg, #1c0a0a 0%, #2d1010 100%)',
    popupBorder:   'rgba(251,113,133,0.4)',
    accent:        '#fb7185',
    tickerBg:      'linear-gradient(90deg, #7f1d1d 0%, #991b1b 100%)',
    tickerText:    '#fecaca',
    badgeBg:       'rgba(251,113,133,0.15)',
  },
  INFO: {
    icon: <Info size={13} />,
    popupGradient: 'linear-gradient(145deg, #071422 0%, #0d203e 100%)',
    popupBorder:   'rgba(96,165,250,0.4)',
    accent:        '#60a5fa',
    tickerBg:      'linear-gradient(90deg, #1e3a5f 0%, #1d4ed8 100%)',
    tickerText:    '#bfdbfe',
    badgeBg:       'rgba(96,165,250,0.15)',
  },
  ASSIGNMENT: {
    icon: <ClipboardList size={13} />,
    popupGradient: 'linear-gradient(145deg, #1a1200 0%, #2d1f00 100%)',
    popupBorder:   'rgba(251,191,36,0.4)',
    accent:        '#fbbf24',
    tickerBg:      'linear-gradient(90deg, #78350f 0%, #92400e 100%)',
    tickerText:    '#fde68a',
    badgeBg:       'rgba(251,191,36,0.15)',
  },
};

function dismissKey(id: number) { return `bc-dismissed-${id}`; }

function parseMsg(raw: string): { title: string; body: string } {
  const m = raw?.match(/^\[(.*?)\]\n\n([\s\S]*)$/);
  return m ? { title: m[1], body: m[2] } : { title: '', body: raw || '' };
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
  } catch { /* no audio support */ }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function GlobalBroadcast() {
  const [popup,           setPopup]           = useState<any>(null);
  const [ticker,          setTicker]          = useState<any>(null);
  const [tickerHidden,    setTickerHidden]    = useState(false);

  // Sync data-ticker attribute on body
  useEffect(() => {
    document.body.setAttribute('data-ticker', String(!!ticker && !tickerHidden));
    return () => { document.body.removeAttribute('data-ticker'); };
  }, [ticker, tickerHidden]);

  // On mount: cari broadcast terbaru yang belum di-dismiss untuk ticker
  const loadLatest = useCallback(async () => {
    const { data } = await supabase
      .from('Broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (!data || data.length === 0) return;
    const active = data.find(b => !localStorage.getItem(dismissKey(b.id)));
    if (active) setTicker(active);
  }, []);

  useEffect(() => {
    loadLatest();

    const channel = supabase
      .channel('global-broadcast-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Broadcasts' }, (payload) => {
        const b = payload.new as any;
        setPopup(b);
        setTicker(b);
        setTickerHidden(false);
        playChime();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadLatest]);

  const closePopup = () => {
    if (popup) localStorage.setItem(dismissKey(popup.id), '1');
    setPopup(null);
  };

  const closeTicker = () => {
    if (ticker) localStorage.setItem(dismissKey(ticker.id), '1');
    setTickerHidden(true);
  };

  const openDetail = () => { if (ticker) setPopup(ticker); };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const showTicker = ticker && !tickerHidden;
  const tConf  = ticker ? (TYPE_CONFIG[ticker.type]  || TYPE_CONFIG.INFO) : null;
  const pConf  = popup  ? (TYPE_CONFIG[popup.type]   || TYPE_CONFIG.INFO) : null;
  const tParsed = ticker ? parseMsg(ticker.message) : null;
  const pParsed = popup  ? parseMsg(popup.message)  : null;
  const tickerLine = tParsed ? (tParsed.title ? `${tParsed.title}  —  ${tParsed.body}` : tParsed.body) : '';

  return (
    <>
      {/* ══════════════════════════════════
          TICKER — running text, fixed top
          ══════════════════════════════════ */}
      {showTicker && tConf && (
        <div
          className="fixed top-0 left-0 right-0 z-[200] flex items-center select-none"
          style={{
            height: 32,
            background: tConf.tickerBg,
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.45)',
          }}
        >
          {/* Type badge */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-3 h-full border-r text-[10px] font-black uppercase tracking-widest"
            style={{ borderColor: 'rgba(255,255,255,0.18)', color: tConf.tickerText, minWidth: 'max-content' }}
          >
            {tConf.icon}
            <span>{ticker.type}</span>
          </div>

          {/* Scrolling text */}
          <div className="flex-1 overflow-hidden cursor-pointer" onClick={openDetail} title="Klik untuk detail">
            <div
              className="whitespace-nowrap text-[11px] font-semibold inline-block"
              style={{ color: tConf.tickerText, animation: 'bc-ticker 32s linear infinite', paddingLeft: '100%' }}
            >
              {tickerLine}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{tickerLine}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{tickerLine}
            </div>
          </div>

          {/* Detail btn */}
          <button
            onClick={openDetail}
            className="shrink-0 flex items-center gap-1 px-3 h-full border-l border-r text-[10px] font-bold uppercase tracking-wide hover:opacity-75 transition-opacity"
            style={{ borderColor: 'rgba(255,255,255,0.18)', color: tConf.tickerText }}
          >
            Detail <ChevronRight size={10} />
          </button>

          {/* Close ticker */}
          <button
            onClick={closeTicker}
            className="shrink-0 flex items-center justify-center w-9 h-full hover:opacity-70 transition-opacity"
            style={{ color: tConf.tickerText }}
            title="Tutup ticker"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════
          POPUP — full modal, dapat di-close
          ══════════════════════════════════ */}
      {popup && pConf && pParsed && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: pConf.popupGradient,
              border: `1px solid ${pConf.popupBorder}`,
              boxShadow: `0 0 0 1px ${pConf.popupBorder}, 0 32px 80px rgba(0,0,0,0.75)`,
              animation: 'bc-enter 0.32s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Accent line */}
            <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${pConf.accent}, ${pConf.accent}66)` }} />

            {/* Header */}
            <div className="px-5 py-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{ background: pConf.badgeBg }}>
                  <Megaphone size={17} style={{ color: pConf.accent }} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest"
                      style={{ background: pConf.badgeBg, color: pConf.accent }}
                    >
                      {pConf.icon} {popup.type}
                    </span>
                    {popup.sender && (
                      <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        dari {popup.sender}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>NOC FMI · Broadcast System</p>
                </div>
              </div>
              <button
                onClick={closePopup}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 pb-5 space-y-3">
              {pParsed.title && (
                <h3 className="text-base font-black leading-snug" style={{ color: pConf.accent }}>
                  {pParsed.title}
                </h3>
              )}
              <div
                className="rounded-xl p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{
                  background: 'rgba(0,0,0,0.32)',
                  border: `1px solid ${pConf.popupBorder}`,
                  color: 'rgba(255,255,255,0.82)',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {pParsed.body}
              </div>

              <button
                onClick={closePopup}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${pConf.accent}dd, ${pConf.accent}99)`,
                  color: popup.type === 'INFO' ? '#0a1628' : '#fff',
                  boxShadow: `0 4px 20px ${pConf.accent}38`,
                }}
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes bc-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
        @keyframes bc-enter {
          from { opacity: 0; transform: scale(0.90) translateY(20px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </>
  );
}