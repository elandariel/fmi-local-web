'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { X, Megaphone, AlertTriangle, Info, CheckCircle, BellRing } from 'lucide-react';

export default function GlobalBroadcast() {
  const [notification, setNotification] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    // 1. Setup Realtime Listener
    const channel = supabase
      .channel('global-broadcast')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', 
          schema: 'public',
          table: 'Broadcasts', // Pastikan "B" besar sesuai tabel kamu
        },
        (payload) => {
          console.log('Broadcast Received:', payload.new);
          setNotification(payload.new);
          setIsVisible(true);
          
          // Opsional: Suara Notifikasi
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Hapus data setelah animasi selesai biar bersih
    setTimeout(() => setNotification(null), 500);
  };

  if (!notification) return null;

  // --- LOGIC TAMPILAN (WARNA & ICON) ---
  const type = notification.type || 'INFO';
  let containerStyle = 'bg-white border-blue-100 text-slate-800';
  let iconBg = 'bg-blue-100 text-blue-600';
  let Icon = Info;
  let labelColor = 'text-blue-600 bg-blue-50';

  if (type === 'URGENT' || type.includes('GANGGUAN')) {
    containerStyle = 'bg-white border-rose-100 text-slate-800 ring-4 ring-rose-50';
    iconBg = 'bg-rose-100 text-rose-600 animate-pulse';
    Icon = AlertTriangle;
    labelColor = 'text-rose-600 bg-rose-50';
  } else if (type === 'MAINTENANCE') {
    containerStyle = 'bg-white border-amber-100 text-slate-800 ring-4 ring-amber-50';
    iconBg = 'bg-amber-100 text-amber-600';
    Icon = Megaphone;
    labelColor = 'text-amber-600 bg-amber-50';
  } else if (type === 'SUCCESS') {
    containerStyle = 'bg-white border-emerald-100 text-slate-800';
    iconBg = 'bg-emerald-100 text-emerald-600';
    Icon = CheckCircle;
    labelColor = 'text-emerald-600 bg-emerald-50';
  }

  // Parsing Judul dari format "[JUDUL] Pesan"
  const match = notification.message?.match(/^\[(.*?)\]([\s\S]*)$/);
  const title = match ? match[1] : 'BROADCAST MESSAGE';
  const body = match ? match[2] : notification.message;

  return (
    // WRAPPER: Fixed di Tengah Atas (Floating)
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-xl px-4 transition-all duration-500 ease-out ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0 pointer-events-none'}`}>
      
      {/* KARTU NOTIFIKASI */}
      <div className={`relative flex gap-4 p-5 rounded-2xl shadow-2xl border ${containerStyle} overflow-hidden backdrop-blur-sm`}>
        
        {/* Dekorasi Background Accent */}
        <div className={`absolute top-0 left-0 w-1 h-full ${type === 'URGENT' ? 'bg-rose-500' : type === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>

        {/* ICON */}
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={24} />
        </div>

        {/* CONTENT */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${labelColor}`}>
              {type}
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <BellRing size={10} /> {notification.sender || 'Admin'}
            </span>
            <span className="text-[10px] text-slate-300">• Now</span>
          </div>

          <h4 className="font-bold text-lg text-slate-900 leading-tight mb-1">
            {title}
          </h4>
          
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
            {body?.trim()}
          </p>
        </div>

        {/* CLOSE BUTTON */}
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