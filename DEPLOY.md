# Deploy ke Vercel

> **SUDAH LIVE:** <https://mint-tracker-kohl.vercel.app>
> Project: `chas-projects-3026b802/mint-tracker` · Database: Neon (us-east-1)
> PIN CHISHIYA dan CREYZSA sudah dibuat.

Kirim link itu ke Chishiya. Dia pilih akun **CHISHIYA**, masukkan PIN-nya, selesai.

## Deploy ulang setelah mengubah kode

```powershell
cd C:\Users\acer\Documents\mint-tracker-robinhood
vercel deploy --prod --yes
```

Kalau `server/schema.sql` berubah, jalankan juga ke database online:

```powershell
$url = (((Get-Content .env.local) | Where-Object { $_ -match '^DATABASE_URL_UNPOOLED=' }) -replace '^DATABASE_URL_UNPOOLED=','').Trim('"')
psql $url -f server\schema.sql
```

---

## Dua akun, dua tempat, dua database

| | Alamat | Database |
|---|---|---|
| Online (dipakai berdua) | <https://mint-tracker-kohl.vercel.app> | Neon, di cloud |
| Laptop (`npm start`) | <http://127.0.0.1:5173> | PostgreSQL di `C:\Users\acer\tools\pgdata` |

Datanya **terpisah**. Jadwal yang kamu tulis di versi online tidak muncul di versi
laptop, dan sebaliknya. Untuk berdua, pakai yang online saja.

Kalau ada jadwal di versi laptop yang mau dipindah: **Export → JSON** di laptop, lalu
**Import JSON** di versi online. Import menggabungkan, tidak menimpa.

## Yang berubah supaya jalan di Vercel

Vercel tidak menjalankan server yang hidup terus, jadi tiga hal disesuaikan:

1. **Folder `public/` diganti nama jadi `web/`.** Ini penting: Vercel menyajikan
   folder bernama `public/` langsung lewat CDN, **tanpa lewat kode kita** — kunci
   loginnya akan jebol dan siapa pun bisa mengunduh `app.js`. Sekarang semua file
   keluar lewat fungsi, jadi cek sesi tetap berlaku.
2. **Logika request dipindah ke `server/app.js`**, dipakai bersama oleh
   `server/server.js` (laptop) dan `api/index.js` (Vercel). Satu kode, dua tempat
   jalan — tidak ada versi yang ketinggalan.
3. **Kolam koneksi database jadi 1 per instance** saat di Vercel, supaya kuota
   koneksi Neon tidak habis waktu banyak instance hidup bersamaan.

---

## Setelah online — yang perlu kamu tahu

**Link-nya bisa dibuka siapa saja di internet.** Yang menjaga cuma PIN kalian. Halaman
login memang terbuka (harus, supaya bisa login), tapi isi aplikasi — `app.html`, CSS,
seluruh JS — tetap tidak bisa diunduh tanpa sesi yang sah. Sudah saya uji.

Karena itu: **pakai PIN yang panjang.** Bukan `1234`. Kalau link-nya bocor, PIN
adalah satu-satunya pintu.

**Jangan nyalakan "Vercel Authentication"** di Settings → Deployment Protection.
Itu mengharuskan pengunjung punya akun Vercel dengan akses ke project-mu — Chishiya
akan tertolak. Kunci kita sendiri sudah cukup.

**Rem laju per IP jadi lebih lemah** di serverless, karena tiap instance punya
hitungan sendiri. Tapi penguncian akun (5x salah → kunci 5 menit) tersimpan di
database, jadi itu tetap berlaku penuh.

**Yang di laptop tetap jalan.** `npm start` masih bisa dipakai dengan database lokal.
Dua-duanya hidup berdampingan, datanya terpisah.

---

## Kalau deploy gagal

Lihat log-nya:

```powershell
vercel logs <url-deployment>
```

Error yang paling sering: `DATABASE_URL` belum diisi, atau tabelnya belum dibuat
di database online (langkah 5 kelewat).
