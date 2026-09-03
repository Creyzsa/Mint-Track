/* extract.js — tebak isi form dari link X atau caption yang ditempel.
   Bagian tebak-menebak jalan 100% offline.
   Ambil caption dari link butuh request ke layanan pihak ketiga — hanya kalau
   dinyalakan sendiri lewat toggle di dialog (lihat fetchTweet). */
(function (global) {
  "use strict";

  var T = global.MintTime;

  /* ---------- kamus tebakan ---------- */

  var CHAINS = [
    { name: "ETH", re: /\b(eth|ethereum|erc-?721|erc-?20)\b/i },
    { name: "SOL", re: /\b(sol|solana|spl|cnft)\b/i },
    { name: "Base", re: /\bbase\b/i },
    { name: "BTC / Ordinals", re: /\b(btc|bitcoin|ordinals?|runes?|brc-?20)\b/i },
    { name: "Abstract", re: /\babstract\b/i },
    { name: "Berachain", re: /\bbera(chain)?\b/i },
    { name: "Monad", re: /\bmonad\b/i },
    { name: "Sui", re: /\bsui\b/i },
    { name: "Aptos", re: /\b(aptos|apt)\b/i },
    { name: "TON", re: /\bton\b/i },
    { name: "Arbitrum", re: /\b(arbitrum|arb)\b/i },
    { name: "Polygon", re: /\b(polygon|matic)\b/i },
    { name: "BNB Chain", re: /\b(bnb|bsc)\b/i },
    { name: "Blast", re: /\bblast\b/i },
    { name: "ApeChain", re: /\bape ?chain\b/i },
    { name: "Linea", re: /\blinea\b/i },
    { name: "Avalanche", re: /\b(avax|avalanche)\b/i },
    { name: "Hyperliquid", re: /\b(hyperliquid|hype)\b/i },
  ];

  var PLATFORMS = [
    { name: "Magic Eden", re: /magic ?eden|magiceden\.(io|us)/i },
    { name: "OpenSea", re: /open ?sea/i },
    { name: "Tensor", re: /\btensor\b|tensor\.trade/i },
    { name: "Blur", re: /\bblur\b|blur\.io/i },
    { name: "Pump.fun", re: /pump\.fun|\bpumpfun\b/i },
    { name: "Premint", re: /\bpremint\b|premint\.xyz/i },
    { name: "Alphabot", re: /\balphabot\b|alphabot\.app/i },
    { name: "Galxe", re: /\bgalxe\b|galxe\.com/i },
    { name: "Zealy", re: /\bzealy\b|zealy\.io/i },
    { name: "Discord", re: /discord\.(gg|com)|\bdiscord\b/i },
    { name: "Launchpad resmi", re: /\blaunch ?pad\b/i },
  ];

  // urutan = prioritas
  var TYPE_RULES = [
    { id: "airdrop", re: /\bairdrop\b|\bclaim(ing|s)?\b|\bfarm(ing)? reward/i },
    { id: "tge", re: /\btge\b|\bido\b|\bico\b|\bicm\b|\blisting\b|\bgo(es)? live on (binance|bybit|okx|upbit)/i },
    { id: "snapshot", re: /\bsnapshot\b/i },
    { id: "raffle", re: /\braffle\b|\bfcfs\b|\bsweepstake|\bgiveaway\b/i },
    { id: "mint", re: /\bpublic (mint|sale)\b|\bmint is live\b|\bminting now\b/i },
    { id: "presale", re: /\bpre-?sale\b|\bgtd\b|\bguaranteed\b|\bog (list|mint|sale)\b|\bearly access\b/i },
    { id: "wl", re: /\bwl\b|\bwhite ?list\b|\ballow ?list\b|\bregistrations? (open|close)|\bregister\b|\bapply now\b|\bwaitlist\b/i },
    { id: "mint", re: /\bmint(ing)?\b|\bdrop(s|ping)?\b/i },
  ];

  var CURRENCIES = "eth|sol|btc|bnb|matic|avax|ape|ton|sui|apt|usdc|usdt|pol|bera|mon";

  /* ---------- tebakan per field ---------- */

  function detectType(text) {
    for (var i = 0; i < TYPE_RULES.length; i++) {
      if (TYPE_RULES[i].re.test(text)) return TYPE_RULES[i].id;
    }
    return "";
  }

  function detectFrom(list, text) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].re.test(text)) return list[i].name;
    }
    return "";
  }

  function detectPrice(text) {
    var m = text.match(new RegExp("(\\d+(?:[.,]\\d+)?)\\s*(" + CURRENCIES + ")\\b", "i"));
    if (m) return m[1].replace(",", ".") + " " + m[2].toUpperCase();
    var usd = text.match(/\$\s?(\d+(?:[.,]\d+)?)\b/);
    if (usd) return "$" + usd[1];
    if (/\bfree\s*(mint|claim|drop)?\b/i.test(text) && !/\bnot free\b/i.test(text)) return "Free";
    if (/\bgratis\b/i.test(text)) return "Free";
    return "";
  }

  function detectSupply(text) {
    var m =
      text.match(/\b(?:total )?supply\s*[:=-]?\s*(\d[\d.,]*\d|\d)/i) ||
      text.match(/\b(\d[\d.,]*\d|\d)\s*(?:supply|items?|pieces?|pcs|editions?|nfts?)\b/i) ||
      // penghitung mint "1234/5555" — minimal 3 digit supaya tanggal "12/12" tidak ikut
      text.match(/\b(\d{3,7})\s*\/\s*\d{3,7}\b/);
    if (!m) return "";
    var v = m[1].replace(/[.,](?=\d{3}(\D|$))/g, "").replace(/[.,]+$/, "");
    return /^\d{1,12}$/.test(v) ? v : "";
  }

  function detectStatus(text) {
    if (/\bcongrats\b|\byou(?:'re| are|r wallet is)? ?(whitelisted|on the list)|\bwl secured\b|\bdapat wl\b/i.test(text)) return "won";
    if (/\bgtd\b|\bguaranteed\b/i.test(text)) return "won";
    if (/\b(sudah )?(registered|terdaftar|applied)\b/i.test(text)) return "registered";
    return "";
  }

  function stripEmoji(str) {
    return String(str || "").replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "");
  }

  function nameFromHandle(handle) {
    var s = String(handle || "").replace(/^@/, "")
      .replace(/[_.-]?(official|officialnft|nfts?|xyz|sol|eth|btc|labs|hq|io|dao|world|game)$/i, "")
      .replace(/[._-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
    if (!s) return "";
    return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  function detectName(text, authorName, handle) {
    var ticker = text.match(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/);
    if (ticker) return ticker[1].toUpperCase();

    var clean = stripEmoji(authorName)
      .replace(/\s*[|·•/–—-]\s*(mint|wl|nft|sol|eth|live|soon).*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (clean) return clean;

    return nameFromHandle(handle);
  }

  /* ---------- link X ---------- */

  function tweetRef(text) {
    var m = String(text).match(
      /(?:^|[\s(])https?:\/\/(?:www\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|nitter\.[a-z.]+)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i
    );
    if (m) return { handle: "@" + m[1], id: m[2] };
    var bare = String(text).trim().match(
      /^https?:\/\/(?:www\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i
    );
    return bare ? { handle: "@" + bare[1], id: bare[2] } : null;
  }

  function firstHandle(text) {
    var url = String(text).match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
    if (url && !/^(i|home|search|explore|notifications|messages)$/i.test(url[1])) return "@" + url[1];
    var at = String(text).match(/(?:^|\s)@([A-Za-z0-9_]{2,15})\b/);
    return at ? "@" + at[1] : "";
  }

  function firstLink(text, skipTweet) {
    var urls = String(text).match(/https?:\/\/\S+/g) || [];
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i].replace(/[),.]+$/, "");
      if (skipTweet && /(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status/i.test(u)) continue;
      if (/^https?:\/\/t\.co\//i.test(u)) continue;
      return u;
    }
    return urls.length ? urls[0].replace(/[),.]+$/, "") : "";
  }

  /* ---------- ambil caption (pihak ketiga) ---------- */

  var MIRRORS = [
    {
      label: "fxtwitter",
      url: function (id) { return "https://api.fxtwitter.com/status/" + id; },
      pick: function (j) {
        var t = j && j.tweet;
        if (!t || !t.text) return null;
        return {
          text: t.text,
          author: t.author && t.author.name,
          handle: t.author && t.author.screen_name ? "@" + t.author.screen_name : "",
          created: t.created_at || (t.created_timestamp ? t.created_timestamp * 1000 : null),
        };
      },
    },
    {
      label: "vxtwitter",
      url: function (id) { return "https://api.vxtwitter.com/Twitter/status/" + id; },
      pick: function (j) {
        if (!j || !j.text) return null;
        return { text: j.text, author: j.user_name, handle: j.user_screen_name ? "@" + j.user_screen_name : "", created: j.date_epoch ? j.date_epoch * 1000 : j.date };
      },
    },
  ];

  function fetchTweet(id) {
    var i = 0;
    function next() {
      if (i >= MIRRORS.length) return Promise.resolve(null);
      var mirror = MIRRORS[i++];
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      return fetch(mirror.url(id), { headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (json) {
          var data = json ? mirror.pick(json) : null;
          if (data) data.via = mirror.label;
          return data || next();
        })
        .catch(function () { return next(); })
        .then(function (out) {
          if (timer) clearTimeout(timer);
          return out;
        });
    }
    return next();
  }

  /* ---------- rangkuman ---------- */

  /**
   * Tebak semua field dari teks bebas.
   * @param {string} text  caption dan/atau link
   * @param {object} meta  { author, handle, created } dari caption yang diambil
   */
  function guess(text, meta) {
    var info = meta || {};
    var raw = String(text || "");
    var ref = info.created ? new Date(info.created) : new Date();
    if (isNaN(ref.getTime())) ref = new Date();

    var tw = tweetRef(raw);
    var handle = info.handle || (tw && tw.handle) || firstHandle(raw);
    var when = T.read(raw, ref);

    return {
      name: detectName(raw, info.author, handle),
      type: detectType(raw),
      chain: detectFrom(CHAINS, raw),
      platform: detectFrom(PLATFORMS, raw),
      source: handle,
      price: detectPrice(raw),
      supply: detectSupply(raw),
      status: detectStatus(raw),
      link: firstLink(raw, true) || (tw ? "https://x.com/" + tw.handle.slice(1) + "/status/" + tw.id : ""),
      datetime: when ? T.isoFromDate(when.date) : "",
      tz: when ? when.tz : "",
      tweet: tw,
    };
  }

  global.MintExtract = {
    guess: guess,
    tweetRef: tweetRef,
    fetchTweet: fetchTweet,
    nameFromHandle: nameFromHandle,
  };
})(window);
