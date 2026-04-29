'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Download, X, FileSpreadsheet,
  Info, FileText, Table, Search, Loader2,
  User, Database, Server, TrendingUp, ClipboardList,
  Network, Command, ChevronRight, Moon, Sun
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
import { NotificationBell } from './NotificationBell';

// ── TIPE ────────────────────────────────────────────────────
interface SearchResult {
  type: string;
  icon: React.ReactNode;
  label: string;
  subLabel?: string;
  detail?: string;
  link: string;
  color: string;
}

// ── KONFIGURASI ─────────────────────────────────────────────
const TABLE_GUIDE: Record<string, string[]> = {
  'Report Bulanan': ['TANGGAL','SUBJECT WO','STATUS','JENIS WO','KETERANGAN','SELESAI ACTION','NAMA TEAM'],
  'Berlangganan 2026': ['TANGGAL','SUBJECT BERLANGGANAN','PROBLEM','TEAM','STATUS','BTS','DEVICE','ISP'],
  'Berhenti Berlangganan 2026': ['TANGGAL','SUBJECT BERHENTI BERLANGGANAN','PROBLEM','TEAM','STATUS','BTS','DEVICE','ISP','REASON'],
  'Berhenti Sementara 2026': ['TANGGAL','SUBJECT BERHENTI SEMENTARA','PROBLEM','TEAM','STATUS','BTS','DEVICE','ISP','REASON'],
  'Upgrade 2026': ['TANGGAL','SUBJECT UPGRADE','PROBLEM','TEAM','STATUS','BTS','DEVICE','ISP','REASON'],
  'Downgrade 2026': ['TANGGAL','SUBJECT DOWNGRADE','PROBLEM','TEAM','STATUS','BTS','DEVICE','ISP','REASON'],
  'Data Client Corporate': ['ID PELANGGAN','NAMA PELANGGAN','LAYANAN','KAPASITAS','STATUS','REDAMAN'],
  'VLAN Database': ['VLAN ID','NAMA VLAN','IP GATEWAY','INTERFACE','KETERANGAN'],
};

