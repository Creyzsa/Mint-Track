# Mint Tracker — Girl power

Catat **semua jadwal crypto** di satu tempat — whitelist, presale, public mint, airdrop, raffle, snapshot, TGE — dari chain atau marketplace mana pun. Countdown jalan otomatis dan barisnya pindah sendiri ke **Sudah Lewat** setelah waktunya.

Sekarang berjalan di atas **Node.js + PostgreSQL**. Semua jadwal dan PIN tersimpan di
database, bukan lagi di browser — jadi Chishiya dan Creyzsa **melihat data yang sama
secara langsung**, tanpa tukar file lagi.

**Sudah online:** <https://mint-tracker-kohl.vercel.app> — ini yang dipakai berdua.
Detailnya di [DEPLOY.md](DEPLOY.md).

Versi laptop (`npm start`, database lokal) juga masih jalan; datanya terpisah.
Cara pasangnya ada di [SETUP.md](SETUP.md).

## Keamanan — apa yang dijaga, apa yang tidak

Kamu minta "jangan sampai bisa dilihat orang lain". Ini batas jujurnya:

**Yang benar-benar terkunci:**

- **Isi aplikasi hanya dikirim setelah login.** `app.html`, seluruh CSS dan JS ada di
  balik cek sesi. Yang belum masuk cuma dapat halaman login — HTML/JS aplikasinya tidak
  bisa diunduh sama sekali.
- **Kode server tidak pernah sampai ke browser.** Isi `server/` dan `.env` tidak
  dilayani sebagai file statis.
- **PIN tidak pernah keluar dari server.** Disimpan sebagai scrypt hash + salt acak
  (N=32768). Tidak ada satu endpoint pun yang mengembalikannya.
- **Token sesi disimpan sebagai SHA-256.** Bocornya tabel `sessions` tidak bisa dipakai
  menyamar jadi kalian.
- **Cookie `HttpOnly` + `SameSite=Strict`** — tidak bisa dibaca JavaScript, tidak ikut
  terkirim dari situs lain (menutup CSRF).
- **Semua query pakai parameter** — tidak ada SQL yang dirakit dari input, jadi SQL
  injection tertutup.
- **Input divalidasi dengan allowlist** di `server/validate.js`. Link hanya boleh
  `http`/`https`, jadi `javascript:` tidak bisa masuk.
- **Rem laju**: 5 PIN salah → akun terkunci 5 menit; 12 percobaan per IP per 5 menit.
- **Header pengaman**: CSP ketat, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

**Yang TIDAK bisa dijanjikan — tolong dibaca:**

1. **Kode frontend selalu bisa dilihat oleh yang sudah login.** Browser harus mengunduh
   HTML/CSS/JS untuk menjalankannya — itu berlaku untuk semua website di dunia, termasuk
   punya bank. Yang bisa dilakukan cuma membatasi *siapa* yang boleh mengunduh, dan itu
   sudah dilakukan. Tidak ada cara menyembunyikannya dari kalian berdua sendiri.
2. **Tidak ada yang bisa menjamin "tidak bisa di-hack".** Yang ada: praktik yang benar
   (di atas) dan tanggung jawab kalian — PIN yang kuat, `.env` yang tidak dibagikan,
   dan Node/PostgreSQL yang rutin diperbarui.
3. **Tanpa HTTPS, PIN lewat sebagai teks biasa.** Aman kalau cuma di `127.0.0.1`.
   Begitu dibuka ke jaringan, wajib HTTPS — lihat SETUP.md.
4. **Yang punya akses ke laptop server, punya akses ke database.** Tidak ada enkripsi
   yang bisa menahan itu.

## Masuk

Buka app → **layar login**, pilih **CHISHIYA** atau **CREYZSA**.

- Pertama kali masuk kamu diminta **membuat PIN** (minimal 4 karakter). Setelah itu tinggal ketik PIN-nya.
- Sesi berlaku 30 hari, jadi tidak perlu login tiap buka. Tombol **Keluar** di kanan atas.
- Salah PIN 5 kali → akun terkunci 5 menit.
- **Lupa PIN direset lewat database**, bukan tombol di layar — tombol "Lupa PIN" itu lubang keamanan, jadi saya hapus. Perintahnya ada di [SETUP.md](SETUP.md).

Setelah masuk, **seluruh halaman jadi warnamu**: pink untuk Creyzsa, biru untuk Chishiya.

## Mode fokus (bawaan)

