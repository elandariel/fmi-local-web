'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useParams } from 'next/navigation';
import { Save, ArrowLeft, Loader2, UserCog, Trash2, AlertTriangle } from 'lucide-react';
import { logActivity } from '@/lib/logger';
import { toast } from 'sonner';

// ─────────────────────────────────────────────
// FORM CONTENT
// ─────────────────────────────────────────────
function EditClientContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const [formData, setFormData] = useState({
    'ID Pelanggan': '',
    'Nama Pelanggan': '',
    'ALAMAT': '',
    'VMAN / VLAN': '',
    'Near End': '',
    'Far End': '',
    'STATUS': '',
    'Kapasitas': '',
    'RX ONT/SFP': ''
  });

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('Data Client Corporate')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        toast.error('Gagal mengambil data: ' + error.message);
        router.push('/clients');
      } else if (data) {
        setFormData(data);
      }
      setLoading(false);
    }
    if (id) fetchData();
  }, [id]);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('Data Client Corporate')
      .update({
        'Nama Pelanggan': formData['Nama Pelanggan'],
        'ALAMAT': formData['ALAMAT'],
        'VMAN / VLAN': formData['VMAN / VLAN'],
        'Near End': formData['Near End'],
        'Far End': formData['Far End'],
        'STATUS': formData['STATUS'],
        'Kapasitas': formData['Kapasitas'],
        'RX ONT/SFP': formData['RX ONT/SFP']
      })
      .eq('id', id);

    if (error) {
      toast.error('Gagal update: ' + error.message);
      setSaving(false);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      let actorName = 'System';
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        actorName = profile?.full_name || 'User';
      }
      await logActivity({ activity: 'Edit Client Corp', subject: formData['Nama Pelanggan'], actor: actorName });
      toast.success('Data Berhasil Diperbarui!', { description: 'Perubahan telah tersimpan di sistem.' });
      router.push('/clients');
      router.refresh();
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setShowDeleteModal(false);
    const { error } = await supabase.from('Data Client Corporate').delete().eq('id', id);
    if (error) {
      toast.error('Gagal hapus: ' + error.message);
      setSaving(false);
    } else {
      await logActivity({ activity: 'Delete Client Corp', subject: formData['Nama Pelanggan'], actor: 'User' });
      toast.success('Client Berhasil Dihapus', { description: 'Data telah dihapus permanen dari database.' });
      router.push('/clients');
      router.refresh();
    }
  };

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={24} />
    </div>
  );

  return (
    <div className="w-full max-w-3xl" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ── DELETE MODAL ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-rose-500" />
              </div>
              <h2 className="text-base font-bold text-slate-800">Hapus Client Permanen?</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                Tindakan ini <span className="text-rose-600 font-semibold">tidak bisa dibatalkan</span>.<br />
                Data akan hilang selamanya.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2.5">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-500"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
                <UserCog size={17} />
              </div>
              Edit Data Client
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 ml-0.5">Perbarui informasi pelanggan.</p>
          </div>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={saving}
          className="flex items-center gap-2 px-3.5 py-2 bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-lg font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
          title="Hapus Client"
        >
          <Trash2 size={13} />
          Hapus
        </button>
      </div>

      <form onSubmit={handleUpdate} className="space-y-4">

        {/* ── GROUP 1: IDENTITAS ── */}
        <FormSection title="Identitas Pelanggan">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="ID Pelanggan">
              <input
                name="ID Pelanggan"
                value={formData['ID Pelanggan'] || ''}
                readOnly
                className="input font-mono bg-slate-100 text-slate-400 cursor-not-allowed"
              />
            </FormField>
            <FormField label="Nama Pelanggan">
              <input
                name="Nama Pelanggan"
                value={formData['Nama Pelanggan'] || ''}
                onChange={handleChange}
                className="input"
              />
            </FormField>
          </div>
          <FormField label="Alamat Instalasi">
            <textarea
              name="ALAMAT"
              rows={2}
              value={formData['ALAMAT'] || ''}
              onChange={handleChange}
              className="input resize-none"
            />
          </FormField>
        </FormSection>

        {/* ── GROUP 2: TEKNIS ── */}
        <FormSection title="Spesifikasi Teknis">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="VLAN / VMAN">
              <input
                name="VMAN / VLAN"
                value={formData['VMAN / VLAN'] || ''}
                onChange={handleChange}
                className="input font-mono text-blue-600"
              />
            </FormField>
            <FormField label="Kapasitas">
              <input
                name="Kapasitas"
                value={formData['Kapasitas'] || ''}
                onChange={handleChange}
                className="input"
              />
            </FormField>
            <FormField label="Sinyal RX (dBm)">
              <input
                name="RX ONT/SFP"
                value={formData['RX ONT/SFP'] || ''}
                onChange={handleChange}
                className="input font-mono"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Near End (POP)">
              <input
                name="Near End"
                value={formData['Near End'] || ''}
                onChange={handleChange}
                className="input"
              />
            </FormField>
            <FormField label="Far End (CPE)">
              <input
                name="Far End"
                value={formData['Far End'] || ''}
                onChange={handleChange}
                className="input"
              />
            </FormField>
          </div>
          <FormField label="Status Layanan">
            <select
              name="STATUS"
              value={formData['STATUS'] || ''}
              onChange={handleChange}
              className="input bg-white"
            >
              <option value="Active">Active</option>
              <option value="Deactive">Berhenti Sementara</option>
              <option value="Berhenti Berlangganan">Berhenti Berlangganan</option>
              <option value="Dismantle">Dismantle</option>
            </select>
          </FormField>
        </FormSection>

        {/* ── SUBMIT ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2 shadow-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Menyimpan Perubahan...' : 'Update Data Client'}
        </button>

      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE EXPORT
// ─────────────────────────────────────────────
export default function EditClientPage() {
  return (
    <div className="min-h-screen p-6 md:p-8 flex justify-center items-start" style={{ background: '#f4f6f9', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <Suspense fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={24} />
        </div>
      }>
        <EditClientContent />
      </Suspense>
    </div>
  );
}