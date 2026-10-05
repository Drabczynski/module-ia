/* ==========================================================================
   Site vitrine : le défilement pilote une démonstration du module.
   0.00–0.22  titre, puis l'orbe monte et parle (texte révélé au défilement)
   0.22–0.29  l'orbe entre dans le module, qui s'ouvre presque en plein écran
   0.29–0.50  étape 1 · écrire à l'IA        0.50–0.62  étape 2 · repérer
   0.62–0.80  étape 3 · compléter le prompt  0.80–0.90  étape 4 · trancher
   0.90–1.00  le résultat
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var story = $("[data-story]"), stage = $("[data-stage]"), area = $("[data-area]"), win = $("[data-win]");
  var hero = $("[data-hero]"), say = $("[data-say]"), hint = $("[data-hint]"), nav = $("[data-nav]");
  var orbEl = $("[data-orb]"), ORB = 240;
  var orb = window.SiriOrb ? window.SiriOrb(orbEl, { size: ORB, state: "idle" }) : null;

  /* ---------- mots révélés un à un ---------- */
  function words(el, text) {
    el.innerHTML = "";
    return text.split(" ").map(function (w, i) {
      var s = document.createElement("span"); s.className = "w"; s.textContent = w;
      el.appendChild(s); if (i < text.split(" ").length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });
  }
  var sayW = words(say, say.textContent);
  var wsay = $("[data-wsay]"), wsayText = "", wsayW = [];
  function setWsay(t) { if (t !== wsayText) { wsayText = t; wsayW = words(wsay, t); } }
  var aiWords = [];
  $$("[data-aibody] p").forEach(function (p) {             // découpe la réponse en mots, en gardant gras et surlignages
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
  function reveal(list, t) { var n = Math.round(list.length * t); list.forEach(function (w, i) { w.classList.toggle("on", i < n); }); }

  /* ---------- la fenêtre du module, ajustée à l'écran ---------- */
  var W = 1440, H = 860, fit = 1, ox = 0, oy = 0, tall = false;
  function layout() {
    var a = area.getBoundingClientRect();
    tall = a.width / a.height < 1.05;
    win.classList.toggle("is-tall", tall);
    W = tall ? 760 : 1440; H = tall ? 1240 : 860;
    fit = Math.min(a.width / W, a.height / H);
    ox = (a.width - W * fit) / 2; oy = (a.height - H * fit) / 2;
    force = true;
  }
  function centerOf(el) {                                   // centre d'un élément, en coordonnées de la scène
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top, w: r.width };
  }
  function inWin(el) {                                      // centre d'un élément, en coordonnées de la fenêtre (non mise à l'échelle)
    var r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), k = w.width / W;
    return { x: (r.left - w.left + r.width / 2) / k, y: (r.top - w.top + r.height / 2) / k, l: (r.left - w.left) / k, t: (r.top - w.top) / k, w: r.width / k, h: r.height / k };
  }

  /* ---------- trajectoire de l'orbe ---------- */
  var slotWin = $("[data-slot-win]"), slotMini = $("[data-slot-mini]");
  function target(name) {
    var vw = stage.clientWidth, vh = stage.clientHeight;
    if (name === "bottom") return { x: vw / 2, y: vh - Math.min(110, vh * .12), s: Math.min(.78, vw / 640) };
    if (name === "center") return { x: vw / 2, y: vh * .4, s: Math.min(1, vw / 520) };
    var c = centerOf(name === "win" ? slotWin : slotMini);
    return { x: c.x, y: c.y, s: c.w / ORB };
  }
  var ORB_KEYS = [[0, "bottom"], [.085, "center"], [.21, "center"], [.29, "win"], [.43, "win"], [.465, "mini"], [.62, "mini"], [.655, "win"], [1, "win"]];
  function along(keys, p, map) {
    for (var i = 0; i < keys.length - 1; i++) {
      if (p <= keys[i + 1][0]) {
        var a = target(map ? map(keys[i][1]) : keys[i][1]), b = target(map ? map(keys[i + 1][1]) : keys[i + 1][1]);
        var t = ease(seg(p, keys[i][0], keys[i + 1][0]));
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t) };
      }
    }
    return target(keys[keys.length - 1][1]);
  }

  /* ---------- nuage de particules (repris de l'accueil des modules) ---------- */
  var cloud = (function () {
    var cv = $("[data-cloud]"), ctx = cv.getContext("2d"), pts = [], dpr = Math.min(2, window.devicePixelRatio || 1);
    var mx = -9999, my = -9999, rot = 0;
    for (var i = 0; i < 2400; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = .5 + .5 * Math.pow(Math.random(), .35), q = Math.sqrt(1 - u * u);
      pts.push({ x: q * Math.cos(th) * r, y: u * r, z: q * Math.sin(th) * r, ox: 0, oy: 0, s: Math.random() < .08 ? 1.9 : 1.1 });
    }
    window.addEventListener("pointermove", function (e) { var b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; }, { passive: true });
    function size() { var b = cv.getBoundingClientRect(); cv.width = b.width * dpr; cv.height = b.height * dpr; }
    return {
      size: size,
      draw: function (cx, cy, R, A) {
        var b = cv.getBoundingClientRect();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, b.width, b.height);
        if (A < .01) return;
        rot += .0016;
        var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(.35), sT = Math.sin(.35);
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k];
          var x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * cT - z * sT; z = p.y * sT + z * cT;
          var px = cx + x * R, py = cy + y * R, dx = px + p.ox - mx, dy = py + p.oy - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150 && d > .5) { var f = 1 - d / 150; p.ox += (-dy / d * 3.2 + dx / d * 1.1) * f * f * 6; p.oy += (dx / d * 3.2 + dy / d * 1.1) * f * f * 6; }
          p.ox *= .93; p.oy *= .93;
          ctx.fillStyle = "rgba(31, 30, 28," + ((.18 + .5 * (z + 1) / 2) * A).toFixed(3) + ")";
          ctx.fillRect(px + p.ox, py + p.oy, p.s, p.s);
        }
      }
    };
  })();

  /* ---------- éléments du module ---------- */
  var views = {}; $$("[data-view]").forEach(function (v) { views[v.dataset.view] = v; });
  var comp = $("[data-comp]"), inp = $("[data-in]"), send = $("[data-send]"), u1 = $("[data-u1]"), ai = $("[data-ai]"), chat = $("[data-chat]");
  var marks = $$("[data-m]"), found = $$("[data-f]"), tasks = $$("[data-t]"), slots = $$("[data-s]"), bks = $$("[data-b]");
  var pop = $("[data-pop]"), popT = $("[data-popt]"), popO = $("[data-popo]"), cursor = $("[data-cursor]");
  var card1 = $("[data-card1]"), card2 = $("[data-card2]"), stamp = $("[data-stamp]"), bfaux = $("[data-bfaux]");
  var res = $("[data-res]"), ring = $("[data-ring]"), score = $("[data-score]"), rows = $$(".res-row");
  var next = $("[data-next]"), psay = $("[data-psay]"), prog = $("[data-prog]"), wtitle = $("[data-wtitle]");
  var step = $("[data-wstep]"), stepN = $("[data-wstepn]"), stepT = $("[data-wstept]"), stepDots = $$("[data-wstep] .dots i");
  var TYPED = "Écris une offre d’emploi pour un poste d’assistant administratif.";
  var SLOTS = [
    ["Rôle", ["chargé·e de recrutement dans une PME", "poète", "avocat·e en droit du travail"]],
    ["Cible", ["des candidats débutants", "des experts en finance", "tout le monde"]],
    ["Objectif", ["donner envie de postuler", "décourager les candidats", "remplir une page"]],
    ["Contexte", ["CDI 35 h à Lyon 7e, prise de poste le 3 mars", "à Paris, 3 500 € par mois", "aucun"]],
    ["Format", ["150 mots, ton chaleureux", "un poème", "trois pages"]]
  ];
  var SLOT_AT = function (i) { return .665 + i * .025; };
  var STEPS = [[.29, .50, "L’apprenant écrit à l’IA"], [.50, .62, "Il repère ce que l’IA invente"], [.62, .80, "Il construit le bon prompt"], [.80, .90, "Il tranche, carte par carte"]];

  function show(name) { Object.keys(views).forEach(function (k) { views[k].classList.toggle("on", k === name); }); }
  function setClass(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }

  var clicks = {}, lastP = 0;
  function clickAt(id, p, at) {                              // déclenche l'onde du clic quand on franchit l'instant en avançant
    if (lastP < at && p >= at && !clicks[id]) { clicks[id] = 1; cursor.classList.remove("click"); void cursor.offsetWidth; cursor.classList.add("click"); }
    if (p < at) clicks[id] = 0;
  }

  /* ---------- rendu d'un instant du récit ---------- */
  function render(p) {
    var vw = stage.clientWidth, vh = stage.clientHeight;
    setClass(nav, "is-solid", window.scrollY > 10);

    // 1. titre, puis l'orbe parle
    var tOut = seg(p, 0, .07);
    hero.style.opacity = String(1 - tOut);
    hero.style.transform = "translateY(" + (-60 * ease(tOut)) + "px)";
    hero.style.visibility = tOut >= 1 ? "hidden" : "visible";
    hint.style.opacity = String(1 - seg(p, 0, .03));
    var sayIn = seg(p, .06, .09), sayOut = seg(p, .2, .23);
    say.style.opacity = String(sayIn * (1 - sayOut));
    say.style.top = (vh * .4 + Math.min(150, vh * .17)) + "px";
    reveal(sayW, seg(p, .08, .19));

    // 2. la fenêtre s'ouvre
    var tw = ease(seg(p, .21, .29)), k = fit * (.9 + .1 * tw);
    var a = area.getBoundingClientRect();
    win.style.opacity = String(tw);
    win.style.transform = "translate(" + ((a.width - W * k) / 2) + "px," + ((a.height - H * k) / 2 + 30 * (1 - tw)) + "px) scale(" + k + ")";
    area.style.pointerEvents = "none";

    // l'orbe et son nuage
    var o = along(ORB_KEYS, p);
    var hideOrb = seg(p, .9, .92);
    orbEl.style.transform = "translate(" + (o.x - ORB / 2) + "px," + (o.y - ORB / 2) + "px) scale(" + o.s + ")";
    orbEl.style.opacity = String(1 - hideOrb);
    var c = along(ORB_KEYS, p, function (n) { return n === "mini" ? "win" : n; });
    var chatDim = seg(p, .43, .47) * (1 - seg(p, .62, .65));
    cloud.draw(c.x, c.y, c.s * ORB * 1.5, (1 - .65 * chatDim) * (1 - hideOrb));

    if (orb) {
      var st = "idle";
      if (p > .07 && p < .2) st = "speaking";
      else if (p >= .29 && p < .34) st = "speaking";
      else if (p >= .34 && p < .43) st = "listening";
      else if (p >= .43 && p < .46) st = "thinking";
      else if (p >= .46 && p < .9) st = "speaking";
      orb.setState(st);
    }

    // bandeau d'étape
    var si = -1; STEPS.forEach(function (s, i) { if (p >= s[0] && p < s[1]) si = i; });
    step.style.opacity = si >= 0 && p > .3 ? "1" : "0";
    if (si >= 0) { stepN.textContent = si + 1; stepT.textContent = STEPS[si][2]; stepDots.forEach(function (d, i) { setClass(d, "on", i <= si); }); }

    // ÉTAPE 1 · écrire à l'IA
    var inBuild = p >= .62;
    show(p < .50 ? "vague" : p < .62 ? "hunt" : p < .80 ? "build" : "swipe");
    if (!inBuild) {
      setWsay("Sophie, votre responsable, vous demande une offre d’emploi.");
      reveal(wsayW, seg(p, .29, .33));
    } else {
      setWsay("Complétez chaque case orange.");
      reveal(wsayW, seg(p, .645, .665));
    }
    wsay.style.opacity = String(inBuild ? 1 - seg(p, .8, .81) * 0 : 1 - seg(p, .42, .44));
    var sent = p >= .43 && !inBuild;
    setClass(comp, "on", (p >= .335 && p < .43) || (inBuild && p < .8));
    setClass(comp, "is-tpl", inBuild);
    var typed = seg(p, .345, .41);
    if (!inBuild) {
      if (p < .335) inp.innerHTML = '<span class="ph">Le champ s’activera quand ce sera à vous d’écrire.</span>';
      else if (sent) inp.innerHTML = '<span class="ph">Le champ s’activera quand ce sera à vous d’écrire.</span>';
      else inp.innerHTML = TYPED.slice(0, Math.round(TYPED.length * typed)).replace(/&/g, "&amp;").replace(/</g, "&lt;") + '<span class="caret"></span>';
    }
    setClass(send, "on", (typed >= 1 && !sent && !inBuild) || (inBuild && p >= .79 && p < .8));
    setClass(send, "press", p >= .425 && p < .435);
    setClass(u1, "on", sent);
    setClass(ai, "on", p >= .45 && !inBuild);
    reveal(aiWords, seg(p, .45, .495));
    $(".m-sim").style.opacity = p >= .495 ? "1" : "0";
    chat.style.opacity = String(1 - seg(p, .62, .635));
    wtitle.textContent = sent ? TYPED : "Nouvelle conversation";
    setClass(tasks[0], "cur", p < .43); setClass(tasks[0], "done", p >= .43);
    setClass(tasks[1], "cur", p >= .43 && p < .495); setClass(tasks[1], "done", p >= .495);
    tasks.forEach(function (t, i) { t.querySelector(".n").innerHTML = t.classList.contains("done") ? '<svg><use href="#i-check"/></svg>' : String(i + 1); });
    setClass($('[data-fb="vague"]'), "on", p >= .495);

    // ÉTAPE 2 · repérer les inventions
    marks.forEach(function (m, i) { var on = p >= .535 + i * .028 && !inBuild; setClass(m, "on", on); setClass(found[i], "on", on); });
    setClass($('[data-fb="hunt"]'), "on", p >= .605);

    // ÉTAPE 3 · compléter les cases orange
    var openI = -1;
    slots.forEach(function (s, i) {
      var t0 = SLOT_AT(i), set = p >= t0 + .017;
      if (p >= t0 && p < t0 + .02) openI = i;
      setClass(s, "set", set); setClass(s, "open", openI === i && !set);
      var txt = set ? SLOTS[i][1][0] : SLOTS[i][0];
      if (s.textContent !== txt) s.textContent = txt;
      setClass(bks[i], "on", set);
    });
    if (openI >= 0 && inBuild) {
      if (popT.textContent !== SLOTS[openI][0]) {
        popT.textContent = SLOTS[openI][0];
        popO.innerHTML = SLOTS[openI][1].map(function (o) { return '<span class="pop-o">' + o + "</span>"; }).join("");
      }
      var sr = inWin(slots[openI]), left = clamp(sr.x - 150, 8, 770 - 308);
      pop.style.left = left + "px"; pop.style.top = (sr.t - 48 - pop.offsetHeight - 14) + "px";
      pop.style.setProperty("--ax", (sr.x - left) + "px");
      $$(".pop-o", popO).forEach(function (b, j) { setClass(b, "on", j === 0 && p >= SLOT_AT(openI) + .011); });
    }
    setClass(pop, "on", openI >= 0 && inBuild);

    // ÉTAPE 4 · trancher
    var sw = ease(seg(p, .83, .875));
    card1.style.transform = "translateX(" + (-620 * sw) + "px) rotate(" + (-20 * sw) + "deg)";
    card1.style.opacity = String(1 - seg(p, .86, .88));
    stamp.style.opacity = String(seg(p, .815, .835));
    card2.style.transform = "scale(" + (.94 + .06 * sw) + ") translateY(" + (14 * (1 - sw)) + "px)";
    setClass(bfaux, "press", p >= .825 && p < .875);

    // pied du panneau
    var say2 = p < .43 ? "Envoyez-la, et regardez le résultat." : p < .50 ? "Lisez la réponse de l’IA." : p < .62 ? "Trouvez les trois inventions." : p < .80 ? "Complétez les cases orange." : "Glissez la carte.";
    if (psay.textContent !== say2) psay.textContent = say2;
    setClass(next, "on", (p >= .495 && p < .50) || (p >= .605 && p < .62) || (p >= .79 && p < .80) || (p >= .88 && p < .9));
    prog.style.width = (8 + 85 * seg(p, .29, .9)) + "%";

    // RÉSULTAT
    var tr = seg(p, .92, .975);
    setClass(res, "on", p >= .905);
    ring.style.strokeDashoffset = String(326.7 * (1 - .85 * ease(tr)));
    score.textContent = String(Math.round(17 * ease(tr)));
    rows.forEach(function (r, i) { setClass(r, "on", p >= .93 + i * .01); });

    // curseur de démonstration
    var cp = cursorAt(p);
    cursor.style.opacity = cp ? "1" : "0";
    if (cp) cursor.style.transform = "translate(" + cp.x + "px," + cp.y + "px)";
    clickAt("send", p, .425);
    marks.forEach(function (m, i) { clickAt("m" + i, p, .535 + i * .028); });
    slots.forEach(function (s, i) { clickAt("s" + i, p, SLOT_AT(i) + .002); clickAt("o" + i, p, SLOT_AT(i) + .011); });
    clickAt("faux", p, .825);
    lastP = p;
  }

  function cursorAt(p) {
    function mv(a, b, t) { t = ease(t); return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
    if (p >= .4 && p < .45) {                                   // vers le bouton Envoyer
      var s = inWin(send), from = { x: s.x - 160, y: s.y - 90 };
      return mv(from, s, seg(p, .405, .42));
    }
    if (p >= .515 && p < .615) {                                // sur chaque invention
      var pts = marks.map(function (m) { return inWin(m); });
      if (p < .535) return mv({ x: pts[0].x + 120, y: pts[0].y + 120 }, pts[0], seg(p, .515, .532));
      if (p < .563) return mv(pts[0], pts[1], seg(p, .54, .56));
      return mv(pts[1], pts[2], seg(p, .568, .588));
    }
    if (p >= .655 && p < .79) {                                 // case, puis le bon choix
      for (var i = 0; i < slots.length; i++) {
        var t0 = SLOT_AT(i);
        if (p < t0 + .025) {
          var sl = inWin(slots[i]), prev = i > 0 ? inWin(slots[i - 1]) : { x: sl.x + 120, y: sl.y + 80 };
          if (p < t0 + .004) return mv(prev, sl, seg(p, t0 - .012, t0));
          var opt = $(".pop-o", popO);
          var oc = opt && pop.classList.contains("on") ? inWin(opt) : sl;
          if (p < t0 + .02) return mv(sl, oc, seg(p, t0 + .004, t0 + .01));
          return mv(oc, sl, seg(p, t0 + .02, t0 + .025));
        }
      }
      return null;
    }
    if (p >= .805 && p < .88) {                                 // attrape la carte et la jette à gauche
      var b = inWin(bfaux);
      return mv({ x: b.x + 140, y: b.y - 120 }, b, seg(p, .805, .82));
    }
    return null;
  }

  /* ---------- boucle : le récit suit le défilement, en douceur ---------- */
  var P = 0, force = true;
  function progress() { var r = story.getBoundingClientRect(), total = r.height - window.innerHeight; return clamp(-r.top / total, 0, 1); }
  function loop() {
    var t = progress(), d = t - P;
    P = Math.abs(d) < .0004 ? t : P + d * .14;
    render(P);
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", function () { layout(); cloud.size(); });
  layout(); cloud.size();
  requestAnimationFrame(loop);

  /* ---------- liste des modules ---------- */
  var PARCOURS = [
    ["Démarrer", [["Première rencontre", "Découvrir l’IA, écrire un premier prompt."]]],
    ["Rédiger des prompts", [["La structure d’un prompt", "Rôle, cible, objectif, contexte, format."], ["Des prompts pour les images", "Décrire un visuel pour un post ou un rapport."]]],
    ["Améliorer les contenus", [["Dialoguer pour affiner", "Enrichir le contexte, corriger sans recommencer."], ["Optimiser un contenu existant", "Réécrire selon un ton, un format, une contrainte."]]],
    ["Protéger les données", [["Ce qu’on ne partage pas", "Repérer les données sensibles, anonymiser."]]],
    ["Des contenus pour tous", [["Écrire pour tous", "Un texte clair pour un handicap cognitif."], ["Images, audio, vidéo accessibles", "Texte alternatif, transcription, sous-titres.", 1]]],
    ["Le cadre légal", [["RGPD et IA Act : l’essentiel", "Les règles utiles au poste de travail.", 1], ["Biais et risques", "Analyser un cas, proposer des corrections."], ["Tenir sa veille réglementaire", "Sources officielles, textes à jour.", 1]]],
    ["Intégrer l’IA à son poste", [["Cartographier son poste", "Repérer les tâches que l’IA peut optimiser."], ["Choisir ses outils", "Comparer les outils, estimer un budget.", 1], ["Son plan d’intégration", "Rédiger la stratégie, sans oublier le handicap."]]],
    ["Se préparer", [["Préparer la certification", "Entraînements au format des mises en situation."]]]
  ];
  var mods = $("[data-mods]"), n = 0;
  if (mods) PARCOURS.forEach(function (part) {
    var el = document.createElement("section"); el.className = "part";
    el.innerHTML = "<h3></h3><ol></ol>"; el.firstChild.textContent = part[0];
    part[1].forEach(function (m) {
      n++;
      var li = document.createElement("li");
      li.innerHTML = "<span></span><div><b></b><small></small></div>";
      li.firstChild.textContent = String(n).padStart(2, "0");
      li.querySelector("b").textContent = m[0];
      if (m[2]) { var s = document.createElement("span"); s.className = "star"; s.textContent = "*"; li.querySelector("b").appendChild(s); }
      li.querySelector("small").textContent = m[1];
      el.lastChild.appendChild(li);
    });
    mods.appendChild(el);
  });
})();
