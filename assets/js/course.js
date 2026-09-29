/* ==========================================================================
   Moteur du module — navigation, mémorisation, interactions.
   Le suivi passe par `Tracking` : aujourd'hui localStorage, demain l'API SCORM.
   ========================================================================== */
(function () {
  "use strict";

  var TOTAL_SCREENS = 18;          // nombre d'écrans prévu dans le module final
  var STAGE_W = 1600, STAGE_H = 900;

  var stage = document.getElementById("stage");
  var slides = Array.prototype.slice.call(stage.querySelectorAll(".slide"));
  var photos = stage.querySelectorAll(".photo img");
  var backBtn = stage.querySelector("[data-prev]");
  var currentEl = stage.querySelector("[data-current]");
  var progressEl = stage.querySelector(".progress span");
  var toastEl = stage.querySelector(".toast");
  stage.querySelector("[data-total]").textContent = pad(TOTAL_SCREENS);

  /* ---------- Suivi (point d'entrée unique pour le futur adaptateur SCORM) ---------- */

  var Tracking = {
    key: "module3-claude",
    load: function () {
      try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
      catch (e) { return {}; }
    },
    save: function (data) {
      try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) { /* stockage indisponible */ }
    }
  };
  window.CourseTracking = Tracking;

  /* ---------- Intégration dans l'atelier (panneau de formation à côté de Claude) ---------- */

  // ouvert dans l'atelier : la voix passe par l'assistant pédagogique du parent
  var EMBED = window.parent !== window && /[?&]embed\b/.test(location.search);
  if (EMBED) document.documentElement.classList.add("is-embed");
  function tell(msg) {
    if (!EMBED) return;
    msg.src = "module3";
    try { window.parent.postMessage(msg, location.origin && location.origin !== "null" ? location.origin : "*"); } catch (e) { /* parent indisponible */ }
  }

  var state = Tracking.load();
  state.visited = state.visited || [];
  state.spots = state.spots || [];

  /* ---------- Mise à l'échelle de la scène ---------- */

  // sous 820 px de large, la scène 16:9 devient une page où les colonnes s'empilent
  var FLOW_MAX = 820;
  var fitEls = stage.querySelectorAll("[data-fit]");

  function fit() {
    var flow = window.innerWidth < FLOW_MAX;
    document.documentElement.classList.toggle("is-flow", flow);
    if (!flow) {
      stage.style.setProperty("--scale", Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
      fitEls.forEach(function (el) { el.style.zoom = ""; el.style.removeProperty("--fw"); });
      return;
    }
    // les maquettes d'interface gardent leurs proportions, réduites à la largeur disponible
    var avail = window.innerWidth - 32;
    fitEls.forEach(function (el) {
      var w = +el.dataset.fit;
      el.style.setProperty("--fw", w + "px");
      el.style.zoom = Math.min(1, avail / w);
    });
  }
  window.addEventListener("resize", fit);
  fit();

  /* ---------- Navigation ---------- */

  var index = -1;

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function applyPhoto(slide) {
    // valeurs propres à l'écran (style inline), sinon valeurs par défaut
    var defaults = { "--pw": "0px", "--ph": "900px", "--pr": "0px", "--pos": "60% 0%", "--dock-x": "800px", "--back-x": "32px" };
    Object.keys(defaults).forEach(function (v) {
      stage.style.setProperty(v, slide.style.getPropertyValue(v).trim() || defaults[v]);
    });
    stage.toggleAttribute("data-fade", slide.hasAttribute("data-fade"));
    stage.toggleAttribute("data-back-on-photo", slide.hasAttribute("data-back-on-photo"));
    stage.toggleAttribute("data-nophoto", slide.getAttribute("data-photo") === "none");
    var which = slide.getAttribute("data-photo");
    for (var i = 0; i < photos.length; i++) {
      photos[i].classList.toggle("is-on", photos[i].getAttribute("data-photo") === which);
    }
  }

  function go(next) {
    if (next === index) return;
    if (next < 0) return;
    if (next >= slides.length) {
      toast("L’écran suivant arrive bientôt.");
      return false;
    }

    var prev = slides[index];
    var dir = next > index ? 1 : -1;
    if (prev) {
      prev.style.setProperty("--dir", dir);
      prev.classList.remove("is-active");
      prev.classList.add("is-leaving");
      setTimeout(function () { prev.classList.remove("is-leaving"); }, 460);
      closeTips(prev);
    }

    index = next;
    var slide = slides[index];
    // relance les animations d'entrée à chaque visite
    void slide.offsetWidth;
    slide.classList.add("is-active");

    applyPhoto(slide);
    loadVoice(slide);
    slide.dispatchEvent(new CustomEvent("slide:enter"));
    var h1 = slide.querySelector(".h1"), lead = slide.querySelector(".lead");
    tell({ type: "screen", index: index, code: screenCode(index), total: TOTAL_SCREENS,
      audio: slide.getAttribute("data-audio") || null,
      title: h1 ? h1.textContent.trim() : slide.getAttribute("aria-label"),
      lead: lead ? lead.textContent.trim() : "" });
    slide.querySelectorAll("[data-match]").forEach(function (m) { if (m._redraw) setTimeout(m._redraw, 60); });
    currentEl.textContent = pad(index + 1);
    progressEl.style.setProperty("--p", ((index + 1) / TOTAL_SCREENS * 100) + "%");
    backBtn.hidden = index === 0;

    if (state.visited.indexOf(index) < 0) state.visited.push(index);
    state.location = index;
    Tracking.save(state);
    if (history.replaceState) history.replaceState(null, "", "#" + (index + 1));

    if (document.documentElement.classList.contains("is-flow")) window.scrollTo(0, 0);
    var focusTarget = slide.querySelector(".h1");
    if (focusTarget) { focusTarget.setAttribute("tabindex", "-1"); focusTarget.focus({ preventScroll: true }); }
    return true;
  }

  stage.addEventListener("click", function (e) {
    var nextBtn = e.target.closest("[data-next]");
    if (nextBtn) {
      if (go(index + 1) === false) {
        nextBtn.classList.remove("is-denied", "is-ready");
        void nextBtn.offsetWidth;
        nextBtn.classList.add("is-denied");
      }
    }
    if (e.target.closest("[data-prev]")) go(index - 1);
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (!stage.querySelector("[data-menu]").hidden) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") go(index + 1);
    if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
    if (e.key === "Escape") closeTips(slides[index]);
  });

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }

  /* ---------- Repères interactifs (écran 4) ---------- */

  var SPOTS = {
    1: { title: "Nouvelle conversation", text: "Démarrez un échange vierge pour chaque nouvelle tâche : Claude part d’un contexte propre." },
    2: { title: "Zone de saisie", text: "Écrivez votre demande ici, ou collez directement vos notes. Plus la consigne est claire, meilleure est la réponse." },
    3: { title: "Envoi", text: "Cliquez sur la flèche, ou appuyez sur Entrée, pour envoyer votre message à Claude." },
    4: { title: "Échanges précédents", text: "Vos conversations passées restent accessibles ici. Rouvrez-en une pour reprendre là où vous en étiez." }
  };

  Array.prototype.forEach.call(stage.querySelectorAll("[data-hotspots]"), function (app) {
    var tip = app.querySelector(".tip");
    var spots = app.querySelectorAll(".hotspot");
    var explored = app.querySelector(".explored");
    var open = null;

    function refresh() {
      var n = 0;
      spots.forEach(function (s) {
        var seen = state.spots.indexOf(s.dataset.spot) >= 0;
        s.classList.toggle("is-seen", seen);
        if (seen) n++;
      });
      explored.querySelector(".label").textContent = n === spots.length ? "Tous les repères vus" : n + " / " + spots.length + " repères";
      explored.querySelector(".bar span").style.setProperty("--e", (n / spots.length * 100) + "%");
      explored.classList.toggle("is-done", n === spots.length);
      if (n === spots.length) showNote(app.closest(".content").querySelector("[data-spots-fb]"));
    }

    function show(id) {
      var spot = app.querySelector('.hotspot[data-spot="' + id + '"]');
      var data = SPOTS[id];
      var xy = spot.dataset.tip.split(",").map(Number);
      open = id;

      spots.forEach(function (s) { s.classList.toggle("is-open", s === spot); s.setAttribute("aria-expanded", s === spot); });
      app.querySelectorAll(".target").forEach(function (t) { t.classList.toggle("is-lit", t.dataset.target === id); });

      tip.querySelector(".k").textContent = "Repère " + id;
      tip.querySelector("h5").textContent = data.title;
      tip.querySelector("p").textContent = data.text;
      tip.querySelector("small").textContent = id + " sur " + spots.length;
      tip.style.left = (xy[0] < 0 ? app.clientWidth + xy[0] : xy[0]) + "px";
      tip.style.top = xy[1] + "px";
      tip.classList.remove("is-on");
      void tip.offsetWidth;
      tip.classList.add("is-on");

      if (state.spots.indexOf(id) < 0) { state.spots.push(id); Tracking.save(state); }
      refresh();
    }

    function hide() {
      open = null;
      tip.classList.remove("is-on");
      spots.forEach(function (s) { s.classList.remove("is-open"); s.setAttribute("aria-expanded", "false"); });
      app.querySelectorAll(".target").forEach(function (t) { t.classList.remove("is-lit"); });
    }
    app._hide = hide;

    app.addEventListener("click", function (e) {
      var spot = e.target.closest(".hotspot");
      var target = e.target.closest(".target");
      if (e.target.closest("[data-tip-next]")) {
        var nextId = String(Number(open) % spots.length + 1);
        show(nextId);
        return;
      }
      if (e.target.closest(".tip")) return;
      if (spot) { spot.dataset.spot === open ? hide() : show(spot.dataset.spot); return; }
      if (target) { e.stopPropagation(); show(target.dataset.target); return; }
      hide();
    });

    document.addEventListener("click", function (e) {
      if (open && !app.contains(e.target)) hide();
    });

    refresh();
  });

  function closeTips(slide) {
    if (!slide) return;
    slide.querySelectorAll("[data-hotspots]").forEach(function (a) { if (a._hide) a._hide(); });
  }

  window.addEventListener("hashchange", function () {
    var n = parseInt(location.hash.slice(1), 10);
    if (!isNaN(n)) go(Math.max(0, Math.min(slides.length - 1, n - 1)));
  });

  /* ---------- Copier dans le presse-papiers ---------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* copie refusée */ }
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject();
  }
  function readable(el) {
    // conserve paragraphes et puces pour un collage propre dans Claude
    var out = [];
    Array.prototype.forEach.call(el.children.length ? el.children : [el], function (node) {
      if (node.tagName === "UL") {
        Array.prototype.forEach.call(node.children, function (li) { out.push("- " + li.textContent.trim()); });
      } else {
        // ligne vide après la consigne, avant « Notes : »
        if (out.length && node.previousElementSibling && node.previousElementSibling.tagName === "P" && !/^Notes/.test(out[out.length - 1])) out.push("");
        out.push(node.textContent.replace(/\s+/g, " ").trim());
      }
    });
    return out.join("\n");
  }

  stage.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    var src = stage.querySelector('[data-copy-src="' + btn.dataset.copy + '"]');
    var label = btn.querySelector("span");
    var initial = label.dataset.initial || (label.dataset.initial = label.textContent);
    copyText(readable(src)).then(function () {
      label.textContent = "Copié";
      btn.classList.add("is-done");
      if (btn.hasAttribute("data-copy-fb")) showNote(btn.closest(".slide").querySelector("[data-copy-note]"));
    }, function () {
      label.textContent = "Sélectionnez le texte";
    });
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { label.textContent = initial; btn.classList.remove("is-done"); }, 2000);
  });

  /* ---------- Écran 5 : associer étiquettes et catégories ---------- */

  // une couleur par catégorie : toutes les étiquettes rangées dans une catégorie prennent sa couleur
  var CAT_COLORS = ["#1f5cf0", "#e2560d", "#7c4dff", "#0f9aa8"];

  Array.prototype.forEach.call(stage.querySelectorAll("[data-match]"), function (box) {
    var slide = box.closest(".slide");
    var svg = box.querySelector(".match-lines");
    var help = slide.querySelector(".match-help");
    var cta = slide.querySelector("[data-check='match']");
    var ctaLabel = cta.querySelector(".cta-label");
    var cards = Array.prototype.slice.call(box.querySelectorAll(".m-card"));
    var needs = cards.filter(function (c) { return c.dataset.side === "need"; });
    var fns = cards.filter(function (c) { return c.dataset.side === "fn"; });
    var links = [];          // [{ need, fn, state, drawn }] — une catégorie accepte plusieurs étiquettes
    var selected = null;
    var saved = state.match || (state.match = { attempts: 0, done: false });

    fns.forEach(function (f, i) {
      f.dataset.color = CAT_COLORS[i % CAT_COLORS.length];
      var n = document.createElement("span");
      n.className = "m-count";
      n.setAttribute("aria-hidden", "true");
      f.appendChild(n);
    });

    function linkOf(need) {
      for (var i = 0; i < links.length; i++) if (links[i].need === need) return links[i];
      return null;
    }
    function linksTo(fn) { return links.filter(function (l) { return l.fn === fn; }); }

    function draw() {
      svg.innerHTML = "";
      links.forEach(function (l) {
        // les positions sont lues en unités de la scène (indépendantes du zoom)
        var a = l.need, b = l.fn;
        var x1 = a.offsetParent.offsetLeft + a.offsetLeft + a.offsetWidth - 20;
        var y1 = a.offsetParent.offsetTop + a.offsetTop + a.offsetHeight / 2;
        var x2 = b.offsetParent.offsetLeft + b.offsetLeft + 20;
        var y2 = b.offsetParent.offsetTop + b.offsetTop + b.offsetHeight / 2;
        var dx = (x2 - x1) * 0.55;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2);
        path.setAttribute("stroke", l.state === "good" ? "#1a9a5a" : l.state === "bad" ? "#d93636" : l.fn.dataset.color);
        svg.appendChild(path);
        path.style.setProperty("--len", path.getTotalLength());
        if (l.drawn) { path.style.animation = "none"; path.style.strokeDashoffset = 0; }
        l.drawn = true;
      });
    }

    function paint() {
      needs.forEach(function (c) {
        var l = linkOf(c);
        c.classList.toggle("is-paired", !!l);
        c.classList.toggle("is-good", !!l && l.state === "good");
        c.classList.toggle("is-bad", !!l && l.state === "bad");
        c.classList.toggle("is-locked", !!l && l.state === "good");
        c.style.setProperty("--c", l && !l.state ? l.fn.dataset.color : "");
      });
      fns.forEach(function (c) {
        var ls = linksTo(c);
        c.classList.toggle("is-paired", ls.length > 0);
        c.classList.toggle("is-good", ls.length > 0 && ls.every(function (l) { return l.state === "good"; }));
        c.classList.toggle("is-bad", ls.some(function (l) { return l.state === "bad"; }));
        c.style.setProperty("--c", ls.length && !ls[0].state ? c.dataset.color : "");
        var n = c.querySelector(".m-count");
        if (n) n.textContent = ls.length > 1 ? ls.length : "";
      });
      cards.forEach(function (c) {
        c.classList.toggle("is-selected", c === selected);
        c.setAttribute("aria-pressed", c === selected);
      });
      draw();
    }

    function setHelp(text, tone) {
      help.textContent = text;
      help.classList.toggle("is-good", tone === "good");
      help.classList.toggle("is-bad", tone === "bad");
    }

    function progressHelp() {
      var left = needs.length - links.length;
      setHelp(left ? (selected ? (selected.dataset.side === "need" ? "Choisissez maintenant sa catégorie." : "Choisissez maintenant une étiquette.")
                               : "Encore " + left + " étiquette" + (left > 1 ? "s" : "") + " à placer.")
                   : "Toutes les étiquettes sont placées. Cliquez sur Valider.");
    }

    function assign(need, fn) {
      var l = linkOf(need);
      if (l) links.splice(links.indexOf(l), 1);
      links.push({ need: need, fn: fn });
      selected = null;
      progressHelp();
      paint();
    }

    function onCard(card) {
      if (saved.done || card.classList.contains("is-locked")) return;
      var side = card.dataset.side;
      if (selected && selected !== card && selected.dataset.side !== side) {
        assign(side === "need" ? card : selected, side === "fn" ? card : selected);
        return;
      }
      if (side === "need" && !selected && linkOf(card)) {       // re-choisir une étiquette déjà placée
        links.splice(links.indexOf(linkOf(card)), 1);
      }
      selected = selected === card ? null : card;
      progressHelp();
      paint();
    }

    var suppressClick = false;
    box.addEventListener("click", function (e) {
      var card = e.target.closest(".m-card");
      if (!card) return;
      if (suppressClick) { suppressClick = false; return; }
      onCard(card);
    });

    /* glisser-déposer : une étiquette se dépose sur une catégorie */
    var drag = null;
    box.addEventListener("pointerdown", function (e) {
      var card = e.target.closest('.m-card[data-side="need"]');
      if (!card || saved.done || card.classList.contains("is-locked") || e.button !== 0) return;
      drag = { card: card, x: e.clientX, y: e.clientY, ghost: null, over: null };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.ghost) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
        var r = drag.card.getBoundingClientRect();
        var g = drag.card.cloneNode(true);
        g.classList.add("m-ghost");
        g.style.width = drag.card.offsetWidth + "px";
        g.style.height = drag.card.offsetHeight + "px";
        g.style.setProperty("--gs", r.width / drag.card.offsetWidth);
        document.body.appendChild(g);
        drag.ghost = g;
        drag.dx = e.clientX - r.left;
        drag.dy = e.clientY - r.top;
        drag.card.classList.add("is-dragging");
      }
      drag.ghost.style.left = (e.clientX - drag.dx) + "px";
      drag.ghost.style.top = (e.clientY - drag.dy) + "px";
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest && el.closest('.m-card[data-side="fn"]');
      if (over !== drag.over) {
        if (drag.over) drag.over.classList.remove("is-drop");
        if (over) over.classList.add("is-drop");
        drag.over = over;
      }
    });
    window.addEventListener("pointerup", function () {
      if (!drag) return;
      if (drag.ghost) {
        drag.ghost.remove();
        drag.card.classList.remove("is-dragging");
        if (drag.over) { drag.over.classList.remove("is-drop"); assign(drag.card, drag.over); }
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
      drag = null;
    });

    function succeed() {
      saved.done = true;
      Tracking.save(state);
      cta.classList.add("is-success");
      ctaLabel.textContent = "Continuer";
      // différé : le clic de validation ne doit pas aussi faire avancer
      setTimeout(function () { cta.setAttribute("data-next", ""); }, 0);
      cta.removeAttribute("data-check");
      setHelp("Bravo, les quatre associations sont exactes.", "good");
    }

    cta.addEventListener("click", function () {
      if (saved.done) return;                  // la navigation est gérée par [data-next]
      if (links.length < needs.length) {
        setHelp("Placez les quatre étiquettes avant de valider.", "bad");
        cta.classList.remove("is-denied"); void cta.offsetWidth; cta.classList.add("is-denied");
        return;
      }
      saved.attempts++;
      var wrong = 0;
      links.forEach(function (l) {
        l.state = l.need.dataset.key === l.fn.dataset.key ? "good" : "bad";
        l.drawn = false;
        if (l.state === "bad") wrong++;
      });
      // le score retenu est celui du premier essai (1 point par association exacte)
      if (saved.firstScore == null) saved.firstScore = links.length - wrong;
      selected = null;
      paint();
      Tracking.save(state);
      if (!wrong) { succeed(); return; }
      setHelp(wrong + " association" + (wrong > 1 ? "s" : "") + " à revoir. Les bonnes réponses restent en place.", "bad");
      setTimeout(function () {
        links = links.filter(function (l) { return l.state === "good"; });
        paint();
      }, 1400);
    });

    // exercice déjà réussi lors d'une visite précédente : on affiche la solution
    if (saved.done) {
      needs.forEach(function (n) {
        var f = fns.filter(function (x) { return x.dataset.key === n.dataset.key; })[0];
        links.push({ need: n, fn: f, state: "good" });
      });
      succeed();
    }
    box._redraw = function () { links.forEach(function (l) { l.drawn = false; }); paint(); };
  });

  /* ---------- Retours pédagogiques des écrans de contenu ---------- */

  function showNote(el) { if (el) el.classList.add("is-on"); }
  stage.querySelectorAll(".fb-note[data-always]").forEach(showNote);

  /* ---------- Écran 2 : accès réel ou simulation (enregistrés séparément) ---------- */

  state.practice = state.practice || { declared: false, deposited: false, simulated: false };

  stage.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.setAttribute("aria-pressed", state.mode === btn.dataset.mode);
    btn.addEventListener("click", function () {
      state.mode = btn.dataset.mode;
      if (state.mode === "reel") state.practice.declared = true;
      if (state.mode === "simulation") state.practice.simulated = true;
      stage.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn); });
      Tracking.save(state);
    });
  });

  /* ---------- Écran 3 : cliquer sur les noms, puis sur les échéances ---------- */

  stage.querySelectorAll("[data-tokens]").forEach(function (p) {
    var slide = p.closest(".slide");
    var done = state.tok03 || (state.tok03 = {});
    var FILL = {
      nora: { a1: "Préparer l’affiche", r1: "Nora" },
      sami: { a2: "Vérifier le stock", r2: "Sami" },
      d5: { e1: "5 novembre" },
      d6: { e2: "6 novembre" }
    };
    function cell(id) { return slide.querySelector('[data-cell="' + id + '"]'); }
    function paint(animate) {
      Object.keys(FILL).forEach(function (k) {
        var t = p.querySelector('[data-tok="' + k + '"]');
        t.classList.toggle("is-done", !!done[k]);
        if (done[k]) Object.keys(FILL[k]).forEach(function (c) {
          var el = cell(c);
          if (!el.classList.contains("is-filled")) {
            el.textContent = FILL[k][c];
            el.classList.add("is-filled");
            if (animate) { el.classList.add("is-pop"); }
          }
        });
      });
      var namesDone = done.nora && done.sami;
      ["d5", "d6"].forEach(function (k) {
        var t = p.querySelector('[data-tok="' + k + '"]');
        t.disabled = !namesDone || !!done[k];
        t.classList.toggle("is-next", namesDone && !done[k]);
      });
      ["nora", "sami"].forEach(function (k) { p.querySelector('[data-tok="' + k + '"]').disabled = !!done[k]; });
      if (namesDone && done.d5 && done.d6) {
        cell("a3").textContent = "Confirmer le lieu";
        cell("r3").innerHTML = '<span class="unk">à confirmer</span>';
        cell("e3").innerHTML = '<span class="unk">à confirmer</span>';
        ["a3", "r3", "e3"].forEach(function (c) { cell(c).classList.add("is-filled"); });
        slide.querySelector("[data-tok-hint]").hidden = true;
        showNote(slide.querySelector("[data-tok-fb]"));
      }
    }
    p.addEventListener("click", function (e) {
      var t = e.target.closest(".tok");
      if (!t || t.disabled) return;
      done[t.dataset.tok] = true;
      Tracking.save(state);
      paint(true);
    });
    paint(false);
  });

  /* ---------- Écran 7 : révéler le prompt, puis la réponse ---------- */

  stage.querySelectorAll(".s-result").forEach(function (slide) {
    var level = state.reveal07 || 0;
    var fbTimer;
    function paint(animate) {
      ["prompt", "answer"].forEach(function (k, i) {
        var panel = slide.querySelector('[data-reveal-panel="' + k + '"]');
        var on = level > i;
        panel.classList.toggle("is-veiled", !on);
        panel.classList.toggle("is-revealed", on);
        if (on && !animate) panel.classList.add("no-stream");
      });
      slide.querySelector('[data-reveal="answer"]').disabled = level < 1;
      if (level >= 2) {
        clearTimeout(fbTimer);
        fbTimer = setTimeout(function () { showNote(slide.querySelector("[data-reveal-fb]")); }, animate ? 1800 : 0);
      }
    }
    slide.addEventListener("click", function (e) {
      var b = e.target.closest("[data-reveal]");
      if (!b || b.disabled) return;
      level = Math.max(level, b.dataset.reveal === "prompt" ? 1 : 2);
      state.reveal07 = level;
      Tracking.save(state);
      paint(true);
      if (b.dataset.reveal === "prompt") slide.querySelector('[data-reveal="answer"]').focus();
    });
    paint(false);
  });

  /* ---------- Écran 7 : relier chaque ligne à sa note ---------- */

  Array.prototype.forEach.call(stage.querySelectorAll(".s-result"), function (slide) {
    function lit(id) {
      slide.querySelectorAll("[data-link]").forEach(function (el) { el.classList.toggle("is-lit", el.dataset.link === id); });
    }
    slide.addEventListener("mouseover", function (e) {
      var el = e.target.closest("[data-link]");
      lit(el ? el.dataset.link : null);
    });
    slide.addEventListener("mouseleave", function () { lit(null); });
  });

  /* ---------- Écran 8 : tableau à compléter, validé sur 4 critères ---------- */

  var MAX_SUBMISSIONS = 3;
  var CRIT_LABELS = ["Actions conformes", "Responsables exacts", "Échéances exactes", "Inconnues signalées"];
  var STATUS_LABEL = { ok: "Respecté", part: "Partiel", ko: "À reprendre" };

  // contrôle déterministe du tableau déposé, fondé sur la source de l'exercice
  function checkTable(rows) {
    var lines = rows.map(function (r) { return { a: (r[0] || "").toLowerCase(), r: (r[1] || "").toLowerCase(), e: (r[2] || "").toLowerCase() }; })
      .filter(function (l) { return l.a || l.r || l.e; });
    var find = function (re) { return lines.filter(function (l) { return re.test(l.a); })[0]; };
    var aff = find(/affiche/), sto = find(/stock/), lieu = find(/lieu/);
    var np = /non pr[ée]cis[ée]e?/;
    var level = function (n, of) { return n === of ? "ok" : n > 0 ? "part" : "ko"; };

    var c1 = [aff, sto, lieu].filter(Boolean).length;
    var c2 = (aff && /nora/.test(aff.r) ? 1 : 0) + (sto && /sami/.test(sto.r) ? 1 : 0);
    var c3 = (aff && /\b5\b/.test(aff.e) ? 1 : 0) + (sto && /\b6\b/.test(sto.e) ? 1 : 0);
    var c4 = lieu ? (np.test(lieu.r) ? 1 : 0) + (np.test(lieu.e) ? 1 : 0) : 0;
    // un nom ou une date inventés pour le lieu ne peuvent pas être « signalés »
    if (lieu && (/nora|sami/.test(lieu.r) || /\d/.test(lieu.e))) c4 = Math.min(c4, 1);
    return [level(c1, 3), level(c2, 2), level(c3, 2), level(c4, 2)];
  }

  Array.prototype.forEach.call(stage.querySelectorAll("[data-edit-table]"), function (grid) {
    var ROWS = 3, COLS = 3;
    var slide = grid.closest(".slide");
    var status = grid.closest(".box").querySelector(".fill-state");
    var checks = slide.querySelector("[data-checks]");
    var hintHTML = checks.innerHTML;
    var cta = slide.querySelector("[data-check='table']");
    var ctaLabel = cta.querySelector(".cta-label");
    var corr = slide.querySelector("[data-correction]");
    var data = state.table || (state.table = []);
    var build = state.build || (state.build = { subs: [], correctionSeen: false });
    var cells = [];
    var PH = ["Action", "Responsable", "Échéance"];
    var dirty = false;         // modifié depuis la dernière validation

    for (var r = 0; r < ROWS; r++) {
      data[r] = data[r] || ["", "", ""];
      for (var c = 0; c < COLS; c++) {
        var ta = document.createElement("textarea");
        ta.className = "e-cell";
        ta.rows = 2;
        ta.dataset.r = r;
        ta.dataset.c = c;
        ta.value = data[r][c] || "";
        ta.setAttribute("aria-label", PH[c] + ", ligne " + (r + 1));
        if (r === 0 && c === 0) ta.placeholder = "Collez ici…";
        grid.appendChild(ta);
        cells.push(ta);
      }
    }
    data.length = ROWS;

    function filledRows() { return data.filter(function (row) { return row.some(function (v) { return v && v.trim(); }); }).length; }

    function canContinue() { return (build.subs.length && !dirty) || build.correctionSeen || build.subs.length >= MAX_SUBMISSIONS; }

    function refresh() {
      var rows = filledRows();
      status.textContent = rows ? rows + " ligne" + (rows > 1 ? "s" : "") + " remplie" + (rows > 1 ? "s" : "") : "";
      status.classList.toggle("is-done", rows >= 3);
      var cont = canContinue() && !(dirty && build.subs.length < MAX_SUBMISSIONS);
      ctaLabel.textContent = cont ? "Continuer" : "Valider";
      cta.classList.toggle("is-success", cont && build.subs.length > 0 && build.subs[build.subs.length - 1].every(function (s) { return s === "ok"; }));
    }

    function renderChecks() {
      var last = build.subs[build.subs.length - 1];
      if (!last) { checks.innerHTML = hintHTML; return; }
      var ok = last.every(function (s) { return s === "ok"; });
      var left = MAX_SUBMISSIONS - build.subs.length;
      checks.innerHTML =
        '<ul class="crit">' + last.map(function (st, i) {
          return '<li><span class="cs cs--' + st + '">' + STATUS_LABEL[st] + "</span>" + CRIT_LABELS[i] + "</li>";
        }).join("") + "</ul>" +
        '<p class="check-msg ' + (ok ? "is-good" : "is-bad") + '"><b>' + (ok ? "Réussi" : "À reprendre") + " :</b> " +
        (ok ? "Les critères sont respectés. Contrôlez encore les faits avant utilisation."
            : "Comparez avec la source. Corrigez le point indiqué, puis essayez de nouveau.") +
        ' <span class="subs">Soumission ' + build.subs.length + " sur " + MAX_SUBMISSIONS + (ok || !left ? "" : "") + "</span></p>";
    }

    function validate() {
      if (!filledRows()) {
        checks.innerHTML = '<p class="check-msg is-bad">Collez ou saisissez votre tableau, puis validez. Vous pouvez aussi consulter la correction.</p>';
        cta.classList.remove("is-denied"); void cta.offsetWidth; cta.classList.add("is-denied");
        return;
      }
      build.subs.push(checkTable(data));
      state.practice.deposited = true;
      dirty = false;
      Tracking.save(state);
      renderChecks();
      refresh();
    }

    cta.addEventListener("click", function () {
      if (canContinue() && !(dirty && build.subs.length < MAX_SUBMISSIONS)) { go(index + 1); return; }
      validate();
    });

    slide.querySelector("[data-show-correction]").addEventListener("click", function () {
      build.correctionSeen = true;
      Tracking.save(state);
      corr.hidden = false;
      refresh();
    });
    corr.addEventListener("click", function (e) {
      if (e.target === corr || e.target.closest("[data-correction-close]")) corr.hidden = true;
    });

    function parse(text) {
      var rows = text.replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      var out = [];
      rows.forEach(function (line) {
        var parts;
        if (line.indexOf("|") >= 0) {
          parts = line.split("|").map(function (x) { return x.trim(); });
          if (parts[0] === "") parts.shift();
          if (parts[parts.length - 1] === "") parts.pop();
        } else if (line.indexOf("\t") >= 0) {
          parts = line.split("\t").map(function (x) { return x.trim(); });
        } else {
          parts = [line];
        }
        if (parts.every(function (x) { return /^:?-{2,}:?$/.test(x) || x === ""; })) return;   // séparateur markdown
        if (/^\**action\**$/i.test(parts[0])) return;                                             // ligne d'en-tête
        out.push(parts.map(function (x) { return x.replace(/\*\*/g, ""); }));
      });
      return out;
    }

    function changed() {
      if (build.subs.length) dirty = true;
      Tracking.save(state);
      refresh();
    }

    function fill(rows, r0, c0) {
      rows.forEach(function (row, i) {
        row.forEach(function (val, j) {
          var r = r0 + i, c = c0 + j;
          if (r >= ROWS || c >= COLS) return;
          var target = cells[r * COLS + c];
          target.value = val;
          data[r][c] = val;
          target.classList.remove("is-filled-anim"); void target.offsetWidth;
          target.style.animationDelay = (i * 90 + j * 40) + "ms";
          target.classList.add("is-filled-anim");
        });
      });
      changed();
    }

    grid.addEventListener("paste", function (e) {
      var cell = e.target.closest(".e-cell");
      var text = (e.clipboardData || window.clipboardData).getData("text");
      if (!cell || !/[\t|]|\n/.test(text.trim())) return;       // simple texte : collage normal
      var rows = parse(text);
      if (!rows.length) return;
      e.preventDefault();
      fill(rows, +cell.dataset.r, +cell.dataset.c);
    });

    // atelier : reprendre le dernier tableau obtenu dans la conversation Claude
    grid._fromText = function (text) {
      var rows = parse(text || "").filter(function (r) { return r.length >= 2; });
      if (!rows.length) { checks.innerHTML = '<p class="check-msg is-bad">Aucun tableau dans la conversation. Envoyez d’abord votre demande à Claude, à gauche.</p>'; return; }
      cells.forEach(function (t) { t.value = ""; });
      data.forEach(function (row) { row[0] = row[1] = row[2] = ""; });
      fill(rows, 0, 0);
    };
    if (EMBED) {
      var acts = grid.closest(".box").querySelector(".box-actions") || slide.querySelector(".box-actions");
      var imp = document.createElement("button");
      imp.type = "button";
      imp.className = "btn-soft btn-import";
      imp.innerHTML = '<svg><use href="#i-copy"/></svg><span>Reprendre le tableau de Claude</span>';
      imp.addEventListener("click", function () { tell({ type: "need-table" }); });
      grid.closest(".box").querySelector("h3").after(imp);
    }

    grid.addEventListener("input", function (e) {
      var cell = e.target;
      data[+cell.dataset.r][+cell.dataset.c] = cell.value;
      changed();
    });

    renderChecks();
    refresh();
  });

  /* ---------- Quiz à choix unique (écrans 9 et 12) ---------- */

  state.quiz = state.quiz || {};

  Array.prototype.forEach.call(stage.querySelectorAll("[data-quiz]"), function (quiz) {
    var slide = quiz.closest(".slide");
    var id = quiz.dataset.quiz;
    var answer = quiz.dataset.answer;
    var opts = Array.prototype.slice.call(quiz.querySelectorAll(".q-opt"));
    var fb = slide.querySelector(".q-feedback");
    var cta = slide.querySelector("[data-check='quiz']");
    var ctaLabel = cta.querySelector(".cta-label");
    var choice = null;

    function select(value) {
      choice = value;
      opts.forEach(function (o) { o.setAttribute("aria-checked", o.dataset.value === value); });
      fb.classList.remove("is-on");
    }

    function feedback(text, tone) {
      fb.textContent = text;
      fb.className = "q-feedback is-on is-" + tone;
    }

    function reveal(value, animate) {
      var right = value === answer;
      quiz.classList.add("is-locked");
      opts.forEach(function (o) {
        o.classList.toggle("is-right", o.dataset.value === answer);
        o.classList.toggle("is-wrong", o.dataset.value === value && !right);
        if (!animate) o.style.animation = "none";
        o.setAttribute("aria-checked", o.dataset.value === value);
      });
      var chosen = quiz.querySelector('[data-value="' + value + '"]');
      feedback(chosen.dataset.fb, right ? "good" : "bad");
      slide.classList.add("is-answered");
      cta.classList.toggle("is-success", right);
      ctaLabel.textContent = "Continuer";
      cta.removeAttribute("data-check");
      // différé : le clic de validation ne doit pas aussi faire avancer
      setTimeout(function () { cta.setAttribute("data-next", ""); }, 0);
    }

    quiz.addEventListener("click", function (e) {
      var o = e.target.closest(".q-opt");
      if (o && !state.quiz[id]) select(o.dataset.value);
    });
    // navigation au clavier dans le groupe de réponses
    quiz.addEventListener("keydown", function (e) {
      if (state.quiz[id] || !/^Arrow(Up|Down)$/.test(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      var i = Math.max(0, opts.findIndex(function (o) { return o.dataset.value === choice; }));
      var n = opts[(i + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length];
      select(n.dataset.value);
      n.focus();
    });

    cta.addEventListener("click", function () {
      if (state.quiz[id]) return;               // déjà répondu : [data-next] prend le relais
      if (!choice) {
        feedback("Choisissez une réponse avant de valider.", "hint");
        cta.classList.remove("is-denied"); void cta.offsetWidth; cta.classList.add("is-denied");
        return;
      }
      // une seule tentative : c'est une question notée
      state.quiz[id] = { choice: choice, correct: choice === answer, score: choice === answer ? 1 : 0 };
      Tracking.save(state);
      reveal(choice, true);
    });

    if (state.quiz[id]) reveal(state.quiz[id].choice, false);
  });

  /* ---------- Écran 10 : avant / après correction ---------- */

  Array.prototype.forEach.call(stage.querySelectorAll("[data-fix]"), function (fix) {
    var slide = fix.closest(".slide");
    var timer;
    function show(which) {
      fix.classList.toggle("is-before", which === "before");
      if (which === "after") showNote(slide.querySelector("[data-fix-fb]"));
      fix.querySelectorAll("[data-ba]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.ba === which); });
    }
    fix.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ba]");
      if (b) { clearTimeout(timer); show(b.dataset.ba); }
    });
    // à chaque arrivée : on montre l'erreur, puis la correction s'applique
    slide.addEventListener("slide:enter", function () {
      clearTimeout(timer);
      show("before");
      timer = setTimeout(function () { show("after"); }, 2600);
    });
  });

  /* ---------- Écran 11 : simulation de pièce jointe ---------- */

  Array.prototype.forEach.call(stage.querySelectorAll("[data-attach]"), function (tile) {
    var btn = tile.querySelector("[data-attach-btn]");
    var label = btn.querySelector("span");
    btn.addEventListener("click", function () {
      if (tile.classList.contains("is-loading")) return;
      if (tile.classList.contains("is-done")) {         // retirer le fichier
        tile.classList.remove("is-done");
        label.textContent = "Ajouter un fichier";
        return;
      }
      tile.classList.add("is-loading");
      setTimeout(function () {
        tile.classList.remove("is-loading");
        tile.classList.add("is-done");
        label.textContent = "Fichier joint · Retirer";
        state.practice.attachDemo = true;
        Tracking.save(state);
        showNote(tile.closest(".slide").querySelector("[data-copy-note]"));
      }, 1150);
    });
  });

  /* ---------- Écrans 13 et 16 : réponses comparées ---------- */

  state.answers = state.answers || {};
  var WORD_LIMIT = 60;
  // réponse illustrative relue (storyboard), utilisée si la plateforme ne transmet pas la réponse conservée au module 2
  var GPT_REFERENCE = "L’accueil sera fermé le 12 octobre de 14 h à 16 h. Vous pouvez laisser un message pendant cette fermeture. Merci de votre compréhension.";

  function countWords(t) { return (t.match(/\S+/g) || []).length; }

  function conservedGpt() {
    var ctx = window.COURSE_CONTEXT || {};
    if (ctx.chatgptFirstResponse) return { text: ctx.chatgptFirstResponse, source: "module2" };
    try {
      var m2 = localStorage.getItem("module2-chatgpt-premiere-reponse");
      if (m2) return { text: m2, source: "module2" };
    } catch (e) { /* stockage indisponible */ }
    return { text: GPT_REFERENCE, source: "reference" };
  }

  function syncAnswer(key) {
    var text = (state.answers[key] || "").trim();
    var n = countWords(text);
    stage.querySelectorAll('[data-wc="' + key + '"]').forEach(function (wc) {
      wc.textContent = n + " / " + WORD_LIMIT + " mots";
      wc.classList.toggle("is-ok", n > 0 && n <= WORD_LIMIT);
      wc.classList.toggle("is-over", n > WORD_LIMIT);
    });
    // l'écran 16 garde les deux réponses visibles (sinon, le squelette)
    stage.querySelectorAll('[data-answer-view="' + key + '"]').forEach(function (v) {
      if (!v._skeleton) v._skeleton = v.innerHTML;
      if (text) v.textContent = text; else v.innerHTML = v._skeleton;
    });
  }

  var gpt = conservedGpt();
  state.answers.gpt = gpt.text;
  state.answers.gptSource = gpt.source;
  stage.querySelectorAll("[data-gpt-view]").forEach(function (v) { v.textContent = gpt.text; });
  stage.querySelectorAll("[data-gpt-source]").forEach(function (t) {
    t.textContent = gpt.source === "reference" ? "exemple" : "module 2";
  });
  syncAnswer("gpt");

  stage.querySelectorAll("[data-answer-field]").forEach(function (field) {
    var key = field.dataset.answerField;
    field.value = state.answers[key] || "";
    field.addEventListener("input", function () {
      state.answers[key] = field.value;
      Tracking.save(state);
      syncAnswer(key);
    });
    syncAnswer(key);
  });

  /* ---------- Écran 14 : grille de lecture, sans score ---------- */

  var CRITERIA = ["Date et horaires", "Messagerie", "Absence d’ajout", "Longueur demandée"];
  var RUBRIC_OPTIONS = [["", "Choisir…"], ["conforme", "Conforme"], ["corriger", "À corriger"], ["impossible", "Impossible à vérifier"]];

  stage.querySelectorAll("[data-rubric]").forEach(function (grid) {
    var slide = grid.closest(".slide");
    var data = state.rubric || (state.rubric = { gpt: [], claude: [] });
    ["gpt", "claude"].forEach(function (t) {
      data[t] = (data[t] || []).map(function (v) { return /^(conforme|corriger|impossible)$/.test(v) ? v : null; });
    });

    CRITERIA.forEach(function (label, r) {
      var k = document.createElement("div");
      k.className = "rb-k";
      k.textContent = label;
      grid.appendChild(k);
      ["gpt", "claude"].forEach(function (tool) {
        var cell = document.createElement("div");
        cell.className = "rb-c";
        var sel = document.createElement("select");
        sel.className = "rb-sel";
        sel.dataset.tool = tool;
        sel.dataset.r = r;
        sel.setAttribute("aria-label", label + ", " + (tool === "gpt" ? "ChatGPT" : "Claude"));
        RUBRIC_OPTIONS.forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o[0];
          opt.textContent = o[1];
          if (!o[0]) opt.disabled = true;
          sel.appendChild(opt);
        });
        sel.value = data[tool][r] || "";
        sel.dataset.v = sel.value;
        cell.appendChild(sel);
        grid.appendChild(cell);
      });
    });

    function anyFilled() { return data.gpt.some(Boolean) || data.claude.some(Boolean); }
    grid.addEventListener("change", function (e) {
      var sel = e.target.closest(".rb-sel");
      if (!sel) return;
      data[sel.dataset.tool][+sel.dataset.r] = sel.value;
      sel.dataset.v = sel.value;
      Tracking.save(state);
      showNote(slide.querySelector("[data-rubric-fb]"));
    });
    if (anyFilled()) showNote(slide.querySelector("[data-rubric-fb]"));
  });

  /* ---------- Écran 16 : préférence argumentée (continuer à la demande) ---------- */

  stage.querySelectorAll("[data-pick]").forEach(function (pick) {
    var slide = pick.closest(".slide");
    var why = slide.querySelector("[data-why]");
    var note = slide.querySelector("[data-why-fb]");
    var saved = state.pref || (state.pref = { choice: null, text: "" });

    function paint() {
      pick.querySelectorAll(".pick-card").forEach(function (c) { c.setAttribute("aria-checked", c.dataset.pickValue === saved.choice); });
    }
    function store() {
      saved.text = why.value;
      Tracking.save(state);
      if (why.value.trim().length >= 10) showNote(note);
    }

    pick.addEventListener("click", function (e) {
      var c = e.target.closest(".pick-card");
      if (!c) return;
      saved.choice = saved.choice === c.dataset.pickValue ? null : c.dataset.pickValue;
      Tracking.save(state);
      paint();
    });

    slide.querySelectorAll("[data-example]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var base = why.value.trim() || "Pour cette tâche, je retiens cette réponse parce que";
        var sep = /parce que$/.test(base) ? " " : (/[.!?]$/.test(base) ? " " : ", ");
        why.value = base + sep + chip.dataset.example;
        store();
        why.focus();
      });
    });

    why.value = saved.text;
    why.addEventListener("input", store);
    if (why.value.trim().length >= 10) showNote(note);
    paint();
  });

  /* ---------- Écran 17 : score et bilan ---------- */

  function tableScore() {
    var rows = (state.table || []).map(function (r) { return (r || []).join(" | ").toLowerCase(); });
    var has = function (test) { return rows.some(test); };
    var np = /non pr[ée]cis[ée]/g;
    return [
      has(function (r) { return /affiche/.test(r) && /nora/.test(r) && /\b5\b/.test(r); }),
      has(function (r) { return /stock/.test(r) && /sami/.test(r) && /\b6\b/.test(r); }),
      has(function (r) { return /lieu/.test(r) && (r.match(np) || []).length >= 2; })
    ].filter(Boolean).length;
  }

  function claudeAnswerOk() {
    var t = (state.answers && state.answers.claude || "").trim();
    return !!t && countWords(t) <= WORD_LIMIT && /12/.test(t) && /messagerie/i.test(t);
  }

  function quizItem(id, slide, label) {
    var q = state.quiz[id];
    return { slide: slide, label: label, max: 1, pts: q && q.correct ? 1 : 0, done: !!q };
  }

  function scoreItems() {
    var m = state.match || {};
    var tbl = !!(state.build && state.build.subs && state.build.subs.length);
    var claude = !!(state.answers && (state.answers.claude || "").trim());
    return [
      { slide: ".s-match", label: "Associer les commandes", max: 4, pts: m.firstScore || 0, done: m.firstScore != null,
        hint: "1 point par association exacte au premier essai." },
      { slide: ".s-build", label: "Créer votre tableau", max: 3, pts: tableScore(), done: tbl,
        hint: "Lignes attendues : affiche (Nora, 5 novembre), stock (Sami, 6 novembre), lieu (non précisé)." },
      quizItem("q09", ".s-absent", "Traiter le responsable absent"),
      quizItem("q12", ".s-limit", "Repérer une limite"),
      { slide: ".s-fair", label: "Une comparaison équitable", max: 1, pts: claudeAnswerOk() ? 1 : 0, done: claude,
        hint: "Réponse de Claude collée, 60 mots maximum, date et messagerie mentionnées." },
      quizItem("q15", ".s-conclude", "Choisir une conclusion")
    ];
  }

  // pratique réelle : manipulation déclarée (écran 2) et résultat déposé (écran 8), enregistrés séparément de la simulation
  function practiceStatus() {
    var p = state.practice || {};
    return { declared: !!p.declared, deposited: !!p.deposited, simulated: !!p.simulated, real: !!p.deposited && state.mode === "reel" };
  }

  function computeResult() {
    var items = scoreItems();
    var score = 0, max = 0;
    items.forEach(function (it) { score += it.pts; max += it.max; });
    state.result = { score: score, max: max, passed: score / max >= 0.7, practice: practiceStatus() };
    Tracking.save(state);
    return { items: items, result: state.result };
  }

  function fmtScore(n) { return String(n).replace(".", ","); }

  stage.querySelectorAll("[data-results]").forEach(function (slide) {
    var verdict = slide.querySelector(".verdict");
    var count = slide.querySelector("[data-score-count]");
    var panel = slide.querySelector("[data-review]");
    var list = slide.querySelector("[data-review-list]");
    var raf2;

    function render() {
      var out = computeResult(), r = out.result;
      verdict.classList.toggle("is-fail", !r.passed);
      slide.querySelector("[data-verdict-title]").textContent = r.passed ? "Module validé." : "À reprendre";
      slide.querySelector("[data-verdict-msg]").textContent = r.passed
        ? "Validation : 70 % minimum."
        : "Reprenez les activités indiquées, puis tentez une nouvelle réponse.";
      slide.querySelector("[data-score-max]").textContent = r.max;
      slide.querySelector("[data-score-text]").textContent = fmtScore(r.score) + " sur " + r.max;
      var side = slide.querySelector(".verdict-side");
      side.classList.toggle("is-todo", !r.practice.real);
      slide.querySelector("[data-manip]").textContent = r.practice.real ? "Manipulation réalisée" : "Manipulation à réaliser";
      slide.querySelector("[data-manip-msg]").textContent = r.practice.real ? "" : "Terminez la manipulation dans l’outil pour valider la prise en main.";

      // le score défile jusqu'à sa valeur
      cancelAnimationFrame(raf2);
      var t0 = null;
      (function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0 - 900) / 900);
        count.textContent = fmtScore(Math.round(Math.max(0, k) * r.score * 2) / 2);
        if (k < 1) raf2 = requestAnimationFrame(step);
      })(performance.now());

      list.innerHTML = "";
      out.items.forEach(function (it) {
        var li = document.createElement("li");
        var st = !it.done ? "is-todo" : it.pts === it.max ? "is-ok" : it.pts ? "is-partial" : "is-miss";
        li.className = st;
        li.innerHTML = '<span class="st"><svg><use href="' + (st === "is-ok" ? "#i-check" : st === "is-todo" ? "#i-plus" : "#i-x") + '"/></svg></span>' +
          "<span><b></b><small></small></span>" +
          '<span class="pts">' + fmtScore(it.pts) + " / " + it.max + "</span>" +
          (st === "is-ok" ? "<span></span>" : '<button type="button" class="go">Revoir</button>');
        li.querySelector("b").textContent = it.label;
        li.querySelector("small").textContent = !it.done ? "Activité non réalisée." : (it.hint || (it.pts ? "Bonne réponse." : "Réponse à revoir."));
        var g = li.querySelector(".go");
        if (g) g.dataset.slide = it.slide;
        list.appendChild(li);
      });
    }

    slide.addEventListener("slide:enter", render);
    slide.querySelector("[data-review-open]").addEventListener("click", function () { panel.hidden = false; });
    panel.addEventListener("click", function (e) {
      if (e.target === panel || e.target.closest("[data-review-close]")) { panel.hidden = true; return; }
      var g = e.target.closest(".go");
      if (g) {
        panel.hidden = true;
        go(slides.indexOf(stage.querySelector(".slide" + g.dataset.slide)));
      }
    });
  });

  /* ---------- Écran 18 : fiche dans « Mes repères » et fin du module ---------- */

  var GESTURES = ["Fournir la source.", "Préciser le tableau attendu.", "Signaler ce qui manque.", "Comparer les résultats sur les mêmes critères."];

  function sheetHTML() {
    var r = state.result || computeResult().result;
    var esc = function (t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; };
    var arg = state.pref && state.pref.text && state.pref.text.trim();
    var date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ma fiche · Module 3</title><style>' +
      '@font-face{font-family:Inter;src:url(assets/fonts/inter.woff2) format("woff2-variations");font-weight:100 900}' +
      '@font-face{font-family:"Inter Tight";src:url(assets/fonts/inter-tight.woff2) format("woff2-variations");font-weight:100 900}' +
      '@page{size:A4;margin:18mm}body{font-family:Inter,system-ui,sans-serif;color:#0a1233;margin:0}' +
      '.k{font:600 10pt/1 Inter;letter-spacing:.2em;text-transform:uppercase;color:#5b6785}' +
      'h1{font:800 30pt/1 "Inter Tight",Inter;letter-spacing:-.03em;margin:10mm 0 3mm}.bar{width:32mm;height:1.4mm;background:#e2560d;border-radius:1mm}' +
      'h2{font:800 17pt/1.2 "Inter Tight",Inter;letter-spacing:-.02em;margin:9mm 0 5mm}' +
      'ol{list-style:none;padding:0;margin:0;counter-reset:g}li{counter-increment:g;display:flex;align-items:center;gap:5mm;padding:4.5mm 5mm;margin-bottom:3mm;border:1px solid #d9e1ee;border-radius:3mm;font:600 13pt/1.3 Inter}' +
      'li:before{content:counter(g);width:9mm;height:9mm;border-radius:50%;background:#fde9da;color:#c94a08;display:grid;place-items:center;font-weight:700;flex:none}' +
      '.box{border-radius:3mm;padding:5mm 6mm;margin-top:4mm;font-size:11pt;line-height:1.55}.p{background:#eef2f8}.o{background:#fff1e6}' +
      '.box b{display:block;margin-bottom:1.5mm;font-size:10pt;letter-spacing:.04em;text-transform:uppercase;color:#5b6785}' +
      'footer{margin-top:10mm;padding-top:4mm;border-top:1px solid #d9e1ee;display:flex;justify-content:space-between;font-size:10pt;color:#5b6785}' +
      '</style></head><body>' +
      '<div class="k">ChatGPT et Claude · Module 3</div><h1>Votre fiche à conserver</h1><div class="bar"></div>' +
      '<h2>Mes premiers gestes dans Claude</h2><ol>' + GESTURES.map(function (g) { return "<li>" + g + "</li>"; }).join("") + "</ol>" +
      '<div class="box p"><b>Prompt modèle</b>À partir des notes suivantes, crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris « non précisé » pour une donnée absente.</div>' +
      '<div class="box o"><b>Demander une correction</b>« Le responsable de la confirmation du lieu n’est pas indiqué. Remplace-le par non précisé. »</div>' +
      (arg ? '<div class="box p"><b>Mon argument</b>' + esc(arg) + "</div>" : "") +
      "<footer><span>Résultat : " + fmtScore(r.score) + " sur " + r.max + (r.passed ? " · Module validé" : "") + "</span><span>" + date + "</span></footer>" +
      "</body></html>";
  }

  function printSheet() {
    // impression dans un cadre caché : l'apprenant choisit « Enregistrer en PDF »
    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(frame);
    frame.srcdoc = sheetHTML();
    frame.onload = function () {
      var w = frame.contentWindow;
      var ready = w.document.fonts ? w.document.fonts.ready : Promise.resolve();
      ready.then(function () {
        w.focus();
        w.print();
        setTimeout(function () { frame.remove(); }, 1000);
      });
    };
  }

  stage.querySelectorAll("[data-save-sheet]").forEach(function (btn) {
    var slide = btn.closest(".slide");
    if (state.reperes && state.reperes.fiche) showNote(slide.querySelector("[data-sheet-fb]"));
    btn.addEventListener("click", function () {
      state.reperes = state.reperes || {};
      state.reperes.fiche = new Date().toISOString();
      Tracking.save(state);
      showNote(slide.querySelector("[data-sheet-fb]"));
      renderMenu();
    });
  });

  stage.querySelectorAll("[data-finish]").forEach(function (btn) {
    var slide = btn.closest(".slide");
    var panel = slide.querySelector("[data-finish-panel]");
    btn.addEventListener("click", function () {
      var r = computeResult().result;
      // terminé ne veut pas dire validé : sous le seuil, le module reste « à reprendre »
      state.completed = true;
      state.passed = r.passed;
      Tracking.save(state);
      slide.querySelector("[data-finish-msg]").textContent = r.passed
        ? "Votre progression est enregistrée et le module est validé. Vous pouvez ouvrir le module 4."
        : "Votre progression est enregistrée. Le module n’est pas encore validé : reprenez les activités indiquées depuis le menu.";
      panel.hidden = false;
    });
    panel.addEventListener("click", function (e) {
      if (e.target === panel || e.target.closest("[data-finish-close]")) panel.hidden = true;
    });
  });

  /* ---------- Menu du module et « Mes repères » ---------- */

  var SEQUENCES = [
    { title: "Découvrir le second outil", time: "3 min", screens: [0, 1, 2] },
    { title: "Repérer et saisir", time: "4 min", screens: [3, 4, 5] },
    { title: "Produire et contrôler un tableau", time: "7 min", screens: [6, 7, 8, 9] },
    { title: "Ajouter un contenu autorisé", time: "3 min", screens: [10, 11] },
    { title: "Comparer les deux outils", time: "5 min", screens: [12, 13, 14, 15] },
    { title: "Conserver les acquis", time: "3 min", screens: [16, 17] }
  ];
  var menu = stage.querySelector("[data-menu]");
  var menuNav = menu.querySelector("[data-menu-nav]");
  var reperesEl = menu.querySelector("[data-reperes]");

  function screenCode(i) { return "3." + pad(i + 1); }

  function renderMenu() {
    var graded = {};
    scoreItems().forEach(function (it) { graded[slides.indexOf(stage.querySelector(".slide" + it.slide))] = it; });
    menuNav.innerHTML = "";
    SEQUENCES.forEach(function (seq, n) {
      var sec = document.createElement("section");
      sec.className = "menu-seq";
      sec.innerHTML = "<h4><span>Séquence " + (n + 1) + "</span></h4><ol></ol>";
      sec.querySelector("h4").appendChild(document.createTextNode(seq.title));
      var t = document.createElement("small");
      t.textContent = seq.time;
      sec.querySelector("h4").appendChild(t);
      seq.screens.forEach(function (i) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        var open = state.visited.indexOf(i) >= 0 || i === index;
        btn.type = "button";
        btn.className = "menu-item" + (i === index ? " is-current" : "");
        btn.disabled = !open;
        btn.dataset.goto = i;
        var st = i === index ? "En cours" : open ? "Vu" : "";
        var g = graded[i];
        if (g && g.done) st = g.pts === g.max ? "Réussi" : "À reprendre";
        btn.innerHTML = '<span class="mi-code"></span><span class="mi-title"></span><span class="mi-st"></span>' + (open ? "" : '<svg aria-hidden="true"><use href="#i-lock"/></svg>');
        btn.querySelector(".mi-code").textContent = screenCode(i);
        btn.querySelector(".mi-title").textContent = slides[i].getAttribute("aria-label");
        var stEl = btn.querySelector(".mi-st");
        stEl.textContent = st;
        stEl.dataset.st = st;
        li.appendChild(btn);
        sec.querySelector("ol").appendChild(li);
      });
      menuNav.appendChild(sec);
    });

    var fiche = state.reperes && state.reperes.fiche;
    if (fiche) {
      var d = new Date(fiche).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      reperesEl.innerHTML = '<div class="rep-card"><b>Mes premiers gestes dans Claude</b><small></small><ol></ol>' +
        '<button type="button" class="btn-outline btn-sm" data-print-sheet>Imprimer ou enregistrer en PDF</button></div>';
      reperesEl.querySelector("small").textContent = "Enregistrée le " + d;
      GESTURES.forEach(function (g) { var li = document.createElement("li"); li.textContent = g; reperesEl.querySelector("ol").appendChild(li); });
    } else {
      reperesEl.innerHTML = '<p class="rep-empty">Votre fiche apparaîtra ici après l’avoir enregistrée à l’écran 3.18.</p>';
    }
  }

  function openMenu() { renderMenu(); menu.hidden = false; menu.querySelector("[data-menu-close]").focus(); }
  function closeMenu() { menu.hidden = true; }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-menu-open]")) {
      stage.querySelectorAll(".review, .finish").forEach(function (p) { p.hidden = true; });
      openMenu();
    }
  });
  menu.addEventListener("click", function (e) {
    if (e.target === menu || e.target.closest("[data-menu-close]")) { closeMenu(); return; }
    var item = e.target.closest("[data-goto]");
    if (item && !item.disabled) { closeMenu(); go(+item.dataset.goto); return; }
    if (e.target.closest("[data-print-sheet]")) printSheet();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !menu.hidden) closeMenu();
  });

  /* ---------- Résumé pour le suivi (futur adaptateur SCORM) ---------- */

  Tracking.snapshot = function () {
    var out = computeResult();
    return {
      location: screenCode(state.location || 0),
      visited: state.visited.map(screenCode),
      mode: state.mode || null,                       // "reel" ou "simulation"
      practice: out.result.practice,                  // déclarée, déposée, simulation, réelle
      activities: out.items.map(function (it) { return { label: it.label, score: it.pts, max: it.max, done: it.done }; }),
      attempts: { match: (state.match || {}).attempts || 0, table: ((state.build || {}).subs || []).length },
      score: out.result.score,
      max: out.result.max,
      passed: out.result.passed,
      completed: !!state.completed
    };
  };

  /* ---------- Voix off & sous-titres ---------- */

  var audio = document.getElementById("voice");
  var dock = stage.querySelector(".dock");
  var capEl = stage.querySelector(".captions span");
  var ccBtn = stage.querySelector("[data-cc]");
  var muteBtn = stage.querySelector("[data-mute]");
  var CAPTIONS = window.COURSE_CAPTIONS || {};
  var cues = [], cueIdx = -1, startTimer, raf;

  function setCC(on) {
    state.cc = on;
    stage.classList.toggle("has-cc", on);
    ccBtn.setAttribute("aria-pressed", on);
    ccBtn.setAttribute("aria-label", on ? "Masquer les sous-titres" : "Afficher les sous-titres");
  }
  function setMute(on) {
    state.muted = on;
    audio.muted = on;
    muteBtn.setAttribute("aria-pressed", on);
    muteBtn.setAttribute("aria-label", on ? "Remettre le son" : "Couper le son");
  }

  function setProgress(t) { dock.style.setProperty("--t", t); }

  function showCue(i) {
    if (i === cueIdx) return;
    cueIdx = i;
    if (i < 0) { capEl.classList.remove("is-on"); return; }
    capEl.textContent = cues[i][2];
    capEl.classList.add("is-on");
  }

  function syncCaptions() {
    var t = audio.currentTime, i = -1;
    for (var k = 0; k < cues.length; k++) if (cues[k][0] <= t) i = k;
    // un sous-titre reste affiché jusqu'au suivant ; le dernier s'efface peu après sa fin
    if (i >= 0 && i === cues.length - 1 && t > cues[i][1] + 0.6) i = -1;
    showCue(i);
  }

  function tick() {
    if (audio.duration) setProgress(audio.currentTime / audio.duration);
    syncCaptions();
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (!audio.getAttribute("src")) return;
    var p = audio.play();
    // lecture automatique refusée par le navigateur : on invite à cliquer
    if (p && p.catch) p.catch(function () { dock.classList.add("is-waiting"); });
  }

  function loadVoice(slide) {
    clearTimeout(startTimer);
    audio.pause();
    dock.classList.remove("is-playing", "is-waiting");
    dock.classList.toggle("is-silent", !slide.getAttribute("data-audio"));
    slide.querySelectorAll(".cta").forEach(function (c) { c.classList.remove("is-ready"); });
    setProgress(0);

    var id = slide.getAttribute("data-audio");
    cues = (id && CAPTIONS[id]) || [];
    cueIdx = -2;
    showCue(-1);

    if (!id || EMBED) { audio.removeAttribute("src"); audio.load(); return; }
    audio.src = "assets/audio/" + id + ".mp3";
    // laisse l'écran s'installer avant que la voix ne démarre
    startTimer = setTimeout(play, 700);
  }

  audio.addEventListener("play", function () {
    dock.classList.add("is-playing");
    dock.classList.remove("is-waiting");
    cancelAnimationFrame(raf);
    tick();
  });
  audio.addEventListener("pause", function () {
    dock.classList.remove("is-playing");
    cancelAnimationFrame(raf);
  });
  audio.addEventListener("ended", function () {
    setProgress(1);
    showCue(-1);
    var cta = slides[index] && slides[index].querySelector(".cta");
    if (cta) cta.classList.add("is-ready");
  });

  stage.querySelector("[data-audio-toggle]").addEventListener("click", function () {
    clearTimeout(startTimer);
    audio.paused ? play() : audio.pause();
  });
  stage.querySelector("[data-audio-replay]").addEventListener("click", function () {
    clearTimeout(startTimer);
    audio.currentTime = 0;
    play();
  });
  ccBtn.addEventListener("click", function () {
    setCC(!state.cc);
    Tracking.save(state);
  });
  muteBtn.addEventListener("click", function () {
    setMute(!state.muted);
    Tracking.save(state);
  });

  setCC(!!state.cc);
  setMute(!!state.muted);

  /* ---------- Atelier : échanges avec la page parente ---------- */

  if (EMBED) {
    window.addEventListener("message", function (e) {
      if (e.source !== window.parent || !e.data || e.data.src !== "atelier") return;
      var d = e.data;
      if (d.type === "table") stage.querySelectorAll("[data-edit-table]").forEach(function (g) { if (g._fromText) g._fromText(d.text); });
      if (d.type === "voice-ended") {
        var cta = slides[index] && slides[index].querySelector(".cta");
        if (cta) cta.classList.add("is-ready");
      }
      if (d.type === "go" && typeof d.index === "number") go(d.index);
      if (d.type === "prev") go(index - 1);
    });
    // « Ouvrir Claude » : Claude est déjà ouvert à gauche
    stage.addEventListener("click", function (e) {
      var a = e.target.closest('a[href*="claude.ai"]');
      if (!a) return;
      e.preventDefault();
      tell({ type: "open-claude" });
    }, true);
  }

  /* ---------- Démarrage ---------- */

  var fromHash = parseInt(location.hash.slice(1), 10);
  var start = !isNaN(fromHash) ? fromHash - 1 : (state.location || 0);
  start = Math.max(0, Math.min(slides.length - 1, start));

  function boot() {
    go(start);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        stage.classList.remove("is-booting");
        stage.classList.add("is-ready");
      });
    });
  }

  // on attend les polices pour éviter tout saut de mise en page à l'ouverture
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 800); })]).then(boot);
  } else {
    boot();
  }
})();
