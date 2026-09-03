Folder ini sengaja hampir kosong. Jangan dihapus.

`vercel.json` mengarahkan "outputDirectory" ke sini. Tanpa itu, Vercel memakai
root repo sebagai folder statis dan CDN akan menyajikan server/*.js serta web/**
langsung ke siapa pun — melewati cek sesi.

Pernah kejadian saat deploy pertama: /server/db.js dan /web/app/js/app.js bisa
diunduh tanpa login. Perbaikannya adalah folder ini.

Apa pun yang ditaruh di sini bisa diakses PUBLIK tanpa login. Jadi jangan
menaruh apa pun selain robots.txt.
