/* ==========================================================================
   Site vitrine : le défilement raconte un module, chapitre par chapitre.
   hero   le titre ; l'orbe apparaît quand on survole les mots
   burst  la galaxie de données éclate, l'orbe parle
   open   le module s'ouvre dans un écran, l'orbe y entre
   write · spot · build · swipe · score   cinq gestes de l'apprenant,
          une caméra cadre la zone utile, les arguments s'affichent autour
   Tous les mouvements passent par des ressorts (effet « Framer »).
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ressort amorti ---------- */
  function Spring(v, k, c) { this.v = v; this.t = v; this.vel = 0; this.k = k || 170; this.c = c || 24; }
  Spring.prototype.step = function (dt) {
    if (reduced) { this.v = this.t; return this.v; }
    var n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (var i = 0; i < n; i++) { var a = this.k * (this.t - this.v) - this.c * this.vel; this.vel += a * h; this.v += this.vel * h; }
    return this.v;
  };

  /* ---------- chapitres (longueurs en hauteurs d'écran) ---------- */
  var CH = [["hero", .9], ["burst", 1.4], ["open", 1.2], ["write", 1.9], ["spot", 1.5], ["build", 2.4], ["swipe", 1.4]];
  var START = {}, LEN = {}, TOTAL = 0;
  CH.forEach(function (c) { START[c[0]] = TOTAL; LEN[c[0]] = c[1]; TOTAL += c[1]; });
  var story = $("[data-story]"), stage = $("[data-stage]");
  story.style.height = ((TOTAL + 1) * 100) + "vh";
  var U = 0;                                                  // position courante, en hauteurs d'écran
  function L(id) { return clamp((U - START[id]) / LEN[id], 0, 1); }
  function current() { var c = CH[0][0]; CH.forEach(function (x) { if (U >= START[x[0]]) c = x[0]; }); return c; }

  /* =====================================================================
     Fond : shader WebGL (nappes de couleur, grain), réagit à la souris
     ===================================================================== */
  var shader = (function () {
    var cv = $("[data-shader]"), gl = null;
    var none = { draw: function () {}, size: function () {} };
    try { gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false }); } catch (e) { gl = null; }
    if (!gl) { cv.remove(); return none; }
    var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var FS = [
      "precision mediump float;uniform vec2 uR;uniform float uT,uI,uK;uniform vec2 uM;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}",
      "float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
      "void main(){vec2 p=(gl_FragCoord.xy-.5*uR)/uR.y;float t=uT*.045;",
      "vec2 q=vec2(fb(p*1.5+t),fb(p*1.5-t+3.1));",
      "vec2 r=vec2(fb(p*1.3+q*1.9+vec2(1.7,9.2)+t*.7),fb(p*1.3+q*1.9+vec2(8.3,2.8)-t*.5));",
      "float f=fb(p*1.1+r*1.7);",
      "vec3 c=vec3(.980,.976,.961);",
      "vec3 pe=vec3(1.,.80,.66),pk=vec3(1.,.78,.88),cy=vec3(.70,.92,.96),li=vec3(.85,.83,1.);",
      "c=mix(c,pe,smoothstep(.42,.9,f)*.62*uI);",
      "c=mix(c,cy,smoothstep(.48,.95,r.x)*.42*uI);",
      "c=mix(c,pk,smoothstep(.52,.95,q.y)*.38*uI);",
      "c=mix(c,li,smoothstep(.58,1.,r.y)*.30*uI*uK);",
      "float d=length(p-uM);c=mix(c,pe,exp(-d*d*5.)*.28*uI);",
      "c+=(h(gl_FragCoord.xy+fract(uT*7.))-.5)*.035;",
      "gl_FragColor=vec4(c,1.);}"
    ].join("");
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.remove(); return none; }
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var ap = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "uR"), uT = gl.getUniformLocation(pr, "uT"), uI = gl.getUniformLocation(pr, "uI"), uK = gl.getUniformLocation(pr, "uK"), uM = gl.getUniformLocation(pr, "uM");
    var SCALE = .5;                                           // demi-résolution : le dégradé est flou, rien ne se perd
    function size() { cv.width = Math.max(2, Math.round(innerWidth * SCALE)); cv.height = Math.max(2, Math.round(innerHeight * SCALE)); gl.viewport(0, 0, cv.width, cv.height); }
    return {
      size: size,
      draw: function (time, inten, warm, mx, my) {
        gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, reduced ? 10 : time); gl.uniform1f(uI, inten); gl.uniform1f(uK, warm);
        gl.uniform2f(uM, (mx - innerWidth / 2) / innerHeight, -(my - innerHeight / 2) / innerHeight);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  })();

  /* =====================================================================
     Galaxie de données : points et petits symboles, qui éclatent
     ===================================================================== */
  var mouse = { x: -9999, y: -9999 };
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  var galaxy = (function () {
    var cv = $("[data-galaxy]"), ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1), pts = [], rot = 0;
    var TOK = ["01", "{ }", "IA", "</>", "prompt", "λ", "∑", "#", "→", "✦", "texte", "image", "10", "?"];
    for (var i = 0; i < 2600; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = .45 + .55 * Math.pow(Math.random(), .4), q = Math.sqrt(1 - u * u);
      pts.push({ x: q * Math.cos(th) * r, y: u * r, z: q * Math.sin(th) * r, ox: 0, oy: 0, s: Math.random() < .08 ? 2 : 1.1, v: .6 + Math.random() * 2.6, tok: Math.random() < .022 ? TOK[(Math.random() * TOK.length) | 0] : null, hue: Math.random() });
    }
    function size() { var b = cv.getBoundingClientRect(); cv.width = b.width * dpr; cv.height = b.height * dpr; }
    return {
      size: size,
      draw: function (cx, cy, R, A, burst, spin) {
        var b = cv.getBoundingClientRect();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, b.width, b.height);
        if (A < .01) return;
        rot += reduced ? 0 : .0016 + spin;
        var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(.35), sT = Math.sin(.35);
        var mx = mouse.x - b.left, my = mouse.y - b.top;
        ctx.font = "500 10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k];
          var x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * cT - z * sT; z = p.y * sT + z * cT;
          var e = 1 + burst * p.v * 2.4 + burst * burst * p.v * 1.6;          // l'éclatement : chaque point a sa vitesse
          var px = cx + x * R * e, py = cy + y * R * e;
          var dx = px + p.ox - mx, dy = py + p.oy - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 160 && d > .5) { var f = 1 - d / 160; p.ox += (-dy / d * 3.2 + dx / d * 1.1) * f * f * 6; p.oy += (dx / d * 3.2 + dy / d * 1.1) * f * f * 6; }
          p.ox *= .93; p.oy *= .93;
          var al = (.16 + .55 * (z + 1) / 2) * A * (1 - .55 * burst);
          if (al < .01) continue;
          if (p.tok) {
            var col = p.hue < .33 ? "226, 98, 43" : p.hue < .66 ? "31, 92, 240" : "31, 30, 28";
            ctx.fillStyle = "rgba(" + col + "," + Math.min(1, al * 1.3).toFixed(3) + ")";
            ctx.fillText(p.tok, px + p.ox, py + p.oy);
          } else {
            ctx.fillStyle = "rgba(31, 30, 28," + al.toFixed(3) + ")";
            ctx.fillRect(px + p.ox, py + p.oy, p.s, p.s);
          }
        }
      }
    };
  })();

  /* =====================================================================
     Hero : le titre se pose mot à mot, l'orbe apparaît au survol
     ===================================================================== */
  var hero = $("[data-hero]"), title = $("[data-title]"), hint = $("[data-hint]"), nav = $("[data-nav]");
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add("is-ready"); }); });
  var orbEl = $("[data-orb]"), ORB = 240;
  var orb = window.SiriOrb ? window.SiriOrb(orbEl, { size: ORB, state: "idle" }) : null;
  var appear = new Spring(0, 140, 14), awake = false, hoverEnergy = 0, lastMove = { x: 0, y: 0, t: 0 };
  var hintText = hint.lastChild;
  function wake() { if (!awake) { awake = true; appear.t = 1; hintText.textContent = "Faites défiler"; } }
  $$(".hw", title).forEach(function (w) {
    w.addEventListener("pointerenter", function () { wake(); w.classList.add("lit"); hoverEnergy = 1; setTimeout(function () { w.classList.remove("lit"); }, 900); });
  });
  title.addEventListener("pointermove", function (e) {
    var dt = Math.max(1, e.timeStamp - lastMove.t), v = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt;
    hoverEnergy = Math.min(1, hoverEnergy + v * .25); lastMove = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  });
  setTimeout(wake, matchMedia("(hover: none)").matches ? 900 : 4500);   // sans souris, elle vient d'elle-même
  if (orb) orb.setLevel(function () { return hoverEnergy > .02 ? .25 + hoverEnergy * .75 : -1; });

  /* ---------- mots révélés un à un ---------- */
  function words(el, text) {
    el.innerHTML = "";
    var list = text.split(" ");
    return list.map(function (w, i) {
      var s = document.createElement("span"); s.className = "w"; s.textContent = w; el.appendChild(s);
      if (i < list.length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });
  }
  function reveal(list, t) { var n = Math.round(list.length * t); list.forEach(function (w, i) { if (w.classList.contains("on") !== i < n) w.classList.toggle("on", i < n); }); }
  var say = $("[data-say]"), sayW = words(say, say.textContent);
  var wsay = $("[data-wsay]"), wsayText = "", wsayW = [];
  function setWsay(t) { if (t !== wsayText) { wsayText = t; wsayW = words(wsay, t); } }
  var aiWords = [];
  $$("[data-aibody] p").forEach(function (p) {
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (piece) {
            if (!piece) return;
            if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(piece)); return; }
            var s = document.createElement("span"); s.className = "w"; s.textContent = piece; frag.appendChild(s); aiWords.push(s);
          });
          n.parentNode.replaceChild(frag, n);
        } else walk(n);
      });
    })(p);
  });

  /* =====================================================================
     L'écran et sa caméra
     ===================================================================== */
  var veil = $("[data-veil]"), frame = $("[data-frame]"), win = $("[data-win]"), sideL = $("[data-side-l]"), rail = $("[data-rail]"), railPill = $("[data-rail-pill]");
  var W = 1440, H = 860, F = { x: 0, y: 0, w: 0, h: 0 }, stacked = false;
  function layout() {
    var vw = innerWidth, vh = innerHeight, top = 76, bottom = 70;
    stacked = vw < 1100;
    if (!stacked) {
      var side = clamp(vw * .24, 280, 420), gap = clamp(vw * .035, 28, 64), m = clamp(vw * .03, 28, 64);
      F.w = vw - side - gap - 2 * m; F.h = Math.min(vh - top - bottom, F.w * .64);
      F.x = m + side + gap; F.y = top + (vh - top - bottom - F.h) / 2;
      sideL.style.cssText = "left:" + m + "px;width:" + side + "px;top:" + F.y + "px;height:" + F.h + "px";
    } else {
      var mm = vw < 600 ? 14 : 28, copyH = vw < 600 ? 200 : 170;
      F.w = vw - 2 * mm; F.h = Math.min(vh - top - copyH - 90, F.w * .8);
      F.x = mm; F.y = top + copyH;
      sideL.style.cssText = "left:" + mm + "px;right:" + mm + "px;top:" + top + "px;height:" + copyH + "px";
    }
    frame.style.left = F.x + "px"; frame.style.top = F.y + "px"; frame.style.width = F.w + "px"; frame.style.height = F.h + "px";
    rail.style.top = (vh - 54) + "px";
    sideL.classList.toggle("is-stacked", stacked);
  }
  var FOCUS = {                                                // zones cadrées, en coordonnées de l'interface
    full: [0, 0, 1440, 860], left: [0, 40, 770, 820], reply: [20, 110, 740, 380],
    tpl: [0, 210, 770, 650], panel: [771, 40, 669, 820]
  };
  var CAM_OF = { hero: "full", burst: "full", open: "full", write: "left", spot: "reply", build: "tpl", swipe: "panel" };
  function camFor(name) {
    var r = FOCUS[name], s = Math.min(F.w / r[2], F.h / r[3]);
    var x = F.w / 2 - (r[0] + r[2] / 2) * s, y = F.h / 2 - (r[1] + r[3] / 2) * s;
    x = clamp(x, F.w - W * s, 0); y = clamp(y, F.h - H * s, 0);   // ne jamais montrer au-delà de l'interface
    if (W * s < F.w) x = (F.w - W * s) / 2;
    if (H * s < F.h) y = (F.h - H * s) / 2;
    return { x: x, y: y, s: s };
  }
  var cam = { x: new Spring(0, 90, 19), y: new Spring(0, 90, 19), s: new Spring(.5, 90, 19) }, camInit = false;

  function centerOf(el) { var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top, w: r.width }; }
  function inWin(el) {
    var r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), k = w.width / W;
    return { x: (r.left - w.left + r.width / 2) / k, y: (r.top - w.top + r.height / 2) / k, t: (r.top - w.top) / k, w: r.width / k, h: r.height / k };
  }

  /* ---------- éléments du module ---------- */
  var slotWin = $("[data-slot-win]"), slotMini = $("[data-slot-mini]");
  var orbIn = window.SiriOrb ? window.SiriOrb(slotWin, { size: 150, state: "speaking" }) : null;
  var orbMini = window.SiriOrb ? window.SiriOrb(slotMini, { size: 44, state: "speaking" }) : null;
  var views = {}; $$("[data-view]").forEach(function (v) { views[v.dataset.view] = v; });
  var comp = $("[data-comp]"), inp = $("[data-in]"), send = $("[data-send]"), u1 = $("[data-u1]"), ai = $("[data-ai]"), chat = $("[data-chat]"), msim = $(".m-sim");
  var marks = $$("[data-m]"), found = $$("[data-f]"), tasks = $$("[data-t]"), slots = $$("[data-s]"), bks = $$("[data-b]");
  var pop = $("[data-pop]"), popT = $("[data-popt]"), popO = $("[data-popo]"), cursor = $("[data-cursor]");
  var card1 = $("[data-card1]"), card2 = $("[data-card2]"), stamp = $("[data-stamp]"), bfaux = $("[data-bfaux]");
  var next = $("[data-next]"), psay = $("[data-psay]"), prog = $("[data-prog]"), wtitle = $("[data-wtitle]");
  var copies = $$("[data-copy]"), railItems = $$("span", rail);
  var TYPED = "Écris une offre d’emploi pour un poste d’assistant administratif.";
  var SLOTS = [
    ["Cible", ["des candidats débutants", "des experts en finance", "tout le monde"]],
    ["Contexte", ["CDI 35 h à Lyon 7e, prise de poste le 3 mars", "à Paris, 3 500 € par mois", "aucun"]]
  ];
  // deux cases, chacune avec du temps : ouverture, choix, validation
  var SLOT_AT = function (i) { return .14 + i * .4; }, SLOT_LEN = .34, OPT_AT = .16, SET_AT = .26;
  var STEP_IDS = ["write", "spot", "build", "swipe"];
  function setClass(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
  function show(name) { Object.keys(views).forEach(function (k) { setClass(views[k], "on", k === name); }); }

  var clicks = {};
  function clickAt(id, now) { if (now && !clicks[id]) { clicks[id] = 1; cursor.classList.remove("click"); void cursor.offsetWidth; cursor.classList.add("click"); } if (!now) clicks[id] = 0; }

  /* =====================================================================
     Rendu d'un instant
     ===================================================================== */
  var orbPos = { x: new Spring(0, 120, 20), y: new Spring(0, 120, 20), s: new Spring(.6, 120, 18) }, orbInit = false;
  var shaderI = new Spring(1, 60, 15);
  function render(dt, time) {
    var vw = stage.clientWidth, vh = stage.clientHeight, ch = current();
    setClass(nav, "is-solid", window.scrollY > 10);
    var tH = L("hero"), tB = L("burst"), tO = L("open");

    /* --- hero --- */
    var heroOut = ease(seg(tB, 0, .3));
    hero.style.opacity = String(1 - heroOut);
    hero.style.transform = "translateY(" + (-80 * heroOut) + "px) scale(" + (1 - .04 * heroOut) + ")";
    hero.style.visibility = heroOut >= 1 ? "hidden" : "visible";
    hint.style.opacity = String((1 - seg(tH, 0, .25)) * (U < START.burst ? 1 : 0));
    hoverEnergy *= Math.pow(.25, dt);

    /* --- l'orbe : apparition, montée, entrée dans l'écran --- */
    var a = appear.step(dt);
    var p0 = { x: vw / 2, y: Math.min(vh - 130, vh * .82), s: Math.min(.62, vw / 700) };
    var p1 = { x: vw / 2, y: vh * .38, s: Math.min(1, vw / 520) };
    var slotC = centerOf(slotWin), p2 = { x: slotC.x, y: slotC.y, s: (150 * cam.s.v) / ORB };
    var tUp = ease(seg(tB, .05, .4)), tIn = ease(seg(tO, .3, .75));
    var tx = lerp(lerp(p0.x, p1.x, tUp), p2.x, tIn), ty = lerp(lerp(p0.y, p1.y, tUp), p2.y, tIn), ts = lerp(lerp(p0.s, p1.s, tUp), p2.s, tIn);
    if (!orbInit) { orbPos.x.v = tx; orbPos.y.v = ty; orbPos.s.v = ts; orbInit = true; }
    orbPos.x.t = tx; orbPos.y.t = ty; orbPos.s.t = ts;
    var ox = orbPos.x.step(dt), oy = orbPos.y.step(dt), os = orbPos.s.step(dt);
    if (tIn > .9) { ox = tx; oy = ty; os = ts; }               // collée à sa place une fois arrivée
    var handOff = seg(tO, .74, .82);                           // l'orbe de la scène cède la place à celle du module
    var vis = Math.max(a, seg(tB, 0, .1));
    orbEl.style.transform = "translate(" + (ox - ORB / 2) + "px," + (oy - ORB / 2) + "px) scale(" + Math.max(.001, os * vis) + ")";
    orbEl.style.opacity = String(1 - handOff);
    orbEl.style.visibility = handOff >= 1 ? "hidden" : "visible";
    if (orb) orb.setState(tB > .25 && tB < .95 ? "speaking" : hoverEnergy > .05 ? "speaking" : "idle");

    /* --- la galaxie --- */
    var burst = ease(seg(tB, .15, .75));
    var gx = lerp(p0.x, p1.x, tUp), gy = lerp(p0.y, p1.y, tUp);
    var R = Math.min(vw, vh) * lerp(.34, .42, tUp);
    var gA = U < START.write ? 1 - .7 * seg(tO, 0, .6) : .3;
    galaxy.draw(gx, gy, R, gA, burst, burst * .01);

    /* --- la phrase de l'orbe --- */
    say.style.top = (vh * .38 + Math.min(150, vh * .17) * (vw < 600 ? .8 : 1)) + "px";
    say.style.opacity = String(seg(tB, .2, .32) * (1 - seg(tO, .05, .25)));
    reveal(sayW, seg(tB, .3, .85));

    /* --- le fond --- */
    shaderI.t = ch === "hero" ? 1 : ch === "burst" ? 1.25 : window.scrollY > story.offsetTop + story.offsetHeight - innerHeight ? .45 : .7;
    shader.draw(time, shaderI.step(dt), ch === "burst" ? 1 : .4, mouse.x < -999 ? innerWidth / 2 : mouse.x, mouse.y < -999 ? innerHeight / 2 : mouse.y);

    /* --- l'écran --- */
    var fIn = ease(seg(tO, 0, .5));
    frame.style.opacity = String(fIn);
    frame.style.transform = "translateY(" + (40 * (1 - fIn)) + "px) scale(" + (.94 + .06 * fIn) + ")";
    frame.style.visibility = fIn <= 0 ? "hidden" : "visible";
    var c = camFor(CAM_OF[ch]);
    if (!camInit) { cam.x.v = c.x; cam.y.v = c.y; cam.s.v = c.s; camInit = true; }
    cam.x.t = c.x; cam.y.t = c.y; cam.s.t = c.s;
    var cx = cam.x.step(dt), cy = cam.y.step(dt), cs = cam.s.step(dt);
    win.style.transform = "translate(" + cx + "px," + cy + "px) scale(" + cs + ")";
    setClass(veil, "on", CAM_OF[ch] !== "full");

    /* --- arguments et barre d'étapes --- */
    copies.forEach(function (el) { var id = el.dataset.copy, t = L(id); setClass(el, "on", ch === id && (id !== "open" || t > .45) && t < .97); });
    var si = STEP_IDS.indexOf(ch);
    setClass(rail, "on", si >= 0);
    railItems.forEach(function (r, i) { setClass(r, "on", i === si); setClass(r, "done", i < si); });
    if (si >= 0) {
      var it = railItems[si], rr = rail.getBoundingClientRect(), ir = it.getBoundingClientRect();
      railPill.style.left = "0px"; railPill.style.width = ir.width + "px";
      railPill.style.transform = "translateX(" + (ir.left - rr.left) + "px)";
      railPill.style.transition = "transform .6s var(--spring), width .6s var(--spring)";
    }

    /* =========== le module, geste par geste =========== */
    var tw = L("write"), tsp = L("spot"), tb = L("build"), tsw = L("swipe");
    var inBuild = U >= START.build;
    show(U < START.spot ? "vague" : U < START.build ? "hunt" : U < START.swipe ? "build" : "swipe");
    var sent = tw >= .62 && !inBuild;
    // les orbes du module
    setClass(slotWin, "on", (tO >= .8 && !sent && !inBuild) || (inBuild && tb > .06));
    setClass(slotMini, "on", sent || U >= START.swipe);
    if (orbIn) orbIn.setState(U >= START.write && tw > .12 && tw < .62 ? "listening" : "speaking");
    // ÉTAPE 1 · écrire
    if (!inBuild) { setWsay("Sophie vous demande une offre d’emploi."); reveal(wsayW, seg(tO, .78, 1)); }
    else { setWsay("Complétez chaque case orange."); reveal(wsayW, seg(tb, .06, .14)); }
    wsay.style.opacity = String(inBuild ? 1 : 1 - seg(tw, .6, .64));
    setClass(comp, "on", (tw >= .1 && !sent && !inBuild) || (inBuild && U < START.swipe));
    setClass(comp, "is-tpl", inBuild);
    var typed = seg(tw, .14, .5);
    if (!inBuild) {
      if (tw < .1 || sent) { if (!inp.querySelector(".ph")) inp.innerHTML = '<span class="ph">Le champ s’activera quand ce sera à vous d’écrire.</span>'; }
      else inp.innerHTML = TYPED.slice(0, Math.round(TYPED.length * typed)) + '<span class="caret"></span>';
    }
    setClass(send, "on", typed >= 1 && !sent && !inBuild);
    setClass(send, "press", tw >= .6 && tw < .64);
    setClass(u1, "on", sent);
    setClass(ai, "on", tw >= .68 && !inBuild);
    reveal(aiWords, seg(tw, .68, .92));
    msim.style.opacity = tw >= .93 ? "1" : "0";
    chat.style.opacity = String(1 - seg(tb, 0, .06));
    var wt = sent ? TYPED : "Nouvelle conversation"; if (wtitle.textContent !== wt) wtitle.textContent = wt;
    setClass(tasks[0], "cur", !sent && !inBuild && U < START.spot); setClass(tasks[0], "done", sent || U >= START.spot);
    setClass(tasks[1], "cur", sent && tw < .93); setClass(tasks[1], "done", tw >= .93);
    tasks.forEach(function (t, i) { var h = t.classList.contains("done") ? '<svg><use href="#i-check"/></svg>' : String(i + 1); if (t.firstChild.innerHTML !== h) t.firstChild.innerHTML = h; });
    setClass($('[data-fb="vague"]'), "on", tw >= .94);
    // ÉTAPE 2 · repérer
    marks.forEach(function (m, i) { var on = tsp >= .25 + i * .18 && !inBuild; setClass(m, "on", on); setClass(found[i], "on", on); clickAt("m" + i, on); });
    setClass($('[data-fb="hunt"]'), "on", tsp >= .8);
    // ÉTAPE 3 · construire
    var openI = -1;
    slots.forEach(function (s, i) {
      var t0 = SLOT_AT(i), set = tb >= t0 + SET_AT;
      if (tb >= t0 && tb < t0 + SET_AT + .02 && U < START.swipe) openI = i;
      setClass(s, "set", set); setClass(s, "open", openI === i && !set);
      var txt = set ? SLOTS[i][1][0] : SLOTS[i][0]; if (s.textContent !== txt) s.textContent = txt;
      setClass(bks[i], "on", set);
      clickAt("s" + i, tb >= t0 + .04 && tb < t0 + SET_AT); clickAt("o" + i, tb >= t0 + OPT_AT + .04 && tb < t0 + SET_AT + .02);
    });
    if (openI >= 0) {
      if (popT.textContent !== SLOTS[openI][0]) { popT.textContent = SLOTS[openI][0]; popO.innerHTML = SLOTS[openI][1].map(function (o) { return '<span class="pop-o">' + o + "</span>"; }).join(""); }
      var sr = inWin(slots[openI]), left = clamp(sr.x - 150, 8, 770 - 308);
      pop.style.left = left + "px"; pop.style.top = (sr.t - 48 - pop.offsetHeight - 14) + "px"; pop.style.setProperty("--ax", (sr.x - left) + "px");
      $$(".pop-o", popO).forEach(function (b, j) { setClass(b, "on", j === 0 && tb >= SLOT_AT(openI) + OPT_AT); });
    }
    setClass(pop, "on", openI >= 0);
    // ÉTAPE 4 · trancher
    var swp = ease(seg(tsw, .4, .75));
    card1.style.transform = "translateX(" + (-640 * swp) + "px) rotate(" + (-22 * swp) + "deg)";
    card1.style.opacity = String(1 - seg(tsw, .65, .8));
    stamp.style.opacity = String(seg(tsw, .22, .36));
    stamp.style.transform = "rotate(12deg) scale(" + (1.6 - .6 * ease(seg(tsw, .22, .36))) + ")";
    card2.style.transform = "scale(" + (.94 + .06 * swp) + ") translateY(" + (14 * (1 - swp)) + "px)";
    setClass(bfaux, "press", tsw >= .3 && tsw < .75); clickAt("faux", tsw >= .3);
    // pied du panneau
    var ps = U < START.spot ? (sent ? "Lisez la réponse de l’IA." : "Envoyez-la, et regardez le résultat.") : U < START.build ? "Trouvez les trois inventions." : U < START.swipe ? "Complétez les cases orange." : "Glissez la carte.";
    if (psay.textContent !== ps) psay.textContent = ps;
    setClass(next, "on", (ch === "write" && tw >= .94) || (ch === "spot" && tsp >= .8) || (ch === "build" && tb >= .92) || (ch === "swipe" && tsw >= .8));
    prog.style.width = (8 + 85 * seg(U, START.write, START.swipe + LEN.swipe)) + "%";
    // curseur de démonstration
    var cp = cursorAt(tw, tsp, tb, tsw, ch);
    cursor.style.opacity = cp ? "1" : "0";
    if (cp) cursor.style.transform = "translate(" + cp.x + "px," + cp.y + "px)";
    clickAt("send", tw >= .6 && !sent && ch === "write");
  }

  function cursorAt(tw, tsp, tb, tsw, ch) {
    function mv(a, b, t) { t = ease(t); return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
    if (ch === "write" && tw >= .5 && tw < .7) { var s = inWin(send); return mv({ x: s.x - 180, y: s.y - 100 }, s, seg(tw, .5, .6)); }
    if (ch === "spot" && tsp >= .1 && tsp < .85) {
      var pts = marks.map(function (m) { return inWin(m); });
      if (tsp < .3) return mv({ x: pts[0].x + 140, y: pts[0].y + 120 }, pts[0], seg(tsp, .1, .24));
      if (tsp < .48) return mv(pts[0], pts[1], seg(tsp, .3, .42));
      return mv(pts[1], pts[2], seg(tsp, .48, .6));
    }
    if (ch === "build" && tb >= .08 && tb < .92) {
      for (var i = 0; i < slots.length; i++) {
        var t0 = SLOT_AT(i);
        if (tb < t0 + SLOT_LEN) {
          var sl = inWin(slots[i]), prev = i > 0 ? inWin(slots[i - 1]) : { x: sl.x + 160, y: sl.y + 100 };
          if (tb < t0 + .04) return mv(prev, sl, seg(tb, t0 - .06, t0 + .03));
          var opt = $(".pop-o", popO), oc = opt && pop.classList.contains("on") ? inWin(opt) : sl;
          if (tb < t0 + SET_AT + .02) return mv(sl, oc, seg(tb, t0 + .07, t0 + OPT_AT));
          return mv(oc, sl, seg(tb, t0 + SET_AT + .02, t0 + SLOT_LEN));
        }
      }
      return null;
    }
    if (ch === "swipe" && tsw >= .08 && tsw < .8) { var b = inWin(bfaux); return mv({ x: b.x + 160, y: b.y - 140 }, b, seg(tsw, .08, .28)); }
    return null;
  }

  /* =====================================================================
     Boucle : le défilement passe par un ressort, puis tout suit
     ===================================================================== */
  var scrollS = new Spring(0, 110, 21), last = performance.now(), t0 = last;
  function target() { var r = story.getBoundingClientRect(); return clamp(-r.top / innerHeight, 0, TOTAL); }
  function loop(now) {
    var dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    scrollS.t = target(); U = scrollS.step(dt);
    render(dt, (now - t0) / 1000);
    requestAnimationFrame(loop);
  }
  function resize() { layout(); galaxy.size(); shader.size(); }
  window.addEventListener("resize", resize);
  resize(); scrollS.v = target(); U = scrollS.v;
  requestAnimationFrame(loop);

  /* =====================================================================
     Sections : apparitions en cascade
     ===================================================================== */
  $$("[data-reveal]").forEach(function (sec) { Array.prototype.forEach.call(sec.children, function (c, i) { c.style.setProperty("--i", i); }); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 });
    $$("[data-reveal]").forEach(function (s) { io.observe(s); });
  } else $$("[data-reveal]").forEach(function (s) { s.classList.add("in"); });

  /* ---------- liste des modules ---------- */
  var PARCOURS = [
    ["Démarrer", [["Première rencontre", "Découvrir l’IA, écrire un premier prompt."]]],
    ["Rédiger des prompts", [["La structure d’un prompt", "Rôle, cible, objectif, contexte, format."], ["Des prompts pour les images", "Décrire un visuel pour un post ou un rapport."]]],
    ["Améliorer les contenus", [["Dialoguer pour affiner", "Enrichir le contexte, corriger sans recommencer."], ["Optimiser un contenu existant", "Réécrire selon un ton, un format, une contrainte."]]],
    ["Protéger les données", [["Ce qu’on ne partage pas", "Repérer les données sensibles, anonymiser."]]],
    ["Des contenus pour tous", [["Écrire pour tous", "Un texte clair pour un handicap cognitif."], ["Images, audio, vidéo accessibles", "Texte alternatif, transcription, sous-titres.", 1]]],
    ["Le cadre légal", [["RGPD et IA Act : l’essentiel", "Les règles utiles au poste de travail.", 1], ["Biais et risques", "Analyser un cas, proposer des corrections."], ["Tenir sa veille réglementaire", "Sources officielles, textes à jour.", 1]]],
    ["Intégrer l’IA à son poste", [["Cartographier son poste", "Repérer les tâches que l’IA peut optimiser."], ["Choisir ses outils", "Comparer les outils, estimer un budget.", 1], ["Son plan d’intégration", "Rédiger la stratégie, sans oublier le handicap."]]],
    ["Se préparer", [["Préparer la certification", "Entraînements au format des mises en situation."]]]
  ];
  var mods = $("[data-mods]"), n = 0;
  if (mods) PARCOURS.forEach(function (part) {
    var el = document.createElement("section"); el.className = "part";
    el.innerHTML = "<h3></h3><ol></ol>"; el.firstChild.textContent = part[0];
    part[1].forEach(function (m) {
      n++;
      var li = document.createElement("li");
      li.innerHTML = "<span></span><div><b></b><small></small></div>";
      li.firstChild.textContent = String(n).padStart(2, "0");
      li.querySelector("b").textContent = m[0];
      if (m[2]) { var s = document.createElement("span"); s.className = "star"; s.textContent = "*"; li.querySelector("b").appendChild(s); }
      li.querySelector("small").textContent = m[1];
      el.lastChild.appendChild(li);
    });
    mods.appendChild(el);
  });
})();
