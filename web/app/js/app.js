/* app.js — logika Mint Tracker.
   Data disimpan di localStorage. Waktu selalu ISO WIB (+07:00). */
(function () {
  "use strict";

  var T = window.MintTime;

  var NOTIFY_KEY = "mint-tracker-notified-v2";
  var FILTER_KEY = "mint-tracker-filter-v1";
  var AUTOFETCH_KEY = "mint-tracker-autofetch-v1";
  var VIEW_KEY = "mint-tracker-view-v1";

  /* ---------- kamus ---------- */

  var TYPES = [
    { id: "wl", short: "WL", label: "Whitelist / daftar" },
    { id: "presale", short: "PRESALE", label: "Presale / GTD" },
    { id: "mint", short: "MINT", label: "Public mint" },
    { id: "airdrop", short: "AIRDROP", label: "Airdrop / claim" },
    { id: "tge", short: "TGE", label: "TGE / IDO / listing" },
    { id: "raffle", short: "RAFFLE", label: "Raffle / FCFS" },
    { id: "snapshot", short: "SNAP", label: "Snapshot" },
    { id: "other", short: "LAIN", label: "Lainnya" },
  ];

  // Tiap jadwal punya SATU pemilik (yang memposting). Akun satunya = partner.
  //   pemilik  -> otomatis selesai begitu waktunya lewat
  //   partner  -> baru selesai kalau dia klik "Garap" di halaman Compare
  var PROFILES = ["chishiya", "creyzsa"];
  var OWNERS = [
    { id: "chishiya", label: "CHISHIYA" },
    { id: "creyzsa", label: "CREYZSA" },
  ];

  var STATUSES = [
    { id: "watch", label: "Pantau", tone: "neutral" },
    { id: "registered", label: "Sudah daftar", tone: "info" },
    { id: "won", label: "Dapat WL", tone: "good" },
    { id: "ready", label: "Siap mint", tone: "good" },
    { id: "minted", label: "Kena / minted", tone: "good" },
    { id: "missed", label: "Kelewat", tone: "bad" },
    { id: "skipped", label: "Skip", tone: "neutral" },
  ];

  var typeById = {};
  TYPES.forEach(function (t) { typeById[t.id] = t; });
  var statusById = {};
  STATUSES.forEach(function (s) { statusById[s.id] = s; });
  var ownerById = {};
  OWNERS.forEach(function (o) { ownerById[o.id] = o; });

  // ambang pengingat, urut dari yang paling jauh. Tambah/ubah angkanya di sini.
  var REMINDERS = [
    { key: "5m", mins: 5 },
  ];

  // berapa detik dering saat mint mulai (berhenti lebih awal kalau diklik)
  var RING_SECONDS = 20;

  /* ---------- elemen ---------- */

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    search: $("search"),
    me: $("me"),
    meName: $("me-name"),
    btnCompare: $("btn-compare"),
    filterTypes: $("filter-types"),
    board: $("board"),
    pastBoard: $("past-board"),
    boardNotice: $("board-notice"),
    filterStatus: $("filter-status"),
    upcomingEmpty: $("upcoming-empty"),
    pastTag: $("past-tag"),
    pastHidden: $("past-hidden"),
    upcomingCount: $("upcoming-count"),
    pastCount: $("past-count"),
    statUpcoming: $("stat-upcoming"),
    stat24: $("stat-24h"),
    statTodo: $("stat-todo"),
    filterTodo: $("filter-todo"),
    statPast: $("stat-past"),
    hero: $("hero"),
    heroKicker: $("hero-kicker"),
    heroTitle: $("hero-title"),
    heroBadge: $("hero-badge"),
    heroMeta: $("hero-meta"),
    heroLinks: $("hero-links"),
    cdD: $("cd-d"),
    cdH: $("cd-h"),
    cdM: $("cd-m"),
    cdS: $("cd-s"),
    dialog: $("dialog"),
    form: $("mint-form"),
    dialogTitle: $("dialog-title"),
    resultField: $("result-field"),
    pickerHost: $("dt-picker"),
    grabInput: $("grab-input"),
    grabBtn: $("grab-btn"),
    grabAuto: $("grab-auto"),
    grabStatus: $("grab-status"),
    exportDialog: $("export-dialog"),
    soundDialog: $("sound-dialog"),
    audioLock: $("audio-lock"),
    toasts: $("toasts"),
    notifyDot: $("notify-dot"),
    importFile: $("import-file"),
  };

  /* ---------- data ---------- */

  var mints = [];
  var editingId = null;
  var picker = null;
  var notified = readJson(NOTIFY_KEY, {});
  var filters = Object.assign({ type: "all", status: "all", todo: false }, readJson(FILTER_KEY, {}));
  var profile = null;                                   // diisi setelah login
  var compare = readJson(VIEW_KEY, false) === true;     // false = fokus punyaku
  var seenPast = null;
  var autoFetch = readJson(AUTOFETCH_KEY, false) === true;
  var soundArmed = false;
  var knownMints = new Set();
  // tipe & status masih boleh ditimpa hasil tebakan selama belum disentuh manual
  var pristine = { type: true, status: true };

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  var storageWarned = false;
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      if (!storageWarned) {
        storageWarned = true;
        toast("Browser menolak menyimpan (mode privat / storage penuh). Export JSON untuk backup.");
      }
    }
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "m-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function normalizeMint(raw) {
    var m = raw || {};
    var type = typeById[m.type] ? m.type : "mint";
    var status = statusById[m.status] ? m.status : "watch";
    // tiap jadwal wajib punya satu pemilik; kalau datanya aneh, jatuhkan ke kamu
    var owner = ownerById[m.owner] ? m.owner : profile || "creyzsa";
    // siapa saja yang sudah menggarap jadwal ini
    var worked = (Array.isArray(m.worked) ? m.worked : []).filter(function (w) {
      return PROFILES.indexOf(w) >= 0;
    });
    return {
      id: m.id || uid(),
      name: String(m.name || "").trim(),
      type: type,
      owner: owner,
      worked: worked,
      updatedAt: Number(m.updatedAt) || 0,
      // v1 menyimpan chain di field "platform"
      chain: String(m.chain != null ? m.chain : m.platform || "").trim(),
      platform: String(m.chain != null ? m.platform || "" : "").trim(),
      source: normalizeHandle(m.source),
      datetime: m.datetime || "",
      price: String(m.price || "").trim(),
      supply: String(m.supply || "").trim(),
      link: String(m.link || "").trim(),
      notes: String(m.notes || "").trim(),
      status: status,
      result: String(m.result || "").trim(),
    };
  }

  /**
   * Satu id = satu jadwal = satu kartu. Dedup di sini supaya kalau suatu saat
   * data datang dari dua sumber (mis. sync bertumpuk), tidak pernah ada kartu
   * dobel untuk jadwal yang sama.
   */
  function shapeList(rows) {
    var seen = {};
    var out = [];
    rows.forEach(function (raw) {
      var m = normalizeMint(raw);
      if (!m.name || !T.isValid(m.datetime)) return;
      if (seen[m.id]) return;
      seen[m.id] = true;
      out.push(m);
    });
    return out;
  }

  // data jadwal hidup di PostgreSQL; ini cuma salinan untuk digambar
  function loadMints() {
    return window.MintApi.list().then(function (rows) {
      mints = shapeList(rows);
      return mints;
    });
  }

  function apiFail(err) {
    toast(err && err.message ? err.message : "Gagal menyimpan ke server.");
  }

  function saveNotified() {
    writeJson(NOTIFY_KEY, notified);
  }

  function saveFilters() {
    writeJson(FILTER_KEY, filters);
  }

  /* ---------- util ---------- */

  function esc(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function normalizeHandle(source) {
    var t = String(source || "").trim();
    if (!t) return "";
    if (t.startsWith("@")) return t;
    var cleaned = t.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/[/?].*$/, "");
    return cleaned ? "@" + cleaned : "";
  }

  function handleUrl(source) {
    var h = normalizeHandle(source).replace(/^@/, "");
    return h ? "https://x.com/" + h : "";
  }

  function mintDate(m) {
    return T.toDate(m.datetime) || new Date(0);
  }

  function isPast(m) {
    return mintDate(m).getTime() <= Date.now();
  }

  function toast(msg, ms) {
    var node = document.createElement("div");
    node.className = "toast";
    node.textContent = msg;
    els.toasts.appendChild(node);
    setTimeout(function () { node.remove(); }, ms || 4200);
    return node;
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- filter & urutan ---------- */

  function matches(m, q) {
    if (filters.todo && !canGarap(m)) return false;
    if (filters.type !== "all" && m.type !== filters.type) return false;
    if (filters.status !== "all" && m.status !== filters.status) return false;
    if (!q) return true;
    var blob = [
      m.name, m.chain, m.platform, m.source, m.notes, m.result, m.link, m.price, m.supply,
      typeById[m.type].short, typeById[m.type].label, statusById[m.status].label,
      ownerById[m.owner].label,
    ].join(" ").toLowerCase();
    return blob.includes(q);
  }

  function mine(m) {
    return m.owner === profile;
  }

  function other(person) {
    return person === "creyzsa" ? "chishiya" : "creyzsa";
  }

  /** Sudah selesai menurut orang ini? Pemilik terisi otomatis oleh server. */
  function completedBy(m, who) {
    return m.worked.indexOf(who) >= 0;
  }

  /** Partner boleh menggarap: sudah lewat, bukan miliknya, dan belum dia garap. */
  function canGarap(m) {
    return isPast(m) && m.owner !== profile && !completedBy(m, profile);
  }

  // mode fokus: hanya jadwalmu. mode compare: semuanya, dipecah dua kolom.
  function inScope(m) {
    return compare || mine(m);
  }

  function split(useFilters) {
    var q = useFilters ? els.search.value.trim().toLowerCase() : "";
    var pass = function (m) { return !useFilters || matches(m, q); };

    // Akan Datang: halaman pribadi hanya jadwal milikmu; compare semuanya
    var upcoming = mints.filter(function (m) {
      return !isPast(m) && inScope(m) && pass(m);
    });

    // Sudah Lewat:
    //   halaman pribadi -> yang sudah selesai MENURUT KAMU. Milikmu masuk otomatis
    //                      begitu lewat; milik partner baru masuk setelah kamu Garap.
    //   compare         -> semua yang sudah lewat, dari kedua akun
    var past = mints.filter(function (m) {
      if (!isPast(m) || !pass(m)) return false;
      return compare || completedBy(m, profile);
    });

    return {
      upcoming: upcoming.sort(function (a, b) { return mintDate(a) - mintDate(b); }),
      past: past.sort(function (a, b) { return mintDate(b) - mintDate(a); }),
    };
  }

  /* ---------- potongan HTML ---------- */

  function typeBadge(m) {
    return '<span class="badge t-' + m.type + '">' + esc(typeById[m.type].short) + "</span>";
  }

  function sourceCell(m) {
    var handle = normalizeHandle(m.source);
    if (!handle) return "—";
    return '<a class="handle" href="' + esc(handleUrl(handle)) + '" target="_blank" rel="noopener noreferrer">' + esc(handle) + "</a>";
  }

  function statusCell(m) {
    var opts = STATUSES.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === m.status ? " selected" : "") + ">" + esc(s.label) + "</option>";
    }).join("");
    return '<select class="status-select tone-' + statusById[m.status].tone + '" data-status-for="' + m.id + '" aria-label="Status ' + esc(m.name) + '">' + opts + "</select>";
  }

  /* ---------- render ---------- */

  function renderChips() {
    var used = {};
    mints.forEach(function (m) { used[m.type] = (used[m.type] || 0) + 1; });
    var chips = ['<button type="button" class="chip' + (filters.type === "all" ? " on" : "") + '" data-type="all">Semua <b>' + mints.length + "</b></button>"];
    TYPES.forEach(function (t) {
      if (!used[t.id] && filters.type !== t.id) return;
      chips.push('<button type="button" class="chip' + (filters.type === t.id ? " on" : "") + '" data-type="' + t.id + '">' + esc(t.short) + " <b>" + (used[t.id] || 0) + "</b></button>");
    });
    els.filterTypes.innerHTML = chips.join("");
  }

  function renderTables() {
    var view = split(true);
    var all = split(false);
    var now = Date.now();

    els.upcomingCount.textContent = view.upcoming.length;
    els.pastCount.textContent = view.past.length;
    els.statUpcoming.textContent = all.upcoming.length;
    els.statPast.textContent = all.past.length;
    els.stat24.textContent = all.upcoming.filter(function (m) {
      return mintDate(m).getTime() - now <= 86400000;
    }).length;
    // "Menunggu digarap" = garapan partner yang sudah lewat dan belum kamu garap
    els.statTodo.textContent = mints.filter(canGarap).length;
    els.filterTodo.classList.toggle("on", !!filters.todo);

    renderBoard(view.upcoming);
    var pastShown = renderPastBoard(view.past);
    els.pastCount.textContent = pastShown;

    els.upcomingEmpty.hidden = view.upcoming.length > 0;
    els.board.hidden = view.upcoming.length === 0;
    renderPastNote();
    renderChips();
  }

  // jelaskan isi panel Sudah Lewat, karena aturannya beda di tiap mode
  function renderPastNote() {
    els.pastTag.hidden = false;
    els.pastHidden.hidden = false;

    if (compare) {
      els.pastTag.textContent = "belum digarap";
      els.pastHidden.textContent =
        "Di sini yang belum digarap, dipisah per orang — jadi kelihatan siapa melewatkan apa. " +
        "Tutup Compare untuk melihat catatan yang sudah digarap.";
      return;
    }

    els.pastTag.textContent = "sudah digarap";
    els.pastHidden.textContent =
      "Catatan jadwal lama yang sudah digarap — punyamu maupun punya " +
      ownerById[other(profile)].label + ". Pencet Compare untuk melihat yang belum digarap.";
  }

  /* ---------- papan perbandingan dua kolom ---------- */

  // tiap jadwal punya satu pemilik, jadi masuk tepat satu kolom
  function columnOf(person, list) {
    return list.filter(function (m) { return m.owner === person; });
  }

  function card(m) {
    var now = Date.now();
    var remain = mintDate(m).getTime() - now;
    var gone = remain <= 0;
    var owner = m.owner;
    var partner = other(owner);
    var ownerDone = completedBy(m, owner);      // otomatis true begitu lewat
    var partnerDone = completedBy(m, partner);
    var iAmOwner = owner === profile;
    var garapable = canGarap(m);

    // Selama belum lewat tidak ada urusan garap-menggarap sama sekali.
    var flag = "";
    if (gone) {
      var bits =
        '<span class="done-chip o-' + owner + '">✓ ' + esc(ownerById[owner].label) + " (pemilik)</span>" +
        (partnerDone
          ? '<span class="done-chip o-' + partner + '">✓ ' + esc(ownerById[partner].label) + "</span>"
          : '<span class="done-chip waiting">⚠ ' + esc(ownerById[partner].label) + " belum garap</span>");
      flag = '<div class="card-flag row">' + bits + "</div>";
    }

    var meta = [m.chain, m.platform, m.price, m.supply ? m.supply + " supply" : ""].filter(Boolean).join(" · ");
    var link = m.link
      ? ' <a class="linkish tiny" href="' + esc(m.link) + '" target="_blank" rel="noopener noreferrer">buka ↗</a>'
      : "";

    // jadwal lama: tampilkan hasilnya, dan "3 hari lalu" bukan hitung mundur
    var note = gone ? (m.result || m.notes) : m.notes;
    var when = gone
      ? '<span class="eta past">' + esc(T.ago(-remain)) + "</span>"
      : '<span class="eta' + (remain <= 3600000 ? " soon" : "") + '">' + esc(T.remain(remain)) + "</span>";

    // Tombol Garap hanya muncul di Compare, hanya untuk partner, hanya kalau
    // sudah lewat dan dia belum menggarapnya. Pemilik tidak pernah dapat tombol.
    var garapBtn = compare && garapable
      ? '<button class="btn primary tiny garap-btn" data-act="garap" data-id="' + m.id + '" type="button">Garap</button>'
      : "";

    return (
      '<article class="card own-' + owner + (gone && ownerDone && partnerDone ? " is-done" : "") +
      (garapable ? " is-alert" : "") + '" data-row="' + m.id + '">' +
      '<div class="card-top">' + typeBadge(m) + '<span class="name">' + esc(m.name) + "</span>" +
      '<span class="owner-chip o-' + owner + '"><span class="pip"></span>' + esc(ownerById[owner].label) + "</span>" +
      "</div>" +
      '<div class="card-when"><span class="when">' + esc(T.stamp(m.datetime)) + "</span>" + when + "</div>" +
      '<div class="card-sub">' + (meta ? esc(meta) : "—") + link + "</div>" +
      (m.source ? '<div class="card-sub">' + sourceCell(m) + "</div>" : "") +
      (note ? '<p class="card-notes">' + esc(note) + "</p>" : "") +
      flag +
      '<div class="card-foot">' + statusCell(m) +
      '<div class="row-actions">' + garapBtn +
      (gone ? "" : '<button class="linkish" data-act="cal" data-id="' + m.id + '" type="button">Kalender</button>') +
      '<button class="linkish" data-act="edit" data-id="' + m.id + '" type="button">Edit</button>' +
      '<button class="linkish" data-act="dup" data-id="' + m.id + '" type="button">Duplikat</button>' +
      '<button class="linkish danger" data-act="del" data-id="' + m.id + '" type="button">Hapus</button>' +
      "</div></div></article>"
    );
  }

  function boardColumn(person, list, tag, emptyText) {
    return (
      '<section class="board-col c-' + person + '">' +
      '<h3 class="board-head"><span class="pip"></span>' + esc(ownerById[person].label) +
      (tag ? '<em class="board-tag">' + esc(tag) + "</em>" : "") +
      '<span class="board-count">' + list.length + "</span></h3>" +
      '<div class="board-list">' +
      (list.length
        ? list.map(card).join("")
        : '<p class="board-empty">' + esc(emptyText || "Belum ada jadwal di sini.") + "</p>") +
      "</div></section>"
    );
  }

  function renderPastBoard(past) {
    var mate = other(profile);
    els.pastBoard.dataset.mode = compare ? "compare" : "solo";

    if (compare) {
      // dipisah per pemilik. Yang punya partner dan belum kamu garap dapat tombol.
      var ku = columnOf(profile, past);
      var dia = columnOf(mate, past);
      var menunggu = dia.filter(canGarap).length;
      els.pastBoard.innerHTML =
        boardColumn(profile, ku, "punyamu", "Belum ada punyamu yang lewat.") +
        boardColumn(mate, dia, menunggu ? menunggu + " menunggu kamu garap" : "sudah kamu garap semua",
          "Belum ada punya dia yang lewat.");
      return ku.length + dia.length;
    }

    // tanpa header nama: isinya campur punyamu dan punya partner yang sudah
    // kamu garap. Tiap kartu sudah ada chip pemiliknya.
    els.pastBoard.innerHTML =
      '<section class="board-col plain"><div class="board-list">' +
      (past.length
        ? past.map(card).join("")
        : '<p class="board-empty">Belum ada yang selesai di sini.</p>') +
      "</div></section>";
    return past.length;
  }

  function renderBoard(upcoming) {
    var mate = other(profile);
    els.board.dataset.mode = compare ? "compare" : "solo";

    if (compare) {
      // kolom kiri selalu kamu, kanan partnermu — sudut pandangnya konsisten
      els.board.innerHTML =
        boardColumn(profile, columnOf(profile, upcoming), "kamu") +
        boardColumn(mate, columnOf(mate, upcoming), "");
    } else {
      els.board.innerHTML = boardColumn(profile, columnOf(profile, upcoming), "kamu");
    }

    var msgs = [];

    // garapan partner yang sudah lewat dan menunggu kamu garap
    var pending = mints.filter(canGarap);
    if (pending.length) {
      msgs.push(
        "⚠ " + pending.length + " garapan " + ownerById[mate].label +
        " sudah lewat dan menunggu kamu garap" + (compare ? "" : " — buka Compare") + ": " +
        pending.map(function (m) { return m.name; }).join(", ")
      );
    }

    // pengingat berbunyi untuk garapan kedua akun, walau kartunya tidak tampil
    // di halaman pribadi. Tanpa keterangan ini, alarmnya terasa datang entah dari mana.
    if (!compare) {
      var partnerSoon = mints.filter(function (m) { return !isPast(m) && m.owner === mate; });
      if (partnerSoon.length) {
        msgs.push(
          "🔔 " + partnerSoon.length + " garapan " + ownerById[mate].label +
          " juga akan membunyikan pengingat di sini walau kartunya tidak tampil. " +
          "Buka Compare untuk melihatnya."
        );
      }
    }

    els.boardNotice.hidden = msgs.length === 0;
    els.boardNotice.textContent = msgs.join("   ");
  }

  function nextMint() {
    var upcoming = mints
      .filter(function (m) { return !isPast(m) && inScope(m); })
      .sort(function (a, b) { return mintDate(a) - mintDate(b); });
    return upcoming[0] || null;
  }

  function setCount(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    els.cdD.textContent = T.pad(Math.floor(s / 86400));
    els.cdH.textContent = T.pad(Math.floor((s % 86400) / 3600));
    els.cdM.textContent = T.pad(Math.floor((s % 3600) / 60));
    els.cdS.textContent = T.pad(s % 60);
  }

  function renderHero() {
    var next = nextMint();
    els.hero.classList.remove("live", "empty");
    els.heroLinks.innerHTML = "";

    if (!next) {
      els.hero.classList.add("empty");
      els.heroBadge.hidden = true;
      els.heroKicker.textContent = "Jadwal berikutnya";
      els.heroTitle.textContent = "Belum ada jadwal";
      els.heroMeta.textContent = "Tambah WL, presale, mint, atau airdrop supaya countdown-nya jalan.";
      setCount(0);
      return;
    }

    var remain = mintDate(next).getTime() - Date.now();
    els.heroKicker.textContent = remain <= 0 ? "Sedang berlangsung" : typeById[next.type].label;
    if (remain <= 0) els.hero.classList.add("live");

    els.heroBadge.hidden = false;
    els.heroBadge.className = "badge t-" + next.type;
    els.heroBadge.textContent = typeById[next.type].short;
    els.heroTitle.textContent = next.name;

    var bits = [T.stamp(next.datetime), ownerById[next.owner].label];
    var chain = [next.chain, next.platform].filter(Boolean).join(" · ");
    if (chain) bits.push(chain);
    if (next.price) bits.push(next.price);
    bits.push(statusById[next.status].label);
    els.heroMeta.textContent = bits.join(" · ");

    var links = [];
    if (next.link) links.push('<a href="' + esc(next.link) + '" target="_blank" rel="noopener noreferrer">Buka link mint ↗</a>');
    if (next.source) links.push('<a href="' + esc(handleUrl(next.source)) + '" target="_blank" rel="noopener noreferrer">' + esc(normalizeHandle(next.source)) + " ↗</a>");
    links.push('<a href="' + esc(gcalUrl(next)) + '" target="_blank" rel="noopener noreferrer">Tambah ke kalender ↗</a>');
    els.heroLinks.innerHTML = links.join("");

    setCount(remain);
  }

  function updateEtaCells() {
    var now = Date.now();
    document.querySelectorAll("#board [data-row], #past-board [data-row]").forEach(function (node) {
      var m = byId(node.dataset.row);
      var cell = node.querySelector(".eta");
      if (!m || !cell) return;
      var remain = mintDate(m).getTime() - now;
      // jadwal lama dihitung mundur ke belakang: "3 hari lalu", bukan hitung mundur
      if (remain <= 0) {
        cell.textContent = T.ago(-remain);
        cell.className = "eta past";
        return;
      }
      cell.textContent = T.remain(remain);
      cell.className = "eta" + (remain <= 3600000 ? " soon" : "");
    });
  }

  function byId(id) {
    return mints.find(function (m) { return m.id === id; }) || null;
  }

  /* ---------- form ---------- */

  // akses field lewat elements[] biar tidak bentrok dengan properti bawaan <form>
  function fld(name) {
    return els.form.elements[name];
  }

  function fillSelect(select, items, valueKey, labelKey) {
    select.innerHTML = items.map(function (i) {
      return '<option value="' + i[valueKey] + '">' + esc(i[labelKey]) + "</option>";
    }).join("");
  }

  function openDialog(mint) {
    editingId = mint ? mint.id : null;
    els.dialogTitle.textContent = editingId ? "Edit jadwal" : "Jadwal baru";
    els.form.reset();

    fld("type").value = mint ? mint.type : "mint";
    fld("status").value = mint ? mint.status : "watch";
    // jadwal baru otomatis milik profil yang lagi aktif
    fld("owner").value = mint ? mint.owner : profile;
    if (mint) {
      ["name", "chain", "platform", "source", "price", "supply", "link", "notes", "result"].forEach(function (k) {
        fld(k).value = mint[k] || "";
      });
    }
    picker.setValue(mint ? mint.datetime : null);
    els.resultField.hidden = !(mint && isPast(mint));
    resetGrab();

    els.dialog.showModal();
    (mint ? fld("name") : els.grabInput).focus();
  }

  function closeDialog() {
    editingId = null;
    if (els.dialog.open) els.dialog.close();
  }

  /* ---------- isi otomatis dari link / caption X ---------- */

  var TEXT_FIELDS = [
    { key: "name", label: "nama" },
    { key: "chain", label: "chain" },
    { key: "platform", label: "platform" },
    { key: "source", label: "@sumber" },
    { key: "price", label: "harga" },
    { key: "supply", label: "supply" },
    { key: "link", label: "link" },
  ];

  function setGrabStatus(text, tone) {
    els.grabStatus.textContent = text || "";
    els.grabStatus.className = "grab-status" + (tone ? " " + tone : "");
  }

  function resetGrab() {
    els.grabInput.value = "";
    pristine.type = true;
    pristine.status = true;
    setGrabStatus("");
  }

  // hanya mengisi field yang masih kosong — yang sudah kamu ketik tidak ditimpa
  function applyGuess(g) {
    var filled = [];
    TEXT_FIELDS.forEach(function (f) {
      if (g[f.key] && !fld(f.key).value.trim()) {
        fld(f.key).value = g[f.key];
        filled.push(f.label);
      }
    });
    if (g.type && pristine.type) {
      fld("type").value = g.type;
      pristine.type = false;
      filled.push("tipe (" + typeById[g.type].short + ")");
    }
    if (g.status && pristine.status) {
      fld("status").value = g.status;
      pristine.status = false;
      filled.push("status");
    }
    if (g.datetime) {
      picker.setValue(g.datetime);
      filled.push("jadwal" + (g.tz && g.tz !== "WIB" ? " (dari " + g.tz + ")" : ""));
    }
    return filled;
  }

  function grabRun(text) {
    var raw = String(text || "").trim();
    if (!raw) {
      setGrabStatus("");
      return;
    }

    var g = window.MintExtract.guess(raw, null);
    var filled = applyGuess(g);
    var tw = g.tweet;

    if (!tw) {
      setGrabStatus(
        filled.length ? "Terisi: " + filled.join(", ") + "." : "Tidak ada yang bisa ditebak dari teks ini.",
        filled.length ? "good" : "bad"
      );
      return;
    }

    if (!autoFetch) {
      setGrabStatus(
        (filled.length ? "Dari link: " + filled.join(", ") + ". " : "") +
        "Caption belum dibaca — centang toggle di bawah, atau tempel teks caption-nya langsung.",
        "warn"
      );
      return;
    }

    setGrabStatus("Mengambil caption…");
    window.MintExtract.fetchTweet(tw.id).then(function (data) {
      if (!data || !data.text) {
        setGrabStatus("Caption gagal diambil (tweet privat / dihapus / layanan sedang down). Tempel teks caption-nya saja.", "bad");
        return;
      }
      var more = applyGuess(window.MintExtract.guess(data.text + "\n" + raw, data));
      var all = filled.concat(more);
      setGrabStatus(
        all.length
          ? "Terbaca lewat " + data.via + " — terisi: " + all.join(", ") + "."
          : "Caption terbaca lewat " + data.via + ", tapi tidak ada detail yang cocok ditebak.",
        all.length ? "good" : "warn"
      );
    });
  }

  function grabInto(text) {
    if (!els.dialog.open) openDialog(null);
    els.grabInput.value = String(text || "").trim();
    grabRun(els.grabInput.value);
  }

  function readForm() {
    var name = fld("name").value.trim();
    if (!name) return null;
    var link = fld("link").value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    return {
      name: name,
      type: fld("type").value,
      owner: fld("owner").value,
      chain: fld("chain").value.trim(),
      platform: fld("platform").value.trim(),
      source: normalizeHandle(fld("source").value),
      datetime: picker.getValue(),
      price: fld("price").value.trim(),
      supply: fld("supply").value.trim(),
      link: link,
      notes: fld("notes").value.trim(),
      status: fld("status").value,
      result: fld("result").value.trim(),
    };
  }

  // sisipkan/ganti satu baris hasil balasan server, lalu gambar ulang
  function absorb(row) {
    var m = normalizeMint(row);
    var at = mints.findIndex(function (x) { return x.id === m.id; });
    if (at >= 0) mints[at] = m;
    else mints.push(m);
    return m;
  }

  function upsert(data) {
    var editing = editingId;
    var call = editing
      ? window.MintApi.update(editing, data)
      : window.MintApi.create(data);

    return call.then(function (row) {
      if (editing) forgetReminders(editing);
      absorb(row);
      toast(editing
        ? data.name + " diperbarui"
        : data.name + " ditambahkan · " + T.stamp(row.datetime));
      render();
    }).catch(apiFail);
  }

  function duplicate(m) {
    var copy = {
      name: m.name,
      type: m.type === "wl" ? "mint" : m.type,
      owner: m.owner,
      status: "watch",
      chain: m.chain,
      platform: m.platform,
      source: m.source,
      price: m.price,
      supply: m.supply,
      link: m.link,
      notes: m.notes,
      result: "",
      datetime: T.isoFromDate(new Date(mintDate(m).getTime() + 86400000)),
    };
    window.MintApi.create(copy).then(function (row) {
      var saved = absorb(row);
      render();
      openDialog(saved);
      toast("Duplikat dibuat — atur ulang jadwalnya.");
    }).catch(apiFail);
  }

  /**
   * Partner menandai garapan pemilik sebagai selesai. Sekali jalan — tidak ada
   * pembatalan, dan pemilik tidak pernah lewat sini (dia otomatis di server).
   */
  function markGarap(m) {
    if (!canGarap(m)) return;
    window.MintApi.setWorked(m.id, profile, true).then(function (row) {
      absorb(row);
      render();
      toast(m.name + " ditandai selesai — sekarang masuk ke Sudah Lewat punyamu.");
    }).catch(apiFail);
  }

  function remove(id) {
    var target = byId(id);
    if (!target) return;
    if (!confirm("Hapus " + target.name + "?")) return;
    window.MintApi.remove(id).then(function () {
      mints = mints.filter(function (m) { return m.id !== id; });
      forgetReminders(id);
      toast(target.name + " dihapus");
      render();
    }).catch(apiFail);
  }

  /* ---------- notifikasi ---------- */

  function checkFlips() {
    mints.forEach(function (m) {
      if (isPast(m) && !seenPast.has(m.id)) {
        seenPast.add(m.id);
        toast(m.name + " sudah lewat — pindah ke Sudah Lewat.");
      }
    });
  }

  // satu pintu: notifikasi browser (kalau diizinkan) + bunyi (kalau dinyalakan).
  // `ring` = dering panjang, dipakai saat mint benar-benar mulai.
  function alertUser(title, body, tag, ring) {
    var sound = window.MintSound;
    var withSound = sound && sound.isEnabled();

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body: body,
        tag: tag,
        silent: !!withSound,
        requireInteraction: !!ring,
      });
    }

    if (!withSound) return;
    if (ring) {
      var node = toast("🔔 " + title + " — cek postingannya. Klik di mana saja untuk menghentikan bunyi.", RING_SECONDS * 1000);
      sound.playLong("ring", RING_SECONDS, function () { if (node) node.remove(); });
    } else {
      sound.play("warn");
    }
  }

  // ambang yang sudah lewat saat mint ini pertama dikenal ditandai tanpa dibunyikan,
  // supaya membuka app / menambah jadwal mepet tidak langsung memicu alarm susulan
  function primeReminders(m) {
    var mins = (mintDate(m).getTime() - Date.now()) / 60000;
    REMINDERS.forEach(function (r) {
      if (mins <= r.mins) notified[m.id + "-" + r.key] = true;
    });
    if (mins <= 0) notified[m.id + "-start"] = true;
  }

  // jadwal berubah = semua ambangnya dihitung ulang dari awal
  function forgetReminders(id) {
    Object.keys(notified).forEach(function (k) {
      if (k.indexOf(id + "-") === 0) delete notified[k];
    });
    knownMints.delete(id);
    saveNotified();
  }

  function notifyIfNeeded() {
    var canNotify = "Notification" in window && Notification.permission === "granted";
    var canSound = window.MintSound && window.MintSound.isEnabled();
    var now = Date.now();

    mints.forEach(function (m) {
      if (knownMints.has(m.id)) return;
      knownMints.add(m.id);
      primeReminders(m);
      saveNotified();
    });

    if (!canNotify && !canSound) return;
    mints.forEach(function (m) {
      var ms = mintDate(m).getTime() - now;
      var mins = ms / 60000;

      // ambil ambang terdekat saja, biar tidak tiga notifikasi sekaligus
      var bucket = null;
      for (var i = REMINDERS.length - 1; i >= 0; i--) {
        if (mins > 0 && mins <= REMINDERS[i].mins) {
          bucket = REMINDERS[i];
          break;
        }
      }
      // garapan partner ikut berbunyi juga, jadi namanya disebut supaya jelas
      // alarm ini datang dari mana — kartunya memang tidak tampil di halamanmu.
      var whose = m.owner === profile ? "" : " (" + ownerById[m.owner].label + ")";
      var judul = typeById[m.type].short + " " + m.name + whose;

      if (bucket) {
        var key = m.id + "-" + bucket.key;
        if (!notified[key]) {
          alertUser(
            judul + " — " + T.remain(ms) + " lagi",
            T.stamp(m.datetime) + (m.chain ? " · " + m.chain : ""),
            key
          );
          notified[key] = true;
          saveNotified();
        }
      }

      var startKey = m.id + "-start";
      if (mins <= 0 && mins > -2 && !notified[startKey]) {
        alertUser(
          judul + " — waktunya sekarang",
          "Cek postingan / link-nya sekarang." + (m.chain ? " " + m.chain : ""),
          startKey,
          true
        );
        notified[startKey] = true;
        saveNotified();
      }
    });
  }

  /* ---------- bunyi ---------- */

  /**
   * Tiap perangkat harus disentuh sekali sebelum browser mengizinkan bunyi.
   * Tanpa tanda ini, perangkat yang cuma dibuka tanpa diklik akan diam total
   * dan tidak ada yang menyadarinya sampai alarm penting terlewat.
   */
  function updateAudioLock() {
    var s = window.MintSound;
    var locked = s && s.isEnabled() && s.isBlocked();
    els.audioLock.hidden = !locked;
  }

  function soundSummary() {
    var s = window.MintSound;
    return "5 menit: " + s.label("warn") + " · saat mulai: " + s.label("ring");
  }

  function updateSoundDot() {
    var s = window.MintSound;
    var on = s && s.isEnabled();
    $("sound-dot").classList.toggle("on", !!on);
    $("btn-sound").title = on
      ? "Bunyi — " + soundSummary() + ". Klik untuk tes, klik lagi untuk matikan."
      : "Bunyi mati — klik untuk nyalakan";
  }

  // tes: bunyi 5 menit dulu, lalu bunyi saat-mulai sekali (tidak berdering)
  function previewSounds() {
    window.MintSound.play("warn", true);
    setTimeout(function () { window.MintSound.play("ring", true); }, 1400);
  }

  function toggleSound() {
    var s = window.MintSound;
    if (!s) return;
    s.unlock().then(updateAudioLock);

    if (!s.isEnabled()) {
      s.setEnabled(true);
      updateSoundDot();
      updateAudioLock();
      previewSounds();
      toast("Bunyi aktif — " + soundSummary());
      return;
    }
    // sudah aktif: klik pertama = tes bunyi, klik lagi dalam 3 detik = matikan
    if (soundArmed) {
      s.setEnabled(false);
      soundArmed = false;
      updateSoundDot();
      updateAudioLock();
      toast("Bunyi pengingat dimatikan.");
      return;
    }
    soundArmed = true;
    setTimeout(function () { soundArmed = false; }, 3000);
    previewSounds();
    toast("Tes: " + soundSummary() + ". Klik lagi dalam 3 detik untuk mematikan.");
  }

  /* --- ganti bunyi lewat tarik file --- */

  var pendingSoundFile = null;

  function askSoundSlot(file) {
    pendingSoundFile = file;
    $("sound-lead").textContent = file.name + " — mau dipakai sebagai bunyi yang mana?";
    els.soundDialog.showModal();
  }

  function useSoundFile(slot) {
    var file = pendingSoundFile;
    pendingSoundFile = null;
    els.soundDialog.close();
    if (!file) return;
    window.MintSound.setCustomFile(file, slot).then(
      function (name) {
        window.MintSound.setEnabled(true);
        updateSoundDot();
        window.MintSound.play(slot, true);
        toast((slot === "warn" ? "Bunyi 5 menit" : "Dering saat mulai") + " diganti: " + name);
      },
      function (err) {
        toast("Gagal pakai file itu — " + err.message + ".");
      }
    );
  }

  function updateNotifyDot() {
    var on = "Notification" in window && Notification.permission === "granted";
    els.notifyDot.classList.toggle("on", on);
  }

  function enableNotify() {
    if (!("Notification" in window)) {
      toast("Browser ini tidak mendukung notifikasi.");
      return;
    }
    if (window.MintSound) window.MintSound.unlock();
    Notification.requestPermission().then(function (perm) {
      updateNotifyDot();
      if (perm === "granted") {
        toast("Pengingat aktif: 5 menit sebelum, lalu dering panjang saat waktunya. Tab ini harus tetap terbuka.");
      } else {
        toast("Izin notifikasi ditolak — pengingat tetap berbunyi selama tab ini terbuka.");
      }
    });
  }

  /* ---------- export ---------- */

  function toMarkdown() {
    var all = split(false);
    var row = function (m, past) {
      return "| " + [
        m.name,
        typeById[m.type].short,
        ownerById[m.owner].label,
        [m.chain, m.platform].filter(Boolean).join(" / "),
        normalizeHandle(m.source),
        T.stamp(m.datetime),
        m.price,
        statusById[m.status].label,
        m.link,
        past ? (m.result || m.notes) : m.notes,
      ].join(" | ") + " |";
    };
    var head = "| Proyek | Tipe | Punya | Chain / Platform | Sumber (X) | Jadwal (WIB) | Harga | Status | Link | Catatan |\n|---|---|---|---|---|---|---|---|---|---|";
    return [
      "# Mint Tracker",
      "",
      "> Semua jam dalam WIB (+07:00). Baris pindah ke **Sudah Lewat** otomatis setelah waktunya.",
      "",
      "## Akan Datang",
      "",
      head,
      all.upcoming.length ? all.upcoming.map(function (m) { return row(m, false); }).join("\n") : "| | | | | | | | | | |",
      "",
      "## Sudah Lewat",
      "",
      head,
      all.past.length ? all.past.map(function (m) { return row(m, true); }).join("\n") : "| | | | | | | | | | |",
      "",
    ].join("\n");
  }

  function icsStamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function icsEscape(text) {
    return String(text || "").replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
  }

  function toIcs(list) {
    var out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mint Tracker//ID", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    var now = icsStamp(new Date());
    list.forEach(function (m) {
      var start = mintDate(m);
      var end = new Date(start.getTime() + 3600000);
      var desc = [
        typeById[m.type].label + " · " + ownerById[m.owner].label,
        [m.chain, m.platform].filter(Boolean).join(" / "),
        normalizeHandle(m.source),
        m.price ? "Harga: " + m.price : "",
        m.supply ? "Supply: " + m.supply : "",
        m.notes,
        m.link,
      ].filter(Boolean).join("\n");
      [
        "BEGIN:VEVENT",
        "UID:" + m.id + "@mint-tracker",
        "DTSTAMP:" + now,
        "DTSTART:" + icsStamp(start),
        "DTEND:" + icsStamp(end),
        "SUMMARY:" + icsEscape(typeById[m.type].short + " · " + m.name),
        "DESCRIPTION:" + icsEscape(desc),
        m.link ? "URL:" + icsEscape(m.link) : "",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "ACTION:DISPLAY",
        "DESCRIPTION:" + icsEscape(m.name + " 15 menit lagi"),
        "END:VALARM",
        "END:VEVENT",
      ].filter(Boolean).forEach(function (line) { out.push(line); });
    });
    out.push("END:VCALENDAR");
    return out.join("\r\n");
  }

  function gcalUrl(m) {
    var start = mintDate(m);
    var end = new Date(start.getTime() + 3600000);
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: typeById[m.type].short + " · " + m.name,
      dates: icsStamp(start) + "/" + icsStamp(end),
      details: [[m.chain, m.platform].filter(Boolean).join(" / "), normalizeHandle(m.source), m.notes, m.link].filter(Boolean).join("\n"),
    });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  /* ---------- event ---------- */

  function onRowClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var m = byId(btn.dataset.id);
    if (!m) return;
    var act = btn.dataset.act;
    if (act === "edit") openDialog(m);
    if (act === "dup") duplicate(m);
    if (act === "del") remove(m.id);
    if (act === "cal") window.open(gcalUrl(m), "_blank", "noopener");
    if (act === "garap") markGarap(m);
  }

  function onRowChange(e) {
    var sel = e.target.closest("[data-status-for]");
    if (!sel) return;
    var m = byId(sel.dataset.statusFor);
    if (!m) return;
    var before = m.status;
    var next = sel.value;

    // tampilkan langsung, kembalikan kalau server menolak
    m.status = next;
    sel.className = "status-select tone-" + statusById[next].tone;
    renderChips();
    renderHero();

    window.MintApi.update(m.id, Object.assign({}, m, { status: next })).then(function (row) {
      absorb(row);
    }).catch(function (err) {
      m.status = before;
      sel.value = before;
      sel.className = "status-select tone-" + statusById[before].tone;
      apiFail(err);
    });
  }

  /* ---------- profil ---------- */

  function applyProfile() {
    if (!profile) return;
    document.documentElement.dataset.profile = profile;
    els.me.className = "me o-" + profile;
    els.meName.textContent = ownerById[profile].label;
    els.btnCompare.classList.toggle("on", compare);
    els.btnCompare.setAttribute("aria-pressed", compare ? "true" : "false");
    els.btnCompare.textContent = compare ? "✕ Tutup compare" : "Compare";
    els.btnCompare.title = compare
      ? "Kembali fokus ke jadwalmu sendiri"
      : "Tampilkan garapanmu dan " + ownerById[other(profile)].label + " berdampingan";
  }

  function toggleCompare() {
    compare = !compare;
    writeJson(VIEW_KEY, compare);
    applyProfile();
    render();
    toast(compare
      ? "Mode compare — garapanmu di kiri, " + ownerById[other(profile)].label + " di kanan."
      : "Kembali ke jadwalmu sendiri.");
  }

  function render() {
    if (!profile) return;
    renderTables();
    renderHero();
    checkFlips();
    notifyIfNeeded();
  }

  var lastKey = "";
  function keyOf() {
    return mints.filter(function (m) { return !isPast(m); }).map(function (m) { return m.id; }).join("|");
  }

  /* ---------- sinkron berkala ---------- */

  // Pengingat menyapu SEMUA jadwal, punya siapa pun — jadi kedua akun berbunyi
  // bersamaan tanpa perlu buka Compare. Supaya itu berlaku juga untuk jadwal
  // yang baru diinput partner setelah halamanmu terbuka, daftarnya diambil ulang
  // berkala. Tanpa ini, browsermu tidak akan pernah tahu jadwal itu ada.
  var SYNC_MS = 30000;
  var syncing = false;

  function signature(list) {
    return list.map(function (m) {
      return m.id + ":" + m.updatedAt + ":" + m.worked.slice().sort().join(",");
    }).sort().join("|");
  }

  function syncMints() {
    // sengaja tetap jalan walau tab di belakang — alarmnya justru dibutuhkan di situ
    if (syncing || !profile) return;
    syncing = true;

    window.MintApi.list().then(function (rows) {
      var fresh = shapeList(rows);
      var before = signature(mints);
      var after = signature(fresh);
      if (before === after) return;

      // jadwal yang jamnya berubah di sisi partner: hitung ulang ambang pengingatnya
      var byId = {};
      mints.forEach(function (m) { byId[m.id] = m; });
      fresh.forEach(function (m) {
        var old = byId[m.id];
        if (old && old.datetime !== m.datetime) forgetReminders(m.id);
      });

      mints = fresh;
      lastKey = keyOf();
      render();
    }).catch(function () {
      // gagal sekali tidak apa-apa, coba lagi 30 detik berikutnya
    }).then(function () {
      syncing = false;
    });
  }

  function tick() {
    if (!profile) return;
    var key = keyOf();
    if (key !== lastKey) {
      lastKey = key;
      renderTables();
    } else {
      updateEtaCells();
    }
    renderHero();
    checkFlips();
    notifyIfNeeded();
  }

  /* ---------- init ---------- */

  function init() {
    fillSelect(fld("type"), TYPES, "id", "label");
    fillSelect(fld("status"), STATUSES, "id", "label");
    fillSelect(fld("owner"), OWNERS, "id", "label");
    els.filterStatus.innerHTML =
      '<option value="all">Semua status</option>' +
      STATUSES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.label) + "</option>"; }).join("");
    els.filterStatus.value = filters.status;

    // kotak tempel ada di atas dialog, jadi picker tidak perlu punya sendiri
    picker = window.MintPicker.create(els.pickerHost, {
      paste: false,
      marks: function (y, m, d, tz) {
        return mints.some(function (item) {
          var p = T.parts(mintDate(item), tz);
          return p.y === y && p.m === m && p.d === d;
        });
      },
    });

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = readForm();
      if (!data) {
        toast("Nama proyek wajib diisi.");
        fld("name").focus();
        return;
      }
      upsert(data);
      closeDialog();
    });

    $("btn-add").addEventListener("click", function () { openDialog(null); });
    document.querySelectorAll("[data-open-add]").forEach(function (b) {
      b.addEventListener("click", function () { openDialog(null); });
    });
    $("btn-close").addEventListener("click", closeDialog);
    $("btn-cancel").addEventListener("click", closeDialog);
    $("btn-notify").addEventListener("click", enableNotify);
    $("btn-sound").addEventListener("click", toggleSound);
    $("sound-as-warn").addEventListener("click", function () { useSoundFile("warn"); });
    $("sound-as-ring").addEventListener("click", function () { useSoundFile("ring"); });
    $("sound-close").addEventListener("click", function () {
      pendingSoundFile = null;
      els.soundDialog.close();
    });
    $("btn-export").addEventListener("click", function () { els.exportDialog.showModal(); });
    $("export-close").addEventListener("click", function () { els.exportDialog.close(); });

    $("export-json").addEventListener("click", function () {
      download("mint-tracker.json", JSON.stringify(mints, null, 2), "application/json");
      els.exportDialog.close();
    });
    $("export-md").addEventListener("click", function () {
      download("mint-tracker.md", toMarkdown(), "text/markdown");
      els.exportDialog.close();
    });
    $("export-ics").addEventListener("click", function () {
      var upcoming = split(false).upcoming;
      if (!upcoming.length) {
        toast("Belum ada jadwal akan datang.");
        return;
      }
      download("mint-tracker.ics", toIcs(upcoming), "text/calendar");
      els.exportDialog.close();
      toast("File .ics diunduh — import ke Google / Apple Calendar.");
    });
    $("export-import").addEventListener("click", function () { els.importFile.click(); });

    els.importFile.addEventListener("change", function () {
      var file = els.importFile.files[0];
      if (!file) return;
      file.text().then(function (text) {
        var parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("File JSON harus berupa array.");
        // server yang menggabungkan, di dalam satu transaksi
        return window.MintApi.importMints(parsed);
      }).then(function (res) {
        mints = shapeList(res.mints);
        seenPast = new Set(mints.filter(isPast).map(function (m) { return m.id; }));
        knownMints.clear();
        els.exportDialog.close();
        toast("Digabung: " + res.added + " baru, " + res.updated + " diperbarui.");
        render();
      }).catch(function (err) {
        toast(err && err.message ? err.message : "File JSON tidak valid.");
      }).then(function () {
        els.importFile.value = "";
      });
    });

    els.search.addEventListener("input", renderTables);
    els.filterStatus.addEventListener("change", function () {
      filters.status = els.filterStatus.value;
      saveFilters();
      renderTables();
    });
    els.filterTypes.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-type]");
      if (!chip) return;
      filters.type = chip.dataset.type;
      saveFilters();
      renderTables();
    });
    els.filterTodo.addEventListener("click", function () {
      filters.todo = !filters.todo;
      saveFilters();
      renderTables();
    });
    els.btnCompare.addEventListener("click", toggleCompare);
    $("btn-logout").addEventListener("click", function () {
      if (!confirm("Keluar dari akun " + ownerById[profile].label + "?")) return;
      window.MintApi.logout()
        .then(function () { location.href = "/login/"; })
        .catch(function () { location.href = "/login/"; });
    });

    /* --- tarik / tempel dari X --- */

    els.grabAuto.checked = autoFetch;
    els.grabAuto.addEventListener("change", function () {
      autoFetch = els.grabAuto.checked;
      writeJson(AUTOFETCH_KEY, autoFetch);
      if (autoFetch) {
        toast("Ambil caption otomatis: aktif. Link yang kamu tempel dikirim ke fxtwitter / vxtwitter.");
        if (els.grabInput.value.trim()) grabRun(els.grabInput.value);
      } else {
        toast("Ambil caption otomatis: mati. Tidak ada request keluar lagi.");
      }
    });

    els.grabBtn.addEventListener("click", function () { grabRun(els.grabInput.value); });
    els.grabInput.addEventListener("paste", function () { setTimeout(function () { grabRun(els.grabInput.value); }, 0); });
    els.grabInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      grabRun(els.grabInput.value);
    });

    // begitu tipe / status disentuh manual, hasil tebakan tidak menimpanya lagi
    fld("type").addEventListener("change", function () { pristine.type = false; });
    fld("status").addEventListener("change", function () { pristine.status = false; });

    var dragDepth = 0;
    document.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer) return;
      dragDepth++;
      document.body.classList.add("dropping");
    });
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("dragleave", function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove("dropping");
    });
    document.addEventListener("drop", function (e) {
      dragDepth = 0;
      document.body.classList.remove("dropping");
      if (!e.dataTransfer) return;

      // file audio yang ditarik ke halaman = ganti bunyi pengingat
      var files = e.dataTransfer.files;
      if (files && files.length && window.MintSound.isAudioFile(files[0])) {
        e.preventDefault();
        askSoundSlot(files[0]);
        return;
      }

      var text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (!text || !text.trim()) return;
      e.preventDefault();
      grabInto(text);
    });

    // tempel link di halaman utama langsung membuka dialog yang sudah terisi
    document.addEventListener("paste", function (e) {
      if (els.dialog.open || els.exportDialog.open) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      var data = e.clipboardData || window.clipboardData;
      var text = data ? data.getData("text") : "";
      if (!text || !/https?:\/\//i.test(text)) return;
      e.preventDefault();
      grabInto(text);
    });

    els.board.addEventListener("click", onRowClick);
    els.pastBoard.addEventListener("click", onRowClick);
    els.board.addEventListener("change", onRowChange);
    els.pastBoard.addEventListener("change", onRowChange);
    els.dialog.addEventListener("close", function () { editingId = null; });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "n" && e.key !== "N") return;
      if (els.dialog.open || els.exportDialog.open) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      openDialog(null);
    });

    updateNotifyDot();
    updateSoundDot();
    window.MintSound.init({ onChange: updateAudioLock }).then(function () {
      updateSoundDot();
      updateAudioLock();
    });

    els.audioLock.addEventListener("click", function () {
      window.MintSound.unlock().then(function (ok) {
        updateAudioLock();
        if (ok) {
          window.MintSound.play("warn", true);
          toast("Bunyi aktif di perangkat ini.");
        } else {
          toast("Browser masih menolak. Coba klik sekali lagi di halaman.");
        }
      });
    });

    // siapa yang login ditentukan server lewat cookie sesi, bukan oleh browser
    window.MintApi.session()
      .then(function (s) {
        profile = s.account;
        applyProfile();
        return loadMints();
      })
      .then(function () {
        seenPast = new Set(mints.filter(isPast).map(function (m) { return m.id; }));
        lastKey = keyOf();
        render();
        setInterval(tick, 1000);
        setInterval(syncMints, SYNC_MS);
        // begitu tab dibuka lagi, langsung samakan tanpa menunggu giliran
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) syncMints();
        });
      })
      .catch(function (err) {
        toast(err && err.message ? err.message : "Gagal memuat data dari server.");
      });
  }

  init();
})();
