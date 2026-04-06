'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Wifi, Upload, Download, X, FileSpreadsheet, 
  Info, FileText, Table, Search, Loader2, ArrowRight, User, Database 
} from 'lucide-react';
import { format } from 'date-fns';
import { id as indonesia } from 'date-fns/locale';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

// Import Komponen Lonceng Notifikasi Baru
import { NotificationBell } from './NotificationBell';

export default function Header() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [exportConfig, setExportConfig] = useState({ table: '', format: '' });
  
  // State Global Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const TABLE_GUIDE: Record<string, string[]> = {
    "Report Bulanan": ["TANGGAL", "SUBJECT WO", "STATUS", "JENIS WO", "KETERANGAN", "SELESAI ACTION", "NAMA TEAM"],
    "Berlangganan 2026": ["TANGGAL", "SUBJECT BERLANGGANAN", "PROBLEM", "TEAM", "STATUS", "BTS", "DEVICE", "ISP"],
    "Berhenti Berlangganan 2026": ["TANGGAL", "SUBJECT BERHENTI BERLANGGANAN", "PROBLEM", "TEAM", "STATUS", "BTS", "DEVICE", "ISP", "REASON"],
    "Berhenti Sementara 2026": ["TANGGAL", "SUBJECT BERHENTI SEMENTARA", "PROBLEM", "TEAM", "STATUS", "BTS", "DEVICE", "ISP", "REASON"],
    "Upgrade 2026": ["TANGGAL", "SUBJECT UPGRADE", "PROBLEM", "TEAM", "STATUS", "BTS", "DEVICE", "ISP", "REASON"],
    "Downgrade 2026": ["TANGGAL", "SUBJECT DOWNGRADE", "PROBLEM", "TEAM", "STATUS", "BTS", "DEVICE", "ISP", "REASON"],
    "Data Client Corporate": ["ID PELANGGAN", "NAMA PELANGGAN", "LAYANAN", "KAPASITAS", "STATUS", "REDAMAN"],
    "VLAN Database": ["VLAN ID", "NAMA VLAN", "IP GATEWAY", "INTERFACE", "KETERANGAN"]
  };

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      clearInterval(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- LOGIKA GLOBAL SEARCH ---
  const handleGlobalSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      const clientsQuery = supabase
        .from('Data Client Corporate')
        .select('id, "Nama Pelanggan", "ID Pelanggan"')
        .or(`"Nama Pelanggan".ilike.%${query}%,"ID Pelanggan".ilike.%${query}%`)
        .limit(3);

      const reportsQuery = supabase
        .from('Report Bulanan')
        .select('id, "SUBJECT WO", TANGGAL')
        .ilike('SUBJECT WO', `%${query}%`)
        .limit(3);

      const vlanTables = ['Daftar Vlan 1-1000', 'Daftar Vlan 1000+', 'Daftar Vlan 2000+', 'Daftar Vlan 3000+'];
      const vlanQueries = vlanTables.map(tableName => {
        const isNumeric = !isNaN(Number(query));
        let baseQuery = supabase.from(tableName).select('VLAN, NAME');
        if (isNumeric) {
           return baseQuery.or(`NAME.ilike.%${query}%,VLAN.eq.${query}`).limit(2);
        } else {
           return baseQuery.ilike('NAME', `%${query}%`).limit(2);
        }
      });

      const [clients, reports, ...vlanResults] = await Promise.all([
        clientsQuery, 
        reportsQuery, 
        ...vlanQueries
      ]);

      const allVlanData = vlanResults.flatMap(res => res.data || []);

      const combined = [
        ...(clients.data?.map(i => ({ 
          type: 'Client', 
          icon: <User size={14}/>, 
          label: i['Nama Pelanggan'], 
          subLabel: i['ID Pelanggan'], 
          link: '/clients' 
        })) || []),
        ...(reports.data?.map(i => ({ 
          type: 'Work Order', 
          icon: <FileText size={14}/>, 
          label: i['SUBJECT WO'], 
          subLabel: i['TANGGAL'],
          link: '/work-orders' 
        })) || []),
        ...(allVlanData.map(i => ({ 
          type: 'VLAN', 
          icon: <Database size={14}/>, 
          label: i['NAME'], 
          subLabel: `VLAN ID: ${i['VLAN']}`, 
          link: '/vlan-database' 
        })) || [])
      ];

      setSearchResults(combined);
    } catch (err) {
      console.error("Search Error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // --- LOGIKA EXPORT ---
  const handleProcessExport = async () => {
    const { table, format: fileFormat } = exportConfig;
    if (!table || !fileFormat) return toast.error("Pilih data dan format export!");

    const loadingToast = toast.loading(`Menyiapkan data ${table}...`);
    
    try {
      const { data, error } = await supabase.from(table).select('*');
      toast.dismiss(loadingToast);

      if (error || !data || data.length === 0) return toast.error("Gagal mengambil data atau data kosong");

      const fileName = `${table}_${format(new Date(), 'yyyyMMdd_HHmm')}`;

      if (fileFormat === 'CSV') {
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${fileName}.csv`);
        link.click();
      } 
      else if (fileFormat === 'EXCEL') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } 
      else if (fileFormat === 'PDF') {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(14);
        doc.text(`NOC FMI - ${table}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 14, 20);
        
        const headers = Object.keys(data[0]);
        const rows = data.map((item: any) => Object.values(item));
        
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 25,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235] }
        });
        doc.save(`${fileName}.pdf`);
      }

      toast.success(`Berhasil export ${table} ke ${fileFormat}`);
      setShowExportModal(false);
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error("Terjadi kesalahan sistem saat export");
    }
  };

  const processImport = (file: File) => {
    if (!selectedTable) return toast.error("Pilih tabel tujuan terlebih dahulu");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data.length === 0) return toast.error("File CSV kosong");
        const csvHeaders = Object.keys(results.data[0] || {});
        const requiredHeaders = TABLE_GUIDE[selectedTable];
        const missingHeaders = requiredHeaders.filter(h => !csvHeaders.includes(h));
        
        if (missingHeaders.length > 0) {
          return toast.error(`Header tidak sesuai! Kolom hilang: ${missingHeaders.join(", ")}`, { duration: 5000 });
        }

        const { error } = await supabase.from(selectedTable).insert(results.data);
        if (error) toast.error("Gagal Import: " + error.message);
        else {
          toast.success(`Berhasil import ${results.data.length} data ke ${selectedTable}`);
          setShowImportModal(false);
          setSelectedTable('');
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    });
  };

  if (!mounted) return null;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 w-full shadow-sm">
      {/* Container Utama: Menggunakan flex-col di HP dan flex-row di Desktop */}
      <div className="flex flex-col md:flex-row items-center justify-between px-4 py-3 md:px-6 md:h-[73px] gap-3 md:gap-8">
        
        {/* BAGIAN ATAS (Mobile): Logo, Notif, Jam */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="bg-blue-600 p-1.5 md:p-2 rounded-lg">
              <Wifi className="text-white" size={18} />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-slate-800 leading-none">NOC Command</h1>
              <p className="text-[8px] md:text-[9px] text-slate-500 font-medium mt-0.5 uppercase tracking-tighter">Database System</p>
            </div>
          </div>

          {/* Muncul hanya di mobile (Notif & Jam Ringkas) */}
          <div className="flex items-center gap-3 md:hidden">
            <NotificationBell />
            <div className="text-right border-l border-slate-200 pl-3">
               <p className="text-sm font-mono font-bold text-slate-700">{format(time, 'HH:mm')}</p>
            </div>
          </div>
        </div>

        {/* BAGIAN TENGAH: SEARCH BAR (Full width di HP) */}
        <div className="relative w-full max-w-xl md:flex-1" ref={searchRef}>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
            <input 
              type="text"
              placeholder="Cari Client, WO, atau VLAN..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-10 text-[11px] md:text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900"
              style={{ color: '#0f172a' }} 
              value={searchQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" size={14} />
            ) : searchQuery && (
              <button onClick={() => {setSearchQuery(''); setSearchResults([]);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* HASIL PENCARIAN DROPDOWN */}
          {showResults && (
            <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              <div className="p-2 max-h-[300px] md:max-h-[350px] overflow-y-auto custom-scrollbar">
                {searchResults.length > 0 ? (
                  searchResults.map((result, idx) => (
                    <button 
                      key={idx}
                      onClick={() => { router.push(result.link); setShowResults(false); }}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                          {result.icon}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-900 line-clamp-1">{result.label}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                            {result.type} {result.subLabel ? `• ${result.subLabel}` : ''}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 opacity-0 md:group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-xs text-slate-400 font-medium tracking-wide italic">Data tidak ditemukan.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BAGIAN KANAN: ACTIONS & TIME (Desktop Only View) */}
        <div className="flex items-center gap-3 md:gap-6 w-full md:w-auto">
          {/* Tombol Import/Export: Berjajar 2 di mobile */}
          <div className="flex items-center gap-2 flex-1 md:flex-none md:border-r border-slate-200 md:pr-6 md:mr-2">
            <button 
              onClick={() => setShowImportModal(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 text-slate-800 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-slate-200 shadow-sm"
            >
              <Upload size={14} />
              <span className="text-[10px] font-bold uppercase">Import</span>
            </button>

            <button 
              onClick={() => setShowExportModal(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 text-slate-800 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-200 shadow-sm"
            >
              <Download size={14} />
              <span className="text-[10px] font-bold uppercase">Export</span>
            </button>
          </div>
          
          {/* Info Jam Desktop */}
          <div className="hidden md:flex items-center gap-6">
            <NotificationBell />
            <div className="text-right border-l border-slate-200 pl-6 flex flex-col justify-center">
              <p className="text-xl font-mono font-bold text-slate-700 leading-none">{format(time, 'HH:mm:ss')}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{format(time, 'dd MMM yyyy', { locale: indonesia })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL EXPORT (Mobile Friendly) */}
      {showExportModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300">
            <div className="p-5 border-b border-slate-100 bg-blue-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Download size={18} className="text-blue-600" /> Export Database
              </h3>
              <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 tracking-widest">Pilih Data</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                  onChange={(e) => setExportConfig({...exportConfig, table: e.target.value})}
                  value={exportConfig.table}
                >
                  <option value="">-- Pilih Data --</option>
                  {Object.keys(TABLE_GUIDE).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 tracking-widest">Pilih Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {['CSV', 'EXCEL', 'PDF'].map((f) => (
                    <button 
                      key={f} 
                      onClick={() => setExportConfig({...exportConfig, format: f})}
                      className={`p-3 rounded-xl border text-[10px] font-black transition-all flex flex-col items-center gap-1 ${exportConfig.format === f ? 'bg-slate-800 border-slate-800 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {f === 'PDF' ? <FileText size={16} /> : f === 'EXCEL' ? <FileSpreadsheet size={16} /> : <Table size={16} />}
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={handleProcessExport}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition shadow-xl shadow-blue-100 flex items-center justify-center gap-2"
              >
                <Download size={18} /> Eksekusi Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT (Mobile Friendly) */}
      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <FileSpreadsheet size={18} className="text-blue-600" /> Import CSV
              </h3>
              <button onClick={() => { setShowImportModal(false); setSelectedTable(''); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[85vh]">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block tracking-widest">Pilih Tabel Tujuan</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                  onChange={(e) => setSelectedTable(e.target.value)}
                  value={selectedTable}
                >
                  <option value="">-- Pilih Database --</option>
                  {Object.keys(TABLE_GUIDE).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {selectedTable && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-amber-800 mb-2">
                      <Info size={14} />
                      <span className="text-[10px] font-bold uppercase">Panduan Header CSV</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TABLE_GUIDE[selectedTable].map(h => (
                        <span key={h} className="px-2 py-1 bg-white/50 text-slate-700 rounded border border-amber-200 font-bold uppercase text-[9px]">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  <label className="w-full flex flex-col items-center justify-center py-10 border-2 border-dashed border-blue-200 bg-blue-50/20 rounded-2xl hover:bg-blue-50 cursor-pointer transition-all">
                    <Upload size={32} className="text-blue-500 mb-3 animate-bounce" />
                    <span className="text-xs font-bold text-slate-600 text-center px-4">Klik untuk pilih file CSV</span>
                    <input 
                      type="file" 
                      accept=".csv" 
                      className="hidden" 
                      onChange={(e) => e.target.files?.[0] && processImport(e.target.files[0])} 
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}