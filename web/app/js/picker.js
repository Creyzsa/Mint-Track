/* picker.js — pemilih tanggal & jam tanpa ngetik.
   Semua diisi lewat klik: kalender, grid jam, chip menit, tombol geser.
   Nilai keluar selalu ISO WIB (+07:00). */
(function (global) {
  "use strict";

  var T = global.MintTime;
  var DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  var MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  var JUMPS = [
    { label: "Hari ini", days: 0 },
    { label: "Besok", days: 1 },
    { label: "Lusa", days: 2 },
    { label: "+7 hari", days: 7 },
    { label: "+30 hari", days: 30 },
  ];
  var NUDGES = [
    { label: "−1 jam", ms: -3600000 },
    { label: "−5 mnt", ms: -300000 },
    { label: "+5 mnt", ms: 300000 },
    { label: "+1 jam", ms: 3600000 },
    { label: "+1 hari", ms: 86400000 },
  ];

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function roundTo5(date) {
    var ms = date.getTime();
    var step = 5 * 60000;
    return new Date(Math.ceil(ms / step) * step);
  }

  function create(root, options) {
    var opts = options || {};
    var state = {
      date: roundTo5(new Date(Date.now() + 3600000)),
      tz: "WIB",
      viewY: 0,
      viewM: 0,
      touched: false,
    };

    root.classList.add("dtp");
    root.innerHTML = [
      '<div class="dtp-paste">',
      '  <input type="text" class="dtp-paste-input" placeholder="Tempel teks dari X / Discord — mis. &quot;Aug 25, 8PM UTC&quot;" autocomplete="off" spellcheck="false" />',
      '  <span class="dtp-paste-hint">otomatis dibaca</span>',
      "</div>",
      '<div class="dtp-jump"></div>',
      '<div class="dtp-body">',
      '  <div class="dtp-cal">',
      '    <div class="dtp-cal-head">',
      '      <button type="button" class="dtp-nav" data-nav="-1" aria-label="Bulan sebelumnya">‹</button>',
      '      <strong class="dtp-month"></strong>',
      '      <button type="button" class="dtp-nav" data-nav="1" aria-label="Bulan berikutnya">›</button>',
      "    </div>",
      '    <div class="dtp-dow"></div>',
      '    <div class="dtp-grid"></div>',
      "  </div>",
      '  <div class="dtp-time">',
      '    <div class="dtp-tzrow">',
      '      <span class="dtp-lbl">Zona input</span>',
      '      <div class="dtp-tz">',
      '        <button type="button" data-tz="WIB">WIB</button>',
      '        <button type="button" data-tz="UTC">UTC</button>',
      "      </div>",
      "    </div>",
      '    <div class="dtp-readout"><b class="dtp-hh">00</b><i>:</i><b class="dtp-mm">00</b><em class="dtp-tzlabel">WIB</em></div>',
      '    <span class="dtp-lbl">Jam</span>',
      '    <div class="dtp-hours"></div>',
      '    <span class="dtp-lbl">Menit</span>',
      '    <div class="dtp-mins"></div>',
      '    <div class="dtp-nudge"></div>',
      "  </div>",
      "</div>",
      '<p class="dtp-preview"></p>',
    ].join("");

    var q = function (sel) { return root.querySelector(sel); };
    var monthEl = q(".dtp-month");
    var gridEl = q(".dtp-grid");
    var hoursEl = q(".dtp-hours");
    var minsEl = q(".dtp-mins");
    var previewEl = q(".dtp-preview");
    var pasteEl = q(".dtp-paste-input");
    var pasteHint = q(".dtp-paste-hint");

    q(".dtp-dow").innerHTML = DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("");

    q(".dtp-jump").innerHTML = JUMPS.map(function (j) {
      return '<button type="button" class="chip" data-jump="' + j.days + '">' + j.label + "</button>";
    }).join("");

    q(".dtp-nudge").innerHTML = NUDGES.map(function (n) {
      return '<button type="button" class="chip ghost" data-nudge="' + n.ms + '">' + n.label + "</button>";
    }).join("");

    hoursEl.innerHTML = Array.from({ length: 24 }, function (_, h) {
      return '<button type="button" class="cell" data-hour="' + h + '">' + T.pad(h) + "</button>";
    }).join("");

    minsEl.innerHTML = MINUTES.map(function (m) {
      return '<button type="button" class="cell" data-min="' + m + '">' + T.pad(m) + "</button>";
    }).join("");

    /* ---------- state helpers ---------- */

    function disp() {
      return T.parts(state.date, state.tz);
    }

    function setDisp(p) {
      state.date = T.build(p, state.tz);
      state.touched = true;
      emit();
    }

    function syncView() {
      var p = disp();
      state.viewY = p.y;
      state.viewM = p.m;
    }

    function emit() {
      render();
      if (opts.onChange) opts.onChange(api.getValue());
    }

    /* ---------- render ---------- */

    function renderCalendar() {
      var p = disp();
      monthEl.textContent = T.monthTitle(state.viewY, state.viewM);

      var todayP = T.parts(new Date(), state.tz);
      var lead = T.firstDowMon(state.viewY, state.viewM);
      var total = T.daysInMonth(state.viewY, state.viewM);
      var cells = [];

      for (var i = 0; i < lead; i++) cells.push('<span class="day blank"></span>');
      for (var d = 1; d <= total; d++) {
        var cls = "day";
        if (state.viewY === p.y && state.viewM === p.m && d === p.d) cls += " on";
        if (state.viewY === todayP.y && state.viewM === todayP.m && d === todayP.d) cls += " today";
        var isPast =
          state.viewY < todayP.y ||
          (state.viewY === todayP.y && state.viewM < todayP.m) ||
          (state.viewY === todayP.y && state.viewM === todayP.m && d < todayP.d);
        if (isPast) cls += " past";
        var mark = opts.marks && opts.marks(state.viewY, state.viewM, d, state.tz) ? '<i class="dot"></i>' : "";
        cells.push('<button type="button" class="' + cls + '" data-day="' + d + '">' + d + mark + "</button>");
      }
      gridEl.innerHTML = cells.join("");
    }

    function renderTime() {
      var p = disp();
      q(".dtp-hh").textContent = T.pad(p.h);
      q(".dtp-mm").textContent = T.pad(p.min);
      q(".dtp-tzlabel").textContent = state.tz;

      root.querySelectorAll("[data-tz]").forEach(function (b) {
        b.classList.toggle("on", b.dataset.tz === state.tz);
      });
      hoursEl.querySelectorAll("[data-hour]").forEach(function (b) {
        b.classList.toggle("on", Number(b.dataset.hour) === p.h);
      });
      minsEl.querySelectorAll("[data-min]").forEach(function (b) {
        b.classList.toggle("on", Number(b.dataset.min) === p.min);
      });
    }

    function renderPreview() {
      var wib = T.dateLong(state.date, "WIB");
      var label = T.dayLabel(state.date, new Date());
      var diff = state.date.getTime() - Date.now();
      var rel = diff >= 0 ? T.remain(diff) + " lagi" : T.ago(-diff);
      previewEl.innerHTML =
        '<strong>' + wib + " · " + T.clock(state.date, "WIB") + " WIB</strong>" +
        '<span>' + T.clock(state.date, "UTC") + " UTC" + (label ? " · " + label : "") + " · " + rel + "</span>";
      previewEl.classList.toggle("warn", diff < 0);
    }

    function render() {
      renderCalendar();
      renderTime();
      renderPreview();
    }

    /* ---------- interaksi ---------- */

    root.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn || !root.contains(btn)) return;

      if (btn.dataset.nav) {
        e.preventDefault();
        var nm = state.viewM + Number(btn.dataset.nav);
        if (nm < 1) { state.viewM = 12; state.viewY -= 1; }
        else if (nm > 12) { state.viewM = 1; state.viewY += 1; }
        else state.viewM = nm;
        renderCalendar();
        return;
      }

      if (btn.dataset.day) {
        e.preventDefault();
        var p = disp();
        var day = Math.min(Number(btn.dataset.day), T.daysInMonth(state.viewY, state.viewM));
        setDisp({ y: state.viewY, m: state.viewM, d: day, h: p.h, min: p.min });
        return;
      }

      if (btn.dataset.jump != null && btn.dataset.jump !== "") {
        e.preventDefault();
        var base = T.parts(new Date(), state.tz);
        var shifted = new Date(Date.UTC(base.y, base.m - 1, base.d) + Number(btn.dataset.jump) * 86400000);
        var cur = disp();
        setDisp({
          y: shifted.getUTCFullYear(),
          m: shifted.getUTCMonth() + 1,
          d: shifted.getUTCDate(),
          h: cur.h,
          min: cur.min,
        });
        syncView();
        renderCalendar();
        return;
      }

      if (btn.dataset.hour) {
        e.preventDefault();
        var ph = disp();
        ph.h = Number(btn.dataset.hour);
        setDisp(ph);
        return;
      }
      if (btn.hasAttribute("data-min")) {
        e.preventDefault();
        var pm = disp();
        pm.min = Number(btn.dataset.min);
        setDisp(pm);
        return;
      }

      if (btn.dataset.nudge) {
        e.preventDefault();
        state.date = new Date(state.date.getTime() + Number(btn.dataset.nudge));
        state.touched = true;
        syncView();
        emit();
        return;
      }

      if (btn.dataset.tz) {
        e.preventDefault();
        state.tz = btn.dataset.tz;
        syncView();
        render();
        return;
      }
    });

    function readPaste() {
      var text = pasteEl.value;
      if (!text.trim()) {
        pasteHint.textContent = "otomatis dibaca";
        pasteHint.className = "dtp-paste-hint";
        return;
      }
      var hit = T.read(text, new Date());
      if (!hit) {
        pasteHint.textContent = "tidak terbaca";
        pasteHint.className = "dtp-paste-hint bad";
        return;
      }
      state.date = hit.date;
      state.touched = true;
      syncView();
      emit();
      pasteHint.textContent = "terbaca (" + hit.tz + ")";
      pasteHint.className = "dtp-paste-hint good";
      if (opts.onPaste) opts.onPaste(text, hit);
    }

    if (opts.paste === false) {
      root.querySelector(".dtp-paste").hidden = true;
    } else {
      pasteEl.addEventListener("input", readPaste);
      pasteEl.addEventListener("paste", function () { setTimeout(readPaste, 0); });
    }

    /* ---------- API ---------- */

    var api = {
      setValue: function (iso) {
        var d = T.toDate(iso);
        state.date = d || roundTo5(new Date(Date.now() + 3600000));
        state.tz = "WIB";
        state.touched = !!d;
        pasteEl.value = "";
        pasteHint.textContent = "otomatis dibaca";
        pasteHint.className = "dtp-paste-hint";
        syncView();
        render();
        return api;
      },
      getValue: function () {
        return T.isoFromDate(state.date);
      },
      getDate: function () {
        return new Date(state.date.getTime());
      },
      refresh: render,
    };

    api.setValue(null);
    return api;
  }

  global.MintPicker = { create: create };
})(window);
