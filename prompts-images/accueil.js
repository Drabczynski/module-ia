/* Écran d'accueil du module « Des prompts pour les images » :
   - cale le collage en bas à droite, à la plus grande taille qui laisse le texte
     dégagé à gauche (le nuage de points ne doit pas passer sous le titre) ;
   - le titre et le sous-titre s'écrivent mot à mot. */
(function () {
  "use strict";
  var root = document.documentElement, hero = document.querySelector("[data-hero]");
  // hauteur de la maquette ; les personnes (02.png, 1396 × 818) à 95 %, calées en bas à droite avec une marge
  var MOCK_H = 560, PEOPLE = .95, PW = 1396 * PEOPLE, PH = 818 * PEOPLE, MARGIN = .045;

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

  // notre orbe, à gauche du titre : dessinée à 200 px puis mise à l'échelle de la place prévue (--od)
  var ORB = 200, orbBox = copy.querySelector(".t-orb"), orb = null;
  if (window.SiriOrb) { orb = window.SiriOrb(orbBox.firstElementChild, { size: ORB, label: "Assistant IA", state: "idle" }); }
  function orbFit() { orbBox.firstElementChild.style.transform = "scale(" + (orbBox.clientWidth / ORB).toFixed(4) + ")"; }
  function orbState(s) { if (orb) orb.setState(s); }
  function apply(s, W, H) {
    var top = H - H0 * s;
    root.style.setProperty("--s", s.toFixed(4));
    root.style.setProperty("--sw", (W0 * s).toFixed(1) + "px");
    root.style.setProperty("--sh", (H0 * s).toFixed(1) + "px");
    root.style.setProperty("--u", W <= 720 ? 1 : (s * 900 / MOCK_H).toFixed(4));
    root.style.setProperty("--top", top.toFixed(1) + "px");
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
    root.style.setProperty("--lift", "0px");
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
    var u = s * 900 / MOCK_H, hb = hero.getBoundingClientRect();
    goBtn.classList.remove("is-low");
    var gb = goBtn.getBoundingClientRect(), cb = copy.getBoundingClientRect(), sb = subEl.getBoundingClientRect();
    var goY = hb.bottom - 51 * u - gb.height, goR = cb.left + 5 * u + gb.width;
    // le collage glisse vers la droite pour laisser respirer le bouton (dans la limite de la marge des personnes)
    var lowLeft0 = hb.left + (W - W0 * s) + BG.lowX * s;
    var shift = Math.min(Math.max(0, goR + Math.max(110, W * .07) - lowLeft0), (MARGIN + .025) * W0 * s);
    root.style.setProperty("--shift", shift.toFixed(1) + "px");
    root.style.setProperty("--bandl", (W + shift - W0 * s).toFixed(1) + "px");     // la bande part du bord gauche de l'écran
    var lowLeft = lowLeft0 + shift, lowTop = hb.top + (H - H0 * s) + BG.low * s;
    var low = goY > sb.bottom + 28;                              // le bouton se pose sur la bande du bas
    if (low) { goBtn.classList.add("is-low"); root.style.setProperty("--go-y", (goY - cb.top).toFixed(1) + "px"); }
    // si le texte descendrait sur l'image du bas, il remonte
    var bottom = low ? sb.bottom : copy.getBoundingClientRect().bottom;
    var limit = lowTop - Math.max(24, H * .03);
    if (bottom > limit) {                                        // la bande couvre toute la largeur
      root.style.setProperty("--lift", (bottom - limit).toFixed(1) + "px");
      if (low) root.style.setProperty("--go-y", (goY - cb.top + (bottom - limit)).toFixed(1) + "px");
    }
    orbFit();
    ballRest();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  layout();
  window.addEventListener("resize", layout);

  // entrée, une fois les images prêtes
  var imgs = Array.prototype.slice.call(document.querySelectorAll(".stage img"));
  Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : Promise.resolve(); }))
    .then(function () { requestAnimationFrame(function () { hero.classList.add("is-in"); }); });
  setTimeout(function () { hero.classList.add("is-in"); }, 1500);

  /* ---------- le dégradé animé du bas ----------
     Des taches de couleur douces qui dérivent (corail, rose, magenta, orange, pêche, lavande), une traînée orange
     en diagonale qui ondule, mélangées en lumière linéaire, avec un grain léger. Sans WebGL : le dégradé CSS fixe. */
  (function () {
    var cv = document.querySelector("[data-band]"), gl = null;
    try { gl = cv.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) { cv.remove(); return; }
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var FS = [
      "precision mediump float;uniform vec2 uR;uniform float uT;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "void blob(inout vec3 acc,inout float ws,vec2 p,vec2 c,float s,vec3 col){vec2 d=p-c;float w=exp(-dot(d,d)/(s*s));acc+=w*col*col;ws+=w;}",
      "void main(){",
      " vec2 uv=gl_FragCoord.xy/uR;float a=uR.x/uR.y,A=clamp(a,1.,3.4),t=uT;",
      // P : la largeur ramenée à ~3 hauteurs (les taches s'étirent sur les écrans très larges)
      " vec2 P=vec2(uv.x*A,uv.y);",
      " P+=.05*vec2(sin(P.y*3.+t*.31)+.5*sin(P.y*7.-t*.23),cos(P.x*1.9-t*.27)+.5*sin(P.x*4.3+t*.19));",
      " vec3 acc=vec3(0.);float ws=1e-4;",
      " blob(acc,ws,P,vec2((.1+.03*sin(t*.13))*A,1.),.55,vec3(.96,.4,.5));",
      " blob(acc,ws,P,vec2((.2+.04*sin(t*.11))*A,.42+.08*sin(t*.17)),.33,vec3(.94,.45,.9));",
      " blob(acc,ws,P,vec2((.42+.04*cos(t*.09))*A,.72),.45,vec3(.98,.42,.62));",
      " blob(acc,ws,P,vec2((.52+.05*sin(t*.12))*A,.22+.06*cos(t*.14)),.3,vec3(.93,.47,.9));",
      " blob(acc,ws,P,vec2((.68+.04*sin(t*.1))*A,.45),.4,vec3(.98,.58,.38));",
      " blob(acc,ws,P,vec2((.83+.03*cos(t*.1))*A,.82),.35,vec3(.99,.76,.56));",
      " blob(acc,ws,P,vec2((.96+.02*sin(t*.15))*A,.3),.45,vec3(.96,.43,.55));",
      " blob(acc,ws,P,vec2(.02*A,-.06),.28,vec3(.88,.8,1.));",
      " blob(acc,ws,P,vec2(-.02*A,-.16),.2,vec3(.72,.82,1.));",
      " blob(acc,ws,P,vec2(1.*A,-.06),.26,vec3(.93,.82,1.));",
      " vec3 c=sqrt(acc/ws);",
      // traînées orange en diagonale (dans l'espace des pixels, pour garder l'angle), qui ondulent
      " vec2 Q=vec2(uv.x*a,uv.y);",
      " vec2 n=normalize(vec2(1.,-.85-.12*sin(t*.2)));",
      " float d1=dot(Q-vec2((.06+.015*sin(t*.16))*a,0.),n),d2=dot(Q-vec2((.6+.015*cos(t*.14))*a,0.),n);",
      " c=mix(c,vec3(1.,.63,.42),exp(-pow(d1/.08,2.))*.6+exp(-pow(d2/.1,2.))*.35);",
      " c=mix(c,vec3(.98,.84,.98),exp(-pow((d1-.13)/.06,2.))*.3);",
      " c+=(h(gl_FragCoord.xy+fract(t*7.)*91.)-.5)*.06;",
      " gl_FragColor=vec4(c,1.);}"
    ].join("\n");
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { cv.remove(); return; }
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.remove(); return; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "uR"), uT = gl.getUniformLocation(pr, "uT"), t0 = performance.now();
    var dpr = .5, lastT = 0;                                       // dégradé flou : une demi-résolution suffit
    function frame(now) {
      if (!still) requestAnimationFrame(frame);
      if (!still && now - lastT < 33) return;                       // 30 images par seconde au plus
      lastT = now;
      var w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, still ? 12 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
    if (still) window.addEventListener("resize", function () { requestAnimationFrame(frame); });
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
      orbState("thinking");                                           // l'orbe réfléchit
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
                orbState("speaking");                                 // l'orbe parle pendant l'écriture
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
    // l'orbe est visible dès l'arrivée (elle réfléchit) ; la réflexion commence quand elle est bien là
    var go = function () { go = function () {}; orbState("thinking"); setTimeout(start, 380); };
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