const RESULT_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'Client':      { color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  'Work Order':  { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  'VLAN':        { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  'Tracker':     { color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  'Interkoneksi':{ color: '#155e75', bg: '#ecfeff', border: '#a5f3fc' },
};

// ── DEBOUNCE HOOK ────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── KOMPONEN UTAMA ───────────────────────────────────────────
export default function Header({
  theme = 'dark',
  onToggleTheme,
}: {
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}) {
  const [mounted, setMounted]           = useState(false);
  const [time, setTime]                 = useState(new Date());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedTable, setSelectedTable]     = useState('');
  const [exportConfig, setExportConfig]       = useState({ table: '', format: '' });

  // Search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [showResults, setShowResults]     = useState(false);
  const [activeIdx, setActiveIdx]         = useState(-1);
  const searchRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(searchQuery, 280);

  const pathname = usePathname();
  const router   = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // ── INIT ──────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);

    // Shortcut Cmd/Ctrl+K
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowResults(true);
      }
      if (e.key === 'Escape') {
        setShowResults(false);
        setActiveIdx(-1);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      clearInterval(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // ── GLOBAL SEARCH ─────────────────────────────────────────
  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    setActiveIdx(-1);

    try {
      const q = query.trim();

      // 1. Data Client — link langsung ke halaman detail client
      const { data: clients } = await supabase
        .from('Data Client Corporate')
        .select('id, "Nama Pelanggan", "ID Pelanggan", "STATUS"')
        .or(`"Nama Pelanggan".ilike.%${q}%,"ID Pelanggan".ilike.%${q}%`)
        .limit(4);

      // 2. Work Order — link langsung ke detail WO
      const { data: wos } = await supabase
        .from('Report Bulanan')
        .select('id, "SUBJECT WO", TANGGAL, STATUS')
        .ilike('"SUBJECT WO"', `%${q}%`)
        .limit(4);

      // 3. Tracker — semua 5 tabel, langsung ke halaman tracker dengan tab aktif
      const trackerTables = [
        { table: 'Berlangganan 2026',         col: 'SUBJECT BERLANGGANAN',         cat: 'Berlangganan' },
        { table: 'Berhenti Berlangganan 2026', col: 'SUBJECT BERHENTI BERLANGGANAN', cat: 'Berhenti Berlangganan' },
        { table: 'Berhenti Sementara 2026',    col: 'SUBJECT BERHENTI SEMENTARA',    cat: 'Berhenti Sementara' },
        { table: 'Upgrade 2026',               col: 'SUBJECT UPGRADE',               cat: 'Upgrade' },
        { table: 'Downgrade 2026',             col: 'SUBJECT DOWNGRADE',             cat: 'Downgrade' },
      ];
      const trackerResults = await Promise.all(
        trackerTables.map(({ table, col, cat }) =>
          supabase.from(table).select(`id, "${col}", TANGGAL, ISP`).ilike(`"${col}"`, `%${q}%`).limit(2)
            .then(res => (res.data || []).map(r => ({ ...r, _col: col, _cat: cat })))
        )
      );
      const trackerFlat = trackerResults.flat().slice(0, 4);

      // 4. VLAN — semua tabel VLAN
      const vlanTables = ['Daftar Vlan 1-1000','Daftar Vlan 1000+','Daftar Vlan 2000+','Daftar Vlan 3000+','Daftar Vlan 3500+'];
      const isNumeric = !isNaN(Number(q)) && q.length > 0;
      const vlanResults = await Promise.all(
        vlanTables.map(t => {
          let qb = supabase.from(t).select('VLAN, NAME');
          qb = isNumeric
            ? qb.or(`NAME.ilike.%${q}%,VLAN.eq.${q}`)
            : qb.ilike('NAME', `%${q}%`);
          return qb.limit(2).then(r => (r.data || []).map(d => ({ ...d, _table: t })));
        })
      );
      const vlanFlat = vlanResults.flat().filter(v => v.NAME && v.NAME !== 'AVAILABLE' && v.NAME !== '-').slice(0, 4);

      // 5. Interkoneksi
      const { data: interkon } = await supabase
        .from('Data Interkoneksi')
        .select('id, NAMA, KETERANGAN')
        .ilike('NAMA', `%${q}%`)
        .limit(3);

      // ── Gabungkan hasil ──────────────────────────────────
      const combined: SearchResult[] = [
        ...(clients || []).map(i => ({
          type: 'Client',
          icon: <User size={13} />,
          label: i['Nama Pelanggan'] || '—',
          subLabel: i['ID Pelanggan'] || '',
          detail: i['STATUS'] || '',
          link: `/clients/${i.id}`,
          color: 'Client',
        })),
        ...(wos || []).map(i => ({
          type: 'Work Order',
          icon: <ClipboardList size={13} />,
          label: i['SUBJECT WO'] || '—',
          subLabel: i['TANGGAL'] || '',
          detail: i['STATUS'] || '',
          link: `/work-orders/${i.id}`,
          color: 'Work Order',
        })),
        ...trackerFlat.map(i => ({
          type: 'Tracker',
          icon: <TrendingUp size={13} />,
          label: i[i._col] || '—',
          subLabel: i._cat,
          detail: i.ISP || '',
          link: `/tracker`,
          color: 'Tracker',
        })),
        ...vlanFlat.map(i => ({
          type: 'VLAN',
          icon: <Server size={13} />,
          label: i['NAME'] || '—',
          subLabel: `VLAN ${i['VLAN']}`,
          detail: i._table,
          link: `/vlan`,
          color: 'VLAN',
        })),
        ...(interkon || []).map(i => ({
          type: 'Interkoneksi',
          icon: <Network size={13} />,
          label: i['NAMA'] || '—',
          subLabel: i['KETERANGAN'] || '',
          link: `/interkoneksi`,
          color: 'Interkoneksi',
        })),
      ];

      setSearchResults(combined);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery]);

  // Keyboard nav di dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, searchResults.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const r = searchResults[activeIdx];
      router.push(r.link);
      setShowResults(false);
      setSearchQuery('');
    }
  };

  // ── EXPORT ────────────────────────────────────────────────
  const handleProcessExport = async () => {
    const { table, format: fileFormat } = exportConfig;
    if (!table || !fileFormat) return toast.error('Pilih data dan format export!');
    const loadingToast = toast.loading(`Menyiapkan data ${table}...`);
    try {
      const { data, error } = await supabase.from(table).select('*');
      toast.dismiss(loadingToast);
      if (error || !data || data.length === 0) return toast.error('Gagal mengambil data atau data kosong');
      const fileName = `${table}_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      if (fileFormat === 'CSV') {
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${fileName}.csv`);
        link.click();
      } else if (fileFormat === 'EXCEL') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else if (fileFormat === 'PDF') {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(14);
        doc.text(`NOC FMI - ${table}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 14, 20);
        const headers = Object.keys(data[0]);
        const rows = data.map((item: any) => Object.values(item));
        autoTable(doc, { head: [headers], body: rows, startY: 25, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [37, 99, 235] } });
        doc.save(`${fileName}.pdf`);
      }
      toast.success(`Berhasil export ${table} ke ${fileFormat}`);
      setShowExportModal(false);
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Terjadi kesalahan saat export');
    }
  };

  // ── IMPORT ────────────────────────────────────────────────
  const processImport = (file: File) => {
    if (!selectedTable) return toast.error('Pilih tabel tujuan terlebih dahulu');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data.length === 0) return toast.error('File CSV kosong');
        const csvHeaders = Object.keys(results.data[0] || {});
        const requiredHeaders = TABLE_GUIDE[selectedTable];
        const missingHeaders = requiredHeaders.filter(h => !csvHeaders.includes(h));
        if (missingHeaders.length > 0) return toast.error(`Kolom hilang: ${missingHeaders.join(', ')}`, { duration: 5000 });
        const { error } = await supabase.from(selectedTable).insert(results.data);
        if (error) toast.error('Gagal Import: ' + error.message);
        else {
          toast.success(`Berhasil import ${results.data.length} data ke ${selectedTable}`);
          setShowImportModal(false);
          setSelectedTable('');
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  if (!mounted) return null;

  return (
    <>
    <header
      className="header-root sticky top-0 z-40 w-full"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="flex items-center gap-3 px-4 md:px-5 h-[60px]">

        {/* ── KIRI: SEARCH ───────────────────────────────── */}
        <div className="flex-1 max-w-xl pl-10 md:pl-0" ref={searchRef}>
          <div className="relative">
            {/* Search icon / loading */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
              {isSearching
                ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                : <Search size={14} />
              }
            </div>

            <input
              ref={inputRef}
              type="text"
              placeholder="Cari client, WO, VLAN, tracker..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-xl py-2 pl-9 pr-20 text-xs outline-none transition-all"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
              onFocusCapture={e => {
                e.currentTarget.style.borderColor = 'var(--accent-mid)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-bg)';
              }}
              onBlurCapture={e => {
                e.currentTarget.style.borderColor = 'var(--border-mid)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            {/* Shortcut hint / clear */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {searchQuery ? (
                <button onClick={clearSearch} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              ) : (
                <kbd
                  className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-mid)', color: 'var(--text-muted)' }}
                >
                  <Command size={8} />K
                </kbd>
              )}
            </div>
          </div>

          {/* ── HASIL SEARCH ──────────────────────────────── */}
          {showResults && (
            <div
              className="modal-enter absolute left-0 top-full mt-2 w-full max-w-xl rounded-2xl overflow-hidden z-50"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-mid)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {searchResults.length === 0 && !isSearching ? (
                <div className="px-4 py-10 text-center">
                  <Search size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Tidak ada hasil untuk{' '}
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>"{searchQuery}"</span>
                  </p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
                  {(['Client','Work Order','Tracker','VLAN','Interkoneksi'] as const).map(type => {
                    const items = searchResults.filter(r => r.type === type);
                    if (items.length === 0) return null;
                    const cfg = RESULT_TYPE_CONFIG[type];
                    return (
                      <div key={type}>
                        {/* Group header */}
                        <div
                          className="px-3 py-1.5"
                          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-light)' }}
                        >
                          <span
                            className="text-[9px] font-bold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}
                          >{type}</span>
                        </div>
                        {items.map((result, idx) => {
                          const globalIdx = searchResults.indexOf(result);
                          const isActive = globalIdx === activeIdx;
                          return (
                            <button
                              key={idx}
                              onClick={() => { router.push(result.link); setShowResults(false); setSearchQuery(''); }}
                              onMouseEnter={() => setActiveIdx(globalIdx)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                              style={{
                                borderBottom: '1px solid var(--border-light)',
                                background: isActive ? 'var(--accent-bg)' : 'transparent',
                              }}
                            >
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                              >
                                {result.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{result.label}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {result.subLabel && (
                                    <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{result.subLabel}</span>
                                  )}
                                  {result.detail && (
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                                    >
                                      {result.detail}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight size={12} className="shrink-0" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer hint */}
              {searchResults.length > 0 && (
                <div
                  className="px-3 py-2 flex items-center gap-3 text-[9px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-light)', color: 'var(--text-muted)' }}
                >
                  {['↑↓ Navigasi', 'Enter Buka', 'Esc Tutup'].map(hint => (
                    <span key={hint} className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-mid)' }}>
                        {hint.split(' ')[0]}
                      </kbd>
                      {hint.split(' ').slice(1).join(' ')}
                    </span>
                  ))}
                  <span className="ml-auto">{searchResults.length} hasil</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── KANAN: ACTIONS ─────────────────────────────── */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">

          {/* Import */}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-mid)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--success)'; e.currentTarget.style.background = 'var(--success-bg)'; e.currentTarget.style.borderColor = 'rgba(52,211,153,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
          >
            <Upload size={13} />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Export */}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-mid)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
          >
            <Download size={13} />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border-mid)' }} />

          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl transition-all"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-mid)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Notification bell */}
          <NotificationBell />

          {/* Clock — desktop only */}
          <div
            className="hidden lg:flex flex-col items-end pl-3 ml-1"
            style={{ borderLeft: '1px solid var(--border-mid)' }}
          >
            <p
              className="text-sm font-bold leading-none tabular-nums"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}
            >
              {format(time, 'HH:mm:ss')}
            </p>
            <p className="text-[9px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {format(time, 'dd MMM yyyy', { locale: indonesia })}
            </p>
          </div>
        </div>
      </div>
    </header>

      {/* ── MODAL EXPORT ─── rendered outside <header> to escape stacking context ── */}
      {showExportModal && (
        <div className="modal-overlay fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="modal-slide-up md:modal-enter w-full max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-mid)' }}>
            <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}>
              <h3 className="font-bold flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                <Download size={16} style={{ color: 'var(--accent)' }} /> Export Database
              </h3>
              <button onClick={() => setShowExportModal(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              ><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase block mb-1.5 tracking-wider" style={{ color: 'var(--text-muted)' }}>Pilih Data</label>
                <select
                  className="w-full p-2.5 rounded-xl text-xs font-semibold outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  onChange={e => setExportConfig({ ...exportConfig, table: e.target.value })}
                  value={exportConfig.table}
                >
                  <option value="">— Pilih tabel —</option>
                  {Object.keys(TABLE_GUIDE).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase block mb-1.5 tracking-wider" style={{ color: 'var(--text-muted)' }}>Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {['CSV','EXCEL','PDF'].map(f => (
                    <button
                      key={f}
                      onClick={() => setExportConfig({ ...exportConfig, format: f })}
                      className="p-3 rounded-xl text-[10px] font-bold transition-all flex flex-col items-center gap-1.5"
                      style={exportConfig.format === f
                        ? { background: 'linear-gradient(135deg, var(--accent-mid), var(--accent-deep))', color: 'white', border: '1px solid var(--accent-mid)', boxShadow: '0 2px 12px var(--accent-glow)' }
                        : { background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-secondary)' }
                      }
                    >
                      {f === 'PDF' ? <FileText size={15} /> : f === 'EXCEL' ? <FileSpreadsheet size={15} /> : <Table size={15} />}
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleProcessExport}
                className="btn btn-primary w-full justify-center py-3 text-xs uppercase tracking-wider"
              >
                <Download size={15} /> Eksekusi Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL IMPORT ───────────────────────────────────── */}
      {showImportModal && (
        <div className="modal-overlay fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="modal-slide-up md:modal-enter w-full max-w-lg rounded-t-2xl md:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-mid)' }}>
            <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-elevated)' }}>
              <h3 className="font-bold flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                <FileSpreadsheet size={16} style={{ color: 'var(--accent)' }} /> Import CSV
              </h3>
              <button onClick={() => { setShowImportModal(false); setSelectedTable(''); }} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase block mb-1.5 tracking-wider" style={{ color: 'var(--text-muted)' }}>Tabel Tujuan</label>
                <select
                  className="w-full p-2.5 rounded-xl text-xs font-semibold outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  onChange={e => setSelectedTable(e.target.value)}
                  value={selectedTable}
                >
                  <option value="">— Pilih database —</option>
                  {Object.keys(TABLE_GUIDE).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {selectedTable && (
                <div className="space-y-3">
                  <div className="rounded-xl p-3.5" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(251,191,36,0.25)' }}>
                    <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--warning)' }}>
                      <Info size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Header CSV yang dibutuhkan</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {TABLE_GUIDE[selectedTable].map(h => (
                        <span key={h} className="px-2 py-0.5 rounded font-mono text-[9px]"
                          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' }}
                        >{h}</span>
                      ))}
                    </div>
                  </div>

                  <label
                    className="w-full flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all"
                    style={{ border: '2px dashed var(--accent-border)', background: 'var(--accent-bg)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent-bg)')}
                  >
                    <Upload size={24} className="mb-2" style={{ color: 'var(--accent)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Klik untuk pilih file CSV</span>
                    <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Format: .csv</span>
                    <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && processImport(e.target.files[0])} />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}