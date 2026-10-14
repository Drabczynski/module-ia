/* Écran d'accueil du module « Première rencontre », posé par-dessus l'application (la barre d'outils reste visible) :
   - deux calques en plein cadre, calés à droite : le fond (bg-2), fixe, et les formes (bg-1), qui flottent doucement
     (accueil.css) ; si le texte risque de passer sur les formes, l'image glisse vers la droite (le bord gauche du fond se fond
     dans le fond lilas) ; sur petit écran ou écran en hauteur, elle passe en haut et le texte dessous ;
   - à l'ouverture, l'image se forme à partir de particules (particules.js), le numéro du module au centre ;
     puis les bandeaux du titre se déroulent, la phrase et « Commencer » apparaissent ;
   - « Commencer », ou « Suivant » dans la barre d'outils, envoie « module:start » (app.js lance la bienvenue
     de l'assistante) et l'accueil s'efface. */
(function () {
  "use strict";
  var root = document.querySelector("[data-acc]");
  if (!root) return;
  // ?etape=… (relecture) : on va droit à une étape, sans accueil
  if (/[?&]etape=/.test(location.search)) { root.remove(); return; }
  function $(s) { return root.querySelector(s); }
  function css(k, v) { root.style.setProperty(k, v); }
  var hero = $("[data-acc-hero]"), back = $("[data-acc-back]"), fore = $("[data-acc-fore]"), copy = $(".copy"), goBtn = $("[data-acc-start]");
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var IW = 1665, IH = 854;               // les deux calques
  var FORMS = .485;                      // abscisse (part de la largeur) où commencent les formes : le texte reste à gauche
  var alive = true, geo = null;

  // notre orbe, dans le bouton « Commencer » : dessinée à 64 px puis mise à l'échelle de sa pastille
  var ORB = 64, orbBox = copy.querySelector(".go-orb"), orb = null;
  if (window.SiriOrb) { orb = window.SiriOrb(orbBox.firstElementChild, { size: ORB, label: "Assistant IA", state: "idle" }); }
  function orbFit() { orbBox.firstElementChild.style.transform = "scale(" + (orbBox.clientWidth / ORB).toFixed(4) + ")"; }

  // le bord droit réel du texte (le plus large de ses éléments)
  function textRight() {
    var r = 0;
    Array.prototype.forEach.call(copy.querySelectorAll(".logos, .hl, .sub, .go"), function (el) {
      var range = document.createRange(); range.selectNodeContents(el);
      r = Math.max(r, el.classList.contains("sub") ? range.getBoundingClientRect().right : el.getBoundingClientRect().right);
    });
    return r - hero.getBoundingClientRect().left;
  }
  function layout() {
    if (!alive) return;
    // l'accueil s'arrête au-dessus de la barre d'outils
    var tools = document.querySelector(".tools"), th = tools && tools.offsetParent ? tools.getBoundingClientRect().height : 0;
    css("--tools-h", (th || 65) + "px");
    var W = hero.clientWidth, H = hero.clientHeight, s, bw, bh, bx, by;
    var mob = W <= 760 || W / H < 1.2;
    root.classList.toggle("is-mob", mob);
    if (mob) {                                                 // l'image en haut, centrée sur la barre de saisie
      var ah = Math.round(H * .5);
      s = Math.max(W / IW, ah / IH); bw = IW * s; bh = IH * s;
      bx = Math.min(0, Math.max(W - bw, W / 2 - .66 * bw)); by = (ah - bh) / 2;
      css("--ah", ah + "px");
    } else {                                                   // plein cadre, calée à droite
      s = Math.max(W / IW, H / IH); bw = IW * s; bh = IH * s;
      bx = W - bw; by = (H - bh) / 2;
      var need = textRight() + Math.max(40, W * .03);          // les formes commencent après le texte
      if (bx + FORMS * bw < need) bx = Math.min(need - FORMS * bw, W * .3);
    }
    geo = { x: bx, y: by, w: bw, h: bh };
    css("--bx", bx.toFixed(1) + "px"); css("--by", by.toFixed(1) + "px");
    css("--bw", bw.toFixed(1) + "px"); css("--bh", bh.toFixed(1) + "px");
    css("--fo", (bx + .67 * bw).toFixed(1) + "px " + (by + .43 * bh).toFixed(1) + "px");   // le centre des formes, pour leur balancement
    // si l'image a glissé vers la droite, son bord gauche se fond dans le fond
    back.style.webkitMaskImage = back.style.maskImage = bx > 0 ? "linear-gradient(90deg, transparent 0, #000 14%)" : "";
    orbFit();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  layout();
  requestAnimationFrame(layout);                               // une fois la barre d'outils affichée (app.js)
  window.addEventListener("load", layout);
  window.addEventListener("resize", layout);

  // entrée : l'image se forme à partir de particules (particules.js), puis apparaît ;
  // sans WebGL ou avec moins d'animations, elle apparaît dès qu'elle est prête
  var decoded = Promise.all([back, fore].map(function (im) { return im.decode ? im.decode().catch(function () {}) : Promise.resolve(); }));
  function enter() { if (!hero.classList.contains("is-in")) { hero.classList.add("is-in"); if (orb) orb.setState("listening"); } }
  function plain() { decoded.then(function () { requestAnimationFrame(enter); }); setTimeout(enter, 1500); }
  if (still || !window.AccParticles) plain();
  else (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    layout();                                                  // la mise en page définitive
    var W = hero.clientWidth, H = hero.clientHeight;
    // l'explosion part du centre ; pendant qu'elle s'étend, le numéro du module s'y affiche en grand
    var C = [W / 2, H / 2];
    var big = document.createElement("p");
    big.className = "acc-big"; big.setAttribute("aria-hidden", "true");
    big.textContent = copy.dataset.accNum || "";
    big.style.left = C[0] + "px"; big.style.top = C[1] + "px";
    hero.appendChild(big);
    var x0 = Math.max(0, geo.x), y0 = Math.max(0, geo.y);
    var intro = window.AccParticles({
      parent: hero,
      center: C,
      area: { x: x0, y: y0, w: Math.min(W, geo.x + geo.w) - x0, h: Math.min(H, geo.y + geo.h) - y0 },
      picture: decoded.then(function () { return { layers: [back, fore].map(function (im) { return { img: im, x: geo.x, y: geo.y, w: geo.w, h: geo.h }; }) }; }),
      gather: 1.35,                                            // les particules se posent une fois « Module 1 » parti
      onBurst: function () { if (window.AccAscii) window.AccAscii(big, { hold: 520 }); else big.remove(); },
      onReveal: enter
    });
    if (!intro) { big.remove(); plain(); return; }
    hero.classList.add("is-gen");
    setTimeout(enter, 9000);
    window.addEventListener("resize", intro.finish, { once: true });
  });

  /* ---------- « Commencer » (ou « Suivant », dans la barre d'outils) : l'assistante prend la parole (app.js),
     l'accueil s'efface ---------- */
  function start() {
    if (root.classList.contains("is-leaving")) return;
    root.dispatchEvent(new CustomEvent("module:start", { bubbles: true }));    // dans le geste : la voix peut partir
    root.classList.add("is-leaving");
    setTimeout(function () {
      alive = false;
      window.removeEventListener("resize", layout);
      document.removeEventListener("click", onNext, true);
      root.remove();
    }, 750);
  }
  function onNext(e) {
    if (!e.target.closest || !e.target.closest("[data-next]")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    start();
  }
  goBtn.addEventListener("click", start);
  document.addEventListener("click", onNext, true);
})();
