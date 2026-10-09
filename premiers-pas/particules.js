/* Ouverture des écrans d'accueil : l'image se « génère » à partir de particules.
   Une petite boule de particules tourne sur elle-même (le temps que les images se chargent), explose en milliers
   de particules colorées, qui dérivent puis se posent une à une, du centre vers les bords, sur une trame de points
   aux couleurs de l'image ; la vraie image apparaît dessous et les particules s'effacent.
   WebGL : toute la trajectoire est calculée dans le shader à partir du temps.

   AccParticles({
     parent,                      élément où poser le canevas (position: relative)
     center: [x, y],              point de départ, en px dans parent
     area: { x, y, w, h },        la zone où l'image se forme, en px dans parent
     picture: Promise → { layers: [{ img, x, y, w, h }] }   l'image à former, en px dans parent
     gather                       délai (s) entre l'explosion et le moment où les particules se posent (0,38 par défaut)
     onBurst(), onReveal(), onEnd()   l'explosion part / la vraie image peut apparaître / l'animation est finie
   }) → { finish() } ou null (sans WebGL) */
(function () {
  "use strict";
  var VS = [
    "attribute vec3 aDir;attribute vec4 aSeed;attribute vec2 aTarget;attribute vec3 aCol;attribute vec3 aPal;attribute float aDot;",
    "uniform vec2 uRes,uC;uniform float uT,uB,uR,uDpr,uFade,uG;",
    "varying vec3 vCol;varying float vA,vSoft;",
    "void main(){",
    " float t=uT,sp=length(aDir),ty=aSeed.w;vec3 d=aDir/sp;",
    " float tb=max(0.,t-uB),burst=1.-exp(-tb*4.2),charge=smoothstep(0.,.5,t);",
    // la boule : petite, dense, qui tourne vite ; puis l'explosion, qui ralentit
    " float rad=mix(charge*(8.+22.*sp),uR*sp,burst);",
    " float a=.5*t+5.*min(t,uB)+5.*(1.-exp(-tb*4.2))/4.2+aSeed.z*.3;",
    " float ca=cos(a),sa=sin(a);vec3 p=vec3(d.x*ca-d.z*sa,d.y,d.x*sa+d.z*ca);",
    " p=vec3(p.x,p.y*.94-p.z*.34,p.y*.34+p.z*.94);",
    " float f=1./(1.-p.z*.35*burst);",
    " vec2 rel=vec2(p.x,-p.y)*rad*f;",
    // le nuage tourne en spirale : le centre plus vite que les bords, comme une galaxie
    " float va=.6*(1.-exp(-tb*1.6))/(.35+sp),cv=cos(va),sv=sin(va);",
    " vec2 fly=uC+vec2(rel.x*cv-rel.y*sv,rel.x*sv+rel.y*cv);",
    // dérive dans un champ de courants
    " vec2 q=fly*.004;float fa=sin(q.x*1.7+t*.9+aSeed.z*1.3)+cos(q.y*2.1-t*.7);",
    " fly+=vec2(cos(fa*2.),sin(fa*2.))*40.*burst;",
    // les particules qui ont une place dans l'image s'y posent, en arc, du centre vers les bords
    " float w=ty<.5?clamp((t-uB-uG-aSeed.x)/.75,0.,1.):0.;w=w*w*(3.-2.*w);",
    " vec2 dv=aTarget-fly;vec2 pos=mix(fly,aTarget,w)+vec2(-dv.y,dv.x)*sin(w*3.1416)*.36*(aSeed.z-.5);",
    // la poussière et l'onde de choc s'éteignent
    " float life=ty>1.5?1.-smoothstep(uB+.1,uB+.85,t):ty>.5?1.-smoothstep(uB+.5,uB+1.5,t):1.;",
    " float size=mix(aSeed.y*f,aDot,w)*(1.-uFade*.7);",
    " vA=life*(1.-uFade)*mix(mix(.45,1.,burst)*(.55+.45*clamp((f-.7)/.6,0.,1.)),1.,w)*smoothstep(0.,.25,t);",
    " vSoft=mix(clamp((f-1.)*1.1+.14,.12,.48),.1,w);",
    " vCol=mix(aPal,aCol,smoothstep(.5,1.,w));",
    " gl_Position=vec4(pos.x/uRes.x*2.-1.,1.-pos.y/uRes.y*2.,0.,1.);",
    " gl_PointSize=max(size,.6)*uDpr;}"
  ].join("\n");
  var FS = [
    "precision mediump float;varying vec3 vCol;varying float vA,vSoft;",
    "void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.5-vSoft,.5,d))*vA;",
    " if(a<.01)discard;gl_FragColor=vec4(vCol*a,a);}"
  ].join("\n");
  // couleurs de vol : corail, rose, magenta, lavande, orange, pêche ; de l'encre ; quelques accents bleus et dorés
  var PAL = [[.96, .39, .5], [.98, .42, .7], [.93, .43, .9], [.6, .5, .98], [.98, .55, .38], [.99, .7, .5]];
  function pal(r) {
    if (r < .22) return [.08, .08, .09];
    if (r < .27) return [.06, .46, .83];
    if (r < .31) return [.82, .64, .17];
    return PAL[Math.floor(Math.random() * PAL.length)];
  }
  function unit() {                                       // direction au hasard sur la sphère
    var z = Math.random() * 2 - 1, th = Math.random() * 6.2832, q = Math.sqrt(1 - z * z);
    return [Math.cos(th) * q, z, Math.sin(th) * q];
  }

  /* Le numéro du module, pendant l'explosion : chaque lettre apparaît en caractères ASCII qui défilent, puis se fixe,
     de gauche à droite, sur la bonne lettre ; à la sortie, les lettres repartent en ASCII et s'effacent.
     el : le texte, déjà en place. AccAscii(el, { hold: ms }) → durée totale (ms) */
  var CHARS = "!#$%&*+/0123456789<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^{|}~";
  var ACCENTS = ["#f0507a", "#d64fd6", "#8a6cf0", "#f28a4a", "#0f75d3"];
  window.AccAscii = function (el, opt) {
    opt = opt || {};
    var fs = parseFloat(getComputedStyle(el).fontSize), hold = opt.hold || 550;
    var text = el.textContent; el.textContent = "";
    // une case par lettre, à la largeur de la lettre finale : le mot ne bouge pas pendant que les caractères défilent
    var slots = Array.from(text).map(function (c) {
      var sp = document.createElement("span"); sp.className = "s"; sp.textContent = c === " " ? "\u00a0" : c; el.appendChild(sp);
      return { el: sp, c: c };
    });
    slots.forEach(function (o) {
      var w = o.el.getBoundingClientRect().width;
      o.el.style.width = w + "px"; o.el.style.height = o.el.style.lineHeight = fs + "px";
      o.size = Math.min(fs, w / .62) + "px";                      // le caractère ASCII tient dans la case
    });
    el.classList.add("is-go");
    var live = slots.filter(function (o) { return o.c.trim(); }), n = live.length;
    var LOCK0 = 300, STEP = 55, OUT = LOCK0 + STEP * (n - 1) + hold, END = OUT + 40 * n + 300, t0 = performance.now();
    function ascii(o) {
      o.el.classList.add("x"); o.el.style.fontSize = o.size;
      o.el.textContent = CHARS[Math.floor(Math.random() * CHARS.length)];
      o.el.style.color = Math.random() < .25 ? ACCENTS[Math.floor(Math.random() * ACCENTS.length)] : "";
    }
    function letter(o) { o.el.classList.remove("x"); o.el.style.fontSize = ""; o.el.style.color = ""; o.el.textContent = o.c; }
    var last = 0;
    function frame(now) {
      var t = now - t0;
      if (t > END) { el.remove(); return; }
      requestAnimationFrame(frame);
      if (now - last < 45) return;                                  // les caractères changent environ 22 fois par seconde
      last = now;
      live.forEach(function (o, i) {
        var on = i * 60, lock = LOCK0 + STEP * i, out = OUT + 40 * i;
        if (t < on) return;
        o.el.classList.add("on");
        if (t < lock || t > out) ascii(o); else letter(o);
        if (t > out + 200) o.el.classList.remove("on");
      });
    }
    requestAnimationFrame(frame);
    return END;
  };

  window.AccParticles = function (o) {
    var parent = o.parent, cv = document.createElement("canvas"), gl = null;
    cv.className = "acc-burst";
    cv.setAttribute("aria-hidden", "true");
    try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);

    var W = parent.clientWidth, H = parent.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    var small = W <= 720, C = o.center;
    // la trame de l'image, sur la partie visible du collage : un point tous les g px, en quinconce (14 000 points environ)
    var A = o.area, x0 = Math.max(0, A.x), y0 = Math.max(0, A.y), x1 = Math.min(W, A.x + A.w), y1 = Math.min(H, A.y + A.h);
    var g = Math.max(small ? 5 : 6, Math.min(9, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / (14000 * .866))));
    var grid = [];
    for (var y = y0 + g / 2, row = 0; y < y1; y += g * .866, row++) {
      for (var x = x0 + (row % 2 ? g : g / 2); x < x1; x += g) grid.push([x, y]);
    }
    var NT = grid.length, ND = Math.round(NT * .25) + 1500, NR = small ? 500 : 900, N = NT + ND + NR;
    var dir = new Float32Array(N * 3), seed = new Float32Array(N * 4), target = new Float32Array(N * 2);
    var col = new Float32Array(N * 3), pc = new Float32Array(N * 3), dot = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var u = unit(), ring = i >= NT + ND, s;
      if (ring) {                                         // l'onde de choc : un anneau, à plat
        var th = Math.random() * 6.2832;
        u = [Math.cos(th), (Math.random() - .5) * .06, Math.sin(th)]; s = 1.15 + Math.random() * .2;
      } else s = Math.random() < .75 ? .68 + .32 * Math.sqrt(Math.random()) : .15 + .5 * Math.random();   // surtout en surface : une sphère
      dir[i * 3] = u[0] * s; dir[i * 3 + 1] = u[1] * s; dir[i * 3 + 2] = u[2] * s;
      var c = ring ? (Math.random() < .5 ? [.08, .08, .09] : [.6, .5, .98]) : pal(Math.random());
      pc.set(c, i * 3); col.set(c, i * 3);
      seed[i * 4] = 0;
      seed[i * 4 + 1] = ring ? 1.1 + Math.random() * 1.1 : i >= NT ? 1.2 + Math.random() * 2 : 1.8 + Math.random() * 3.4;
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = ring ? 2 : 1;                     // tant que l'image n'est pas lue : de la poussière
    }
    function buf(data, name, n) {
      var b = gl.createBuffer(), loc = gl.getAttribLocation(pr, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
      return function () { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); };
    }
    buf(dir, "aDir", 3); buf(pc, "aPal", 3);
    var upSeed = buf(seed, "aSeed", 4), upTarget = buf(target, "aTarget", 2), upCol = buf(col, "aCol", 3), upDot = buf(dot, "aDot", 1);
    var U = {};
    ["uRes", "uC", "uT", "uB", "uR", "uDpr", "uFade", "uG"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uC, C[0], C[1]);
    gl.uniform1f(U.uR, Math.max(W, H) * .5); gl.uniform1f(U.uDpr, dpr);
    var G = o.gather || .38;                                // délai avant que les particules se posent (s)
    gl.uniform1f(U.uG, G);
    parent.appendChild(cv);

    // le halo de l'explosion
    var halo = document.createElement("div");
    halo.className = "acc-halo"; halo.style.left = C[0] + "px"; halo.style.top = C[1] + "px";
    parent.insertBefore(halo, cv);

    var t0 = performance.now(), B = 1e4, revealed = false, done = false, fadeAt = 1e4, raf = 0;
    // l'image lue : chaque point de la trame prend la couleur de l'image ; les blancs restent de la poussière
    o.picture.then(function (pic) {
      if (done) return;
      var k = .5, pw = Math.ceil(W * k), ph = Math.ceil(H * k), px = null;
      try {
        var off = document.createElement("canvas"), cc = off.getContext("2d");
        off.width = pw; off.height = ph;
        pic.layers.forEach(function (L) { cc.drawImage(L.img, L.x * k, L.y * k, L.w * k, L.h * k); });
        px = cc.getImageData(0, 0, pw, ph).data;
      } catch (e) { px = null; }
      var maxD = 0;
      grid.forEach(function (p) { maxD = Math.max(maxD, Math.hypot(p[0] - C[0], p[1] - C[1])); });
      for (var i = 0; i < NT; i++) {
        var p = grid[i], j = (Math.min(ph - 1, Math.floor(p[1] * k)) * pw + Math.min(pw - 1, Math.floor(p[0] * k))) * 4;
        if (!px || px[j + 3] < 160) continue;
        var r = px[j] / 255, gg = px[j + 1] / 255, b = px[j + 2] / 255, lum = .2126 * r + .7152 * gg + .0722 * b;
        if (lum > .9) continue;
        target[i * 2] = p[0]; target[i * 2 + 1] = p[1];
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
        dot[i] = g * (.42 + .62 * (1 - lum));               // trame : plus sombre, plus gros
        seed[i * 4] = .5 * Math.hypot(p[0] - C[0], p[1] - C[1]) / maxD + .1 * Math.random();
        seed[i * 4 + 3] = 0;
      }
      upSeed(); upTarget(); upCol(); upDot();
      B = Math.max(.55, (performance.now() - t0) / 1000 + .05);
      setTimeout(function () { halo.classList.add("is-out"); if (o.onBurst) o.onBurst(); }, Math.max(0, B * 1000 - (performance.now() - t0)));
      fadeAt = B + G + 1.37;
    });

    function frame(now) {
      if (done) return;
      raf = requestAnimationFrame(frame);
      var t = (now - t0) / 1000;
      if (!revealed && t > B + G + 1.07) { revealed = true; if (o.onReveal) o.onReveal(); }
      var fade = Math.min(1, Math.max(0, (t - fadeAt) / .65));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uT, t); gl.uniform1f(U.uB, B); gl.uniform1f(U.uFade, fade);
      gl.drawArrays(gl.POINTS, 0, N);
      if (fade >= 1) end();
    }
    function end() {
      if (done) return;
      done = true; cancelAnimationFrame(raf);
      if (!revealed && o.onReveal) o.onReveal();
      cv.remove(); halo.remove();
      var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
      if (o.onEnd) o.onEnd();
    }
    raf = requestAnimationFrame(frame);
    return { finish: end };
  };
})();
