'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Megaphone, Send, Copy, RefreshCcw, Trash2, 
  FileText, User, Zap, Info, ClipboardList
} from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { toast } from 'sonner';
import { logActivity, getActorName } from '@/lib/logger';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const TEMPLATES = [
  {
    label: 'Gangguan Massal',
    type: 'URGENT',
    title: 'INFO GANGGUAN KONEKSI',
    text: 'Yth. Pelanggan,\n\nDiinformasikan saat ini sedang terjadi gangguan koneksi internet di area [AREA] yang disebabkan oleh putusnya kabel Fiber Optic (FO Cut).\n\nTim teknis kami sedang meluncur ke lokasi untuk perbaikan. Estimasi pengerjaan akan kami update berkala.\n\nMohon maaf atas ketidaknyamanan ini.'
  },
  {
    label: 'Maintenance',
    type: 'INFO',
    title: 'INFO PEMELIHARAAN JARINGAN',
    text: 'Yth. Pelanggan,\n\nDalam upaya peningkatan kualitas layanan, kami akan melakukan pemeliharaan perangkat (Maintenance) pada:\n\nHari/Tgl: [HARI, TANGGAL]\nJam: [JAM MULAI] - [JAM SELESAI]\nDampak: Koneksi akan terputus sementara (Downtime)\n\nMohon maaf atas ketidaknyamanan ini.'
  },
  {
    label: 'Gangguan Selesai',
    type: 'INFO',
    title: 'UPDATE GANGGUAN: SOLVED',
    text: 'Yth. Pelanggan,\n\nDiinformasikan bahwa gangguan koneksi di area [AREA] telah SELESAI ditangani dan layanan sudah normal kembali.\n\nSilakan restart perangkat jika masih terkendala. Terima kasih atas kesabaran Anda.'
  }
];

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string; dot: string }> = {
  URGENT:     { label: 'URGENT',     icon: <Zap size={10}/>,          badge: 'bg-rose-50 text-rose-600 border-rose-200',   dot: 'bg-rose-500' },
  INFO:       { label: 'INFO',       icon: <Info size={10}/>,         badge: 'bg-blue-50 text-blue-600 border-blue-200',   dot: 'bg-blue-500' },
  ASSIGNMENT: { label: 'ASSIGNMENT', icon: <ClipboardList size={10}/>, badge: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500' },
};

export default function BroadcastPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<any>(null);

  const [form, setForm] = useState({
    type: 'INFO',
    title: '',
    message: '',
    sender: 'Admin'
  });

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('Broadcasts').select('*').order('created_at', { ascending: false });
      if (!error) setHistory(data || []);
    } catch {
      toast.error('Gagal memuat riwayat broadcast');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHistory(); }, []);

  const handleTemplate = (tmpl: any) => {
    setForm({ ...form, type: tmpl.type, title: tmpl.title, message: tmpl.text });
    toast.info('Template diterapkan', { duration: 1500 });
  };

  const handleSave = async () => {
    if (!form.title || !form.message) {
      toast.error('Judul dan Pesan wajib diisi!');
      return;
    }
    setSending(true);
    const toastId = toast.loading('Mengirim broadcast...');
    const { error } = await supabase.from('Broadcasts').insert([{
      type: form.type,
      message: `[${form.title}]\n\n${form.message}`,
      sender: form.sender
    }]);
    toast.dismiss(toastId);
    setSending(false);
    if (error) {
      toast.error('Gagal simpan: ' + error.message);
    } else {
      fetchHistory();
      toast.success('Broadcast Terkirim!', { description: 'Pesan akan muncul di dashboard semua user.' });
      setForm({ ...form, title: '', message: '' });
      const actorName = await getActorName(supabase);
      await logActivity({
        activity: 'BROADCAST_SEND',
        subject: form.title,
        actor: actorName,
        detail: `Tipe: ${form.type} · Sender: ${form.sender}`,
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    const { error } = await supabase.from('Broadcasts').delete().eq('id', id);
    if (error) toast.error('Gagal hapus data');
    else {
      toast.success('Log broadcast dihapus.');
      fetchHistory();
      const actorName = await getActorName(supabase);
      await logActivity({
        activity: 'BROADCAST_DELETE',
        subject: `Broadcast #${id}`,
        actor: actorName,
      });
    }
  };

  const handleCopy = (title: string, msg: string) => {
    if (!title && !msg) { toast.error('Pesan kosong!'); return; }
    navigator.clipboard.writeText(`*${title}*\n\n${msg}\n\n_Regards,_\n*NOC System*`);
    toast.success('Disalin ke Clipboard!', { description: 'Siap paste ke WhatsApp.' });
  };

  const handleCopyFromHistory = (fullMessage: string) => {
    let text = fullMessage;
    const match = fullMessage.match(/^\[(.*?)\]\n\n([\s\S]*)$/);
    if (match) text = `*${match[1]}*\n\n${match[2]}\n\n_Regards,_\n*NOC System*`;
    navigator.clipboard.writeText(text);
    toast.success('Teks disalin!');
  };

  const typeConf = TYPE_CONFIG[form.type] || TYPE_CONFIG.INFO;

  return (
    <div
      className="p-6 md:p-8 min-h-screen flex flex-col lg:flex-row gap-5"
      style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}
    >

      {/* ── LEFT: EDITOR ── */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <Megaphone size={17} />
            </div>
            Broadcast Center
          </h1>
          <p className="text-xs text-slate-400 mt-1 ml-0.5">Generator pesan notifikasi massal untuk seluruh user.</p>
        </div>

        {/* Templates */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <FileText size={12} /> Template Cepat
          </h3>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t, idx) => (
              <button
                key={idx}
                onClick={() => handleTemplate(t)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-700 rounded-lg text-xs font-semibold transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">

          {/* Editor toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-sm">Editor Pesan</h3>
            <div className="flex items-center gap-2">
              {/* Sender */}
              <select
                value={form.sender}
                onChange={(e) => setForm({ ...form, sender: e.target.value })}
                className="text-xs font-semibold bg-white border border-slate-200 rounded-md px-2 py-1.5 outline-none text-slate-600 focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <option value="Admin">Admin</option>
                <option value="NOC">NOC</option>
                <option value="Bot">Bot</option>
              </select>

              {/* Type */}
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={`text-xs font-bold rounded-md px-2 py-1.5 outline-none border focus:ring-2 focus:ring-blue-500 transition-all
                  ${form.type === 'URGENT' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                    form.type === 'ASSIGNMENT' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    'bg-blue-50 border-blue-200 text-blue-700'}`}
              >
                <option value="INFO">INFO</option>
                <option value="URGENT">URGENT</option>
                <option value="ASSIGNMENT">ASSIGNMENT</option>
              </select>
            </div>
          </div>

          {/* Fields */}
          <div className="p-5 space-y-4 flex-1 flex flex-col">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Judul Broadcast</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Contoh: INFO GANGGUAN AREA JAKARTA..."
                className="input font-semibold"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Isi Pesan</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Ketik isi pesan di sini..."
                className="input font-mono text-xs leading-relaxed resize-none flex-1 min-h-[200px]"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2 bg-slate-50/50">
            <button
              onClick={() => setForm({ type: 'INFO', title: '', message: '', sender: 'Admin' })}
              className="px-3.5 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
            >
              Reset
            </button>
            <div className="flex-1" />
            <button
              onClick={() => handleCopy(form.title, form.message)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <Copy size={13} /> Copy WA
            </button>
            <button
              onClick={handleSave}
              disabled={sending}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Send size={13} />
              {sending ? 'Mengirim...' : 'Kirim & Simpan'}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: HISTORY ── */}
      <div
        className="w-full lg:w-[360px] shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        {/* History header */}
        <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <RefreshCcw size={14} className="text-slate-400" />
            Riwayat Broadcast
          </h3>
          <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
            {history.length} log
          </span>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading ? (
            <div className="flex flex-col gap-2 pt-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Megaphone size={28} className="opacity-20" />
              <p className="text-xs italic">Belum ada riwayat broadcast.</p>
            </div>
          ) : (
            history.map((item) => {
              const conf = TYPE_CONFIG[item.type] || TYPE_CONFIG.INFO;
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all group"
                >
                  {/* Badge row */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.badge}`}>
                        {conf.icon} {item.type}
                      </span>
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <User size={9} /> {item.sender}
                      </span>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmId(item.id)}
                      className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Hapus broadcast"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Message preview */}
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 mb-2.5">
                    <p className="text-[11px] text-slate-600 font-mono leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {item.message}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">
                      {item.created_at ? format(new Date(item.created_at), 'dd MMM · HH:mm', { locale: indonesia }) : '—'}
                    </span>
                    <button
                      onClick={() => handleCopyFromHistory(item.message)}
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                    >
                      <Copy size={10} /> Salin
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── KONFIRMASI HAPUS BROADCAST ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                <Trash2 size={15} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Hapus Broadcast?</h3>
                <p className="text-[11px] text-slate-400">Aksi ini tidak bisa dibatalkan.</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-slate-600">
                Log broadcast <span className="font-mono font-bold text-slate-800">#{deleteConfirmId}</span> akan dihapus permanen dari riwayat.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Ya, Hapus
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}