Begitu login, kamu **cuma melihat jadwalmu sendiri** — punyamu, plus yang ditandai **Kita Berdua**. Countdown, statistik, tabel Sudah Lewat, semuanya ikut menyempit ke punyamu. Jadi tidak terganggu garapan orang lain.

**Akan Datang** dan **Sudah Lewat** tampil **selebar bloknya**, satu kolom penuh. Pembagian dua kolom hanya terjadi kalau kamu pencet Compare.

### Model pemilik & partner

Tiap garapan punya **satu pemilik** — akun yang memposting. Akun satunya berperan
sebagai **partner**.

| Keadaan | Pemilik | Partner |
|---|---|---|
| Belum lewat | tampil normal, **tidak ada tombol Garap** | tampil di Compare, tidak ada tombol |
| Sudah lewat | **otomatis selesai**, langsung masuk Sudah Lewat-nya | tombol **Garap** muncul di Compare |
| Partner klik Garap | — | baru masuk Sudah Lewat punya partner |

Contoh: Creyzsa posting garapan X. Begitu waktunya lewat, X otomatis nongol di Sudah
Lewat-nya Creyzsa tanpa dia klik apa pun. Chishiya membuka Compare, melihat X di kolom
CREYZSA dengan tombol **Garap**. Setelah diklik, X baru nongol juga di Sudah Lewat-nya
Chishiya. Berlaku sebaliknya.

Otomatis-selesai untuk pemilik dikerjakan **di server**, jadi hasilnya sama untuk kedua
akun — tidak bergantung siapa yang kebetulan membuka halaman lebih dulu.

### Sudah Lewat berubah arti tergantung mode

**Di akunmu sendiri** — isinya yang **sudah selesai menurut kamu**: garapanmu sendiri
(masuk otomatis begitu lewat) ditambah garapan partner yang sudah kamu klik Garap.

**Di Compare** — semua yang sudah lewat dari kedua akun, dipecah per pemilik. Kolom
partner memberi label `N menunggu kamu garap`, dan kartunya punya tombol **Garap**.

| | Akun sendiri | Compare |
|---|---|---|
| Akan Datang | garapanmu saja | dua kolom, semua |
| Sudah Lewat | yang **selesai menurut kamu** | semua, per pemilik + tombol Garap |

Tiap kartu yang sudah lewat menampilkan dua chip status: `✓ CREYZSA (pemilik)` dan
`✓ CHISHIYA` atau `⚠ CHISHIYA belum garap`. **Satu garapan = satu kartu** — kedua
status muncul berdampingan di kartu yang sama, tidak pernah dipecah jadi dua kartu.

### Jadwal kembar ditolak

Menyimpan garapan dengan **nama, jam, dan pemilik yang persis sama** akan ditolak
server dengan pesan jelas. Ini sempat kejadian: "Crafthood" tersimpan dua kali
berselang 18 menit, dan di Sudah Lewat kelihatan seperti kartu dobel padahal memang
dua baris berbeda di database. Beda nama atau beda jam tetap boleh.

Jadwal lama juga tidak lagi menghitung mundur — tertulis `10 hari lalu`.

### Panelnya punya scroll sendiri

Berapa pun banyaknya jadwal, **Akan Datang** dan **Sudah Lewat** tidak akan
memanjangkan halaman. Masing-masing dibatasi tingginya dan discroll di dalam
panelnya (56% tinggi layar; 72% di HP). Judul kolom tabel **Sudah Lewat** menempel
di atas saat discroll, jadi tidak hilang.

Jadwal baru otomatis jadi punyamu. Bisa diubah lewat kolom **Punya siapa**: `CHISHIYA` · `CREYZSA` · `Kita Berdua`.

## Tombol Compare

Pencet **Compare** di kanan atas → tampilan pecah jadi dua kolom:

```
┌── CREYZSA  [kamu] ────┬── CHISHIYA ───────────┐
│  MOONBERA  Kita Berdua│  SUIPUNK              │
│  ⚠ CHISHIYA sudah     │  Belum digarap        │
│    garap — CREYZSA    │                       │
│    belum              │  MOONBERA  Kita Berdua│
│                       │  ✓ Sudah digarap      │
│  PEPE2.0              │    CHISHIYA           │
│  ✓ Sudah digarap      │                       │
└───────────────────────┴───────────────────────┘
```

- **Kiri selalu kamu** (ada label `kamu`), kanan temanmu — jadi sudut pandangnya sama buat kalian berdua
- Jadwal **Kita Berdua** muncul di **dua kolom sekaligus** — itu yang bikin bisa dibandingkan
- Tombol **Garap** berlaku untuk **kolom tempat kartu itu berada**. Jadi kalau Chishiya lupa menandai, Creyzsa bisa bantu tandai dari kolom Chishiya.
- Pencet **✕ Tutup compare** untuk kembali fokus ke punyamu

