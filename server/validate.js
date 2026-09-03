/* validate.js — semua yang masuk dari browser dibersihkan di sini dulu.
   Prinsipnya allowlist: nilai di luar daftar ditolak, bukan diperbaiki diam-diam. */
"use strict";

const TYPES = ["wl", "presale", "mint", "airdrop", "tge", "raffle", "snapshot", "other"];
const STATUSES = ["watch", "registered", "won", "ready", "minted", "missed", "skipped"];
// pemilik = salah satu dari dua akun; tidak ada lagi opsi "berdua"
const ACCOUNTS = ["chishiya", "creyzsa"];
const OWNERS = ACCOUNTS;

const LIMITS = {
  name: 80,
  chain: 40,
  platform: 40,
  source: 40,
  price: 30,
  supply: 30,
  link: 500,
  notes: 500,
  result: 500,
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function text(value, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > max ? null : t;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function isoDate(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return d.toISOString();
}

function safeLink(value) {
  const t = text(value, LIMITS.link);
  if (t === null) return null;
  if (!t) return "";
  // hanya http/https — menutup javascript:, data:, dan teman-temannya
  let u;
  try {
    u = new URL(t);
  } catch (err) {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.toString();
}

/** @returns {{ok: true, value: object} | {ok: false, error: string}} */
function mint(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "body harus objek" };

  const owner = OWNERS.includes(body.owner) ? body.owner : null;
  if (!owner) return { ok: false, error: "pemilik harus CHISHIYA atau CREYZSA" };

  const out = {
    type: pick(body.type, TYPES, "mint"),
    owner: owner,
    status: pick(body.status, STATUSES, "watch"),
  };

  for (const [field, max] of Object.entries(LIMITS)) {
    if (field === "link") continue;
    const v = text(body[field], max);
    if (v === null) return { ok: false, error: `${field} tidak valid atau terlalu panjang` };
    out[field] = v;
  }
  if (!out.name) return { ok: false, error: "nama proyek wajib diisi" };

  const link = safeLink(body.link);
  if (link === null) return { ok: false, error: "link harus http/https" };
  out.link = link;

  const when = isoDate(body.datetime);
  if (!when) return { ok: false, error: "tanggal & jam tidak valid" };
  out.datetime = when;

  return { ok: true, value: out };
}

function mintId(value) {
  return typeof value === "string" && ID_RE.test(value) ? value : null;
}

function account(value) {
  return ACCOUNTS.includes(value) ? value : null;
}

/** Untuk import JSON: batasi jumlah dan validasi tiap barisnya. */
function mintList(body, max = 500) {
  if (!Array.isArray(body)) return { ok: false, error: "harus berupa array" };
  if (body.length > max) return { ok: false, error: `maksimal ${max} jadwal sekali import` };

  const out = [];
  for (const raw of body) {
    const id = mintId(raw && raw.id);
    if (!id) continue;
    const res = mint(raw);
    if (!res.ok) continue;
    const worked = Array.isArray(raw.worked) ? raw.worked.filter((w) => ACCOUNTS.includes(w)) : [];
    const updatedAt = Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0;
    out.push(Object.assign({ id, worked, updatedAt }, res.value));
  }
  return { ok: true, value: out };
}

module.exports = { mint, mintId, mintList, account, TYPES, STATUSES, OWNERS, ACCOUNTS };
