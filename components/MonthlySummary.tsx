'use client';

import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Menggunakan forwardRef agar fungsi handleExport bisa dipanggil oleh parent (page.tsx)
const MonthlySummary = forwardRef(({ selectedMonth }: { selectedMonth: string }, ref) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // --- LOGIC EXPORT EXCEL ---
  const exportToExcel = () => {
    if (!data) return;

    const { utils, writeFile } = XLSX;

    // --- SHEET 1: RINGKASAN EKSEKUTIF ---
    const summaryRows = [
      ["LAPORAN RINGKASAN BULANAN (MONTHLY SUMMARY)"],
      [`Periode Laporan: ${selectedMonth}`],
      [""], // Baris Kosong
      ["KATEGORI STATUS", "JUMLAH WO", "KETERANGAN"], // Header Tabel
      ["Berlangganan (Pasang Baru)", data.counts.berlangganan, "Aktif"],
      ["Berhenti Sementara (Cuti)", data.counts.sementara, "Suspend"],
      ["Berhenti Berlangganan (Putus)", data.counts.berhenti, "Terminate"],
      ["Upgrade Speed", data.counts.upgrade, "Naik Paket"],
      ["Downgrade Speed", data.counts.downgrade, "Turun Paket"],
      [""],
      ["TOTAL SELURUH WORK ORDER", 
        data.counts.berlangganan + data.counts.sementara + data.counts.berhenti + data.counts.upgrade + data.counts.downgrade, 
        ""
      ],
    ];

    // --- SHEET 2: PERFORMA TIM ---
    const teamRows = [
      ["DETAIL PERFORMA PRODUKTIVITAS TIM"],
      [""],
      ["NAMA TIM", "PASANG", "CUTI", "PUTUS", "UPGRADE", "DOWNGRADE", "TOTAL WO"]
    ];

    // Masukkan data tim baris demi baris
    data.teamStats.forEach((t: any) => {
      const totalTim = t.pasang + t.cuti + t.putus + t.up + t.down;
      teamRows.push([
        t.name.toUpperCase(),
        t.pasang,
        t.cuti,
        t.putus,
        t.up,
        t.down,
        totalTim
      ]);
    });

    // Buat Workbook & Sheet
    const wb = utils.book_new();
    const wsSummary = utils.aoa_to_sheet(summaryRows);
    const wsTeam = utils.aoa_to_sheet(teamRows);

    // --- SETTING LEBAR KOLOM (Penting biar gak kepotong) ---
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }];
    wsTeam['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];

    // Gabungkan ke Workbook
    utils.book_append_sheet(wb, wsSummary, "Ringkasan Umum");
    utils.book_append_sheet(wb, wsTeam, "Performa Tim");

    // Simpan File
    writeFile(wb, `Monthly_Report_${selectedMonth}.xlsx`);
  };

  // Ekspos fungsi ke parent component
  useImperativeHandle(ref, () => ({
    handleExport: exportToExcel
  }));

  useEffect(() => {
    async function getSummary() {
      if (!selectedMonth) return;
      setLoading(true);

      const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      
      const [year, month] = selectedMonth.split('-');
      const monthName = months[parseInt(month) - 1];
      const searchTerm = `${monthName} ${year}`;

      const categories = [
        { key: 'pasang', table: 'Berlangganan 2026' },
        { key: 'putus', table: 'Berhenti Berlangganan 2026' },
        { key: 'cuti', table: 'Berhenti Sementara 2026' },
        { key: 'up', table: 'Upgrade 2026' },
        { key: 'down', table: 'Downgrade 2026' }
      ];

      const results = await Promise.all(
        categories.map(cat => 
          supabase
            .from(cat.table)
            .select('*')
            .ilike('TANGGAL', `%${searchTerm}%`)
        )
      );

      const [pasang, putus, cuti, up, down] = results.map(r => r.data || []);
      const teams = ['Ilham', 'Shidiq', 'Andi', 'Anan'];

      setData({
        counts: {
          berlangganan: pasang.length,
          sementara: cuti.length,
          berhenti: putus.length,
          upgrade: up.length,
          downgrade: down.length
        },
        teamStats: teams.map(t => ({
          name: t,
          pasang: pasang.filter(d => d.TEAM?.toLowerCase().includes(t.toLowerCase())).length,
          putus: putus.filter(d => d.TEAM?.toLowerCase().includes(t.toLowerCase())).length,
          cuti: cuti.filter(d => d.TEAM?.toLowerCase().includes(t.toLowerCase())).length,
          up: up.filter(d => d.TEAM?.toLowerCase().includes(t.toLowerCase())).length,
          down: down.filter(d => d.TEAM?.toLowerCase().includes(t.toLowerCase())).length,
        }))
      });
      setLoading(false);
    }
    getSummary();
  }, [selectedMonth, supabase]);

  if (loading || !data) return <div className="p-10 text-center font-bold text-slate-400">Mengolah Data Summary...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      {/* Donut Status */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-4 text-center">Status Berlangganan</h4>
        <ReactApexChart 
          type="donut" 
          height={300}
          series={[data.counts.berlangganan, data.counts.sementara, data.counts.berhenti]}
          options={{
            labels: ['Berlangganan', 'Berhenti Sementara', 'Berhenti Berlangganan'],
            colors: ['#10b981', '#f59e0b', '#ef4444'],
            legend: { position: 'bottom' },
            tooltip: { theme: 'dark' }
          }}
        />
      </div>

      {/* Pie Upgrade */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-4 text-center">Upgrade & Downgrade</h4>
        <ReactApexChart 
          type="pie" 
          height={300}
          series={[data.counts.upgrade, data.counts.downgrade]}
          options={{
            labels: ['Upgrade', 'Downgrade'],
            colors: ['#3b82f6', '#f43f5e'],
            legend: { position: 'bottom' },
            tooltip: { theme: 'dark' }
          }}
        />
      </div>

      {/* Bar Team */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-bold text-slate-700 mb-4 text-center">Aktivasi Per Team</h4>
        <ReactApexChart 
          type="bar" 
          height={350}
          series={[
            { name: 'Berlangganan', data: data.teamStats.map((t:any) => t.pasang) },
            { name: 'Berhenti Sementara', data: data.teamStats.map((t:any) => t.cuti) },
            { name: 'Berhenti Berlangganan', data: data.teamStats.map((t:any) => t.putus) },
            { name: 'Upgrade', data: data.teamStats.map((t:any) => t.up) },
            { name: 'Downgrade', data: data.teamStats.map((t:any) => t.down) },
          ]}
          options={{
            chart: { 
              type: 'bar',
              toolbar: { show: false },
              fontFamily: 'Inter, sans-serif'
            },
            plotOptions: {
              bar: {
                horizontal: false,
                columnWidth: '70%',
                borderRadius: 4,
                dataLabels: { position: 'top' },
              }
            },
            colors: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#f43f5e'],
            dataLabels: {
              enabled: true,
              offsetY: -20,
              style: { fontSize: '10px', colors: ["#64748b"] }
            },
            stroke: { show: true, width: 2, colors: ['transparent'] },
            xaxis: {
              categories: data.teamStats.map((t:any) => t.name),
              labels: { style: { fontWeight: 600 } }
            },
            yaxis: {
              title: { text: 'Total Work Order', style: { color: '#64748b' } }
            },
            fill: { opacity: 1 },
            legend: {
              position: 'bottom',
              horizontalAlign: 'center',
              fontSize: '12px',
              markers: { radius: 12 }
            },
            tooltip: {
              theme: 'dark',
              y: { formatter: (val) => `${val} WO` }
            },
            grid: {
              borderColor: '#f1f5f9',
              strokeDashArray: 4,
            }
          }}
        />
      </div>
    </div>
  );
});

MonthlySummary.displayName = 'MonthlySummary';

export default MonthlySummary;