// app/api/telegram/approval-webhook/route.ts
// Bot 2 — callback handler saat admin klik Setujui / Tolak di Telegram

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

async function editMessage(token: string, chatId: string | number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    }),
  });
}

async function answerCallback(token: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const token = process.env.TELEGRAM_APPROVAL_BOT_TOKEN;
    if (!token) return NextResponse.json({ ok: true });

    const body          = await request.json();
    const callbackQuery = body?.callback_query;
    if (!callbackQuery) return NextResponse.json({ ok: true });

    const callbackId   = callbackQuery.id;
    const callbackData = callbackQuery.data as string;
    const fromUser     = callbackQuery.from;
    const chatId       = callbackQuery.message?.chat?.id;
    const messageId    = callbackQuery.message?.message_id;
    const telegramUserId = fromUser?.id;

    if (!callbackData?.startsWith('bb_')) {
      await answerCallback(token, callbackId);
      return NextResponse.json({ ok: true });
    }

    // Parse: "bb_approve:123" atau "bb_reject:123"
    const colonIdx  = callbackData.indexOf(':');
    const action    = callbackData.slice(0, colonIdx);
    const pendingId = parseInt(callbackData.slice(colonIdx + 1), 10);

    if (isNaN(pendingId)) {
      await answerCallback(token, callbackId, '❌ Data tidak valid');
      return NextResponse.json({ ok: true });
    }

    console.log('[approval-webhook] action:', action, '| pendingId:', pendingId, '| from:', telegramUserId);

    // ── Validasi: apakah user ini punya hak approve? ──
    const allowedIds = (process.env.TELEGRAM_APPROVAL_ADMIN_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    const { data: profileMatch } = await supabaseAdmin
      .from('profiles')
      .select('full_name, role')
      .eq('telegram_user_id', telegramUserId)
      .single();

    const isAllowed = allowedIds.includes(String(telegramUserId)) || !!profileMatch;

    if (!isAllowed) {
      await answerCallback(token, callbackId, '⛔ Kamu tidak memiliki hak untuk aksi ini');
      return NextResponse.json({ ok: true });
    }

    const approverName = profileMatch?.full_name
      || fromUser?.first_name
      || `User ${telegramUserId}`;

    // ── Ambil data dari backbone_pending ──
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('backbone_pending')
      .select('*')
      .eq('id', pendingId)
      .single();

    if (fetchErr || !item) {
      await answerCallback(token, callbackId, '⚠️ Request tidak ditemukan atau sudah diproses');
      return NextResponse.json({ ok: true });
    }

    const kode = item.kode;
    const nama = item.nama;
    const now  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const msgIds: Record<string, number> = item.telegram_message_ids ?? {};

    if (action === 'bb_approve') {
      // ── Hitung kode urut berikutnya dari Index NOC ──
      const { data: indexRows } = await supabaseAdmin
        .from('Index NOC')
        .select('"KODE BACKBONE"');

      const existingNums = (indexRows ?? [])
        .map((r: any) => parseInt((r['KODE BACKBONE'] || '').match(/^(\d+)/)?.[1] ?? '0', 10))
        .filter((n: number) => n > 0);
      const lastNum   = existingNums.length > 0 ? Math.max(...existingNums) : 0;
      const finalKode = kode || String(lastNum + 1).padStart(5, '0');

      // Insert ke Index NOC
      const { error: insertErr } = await supabaseAdmin
        .from('Index NOC')
        .insert([{
          'KODE BACKBONE': finalKode,
          'NAMA BACKBONE': nama,
        }]);

      if (insertErr) {
        await answerCallback(token, callbackId, '❌ Gagal simpan ke Index NOC: ' + insertErr.message);
        return NextResponse.json({ ok: true });
      }

      // Hapus dari backbone_pending
      await supabaseAdmin.from('backbone_pending').delete().eq('id', pendingId);

      await answerCallback(token, callbackId, `✅ ${finalKode} berhasil disetujui!`);

      const editText = [
        `✅ <b>REQUEST DISETUJUI</b>`,
        ``,
        `📌 <b>Kode</b> : <code>${escapeHtml(finalKode)}</code>`,
        `🔗 <b>Nama</b> : ${escapeHtml(nama)}`,
        ``,
        `👤 Disetujui oleh: <b>${escapeHtml(approverName)}</b>`,
        `🕐 Waktu: ${now}`,
      ].join('\n');

      // Edit semua DM admin lain
      await Promise.all([
        ...Object.entries(msgIds).map(([uid, mid]) => editMessage(token, uid, mid, editText)),
        chatId && messageId ? editMessage(token, chatId, messageId, editText) : Promise.resolve(),
      ]);

    } else if (action === 'bb_reject') {
      // Hapus dari backbone_pending
      await supabaseAdmin.from('backbone_pending').delete().eq('id', pendingId);

      await answerCallback(token, callbackId, `❌ Request "${kode}" ditolak`);

      const editText = [
        `❌ <b>REQUEST DITOLAK</b>`,
        ``,
        `📌 <b>Kode</b> : <code>${escapeHtml(kode)}</code>`,
        `🔗 <b>Nama</b> : ${escapeHtml(nama)}`,
        ``,
        `👤 Ditolak oleh: <b>${escapeHtml(approverName)}</b>`,
        `🕐 Waktu: ${now}`,
      ].join('\n');

      await Promise.all([
        ...Object.entries(msgIds).map(([uid, mid]) => editMessage(token, uid, mid, editText)),
        chatId && messageId ? editMessage(token, chatId, messageId, editText) : Promise.resolve(),
      ]);
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('[approval-webhook] Error:', err.message);
    return NextResponse.json({ ok: true }); // selalu 200 agar Telegram tidak retry
  }
}
