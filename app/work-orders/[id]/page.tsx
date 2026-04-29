'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Tag, User, Calendar, Info, Pencil,
  CheckCircle, Clock, XCircle, AlertCircle, RefreshCw,
  Send, X, FileEdit
} from 'lucide-react';
import { toast } from 'sonner';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { logActivity } from '@/lib/logger';

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  SOLVED:        { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', icon: <CheckCircle size={14}/> },
  CLOSED:        { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', icon: <CheckCircle size={14}/> },
  PENDING:       { bg: '#fffbeb', text: '#92400e', border: '#fde68a', icon: <Clock size={14}/> },
  PROGRESS:      { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', icon: <RefreshCw size={14}/> },
  'ON PROGRESS': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', icon: <RefreshCw size={14}/> },
  OPEN:          { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', icon: <AlertCircle size={14}/> },
  CANCEL:        { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0', icon: <XCircle size={14}/> },
};

const APPROVER_ROLES = ['ADMIN', 'SUPER_DEV', 'NOC'];

export default function DetailWorkOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userFullName, setUserFullName] = useState('');
  const [existingRequest, setExistingRequest] = useState<any>(null);

  // Request Edit modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAlasan, setRequestAlasan] = useState('');
  const [proposedChanges, setProposedChanges] = useState({
    'SUBJECT WO': '',
    'STATUS': '',
    'NAMA TEAM': '',
    'JENIS WO': '',
    'KETERANGAN': '',
  });
  const [submitting, setSubmitting] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
        setUserRole(profile?.role as Role);
        setUserFullName(profile?.full_name || '');
      }
      const { data: woData, error } = await supabase.from('Report Bulanan').select('*').eq('id', id).single();
      if (error || !woData) { router.push('/work-orders'); return; }
      setWo(woData);

      // Set proposed changes ke nilai saat ini sebagai default
      setProposedChanges({
        'SUBJECT WO': woData['SUBJECT WO'] || '',
        'STATUS': woData.STATUS || '',
        'NAMA TEAM': woData['NAMA TEAM'] || '',
        'JENIS WO': woData['JENIS WO'] || '',
        'KETERANGAN': woData['KETERANGAN'] || '',
      });

      // Cek apakah sudah ada pending request
      const { data: reqData } = await supabase
        .from('WO_Edit_Requests')
        .select('*')
        .eq('target_id', id)
        .eq('status', 'PENDING')
        .maybeSingle();
      setExistingRequest(reqData);

      setLoading(false);
    }
    load();
  }, [id]);

  const isApprover = APPROVER_ROLES.includes(userRole || '');

  const handleSubmitRequest = async () => {
    if (!requestAlasan.trim()) { toast.error('Alasan edit wajib diisi!'); return; }

    // Cari field yang berubah saja
    const changed: Record<string, any> = {};
    Object.entries(proposedChanges).forEach(([key, val]) => {
      if (val !== (wo[key] || '')) changed[key] = val;
    });

    if (Object.keys(changed).length === 0) { toast.error('Tidak ada perubahan yang dibuat.'); return; }

    setSubmitting(true);
    const toastId = toast.loading('Mengirim request edit...');

    const { error } = await supabase.from('WO_Edit_Requests').insert({
      request_type: 'WO',
      target_table: 'Report Bulanan',
      target_id: parseInt(id),
      target_subject: wo['SUBJECT WO'],
      requested_by: userFullName,
      requested_by_role: userRole,
      alasan: requestAlasan,
      proposed_changes: changed,
      original_data: {
        'SUBJECT WO': wo['SUBJECT WO'],
        STATUS: wo.STATUS,
        'NAMA TEAM': wo['NAMA TEAM'],
        'JENIS WO': wo['JENIS WO'],
        KETERANGAN: wo.KETERANGAN,
      },
      status: 'PENDING'
    });

    if (error) {
      toast.error('Gagal mengirim request: ' + error.message, { id: toastId });
    } else {
      toast.success('Request edit terkirim! Menunggu persetujuan Admin/NOC.', { id: toastId });
      setShowRequestModal(false);
      setRequestAlasan('');
      const { data: reqData } = await supabase.from('WO_Edit_Requests').select('*').eq('target_id', id).eq('status', 'PENDING').maybeSingle();
      setExistingRequest(reqData);
      await logActivity({
        activity: 'WO_EDIT_REQUEST',
        subject: wo['SUBJECT WO'] || `WO #${id}`,
        actor: userFullName,
        detail: `Alasan: ${requestAlasan}`,
      });
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!wo) return null;

  const statusStyle = STATUS_STYLE[(wo.STATUS || 'OPEN').toUpperCase()] || STATUS_STYLE['OPEN'];

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto">

        {/* Back */}
        <Link href="/work-orders" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors mb-5 group text-xs font-semibold">
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          Kembali ke Daftar
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Work Order #{wo.id}</p>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">{wo['SUBJECT WO'] || '—'}</h1>
              <div className="flex items-center gap-2 mt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                  style={{ background: statusStyle.bg, color: statusStyle.text, borderColor: statusStyle.border }}>
                  {statusStyle.icon}
                  {wo.STATUS || 'OPEN'}
                </div>
                {wo['JENIS WO'] && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-bold uppercase">
                    {wo['JENIS WO']}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Jika approver → tombol edit langsung */}
              {isApprover ? (
                <Link href={`/work-orders/${id}/edit`}>
                  <button className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors shadow-sm">
                    <Pencil size={13} /> Edit Langsung
                  </button>
                </Link>
              ) : existingRequest ? (
                /* Sudah ada pending request */
                <div className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold">
                  <Clock size={13} /> Menunggu Approval
                </div>
              ) : (
                /* User biasa → request edit */
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                >
                  <FileEdit size={13} /> Request Edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Existing request notice */}
        {existingRequest && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <Clock size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800">Ada Request Edit yang Menunggu Persetujuan</p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                Diminta oleh <span className="font-semibold">{existingRequest.requested_by}</span>
                {' — '}<span className="italic">"{existingRequest.alasan}"</span>
              </p>
            </div>
          </div>
        )}

        {/* Detail Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 space-y-5">

            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoField icon={<Calendar size={13} />} label="Tanggal" value={wo.TANGGAL || '—'} />
              <InfoField icon={<User size={13} />} label="Nama Team" value={wo['NAMA TEAM'] || '—'} />
              <InfoField icon={<Tag size={13} />} label="Jenis WO" value={wo['JENIS WO'] || '—'} />
            </div>

            <div className="border-t border-slate-100 pt-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Info size={12} /> Keterangan / Detail Pekerjaan
              </p>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {wo.KETERANGAN || 'Tidak ada catatan detail untuk pekerjaan ini.'}
                </p>
              </div>
            </div>

            {wo['SELESAI ACTION'] && (
              <div className="border-t border-slate-100 pt-4">
                <InfoField icon={<CheckCircle size={13} />} label="Waktu Selesai" value={wo['SELESAI ACTION']} />
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-slate-900 flex justify-between items-center">
            <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">NOC FMI · Monthly Report</span>
            <span className="text-[9px] text-slate-500 font-bold">#{wo.id}</span>
          </div>
        </div>
      </div>

      {/* ── REQUEST EDIT MODAL ─────────────────────── */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><FileEdit size={14} /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Request Edit WO</h3>
                  <p className="text-[10px] text-slate-400">Perubahan perlu disetujui oleh Admin/NOC</p>
                </div>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Alasan */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  Alasan Edit <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={requestAlasan}
                  onChange={(e) => setRequestAlasan(e.target.value)}
                  placeholder="Jelaskan mengapa data ini perlu diubah..."
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                />
              </div>

              {/* Fields yang bisa diubah */}
              <div>
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Perubahan yang Diusulkan</p>
                <div className="space-y-3">
                  <EditField
                    label="Subject WO"
                    value={proposedChanges['SUBJECT WO']}
                    original={wo['SUBJECT WO']}
                    onChange={(v) => setProposedChanges(p => ({ ...p, 'SUBJECT WO': v }))}
                  />
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Status</label>
                    <select
                      value={proposedChanges['STATUS']}
                      onChange={(e) => setProposedChanges(p => ({ ...p, STATUS: e.target.value }))}
                      className={`w-full p-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        proposedChanges['STATUS'] !== wo.STATUS ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      {['PROGRESS', 'PENDING', 'SOLVED', 'OPEN', 'CANCEL'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <EditField
                    label="Nama Team"
                    value={proposedChanges['NAMA TEAM']}
                    original={wo['NAMA TEAM']}
                    onChange={(v) => setProposedChanges(p => ({ ...p, 'NAMA TEAM': v }))}
                  />
                  <EditField
                    label="Keterangan"
                    value={proposedChanges['KETERANGAN']}
                    original={wo['KETERANGAN']}
                    onChange={(v) => setProposedChanges(p => ({ ...p, KETERANGAN: v }))}
                    multiline
                  />
                </div>
              </div>

              {/* Preview perubahan */}
              {Object.entries(proposedChanges).some(([k, v]) => v !== (wo[k] || '')) && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase mb-2">Field yang akan diubah:</p>
                  {Object.entries(proposedChanges).map(([key, val]) => {
                    if (val === (wo[key] || '')) return null;
                    return (
                      <div key={key} className="text-[10px] text-emerald-700 flex gap-2">
                        <span className="font-bold">{key}:</span>
                        <span className="text-rose-500 line-through">{wo[key] || '—'}</span>
                        <span>→</span>
                        <span className="font-semibold">{val || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={handleSubmitRequest}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-colors"
              >
                <Send size={13} />
                {submitting ? 'Mengirim...' : 'Kirim Request Edit'}
              </button>
              <button
                onClick={() => setShowRequestModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function EditField({ label, value, original, onChange, multiline }: any) {
  const changed = value !== (original || '');
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label className="text-[10px] font-semibold text-slate-500 block mb-1">{label}</label>
      <Tag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        rows={multiline ? 2 : undefined}
        className={`w-full p-2 border rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none ${
          changed ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
        }`}
      />
    </div>
  );
}
