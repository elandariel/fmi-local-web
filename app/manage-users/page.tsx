'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Users, Shield, Trash2, Search, 
  Loader2, XCircle, ShieldCheck, UserPlus,
  CheckCircle2
} from 'lucide-react';
import { Role } from '@/lib/permissions';

export default function ManageUsersPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    email: '', 
    password: '', 
    full_name: '', 
    role: 'CS' as Role 
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // PERBAIKAN: Menggunakan 'updated_at' karena 'created_at' tidak ada di tabel profile kamu
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data) setProfiles(data);
    setLoading(false);
  }

  // --- FUNGSI CREATE USER (API BARU) ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActionLoading('creating');

    try {
      // PERHATIKAN: URL sudah diganti ke endpoint baru
      const response = await fetch('/api/admin/manage-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      const result = await response.json();

      if (response.ok) {
        alert('User berhasil didaftarkan!');
        setShowModal(false);
        setNewUser({ email: '', password: '', full_name: '', role: 'CS' });
        fetchData(); // Refresh data
      } else {
        alert('Gagal: ' + result.error);
      }
    } catch (err) {
      alert('Terjadi kesalahan sistem saat menghubungi server.');
    } finally {
      setIsActionLoading(null);
    }
  };

  // --- FUNGSI DELETE USER (API BARU) ---
  const handleDeleteUser = async (userId: string, email: string) => {
    const confirmDelete = confirm(`Yakin hapus permanen akun ${email}?`);
    if (!confirmDelete) return;

    setIsActionLoading(userId);
    try {
      // PERHATIKAN: Method DELETE dan kirim ID via URL
      const response = await fetch(`/api/admin/manage-team?id=${userId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        alert('User berhasil dihapus!');
        fetchData();
      } else {
        alert('Gagal hapus: ' + result.error);
      }
    } catch (error) {
      alert('Koneksi bermasalah.');
    } finally {
      setIsActionLoading(null);
    }
  };

  // --- FUNGSI UPDATE ROLE (Langsung ke Supabase Client) ---
  const updateRole = async (id: string, newRole: Role) => {
    setIsActionLoading(id);
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', id);

    if (error) alert('Gagal update role: ' + error.message);
    else await fetchData();
    setIsActionLoading(null);
  };

  const filteredProfiles = profiles.filter(p => 
    (p.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg">
                <Users className="text-white" size={24} />
            </div>
            <h1 className="text-3xl font-black text-slate-900">Manajemen Tim</h1>
          </div>
          <p className="text-slate-500 text-sm font-medium">Kelola hak akses team NOC FMI</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Cari personel..."
              className="pl-12 pr-6 py-3 border border-slate-200 rounded-2xl w-full md:w-80 bg-white text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-transform active:scale-95"
          >
            <UserPlus size={20} /> Tambah Anggota
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
           <div className="p-10 flex flex-col items-center justify-center space-y-4">
             <Loader2 className="animate-spin text-blue-600" size={40} />
             <p className="text-slate-500 font-medium">Memuat data tim...</p>
           </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Informasi Personel</th>
                  <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Jabatan</th>
                  <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProfiles.map((user) => (
                  <tr key={user.id} className="hover:bg-blue-50/30 transition-all group">
                    <td className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                          {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{user.full_name || 'No Name'}</p>
                          <p className="text-xs text-slate-400 font-medium">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <select 
                        value={user.role}
                        onChange={(e) => updateRole(user.id, e.target.value as Role)}
                        disabled={isActionLoading === user.id}
                        className={`text-xs font-bold py-1.5 px-3 border rounded-full outline-none cursor-pointer transition-colors ${
                          user.role === 'SUPER_DEV' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                          user.role === 'ADMIN' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                          'bg-blue-50 text-blue-600 border-blue-200'
                        }`}
                      >
                        <option value="SUPER_DEV">SUPER_DEV</option>
                        <option value="NOC">NOC</option>
                        <option value="AKTIVATOR">AKTIVATOR</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="CS">CS</option>
                      </select>
                    </td>
                    <td className="p-5 text-right">
                      <button 
                        onClick={() => handleDeleteUser(user.id, user.email)} 
                        disabled={isActionLoading === user.id}
                        className="p-2.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Hapus User"
                      >
                        {isActionLoading === user.id ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Daftarkan Anggota Baru</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Nama Lengkap</label>
                <input 
                  required type="text" placeholder="Contoh: Budi Santoso"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Email Kerja</label>
                <input 
                  required type="email" placeholder="budi@perusahaan.com"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Password</label>
                <input 
                  required type="password" placeholder="Min. 6 Karakter" minLength={6}
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Role Jabatan</label>
                <select 
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                  onChange={(e) => setNewUser({...newUser, role: e.target.value as Role})}
                  defaultValue="CS"
                >
                  <option value="CS">CS (Customer Service)</option>
                  <option value="NOC">NOC</option>
                  <option value="AKTIVATOR">AKTIVATOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_DEV">SUPER_DEV</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={isActionLoading === 'creating'} 
                className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black mt-4 hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200 disabled:opacity-50"
              >
                {isActionLoading === 'creating' ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                Daftarkan Sekarang
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="mt-8 bg-slate-900 rounded-3xl p-6 relative overflow-hidden">
        <div className="relative z-10 flex items-start gap-4">
          <div className="p-2 bg-amber-400 rounded-lg"><ShieldCheck size={20} className="text-slate-900" /></div>
          <div>
            <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wider italic">Master Control Active</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed max-w-2xl">
              Gunakan fitur ini untuk menambah atau menghapus akses tim. Perubahan role akan langsung aktif tanpa perlu login ulang.
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5"><Shield size={120} className="text-white" /></div>
      </div>
    </div>
  );
}