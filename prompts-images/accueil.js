/* Écran d'accueil du module « Des prompts pour les images » :
   - cale le collage en bas à droite, à la plus grande taille qui laisse le texte
     dégagé à gauche (le nuage de points ne doit pas passer sous le titre) ;
   - le titre et le sous-titre s'écrivent mot à mot. */
(function () {
  "use strict";
  var root = document.documentElement, hero = document.querySelector("[data-hero]");
  // hauteur de la maquette ; les personnes (02.png, 1396 × 818) à 95 %, calées en bas à droite avec une marge
  var MOCK_H = 696, PEOPLE = .95, PW = 1396 * PEOPLE, PH = 818 * PEOPLE, MARGIN = .045;

  // fonds possibles : largeur, hauteur, abscisse où le collage commence en haut (il ne doit pas passer sous le texte),
  // fondu du bord quand le collage ne remplit pas la hauteur. ?fond=01 pour revenir au premier collage.
  var BGS = {
    "01": { src: "../assets/img/01.png", w: 1901, h: 900, clear: 805, low: 466, lowX: 385, fade: true },
    "03": { src: "../assets/img/03.png", w: 2039, h: 913, clear: 786, low: 563, lowX: 390, fade: false }
  };
  var key = (location.search.match(/fond=(\d+)/) || [])[1];
  var BG = BGS[key] || BGS["03"], W0 = BG.w, H0 = BG.h;
  document.body.classList.add("bg-" + (BGS[key] ? key : "03"));
  var back = document.querySelector("[data-back]");
  back.width = W0; back.height = H0; back.src = BG.src;

  // tout ce qui accompagne les personnes est placé par rapport à elles, quel que soit le fond
  var pl = (W0 * (1 - MARGIN) - PW) / W0 * 100, pt = (H0 - PH) / H0 * 100, pw = PW / W0 * 100, ph = PH / H0 * 100;
  function onPeople(fx, fy) { return [pl + fx * pw, pt + fy * ph]; }
  root.style.setProperty("--pw", pw.toFixed(3) + "%");
  root.style.setProperty("--bt", (BG.low / H0 * 100).toFixed(3));
  root.style.setProperty("--pr", (MARGIN * 100).toFixed(3) + "%");
  // le globe : centré derrière les personnes, rayon 0,55 × leur hauteur, cadre de 2,8 rayons
  var g = onPeople(.541, .438), gs = 2.8 * .55 * PH;
  root.style.setProperty("--gw", (gs / W0 * 100).toFixed(3) + "%");
  root.style.setProperty("--gh", (gs / H0 * 100).toFixed(3) + "%");
  root.style.setProperty("--gl", (g[0] - gs / W0 * 50).toFixed(3) + "%");
  root.style.setProperty("--gt", (g[1] - gs / H0 * 50).toFixed(3) + "%");

  var copy = document.querySelector(".copy"), goBtn = copy.querySelector(".go"), subEl = copy.querySelector(".sub");
  var ballRest = function () {};                     // replace la bille au bout du titre (définie plus bas)

  // notre orbe, dans le bouton « Commencer » : dessinée à 64 px puis mise à l'échelle de sa pastille
  var ORB = 64, orbBox = copy.querySelector(".go-orb"), orb = null;
  if (window.SiriOrb) { orb = window.SiriOrb(orbBox.firstElementChild, { size: ORB, label: "Assistant IA", state: "idle" }); }
  function orbFit() { orbBox.firstElementChild.style.transform = "scale(" + (orbBox.clientWidth / ORB).toFixed(4) + ")"; }
  function orbState(s) { if (orb) orb.setState(s); }
  function apply(s, W, H) {
    var top = H - H0 * s;
    root.style.setProperty("--s", s.toFixed(4));
    root.style.setProperty("--sw", (W0 * s).toFixed(1) + "px");
    root.style.setProperty("--sh", (H0 * s).toFixed(1) + "px");
    root.style.setProperty("--u", W <= 720 ? 1 : (s * H0 / MOCK_H).toFixed(4));
    root.style.setProperty("--top", top.toFixed(1) + "px");
    root.style.setProperty("--glow-top", (top + BG.low * s).toFixed(1) + "px");   // la lueur part du bas du ciel
    hero.classList.toggle("is-floating", BG.fade && top > 2);
  }
  // largeur réelle du bloc de texte (le plus large de ses éléments)
  function copyRight() {
    var r = 0;
    Array.prototype.forEach.call(copy.children, function (el) {
      var range = document.createRange(); range.selectNodeContents(el);
      r = Math.max(r, range.getBoundingClientRect().right);
    });
    return r;
  }
  function layout() {
    var W = window.innerWidth, H = hero.clientHeight || window.innerHeight, s;
    root.style.setProperty("--copy-y", "");
    goBtn.classList.remove("is-low");
    root.style.setProperty("--shift", "0px");
    if (W <= 720) {                                              // mobile : on garde la partie droite, avec les personnes
      s = W * 1.85 / W0; apply(s, W, H);
      root.style.setProperty("--bandl", (W - W0 * s).toFixed(1) + "px");
      orbFit(); ballRest(); return;
    }
    // le collage commence à x = clear : il doit rester à droite du texte, avec une marge
    s = Math.min(H / H0, (W * .94 - 40) / (W0 - BG.clear + 450));
    for (var k = 0; k < 3; k++) {
      apply(s, W, H);
      var room = W - copyRight() - Math.max(32, W * .025);      // place libre à droite du texte
      var need = (W0 - BG.clear) * s;                           // largeur du collage depuis son début
      if (need <= room) break;
      s = Math.min(H / H0, room / (W0 - BG.clear));
    }
    // le bouton se pose en bas à gauche (comme sur la maquette) s'il y a la place, sinon il suit le texte
    var u = s * H0 / MOCK_H, hb = hero.getBoundingClientRect();
    goBtn.classList.remove("is-low");
    var gb = goBtn.getBoundingClientRect(), cb = copy.getBoundingClientRect(), sb = subEl.getBoundingClientRect();
    var goY = hb.bottom - 66 * u - gb.height, goR = cb.left + gb.width;
    // le collage glisse vers la droite pour laisser respirer le bouton (dans la limite de la marge des personnes)
    var lowLeft0 = hb.left + (W - W0 * s) + BG.lowX * s;
    var shift = Math.min(Math.max(0, goR + Math.max(110, W * .07) - lowLeft0), (MARGIN + .025) * W0 * s);
    root.style.setProperty("--shift", shift.toFixed(1) + "px");
    root.style.setProperty("--bandl", (W + shift - W0 * s).toFixed(1) + "px");     // la bande part du bord gauche de l'écran
    var lowLeft = lowLeft0 + shift, lowTop = hb.top + (H - H0 * s) + BG.low * s;
    var low = goY > sb.bottom + 28;                              // le bouton se pose sur la bande du bas
    if (low) goBtn.classList.add("is-low");
    // le bloc (module, titre, description) est centré verticalement dans l'espace blanc,
    // entre le haut de l'écran et le haut de l'image du bas ; la réflexion, qui s'efface, ne compte pas
    var think = copy.querySelector("[data-think]"), tagR = copy.firstElementChild.getBoundingClientRect();
    var thinkH = think.classList.contains("is-gone") ? 0 : think.getBoundingClientRect().height + parseFloat(getComputedStyle(think).marginTop);
    var end = low ? sb.bottom : goBtn.getBoundingClientRect().bottom;
    var blockH = end - tagR.top - thinkH, zoneH = lowTop - hb.top;
    var y = Math.max(20, (zoneH - blockH) / 2);
    root.style.setProperty("--copy-y", y.toFixed(1) + "px");
    if (low) root.style.setProperty("--go-y", (goY - (hb.top + y)).toFixed(1) + "px");
    orbFit();
    ballRest();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  layout();
  window.addEventListener("resize", layout);

  // entrée : l'image se forme à partir de particules (../premiers-pas/particules.js), puis apparaît ;
  // sans WebGL ou avec moins d'animations, elle apparaît dès que les images sont prêtes
  var imgs = Array.prototype.slice.call(document.querySelectorAll(".stage img"));
  var decoded = Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : Promise.resolve(); }));
  function enter() { hero.classList.add("is-in"); }
  function plain() { decoded.then(function () { requestAnimationFrame(enter); }); setTimeout(enter, 1500); }
  function onIn(fn) {
    if (hero.classList.contains("is-in")) { fn(); return; }
    new MutationObserver(function (m, o) { if (hero.classList.contains("is-in")) { o.disconnect(); fn(); } }).observe(hero, { attributes: true, attributeFilter: ["class"] });
  }
  if ((window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || !window.AccParticles) plain();
  else (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    // une fois la mise en page définitive
    var hb = hero.getBoundingClientRect(), sr = document.querySelector("[data-stage]").getBoundingClientRect(), fr = document.querySelector(".front");
    var ox = sr.left - hb.left, oy = sr.top - hb.top;
    // l'explosion part du centre de l'écran ; pendant qu'elle s'étend, le numéro du module s'y affiche en grand
    var C = [window.innerWidth / 2 - hb.left, window.innerHeight / 2 - hb.top];
    var big = document.createElement("p");
    big.className = "acc-big"; big.setAttribute("aria-hidden", "true");
    big.textContent = copy.firstElementChild.textContent;
    big.style.left = C[0] + "px"; big.style.top = C[1] + "px";
    hero.appendChild(big);
    var intro = window.AccParticles({
      parent: hero,
      center: C,
      area: { x: ox, y: oy, w: sr.width, h: sr.height },
      picture: decoded.then(function () {
        return { layers: [{ img: back, x: ox, y: oy, w: sr.width, h: sr.height },
          { img: fr, x: ox + fr.offsetLeft, y: oy + fr.offsetTop, w: fr.offsetWidth, h: fr.offsetHeight }] };
      }),
      gather: 1.35,                                                  // les particules se posent une fois « Module » parti
      onBurst: function () { if (window.AccAscii) window.AccAscii(big, { hold: 520 }); else big.remove(); },
      onReveal: enter
    });
    if (!intro) { big.remove(); plain(); return; }
    hero.classList.add("is-gen");
    setTimeout(enter, 9000);
    window.addEventListener("resize", intro.finish, { once: true });
  });

  /* ---------- la lueur du bas ----------
     Comme le halo d'un assistant vocal : une lumière irisée qui monte du bord inférieur de l'écran, en rayons
     verticaux, plus haute par endroits, avec un liseré lumineux tout en bas. Couleurs qui glissent lentement
     (corail, rose, magenta, lavande, orange, pêche), en fondu vers le haut ; au premier plan, translucide,
     par-dessus l'image et les personnes ; seul le bouton « Commencer » passe devant.
     Sans WebGL : un dégradé CSS fixe. */
  (function () {
    var cv = document.querySelector("[data-band]"), layer = cv.parentNode, gl = null;
    try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) { cv.remove(); return; }
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var FS = [
      "precision mediump float;uniform vec2 uR;uniform float uT;",
      "float h1(float x){return fract(sin(x*127.1)*43758.5453);}",
      "float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h1(i),h1(i+1.),f);}",
      "float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}",
      // palette : corail, rose, magenta, lavande, orange, pêche
      "vec3 pal(float k){k=fract(k)*6.;",
      " vec3 c0=vec3(.86,.76,1.),c1=vec3(.95,.45,.92),c2=vec3(.98,.42,.7),c3=vec3(.96,.39,.5),c4=vec3(.98,.55,.38),c5=vec3(.99,.74,.55);",
      " if(k<1.)return mix(c0,c1,k);if(k<2.)return mix(c1,c2,k-1.);if(k<3.)return mix(c2,c3,k-2.);",
      " if(k<4.)return mix(c3,c4,k-3.);if(k<5.)return mix(c4,c5,k-4.);return mix(c5,c0,k-5.);}",
      "void main(){",
      " vec2 uv=gl_FragCoord.xy/uR;float a=uR.x/uR.y,t=uT,x=uv.x,y=uv.y;",
      // hauteur de la lueur : une bosse au centre qui respire, des ondulations
      " float bump=exp(-pow((x-.3-.12*sin(t*.37))/.16,2.))*(.75+.25*sin(t*1.1))+.8*exp(-pow((x-.8-.1*cos(t*.29))/.14,2.))*(.75+.25*sin(t*.9+2.));",
      " float H=.16+.3*bump+.07*n1(x*4.+t*.6);",
      // rayons verticaux
      " float rays=.62+.38*n2(vec2(x*a*4.+t*.2,y*1.6-t*.9));",        // les rayons montent
      " float I=exp(-y/H)*rays*smoothstep(1.,.55,y);",                // s'éteint tout à fait en haut
      // couleur : glisse le long du bas et avec le temps
      " vec3 col=pal(x*1.1-t*.07+.15*n1(x*3.+t*.4)+y*.3);",           // les couleurs défilent le long du bas
      // liseré lumineux tout en bas, qui suit la bosse
      " float edge=exp(-max(0.,y-.012*bump)*uR.y*.11);",
      " float k=.72;",                                                 // translucide : l'image reste visible dessous
      " vec3 c=(col*I+mix(col,vec3(1.),.4)*edge*.5)*k;",
      " float al=clamp(I*.95+edge*.45,0.,1.)*k;",
      " c+=(h2(gl_FragCoord.xy+fract(t*7.)*91.)-.5)*.04*al;",
      " gl_FragColor=vec4(min(c,vec3(al)),al);}"
    ].join("\n");
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { cv.remove(); return; }
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.remove(); return; }
    layer.classList.add("has-gl");                                   // le dégradé CSS de secours s'efface
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "uR"), uT = gl.getUniformLocation(pr, "uT"), t0 = performance.now();
    var dpr = .6, lastT = 0;                                        // lueur floue : une résolution réduite suffit
    function frame(now) {
      if (!still) requestAnimationFrame(frame);
      if (!still && now - lastT < 33) return;                       // 30 images par seconde au plus
      lastT = now;
      var w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, still ? 12 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
    if (still) window.addEventListener("resize", function () { requestAnimationFrame(frame); });
  })();

  /* ---------- le ciel en vidéo (fond 03) ----------
     after-loop.mp4 : la vidéo after.mp4 dont la fin se fond dans le début, pour boucler sans à-coup.
     Si l'apprenant demande moins d'animations, on garde l'image fixe. */
  (function () {
    var sky = document.querySelector("[data-sky]");
    if (BG !== BGS["03"] || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { sky.remove(); return; }
    sky.classList.add("is-on");
    // sources : WebM (VP9), puis MP4 (H.264) ; le navigateur prend la première qu'il sait lire
    sky.addEventListener("canplay", function () {
      var p = sky.play();
      if (p && p.then) p.then(function () { sky.classList.add("is-ready"); }).catch(function () {});
      else sky.classList.add("is-ready");
    }, { once: true });
    sky.load();
  })();

  /* ---------- le rectangle dégradé de l'image 03, animé ----------
     On découpe le rectangle dans l'image et on fait onduler ses couleurs (déformation lente et douce) :
     l'image reste la même, son dégradé bouge. Seulement avec le fond 03 et WebGL. */
  (function () {
    var cv = document.querySelector("[data-rectfx]");
    if (BG !== BGS["03"]) return;
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    var gl = null;
    try { gl = cv.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) return;
    var R = { x: 390, y: 563, w: 839, h: 350 };                    // le rectangle, en pixels de l'image
    var VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    var FS = [
      "precision mediump float;varying vec2 v;uniform sampler2D uTex;uniform float uT;uniform vec2 uR;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
      "void main(){",
      " vec2 uv=vec2(v.x,1.-v.y),q=uv*vec2(2.4,1.);float t=uT;",
      " vec2 w=vec2(n(q*1.6+vec2(t*.13,-t*.07)),n(q*1.6+vec2(5.2-t*.11,1.3+t*.09)))-.5;",
      " w+=.5*(vec2(n(q*3.4+vec2(-t*.2,t*.15)),n(q*3.4+vec2(2.7+t*.17,8.1-t*.12)))-.5);",
      " vec2 s=clamp(uv+w*vec2(.07,.16),vec2(.002),vec2(.998));",
      " vec3 c=texture2D(uTex,s).rgb;",
      " c+=(h(gl_FragCoord.xy+fract(t*5.)*71.)-.5)*.035;",                 // grain, comme l'image
      " gl_FragColor=vec4(c,1.);}"
    ].join("\n");
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uT = gl.getUniformLocation(pr, "uT"), t0 = performance.now(), lastT = 0;
    function begin() {
      // le rectangle, légèrement adouci pour que le grain d'origine ne « nage » pas
      var crop = document.createElement("canvas"), cc = crop.getContext("2d");
      crop.width = 420; crop.height = 175;
      if (typeof cc.filter === "string") cc.filter = "blur(1px)";
      cc.drawImage(back, R.x + 3, R.y + 3, R.w - 6, R.h - 6, -4, -4, crop.width + 8, crop.height + 8);
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, crop); } catch (e) { return; }
      cv.classList.add("is-on");
      requestAnimationFrame(frame);
      setTimeout(function () { cv.classList.add("is-shown"); }, 60);
    }
    function frame(now) {
      requestAnimationFrame(frame);
      if (now - lastT < 33) return;                                    // 30 images par seconde au plus
      lastT = now;
      var w = Math.round(cv.clientWidth * .75), h = Math.round(cv.clientHeight * .75);
      if (!w || !h) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // une fois l'entrée de l'image terminée
    var wait = function () { setTimeout(function () { (back.complete && back.naturalWidth ? Promise.resolve() : new Promise(function (r) { back.onload = r; })).then(begin); }, 1900); };
    if (hero.classList.contains("is-in")) wait();
    else new MutationObserver(function (m, o) { if (hero.classList.contains("is-in")) { o.disconnect(); wait(); } }).observe(hero, { attributes: true, attributeFilter: ["class"] });
  })();

  /* ---------- les particules, derrière les personnes ----------
     Un globe en trame de points (comme le nuage de points du collage) qui tourne lentement : points réguliers,
     plus gros à l'avant, une onde qui fait varier leur taille comme un ombrage en trame, quelques points
     d'accent bleus et orange. Dessinés en couleurs inversées : le calque est en mode « différence ». Il se dessine à l'ouverture, du haut vers le bas ; les points s'écartent sous la souris. */
  (function () {
    var cv = document.querySelector("[data-dots]"), ctx = cv.getContext("2d");
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var dpr = Math.min(2, window.devicePixelRatio || 1), N = 1900, pts = [];
    for (var i = 0; i < N; i++) {
      var y = 1 - 2 * (i + .5) / N, q = Math.sqrt(1 - y * y), th = i * 2.399963, rr = Math.random();
      pts.push({ x: Math.cos(th) * q, y: y, z: Math.sin(th) * q, lat: Math.asin(y), lon: th,
        c: rr < .06 ? "#d0a42c" : rr < .085 ? "#0f75d3" : "#ebebeb", ox: 0, oy: 0 });
    }
    var mx = -9999, my = -9999, rot = .5, t0 = performance.now(), last = t0;
    onIn(function () { t0 = performance.now(); });              // le globe se dessine quand l'image apparaît
    window.addEventListener("pointermove", function (e) { var b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; });
    document.addEventListener("pointerleave", function () { mx = my = -9999; });
    function frame(now) {
      requestAnimationFrame(frame);
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      var t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!still) rot += dt * .08;
      var R = w / 2.8, cx = w / 2, cy = h / 2, k = R / 450;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(.3), sT = Math.sin(.3);
      for (var n = 0; n < N; n++) {
        var p = pts[n];
        var x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * cT - z * sT; z = p.y * sT + z * cT;
        var f = 1 / (1 - z * .18), px = cx + x * R * f, py = cy + y * R * f;
        // apparition : une vague qui descend du haut du globe
        var g = still ? 1 : Math.min(1, Math.max(0, (t - .3 - (1 - p.y) * .55) / .5));
        if (g <= 0) continue;
        var dx = px + p.ox - mx, dy = py + p.oy - my, d = Math.sqrt(dx * dx + dy * dy);
        if (!still && d < 140 && d > .5) {                     // les points s'écartent en tournoyant sous la souris
          var m = 1 - d / 140;
          p.ox += (dx / d * 2.4 - dy / d * 1.6) * m * m * 5;
          p.oy += (dy / d * 2.4 + dx / d * 1.6) * m * m * 5;
        }
        p.ox *= .92; p.oy *= .92;
        var dep = (z + 1) / 2;
        // ombrage en trame : la taille ondule le long du globe
        var wave = still ? .7 : .55 + .45 * Math.sin(p.lat * 5 + p.lon * .5 - t * 1.1);
        var s = (1.1 + 3.6 * dep * dep) * (.45 + .55 * wave) * k * f * (g < 1 ? g : 1);
        if (s < .35) continue;
        ctx.globalAlpha = .12 + .78 * dep;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(px + p.ox, py + p.oy, s / 2 + .2, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- réflexion, puis le titre et la description s'écrivent lettre à lettre ----------
     Comme une réponse d'assistant : le texte s'écrit à la machine à écrire et une bille noire le suit,
     au bout du dernier caractère écrit, du titre jusqu'à la fin de la description ; puis elle s'efface. */
  (function () {
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var think = copy.querySelector("[data-think]"), label = think.querySelector(".think-l");
    var title = copy.querySelector(".title"), sub = copy.querySelector(".sub");
    // découpe : en mots (lignes de réflexion) ou en caractères (titre et description), retours à la ligne gardés
    function split(el, unit) {
      var parts = [];
      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        if (node.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        var bits = unit === "c" ? Array.from(node.textContent) : node.textContent.split(/(\s+)/);
        bits.forEach(function (bit) {
          if (!bit) return;
          if (unit !== "c" && /^\s+$/.test(bit)) { frag.appendChild(document.createTextNode(bit)); return; }
          var s = document.createElement("span"); s.className = unit === "c" ? "c" : "w"; s.textContent = bit;
          frag.appendChild(s); parts.push(s);
        });
        el.replaceChild(frag, node);
      });
      return parts;
    }
    var paras = Array.prototype.map.call(think.querySelectorAll(".think-b p"), function (p) { return split(p, "w"); });
    var tc = split(title, "c"), sc = split(sub, "c");
    copy.classList.add("is-split");                                   // avant : rien (sinon les textes bruts se superposent)
    function finish(sec) {
      think.classList.add("is-on", "is-done");
      label.textContent = "Réflexion · " + sec + " s";
    }
    if (still) {
      copy.querySelectorAll(".w, .c").forEach(function (s) { s.classList.add("on"); });
      think.classList.add("is-gone"); copy.classList.add("is-done");
      return;
    }
    var ball = document.createElement("span"); ball.className = "ball"; copy.appendChild(ball);
    var last = null, lastEl = title;
    // la bille : au bout du dernier caractère écrit, centrée sur les minuscules
    function place(ch, el) {
      last = ch; lastEl = el;
      var c = copy.getBoundingClientRect(), r = ch.getBoundingClientRect(), fs = parseFloat(getComputedStyle(el).fontSize);
      var d = el === title ? fs * .42 : Math.max(9, fs * .62);
      ball.style.width = ball.style.height = d + "px";
      ball.style.left = (r.right - c.left + fs * (el === title ? .22 : .28)) + "px";
      ball.style.top = (r.top - c.top + r.height * .6) + "px";
    }
    ballRest = function () { if (last && ball.classList.contains("on")) place(last, lastEl); };
    // machine à écrire : quelques caractères à la fois, à un rythme légèrement irrégulier
    function type(chars, el, chunk, gap, done) {
      var i = 0;
      (function step() {
        if (i >= chars.length) { done(); return; }
        var n = Math.max(1, Math.round(chunk * (.6 + Math.random() * .8)));
        for (var k = 0; k < n && i < chars.length; k++) chars[i++].classList.add("on");
        place(chars[i - 1], el);
        setTimeout(step, gap * (.7 + Math.random() * .6));
      })();
    }
    function stream(words, gap, done) {
      var i = 0;
      (function step() {
        if (i >= words.length) { done(); return; }
        words[i++].classList.add("on");
        setTimeout(step, gap);
      })();
    }
    function streamAll(list, gap, done) {
      var k = 0;
      (function next() {
        if (k >= list.length) { done(); return; }
        stream(list[k++], gap, function () { setTimeout(next, 20); });
      })();
    }
    function start() {
      var t0 = performance.now();
      think.classList.add("is-on");                                   // « Réflexion » scintille
      setTimeout(function () {
        streamAll(paras, 4, function () {                             // les lignes grises s'écrivent, très vite
          setTimeout(function () {
            finish(Math.max(1, Math.round((performance.now() - t0) / 1000)));   // repli : « Réflexion · 1 s »
            setTimeout(function () {
              think.classList.add("is-gone");                         // puis la réflexion s'efface
              setTimeout(function () {
                // la bille apparaît là où le titre va commencer, puis le texte s'écrit
                place(tc[0], title);
                ball.style.left = (parseFloat(ball.style.left) - tc[0].getBoundingClientRect().width) + "px";
                ball.classList.add("on");
                orbState("speaking");
                setTimeout(function () {
                  type(tc, title, 1, 15, function () {                // le titre, lettre à lettre
                    setTimeout(function () {
                      type(sc, sub, 7, 16, function () {              // puis la description, par paquets
                        setTimeout(function () { ball.classList.remove("on"); copy.classList.add("is-done"); orbState("listening"); }, 180);
                      });
                    }, 70);
                  });
                }, 150);
              }, 260);
            }, 160);
          }, 110);
        });
      }, 60);
    }
    var go = function () { go = function () {}; setTimeout(start, 200); };
    new MutationObserver(function () { if (hero.classList.contains("is-in")) go(); }).observe(hero, { attributes: true, attributeFilter: ["class"] });
    if (hero.classList.contains("is-in")) go();
  })();

  /* ---------- « Quitter » : on ferme proprement la session dans le LMS (SCORM 2004 ou 1.2) ---------- */
  function findApi(name) {
    var w = window;
    for (var i = 0; i < 12 && w; i++) {
      try { if (w[name]) return w[name]; } catch (e) { return null; }
      if (w.parent && w.parent !== w) w = w.parent; else if (w.opener) w = w.opener; else break;
    }
    return null;
  }
  document.querySelector("[data-quit]").addEventListener("click", function () {
    var api04 = findApi("API_1484_11"), api12 = findApi("API");
    try {
      // l'apprenant n'a pas encore commencé : on garde la session ouverte pour la reprendre plus tard
      if (api04) { api04.SetValue("cmi.exit", "suspend"); api04.Commit(""); api04.Terminate(""); }
      else if (api12) { api12.LMSSetValue("cmi.core.exit", "suspend"); api12.LMSCommit(""); api12.LMSFinish(""); }
    } catch (e) {}
    try { window.top.close(); } catch (e) {}
    try { window.close(); } catch (e) {}
    setTimeout(function () { document.querySelector("[data-end]").hidden = false; }, 250);
  });

  // « Commencer » : la suite du module sera branchée ici
  document.querySelector("[data-start]").addEventListener("click", function () {
    hero.dispatchEvent(new CustomEvent("module:start", { bubbles: true }));
  });
})();
