/* Film de présentation de l'Atelier IA (40 s).
   Tout est piloté par render(t) : chaque image se calcule à partir du temps,
   ce qui permet de rendre la vidéo image par image (voir render.cjs). */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a || 0, v)); };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var quart = function (x) { return x < .5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; };
  var cubic = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var sine = function (x) { return -(Math.cos(Math.PI * x) - 1) / 2; };
  var outc = function (x) { return 1 - Math.pow(1 - x, 3); };
  var pop = function (x) { return x <= 0 ? 0 : 1 - Math.exp(-6 * x) * Math.cos(9 * x); };
  var val = function (v) { return typeof v === "function" ? v() : v; };

  var world = $("#world"), cur = $("#cur"), ring = $("#ring");
  var panel = $("#panel"), chat = $("#chat"), compo = $("#compo"), card = $("#card");
  var COLORS = ["#2563eb", "#e2622b", "#7c3aed", "#c2700c", "#15803d"];
  var LABELS = ["Rôle", "Cible", "Objectif", "Contexte", "Format"];
  var TEXTS = ["Tu es conseiller du service client", "Pour Mme Martin, cliente mécontente", "Excuse-toi et propose un geste", "Livraison avec dix jours de retard", "Cinq lignes, ton chaleureux"];

  /* emplacements et blocs */
  var slots = [], blocks = [];
  LABELS.forEach(function (l, i) {
    var s = document.createElement("div");
    s.className = "slot"; s.style.top = (44 + i * 60) + "px";
    s.innerHTML = '<span class="lb" style="background:' + COLORS[i] + '">' + l + '</span><span class="dz"></span><span class="ok">✓</span>';
    card.appendChild(s); slots.push(s);
  });
  var TRAY = [[36, 594], [316, 594], [36, 644], [316, 644], [36, 694]];
  var AT = [1, 4, 3, 0, 2];            // place de chaque bloc dans la réserve
  var SLOT = function (i) { return [160, 246 + i * 60]; };
  var DRAG = [[0, 10.2, 11.1], [1, 11.7, 12.5], [2, 14.6, 15.25], [3, 15.45, 16.05], [4, 16.25, 16.85]];
  LABELS.forEach(function (l, i) {
    var b = document.createElement("div");
    b.className = "blk";
    b.innerHTML = '<i style="background:' + COLORS[i] + '"></i>' + TEXTS[i];
    $("#pin").appendChild(b); blocks.push(b);
  });
  function blockPos(i, t) {
    var a = TRAY[AT[i]], b = SLOT(i), d = DRAG.filter(function (x) { return x[0] === i; })[0];
    var u = cubic(seg(t, d[1], d[2]));
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), t > d[1] && t < d[2] + .08 ? 1 : 0];
  }

  /* réponse en continu : chaque mot a son heure d'apparition */
  document.querySelectorAll("#asst .tx").forEach(function (p) {
    p.innerHTML = p.textContent.split(" ").map(function (w) { return '<span class="w">' + w + '</span>'; }).join(" ");
  });
  var words = Array.prototype.slice.call(document.querySelectorAll("#asst .w"));
  var tt = 23.9;
  words.forEach(function (w) {
    w._t = tt;
    tt += w.classList.contains("who") ? .25 : w.tagName === "LI" ? .2 : w.id === "file" ? .35 : w.parentNode.classList.contains("quote") ? .042 : .055;
  });

  var TYPED = "Rédige la réponse à Mme Martin à partir de cette demande.";
  var CLICKS = [5.55, 10.2, 11.7, 14.6, 15.45, 16.25, 23.0, 32.6];

  /* positions dans le monde (mesurées sans transformation de caméra) */
  function R(el) { return el.getBoundingClientRect(); }
  function C(el, dx, dy) { var r = R(el); return { x: r.left + (dx === undefined ? r.width / 2 : dx), y: r.top + (dy === undefined ? r.height / 2 : dy) }; }
  function panelOrigin() { var r = R(panel); return [r.left, r.top]; }
  function grab(i, t) { var o = panelOrigin(), p = blockPos(i, t); return { x: o[0] + p[0] + 38, y: o[1] + p[1] + 24 }; }
  function grabAt(i, which) { var o = panelOrigin(), p = which ? SLOT(i) : TRAY[AT[i]]; return { x: o[0] + p[0] + 38, y: o[1] + p[1] + 24 }; }

  /* pistes : [début, fin, cible, courbe] */
  function track(keys, t, init, mix) {
    var v = val(init);
    for (var k = 0; k < keys.length; k++) {
      var K = keys[k];
      if (t >= K[1]) { v = val(K[2]); continue; }
      if (t > K[0]) return mix(v, val(K[2]), (K[3] || quart)(seg(t, K[0], K[1])));
      return v;
    }
    return v;
  }
  var mixP = function (a, b, u) { return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) }; };
  var mixC = function (a, b, u) { return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), u)) }; };

  var T = 0;
  var CUR = [
    [0.3, 1.7, { x: 430, y: 178 }, cubic],
    [2.2, 3.0, { x: 395, y: 266 }, cubic],
    [3.8, 5.0, function () { return C($("#m2"), 70); }, cubic],
    [6.0, 7.6, { x: 1250, y: 700 }, cubic],
    [9.2, 10.1, function () { return grabAt(0, 0); }, cubic],
    [10.2, 11.1, function () { return grabAt(0, 1); }, cubic],
    [11.25, 11.62, function () { return grabAt(1, 0); }, cubic],
    [11.7, 12.5, function () { return grabAt(1, 1); }, cubic],
    [12.7, 13.5, function () { return C($("#note"), 60, 120); }, cubic],
    [13.9, 14.5, function () { return grabAt(2, 0); }, cubic],
    [14.6, 15.25, function () { return grabAt(2, 1); }, cubic],
    [15.28, 15.42, function () { return grabAt(3, 0); }, cubic],
    [15.45, 16.05, function () { return grabAt(3, 1); }, cubic],
    [16.08, 16.22, function () { return grabAt(4, 0); }, cubic],
    [16.25, 16.85, function () { return grabAt(4, 1); }, cubic],
    [17.0, 17.8, function () { var r = R(card); return { x: r.right + 14, y: r.bottom + 12 }; }, cubic],
    [18.5, 19.6, function () { var r = R(compo); return { x: r.left + 120, y: r.bottom - 36 }; }, cubic],
    [22.4, 22.95, function () { return C($("#send"), 18, 20); }, cubic],
    [23.4, 24.4, function () { var r = R(compo); return { x: r.right - 30, y: r.top - 260 }; }, cubic],
    [27.0, 27.85, function () { return C($("#file .open"), 30, 22); }, cubic],
    [28.6, 30.0, { x: 1300, y: 700 }, cubic],
    [31.4, 32.4, function () { return C($("#btn"), 70, 30); }, cubic],
    [33.2, 34.3, { x: 1240, y: 640 }, cubic]
  ];
  var CAM = [
    [0, 1.8, { x: 960, y: 540, s: 1.16 }, sine],
    [2.3, 3.3, { x: 440, y: 252, s: 2.7 }],
    [3.5, 4.9, { x: 452, y: 498, s: 2.5 }],
    [5.8, 6.9, { x: 960, y: 540, s: 1.16 }],
    [7.2, 8.8, { x: 975, y: 540, s: 1.2 }, sine],
    [9.0, 10.0, { x: 1340, y: 598, s: 2.0 }],
    [10.0, 12.4, { x: 1325, y: 580, s: 2.12 }, sine],
    [12.6, 13.6, { x: 1470, y: 690, s: 2.6 }],
    [14.2, 15.0, { x: 1330, y: 560, s: 2.1 }],
    [15.2, 16.9, { x: 1320, y: 545, s: 2.18 }, sine],
    [17.0, 17.9, { x: 1340, y: 532, s: 1.45 }],
    [18.5, 19.5, function () { var r = R(compo); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 - 6, s: 2.5 }; }],
    [19.5, 22.8, function () { var r = R(compo); return { x: (r.left + r.right) / 2 + 10, y: (r.top + r.bottom) / 2 - 4, s: 2.66 }; }, sine],
    [23.2, 24.2, function () { var r = R($("#thread")); return { x: r.left + 230, y: r.top + 225, s: 2.2 }; }],
    [24.4, 27.7, function () { var r = R($("#file")); return { x: r.left + 230, y: r.top - 90, s: 2.2 }; }, sine],
    [28.5, 29.7, { x: 960, y: 540, s: 1.16 }],
    [29.8, 34.4, { x: 985, y: 540, s: 1.2 }, sine]
  ];

  function scene(t) {
    world.style.transform = "none";
    $("#wall").style.transform = "translate(" + (-t * 3) + "px," + (t * 1.5) + "px)";

    /* le module s'ouvre */
    var m2 = $("#m2");
    m2.style.background = t > 5.55 ? "#e9e6dd" : t > 4.9 ? "#eeebe3" : "";
    var p = quart(seg(t, 6.2, 7.2));
    var cw = 1120 - 620 * p;
    panel.style.left = (1440 - 620 * p) + "px";
    chat.style.width = cw + "px";
    var w = Math.min(640, cw - 40);
    compo.style.width = w + "px"; compo.style.left = (cw - w) / 2 + "px"; compo.style.top = "636px";
    $("#thread").style.width = w + "px"; $("#thread").style.left = (cw - w) / 2 + "px";

    /* blocs */
    blocks.forEach(function (b, i) {
      var q = blockPos(i, t), lift = q[2];
      b.style.left = q[0] + "px"; b.style.top = q[1] + "px";
      b.style.transform = lift ? "scale(1.05) rotate(-1.5deg)" : "none";
      b.style.boxShadow = lift ? "0 16px 30px -12px rgba(20,20,40,.35)" : "";
      b.style.zIndex = lift ? 5 : 1;
      var landed = t >= DRAG[i][2];
      slots[i].querySelector(".dz").style.opacity = landed ? 0 : 1;
      var k = pop(seg(t, 16.95 + i * .08, 17.6 + i * .08) * 1.2);
      var ok = slots[i].querySelector(".ok"); ok.style.opacity = clamp(k); ok.style.transform = "scale(" + k + ")";
    });
    var done = t > 29.4;
    card.style.borderColor = done ? "#bfe6cd" : "";
    $("#btn").textContent = done ? "Continuer" : "Valider";
    $("#btn").style.transform = "scale(" + (1 - .06 * clamp(1 - Math.abs(t - 32.6) / .12)) + ")";
    var rs = outc(seg(t, 29.4, 29.9));
    $("#res").style.opacity = rs; $("#res").style.transform = "translateY(" + (8 - 8 * rs) + "px)";
    $("#cons").style.opacity = 1 - seg(t, 29.3, 29.5);
    $("#bar").style.width = lerp(33.3, 44.4, cubic(seg(t, 29.6, 30.4))) + "%";
    var nx = quart(seg(t, 32.9, 33.7));
    $("#pin").style.transform = "translateX(" + (-620 * nx) + "px)";
    $("#next").style.transform = "translateX(" + (620 - 620 * nx) + "px)";

    /* sélection et note */
    var sel = $("#sel"), cr = R(card);
    sel.style.left = cr.left - 9 + "px"; sel.style.top = cr.top - 9 + "px";
    sel.style.width = cr.width + 18 + "px"; sel.style.height = cr.height + 18 + "px";
    sel.style.opacity = seg(t, 17.05, 17.3) * (1 - seg(t, 18.7, 18.95));
    var note = $("#note"), po = panelOrigin(), na = outc(seg(t, 12.75, 13.15)) * (1 - seg(t, 14.4, 14.65));
    note.style.left = po[0] + 340 + "px"; note.style.top = po[1] + 492 + "px";
    note.style.opacity = na; note.style.transform = "translateY(" + (10 - 10 * na) + "px) scale(" + (.96 + .04 * na) + ")";

    /* zone de saisie */
    var chip = $("#chip"), ch = pop(seg(t, 18.9, 19.6)), sent = t >= 23.08;
    chip.style.opacity = sent ? 0 : clamp(seg(t, 18.9, 19.1)); chip.style.transform = "scale(" + (.85 + .15 * Math.min(ch, 1.04)) + ")";
    var n = Math.floor(TYPED.length * seg(t, 19.9, 22.4)), focus = t > 19.6 && !sent;
    var caret = focus && (t < 22.45 || Math.floor(t * 2.2) % 2 === 0) ? '<span class="caret"></span>' : "";
    $("#ta").innerHTML = sent || n === 0 && !focus ? '<span class="ph">Écrivez votre demande…</span>' : n === 0 ? caret + '<span class="ph">Écrivez votre demande…</span>' : TYPED.slice(0, n) + caret;
    var stop = t >= 23.0 && t < 27.9;
    $("#arr").style.display = stop ? "none" : ""; $("#sq").style.display = stop ? "block" : "none";
    $("#send").style.transform = "scale(" + (1 - .12 * clamp(1 - Math.abs(t - 23.0) / .1)) + ")";

    /* conversation */
    $("#greet").style.opacity = 1 - seg(t, 23.05, 23.35);
    var ub = outc(seg(t, 23.2, 23.6));
    $("#ub").style.opacity = ub; $("#ub").style.transform = "translateY(" + (14 - 14 * ub) + "px)";
    words.forEach(function (w) { w.style.opacity = seg(t, w._t, w._t + .14); });
    var q1 = $("#asst .quote .w");
    $("#asst .quote").style.borderLeftColor = "rgba(217,211,196," + seg(t, q1._t - .1, q1._t + .2) + ")";
    var fb = outc(seg(t, $("#file")._t, $("#file")._t + .4));
    $("#file").style.transform = "translateY(" + (8 - 8 * fb) + "px)";
  }

  function render(t) {
    T = t;
    var out = t >= 34.4;
    $("#outro").style.display = out ? "block" : "none";
    world.style.display = out ? "none" : "block";
    if (out) return outro(t - 34.4);
    scene(t);

    var c = track(CUR, t, { x: 1560, y: 940 }, mixP);
    DRAG.forEach(function (d) { if (t > d[1] && t < d[2]) c = grab(d[0], t); });
    var cam = track(CAM, t, { x: 960, y: 540, s: 1.08 }, mixC);

    var press = 0, rp = -1;
    CLICKS.forEach(function (k) { press = Math.max(press, clamp(1 - Math.abs(t - k) / .12)); if (t >= k && t < k + .45) rp = t - k; });
    DRAG.forEach(function (d) { if (t > d[1] && t < d[2]) press = Math.max(press, .6); });
    cur.style.transform = "translate(" + (c.x - 3) + "px," + (c.y - 3) + "px) scale(" + (1 - .14 * press) + ")";
    if (rp >= 0) {
      var u = rp / .45;
      ring.style.left = c.x + "px"; ring.style.top = c.y + "px";
      ring.style.opacity = .7 * (1 - u); ring.style.transform = "scale(" + (.4 + 1.1 * outc(u)) + ")";
    } else ring.style.opacity = 0;

    world.style.transform = "translate(" + (960 - cam.x * cam.s) + "px," + (540 - cam.y * cam.s) + "px) scale(" + cam.s + ")";
  }

  /* ---------- fin : formes, sphère de particules, icônes ---------- */
  var cv = $("#cv"), g = cv.getContext("2d");
  var rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(7);
  var SH = [[0, -125, "c", 1, 62], [-138, 30, "c", 0, 50], [118, 74, "s", 4, 54], [-26, 136, "s", 2, 40], [150, -70, "s", 3, 38]];
  var MINI = [[-200, -150], [-60, -230], [90, -200], [230, 40], [-230, 140], [40, 240], [200, 210], [-120, -40]];
  var NP = 900, PTS = [];
  for (var k = 0; k < NP; k++) {
    var yy = 1 - 2 * (k + .5) / NP, rr = Math.sqrt(1 - yy * yy), th = k * 2.399963;
    var s = SH[k % 5], ang = rnd() * 6.283, d = Math.sqrt(rnd()) * s[4];
    PTS.push({ x: Math.cos(th) * rr, y: yy, z: Math.sin(th) * rr, ox: s[0] + Math.cos(ang) * d, oy: s[1] + Math.sin(ang) * d, col: COLORS[s[3]], dl: rnd() * .25 });
  }
  function rrect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function sphere(cx, cy, R, a, u, sizeK) {
    var ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(.38), st = Math.sin(.38);
    for (var i = 0; i < NP; i++) {
      var P = PTS[i], x = P.x * ca + P.z * sa, z = -P.x * sa + P.z * ca, y = P.y * ct - z * st; z = P.y * st + z * ct;
      var v = clamp((u - P.dl) / (1 - .25)), e = cubic(v);
      var sx = lerp(960 + P.ox, cx + x * R, e), sy = lerp(540 + P.oy, cy + y * R, e);
      var depth = (z + 1) / 2, sz = (1.2 + 2.4 * depth) * sizeK;
      g.globalAlpha = lerp(1, .25 + .75 * depth, e);
      g.fillStyle = P.col;
      g.beginPath(); g.arc(sx, sy, sz, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
  }
  function assistantIcon(x, y, S, a) {
    g.save(); g.globalAlpha = a; g.translate(x, y);
    g.shadowColor = "rgba(0,0,0,.14)"; g.shadowBlur = 40; g.shadowOffsetY = 14;
    g.fillStyle = "#fff"; rrect(-S / 2, -S / 2, S, S, S * .23); g.fill();
    g.shadowColor = "transparent";
    g.scale(S / 220, S / 220);
    g.strokeStyle = "#141413"; g.lineWidth = 9; g.lineJoin = "round";
    g.beginPath(); g.moveTo(-58, -46); g.lineTo(58, -46); g.quadraticCurveTo(70, -46, 70, -34); g.lineTo(70, 26); g.quadraticCurveTo(70, 38, 58, 38);
    g.lineTo(-10, 38); g.lineTo(-38, 62); g.lineTo(-34, 38); g.lineTo(-58, 38); g.quadraticCurveTo(-70, 38, -70, 26); g.lineTo(-70, -34); g.quadraticCurveTo(-70, -46, -58, -46); g.stroke();
    g.fillStyle = "#141413"; g.beginPath();
    g.moveTo(0, -30); g.quadraticCurveTo(4, -8, 24, -4); g.quadraticCurveTo(4, 0, 0, 22); g.quadraticCurveTo(-4, 0, -24, -4); g.quadraticCurveTo(-4, -8, 0, -30); g.fill();
    g.restore();
  }
  function outro(o) {
    var grey = cubic(seg(o, 1.8, 2.3));
    g.fillStyle = "rgb(" + [0, 0, 0].map(function (c, i) { return Math.round(lerp(0, [234, 233, 229][i], grey)); }).join(",") + ")";
    g.fillRect(0, 0, 1920, 1080);

    var burst = seg(o, 1.05, 1.75), rot = o * .9;
    /* formes */
    if (burst < 1) {
      SH.forEach(function (s, i) {
        var k = pop(seg(o, .05 + i * .07, .75 + i * .07) * 1.1), a = 1 - clamp(burst * 2.2);
        if (k <= 0 || a <= 0) return;
        var wob = Math.sin(o * 3 + i) * 6, sz = s[4] * k;
        g.save(); g.globalAlpha = a; g.translate(960 + s[0] + wob, 540 + s[1] - wob * .6); g.rotate(s[2] === "s" ? o * .8 * (i % 2 ? 1 : -1) : 0);
        g.fillStyle = COLORS[s[3]];
        if (s[2] === "c") { g.beginPath(); g.arc(0, 0, sz, 0, 6.283); g.fill(); } else { rrect(-sz, -sz, sz * 2, sz * 2, sz * .22); g.fill(); }
        g.restore();
      });
      MINI.forEach(function (m, i) {
        var k = pop(seg(o, .25 + i * .05, .9 + i * .05)), a = 1 - clamp(burst * 2.5);
        if (k <= 0 || a <= 0) return;
        g.globalAlpha = a; g.fillStyle = "#7c3aed";
        var z = 13 * k; g.fillRect(960 + m[0] * (1 + .05 * Math.sin(o * 4 + i)) - z, 540 + m[1] - z, z * 2, z * 2);
        g.globalAlpha = 1;
      });
    }
    /* icône sombre derrière la sphère */
    var ic = pop(seg(o, 1.75, 2.6)), slide = quart(seg(o, 3.6, 4.3)), ix = 960 - 150 * slide, iy = 470;
    var S = 230 * Math.min(1.03, ic);
    if (ic > 0) {
      g.save(); g.translate(ix, iy);
      g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 44; g.shadowOffsetY = 16;
      g.fillStyle = "#141413"; rrect(-S / 2, -S / 2, S, S, S * .23); g.fill(); g.restore();
    }
    if (burst > 0) {
      var shrink = cubic(seg(o, 1.7, 2.4));
      var Rr = lerp(270, 74, shrink), cx = lerp(960, ix, shrink), cy = lerp(540, iy, shrink);
      sphere(cx, cy, Rr, rot, burst, lerp(1.25, .62, shrink));
    }
    /* deuxième icône et lien */
    var i2 = pop(seg(o, 3.9, 4.7));
    if (i2 > 0) assistantIcon(1110, 470, 230 * Math.min(1.03, i2), clamp(i2 * 2));
    var dot = outc(seg(o, 4.1, 4.4));
    if (dot > 0) { g.fillStyle = "#7c3aed"; g.globalAlpha = dot; rrect(955, 470 - 18 * dot, 10, 36 * dot, 5); g.fill(); g.globalAlpha = 1; }
    var b = outc(seg(o, 4.3, 4.9));
    $("#brand").style.opacity = b; $("#brand").style.transform = "translateY(" + (16 - 16 * b) + "px)";
  }

  window.DURATION = 40;
  window.render = render;
  document.fonts.ready.then(function () { window.READY = true; });
  if (!/render/.test(location.search)) {
    var t0 = performance.now();
    (function loop() { render(((performance.now() - t0) / 1000) % 40); requestAnimationFrame(loop); })();
  }
})();
