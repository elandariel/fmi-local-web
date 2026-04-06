'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { 
  Search, Plus, Filter, ChevronLeft, ChevronRight, 
  Users, Signal, Trash2, Edit, MapPin, Download, FileSpreadsheet, FileText
} from 'lucide-react';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';

export default function ClientListPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [exportLoading, setExportLoading] = useState<'excel' | 'pdf' | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const ITEMS_PER_PAGE = 10;

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

    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('Data Client Corporate').select('*', { count: 'exact' });
    if (search) {
      query = query.or(`"Nama Pelanggan".ilike.%${search}%,"ID Pelanggan".ilike.%${search}%`);
    }

    const { data, count, error } = await query.order('id', { ascending: false }).range(from, to);
    if (!error) {
      setClients(data || []);
      setTotalRecords(count || 0);
      setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
    }
    setLoading(false);
  }

  // Fetch ALL data (no pagination) for export
  async function fetchAllData(): Promise<any[]> {
    let query = supabase.from('Data Client Corporate').select('*');
    if (search) {
      query = query.or(`"Nama Pelanggan".ilike.%${search}%,"ID Pelanggan".ilike.%${search}%`);
    }
    const { data, error } = await query.order('id', { ascending: false });
    if (error) return [];
    return data || [];
  }

  // ── EXPORT TO EXCEL ──
  async function handleExportExcel() {
    setExportLoading('excel');
    try {
      const allData = await fetchAllData();

      // Dynamically import xlsx (SheetJS)
      const XLSX = await import('xlsx');

      const rows = allData.map((c) => ({
        'ID Pelanggan': c['ID Pelanggan'] || '',
        'Nama Pelanggan': c['Nama Pelanggan'] || '',
        'Alamat': c['ALAMAT'] || '',
        'Kapasitas': c['Kapasitas'] || '',
        'Status': c['STATUS'] || '',
        'RX ONT/SFP': c['RX ONT/SFP'] || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      // Column widths
      ws['!cols'] = [
        { wch: 16 }, { wch: 36 }, { wch: 46 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data Client');

      const filename = `data-client${search ? `-${search}` : ''}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Export Excel error:', err);
      alert('Gagal export Excel. Pastikan library xlsx tersedia.');
    } finally {
      setExportLoading(null);
    }
  }

  // ── EXPORT TO PDF ──
  async function handleExportPdf() {
    setExportLoading('pdf');
    try {
      const allData = await fetchAllData();

      // Dynamically import jsPDF + autoTable
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Client Corporate', 14, 16);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`Diekspor: ${new Date().toLocaleString('id-ID')}  |  Total: ${allData.length} pelanggan`, 14, 23);
      if (search) doc.text(`Filter: "${search}"`, 14, 29);

      doc.setTextColor(0);

      const tableRows = allData.map((c) => [
        c['ID Pelanggan'] || '—',
        c['Nama Pelanggan'] || '—',
        c['ALAMAT'] ? c['ALAMAT'].substring(0, 50) + (c['ALAMAT'].length > 50 ? '…' : '') : '—',
        c['Kapasitas'] || '—',
        c['STATUS'] || '—',
        c['RX ONT/SFP'] || '—',
      ]);

      autoTable(doc, {
        startY: search ? 33 : 28,
        head: [['ID Pelanggan', 'Nama Pelanggan', 'Alamat', 'Kapasitas', 'Status', 'RX ONT/SFP']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 52 },
          2: { cellWidth: 80 },
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
          5: { cellWidth: 22 },
        },
        didDrawCell: (data: any) => {
          // Highlight status cells
          if (data.section === 'body' && data.column.index === 4) {
            const status = (data.cell.raw || '').toString().toLowerCase();
            if (status.includes('active') || status.includes('ok')) {
              doc.setFillColor(236, 253, 245);
            } else if (status.includes('suspend') || status.includes('isolir')) {
              doc.setFillColor(255, 241, 242);
            }
          }
        },
      });

      const filename = `data-client${search ? `-${search}` : ''}-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Export PDF error:', err);
      alert('Gagal export PDF. Pastikan library jspdf & jspdf-autotable tersedia.');
    } finally {
      setExportLoading(null);
    }
  }

  useEffect(() => { fetchData(); }, [page, search]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const canAdd = hasAccess(userRole, PERMISSIONS.CLIENT_ADD);
  const canEditDelete = hasAccess(userRole, PERMISSIONS.CLIENT_EDIT_DELETE);

  const rangeFrom = totalRecords === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const rangeTo = Math.min(page * ITEMS_PER_PAGE, totalRecords);

  return (
    <div className="p-6 md:p-8 min-h-screen" style={{ background: '#f4f6f9', fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Users size={20} />
            </div>
            Data Client
          </h1>
          <p className="text-sm text-slate-400 mt-1 ml-0.5">Database pelanggan aktif &amp; teknis</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={exportLoading !== null || loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg font-semibold text-sm shadow-sm transition-colors"
            title="Export ke Excel"
          >
            {exportLoading === 'excel' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet size={15} />
            )}
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPdf}
            disabled={exportLoading !== null || loading}
            className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg font-semibold text-sm shadow-sm transition-colors"
            title="Export ke PDF"
          >
            {exportLoading === 'pdf' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileText size={15} />
            )}
            <span className="hidden sm:inline">PDF</span>
          </button>

          {canAdd && (
            <Link href="/clients/create">
              <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-sm transition-colors">
                <Plus size={16} />
                Client Baru
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ── SEARCH & FILTER BAR ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5 flex flex-col md:flex-row justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Cari nama / ID pelanggan..."
            value={search}
            onChange={handleSearch}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-slate-700 bg-slate-50 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Export hint when filter active */}
          {search && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Download size={11} />
              Export akan menggunakan filter aktif
            </p>
          )}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
            <Filter size={13} className="text-slate-400" />
            <span>Total: <span className="text-slate-800 font-bold">{totalRecords}</span> Pelanggan</span>
          </div>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#f8fafc' }}>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">ID</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nama Pelanggan</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kapasitas</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Redaman</th>
                <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3.5"><div className="h-3.5 bg-slate-100 rounded animate-pulse w-12" /></td>
                    <td className="px-5 py-3.5">
                      <div className="h-3.5 bg-slate-100 rounded animate-pulse w-44 mb-1.5" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-28" />
                    </td>
                    <td className="px-5 py-3.5"><div className="h-3.5 bg-slate-100 rounded animate-pulse w-20" /></td>
                    <td className="px-5 py-3.5 text-center"><div className="h-5 bg-slate-100 rounded-full animate-pulse w-16 mx-auto" /></td>
                    <td className="px-5 py-3.5 text-center"><div className="h-3.5 bg-slate-100 rounded animate-pulse w-14 mx-auto" /></td>
                    <td className="px-5 py-3.5 text-center"><div className="h-7 bg-slate-100 rounded animate-pulse w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : clients.length > 0 ? (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-blue-50/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        #{client['ID Pelanggan']}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800 text-[13px]">{client['Nama Pelanggan']}</p>
                      {client['ALAMAT'] && (
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={10} className="shrink-0" />
                          {client['ALAMAT'].substring(0, 35)}{client['ALAMAT'].length > 35 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
                        {client['Kapasitas'] || 'Default'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={client['STATUS']} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <SignalIndicator value={client['RX ONT/SFP']} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex justify-center items-center gap-1">
                        <Link href={`/clients/${client.id}`}>
                          <button className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all">
                            Detail <ChevronRight size={13} />
                          </button>
                        </Link>
                        {canEditDelete && (
                          <>
                            <button className="p-1.5 text-amber-500 hover:bg-amber-50 hover:border-amber-200 border border-transparent rounded-md transition-all" title="Edit">
                              <Edit size={13} />
                            </button>
                            <button className="p-1.5 text-rose-500 hover:bg-rose-50 hover:border-rose-200 border border-transparent rounded-md transition-all" title="Hapus">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Users size={32} className="opacity-30" />
                      <p className="text-sm font-medium">Tidak ada data ditemukan</p>
                      {search && <p className="text-xs">Coba kata kunci lain</p>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-xs text-slate-400 font-medium">
            {totalRecords > 0
              ? <>Menampilkan <span className="text-slate-600 font-semibold">{rangeFrom}–{rangeTo}</span> dari <span className="text-slate-600 font-semibold">{totalRecords}</span> data</>
              : 'Tidak ada data'
            }
          </p>

          <div className="flex items-center gap-2">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            <span className="text-xs text-slate-500 font-medium px-1">
              {page} / {totalPages}
            </span>

            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── STATUS BADGE ──
function StatusBadge({ status }: any) {
  const s = (status || '').toLowerCase();
  let style = 'bg-slate-100 text-slate-500 border-slate-200';
  if (s.includes('active') || s.includes('ok')) style = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('suspend') || s.includes('isolir')) style = 'bg-rose-50 text-rose-700 border-rose-200';
  if (s.includes('dismantle')) style = 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${style}`}>
      {status || 'Unknown'}
    </span>
  );
}

// ── SIGNAL INDICATOR ──
function SignalIndicator({ value }: any) {
  const val = parseFloat(value);
  if (!value || isNaN(val)) return <span className="text-slate-300 text-xs">—</span>;

  let colorClass = 'text-emerald-600';
  if (val < -27) colorClass = 'text-rose-500';
  else if (val < -24) colorClass = 'text-amber-500';

  return (
    <div className={`inline-flex items-center justify-center gap-1 font-mono text-xs font-bold ${colorClass}`}>
      <Signal size={12} />
      {value}
    </div>
  );
}