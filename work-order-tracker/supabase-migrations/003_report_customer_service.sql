-- ============================================================
-- MIGRATION: Report Customer Service
-- Tabel untuk dashboard CS (Customer Service) NOC FMI
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public."Report Customer Service" (
  id                                    BIGSERIAL    PRIMARY KEY,
  "No"                                  TEXT,
  "Tanggal"                             TEXT,          -- Format: Rabu, 5 Mei 2026
  "Open"                                TEXT,          -- Waktu tiket dibuka
  "Close"                               TEXT,          -- Waktu tiket ditutup
  "TICKET"                              TEXT,
  "Prioritas Level Gangguan"            TEXT,          -- CRITICAL / MAJOR / MINOR / LOW
  "ISP"                                 TEXT,
  "Team"                                TEXT,
  "Regional"                            TEXT,
  "POP"                                 TEXT,
  "Tiket Client Terimpact"              TEXT,
  "Customer ID"                         TEXT,
  "Impact Customer"                     TEXT,
  "Quantity Impact"                     NUMERIC,
  "Alamat Client"                       TEXT,
  "Categori Problem"                    TEXT,
  "Reason Problem"                      TEXT,
  "Keterangan"                          TEXT,
  "Power Sebelum Perbaikan"             TEXT,
  "Power Setelah Perbaikan"             TEXT,
  "Maps"                                TEXT,          -- URL Google Maps
  "Action"                              TEXT,
  "Status Link"                         TEXT,          -- UP / DOWN / UNMONITOR
  "Status Ticket"                       TEXT,          -- OPEN / ON PROGRESS / CLOSE / SOLVED / CANCEL
  "Note"                                TEXT,
  "Down Time Link (Ticket Client Open)" TEXT,
  "Waktu Responsif CS NOC FMI"          TEXT,
  "MTTR (MINUTE)"                       NUMERIC,       -- MTTR Waktu Responsif (menit)
  "Waktu Eskalasi ke Team"              TEXT,
  "MTTR Eskalasi (MINUTE)"             NUMERIC,       -- MTTR Waktu Eskalasi ke Team (menit)
  "UP Time Link"                        TEXT,
  "MTTR (HOUR)"                         NUMERIC,       -- MTTR total (jam)
  "SLA"                                 TEXT,          -- OK / NOK
  "Akumulasi Stop Clock (Hours)"        NUMERIC,
  "Note Stop Clock"                     TEXT,
  "Total SLA Akhir"                     TEXT,
  "Total SLA Final"                     TEXT,          -- OK / NOK — SLA akhir setelah stop clock
  "Total Waktu Aktif"                   TEXT,
  created_at                            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index untuk query umum
CREATE INDEX IF NOT EXISTS idx_rcs_ticket      ON public."Report Customer Service" ("TICKET");
CREATE INDEX IF NOT EXISTS idx_rcs_status      ON public."Report Customer Service" ("Status Ticket");
CREATE INDEX IF NOT EXISTS idx_rcs_regional    ON public."Report Customer Service" ("Regional");
CREATE INDEX IF NOT EXISTS idx_rcs_team        ON public."Report Customer Service" ("Team");
CREATE INDEX IF NOT EXISTS idx_rcs_tanggal     ON public."Report Customer Service" ("Tanggal");
CREATE INDEX IF NOT EXISTS idx_rcs_sla         ON public."Report Customer Service" ("SLA");

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_rcs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rcs_updated_at ON public."Report Customer Service";
CREATE TRIGGER trg_rcs_updated_at
  BEFORE UPDATE ON public."Report Customer Service"
  FOR EACH ROW EXECUTE FUNCTION update_rcs_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public."Report Customer Service" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcs_select" ON public."Report Customer Service"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rcs_insert" ON public."Report Customer Service"
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rcs_update" ON public."Report Customer Service"
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "rcs_delete" ON public."Report Customer Service"
  FOR DELETE TO authenticated USING (true);
