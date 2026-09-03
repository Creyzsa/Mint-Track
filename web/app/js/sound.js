/* sound.js — bunyi pengingat, dua slot terpisah:
     warn = aba-aba 5 menit sebelum   -> assets/warn.mp3
     ring = dering saat waktunya tiba -> assets/notif.mp3
   Tiap slot mencari: file custom (yang kamu tarik ke halaman) -> file di assets/
   -> chime bawaan Web Audio. Jadi tidak pernah bisu walau file-nya hilang.
   Browser melarang audio bunyi sebelum ada interaksi, makanya ada unlock(). */
(function (global) {
  "use strict";

  var ENABLED_KEY = "mint-tracker-sound-on-v1";
  var VOLUME_KEY = "mint-tracker-sound-vol-v1";

  var MAX_BYTES = 1.5 * 1024 * 1024;
  var PROBE_TIMEOUT = 6000;
  var READY_EVENTS = ["canplaythrough", "canplay", "loadeddata", "loadedmetadata"];

  function slot(name, base, customKey, tones) {
    return {
      name: name,
      candidates: ["mp3", "wav", "ogg", "m4a"].map(function (ext) { return "/app/assets/" + base + "." + ext; }),
      customKey: customKey,
      tones: tones,
      audio: null,
      label: "chime bawaan",
    };
  }

  var SLOTS = {
    // dua nada naik — pendek, cuma buat menoleh
    warn: slot("warn", "warn", "mint-tracker-sound-warn-v1", [880, 1174.66]),
    // tiga nada — lebih ramai, dipakai berulang saat dering
    ring: slot("ring", "notif", "mint-tracker-sound-file-v1", [880, 1174.66, 1567.98]),
  };

  var state = {
    enabled: true,
    volume: 0.8,
    unlocked: false,
    blocked: true,   // sampai terbukti browser mengizinkan
    ctx: null,
    onChange: null,
  };

  function pick(name) {
    return SLOTS[name] || SLOTS.ring;
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---------- cari sumber bunyi ---------- */

  /**
   * @param {boolean} lenient file pilihan sendiri: timeout tetap dipakai
   *                          (metadata kadang lambat); hanya `error` yang menolak.
   */
  function probe(url, lenient) {
    return new Promise(function (resolve) {
      var a = new Audio();
      var settled = false;
      function ok() { if (!settled) { settled = true; resolve(a); } }
      function fail() { if (!settled) { settled = true; resolve(null); } }
      a.preload = "auto";
      READY_EVENTS.forEach(function (evt) { a.addEventListener(evt, ok, { once: true }); });
      a.addEventListener("error", fail, { once: true });
      setTimeout(lenient ? ok : fail, PROBE_TIMEOUT);
      a.src = url;
      a.load();
    });
  }

  function assign(s, audio, label) {
    s.audio = audio;
    s.label = label;
    if (audio) audio.volume = state.volume;
  }

  function scanFolder(s) {
    var i = 0;
    function next() {
      if (i >= s.candidates.length) {
        assign(s, null, "chime bawaan");
        return Promise.resolve(s.label);
      }
      var url = s.candidates[i++];
      return probe(url).then(function (a) {
        if (!a) return next();
        assign(s, a, url.replace(/^.*\//, ""));
        return s.label;
      });
    }
    return next();
  }

  function resolveSlot(s) {
    var custom = read(s.customKey, null);
    if (custom && custom.data) {
      return probe(custom.data, true).then(function (a) {
        if (!a) return scanFolder(s);
        assign(s, a, custom.name || "file custom");
        return s.label;
      });
    }
    return scanFolder(s);
  }

  /* ---------- chime bawaan ---------- */

  function ctx() {
    if (state.ctx) return state.ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    state.ctx = new Ctor();
    return state.ctx;
  }

  function chime(s) {
    var ac = ctx();
    if (!ac) return false;
    if (ac.state === "suspended") ac.resume();
    var now = ac.currentTime;
    s.tones.forEach(function (freq, i) {
      var at = i * 0.13;
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(state.volume * 0.35, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.42);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.45);
    });
    return true;
  }

  /* ---------- putar sekali ---------- */

  function play(name, force) {
    if (!state.enabled && !force) return Promise.resolve(false);
    var s = pick(name);
    stopRing();
    if (!s.audio) return Promise.resolve(chime(s));
    try {
      s.audio.pause();
      s.audio.loop = false;
      s.audio.currentTime = 0;
      s.audio.volume = state.volume;
      var p = s.audio.play();
      if (!p || !p.then) return Promise.resolve(true);
      return p.then(function () { return true; }).catch(function () { return chime(s); });
    } catch (err) {
      return Promise.resolve(chime(s));
    }
  }

  /* ---------- dering panjang ---------- */

  var ring = { timer: null, chimeTimer: null, active: false, slot: null, onStop: null };

  function stopRing() {
    if (!ring.active) return;
    ring.active = false;
    if (ring.slot && ring.slot.audio) {
      try {
        ring.slot.audio.pause();
        ring.slot.audio.loop = false;
        ring.slot.audio.currentTime = 0;
      } catch (err) { /* abaikan */ }
    }
    if (ring.timer) { clearTimeout(ring.timer); ring.timer = null; }
    if (ring.chimeTimer) { clearInterval(ring.chimeTimer); ring.chimeTimer = null; }
    document.removeEventListener("pointerdown", stopRing, true);
    document.removeEventListener("keydown", stopRing, true);
    ring.slot = null;
    if (typeof ring.onStop === "function") {
      var cb = ring.onStop;
      ring.onStop = null;
      cb();
    }
  }

  /**
   * Bunyi berulang sampai `seconds` habis atau user klik / tekan tombol apa pun.
   */
  function playLong(name, seconds, onStop) {
    if (!state.enabled) return Promise.resolve(false);
    var s = pick(name);
    stopRing();

    ring.active = true;
    ring.slot = s;
    ring.onStop = onStop || null;
    ring.timer = setTimeout(stopRing, Math.max(1000, (Number(seconds) || 15) * 1000));
    document.addEventListener("pointerdown", stopRing, true);
    document.addEventListener("keydown", stopRing, true);

    function fallback() {
      chime(s);
      ring.chimeTimer = setInterval(function () { chime(s); }, 1300);
      return true;
    }

    if (!s.audio) return Promise.resolve(fallback());
    try {
      s.audio.loop = true;
      s.audio.currentTime = 0;
      s.audio.volume = state.volume;
      var p = s.audio.play();
      if (!p || !p.then) return Promise.resolve(true);
      return p.then(function () { return true; }).catch(function () { return fallback(); });
    } catch (err) {
      return Promise.resolve(fallback());
    }
  }

  /* ---------- unlock ---------- */

  /**
   * Browser melarang audio bunyi sebelum halaman disentuh. Dulu fungsi ini
   * menandai dirinya berhasil tanpa memeriksa — akibatnya perangkat yang cuma
   * dibuka tanpa diklik diam total, dan tidak ada yang tahu. Sekarang hasilnya
   * benar-benar diperiksa dan dilaporkan lewat isBlocked().
   */
  /** Baca keadaan sebenarnya setelah percobaan reda, lalu laporkan. */
  function settleState() {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var c = state.ctx;
        state.blocked = !!(c && c.state !== "running");
        state.unlocked = !state.blocked;
        if (typeof state.onChange === "function") state.onChange(state.blocked);
        resolve(!state.blocked);
      }, 80);
    });
  }

  function unlock() {
    var ac = ctx();
    var tries = [];

    // PENTING: resume() tanpa sentuhan user tidak reject — dia menggantung
    // selamanya. Jadi jangan pernah ditunggu, cukup dipicu lalu keadaannya
    // dibaca belakangan. Kalau ditunggu, seluruh deteksi ikut mandek.
    if (ac && ac.state === "suspended") {
      try { ac.resume().catch(function () {}); } catch (err) { /* abaikan */ }
    }

    Object.keys(SLOTS).forEach(function (k) {
      var a = SLOTS[k].audio;
      if (!a) return;
      var vol = a.volume;
      a.volume = 0;
      function restore() {
        try { a.pause(); a.currentTime = 0; } catch (err) { /* abaikan */ }
        a.volume = vol;
      }
      var p;
      try { p = a.play(); } catch (err) { a.volume = vol; return; }
      if (p && p.then) {
        tries.push(p.then(restore, function () { a.volume = vol; }));
      } else {
        restore();
      }
    });

    return Promise.all(tries).then(settleState, settleState);
  }

  /* ---------- file custom ---------- */

  function isAudioFile(file) {
    return !!file && (/^audio\//.test(file.type) || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name || ""));
  }

  function setCustomFile(file, name) {
    var s = pick(name);
    if (!isAudioFile(file)) return Promise.reject(new Error("bukan file audio"));
    if (file.size > MAX_BYTES) return Promise.reject(new Error("file terlalu besar"));
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("gagal membaca file")); };
      reader.onload = function () {
        var payload = { name: file.name, data: String(reader.result) };
        if (!write(s.customKey, payload)) {
          reject(new Error("storage penuh"));
          return;
        }
        probe(payload.data, true).then(function (a) {
          if (!a) {
            reject(new Error("format tidak didukung browser ini"));
            return;
          }
          assign(s, a, payload.name);
          state.unlocked = false;
          unlock();
          resolve(payload.name);
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function clearCustom(name) {
    var s = pick(name);
    try { localStorage.removeItem(s.customKey); } catch (err) { /* abaikan */ }
    return scanFolder(s);
  }

  function hasCustom(name) {
    var c = read(pick(name).customKey, null);
    return !!(c && c.data);
  }

  /* ---------- init ---------- */

  function init(opts) {
    state.enabled = read(ENABLED_KEY, true) !== false;
    var v = Number(read(VOLUME_KEY, 0.8));
    state.volume = isNaN(v) ? 0.8 : Math.min(1, Math.max(0, v));
    state.onChange = opts && opts.onChange;

    // dicoba terus sampai berhasil — sekali klik/ketik di mana pun cukup
    ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
      document.addEventListener(evt, function () {
        if (state.blocked) unlock();
      }, { capture: true });
    });
    return Promise.all([resolveSlot(SLOTS.warn), resolveSlot(SLOTS.ring)]).then(function (labels) {
      // sekali coba di awal: kadang browser sudah mengizinkan (tab pernah disentuh)
      return unlock().then(function () {
        return { warn: labels[0], ring: labels[1], blocked: state.blocked };
      });
    });
  }

  global.MintSound = {
    init: init,
    play: play,
    playLong: playLong,
    stopRing: stopRing,
    isRinging: function () { return ring.active; },
    unlock: unlock,
    /** true = browser masih melarang bunyi di perangkat ini */
    isBlocked: function () { return state.blocked; },
    isAudioFile: isAudioFile,
    setCustomFile: setCustomFile,
    clearCustom: clearCustom,
    hasCustom: hasCustom,
    slots: function () { return Object.keys(SLOTS); },
    label: function (name) { return pick(name).label; },
    isEnabled: function () { return state.enabled; },
    setEnabled: function (on) {
      state.enabled = !!on;
      if (!state.enabled) stopRing();
      write(ENABLED_KEY, state.enabled);
      return state.enabled;
    },
    getVolume: function () { return state.volume; },
    setVolume: function (v) {
      state.volume = Math.min(1, Math.max(0, Number(v) || 0));
      Object.keys(SLOTS).forEach(function (k) {
        if (SLOTS[k].audio) SLOTS[k].audio.volume = state.volume;
      });
      write(VOLUME_KEY, state.volume);
      return state.volume;
    },
  };
})(window);