### Kalau salah satu belum garap

Tiga keadaan, tiga warna:

| Tampilan | Artinya |
|---|---|
| 🟢 `✓ Sudah digarap NAMA` | Orang di kolom itu sudah menggarapnya |
| 🟡 `⚠ NAMA sudah garap — NAMA belum` | Kartu jadi **kuning** — temanmu sudah, kamu belum |
| ⚪ `Belum digarap` | Belum ada yang pegang |

Di atas papan juga muncul **pita peringatan kuning**, isinya nama-nama jadwal yang sudah digarap temanmu tapi kamu belum — dan pita ini **muncul juga di mode fokus**, jadi begitu buka app langsung kelihatan apa yang ketinggalan tanpa perlu pencet Compare dulu.

Pendukungnya: kartu statistik **Belum digarap** dan chip filter **Belum digarap** untuk menyaring yang masih kosong.

## Data bersama

Semua jadwal ada di satu database PostgreSQL, jadi begitu Chishiya menandai sesuatu
digarap, kamu tinggal muat ulang dan langsung kelihatan. Tidak perlu tukar file lagi.

Import JSON tetap ada untuk memindahkan data lama dari versi localStorage. Servernya
**menggabungkan di dalam satu transaksi**, bukan menimpa:

- Jadwal yang belum ada → ditambahkan
- Jadwal yang id-nya sama → diambil versi yang paling baru diubah
- Tanda **digarap** dari kedua sisi **disatukan**

> Catatan: halaman tidak memuat ulang sendiri. Kalau Chishiya baru mengubah sesuatu,
> refresh dulu untuk melihatnya.

## Cara buka

```powershell
npm start
```

