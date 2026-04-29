'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import {
  Search, Download, X, TrendingUp, UserPlus,
  Server, Plus, Calendar, FileEdit, Clock,
  Check, ShieldAlert, Send, ArrowUpRight, ArrowDownRight,
  MinusCircle, Activity, Users, BarChart2, RefreshCw,
  ChevronUp, ChevronDown, Info, ArrowRightLeft, Save, Loader2, Pencil
} from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { toast } from 'sonner';
import MonthlySummary from '@/components/MonthlySummary';
import { logActivity } from '@/lib/logger';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const TABLE_MAP: Record<string, string> = {
  'Berlangganan': 'Berlangganan 2026',
  'Berhenti Berlangganan': 'Berhenti Berlangganan 2026',
  'Berhenti Sementara': 'Berhenti Sementara 2026',
  'Upgrade': 'Upgrade 2026',
  'Downgrade': 'Downgrade 2026',
};

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; border: string; text: string }> = {
  'Berlangganan':          { color: '#10b981', bg: 'var(--success-bg)',  border: 'var(--accent-border)',           text: 'var(--text-primary)' },
  'Berhenti Berlangganan': { color: '#ef4444', bg: 'var(--danger-bg)',   border: 'rgba(248,113,113,0.25)',         text: 'var(--text-primary)' },
  'Berhenti Sementara':    { color: '#f59e0b', bg: 'var(--warning-bg)',  border: 'rgba(251,191,36,0.25)',          text: 'var(--text-primary)' },
  'Upgrade':               { color: '#2d7dd2', bg: 'var(--info-bg)',     border: 'rgba(56,189,248,0.25)',          text: 'var(--text-primary)' },
  'Downgrade':             { color: '#94a3b8', bg: 'var(--bg-elevated)', border: 'var(--border-light)',            text: 'var(--text-secondary)' },
};

