/* app.js — seluruh logika request. Dipakai dua kali:
     server/server.js  -> server biasa di laptop
     api/index.js      -> fungsi serverless di Vercel

   Aturan akses:
     /login/*   publik  — halaman masuk saja, tanpa data apa pun
     /api/login publik  — dibatasi laju percobaan
     /app/*     TERKUNCI — HTML/CSS/JS aplikasi baru dikirim setelah login
     /api/*     TERKUNCI — semua data

   Catatan Vercel: tidak ada folder `public/` di root proyek, karena Vercel
   akan menyajikannya langsung lewat CDN tanpa lewat kode ini — kuncinya jebol.
   Semua file statis ada di `web/` dan hanya keluar lewat fungsi ini. */
"use strict";

require("./env"); // wajib paling atas: db.js membaca DATABASE_URL saat dimuat

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const db = require("./db");
const auth = require("./auth");
const validate = require("./validate");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "web", "app");
const LOGIN_DIR = path.join(ROOT, "web", "login");

const ON_VERCEL = !!process.env.VERCEL;
// di Vercel semuanya lewat https, jadi cookie wajib Secure
const SECURE_COOKIE = ON_VERCEL || process.env.SECURE_COOKIE === "true";
const COOKIE = "mt_session";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

/* ---------- util respons ---------- */

function baseHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (SECURE_COOKIE) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function csp(res, allowMirrors) {
  const connect = allowMirrors
    ? "'self' https://api.fxtwitter.com https://api.vxtwitter.com"
    : "'self'";
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "media-src 'self' data:",
      `connect-src ${connect}`,
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
}

function json(res, code, body) {
  baseHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(code);
  res.end(JSON.stringify(body));
}

function redirect(res, to) {
  baseHeaders(res);
  res.writeHead(302, { Location: to });
  res.end();
}

