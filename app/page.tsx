'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Users, Activity, Plus, List, Database, RefreshCw, Archive,
  ShieldAlert, Check, X, ListTodo, BarChart3, ArrowUpRight,
  ArrowDownRight, MinusCircle, Calendar, ChevronDown, Search,
  Download, ChevronRight, Inbox, Clock, TrendingUp, Wifi, WifiOff,
  Zap, Signal
} from 'lucide-react';
import { format, getISOWeek, formatDistanceToNow } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { Role, PERMISSIONS, hasAccess } from '@/lib/permissions';
import AlertBanner from '@/components/AlertBanner';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { toast } from 'sonner';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const TEAM_CONFIG = {
  teamA: ['Anan', 'Shidiq'],
  teamB: ['Ilham', 'Andi'],
  isWeekA_Morning: getISOWeek(new Date()) % 2 !== 0
};

// ─── REALTIME STATUS INDICATOR ───────────────────────────────
function LivePill({ connected }: { connected: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-500"
      style={connected
        ? { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
        : { background: 'rgba(255,255,255,0.05)', color: '#4a5568', border: '1px solid rgba(255,255,255,0.08)' }
      }
    >
      <span className="relative flex w-1.5 h-1.5">
        {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative rounded-full w-1.5 h-1.5 ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      </span>
      {connected ? 'Live' : 'Connecting'}
    </div>
  );
}

// ─── ANIMATED COUNTER ────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number | string; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setDisplay(value);
    }
  }, [value]);

  return <span key={String(value)} style={{ animation: 'countUp 0.4s ease-out' }}>{prefix}{display}{suffix}</span>;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userFullName, setUserFullName] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const [stats, setStats] = useState({
    totalClient: 0,
    totalVlanUsed: 0,
    totalVlanFree: 0,
    growthMonth: 0,
    logsToday: 0,
    woPending: 0
  });

  const [initialRecentLogs, setInitialRecentLogs] = useState<any[]>([]);
  const [initialClients, setInitialClients] = useState<any[]>([]);
  const [initialWorkOrders, setInitialWorkOrders] = useState<any[]>([]);

  const [chartTab, setChartTab] = useState<'CLIENT' | 'CAPACITY'>('CLIENT');
  const [chartData, setChartData] = useState<any>({ client: [], capacity: [] });
  const [chartSummary, setChartSummary] = useState({ pasang: 0, putus: 0, BerhentiSementara: 0, upgrade: 0, downgrade: 0 });

  const [myInboxTickets, setMyInboxTickets] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [showInbox, setShowInbox] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [searchTicket, setSearchTicket] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // ── REALTIME SUBSCRIPTIONS ─────────────────────────────────
  const realtimeLogs = useRealtimeTable('Log_Aktivitas', initialRecentLogs, ['INSERT']);
  const realtimeClients = useRealtimeTable('Data Client Corporate', initialClients, ['INSERT', 'DELETE']);
  const realtimeWorkOrders = useRealtimeTable('Report Bulanan', initialWorkOrders, ['INSERT', 'UPDATE', 'DELETE']);

  const recentLogs = realtimeLogs.slice(0, 8);

  // ── DERIVED REALTIME STATS ─────────────────────────────────
  const realtimeStats = {
    ...stats,
    totalClient: realtimeClients.length > 0 ? realtimeClients.length : stats.totalClient,
    woPending: realtimeWorkOrders.filter((wo: any) =>
      ['PENDING', 'OPEN', 'PROGRESS', 'ON PROGRESS'].includes(wo.STATUS)
    ).length || stats.woPending,
    logsToday: realtimeLogs.filter((log: any) => {
      const today = new Date().toISOString().split('T')[0];
      return log.created_at?.startsWith(today);
    }).length || stats.logsToday,
  };

  // ── UPDATE TIMESTAMP saat data realtime berubah ────────────
  useEffect(() => {
    setLastUpdated(new Date());
  }, [realtimeLogs.length, realtimeClients.length, realtimeWorkOrders.length]);

  const morningSquad = TEAM_CONFIG.isWeekA_Morning ? TEAM_CONFIG.teamA : TEAM_CONFIG.teamB;
  const afternoonSquad = TEAM_CONFIG.isWeekA_Morning ? TEAM_CONFIG.teamB : TEAM_CONFIG.teamA;

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat Pagi';
    if (h < 15) return 'Selamat Siang';
    if (h < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const handleApprovalAction = async (id: number, action: 'APPROVE' | 'REJECT') => {
    if (!hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION)) return;
    try {
      if (action === 'APPROVE') {
        await supabase.from('Ignored_Items').update({ STATUS: 'APPROVED' }).eq('id', id);
      } else {
        await supabase.from('Ignored_Items').delete().eq('id', id);
      }
      setPendingApprovals(prev => prev.filter(item => item.id !== id));
      toast.success(action === 'APPROVE' ? 'Request disetujui!' : 'Request ditolak.');
    } catch (err) {
      console.error('Approval Error:', err);
      toast.error('Gagal memproses approval');
    }
  };

  async function handleSyncSheet() {
    if (!hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION)) {
      toast.error('Izin ditolak', { description: 'Hanya Admin/NOC yang bisa sinkronisasi.' });
      return;
    }
    setIsSyncing(true);
    const toastId = toast.loading('Menyinkronkan data ke Google Sheets...');
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_Kamhv6OJiN7bAtzzA2Z-tzkWvekJakQNRsPVGU1Xwmn_jePm2ZyiSf_RdU_5zUpr/exec';
    const syncTargets = [
      { name: 'Report Bulanan', sheetName: '2026', id: '1Yqr6tlJGo2yHE-9FJ_mCMpnehV-0Lpo2oiGUPWqAXOE' },
      { name: 'Berlangganan 2026', sheetName: 'Berlangganan 2026', id: '19PWdBv4RQgHqxa2Bf7-OQuOeSdTumLb01bR0fhQhkb0' },
      { name: 'Berhenti Berlangganan 2026', sheetName: 'Berhenti Berlangganan 2026', id: '19PWdBv4RQgHqxa2Bf7-OQuOeSdTumLb01bR0fhQhkb0' },
      { name: 'Berhenti Sementara 2026', sheetName: 'Berhenti Sementara 2026', id: '19PWdBv4RQgHqxa2Bf7-OQuOeSdTumLb01bR0fhQhkb0' },
      { name: 'Upgrade 2026', sheetName: 'Upgrade 2026', id: '19PWdBv4RQgHqxa2Bf7-OQuOeSdTumLb01bR0fhQhkb0' },
      { name: 'Downgrade 2026', sheetName: 'Downgrade 2026', id: '19PWdBv4RQgHqxa2Bf7-OQuOeSdTumLb01bR0fhQhkb0' },
    ];
    try {
      for (const target of syncTargets) {
        await fetch('/api/sync-spreadsheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableTarget: target.name, sheetName: target.sheetName,
            spreadsheetId: target.id, googleScriptUrl: GOOGLE_SCRIPT_URL
          })
        });
      }
      toast.success('Sync berhasil!', { id: toastId, description: 'Data Supabase berhasil disinkronkan ke Google Sheets.' });
    } catch {
      toast.error('Sinkronisasi gagal', { id: toastId, description: 'Terjadi kesalahan saat menghubungi Google Sheets.' });
    } finally {
      setIsSyncing(false);
    }
  }

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let currentUserName = '';
      let currentUserRole: Role | null = null;

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
        if (profile) {
          setUserRole(profile.role as Role);
          setUserFullName(profile.full_name);
          currentUserName = profile.full_name;
          currentUserRole = profile.role as Role;
        }
      }

      if (hasAccess(currentUserRole, PERMISSIONS.OVERVIEW_ACTION)) {
        const { data: approvals } = await supabase.from('Ignored_Items').select('*').eq('STATUS', 'PENDING').order('created_at', { ascending: false });
        if (approvals) setPendingApprovals(approvals);
      }

      if (currentUserName) {
        let query = supabase.from('inbox_tugas').select('*');
        if (currentUserRole !== 'SUPER_DEV') {
          query = query.eq('assigned_to', currentUserName).eq('status', 'OPEN');
        }
        const { data: inboxData } = await query.order('created_at', { ascending: false });
        if (inboxData) {
          const enrichedTickets = await Promise.all(inboxData.map(async (ticket) => {
            const { data: woDetails } = await supabase.from('Report Bulanan').select('id, "SUBJECT WO", STATUS, KETERANGAN').in('id', ticket.wo_ids);
            const allSolved = woDetails?.every(wo => wo.STATUS === 'SOLVED' || wo.STATUS === 'CLOSED');
            if (allSolved && woDetails.length > 0 && ticket.status !== 'SOLVED') {
              await supabase.from('inbox_tugas').update({ status: 'SOLVED' }).eq('id', ticket.id);
            }
            return { ...ticket, details: woDetails || [] };
          }));
          setMyInboxTickets(enrichedTickets);
        }
      }

      const { count: clientCount } = await supabase.from('Data Client Corporate').select('*', { count: 'exact', head: true });
      const { count: pendingCount } = await supabase.from('Report Bulanan').select('id', { count: 'exact', head: true }).in('STATUS', ['PENDING', 'OPEN', 'PROGRESS', 'ON PROGRESS']);

      // ── Fetch semua data client & WO untuk realtime tracking ──
      const { data: allClients } = await supabase.from('Data Client Corporate').select('id');
      const { data: allWOs } = await supabase.from('Report Bulanan').select('id, STATUS');
      if (allClients) setInitialClients(allClients);
      if (allWOs) setInitialWorkOrders(allWOs);

      const tables = ['Berlangganan 2026', 'Berhenti Berlangganan 2026', 'Berhenti Sementara 2026', 'Upgrade 2026', 'Downgrade 2026'];
      const responses = await Promise.all(tables.map(t => supabase.from(t).select('TANGGAL')));

      const groupByMonth = (data: any[]) => {
        const months = new Array(12).fill(0);
        data?.forEach(row => { if (row.TANGGAL) months[new Date(row.TANGGAL).getMonth()]++; });
        return months;
      };
      const d = responses.map(r => groupByMonth(r.data || []));

      setChartData({
        client: [{ name: 'Berlangganan', data: d[0] }, { name: 'Berhenti', data: d[1] }, { name: 'Berhenti Sementara', data: d[2] }],
        capacity: [{ name: 'Upgrade', data: d[3] }, { name: 'Downgrade', data: d[4] }]
      });
      setChartSummary({
        pasang: d[0].reduce((a, b) => a + b, 0), putus: d[1].reduce((a, b) => a + b, 0),
        BerhentiSementara: d[2].reduce((a, b) => a + b, 0),
        upgrade: d[3].reduce((a, b) => a + b, 0), downgrade: d[4].reduce((a, b) => a + b, 0),
      });

      const vlanTables = ['Daftar Vlan 1-1000', 'Daftar Vlan 1000+', 'Daftar Vlan 2000+', 'Daftar Vlan 3000+', 'Daftar Vlan 3500+', 'Daftar Vlan 4003+'];
      let totalUsed = 0, totalAllVlan = 0;
      const vlanResponses = await Promise.all(vlanTables.map(t => supabase.from(t).select('NAME')));
      vlanResponses.forEach(res => {
        if (res.data) {
          totalAllVlan += res.data.length;
          totalUsed += res.data.filter(r => {
            const name = (r.NAME || '').toUpperCase();
            return name && name !== '-' && name !== 'AVAILABLE' && name !== '';
          }).length;
        }
      });

      const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
      const { data: logs } = await supabase.from('Log_Aktivitas').select('*').order('created_at', { ascending: false }).limit(8);
      const { count: countToday } = await supabase.from('Log_Aktivitas').select('id', { count: 'exact', head: true }).gte('created_at', todayStart);

      setStats({
        totalClient: clientCount || 0,
        totalVlanUsed: totalUsed,
        totalVlanFree: totalAllVlan - totalUsed,
        growthMonth: d[0][new Date().getMonth()],
        logsToday: countToday || 0,
        woPending: pendingCount || 0
      });
      setInitialRecentLogs(logs || []);
    } catch (err) {
      console.error('Dashboard Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboardData(); }, []);

  useEffect(() => {
    const t = setTimeout(() => setIsLive(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleDownloadInbox = () => {
    if (myInboxTickets.length === 0) return toast.info('Tidak ada tugas untuk diunduh.');
    let content = `TO DO LIST GRUP - ${userFullName}\nGenerated: ${format(new Date(), 'dd MMM yyyy HH:mm')}\n==========================\n\n`;
    myInboxTickets.forEach((ticket) => {
      content += `${ticket.id_tiket_custom || 'BATCH'} (PIC: ${ticket.assigned_to})\n`;
      ticket.details.forEach((wo: any) => { content += `- [${wo.STATUS}] ${wo['SUBJECT WO']}\n`; });
      content += `\n--------------------------\n`;
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    link.download = `Monitoring_Inbox_${userFullName}.txt`;
    link.click();
  };

  if (loading) return <DashboardSkeleton />;

  // VLAN usage percentage
  const vlanUsagePercent = realtimeStats.totalVlanFree + realtimeStats.totalVlanUsed > 0
    ? Math.round((realtimeStats.totalVlanUsed / (realtimeStats.totalVlanFree + realtimeStats.totalVlanUsed)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-grid" style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes countUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .new-log-entry { animation: fadeSlideIn 0.35s ease-out; }
      `}</style>

      <div className="p-5 md:p-7 max-w-[1600px] mx-auto">

        {/* ── TOP BAR ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-7 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
              >
                <Clock size={10} />
                {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: indonesia })}
              </div>
              <LivePill connected={isLive} />
            </div>
            <h1
              className="text-[26px] font-black tracking-tight leading-tight"
              style={{
                background: 'linear-gradient(135deg, var(--text-primary) 40%, #10b981 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {userFullName ? `${getGreeting()}, ${userFullName.split(' ')[0]}` : 'NOC Dashboard'}
            </h1>
            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Signal size={10} />
              Update terakhir: {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: indonesia })}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) && (
              <button
                onClick={handleSyncSheet}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold text-xs transition-all disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
              >
                {isSyncing ? <RefreshCw size={13} className="animate-spin" style={{ color: '#10b981' }} /> : <Database size={13} style={{ color: '#10b981' }} />}
                {isSyncing ? 'Syncing...' : 'Sync Sheet'}
              </button>
            )}
            {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) && (
              <button disabled className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold text-xs opacity-40 cursor-not-allowed"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--text-muted)' }}>
                <Archive size={13} /> Archive
              </button>
            )}
            {hasAccess(userRole, PERMISSIONS.CLIENT_ADD) && (
              <Link href="/work-orders/create">
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-white transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
                  }}
                >
                  <Plus size={13} /> Buat WO Baru
                </button>
              </Link>
            )}
            <button
              onClick={fetchDashboardData}
              className="p-2 rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--text-muted)' }}
              title="Refresh data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── APPROVAL BANNER ────────────────────────────────── */}
        {hasAccess(userRole, PERMISSIONS.OVERVIEW_ACTION) && pendingApprovals.length > 0 && (
          <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', backdropFilter: 'blur(16px)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.05)' }}>
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}><ShieldAlert size={15} /></div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: '#fca5a5' }}>Pending Discard Approvals</h3>
                  <p className="text-[11px]" style={{ color: 'rgba(248,113,113,0.7)' }}>Verifikasi pengabaian sinkronisasi data</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                {pendingApprovals.length} requests
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingApprovals.map((item) => (
                <div key={item.id} className="rounded-xl p-3.5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>{item.REQUESTED_BY || 'NOC'}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{item.created_at ? format(new Date(item.created_at), 'dd/MM HH:mm') : ''}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase leading-tight mb-1 line-clamp-2" style={{ color: 'var(--text-primary)' }}>{item.SUBJECT_IGNORED}</h4>
                    <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>"{item.ALASAN}"</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button onClick={() => handleApprovalAction(item.id, 'APPROVE')} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all text-white" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => handleApprovalAction(item.id, 'REJECT')} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
                      <X size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <AlertBanner />

        {/* ── STAT CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard
            title="Total Client"
            value={<AnimatedNumber value={realtimeStats.totalClient} />}
            sub="Database aktif"
            icon={<Users size={18} />}
            accentColor="#38bdf8"
            trend={realtimeClients.length > stats.totalClient ? `+${realtimeClients.length - stats.totalClient} baru` : null}
          />
          <StatCard
            title="WO Aktif"
            value={<AnimatedNumber value={realtimeStats.woPending} />}
            sub="Pending & Progress"
            icon={<Activity size={18} />}
            accentColor="#a78bfa"
            trend={null}
          />
          <StatCard
            title="Bulan Ini"
            value={<AnimatedNumber value={realtimeStats.growthMonth} prefix="+" />}
            sub="Pelanggan baru"
            icon={<TrendingUp size={18} />}
            accentColor="#10b981"
            trend={null}
          />
          <StatCard
            title="VLAN Tersedia"
            value={<AnimatedNumber value={realtimeStats.totalVlanFree} />}
            sub={`${vlanUsagePercent}% slot terpakai`}
            icon={<Database size={18} />}
            accentColor="#fbbf24"
            trend={null}
            progress={vlanUsagePercent}
          />
        </div>

        {/* ── ROW 2: MINI STATS ───────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <MiniStatCard
            label="Log Hari Ini"
            value={<AnimatedNumber value={realtimeStats.logsToday} />}
            icon={<Zap size={14} />}
            color="#fbbf24"
          />
          <MiniStatCard
            label="Berlangganan 2026"
            value={<AnimatedNumber value={chartSummary.pasang} />}
            icon={<ArrowUpRight size={14} />}
            color="#10b981"
          />
          <MiniStatCard
            label="Putus 2026"
            value={<AnimatedNumber value={chartSummary.putus} />}
            icon={<ArrowDownRight size={14} />}
            color="#f87171"
          />
        </div>

        {/* ── MAIN GRID ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── CHART ──────────────────────────────────────────── */}
          <div className="glass lg:col-span-2 flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div>
                  <h3 className="font-bold flex items-center gap-2 text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    {chartTab === 'CLIENT'
                      ? <><Users size={15} style={{ color: '#10b981' }} /> Pertumbuhan Pelanggan</>
                      : <><BarChart3 size={15} style={{ color: '#38bdf8' }} /> Pertumbuhan Kapasitas</>
                    }
                  </h3>
                  <p className="text-[10px] mt-0.5 uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Statistik 2026</p>
                </div>
                <div className="flex p-0.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    onClick={() => setChartTab('CLIENT')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={chartTab === 'CLIENT'
                      ? { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
                      : { color: 'var(--text-muted)' }
                    }
                  >Pelanggan</button>
                  <button
                    onClick={() => setChartTab('CAPACITY')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={chartTab === 'CAPACITY'
                      ? { background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }
                      : { color: 'var(--text-muted)' }
                    }
                  >Kapasitas</button>
                </div>
              </div>
              <ReactApexChart
                options={{
                  chart: { toolbar: { show: false }, fontFamily: "'Inter', sans-serif", background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 700 } },
                  colors: chartTab === 'CLIENT' ? ['#10b981', '#f87171', '#fbbf24'] : ['#38bdf8', '#6b7280'],
                  xaxis: {
                    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
                    labels: { style: { fontSize: '11px', fontWeight: 500, colors: '#4a5568' } },
                    axisBorder: { color: 'rgba(255,255,255,0.06)' },
                    axisTicks: { color: 'rgba(255,255,255,0.06)' },
                  },
                  yaxis: { labels: { style: { fontSize: '11px', colors: '#4a5568' } } },
                  grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                  plotOptions: { bar: { borderRadius: 6, columnWidth: '50%', borderRadiusApplication: 'end' } },
                  legend: { fontSize: '12px', fontWeight: 600, offsetY: 4, labels: { colors: '#8892a4' } },
                  dataLabels: { enabled: false },
                  tooltip: {
                    style: { fontFamily: "'Inter', sans-serif" },
                    theme: 'dark',
                  },
                  fill: {
                    type: 'gradient',
                    gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 1, opacityTo: 0.75 }
                  },
                }}
                series={chartTab === 'CLIENT' ? chartData.client : chartData.capacity}
                type="bar"
                height={240}
              />
            </div>

            {/* Chart Footer Summary */}
            <div className="mt-auto px-5 py-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Pasang', val: chartSummary.pasang, color: '#10b981' },
                  { label: 'Putus', val: chartSummary.putus, color: '#f87171' },
                  { label: 'Berhenti Smtr', val: chartSummary.BerhentiSementara, color: '#fbbf24' },
                  { label: 'Upgrade', val: chartSummary.upgrade, color: '#38bdf8' },
                  { label: 'Downgrade', val: chartSummary.downgrade, color: '#6b7280' },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-[9px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                    <p className="text-base font-black" style={{ color: item.color, textShadow: `0 0 12px ${item.color}60` }}>{item.val}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Jadwal Tim */}
            <div className="glass p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}><Calendar size={13} /></div>
                Jadwal Tim
              </h3>
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#fbbf24' }}>Pagi · 08.00–16.00</p>
                  <div className="flex gap-2">
                    {morningSquad.map((name, i) => (
                      <span key={i} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid rgba(251,191,36,0.2)' }}>{name}</span>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.18)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#38bdf8' }}>Siang · 14.00–22.00</p>
                  <div className="flex gap-2">
                    {afternoonSquad.map((name, i) => (
                      <span key={i} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid rgba(56,189,248,0.2)' }}>{name}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Aktivitas Terkini — Realtime */}
            <div className="glass flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>Aktivitas Terkini</h3>
                <div className="flex items-center gap-2">
                  <LivePill connected={isLive} />
                  <Link href="/logs" className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#10b981'; (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <List size={14} />
                  </Link>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: '280px' }}>
                {recentLogs.length === 0 ? (
                  <p className="p-5 text-center text-xs italic" style={{ color: 'var(--text-muted)' }}>Belum ada aktivitas</p>
                ) : recentLogs.map((log, idx) => (
                  <div
                    key={log.id}
                    className={`px-4 py-2.5 flex gap-3 transition-colors ${idx === 0 ? 'new-log-entry' : ''}`}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 uppercase mt-0.5"
                      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}
                    >
                      {log.actor?.substring(0, 2) || 'SY'}
                    </div>
                    <div className="overflow-hidden min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-1">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{log.actor}</p>
                        <p className="text-[9px] shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{log.created_at ? format(new Date(log.created_at), 'HH:mm') : '-'}</p>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{log.SUBJECT}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── VLAN USAGE BAR ─────────────────────────────────── */}
        <div className="mt-5 glass p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}><Database size={15} /></div>
              <div>
                <h3 className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>VLAN Network Capacity</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Kapasitas slot jaringan keseluruhan</p>
              </div>
            </div>
            <div className="text-right">
              <p
                className="text-2xl font-black"
                style={{
                  color: vlanUsagePercent > 85 ? '#f87171' : vlanUsagePercent > 60 ? '#fbbf24' : '#10b981',
                  textShadow: `0 0 20px ${vlanUsagePercent > 85 ? 'rgba(248,113,113,0.4)' : vlanUsagePercent > 60 ? 'rgba(251,191,36,0.4)' : 'rgba(16,185,129,0.4)'}`,
                }}
              >{vlanUsagePercent}%</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{realtimeStats.totalVlanUsed} / {realtimeStats.totalVlanFree + realtimeStats.totalVlanUsed} terpakai</p>
            </div>
          </div>
          <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${vlanUsagePercent}%`,
                background: vlanUsagePercent > 85
                  ? 'linear-gradient(90deg, #ef4444, #f87171)'
                  : vlanUsagePercent > 60
                  ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                  : 'linear-gradient(90deg, #059669, #10b981, #34d399)',
                boxShadow: vlanUsagePercent > 85 ? '0 0 12px rgba(248,113,113,0.5)' : vlanUsagePercent > 60 ? '0 0 12px rgba(251,191,36,0.4)' : '0 0 12px rgba(16,185,129,0.4)',
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>0%</span>
            <span className="text-[10px] font-bold" style={{ color: vlanUsagePercent > 85 ? '#f87171' : vlanUsagePercent > 60 ? '#fbbf24' : '#10b981' }}>
              {vlanUsagePercent > 85 ? '⚠ Kapasitas kritis!' : vlanUsagePercent > 60 ? 'Perlu perhatian' : '✓ Normal'}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>100%</span>
          </div>
        </div>

      </div>

      {/* ── FLOATING INBOX BUTTON ──────────────────────────── */}
      <button
        onClick={() => setShowInbox(true)}
        className="fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
      >
        <ListTodo size={20} />
        {myInboxTickets.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {myInboxTickets.length}
          </span>
        )}
      </button>

      {/* ── INBOX MODAL ────────────────────────────────────── */}
      {showInbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[85vh] overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', fontFamily: "'Inter', sans-serif" }}>

            {/* Header */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <div className="p-1 rounded-lg" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
                      <Inbox size={14} />
                    </div>
                    Inbox Tugas Utama
                  </h2>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {userRole === 'SUPER_DEV' ? 'Monitoring PIC' : 'Daftar Paket Work Order'}
                  </p>
                </div>
                <button
                  onClick={() => setShowInbox(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" size={13} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Cari nomor tiket..."
                  value={searchTicket}
                  onChange={e => setSearchTicket(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 rounded-lg text-xs font-medium outline-none transition-all"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-bg)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: 'var(--bg-base)' }}>
              {myInboxTickets
                .filter(t => (t.id_tiket_custom || '').toLowerCase().includes(searchTicket.toLowerCase()))
                .map(ticket => {
                  const isExpanded = expandedTicket === ticket.id;
                  return (
                    <div key={ticket.id} className="rounded-xl overflow-hidden transition-all"
                      style={{ border: `1px solid ${isExpanded ? 'rgba(56,189,248,0.3)' : 'var(--border-light)'}`, background: 'var(--bg-surface)' }}>
                      <button
                        onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                        className="w-full flex items-center justify-between p-3.5 text-left transition-colors"
                        style={{ background: isExpanded ? 'rgba(56,189,248,0.07)' : 'transparent' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg transition-colors"
                            style={isExpanded
                              ? { background: '#0284c7', color: '#fff' }
                              : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                            }>
                            <ListTodo size={14} />
                          </div>
                          <div>
                            <h3 className="font-bold text-xs uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>
                              {ticket.id_tiket_custom || 'BATCH'}
                            </h3>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {ticket.details.length} WOs{userRole === 'SUPER_DEV' ? ` · PIC: ${ticket.assigned_to}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border"
                            style={ticket.status === 'SOLVED'
                              ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.25)' }
                              : { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.25)' }
                            }>
                            {ticket.status}
                          </span>
                          {isExpanded
                            ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                            : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-2 space-y-2" style={{ borderTop: '1px solid rgba(56,189,248,0.12)', background: 'rgba(56,189,248,0.04)' }}>
                          {ticket.details.map((wo: any) => (
                            <div key={wo.id} className="flex items-center justify-between p-2.5 rounded-lg"
                              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-light)' }}>
                              <div className="flex-1 pr-3 min-w-0">
                                <h4 className="font-semibold text-xs truncate" style={{ color: 'var(--text-primary)' }}>{wo['SUBJECT WO']}</h4>
                                <p className="text-[10px] italic truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{wo.KETERANGAN || '-'}</p>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                                style={wo.STATUS === 'SOLVED'
                                  ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.25)' }
                                  : { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.25)' }
                                }>
                                {wo.STATUS}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 flex justify-between items-center"
              style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{myInboxTickets.length} Tiket Aktif</span>
              <button
                onClick={handleDownloadInbox}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-mid)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-border)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)'; }}
              >
                <Download size={13} /> Download .txt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STAT CARD ────────────────────────────────────────────────
function StatCard({ title, value, sub, icon, accentColor, trend, progress }: any) {
  const color = accentColor || '#10b981';
  return (
    <div className="glass stat-card p-4 relative overflow-hidden group" style={{ borderRadius: 20 }}>
      {/* Top glow line */}
      <div className="absolute top-0 left-0 w-full h-[2px] rounded-t-[20px]"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.7 }} />
      {/* Ambient corner glow */}
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}22 0%, transparent 70%)` }} />

      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}1a`, border: `1px solid ${color}33`, color }}>
          {icon}
        </div>
        {trend && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
            <ArrowUpRight size={10} />{trend}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold leading-none mb-1 relative z-10"
        style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs font-semibold relative z-10" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      <p className="text-[11px] mt-0.5 relative z-10" style={{ color: 'var(--text-muted)' }}>{sub}</p>

      {progress !== undefined && (
        <div className="mt-3 w-full rounded-full h-1.5 overflow-hidden relative z-10"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: progress > 85
                ? 'linear-gradient(90deg,#ef4444,#f87171)'
                : progress > 60
                  ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
                  : `linear-gradient(90deg,${color},${color}cc)`,
              boxShadow: `0 0 8px ${progress > 85 ? '#ef4444' : progress > 60 ? '#f59e0b' : color}66`,
            }} />
        </div>
      )}
    </div>
  );
}

// ── MINI STAT CARD ───────────────────────────────────────────
function MiniStatCard({ label, value, icon, color }: any) {
  // color is now a hex string e.g. "#fbbf24"
  const c = color || '#10b981';
  return (
    <div className="glass p-3.5 flex items-center gap-3" style={{ borderRadius: 16 }}>
      <div className="p-2 rounded-xl flex items-center justify-center"
        style={{ background: `${c}1a`, border: `1px solid ${c}30`, color: c }}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${c}bb` }}>{label}</p>
        <p className="text-xl font-bold" style={{ color: c }}>{value}</p>
      </div>
    </div>
  );
}

// ── SKELETON ────────────────────────────────────────────────
function DashboardSkeleton() {
  const shimmer = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.6s infinite',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.06)',
  } as React.CSSProperties;
  return (
    <div className="p-5 md:p-7" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ ...shimmer, height: 24, width: 160, marginBottom: 6 }} />
      <div style={{ ...shimmer, height: 16, width: 224, marginBottom: 28 }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[1,2,3,4].map(i => <div key={i} style={{ ...shimmer, height: 112 }} />)}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[1,2,3].map(i => <div key={i} style={{ ...shimmer, height: 64 }} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2" style={{ ...shimmer, height: 288 }} />
        <div className="flex flex-col gap-4">
          <div style={{ ...shimmer, height: 128 }} />
          <div style={{ ...shimmer, height: 192 }} />
        </div>
      </div>
    </div>
  );
}