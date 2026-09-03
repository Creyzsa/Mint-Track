/* env.js — baca .env sekali, sebelum modul lain menyentuh process.env.
   HARUS di-require paling atas (db.js membaca DATABASE_URL saat dimuat).
   Di Vercel tidak ada file .env; nilainya diisi dari dashboard, jadi ini no-op. */
"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", ".env");

if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

module.exports = {};
