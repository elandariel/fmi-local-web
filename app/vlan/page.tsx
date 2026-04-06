'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Search, RefreshCcw, Server, Database, Filter, 
  Edit, Save, Trash2, X, AlertCircle, CheckCircle, Router, ShieldCheck, AlertTriangle, 
  ChevronLeft, ChevronRight, Share2 // Tambah icon Share2 untuk sync
} from 'lucide-react';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { toast } from 'sonner';

const VLAN_TABLES = [
  { name: 'VLAN 1-1000', table: 'Daftar Vlan 1-1000' },
  { name: 'VLAN 1000+', table: 'Daftar Vlan 1000+' },
  { name: 'VLAN 2000+', table: 'Daftar Vlan 2000+' },
  { name: 'VLAN 3000+', table: 'Daftar Vlan 3000+' },
  { name: 'VLAN 3500+', table: 'Daftar Vlan 3500+' },
];

export default function VlanPage() {
  const [selectedTable, setSelectedTable] = useState(VLAN_TABLES[0]);
  const [vlanList, setVlanList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // State baru untuk loading sync
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<Role | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; 

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVlan, setEditingVlan] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const [stats, setStats] = useState({ total: 0, used: 0, free: 0 });

  // --- FUNGSI SYNC KE GOOGLE SHEETS ---
  const handleSyncToSheets = async () => {
  setIsSyncing(true);
  const syncToast = toast.loading("Menyelaraskan data ke Spreadsheet...");
  
  try {
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwfOmI847h1PFaaO6FBJ52SLCORyOmIalhkVxcb_W0jYI9J31-jAY03CoQzcZ0DZxDP/exec";
    
    // 2. Siapkan Payload (Data yang dikirim)
    const payload = {
      spreadsheetId: "1kojKLgb04yCirdTfRcb3C_1xqkKs8N68bmzuz0-4-N4",
      sheetName: selectedTable.table, 
      rows: vlanList
    };

    // 3. Eksekusi Request POST
    // Kita gunakan Content-Type text/plain untuk menghindari pre-flight CORS yang ribet di Google Apps Script
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', 
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(payload),
    });

    // Karena mode 'no-cors', kita tidak bisa baca response body secara teknis, 
    // tapi jika tidak masuk ke catch, artinya request berhasil terkirim.
    toast.success("Sync Terkirim! Cek Spreadsheet dalam beberapa detik.", { id: syncToast });
    
  } catch (error) {
    console.error("Sync Error:", error);
    toast.error("Gagal mengirim data ke Google Sheets.", { id: syncToast });
  } finally {
    setIsSyncing(false);
  }
};

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if(profile) setUserRole(profile.role as Role);
    }

    const { data, error } = await supabase
      .from(selectedTable.table).select('*').order('VLAN', { ascending: true });

    if (error) {
      console.error('Error fetching VLAN:', error);
      toast.error("Gagal memuat data VLAN");
    } else {
      setVlanList(data || []);
      calculateStats(data || []);
    }
    setLoading(false);
  }

  const calculateStats = (data: any[]) => {
    const total = data.length;
    const used = data.filter(r => {
      const name = (r.NAME || '').toUpperCase();
      return name && name !== '-' && name !== 'AVAILABLE' && name !== '';
    }).length;
    const free = total - used;
    setStats({ total, used, free });
  };

  useEffect(() => {
    fetchData();
    setCurrentPage(1); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  const filteredVlan = vlanList.filter(item => {
    const s = search.toLowerCase();
    const vlanID = item.VLAN?.toString() || '';
    const name = item.NAME?.toLowerCase() || '';
    const service = item['SERVICE ID']?.toLowerCase() || '';
    return vlanID.includes(s) || name.includes(s) || service.includes(s);
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filteredVlan.length / itemsPerPage);
  const paginatedData = filteredVlan.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleEditClick = (vlanItem: any) => {
    setEditingVlan({ ...vlanItem }); 
    setIsModalOpen(true);
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingVlan({ ...editingVlan, [e.target.name]: e.target.value });
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    const matchQuery = editingVlan.id ? { id: editingVlan.id } : { VLAN: editingVlan.VLAN };

    const { error } = await supabase
      .from(selectedTable.table)
      .update({
        'NAME': editingVlan.NAME,
        'SERVICE ID': editingVlan['SERVICE ID'],
        'NE_SWITCH POP': editingVlan['NE_SWITCH POP'],
        'NE_PORT': editingVlan['NE_PORT'],
        'NE_MODE': editingVlan['NE_MODE'],
        'FE_SWITCH POP': editingVlan['FE_SWITCH POP'],
        'FE_PORT': editingVlan['FE_PORT'],
        'FE_MODE': editingVlan['FE_MODE']
      })
      .match(matchQuery); 

    if (error) {
      toast.error('Gagal update: ' + error.message);
    } else {
      toast.success('Data VLAN Berhasil Diupdate!');
      setIsModalOpen(false);
      fetchData(); 
    }
    setIsSaving(false);
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const executeResetVlan = async () => {
    setIsSaving(true);
    setShowResetConfirm(false);
    
    const matchQuery = editingVlan.id ? { id: editingVlan.id } : { VLAN: editingVlan.VLAN };

    const { error } = await supabase
      .from(selectedTable.table)
      .update({
        'NAME': 'AVAILABLE',
        'SERVICE ID': '-',
        'NE_SWITCH POP': '-', 'NE_PORT': '-', 'NE_MODE': '-',
        'FE_SWITCH POP': '-', 'FE_PORT': '-', 'FE_MODE': '-'
      })
      .match(matchQuery);

    if (error) {
      toast.error('Gagal reset: ' + error.message);
    } else {
      toast.success(`VLAN ${editingVlan.VLAN} Berhasil Dikosongkan!`);
      setIsModalOpen(false);
      fetchData();
    }
    setIsSaving(false);
  };

  const canEditDelete = hasAccess(userRole, PERMISSIONS.VLAN_EDIT_DELETE);

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans relative">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Server className="text-blue-600" /> Database VLan
          </h1>
          <p className="text-sm text-slate-500">Database alokasi VLAN & IP Network</p>
        </div>

        <div className="flex gap-2">
           {/* TOMBOL SYNC SHEETS (BARU) */}
           <button 
            onClick={handleSyncToSheets} 
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-sm transition-all disabled:opacity-50"
           >
            <Share2 size={16} className={isSyncing ? 'animate-pulse' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Sheets'}
           </button>

           <div className="relative">
             <select 
              className="appearance-none bg-white border border-slate-300 text-slate-700 py-2 pl-4 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 font-medium text-sm"
              value={selectedTable.name}
              onChange={(e) => setSelectedTable(VLAN_TABLES.find(t => t.name === e.target.value) || VLAN_TABLES[0])}
             >
               {VLAN_TABLES.map((t, idx) => (
                 <option key={idx} value={t.name}>{t.name}</option>
               ))}
             </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
               <Filter size={14} />
             </div>
           </div>
           
           <button onClick={fetchData} className="p-2 bg-white border rounded-lg hover:bg-slate-50 text-slate-600 shadow-sm">
            <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* STATISTIK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500 flex justify-between items-center">
          <div><p className="text-xs font-bold text-slate-800 uppercase">Total VLAN</p><h3 className="text-2xl font-bold text-slate-800">{stats.total}</h3></div>
          <Database className="text-blue-100" size={32} />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-rose-500 flex justify-between items-center">
          <div><p className="text-xs font-bold text-slate-800 uppercase">Terpakai (Used)</p><h3 className="text-2xl font-bold text-rose-600">{stats.used}</h3></div>
          <AlertCircle className="text-rose-100" size={32} />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-emerald-500 flex justify-between items-center">
          <div><p className="text-xs font-bold text-slate-800 uppercase">Tersedia (Free)</p><h3 className="text-2xl font-bold text-emerald-600">{stats.free}</h3></div>
          <CheckCircle className="text-emerald-100" size={32} />
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari VLAN ID / Nama Customer..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg w-full text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
          </div>
          
          <div className="text-xs text-slate-500 font-bold flex items-center gap-2">
             <span>Page {currentPage} of {totalPages || 1}</span>
             <div className="flex gap-1">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 hover:bg-slate-200 rounded disabled:opacity-50"
                >
                  <ChevronLeft size={16}/>
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1 hover:bg-slate-200 rounded disabled:opacity-50"
                >
                  <ChevronRight size={16}/>
                </button>
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
              <tr>
                <th className="px-6 py-3 border-b text-center w-24 sticky left-0 bg-slate-100 z-10 shadow-sm">Status</th>
                <th className="px-6 py-3 border-b w-20">VLAN ID</th>
                <th className="px-6 py-3 border-b min-w-[200px]">Customer Name</th>
                <th className="px-6 py-3 border-b">Service ID</th>
                <th className="px-6 py-3 border-b bg-blue-50/50 text-blue-700 min-w-[150px]">Near End</th>
                <th className="px-6 py-3 border-b bg-blue-50/50 text-blue-700">NE Port</th>
                <th className="px-6 py-3 border-b bg-blue-50/50 text-blue-700">NE Mode</th>
                <th className="px-6 py-3 border-b bg-purple-50/50 text-purple-700 min-w-[150px]">Far End</th>
                <th className="px-6 py-3 border-b bg-purple-50/50 text-purple-700">FE Port</th>
                <th className="px-6 py-3 border-b bg-purple-50/50 text-purple-700">FE Mode</th>
                <th className="px-6 py-3 border-b text-center sticky right-0 bg-slate-100 z-10 shadow-sm">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={11} className="p-8 text-center text-slate-500">Memuat data VLAN...</td></tr>
              ) : paginatedData.length > 0 ? (
                paginatedData.map((v, index) => {
                  const name = (v.NAME || '').toUpperCase();
                  const isUsed = name && name !== '-' && name !== 'AVAILABLE' && name !== '';
                  
                  return (
                    <tr key={v.VLAN || index} className={`hover:bg-slate-50 transition-colors ${!isUsed ? 'bg-emerald-50/20' : ''}`}>
                      <td className="px-6 py-3 text-center sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {isUsed ? 
                          <span className="px-2 py-1 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 uppercase">USED</span> : 
                          <span className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">FREE</span>
                        }
                      </td>
                      <td className="px-6 py-3 font-mono font-bold text-blue-700 text-base">{v.VLAN}</td>
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {v.NAME || <span className="text-slate-400 italic">AVAILABLE</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-500 text-xs">{v['SERVICE ID'] || '-'}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-blue-50/20">{v['NE_SWITCH POP']}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-blue-50/20">{v['NE_PORT']}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-blue-50/20">{v['NE_MODE']}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-purple-50/20">{v['FE_SWITCH POP']}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-purple-50/20">{v['FE_PORT']}</td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono bg-purple-50/20">{v['FE_MODE']}</td>
                      <td className="px-6 py-3 text-center sticky right-0 bg-white z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {canEditDelete ? (
                          <button onClick={() => handleEditClick(v)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit Detail">
                            <Edit size={16} />
                          </button>
                        ) : (
                          <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-400 font-bold border border-slate-200 flex items-center justify-center gap-1 w-fit mx-auto cursor-not-allowed">
                            <ShieldCheck size={12}/> View Only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={11} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-center">
            <div className="flex items-center gap-4 text-sm font-bold text-slate-600">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <span>Page {currentPage} of {totalPages || 1}</span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
            </div>
        </div>

      </div>

      {/* --- MODAL EDIT VLAN (Z-Index 50) --- */}
      {isModalOpen && editingVlan && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit size={18} /> Edit VLAN {editingVlan.VLAN}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-700 p-1 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">Informasi Layanan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Customer Name</label>
                    <input type="text" name="NAME" value={editingVlan.NAME || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Service ID</label>
                    <input type="text" name="SERVICE ID" value={editingVlan['SERVICE ID'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                    <Server size={14} className="text-blue-600"/>
                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Near End (POP Side)</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Switch Name</label>
                    <input type="text" name="NE_SWITCH POP" value={editingVlan['NE_SWITCH POP'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Port</label>
                    <input type="text" name="NE_PORT" value={editingVlan['NE_PORT'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                    <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Mode</label>
                    <input type="text" name="NE_MODE" value={editingVlan['NE_MODE'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                <div className="flex items-center gap-2 mb-3">
                    <Router size={14} className="text-purple-600"/>
                    <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wider">Far End (CPE Side)</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Device Name</label>
                    <input type="text" name="FE_SWITCH POP" value={editingVlan['FE_SWITCH POP'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Port</label>
                    <input type="text" name="FE_PORT" value={editingVlan['FE_PORT'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                    <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Mode</label>
                    <input type="text" name="FE_MODE" value={editingVlan['FE_MODE'] || ''} onChange={handleModalChange}
                      className="w-full p-2 border border-slate-400 rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-between items-center shrink-0">
              <button onClick={handleResetClick} disabled={isSaving}
                className="text-rose-600 text-sm font-bold hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1">
                <Trash2 size={16} /> Reset / Kosongkan
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Batal</button>
                <button onClick={handleSaveChanges} disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg flex items-center gap-2">
                  {isSaving ? 'Menyimpan...' : <><Save size={18} /> Simpan</>}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- MODAL KONFIRMASI RESET (Dipindah ke Bawah + Z-Index 100) --- */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden border border-slate-200 scale-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-14 h-14 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={28} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Lepas VLAN {editingVlan?.VLAN}?</h2>
              <p className="text-sm text-slate-500 mt-2">
                Data customer akan dihapus dan status VLAN akan kembali menjadi <strong className="text-emerald-600">AVAILABLE</strong>.
              </p>
            </div>
            <div className="p-4 bg-slate-50 flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 px-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button 
                onClick={executeResetVlan}
                className="flex-1 py-2.5 px-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition shadow-lg shadow-rose-500/20"
              >
                Ya, Lepas
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}