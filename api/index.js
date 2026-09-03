/* api/index.js — pintu masuk untuk Vercel.
   Semua permintaan (termasuk file statis) diarahkan ke sini lewat vercel.json,
   supaya tidak ada satu file pun yang bisa diambil tanpa lewat cek sesi. */
"use strict";

const app = require("../server/app");

module.exports = (req, res) => app.safeHandle(req, res);
