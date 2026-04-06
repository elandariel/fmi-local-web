'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Save, ArrowLeft, Loader2, TrendingUp, 
  CheckCircle, UserPlus, List
} from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/logger';

const TABLE_OPTIONS = [
  { label: 'Pelanggan Baru (Pasang)', value: 'Berlangganan 2026' },
  { label: 'Berhenti Berlangganan', value: 'Berhenti Berlangganan 2026' },
  { label: 'Cuti / Berhenti Sementara', value: 'Berhenti Sementara 2026' },
  { label: 'Upgrade Layanan', value: 'Upgrade 2026' },
  { label: 'Downgrade Layanan', value: 'Downgrade 2026' },
];

// ─────────────────────────────────────────────
// FORM CONTENT
// ─────────────────────────────────────────────
function CreateTrackerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subjectFromWO = searchParams.get('subject') || '';

  const [saving, setSaving] = useState(false);
  const [selectedTable, setSelectedTable] = useState(TABLE_OPTIONS[0].value);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [options, setOptions] = useState({ bts: [], isp: [], device: [], team: [] });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const formatTanggalIndo = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  };

  const [formData, setFormData] = useState({
    'TANGGAL': new Date().toISOString().split('T')[0],
    'SUBJECT BERLANGGANAN': subjectFromWO,
    'PROBLEM': 'Nihil',
    'TEAM': '',
    'STATUS': 'Done',
    'BTS': '',
    'DEVICE': '',
    'ISP': '',
    'REASON': ''
  });

  useEffect(() => {
    async function fetchMasterData() {
      const { data, error } = await supabase.from('Index').select('*');
      if (!error && data) {
        const getUnique = (key: string) => [...new Set(data.map((item: any) => item[key]).filter(Boolean))] as never[];
        setOptions({ bts: getUnique('BTS'), isp: getUnique('ISP'), device: getUnique('DEVICE'), team: getUnique('TEAM') });
      }
    }
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (subjectFromWO) setFormData(prev => ({ ...prev, 'SUBJECT BERLANGGANAN': subjectFromWO }));
  }, [subjectFromWO]);

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async (e: any) => {
    e.preventDefault();
    if (!formData['SUBJECT BERLANGGANAN']) {
      toast.error('Nama Subject / Pelanggan wajib diisi!');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Menyimpan Data Tracker...');

    const payload: any = { ...formData, 'TANGGAL': formatTanggalIndo(formData['TANGGAL']) };

    let targetColumnName = 'SUBJECT BERLANGGANAN';
    if (selectedTable === 'Berhenti Sementara 2026') targetColumnName = 'SUBJECT BERHENTI SEMENTARA';
    else if (selectedTable === 'Berhenti Berlangganan 2026') targetColumnName = 'SUBJECT BERHENTI BERLANGGANAN';
    else if (selectedTable === 'Downgrade 2026') targetColumnName = 'SUBJECT DOWNGRADE';
    else if (selectedTable === 'Upgrade 2026') targetColumnName = 'SUBJECT UPGRADE';

    if (targetColumnName !== 'SUBJECT BERLANGGANAN') {
      payload[targetColumnName] = payload['SUBJECT BERLANGGANAN'];
      delete payload['SUBJECT BERLANGGANAN'];
    }
    if (selectedTable === 'Berlangganan 2026') delete payload['REASON'];

    const { error } = await supabase.from(selectedTable).insert([payload]);
    if (error) {
      toast.error('Gagal menyimpan: ' + error.message, { id: toastId });
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let actorName = 'System';
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      actorName = profile?.full_name || 'User';
    }
    await logActivity({
      activity: 'Input Tracker',
      subject: `[${selectedTable}] ${formData['SUBJECT BERLANGGANAN']}`,
      actor: actorName
    });

    if (selectedTable === 'Berlangganan 2026') {
      toast.success('Tracker Tersimpan!', { id: toastId });
      setSaving(false);
      setShowSuccessModal(true);
    } else if (selectedTable.includes('Berhenti')) {
      const newStatus = selectedTable === 'Berhenti Berlangganan 2026' ? 'Dismantle' : 'Isolir';
      const targetName = formData['SUBJECT BERLANGGANAN'];
      const { error: updateError } = await supabase.from('Data Client Corporate')
        .update({ 'STATUS': newStatus })
        .ilike('Nama Pelanggan', `%${targetName}%`);
      if (updateError) {
        toast.warning('Tracker tersimpan, tapi gagal update status client otomatis.', { id: toastId });
      } else {
        toast.success('Tracker & Status Client Diupdate!', {
          id: toastId,
          description: `Client '${targetName}' kini berstatus ${newStatus}.`
        });
      }
      setTimeout(() => { router.push('/tracker'); router.refresh(); }, 1500);
    } else {
      toast.success('Data Berhasil Disimpan!', { id: toastId });
      setTimeout(() => { router.push('/tracker'); router.refresh(); }, 1000);
    }
  };

  const goToClientInput = () => {
    router.push(`/clients/create?name=${encodeURIComponent(formData['SUBJECT BERLANGGANAN'])}`);
  };

  const isBerhenti = selectedTable !== 'Berlangganan 2026';
  const selectedLabel = TABLE_OPTIONS.find(o => o.value === selectedTable)?.label || '';

  return (
    <div className="w-full max-w-3xl" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ── SUCCESS MODAL ── */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-7 text-center">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={26} className="text-emerald-600" />
              </div>
              <h2 className="text-base font-bold text-slate-800">Pelanggan Baru Dicatat!</h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Tracker berhasil disimpan. Lanjut input data teknis{' '}
                <span className="font-semibold text-slate-700">{formData['SUBJECT BERLANGGANAN']}</span>{' '}
                ke Database Client?
              </p>
            </div>
            <div className="px-5 pb-5 flex flex-col gap-2.5">
              <button
                onClick={goToClientInput}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2"
              >
                <UserPlus size={16} /> Ya, Input Data Client
              </button>
              <button
                onClick={() => { router.push('/tracker'); router.refresh(); }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2"
              >
                <List size={16} /> Tidak, Kembali ke List
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <TrendingUp size={17} />
            </div>
            Input Tracker Pelanggan
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 ml-0.5">Pilih kategori transaksi terlebih dahulu</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">

        {/* ── KATEGORI SELECTOR ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <label className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block mb-2">
            Kategori Transaksi
          </label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="w-full p-2.5 border border-blue-200 rounded-lg outline-none text-blue-900 font-semibold text-sm bg-white focus:ring-2 focus:ring-blue-500 transition-all"
          >
            {TABLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* ── DATA UTAMA ── */}
        <FormSection title="Data Utama">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Tanggal">
              <input
                type="date"
                name="TANGGAL"
                value={formData['TANGGAL']}
                onChange={handleChange}
                className="input"
              />
            </FormField>
            <FormField label="Status">
              <input
                type="text"
                name="STATUS"
                value={formData['STATUS']}
                onChange={handleChange}
                className="input bg-slate-50"
              />
            </FormField>
          </div>
          <FormField label="Subject / Nama Pelanggan" required>
            <input
              type="text"
              name="SUBJECT BERLANGGANAN"
              value={formData['SUBJECT BERLANGGANAN']}
              onChange={handleChange}
              placeholder="Nama Customer / PT..."
              className="input font-semibold"
            />
          </FormField>
        </FormSection>

        {/* ── TEKNIS ── */}
        <FormSection title="Detail Teknis">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="BTS">
              <select name="BTS" value={formData['BTS']} onChange={handleChange} className="input bg-white">
                <option value="">— Pilih BTS —</option>
                {options.bts.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
              </select>
            </FormField>
            <FormField label="ISP">
              <select name="ISP" value={formData['ISP']} onChange={handleChange} className="input bg-white">
                <option value="">— Pilih ISP —</option>
                {options.isp.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
              </select>
            </FormField>
            <FormField label="Device / Perangkat">
              <select name="DEVICE" value={formData['DEVICE']} onChange={handleChange} className="input bg-white">
                <option value="">— Pilih Device —</option>
                {options.device.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
              </select>
            </FormField>
            <FormField label="Team Pelaksana">
              <select name="TEAM" value={formData['TEAM']} onChange={handleChange} className="input bg-white">
                <option value="">— Pilih Team —</option>
                {options.team.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Problem / Catatan">
            <textarea
              name="PROBLEM"
              rows={2}
              value={formData['PROBLEM']}
              onChange={handleChange}
              className="input resize-none"
            />
          </FormField>
        </FormSection>

        {/* ── REASON (conditional) ── */}
        {isBerhenti && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-3">
            <h3 className="text-[11px] font-bold text-rose-600 uppercase tracking-widest">
              Alasan {selectedLabel}
            </h3>
            <textarea
              name="REASON"
              rows={2}
              value={formData['REASON']}
              onChange={handleChange}
              placeholder="Kenapa berhenti / downgrade?"
              className="w-full p-2.5 border border-rose-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-rose-400 transition-all resize-none bg-white"
            />
          </div>
        )}

        {/* ── SUBMIT ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2 shadow-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Menyimpan...' : 'Simpan Tracker'}
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

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE EXPORT
// ─────────────────────────────────────────────
export default function CreateTrackerPage() {
  return (
    <div
      className="min-h-screen p-6 md:p-8 flex justify-center items-start"
      style={{ background: '#f4f6f9', fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <Suspense fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-emerald-600" size={24} />
        </div>
      }>
        <CreateTrackerContent />
      </Suspense>
    </div>
  );
}