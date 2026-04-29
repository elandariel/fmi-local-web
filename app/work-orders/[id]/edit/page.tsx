import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

export default async function EditWorkOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  );

  const { data: wo } = await supabase.from('Report Bulanan').select('*').eq('id', id).single();
  if (!wo) notFound();

  // Server Action untuk simpan perubahan
  async function updateWO(formData: FormData) {
    'use server';
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
    );

    const updatedData = {
      'SUBJECT WO': formData.get('subject'),
      'STATUS': formData.get('status'),
      'NAMA TEAM': formData.get('team'),
      'KETERANGAN': formData.get('detail'),
    };

    const { error } = await supabase.from('Report Bulanan').update(updatedData).eq('id', id);

    if (!error) {
      // Log aktivitas dari server action
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let actorName = 'Admin';
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
          actorName = profile?.full_name || user.email?.split('@')[0] || 'Admin';
        }
        await supabase.from('Log_Aktivitas').insert({
          ACTIVITY: 'WO_EDIT',
          ACTIVITY_LABEL: 'Edit Work Order',
          MODULE: 'Monthly Report',
          SUBJECT: `WO #${id} — ${formData.get('subject') || ''}`,
          DETAIL: `Status: ${formData.get('status')} · Team: ${formData.get('team') || '-'}`,
          actor: actorName,
        });
      } catch { /* logging gagal tidak crash app */ }
      redirect(`/work-orders/${id}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black uppercase mb-6 text-slate-900">Edit WO #{id}</h1>
        
        <form action={updateWO} className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
          {/* SUBJECT WO */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Subject WO</label>
            <input 
              name="subject" 
              defaultValue={wo['SUBJECT WO']} 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* STATUS */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Status</label>
              <select 
                name="status" 
                defaultValue={wo.STATUS} 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold outline-none cursor-pointer"
              >
                <option value="PROGRESS">PROGRESS</option>
                <option value="SOLVED">SOLVED</option>
                <option value="PENDING">PENDING</option>
                <option value="CANCEL">CANCEL</option>
              </select>
            </div>
            
            {/* NAMA TEAM */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Nama Team</label>
              <input 
                name="team" 
                defaultValue={wo['NAMA TEAM']} 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold outline-none" 
              />
            </div>
          </div>

          {/* KETERANGAN */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Keterangan / Detail</label>
            <textarea 
              name="detail" 
              defaultValue={wo['KETERANGAN']} 
              rows={5} 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold outline-none" 
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="submit" 
              className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
            >
              Simpan Perubahan
            </button>
            <Link 
              href={`/work-orders/${id}`} 
              className="px-8 bg-slate-100 text-slate-500 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs flex items-center"
            >
              Batal
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}