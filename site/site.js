/* ==========================================================================
   Site vitrine : le défilement raconte un module, chapitre par chapitre.
   hero   le titre
   sphere une sphère de particules se forme, tourne, éclate ; l'orbe naît et parle
   open   le module s'ouvre dans un écran, l'orbe y entre
   write · spot · build · more   quatre temps de l'apprenant ; une caméra
          cadre la zone utile, les étapes et leurs arguments sont à gauche
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
  var CH = [["hero", .6], ["sphere", 2.6], ["open", 1.2], ["write", 1.9], ["spot", 1.8], ["build", 2.4], ["more", 4]];
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
    if (!cv) return none;                                    // fond uni : le shader est retiré de la page
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
     Sphère de particules : se forme en ordre, tourne, puis éclate
     ===================================================================== */
  var mouse = { x: -9999, y: -9999 };
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  var sphere = (function () {
    var cv = $("[data-galaxy]"), ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1), pts = [], N = 1700, GA = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {                           // sphère de Fibonacci : des points régulièrement espacés
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
      var sx = Math.random() * 2 - 1, sy = Math.random() * 2 - 1, sz = Math.random() * 2 - 1;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, sx: sx * 2.6, sy: sy * 1.8, sz: sz, d: Math.random(), v: .8 + Math.random() * 2.4, jx: Math.random() - .5, jy: Math.random() - .5 });
    }
    function size() { var b = cv.getBoundingClientRect(); cv.width = b.width * dpr; cv.height = b.height * dpr; }
    return {
      size: size,
      // form : 0 → points épars, 1 → sphère ; burst : 0 → intacte, 1 → éclatée ; rot : angle
      draw: function (cx, cy, R, form, burst, rot, alpha) {
        var b = cv.getBoundingClientRect();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, b.width, b.height);
        if (alpha < .01) return;
        var cs = Math.cos(rot), sn = Math.sin(rot), tilt = .42, cT = Math.cos(tilt), sT = Math.sin(tilt);
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k], f = ease(clamp((form - p.d * .45) / .55, 0, 1));
          var x0 = p.x * cs - p.z * sn, z0 = p.x * sn + p.z * cs, y0 = p.y * cT - z0 * sT; z0 = p.y * sT + z0 * cT;
          var x = lerp(p.sx, x0, f), y = lerp(p.sy, y0, f), z = lerp(p.sz, z0, f);
          var e = burst * p.v * 2.2 + burst * burst * p.v * 3;  // éclatement : chaque point part à sa vitesse
          x = x * (1 + e) + p.jx * burst * .6; y = y * (1 + e) + p.jy * burst * .6;
          var persp = 1 / (1.9 - z * .55), px = cx + x * R * persp * 1.4, py = cy + y * R * persp * 1.4;
          var al = (.12 + .78 * (z + 1) / 2) * alpha * (f * .85 + .15) * (1 - burst * .9);
          if (al < .01) continue;
          var sz = (.42 + (z + 1) * .3) * (1 - burst * .3);
          ctx.fillStyle = "rgba(31, 30, 28," + al.toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(px, py, sz, 0, 6.2832); ctx.fill();
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
  $$(".hw", title).forEach(function (w) {                  // les mots s'illuminent au survol
    w.addEventListener("pointerenter", function () { w.classList.add("lit"); setTimeout(function () { w.classList.remove("lit"); }, 900); });
  });
  var appear = new Spring(0, 150, 13);

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
  var veil = $("[data-veil]"), frame = $("[data-frame]"), win = $("[data-win]"), steps = $("[data-side-l]"), stLine = $("[data-st-line]");
  var W = 1440, H = 860, F = { x: 0, y: 0, w: 0, h: 0 }, stacked = false;
  function layout() {
    var vw = innerWidth, vh = innerHeight, top = 80, bottom = 40;
    stacked = vw < 1100;
    if (!stacked) {
      var side = clamp(vw * .27, 330, 440), gap = clamp(vw * .05, 48, 96);
      F.w = Math.min(vw * .54, vw - side - gap - 96, 1060); F.h = Math.min(vh - top - bottom - 40, F.w * .62);
      var x0 = (vw - side - gap - F.w) / 2;
      F.x = x0 + side + gap; F.y = top + (vh - top - bottom - F.h) / 2;
      steps.style.cssText = "left:" + x0 + "px;width:" + side + "px;top:" + top + "px;height:" + (vh - top - bottom) + "px";
    } else {
      var mm = vw < 600 ? 16 : 28, copyH = vw < 600 ? 190 : 170;
      F.w = vw - 2 * mm; F.h = Math.min(vh - top - copyH - 40, F.w * .8);
      F.x = mm; F.y = top + copyH;
      steps.style.cssText = "left:" + mm + "px;right:" + mm + "px;top:" + top + "px;height:" + copyH + "px";
    }
    frame.style.left = F.x + "px"; frame.style.top = F.y + "px"; frame.style.width = F.w + "px"; frame.style.height = F.h + "px";
    steps.classList.toggle("is-stacked", stacked);
  }
  // cadrages : jamais de colonne tranchée ; « panel » resserre l'écran au format du panneau
  function camFor(name, fw, fh) {
    var s, x, y;
    if (name === "colTop" || name === "colBot") {              // toute la largeur de la conversation, en haut ou en bas
      s = Math.min(fw / 770, fh / 400); var h = fh / s;
      return { x: (fw - 770 * s) / 2, y: name === "colTop" ? -40 * s : -(H - h) * s, s: s };
    }
    if (name === "panel") {
      s = Math.min(fw / 669, fh / 820);
      return { x: -771 * s + (fw - 669 * s) / 2, y: -40 * s + (fh - 820 * s) / 2, s: s };
    }
    s = Math.min(fw / W, fh / H);
    return { x: (fw - W * s) / 2, y: (fh - H * s) / 2, s: s };
  }
  function camName(ch) {
    if (ch === "write") return L("write") < .64 ? "colBot" : "colTop";
    if (ch === "spot") return "colTop";
    if (ch === "build") return "colBot";
    if (ch === "more") return "panel";
    return "full";
  }
  var fwS = new Spring(0, 120, 20), fwInit = false;
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
  var gxs = $$("[data-gx]"), gbs = $$("[data-gb]"), qos = $$("[data-qo]"), wheel = $("[data-wheel]"), wbtn = $("[data-wbtn]"), wres = $("[data-wres]");
  var genTxt = $("[data-gen-txt]"), genBtn = $("[data-gen-btn]"), genImg = $("[data-gen-img]"), genBar = $("[data-gen-bar]"), genCap = $("[data-gen-cap]");
  var GEN = "Une affiche aquarelle pour la fête du quartier, plan large, couleurs chaudes, format carré.";
  var stItems = $$("[data-st]"), tags = {}; $$("[data-tag]").forEach(function (t) { tags[t.dataset.tag] = t; });
  var TYPED = "Écris une offre d’emploi pour un poste d’assistant administratif.";
  var SLOTS = [
    ["Cible", ["des candidats débutants", "des experts en finance", "tout le monde"]],
    ["Contexte", ["CDI 35 h à Lyon 7e, prise de poste le 3 mars", "à Paris, 3 500 € par mois", "aucun"]]
  ];
  // deux cases, chacune avec du temps : ouverture, choix, validation
  var SLOT_AT = function (i) { return .14 + i * .4; }, SLOT_LEN = .34, OPT_AT = .16, SET_AT = .26;
  var STEP_IDS = ["open", "write", "spot", "build", "more"];
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
    var tH = L("hero"), tS = L("sphere"), tO = L("open");

    /* --- 1. le titre s'efface au premier défilement --- */
    var heroOut = ease(seg(U, .05, START.sphere + .35));
    hero.style.opacity = String(1 - heroOut);
    hero.style.transform = "translateY(" + (-70 * heroOut) + "px) scale(" + (1 - .05 * heroOut) + ")";
    hero.style.visibility = heroOut >= 1 ? "hidden" : "visible";
    hint.style.opacity = String(1 - seg(U, 0, .3));

    /* --- 2. la sphère se forme, tourne, éclate --- */
    var form = seg(tS, .02, .3), burst = ease(seg(tS, .5, .74));
    var R = Math.min(vw, vh) * .27;
    var rot = time * .25 + U * 1.6;                           // elle tourne d'elle-même, et plus vite quand on défile
    sphere.draw(vw / 2, vh * .44, R, form, burst, rot, seg(tS, 0, .1) * (1 - seg(tS, .74, .8)));

    /* --- 3. l'orbe naît de l'éclatement, puis entre dans l'écran --- */
    appear.t = tS > .54 ? 1 : 0;
    var a = appear.step(dt);
    var p1 = { x: vw / 2, y: vh * .4, s: Math.min(1, vw / 520) };
    var slotC = centerOf(slotWin), p2 = { x: slotC.x, y: slotC.y, s: (150 * cam.s.v) / ORB };
    var tIn = ease(seg(tO, .3, .75));
    var tx = lerp(p1.x, p2.x, tIn), ty = lerp(p1.y, p2.y, tIn), ts = lerp(p1.s, p2.s, tIn);
    if (!orbInit) { orbPos.x.v = tx; orbPos.y.v = ty; orbPos.s.v = ts; orbInit = true; }
    orbPos.x.t = tx; orbPos.y.t = ty; orbPos.s.t = ts;
    var ox = orbPos.x.step(dt), oy = orbPos.y.step(dt), os = orbPos.s.step(dt);
    if (tIn > .9) { ox = tx; oy = ty; os = ts; }
    var handOff = seg(tO, .74, .82);                           // l'orbe de la scène cède la place à celle du module
    orbEl.style.transform = "translate(" + (ox - ORB / 2) + "px," + (oy - ORB / 2) + "px) scale(" + Math.max(.001, os * a) + ")";
    orbEl.style.opacity = String(1 - handOff);
    orbEl.style.visibility = handOff >= 1 || a < .002 ? "hidden" : "visible";
    if (orb) orb.setState(tS > .6 && tO < .9 ? "speaking" : "idle");

    /* --- sa phrase --- */
    say.style.top = (vh * .4 + Math.min(150, vh * .17) * (vw < 600 ? .8 : 1)) + "px";
    say.style.opacity = String(seg(tS, .6, .68) * (1 - seg(tO, .05, .25)));
    reveal(sayW, seg(tS, .64, .97));

    /* --- le fond --- */
    shaderI.t = ch === "hero" ? 1 : ch === "sphere" ? 1.15 : window.scrollY > story.offsetTop + story.offsetHeight - innerHeight ? .45 : .65;
    shader.draw(time, shaderI.step(dt), ch === "sphere" ? 1 : .4, mouse.x < -999 ? innerWidth / 2 : mouse.x, mouse.y < -999 ? innerHeight / 2 : mouse.y);

    /* --- l'écran --- */
    var fIn = ease(seg(tO, 0, .5));
    frame.style.opacity = String(fIn);
    frame.style.transform = "translateY(" + (40 * (1 - fIn)) + "px) scale(" + (.94 + .06 * fIn) + ")";
    frame.style.visibility = fIn <= 0 ? "hidden" : "visible";
    fwS.t = ch === "more" ? Math.min(F.w, F.h * 669 / 820) : F.w;
    if (!fwInit) { fwS.v = fwS.t; fwInit = true; }
    var fw = fwS.step(dt);
    frame.style.width = fw + "px"; frame.style.left = (F.x + (F.w - fw) / 2) + "px";
    var c = camFor(camName(ch), fw, F.h);
    if (!camInit) { cam.x.v = c.x; cam.y.v = c.y; cam.s.v = c.s; camInit = true; }
    cam.x.t = c.x; cam.y.t = c.y; cam.s.t = c.s;
    var cx = cam.x.step(dt), cy = cam.y.step(dt), cs = cam.s.step(dt);
    win.style.transform = "translate(" + cx + "px," + cy + "px) scale(" + cs + ")";

    /* --- les étapes, à gauche --- */
    var si = STEP_IDS.indexOf(ch);
    setClass(steps, "on", si >= 0 && (si > 0 || tO > .35));
    stItems.forEach(function (el, i) { setClass(el, "on", i === si); setClass(el, "done", i < si); });
    if (si >= 0 && !stacked) {                                // la ligne relie les pastilles, et se remplit jusqu'à l'étape active
      var sr0 = steps.getBoundingClientRect(), cy0 = function (el) { var r = el.querySelector(".st-n").getBoundingClientRect(); return r.top + r.height / 2 - sr0.top; };
      var top0 = cy0(stItems[0]), bot0 = cy0(stItems[stItems.length - 1]);
      stLine.parentNode.style.top = top0 + "px"; stLine.parentNode.style.bottom = "auto"; stLine.parentNode.style.height = (bot0 - top0) + "px";
      stLine.style.height = Math.max(0, cy0(stItems[si]) - top0) + "px";
    }

    /* =========== le module, geste par geste =========== */
    var tw = L("write"), tsp = L("spot"), tb = L("build"), tm = L("more");
    var gk = U < START.more ? -1 : Math.min(3, Math.floor(tm * 4)), gu = gk < 0 ? 0 : clamp(tm * 4 - gk, 0, 1);
    var tsw = gk < 0 ? 0 : gk > 0 ? 1 : gu;
    var inBuild = U >= START.build;
    show(U < START.spot ? "vague" : U < START.build ? "hunt" : U < START.more ? "build" : "more");
    var sent = tw >= .62 && !inBuild;
    // les orbes du module
    setClass(slotWin, "on", (tO >= .8 && !sent && !inBuild) || (inBuild && tb > .06));
    setClass(slotMini, "on", sent || U >= START.more);
    if (orbIn) orbIn.setState(U >= START.write && tw > .12 && tw < .62 ? "listening" : "speaking");
    // ÉTAPE 1 · écrire
    if (!inBuild) { setWsay("Sophie vous demande une offre d’emploi."); reveal(wsayW, seg(tO, .78, 1)); }
    else { setWsay("Complétez chaque case orange."); reveal(wsayW, seg(tb, .06, .14)); }
    wsay.style.opacity = String(inBuild ? 1 : 1 - seg(tw, .6, .64));
    setClass(comp, "on", (tw >= .1 && !sent && !inBuild) || (inBuild && U < START.more));
    var inMore = U >= START.more;
    setClass(comp, "is-tpl", inBuild && !inMore);
    comp.style.opacity = inMore ? "0" : "1";
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
    var spotOn = ch === "spot";
    setClass(tags.q, "on", spotOn && tsp >= .04 && tsp < .3);
    if (spotOn) { var ub = inWin(u1); tags.q.style.left = ub.x + "px"; tags.q.style.top = (ub.t + ub.h + 14) + "px"; }
    marks.forEach(function (m, i) {
      var on = spotOn && tsp >= .25 + i * .18 + .02 && tsp < .95, t = tags[String(i)];
      setClass(t, "on", on);
      if (spotOn) { var mr = inWin(m); t.style.left = mr.x + "px"; t.style.top = (mr.t - 44) + "px"; }
    });
    // ÉTAPE 3 · construire
    var openI = -1;
    slots.forEach(function (s, i) {
      var t0 = SLOT_AT(i), set = tb >= t0 + SET_AT;
      if (tb >= t0 && tb < t0 + SET_AT + .02 && U < START.more) openI = i;
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
    // ÉTAPE 4 · varier : glisser, QCM, roue, image
    gxs.forEach(function (g, i) { setClass(g, "on", i === Math.max(0, gk)); });
    gbs.forEach(function (g, i) { setClass(g, "cur", i === gk); });
    // QCM
    var q = gk === 1 ? gu : gk > 1 ? 1 : 0;
    qos.forEach(function (o, i) { setClass(o, "sel", i === 1 && q >= .4 && q < .62); setClass(o, "ok", i === 1 && q >= .62); });
    setClass($('[data-fb="qcm"]'), "on", q >= .66);
    clickAt("qcm", gk === 1 && q >= .4);
    // roue
    var w = gk === 2 ? gu : gk > 2 ? 1 : 0, spin = ease(seg(w, .2, .78));
    wheel.style.transform = "rotate(" + (spin * (360 * 3 + 330)) + "deg)";
    setClass(wbtn, "press", w >= .14 && w < .2); clickAt("wheel", gk === 2 && w >= .14);
    setClass(wres, "on", w >= .8);
    // image
    var g = gk === 3 ? gu : 0, gtxt = GEN.slice(0, Math.round(GEN.length * seg(g, .04, .32)));
    if (genTxt.textContent !== gtxt) genTxt.textContent = gtxt;
    setClass(genBtn, "press", g >= .36 && g < .42); clickAt("gen", gk === 3 && g >= .36);
    var gr = seg(g, .42, .9);
    genImg.style.opacity = String(seg(g, .42, .5));
    genImg.style.filter = "blur(" + (26 * (1 - ease(gr))).toFixed(1) + "px) saturate(" + (.4 + .6 * gr).toFixed(2) + ")";
    genBar.style.width = (100 * gr) + "%";
    genBar.parentNode.style.opacity = gr >= 1 ? "0" : "1";
    genCap.textContent = gr >= 1 ? "affiche_fete_quartier.png" : g >= .42 ? "Génération… " + Math.round(gr * 100) + " %" : "";
    // la carte à glisser
    var swp = ease(seg(tsw, .4, .75));
    card1.style.transform = "translateX(" + (-640 * swp) + "px) rotate(" + (-22 * swp) + "deg)";
    card1.style.opacity = String(1 - seg(tsw, .65, .8));
    stamp.style.opacity = String(seg(tsw, .22, .36));
    stamp.style.transform = "rotate(12deg) scale(" + (1.6 - .6 * ease(seg(tsw, .22, .36))) + ")";
    card2.style.transform = "scale(" + (.94 + .06 * swp) + ") translateY(" + (14 * (1 - swp)) + "px)";
    setClass(bfaux, "press", tsw >= .3 && tsw < .75); clickAt("faux", tsw >= .3);
    // pied du panneau
    var ps = U < START.spot ? (sent ? "Lisez la réponse de l’IA." : "Envoyez-la, et regardez le résultat.") : U < START.build ? "Trouvez les trois inventions." : U < START.more ? "Complétez les cases orange." : ["Glissez la carte.", "Choisissez la bonne réponse.", "Tournez la roue.", "Générez l’image."][Math.max(0, gk)];
    if (psay.textContent !== ps) psay.textContent = ps;
    setClass(next, "on", (ch === "write" && tw >= .94) || (ch === "spot" && tsp >= .8) || (ch === "build" && tb >= .92) || (ch === "more" && gu >= .85));
    prog.style.width = (8 + 85 * seg(U, START.write, START.more + LEN.more)) + "%";
    // curseur de démonstration
    var cp = cursorAt(tw, tsp, tb, tsw, ch, gk, gu);
    cursor.style.opacity = cp ? "1" : "0";
    if (cp) cursor.style.transform = "translate(" + cp.x + "px," + cp.y + "px)";
    clickAt("send", tw >= .6 && !sent && ch === "write");
  }

  function cursorAt(tw, tsp, tb, tsw, ch, gk, gu) {
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
    if (ch === "more") {
      if (gk === 0 && gu >= .08 && gu < .8) { var b = inWin(bfaux); return mv({ x: b.x + 160, y: b.y - 140 }, b, seg(gu, .08, .28)); }
      if (gk === 1 && gu >= .1 && gu < .9) { var o = inWin(qos[1]); return mv({ x: o.x + 180, y: o.y + 140 }, { x: o.x + 60, y: o.y }, seg(gu, .1, .36)); }
      if (gk === 2 && gu < .4) { var wb = inWin(wbtn); return mv({ x: wb.x - 120, y: wb.y + 120 }, wb, seg(gu, .0, .13)); }
      if (gk === 3 && gu >= .3 && gu < .6) { var gb = inWin(genBtn); return mv({ x: gb.x - 160, y: gb.y + 90 }, gb, seg(gu, .3, .35)); }
    }
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
  function resize() { layout(); sphere.size(); shader.size(); }
  window.addEventListener("resize", resize);
  resize(); scrollS.v = target(); U = scrollS.v;
  requestAnimationFrame(loop);

  /* =====================================================================
     Ce qu'on apprend : la bande défile à l'horizontale
     ===================================================================== */
  var learn = $("[data-learn]"), track = $("[data-learn-track]"), lprog = $("[data-learn-prog]"), lx = new Spring(0, 120, 22);
  (function learnLoop() {
    if (learn && innerWidth > 800) {
      var r = learn.getBoundingClientRect(), p = clamp(-r.top / (r.height - innerHeight), 0, 1);
      lx.t = -(track.scrollWidth - innerWidth) * p; lx.step(1 / 60);
      track.style.transform = "translateX(" + lx.v.toFixed(1) + "px)"; lprog.style.width = (p * 100) + "%";
    } else if (track) track.style.transform = "";
    requestAnimationFrame(learnLoop);
  })();

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