/* ---------- cookie ---------- */

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(res, token, maxAgeSec) {
  const bits = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSec}`];
  if (SECURE_COOKIE) bits.push("Secure");
  res.setHeader("Set-Cookie", bits.join("; "));
}

/* ---------- body ---------- */

function readBody(req, limit = 512 * 1024) {
  // Vercel kadang sudah membaca dan mem-parse body lebih dulu
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try { return Promise.resolve(JSON.parse(req.body)); } catch (err) { return Promise.reject(new Error("JSON tidak valid")); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return Promise.resolve(JSON.parse(req.body.toString("utf8"))); } catch (err) { return Promise.reject(new Error("JSON tidak valid")); }
    }
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body terlalu besar"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error("JSON tidak valid"));
      }
    });
    req.on("error", reject);
  });
}

/* ---------- rem laju per IP ----------
   Di Vercel tiap instance punya Map sendiri, jadi ini cuma lapis pertama.
   Penjaga yang sebenarnya adalah penguncian akun di database. */

const hits = new Map();
function throttled(ip, max, windowMs) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.until) {
    hits.set(ip, { n: 1, until: now + windowMs });
    return false;
  }
  rec.n += 1;
  return rec.n > max;
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return ((req.socket && req.socket.remoteAddress) || "?").replace(/^::ffff:/, "");
}

/* ---------- file statis ---------- */

async function sendFile(res, dir, relPath, opts = {}) {
  // path traversal: resolve dulu, lalu pastikan masih di dalam dir
  const full = path.resolve(dir, "." + path.posix.normalize("/" + relPath));
  const base = path.resolve(dir);
  if (!full.startsWith(base + path.sep) && full !== base) {
    return json(res, 403, { error: "terlarang" });
  }
  let data;
  try {
    data = await fsp.readFile(full);
  } catch (err) {
    return json(res, 404, { error: "tidak ditemukan" });
  }
  const ext = path.extname(full).toLowerCase();
  baseHeaders(res);
  csp(res, !!opts.allowMirrors);
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  // jangan cache HTML — biar halaman terkunci tidak nyangkut setelah logout
  res.setHeader("Cache-Control", ext === ".html" ? "no-store" : "private, max-age=300");
  res.writeHead(200);
  res.end(data);
}

/* ---------- sesi ---------- */

async function currentAccount(req) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length > 200) return null;
  try {
    return await db.findSession(auth.hashToken(token));
  } catch (err) {
    console.error("[sesi]", err.message);
    return null;
  }
}

/* ---------- rute API ---------- */

async function apiLogin(req, res) {
  if (throttled(clientIp(req), 12, 5 * 60 * 1000)) {
    return json(res, 429, { error: "Terlalu banyak percobaan. Tunggu beberapa menit." });
  }

  const body = await readBody(req, 2048);
  const who = validate.account(body.account);
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!who) return json(res, 400, { error: "Akun tidak dikenal." });

  const acc = await db.getAccount(who);
  if (!acc) return json(res, 400, { error: "Akun tidak dikenal." });

  if (acc.locked_until && new Date(acc.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(acc.locked_until) - Date.now()) / 60000);
    return json(res, 429, { error: `Terkunci sementara. Coba lagi ${mins} menit lagi.` });
  }

  // PIN belum pernah dibuat -> pendaftaran pertama
  if (!acc.pin_hash) {
    if (!auth.validPin(pin)) {
      return json(res, 400, { error: `PIN minimal ${auth.MIN_PIN} karakter.` });
    }
    const { salt, hash } = await auth.hashPin(pin);
    await db.setPin(who, salt, hash);
  } else {
    const ok = await auth.verifyPin(pin, acc.pin_salt, acc.pin_hash);
    if (!ok) {
      const st = await db.noteFailure(who);
      const left = Math.max(0, auth.MAX_FAILED - (st ? st.failed_count : 0));
      return json(res, 401, {
        error: left > 0 ? `PIN salah. Sisa ${left} percobaan.` : `PIN salah. Terkunci ${auth.LOCK_MINUTES} menit.`,
      });
    }
  }

  await db.noteSuccess(who);
  // di serverless tidak ada timer latar; sapu sesi kedaluwarsa sekalian di sini
  db.sweepSessions().catch(() => {});
  const s = auth.newSession();
  await db.createSession(who, s.hash, s.expiresAt, req.headers["user-agent"]);
  setCookie(res, s.token, auth.SESSION_DAYS * 86400);
  return json(res, 200, { account: who });
}

async function apiLogout(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) {
    try { await db.dropSession(auth.hashToken(token)); } catch (err) { /* abaikan */ }
  }
  setCookie(res, "", 0);
  return json(res, 200, { ok: true });
}

async function apiRoutes(req, res, url, me) {
  const p = url.pathname;
  const method = req.method;

  if (p === "/api/session" && method === "GET") {
    return json(res, 200, { account: me });
  }

  if (p === "/api/mints" && method === "GET") {
    return json(res, 200, await db.listMints());
  }

  if (p === "/api/mints" && method === "POST") {
    const parsed = validate.mint(await readBody(req));
    if (!parsed.ok) return json(res, 400, { error: parsed.error });

    // tolak jadwal kembar persis — penyebab kartu dobel di "Sudah Lewat"
    if (await db.findTwin(parsed.value)) {
      return json(res, 409, {
        error: `"${parsed.value.name}" pada jam itu sudah ada. Ubah nama atau jamnya kalau memang beda.`,
      });
    }

    const id = crypto.randomUUID();
    return json(res, 201, await db.insertMint(id, parsed.value, me));
  }

  if (p === "/api/mints/import" && method === "POST") {
    const parsed = validate.mintList(await readBody(req, 2 * 1024 * 1024));
    if (!parsed.ok) return json(res, 400, { error: parsed.error });
    const stat = await db.mergeMints(parsed.value, me);
    return json(res, 200, Object.assign(stat, { mints: await db.listMints() }));
  }

  const one = p.match(/^\/api\/mints\/([A-Za-z0-9_-]{1,64})$/);
  if (one) {
    const id = one[1];
    if (method === "PUT") {
      const parsed = validate.mint(await readBody(req));
      if (!parsed.ok) return json(res, 400, { error: parsed.error });
      const row = await db.updateMint(id, parsed.value);
      return row ? json(res, 200, row) : json(res, 404, { error: "tidak ditemukan" });
    }
    if (method === "DELETE") {
      const gone = await db.deleteMint(id);
      return gone ? json(res, 200, { ok: true }) : json(res, 404, { error: "tidak ditemukan" });
    }
  }

  const worked = p.match(/^\/api\/mints\/([A-Za-z0-9_-]{1,64})\/worked$/);
  if (worked && method === "POST") {
    const body = await readBody(req, 2048);
    const who = validate.account(body.account);
    if (!who) return json(res, 400, { error: "akun tidak dikenal" });
    const row = await db.setWorked(worked[1], who, body.on === true);
    return row ? json(res, 200, row) : json(res, 404, { error: "tidak ditemukan" });
  }

  return json(res, 404, { error: "rute tidak dikenal" });
}

/* ---------- router utama ---------- */

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  // API publik
  if (p === "/api/login" && req.method === "POST") return apiLogin(req, res);
  if (p === "/api/logout" && req.method === "POST") return apiLogout(req, res);
  if (p === "/api/accounts" && req.method === "GET") {
    return json(res, 200, await db.listAccounts());
  }

  const me = await currentAccount(req);

  if (p === "/") return redirect(res, me ? "/app/" : "/login/");

  // halaman login — publik, tapi tidak boleh diakses kalau sudah masuk
  if (p === "/login" || p === "/login/") {
    if (me) return redirect(res, "/app/");
    return sendFile(res, LOGIN_DIR, "login.html");
  }
  if (p.startsWith("/login/")) {
    return sendFile(res, LOGIN_DIR, p.slice("/login/".length));
  }

  // semua di bawah ini butuh sesi
  if (!me) {
    if (p.startsWith("/api/")) return json(res, 401, { error: "belum masuk" });
    return redirect(res, "/login/");
  }

  if (p.startsWith("/api/")) return apiRoutes(req, res, url, me);

  // garis miring di akhir itu wajib — path relatif di dalam halaman ikut ke situ
  if (p === "/app") return redirect(res, "/app/");
  if (p === "/app/") {
    return sendFile(res, APP_DIR, "app.html", { allowMirrors: true });
  }
  if (p.startsWith("/app/")) {
    return sendFile(res, APP_DIR, p.slice("/app/".length), { allowMirrors: true });
  }

  return json(res, 404, { error: "tidak ditemukan" });
}

/** Bungkus handle() dengan penangkap error, supaya detail internal tidak bocor. */
function safeHandle(req, res) {
  return handle(req, res).catch((err) => {
    console.error("[error]", req.method, req.url, "-", err.message);
    if (!res.headersSent) json(res, 500, { error: "terjadi kesalahan di server" });
    else res.end();
  });
}

module.exports = { handle, safeHandle, ON_VERCEL, SECURE_COOKIE };
