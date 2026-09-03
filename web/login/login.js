/* login.js — satu-satunya kode yang boleh dilihat publik.
   Sengaja tipis: tidak ada data, tidak ada logika aplikasi, tidak ada rahasia. */
(function () {
  "use strict";

  var LABELS = { chishiya: "CHISHIYA", creyzsa: "CREYZSA" };
  var picked = null;
  var busy = false;
  var accounts = {};

  var el = {
    card: document.getElementById("gate-card"),
    whoRow: document.getElementById("gate-who"),
    form: document.getElementById("gate-form"),
    label: document.getElementById("gate-label"),
    pin: document.getElementById("gate-pin"),
    msg: document.getElementById("gate-msg"),
    submit: document.getElementById("gate-submit"),
    back: document.getElementById("gate-back"),
  };

  function say(text, tone) {
    el.msg.textContent = text || "";
    el.msg.className = "gate-msg" + (tone ? " " + tone : "");
  }

  function showPicker() {
    picked = null;
    el.form.hidden = true;
    el.whoRow.hidden = false;
    el.pin.value = "";
    el.card.removeAttribute("data-who");
    say("");
  }

  function showForm(who) {
    picked = who;
    var fresh = accounts[who] === false;
    el.whoRow.hidden = true;
    el.form.hidden = false;
    el.card.dataset.who = who;
    el.label.textContent = (fresh ? "Buat PIN untuk " : "PIN ") + LABELS[who];
    el.submit.textContent = fresh ? "Simpan & masuk" : "Masuk";
    el.pin.placeholder = fresh ? "minimal 4 karakter" : "••••";
    el.pin.setAttribute("autocomplete", fresh ? "new-password" : "current-password");
    el.pin.value = "";
    say(fresh ? "Pertama kali masuk — pilih PIN yang gampang kamu ingat." : "");
    el.pin.focus();
  }

  function submit(e) {
    e.preventDefault();
    if (busy || !picked) return;
    var pin = el.pin.value;
    if (!pin) {
      say("PIN belum diisi.", "bad");
      return;
    }

    busy = true;
    el.submit.disabled = true;
    say("Memeriksa…");

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ account: picked, pin: pin }),
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (r.ok) {
          location.href = "/app/";
          return;
        }
        busy = false;
        el.submit.disabled = false;
        el.pin.value = "";
        el.pin.focus();
        say((r.data && r.data.error) || "Gagal masuk.", "bad");
      })
      .catch(function () {
        busy = false;
        el.submit.disabled = false;
        say("Server tidak bisa dihubungi.", "bad");
      });
  }

  el.whoRow.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-who]");
    if (btn) showForm(btn.dataset.who);
  });
  el.form.addEventListener("submit", submit);
  el.back.addEventListener("click", showPicker);

  // cari tahu akun mana yang PIN-nya belum dibuat (tanpa membocorkan apa pun soal PIN)
  fetch("/api/accounts", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (list) {
      list.forEach(function (a) { accounts[a.id] = !!a.has_pin; });
    })
    .catch(function () { /* biarkan — dianggap sudah punya PIN */ });
})();
