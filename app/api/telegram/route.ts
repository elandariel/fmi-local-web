// app/api/telegram/route.ts
// Bot 1 — Log Notifikasi: kirim pesan ke topic/thread grup

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, topicId } = body;

    const token  = process.env.TELEGRAM_LOG_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_LOG_GROUP_ID;
    const defaultTopic = process.env.TELEGRAM_LOG_TOPIC_ID;

    if (!token || !chatId) {
      return NextResponse.json(
        { error: 'Config Bot 1 belum lengkap (TELEGRAM_LOG_BOT_TOKEN / TELEGRAM_LOG_GROUP_ID)' },
        { status: 500 }
      );
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId ?? defaultTopic ?? undefined,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.description);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[Bot1/Log] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
