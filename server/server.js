/* server.js — menjalankan Mint Tracker di laptop sendiri.
   Logikanya ada di server/app.js, dipakai bersama fungsi Vercel di api/index.js. */
"use strict";

const http = require("http");

const app = require("./app"); // memuat ./env lebih dulu di dalamnya
const db = require("./db");

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";

const server = http.createServer(app.safeHandle);
server.headersTimeout = 15000;
server.requestTimeout = 30000;

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL belum diisi. Salin .env.example jadi .env dulu.");
    process.exit(1);
  }
  try {
    await db.pool.query("SELECT 1");
  } catch (err) {
    console.error("Tidak bisa terhubung ke PostgreSQL:", err.message);
    process.exit(1);
  }

  await db.sweepSessions();
  setInterval(() => db.sweepSessions().catch(() => {}), 6 * 3600 * 1000).unref();

  server.listen(PORT, HOST, () => {
    console.log(`Mint Tracker jalan di http://${HOST}:${PORT}`);
    if (!app.SECURE_COOKIE && HOST !== "127.0.0.1" && HOST !== "localhost") {
      console.warn("PERINGATAN: server terbuka ke jaringan tanpa HTTPS — PIN akan lewat sebagai teks biasa.");
    }
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => db.pool.end().then(() => process.exit(0)));
  });
}

start();
