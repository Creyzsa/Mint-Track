/* db.js — semua sentuhan ke PostgreSQL.
   Setiap query pakai parameter ($1, $2, ...). Tidak ada satu pun string SQL
   yang dirakit dari input user, jadi SQL injection tertutup di sini. */
"use strict";

const { Pool } = require("pg");
const auth = require("./auth");

const ON_VERCEL = !!process.env.VERCEL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // di Vercel databasenya pasti remote -> SSL wajib, kecuali dimatikan sengaja
  ssl: (ON_VERCEL && process.env.PGSSL !== "disable") || process.env.PGSSL === "require"
    ? { rejectUnauthorized: false }
    : false,
  // tiap instance serverless jalan sendiri-sendiri; satu koneksi per instance
  // supaya kuota koneksi database tidak habis saat banyak instance hidup
  max: ON_VERCEL ? 1 : 8,
  idleTimeoutMillis: ON_VERCEL ? 10000 : 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[db] koneksi idle bermasalah:", err.message);
});

const q = (text, params) => pool.query(text, params);

/* ---------- akun & PIN ---------- */

async function getAccount(id) {
  const { rows } = await q(
    `SELECT id, label, pin_hash, pin_salt, failed_count, locked_until
       FROM accounts WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Daftar akun untuk halaman login — sengaja tanpa kolom PIN apa pun. */
async function listAccounts() {
  const { rows } = await q(
    `SELECT id, label, (pin_hash IS NOT NULL) AS has_pin
       FROM accounts ORDER BY id`
  );
  return rows;
}

async function setPin(id, salt, hash) {
  await q(
    `UPDATE accounts
        SET pin_salt = $2, pin_hash = $3, pin_set_at = now(),
            failed_count = 0, locked_until = NULL
      WHERE id = $1`,
    [id, salt, hash]
  );
}

async function noteFailure(id) {
  const { rows } = await q(
    `UPDATE accounts
        SET failed_count = failed_count + 1,
            locked_until = CASE
              WHEN failed_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval
              ELSE locked_until END
      WHERE id = $1
      RETURNING failed_count, locked_until`,
    [id, auth.MAX_FAILED, String(auth.LOCK_MINUTES)]
  );
  return rows[0];
}

async function noteSuccess(id) {
  await q(
    `UPDATE accounts
        SET failed_count = 0, locked_until = NULL, last_login_at = now()
      WHERE id = $1`,
    [id]
  );
}

/* ---------- sesi ---------- */

async function createSession(accountId, hash, expiresAt, userAgent) {
  await q(
    `INSERT INTO sessions (token_hash, account_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [hash, accountId, expiresAt, String(userAgent || "").slice(0, 300)]
  );
}

async function findSession(hash) {
  const { rows } = await q(
    `UPDATE sessions SET last_seen = now()
      WHERE token_hash = $1 AND expires_at > now()
      RETURNING account_id`,
    [hash]
  );
  return rows[0] ? rows[0].account_id : null;
}

async function dropSession(hash) {
  await q(`DELETE FROM sessions WHERE token_hash = $1`, [hash]);
}

async function sweepSessions() {
  const { rowCount } = await q(`DELETE FROM sessions WHERE expires_at <= now()`);
  return rowCount;
}

/* ---------- jadwal ---------- */

const MINT_SELECT = `
  SELECT m.id, m.name, m.type, m.owner, m.status, m.chain, m.platform, m.source,
         m.starts_at, m.price, m.supply, m.link, m.notes, m.result,
         m.created_by, m.updated_at,
         COALESCE(
           (SELECT array_agg(w.account_id ORDER BY w.account_id)
              FROM mint_worked w WHERE w.mint_id = m.id),
           ARRAY[]::text[]
         ) AS worked
    FROM mints m`;

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    owner: row.owner,
    status: row.status,
    chain: row.chain,
    platform: row.platform,
    source: row.source,
    datetime: row.starts_at.toISOString(),
    price: row.price,
    supply: row.supply,
    link: row.link,
    notes: row.notes,
    result: row.result,
    worked: row.worked || [],
    createdBy: row.created_by,
    updatedAt: row.updated_at.getTime(),
  };
}

