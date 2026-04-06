import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, topicId } = body;

    // Ambil Token & Chat ID dari Environment Server
    const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json({ error: 'Config Telegram Belum Lengkap (Cek .env.local)' }, { status: 500 });
    }

    // Kirim ke Telegram dari Server (Bebas CORS)
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const telegramRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId || null,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const telegramData = await telegramRes.json();
    
    if (!telegramData.ok) {
      throw new Error(telegramData.description);
    }

    return NextResponse.json({ success: true, data: telegramData });

  } catch (error: any) {
    console.error("Telegram API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}