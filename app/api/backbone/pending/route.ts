// app/api/backbone/pending/route.ts
// CRUD untuk tabel backbone_pending (service role — bypass RLS)

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── GET /api/backbone/pending — ambil semua pending ──
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('backbone_pending')
    .select('*')
    .order('requested_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// ── POST /api/backbone/pending — approve atau reject ──
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, id, approvedBy } = body as {
      action: 'approve' | 'reject';
      id: number;
      approvedBy?: string;
    };

    if (!id) return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 });

    // Ambil data pending
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('backbone_pending')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Request tidak ditemukan' }, { status: 404 });
    }

    if (action === 'approve') {
      // Hitung nomor urut berikutnya dari Index NOC
      const { data: indexRows } = await supabaseAdmin
        .from('Index NOC')
        .select('"KODE BACKBONE"');

      const existingNums = (indexRows ?? [])
        .map((r: any) => parseInt((r['KODE BACKBONE'] || '').match(/^(\d+)/)?.[1] ?? '0', 10))
        .filter((n: number) => n > 0);
      const lastNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
      const kode    = item.kode || String(lastNum + 1).padStart(5, '0');

      // Insert ke Index NOC
      const { error: insertErr } = await supabaseAdmin
        .from('Index NOC')
        .insert([{
          'KODE BACKBONE': kode,
          'NAMA BACKBONE': item.nama,
        }]);

      if (insertErr) throw new Error('Gagal insert ke Index NOC: ' + insertErr.message);

      // Hapus dari backbone_pending
      await supabaseAdmin.from('backbone_pending').delete().eq('id', id);

      return NextResponse.json({
        success: true,
        message: `${kode} — "${item.nama}" berhasil disetujui dan ditambahkan ke Index NOC`,
        kode,
      });

    } else if (action === 'reject') {
      await supabaseAdmin.from('backbone_pending').delete().eq('id', id);
      return NextResponse.json({ success: true, message: 'Request ditolak dan dihapus' });

    } else {
      return NextResponse.json({ error: 'action harus approve atau reject' }, { status: 400 });
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
