import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { tableTarget, sheetName, spreadsheetId, googleScriptUrl } = await req.json();

    // --- STRATEGI PAGING UNTUK BYPASS LIMIT 1000 ---
    let allData: any[] = [];
    let from = 0;
    let to = 999;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableTarget)
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        
        // Jika data yang didapat kurang dari 1000, berarti sudah di halaman terakhir
        if (data.length < 1000) {
          hasMore = false;
        } else {
          // Siapkan range untuk halaman berikutnya
          from += 1000;
          to += 1000;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`Berhasil mengambil total ${allData.length} baris dari Supabase.`);

    // 2. Kirim SELURUH data yang sudah digabung ke Google Apps Script
    const response = await fetch(googleScriptUrl, {
      method: 'POST',
      body: JSON.stringify({
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        rows: allData
      }),
    });

    const result = await response.text();
    if (!response.ok || result.includes("Error")) {
      throw new Error(result || "Gagal mengirim data ke Google Sheets");
    }

    return NextResponse.json({ 
      success: true, 
      totalProcessed: allData.length 
    });

  } catch (err: any) {
    console.error("API Route Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}