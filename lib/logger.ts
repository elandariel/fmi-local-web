import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface LogParams {
  activity: string; 
  subject: string;  
  actor: string;    
}

export const logActivity = async ({ activity, subject, actor }: LogParams) => {
  
  // 1. SIMPAN KE SUPABASE (Client Side OK)
  const { error } = await supabase
    .from('Log_Aktivitas')
    .insert({
      ACTIVITY: activity,
      SUBJECT: subject,
      actor: actor,
      created_at: new Date().toISOString()
    });

  if (error) console.error("Gagal simpan log DB:", error.message);

  // 2. KIRIM KE TELEGRAM (Lewat API Route Internal)
  try {
    const topicId = process.env.NEXT_PUBLIC_TELEGRAM_TOPIC_ID; 

    // Rakit Pesan HTML
    const message = `
<b>🔔 AKTIVITAS BARU</b>
--------------------------------
<b>User:</b> ${actor}
<b>Activity:</b> ${activity}
<b>Subject:</b> ${subject}
--------------------------------
<i>📅 ${new Date().toLocaleString('id-ID')}</i>
    `;

    // Panggil API Internal kita (/api/telegram)
    // Browser -> API Route (Sama Domain, jadi Aman CORS)
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        topicId: topicId // Kirim ID Topic ke server
      })
    });

  } catch (err) {
    console.error("Gagal request ke API Telegram Internal:", err);
  }
};