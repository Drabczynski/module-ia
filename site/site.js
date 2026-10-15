/* ==========================================================================
   Site vitrine : le défilement raconte un module, chapitre par chapitre.
   film   le hero, puis la vidéo du bureau défile image par image, avec les messages
   dive   la caméra plonge dans l'écran ; la sphère de la vidéo devient la nôtre
   sphere l'orbe surgit de l'écran et parle
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

  /* ---------- la vidéo d'ouverture : la nouvelle (intro, 10 s), ou l'ancienne avec ?video=bureau (7 s) ----------
     cible : le point de la dernière image où la caméra plonge (proportions de l'image) ; len : longueur du chapitre,
     proportionnelle au nombre d'images pour garder la même vitesse de défilement */
  var VIDEOS = {
    // claire : montrée en entier sous la barre du haut (fond flou sur les côtés), sans voile ni éclaircissement ;
    // la dernière image reste un moment avant la plongée (end : part du chapitre où la vidéo se termine)
    // keys : [écran de défilement, seconde de la vidéo] ; la vidéo ralentit pendant les messages et passe plus vite entre eux ;
    // rien pendant « Imagine un monde » (2,4 à 4,2 s), la vidéo parle seule ; elle s'arrête à la fin du désert (image 190, 7,92 s) :
    // l'interface du module s'y dessine au trait pendant que l'orbe parle, puis le désert s'efface (uiLines).
    // msgs : trois messages, pour des débutants (pas pour les entreprises) : [début, fin] en écrans, place, côté du voile, texte ;
    // tous en blanc, sur un côté, avec un voile violet foncé à peine perceptible de ce côté-là
    intro: { dir: "intro", n: 191, fps: 24, fit: "contain", light: true, drift: .05, target: { x: .5, y: .5, r: .03 },
      keys: [[0, 0], [1.4, .3], [5.25, 1.35], [5.85, 2.4], [7.25, 4.2], [7.65, 4.45], [10.65, 5.2], [11.25, 5.8], [12.65, 7.3], [12.95, 7.42], [14.65, 7.92]],   // la vidéo ralentit sous chaque message
      msgs: [[1.55, 5.15, "m-l m-big", "l", "<h2>Apprenez l’IA,<br>pas à pas.</h2>"],                      // sur le ruban violet foncé, en bas à gauche ; il reste longtemps (≈ 3,6 écrans)
             [7.7, 10.0, "m-l m-bl", "l", "<h2>14 modules<br>où l’on apprend en faisant.</h2>"],   // en bas à gauche, sous la petite image des dunes
             [13.0, 14.55, "m-big m-br", "r", "<h2>Des formations<br>100&nbsp;% interactives.</h2>"]] },                                                      // en bas à droite, sur les dunes plus sombres de la dernière image
    bureau: { dir: "bureau", n: 169, len: 10, end: .985, fit: "cover", target: { x: .4865, y: .485, r: .029 } }               // la sphère, sur l'écran du bureau
  };
  var VID = VIDEOS[(location.search.match(/[?&]video=(\w+)/) || [])[1]] || VIDEOS.intro;
  document.documentElement.classList.add("v-" + VID.dir);

  /* ---------- chapitres (longueurs en hauteurs d'écran) ---------- */
  if (VID.keys) VID.len = VID.keys[VID.keys.length - 1][0];
  var CH = [["film", VID.len], ["dive", VID.light ? 1.6 : 1.4], ["sphere", VID.light ? 2.4 : 1.8], ["open", 2.8], ["write", 2.2], ["spot", .0001], ["build", .0001], ["more", 6.5], ["end", 1.6]];   // repérer et construire : retirés du récit
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

  /* le fond passe au clair à l'arrivée sur le parcours, et le reste ensuite */
  (function () {
    var vg = $("#modules"); if (!vg) return;
    var on = false;
    function check() {
      var r = vg.getBoundingClientRect(), mid = innerHeight / 2, want = r.top < mid;   // à partir du parcours, et jusqu'en bas
      if (want !== on) { on = want; document.documentElement.classList.toggle("bg-cream", on); }
    }
    addEventListener("scroll", check, { passive: true }); addEventListener("resize", check); check();
  })();

  /* =====================================================================
     La sphère du hero : des particules de lumière qui tournent au centre,
     et qui éclatent quand on descend vers la vidéo
     ===================================================================== */
  (function () {
    var cv = $("[data-hero-orb]"); if (!cv) return;
    var ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, pts = [], N = 2400, GA = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, v: .6 + Math.random() * 1.8, j: Math.random() });
    }
    function size() { var b = cv.getBoundingClientRect(); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    size(); addEventListener("resize", size);
    var rot = 0, last = performance.now(), mx = 0, my = 0, tx = 0, ty = 0, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    addEventListener("pointermove", function (e) { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
    (function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      var out = Math.min(1, Math.max(0, scrollY / (innerHeight * 1.1)));
      if (out >= 1) return;                                    // le hero est parti : on ne dessine plus
      if (!still) rot += dt * .16;
      mx += (tx - mx) * .04; my += (ty - my) * .04;
      // une très grande sphère, qui entoure tout le texte : ses points s'effacent là où sont l'icône, le titre et le texte
      var burst = out * out, small = W < 800, R = small ? W * .25 : Math.max(Math.min(W, H) * .64, W * .4), cx = W / 2, cy = small ? H * .25 : H * .5, Rv = R * .74;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);   // un halo très doux
      g.addColorStop(0, "rgba(190,200,255," + (.10 * (1 - out)).toFixed(3) + ")"); g.addColorStop(1, "rgba(190,200,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var a = rot + mx * .6, cs = Math.cos(a), sn = Math.sin(a), t = .35 + my * .3, cT = Math.cos(t), sT = Math.sin(t);
      for (var k = 0; k < N; k++) {
        var p = pts[k], x0 = p.x * cs - p.z * sn, z0 = p.x * sn + p.z * cs, y0 = p.y * cT - z0 * sT; z0 = p.y * sT + z0 * cT;
        var e = 1 + burst * p.v * 2.4, persp = 1 / (1.9 - z0 * .55);
        var px = cx + x0 * e * R * persp * 1.4, py = cy + y0 * e * R * persp * 1.4;
        var al = (.1 + .8 * (z0 + 1) / 2) * (1 - out * .85) * (.85 + .15 * Math.sin(now / 600 + p.j * 6.28));
        if (!small) { var kq = Math.hypot((px - cx) / (Rv * .98), (py - cy) / (Rv * .8)), f = Math.min(1, Math.max(0, (kq - .64) / .38)); al *= .08 + .92 * f * f * (3 - 2 * f); }   // le texte reste lisible
        if (al < .02) continue;
        ctx.fillStyle = "rgba(235,238,255," + al.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(px, py, .6 + (z0 + 1) * .7, 0, 6.2832); ctx.fill();
      }
    })(performance.now());
  })();

  /* =====================================================================
     La vidéo d'ouverture : ses images dessinées au fil du défilement
     ===================================================================== */
  var film = (function () {
    var N = VID.n, el = $("[data-film]"), cv = $("[data-film-cv]"), ctx = cv.getContext("2d"), imgs = new Array(N), loaded = new Array(N), last = -1, lastW = 0;
    var SPHERE = VID.target;                                    // là où la caméra plonge, dans la dernière image
    // vidéo claire : après la vidéo, la dernière image du désert reste en fond, très floue, pendant toute la présentation de l'interface
    var blur = VID.light ? document.createElement("canvas") : null;
    if (blur) { blur.className = "film-blur"; blur.width = 96; blur.height = 54; blur.setAttribute("aria-hidden", "true"); el.parentNode.insertBefore(blur, el.nextSibling); }
    // puis le fond du tout premier écran (le dégradé violet-bleu) revient en fondu par-dessus le désert flou : l'interface se présente sur un fond foncé
    var aurora = VID.light ? document.createElement("div") : null;
    if (aurora) { aurora.className = "film-aurora story-aurora"; aurora.setAttribute("aria-hidden", "true"); blur.parentNode.insertBefore(aurora, blur.nextSibling); }
    function paintBlur(im) { if (blur) blur.getContext("2d").drawImage(im, 0, 0, 96, 54); }
    function load(i) { if (imgs[i]) return; var im = new Image(); im.decoding = "async"; im.onload = function () { loaded[i] = true; if (i === 0) last = -1; if (i === N - 1) paintBlur(im); }; im.src = "../assets/video/" + VID.dir + "/" + String(i).padStart(3, "0") + ".jpg"; imgs[i] = im; }
    load(0); load(N - 1);
    var order = []; for (var step = 32; step >= 1; step = step >> 1) for (var j = 0; j < N; j += step) order.push(j);   // d'abord une image sur 32, puis on affine
    var qi = 0; (function pump() { var k = 0; while (qi < order.length && k < 6) { load(order[qi++]); k++; } if (qi < order.length) setTimeout(pump, 60); })();
    // là où l'image est dessinée : toute la vidéo sous la barre du haut (contain), ou plein cadre (cover)
    function cover() {
      var w = cv.clientWidth, h = cv.clientHeight, s;
      // toute la hauteur : le menu flotte par-dessus
      if (VID.fit === "contain") { var top = 0, ah = h - top; s = Math.min(w / 1280, ah / 720); return { s: s, x: (w - 1280 * s) / 2, y: top + (ah - 720 * s) / 2, w: w, h: h }; }
      s = Math.max(w / 1280, h / 720); return { s: s, x: (w - 1280 * s) / 2, y: (h - 720 * s) / 2, w: w, h: h };
    }
    // autour de la vidéo entière : la même image, très floue (réduite à 48 × 27 puis agrandie), plein cadre
    var tiny = VID.fit === "contain" ? document.createElement("canvas") : null, tctx = tiny && tiny.getContext("2d");
    if (tiny) { tiny.width = 48; tiny.height = 27; }
    // la vidéo se fond dans ce flou sur ses bords gauche et droit (un dégradé de 7 % de sa largeur)
    var soft = tiny && document.createElement("canvas"), sctx = soft && soft.getContext("2d");
    function feather(img, w, h) {
      if (soft.width !== w || soft.height !== h) { soft.width = w; soft.height = h; }
      sctx.globalCompositeOperation = "source-over"; sctx.clearRect(0, 0, w, h); sctx.drawImage(img, 0, 0, w, h);
      var g = sctx.createLinearGradient(0, 0, w, 0), e = .07;
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(e, "#000"); g.addColorStop(1 - e, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.globalCompositeOperation = "destination-in"; sctx.fillStyle = g; sctx.fillRect(0, 0, w, h);
      return soft;
    }
    var topLum = 1;
    // l'image à montrer : le long des repères (keys), ou au fil du chapitre
    function frameAt(tF) {
      if (!VID.keys) return seg(tF, .08, VID.end) * (N - 1);
      var u = tF * VID.len, K = VID.keys;
      for (var k = 1; k < K.length; k++) if (u <= K[k][0]) { var a = K[k - 1], b = K[k]; return Math.min(N - 1, (a[1] + (b[1] - a[1]) * (u - a[0]) / Math.max(1e-6, b[0] - a[0])) * VID.fps); }
      return N - 1;
    }
    return {
      el: el, N: N, SPHERE: SPHERE, cover: cover, frameAt: frameAt, lum: function () { return topLum; },
      blur: function (op) { if (blur) { blur.style.opacity = String(op); blur.style.visibility = op <= .001 ? "hidden" : "visible"; } },
      aurora: function (op) { if (aurora) { aurora.style.opacity = String(op); aurora.style.visibility = op <= .001 ? "hidden" : "visible"; } },
      draw: function (f) {
        var i = clamp(Math.round(f), 0, N - 1);
        if (!loaded[i]) { for (var d = 1; d < N; d++) { if (loaded[i - d]) { i = i - d; break; } if (loaded[i + d]) { i = i + d; break; } } }
        if (!loaded[i]) return;
        var dpr = Math.min(1.5, window.devicePixelRatio || 1), w = cv.clientWidth;
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(cv.clientHeight * dpr); last = -1; }
        if (i === last) return; last = i;
        var c = cover(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (tiny) {
          tctx.drawImage(imgs[i], 0, 0, 48, 27);
          var bs = Math.max(c.w / 48, c.h / 27);
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
          ctx.drawImage(tiny, (c.w - 48 * bs) / 2, (c.h - 27 * bs) / 2, 48 * bs, 27 * bs);
          var px = tctx.getImageData(0, 1, 48, 3).data, sum = 0;                    // sous la barre du haut : clair ou foncé ?
          for (var q = 0; q < px.length; q += 4) sum += .2126 * px[q] + .7152 * px[q + 1] + .0722 * px[q + 2];
          topLum = sum / (px.length / 4) / 255;
        }
        if (tiny && c.w - 1280 * c.s > 2) { var fw = Math.round(1280 * c.s * dpr), fh = Math.round(720 * c.s * dpr); ctx.drawImage(feather(imgs[i], fw, fh), c.x, c.y, 1280 * c.s, 720 * c.s); }
        else ctx.drawImage(imgs[i], c.x, c.y, 1280 * c.s, 720 * c.s);
      }
    };
  })();
  var filmAurora = $("[data-film-aurora]"), filmDim = $("[data-film-dim]"), filmShade = $("[data-film-shade]"), filmFlash = $("[data-film-flash]"), msgs = $$("[data-msg]");
  var MSG = [[.1, .3], [.28, .5], [.47, .68], [.65, .84], [.81, .99]];
  if (VID.msgs) {                                              // vidéo claire : ses propres messages, fenêtres et places ; les autres ne s'affichent pas
    MSG = msgs.map(function (m, i) { var v = VID.msgs[i]; return v ? [v[0] / VID.len, v[1] / VID.len] : [2, 2]; });
    msgs.forEach(function (m, i) {
      var v = VID.msgs[i];
      if (!v) { m.hidden = true; return; }
      m.className = "msg " + v[2];
      if (v[4]) m.innerHTML = v[4];
    });
  }

  /* =====================================================================
     Hero : le titre se pose mot à mot, l'orbe apparaît au survol
     ===================================================================== */
  var hero = $("[data-hero]"), title = $("[data-title]"), hint = $("[data-hint]"), nav = $("[data-nav]");
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add("is-ready"); }); });
  var orbEl = $("[data-orb]"), ORB = 240, orb = null;           // la mascotte, créée quand coach.js est chargé (plus bas)

  /* ---------- la mascotte : le coach des modules (coach/coach.js), une bille de verre aux yeux expressifs ---------- */
  function onCoach(fn) { if (window.Coach) fn(); else addEventListener("coach-ready", fn, { once: true }); }
  function mascot(slot, size, mood) {
    if (!slot) return null;
    var host = document.createElement("div"); slot.appendChild(host);
    var coach = new window.Coach(host, { size: size, label: "Assistant IA" }), cur = "";
    function setState(m) { m = m === "speaking" || m === "listening" || m === "thinking" ? m : "idle"; if (m !== cur) { cur = m; coach.setMood(m); } }
    setState(mood);
    return { coach: coach, setState: setState };
  }
  onCoach(function () { orb = mascot(orbEl, ORB, "idle"); });

  var appear = new Spring(0, 150, 13);

  /* ---------- typographie : jamais un petit mot seul en fin de ligne ---------- */
  var SHORT = /(^|[\s(«\u00a0])(à|au|aux|de|des|du|d’|en|et|la|le|les|l’|un|une|ou|où|sa|son|ses|ce|ces|cet|on|il|elle|y|par|pour|sur|dans|avec|sans|mais|que|qui|ne|se|vos|nos|votre|notre|leur|tout|plus|pas|est|a) (?=\S)/gi;
  function glue(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { var t = n.nodeValue, u = t; do { t = u; u = t.replace(SHORT, "$1$2\u00a0"); } while (u !== t); if (u !== n.nodeValue) n.nodeValue = u; }
  }
  $$(".msg, .st-more, .hero-sub, .sec h2, .sec-lead, .feat p, .lc p, .lc h3, .learn-head h2, .final h2, .final p, .pm-t small, .pv-lead, .faq p, .pc-list li, .comp li, .say").forEach(glue);

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
    if (name === "panel") {                                     // même écran, la caméra glisse à droite sur le panneau
      s = Math.min(fh / 830, fw / 669);
      return { x: fw - (W - 2) * s, y: (fh - 830 * s) / 2 - 36 * s, s: s };
    }
    s = Math.min(fw / W, fh / H);
    return { x: (fw - W * s) / 2, y: (fh - H * s) / 2, s: s };
  }
  function camName(ch) {
    if (ch === "write") return L("write") < .64 ? "colBot" : "colTop";
    if (ch === "spot") return "colTop";
    if (ch === "build") return "colBot";
    if (ch === "more" || ch === "end") return "full";                          // tout le module : la conversation à gauche, la consigne à droite
    return "full";
  }
  var fwS = new Spring(0, 120, 20), fwInit = false;
  var cam = { x: new Spring(0, 90, 19), y: new Spring(0, 90, 19), s: new Spring(.5, 90, 19) }, camInit = false;

  // où l'interface se dessine (vidéo claire) : l'écran du module, agrandi et centré ; il glisse ensuite à sa place (F)
  function drawRect(vw, vh) {
    var k = Math.min(Math.min(vw * .62, 1080) / F.w, (vh - 76 - 60) / F.h), w = F.w * k, h = F.h * k;
    return { x: (vw - w) / 2, y: 76 + (vh - 76 - h) / 2, w: w, h: h, k: k };
  }

  /* =====================================================================
     L'interface au trait (vidéo claire) : pendant que l'orbe parle, l'écran du module se dessine en lignes fines,
     façon Hairline : ses blocs, ses textes, ses icônes, relevés sur l'interface elle-même (une seule fois),
     tracés trait par trait ; puis l'interface apparaît exactement par-dessus
     ===================================================================== */
  var uiLines = (function () {
    if (!VID.light) return null;
    var NS = "http://www.w3.org/2000/svg", box = document.createElement("div"), svg = document.createElementNS(NS, "svg");
    box.className = "ui-lines"; box.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 1440 860"); svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    box.appendChild(svg); frame.parentNode.insertBefore(box, frame);
    var items = [], traced = false, lastP = -1, out = null;
    function add(tag, attrs, cls, s0, d) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, typeof attrs[k] === "number" ? attrs[k].toFixed(1) : attrs[k]);
      e.setAttribute("pathLength", "1"); e.setAttribute("class", cls); svg.appendChild(e);
      var it = { el: e, s: s0, d: d }; items.push(it); return it;
    }
    function shown(el) { for (var n = el; n && n !== frame; n = n.parentElement) { var cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < .4) return false; } return true; }
    function trace() {
      var wr = win.getBoundingClientRect(), sc = wr.width / 1440;
      if (!sc) return;
      traced = true;
      var vis = frame.style.visibility; frame.style.visibility = "visible";   // l'écran est encore masqué : on le relève tel qu'il apparaîtra (le rendu le remasque)
      var boxes = [], lines = [], icons = [], rg = document.createRange();
      var R = function (r) { return { x: (r.left - wr.left) / sc, y: (r.top - wr.top) / sc, w: r.width / sc, h: r.height / sc }; };
      var inside = function (b) { return b.w > 4 && b.h > 3 && b.x > -2 && b.y > -2 && b.x + b.w < 1442 && b.y + b.h < 862; };
      $$("*", win).forEach(function (el) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return;
        if (el.closest("[data-slot-win], [data-slot-mini]")) return;            // la place de l'orbe : l'orbe y entrera
        if (!shown(el)) return;
        var cs = getComputedStyle(el), b = R(el.getBoundingClientRect());
        if (!inside(b)) return;
        if (el.tagName.toLowerCase() === "svg") { icons.push(b); return; }
        var bg = cs.backgroundColor.match(/[\d.]+/g) || [], bgA = bg.length === 4 ? +bg[3] : bg.length ? 1 : 0;
        var hasBox = el !== win && (bgA > .05 || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || cs.boxShadow !== "none");
        if (hasBox && b.w > 10 && b.h > 6) boxes.push({ b: b, r: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, b.h / 2, b.w / 2), hi: el.matches(".pv-rule, .task.cur, .w-send, .send, .btn, .w-comp") });
        Array.prototype.forEach.call(el.childNodes, function (t) {
          if (t.nodeType !== 3 || !t.nodeValue.trim()) return;
          rg.selectNodeContents(t);
          Array.prototype.forEach.call(rg.getClientRects(), function (r) { var q = R(r); if (q.w > 3 && inside(q)) lines.push(q); });
        });
      });
      // l'ordre du dessin : le cadre, puis les grands blocs (du haut à gauche vers le bas à droite), puis les textes et les icônes
      out = add("rect", { x: 0, y: 0, width: 1440, height: 860, rx: 22 }, "out", 0, .22);
      boxes.sort(function (a, b) { return (a.b.y + a.b.x * .35) - (b.b.y + b.b.x * .35); });
      boxes.forEach(function (o, i) { var q = o.b; add("rect", { x: q.x, y: q.y, width: q.w, height: q.h, rx: o.r }, o.hi ? "hi" : "bx", .06 + .5 * i / Math.max(1, boxes.length), .22); });
      lines.sort(function (a, b) { return (a.y + a.x * .2) - (b.y + b.x * .2); });
      lines.forEach(function (q, i) { var y = q.y + q.h * .55; add("line", { x1: q.x, y1: y, x2: q.x + q.w, y2: y }, "tx", .32 + .5 * i / Math.max(1, lines.length), .14); });
      frame.style.visibility = vis;
      icons.forEach(function (q, i) { add("circle", { cx: q.x + q.w / 2, cy: q.y + q.h / 2, r: Math.max(2, Math.min(q.w, q.h) * .42) }, "ic", .4 + .45 * i / Math.max(1, icons.length), .12); });
    }
    return {
      update: function (p, op, fw, fh, txo, bgk) {
        box.classList.toggle("on-film", bgk < .5);                // sur le désert : des traits blancs ; sur le fond : des traits lilas très clairs
        box.style.setProperty("--tx", String(txo == null ? 1 : txo));   // les traits de texte s'effacent les premiers : ils ne barrent pas les vrais textes
        box.style.left = frame.style.left; box.style.top = frame.style.top; box.style.width = frame.style.width; box.style.height = frame.style.height;
        box.style.transform = frame.style.transform; box.style.opacity = String(op);
        box.style.visibility = op <= .001 ? "hidden" : "visible";
        if (op <= .001) return;
        if (!traced) trace();
        if (out && fw) {                                      // le contour de l'écran, à son format (l'interface y est centrée)
          var s = Math.min(fw / 1440, fh / 860), ow = fw / s, oh = fh / s;
          out.el.setAttribute("x", ((1440 - ow) / 2).toFixed(1)); out.el.setAttribute("y", ((860 - oh) / 2).toFixed(1));
          out.el.setAttribute("width", ow.toFixed(1)); out.el.setAttribute("height", oh.toFixed(1)); out.el.setAttribute("rx", (22 / s).toFixed(1));
        }
        if (Math.abs(p - lastP) < .002) return;
        lastP = p;
        items.forEach(function (it) { it.el.style.strokeDashoffset = (1 - ease(clamp((p - it.s) / it.d, 0, 1))).toFixed(4); });
      }
    };
  })();

  function centerOf(el) { var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top, w: r.width }; }
  function inWin(el) {
    var r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), k = w.width / W;
    return { x: (r.left - w.left + r.width / 2) / k, y: (r.top - w.top + r.height / 2) / k, t: (r.top - w.top) / k, w: r.width / k, h: r.height / k };
  }

  /* ---------- éléments du module ---------- */
  var slotWin = $("[data-slot-win]"), slotMini = $("[data-slot-mini]");
  var orbIn = null, orbMini = null;
  onCoach(function () {
    orbIn = mascot(slotWin, 150, "speaking");
    orbMini = mascot(slotMini, 44, "speaking");
    if (orbIn) orbIn.coach.lookAt(function () { return inp; });     // quand l'apprenant écrit, elle regarde le champ
  });
  var views = {}; $$("[data-view]").forEach(function (v) { views[v.dataset.view] = v; });
  var comp = $("[data-comp]"), inp = $("[data-in]"), send = $("[data-send]"), u1 = $("[data-u1]"), ai = $("[data-ai]"), chat = $("[data-chat]"), msim = $(".m-sim");
  var marks = $$("[data-m]"), found = $$("[data-f]"), tasks = $$("[data-t]"), slots = $$("[data-s]"), bks = $$("[data-b]");
  var pop = $("[data-pop]"), popT = $("[data-popt]"), popO = $("[data-popo]"), cursor = $("[data-cursor]");
  var card1 = $("[data-card1]"), card2 = $("[data-card2]"), stamp = $("[data-stamp]"), bfaux = $("[data-bfaux]");
  var next = $("[data-next]"), psay = $("[data-psay]"), prog = $("[data-prog]"), wtitle = $("[data-wtitle]");
  var gxs = $$("[data-gx]"), gbs = $$("[data-gb]"), qos = $$("[data-qo]");
  var genImg = $("[data-gen-img]"), genBar = $("[data-gen-bar]"), genCap = $("[data-gen-cap]"), hello = $("[data-hello]");
  var u2 = $("[data-u2]"), ai2 = $("[data-ai2]"), msim2 = $("[data-ai2] .m-sim"), gts = $$("[data-gt]");
  var u3 = $("[data-u3]"), ai3 = $("[data-ai3]"), msim3 = $("[data-ai3] .m-sim"), dts = $$("[data-dt]"), docLines = $$("[data-doc-page] .dl"), docMeta = $("[data-doc-meta]"), docDl = $("[data-doc-dl]");
  var DOC = u3.textContent.replace(/\u00a0/g, " ");
  var GEN = u2.textContent.replace(/\u00a0/g, " ");
  var stItems = $$("[data-st]"), tags = {}; $$("[data-tag]").forEach(function (t) { tags[t.dataset.tag] = t; });
  var TYPED = "Écris une offre d’emploi pour un poste d’assistant administratif.";
  var SLOTS = [
    ["Cible", ["des candidats débutants", "des experts en finance", "tout le monde"]],
    ["Contexte", ["CDI 35 h à Lyon 7e, prise de poste le 3 mars", "à Paris, 3 500 € par mois", "aucun"]]
  ];
  // deux cases, chacune avec du temps : ouverture, choix, validation
  var IMGK = 2, DOCK = 3;
  var SLOT_AT = function (i) { return .14 + i * .4; }, SLOT_LEN = .34, OPT_AT = .16, SET_AT = .26;
  var STEP_IDS = ["open", "write", "inter", "images", "docs", "end"];
  function setClass(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
  function show(name) { Object.keys(views).forEach(function (k) { setClass(views[k], "on", k === name); }); }

  var clicks = {};
  function clickAt(id, now) { if (now && !clicks[id]) { clicks[id] = 1; cursor.classList.remove("click"); void cursor.offsetWidth; cursor.classList.add("click"); } if (!now) clicks[id] = 0; }

  /* ---------- un dégradé de fond, d'une couleur différente à chaque partie ---------- */
  var tints = $$(".tint i"), tintCur = -1, inStory = true;
  function tintTo(k) { if (k === tintCur) return; tintCur = k; tints.forEach(function (t, i) { setClass(t, "on", i === k); }); }
  var tintSecs = $$("[data-tint]");
  window.addEventListener("scroll", function () {
    var r = story.getBoundingClientRect(); inStory = r.bottom > innerHeight * .5;
    if (!inStory) tintTo(0);                                  // après la démonstration : fond uni
  }, { passive: true });

  /* =====================================================================
     Rendu d'un instant
     ===================================================================== */
  var orbPos = { x: new Spring(0, 120, 20), y: new Spring(0, 120, 20), s: new Spring(.6, 120, 18) }, orbInit = false;
  var shaderI = new Spring(1, 60, 15);
  function render(dt, time) {
    var vw = stage.clientWidth, vh = stage.clientHeight, ch = current();
    setClass(nav, "is-solid", window.scrollY > 10);
    var tF = L("film"), tD = L("dive"), tS = L("sphere"), tO = L("open");
    // vidéo claire : la barre du haut, en verre, sur la vidéo ; son texte passe en blanc quand le haut de l'image est foncé
    setClass(nav, "over-film", !!VID.light && inStory);         // vidéo claire : le menu en verre sur la vidéo puis sur le désert flou
    setClass(nav, "on-dark", VID.light ? tF < .09 || (U < START.dive ? film.lum() < .5 : inStory) : U < START.dive + LEN.dive * .6);   // sur le désert flou : texte blanc

    /* --- 1. le hero sur la première image, puis la vidéo défile --- */
    var heroOut = ease(seg(tF, .03, .1));
    hero.style.opacity = String(1 - heroOut);
    hero.style.transform = "translateY(" + (-70 * heroOut) + "px) scale(" + (1 - .05 * heroOut) + ")";
    hero.style.visibility = heroOut >= 1 ? "hidden" : "visible";
    hint.style.opacity = String(1 - seg(tF, 0, .04));
    // le dégradé du hero s'efface pour lancer la vidéo
    var au = ease(seg(tF, .015, .1));
    filmAurora.style.opacity = String(1 - au);
    filmAurora.style.transform = "scale(" + (1 + .12 * au) + ")";
    filmAurora.style.visibility = au >= 1 ? "hidden" : "visible";
    film.draw(film.frameAt(tF));
    filmShade.style.opacity = String(1 - .7 * seg(tF, .08, .16) - .3 * seg(tD, 0, .4));
    var anyMsg = false;
    msgs.forEach(function (m, i) {                            // chaque message traverse l'écran pendant sa fenêtre
      var w = MSG[i], on = U < START.dive + .3 && tF >= w[0] && tF < w[1], t = seg(tF, w[0], w[1]);
      setClass(m, "on", on); if (on) anyMsg = true;
      m.style.transform = "translateY(" + ((.5 - t) * vh * (VID.drift || .28)).toFixed(1) + "px)";   // vidéo claire : presque immobile, plus facile à lire
    });
    setClass(filmDim, "on", anyMsg);
    if (VID.msgs) {                                           // vidéo claire : le voile, du côté du message affiché
      var side = ""; msgs.forEach(function (m, i) { if (m.classList.contains("on") && VID.msgs[i]) side = VID.msgs[i][3]; });
      if (side) { setClass(filmDim, "side-l", side === "l"); setClass(filmDim, "side-r", side === "r"); }
    }

    /* --- 2. la plongée dans l'écran : la sphère de la vidéo grossit jusqu'à la taille de la nôtre --- */
    var R = Math.min(vw, vh) * .27, cx0 = vw / 2, cy0 = vh * .4;
    var fc = film.cover(), sx = fc.x + film.SPHERE.x * 1280 * fc.s, sy = fc.y + film.SPHERE.y * 720 * fc.s, r0 = film.SPHERE.r * 1280 * fc.s;
    if (VID.light) {                                          // vidéo claire : pas de plongée ; le désert s'efface sur le fond violet clair
      film.el.style.transform = "none";
      filmFlash.style.opacity = "0";
      film.el.style.opacity = String(1 - ease(seg(tD, .35, 1)));   // l'interface commence à se dessiner dans le désert, qui se floute
      film.blur(ease(seg(U, START.dive + LEN.dive * .05, START.dive + LEN.dive * .7)));
      film.aurora(ease(seg(U, START.dive + LEN.dive * .55, START.sphere + LEN.sphere * .35)));   // le désert flou laisse place au fond du premier écran
      film.el.style.visibility = tD >= 1 ? "hidden" : "visible";
    } else {
      var kEnd = Math.max(1, R * 1.05 / r0), z = ease(seg(tD, 0, .78)), k = Math.pow(kEnd, z);
      film.el.style.transformOrigin = sx + "px " + sy + "px";
      film.el.style.transform = "translate(" + ((cx0 - sx) * z) + "px," + ((cy0 - sy) * z) + "px) scale(" + k + ")";
      filmFlash.style.opacity = String(seg(tD, .45, .78));
      film.el.style.opacity = String(1 - seg(tD, .78, .96));
      film.el.style.visibility = tD >= .97 ? "hidden" : "visible";
    }

    /* --- 3. notre sphère prend le relais, tourne, éclate --- */
    var burst = ease(seg(tS, .3, .56));
    var rot = time * .25 + U * 1.6;
    sphere.draw(cx0, cy0, R, 1, burst, rot, 0);                // plus de sphère : on entre directement dans l'assistant

    /* --- 3. l'orbe naît de l'éclatement, puis entre dans l'écran --- */
    appear.t = tD > (VID.light ? .2 : .72) ? 1 : 0;           // l'orbe surgit de l'écran blanc (vidéo claire : au centre du dessin)
    var a = appear.step(dt);
    var DR = drawRect(vw, vh);
    var p1 = VID.light ? { x: DR.x + DR.w / 2, y: DR.y + DR.h * .4, s: Math.min(1, DR.h * .3 / ORB) } : { x: vw / 2, y: vh * .4, s: Math.min(1, vw / 520) };
    var slotC = centerOf(slotWin), p2 = { x: slotC.x, y: slotC.y, s: (150 * cam.s.v) / ORB };
    var tIn = VID.light ? ease(seg(tO, .55, .8)) : ease(seg(tO, .3, .75));   // vidéo claire : l'interface s'installe (.2 → .55), puis l'orbe y entre
    var tx = lerp(p1.x, p2.x, tIn), ty = lerp(p1.y, p2.y, tIn), ts = lerp(p1.s, p2.s, tIn);
    if (!orbInit) { orbPos.x.v = tx; orbPos.y.v = ty; orbPos.s.v = ts; orbInit = true; }
    orbPos.x.t = tx; orbPos.y.t = ty; orbPos.s.t = ts;
    var ox = orbPos.x.step(dt), oy = orbPos.y.step(dt), os = orbPos.s.step(dt);
    if (tIn > .9) { ox = tx; oy = ty; os = ts; }
    var handOff = VID.light ? seg(tO, .84, .92) : seg(tO, .74, .82);   // l'orbe de la scène cède la place à celle du module (vidéo claire : en fondu, une fois celle-ci apparue)
    orbEl.style.transform = "translate(" + (ox - ORB / 2) + "px," + (oy - ORB / 2) + "px) scale(" + Math.max(.001, os * a) + ")";
    orbEl.style.opacity = String(1 - handOff);
    orbEl.style.visibility = handOff >= 1 || a < .002 ? "hidden" : "visible";
    if (orb) orb.setState(tD > (VID.light ? .5 : .85) && tO < .9 ? "speaking" : "idle");

    /* --- sa phrase --- */
    say.style.top = (VID.light ? p1.y + ORB * p1.s / 2 + 18 : vh * .4 + Math.min(150, vh * .17) * (vw < 600 ? .8 : 1)) + "px";
    say.style.opacity = String((VID.light ? seg(tD, .75, 1) : seg(tD, .85, 1)) * (1 - seg(tO, .05, .25)));
    reveal(sayW, seg(tS, .02, .9));

    /* --- le fond --- */
    shaderI.t = ch === "film" ? 1 : ch === "sphere" ? 1.15 : window.scrollY > story.offsetTop + story.offsetHeight - innerHeight ? .45 : .65;
    shader.draw(time, shaderI.step(dt), ch === "sphere" ? 1 : .4, mouse.x < -999 ? innerWidth / 2 : mouse.x, mouse.y < -999 ? innerHeight / 2 : mouse.y);

    /* --- l'écran --- */
    var fIn = ease(seg(tO, VID.light ? .08 : 0, .5));
    frame.style.opacity = String(fIn);
    if (VID.light) {
      var mv = 1 - ease(seg(tO, .2, .55));                     // l'écran glisse à sa place, puis les étapes apparaissent à gauche
      frame.style.transformOrigin = "0 0";
      frame.style.transform = "translate(" + ((DR.x - F.x) * mv).toFixed(1) + "px," + ((DR.y - F.y) * mv).toFixed(1) + "px) scale(" + (1 + (DR.k - 1) * mv).toFixed(4) + ")";
    } else frame.style.transform = "translateY(" + (40 * (1 - fIn)) + "px) scale(" + (.94 + .06 * fIn) + ")";
    frame.style.visibility = fIn <= 0 ? "hidden" : "visible";
    fwS.t = F.w;
    if (!fwInit) { fwS.v = fwS.t; fwInit = true; }
    var fw = fwS.step(dt);
    frame.style.width = fw + "px"; frame.style.left = (F.x + (F.w - fw) / 2) + "px";
    var c = camFor(camName(ch), fw, F.h);
    if (!camInit) { cam.x.v = c.x; cam.y.v = c.y; cam.s.v = c.s; camInit = true; }
    cam.x.t = c.x; cam.y.t = c.y; cam.s.t = c.s;
    var cx = cam.x.step(dt), cy = cam.y.step(dt), cs = cam.s.step(dt);
    win.style.transform = "translate(" + cx + "px," + cy + "px) scale(" + cs + ")";
    // l'interface au trait : elle se dessine pendant la phrase de l'orbe, puis s'efface quand l'écran apparaît par-dessus
    if (uiLines) uiLines.update(seg(U, START.dive + LEN.dive * .05, START.sphere + LEN.sphere * .9), (U >= START.dive ? 1 : 0) * (1 - seg(tO, .25, .55)), fw, F.h, 1 - seg(tO, 0, .16), 0);   // sur le désert flou : des traits blancs

    /* --- les étapes, à gauche --- */
    var mp = L("more") * 6.5, si = ch === "open" ? 0 : ch === "write" ? 1 : ch === "more" ? (mp < 2 ? 2 : mp < 4.2 ? 3 : 4) : ch === "end" ? 5 : -1;
    if (inStory) tintTo(si >= 0 ? [1, 2, 3, 4, 5, 6][si] : 0);
    setClass(steps, "on", si >= 0 && (si > 0 || tO > (VID.light ? .5 : .35)));
    stItems.forEach(function (el, i) { setClass(el, "on", i === si); setClass(el, "done", i < si); });
    if (si >= 0 && !stacked) {                                // la ligne relie les pastilles, et se remplit jusqu'à l'étape active
      var sr0 = steps.getBoundingClientRect(), cy0 = function (el) { var r = el.querySelector(".st-n").getBoundingClientRect(); return r.top + r.height / 2 - sr0.top; };
      var top0 = cy0(stItems[0]), bot0 = cy0(stItems[stItems.length - 1]);
      stLine.parentNode.style.top = top0 + "px"; stLine.parentNode.style.bottom = "auto"; stLine.parentNode.style.height = (bot0 - top0) + "px";
      stLine.style.height = Math.max(0, cy0(stItems[si]) - top0) + "px";
    }

    /* =========== le module, geste par geste =========== */
    var tw = L("write"), tsp = L("spot"), tb = L("build"), tm = L("more");
    // cinq gestes ; l'image et le document ont plus de temps
    var GW = [1, 1, 2.2, 2.3], gsum = 6.5, gk = -1, gu = 0;
    if (U >= START.more) { var acc = 0, pos = tm * gsum; for (var gi = 0; gi < GW.length; gi++) { if (pos < acc + GW[gi] || gi === GW.length - 1) { gk = gi; gu = clamp((pos - acc) / GW[gi], 0, 1); break; } acc += GW[gi]; } }
    var tsw = gk < 0 ? 0 : gk > 0 ? 1 : gu;
    var inBuild = U >= START.build;
    show(U < START.spot ? "vague" : U < START.build ? "hunt" : U < START.more ? "build" : "more");
    var sent = tw >= .62 && !inBuild;
    // les orbes du module
    setClass(slotWin, "on", (tO >= .8 && !sent && !inBuild) || (inBuild && tb > .06 && U < START.more));
    setClass(slotMini, "on", sent || U >= START.more);
    if (orbIn) orbIn.setState(U >= START.write && tw > .12 && tw < .62 ? "listening" : "speaking");
    // ÉTAPE 1 · écrire
    if (!inBuild) { setWsay("Sophie vous demande une offre d’emploi."); reveal(wsayW, seg(tO, .78, 1)); }
    else { setWsay(VID.light ? "Complétez chaque case violette." : "Complétez chaque case orange."); reveal(wsayW, seg(tb, .06, .14)); }
    wsay.style.opacity = String(U >= START.more ? 0 : inBuild ? 1 : 1 - seg(tw, .6, .64));
    setClass(comp, "on", (tw >= .1 && !sent && !inBuild) || (inBuild && U < START.more));
    var inMore = U >= START.more;
    setClass(comp, "is-tpl", inBuild && !inMore);
    comp.style.opacity = "1";
    var typed = seg(tw, .14, .5);
    if (!inBuild) {
      if (tw < .1 || sent) { if (!inp.querySelector(".ph")) inp.innerHTML = '<span class="ph">Le champ s’activera quand ce sera à vous d’écrire.</span>'; }
      else inp.innerHTML = TYPED.slice(0, Math.round(TYPED.length * typed)) + '<span class="caret"></span>';
    }
    setClass(send, "on", typed >= 1 && !sent && !inBuild);
    setClass(send, "press", tw >= .6 && tw < .64);
    var keepChat = U >= START.more && gk >= 0 && gk <= 1;   // carte et QCM : la réponse de l'IA reste à gauche
    setClass(u1, "on", sent || keepChat);
    setClass(ai, "on", (tw >= .68 && !inBuild) || keepChat);
    reveal(aiWords, keepChat ? 1 : seg(tw, .68, .92));
    msim.style.opacity = tw >= .93 || keepChat ? "1" : "0";
    chat.style.opacity = keepChat ? "1" : String(1 - seg(tb, 0, .06));
    var wt = sent ? TYPED : "Nouvelle conversation"; if (wtitle.textContent !== wt) wtitle.textContent = wt;
    setClass(tasks[0], "cur", !sent && !inBuild && U < START.spot); setClass(tasks[0], "done", sent || U >= START.spot);
    setClass(tasks[1], "cur", sent && tw < .93); setClass(tasks[1], "done", tw >= .93);
    tasks.forEach(function (t, i) { var h = t.classList.contains("done") ? '<svg><use href="#i-check"/></svg>' : String(i + 1); if (t.firstChild.innerHTML !== h) t.firstChild.innerHTML = h; });
    setClass($('[data-fb="vague"]'), "on", tw >= .94);
    // ÉTAPE 2 · repérer
    marks.forEach(function (m, i) { var on = tsp >= .25 + i * .18 && !inBuild; setClass(m, "on", on || (keepChat && gk === 1 && i === 1)); setClass(found[i], "on", on); clickAt("m" + i, on); });
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
    gxs.forEach(function (g) { setClass(g, "on", +g.dataset.gx === Math.max(0, gk)); });
    gbs.forEach(function (g) { setClass(g, "cur", +g.dataset.gb === gk); });
    // QCM
    var q = gk === 1 ? gu : gk > 1 ? 1 : 0;
    qos.forEach(function (o, i) { setClass(o, "sel", i === 1 && q >= .4 && q < .62); setClass(o, "ok", i === 1 && q >= .62); });
    setClass($('[data-fb="qcm"]'), "on", q >= .66);
    clickAt("qcm", gk === 1 && q >= .4);
    // image et document : la consigne à droite, la demande et le résultat à gauche, dans la conversation
    var conv = gk === IMGK || gk === DOCK, g = conv ? gu : 0, TXT = gk === DOCK ? DOC : GEN;
    var typedC = seg(g, .04, .26), sentC = conv && g >= .32;
    if (inMore) {
      if (!conv || typedC <= 0 || sentC) { if (inp.textContent !== "Écrire à l’IA…") inp.innerHTML = '<span class="ph">Écrire à l’IA…</span>'; }
      else inp.innerHTML = TXT.slice(0, Math.round(TXT.length * typedC)) + '<span class="caret"></span>';
      setClass(comp, "on", conv && !sentC);
      setClass(send, "on", conv && typedC >= 1 && !sentC);
      setClass(send, "press", conv && g >= .29 && g < .33);
      clickAt("send" + gk, conv && g >= .3);
      setClass(slotWin, "on", conv && !sentC);
      setClass(slotMini, "on", !conv || sentC);
      var wt2 = !conv ? TYPED : sentC ? TXT : "Nouvelle conversation"; if (wtitle.textContent !== wt2) wtitle.textContent = wt2;
    }
    setClass(hello, "on", inMore && conv && g < .3);
    // l'image
    var gI = gk === IMGK ? gu : 0;
    setClass(u2, "on", gk === IMGK && sentC);
    setClass(ai2, "on", gk === IMGK && gI >= .36);
    var gr = seg(gI, .4, .88);
    genImg.style.opacity = String(seg(gI, .4, .46));
    genImg.style.filter = "blur(" + (24 * (1 - ease(gr))).toFixed(1) + "px) saturate(" + (.35 + .65 * gr).toFixed(2) + ")";
    genBar.style.width = (100 * gr) + "%";
    genBar.parentNode.style.opacity = gr >= 1 || gI < .4 ? "0" : "1";
    genCap.textContent = gr >= 1 ? "" : gI >= .4 ? "Génération… " + Math.round(gr * 100) + " %" : "";
    msim2.style.opacity = gr >= 1 ? "1" : "0";
    setClass(gts[0], "cur", gk === IMGK && !sentC); setClass(gts[0], "done", gk === IMGK && sentC);
    setClass(gts[1], "cur", gk === IMGK && sentC && gr < 1); setClass(gts[1], "done", gr >= 1);
    setClass($('[data-fb="gen"]'), "on", gr >= 1);
    // le document Word
    var gD = gk === DOCK ? gu : 0, dr = seg(gD, .4, .82);
    setClass(u3, "on", gk === DOCK && sentC);
    setClass(ai3, "on", gk === DOCK && gD >= .36);
    var nl = Math.round(docLines.length * dr);
    docLines.forEach(function (l, i) { setClass(l, "on", i < nl); });
    var meta = dr >= 1 ? "Document Word · 1 page · 18 Ko" : gD >= .4 ? "Rédaction du document… " + Math.round(dr * 100) + " %" : "Génération du document…";
    if (docMeta.textContent !== meta) docMeta.textContent = meta;
    setClass(docDl, "on", dr >= 1); setClass(docDl, "press", gD >= .9 && gD < .95); clickAt("dl", gk === DOCK && gD >= .9);
    msim3.style.opacity = dr >= 1 ? "1" : "0";
    setClass(dts[0], "cur", gk === DOCK && !sentC); setClass(dts[0], "done", gk === DOCK && sentC);
    setClass(dts[1], "cur", gk === DOCK && sentC && dr < 1); setClass(dts[1], "done", dr >= 1);
    setClass($('[data-fb="doc"]'), "on", dr >= 1);
    gts.concat(dts).forEach(function (t, i) { var h = t.classList.contains("done") ? '<svg><use href="#i-check"/></svg>' : String(t.dataset.gt != null ? +t.dataset.gt + 1 : +t.dataset.dt + 1); if (t.firstChild.innerHTML !== h) t.firstChild.innerHTML = h; });
    // la carte à glisser
    var swp = ease(seg(tsw, .4, .75));
    card1.style.transform = "translateX(" + (-640 * swp) + "px) rotate(" + (-22 * swp) + "deg)";
    card1.style.opacity = String(1 - seg(tsw, .65, .8));
    stamp.style.opacity = String(seg(tsw, .22, .36));
    stamp.style.transform = "rotate(12deg) scale(" + (1.6 - .6 * ease(seg(tsw, .22, .36))) + ")";
    card2.style.transform = "scale(" + (.94 + .06 * swp) + ") translateY(" + (14 * (1 - swp)) + "px)";
    setClass(bfaux, "press", tsw >= .3 && tsw < .75); clickAt("faux", tsw >= .3);
    // pied du panneau
    var ps = U < START.spot ? (sent ? "Lisez la réponse de l’IA." : "Envoyez-la, et regardez le résultat.") : U < START.build ? "Trouvez les trois inventions." : U < START.more ? (VID.light ? "Complétez les cases violettes." : "Complétez les cases orange.") : ["Glissez la carte.", "Choisissez la bonne réponse.", "Générez l’image.", "Demandez le document."][Math.max(0, gk)];
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
      if ((gk === IMGK || gk === DOCK) && gu >= .2 && gu < .36) { var sb = inWin(send); return mv({ x: sb.x - 180, y: sb.y - 100 }, sb, seg(gu, .2, .29)); }
      if (gk === DOCK && gu >= .84 && gu < .99) { var db = inWin(docDl); return mv({ x: db.x - 160, y: db.y + 120 }, db, seg(gu, .84, .9)); }
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


  /* =====================================================================
     Sections : apparitions en cascade
     ===================================================================== */
  $$("[data-reveal]").forEach(function (sec) { Array.prototype.forEach.call(sec.children, function (c, i) { c.style.setProperty("--i", i); }); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 });
    $$("[data-reveal]").forEach(function (s) { io.observe(s); });
  } else $$("[data-reveal]").forEach(function (s) { s.classList.add("in"); });

  /* =====================================================================
     La fin (vidéo claire) : l'interface de la démonstration, figée dans son état final (le document produit),
     grande, qui monte doucement et se fond dans des nuages blancs ; copiée une fois, quand on approche de la fin
     ===================================================================== */
  /* le coach, au-dessus du dernier titre : déjà là, il regarde droit devant, avec de temps en temps un petit coup d'œil à gauche ou à droite */
  var finCoach = $("[data-fin-coach]");
  if (finCoach) onCoach(function () {
    var m = mascot(finCoach, 132, "idle"), host = m.coach.host;
    function center() { var r = host.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    m.coach.lookAt(center);                                     // son propre centre : le regard droit devant
    (function glance() {
      setTimeout(function () { var c = center(); m.coach.glance({ x: c.x + (Math.random() < .5 ? -1 : 1) * 420, y: c.y }, 650); glance(); }, 3200 + Math.random() * 3000);
    })();
  });

  (function finStage() {
    var stageEl = $("[data-fin]"), shot = $("[data-fin-shot]"), mist = stageEl && stageEl.querySelector(".fin-mist"), copy = null;
    if (!stageEl || !shot || !VID.light) return;
    function fit() { if (copy) copy.style.transform = "scale(" + (shot.clientWidth / 1440).toFixed(4) + ")"; }
    function fill() {
      if (copy) return;
      copy = win.cloneNode(true);
      copy.removeAttribute("style");
      [copy].concat($$("*", copy)).forEach(function (el) {                // une copie inerte : plus d'identifiants ni de repères pour le récit
        el.removeAttribute("id");
        Array.prototype.slice.call(el.attributes).forEach(function (at) { if (at.name.indexOf("data-") === 0) el.removeAttribute(at.name); });
      });
      $$(".coach", copy).forEach(function (c) { c.remove(); });          // les mascottes ne se copient pas : on recrée la petite
      $$("canvas", copy).forEach(function (c) { c.remove(); });
      shot.appendChild(copy);
      var mini = copy.querySelector(".w-mini");
      if (mini) onCoach(function () { mascot(mini, 44, "idle"); });
      fit();
    }
    if ("IntersectionObserver" in window) {
      var ob = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { ob.disconnect(); setTimeout(fill, 250); } }, { rootMargin: "900px 0px" });
      ob.observe(stageEl);
    } else setTimeout(fill, 1500);
    window.addEventListener("resize", fit);
    // en arrivant : l'interface monte, les nuages remontent un peu plus vite
    var raf = 0;
    function onScroll() {
      raf = 0;
      var r = stageEl.getBoundingClientRect(), p = clamp((innerHeight - r.top) / (innerHeight * .9), 0, 1), e = ease(p);
      shot.style.setProperty("--rise", ((1 - e) * 80).toFixed(1) + "px");
      if (mist) mist.style.setProperty("--mist", ((1 - e) * 50).toFixed(1) + "px");
    }
    window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
    onScroll();
  })();

  /* ---------- liste des modules ---------- */
  var PARCOURS = [   // [étape, modules, photo Unsplash, texte alternatif, photographe, compte]
    ["Démarrer", [["Première rencontre", "Découvrir l’IA, écrire un premier prompt."]], "photo-1544717302-de2939b7ef71", "Une personne découvre un outil sur son ordinateur portable", "Icons8 Team", "icons8"],
    ["Rédiger des prompts", [["La structure d’un prompt", "Rôle, cible, objectif, contexte, format."], ["Des prompts pour les images", "Décrire un visuel pour un post ou un rapport."]], "photo-1758876021859-bd2371d8f0a2", "Une femme travaille sur son ordinateur portable dans un bureau moderne", "Vitaly Gariev", "silverkblack"],
    ["Améliorer les contenus", [["Dialoguer pour affiner", "Enrichir le contexte, corriger sans recommencer."], ["Optimiser un contenu existant", "Réécrire selon un ton, un format, une contrainte."]], "photo-1609270460854-e8ea8c0b591f", "Deux collègues relisent ensemble un écran d’ordinateur", "Ilyuza Mingazova", "ilyuza"],
    ["Protéger les données", [["Ce qu’on ne partage pas", "Repérer les données sensibles, anonymiser."]], "photo-1633265486064-086b219458ec", "Un cadenas posé sur un clavier", "Towfiqu barbhuiya", "towfiqu999999"],
    ["Des contenus pour tous", [["Écrire pour tous", "Un texte clair pour un handicap cognitif."], ["Images, audio, vidéo accessibles", "Texte alternatif, transcription, sous-titres.", 1]], "photo-1730343464372-77500ccd307a", "Une femme travaille sur son ordinateur portable, un casque audio sur les oreilles", "Julio Lopez", "juliolopez"],
    ["Le cadre légal", [["RGPD et IA Act : l’essentiel", "Les règles utiles au poste de travail.", 1], ["Biais et risques", "Analyser un cas, proposer des corrections."], ["Tenir sa veille réglementaire", "Sources officielles, textes à jour.", 1]], "photo-1573164574511-73c773193279", "Une réunion d’équipe dans une salle de conseil", "Christina M", "wocintechchat"],
    ["Intégrer l’IA à son poste", [["Cartographier son poste", "Repérer les tâches que l’IA peut optimiser."], ["Choisir ses outils", "Comparer les outils, estimer un budget.", 1], ["Son plan d’intégration", "Rédiger la stratégie, sans oublier le handicap."]], "photo-1503551723145-6c040742065b-v2", "Un mur couvert de notes adhésives colorées", "Patrick Perkins", "patrickperkins"]
  ];
  var mods = $("[data-mods]"), n = 0, READY = { 1: 1, 2: 1 }, UTM = "?utm_source=atelier_ia&utm_medium=referral";
  if (mods) PARCOURS.forEach(function (part, pi) {
    var el = document.createElement("section"); el.className = "pc";
    el.innerHTML = '<figure class="pc-ph"><img loading="lazy" decoding="async" width="800" height="450"><figcaption>Photo&nbsp;: <a target="_blank" rel="noopener"></a>, <a target="_blank" rel="noopener">Unsplash</a></figcaption></figure>' +
      '<div class="pc-b"><p class="pc-k"></p><h3></h3><ol></ol></div>';
    var img = el.querySelector("img"), links = el.querySelectorAll("figcaption a");
    img.src = "https://images.unsplash.com/" + part[2] + "?auto=format&fit=crop&w=800&h=450&q=70"; img.alt = part[3];
    links[0].textContent = part[4]; links[0].href = "https://unsplash.com/@" + part[5] + UTM; links[1].href = "https://unsplash.com/" + UTM;
    el.querySelector(".pc-k").textContent = "Étape " + (pi + 1) + " · " + part[1].length + (part[1].length > 1 ? " modules" : " module");
    el.querySelector("h3").textContent = part[0];
    part[1].forEach(function (m) {
      n++;
      var li = document.createElement("li"); li.className = "pm";
      li.innerHTML = '<span class="pm-n"></span><b></b><small></small>';
      li.querySelector(".pm-n").textContent = "Module " + n;
      li.querySelector("b").textContent = m[0];
      li.querySelector("small").textContent = m[1];
      if (READY[n]) { var d = document.createElement("span"); d.className = "pm-ok"; d.textContent = "Disponible"; li.appendChild(d); }
      el.querySelector("ol").appendChild(li);
    });
    mods.appendChild(el);
  });
  // en colonnes façon Pinterest : chaque carte va dans la colonne la plus courte, collée à la précédente
  var cards = $$(".pc"), twoCols = null;
  function masonry() {
    if (!mods) return;
    var two = innerWidth > 900;
    if (two === twoCols) return;
    twoCols = two; mods.innerHTML = "";
    if (!two) { cards.forEach(function (c) { mods.appendChild(c); }); return; }
    var cols = [0, 1].map(function () { var d = document.createElement("div"); d.className = "pc-col"; mods.appendChild(d); return d; });
    cards.forEach(function (c) { (cols[0].offsetHeight <= cols[1].offsetHeight + 64 ? cols[0] : cols[1]).appendChild(c); });   // + 64 : le décalage de la seconde colonne
  }
  masonry(); addEventListener("resize", masonry);
  if ("IntersectionObserver" in window) {                       // chaque étape apparaît en entrant à l'écran
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io2.unobserve(e.target); } }); }, { threshold: .2 });
    $$(".pc").forEach(function (p) { io2.observe(p); });
  } else $$(".pc").forEach(function (p) { p.classList.add("in"); });
})();