/**
 * Begitu waktunya lewat, si pemilik otomatis dianggap sudah menggarap —
 * tanpa perlu klik apa pun. Dijalankan di server supaya hasilnya sama
 * untuk kedua akun, tidak bergantung siapa yang kebetulan membuka halaman.
 */
async function autoCompleteOwners() {
  await q(
    `INSERT INTO mint_worked (mint_id, account_id)
     SELECT id, owner FROM mints WHERE starts_at <= now()
     ON CONFLICT DO NOTHING`
  );
}

async function listMints() {
  await autoCompleteOwners();
  const { rows } = await q(`${MINT_SELECT} ORDER BY m.starts_at ASC`);
  return rows.map(shape);
}

async function getMint(id) {
  const { rows } = await q(`${MINT_SELECT} WHERE m.id = $1`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

const FIELDS = ["name", "type", "owner", "status", "chain", "platform", "source", "price", "supply", "link", "notes", "result"];

/**
 * Cari jadwal kembar: nama sama (abaikan besar-kecil), jam sama, pemilik sama.
 * Menyimpan dua kali gampang terjadi — klik Simpan dobel, atau lupa sudah pernah
 * dicatat — dan hasilnya dua kartu identik yang membingungkan.
 */
async function findTwin(data) {
  const { rows } = await q(
    `SELECT id FROM mints
      WHERE lower(name) = lower($1) AND starts_at = $2 AND owner = $3
      LIMIT 1`,
    [data.name, data.datetime, data.owner]
  );
  return rows[0] ? rows[0].id : null;
}

async function insertMint(id, data, createdBy) {
  const values = [id, ...FIELDS.map((f) => data[f]), data.datetime, createdBy];
  await q(
    `INSERT INTO mints (id, ${FIELDS.join(", ")}, starts_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    values
  );
  return getMint(id);
}

async function updateMint(id, data) {
  const values = [id, ...FIELDS.map((f) => data[f]), data.datetime];
  const sets = FIELDS.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const { rowCount } = await q(
    `UPDATE mints SET ${sets}, starts_at = $${FIELDS.length + 2} WHERE id = $1`,
    values
  );
  return rowCount ? getMint(id) : null;
}

async function deleteMint(id) {
  const { rowCount } = await q(`DELETE FROM mints WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function setWorked(mintId, accountId, on) {
  if (on) {
    await q(
      `INSERT INTO mint_worked (mint_id, account_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [mintId, accountId]
    );
  } else {
    await q(`DELETE FROM mint_worked WHERE mint_id = $1 AND account_id = $2`, [mintId, accountId]);
  }
  return getMint(mintId);
}

/** Import: tambah yang baru, perbarui yang lebih baru, satukan tanda digarap. */
async function mergeMints(items, createdBy) {
  const client = await pool.connect();
  let added = 0;
  let updated = 0;
  try {
    await client.query("BEGIN");
    for (const it of items) {
      const { rows } = await client.query(
        `SELECT updated_at FROM mints WHERE id = $1 FOR UPDATE`,
        [it.id]
      );
      if (!rows[0]) {
        await client.query(
          `INSERT INTO mints (id, ${FIELDS.join(", ")}, starts_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [it.id, ...FIELDS.map((f) => it[f]), it.datetime, createdBy]
        );
        added++;
      } else if (it.updatedAt && it.updatedAt > rows[0].updated_at.getTime()) {
        const sets = FIELDS.map((f, i) => `${f} = $${i + 2}`).join(", ");
        await client.query(
          `UPDATE mints SET ${sets}, starts_at = $${FIELDS.length + 2} WHERE id = $1`,
          [it.id, ...FIELDS.map((f) => it[f]), it.datetime]
        );
        updated++;
      }
      for (const who of it.worked || []) {
        await client.query(
          `INSERT INTO mint_worked (mint_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [it.id, who]
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { added, updated };
}

module.exports = {
  pool,
  getAccount,
  listAccounts,
  findTwin,
  setPin,
  noteFailure,
  noteSuccess,
  createSession,
  findSession,
  dropSession,
  sweepSessions,
  listMints,
  getMint,
  insertMint,
  updateMint,
  deleteMint,
  setWorked,
  mergeMints,
};
