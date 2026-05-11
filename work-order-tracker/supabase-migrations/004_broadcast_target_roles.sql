-- ============================================================
-- MIGRATION: Broadcast Target Roles
-- Tambah kolom target_roles ke tabel Broadcasts
-- NULL  = kirim ke semua user
-- Array = hanya tampil ke role yang ada di dalam array
-- Contoh: '{NOC,CS}' atau '{ADMIN,NOC}'
-- Jalankan di Supabase SQL Editor
-- ============================================================

ALTER TABLE public."Broadcasts"
  ADD COLUMN IF NOT EXISTS target_roles TEXT[];

-- Index untuk query filter cepat
CREATE INDEX IF NOT EXISTS idx_broadcasts_target_roles
  ON public."Broadcasts" USING GIN (target_roles);

-- Komentar kolom
COMMENT ON COLUMN public."Broadcasts".target_roles
  IS 'NULL = semua user. Array of role names (NOC, CS, ADMIN, AKTIVATOR, SUPER_DEV) = hanya role tersebut';
