'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Megaphone, Send, Copy, RefreshCcw, Trash2,
  FileText, User, Zap, Info, ClipboardList,
  AlertTriangle, Eye, EyeOff, Pencil, Save,
  X, RotateCcw, Clock, CheckCircle2, Users, Globe
} from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/permissions';
import { format, differenceInHours } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { toast } from 'sonner';
import { logActivity } from '@/lib/logger';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const HISTORY_LIMIT = 50;
const EXPIRE_HOURS  = 24;
const STORAGE_KEY   = 'noc-broadcast-templates';

type TemplateItem = {
  id: string;
  label: string;
  type: string;
  title: string;
  text: string;
};

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    id: 'tpl-1',
    label: 'Gangguan Massal',
    type: 'URGENT',
    title: 'INFO GANGGUAN KONEKSI',
    text: 'Yth. Pelanggan,\n\nDiinformasikan saat ini sedang terjadi gangguan koneksi internet di area [AREA] yang disebabkan oleh putusnya kabel Fiber Optic (FO Cut).\n\nTim teknis kami sedang meluncur ke lokasi untuk perbaikan. Estimasi pengerjaan akan kami update berkala.\n\nMohon maaf atas ketidaknyamanan ini.',
  },
  {
    id: 'tpl-2',
    label: 'Maintenance',
    type: 'INFO',
    title: 'INFO PEMELIHARAAN JARINGAN',
    text: 'Yth. Pelanggan,\n\nDalam upaya peningkatan kualitas layanan, kami akan melakukan pemeliharaan perangkat (Maintenance) pada:\n\nHari/Tgl: [HARI, TANGGAL]\nJam: [JAM MULAI] - [JAM SELESAI]\nDampak: Koneksi akan terputus sementara (Downtime)\n\nMohon maaf atas ketidaknyamanan ini.',
  },
  {
    id: 'tpl-3',
    label: 'Gangguan Selesai',
    type: 'INFO',
    title: 'UPDATE GANGGUAN: SOLVED',
    text: 'Yth. Pelanggan,\n\nDiinformasikan bahwa gangguan koneksi di area [AREA] telah SELESAI ditangani dan layanan sudah normal kembali.\n\nSilakan restart perangkat jika masih terkendala. Terima kasih atas kesabaran Anda.',
  },
];

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  URGENT:     { label: 'URGENT',     icon: <Zap size={10} />,           badge: 'bg-rose-50 text-rose-600 border-rose-200' },
  INFO:       { label: 'INFO',       icon: <Info size={10} />,          badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  ASSIGNMENT: { label: 'ASSIGNMENT', icon: <ClipboardList size={10} />, badge: 'bg-amber-50 text-amber-600 border-amber-200' },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function isExpired(created_at: string): boolean {
  return differenceInHours(new Date(), new Date(created_at)) >= EXPIRE_HOURS;
}

function timeLeft(created_at: string): string {
  const h = EXPIRE_HOURS - differenceInHours(new Date(), new Date(created_at));
  if (h <= 0) return 'Expired';
  if (h < 1)  return '< 1j lagi';
  return `${h}j lagi`;
}

function loadTemplates(): TemplateItem[] {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function BroadcastPage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL    || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  ), []);

  // ── Data state ──
  const [history, setHistory]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [senderName, setSenderName] = useState('NOC');

  // ── Form ──
  const [form, setForm] = useState({ type: 'INFO', title: '', message: '' });
  const [showPreview, setShowPreview] = useState(false);

  // ── Role targeting ──
  // empty array = Semua User (null in DB); selected = specific roles only
  const [targetRoles, setTargetRoles] = useState<Role[]>([]);
  const ALL_ROLES: Role[] = ['NOC', 'CS', 'AKTIVATOR', 'ADMIN', 'SUPER_DEV'];

  const toggleRole = (role: Role) => {
    setTargetRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // ── Delete confirm modal ──
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // ── Template editor modal ──
  const [templates, setTemplates]             = useState<TemplateItem[]>(loadTemplates);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);

  // ────────────────────────────────
  // Fetch logged-in user's full name — BC-BUG-03
  // ────────────────────────────────
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (profile?.full_name) setSenderName(profile.full_name);
      }
    }
    loadUser();
  }, [supabase]);

  // ────────────────────────────────
  // History — BC-BUG-02: limit 50
  // ────────────────────────────────
  async function fetchHistory() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (!error) setHistory(data || []);
    } catch {
      toast.error('Gagal memuat riwayat broadcast');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHistory(); }, []);

  // ────────────────────────────────
  // Template handlers — BC-UX-03
  // ────────────────────────────────
  const persistTemplates = (updated: TemplateItem[]) => {
    setTemplates(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  };

  const handleApplyTemplate = (tmpl: TemplateItem) => {
    setForm({ type: tmpl.type, title: tmpl.title, message: tmpl.text });
    setShowPreview(false);
    toast.info('Template diterapkan', { duration: 1500 });
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    persistTemplates(templates.map(t => t.id === editingTemplate.id ? editingTemplate : t));
    setEditingTemplate(null);
    toast.success('Template disimpan!');
  };

  const handleResetTemplates = () => {
    persistTemplates(DEFAULT_TEMPLATES);
    setEditingTemplate(null);
    toast.success('Template direset ke default');
  };

  // ────────────────────────────────
  // Send broadcast
  // ────────────────────────────────
  const handleSave = async () => {
    if (!form.title || !form.message) {
      toast.error('Judul dan Pesan wajib diisi!');
      return;
    }
    setSending(true);
    const toastId = toast.loading('Mengirim broadcast...');
    const { error } = await supabase.from('Broadcasts').insert([{
      type:        form.type,
      message:     `[${form.title}]\n\n${form.message}`,
      sender:      senderName,
      target_roles: targetRoles.length > 0 ? targetRoles : null,
    }]);
    toast.dismiss(toastId);
    setSending(false);
    if (error) {
      toast.error('Gagal simpan: ' + error.message);
    } else {
      fetchHistory();
      setForm({ type: 'INFO', title: '', message: '' });
      setTargetRoles([]);
      setShowPreview(false);
      const targetDesc = targetRoles.length > 0
        ? `Hanya untuk: ${targetRoles.join(', ')}`
        : 'Pesan akan muncul di dashboard semua user.';
      toast.success('Broadcast Terkirim!', { description: targetDesc });
      await logActivity({
        activity: 'BROADCAST_SEND',
        subject: form.title,
        actor:   senderName,
        detail:  `Tipe: ${form.type} · Sender: ${senderName}`,
      });
    }
  };

  // ────────────────────────────────
  // Delete — BC-BUG-01: confirmation modal
  // ────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const { error } = await supabase.from('Broadcasts').delete().eq('id', id);
    if (error) {
      toast.error('Gagal hapus data');
    } else {
      toast.success('Broadcast dihapus');
      fetchHistory();
      await logActivity({
        activity: 'BROADCAST_DELETE',
        subject:  `Broadcast #${id}`,
        actor:    senderName,
      });
    }
  };

  // ────────────────────────────────
  // Re-push expired broadcast — BC-BUG-04
  // ────────────────────────────────
  const handleRePush = async (item: any) => {
    setSending(true);
    const toastId = toast.loading('Re-push broadcast...');
    const { error } = await supabase.from('Broadcasts').insert([{
      type:         item.type,
      message:      item.message,
      sender:       senderName,
      target_roles: item.target_roles ?? null,
    }]);
    toast.dismiss(toastId);
    setSending(false);
    if (error) {
      toast.error('Gagal re-push: ' + error.message);
    } else {
      fetchHistory();
      toast.success('Broadcast Di-push Ulang!', { description: '24 jam baru dimulai.' });
      await logActivity({
        activity: 'BROADCAST_SEND',
        subject:  `Re-push: ${item.message.slice(0, 50)}`,
        actor:    senderName,
        detail:   `Re-push dari broadcast #${item.id}`,
      });
    }
  };

  // ────────────────────────────────
  // Copy helpers
  // ────────────────────────────────
  const handleCopy = (title: string, msg: string) => {
    if (!title && !msg) { toast.error('Pesan kosong!'); return; }
    navigator.clipboard.writeText(`*${title}*\n\n${msg}\n\n_Regards,_\n*NOC System*`);
    toast.success('Disalin ke Clipboard!', { description: 'Siap paste ke WhatsApp.' });
  };

  const handleCopyFromHistory = (fullMessage: string) => {
    const match = fullMessage.match(/^\[(.*?)\]\n\n([\s\S]*)$/);
    const text  = match
      ? `*${match[1]}*\n\n${match[2]}\n\n_Regards,_\n*NOC System*`
      : fullMessage;
    navigator.clipboard.writeText(text);
    toast.success('Teks disalin!');
  };

  // ────────────────────────────────
  // Derived
  // ────────────────────────────────
  const typeConf    = TYPE_CONFIG[form.type] || TYPE_CONFIG.INFO;
  const previewText = form.title ? `[${form.title}]\n\n${form.message}` : form.message;
  const activeCount = history.filter(h => !isExpired(h.created_at)).length;

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────
  return (
    <div
      className="p-6 md:p-8 min-h-screen flex flex-col lg:flex-row gap-5"
      style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-sans)' }}
    >

      {/* ── DELETE CONFIRM MODAL — BC-BUG-01 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-rose-500" />
              </div>
              <h2 className="text-base font-bold text-slate-800">Hapus Broadcast?</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                Tindakan ini <span className="text-rose-600 font-semibold">tidak bisa dibatalkan</span>.<br />
                Log broadcast akan dihapus permanen.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATE EDITOR MODAL — BC-UX-03 ── */}
      {showTemplateEditor && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                {editingTemplate ? `Edit: ${editingTemplate.label}` : 'Kelola Template'}
              </h2>
              <div className="flex items-center gap-2">
                {!editingTemplate && (
                  <button
                    onClick={handleResetTemplates}
                    className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors font-semibold"
                  >
                    <RotateCcw size={11} /> Reset Default
                  </button>
                )}
                <button
                  onClick={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {editingTemplate ? (
                /* ── Edit form ── */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Label Tombol</label>
                      <input
                        value={editingTemplate.label}
                        onChange={e => setEditingTemplate({ ...editingTemplate, label: e.target.value })}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Tipe</label>
                      <select
                        value={editingTemplate.type}
                        onChange={e => setEditingTemplate({ ...editingTemplate, type: e.target.value })}
                        className="input text-sm bg-white"
                      >
                        <option value="INFO">INFO</option>
                        <option value="URGENT">URGENT</option>
                        <option value="ASSIGNMENT">ASSIGNMENT</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Judul Default</label>
                    <input
                      value={editingTemplate.title}
                      onChange={e => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                      className="input text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Isi Pesan Default</label>
                    <textarea
                      value={editingTemplate.text}
                      onChange={e => setEditingTemplate({ ...editingTemplate, text: e.target.value })}
                      rows={9}
                      className="input text-xs font-mono resize-none leading-relaxed"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingTemplate(null)}
                      className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSaveTemplate}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Save size={13} /> Simpan Template
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Template list ── */
                <div className="space-y-2">
                  {templates.map(t => {
                    const tc = TYPE_CONFIG[t.type] || TYPE_CONFIG.INFO;
                    return (
                      <div
                        key={t.id}
                        className="p-3.5 border border-slate-200 rounded-xl flex items-start gap-3 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm text-slate-800">{t.label}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${tc.badge}`}>{t.type}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-600">{t.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 font-mono">{t.text}</p>
                        </div>
                        <button
                          onClick={() => setEditingTemplate({ ...t })}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 rounded-lg flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          LEFT: EDITOR
      ═══════════════════════════════════════ */}
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

        {/* Templates — BC-UX-03 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <FileText size={12} /> Template Cepat
            </h3>
            <button
              onClick={() => setShowTemplateEditor(true)}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              <Pencil size={11} /> Edit Template
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleApplyTemplate(t)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-700 rounded-lg text-xs font-semibold transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-sm">Editor Pesan</h3>
              {/* Sender badge — BC-BUG-03: shows logged-in user */}
              <div className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2 py-1">
                <User size={10} />
                <span className="font-semibold">{senderName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Preview toggle — BC-UX-02 */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                  showPreview
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                }`}
              >
                {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                {showPreview ? 'Edit' : 'Preview'}
              </button>

              {/* Type selector */}
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={`text-xs font-bold rounded-md px-2 py-1.5 outline-none border focus:ring-2 focus:ring-blue-500 transition-all ${
                  form.type === 'URGENT'     ? 'bg-rose-50 border-rose-200 text-rose-700' :
                  form.type === 'ASSIGNMENT' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                  'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                <option value="INFO">INFO</option>
                <option value="URGENT">URGENT</option>
                <option value="ASSIGNMENT">ASSIGNMENT</option>
              </select>
            </div>
          </div>

          {/* Fields / Preview area */}
          <div className="p-5 flex-1 flex flex-col space-y-4">
            {showPreview ? (
              /* ── PREVIEW MODE — BC-UX-02 ── */
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Preview Broadcast
                </label>
                <div className="flex-1 rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm max-w-md">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeConf.badge}`}>
                        {typeConf.icon} {form.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                        <User size={9} /> {senderName}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto">Baru saja</span>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      {previewText
                        ? <p className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">{previewText}</p>
                        : <p className="text-[11px] text-slate-400 italic">Belum ada isi pesan...</p>
                      }
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">
                    Simulasi tampilan broadcast di dashboard user.
                  </p>
                </div>
              </div>
            ) : (
              /* ── EDIT MODE ── */
              <>
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
              </>
            )}
          </div>

          {/* ── Target Roles — Tujuan Pesan ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} className="text-slate-400" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Tujuan Pesan
                </span>
                {targetRoles.length === 0 ? (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <Globe size={9} /> Semua User
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    {targetRoles.length} role dipilih
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* "Semua User" chip */}
                <button
                  type="button"
                  onClick={() => setTargetRoles([])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    targetRoles.length === 0
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                >
                  <Globe size={10} /> Semua User
                </button>

                {/* Role chips */}
                {ALL_ROLES.map(role => {
                  const selected = targetRoles.includes(role);
                  const colors = ROLE_COLORS[role];
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all"
                      style={selected ? {
                        background: colors.bg,
                        color: colors.text,
                        borderColor: colors.border,
                        boxShadow: `0 0 0 2px ${colors.border}`,
                      } : {
                        background: '#fff',
                        color: '#94a3b8',
                        borderColor: '#e2e8f0',
                      }}
                    >
                      {selected && <span style={{ color: colors.text }}>✓</span>}
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>

              {targetRoles.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-2.5">
                  Hanya user dengan role <span className="font-semibold text-slate-500">{targetRoles.map(r => ROLE_LABELS[r]).join(', ')}</span> yang akan menerima notifikasi ini.
                </p>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2 bg-slate-50/50">
            <button
              onClick={() => { setForm({ type: 'INFO', title: '', message: '' }); setTargetRoles([]); setShowPreview(false); }}
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

      {/* ═══════════════════════════════════════
          RIGHT: HISTORY
      ═══════════════════════════════════════ */}
      <div
        className="w-full lg:w-[380px] shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        {/* History header */}
        <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <RefreshCcw size={14} className="text-slate-400" />
            Riwayat Broadcast
          </h3>
          <div className="flex items-center gap-1.5">
            {activeCount > 0 && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 size={9} /> {activeCount} aktif
              </span>
            )}
            <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
              {history.length} log
            </span>
          </div>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading ? (
            <div className="flex flex-col gap-2 pt-2">
              {[1, 2, 3].map(i => (
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
              const conf    = TYPE_CONFIG[item.type] || TYPE_CONFIG.INFO;
              const expired = isExpired(item.created_at);
              const remain  = !expired ? timeLeft(item.created_at) : null;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-all group ${
                    expired
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {/* Badge row */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.badge}`}>
                        {conf.icon} {item.type}
                      </span>
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <User size={9} /> {item.sender}
                      </span>
                      {/* Target roles badge */}
                      {item.target_roles && Array.isArray(item.target_roles) && item.target_roles.length > 0 ? (
                        <span className="text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Users size={8} /> {item.target_roles.join(', ')}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Globe size={8} /> Semua
                        </span>
                      )}
                      {/* BC-BUG-04: active / expired status */}
                      {expired ? (
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                          Expired
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Clock size={8} /> {remain}
                        </span>
                      )}
                    </div>
                    {/* BC-BUG-01: sets deleteTarget instead of deleting directly */}
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0"
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
                      {item.created_at
                        ? format(new Date(item.created_at), 'dd MMM · HH:mm', { locale: indonesia })
                        : '—'}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* BC-BUG-04: re-push button only for expired */}
                      {expired && (
                        <button
                          onClick={() => handleRePush(item)}
                          disabled={sending}
                          className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors disabled:opacity-40"
                        >
                          <RefreshCcw size={10} /> Push Ulang
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyFromHistory(item.message)}
                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                      >
                        <Copy size={10} /> Salin
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Limit notice — BC-BUG-02 */}
        {history.length >= HISTORY_LIMIT && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 shrink-0 text-center">
            <p className="text-[10px] text-slate-400">Menampilkan {HISTORY_LIMIT} log terbaru</p>
          </div>
        )}
      </div>
    </div>
  );
}
