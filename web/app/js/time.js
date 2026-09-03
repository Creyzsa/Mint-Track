/* time.js — semua urusan waktu.
   Aturan main: semua jadwal disimpan sebagai ISO WIB (+07:00).
   WIB tidak punya DST, jadi offsetnya tetap +7 jam — aman dihitung manual. */
(function (global) {
  "use strict";

  var WIB_MIN = 7 * 60;

  var DOW_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var DOW_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  var MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var MON_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /* ---------- konversi inti ---------- */

  // Date -> bagian tanggal/jam dalam WIB
  function toWib(date) {
    var u = new Date(date.getTime() + WIB_MIN * 60000);
    return {
      y: u.getUTCFullYear(),
      m: u.getUTCMonth() + 1,
      d: u.getUTCDate(),
      h: u.getUTCHours(),
      min: u.getUTCMinutes(),
      dow: u.getUTCDay(),
    };
  }

  // Date -> bagian tanggal/jam dalam UTC
  function toUtc(date) {
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      d: date.getUTCDate(),
      h: date.getUTCHours(),
      min: date.getUTCMinutes(),
      dow: date.getUTCDay(),
    };
  }

  function fromWib(p) {
    return new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min || 0) - WIB_MIN * 60000);
  }

  function fromUtc(p) {
    return new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min || 0));
  }

  // bagian waktu di zona offset tertentu (menit) -> Date
  function fromOffset(p, offsetMin) {
    return new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min || 0) - offsetMin * 60000);
  }

  function parts(date, tz) {
    return tz === "UTC" ? toUtc(date) : toWib(date);
  }

  function build(p, tz) {
    return tz === "UTC" ? fromUtc(p) : fromWib(p);
  }

  /* ---------- serialisasi ---------- */

  function isoFromDate(date) {
    var p = toWib(date);
    return p.y + "-" + pad(p.m) + "-" + pad(p.d) + "T" + pad(p.h) + ":" + pad(p.min) + ":00+07:00";
  }

  function toDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function isValid(iso) {
    return toDate(iso) !== null;
  }

  /* ---------- format tampilan ---------- */

  function clock(date, tz) {
    var p = parts(date, tz || "WIB");
    return pad(p.h) + ":" + pad(p.min);
  }

  // "Sel, 25 Agu 2026"
  function dateShort(date, tz) {
    var p = parts(date, tz || "WIB");
    return DOW_SHORT[p.dow] + ", " + pad(p.d) + " " + MON_SHORT[p.m - 1] + " " + p.y;
  }

  // "Selasa, 25 Agustus 2026"
  function dateLong(date, tz) {
    var p = parts(date, tz || "WIB");
    return DOW_LONG[p.dow] + ", " + p.d + " " + MON_LONG[p.m - 1] + " " + p.y;
  }

  // "25 Agu 2026, 20:00 WIB"
  function stamp(iso) {
    var d = toDate(iso);
    if (!d) return "—";
    var p = toWib(d);
    return pad(p.d) + " " + MON_SHORT[p.m - 1] + " " + p.y + ", " + pad(p.h) + ":" + pad(p.min) + " WIB";
  }

  function monthTitle(y, m) {
    return MON_LONG[m - 1] + " " + y;
  }

  // "2 hari 4 jam" / "18 mnt 30 dtk" / "sedang berlangsung"
  function remain(ms) {
    if (ms <= 0) return "sedang berlangsung";
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + " hari " + h + " jam";
    if (h > 0) return h + " jam " + m + " mnt";
    if (m > 0) return m + " mnt " + (s % 60) + " dtk";
    return s + " dtk";
  }

  // "3 hari lalu"
  function ago(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + " hari lalu";
    if (h > 0) return h + " jam lalu";
    if (m > 0) return m + " mnt lalu";
    return "baru saja";
  }

  function sameWibDay(a, b) {
    var pa = toWib(a);
    var pb = toWib(b);
    return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
  }

  // "hari ini" / "besok" / "lusa" / null
  function dayLabel(date, now) {
    var base = toWib(now || new Date());
    var midnight = fromWib({ y: base.y, m: base.m, d: base.d, h: 0, min: 0 });
    var diff = Math.floor((date.getTime() - midnight.getTime()) / 86400000);
    if (diff === 0) return "hari ini";
    if (diff === 1) return "besok";
    if (diff === 2) return "lusa";
    if (diff === -1) return "kemarin";
    return null;
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  // indeks hari pertama bulan, Senin = 0
  function firstDowMon(y, m) {
    return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  }

  /* ---------- baca teks jadi tanggal ---------- */

  var TZ_OFFSET = {
    utc: 0, gmt: 0, z: 0, zulu: 0,
    wib: 420, wita: 480, wit: 540,
    sgt: 480, myt: 480, hkt: 480, awst: 480, pht: 480,
    jst: 540, kst: 540,
    ist: 330, gst: 240, msk: 180,
    cet: 60, cest: 120, bst: 60, wet: 0, west: 60,
    est: -300, edt: -240, et: -240,
    cst: -360, cdt: -300, ct: -300,
    mst: -420, mdt: -360, mt: -360,
    pst: -480, pdt: -420, pt: -420,
    aest: 600, aedt: 660,
  };

  var MON_KEYS = {
    jan: 1, januari: 1, january: 1,
    feb: 2, februari: 2, february: 2,
    mar: 3, maret: 3, march: 3,
    apr: 4, april: 4,
    mei: 5, may: 5,
    jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7,
    agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10,
    nov: 11, november: 11,
    des: 12, desember: 12, dec: 12, december: 12,
  };

  var MON_PATTERN = Object.keys(MON_KEYS).sort(function (a, b) { return b.length - a.length; }).join("|");

  /**
   * Baca teks bebas (tweet, pesan Discord, dsb) jadi jadwal.
   * @returns {{date: Date, tz: string, hasDate: boolean, hasTime: boolean, note: string}|null}
   */
  function read(text, now) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    var s = raw.toLowerCase().replace(/\s+/g, " ");
    var ref = now || new Date();

    // 1) unix timestamp (detik / milidetik)
    var ts = s.match(/\b(1[6-9]\d{8}|2\d{9})(\d{3})?\b/);
    if (ts && !/\d{4}-\d{2}/.test(s)) {
      var ms = ts[2] ? Number(ts[1] + ts[2]) : Number(ts[1]) * 1000;
      return { date: new Date(ms), tz: "UTC", hasDate: true, hasTime: true, note: "timestamp" };
    }

    // 2) relatif: "in 2 hours", "2 jam lagi", "30 menit lagi"
    var rel = s.match(/\b(?:in|dalam)\s+(\d{1,3})\s*(menit|minute|minutes|min|m|jam|hour|hours|h|hari|day|days|d)\b/) ||
      s.match(/\b(\d{1,3})\s*(menit|minute|minutes|min|jam|hour|hours|hari|day|days)\s+lagi\b/);
    if (rel) {
      var n = Number(rel[1]);
      var unit = rel[2];
      var mult = /^(menit|minute|minutes|min|m)$/.test(unit) ? 60000
        : /^(jam|hour|hours|h)$/.test(unit) ? 3600000
          : 86400000;
      return { date: new Date(ref.getTime() + n * mult), tz: "WIB", hasDate: true, hasTime: true, note: "relatif" };
    }

    // 3) zona waktu
    var offset = 420;
    var tzLabel = "WIB";
    var explicitOffset = s.match(/\b(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/);
    if (explicitOffset) {
      var sign = explicitOffset[1] === "-" ? -1 : 1;
      offset = sign * (Number(explicitOffset[2]) * 60 + Number(explicitOffset[3] || 0));
      tzLabel = "UTC" + explicitOffset[1] + explicitOffset[2] + (explicitOffset[3] ? ":" + explicitOffset[3] : "");
    } else {
      var tzHit = s.match(new RegExp("\\b(" + Object.keys(TZ_OFFSET).filter(function (k) { return k.length > 1; }).join("|") + ")\\b"));
      if (tzHit) {
        offset = TZ_OFFSET[tzHit[1]];
        tzLabel = tzHit[1].toUpperCase();
      }
    }

    // 4) jam — titik dua dulu, lalu am/pm, terakhir bentuk "19.30".
    //    Bentuk titik dijaga ketat supaya harga desimal ("0.05 SOL") tidak dikira jam.
    var hasTime = false;
    var hh = 0;
    var mm = 0;
    var tColon = s.match(/\b(\d{1,2}):([0-5]\d)\s*(am|pm)?/);
    var tAmPm = s.match(/\b(\d{1,2})\s*(am|pm)\b/);
    var tDot = s.match(/(?:^|[^\d.,$])(\d{1,2})\.([0-5]\d)\b(?!\s*(?:%|k\b|m\b|jt\b|eth|sol|btc|bnb|matic|avax|ape|ton|sui|apt|usdc|usdt|pol|bera|mon))/);

    if (tColon) {
      hh = Number(tColon[1]);
      mm = Number(tColon[2]);
      if (tColon[3] === "pm" && hh < 12) hh += 12;
      if (tColon[3] === "am" && hh === 12) hh = 0;
      hasTime = true;
    } else if (tAmPm) {
      hh = Number(tAmPm[1]);
      if (tAmPm[2] === "pm" && hh < 12) hh += 12;
      if (tAmPm[2] === "am" && hh === 12) hh = 0;
      hasTime = true;
    } else if (tDot && tDot[1] !== "0") {
      hh = Number(tDot[1]);
      mm = Number(tDot[2]);
      hasTime = true;
    }
    if (hh > 23 || mm > 59) return null;

    // 5) tanggal
    // "hari ini" dihitung menurut zona yang ketemu di teks
    var refParts = toUtc(new Date(ref.getTime() + offset * 60000));
    var y = refParts.y;
    var mo = refParts.m;
    var da = refParts.d;
    var hasDate = false;

    var isoHit = s.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    var nameFirst = s.match(new RegExp("\\b(" + MON_PATTERN + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?\\b"));
    var dayFirst = s.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MON_PATTERN + ")\\.?(?:[,\\s]+(\\d{4}))?\\b"));
    var numeric = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);

    if (isoHit) {
      y = Number(isoHit[1]);
      mo = Number(isoHit[2]);
      da = Number(isoHit[3]);
      hasDate = true;
    } else if (nameFirst) {
      mo = MON_KEYS[nameFirst[1]];
      da = Number(nameFirst[2]);
      if (nameFirst[3]) y = Number(nameFirst[3]);
      hasDate = true;
    } else if (dayFirst) {
      da = Number(dayFirst[1]);
      mo = MON_KEYS[dayFirst[2]];
      if (dayFirst[3]) y = Number(dayFirst[3]);
      hasDate = true;
    } else if (numeric) {
      // urutan Indonesia: hari/bulan
      da = Number(numeric[1]);
      mo = Number(numeric[2]);
      if (mo > 12 && da <= 12) {
        var swap = da; da = mo; mo = swap;
      }
      if (numeric[3]) {
        y = Number(numeric[3]);
        if (y < 100) y += 2000;
      }
      hasDate = true;
    } else {
      var word = s.match(/\b(hari ini|today|besok|tomorrow|lusa)\b/);
      if (word) {
        var addDays = /besok|tomorrow/.test(word[1]) ? 1 : /lusa/.test(word[1]) ? 2 : 0;
        var shifted = new Date(Date.UTC(y, mo - 1, da) + addDays * 86400000);
        y = shifted.getUTCFullYear();
        mo = shifted.getUTCMonth() + 1;
        da = shifted.getUTCDate();
        hasDate = true;
      }
    }

    if (!hasDate && !hasTime) return null;
    if (mo < 1 || mo > 12 || da < 1 || da > daysInMonth(y, mo)) return null;

    var date = fromOffset({ y: y, m: mo, d: da, h: hh, min: mm }, offset);

    // tanpa tahun eksplisit: kalau sudah lewat jauh, geser ke tahun depan
    var yearGiven = !!(isoHit || (nameFirst && nameFirst[3]) || (dayFirst && dayFirst[3]) || (numeric && numeric[3]));
    if (hasDate && !yearGiven && date.getTime() < ref.getTime() - 86400000) {
      date = fromOffset({ y: y + 1, m: mo, d: da, h: hh, min: mm }, offset);
    }
    // hanya jam, tanpa tanggal: kalau sudah lewat, anggap besok
    if (!hasDate && hasTime && date.getTime() < ref.getTime()) {
      date = new Date(date.getTime() + 86400000);
    }

    return { date: date, tz: tzLabel, hasDate: hasDate, hasTime: hasTime, note: "" };
  }

  global.MintTime = {
    WIB_MIN: WIB_MIN,
    DOW_LONG: DOW_LONG,
    DOW_SHORT: DOW_SHORT,
    MON_SHORT: MON_SHORT,
    MON_LONG: MON_LONG,
    pad: pad,
    toWib: toWib,
    toUtc: toUtc,
    fromWib: fromWib,
    fromUtc: fromUtc,
    parts: parts,
    build: build,
    isoFromDate: isoFromDate,
    toDate: toDate,
    isValid: isValid,
    clock: clock,
    dateShort: dateShort,
    dateLong: dateLong,
    stamp: stamp,
    monthTitle: monthTitle,
    remain: remain,
    ago: ago,
    sameWibDay: sameWibDay,
    dayLabel: dayLabel,
    daysInMonth: daysInMonth,
    firstDowMon: firstDowMon,
    read: read,
  };
})(window);
