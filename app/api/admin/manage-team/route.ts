import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// --- 1. SMART CREATE USER ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, full_name, role } = body;

    // A. Buat User di Auth Supabase
    // Kita titip data 'full_name' di user_metadata biar Trigger (kalau ada) bisa langsung pakai
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role } 
    });

    if (authError) throw authError;

    // B. Handle Profile (Update jika ada trigger, Insert jika belum ada)
    if (authData.user) {
      const userId = authData.user.id;

      // Cek apakah profile sudah dibuatkan otomatis oleh Trigger DB?
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (existingProfile) {
        // KASUS 1: Profile SUDAH ADA (karena trigger). Kita Update saja.
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: full_name,
            role: role,
            // email biasanya otomatis, tapi kita pastikan lagi
            email: email, 
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (updateError) throw updateError;

      } else {
        // KASUS 2: Profile BELUM ADA. Kita Insert manual.
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: userId,
            full_name: full_name,
            role: role,
            email: email
          });
          
        if (insertError) {
          // Bersihkan user auth jika profile gagal
          await supabaseAdmin.auth.admin.deleteUser(userId);
          throw insertError;
        }
      }
    }

    return NextResponse.json({ message: 'User berhasil dibuat', user: authData.user });
  } catch (error: any) {
    console.error('Create Error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// --- 2. DELETE USER ---
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) throw error;

    return NextResponse.json({ message: 'User berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}