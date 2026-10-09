/* Écran d'accueil du module « Des prompts pour les images » :
   - cale le collage en bas à droite, à la plus grande taille qui laisse le texte
     dégagé à gauche (le nuage de points ne doit pas passer sous le titre) ;
   - légère profondeur à la souris : le collage et les personnes glissent en sens contraires. */
(function () {
  "use strict";
  var root = document.documentElement, hero = document.querySelector("[data-hero]");
  var W0 = 1901, H0 = 900, MOCK_H = 537;          // collage d'origine et hauteur de la maquette

  function layout() {
    var W = window.innerWidth, H = window.innerHeight, s;
    if (W <= 720) {
      s = W * 1.85 / W0;                              // mobile : on garde la partie droite, avec les personnes
    } else {
      // le nuage de points commence à x = 805 dans le collage ; le texte s'étend sur ~ 6 % + 245 u (le sous-titre)
      s = Math.min(H / H0, (W * .94 - 40) / 1545);
    }
    var top = H - H0 * s;
    root.style.setProperty("--s", s.toFixed(4));
    root.style.setProperty("--u", W <= 720 ? 1 : (s * H0 / MOCK_H).toFixed(4));
    root.style.setProperty("--top", top.toFixed(1) + "px");
    hero.classList.toggle("is-floating", top > 2);
  }
  layout();
  window.addEventListener("resize", layout);

  // entrée, une fois les images prêtes
  var imgs = Array.prototype.slice.call(document.querySelectorAll(".stage img"));
  Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : Promise.resolve(); }))
    .then(function () { requestAnimationFrame(function () { hero.classList.add("is-in"); }); });
  setTimeout(function () { hero.classList.add("is-in"); }, 1500);

  // profondeur à la souris
  if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    var layers = document.querySelectorAll("[data-depth]");
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var mx = e.clientX / window.innerWidth - .5, my = e.clientY / window.innerHeight - .5;
      layers.forEach(function (l) {
        var d = +l.dataset.depth;
        l.style.transform = "translate(" + (mx * 14 * d).toFixed(1) + "px," + (my * 8 * d).toFixed(1) + "px)";
      });
    });
  }

  /* ---------- les particules, derrière les personnes ----------
     Un globe en trame de points (comme le nuage de points du collage) qui tourne lentement : points réguliers,
     plus gros à l'avant, une onde qui fait varier leur taille comme un ombrage en trame, quelques points
     d'accent bleus et orange. Il se dessine à l'ouverture, du haut vers le bas ; les points s'écartent sous la souris. */
  (function () {
    var cv = document.querySelector("[data-dots]"), ctx = cv.getContext("2d");
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var dpr = Math.min(2, window.devicePixelRatio || 1), N = 1900, pts = [];
    for (var i = 0; i < N; i++) {
      var y = 1 - 2 * (i + .5) / N, q = Math.sqrt(1 - y * y), th = i * 2.399963, rr = Math.random();
      pts.push({ x: Math.cos(th) * q, y: y, z: Math.sin(th) * q, lat: Math.asin(y), lon: th,
        c: rr < .06 ? "#2f5bd3" : rr < .085 ? "#f08a2c" : "#141414", ox: 0, oy: 0 });
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

  /* ---------- des prompts qui apparaissent sur l'image, dans des bulles de verre liquide ----------
     Chaque bulle arrive en fondu depuis le flou, le texte s'affiche mot à mot (comme une réponse qui s'écrit), puis s'efface.
     Positions en % du collage (ancre : centre gauche de la bulle, ou centre droit si « r »). */
  (function () {
    var host = document.querySelector("[data-prompts]");
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // [texte, x %, y %, ancre « r » = bulle calée à droite]
    var PROMPTS = [
      ["Génère-moi une image pour le post de la médiathèque…", 33, 72],
      ["Sujet : des lecteurs dans un parc, au soleil", 66, 50],
      ["Style : illustration douce, couleurs pastel", 46, 17],
      ["Cadrage : plan large, beaucoup de ciel", 22, 88],
      ["Usage : format carré pour Instagram, sans texte", 97, 68, "r"]
    ];
    var k = 0;
    function show(item) {
      var el = document.createElement("div");
      el.className = "pp";
      el.innerHTML = '<span class="pp-ic"><svg><use href="#i-spark4"/></svg></span><span class="pp-tx"></span>';
      if (item[3] === "r") el.style.right = (100 - item[1]) + "%"; else el.style.left = item[1] + "%";
      el.style.top = item[2] + "%";
      // le texte, mot à mot : chaque mot sort du flou un peu après le précédent
      var tx = el.querySelector(".pp-tx");
      item[0].split(" ").forEach(function (word, i, all) {
        var w = document.createElement("span"); w.className = "w";
        w.textContent = word + (i < all.length - 1 ? " " : "");
        w.style.animationDelay = (.12 + i * .045).toFixed(3) + "s";
        tx.appendChild(w);
      });
      host.appendChild(el);
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("is-pop"); }); });
      setTimeout(function () { el.classList.add("is-out"); setTimeout(function () { el.remove(); }, 400); }, still ? 4200 : 3000);
    }
    function next() {
      if (!document.hidden) show(PROMPTS[k++ % PROMPTS.length]);
      setTimeout(next, still ? 5000 : 1900);
    }
    setTimeout(next, 1500);
  })();

  // « Commencer » : la suite du module sera branchée ici
  document.querySelector("[data-start]").addEventListener("click", function () {
    hero.dispatchEvent(new CustomEvent("module:start", { bubbles: true }));
  });
})();
