'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Plus, Search, Layers, X, Trash2,
  FileSpreadsheet, Loader2, MapPin,
  Edit3, CheckCircle2, AlertCircle, Download, Upload,
  Server, Tag, ChevronRight, Info,
  Network, Zap
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────
// DETAIL DRAWER HELPERS
// ─────────────────────────────────────────────
function DrawerSection({
  icon, title, color, children
}: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <span className={color}>{icon}</span>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{title}</p>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}

function DrawerField({
  label, value, mono, accent, span, wrap
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  accent?: boolean;
  span?: boolean;
  wrap?: boolean; // allow text to wrap — no truncate
}) {
  const empty = !value;
  return (
    <div className={`
      rounded-lg p-3 border
      ${accent ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}
      ${span ? 'col-span-2' : ''}
    `}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
        {label}
      </p>
      <p className={`
        text-sm font-semibold leading-snug
        ${mono ? 'font-mono' : ''}
        ${accent ? 'text-blue-700' : 'text-slate-700'}
        ${empty ? 'text-slate-300 italic font-normal' : ''}
        ${wrap ? 'break-words whitespace-normal' : 'truncate'}
      `}>
        {value || '—'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function InterkoneksiPage() {
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [searchTerm, setSearchTerm]   = useState('');
  const [data, setData]               = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [detailItem, setDetailItem]   = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const SS_CONFIG = {
    url:  'https://script.google.com/macros/s/AKfycbx7aZ3bzoAXXaewspBpas0MalHe0694WXfyJzHeMSb85YE9kZh49R_5xhcRoZzaTL8p/exec',
    id:   '1BHALs4UFTj_1c7UR7Uf4U1Vq2L3fdsGQ9epN6aEBkSM',
    name: 'Data Interkoneksi'
  };

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const emptyForm = {
    ID_Pelanggan: '', Nama_ISP: '', Location: '', Lantai: '',
    Device: '', SN_Perangkat: '', Rack: '', OTB: '', Type: '',
    Port: '', No_Reff: '', Label: '', Kapasitas: '', Limitasi: '',
    Status: 'Active'
  };

  const [formData, setFormData] = useState(emptyForm);

  const fetchData = async () => {
    setLoading(true);
    const { data: inter, error } = await supabase
      .from('Data Interkoneksi').select('*').order('id', { ascending: false });
    if (!error) setData(inter || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const lines = content.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return;
        const rawHeaders   = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const validColumns = Object.keys(emptyForm);
        const importedData = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: any = {};
          rawHeaders.forEach((header, index) => {
            if (validColumns.includes(header) && header.toLowerCase() !== 'id')
              row[header] = values[index] || null;
          });
          return row;
        }).filter(row => Object.keys(row).length > 0);
        if (confirm(`Upsert ${importedData.length} data ke database?`)) {
          setLoading(true);
          const { error } = await supabase.from('Data Interkoneksi').upsert(importedData);
          if (error) throw error;
          toast.success('Import Berhasil!');
          fetchData();
        }
      } catch (err: any) {
        toast.error('Gagal: ' + err.message);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExportCSV = () => {
    if (data.length === 0) return toast.error('Data kosong');
    const headers = Object.keys(emptyForm);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvRows.join('\n')], { type: 'text/csv' }));
    a.download = `Data_Interkoneksi_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredData = useMemo(() =>
    data.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    ),
    [searchTerm, data]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await supabase.from('Data Interkoneksi').update(formData).eq('id', editingItem.id);
        toast.success('Data berhasil diupdate!');
        if (detailItem?.id === editingItem.id)
          setDetailItem({ ...detailItem, ...formData });
      } else {
        await supabase.from('Data Interkoneksi').insert([formData]);
        toast.success('Data berhasil ditambahkan!');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus data ini?')) return;
    setLoading(true);
    try {
      await supabase.from('Data Interkoneksi').delete().eq('id', id);
      toast.success('Data dihapus');
      if (detailItem?.id === id) setDetailItem(null);
      fetchData();
    } finally { setLoading(false); }
  };

  const handleSyncSheet = async () => {
    if (data.length === 0) return;
    setSyncing(true);
    try {
      await fetch(SS_CONFIG.url, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ spreadsheetId: SS_CONFIG.id, sheetName: SS_CONFIG.name, rows: data })
      });
      toast.success('Sync Berhasil!');
    } finally { setSyncing(false); }
  };

  const openModal = (item: any = null) => {
    setEditingItem(item);
    setFormData({
      ID_Pelanggan: item?.ID_Pelanggan || '', Nama_ISP: item?.Nama_ISP || '',
      Location: item?.Location || '',         Lantai: item?.Lantai || '',
      Device: item?.Device || '',             SN_Perangkat: item?.SN_Perangkat || '',
      Rack: item?.Rack || '',                 OTB: item?.OTB || '',
      Type: item?.Type || '',                 Port: item?.Port || '',
      No_Reff: item?.No_Reff || '',           Label: item?.Label || '',
      Kapasitas: item?.Kapasitas || '',       Limitasi: item?.Limitasi || '',
      Status: item?.Status || 'Active'
    });
    setIsModalOpen(true);
  };

  const formFields = [
    { key: 'ID_Pelanggan', label: 'ID Pelanggan', mono: true },
    { key: 'Nama_ISP',     label: 'Nama ISP' },
    { key: 'Location',     label: 'Location' },
    { key: 'Lantai',       label: 'Lantai' },
    { key: 'Device',       label: 'Device',       mono: true },
    { key: 'SN_Perangkat', label: 'SN Perangkat', mono: true },
    { key: 'Rack',         label: 'Rack' },
    { key: 'OTB',          label: 'OTB' },
    { key: 'Type',         label: 'Type' },
    { key: 'Port',         label: 'Port',         mono: true },
    { key: 'No_Reff',      label: 'No. Referensi' },
    { key: 'Label',        label: 'Label' },
    { key: 'Kapasitas',    label: 'Kapasitas' },
    { key: 'Limitasi',     label: 'Limitasi' },
  ];

  const isActive = (item: any) => item?.Status !== 'Dismantle';

  // ─────────────────────────────────────────────
  return (
    <div
      className="min-h-screen p-6 md:p-8"
      style={{ background: '#f4f6f9', fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <div className="max-w-[1600px] mx-auto">

        {/* ── HEADER ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><Layers size={17} /></div>
              Data Interkoneksi
            </h1>
            <p className="text-xs text-slate-400 mt-1 ml-0.5">Database Interkoneksi / Cross Connect Client FMI</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <Upload size={13} className="text-blue-500" /> Import
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <Download size={13} className="text-amber-500" /> Export
            </button>
            <button onClick={handleSyncSheet} disabled={syncing} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm disabled:opacity-50">
              {syncing ? <Loader2 className="animate-spin" size={13} /> : <FileSpreadsheet size={13} />} Sync Sheet
            </button>
            <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm">
              <Plus size={15} /> Interkoneksi Baru
            </button>
          </div>
        </div>

        {/* ── SEARCH ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 flex items-center overflow-hidden">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Cari ID, ISP, lokasi, device, atau port..."
              className="w-full py-3 pl-11 pr-4 text-sm outline-none text-slate-700 placeholder:text-slate-400"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="px-5 border-l border-slate-100 text-xs font-semibold text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
            Total: <span className="text-blue-600 font-bold text-sm">{filteredData.length}</span>
          </div>
        </div>

        {/* ── TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100" style={{ background: '#f8fafc' }}>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">ID & Status</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">ISP / Pelanggan</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Site & Lokasi</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Hardware & Port</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Kapasitas</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>{[1,2,3,4,5,6].map(j => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded animate-pulse w-full max-w-[120px]" />
                      </td>
                    ))}</tr>
                  ))
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Layers size={28} className="opacity-20" />
                        <p className="text-sm font-medium">Tidak ada data ditemukan</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => {
                    const isSelected = detailItem?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors group ${isSelected ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'}`}
                      >
                        {/* ID — click to open drawer */}
                        <td className="px-5 py-3.5">
                          <p className="font-mono text-[10px] text-slate-400 mb-0.5">#{item.id}</p>
                          <button
                            onClick={() => setDetailItem(isSelected ? null : item)}
                            className={`text-[13px] font-bold flex items-center gap-1 mb-1.5 transition-colors group/id ${
                              isSelected ? 'text-blue-700' : 'text-blue-600 hover:text-blue-800'
                            }`}
                          >
                            {item.ID_Pelanggan || '—'}
                            <ChevronRight
                              size={12}
                              className={`transition-all duration-200 ${
                                isSelected
                                  ? 'opacity-100 text-blue-600'
                                  : 'opacity-0 group-hover/id:opacity-100'
                              }`}
                            />
                          </button>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isActive(item)
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-rose-50 text-rose-600 border-rose-200'
                          }`}>
                            {isActive(item) ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
                            {item.Status || 'Active'}
                          </span>
                        </td>

                        {/* ISP */}
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-slate-800">{item.Nama_ISP || '—'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{item.No_Reff || '—'}</p>
                        </td>

                        {/* Site */}
                        <td className="px-5 py-3.5 text-center">
                          <p className="text-xs font-semibold text-slate-700 flex items-center justify-center gap-1">
                            <MapPin size={11} className="text-blue-500 shrink-0" />{item.Location || '—'}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Lantai {item.Lantai || '—'}</p>
                        </td>

                        {/* Hardware */}
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-bold">Rack {item.Rack || '—'}</span>
                            <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Port {item.Port || '—'}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">{item.Device || '—'}</p>
                        </td>

                        {/* Kapasitas */}
                        <td className="px-5 py-3.5 text-center">
                          <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                            {item.Kapasitas || '—'}
                          </span>
                          {item.Limitasi && (
                            <p className="text-[10px] text-rose-500 font-semibold mt-1">Lmt: {item.Limitasi}</p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setDetailItem(isSelected ? null : item)}
                              className={`p-1.5 rounded-md transition-all ${
                                isSelected
                                  ? 'text-blue-600 bg-blue-50'
                                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                              title="Lihat Detail"
                            >
                              <Info size={14} />
                            </button>
                            <button onClick={() => openModal(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all" title="Edit">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all" title="Hapus">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          DETAIL DRAWER — slide from right
          Fixed overlay (dim) + animated panel
      ══════════════════════════════════════════ */}
      {/* Dim backdrop — click to close */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          detailItem ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setDetailItem(null)}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-[480px] bg-white shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${detailItem ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {detailItem && (
          <>
            {/* Accent bar */}
            <div
              className="h-1 w-full shrink-0"
              style={{
                background: isActive(detailItem)
                  ? 'linear-gradient(90deg, #2563eb, #60a5fa)'
                  : 'linear-gradient(90deg, #e11d48, #fb7185)'
              }}
            />

            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      isActive(detailItem)
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                      {isActive(detailItem) ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                      {detailItem.Status || 'Active'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                      #{detailItem.id}
                    </span>
                  </div>
                  {/* Title — allow wrap, large and clear */}
                  <h2 className="text-xl font-bold text-slate-900 leading-tight break-words">
                    {detailItem.ID_Pelanggan || '—'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 break-words">{detailItem.Nama_ISP || '—'}</p>
                </div>
                <button
                  onClick={() => setDetailItem(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors shrink-0 mt-0.5"
                >
                  <X size={17} />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => openModal(detailItem)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  <Edit3 size={13} /> Edit Data
                </button>
                <button
                  onClick={() => handleDelete(detailItem.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-all"
                >
                  <Trash2 size={13} /> Hapus
                </button>
              </div>
            </div>

            {/* Drawer body — scrollable, all text wraps */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">

              {/* Lokasi */}
              <DrawerSection icon={<MapPin size={13} />} title="Lokasi" color="text-blue-600">
                <DrawerField label="Location" value={detailItem.Location} wrap />
                <DrawerField label="Lantai"   value={detailItem.Lantai}   wrap />
              </DrawerSection>

              {/* Perangkat */}
              <DrawerSection icon={<Server size={13} />} title="Perangkat" color="text-indigo-600">
                <DrawerField label="Device"       value={detailItem.Device}       mono wrap />
                <DrawerField label="SN Perangkat" value={detailItem.SN_Perangkat} mono wrap />
                <DrawerField label="OTB"          value={detailItem.OTB}          wrap />
                <DrawerField label="Type"         value={detailItem.Type}         wrap />
              </DrawerSection>

              {/* Koneksi & Port */}
              <DrawerSection icon={<Network size={13} />} title="Koneksi & Port" color="text-violet-600">
                <DrawerField label="Rack" value={detailItem.Rack} wrap />
                <DrawerField label="Port" value={detailItem.Port} mono accent wrap />
              </DrawerSection>

              {/* Kapasitas — big cards */}
              <DrawerSection icon={<Zap size={13} />} title="Kapasitas" color="text-emerald-600">
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Kapasitas</p>
                    <p className="text-2xl font-bold text-blue-700 font-mono leading-none">
                      {detailItem.Kapasitas || '—'}
                    </p>
                  </div>
                  <div className={`border rounded-xl p-4 text-center ${
                    detailItem.Limitasi ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${
                      detailItem.Limitasi ? 'text-rose-400' : 'text-slate-400'
                    }`}>Limitasi</p>
                    <p className={`text-2xl font-bold font-mono leading-none ${
                      detailItem.Limitasi ? 'text-rose-600' : 'text-slate-300'
                    }`}>
                      {detailItem.Limitasi || '—'}
                    </p>
                  </div>
                </div>
              </DrawerSection>

              {/* Referensi */}
              <DrawerSection icon={<Tag size={13} />} title="Referensi & Label" color="text-amber-600">
                <DrawerField label="No. Referensi" value={detailItem.No_Reff} mono wrap span />
                <DrawerField label="Label"         value={detailItem.Label}        wrap span />
              </DrawerSection>

            </div>
          </>
        )}
      </div>

      {/* ── FORM MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-slate-800 text-base">
                  {editingItem ? 'Update' : 'Tambah'} <span className="text-blue-600">Interkoneksi</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Technical data base on E-Mail</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">Status</label>
                  <select
                    value={formData.Status}
                    onChange={(e) => setFormData({ ...formData, Status: e.target.value })}
                    className={`input font-semibold ${
                      formData.Status === 'Dismantle'
                        ? 'bg-rose-50 border-rose-200 text-rose-600'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    <option value="Active">Active</option>
                    <option value="Dismantle">Dismantle</option>
                  </select>
                </div>
                {formFields.map(({ key, label, mono }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
                    <input
                      value={(formData as any)[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      placeholder="—"
                      className={`input ${mono ? 'font-mono text-blue-700' : ''}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-2.5">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-all">
                Batal
              </button>
              <button type="submit" disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold text-xs shadow-sm transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="animate-spin" size={14} /> : null}
                {editingItem ? 'Update Data' : 'Simpan Data'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}