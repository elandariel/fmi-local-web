-- ============================================================
-- MIGRATION: stop_clocks table
-- Menyimpan history Stop Clock SLA per tiket backbone NOC
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stop_clocks (
  id           BIGSERIAL    PRIMARY KEY,
  ticket_no    TEXT         NOT NULL,         -- NOMOR TICKET (misal: HT191056)
  reason       TEXT         NOT NULL,         -- Alasan pause SLA
  started_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,                   -- NULL = masih aktif
  created_by   TEXT,                          -- email user yang mengaktifkan
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index untuk lookup cepat per tiket
CREATE INDEX IF NOT EXISTS idx_stop_clocks_ticket
  ON public.stop_clocks (ticket_no);

-- Index khusus untuk stop clock yang sedang aktif
CREATE INDEX IF NOT EXISTS idx_stop_clocks_active
  ON public.stop_clocks (ticket_no)
  WHERE ended_at IS NULL;

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.stop_clocks ENABLE ROW LEVEL SECURITY;

-- Semua user authenticated bisa baca
CREATE POLICY "read_stop_clocks"
  ON public.stop_clocks FOR SELECT
  TO authenticated
  USING (true);

-- Semua user authenticated bisa insert (start stop clock)
CREATE POLICY "insert_stop_clocks"
  ON public.stop_clocks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Semua user authenticated bisa update (end stop clock)
CREATE POLICY "update_stop_clocks"
  ON public.stop_clocks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
