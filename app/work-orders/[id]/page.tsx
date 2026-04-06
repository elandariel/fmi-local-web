import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tag, User, Calendar, Info, Pencil } from 'lucide-react';

export default async function DetailWorkOrder({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Ambil data dari tabel 'Report Bulanan'
  const { data: wo, error } = await supabase
    .from('Report Bulanan')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !wo) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        {/* Tombol Kembali */}
        <Link 
          href="/work-orders" 
          className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors mb-6 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-bold uppercase tracking-wider">Kembali ke Daftar</span>
        </Link>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-blue-600 font-black text-xs uppercase tracking-[0.2em] mb-1">Work Order Detail</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 uppercase leading-none">
              #{wo.id} - <span className="text-slate-500">Detail Laporan</span>
            </h1>
          </div>

          {/* Action Buttons (Tombol Edit & Status) */}
          <div className="flex items-center gap-3">
            {/* TOMBOL EDIT - Sesuai request kotak merah */}
            <Link 
              href={`/work-orders/${id}/edit`}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm group"
            >
              <Pencil size={14} className="group-hover:rotate-12 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest">Edit WO</span>
            </Link>

            {/* Status Label */}
            <div className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm text-white ${
              wo.STATUS === 'SOLVED' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}>
              Status: {wo.STATUS}
            </div>
          </div>
        </div>
        
        {/* Main Content Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <div className="p-8">
            <div className="grid grid-cols-1 gap-8">
              
              {/* Subject */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <Tag size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Subject Work Order</span>
                </div>
                <p className="text-xl font-bold text-slate-900 border-l-4 border-blue-600 pl-4 py-1">
                  {wo['SUBJECT WO'] || 'Tidak ada subject'}
                </p>
              </div>

              {/* Grid Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <User size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Nama Team</span>
                  </div>
                  <p className="font-bold text-slate-800 uppercase">{wo['NAMA TEAM'] || '-'}</p>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Tanggal Laporan</span>
                  </div>
                  <p className="font-bold text-slate-800">{wo.TANGGAL || '-'}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Info size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Jenis WO</span>
                  </div>
                  <p className="font-bold text-slate-800 uppercase">{wo['JENIS WO'] || '-'}</p>
                </div>
              </div>

              {/* Detail/Keterangan */}
              <div className="pt-6 border-t border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Keterangan / Detail Pekerjaan</span>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap italic">
                    "{wo['KETERANGAN'] || 'Tidak ada catatan detail untuk pekerjaan ini.'}"
                  </p>
                </div>
              </div>

            </div>
          </div>
          
          {/* Footer Card */}
          <div className="px-8 py-4 bg-slate-900 flex justify-between items-center">
             <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">NOC FMI</span>
             <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}