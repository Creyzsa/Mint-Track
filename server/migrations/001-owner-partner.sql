-- Model owner/partner.
-- Sebelumnya jadwal bisa dimiliki 'berdua'. Sekarang tiap jadwal punya SATU
-- pemilik (yang memposting), dan akun satunya berperan sebagai partner.
-- Aman diulang.

BEGIN;

-- 'berdua' tidak ada lagi. Kalau masih ada sisanya, jatuhkan ke pembuatnya.
UPDATE mints SET owner = COALESCE(created_by, 'creyzsa') WHERE owner = 'berdua';

ALTER TABLE mints DROP CONSTRAINT IF EXISTS mints_owner_check;
ALTER TABLE mints ADD CONSTRAINT mints_owner_check CHECK (owner IN ('chishiya', 'creyzsa'));
ALTER TABLE mints ALTER COLUMN owner DROP DEFAULT;

-- Pemilik otomatis dianggap selesai begitu waktunya lewat, tanpa klik apa pun.
-- Baris di mint_worked untuk si pemilik = ownerCompleted.
-- Baris untuk akun satunya = partnerCompleted.
INSERT INTO mint_worked (mint_id, account_id)
SELECT id, owner FROM mints WHERE starts_at <= now()
ON CONFLICT DO NOTHING;

COMMIT;
