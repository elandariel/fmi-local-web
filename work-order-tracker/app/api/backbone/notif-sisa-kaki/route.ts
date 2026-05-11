// app/api/backbone/notif-sisa-kaki/route.ts
// Kirim notifikasi CRITICAL via Telegram Bot 1 (Logging)
// ke grup/topic logging ketika sebuah PoP hanya tersisa 1 kaki backbone aktif

import { NextResponse } from 'next/server';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendToLogGroup(text: string): Promise<{ ok: boolean; error?: string }> {
  const token  = process.env.TELEGRAM_LOG_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LOG_GROUP_ID;
  const topicId = process.env.TELEGRAM_LOG_TOPIC_ID;

  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_LOG_BOT_TOKEN / TELEGRAM_LOG_GROUP_ID belum diset' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:           chatId,
      message_thread_id: topicId ? parseInt(topicId) : undefined,
      text,
      parse_mode:              'HTML',
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('[notif-sisa-kaki] Gagal kirim ke grup:', data.description);
    return { ok: false, error: data.description as string };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      popKode,
      popNama,
      total,
      downKodes,
      downNamas,
      remainingKode,
      remainingNama,
      activeTickets,
    } = body as {
      popKode:       string;
      popNama:       string;
      total:         number;
      downKodes:     string[];
      downNamas:     string[];
      remainingKode: string;
      remainingNama: string;
      activeTickets: string[];
    };

    if (!popKode || !popNama) {
      return NextResponse.json({ error: 'popKode dan popNama wajib diisi' }, { status: 400 });
    }

    // Format pesan
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const downList = downKodes.map((k, i) => {
      const n = downNamas[i] || k;
      return `  • <code>${escapeHtml(k)}</code> — ${escapeHtml(n)}`;
    }).join('\n');

    const ticketList = activeTickets.length > 0
      ? activeTickets.map(t => `  • ${escapeHtml(t)}`).join('\n')
      : '  —';

    const text = [
      `🚨 <b>CRITICAL — SISA 1 KAKI BACKBONE</b>`,
      ``,
      `🏢 <b>PoP</b>       : ${escapeHtml(popNama)} (<code>${escapeHtml(popKode)}</code>)`,
      `📊 <b>Total Kaki</b> : ${total}`,
      `🔴 <b>Down (${downKodes.length})</b>:`,
      downList || '  —',
      ``,
      `🟢 <b>Sisa Hidup (1)</b>:`,
      `  • <code>${escapeHtml(remainingKode)}</code> — ${escapeHtml(remainingNama || remainingKode)}`,
      ``,
      `📋 <b>Tiket Aktif</b>:`,
      ticketList,
      ``,
      `🕐 <b>Waktu</b> : ${now}`,
      ``,
      `⚠️ <b>Segera eskalasi! Satu kaki tersisa sebelum total blackout.</b>`,
    ].join('\n');

    const { ok, error } = await sendToLogGroup(text);

    console.log('[notif-sisa-kaki] popKode:', popKode, '| sent to log group:', ok, error || '');

    return NextResponse.json({ success: ok, error: error || undefined });

  } catch (err: any) {
    console.error('[notif-sisa-kaki] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
