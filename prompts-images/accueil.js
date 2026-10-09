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
  root.style.setProperty("--pr", (MARGIN * 100).toFixed(3) + "%");
  // le globe : centré derrière les personnes, rayon 0,55 × leur hauteur, cadre de 2,8 rayons
  var g = onPeople(.541, .438), gs = 2.8 * .55 * PH;
  root.style.setProperty("--gw", (gs / W0 * 100).toFixed(3) + "%");
  root.style.setProperty("--gh", (gs / H0 * 100).toFixed(3) + "%");
  root.style.setProperty("--gl", (g[0] - gs / W0 * 50).toFixed(3) + "%");
  root.style.setProperty("--gt", (g[1] - gs / H0 * 50).toFixed(3) + "%");

  var copy = document.querySelector(".copy"), goBtn = copy.querySelector(".go"), subEl = copy.querySelector(".sub");
  var ballRest = function () {};                     // replace la bille au bout du titre (définie plus bas)
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
    if (W <= 720) { apply(W * 1.85 / W0, W, H); ballRest(); return; }     // mobile : on garde la partie droite, avec les personnes
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
    var lowLeft = lowLeft0 + shift, lowTop = hb.top + (H - H0 * s) + BG.low * s;
    var low = !(goR + 16 > lowLeft && goY + gb.height > lowTop) && goY > sb.bottom + 28;
    if (low) { goBtn.classList.add("is-low"); root.style.setProperty("--go-y", (goY - cb.top).toFixed(1) + "px"); }
    // si le texte descendrait sur l'image du bas, il remonte
    var bottom = low ? sb.bottom : copy.getBoundingClientRect().bottom;
    var limit = lowTop - Math.max(24, H * .03);
    if (bottom > limit && cb.left + copy.offsetWidth > lowLeft) {
      root.style.setProperty("--lift", (bottom - limit).toFixed(1) + "px");
      if (low) root.style.setProperty("--go-y", (goY - cb.top + (bottom - limit)).toFixed(1) + "px");
    }
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
        stream(list[k++], gap, function () { setTimeout(next, 50); });
      })();
    }
    function start() {
      var t0 = performance.now();
      think.classList.add("is-on");                                   // « Réflexion » scintille
      setTimeout(function () {
        streamAll(paras, 9, function () {                             // les lignes grises s'écrivent
          setTimeout(function () {
            finish(Math.max(1, Math.round((performance.now() - t0) / 1000)));   // repli : « Réflexion · 1 s »
            setTimeout(function () {
              think.classList.add("is-gone");                         // puis la réflexion s'efface
              setTimeout(function () {
                // la bille apparaît là où le titre va commencer, pulse un instant, puis le texte s'écrit
                place(tc[0], title);
                ball.style.left = (parseFloat(ball.style.left) - tc[0].getBoundingClientRect().width) + "px";
                ball.classList.add("on");
                setTimeout(function () {
                  type(tc, title, 1, 38, function () {                // le titre, lettre à lettre
                    setTimeout(function () {
                      type(sc, sub, 3, 24, function () {              // puis la description, par petits paquets
                        setTimeout(function () { ball.classList.remove("on"); copy.classList.add("is-done"); }, 350);
                      });
                    }, 160);
                  });
                }, 420);
              }, 480);
            }, 380);
          }, 200);
        });
      }, 150);
    }
    var go = function () { go = function () {}; setTimeout(start, 300); };
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
