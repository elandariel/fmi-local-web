'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff, Loader2, Globe } from 'lucide-react';
import { toast } from 'sonner'; // 1. IMPORT TOAST

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 2. TOAST LOADING
    const toastId = toast.loading('Memverifikasi akun...');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      // 3. TOAST ERROR (Gantikan div merah)
      toast.error('Login Gagal!', {
        id: toastId, // Ganti loading jadi error
        description: error.message === 'Invalid login credentials' ? 'Email atau Password salah.' : error.message
      });
    } else {
      // 4. TOAST SUCCESS
      toast.success('Login Berhasil', {
        id: toastId,
        description: 'Selamat datang kembali di Dashboard NOC.'
      });
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dekorasi Background Ornamen */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/20 rounded-full blur-[120px]" />

      <div className="w-full max-w-md z-10">
        {/* Logo / Brand Section */}
        <div className="text-center mb-6 mt-4">
        <div className="flex justify-center mb-0">
          <div className="relative group">
            <img 
              src="/FMI.png" 
              alt="Logo Fibermedia Indonesia" 
              className="h-15 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Network Operating Center</h1>
            <p className="text-slate-400 mt-2 text-sm uppercase tracking-widest font-semibold">============================================</p>
          </div>

        {/* Card Login */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* Input Email */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2 ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={20} />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white text-slate-900 rounded-xl border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Input Password */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2 ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-11 pr-12 py-3 bg-white text-slate-900 rounded-xl border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Mencoba Masuk...
                </>
              ) : (
                'SIGN IN'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-8 font-medium">
          &copy; 2026 Fiber Media Indonesia. All rights reserved.
        </p>
      </div>
    </div>
  );
}