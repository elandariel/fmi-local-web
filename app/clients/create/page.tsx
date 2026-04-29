'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, ArrowLeft, Loader2, UserPlus, FileText, Network, Settings } from 'lucide-react';
import { logActivity } from '@/lib/logger';
import { toast } from 'sonner';

// ─────────────────────────────────────────────
// FORM CONTENT
// ─────────────────────────────────────────────
function CreateClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nameFromTracker = searchParams.get('name') || '';
  const [saving, setSaving] = useState(false);

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
    'STATUS': 'Active',
    'Kapasitas': '',
    'RX ONT/SFP': '',
    'SN ONT': '',
    'Data Teknis': '',
    'Konfigurasi': ''
  });

  useEffect(() => {
    if (nameFromTracker) {
      setFormData(prev => ({ ...prev, 'Nama Pelanggan': nameFromTracker }));
    }
  }, [nameFromTracker]);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const downloadTxt = (data: any) => {
    const content = `Dear All,

Telah diregister dan diluruskan client di bawah ini :

ID Pelanggan            : ${data['ID Pelanggan'] || '-'}
Nama Pelanggan          : ${data['Nama Pelanggan'] || '-'}
Alamat                  : ${data['ALAMAT'] || '-'}
VLAN ID                 : ${data['VMAN / VLAN'] || '-'}
Near End                : ${data['Near End'] || '-'}
Far End                 : ${data['Far End'] || '-'}
Kapasitas               : ${data['Kapasitas'] || '-'}
RX ONT                  : ${data['RX ONT/SFP'] || '-'}
SN ONT                  : ${data['SN ONT'] || '-'}
Data Pelanggan          : Sudah Ditambahkan
Daftar Vlan             : Sudah Ditambahkan
MRTG                    : Sudah Ditambahkan

Data Teknis : 
${data['Data Teknis'] || '-'}

Konfigurasi : 
${data['Konfigurasi'] || '-'}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Register_${data['Nama Pelanggan'] ? data['Nama Pelanggan'].replace(/\s+/g, '_') : 'Client'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = async (e: any) => {
    e.preventDefault();
    setSaving(true);

    if (!formData['ID Pelanggan'] || !formData['Nama Pelanggan']) {
      toast.error('Wajib isi ID dan Nama Pelanggan!');
      setSaving(false);
      return;
    }

    // Fetch user dulu sebelum insert — diperlukan untuk kolom Officer
    const { data: { user } } = await supabase.auth.getUser();
    let actorName = 'System';
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      actorName = profile?.full_name || user.email || 'User';
    }

    const dbPayload = {
      'Officer':          actorName,
      'ID Pelanggan':     formData['ID Pelanggan'],
      'Nama Pelanggan':   formData['Nama Pelanggan'],
      'ALAMAT':           formData['ALAMAT'],
      'VMAN / VLAN':      formData['VMAN / VLAN'],
      'Near End':         formData['Near End'],
      'Far End':          formData['Far End'],
      'STATUS':           formData['STATUS'],
      'Kapasitas':        formData['Kapasitas'],
      'RX ONT/SFP':       formData['RX ONT/SFP'],
      'SN ONT/SFP':       formData['SN ONT'],
      'Data Pelanggan':   'Sudah Ditambahkan',
      'Daftar Vlan':      'Sudah Ditambahkan',
      'MRTG':             'Sudah Ditambahkan',
    };

    const { error } = await supabase.from('Data Client Corporate').insert([dbPayload]);

    if (error) {
      toast.error('Gagal menyimpan: ' + error.message);
      setSaving(false);
    } else {
      await logActivity({ activity: 'Input Client Corp', subject: formData['Nama Pelanggan'], actor: actorName });
      downloadTxt(formData);
      toast.success('Client Berhasil Disimpan!', {
        description: 'Laporan TXT sedang diunduh & Notifikasi terkirim.',
        duration: 4000,
      });
      router.push('/clients');
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-3xl" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-500"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <UserPlus size={17} />
            </div>
            Input Client Baru
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 ml-0.5">Pastikan ID Pelanggan unik dan belum terdaftar.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">

        {/* ── GROUP 1: IDENTITAS ── */}
        <FormSection icon={<UserPlus size={14} />} title="Identitas Pelanggan">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="ID Pelanggan" required>
              <input
                name="ID Pelanggan"
                value={formData['ID Pelanggan']}
                onChange={handleChange}
                placeholder="Contoh: 10024"
                className="input font-mono"
              />
            </FormField>
            <FormField label="Nama Pelanggan" required>
              <input
                name="Nama Pelanggan"
                value={formData['Nama Pelanggan']}
                onChange={handleChange}
                placeholder="Nama PT / Perusahaan"
                className="input"
              />
            </FormField>
          </div>
          <FormField label="Alamat Instalasi">
            <textarea
              name="ALAMAT"
              rows={2}
              value={formData['ALAMAT']}
              onChange={handleChange}
              placeholder="Alamat lengkap lokasi instalasi..."
              className="input resize-none"
            />
          </FormField>
        </FormSection>

        {/* ── GROUP 2: JARINGAN ── */}
        <FormSection icon={<Network size={14} />} title="Spesifikasi Jaringan">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField label="VLAN / VMAN">
              <input
                name="VMAN / VLAN"
                value={formData['VMAN / VLAN']}
                onChange={handleChange}
                placeholder="ex: 100"
                className="input font-mono text-blue-600"
              />
            </FormField>
            <FormField label="Kapasitas">
              <input
                name="Kapasitas"
                value={formData['Kapasitas']}
                onChange={handleChange}
                placeholder="100 Mbps"
                className="input"
              />
            </FormField>
            <FormField label="Sinyal RX (dBm)">
              <input
                name="RX ONT/SFP"
                value={formData['RX ONT/SFP']}
                onChange={handleChange}
                placeholder="-20.5"
                className="input font-mono"
              />
            </FormField>
            <FormField label="SN ONT">
              <input
                name="SN ONT"
                value={formData['SN ONT']}
                onChange={handleChange}
                placeholder="ZTEGC8..."
                className="input font-mono"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Near End (POP)">
              <input
                name="Near End"
                value={formData['Near End']}
                onChange={handleChange}
                className="input"
              />
            </FormField>
            <FormField label="Far End (CPE)">
              <input
                name="Far End"
                value={formData['Far End']}
                onChange={handleChange}
                className="input"
              />
            </FormField>
          </div>
          <FormField label="Status Awal">
            <select
              name="STATUS"
              value={formData['STATUS']}
              onChange={handleChange}
              className="input bg-white"
            >
              <option value="Active">Active</option>
              <option value="Suspend">Suspend</option>
              <option value="Isolir">Isolir</option>
              <option value="Dismantle">Dismantle</option>
            </select>
          </FormField>
        </FormSection>

        {/* ── GROUP 3: INFO TAMBAHAN ── */}
        <FormSection icon={<FileText size={14} />} title="Informasi Tambahan (Report TXT)" accent>
          <FormField label="Data Teknis (Detail)">
            <textarea
              name="Data Teknis"
              rows={3}
              placeholder="Isi detail teknis lainnya di sini..."
              value={formData['Data Teknis']}
              onChange={handleChange}
              className="input font-mono text-xs resize-none"
            />
          </FormField>
          <FormField label="Konfigurasi">
            <textarea
              name="Konfigurasi"
              rows={3}
              placeholder="Paste konfigurasi router/switch di sini..."
              value={formData['Konfigurasi']}
              onChange={handleChange}
              className="input font-mono text-xs resize-none"
            />
          </FormField>
        </FormSection>

        {/* ── SUBMIT ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2 shadow-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Menyimpan Data...' : 'Simpan & Download Report'}
        </button>

      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────
function FormSection({ icon, title, children, accent }: { icon: React.ReactNode; title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 space-y-4 ${accent ? 'bg-blue-50/50 border-blue-100' : 'bg-white border-slate-200 shadow-sm'}`}>
      <h3 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 ${accent ? 'text-blue-600' : 'text-slate-400'}`}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE EXPORT
// ─────────────────────────────────────────────
export default function CreateClientPage() {
  return (
    <div className="min-h-screen p-6 md:p-8 flex justify-center items-start" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>
      <Suspense fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={24} />
        </div>
      }>
        <CreateClientContent />
      </Suspense>
    </div>
  );
}