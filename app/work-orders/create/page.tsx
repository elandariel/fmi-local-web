'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { 
  Save, ArrowLeft, Loader2, ClipboardList, 
  CheckCircle, TrendingUp, List 
} from 'lucide-react'; // Tambah icon yang dibutuhkan modal

import { toast } from 'sonner';
import { logActivity } from '@/lib/logger';

export default function CreateWOPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [teamList, setTeamList] = useState<any[]>([]); 
  
  // STATE BARU: Untuk kontrol Modal Custom
  const [showSolvedModal, setShowSolvedModal] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const formatTanggalIndo = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const [formData, setFormData] = useState({
    'TANGGAL': new Date().toISOString().split('T')[0], 
    'SUBJECT WO': '',
    'STATUS': 'PROGRESS', 
    'JENIS WO': 'PERMANEN', 
    'KETERANGAN': '',
    'SELESAI ACTION': '', 
    'NAMA TEAM': ''
  });

  useEffect(() => {
    async function fetchTeams() {
      const { data, error } = await supabase
        .from('Index')
        .select('TEAM')
        .not('TEAM', 'is', null);

      if (!error && data) {
        const uniqueTeams = [...new Set(data.map(item => item.TEAM))];
        setTeamList(uniqueTeams);
        if (uniqueTeams.length > 0) {
          setFormData(prev => ({ ...prev, 'NAMA TEAM': uniqueTeams[0] }));
        }
      }
    }
    fetchTeams();
  }, []);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e: any) => {
    e.preventDefault();
    
    if (!formData['SUBJECT WO']) {
      toast.error('Subject WO wajib diisi!');
      return;
    }

    setSaving(true);
    const toastId = toast.loading('Menyimpan Work Order...');

    const payload = {
      ...formData,
      'TANGGAL': formatTanggalIndo(formData['TANGGAL']), 
      'SELESAI ACTION': formData['SELESAI ACTION'] ? formatTanggalIndo(formData['SELESAI ACTION']) : '' 
    };

    const { error } = await supabase
      .from('Report Bulanan')
      .insert([payload]);

    if (error) {
      toast.error('Gagal menyimpan: ' + error.message, { id: toastId });
      setSaving(false);
    } else {
      
      const { data: { user } } = await supabase.auth.getUser();
      let actorName = 'System';
      if(user) {
         const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
         actorName = profile?.full_name || 'User';
      }

      await logActivity({
          activity: 'Input Work Order',
          subject: `${formData['JENIS WO']} - ${formData['SUBJECT WO']}`,
          actor: actorName
      });

      // Hapus toast loading agar tidak numpuk
      toast.dismiss(toastId);

      // --- LOGIC BARU DENGAN MODAL ---
      if (formData['STATUS'] === 'SOLVED') {
        // Jika status SOLVED, jangan redirect dulu. Tampilkan Modal.
        setSaving(false); // Stop loading di tombol
        setShowSolvedModal(true); 
      } else {
        // Jika status PROGRESS/PENDING, langsung redirect biasa
        toast.success('Work Order Disimpan!');
        router.push('/work-orders');
        router.refresh();
      }
    }
  };

  // --- ACTIONS DARI MODAL ---
  const handleGoToTracker = () => {
    const subject = encodeURIComponent(formData['SUBJECT WO']);
    router.push(`/tracker/create?subject=${subject}`);
  };

  const handleBackToList = () => {
    router.push('/work-orders');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex justify-center items-start font-sans relative">
      
      {/* --- CUSTOM MODAL (Pengganti Confirm) --- */}
      {showSolvedModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 scale-100 animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Work Order Solved!</h2>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Data berhasil disimpan. Apakah Anda ingin lanjut memasukkan data ini ke <strong>Tracker Pelanggan</strong>?
              </p>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
              <button 
                onClick={handleGoToTracker}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2"
              >
                <TrendingUp size={18} /> Ya, Input ke Tracker
              </button>
              
              <button 
                onClick={handleBackToList}
                className="w-full py-3 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition flex justify-center items-center gap-2"
              >
                <List size={18} /> Tidak, Kembali ke List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM UTAMA */}
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        
        <div className="flex items-center gap-4 mb-8 border-b pb-6">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="text-blue-600" /> Buat Work Order Baru
            </h1>
            <p className="text-sm text-slate-500">Input WO</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Tanggal</label>
              <input 
                type="date" 
                name="TANGGAL" 
                value={formData['TANGGAL']} 
                onChange={handleChange}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
              <select 
                name="STATUS" 
                value={formData['STATUS']} 
                onChange={handleChange}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 bg-white"
              >
                <option value="PROGRESS">PROGRESS</option>
                <option value="PENDING">PENDING</option>
                <option value="SOLVED">SOLVED</option>
                <option value="CANCEL">CANCEL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Subject WO <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="SUBJECT WO" 
              value={formData['SUBJECT WO']} 
              onChange={handleChange} 
              placeholder="Judul Pekerjaan"
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Jenis WO</label>
              <select 
                name="JENIS WO" 
                value={formData['JENIS WO']} 
                onChange={handleChange}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 bg-white"
              >
                <option value="PERMANEN">PERMANEN</option>
                <option value="SEMENTARA">SEMENTARA</option>
                <option value="BOD">BOD</option>
              </select>
            </div>
             
             <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Nama Team</label>
              <select 
                name="NAMA TEAM" 
                value={formData['NAMA TEAM']} 
                onChange={handleChange}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 bg-white"
              >
                {teamList.length === 0 && <option value="">Loading teams...</option>}
                {teamList.map((team, index) => (
                  <option key={index} value={team}>{team}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Keterangan / Detail</label>
            <textarea 
              name="KETERANGAN" 
              rows={3}
              value={formData['KETERANGAN']} 
              onChange={handleChange}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
              placeholder="Deskripsi pekerjaan..."
            ></textarea>
          </div>

           <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Waktu Selesai (Jika Closed)</label>
              <input 
                type="date"
                name="SELESAI ACTION" 
                value={formData['SELESAI ACTION']} 
                onChange={handleChange} 
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" 
              />
            </div>

          <div className="pt-4 border-t border-slate-100">
            <button 
              type="submit" 
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex justify-center items-center gap-2 shadow-lg disabled:bg-slate-300"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              {saving ? 'Menyimpan...' : 'Simpan Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}