Lalu buka [http://127.0.0.1:5173](http://127.0.0.1:5173). Langkah pasang pertama kali ada di [SETUP.md](SETUP.md).

## Tarik link X → form keisi sendiri

Tiga cara masuk, semuanya berakhir di form yang sudah terisi:

- **Tarik** link X-nya ke mana saja di halaman → dialog kebuka, langsung diproses
- **<kbd>Ctrl</kbd>+<kbd>V</kbd>** di halaman utama (tanpa buka dialog dulu)
- **Tempel** ke kotak paling atas dialog, lalu Enter / tombol **Isi**

Yang ditebak: **nama proyek · tipe · chain · platform · @sumber · status · harga · supply · link · tanggal & jam**. Kalau caption-nya menyebut jam, jam + tanggalnya langsung masuk ke picker (zona waktu ikut dikonversi ke WIB). Kalau tidak ada, tinggal klik sendiri di kalender.

Field yang **sudah kamu isi tidak pernah ditimpa** — yang keisi cuma yang masih kosong. Di bawah kotaknya ada baris keterangan: field mana saja yang barusan terisi.

### Kenapa ada toggle "Ambil caption otomatis"

x.com memblokir akses langsung dari browser, jadi **dari link saja** yang bisa didapat cuma `@handle` + link itu sendiri.

Untuk baca caption-nya, halaman ini harus minta ke layanan pihak ketiga (`api.fxtwitter.com`, fallback `api.vxtwitter.com`). Karena itu artinya link kamu dikirim keluar, toggle-nya **default mati** — tidak ada satu pun request keluar sampai kamu sendiri yang mencentangnya. Sekali dicentang, pilihannya tersimpan.

Kalau tidak mau ada request keluar sama sekali: **copy teks caption-nya** (bukan cuma link) lalu tempel. Hasilnya sama lengkap, 100% offline.

Kalau tweet-nya privat / dihapus / layanan mirror-nya lagi down, statusnya bilang gagal dan kamu tinggal isi manual — tidak ada yang rusak.

## Isi waktu tanpa ngetik

Ini bagian yang paling sering dipakai, jadi dibuat klik-klik saja:

| Cara | Kapan dipakai |
|---|---|
| **Chip cepat** | `Hari ini` · `Besok` · `Lusa` · `+7 hari` · `+30 hari` |
| **Kalender** | Klik tanggalnya. Titik hijau kecil = sudah ada jadwal lain di hari itu. |
| **Grid jam 00–23** | Klik jamnya langsung, tidak perlu scroll atau ketik. |
| **Chip menit** | Kelipatan 5 menit: `00` `05` `10` … `55` |
| **Geser** | `−1 jam` `−5 mnt` `+5 mnt` `+1 jam` `+1 hari` |
| **Toggle WIB / UTC** | Kalau pengumumannya pakai UTC, klik `UTC`, isi jam UTC-nya — otomatis dikonversi ke WIB. |

Di bawah picker selalu ada baris konfirmasi: hari, tanggal lengkap, jam WIB, jam UTC, dan sisa waktunya. Kalau tanggalnya sudah lewat, baris itu berubah merah.

Format teks yang dikenali antara lain:

```
Aug 25, 8PM UTC          Sept 5th 2026, 9:00 AM EST
25/08 20:00 WIB          2026-09-01 14:30 UTC
30 Sep, 14:00 SGT        15 Des 2026 jam 19.30
besok 21:00              in 2 hours  /  3 jam lagi
1767225600               (unix timestamp)
```

Tanpa tahun → diambil tahun terdekat yang belum lewat. Tanpa tanggal → hari ini, atau besok kalau jamnya sudah lewat.

## Yang bisa dilacak

Tiap baris menyimpan:

- **Punya siapa** — CHISHIYA · CREYZSA · Berdua
- **Tipe** — `WL` · `PRESALE` · `MINT` · `AIRDROP` · `TGE` · `RAFFLE` · `SNAP` · `LAIN` (badge berwarna, bisa difilter)
- **Status** — Pantau → Sudah daftar → Dapat WL → Siap mint → Kena / minted · Kelewat · Skip (bisa diganti langsung dari tabel, tanpa buka dialog)
- **Chain** (ETH, SOL, Base, …) dan **platform / launchpad** (Magic Eden, Tensor, Premint, Galxe, …)
- **Sumber (X)** — otomatis jadi link ke profilnya
- **Jadwal** — WIB, plus jam UTC-nya ikut ditampilkan
- **Harga** dan **supply**
- **Link**, **catatan**, dan **hasil / catatan akhir** untuk yang sudah lewat

## Pengingat & bunyi

**Pengingat berbunyi di kedua akun untuk semua garapan** — punyamu maupun punya
partner, tanpa perlu buka Compare. Selama halamannya terbuka, kalian berdua berbunyi
di detik yang sama.

Supaya itu berlaku juga untuk garapan yang **baru diinput setelah halamanmu terbuka**,
daftarnya diambil ulang dari server **tiap 30 detik** (dan langsung saat kamu kembali
ke tab). Tanpa itu, browsermu tidak akan pernah tahu garapan itu ada.

Alarm untuk garapan partner menyebut namanya — `WL BITCOINCAT (CHISHIYA) — 5 menit
lagi` — karena kartunya memang tidak tampil di halaman pribadimu. Panel Akan Datang
juga memberi tahu berapa garapan partner yang ikut berbunyi di situ.

Dua aba-aba per jadwal, tidak lebih:

| Kapan | Bunyi | Yang terjadi |
|---|---|---|
| **5 menit sebelum** | `assets/warn.mp3` | Sekali bunyi + notifikasi biasa. Aba-aba siap-siap. |
| **Tepat jam-nya** | `assets/notif.mp3` | **Berdering ±20 detik** + notifikasi yang tidak hilang sendiri sampai diklik. Ini yang bikin kamu sadar saatnya cek postingan. |

Dua bunyi sengaja dibedakan supaya kamu tahu mana yang mana tanpa melihat layar.

Deringnya berhenti kalau kamu **klik / tekan tombol apa saja**, atau otomatis setelah 20 detik. Toast di pojok kanan bawah ikut hilang saat dering berhenti.

Mau ubah angkanya? Dua baris di atas `js/app.js`:

```js
var REMINDERS = [ { key: "5m", mins: 5 } ];   // tambah { key: "1h", mins: 60 } dst
var RING_SECONDS = 20;                        // panjang dering saat mulai
```

Kalau salah satu file tidak ada, slot itu otomatis pakai chime bawaan yang dibangkitkan Web Audio — jadi tidak pernah bisu.

- Tombol **Bunyi** di kanan atas: klik = tes **dua-duanya** berurutan, klik lagi dalam 3 detik = matikan. Titiknya hijau kalau aktif, dan tooltip-nya menunjukkan file yang sedang dipakai tiap slot.
- **Ganti bunyi tanpa buka folder:** tarik file audio apa pun (`.mp3` `.wav` `.ogg` `.m4a` `.opus`, maks 1,5 MB) ke halaman, lalu pilih **Aba-aba 5 menit** atau **Dering saat mulai**. Langsung dipakai dan tersimpan.
- Atau timpa saja `assets/warn.mp3` / `assets/notif.mp3` di folder ini.
- Notifikasi browser dikirim dengan `silent: true` selama bunyi aktif, biar tidak dobel dengan bunyi bawaan Windows.
- Bunyi tetap jalan walau izin notifikasi ditolak — jadi masih ada aba-aba.

Dua catatan jujur:

1. **Tab harus tetap terbuka.** Ini halaman statis tanpa service worker — kalau tab-nya ditutup, tidak ada yang menghitung mundur.
2. **Tidak ada alarm susulan.** Kalau kamu buka app jam 19:57 untuk mint jam 20:00, aba-aba 5 menit sudah lewat — itu dilewati diam-diam, bukan dibunyikan susulan. Yang kamu dapat cuma dering jam 20:00. Sama halnya saat menambah jadwal yang tinggal beberapa menit.

### Tiap perangkat berbunyi sendiri-sendiri

Pengingat dihitung **di masing-masing browser**, bukan dikirim dari server. Jadi
selama halamannya terbuka, HP Chishiya dan laptop Creyzsa berbunyi **bersamaan** —
tidak peduli siapa yang memposting garapannya.

Dering panjang saat waktunya tiba juga **berhenti per perangkat**. Creyzsa mengklik
untuk mematikan di laptopnya; di HP Chishiya deringnya jalan terus sampai dia sendiri
yang mematikan. Tidak ada yang bisa mematikan alarm orang lain.

### Kalau ada perangkat yang diam

Browser melarang audio berbunyi sebelum halamannya **disentuh sekali**. Perangkat yang
cuma dibuka lalu ditinggal akan **diam total**.

Sekarang keadaannya dideteksi dan ditampilkan: kalau bunyi masih terkunci, muncul pita
kuning di paling atas — *"🔇 Bunyi pengingat belum aktif di perangkat ini — klik di
sini supaya alarmnya bisa keluar."* Sekali diklik, pita hilang dan bunyi uji langsung
diputar sebagai bukti. Sentuhan apa pun di halaman juga membukanya.

**Ini berlaku per perangkat.** Creyzsa membuka kuncinya di laptopnya tidak membuka
kunci di HP Chishiya — dia harus menyentuh layarnya sendiri sekali.

## Fitur lain

- Countdown live ke jadwal terdekat, plus ringkasan: akan datang / dalam 24 jam / WL–raffle–presale / sudah lewat
- Filter cepat per tipe dan per status, plus pencarian bebas
- **Duplikat** — dari baris WL langsung bikin baris MINT-nya, isian lain ikut tersalin
- **Kalender** per baris → buka Google Calendar dengan detail terisi
- Export **JSON** (backup), **Markdown** (Notion / Obsidian), **.ics** (import ke Google / Apple Calendar, sudah termasuk alarm 15 menit)
- Import JSON — data lama dari versi sebelumnya otomatis ikut terbaca
- Tekan <kbd>N</kbd> di halaman utama untuk tambah cepat

## Struktur file

```
server/                 TIDAK PERNAH dikirim ke browser
  server.js             HTTP server, rute, gerbang sesi, header keamanan
  db.js                 semua query PostgreSQL (parameterised)
  auth.js               scrypt PIN, token sesi
  validate.js           allowlist untuk semua input
  schema.sql            tabel

login/                  publik — halaman masuk saja
  login.html/.css/.js   tipis, tanpa data dan tanpa rahasia

public/                 TERKUNCI di balik sesi
  app.html              tampilan aplikasi
  css/styles.css        gaya
  assets/warn.mp3       bunyi aba-aba 5 menit
  assets/notif.mp3      bunyi dering saat waktunya tiba
  js/api.js             satu-satunya jalur frontend ke server
  js/time.js            konversi & format WIB, pembaca teks jadi tanggal
  js/sound.js           dua slot bunyi, dering panjang, chime cadangan
  js/extract.js         tebak field dari link / caption X
  js/picker.js          kalender + pemilih jam tanpa ngetik
  js/app.js             tampilan, filter, pengingat, export

.env                    kredensial — jangan dibagikan, sudah di .gitignore
```

## Catatan

- Semua jam dipatok **WIB (`+07:00`)**, bukan jam laptop — jadi tetap konsisten kalau kamu lagi di luar Indonesia.
- Backup berkala lewat **Export → JSON** supaya data tidak hilang kalau cache browser dibersihkan.
