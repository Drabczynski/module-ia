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
