/* api.js — satu-satunya tempat frontend menyentuh server.
   Semua jadwal dan PIN ada di PostgreSQL; browser tidak menyimpan apa pun
   selain preferensi tampilan (filter, bunyi, mode compare). */
(function (global) {
  "use strict";

  function request(method, path, body) {
    var opts = {
      method: method,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      // sesi habis / dicabut -> balik ke halaman login
      if (res.status === 401) {
        location.href = "/login/";
        return Promise.reject(new Error("sesi habis"));
      }
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); } catch (err) { data = null; }
        }
        if (!res.ok) {
          throw new Error((data && data.error) || "Gagal menghubungi server (" + res.status + ")");
        }
        return data;
      });
    });
  }

  global.MintApi = {
    session: function () { return request("GET", "/api/session"); },
    logout: function () { return request("POST", "/api/logout"); },
    list: function () { return request("GET", "/api/mints"); },
    create: function (data) { return request("POST", "/api/mints", data); },
    update: function (id, data) { return request("PUT", "/api/mints/" + encodeURIComponent(id), data); },
    remove: function (id) { return request("DELETE", "/api/mints/" + encodeURIComponent(id)); },
    setWorked: function (id, account, on) {
      return request("POST", "/api/mints/" + encodeURIComponent(id) + "/worked", { account: account, on: on });
    },
    importMints: function (list) { return request("POST", "/api/mints/import", list); },
  };
})(window);
