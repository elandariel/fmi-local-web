'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ClipboardList, Plus, Search, Eye, Filter,
  CheckCircle, XCircle, Clock, AlertCircle,
  RefreshCw, ChevronDown, Pencil, ShieldAlert, Check, X
} from 'lucide-react';
import Link from 'next/link';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { logActivity } from '@/lib/logger';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  SOLVED:      { label: 'Solved',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle size={10} /> },
  CLOSED:      { label: 'Closed',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle size={10} /> },
  PENDING:     { label: 'Pending',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  icon: <Clock size={10} /> },
  PROGRESS:    { label: 'Progress',  bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   icon: <RefreshCw size={10} /> },
  'ON PROGRESS': { label: 'On Progress', bg: 'bg-blue-50', text: 'text-blue-700',  border: 'border-blue-200',   icon: <RefreshCw size={10} /> },
  OPEN:        { label: 'Open',      bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', icon: <AlertCircle size={10} /> },
  CANCEL:      { label: 'Cancel',    bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200',  icon: <XCircle size={10} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status?.toUpperCase()] || STATUS_CONFIG['OPEN'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// Roles yang bisa approve edit
const APPROVER_ROLES = ['ADMIN', 'SUPER_DEV', 'NOC'];

export default function WorkOrderPage() {
  const [wos, setWos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userFullName, setUserFullName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const isApprover = APPROVER_ROLES.includes(userRole || '');
  const canCreate = hasAccess(userRole, PERMISSIONS.WO_CREATE);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
      setUserRole(profile?.role as Role);
      setUserFullName(profile?.full_name || '');
    }
    const { data, error } = await supabase.from('Report Bulanan').select('*').order('id', { ascending: false });
    if (error) { toast.error('Gagal memuat data', { description: error.message }); }
    else { setWos(data || []); }
    setLoading(false);
  }, []);

  const fetchEditRequests = useCallback(async () => {
    const { data } = await supabase
      .from('WO_Edit_Requests')
      .select('*')
      .eq('request_type', 'WO')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    setEditRequests(data || []);
  }, []);

  useEffect(() => { fetchData(); fetchEditRequests(); }, []);

  // Realtime untuk edit requests
  useEffect(() => {
    const channel = supabase
      .channel('wo-edit-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'WO_Edit_Requests' }, () => {
        fetchEditRequests();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApprove = async (req: any) => {
    const toastId = toast.loading('Memproses approval...');
    try {
      // Apply perubahan ke tabel asli
      const { error: updateError } = await supabase
        .from('Report Bulanan')
        .update(req.proposed_changes)
        .eq('id', req.target_id);

      if (updateError) throw updateError;

      // Update status request jadi APPROVED
      const { error: approveError } = await supabase.from('WO_Edit_Requests').update({
        status: 'APPROVED',
        reviewed_by: userFullName,
        reviewed_at: new Date().toISOString()
      }).eq('id', req.id);
      if (approveError) throw approveError;

      toast.success('Edit disetujui & diterapkan!', { id: toastId });
      fetchData();
      fetchEditRequests();
      await logActivity({
        activity: 'WO_EDIT_APPROVED',
        subject: req.target_subject,
        actor: userFullName,
        detail: `Disetujui dari request oleh ${req.requested_by}`,
      });
    } catch (err: any) {
      toast.error('Gagal approve: ' + err.message, { id: toastId });
    }
  };

  const handleReject = async (req: any) => {
    const toastId = toast.loading('Menolak request...');
    await supabase.from('WO_Edit_Requests').update({
      status: 'REJECTED',
      reviewed_by: userFullName,
      reviewed_at: new Date().toISOString()
    }).eq('id', req.id);
    toast.success('Request ditolak.', { id: toastId });
    fetchEditRequests();
    await logActivity({
      activity: 'WO_EDIT_REJECTED',
      subject: req.target_subject,
      actor: userFullName,
      detail: `Request dari ${req.requested_by} ditolak`,
    });
  };

  const filteredWos = wos.filter(wo => {
    const matchSearch =
      (wo['SUBJECT WO'] || '').toLowerCase().includes(search.toLowerCase()) ||
      (wo['NAMA TEAM'] || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || (wo.STATUS || '').toUpperCase() === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = wos.reduce((acc, wo) => {
    const s = (wo.STATUS || 'UNKNOWN').toUpperCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeCount  = (statusCounts['PROGRESS'] || 0) + (statusCounts['ON PROGRESS'] || 0) + (statusCounts['OPEN'] || 0);
  const pendingCount = statusCounts['PENDING'] || 0;
  const solvedCount  = (statusCounts['SOLVED'] || 0) + (statusCounts['CLOSED'] || 0);

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><ClipboardList size={17} /></div>
            Monthly Report
          </h1>
          <p className="text-xs text-slate-400 mt-1">Daftar & monitoring Work Order teknis lapangan</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge pending edit requests untuk approver */}
          {isApprover && editRequests.length > 0 && (
            <button
              onClick={() => setShowApprovalPanel(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors"
            >
              <ShieldAlert size={13} />
              {editRequests.length} Request Edit
            </button>
          )}
          <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 shadow-sm transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {canCreate && (
            <Link href="/work-orders/create">
              <button className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">
                <Plus size={13} /> Input WO
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ── STAT STRIP ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total WO', value: wos.length, color: 'text-slate-800', bg: '' },
          { label: 'Aktif', value: activeCount, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' },
          { label: 'Solved', value: solvedCount, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3.5 shadow-sm ${s.bg}`} style={!s.bg ? { background: 'var(--bg-surface)', borderColor: 'var(--border-light)' } : {}}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── FILTER + SEARCH ──────────────────────────── */}
      <div className="rounded-xl border shadow-sm p-4 mb-4 flex flex-col md:flex-row gap-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Cari Subject / Team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-slate-50 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={13} className="text-slate-400" />
          {['ALL', 'PROGRESS', 'PENDING', 'SOLVED', 'OPEN', 'CANCEL'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {s === 'ALL' ? `Semua (${wos.length})` : `${s} (${statusCounts[s] || 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLE ────────────────────────────────────── */}
      <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-light)' }}>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subject WO</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jenis</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + j * 12}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredWos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400 text-sm italic">
                    Tidak ada data ditemukan.
                  </td>
                </tr>
              ) : filteredWos.map(wo => {
                // Cek apakah WO ini punya pending edit request
                const hasPendingEdit = editRequests.some(r => r.target_id === wo.id);
                return (
                  <tr key={wo.id} className={`hover:bg-slate-50 transition-colors ${hasPendingEdit ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{wo.TANGGAL || '—'}</td>
                    <td className="px-5 py-3.5 max-w-[280px]">
                      <p className="font-semibold text-slate-800 text-xs truncate">{wo['SUBJECT WO'] || '—'}</p>
                      {wo.KETERANGAN && (
                        <p className="text-[10px] text-slate-400 italic truncate mt-0.5">{wo.KETERANGAN}</p>
                      )}
                      {hasPendingEdit && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1">
                          <Clock size={8} /> Menunggu Approval Edit
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={wo.STATUS || 'OPEN'} />
                    </td>
                    <td className="px-5 py-3.5">
                      {wo['JENIS WO'] ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-semibold uppercase">
                          {wo['JENIS WO']}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {wo['NAMA TEAM'] ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-semibold">
                          {wo['NAMA TEAM']}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Link href={`/work-orders/${wo.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs transition-colors">
                        <Eye size={12} /> Detail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="px-5 py-3 border-t" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-light)' }}>
            <p className="text-xs text-slate-400">Menampilkan <span className="font-semibold text-slate-600">{filteredWos.length}</span> dari <span className="font-semibold text-slate-600">{wos.length}</span> Work Order</p>
          </div>
        )}
      </div>

      {/* ── APPROVAL PANEL MODAL ────────────────────── */}
      {showApprovalPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-mid)' }}>
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(251,191,36,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><ShieldAlert size={15} /></div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Pending Edit Requests</h3>
                  <p className="text-[11px] text-amber-600">{editRequests.length} request menunggu persetujuan</p>
                </div>
              </div>
              <button onClick={() => setShowApprovalPanel(false)} className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors text-amber-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {editRequests.length === 0 ? (
                <p className="text-center text-slate-400 text-sm italic py-8">Tidak ada request pending.</p>
              ) : editRequests.map(req => (
                <div key={req.id} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-light)' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-slate-800 line-clamp-1">{req.target_subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Diminta oleh <span className="font-semibold text-slate-600">{req.requested_by}</span>
                        {' · '}{req.created_at ? format(new Date(req.created_at), 'dd MMM yyyy HH:mm', { locale: indonesia }) : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">PENDING</span>
                  </div>

                  {/* Alasan */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Alasan Edit</p>
                    <p className="text-xs text-slate-700 italic">"{req.alasan}"</p>
                  </div>

                  {/* Perubahan yang diusulkan */}
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-[10px] font-bold text-blue-600 uppercase mb-2">Perubahan yang Diusulkan</p>
                    <div className="space-y-1.5">
                      {Object.entries(req.proposed_changes || {}).map(([key, newVal]) => {
                        const oldVal = req.original_data?.[key];
                        return (
                          <div key={key} className="grid grid-cols-3 gap-2 text-[10px]">
                            <span className="font-bold text-slate-500 uppercase">{key}</span>
                            <span className="text-rose-500 line-through truncate">{String(oldVal || '—')}</span>
                            <span className="text-emerald-600 font-semibold truncate">{String(newVal || '—')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleApprove(req)}
                      className="flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      <Check size={12} /> Approve & Terapkan
                    </button>
                    <button
                      onClick={() => handleReject(req)}
                      className="flex items-center justify-center gap-1.5 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors"
                    >
                      <X size={12} /> Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}