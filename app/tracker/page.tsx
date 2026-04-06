'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { 
  Search, Download, X, TrendingUp, UserPlus, 
  Server, Plus, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { toast } from 'sonner';
import MonthlySummary from '@/components/MonthlySummary';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const TABLE_MAP = {
  'Berlangganan': 'Berlangganan 2026',
  'Berhenti Berlangganan': 'Berhenti Berlangganan 2026',
  'Berhenti Sementara': 'Berhenti Sementara 2026',
  'Upgrade': 'Upgrade 2026',
  'Downgrade': 'Downgrade 2026'
};

const CATEGORY_COLOR: Record<string, string> = {
  'Berlangganan': '#10b981',
  'Berhenti Berlangganan': '#ef4444',
  'Berhenti Sementara': '#f59e0b',
  'Upgrade': '#2d7dd2',
  'Downgrade': '#94a3b8',
};

export default function TrackerPage() {
  const [selectedCategory, setSelectedCategory] = useState('Berlangganan');
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<Role | null>(null);
  const summaryRef = useRef<any>(null);

  const [targetMonth, setTargetMonth] = useState('2026-01');

  const [showModal, setShowModal] = useState(false);
  const [modalChartMode, setModalChartMode] = useState('ISP');
  const [globalStats, setGlobalStats] = useState<any>({
    pasang: 0, putus: 0, cuti: 0, netGrowth: 0,
    byIsp: [], byBts: []
  });

  const [chartTrend, setChartTrend] = useState<any>({ series: [], options: {} });
  const [chartTeam, setChartTeam] = useState<any>({ series: [], options: {} });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setUserRole(profile.role as Role);
    }

    const tableName = TABLE_MAP[selectedCategory as keyof typeof TABLE_MAP];
    if (!tableName) {
      toast.error(`Kategori '${selectedCategory}' belum di-mapping.`);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from(tableName).select('*').order('TANGGAL', { ascending: false });
    if (error) {
      toast.error('Gagal memuat data: ' + error.message);
    } else {
      setDataList(data || []);
      processMainCharts(data || [], selectedCategory);
    }
    setLoading(false);
  }

  async function fetchGlobalStats() {
    try {
      const [resPasang, resPutus, resCuti] = await Promise.all([
        supabase.from('Berlangganan 2026').select('id, ISP, BTS'),
        supabase.from('Berhenti Berlangganan 2026').select('id'),
        supabase.from('Berhenti Sementara 2026').select('id')
      ]);

      const pasang = resPasang.data?.length || 0;
      const putus = resPutus.data?.length || 0;
      const cuti = resCuti.data?.length || 0;

      const ispMap: any = {};
      const btsMap: any = {};
      resPasang.data?.forEach(row => {
        const isp = row.ISP || 'Unknown';
        ispMap[isp] = (ispMap[isp] || 0) + 1;
        const bts = row.BTS || 'Unknown';
        btsMap[bts] = (btsMap[bts] || 0) + 1;
      });

      setGlobalStats({
        pasang, putus, cuti,
        netGrowth: pasang - putus,
        byIsp: Object.keys(ispMap).map(k => ({ name: k, data: ispMap[k] })).sort((a, b) => b.data - a.data).slice(0, 15),
        byBts: Object.keys(btsMap).map(k => ({ name: k, data: btsMap[k] })).sort((a, b) => b.data - a.data).slice(0, 15)
      });
    } catch (err) {
      console.error('Gagal load global stats', err);
    }
  }

  useEffect(() => { fetchData(); }, [selectedCategory]);
  useEffect(() => { fetchGlobalStats(); }, []);

  const processMainCharts = (data: any[], category: string) => {
    const color = CATEGORY_COLOR[category] || '#2d7dd2';

    const dateMap: any = {};
    data.forEach(row => {
      if (row.TANGGAL) {
        const d = row.TANGGAL.substring(0, 7);
        dateMap[d] = (dateMap[d] || 0) + 1;
      }
    });
    const sortedDates = Object.keys(dateMap).sort();

    setChartTrend({
      series: [{ name: 'Jumlah', data: sortedDates.map(d => dateMap[d]) }],
      options: {
        chart: { type: 'area', toolbar: { show: false }, fontFamily: "'IBM Plex Sans', sans-serif", background: 'transparent' },
        xaxis: { categories: sortedDates, labels: { style: { fontSize: '11px', colors: '#94a3b8' } } },
        yaxis: { labels: { style: { fontSize: '11px', colors: '#94a3b8' } } },
        colors: [color],
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.02 } },
        grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
        title: { text: `Tren ${category}`, style: { color: '#334155', fontSize: '13px', fontWeight: '700' } },
        dataLabels: { enabled: false },
        tooltip: { theme: 'light', y: { formatter: (val: number) => `${val} Data` } },
      }
    });

    const teamMap: any = {};
    data.forEach(row => {
      const t = row.TEAM || 'Unknown';
      teamMap[t] = (teamMap[t] || 0) + 1;
    });
    const sortedTeams = Object.keys(teamMap).sort((a, b) => teamMap[b] - teamMap[a]).slice(0, 5);

    setChartTeam({
      series: [{ name: 'Total WO', data: sortedTeams.map(t => teamMap[t]) }],
      options: {
        chart: { type: 'bar', toolbar: { show: false }, fontFamily: "'IBM Plex Sans', sans-serif", background: 'transparent' },
        xaxis: { categories: sortedTeams, labels: { style: { fontSize: '11px', colors: '#94a3b8' } } },
        yaxis: { labels: { style: { fontSize: '11px', colors: '#94a3b8' } } },
        colors: [color],
        grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
        title: { text: 'Top Performance Team', style: { color: '#334155', fontSize: '13px', fontWeight: '700' } },
        dataLabels: { enabled: true, style: { colors: ['#fff'], fontSize: '11px', fontWeight: '600' } },
        plotOptions: { bar: { borderRadius: 5, columnWidth: '50%' } },
        tooltip: { theme: 'light' },
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

  const canInput = hasAccess(userRole, PERMISSIONS.TRACKER_INPUT);
  const activeColor = CATEGORY_COLOR[selectedCategory] || '#2d7dd2';

  return (
    <div
      className="p-6 md:p-8 min-h-screen"
      style={{ background: '#f4f6f9', fontFamily: "'IBM Plex Sans', sans-serif" }}
    >

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <UserPlus size={17} />
            </div>
            Weekly Report
          </h1>
          <p className="text-xs text-slate-400 mt-1 ml-0.5">Monitoring status perubahan client</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-50 transition-colors"
          >
            <TrendingUp size={14} className="text-indigo-500" />
            Global Stats
          </button>
          {canInput && (
            <Link href="/tracker/create">
              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">
                <Plus size={14} /> Input Baru
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ── CATEGORY TABS ── */}
      <div className="flex flex-wrap gap-1.5 mb-6 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit">
        {Object.keys(TABLE_MAP).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedCategory === cat
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── CHARTS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="h-64">
            {chartTrend.series.length > 0 && (
              <ReactApexChart options={chartTrend.options} series={chartTrend.series} type="area" height="100%" />
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="h-64">
            {chartTeam.series.length > 0 && (
              <ReactApexChart options={chartTeam.options} series={chartTeam.series} type="bar" height="100%" />
            )}
          </div>
        </div>
      </div>

      {/* ── MONTHLY SUMMARY ── */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 rounded-md text-blue-600">
                <Calendar size={13} />
              </div>
              Monthly Summary Report
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 ml-0.5">Rekapitulasi performa bulanan dan status pelanggan</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => summaryRef.current?.handleExport()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors border-r border-slate-100"
              >
                <Download size={13} /> Excel
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Download size={13} /> PDF
              </button>
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periode:</span>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="text-xs font-semibold text-blue-600 outline-none bg-transparent cursor-pointer"
              />
            </div>
          </div>
        </div>

        <MonthlySummary ref={summaryRef} selectedMonth={targetMonth} />
      </div>

      {/* ── DATA TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-slate-800 text-sm">List {selectedCategory}</h3>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold border"
              style={{ background: `${activeColor}15`, color: activeColor, borderColor: `${activeColor}30` }}
            >
              {filteredData.length}
            </span>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Cari Subject / BTS / Team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#f8fafc' }}>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subject Pelanggan</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Provider (ISP)</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">BTS Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + j * 15}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredData.length > 0 ? (
                filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-5 py-3.5 text-xs font-medium text-slate-600 font-mono">
                      {row.TANGGAL ? format(new Date(row.TANGGAL), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-5 py-3.5 max-w-[240px]">
                      <p className="font-semibold text-slate-800 text-xs truncate">{getSubject(row)}</p>
                      {(row['PROBLEM'] || row['REASON'] || row['KETERANGAN']) && (
                        <p className="text-[10px] text-slate-400 italic truncate mt-0.5">
                          {row['PROBLEM'] || row['REASON'] || row['KETERANGAN']}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-bold uppercase">
                        {row.ISP || 'INTERNAL'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-semibold uppercase">
                        {row.TEAM || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Server size={12} className="text-slate-400 shrink-0" />
                        <span className="font-mono text-xs">{row.BTS || '—'}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-14 text-center text-slate-400 text-sm italic">
                    Data tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL GLOBAL STATS ── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                  <TrendingUp size={16} />
                </div>
                Summary Growth 2026
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-600 p-5 rounded-xl text-white shadow-sm">
                  <p className="text-[10px] font-bold uppercase opacity-80 mb-1">Net Growth</p>
                  <h3 className="text-3xl font-bold">{globalStats.netGrowth}</h3>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Berlangganan</p>
                  <h3 className="text-3xl font-bold text-emerald-600">{globalStats.pasang}</h3>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Berhenti</p>
                  <h3 className="text-3xl font-bold text-rose-600">{globalStats.putus}</h3>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Berhenti Sementara</p>
                  <h3 className="text-3xl font-bold text-amber-500">{globalStats.cuti}</h3>
                </div>
              </div>

              {/* Distribution chart */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex justify-between items-center mb-5">
                  <h4 className="font-bold text-slate-800 text-sm">Distribusi Pelanggan Pasang</h4>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg">
                    <button
                      onClick={() => setModalChartMode('ISP')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${modalChartMode === 'ISP' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Per ISP
                    </button>
                    <button
                      onClick={() => setModalChartMode('BTS')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${modalChartMode === 'BTS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Per BTS
                    </button>
                  </div>
                </div>
                <div className="h-[380px]">
                  <ReactApexChart
                    type="bar"
                    height="100%"
                    series={[{
                      name: 'Total',
                      data: modalChartMode === 'ISP'
                        ? globalStats.byIsp.map((i: any) => i.data)
                        : globalStats.byBts.map((i: any) => i.data)
                    }]}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: "'IBM Plex Sans', sans-serif" },
                      plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: '65%' } },
                      colors: [modalChartMode === 'ISP' ? '#2d7dd2' : '#7c3aed'],
                      xaxis: {
                        categories: modalChartMode === 'ISP'
                          ? globalStats.byIsp.map((i: any) => i.name)
                          : globalStats.byBts.map((i: any) => i.name),
                        labels: { style: { fontSize: '11px', colors: '#94a3b8' } }
                      },
                      grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
                      dataLabels: {
                        enabled: true,
                        textAnchor: 'start',
                        style: { colors: ['#fff'], fontWeight: '600', fontSize: '11px' },
                        formatter: (val: number) => val,
                        offsetX: 0,
                      },
                      tooltip: {
                        theme: 'light',
                        y: { formatter: (val: number) => `${val} Pelanggan` }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}