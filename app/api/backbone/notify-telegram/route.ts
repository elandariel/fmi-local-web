// app/api/backbone/notify-telegram/route.ts
// Insert ke backbone_pending + kirim DM Telegram ke semua admin approver

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendDM(token: string, userId: string, text: string, inlineKeyboard: any[][]) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[sendDM] gagal ke userId=${userId}:`, data.description);
    return { messageId: null, error: data.description };
  }
  return { messageId: data.result.message_id as number, error: null };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { kode, nama, requestedBy } = body as {
      kode: string;
      nama: string;
      requestedBy: string;
    };

    if (!kode || !nama || !requestedBy) {
      return NextResponse.json({ error: 'kode, nama, requestedBy wajib diisi' }, { status: 400 });
    }

    const token = process.env.TELEGRAM_APPROVAL_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_APPROVAL_BOT_TOKEN belum diset' }, { status: 500 });
    }

    // ── 1. Insert ke backbone_pending ──
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('backbone_pending')
      .insert([{ kode, nama, requested_by: requestedBy }])
      .select('id')
      .single();

    if (insertErr || !inserted) {
      throw new Error('Gagal simpan ke backbone_pending: ' + insertErr?.message);
    }

    const pendingId = inserted.id as number;

    // ── 2. Kumpulkan admin IDs ──
    const envIds = (process.env.TELEGRAM_APPROVAL_ADMIN_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    const { data: profileAdmins } = await supabaseAdmin
      .from('profiles')
      .select('telegram_user_id')
      .not('telegram_user_id', 'is', null);

    const dbIds = (profileAdmins ?? [])
      .map((p: any) => String(p.telegram_user_id))
      .filter(Boolean);

    const adminIds = [...new Set([...envIds, ...dbIds])];

    if (adminIds.length === 0) {
      return NextResponse.json({
        success: true,
        pendingId,
        sent: 0,
        total: 0,
        warning: 'Tidak ada admin Telegram terdaftar',
      });
    }

    // ── 3. Format pesan ──
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const text = [
      `🔔 <b>REQUEST KODE BACKBONE BARU</b>`,
      ``,
      `📌 <b>Kode</b>  : <code>${escapeHtml(kode)}</code>`,
      `🔗 <b>Nama</b>  : ${escapeHtml(nama)}`,
      `👤 <b>Oleh</b>  : ${escapeHtml(requestedBy)}`,
      `🕐 <b>Waktu</b> : ${now}`,
      ``,
      `Setujui atau tolak request ini:`,
    ].join('\n');

    // callback_data pakai backbone_pending.id (bigint) — lebih reliable
    const keyboard = [[
      { text: '✅ Setujui', callback_data: `bb_approve:${pendingId}` },
      { text: '❌ Tolak',  callback_data: `bb_reject:${pendingId}`  },
    ]];

    // ── 4. Kirim DM ke semua admin ──
    const messageIds: Record<string, number> = {};
    const errors: Record<string, string>     = {};

    await Promise.all(
      adminIds.map(async (userId) => {
        const { messageId, error } = await sendDM(token, userId, text, keyboard);
        if (messageId) messageIds[userId] = messageId;
        if (error)     errors[userId]     = error;
      })
    );

    // ── 5. Simpan message IDs ke backbone_pending ──
    if (Object.keys(messageIds).length > 0) {
      await supabaseAdmin
        .from('backbone_pending')
        .update({ telegram_message_ids: messageIds })
        .eq('id', pendingId);
    }

    console.log('[notify-telegram] pendingId:', pendingId, '| sent:', Object.keys(messageIds).length, '| errors:', errors);

    return NextResponse.json({
      success: true,
      pendingId,
      sent: Object.keys(messageIds).length,
      total: adminIds.length,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });

  } catch (err: any) {
    console.error('[notify-telegram] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
