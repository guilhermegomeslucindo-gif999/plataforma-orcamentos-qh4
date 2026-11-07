/* Painel QH4 — cadastro e acompanhamento dos geradores de orçamento das marmorarias */
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(ms) { if (!ms) return "nunca"; var d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function ago(ms) {
    if (!ms) return "nenhum orçamento ainda";
    var days = Math.floor((Date.now() - ms) / 86400000);
    return days <= 0 ? "último orçamento hoje" : days === 1 ? "último orçamento ontem" : "último orçamento há " + days + " dias";
  }
  var ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
    power: '<path d="M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; }
  function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2800); }
  var app = $("#app");
  function topbarH() { document.documentElement.style.setProperty("--topbar-h", $(".topbar").offsetHeight + "px"); }
  window.addEventListener("resize", topbarH);

  /* ---------- API ---------- */
  var TK = "qh4.admin.token";
  var TOKEN = ""; try { TOKEN = localStorage.getItem(TK) || ""; } catch (e) {}
  function api(method, action, body, extra) {
    var o = { method: method, headers: { "Content-Type": "application/json" } };
    if (TOKEN) o.headers.Authorization = "Bearer " + TOKEN;
    if (body !== undefined) o.body = JSON.stringify(body);
    return fetch("/api/admin?action=" + action + (extra || ""), o).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (r.status === 401 && action !== "login") { logout("Sua sessão expirou. Entre novamente."); throw new Error((d && d.error) || "Sessão expirada."); }
        if (!r.ok) throw new Error((d && d.error) || (r.status === 413 ? "Arquivo grande demais." : "Erro " + r.status + " no servidor."));
        return d;
      });
    }, function () { throw new Error("Sem conexão com o servidor."); });
  }
  function logout(msg) { TOKEN = ""; try { localStorage.removeItem(TK); } catch (e) {} LIST = null; viewLogin(msg); }
  function base() { return location.origin; }
  function linkOf(m) { return base() + "/m/" + m.slug; }

  /* ---------- Cores ---------- */
  function hexRgb(h) { h = String(h || "").replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(h)) return null; return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function rgbHex(c) { return "#" + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }
  function lum(c) { var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rgbHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function derived(tema) {
    var W = [255, 255, 255], K = [0, 0, 0];
    var cor = hexRgb(tema.cor) || [138, 28, 28], ink = hexRgb(tema.escura) || [21, 19, 19];
    var t = 0, ink0 = ink; while (lum(ink) > 0.03 && t < 1) { t += 0.1; ink = mix(ink0, K, t); }
    var a = cor, i = 0; while (contrast(a, W) < 4.6 && i < 20) { i++; a = mix(cor, K, i * 0.05); }
    var l = cor, j = 0; while (contrast(l, ink) < 4.6 && j < 20) { j++; l = mix(cor, W, j * 0.05); }
    return { cor: rgbHex(cor), ink: rgbHex(ink), corInk: rgbHex(a), cor2: rgbHex(l), on: contrast(W, cor) >= 3 ? "#ffffff" : "#141111" };
  }

  /* ---------- Logo: recorta margens, reduz e sugere cores ---------- */
  function loadImage(src) { return new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = src; }); }
  function readFile(f) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = no; fr.readAsDataURL(f); }); }
  function processLogo(file) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error("Envie uma imagem (PNG, JPG, WEBP ou SVG)."));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error("Imagem grande demais (máx. 12 MB)."));
    return readFile(file).then(function (src) {
      return loadImage(src).then(function (im) {
        var w = im.naturalWidth || 600, h = im.naturalHeight || 600, sc = Math.min(1, 1600 / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
        var cx = cv.getContext("2d"); cx.drawImage(im, 0, 0, cv.width, cv.height);
        var data = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
        // fundo: transparente ou a cor dos cantos (quando são iguais)
        function px(x, y) { var i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; }
        var corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
        var bg = corners[0], same = corners.every(function (c) { return Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < 40 && Math.abs(c[3] - bg[3]) < 40; });
        var transparentBg = bg[3] < 20;
        function isBg(i) {
          if (data[i + 3] < 20) return true;
          if (!same || transparentBg) return false;
          return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 36;
        }
        var x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { if (!isBg((y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
        var padPx = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
        x0 = Math.max(0, x0 - padPx); y0 = Math.max(0, y0 - padPx); x1 = Math.min(W - 1, x1 + padPx); y1 = Math.min(H - 1, y1 + padPx);
        var cw = x1 - x0 + 1, ch = y1 - y0 + 1, s2 = Math.min(1, 700 / Math.max(cw, ch));
        var out = document.createElement("canvas"); out.width = Math.round(cw * s2); out.height = Math.round(ch * s2);
        var octx = out.getContext("2d");
        octx.drawImage(cv, x0, y0, cw, ch, 0, 0, out.width, out.height);
        // remove o fundo liso (ex.: logo em JPG com fundo branco), a partir das bordas
        if (same && !transparentBg) {
          var od = octx.getImageData(0, 0, out.width, out.height), p = od.data, OW = out.width, OH = out.height;
          var seen = new Uint8Array(OW * OH), stack = [];
          var dist = function (k) { return Math.abs(p[k] - bg[0]) + Math.abs(p[k + 1] - bg[1]) + Math.abs(p[k + 2] - bg[2]); };
          for (var ex = 0; ex < OW; ex++) { stack.push(ex, (OH - 1) * OW + ex); }
          for (var ey = 0; ey < OH; ey++) { stack.push(ey * OW, ey * OW + OW - 1); }
          while (stack.length) {
            var n = stack.pop(); if (seen[n]) continue; seen[n] = 1;
            var k = n * 4, dd = dist(k);
            if (dd > 90) continue;
            p[k + 3] = dd < 36 ? 0 : Math.min(p[k + 3], Math.round((dd - 36) / 54 * 255));
            if (dd >= 60) continue;
            var nx = n % OW, ny = (n - nx) / OW;
            if (nx > 0) stack.push(n - 1); if (nx < OW - 1) stack.push(n + 1); if (ny > 0) stack.push(n - OW); if (ny < OH - 1) stack.push(n + OW);
          }
          octx.putImageData(od, 0, 0);
        }
        var url = out.toDataURL("image/png");
        if (url.length > 900000) url = out.toDataURL("image/webp", 0.92);
        // cores
        var counts = {}, darks = [0, 0, 0, 0], lightSum = 0, opaque = 0, avg = [0, 0, 0], step = Math.max(1, Math.floor(Math.sqrt((cw * ch) / 40000)));
        for (var yy = y0; yy <= y1; yy += step) for (var xx = x0; xx <= x1; xx += step) {
          var i = (yy * W + xx) * 4; if (isBg(i) || data[i + 3] < 200) continue;
          var c = [data[i], data[i + 1], data[i + 2]], hsl = rgbHsl(c); opaque++; lightSum += hsl[2]; avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2];
          if (hsl[2] < 0.2) { darks[0] += c[0]; darks[1] += c[1]; darks[2] += c[2]; darks[3]++; }
          if (hsl[1] > 0.28 && hsl[2] > 0.12 && hsl[2] < 0.9) {
            var key = Math.round(hsl[0] / 15) % 24;
            var b = counts[key] || (counts[key] = { n: 0, r: 0, g: 0, b: 0 }); b.n++; b.r += c[0]; b.g += c[1]; b.b += c[2];
          }
        }
        var keys = Object.keys(counts).sort(function (a, b) { return counts[b].n - counts[a].n; });
        var sugest = keys.slice(0, 4).filter(function (k) { return counts[k].n > opaque * 0.01; }).map(function (k) { var b = counts[k]; return rgbHex([b.r / b.n, b.g / b.n, b.b / b.n]); });
        var dark = darks[3] > opaque * 0.03 ? rgbHex([darks[0] / darks[3], darks[1] / darks[3], darks[2] / darks[3]]) : null;
        var cor = sugest[0] || dark || "#2b2b2b";
        var escura = dark || rgbHex(mix(hexRgb(cor), [0, 0, 0], 0.82));
        var avgC = opaque ? [avg[0] / opaque, avg[1] / opaque, avg[2] / opaque] : [0, 0, 0];
        var fundo = same && !transparentBg ? (lum(bg) < 0.2 ? "escuro" : "claro") : (opaque && contrast(avgC, [255, 255, 255]) < 2.6 ? "escuro" : "claro");
        if (dark) sugest.push(dark);
        return { url: url, cor: cor, escura: escura, fundo: fundo, sugestoes: sugest.filter(function (v, i, a) { return a.indexOf(v) === i; }) };
      });
    });
  }

  /* ---------- Rotas ---------- */
  var LIST = null, FORM = null, PENDING = null;
  function route() {
    if (!TOKEN) return viewLogin();
    $(".tabs").hidden = false;
    var h = location.hash.replace(/^#\/?/, ""), parts = h.split("/");
    var tab = parts[0] === "nova" ? "nova" : "lista";
    $$(".tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === tab); });
    closeModal();
    if (parts[0] === "sair") { if (confirm("Sair do painel neste aparelho?")) logout(); else history.back(); return; }
    if (parts[0] === "nova") return viewForm(null);
    if (parts[0] === "editar" && parts[1]) return loadEdit(parts[1]);
    viewList();
    if (PENDING) { var pd = PENDING; PENDING = null; showAccess(pd.m, pd.senha, "Gerador criado!"); }
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  /* ---------- Login ---------- */
  function viewLogin(msg) {
    $(".tabs").hidden = true;
    app.innerHTML = '<div class="login"><form class="login-card" id="lf"><div class="login-brand dark"><span class="qh4-mark" style="font-size:44px">QH<b>4</b></span></div>' +
      '<h1>Painel de geradores</h1><p class="login-sub">Acesso dos gestores QH4</p>' +
      (msg ? '<div class="alert" style="text-align:left">' + ico("info") + "<div>" + esc(msg) + "</div></div>" : "") +
      '<label class="field"><span>Senha do painel</span><div class="pw-wrap"><input type="password" id="lp" autocomplete="current-password" required><button type="button" class="pw-eye" data-eye="lp" aria-label="Mostrar senha">' + ico("eye") + "</button></div></label>" +
      '<button class="btn primary wide" id="lb">Entrar</button><p class="login-err" id="le" role="alert"></p></form></div>';
    var pw = $("#lp"); setTimeout(function () { pw.focus(); }, 50);
    $("#lf").addEventListener("submit", function (e) {
      e.preventDefault(); var b = $("#lb"); b.disabled = true; b.textContent = "Entrando…"; $("#le").textContent = "";
      api("POST", "login", { password: pw.value }).then(function (d) { TOKEN = d.token; try { localStorage.setItem(TK, TOKEN); } catch (er) {} route(); },
        function (err) { b.disabled = false; b.textContent = "Entrar"; $("#le").textContent = err.message; pw.select(); });
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-eye]"); if (!b) return;
    var inp = document.getElementById(b.dataset.eye), show = inp.type === "password";
    inp.type = show ? "text" : "password"; b.innerHTML = ico(show ? "eyeOff" : "eye"); b.classList.toggle("on", show);
    b.setAttribute("aria-label", show ? "Esconder senha" : "Mostrar senha");
  });

  /* ---------- Lista ---------- */
  var filtro = "", filtroSquad = "";
  function viewList() {
    if (!LIST) app.innerHTML = '<div class="loading"><span class="spin"></span>Carregando marmorarias…</div>'; else renderList();
    api("GET", "list").then(function (l) { LIST = l; if (!/^#\/(nova|editar)/.test(location.hash)) renderList(); },
      function (e) { if (!LIST) app.innerHTML = '<div class="empty"><strong>Não foi possível carregar</strong>' + esc(e.message) + "</div>"; else toast(e.message); });
  }
  function renderList() {
    var l = LIST || [];
    var ativos = l.filter(function (m) { return m.ativo; }).length;
    var s30 = l.reduce(function (s, m) { return s + m.stats.ultimos30; }, 0);
    var fech = l.reduce(function (s, m) { return s + m.stats.fechados; }, 0), perd = l.reduce(function (s, m) { return s + m.stats.perdidos; }, 0);
    var vf = l.reduce(function (s, m) { return s + m.stats.valorFechado; }, 0);
    var h = '<div class="page-head"><div><h1>Marmorarias</h1><p>Cada marmoraria tem o próprio gerador, com a sua identidade, link e senha.</p></div>' +
      '<div class="head-actions"><a class="btn gold" href="#/nova">' + ico("plus") + "Nova marmoraria</a></div></div>";
    h += '<div class="p-stats">' +
      '<div class="stat"><small>Marmorarias ativas</small><strong>' + ativos + "</strong><span>" + l.length + " cadastradas</span></div>" +
      '<div class="stat"><small>Orçamentos em 30 dias</small><strong>' + s30 + "</strong><span>somando todas</span></div>" +
      '<div class="stat"><small>Conversão</small><strong>' + (fech + perd ? Math.round(fech / (fech + perd) * 100) : 0) + "%</strong><span>" + fech + " fechados · " + perd + " perdidos</span></div>" +
      '<div class="stat"><small>Valor fechado</small><strong style="font-size:21px">' + BRL.format(vf) + "</strong><span>registrado pelas equipes</span></div></div>";
    if (!l.length) {
      h += '<div class="empty"><strong>Nenhuma marmoraria cadastrada</strong>Cadastre a primeira para gerar o link do gerador de orçamentos.<div style="margin-top:14px"><a class="btn gold" href="#/nova">' + ico("plus") + "Nova marmoraria</a></div></div>";
      app.innerHTML = h; return;
    }
    h += '<div class="toolbar"><input class="search" type="search" id="fs" placeholder="Buscar marmoraria" value="' + esc(filtro) + '" autocomplete="off">' +
      '<div class="seg" id="fsq">' + ["", "A", "B", "C", "D"].map(function (q) { return '<button type="button" data-q="' + q + '" class="' + (filtroSquad === q ? "on" : "") + '">' + (q ? "Squad " + q : "Todos") + "</button>"; }).join("") + "</div></div>" +
      '<div class="m-grid" id="mg"></div>';
    app.innerHTML = h; renderCards();
    $("#fs").addEventListener("input", function (e) { filtro = e.target.value; renderCards(); });
    $$("#fsq button").forEach(function (b) { b.addEventListener("click", function () { filtroSquad = b.dataset.q; $$("#fsq button").forEach(function (x) { x.classList.toggle("on", x === b); }); renderCards(); }); });
  }
  function renderCards() {
    var t = filtro.trim().toLowerCase();
    var l = (LIST || []).filter(function (m) {
      if (filtroSquad && m.squad !== filtroSquad) return false;
      return !t || (m.nome + " " + m.slug + " " + (m.empresa.cidade || "") + " squad " + (m.squad || "")).toLowerCase().indexOf(t) > -1;
    });
    var el = $("#mg"); if (!el) return;
    if (!l.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>Nada encontrado</strong>Tente outra busca.</div>'; return; }
    el.innerHTML = l.map(function (m) {
      var tm = m.tema || {}, st = m.stats, conv = st.fechados + st.perdidos ? Math.round(st.fechados / (st.fechados + st.perdidos) * 100) + "%" : "–";
      var dark = tm.fundoLogo === "escuro";
      return '<div class="m-card' + (m.ativo ? "" : " off") + '"><div class="m-top"><div class="m-logo' + (dark ? " dark" : "") + '" style="--m-ink:' + esc(tm.escura) + ";--m-cor:" + esc(tm.cor) + '">' +
        (m.logoUrl ? '<img src="' + esc(m.logoUrl) + '" alt="">' : "<span>" + esc(m.nome.replace(/^marmoraria\s+/i, "").slice(0, 2).toUpperCase()) + "</span>") + "</div>" +
        '<div class="m-info"><p class="m-name">' + esc(m.nome) + (m.ativo ? "" : ' <span class="tag-off">Desativada</span>') + "</p>" +
        '<div class="m-link">' + (m.squad ? '<span class="squad-tag">Squad ' + esc(m.squad) + "</span>" : '<span class="squad-tag none">Sem squad</span>') + "</div>" +
        '<div class="m-link"><span class="m-swatch" style="background:' + esc(tm.cor) + '"></span><code>/m/' + esc(m.slug) + "</code></div>" +
        '<div class="m-link">' + esc(m.empresa.cidade || "Cadastrada em " + fmtDate(m.createdAt)) + "</div></div></div>" +
        '<div class="m-access"><div class="row"><span class="k">Link</span><span class="v">' + esc(linkOf(m).replace(/^https?:\/\//, "")) + '</span><button class="icon-btn" data-copy="' + esc(linkOf(m)) + '" title="Copiar link" aria-label="Copiar link">' + ico("copy") + "</button></div>" +
        '<div class="row"><span class="k">Senha</span><span class="v">' + (m.senha ? esc(m.senha) : '<i>não registrada · use “Trocar senha”</i>') + "</span>" + (m.senha ? '<button class="icon-btn" data-copy="' + esc(m.senha) + '" title="Copiar senha" aria-label="Copiar senha">' + ico("copy") + "</button>" : "") + "</div></div>" +
        '<div class="m-nums"><div><strong>' + st.total + "</strong><small>Orçamentos</small></div><div><strong>" + st.abertos + "</strong><small>Abertos</small></div><div><strong>" + st.fechados + "</strong><small>Fechados</small></div><div><strong>" + conv + "</strong><small>Conversão</small></div></div>" +
        '<div class="m-foot">' + esc(ago(st.ultimo)) + (st.valorFechado ? " · " + BRL.format(st.valorFechado) + " fechados" : "") + "</div>" +
        '<div class="m-actions"><a class="btn sm" href="' + esc(linkOf(m)) + '" target="_blank" rel="noopener">' + ico("open") + "Abrir</a>" +
        '<button class="btn sm" data-a="share" data-id="' + m.id + '">' + ico("send") + "Enviar acesso</button><span class=\"grow\"></span>" +
        '<a class="icon-btn" href="#/editar/' + m.id + '" title="Editar" aria-label="Editar">' + ico("edit") + "</a>" +
        '<button class="icon-btn" data-a="pw" data-id="' + m.id + '" title="Trocar senha da equipe" aria-label="Trocar senha">' + ico("key") + "</button>" +
        '<button class="icon-btn" data-a="toggle" data-id="' + m.id + '" title="' + (m.ativo ? "Desativar" : "Ativar") + '" aria-label="' + (m.ativo ? "Desativar" : "Ativar") + '">' + ico("power") + "</button>" +
        '<button class="icon-btn danger" data-a="del" data-id="' + m.id + '" title="Excluir" aria-label="Excluir">' + ico("trash") + "</button></div></div>";
    }).join("");
  }
  function byId(id) { return (LIST || []).filter(function (m) { return m.id === id; })[0]; }

  /* ---------- Modais ---------- */
  function openModal(html) { closeModal(); document.body.insertAdjacentHTML("beforeend", '<div class="modal-back" data-modal><div class="modal" role="dialog" aria-modal="true">' + html + "</div></div>"); document.body.style.overflow = "hidden"; }
  function closeModal() { $$("[data-modal]").forEach(function (m) { m.remove(); }); document.body.style.overflow = ""; }
  document.addEventListener("click", function (e) { if (e.target.matches && e.target.matches("[data-modal]")) closeModal(); if (e.target.closest && e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  function copy(t, msg) {
    var ok = function () { toast(msg || "Copiado"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, fb); else fb();
    function fb() { var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Não foi possível copiar"); } ta.remove(); }
  }
  function accessMsg(m, senha) {
    return "Olá! O gerador de orçamentos da " + m.nome + " já está no ar.\n\n" +
      "Acesse: " + linkOf(m) + "\n" + (senha ? "Senha da equipe: " + senha + "\n" : "Senha da equipe: (a mesma que combinamos)\n") +
      "\nDica: salve o link na tela inicial do celular para abrir como um aplicativo. Qualquer dúvida, é só chamar.";
  }
  function showAccess(m, senha, title) {
    senha = senha || m.senha || "";
    var msg = accessMsg(m, senha);
    openModal('<div class="modal-head"><h2>' + esc(title || "Acesso da marmoraria") + '</h2><button class="icon-btn" data-close aria-label="Fechar">' + ico("x") + "</button></div>" +
      '<div class="done">' + (title ? '<div class="big">' + ico("check") + "</div>" : "") +
      '<div class="access"><div class="row"><span class="k">Link</span><span class="v">' + esc(linkOf(m)) + '</span><button class="icon-btn" data-copy="' + esc(linkOf(m)) + '" aria-label="Copiar link">' + ico("copy") + "</button></div>" +
      (senha ? '<div class="row"><span class="k">Senha</span><span class="v">' + esc(senha) + '</span><button class="icon-btn" data-copy="' + esc(senha) + '" aria-label="Copiar senha">' + ico("copy") + "</button></div>" : "") + "</div>" +
      '<p class="label" style="text-align:left;margin:0 0 6px">Mensagem pronta para enviar ao cliente</p><div class="msg-box" id="am">' + esc(msg) + "</div>" +
      '<div class="add-row" style="margin-top:14px;justify-content:flex-end"><a class="btn" target="_blank" rel="noopener" href="' + esc(linkOf(m)) + '">' + ico("open") + "Abrir gerador</a>" +
      '<button class="btn gold" data-copy-msg>' + ico("copy") + "Copiar mensagem</button></div>" +
      (senha ? "" : '<p class="subnote" style="margin-top:12px">Esta marmoraria ainda não tem senha registrada no painel. Use “Trocar senha” para definir uma.</p>') + "</div>");
  }
  document.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("[data-copy]"); if (c) return copy(c.dataset.copy);
    if (e.target.closest && e.target.closest("[data-copy-msg]")) copy($("#am").textContent, "Mensagem copiada");
  });
  function genPassword() {
    var a = "abcdefghjkmnpqrstuvwxyz23456789", out = "", arr = new Uint32Array(8);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (var i = 0; i < 8; i++) out += a[arr[i] % a.length];
    return out.slice(0, 4) + "-" + out.slice(4);
  }
  function pwModal(m) {
    openModal('<form id="pwf"><div class="modal-head"><h2>Trocar senha · ' + esc(m.nome) + '</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">' + ico("x") + "</button></div>" +
      '<div class="alert">' + ico("info") + "<div>Quem estiver conectado no gerador será desconectado e vai precisar da senha nova.</div></div>" +
      '<label class="field"><span>Nova senha da equipe</span><div class="pw-wrap"><input type="password" id="np" minlength="6" required autocomplete="new-password"><button type="button" class="pw-eye" data-eye="np" aria-label="Mostrar senha">' + ico("eye") + "</button></div><small>Mínimo de 6 caracteres.</small></label>" +
      '<div class="add-row" style="margin-top:16px;justify-content:space-between"><button type="button" class="btn ghost" id="gp">' + ico("spark") + 'Gerar senha</button><button class="btn gold" id="sp">Salvar senha</button></div></form>');
    var np = $("#np"); setTimeout(function () { np.focus(); }, 50);
    $("#gp").addEventListener("click", function () { np.value = genPassword(); np.type = "text"; });
    $("#pwf").addEventListener("submit", function (e) {
      e.preventDefault(); var b = $("#sp"); b.disabled = true;
      api("POST", "password", { senha: np.value }, "&id=" + encodeURIComponent(m.id)).then(function () { m.senha = np.value; renderCards(); showAccess(m, np.value, "Senha alterada"); }, function (err) { b.disabled = false; toast(err.message); });
    });
  }
  function delModal(m) {
    openModal('<form id="df"><div class="modal-head"><h2>Excluir ' + esc(m.nome) + '</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">' + ico("x") + "</button></div>" +
      '<div class="alert" style="background:var(--bad-soft);border-color:#efc9c0;color:#7a2a1d">' + ico("info") + "<div>Isso apaga a marmoraria e <b>todos os " + m.stats.total + " orçamentos</b> dela. Não dá para desfazer. Se for só pausar, use <b>Desativar</b>.</div></div>" +
      '<label class="field"><span>Para confirmar, digite <b>' + esc(m.slug) + "</b></span><input type=\"text\" id=\"dc\" autocomplete=\"off\"></label>" +
      '<div class="add-row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn danger" id="db">' + ico("trash") + "Excluir definitivamente</button></div></form>");
    $("#dc").focus();
    $("#df").addEventListener("submit", function (e) {
      e.preventDefault(); var b = $("#db"); b.disabled = true;
      api("DELETE", "delete", { confirmar: $("#dc").value.trim() }, "&id=" + encodeURIComponent(m.id)).then(function () {
        LIST = LIST.filter(function (x) { return x.id !== m.id; }); closeModal(); toast("Marmoraria excluída"); renderList();
      }, function (err) { b.disabled = false; toast(err.message); });
    });
  }
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return;
    var m = byId(b.dataset.id); if (!m) return;
    if (b.dataset.a === "share") showAccess(m, "");
    if (b.dataset.a === "pw") pwModal(m);
    if (b.dataset.a === "del") delModal(m);
    if (b.dataset.a === "toggle") {
      if (m.ativo && !confirm("Desativar o gerador da " + m.nome + "? A equipe não vai conseguir entrar até você ativar de novo. Nada é apagado.")) return;
      api("PUT", "update", { ativo: !m.ativo }, "&id=" + encodeURIComponent(m.id)).then(function (u) {
        Object.assign(m, { ativo: u.ativo }); renderCards(); toast(u.ativo ? "Marmoraria ativada" : "Marmoraria desativada");
      }, function (err) { toast(err.message); });
    }
  });

  /* ---------- Formulário (nova / editar) ---------- */
  /* ---------- Campos do gerador ---------- */
  var CATALOGO = [
    { g: "Cliente e obra", itens: [["cliente.tel", "WhatsApp do cliente"], ["arquiteto", "Arquiteto(a) ou designer"], ["cliente.email", "E-mail do cliente"], ["obra.endereco", "Endereço da obra"], ["obra.bairro", "Bairro"], ["obra.cidade", "Cidade"], ["vendedor", "Vendedor responsável e WhatsApp"]] },
    { g: "Peças", itens: [["peca.qtd", "Quantidade"], ["peca.espessura", "Espessura"], ["peca.acabamento", "Acabamento"], ["peca.obs", "Observação da peça"], ["peca.detalhes", "Detalhes de acabamento (botões)"], ["peca.precoM2", "R$ por m² (cálculo automático)"], ["comparar", "Comparar 2 opções de material"]] },
    { g: "Valores e condições", itens: [["servicos", "Serviços (entrega, instalação…)"], ["desconto", "Desconto"], ["pagamento", "Forma de pagamento"], ["prazo", "Prazo de produção"], ["inclusos", "O que está e o que não está incluso"]] },
    { g: "Documento", itens: [["imagens", "Imagens e referências"], ["explicarMateriais", "Explicação dos materiais"], ["observacoes", "Observações para o cliente"], ["termos", "Condições gerais"], ["assinatura", "Assinatura de aceite no PDF"]] }
  ];
  var LISTAS_PADRAO = {
    ambientes: ["Cozinha", "Área gourmet", "Ilha", "Banheiro social", "Banheiro suíte", "Lavabo", "Lavanderia", "Varanda", "Sala de estar", "Escada", "Área externa", "Churrasqueira"],
    pecas: ["Bancada", "Ilha", "Lavatório", "Tampo", "Frontão", "Saia", "Soleira", "Peitoril", "Nicho", "Revestimento", "Piso", "Rodapé", "Degrau", "Prateleira", "Mesa"],
    materiais: ["Quartzo Branco", "Quartzo Cinza", "Quartzo Preto", "Quartzito Taj Mahal", "Quartzito Branco", "Quartzito Perla Venata", "Granito Preto São Gabriel", "Granito Branco Itaúnas", "Granito Cinza Corumbá", "Granito Verde Ubatuba", "Mármore Carrara", "Mármore Branco Piguês", "Mármore Travertino", "Nanoglass", "Superfície Ultracompacta", "Porcelanato"],
    acabamentos: ["Polido", "Escovado", "Levigado", "Flameado", "Apicoado", "Acetinado"],
    espessuras: ["1 cm", "2 cm", "3 cm", "4 cm"],
    detalhes: ["Testeira 4 cm", "Saia", "Rodobanca", "Frontão", "Furo de cuba", "Furo de torneira", "Recorte de cooktop", "Cuba esculpida", "Borda reta", "Borda boleada", "Meia-esquadria", "Pés laterais"],
    pagamentos: ["50% de entrada e 50% na instalação", "À vista no PIX com 5% de desconto", "Entrada + saldo em até 10x no cartão", "A combinar"],
    motivos: ["Preço", "Prazo", "Foi para a concorrência", "Desistiu ou adiou a obra", "Não respondeu", "Outro"]
  };
  var LISTAS_NOMES = [["materiais", "Materiais"], ["detalhes", "Detalhes de acabamento (botões da peça)"], ["ambientes", "Ambientes"], ["pecas", "Tipos de peça"], ["acabamentos", "Acabamentos"], ["espessuras", "Espessuras"], ["pagamentos", "Formas de pagamento (atalhos)"], ["motivos", "Motivos de perda"]];
  var TIPOS = [["texto", "Texto"], ["numero", "Número"], ["valor", "Valor em R$"], ["simnao", "Sim / Não"], ["lista", "Lista de opções"]];
  var LOCAIS = [["cliente", "Dados do cliente e da obra"], ["peca", "Em cada peça"], ["condicoes", "Condições"]];
  function normCampos(c) {
    c = c || {};
    return { ocultar: Object.assign({}, c.ocultar || {}), extras: (c.extras || []).map(function (e) { return Object.assign({ opcoes: [], pdf: true, obrigatorio: false }, e); }), listas: Object.assign({}, c.listas || {}) };
  }
  function cid() { return "c" + Math.random().toString(36).slice(2, 9); }
  function camposHTML() {
    var C = FORM.campos, h = "";
    h += '<p class="cx-sub">Campos padrão <span>Desligue o que esta marmoraria não usa. O campo some do formulário e do PDF.</span></p><div class="cx-groups">';
    CATALOGO.forEach(function (g) {
      h += '<div class="cx-group"><p class="cx-gt">' + g.g + "</p>";
      g.itens.forEach(function (it) {
        var on = !C.ocultar[it[0]];
        h += '<label class="switch cx-sw"><input type="checkbox" data-ocultar="' + it[0] + '"' + (on ? " checked" : "") + '><span class="track"></span><span class="switch-text">' + esc(it[1]) + "</span></label>";
      });
      h += "</div>";
    });
    h += '</div><p class="cx-fixed">' + ico("info") + "<span>Sempre aparecem: nome do cliente, data, peças com medidas, material e valor, validade e o total.</span></p>";
    h += '<p class="cx-sub">Campos novos <span>Crie campos sob medida para esta marmoraria.</span></p>';
    if (!C.extras.length) h += '<div class="empty" style="padding:18px">Nenhum campo novo. Ex.: “Cor do rejunte”, “Prazo combinado”, “Tem elevador na obra?”.</div>';
    C.extras.forEach(function (e, i) {
      h += '<div class="cx-row" data-i="' + i + '"><div class="cx-main">' +
        '<label class="field"><span>Nome do campo</span><input type="text" data-cx="nome" value="' + esc(e.nome) + '" maxlength="60" placeholder="Ex.: Cor do rejunte"></label>' +
        '<label class="field"><span>Tipo</span><select data-cx="tipo">' + TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (e.tipo === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Onde aparece</span><select data-cx="local">' + LOCAIS.map(function (t) { return '<option value="' + t[0] + '"' + (e.local === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></label>" +
        (e.tipo === "lista" ? '<label class="field cx-ops"><span>Opções <small>(separe por vírgula)</small></span><input type="text" data-cx="opcoes" value="' + esc((e.opcoes || []).join(", ")) + '" placeholder="Ex.: Branco, Cinza, Preto"></label>' : "") +
        '</div><div class="cx-side"><label class="switch"><input type="checkbox" data-cx="pdf"' + (e.pdf ? " checked" : "") + '><span class="track"></span><span class="switch-text">No PDF</span></label>' +
        '<label class="switch"><input type="checkbox" data-cx="obrigatorio"' + (e.obrigatorio ? " checked" : "") + '><span class="track"></span><span class="switch-text">Obrigatório</span></label>' +
        '<div class="cx-btns"><button type="button" class="icon-btn" data-cxa="up" title="Subir" aria-label="Subir"' + (i ? "" : " disabled") + '><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>' +
        '<button type="button" class="icon-btn" data-cxa="down" title="Descer" aria-label="Descer"' + (i < C.extras.length - 1 ? "" : " disabled") + '><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>' +
        '<button type="button" class="icon-btn danger" data-cxa="del" title="Apagar campo" aria-label="Apagar campo">' + ico("trash") + "</button></div></div></div>";
    });
    h += '<div class="add-row" style="margin:12px 0 22px"><button type="button" class="btn sm" id="cx-add">' + ico("plus") + "Adicionar campo</button></div>";
    h += '<p class="cx-sub">Listas de sugestões <span>O que aparece para escolher ao preencher. Uma opção por linha.</span></p>';
    LISTAS_NOMES.forEach(function (l) {
      var custom = !!(C.listas[l[0]] && C.listas[l[0]].length), vals = custom ? C.listas[l[0]] : LISTAS_PADRAO[l[0]];
      h += '<details class="cx-list"><summary>' + esc(l[1]) + '<span class="cx-count">' + vals.length + " opções" + (custom ? " · personalizada" : "") + "</span></summary>" +
        '<textarea data-lista="' + l[0] + '" rows="7">' + esc(vals.join("\n")) + "</textarea>" +
        '<button type="button" class="btn sm ghost" data-reset="' + l[0] + '">Restaurar padrão</button></details>';
    });
    return h;
  }
  function renderCampos() {
    var box = $("#campos-box"); if (!box) return;
    var open = $$("details.cx-list", box).map(function (d) { return d.open; });
    box.innerHTML = camposHTML();
    $$("details.cx-list", box).forEach(function (d, i) { if (open[i]) d.open = true; });
  }
  function bindCampos() {
    var box = $("#campos-box"); if (!box) return;
    var C = FORM.campos;
    box.addEventListener("change", function (e) {
      var el = e.target;
      if (el.dataset.ocultar) { if (el.checked) delete C.ocultar[el.dataset.ocultar]; else C.ocultar[el.dataset.ocultar] = true; return; }
      var row = el.closest(".cx-row"); if (!row) return;
      var x = C.extras[+row.dataset.i], k = el.dataset.cx;
      if (k === "pdf" || k === "obrigatorio") x[k] = el.checked;
      if (k === "tipo" || k === "local") { x[k] = el.value; if (k === "tipo") renderCampos(); }
    });
    box.addEventListener("input", function (e) {
      var el = e.target;
      if (el.dataset.lista) {
        var arr = el.value.split("\n").map(function (v) { return v.trim(); }).filter(Boolean);
        C.listas[el.dataset.lista] = arr;
        var cnt = el.closest("details").querySelector(".cx-count"); if (cnt) cnt.textContent = arr.length + " opções · personalizada";
        return;
      }
      var row = el.closest(".cx-row"); if (!row) return;
      var x = C.extras[+row.dataset.i];
      if (el.dataset.cx === "nome") { x.nome = el.value; el.classList.remove("invalid"); }
      if (el.dataset.cx === "opcoes") x.opcoes = el.value.split(",").map(function (v) { return v.trim(); }).filter(Boolean);
    });
    box.addEventListener("click", function (e) {
      if (e.target.closest("#cx-add")) {
        C.extras.push({ id: cid(), nome: "", tipo: "texto", local: "cliente", opcoes: [], pdf: true, obrigatorio: false });
        renderCampos(); var ins = $$('#campos-box [data-cx="nome"]'); if (ins.length) ins[ins.length - 1].focus(); return;
      }
      var rs = e.target.closest("[data-reset]");
      if (rs) { delete C.listas[rs.dataset.reset]; renderCampos(); $$("#campos-box details.cx-list").forEach(function (d) { if (d.querySelector('[data-lista="' + rs.dataset.reset + '"]')) d.open = true; }); toast("Lista padrão restaurada"); return; }
      var b = e.target.closest("[data-cxa]"); if (!b) return;
      var i = +b.closest(".cx-row").dataset.i, a = b.dataset.cxa;
      if (a === "del") { if (C.extras[i].nome && !confirm("Apagar o campo “" + C.extras[i].nome + "”? O que já foi preenchido em orçamentos antigos deixa de aparecer.")) return; C.extras.splice(i, 1); }
      if (a === "up" && i > 0) C.extras.splice(i - 1, 0, C.extras.splice(i, 1)[0]);
      if (a === "down" && i < C.extras.length - 1) C.extras.splice(i + 1, 0, C.extras.splice(i, 1)[0]);
      renderCampos();
    });
  }
  function camposParaSalvar() {
    var C = FORM.campos, listas = {};
    Object.keys(C.listas).forEach(function (k) {
      var l = C.listas[k] || [];
      if (l.length && l.join("|") !== (LISTAS_PADRAO[k] || []).join("|")) listas[k] = l;
    });
    return { ocultar: C.ocultar, extras: C.extras.filter(function (e) { return String(e.nome || "").trim(); }), listas: listas };
  }

  function emptyForm() {
    return { id: null, nome: "", slug: "", slugTouched: false, empresa: { cnpj: "", whatsapp: "", instagram: "", email: "", endereco: "", cidade: "" },
      logo: null, tema: { cor: "#8a1c1c", escura: "#151313", fundoLogo: "claro", fonte: "moderna" }, sugestoes: [], senha: "", senhaOriginal: "", squad: "", campos: normCampos(null) };
  }
  function localGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function loadEdit(id) {
    app.innerHTML = '<div class="loading"><span class="spin"></span>Abrindo…</div>';
    api("GET", "get", undefined, "&id=" + encodeURIComponent(id)).then(function (m) {
      var f = emptyForm();
      f.id = m.id; f.nome = m.nome; f.slug = m.slug; f.slugTouched = true; f.empresa = Object.assign(f.empresa, m.empresa || {});
      f.logo = m.logo || null; f.tema = Object.assign(f.tema, m.tema || {}); f.campos = normCampos(m.campos); f.squad = m.squad || ""; f.senha = m.senha || ""; f.senhaOriginal = m.senha || ""; f.ativo = m.ativo;
      viewForm(f);
    }, function (e) { app.innerHTML = '<div class="empty"><strong>Não foi possível abrir</strong>' + esc(e.message) + "</div>"; });
  }
  function slugify(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^marmoraria\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  }
  function maskCnpj(v) {
    var d = String(v).replace(/\D/g, "").slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  function maskPhone(v) {
    var d = String(v).replace(/\D/g, ""); if (d.indexOf("55") === 0 && d.length > 11) d = d.slice(2); d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  function f(label, key, val, o) {
    o = o || {};
    return '<label class="field' + (o.cls ? " " + o.cls : "") + '"><span>' + label + (o.req ? ' <b class="req">*</b>' : "") + '</span><input type="' + (o.type || "text") + '" data-f="' + key + '" value="' + esc(val) + '"' +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + (o.mode ? ' inputmode="' + o.mode + '"' : "") + (o.id ? ' id="' + o.id + '"' : "") + ' autocomplete="off">' + (o.hint ? "<small>" + o.hint + "</small>" : "") + "</label>";
  }
  function sec(n, title, sub, body) {
    return '<section class="card"><div class="card-head"><span class="num">' + n + '</span><div class="grow"><h2>' + title + "</h2><p>" + sub + '</p></div></div><div class="card-body">' + body + "</div></section>";
  }
  function viewForm(fm) {
    FORM = fm || emptyForm();
    var F = FORM, e = F.empresa, isNew = !F.id;
    var h = '<div class="page-head"><div><h1>' + (isNew ? "Nova marmoraria" : "Editar " + esc(F.nome)) + "</h1><p>" +
      (isNew ? "Preencha os dados, envie o logo e defina a senha. O gerador fica pronto na hora." : "As mudanças aparecem no gerador da marmoraria assim que você salvar.") + "</p></div>" +
      '<div class="head-actions"><a class="btn ghost" href="#/">Cancelar</a></div></div>';
    h += '<div class="f-layout"><div>';
    h += sec(1, "Dados da marmoraria", "Aparecem no cabeçalho e no rodapé de todo orçamento.",
      '<div class="grid g2">' + f("Nome da marmoraria", "nome", F.nome, { req: true, ph: "Ex.: Marmoraria Lazzarini", cls: "span2", id: "fn" }) +
      '<div class="field span2"><span>Link do gerador</span><div class="slug-row"><span class="pre">' + esc(base().replace(/^https?:\/\//, "")) + '/m/</span><input type="text" id="fslug" value="' + esc(F.slug) + '" placeholder="lazzarini" autocomplete="off" autocapitalize="off" spellcheck="false"></div><small class="slug-msg" id="smsg"></small></div>' +
      f("CNPJ", "empresa.cnpj", e.cnpj, { ph: "00.000.000/0000-00", mode: "numeric", id: "fcnpj" }) +
      f("WhatsApp", "empresa.whatsapp", e.whatsapp, { ph: "(00) 00000-0000", mode: "tel", type: "tel", id: "fwa" }) +
      f("Endereço", "empresa.endereco", e.endereco, { ph: "Rua, número - bairro", cls: "span2" }) +
      f("Cidade / UF · CEP", "empresa.cidade", e.cidade, { ph: "Ex.: Divinópolis/MG · CEP 35500-000" }) +
      f("Instagram", "empresa.instagram", e.instagram, { ph: "@marmoraria (opcional)" }) +
      f("E-mail", "empresa.email", e.email, { ph: "opcional", type: "email", mode: "email", cls: "span2" }) +
      '<div class="field span2" id="fsquad"><span>Squad responsável <b class="req">*</b></span><div class="seg" data-squad>' +
      ["A", "B", "C", "D"].map(function (q) { return '<button type="button" data-v="' + q + '" class="' + (F.squad === q ? "on" : "") + '">Squad ' + q + "</button>"; }).join("") +
      "</div><small>Qual squad da QH4 cuida desta marmoraria.</small></div></div>");
    h += sec(2, "Identidade visual", "Envie o logo: as cores são sugeridas automaticamente. Ajuste se quiser.",
      '<div class="logo-drop"><label class="logo-box' + (F.logo ? " has" : "") + (F.tema.fundoLogo === "escuro" ? " dark" : "") + '" id="lbox">' +
      (F.logo ? '<img src="' + esc(F.logo) + '" alt="Logo">' : "<span>" + ico("image") + "Enviar logo</span>") + '<input type="file" accept="image/*" hidden id="lfile"></label>' +
      '<div style="flex:1;min-width:200px"><p class="subnote" style="margin:0 0 10px">PNG com fundo transparente fica melhor, mas JPG também serve: as margens em branco são cortadas sozinhas.</p>' +
      '<div class="add-row"><label class="btn sm" for="lfile">' + ico("image") + (F.logo ? "Trocar logo" : "Escolher arquivo") + "</label>" + (F.logo ? '<button type="button" class="btn sm ghost" id="lrm">' + ico("x") + "Remover</button>" : "") + "</div></div></div>" +
      '<div class="colors" style="margin-top:18px">' + colorField("Cor principal", "cor", "Botões, destaques e total do orçamento") + colorField("Cor escura", "escura", "Faixas dos ambientes e barra inferior") + "</div>" +
      (F.sugestoes.length ? '<div style="margin-top:10px"><span class="label">Cores encontradas no logo</span><div class="swatches">' + F.sugestoes.map(function (c) { return '<button type="button" class="swatch-btn" data-sw="' + c + '" style="background:' + c + '" title="Usar ' + c + ' como cor principal" aria-label="Usar ' + c + '"></button>'; }).join("") + "</div></div>" : "") +
      '<div class="seg-row"><div class="field"><span>Fundo do logo</span><div class="seg" data-seg="fundoLogo"><button type="button" data-v="claro">Claro</button><button type="button" data-v="escuro">Escuro</button></div><small>Use escuro se o logo for claro.</small></div>' +
      '<div class="field"><span>Estilo dos títulos</span><div class="seg" data-seg="fonte"><button type="button" data-v="moderna">Moderno</button><button type="button" data-v="classica">Clássico</button></div></div></div>');
    h += sec(3, "Acesso da equipe", isNew ? "Senha que a equipe da marmoraria vai usar para entrar no gerador." : "Link e senha que a equipe usa para entrar. Copie e envie para o cliente.",
      (isNew ? "" : '<div class="m-access" style="margin:0 0 16px;border:1px solid var(--line);border-radius:10px"><div class="row"><span class="k">Link</span><span class="v">' + esc(base() + "/m/" + F.slug) + '</span><button type="button" class="icon-btn" data-copy="' + esc(base() + "/m/" + F.slug) + '" aria-label="Copiar link">' + ico("copy") + "</button></div></div>") +
      '<div class="grid g2"><label class="field"><span>Senha da equipe <b class="req">*</b></span><div class="pw-wrap"><input type="' + (isNew ? "password" : "text") + '" id="fpw" data-f="senha" value="' + esc(F.senha) + '" autocomplete="new-password" minlength="6"><button type="button" class="pw-eye' + (isNew ? "" : " on") + '" data-eye="fpw" aria-label="' + (isNew ? "Mostrar" : "Esconder") + ' senha">' + ico(isNew ? "eye" : "eyeOff") + "</button></div>" +
      "<small>" + (isNew ? "Mínimo de 6 caracteres." : F.senhaOriginal ? "Se você mudar a senha, quem estiver conectado precisa entrar de novo com a nova." : "Nenhuma senha registrada no painel. Digite ou gere uma para registrar (a anterior deixa de valer).") + "</small></label>" +
      '<div class="field"><span>&nbsp;</span><div class="add-row"><button type="button" class="btn" id="fgen">' + ico("spark") + (isNew ? "Gerar senha" : "Gerar nova senha") + "</button>" +
      (isNew ? "" : '<button type="button" class="btn" id="fcopypw">' + ico("copy") + "Copiar senha</button>") + "</div></div></div>");
    h += sec(4, "Campos do gerador", "Só a QH4 altera. Depois de salvar, a equipe vê a mudança ao recarregar a página.", '<div id="campos-box">' + camposHTML() + "</div>");
    h += '<div class="add-row" style="justify-content:flex-end;margin:6px 0 30px"><a class="btn ghost" href="#/">Cancelar</a><button class="btn gold" id="fsave">' + ico("check") + (isNew ? "Criar gerador" : "Salvar alterações") + "</button></div>";
    h += '</div><aside class="f-side"><div class="pv" id="pv"></div></aside></div>';
    app.innerHTML = h; topbarH();
    bindForm(); bindCampos(); renderPreview(); checkSlug();
  }
  function colorField(label, key, hint) {
    return '<div class="field"><span>' + label + '</span><div class="color-field"><input type="color" data-color="' + key + '" value="' + esc(FORM.tema[key]) + '" aria-label="' + label + '"><input type="text" data-colortxt="' + key + '" value="' + esc(FORM.tema[key]) + '" maxlength="7" aria-label="' + label + ' (hex)"></div><small>' + hint + "</small></div>";
  }
  function setPath(o, p, v) { var k = p.split("."), l = k.pop(); k.reduce(function (x, y) { return x[y]; }, o)[l] = v; }
  var slugTimer = null, slugOk = true;
  function bindForm() {
    var F = FORM;
    $$("[data-f]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.dataset.f, v = inp.value;
        if (k === "empresa.cnpj") { v = maskCnpj(v); inp.value = v; }
        if (k === "empresa.whatsapp") { v = maskPhone(v); inp.value = v; }
        setPath(F, k, v); inp.classList.remove("invalid");
        if (k === "nome") { if (!F.slugTouched) { F.slug = slugify(v); $("#fslug").value = F.slug; checkSlug(); } renderPreview(); }
      });
    });
    $("#fslug").addEventListener("input", function (e) { F.slugTouched = true; F.slug = e.target.value; checkSlug(); });
    $("#fslug").addEventListener("blur", function (e) { F.slug = slugify(e.target.value); e.target.value = F.slug; checkSlug(); });
    $("#lfile").addEventListener("change", function (e) { var file = e.target.files[0]; e.target.value = ""; if (file) useLogo(file); });
    var box = $("#lbox");
    box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("drag"); });
    box.addEventListener("dragleave", function () { box.classList.remove("drag"); });
    box.addEventListener("drop", function (e) { e.preventDefault(); box.classList.remove("drag"); var file = e.dataTransfer.files[0]; if (file) useLogo(file); });
    var rm = $("#lrm"); if (rm) rm.addEventListener("click", function () { F.logo = null; F.sugestoes = []; keepScroll(function () { viewForm(F); }); });
    $$("[data-color]").forEach(function (c) { c.addEventListener("input", function () { F.tema[c.dataset.color] = c.value; $('[data-colortxt="' + c.dataset.color + '"]').value = c.value; renderPreview(); }); });
    $$("[data-colortxt]").forEach(function (c) {
      c.addEventListener("input", function () {
        var v = c.value.trim(); if (v && v[0] !== "#") v = "#" + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { F.tema[c.dataset.colortxt] = v.toLowerCase(); $('[data-color="' + c.dataset.colortxt + '"]').value = v.toLowerCase(); renderPreview(); }
      });
    });
    $$("[data-sw]").forEach(function (b) { b.addEventListener("click", function () { F.tema.cor = b.dataset.sw; $('[data-color="cor"]').value = b.dataset.sw; $('[data-colortxt="cor"]').value = b.dataset.sw; renderPreview(); }); });
    $$("[data-seg]").forEach(function (seg) {
      var key = seg.dataset.seg;
      $$("button", seg).forEach(function (b) {
        b.classList.toggle("on", F.tema[key] === b.dataset.v);
        b.addEventListener("click", function () { F.tema[key] = b.dataset.v; $$("button", seg).forEach(function (x) { x.classList.toggle("on", x === b); }); $("#lbox").classList.toggle("dark", F.tema.fundoLogo === "escuro"); renderPreview(); });
      });
    });
    var gen = $("#fgen"); if (gen) gen.addEventListener("click", function () { F.senha = genPassword(); var p = $("#fpw"); p.value = F.senha; p.type = "text"; p.classList.remove("invalid"); });
    var cpw = $("#fcopypw"); if (cpw) cpw.addEventListener("click", function () { copy($("#fpw").value, "Senha copiada"); });
    $$("[data-squad] button").forEach(function (b) {
      b.addEventListener("click", function () { F.squad = b.dataset.v; $$("[data-squad] button").forEach(function (x) { x.classList.toggle("on", x === b); }); $("#fsquad").classList.remove("invalid-field"); });
    });
    $("#fsave").addEventListener("click", saveForm);
  }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }
  function useLogo(file) {
    toast("Processando logo…");
    processLogo(file).then(function (r) {
      FORM.logo = r.url; FORM.tema.cor = r.cor; FORM.tema.escura = r.escura; FORM.tema.fundoLogo = r.fundo; FORM.sugestoes = r.sugestoes;
      keepScroll(function () { viewForm(FORM); }); toast("Logo pronto. Cores sugeridas aplicadas.");
    }, function (e) { toast(e.message || "Não consegui abrir essa imagem."); });
  }
  function checkSlug() {
    var F = FORM, el = $("#smsg"); if (!el) return;
    var s = slugify(F.slug);
    clearTimeout(slugTimer);
    if (!s) { el.className = "slug-msg"; el.textContent = "Escolha o final do link (letras, números e hífen)."; slugOk = false; return; }
    el.className = "slug-msg"; el.textContent = "Verificando…";
    slugTimer = setTimeout(function () {
      api("GET", "slug", undefined, "&slug=" + encodeURIComponent(s) + (F.id ? "&id=" + encodeURIComponent(F.id) : "")).then(function (r) {
        if (slugify(FORM.slug) !== r.slug) return;
        slugOk = r.ok; el.className = "slug-msg " + (r.ok ? "ok" : "bad");
        el.textContent = r.ok ? "Link disponível: " + base() + "/m/" + r.slug : r.motivo;
      }, function () { el.textContent = ""; });
    }, 300);
  }
  function renderPreview() {
    var F = FORM, d = derived(F.tema), dark = F.tema.fundoLogo === "escuro", el = $("#pv"); if (!el) return;
    var font = F.tema.fonte === "classica" ? "'Cinzel', Georgia, serif" : "'Montserrat', Arial, sans-serif", style = F.tema.fonte === "classica" ? "normal" : "italic";
    el.style.cssText = "--pv-cor:" + d.cor + ";--pv-ink:" + d.ink + ";--pv-cor-ink:" + d.corInk + ";--pv-cor-2:" + d.cor2 + ";--pv-on:" + d.on + ";--pv-font:" + font + ";--pv-style:" + style;
    var lb = $("#lbox"); if (lb) lb.style.setProperty("--pv-ink", d.ink);
    var nome = F.nome || "Nome da marmoraria";
    var logo = F.logo ? '<img src="' + esc(F.logo) + '" alt="">' : '<span class="nm">' + esc(nome) + "</span>";
    el.innerHTML = '<div class="pv-label">Prévia do gerador</div><div class="pv-top' + (dark ? " dark" : "") + '">' + logo + '<span class="tab">Orçamentos</span></div>' +
      '<div class="pv-body"><div class="pv-doc"><div class="pv-dhead' + (dark ? " dark" : "") + '">' + logo + '<span class="num">0001</span></div>' +
      '<div class="pv-amb"><span>COZINHA</span><span>R$ 7.760,00</span></div><div class="pv-row"><span>Bancada · Taj Mahal</span><span>R$ 3.600,00</span></div><div class="pv-row"><span>Ilha · Taj Mahal</span><span>R$ 4.160,00</span></div>' +
      '<div class="pv-total"><span>TOTAL</span><strong>R$ 7.760,00</strong></div></div></div><div class="pv-btn"><span>Gerar orçamento</span></div>';
  }
  function saveForm() {
    var F = FORM, isNew = !F.id, bad = [];
    if (!String(F.nome).trim()) bad.push($("#fn"));
    var senhaOk = isNew ? String(F.senha || "").length >= 6 : (F.senha === F.senhaOriginal || String(F.senha || "").length >= 6);
    if (!senhaOk) bad.push($("#fpw"));
    if (!F.squad) { $("#fsquad").classList.add("invalid-field"); bad.push($("#fsquad")); }
    if (!slugify(F.slug) || !slugOk) bad.push($("#fslug"));
    if (bad.length) {
      bad.forEach(function (x) { if (x) x.classList.add("invalid"); });
      bad[0].scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { bad[0].focus({ preventScroll: true }); }, 300);
      toast(!String(F.nome).trim() ? "Preencha o nome da marmoraria." : !senhaOk ? "A senha precisa de pelo menos 6 caracteres." : !F.squad ? "Escolha o squad responsável." : "Escolha um link disponível.");
      return;
    }
    var b = $("#fsave"); b.disabled = true; b.lastChild.textContent = "Salvando…";
    var semNome = $$('#campos-box [data-cx="nome"]').filter(function (x) { return !x.value.trim(); });
    if (semNome.length) {
      semNome.forEach(function (x) { x.classList.add("invalid"); });
      semNome[0].scrollIntoView({ behavior: "smooth", block: "center" }); toast("Dê um nome ao campo novo ou apague-o.");
      b.disabled = false; b.lastChild.textContent = isNew ? "Criar gerador" : "Salvar alterações"; return;
    }
    var semOps = F.campos.extras.filter(function (x) { return x.tipo === "lista" && !(x.opcoes || []).length; })[0];
    if (semOps) { toast("Informe as opções do campo “" + semOps.nome + "”."); b.disabled = false; b.lastChild.textContent = isNew ? "Criar gerador" : "Salvar alterações"; return; }
    var body = { nome: F.nome.trim(), slug: slugify(F.slug), empresa: Object.assign({}, F.empresa, { nome: F.nome.trim() }), logo: F.logo, tema: F.tema, squad: F.squad, campos: camposParaSalvar() };
    if (!isNew && F.senha !== F.senhaOriginal && F.senha) {
      if (!confirm("Você mudou a senha da equipe. Quem estiver usando o gerador vai precisar entrar de novo com a senha nova. Continuar?")) { b.disabled = false; b.lastChild.textContent = "Salvar alterações"; return; }
      body.senha = F.senha;
    }
    var p = isNew ? api("POST", "create", Object.assign(body, { senha: F.senha })) : api("PUT", "update", body, "&id=" + encodeURIComponent(F.id));
    p.then(function (m) {
      LIST = null;
      if (isNew) { PENDING = { m: m, senha: F.senha }; location.hash = "#/"; }
      else { toast("Alterações salvas"); location.hash = "#/"; }
    }, function (err) { b.disabled = false; b.lastChild.textContent = isNew ? "Criar gerador" : "Salvar alterações"; toast(err.message); });
  }

  topbarH();
  route();
})();
