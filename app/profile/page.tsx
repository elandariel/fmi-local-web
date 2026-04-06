'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, Lock, Save, Loader2, Shield, UserCheck } from 'lucide-react';
import { Role } from '@/lib/permissions'; // Import tipe Role kita

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [myRole, setMyRole] = useState<Role | ''>(''); // Role user yang sedang login

  // Form State
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | ''>(''); // Role yang dipilih di form
  const [email, setEmail] = useState('');
  
  // Password State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setUser(user);
        setEmail(user.email || '');

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFullName(profile.full_name || '');
          setMyRole(profile.role as Role); // Simpan role asli untuk pengecekan akses
          setSelectedRole(profile.role as Role);
        }
      }
      setLoading(false);
    }
    getProfile();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    const updates = {
      id: user.id,
      full_name: fullName,
      // Jika bukan Super Dev, paksa gunakan role asli (myRole) agar tidak bisa hack via Inspect Element
      role: myRole === 'SUPER_DEV' ? selectedRole : myRole, 
      updated_at: new Date(),
    };

    const { error } = await supabase.from('profiles').upsert(updates);

    if (error) {
      alert('Gagal update profile: ' + error.message);
    } else {
      alert('Profile berhasil diperbarui!');
      window.location.reload(); // Refresh untuk update Sidebar
    }
    setUpdating(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return alert('Password konfirmasi tidak cocok!');
    if (password.length < 6) return alert('Password minimal 6 karakter!');

    setUpdating(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      alert('Gagal ganti password: ' + error.message);
    } else {
      alert('Password berhasil diganti!');
      setPassword('');
      setConfirmPassword('');
    }
    setUpdating(false);
  };

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">Menghubungkan ke server...</div>;

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans">
      
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-gradient-to-tr from-blue-700 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-blue-500/20 rotate-3">
          <span className="-rotate-3">{email.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Pengaturan Akun</h1>
          <p className="text-sm text-slate-500">Kelola identitas dan keamanan akses Anda.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* KIRI: EDIT PROFILE */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
                <User className="text-blue-600" size={20} />
                <h2 className="font-bold text-slate-800">Informasi Pribadi</h2>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-md border ${myRole === 'SUPER_DEV' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                {myRole}
            </span>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Email Terdaftar</label>
              <input type="text" value={email} disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 cursor-not-allowed font-medium text-sm" />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Nama Lengkap</label>
              <input 
                type="text" 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                placeholder="Nama Anda"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Jabatan / Role</label>
              <div className="relative">
                <select 
                  value={selectedRole} 
                  disabled={myRole !== 'SUPER_DEV'} 
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className={`w-full p-3 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all text-sm appearance-none ${myRole !== 'SUPER_DEV' ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-slate-300'}`}
                >
                  <option value="SUPER_DEV">SUPER_DEV</option>
                  <option value="NOC">NOC</option>
                  <option value="AKTIVATOR">AKTIVATOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="CS">CS</option>
                </select>
                <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                    <UserCheck size={16} />
                </div>
              </div>
              {myRole !== 'SUPER_DEV' && (
                <p className="mt-2 text-[10px] text-amber-600 font-medium italic">* Hanya Super Dev yang dapat mengubah Jabatan.</p>
              )}
            </div>

            <div className="pt-4">
              <button type="submit" disabled={updating} className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg disabled:bg-slate-300">
                {updating ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>

        {/* KANAN: GANTI PASSWORD */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <div className="flex items-center gap-2 mb-8 pb-4 border-b border-slate-100">
            <Shield className="text-emerald-600" size={20} />
            <h2 className="font-bold text-slate-800">Keamanan Akun</h2>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-[11px] text-emerald-800 leading-relaxed">
              <strong>Tips Keamanan:</strong> Gunakan minimal 6 karakter dengan kombinasi huruf besar, kecil, dan angka untuk melindungi akses sistem NOC.
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Password Baru</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-slate-300" size={16} />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Ulangi Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-slate-300" size={16} />
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-4">
              <button type="submit" disabled={updating || !password} className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 disabled:bg-slate-200 disabled:shadow-none">
                {updating ? <Loader2 className="animate-spin" size={18}/> : <Shield size={18}/>}
                Ganti Password
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}