// app/api/backbone/notif-sisa-kaki/route.ts
// Kirim notifikasi CRITICAL via Telegram ke semua admin
// ketika sebuah PoP hanya tersisa 1 kaki backbone aktif

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

async function sendMessage(token: string, userId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[notif-sisa-kaki] gagal ke userId=${userId}:`, data.description);
    return { ok: false, error: data.description as string };
  }
  return { ok: true, error: null };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      popKode,
      popNama,
      total,
      downKodes,     // string[] — kode backbone yang sedang down
      downNamas,     // string[] — nama backbone yang sedang down
      remainingKode, // string   — satu kode yang masih hidup
      remainingNama, // string   — nama backbone yang masih hidup
      activeTickets, // string[] — nomor tiket aktif
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

    const token = process.env.TELEGRAM_APPROVAL_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_APPROVAL_BOT_TOKEN belum diset' }, { status: 500 });
    }

    // Kumpulkan admin IDs
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
        sent: 0,
        total: 0,
        warning: 'Tidak ada admin Telegram terdaftar',
      });
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
      `🏢 <b>PoP</b>     : ${escapeHtml(popNama)} (<code>${escapeHtml(popKode)}</code>)`,
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

    // Kirim ke semua admin
    let sent = 0;
    const errors: Record<string, string> = {};

    await Promise.all(
      adminIds.map(async (userId) => {
        const { ok, error } = await sendMessage(token, userId, text);
        if (ok) sent++;
        else if (error) errors[userId] = error;
      })
    );

    console.log('[notif-sisa-kaki] popKode:', popKode, '| sent:', sent, '| errors:', errors);

    return NextResponse.json({
      success: true,
      sent,
      total: adminIds.length,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });

  } catch (err: any) {
    console.error('[notif-sisa-kaki] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
