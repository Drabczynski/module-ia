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

  /* ---------- le nuage de particules des modules (même mouvement que l'accueil des modules) ----------
     Une sphère de points qui tourne lentement, derrière les personnes ; les points tourbillonnent sous la souris. */
  (function () {
    var cv = document.querySelector("[data-dots]"), ctx = cv.getContext("2d"), pts = [];
    var mx = -9999, my = -9999, R = 0, rot = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (var i = 0; i < 3400; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 0.5 + 0.5 * Math.pow(Math.random(), 0.35), q = Math.sqrt(1 - u * u);
      pts.push({ x: q * Math.cos(th) * r, y: u * r, z: q * Math.sin(th) * r, ox: 0, oy: 0, s: Math.random() < 0.08 ? 1.9 : 1.1 });
    }
    window.addEventListener("pointermove", function (e) { var b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; });
    window.addEventListener("pointerleave", function () { mx = my = -9999; });
    function frame() {
      requestAnimationFrame(frame);
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      var base = w / 2.6, cx = w / 2, cy = h / 2;                 // le cadre fait 1,3 rayon de chaque côté
      R += (base - R) * (still ? 1 : 0.05); if (!still) rot += 0.0016;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(0.35), sT = Math.sin(0.35), sz = Math.max(.8, Math.min(1.7, base / 300));
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        var x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * cT - z * sT; z = p.y * sT + z * cT;
        var px = cx + x * R, py = cy + y * R;
        var dx = px + p.ox - mx, dy = py + p.oy - my, d = Math.sqrt(dx * dx + dy * dy);
        if (!still && d < 150 && d > 0.5) {                        // tourbillon autour du curseur
          var f = (1 - d / 150);
          p.ox += (-dy / d * 3.2 + dx / d * 1.1) * f * f * 6;
          p.oy += (dx / d * 3.2 + dy / d * 1.1) * f * f * 6;
        }
        p.ox *= 0.93; p.oy *= 0.93;
        ctx.fillStyle = "rgba(31, 30, 28," + (0.26 + 0.56 * (z + 1) / 2).toFixed(3) + ")";
        ctx.fillRect(px + p.ox, py + p.oy, p.s * sz, p.s * sz);
      }
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- des prompts qui apparaissent sur l'image, dans des bulles de verre liquide ----------
     Chaque bulle naît en pastille, s'étire pendant que le texte s'écrit, reste un instant puis s'efface.
     Positions en % du collage (ancre : centre gauche de la bulle, ou centre droit si « r »). */
  (function () {
    var host = document.querySelector("[data-prompts]");
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      el.className = "pp" + (item[3] === "r" ? " is-right" : "");
      el.innerHTML = '<span class="pp-ic"><svg><use href="#i-spark4"/></svg></span><span class="pp-tx"></span>';
      if (item[3] === "r") el.style.right = (100 - item[1]) + "%"; else el.style.left = item[1] + "%";
      el.style.top = item[2] + "%";
      host.appendChild(el);
      var tx = el.querySelector(".pp-tx");
      requestAnimationFrame(function () {
        el.classList.add("is-pop");
        setTimeout(function () {
          var car = document.createElement("span"); car.className = "pp-car"; tx.appendChild(car);
          var chars = Array.from(item[0]), n = 0;
          // la bulle s'étire avec le texte, lettre après lettre
          (function type() {
            if (n >= chars.length) { el.classList.add("is-typed", "is-open"); el.style.width = el.scrollWidth + "px"; return; }
            var c = document.createElement("i"); c.textContent = chars[n++];
            tx.insertBefore(c, car);
            el.style.width = el.scrollWidth + "px";
            setTimeout(type, still ? 0 : 26 + Math.random() * 24);
          })();
        }, still ? 0 : 380);
      });
      var life = still ? 5200 : 2000 + item[0].length * 38 + 2400;
      setTimeout(function () { el.classList.add("is-out"); setTimeout(function () { el.remove(); }, 700); }, life);
    }
    function next() {
      if (!document.hidden) show(PROMPTS[k++ % PROMPTS.length]);
      setTimeout(next, still ? 6000 : 2900);
    }
    setTimeout(next, 1900);
  })();

  // « Commencer » : la suite du module sera branchée ici
  document.querySelector("[data-start]").addEventListener("click", function () {
    hero.dispatchEvent(new CustomEvent("module:start", { bubbles: true }));
  });
})();
