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
      // le nuage de points commence à x = 805 dans le collage ; le texte s'étend sur ~ 6 % + 292 u
      s = Math.min(H / H0, (W * .94 - 32) / 1585);
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

  // « Commencer » : la suite du module sera branchée ici
  document.querySelector("[data-start]").addEventListener("click", function () {
    hero.dispatchEvent(new CustomEvent("module:start", { bubbles: true }));
  });
})();
