import { createBrowserClient } from '@supabase/ssr';

// ─────────────────────────────────────────────────────────────
// TIPE AKTIVITAS — konsisten di seluruh aplikasi
// ─────────────────────────────────────────────────────────────
export type ActivityType =
  // Work Order
  | 'WO_CREATE'
  | 'WO_EDIT'
  | 'WO_DELETE'
  | 'WO_EDIT_REQUEST'
  | 'WO_EDIT_APPROVED'
  | 'WO_EDIT_REJECTED'
  // Tracker
  | 'TRACKER_CREATE'
  | 'TRACKER_EDIT'
  | 'TRACKER_DELETE'
  | 'TRACKER_EDIT_REQUEST'
  | 'TRACKER_EDIT_APPROVED'
  | 'TRACKER_EDIT_REJECTED'
  | 'TRACKER_EDIT_DIRECT'
  | 'TRACKER_CATEGORY_CHANGE'
  // Client
  | 'CLIENT_CREATE'
  | 'CLIENT_EDIT'
  | 'CLIENT_DELETE'
  // VLAN
  | 'VLAN_EDIT'
  | 'VLAN_RESET'
  // Interkoneksi
  | 'INTERKONEKSI_CREATE'
  | 'INTERKONEKSI_EDIT'
  | 'INTERKONEKSI_DELETE'
  | 'INTERKONEKSI_IMPORT'
  // Broadcast
  | 'BROADCAST_SEND'
  | 'BROADCAST_DELETE'
  // User Management
  | 'USER_CREATE'
  | 'USER_DELETE'
  | 'USER_ROLE_CHANGE'
  // Profile
  | 'PROFILE_UPDATE'
  | 'PASSWORD_CHANGE'
  // Tools
  | 'WO_DISTRIBUTE'
  // Auth
  | 'LOGIN'
  | 'LOGOUT';

// ─────────────────────────────────────────────────────────────
// MODULE — untuk grouping & filter di logs page
// ─────────────────────────────────────────────────────────────
export type ActivityModule =
  | 'Monthly Report'
  | 'Weekly Report'
  | 'Data Client'
  | 'VLAN'
  | 'Interkoneksi'
  | 'Broadcast'
  | 'User Management'
  | 'Profile'
  | 'Tools'
  | 'System';

