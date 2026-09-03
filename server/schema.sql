-- Skema Mint Tracker.
-- Jalankan sekali: psql "$DATABASE_URL" -f server/schema.sql
-- Aman diulang (semua IF NOT EXISTS / ON CONFLICT).

BEGIN;

-- ---------- akun ----------
-- Hanya dua akun, dikunci lewat CHECK supaya tidak bisa ditambah lewat aplikasi.
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY CHECK (id IN ('chishiya', 'creyzsa')),
  label         TEXT        NOT NULL,
  pin_hash      TEXT,                       -- NULL = PIN belum dibuat
  pin_salt      TEXT,
  pin_set_at    TIMESTAMPTZ,
  failed_count  INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO accounts (id, label) VALUES
  ('chishiya', 'CHISHIYA'),
  ('creyzsa',  'CREYZSA')
ON CONFLICT (id) DO NOTHING;

-- ---------- sesi ----------
-- Yang disimpan hanya HASH token. Token aslinya cuma ada di cookie browser,
-- jadi bocornya isi tabel ini tidak bisa dipakai untuk menyamar jadi user.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT        PRIMARY KEY,
  account_id  TEXT        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ---------- jadwal ----------
CREATE TABLE IF NOT EXISTS mints (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  type       TEXT        NOT NULL DEFAULT 'mint'
                         CHECK (type IN ('wl','presale','mint','airdrop','tge','raffle','snapshot','other')),
  -- pemilik = yang memposting. Akun satunya berperan sebagai partner.
  owner      TEXT        NOT NULL CHECK (owner IN ('chishiya','creyzsa')),
  status     TEXT        NOT NULL DEFAULT 'watch'
                         CHECK (status IN ('watch','registered','won','ready','minted','missed','skipped')),
  chain      TEXT        NOT NULL DEFAULT '',
  platform   TEXT        NOT NULL DEFAULT '',
  source     TEXT        NOT NULL DEFAULT '',
  starts_at  TIMESTAMPTZ NOT NULL,
  price      TEXT        NOT NULL DEFAULT '',
  supply     TEXT        NOT NULL DEFAULT '',
  link       TEXT        NOT NULL DEFAULT '',
  notes      TEXT        NOT NULL DEFAULT '',
  result     TEXT        NOT NULL DEFAULT '',
  created_by TEXT        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mints_starts_at_idx ON mints (starts_at);
CREATE INDEX IF NOT EXISTS mints_owner_idx     ON mints (owner);

-- ---------- siapa yang sudah menyelesaikan ----------
-- Tabel terpisah, bukan array, supaya tanda dari dua orang tidak pernah
-- saling menimpa walau disimpan bersamaan.
--   baris untuk si pemilik  = ownerCompleted   (diisi otomatis saat waktunya lewat)
--   baris untuk akun satunya = partnerCompleted (diisi saat dia klik "Garap")
CREATE TABLE IF NOT EXISTS mint_worked (
  mint_id    TEXT        NOT NULL REFERENCES mints(id) ON DELETE CASCADE,
  account_id TEXT        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mint_id, account_id)
);

-- updated_at otomatis
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mints_touch ON mints;
CREATE TRIGGER mints_touch BEFORE UPDATE ON mints
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