const APPROVER_ROLES = ['ADMIN', 'SUPER_DEV', 'NOC'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export default function TrackerPage() {
  const [selectedCategory, setSelectedCategory] = useState('Berlangganan');
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userFullName, setUserFullName] = useState('');
  const summaryRef = useRef<any>(null);
  const [targetMonth, setTargetMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [showModal, setShowModal] = useState(false);
  const [modalChartMode, setModalChartMode] = useState<'ISP' | 'BTS' | 'MONTHLY'>('MONTHLY');

  const [globalStats, setGlobalStats] = useState<any>({
    pasang: 0, putus: 0, cuti: 0, upgrade: 0, downgrade: 0,
    netGrowth: 0, byIsp: [], byBts: [],
    monthlyTrend: [], monthlyPasang: [], monthlyPutus: [],
    topBts: [], retentionRate: 0,
  });

  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);

  // Request edit modal (untuk non-approver)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRowForEdit, setSelectedRowForEdit] = useState<any>(null);
  const [requestAlasan, setRequestAlasan] = useState('');
  const [requestCategory, setRequestCategory] = useState('');
  const [proposedFields, setProposedFields] = useState({
    subject: '',
    ISP: '',
    BTS: '',
    DEVICE: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [indexOptions, setIndexOptions] = useState<{ bts: string[]; isp: string[]; device: string[]; team: string[] }>({
    bts: [], isp: [], device: [], team: []
  });

  // Direct edit modal (untuk SUPER_DEV / ADMIN / NOC)
  const [showDirectEditModal, setShowDirectEditModal] = useState(false);
  const [directEditRow, setDirectEditRow] = useState<any>(null);
  const [directEditFields, setDirectEditFields] = useState({
    subject: '',
    ISP: '',
    BTS: '',
    DEVICE: '',
    TEAM: '',
    TANGGAL: '',
    STATUS: '',
  });
  const [directEditCategory, setDirectEditCategory] = useState('');
  const [savingDirectEdit, setSavingDirectEdit] = useState(false);

  const [chartTrend, setChartTrend] = useState<any>({ series: [], options: {} });
  const [chartTeam, setChartTeam] = useState<any>({ series: [], options: {} });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const canInput = hasAccess(userRole, PERMISSIONS.TRACKER_INPUT);
  const isApprover = APPROVER_ROLES.includes(userRole || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile, error: profileErr } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
      if (!profileErr && profile) { setUserRole(profile.role as Role); setUserFullName(profile.full_name || ''); }
      else if (profileErr) console.warn('[Tracker] Profile fetch error:', profileErr.message);
    }
    const tableName = TABLE_MAP[selectedCategory];
    if (!tableName) { setLoading(false); return; }
    const { data, error } = await supabase.from(tableName).select('*').order('TANGGAL', { ascending: false });
    if (error) toast.error('Gagal memuat data: ' + error.message);
    else { setDataList(data || []); processCharts(data || [], selectedCategory); }
    setLoading(false);
  }, [selectedCategory]);

  const fetchGlobalStats = useCallback(async () => {
    try {
      const [rPasang, rPutus, rCuti, rUpgrade, rDowngrade] = await Promise.all([
        supabase.from('Berlangganan 2026').select('id, ISP, BTS, TANGGAL'),
        supabase.from('Berhenti Berlangganan 2026').select('id, TANGGAL'),
        supabase.from('Berhenti Sementara 2026').select('id, TANGGAL'),
        supabase.from('Upgrade 2026').select('id, TANGGAL'),
        supabase.from('Downgrade 2026').select('id, TANGGAL'),
      ]);

      const pasang = rPasang.data?.length || 0;
      const putus  = rPutus.data?.length  || 0;
      const cuti   = rCuti.data?.length   || 0;
      const upgrade   = rUpgrade.data?.length   || 0;
      const downgrade = rDowngrade.data?.length || 0;

      // ISP & BTS mapping
      const ispMap: Record<string, number> = {};
      const btsMap: Record<string, number> = {};
      rPasang.data?.forEach(row => {
        const isp = row.ISP || 'Unknown'; ispMap[isp] = (ispMap[isp] || 0) + 1;
        const bts = row.BTS || 'Unknown'; btsMap[bts] = (btsMap[bts] || 0) + 1;
      });

      // Monthly trend (12 bulan)
      const groupByMonth = (data: any[]) => {
        const m = new Array(12).fill(0);
        data?.forEach(row => { if (row.TANGGAL) m[new Date(row.TANGGAL).getMonth()]++; });
        return m;
      };
      const mPasang  = groupByMonth(rPasang.data || []);
      const mPutus   = groupByMonth(rPutus.data  || []);
      const mNet     = mPasang.map((v, i) => v - mPutus[i]);

      // Top BTS
      const topBts = Object.entries(btsMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Retention rate = (pasang - putus) / pasang * 100
      const retentionRate = pasang > 0 ? Math.round(((pasang - putus) / pasang) * 100) : 0;

      setGlobalStats({
        pasang, putus, cuti, upgrade, downgrade,
        netGrowth: pasang - putus,
        byIsp: Object.entries(ispMap).sort((a,b) => b[1]-a[1]).slice(0,15).map(([name,data]) => ({ name, data })),
        byBts: Object.entries(btsMap).sort((a,b) => b[1]-a[1]).slice(0,15).map(([name,data]) => ({ name, data })),
        monthlyPasang: mPasang,
        monthlyPutus: mPutus,
        monthlyNet: mNet,
        topBts,
        retentionRate,
      });
    } catch (err) { console.error('Global stats error', err); }
  }, []);

  const fetchEditRequests = useCallback(async () => {
    const { data } = await supabase
      .from('WO_Edit_Requests')
      .select('*')
      .in('request_type', ['TRACKER', 'TRACKER_CATEGORY_CHANGE'])
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    setEditRequests(data || []);
  }, []);

  useEffect(() => { fetchData(); }, [selectedCategory]);
  useEffect(() => { fetchGlobalStats(); fetchEditRequests(); }, []);

  // Realtime edit requests
  useEffect(() => {
    const channel = supabase
      .channel('tracker-edit-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'WO_Edit_Requests' }, () => fetchEditRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const processCharts = (data: any[], category: string) => {
    const cfg = CATEGORY_CONFIG[category];
    const color = cfg?.color || '#2d7dd2';

    const dateMap: Record<string, number> = {};
    data.forEach(row => {
      if (row.TANGGAL) {
        const d = String(row.TANGGAL).substring(0, 7);
        dateMap[d] = (dateMap[d] || 0) + 1;
      }
    });
    const sortedDates = Object.keys(dateMap).sort();

    setChartTrend({
      series: [{ name: 'Jumlah', data: sortedDates.map(d => dateMap[d]) }],
      options: {
        chart: { type: 'area', toolbar: { show: false }, fontFamily: "'Inter', sans-serif", background: 'transparent', animations: { enabled: true, speed: 500 } },
        xaxis: { categories: sortedDates, labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
        yaxis: { labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
        colors: [color],
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.25, opacityTo: 0.02 } },
        grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
        title: { text: `Tren ${category}`, style: { color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' } },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark', y: { formatter: (v: number) => `${v} Data` } },
      }
    });

    const teamMap: Record<string, number> = {};
    data.forEach(row => { const t = row.TEAM || 'Unknown'; teamMap[t] = (teamMap[t] || 0) + 1; });
    const sortedTeams = Object.keys(teamMap).sort((a,b) => teamMap[b]-teamMap[a]).slice(0,5);

    setChartTeam({
      series: [{ name: 'Total', data: sortedTeams.map(t => teamMap[t]) }],
      options: {
        chart: { type: 'bar', toolbar: { show: false }, fontFamily: "'Inter', sans-serif", background: 'transparent' },
        xaxis: { categories: sortedTeams, labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
        yaxis: { labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
        colors: [color],
        grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
        title: { text: 'Top Performance Team', style: { color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' } },
        dataLabels: { enabled: true, style: { colors: ['#fff'], fontSize: '10px', fontWeight: '600' } },
        plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
      }
    });
  };

  const getSubject = (row: any) =>
    row['SUBJECT BERLANGGANAN'] || row['SUBJECT BERHENTI BERLANGGANAN'] ||
    row['SUBJECT BERHENTI SEMENTARA'] || row['SUBJECT UPGRADE'] ||
    row['SUBJECT DOWNGRADE'] || row['SUBJECT'] || row['NAMA PELANGGAN'] || '—';

  const filteredData = dataList.filter(item => {
    const s = search.toLowerCase();
    return getSubject(item).toLowerCase().includes(s) ||
      (item.BTS || '').toLowerCase().includes(s) ||
      (item.TEAM || '').toLowerCase().includes(s);
  });

  const openRequestModal = async (row: any) => {
    setSelectedRowForEdit(row);
    setProposedFields({
      subject: getSubject(row),
      ISP: row.ISP || '',
      BTS: row.BTS || '',
      DEVICE: row.DEVICE || '',
    });
    setRequestAlasan('');
    setRequestCategory(selectedCategory); // default = kategori aktif saat ini
    setShowRequestModal(true);

    // Fetch options dari tabel Index kalau belum ada
    if (indexOptions.bts.length === 0) {
      const { data, error } = await supabase.from('Index').select('BTS, ISP, DEVICE');
      if (!error && data) {
        const getUnique = (key: string) =>
          [...new Set(data.map((item: any) => item[key]).filter(Boolean))] as string[];
        setIndexOptions({
          bts: getUnique('BTS'),
          isp: getUnique('ISP'),
          device: getUnique('DEVICE'),
          team: [],
        });
      }
    }
  };

  const handleSubmitRequest = async () => {
    if (!requestAlasan.trim()) { toast.error('Alasan edit wajib diisi!'); return; }
    const sourceCategory = selectedCategory;
    const tableName = TABLE_MAP[sourceCategory];
    const isCategoryChange = requestCategory !== sourceCategory;

    // Cari kolom subject yang tepat sesuai kategori sumber
    const getSubjectKey = (cat: string) => {
      if (cat === 'Berhenti Sementara') return 'SUBJECT BERHENTI SEMENTARA';
      if (cat === 'Berhenti Berlangganan') return 'SUBJECT BERHENTI BERLANGGANAN';
      if (cat === 'Upgrade') return 'SUBJECT UPGRADE';
      if (cat === 'Downgrade') return 'SUBJECT DOWNGRADE';
      return 'SUBJECT BERLANGGANAN';
    };
    const subjectKey = getSubjectKey(sourceCategory);
    const originalSubject = getSubject(selectedRowForEdit);

    // Kumpulkan field yang benar-benar berubah
    const proposed_changes: Record<string, string> = {};
    const original_data: Record<string, string> = {};

    if (proposedFields.subject !== originalSubject) {
      proposed_changes[subjectKey] = proposedFields.subject;
      original_data[subjectKey] = originalSubject;
    }
    if (proposedFields.ISP !== (selectedRowForEdit.ISP || '')) {
      proposed_changes['ISP'] = proposedFields.ISP;
      original_data['ISP'] = selectedRowForEdit.ISP || '';
    }
    if (proposedFields.BTS !== (selectedRowForEdit.BTS || '')) {
      proposed_changes['BTS'] = proposedFields.BTS;
      original_data['BTS'] = selectedRowForEdit.BTS || '';
    }
    if (proposedFields.DEVICE !== (selectedRowForEdit.DEVICE || '')) {
      proposed_changes['DEVICE'] = proposedFields.DEVICE;
      original_data['DEVICE'] = selectedRowForEdit.DEVICE || '';
    }

    // Kalau ada pindah kategori, simpan meta info di proposed_changes
    if (isCategoryChange) {
      proposed_changes['__target_category'] = requestCategory;
      proposed_changes['__target_table'] = TABLE_MAP[requestCategory];
      original_data['__source_category'] = sourceCategory;
    } else if (Object.keys(proposed_changes).length === 0) {
      toast.error('Tidak ada perubahan yang dibuat.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Mengirim request...');

    const { error } = await supabase.from('WO_Edit_Requests').insert({
      request_type: isCategoryChange ? 'TRACKER_CATEGORY_CHANGE' : 'TRACKER',
      target_table: tableName,
      target_id: selectedRowForEdit.id,
      target_subject: originalSubject,
      requested_by: userFullName,
      requested_by_role: userRole,
      alasan: requestAlasan,
      proposed_changes,
      original_data,
      status: 'PENDING'
    });

    if (error) toast.error('Gagal: ' + error.message, { id: toastId });
    else {
      toast.success(isCategoryChange ? 'Request pindah kategori terkirim!' : 'Request edit terkirim!', { id: toastId });
      setShowRequestModal(false);
      fetchEditRequests();
      await logActivity({
        activity: 'TRACKER_EDIT_REQUEST',
        subject: originalSubject,
        actor: userFullName,
        detail: isCategoryChange
          ? `Request pindah kategori: ${sourceCategory} → ${requestCategory} · Alasan: ${requestAlasan}`
          : `Alasan: ${requestAlasan} · Tabel: ${tableName}`,
      });
    }
    setSubmitting(false);
  };

  const handleApproveTracker = async (req: any) => {
    const toastId = toast.loading('Memproses...');

    if (req.request_type === 'TRACKER_CATEGORY_CHANGE') {
      const targetTable = req.proposed_changes['__target_table'];
      const targetCategory = req.proposed_changes['__target_category'];
      const sourceCategory = req.original_data?.['__source_category'] || '';

      // Ambil data penuh dari tabel sumber
      const { data: rowData, error: fetchErr } = await supabase
        .from(req.target_table)
        .select('*')
        .eq('id', req.target_id)
        .single();

      if (fetchErr || !rowData) {
        toast.error('Gagal mengambil data sumber: ' + (fetchErr?.message || 'tidak ditemukan'), { id: toastId });
        return;
      }

      // Helper: nama kolom SUBJECT per kategori
      const getSubjectKey = (cat: string) => {
        if (cat === 'Berhenti Berlangganan') return 'SUBJECT BERHENTI BERLANGGANAN';
        if (cat === 'Berhenti Sementara')    return 'SUBJECT BERHENTI SEMENTARA';
        if (cat === 'Upgrade')               return 'SUBJECT UPGRADE';
        if (cat === 'Downgrade')             return 'SUBJECT DOWNGRADE';
        return 'SUBJECT BERLANGGANAN';
      };
      const srcSubjectKey = getSubjectKey(sourceCategory);
      const tgtSubjectKey = getSubjectKey(targetCategory);

      // Buat payload untuk tabel tujuan (tanpa id & created_at)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, created_at: _ca, ...rowPayload } = rowData;

      // Rename kolom subject: hapus kolom sumber, tambah kolom tujuan
      if (srcSubjectKey !== tgtSubjectKey) {
        const subjectValue = rowPayload[srcSubjectKey] ?? '';
        delete rowPayload[srcSubjectKey];
        rowPayload[tgtSubjectKey] = subjectValue;
      }

      // Terapkan field changes (kecuali key __ meta)
      for (const [k, v] of Object.entries(req.proposed_changes as Record<string, string>)) {
        if (!k.startsWith('__')) rowPayload[k] = v;
      }

      // INSERT ke tabel tujuan
      const { error: insertErr } = await supabase.from(targetTable).insert([rowPayload]);
      if (insertErr) { toast.error('Gagal insert ke tabel tujuan: ' + insertErr.message, { id: toastId }); return; }

      // DELETE dari tabel sumber
      const { error: deleteErr } = await supabase.from(req.target_table).delete().eq('id', req.target_id);
      if (deleteErr) { toast.error('Gagal hapus dari tabel sumber: ' + deleteErr.message, { id: toastId }); return; }

      await supabase.from('WO_Edit_Requests').update({ status: 'APPROVED', reviewed_by: userFullName, reviewed_at: new Date().toISOString() }).eq('id', req.id);
      toast.success(`Approved! Data dipindahkan → ${targetCategory}`, { id: toastId });
      fetchData(); fetchEditRequests();
      await logActivity({
        activity: 'TRACKER_CATEGORY_CHANGE',
        subject: req.target_subject,
        actor: userFullName,
        detail: `${sourceCategory} → ${targetCategory} · Disetujui dari request ${req.requested_by}`,
      });
    } else {
      const { error } = await supabase.from(req.target_table).update(req.proposed_changes).eq('id', req.target_id);
      if (error) { toast.error('Gagal: ' + error.message, { id: toastId }); return; }
      await supabase.from('WO_Edit_Requests').update({ status: 'APPROVED', reviewed_by: userFullName, reviewed_at: new Date().toISOString() }).eq('id', req.id);
      toast.success('Approved!', { id: toastId });
      fetchData(); fetchEditRequests();
      await logActivity({
        activity: 'TRACKER_EDIT_APPROVED',
        subject: req.target_subject,
        actor: userFullName,
        detail: `Tabel: ${req.target_table} · Disetujui dari request ${req.requested_by}`,
      });
    }
  };

  const handleRejectTracker = async (req: any) => {
    await supabase.from('WO_Edit_Requests').update({ status: 'REJECTED', reviewed_by: userFullName, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    toast.success('Request ditolak.');
    fetchEditRequests();
    await logActivity({
      activity: 'TRACKER_EDIT_REJECTED',
      subject: req.target_subject,
      actor: userFullName,
      detail: `Request dari ${req.requested_by} ditolak`,
    });
  };

  // ── DIRECT EDIT (APPROVER ONLY) ─────────────────────────────
  const openDirectEditModal = async (row: any) => {
    setDirectEditRow(row);
    setDirectEditCategory(selectedCategory); // default = kategori saat ini
    setDirectEditFields({
      subject: getSubject(row),
      ISP: row.ISP || '',
      BTS: row.BTS || '',
      DEVICE: row.DEVICE || '',
      TEAM: row.TEAM || '',
      TANGGAL: row.TANGGAL || '',
      STATUS: row.STATUS || '',
    });
    setShowDirectEditModal(true);

    // Fetch options jika belum ada
    if (indexOptions.bts.length === 0) {
      const { data, error } = await supabase.from('Index').select('BTS, ISP, DEVICE, TEAM');
      if (!error && data) {
        const getUnique = (key: string) =>
          [...new Set(data.map((item: any) => item[key]).filter(Boolean))] as string[];
        setIndexOptions({
          bts: getUnique('BTS'),
          isp: getUnique('ISP'),
          device: getUnique('DEVICE'),
          team: getUnique('TEAM'),
        });
      }
    }
  };

  const handleSaveDirectEdit = async () => {
    if (!directEditRow) return;
    setSavingDirectEdit(true);
    const toastId = toast.loading('Menyimpan perubahan...');

    const originalCategory = selectedCategory;
    const originalTable = TABLE_MAP[originalCategory];
    const targetTable = TABLE_MAP[directEditCategory];

    // Tentukan kolom subject yang tepat untuk tabel tujuan
    const getSubjectKey = (cat: string) => {
      if (cat === 'Berhenti Sementara') return 'SUBJECT BERHENTI SEMENTARA';
      if (cat === 'Berhenti Berlangganan') return 'SUBJECT BERHENTI BERLANGGANAN';
      if (cat === 'Upgrade') return 'SUBJECT UPGRADE';
      if (cat === 'Downgrade') return 'SUBJECT DOWNGRADE';
      return 'SUBJECT BERLANGGANAN';
    };

    const subjectKey = getSubjectKey(directEditCategory);

    // Build payload — id dikecualikan karena auto-generated
    const payload: Record<string, any> = {
      [subjectKey]: directEditFields.subject,
      ISP: directEditFields.ISP,
      BTS: directEditFields.BTS,
      DEVICE: directEditFields.DEVICE,
      TEAM: directEditFields.TEAM,
      TANGGAL: directEditFields.TANGGAL,
      STATUS: directEditFields.STATUS,
    };

    try {
      if (directEditCategory === originalCategory) {
        // ── KASUS 1: Kategori sama — cukup UPDATE di tabel yang sama ──────────
        const { error } = await supabase
          .from(originalTable)
          .update(payload)
          .eq('id', directEditRow.id);
        if (error) throw error;

        toast.success('Data berhasil diupdate!', { id: toastId });
        await logActivity({
          activity: 'TRACKER_EDIT_DIRECT',
          subject: directEditFields.subject,
          actor: userFullName,
          detail: `Tabel: ${originalTable} · Edit langsung oleh ${userRole}`,
        });
      } else {
        // ── KASUS 2: Kategori berbeda — INSERT ke tabel baru + DELETE dari lama ──
        const { error: insertError } = await supabase
          .from(targetTable)
          .insert([payload]);
        if (insertError) throw insertError;

        const { error: deleteError } = await supabase
          .from(originalTable)
          .delete()
          .eq('id', directEditRow.id);
        if (deleteError) throw deleteError;

        toast.success(
          `Data dipindahkan dari "${originalCategory}" → "${directEditCategory}"!`,
          { id: toastId }
        );
        await logActivity({
          activity: 'TRACKER_CATEGORY_CHANGE',
          subject: directEditFields.subject,
          actor: userFullName,
          detail: `${originalTable} → ${targetTable} · Diubah oleh ${userRole}`,
        });
      }

      setShowDirectEditModal(false);
      fetchData();
      fetchGlobalStats();
    } catch (err: any) {
      toast.error('Gagal: ' + err.message, { id: toastId });
    } finally {
      setSavingDirectEdit(false);
    }
  };

  const activeConf = CATEGORY_CONFIG[selectedCategory];
  const currentMonthIdx = new Date().getMonth();
  const thisMonthPasang = globalStats.monthlyPasang?.[currentMonthIdx] || 0;
  const thisMonthPutus  = globalStats.monthlyPutus?.[currentMonthIdx]  || 0;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600"><UserPlus size={17} /></div>
            Weekly Report
          </h1>
          <p className="text-xs text-slate-400 mt-1">Monitoring status perubahan & pertumbuhan pelanggan</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isApprover && editRequests.length > 0 && (
            <button onClick={() => setShowApprovalPanel(true)} className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors">
              <ShieldAlert size={13} /> {editRequests.length} Request Edit
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-50 transition-colors">
            <BarChart2 size={14} className="text-indigo-500" /> Global Stats
          </button>
          {canInput && (
            <Link href="/tracker/create">
              <button className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">
                <Plus size={13} /> Input Baru
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ── QUICK STATS STRIP ───────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Berlangganan', value: globalStats.pasang, icon: <ArrowUpRight size={14}/>, color: '#10b981', bg: 'var(--success-bg)', border: 'var(--accent-border)' },
          { label: 'Putus', value: globalStats.putus, icon: <ArrowDownRight size={14}/>, color: '#ef4444', bg: 'var(--danger-bg)', border: 'rgba(248,113,113,0.25)' },
          { label: 'Berhenti Sementara', value: globalStats.cuti, icon: <MinusCircle size={14}/>, color: '#f59e0b', bg: 'var(--warning-bg)', border: 'rgba(251,191,36,0.25)' },
          { label: 'Upgrade', value: globalStats.upgrade, icon: <TrendingUp size={14}/>, color: '#2d7dd2', bg: 'var(--info-bg)', border: 'rgba(56,189,248,0.25)' },
          { label: 'Net Growth', value: globalStats.netGrowth >= 0 ? `+${globalStats.netGrowth}` : globalStats.netGrowth, icon: <Activity size={14}/>, color: globalStats.netGrowth >= 0 ? '#059669' : '#dc2626', bg: globalStats.netGrowth >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)', border: globalStats.netGrowth >= 0 ? 'var(--accent-border)' : 'rgba(248,113,113,0.25)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border p-3 flex items-center gap-3" style={{ background: s.bg, borderColor: s.border }}>
            <div className="p-1.5 bg-white rounded-lg" style={{ color: s.color }}>{s.icon}</div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── CATEGORY TABS ──────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit">
        {Object.keys(TABLE_MAP).map((cat) => {
          const cfg = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={selectedCategory === cat
                ? { background: cfg.color, color: '#fff' }
                : { color: '#64748b' }
              }
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* ── CHARTS ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div style={{ height: 220 }}>
            {chartTrend.series.length > 0 && (
              <ReactApexChart options={chartTrend.options} series={chartTrend.series} type="area" height="100%" />
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div style={{ height: 220 }}>
            {chartTeam.series.length > 0 && (
              <ReactApexChart options={chartTeam.options} series={chartTeam.series} type="bar" height="100%" />
            )}
          </div>
        </div>
      </div>

      {/* ── MONTHLY SUMMARY ─────────────────────────── */}
      <div className="mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 rounded-md text-blue-600"><Calendar size={13} /></div>
            Monthly Summary Report
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <button onClick={() => summaryRef.current?.handleExport()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors border-r border-slate-100">
                <Download size={12} /> Excel
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
                <Download size={12} /> PDF
              </button>
            </div>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Periode:</span>
              <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className="text-xs font-semibold text-blue-600 outline-none bg-transparent cursor-pointer" />
            </div>
          </div>
        </div>
        <MonthlySummary ref={summaryRef} selectedMonth={targetMonth} />
      </div>

      {/* ── DATA TABLE ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-slate-800 text-sm">List {selectedCategory}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ background: activeConf.bg, color: activeConf.color, borderColor: activeConf.border }}>
              {filteredData.length}
            </span>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input type="text" placeholder="Cari Subject / BTS / Team..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: 'var(--bg-elevated)' }}>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject Pelanggan</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">ISP</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">BTS</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[1,2,3,4,5,6].map(j => (
                    <td key={j} className="px-5 py-3.5"><div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+j*12}px` }} /></td>
                  ))}</tr>
                ))
              ) : filteredData.length > 0 ? (
                filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-5 py-3 text-xs font-medium text-slate-600 font-mono">
                      {row.TANGGAL ? (() => { try { return format(new Date(row.TANGGAL), 'dd/MM/yyyy'); } catch { return row.TANGGAL; } })() : '—'}
                    </td>
                    <td className="px-5 py-3 max-w-[220px]">
                      <p className="font-semibold text-slate-800 text-xs truncate">{getSubject(row)}</p>
                      {(row['PROBLEM'] || row['REASON'] || row['KETERANGAN']) && (
                        <p className="text-[10px] text-slate-400 italic truncate mt-0.5">{row['PROBLEM'] || row['REASON'] || row['KETERANGAN']}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-bold uppercase">{row.ISP || 'INTERNAL'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-semibold uppercase">{row.TEAM || '—'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Server size={11} className="text-slate-400 shrink-0" />
                        <span className="font-mono text-xs">{row.BTS || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isApprover ? (
                        <button
                          onClick={() => openDirectEditModal(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => openRequestModal(row)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 text-xs font-semibold transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <FileEdit size={11} /> Request
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="py-14 text-center text-slate-400 text-sm italic">Data tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── GLOBAL STATS MODAL ──────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><TrendingUp size={15} /></div>
                Summary Growth 2026
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"><X size={16} /></button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">

              {/* ── Baris 1: KPI Utama ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Net Growth" value={globalStats.netGrowth >= 0 ? `+${globalStats.netGrowth}` : globalStats.netGrowth}
                  sub="Pasang - Putus" color={globalStats.netGrowth >= 0 ? '#10b981' : '#ef4444'}
                  bg={globalStats.netGrowth >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'} icon={<Activity size={16}/>} />
                <KpiCard label="Total Berlangganan" value={globalStats.pasang} sub="Pelanggan baru 2026" color="#10b981" bg="var(--success-bg)" icon={<ArrowUpRight size={16}/>} />
                <KpiCard label="Total Putus" value={globalStats.putus} sub="Berhenti berlangganan" color="#ef4444" bg="var(--danger-bg)" icon={<ArrowDownRight size={16}/>} />
                <KpiCard label="Retention Rate" value={`${globalStats.retentionRate}%`} sub="Dari total pasang" color="#a78bfa" bg="var(--bg-elevated)" icon={<Users size={16}/>} />
              </div>

              {/* ── Baris 2: Secondary stats ── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Berhenti Sementara', value: globalStats.cuti, color: '#f59e0b', bg: 'var(--warning-bg)' },
                  { label: 'Upgrade Layanan', value: globalStats.upgrade, color: '#38bdf8', bg: 'var(--info-bg)' },
                  { label: 'Downgrade Layanan', value: globalStats.downgrade, color: '#94a3b8', bg: 'var(--bg-elevated)' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border p-3 text-center" style={{ background: s.bg, borderColor: s.color + '40' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: s.color }}>{s.label}</p>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Baris 3: Bulan ini highlight ── */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-blue-600" />
                  <p className="text-xs font-bold text-blue-800">Bulan Ini — {format(new Date(), 'MMMM yyyy', { locale: indonesia })}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Pasang</p>
                    <p className="text-xl font-bold text-emerald-600">{thisMonthPasang}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Putus</p>
                    <p className="text-xl font-bold text-rose-600">{thisMonthPutus}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Net</p>
                    <p className={`text-xl font-bold ${thisMonthPasang - thisMonthPutus >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {thisMonthPasang - thisMonthPutus >= 0 ? '+' : ''}{thisMonthPasang - thisMonthPutus}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Baris 4: Monthly trend chart ── */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Tren Bulanan 2026</h4>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-emerald-400 inline-block"/> Pasang</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-rose-400 inline-block"/> Putus</span>
                  </div>
                </div>
                <ReactApexChart
                  type="bar"
                  height={180}
                  series={[
                    { name: 'Pasang', data: globalStats.monthlyPasang || [] },
                    { name: 'Putus', data: globalStats.monthlyPutus || [] },
                  ]}
                  options={{
                    chart: { toolbar: { show: false }, fontFamily: "'Inter', sans-serif", background: 'transparent' },
                    colors: ['#10b981', '#ef4444'],
                    xaxis: { categories: MONTH_LABELS, labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
                    yaxis: { labels: { style: { fontSize: '10px', colors: '#94a3b8' } } },
                    grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
                    plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
                    dataLabels: { enabled: false },
                    legend: { show: false },
                    tooltip: { theme: 'dark' },
                  }}
                />
              </div>

              {/* ── Baris 5: Top BTS + Distribusi ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Top 5 BTS */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3">Top 5 BTS (Berlangganan)</h4>
                  <div className="space-y-2">
                    {globalStats.topBts?.map((bts: any, i: number) => {
                      const maxCount = globalStats.topBts[0]?.count || 1;
                      const pct = Math.round((bts.count / maxCount) * 100);
                      return (
                        <div key={bts.name}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                              <span className="text-slate-400 mr-1.5 font-mono text-[10px]">#{i+1}</span>{bts.name}
                            </span>
                            <span className="text-xs font-bold text-slate-800">{bts.count}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Distribusi per ISP / BTS chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Distribusi Pasang</h4>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button onClick={() => setModalChartMode('ISP')} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${modalChartMode === 'ISP' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>ISP</button>
                      <button onClick={() => setModalChartMode('BTS')} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${modalChartMode === 'BTS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>BTS</button>
                    </div>
                  </div>
                  <ReactApexChart
                    type="bar"
                    height={180}
                    series={[{ name: 'Total', data: (modalChartMode === 'ISP' ? globalStats.byIsp : globalStats.byBts).map((i: any) => i.data) }]}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: "'Inter', sans-serif" },
                      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '60%' } },
                      colors: [modalChartMode === 'ISP' ? '#2d7dd2' : '#7c3aed'],
                      xaxis: { categories: (modalChartMode === 'ISP' ? globalStats.byIsp : globalStats.byBts).map((i: any) => i.name), labels: { style: { fontSize: '9px', colors: '#94a3b8' } } },
                      grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
                      dataLabels: { enabled: true, textAnchor: 'start', style: { colors: ['#fff'], fontWeight: '600', fontSize: '10px' }, offsetX: 0 },
                      tooltip: { theme: 'dark', y: { formatter: (v: number) => `${v} Pelanggan` } },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── APPROVAL PANEL ──────────────────────────── */}
      {showApprovalPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><ShieldAlert size={14} /></div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Pending Edit Requests — Tracker</h3>
                  <p className="text-[11px] text-amber-600">{editRequests.length} request menunggu persetujuan</p>
                </div>
              </div>
              <button onClick={() => setShowApprovalPanel(false)} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {editRequests.map(req => (
                <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{req.target_subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {req.requested_by} · {req.target_table}
                        {req.created_at && ' · ' + format(new Date(req.created_at), 'dd MMM HH:mm', { locale: indonesia })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {req.request_type === 'TRACKER_CATEGORY_CHANGE' && (
                        <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full flex items-center gap-1">
                          <ArrowRightLeft size={8} /> Pindah Kategori
                        </span>
                      )}
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">PENDING</span>
                    </div>
                  </div>

                  {/* Khusus kategori change: tampilkan info pindah tabel */}
                  {req.request_type === 'TRACKER_CATEGORY_CHANGE' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                      <ArrowRightLeft size={12} className="text-amber-600 shrink-0" />
                      <div className="text-[10px] text-amber-800 flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold">{req.original_data?.['__source_category'] || '?'}</span>
                        <span className="text-amber-500">(tabel: {req.target_table})</span>
                        <span className="mx-1">→</span>
                        <span className="font-bold">{req.proposed_changes?.['__target_category'] || '?'}</span>
                        <span className="text-amber-500">(tabel: {req.proposed_changes?.['__target_table'] || '?'})</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">Alasan</p>
                    <p className="text-xs italic text-slate-700">"{req.alasan}"</p>
                  </div>

                  {/* Field changes (filter out __ meta keys) */}
                  {Object.entries(req.proposed_changes || {}).filter(([k]) => !k.startsWith('__')).length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 mb-1.5">Perubahan Field</p>
                      {Object.entries(req.proposed_changes || {})
                        .filter(([k]) => !k.startsWith('__'))
                        .map(([k, v]) => (
                          <div key={k} className="text-[10px] flex gap-2">
                            <span className="font-bold text-slate-500">{k}:</span>
                            <span className="text-rose-500 line-through">{String(req.original_data?.[k] || '—')}</span>
                            <span>→</span>
                            <span className="text-emerald-600 font-semibold">{String(v)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleApproveTracker(req)} className="flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors">
                      <Check size={11} /> Approve
                    </button>
                    <button onClick={() => handleRejectTracker(req)} className="flex items-center justify-center gap-1.5 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors">
                      <X size={11} /> Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REQUEST EDIT MODAL ──────────────────────── */}
      {showRequestModal && selectedRowForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><FileEdit size={13} /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Request Edit</h3>
                  <p className="text-[10px] text-slate-400">Perlu disetujui Admin/NOC</p>
                </div>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={14} /></button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

              {/* ── KATEGORI TRANSAKSI ── */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Kategori Transaksi
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.keys(TABLE_MAP).map(cat => {
                    const conf = CATEGORY_CONFIG[cat];
                    const isSelected = requestCategory === cat;
                    const isCurrent = cat === selectedCategory;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setRequestCategory(cat)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all border"
                        style={{
                          background: isSelected ? conf.bg : 'transparent',
                          borderColor: isSelected ? conf.color + '66' : 'var(--border-light)',
                          color: isSelected ? conf.color : 'var(--text-secondary)',
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: conf.color, opacity: isSelected ? 1 : 0.35 }}
                        />
                        <span className="flex-1">{cat}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: conf.bg, color: conf.color }}>
                            Sekarang
                          </span>
                        )}
                        {isSelected && !isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Pindah ke sini
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {requestCategory !== selectedCategory && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <ArrowRightLeft size={12} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                      <span className="font-bold">Request pindah kategori:</span> Data akan dipindahkan dari tabel <span className="font-mono font-bold">{TABLE_MAP[selectedCategory]}</span> ke <span className="font-mono font-bold">{TABLE_MAP[requestCategory]}</span> setelah disetujui Admin/NOC.
                    </p>
                  </div>
                )}
              </div>

              {/* Alasan */}
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  Alasan Edit <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={requestAlasan}
                  onChange={(e) => setRequestAlasan(e.target.value)}
                  placeholder="Jelaskan alasan perubahan..."
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                />
              </div>

              {/* 4 fields yang bisa diedit */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Field yang Diubah</p>

                {/* Subject */}
                <TrackerEditField
                  label="Subject / Nama Pelanggan"
                  original={getSubject(selectedRowForEdit)}
                  value={proposedFields.subject}
                  onChange={(v) => setProposedFields(p => ({ ...p, subject: v }))}
                />

                {/* ISP */}
                <TrackerSelectField
                  label="ISP"
                  original={selectedRowForEdit.ISP || '—'}
                  value={proposedFields.ISP}
                  options={indexOptions.isp}
                  onChange={(v) => setProposedFields(p => ({ ...p, ISP: v }))}
                />

                {/* BTS */}
                <TrackerSelectField
                  label="BTS"
                  original={selectedRowForEdit.BTS || '—'}
                  value={proposedFields.BTS}
                  options={indexOptions.bts}
                  onChange={(v) => setProposedFields(p => ({ ...p, BTS: v }))}
                />

                {/* DEVICE */}
                <TrackerSelectField
                  label="Device"
                  original={selectedRowForEdit.DEVICE || '—'}
                  value={proposedFields.DEVICE}
                  options={indexOptions.device}
                  onChange={(v) => setProposedFields(p => ({ ...p, DEVICE: v }))}
                />
              </div>

              {/* Preview perubahan */}
              {(() => {
                const original = getSubject(selectedRowForEdit);
                const categoryChanged = requestCategory !== selectedCategory;
                const hasFieldChanges =
                  proposedFields.subject !== original ||
                  proposedFields.ISP !== (selectedRowForEdit.ISP || '') ||
                  proposedFields.BTS !== (selectedRowForEdit.BTS || '') ||
                  proposedFields.DEVICE !== (selectedRowForEdit.DEVICE || '');
                if (!hasFieldChanges && !categoryChanged) return null;
                return (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase mb-2">Ringkasan perubahan:</p>
                    {categoryChanged && (
                      <div className="text-[10px] text-amber-700 flex gap-2 mb-1 bg-amber-50 rounded px-2 py-1 border border-amber-100">
                        <span className="font-bold w-16 shrink-0">Kategori:</span>
                        <span className="text-rose-500 line-through">{selectedCategory}</span>
                        <span className="shrink-0">→</span>
                        <span className="font-semibold">{requestCategory}</span>
                      </div>
                    )}
                    {proposedFields.subject !== original && (
                      <div className="text-[10px] text-emerald-700 flex gap-2 mb-1">
                        <span className="font-bold w-16 shrink-0">Subject:</span>
                        <span className="text-rose-500 line-through truncate">{original}</span>
                        <span className="shrink-0">→</span>
                        <span className="font-semibold truncate">{proposedFields.subject}</span>
                      </div>
                    )}
                    {proposedFields.ISP !== (selectedRowForEdit.ISP || '') && (
                      <div className="text-[10px] text-emerald-700 flex gap-2 mb-1">
                        <span className="font-bold w-16 shrink-0">ISP:</span>
                        <span className="text-rose-500 line-through">{selectedRowForEdit.ISP || '—'}</span>
                        <span className="shrink-0">→</span>
                        <span className="font-semibold">{proposedFields.ISP || '—'}</span>
                      </div>
                    )}
                    {proposedFields.BTS !== (selectedRowForEdit.BTS || '') && (
                      <div className="text-[10px] text-emerald-700 flex gap-2 mb-1">
                        <span className="font-bold w-16 shrink-0">BTS:</span>
                        <span className="text-rose-500 line-through">{selectedRowForEdit.BTS || '—'}</span>
                        <span className="shrink-0">→</span>
                        <span className="font-semibold">{proposedFields.BTS || '—'}</span>
                      </div>
                    )}
                    {proposedFields.DEVICE !== (selectedRowForEdit.DEVICE || '') && (
                      <div className="text-[10px] text-emerald-700 flex gap-2">
                        <span className="font-bold w-16 shrink-0">Device:</span>
                        <span className="text-rose-500 line-through">{selectedRowForEdit.DEVICE || '—'}</span>
                        <span className="shrink-0">→</span>
                        <span className="font-semibold">{proposedFields.DEVICE || '—'}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-2">
              <button
                onClick={handleSubmitRequest}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-colors"
                style={{
                  background: requestCategory !== selectedCategory
                    ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                    : '#2563eb',
                }}
              >
                {requestCategory !== selectedCategory
                  ? <><ArrowRightLeft size={12} /> {submitting ? 'Mengirim...' : 'Request Pindah Kategori'}</>
                  : <><Send size={12} /> {submitting ? 'Mengirim...' : 'Kirim Request'}</>
                }
              </button>
              <button onClick={() => setShowRequestModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIRECT EDIT MODAL (APPROVER ONLY) ─────────────── */}
      {showDirectEditModal && directEditRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden modal-enter" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-mid)' }}>

            {/* Header */}
            <div className="px-5 py-4 border-b flex justify-between items-center shrink-0" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-elevated)' }}>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                  <Pencil size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Edit Langsung</h3>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Perubahan langsung diterapkan · <span className="font-semibold" style={{ color: 'var(--accent)' }}>{userRole}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDirectEditModal(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">

              {/* ── PINDAH KATEGORI ── */}
              <div className="rounded-xl p-4 space-y-2.5" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRightLeft size={13} style={{ color: 'var(--warning)' }} />
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
                    Kategori Transaksi
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[9px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Saat ini</p>
                    <div className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: 'var(--bg-elevated)', color: CATEGORY_CONFIG[selectedCategory]?.color, border: `1px solid ${CATEGORY_CONFIG[selectedCategory]?.border}` }}>
                      {selectedCategory}
                    </div>
                  </div>
                  <ArrowRightLeft size={14} style={{ color: 'var(--text-muted)' }} />
                  <div className="flex-1">
                    <p className="text-[9px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Pindahkan ke</p>
                    <select
                      value={directEditCategory}
                      onChange={(e) => setDirectEditCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs font-bold outline-none transition-all"
                      style={{ background: 'var(--bg-surface)', color: CATEGORY_CONFIG[directEditCategory]?.color || 'var(--text-primary)', border: `1px solid ${CATEGORY_CONFIG[directEditCategory]?.border || 'var(--border-mid)'}` }}
                    >
                      {Object.keys(TABLE_MAP).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {directEditCategory !== selectedCategory && (
                  <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251,191,36,0.15)' }}>
                    <Info size={11} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    <p className="text-[10px]" style={{ color: 'var(--warning)' }}>
                      Data akan <strong>dipindahkan</strong> dari tabel <em>{TABLE_MAP[selectedCategory]}</em> ke <em>{TABLE_MAP[directEditCategory]}</em>. Data lama akan dihapus secara otomatis.
                    </p>
                  </div>
                )}
              </div>

              {/* ── FIELD UTAMA ── */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Detail Data</p>

                {/* Subject */}
                <div>
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Subject / Nama Pelanggan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={directEditFields.subject}
                    onChange={(e) => setDirectEditFields(p => ({ ...p, subject: e.target.value }))}
                    placeholder="Nama pelanggan..."
                    className="w-full p-2 rounded-lg text-xs font-medium outline-none transition-all"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                  />
                </div>

                {/* Grid 2 col */}
                <div className="grid grid-cols-2 gap-3">
                  {/* ISP */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>ISP</label>
                    <select
                      value={directEditFields.ISP}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, ISP: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    >
                      <option value="">— ISP —</option>
                      {indexOptions.isp.map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {/* TEAM */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Team</label>
                    <select
                      value={directEditFields.TEAM}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, TEAM: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    >
                      <option value="">— Team —</option>
                      {indexOptions.team.map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {/* BTS */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>BTS</label>
                    <select
                      value={directEditFields.BTS}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, BTS: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    >
                      <option value="">— BTS —</option>
                      {indexOptions.bts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {/* DEVICE */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Device</label>
                    <select
                      value={directEditFields.DEVICE}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, DEVICE: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    >
                      <option value="">— Device —</option>
                      {indexOptions.device.map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {/* TANGGAL */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Tanggal</label>
                    <input
                      type="text"
                      value={directEditFields.TANGGAL}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, TANGGAL: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all font-mono"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    />
                  </div>
                  {/* STATUS */}
                  <div>
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Status</label>
                    <input
                      value={directEditFields.STATUS}
                      onChange={(e) => setDirectEditFields(p => ({ ...p, STATUS: e.target.value }))}
                      className="w-full p-2 rounded-lg text-xs outline-none transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t flex gap-2.5 shrink-0" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-elevated)' }}>
              <button
                onClick={handleSaveDirectEdit}
                disabled={savingDirectEdit || !directEditFields.subject.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50"
                style={{ background: directEditCategory !== selectedCategory ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,var(--accent-mid),var(--accent-deep))' }}
              >
                {savingDirectEdit
                  ? <><Loader2 size={12} className="animate-spin" /> Menyimpan...</>
                  : directEditCategory !== selectedCategory
                    ? <><ArrowRightLeft size={12} /> Pindahkan & Simpan</>
                    : <><Save size={12} /> Simpan Perubahan</>
                }
              </button>
              <button
                onClick={() => setShowDirectEditModal(false)}
                className="px-4 py-2.5 rounded-lg text-xs font-bold transition-colors"
                style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
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

// ── TRACKER EDIT FIELD (text input) ─────────────────────────
function TrackerEditField({ label, original, value, onChange }: {
  label: string; original: string; value: string; onChange: (v: string) => void;
}) {
  const changed = value !== original && !(value === '' && original === '—');
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-[10px] font-semibold text-slate-500">{label}</label>
        <span className="text-[9px] text-slate-400 italic truncate max-w-[160px]">
          Saat ini: <span className="text-slate-600 font-semibold not-italic">{original}</span>
        </span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Isi ${label} baru...`}
        className={`w-full p-2 border rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
          changed ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
        }`}
      />
    </div>
  );
}

// ── TRACKER SELECT FIELD (dropdown dari Index) ───────────────
function TrackerSelectField({ label, original, value, options, onChange }: {
  label: string; original: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const changed = value !== (original === '—' ? '' : original);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-[10px] font-semibold text-slate-500">{label}</label>
        <span className="text-[9px] text-slate-400 italic truncate max-w-[160px]">
          Saat ini: <span className="text-slate-600 font-semibold not-italic">{original}</span>
        </span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-2 border rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer ${
          changed ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <option value="">— Pilih {label} —</option>
        {options.length === 0 ? (
          <option disabled>Memuat data...</option>
        ) : (
          options.map((opt, i) => (
            <option key={i} value={opt}>{opt}</option>
          ))
        )}
      </select>
    </div>
  );
}

// ── KPI CARD ────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, bg, icon }: any) {
  return (
    <div className="rounded-xl border p-4" style={{ background: bg, borderColor: color + '30' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</p>
        <span style={{ color }}>{icon}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-1" style={{ color: color + 'aa' }}>{sub}</p>
    </div>
  );
}