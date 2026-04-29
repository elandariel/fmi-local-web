'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Wrench, Calculator, Activity, FileText, Shuffle,
  Copy, Download, RefreshCcw, ArrowLeft, ArrowRight,
  Search, CheckCircle, Lock, Server, Calendar,
  Loader2, User
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { PERMISSIONS, hasAccess, Role } from '@/lib/permissions';
import { logActivity, getActorName } from '@/lib/logger';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const TOOLS = [
  { id: 'ipcalc',      label: 'IP Subnet Calculator', icon: Calculator, desc: 'Hitung subnet, range IP, dan broadcast.',         color: 'text-blue-600',   bg: 'bg-blue-50',   accent: 'border-blue-200'   },
  { id: 'speedtest',   label: 'Server Speed Test',    icon: Activity,   desc: 'Cek bandwidth & latensi server lokal.',           color: 'text-emerald-600', bg: 'bg-emerald-50', accent: 'border-emerald-200' },
  { id: 'backbone',    label: 'Report Generator',     icon: FileText,   desc: 'Buat draft laporan teknis (.txt) otomatis.',      color: 'text-amber-600',  bg: 'bg-amber-50',  accent: 'border-amber-200'  },
  { id: 'distributor', label: 'WO Distributor',       icon: Shuffle,    desc: 'Bagikan tiket WO ke tim teknisi.',               color: 'text-purple-600', bg: 'bg-purple-50', accent: 'border-purple-200', restricted: true },
];

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    async function getRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (data) setUserRole(data.role as Role);
      }
    }
    getRole();
  }, []);

  // ── TOOL GRID ──
  if (!activeTool) {
    return (
      <div
        className="p-6 md:p-8 min-h-screen"
        style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}
      >
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 bg-slate-100 rounded-lg text-slate-700">
                <Wrench size={17} />
              </div>
              Tools & Utilities
            </h1>
            <p className="text-xs text-slate-400 mt-1 ml-0.5">Pilih alat bantu operasional yang Anda butuhkan.</p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOOLS.map((tool) => {
              const isRestricted = tool.restricted && !hasAccess(userRole, PERMISSIONS.TOOLS_WO_DISTRIBUTOR_VIEW) && userRole !== 'CS';
              return (
                <button
                  key={tool.id}
                  disabled={isRestricted}
                  onClick={() => setActiveTool(tool.id)}
                  className={`relative p-5 rounded-xl border text-left transition-all group overflow-hidden ${
                    isRestricted
                      ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
                      : `bg-white border-slate-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5`
                  }`}
                >
                  {/* Top accent line on hover */}
                  {!isRestricted && (
                    <div className={`absolute top-0 left-0 right-0 h-0.5 ${tool.bg.replace('bg-', 'bg-').replace('50', '400')} opacity-0 group-hover:opacity-100 transition-opacity`} />
                  )}

                  <div className={`p-2.5 rounded-lg w-fit mb-3.5 ${tool.bg} ${tool.color} border ${tool.accent}`}>
                    {isRestricted ? <Lock size={18} /> : <tool.icon size={20} />}
                  </div>

                  <h3 className={`font-bold text-slate-800 text-sm mb-1 group-hover:text-blue-600 transition-colors ${isRestricted ? 'text-slate-400' : ''}`}>
                    {tool.label}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isRestricted ? 'Akses terbatas untuk role Anda.' : tool.desc}
                  </p>

                  {!isRestricted && (
                    <ArrowRight
                      size={15}
                      className="absolute right-5 bottom-5 text-slate-300 group-hover:text-blue-400 transition-all translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE TOOL VIEW ──
  const activeMeta = TOOLS.find(t => t.id === activeTool);
  return (
    <div
      className="p-6 md:p-8 min-h-screen"
      style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => setActiveTool(null)}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-5"
        >
          <ArrowLeft size={15} /> Kembali ke Menu
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
          {activeTool === 'ipcalc'      && <IpCalculator />}
          {activeTool === 'speedtest'   && <SpeedTest />}
          {activeTool === 'backbone'    && <ReportBackbone userRole={userRole} />}
          {activeTool === 'distributor' && <WoDistributor userRole={userRole} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOOL HEADER HELPER
// ─────────────────────────────────────────────
function ToolHeader({ icon: Icon, title, iconBg, iconColor }: { icon: any; title: string; iconBg: string; iconColor: string }) {
  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${iconBg} ${iconColor}`}>
        <Icon size={18} />
      </div>
      <h2 className="font-bold text-slate-800">{title}</h2>
    </div>
  );
}

// ─────────────────────────────────────────────
// 1. IP SUBNET CALCULATOR
// ─────────────────────────────────────────────
function IpCalculator() {
  const [ipInput, setIpInput] = useState('');
  const [cidr, setCidr] = useState(24);
  const [result, setResult] = useState<any>(null);

  const validateIP = (ip: string) => {
    const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!pattern.test(ip)) return false;
    return ip.split('.').every(num => parseInt(num) >= 0 && parseInt(num) <= 255);
  };

  const intToIp = (int: number) =>
    [(int >>> 24) & 0xFF, (int >>> 16) & 0xFF, (int >>> 8) & 0xFF, int & 0xFF].join('.');

  const handleCalculate = () => {
    if (!ipInput) return toast.error('IP Address wajib diisi!');
    if (!validateIP(ipInput)) return toast.error('Format IP salah (contoh: 192.168.1.1)');
    try {
      const ipParts = ipInput.split('.').map(Number);
      const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
      const mask = 0xffffffff << (32 - cidr);
      const networkInt = ipInt & mask;
      const broadcastInt = networkInt | (~mask);
      let firstUsableInt = networkInt + 1;
      let lastUsableInt = broadcastInt - 1;
      let hosts = Math.pow(2, 32 - cidr) - 2;
      if (cidr >= 31) {
        firstUsableInt = networkInt;
        lastUsableInt = broadcastInt;
        hosts = cidr === 32 ? 1 : 2;
      }
      setResult({
        network: intToIp(networkInt), broadcast: intToIp(broadcastInt),
        netmask: intToIp(mask), hosts: hosts.toLocaleString(),
        firstUsable: intToIp(firstUsableInt), lastUsable: intToIp(lastUsableInt), cidr
      });
      toast.success('Kalkulasi selesai');
    } catch { toast.error('Error kalkulasi'); }
  };

  return (
    <div>
      <ToolHeader icon={Calculator} title="IP Subnet Calculator" iconBg="bg-blue-50" iconColor="text-blue-600" />
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Input panel */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 h-fit">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">IP Address</label>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                className="input font-mono"
                placeholder="192.168.1.1"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">CIDR Prefix</label>
                <span className="text-sm font-bold text-blue-600 font-mono">/{cidr}</span>
              </div>
              <input
                type="range" min="1" max="32" value={cidr}
                onChange={(e) => setCidr(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>/1</span><span>/16</span><span>/32</span>
              </div>
            </div>
            <button
              onClick={handleCalculate}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm"
            >
              Hitung Sekarang
            </button>
          </div>

          {/* Result */}
          <div className="lg:col-span-2">
            {result ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ResultCard label="Network Address" value={`${result.network}/${result.cidr}`} highlight />
                <ResultCard label="Total Usable Hosts" value={result.hosts} />
                <ResultCard label="Subnet Mask"   value={result.netmask} />
                <ResultCard label="Broadcast"     value={result.broadcast} />
                <ResultCard label="First IP"      value={result.firstUsable} />
                <ResultCard label="Last IP"       value={result.lastUsable} />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl min-h-[280px] gap-3">
                <Server size={36} className="opacity-40" />
                <p className="text-sm">Masukkan IP untuk melihat hasil</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, value, highlight }: any) {
  const copy = () => { navigator.clipboard.writeText(value); toast.success('Disalin!'); };
  return (
    <div className={`p-4 rounded-xl border flex justify-between items-center group ${
      highlight ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'
    }`}>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${highlight ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
        <p className={`font-mono font-bold text-lg leading-none ${highlight ? 'text-white' : 'text-slate-700'}`}>{value}</p>
      </div>
      <button
        onClick={copy}
        className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
          highlight ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'
        }`}
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. SPEED TEST
// ─────────────────────────────────────────────
function SpeedTest() {
  return (
    <div className="flex flex-col">
      <ToolHeader icon={Activity} title="Server Speed Test" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
      <div className="bg-slate-100 p-1">
        <iframe
          src="https://openspeedtest.com/Get-widget.php"
          className="w-full border-0 min-h-[600px]"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. REPORT GENERATOR
// ─────────────────────────────────────────────
function ReportBackbone({ userRole }: { userRole: Role | null }) {
  const [form, setForm] = useState({
    tiket: '', impact: '', status: 'Solved',
    problem: '', action: '', tagging: '', power: ''
  });
  const isCS = userRole === 'CS';

  const handleDownload = () => {
    if (isCS) return toast.error('Akses Ditolak: CS Mode View Only.');
    const text = `SUMMARY REPORT BACKBONE PROBLEM\n===============================\n\nTiket\t: ${form.tiket || '-'}\nImpact\t: ${form.impact || '-'}\nStatus\t: ${form.status}\n\nProblem analysis details :\n${form.problem || '-'}\n\nAction :\n${form.action || '-'}\n\nData Tagging\n${form.tagging || '-'}\n\nRecord Power After Maintenance :\n${form.power || '-'}\n`;
    const element = document.createElement('a');
    element.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    element.download = `Report_${form.tiket.replace(/[^a-z0-9]/gi, '_').substring(0, 20) || 'Report'}.txt`;
    element.click();
    toast.success('Report berhasil diunduh');
  };

  const f = (key: string) => (e: any) => setForm({ ...form, [key]: e.target.value });

  return (
    <div>
      <ToolHeader icon={FileText} title="Report Generator" iconBg="bg-amber-50" iconColor="text-amber-600" />
      <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[600px]">

        {/* Input */}
        <div className="lg:col-span-2 p-6 space-y-4 overflow-y-auto border-r border-slate-100">
          {/* Header fields */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Tiket (Subject Lengkap)</label>
              <input className="input" placeholder="HT155380 - Major - Backbone - Karawang <> CCC 2x10G..." onChange={f('tiket')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Impact</label>
                <input className="input" placeholder="CCC <> KARAWANG 200G" onChange={f('impact')} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Status</label>
                <select className="input bg-white" onChange={f('status')}>
                  <option>Solved</option><option>Monitoring</option><option>Open</option>
                </select>
              </div>
            </div>
          </div>

          {[
            { key: 'problem', label: 'Problem Analysis Details', placeholder: '- Link low power...', rows: 3 },
            { key: 'action',  label: 'Action Taken',              placeholder: '- Pengecekan di sisi BTS...', rows: 4 },
            { key: 'tagging', label: 'Data Tagging (Lokasi/Core/Maps)', placeholder: 'Closure titik 8,7 km... (Paste info lengkap)', rows: 4, mono: true },
            { key: 'power',   label: 'Record Power After Maintenance', placeholder: '- SISI KARAWANG : -20.96...', rows: 3, mono: true },
          ].map(({ key, label, placeholder, rows, mono }) => (
            <div key={key}>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">{label}</label>
              <textarea
                rows={rows}
                className={`input resize-none ${mono ? 'font-mono text-xs' : ''}`}
                placeholder={placeholder}
                onChange={f(key)}
              />
            </div>
          ))}
        </div>

        {/* Preview + Download */}
        <div className="p-5 bg-slate-50 flex flex-col gap-4 border-l border-slate-100">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-y-auto p-4 max-h-[500px]">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <FileText size={12} /> Preview
            </h4>
            <div className="text-[10px] text-slate-600 font-mono space-y-2 leading-relaxed whitespace-pre-wrap">
              <p className="font-bold text-slate-800">SUMMARY REPORT BACKBONE PROBLEM</p>
              <hr className="border-slate-100" />
              <p><strong>Tiket:</strong> {form.tiket || '...'}</p>
              <p><strong>Impact:</strong> {form.impact || '...'}</p>
              <p><strong>Status:</strong> {form.status}</p>
              <div className="pt-1 border-t border-slate-100">
                <p className="font-bold text-slate-700 underline">Problem Analysis:</p>
                <p className="mt-0.5">{form.problem || '-'}</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 underline">Action:</p>
                <p className="mt-0.5">{form.action || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded p-2 border border-slate-100">
                <p className="font-bold text-slate-700">Data Tagging:</p>
                <p className="mt-0.5">{form.tagging || '-'}</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={isCS}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors ${
              isCS ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            <Download size={15} />
            {isCS ? 'Restricted' : 'Download .TXT'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 4. WO DISTRIBUTOR
// ─────────────────────────────────────────────
function WoDistributor({ userRole }: { userRole: Role | null }) {
  const [woList, setWoList] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [selectedWO, setSelectedWO] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const canDistribute = hasAccess(userRole, PERMISSIONS.TOOLS_WO_DISTRIBUTOR_ACTION);

  const fetchWO = async () => {
    setLoading(true);
    setSelectedWO([]);
    try {
      let query = supabase.from('Report Bulanan').select('*');
      if (filterDate) {
        const searchString = format(new Date(filterDate), 'd MMMM yyyy', { locale: idLocale });
        query = query.or('STATUS.eq.PENDING,STATUS.eq.PROGRESS,STATUS.eq.OPEN').ilike('KETERANGAN', `%${searchString}%`);
      } else {
        query = query.in('STATUS', ['PENDING', 'OPEN', 'PROGRESS']).is('NAMA TEAM', null);
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(100);
      if (error) throw error;
      setWoList(data || []);
      toast.success(`${data?.length || 0} WO ditemukan`);
    } catch (err: any) {
      toast.error('Gagal ambil data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function getTechs() {
      if (!canDistribute) return;
      const { data } = await supabase.from('profiles').select('id, full_name, role').in('role', ['NOC', 'AKTIVATOR', 'SUPER_DEV']);
      if (data) setTechnicians(data);
    }
    getTechs();
  }, [canDistribute]);

  const toggleWO = (id: string) => setSelectedWO(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleAllWO = () => setSelectedWO(selectedWO.length === woList.length ? [] : woList.map(wo => wo.id));
  const toggleTech = (name: string) => setSelectedTechs(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);

  const distributeWO = async () => {
    if (selectedTechs.length === 0 || selectedWO.length === 0) return toast.error('Pilih minimal 1 tim dan 1 WO!');
    setDistributing(true);
    const getAbbr = (name: string) => name.toUpperCase().replace(/[AEIOU\s]/g, '').slice(0, 4);
    try {
      const targetWOs = woList.filter(wo => selectedWO.includes(wo.id));
      const woIds = targetWOs.map(w => w.id);
      const inboxPromises = selectedTechs.map(async (techName) => {
        const { count } = await supabase.from('inbox_tugas').select('*', { count: 'exact', head: true });
        const formattedNumber = String((count || 0) + 1).padStart(5, '0');
        const customTicketId = `PND/PRG-${getAbbr(techName)}-${formattedNumber}`;
        return supabase.from('inbox_tugas').insert({ id_tiket_custom: customTicketId, assigned_to: techName, wo_ids: woIds, status: 'OPEN' });
      });
      const woUpdate = supabase.from('Report Bulanan').update({ 'NAMA TEAM': selectedTechs.join(', '), 'STATUS': 'OPEN' }).in('id', woIds);
      await Promise.all([...inboxPromises, woUpdate]);
      toast.success('Tiket berhasil didistribusikan!');
      fetchWO(); setSelectedWO([]); setSelectedTechs([]);
      const actorName = await getActorName(supabase);
      await logActivity({
        activity: 'WO_DISTRIBUTE',
        subject: `${woIds.length} WO → ${selectedTechs.join(', ')}`,
        actor: actorName,
        detail: `${woIds.length} WO didistribusikan ke ${selectedTechs.length} teknisi`,
      });
    } catch (error: any) {
      toast.error('Gagal: ' + error.message);
    } finally {
      setDistributing(false);
    }
  };

  return (
    <div>
      <ToolHeader icon={Shuffle} title="WO Distributor" iconBg="bg-purple-50" iconColor="text-purple-600" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-5 items-start">

        {/* ── WO LIST ── */}
        <div className="lg:col-span-2 flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm h-[60vh] min-h-[480px]">

          {/* Toolbar */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600"
                checked={selectedWO.length === woList.length && woList.length > 0}
                onChange={toggleAllWO}
              />
              <span className="text-xs font-semibold text-slate-600">Terpilih: <span className="text-blue-600">{selectedWO.length}</span> WO</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none bg-white"
              />
              <button
                onClick={fetchWO}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
                Get Data
              </button>
            </div>
          </div>

          {/* WO scroll area */}
          <div className="flex-1 p-3 space-y-2 overflow-y-auto bg-slate-50/30">
            {woList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 border-2 border-dashed border-slate-200 rounded-xl">
                <Search size={28} className="opacity-40" />
                <p className="text-xs text-slate-400">Pilih tanggal dan klik "Get Data"</p>
              </div>
            ) : (
              woList.map((wo, idx) => (
                <label
                  key={idx}
                  className={`p-3.5 border rounded-xl flex items-center gap-3 cursor-pointer transition-all hover:border-blue-300 ${
                    selectedWO.includes(wo.id) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 shrink-0 accent-blue-600"
                    checked={selectedWO.includes(wo.id)}
                    onChange={() => toggleWO(wo.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                        {wo.TANGGAL && !isNaN(new Date(wo.TANGGAL).getTime())
                          ? format(new Date(wo.TANGGAL), 'dd/MM/yyyy')
                          : 'No Date'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                        wo.STATUS === 'PROGRESS'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {wo.STATUS}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 truncate">{wo['SUBJECT WO'] || 'No Subject'}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 italic">{wo['KETERANGAN'] || '-'}</p>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* ── TECHNICIAN PANEL ── */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm h-[60vh] min-h-[480px] overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
            <h3 className="font-bold text-slate-700 text-xs flex items-center gap-2 uppercase tracking-widest">
              <User size={13} className="text-purple-500" /> Pilih Tim Teknisi
            </h3>
          </div>

          {/* Tech list */}
          <div className="flex-1 p-3 space-y-2 overflow-y-auto">
            {technicians.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                Tidak ada teknisi tersedia
              </div>
            ) : (
              technicians.map((tech) => (
                <label
                  key={tech.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedTechs.includes(tech.full_name)
                      ? 'bg-blue-50 border-blue-300 shadow-sm'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded text-blue-600 w-3.5 h-3.5 accent-blue-600"
                    checked={selectedTechs.includes(tech.full_name)}
                    onChange={() => toggleTech(tech.full_name)}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{tech.full_name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{tech.role}</p>
                  </div>
                </label>
              ))
            )}
          </div>

          {/* Distribute button */}
          <div className="p-3.5 border-t border-slate-100 shrink-0">
            <button
              onClick={distributeWO}
              disabled={!canDistribute || selectedTechs.length === 0 || selectedWO.length === 0 || distributing}
              className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 py-2.5 rounded-lg font-semibold text-sm transition-colors flex justify-center items-center gap-2"
            >
              {distributing ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />}
              Distribusi {selectedWO.length > 0 ? `${selectedWO.length} ` : ''}Tiket
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              Status WO otomatis berubah jadi OPEN
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}