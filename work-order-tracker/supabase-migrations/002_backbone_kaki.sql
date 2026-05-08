-- ============================================================
-- MIGRATION: backbone_kaki
-- 1. Kolom "Kaki Backbone" (text[]) pada tabel "Index NOC"
--    → menyimpan daftar kode backbone yg terhubung ke sebuah PoP
-- 2. Tabel backbone_pending
--    → antrian request kode backbone baru, menunggu approval via Telegram
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- ── 1. Kolom Kaki Backbone ────────────────────────────────────
ALTER TABLE "Index NOC"
  ADD COLUMN IF NOT EXISTS "Kaki Backbone" TEXT[];

COMMENT ON COLUMN "Index NOC"."Kaki Backbone"
  IS 'Daftar kode backbone (string[]) yang menjadi kaki dari PoP ini';

-- ── 2. Tabel backbone_pending ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backbone_pending (
  id                   BIGSERIAL    PRIMARY KEY,
  kode                 TEXT         NOT NULL,
  nama                 TEXT         NOT NULL,
  requested_by         TEXT         NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected'
  telegram_message_ids JSONB,
  -- { "<telegram_user_id>": <message_id>, ... }
  reviewed_by          TEXT,
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index untuk lookup berdasarkan status
CREATE INDEX IF NOT EXISTS idx_backbone_pending_status
  ON public.backbone_pending (status);

-- Index untuk lookup berdasarkan kode
CREATE INDEX IF NOT EXISTS idx_backbone_pending_kode
  ON public.backbone_pending (kode);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.backbone_pending ENABLE ROW LEVEL SECURITY;

-- Semua user authenticated bisa baca
CREATE POLICY "read_backbone_pending"
  ON public.backbone_pending FOR SELECT
  TO authenticated
  USING (true);

-- Semua user authenticated bisa insert (request kode baru)
CREATE POLICY "insert_backbone_pending"
  ON public.backbone_pending FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Semua user authenticated bisa update (approve/reject via bot)
CREATE POLICY "update_backbone_pending"
  ON public.backbone_pending FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role (dipakai API route) sudah bypass RLS secara default,
-- tapi tambahkan policy eksplisit supaya tidak ada ambiguitas:
CREATE POLICY "service_role_all_backbone_pending"
  ON public.backbone_pending
  TO service_role
  USING (true)
  WITH CHECK (true);
