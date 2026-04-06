'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ClipboardList, Plus, Search, Eye } from 'lucide-react';
import Link from 'next/link';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';

// 1. IMPORT TOAST (SONNER)
import { toast } from 'sonner';

export default function WorkOrderPage() {
  const [wos, setWos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [search, setSearch] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    async function init() {
      // 1. Ambil Role User
      const { data: { user } } = await supabase.auth.getUser();
      if(user) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(data?.role as Role);
      }
      
      // 2. Ambil Data WO
      const { data, error } = await supabase.from('Report Bulanan').select('*').order('id', { ascending: false });
      
      if (error) {
        // GANTI ALERT / CONSOLE LOG JADI TOAST ERROR
        toast.error('Gagal memuat data Work Order', {
          description: error.message
        });
      } else if (data) {
        setWos(data);
      }
      
      setLoading(false);
    }
    init();
  }, []);

  // --- LOGIKA PATEN RBAC ---
  // 1. Cek izin create: Hanya SUPER_DEV & AKTIVATOR (Sesuai lib/permissions.ts)
  const canCreate = hasAccess(userRole, PERMISSIONS.WO_CREATE);
  
  // 2. Cek apakah CS (View Only)
  const isCS = userRole === 'CS';

  // Filter Search Sederhana
  const filteredWos = wos.filter(wo => 
    (wo['SUBJECT WO'] || '').toLowerCase().includes(search.toLowerCase()) ||
    (wo['NAMA TEAM'] || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <ClipboardList className="text-blue-600" /> Work Orders
           </h1>
           <p className="text-sm text-slate-500">Daftar pekerjaan teknis lapangan.</p>
        </div>

        {/* PROTEKSI TOMBOL CREATE */}
        {/* Jika NOC/Admin login, tombol ini TIDAK AKAN DI-RENDER */}
        {canCreate && (
          <Link href="/work-orders/create">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition">
              <Plus size={18} /> INPUT WO
            </button>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         {/* Search Bar */}
         <div className="p-4 border-b bg-slate-50/50">
            <div className="relative max-w-md">
               <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
               {/* FIX: INPUT TEXT HITAM PEKAT */}
               <input 
                 type="text" 
                 placeholder="Cari Subject / Team..." 
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 style={{ color: 'black' }}
                 className="w-full pl-10 pr-4 py-2 border border-slate-300 bg-white rounded-lg text-sm font-bold text-black placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
               />
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-50 font-bold text-slate-800 uppercase text-xs border-b border-slate-200">
                  <tr>
                      <th className="px-6 py-4">DATE</th>
                      <th className="px-6 py-4">Subject WO</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4">Team</th>
                      <th className="px-6 py-4 text-center">ACTION</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading data...</td></tr>
                  ) : filteredWos.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Tidak ada data WO.</td></tr>
                  ) : (
                    filteredWos.map(wo => (
                        <tr key={wo.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-6 py-4 font-mono text-slate-500 text-xs">{wo.TANGGAL}</td>
                           <td className="px-6 py-4 font-bold text-slate-800">{wo['SUBJECT WO']}</td>
                           <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                (wo.STATUS || '').includes('SOLVED') ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                                (wo.STATUS || '').includes('PENDING') ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                                {wo.STATUS}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-slate-600 text-xs font-medium">
                             {wo['NAMA TEAM'] ? (
                               <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">{wo['NAMA TEAM']}</span>
                             ) : '-'}
                           </td>
                           <td className="px-6 py-4 text-center">
                              {/* Semua role bisa lihat detail, tapi CS mungkin dibatasi edit di halaman detail nanti */}
                              <Link href={`/work-orders/${wo.id}`} className="text-blue-600 hover:text-blue-800 flex justify-center items-center gap-1 font-bold text-xs">
                                <Eye size={14} /> Detail
                              </Link>
                           </td>
                        </tr>
                    ))
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}