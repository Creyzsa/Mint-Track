# Pasang & jalankan

> **Sudah terpasang dan sudah diuji di laptop ini.** Bagian "Sudah dilakukan" cuma
> catatan. Yang kamu butuhkan sehari-hari ada di "Cara menjalankan".

## Cara menjalankan

Klik kanan **`start.ps1`** → **Run with PowerShell**. Skripnya menyalakan PostgreSQL
kalau belum hidup, menjalankan server, dan membuka browser.

Atau dari terminal:

```powershell
cd C:\Users\acer\Documents\mint-tracker-robinhood
npm start
```

Lalu buka <http://127.0.0.1:5173>.

**Login pertama kali:** pilih akunmu, ketik PIN yang kamu mau (minimal 4 karakter),
tekan **Simpan & masuk**. PIN itu langsung jadi milikmu. Chishiya melakukan hal yang
sama untuk akunnya.

Untuk berhenti: tekan `Ctrl+C` di jendela server. PostgreSQL boleh dibiarkan hidup.

---

## Sudah dilakukan (tidak perlu diulang)

| Apa | Di mana | Catatan |
|---|---|---|
| Node.js v24.19.0 | `C:\Users\acer\tools\node` | portable, tanpa admin |
| PostgreSQL 17.2 | `C:\Users\acer\tools\pgsql` | portable, tanpa admin |
| Data database | `C:\Users\acer\tools\pgdata` | **ini isi datanya — jangan dihapus** |
| Log PostgreSQL | `C:\Users\acer\tools\pg.log` | |
| Password | `C:\Users\acer\tools\.superpw`, `.apppw` | acak, dibuat saat pasang |
| Konfigurasi | `.env` di folder proyek | sudah terisi |

Dipasang secara portable karena akun Windows-mu bukan administrator — installer biasa
akan tersangkut di prompt UAC. Efek sampingnya justru bagus: tidak ada service yang
jalan diam-diam saat booting, dan menghapusnya cukup dengan membuang folder `tools`.

`node` dan `psql` sudah ditambahkan ke PATH, jadi bisa dipanggil dari terminal mana pun
(buka terminal baru dulu supaya terbaca).

### Yang dikunci saat pemasangan

- PostgreSQL hanya mendengarkan `127.0.0.1` — tidak bisa dihubungi dari jaringan
- Aplikasi memakai user `mint_app`, bukan `postgres`. Haknya cuma
  SELECT/INSERT/UPDATE/DELETE — sudah diuji: mencoba `CREATE TABLE` ditolak
- Password `mint_app` acak 32 karakter, cuma ada di `.env` dan di database

---

## Kalau mau dibuka dari HP atau laptop Chishiya

Sekarang servernya cuma bisa dibuka dari laptop ini (`127.0.0.1`). Itu paling aman.

**Jangan** sekadar mengganti `HOST=0.0.0.0`. Tanpa HTTPS, PIN kalian lewat jaringan
sebagai teks biasa dan bisa dibaca siapa pun yang satu WiFi.

Cara yang benar, pilih salah satu:

**A. Cloudflare Tunnel — paling gampang, gratis**

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:5173
```

Dapat URL `https://...trycloudflare.com`. HTTPS otomatis. Lalu set `SECURE_COOKIE=true`
di `.env` dan jalankan ulang server.

**B. Tailscale** — pasang di kedua perangkat, akses lewat IP Tailscale. Jaringannya
sudah terenkripsi, jadi `HOST=0.0.0.0` aman.

**C. Hosting** (Railway, Render, Fly.io) + Postgres terkelola (Neon, Supabase).
Set `PGSSL=require` dan `SECURE_COOKIE=true`.

Begitu URL-nya bisa diakses dari luar, **satu-satunya penjaga adalah PIN kalian.**
Pakai yang panjang, jangan `1234`.

---

## Perawatan

**Backup** — jalankan sesekali, simpan filenya di tempat aman:

```powershell
pg_dump -U postgres -h 127.0.0.1 mint_tracker > backup-2026-08-23.sql
```

Password `postgres` ada di `C:\Users\acer\tools\.superpw`.

**Lupa PIN** — tidak ada tombol reset di layar (itu lubang keamanan). Reset lewat
database, lalu login berikutnya diminta membuat PIN baru:

```powershell
$env:PGPASSWORD = (Get-Content C:\Users\acer\tools\.superpw -Raw)
psql -U postgres -h 127.0.0.1 -d mint_tracker -c "UPDATE accounts SET pin_hash=NULL, pin_salt=NULL, failed_count=0, locked_until=NULL WHERE id='creyzsa';"
```

**Buka kunci lebih cepat** (salah PIN 5x, malas nunggu 5 menit):

```powershell
psql -U postgres -h 127.0.0.1 -d mint_tracker -c "UPDATE accounts SET failed_count=0, locked_until=NULL;"
```

**Keluarkan semua sesi** (misal HP hilang):

```powershell
psql -U postgres -h 127.0.0.1 -d mint_tracker -c "DELETE FROM sessions;"
```

**Matikan PostgreSQL:**

```powershell
pg_ctl -D C:\Users\acer\tools\pgdata stop
```

**Hapus semuanya** — hentikan server, lalu buang `C:\Users\acer\tools`. Tidak ada
sisa di registry atau Program Files.
