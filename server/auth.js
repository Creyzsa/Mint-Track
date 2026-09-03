/* auth.js — PIN & sesi.
   Aturan yang dipegang di sini:
   - PIN tidak pernah disimpan apa adanya. Yang masuk DB hanya scrypt hash + salt acak.
   - PIN tidak pernah keluar dari server dalam bentuk apa pun.
   - Token sesi disimpan sebagai SHA-256; token aslinya cuma ada di cookie.
   - Perbandingan pakai timingSafeEqual supaya tidak bisa ditebak lewat selisih waktu. */
"use strict";

const crypto = require("crypto");

// Parameter scrypt. N=2^15 butuh ~32 MB per hash — berat untuk penebak,
// tidak terasa untuk login sesekali.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

const SESSION_DAYS = 30;
const MIN_PIN = 4;
const MAX_PIN = 64;
const MAX_FAILED = 5;
const LOCK_MINUTES = 5;

function scrypt(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, SCRYPT.keylen, SCRYPT, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: await scrypt(pin, salt) };
}

async function verifyPin(pin, salt, expected) {
  if (!salt || !expected) return false;
  const actual = await scrypt(pin, salt);
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validPin(pin) {
  return typeof pin === "string" && pin.length >= MIN_PIN && pin.length <= MAX_PIN;
}

/** Token acak 256-bit. Yang dikembalikan: token untuk cookie + hash untuk DB. */
function newSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  SESSION_DAYS,
  MIN_PIN,
  MAX_PIN,
  MAX_FAILED,
  LOCK_MINUTES,
  hashPin,
  verifyPin,
  validPin,
  newSession,
  hashToken,
};
