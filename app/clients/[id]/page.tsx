'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Pencil, Trash2, MapPin, Activity, 
  Loader2, AlertTriangle, Signal, Cpu, Wifi
} from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/logger';
import { hasAccess, PERMISSIONS } from '@/lib/permissions';

function ClientDetailContent() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [userRole, setUserRole] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role);
      }
      const { data, error } = await supabase.from('Data Client Corporate').select('*').eq('id', id).single();
      if (error) {
        toast.error('Gagal mengambil data: ' + error.message);
        router.push('/clients');
      } else {
        setClient(data);
      }
      setLoading(false);
    }
    if (id) fetchData();
  }, [id]);

  const executeDelete = async () => {
    if (!hasAccess(userRole, PERMISSIONS.CLIENT_EDIT_DELETE)) {
      toast.error('Akses Ditolak: Anda tidak memiliki izin menghapus.');
      return;
    }
    setDeleting(true);
    setShowDeleteModal(false);
    const toastId = toast.loading('Menghapus data permanen...');
    const { error } = await supabase.from('Data Client Corporate').delete().eq('id', id);
    if (error) {
      toast.error('Gagal menghapus: ' + error.message, { id: toastId });
      setDeleting(false);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      let actorName = 'System';
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        actorName = profile?.full_name || 'User';
      }
      await logActivity({ activity: 'Delete Client Corp', subject: client?.['Nama Pelanggan'] || 'Unknown', actor: actorName });
      toast.success('Client Berhasil Dihapus', { id: toastId, description: 'Data telah dihapus permanen dari database.' });
      router.push('/clients');
      router.refresh();
    }
  };

  // Signal color helper
  const getSignalColor = (value: string) => {
    const val = parseFloat(value);
    if (isNaN(val)) return { text: 'text-slate-400', bg: 'bg-slate-100', label: '—' };
    if (val < -27) return { text: 'text-rose-600', bg: 'bg-rose-50', label: 'Lemah' };
    if (val < -24) return { text: 'text-amber-600', bg: 'bg-amber-50', label: 'Sedang' };
    return { text: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Baik' };
  };

  const getStatusStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (s.includes('suspend') || s.includes('isolir')) return { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 border-rose-200' };
    return { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={24} />
    </div>
  );
  if (!client) return (
    <div className="p-10 text-center text-slate-400 text-sm">Data tidak ditemukan.</div>
  );

  const signal = getSignalColor(client['RX ONT/SFP']);
  const statusStyle = getStatusStyle(client['STATUS']);

  return (
    <div className="p-6 md:p-8 min-h-screen" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>

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
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── TOP NAV ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Kembali
          </button>

          {hasAccess(userRole, PERMISSIONS.CLIENT_EDIT_DELETE) && (
            <div className="flex gap-2">
              <Link href={`/clients/${id}/edit`}>
                <button className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 rounded-lg font-semibold text-xs shadow-sm transition-all">
                  <Pencil size={13} /> Edit Data
                </button>
              </Link>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                className="flex items-center gap-2 px-3.5 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deleting ? 'Memproses...' : 'Hapus'}
              </button>
            </div>
          )}
        </div>

        {/* ── HERO CARD ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2d7dd2, #5a9cf6)' }} />
          <div className="p-6 flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{client['Nama Pelanggan']}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusStyle.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                  {client['STATUS'] || 'Unknown'}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">ID #{client['ID Pelanggan']}</p>
              {client['ALAMAT'] && (
                <p className="text-sm text-slate-500 mt-3 flex items-start gap-1.5">
                  <MapPin size={13} className="shrink-0 mt-0.5 text-slate-400" />
                  {client['ALAMAT']}
                </p>
              )}
            </div>

            {/* Bandwidth highlight */}
            <div className="shrink-0 text-right bg-blue-50 border border-blue-100 rounded-xl px-5 py-3">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Bandwidth</p>
              <p className="text-2xl font-bold text-blue-700">{client['Kapasitas'] || '—'}</p>
            </div>
          </div>
        </div>

        {/* ── INFO GRID ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Network Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Wifi size={13} /> Informasi Jaringan
            </h3>
            <div className="space-y-3">
              <InfoRow label="VLAN / VMAN" value={client['VMAN / VLAN']} mono />
              <InfoRow label="Interkoneksi" value={client['Near End']} />
              <InfoRow label="Last PoP" value={client['Far End']} />
              <InfoRow label="SN ONT/SFP" value={client['SN ONT/SFP']} mono />
              <InfoRow label="Officer" value={client['Officer']} />
            </div>
          </div>

          {/* Signal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Signal size={13} /> Kualitas Redaman
            </h3>
            <div className={`rounded-xl p-4 border ${signal.bg} border-slate-100 flex items-center gap-4`}>
              <div className={`p-3 rounded-xl bg-white shadow-sm ${signal.text}`}>
                <Signal size={24} />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono ${signal.text}`}>{client['RX ONT/SFP'] || '—'} <span className="text-sm font-semibold">dBm</span></p>
                <p className={`text-xs font-semibold mt-0.5 ${signal.text}`}>Kualitas: {signal.label}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold">
              <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg py-1.5">Baik<br/><span className="font-mono">&gt; -15 ~ -22</span></div>
              <div className="bg-amber-50 text-amber-700 border border-amber-100 rounded-lg py-1.5">Sedang<br/><span className="font-mono">-23 ~ -24</span></div>
              <div className="bg-rose-50 text-rose-700 border border-rose-100 rounded-lg py-1.5">Lemah<br/><span className="font-mono">&lt; -25</span></div>
            </div>
          </div>
        </div>

        {/* ── DEVICE INFO ── */}
        {(client['Near End'] || client['Far End']) && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Cpu size={13} /> Perangkat
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Interkoneksi</p>
                <p className="text-sm font-semibold text-slate-800 font-mono">{client['Near End'] || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Last PoP</p>
                <p className="text-sm font-semibold text-slate-800 font-mono">{client['Far End'] || '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── STATUS REGISTRASI ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity size={13} /> Status Registrasi
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg p-4 border border-emerald-100 bg-emerald-50">
              <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Data Pelanggan</p>
              <p className="text-sm font-semibold text-emerald-700">{client['Data Pelanggan'] || '—'}</p>
            </div>
            <div className="rounded-lg p-4 border border-emerald-100 bg-emerald-50">
              <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Daftar Vlan</p>
              <p className="text-sm font-semibold text-emerald-700">{client['Daftar Vlan'] || '—'}</p>
            </div>
            <div className="rounded-lg p-4 border border-emerald-100 bg-emerald-50">
              <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">MRTG</p>
              <p className="text-sm font-semibold text-emerald-700">{client['MRTG'] || '—'}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── HELPER ──
function InfoRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className={`text-xs font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function ClientDetailPage() {
  return (
    <Suspense fallback={
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    }>
      <ClientDetailContent />
    </Suspense>
  );
}