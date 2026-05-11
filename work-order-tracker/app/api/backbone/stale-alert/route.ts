// app/api/backbone/stale-alert/route.ts
// Kirim notifikasi tiket stale (tidak ada update > 1 jam) ke Telegram Bot 1 (Log Group)
//
// Data stale dihitung di FRONTEND dari Problem & Action Timeline / Start Time
// (sama persis dengan logika bell notification yang sudah ada di ReportBackbone.tsx)
// API ini hanya menerima list tiket stale dan meneruskannya ke Telegram.
//
// POST body:
//   tickets: Array<{
//     ticketNo: string;
//     subject:  string;
//     status:   string;
//     diffMin:  number;  // menit tanpa update
//   }>

import { NextResponse } from 'next/server';

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export async function POST(request: Request) {
  try {
    const { tickets } = await request.json() as {
      tickets: {
        ticketNo: string;
        subject:  string;
        status:   string;
        diffMin:  number;
      }[];
    };

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ success: true, sent: false, count: 0 });
    }

    const token   = process.env.TELEGRAM_LOG_BOT_TOKEN;
    const chatId  = process.env.TELEGRAM_LOG_GROUP_ID;
    const topicId = process.env.TELEGRAM_LOG_TOPIC_ID;

    if (!token || !chatId) {
      return NextResponse.json(
        { error: 'TELEGRAM_LOG_BOT_TOKEN / TELEGRAM_LOG_GROUP_ID belum diset' },
        { status: 500 }
      );
    }

    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    // Sort: paling lama tidak update di atas
    const sorted = [...tickets].sort((a, b) => b.diffMin - a.diffMin);

    const ticketLines = sorted.map(t => {
      const statusEmoji = t.status === 'ON PROGRESS' ? '🟠' : '🟡';
      return [
        `  ${statusEmoji} <code>${escapeHtml(t.ticketNo)}</code> — <b>${escapeHtml(t.status)}</b>`,
        `     └ ${escapeHtml(t.subject)}`,
        `     └ ⏱ Tidak ada update selama <b>${formatDuration(t.diffMin)}</b>`,
      ].join('\n');
    }).join('\n\n');

    const text = [
      `⏰ <b>STALE TICKET ALERT — NOC Backbone</b>`,
      ``,
      `📋 <b>${tickets.length} tiket</b> tidak ada update lebih dari 1 jam:`,
      ``,
      ticketLines,
      ``,
      `🕐 <b>Cek pada</b> : ${now}`,
      ``,
      `📌 Harap segera berikan update pada tiket di atas.`,
    ].join('\n');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:                  chatId,
        message_thread_id:        topicId ? parseInt(topicId) : undefined,
        text,
        parse_mode:               'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.description);

    console.log('[stale-alert] Sent', tickets.length, 'stale tickets to Telegram');

    return NextResponse.json({ success: true, sent: true, count: tickets.length });

  } catch (err: any) {
    console.error('[stale-alert] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