// ─────────────────────────────────────────────────────────────
// MAPPING: ActivityType → Module & label yang readable
// ─────────────────────────────────────────────────────────────
export const ACTIVITY_META: Record<ActivityType, { module: ActivityModule; label: string; category: 'create' | 'edit' | 'delete' | 'request' | 'approve' | 'reject' | 'system' }> = {
  WO_CREATE:             { module: 'Monthly Report',  label: 'Buat Work Order',             category: 'create'  },
  WO_EDIT:               { module: 'Monthly Report',  label: 'Edit Work Order',              category: 'edit'    },
  WO_DELETE:             { module: 'Monthly Report',  label: 'Hapus Work Order',             category: 'delete'  },
  WO_EDIT_REQUEST:       { module: 'Monthly Report',  label: 'Request Edit WO',             category: 'request' },
  WO_EDIT_APPROVED:      { module: 'Monthly Report',  label: 'Approve Edit WO',             category: 'approve' },
  WO_EDIT_REJECTED:      { module: 'Monthly Report',  label: 'Tolak Edit WO',               category: 'reject'  },
  TRACKER_CREATE:        { module: 'Weekly Report',   label: 'Input Tracker',               category: 'create'  },
  TRACKER_EDIT:          { module: 'Weekly Report',   label: 'Edit Tracker',                category: 'edit'    },
  TRACKER_DELETE:        { module: 'Weekly Report',   label: 'Hapus Tracker',               category: 'delete'  },
  TRACKER_EDIT_REQUEST:    { module: 'Weekly Report',   label: 'Request Edit Tracker',        category: 'request' },
  TRACKER_EDIT_APPROVED:  { module: 'Weekly Report',   label: 'Approve Edit Tracker',        category: 'approve' },
  TRACKER_EDIT_REJECTED:  { module: 'Weekly Report',   label: 'Tolak Edit Tracker',          category: 'reject'  },
  TRACKER_EDIT_DIRECT:    { module: 'Weekly Report',   label: 'Edit Langsung Tracker',       category: 'edit'    },
  TRACKER_CATEGORY_CHANGE:{ module: 'Weekly Report',   label: 'Pindah Kategori Tracker',     category: 'edit'    },
  CLIENT_CREATE:         { module: 'Data Client',     label: 'Tambah Client',               category: 'create'  },
  CLIENT_EDIT:           { module: 'Data Client',     label: 'Edit Data Client',             category: 'edit'    },
  CLIENT_DELETE:         { module: 'Data Client',     label: 'Hapus Client',                category: 'delete'  },
  VLAN_EDIT:             { module: 'VLAN',            label: 'Edit Data VLAN',              category: 'edit'    },
  VLAN_RESET:            { module: 'VLAN',            label: 'Reset VLAN ke Available',     category: 'delete'  },
  INTERKONEKSI_CREATE:   { module: 'Interkoneksi',    label: 'Tambah Data Interkoneksi',    category: 'create'  },
  INTERKONEKSI_EDIT:     { module: 'Interkoneksi',    label: 'Edit Data Interkoneksi',      category: 'edit'    },
  INTERKONEKSI_DELETE:   { module: 'Interkoneksi',    label: 'Hapus Data Interkoneksi',     category: 'delete'  },
  INTERKONEKSI_IMPORT:   { module: 'Interkoneksi',    label: 'Import Data Interkoneksi',    category: 'create'  },
  BROADCAST_SEND:        { module: 'Broadcast',       label: 'Kirim Broadcast',             category: 'create'  },
  BROADCAST_DELETE:      { module: 'Broadcast',       label: 'Hapus Broadcast',             category: 'delete'  },
  USER_CREATE:           { module: 'User Management', label: 'Buat Akun User',              category: 'create'  },
  USER_DELETE:           { module: 'User Management', label: 'Hapus Akun User',             category: 'delete'  },
  USER_ROLE_CHANGE:      { module: 'User Management', label: 'Ubah Role User',              category: 'edit'    },
  PROFILE_UPDATE:        { module: 'Profile',         label: 'Update Profile',              category: 'edit'    },
  PASSWORD_CHANGE:       { module: 'Profile',         label: 'Ganti Password',              category: 'edit'    },
  WO_DISTRIBUTE:         { module: 'Tools',           label: 'Distribusi WO ke Teknisi',    category: 'create'  },
  LOGIN:                 { module: 'System',          label: 'Login',                       category: 'system'  },
  LOGOUT:                { module: 'System',          label: 'Logout',                      category: 'system'  },
};

// ─────────────────────────────────────────────────────────────
// PAYLOAD
// ─────────────────────────────────────────────────────────────
export interface LogPayload {
  activity: ActivityType;
  subject: string;          // nama data / judul yang diubah
  actor: string;            // nama user
  detail?: string;          // info tambahan opsional (misal: "Status: PROGRESS → SOLVED")
  module?: ActivityModule;  // auto-filled dari ACTIVITY_META kalau tidak diisi
}

// ─────────────────────────────────────────────────────────────
// FUNGSI UTAMA
// ─────────────────────────────────────────────────────────────
export async function logActivity(payload: LogPayload): Promise<void> {
  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const meta = ACTIVITY_META[payload.activity];
    const module = payload.module || meta?.module || 'System';
    const label  = meta?.label || payload.activity;

    await supabase.from('Log_Aktivitas').insert({
      ACTIVITY: payload.activity,          // type key, e.g. "WO_CREATE"
      ACTIVITY_LABEL: label,               // readable label, e.g. "Buat Work Order"
      MODULE: module,                      // module grouping
      SUBJECT: payload.subject,            // nama data
      DETAIL: payload.detail || null,      // info tambahan
      actor: payload.actor,
    });
  } catch (err) {
    // Jangan crash app hanya karena logging gagal
    console.warn('[Logger] Gagal mencatat aktivitas:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: ambil nama user dari Supabase auth (reusable)
// ─────────────────────────────────────────────────────────────
export async function getActorName(supabase: any): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'System';
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    return profile?.full_name || user.email?.split('@')[0] || 'User';
  } catch {
    return 'System';
  }
}