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

  var state = Tracking.load();
  state.visited = state.visited || [];
  state.spots = state.spots || [];

  /* ---------- Mise à l'échelle de la scène ---------- */

  function fit() {
    var s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.setProperty("--scale", s);
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
    slide.querySelectorAll("[data-match]").forEach(function (m) { if (m._redraw) setTimeout(m._redraw, 60); });
    currentEl.textContent = pad(index + 1);
    progressEl.style.setProperty("--p", ((index + 1) / TOTAL_SCREENS * 100) + "%");
    backBtn.hidden = index === 0;

    if (state.visited.indexOf(index) < 0) state.visited.push(index);
    state.location = index;
    Tracking.save(state);
    if (history.replaceState) history.replaceState(null, "", "#" + (index + 1));

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
    if (e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
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
    }, function () {
      label.textContent = "Sélectionnez le texte";
    });
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { label.textContent = initial; btn.classList.remove("is-done"); }, 2000);
  });

  /* ---------- Écran 5 : associer besoins et fonctions ---------- */

  var PAIR_COLORS = ["#1f5cf0", "#e2560d", "#7c4dff", "#0f9aa8"];

  Array.prototype.forEach.call(stage.querySelectorAll("[data-match]"), function (box) {
    var slide = box.closest(".slide");
    var svg = box.querySelector(".match-lines");
    var help = slide.querySelector(".match-help");
    var cta = slide.querySelector("[data-check='match']");
    var ctaLabel = cta.querySelector(".cta-label");
    var cards = Array.prototype.slice.call(box.querySelectorAll(".m-card"));
    var pairs = [];          // [{ need, fn, color }]
    var selected = null;
    var saved = state.match || (state.match = { attempts: 0, done: false });

    function pairOf(card) {
      for (var i = 0; i < pairs.length; i++) if (pairs[i].need === card || pairs[i].fn === card) return pairs[i];
      return null;
    }
    function freeColor() {
      for (var i = 0; i < PAIR_COLORS.length; i++) {
        if (!pairs.some(function (p) { return p.color === PAIR_COLORS[i]; })) return PAIR_COLORS[i];
      }
      return PAIR_COLORS[0];
    }

    function draw() {
      svg.innerHTML = "";
      pairs.forEach(function (p) {
        // les positions sont lues en unités de la scène (indépendantes du zoom)
        var a = p.need, b = p.fn;
        var x1 = a.offsetParent.offsetLeft + a.offsetLeft + a.offsetWidth - 20;
        var y1 = a.offsetParent.offsetTop + a.offsetTop + a.offsetHeight / 2;
        var x2 = b.offsetParent.offsetLeft + b.offsetLeft + 20;
        var y2 = b.offsetParent.offsetTop + b.offsetTop + b.offsetHeight / 2;
        var dx = (x2 - x1) * 0.55;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2);
        var c = p.state === "good" ? "#1a9a5a" : p.state === "bad" ? "#d93636" : p.color;
        path.setAttribute("stroke", c);
        svg.appendChild(path);
        var len = path.getTotalLength();
        path.style.setProperty("--len", len);
        if (p.drawn) { path.style.animation = "none"; path.style.strokeDashoffset = 0; }
        p.drawn = true;
      });
    }

    function paint() {
      cards.forEach(function (c) {
        var p = pairOf(c);
        c.classList.toggle("is-paired", !!p);
        c.classList.toggle("is-selected", c === selected);
        c.classList.toggle("is-good", !!p && p.state === "good");
        c.classList.toggle("is-bad", !!p && p.state === "bad");
        c.classList.toggle("is-locked", !!p && p.state === "good");
        c.style.setProperty("--c", p && !p.state ? p.color : "");
        c.setAttribute("aria-pressed", c === selected);
      });
      draw();
    }

    function setHelp(text, tone) {
      help.textContent = text;
      help.classList.toggle("is-good", tone === "good");
      help.classList.toggle("is-bad", tone === "bad");
    }

    box.addEventListener("click", function (e) {
      var card = e.target.closest(".m-card");
      if (!card || saved.done) return;
      var existing = pairOf(card);
      if (existing) {                           // re-cliquer défait l'association
        pairs.splice(pairs.indexOf(existing), 1);
        selected = card;
      } else if (!selected || selected === card) {
        selected = selected === card ? null : card;
      } else if (selected.dataset.side === card.dataset.side) {
        selected = card;
      } else {
        var need = card.dataset.side === "need" ? card : selected;
        var fn = card.dataset.side === "fn" ? card : selected;
        pairs.push({ need: need, fn: fn, color: freeColor() });
        selected = null;
      }
      var left = cards.length / 2 - pairs.length;
      setHelp(left ? (selected ? "Choisissez maintenant l’élément correspondant dans l’autre colonne." : "Encore " + left + " association" + (left > 1 ? "s" : "") + " à faire.") : "Tout est associé. Cliquez sur Valider.");
      paint();
    });

    function succeed() {
      saved.done = true;
      Tracking.save(state);
      cta.classList.add("is-success");
      ctaLabel.textContent = "Continuer";
      // différé : le clic de validation ne doit pas aussi faire avancer
      setTimeout(function () { cta.setAttribute("data-next", ""); }, 0);
      cta.removeAttribute("data-check");
      setHelp("Bravo, les quatre associations sont justes.", "good");
    }

    cta.addEventListener("click", function () {
      if (saved.done) return;                  // la navigation est gérée par [data-next]
      if (pairs.length < cards.length / 2) {
        setHelp("Associez les quatre besoins avant de valider.", "bad");
        cta.classList.remove("is-denied"); void cta.offsetWidth; cta.classList.add("is-denied");
        return;
      }
      saved.attempts++;
      var wrong = 0;
      pairs.forEach(function (p) {
        p.state = p.need.dataset.key === p.fn.dataset.key ? "good" : "bad";
        p.drawn = false;
        if (p.state === "bad") wrong++;
      });
      // le score retenu est celui du premier essai (1 point par bonne association)
      if (saved.firstScore == null) saved.firstScore = pairs.length - wrong;
      paint();
      Tracking.save(state);
      if (!wrong) { succeed(); return; }
      setHelp(wrong + " association" + (wrong > 1 ? "s" : "") + " à revoir. Les bonnes réponses restent en place.", "bad");
      setTimeout(function () {
        pairs = pairs.filter(function (p) { return p.state === "good"; });
        paint();
      }, 1400);
    });

    // exercice déjà réussi lors d'une visite précédente : on affiche la solution
    if (saved.done) {
      var byKey = {};
      cards.forEach(function (c) { (byKey[c.dataset.key] = byKey[c.dataset.key] || {})[c.dataset.side] = c; });
      Object.keys(byKey).forEach(function (k, i) { pairs.push({ need: byKey[k].need, fn: byKey[k].fn, color: PAIR_COLORS[i], state: "good" }); });
      succeed();
    }
    box._redraw = function () { pairs.forEach(function (p) { p.drawn = false; }); paint(); };
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

  /* ---------- Écran 8 : tableau à compléter (collage intelligent) ---------- */

  Array.prototype.forEach.call(stage.querySelectorAll("[data-edit-table]"), function (grid) {
    var ROWS = 4, COLS = 3;
    var status = grid.closest(".box").querySelector(".fill-state");
    var data = state.table || (state.table = []);
    var cells = [];
    var PH = ["Action", "Responsable", "Échéance"];

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

    function refresh() {
      var rows = data.filter(function (row) { return row.some(function (v) { return v.trim(); }); }).length;
      status.textContent = rows ? rows + " ligne" + (rows > 1 ? "s" : "") + " remplie" + (rows > 1 ? "s" : "") : "";
      status.classList.toggle("is-done", rows >= 3);
    }

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

    grid.addEventListener("paste", function (e) {
      var cell = e.target.closest(".e-cell");
      var text = (e.clipboardData || window.clipboardData).getData("text");
      if (!cell || !/[\t|]|\n/.test(text.trim())) return;       // simple texte : collage normal
      var rows = parse(text);
      if (!rows.length) return;
      e.preventDefault();
      var r0 = +cell.dataset.r, c0 = +cell.dataset.c;
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
      Tracking.save(state);
      refresh();
    });

    grid.addEventListener("input", function (e) {
      var cell = e.target;
      data[+cell.dataset.r][+cell.dataset.c] = cell.value;
      Tracking.save(state);
      refresh();
    });

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
      }, 1150);
    });
  });

  /* ---------- Écrans 13 et 16 : réponses collées par l'apprenant ---------- */

  state.answers = state.answers || {};
  var WORD_LIMIT = 60;

  function countWords(t) { return (t.match(/\S+/g) || []).length; }

  function syncAnswer(key) {
    var text = (state.answers[key] || "").trim();
    var n = countWords(text);
    stage.querySelectorAll('[data-wc="' + key + '"]').forEach(function (wc) {
      wc.textContent = n + " / " + WORD_LIMIT + " mots";
      wc.classList.toggle("is-ok", n > 0 && n <= WORD_LIMIT);
      wc.classList.toggle("is-over", n > WORD_LIMIT);
    });
    // l'écran 16 affiche la réponse collée à l'écran 13 (sinon, le squelette)
    stage.querySelectorAll('[data-answer-view="' + key + '"]').forEach(function (v) {
      if (!v._skeleton) v._skeleton = v.innerHTML;
      if (text) v.textContent = text; else v.innerHTML = v._skeleton;
    });
  }

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

  /* ---------- Écran 14 : grille de lecture ---------- */

  var CRITERIA = ["Date et horaires", "Messagerie", "Absence d’ajout", "Longueur demandée"];

  stage.querySelectorAll("[data-rubric]").forEach(function (grid) {
    var sum = grid.parentNode.querySelector(".rubric-sum");
    var data = state.rubric || (state.rubric = { gpt: [], claude: [] });

    CRITERIA.forEach(function (label, r) {
      var k = document.createElement("div");
      k.className = "rb-k";
      k.textContent = label;
      grid.appendChild(k);
      ["gpt", "claude"].forEach(function (tool) {
        var cell = document.createElement("div");
        cell.className = "rb-c";
        cell.innerHTML =
          '<button type="button" class="rb-btn" data-v="yes" aria-pressed="false"><svg><use href="#i-check"/></svg>Respecté</button>' +
          '<button type="button" class="rb-btn" data-v="no" aria-pressed="false"><svg><use href="#i-x"/></svg>Non</button>';
        cell.dataset.tool = tool;
        cell.dataset.r = r;
        cell.setAttribute("role", "group");
        cell.setAttribute("aria-label", label + ", " + (tool === "gpt" ? "ChatGPT" : "Claude"));
        grid.appendChild(cell);
      });
    });

    function paint() {
      grid.querySelectorAll(".rb-c").forEach(function (cell) {
        var v = data[cell.dataset.tool][+cell.dataset.r];
        cell.querySelectorAll(".rb-btn").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === v); });
      });
      var score = function (t) { return data[t].filter(function (v) { return v === "yes"; }).length; };
      var filled = data.gpt.filter(Boolean).length + data.claude.filter(Boolean).length;
      sum.innerHTML = filled
        ? '<span class="chip">ChatGPT : <b>' + score("gpt") + " / 4</b></span><span class=\"chip\">Claude : <b>" + score("claude") + " / 4</b></span>"
        : "Pour chaque critère, indiquez s’il est respecté.";
    }

    grid.addEventListener("click", function (e) {
      var b = e.target.closest(".rb-btn");
      if (!b) return;
      var cell = b.parentNode;
      var arr = data[cell.dataset.tool];
      arr[+cell.dataset.r] = arr[+cell.dataset.r] === b.dataset.v ? null : b.dataset.v;
      Tracking.save(state);
      paint();
    });
    paint();
  });

  /* ---------- Écran 16 : préférence argumentée ---------- */

  stage.querySelectorAll("[data-pick]").forEach(function (pick) {
    var slide = pick.closest(".slide");
    var why = slide.querySelector("[data-why]");
    var hint = slide.querySelector(".why-hint");
    var cta = slide.querySelector("[data-check='pref']");
    var saved = state.pref || (state.pref = { choice: null, text: "" });

    function paint() {
      pick.querySelectorAll(".pick-card").forEach(function (c) { c.setAttribute("aria-checked", c.dataset.pickValue === saved.choice); });
    }
    function setHint(t, tone) {
      hint.textContent = t;
      hint.classList.toggle("is-bad", tone === "bad");
      hint.classList.toggle("is-good", tone === "good");
    }

    pick.addEventListener("click", function (e) {
      var c = e.target.closest(".pick-card");
      if (!c) return;
      saved.choice = c.dataset.pickValue;
      Tracking.save(state);
      paint();
      if (!why.value.trim()) why.focus();
      setHint("Complétez maintenant votre argument.", "");
    });

    why.value = saved.text;
    why.addEventListener("input", function () {
      saved.text = why.value;
      Tracking.save(state);
      if (why.value.trim().length >= 20) setHint(saved.choice ? "Parfait, vous pouvez continuer." : "Indiquez aussi la réponse que vous retenez.", saved.choice ? "good" : "");
    });

    cta.addEventListener("click", function () {
      var problem = !saved.choice ? "Cliquez d’abord sur la réponse que vous retenez."
        : why.value.trim().length < 20 ? "Développez un peu votre argument (une phrase suffit)." : "";
      if (problem) {
        setHint(problem, "bad");
        cta.classList.remove("is-denied"); void cta.offsetWidth; cta.classList.add("is-denied");
        return;
      }
      go(index + 1);
    });
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
    var tbl = (state.table || []).some(function (r) { return (r || []).some(function (v) { return v && v.trim(); }); });
    var claude = !!(state.answers && (state.answers.claude || "").trim());
    return [
      { slide: ".s-match", label: "Associer les commandes", max: 4, pts: m.firstScore || 0, done: m.firstScore != null,
        hint: "1 point par bonne association au premier essai." },
      { slide: ".s-build", label: "Créer votre tableau", max: 3, pts: tableScore(), done: tbl,
        hint: "Lignes attendues : affiche (Nora, 5 novembre), stock (Sami, 6 novembre), lieu (non précisé)." },
      quizItem("q09", ".s-absent", "Traiter le responsable absent"),
      quizItem("q12", ".s-limit", "Repérer une limite"),
      { slide: ".s-fair", label: "Une comparaison équitable", max: 1, pts: claudeAnswerOk() ? 1 : 0, done: claude,
        hint: "Réponse de Claude collée, 60 mots maximum, date et messagerie mentionnées." },
      quizItem("q15", ".s-conclude", "Choisir une conclusion")
    ];
  }

  function computeResult() {
    var items = scoreItems();
    var score = 0, max = 0;
    items.forEach(function (it) { score += it.pts; max += it.max; });
    var manip = items[1].done || items[4].done;
    state.result = { score: score, max: max, passed: score / max >= 0.7, manipulation: manip };
    Tracking.save(state);
    return { items: items, result: state.result };
  }

  stage.querySelectorAll("[data-results]").forEach(function (slide) {
    var verdict = slide.querySelector(".verdict");
    var count = slide.querySelector("[data-score-count]");
    var panel = slide.querySelector("[data-review]");
    var list = slide.querySelector("[data-review-list]");
    var raf2;

    function render() {
      var out = computeResult(), r = out.result;
      verdict.classList.toggle("is-fail", !r.passed);
      slide.querySelector("[data-verdict-title]").textContent = r.passed ? "Module validé" : "Pas encore validé";
      slide.querySelector("[data-score-max]").textContent = r.max;
      slide.querySelector("[data-score-text]").textContent = r.score + " / " + r.max;
      slide.querySelector("[data-score-advice]").textContent = r.passed
        ? "Consultez les points à reprendre."
        : "Reprenez les points signalés.";
      var side = slide.querySelector(".verdict-side");
      side.classList.toggle("is-todo", !r.manipulation);
      slide.querySelector("[data-manip]").textContent = r.manipulation ? "Manipulation réalisée" : "Manipulation à réaliser";

      // le score défile jusqu'à sa valeur
      cancelAnimationFrame(raf2);
      var t0 = null;
      (function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0 - 900) / 900);
        count.textContent = Math.round(Math.max(0, k) * r.score);
        if (k < 1) raf2 = requestAnimationFrame(step);
      })(performance.now());

      list.innerHTML = "";
      out.items.forEach(function (it) {
        var li = document.createElement("li");
        var st = !it.done ? "is-todo" : it.pts === it.max ? "is-ok" : it.pts ? "is-partial" : "is-miss";
        li.className = st;
        li.innerHTML = '<span class="st"><svg><use href="' + (st === "is-ok" ? "#i-check" : st === "is-todo" ? "#i-plus" : "#i-x") + '"/></svg></span>' +
          "<span><b></b><small></small></span>" +
          '<span class="pts">' + it.pts + " / " + it.max + "</span>" +
          '<button type="button" class="go">Revoir</button>';
        li.querySelector("b").textContent = it.label;
        li.querySelector("small").textContent = !it.done ? "Activité non réalisée." : (it.hint || (it.pts ? "Bonne réponse." : "Réponse à revoir."));
        li.querySelector(".go").dataset.slide = it.slide;
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
        var target = stage.querySelector(".slide" + g.dataset.slide);
        go(slides.indexOf(target));
      }
    });
  });

  /* ---------- Écran 18 : fiche imprimable et fin du module ---------- */

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
      '<h2>Mes premiers gestes dans Claude</h2><ol>' +
      '<li>Fournir la source.</li><li>Préciser le tableau attendu.</li><li>Signaler ce qui manque.</li><li>Comparer les résultats sur les mêmes critères.</li></ol>' +
      '<div class="box p"><b>Prompt modèle</b>À partir des notes suivantes, crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris « non précisé » pour une donnée absente.</div>' +
      '<div class="box o"><b>Demander une correction</b>« Le responsable de la confirmation du lieu n’est pas indiqué. Remplace-le par non précisé. »</div>' +
      (arg ? '<div class="box p"><b>Mon argument</b>' + esc(arg) + "</div>" : "") +
      "<footer><span>Résultat : " + r.score + " / " + r.max + (r.passed ? " · Module validé" : "") + "</span><span>" + date + "</span></footer>" +
      "</body></html>";
  }

  stage.querySelectorAll("[data-save-sheet]").forEach(function (btn) {
    btn.addEventListener("click", function () {
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
    });
  });

  stage.querySelectorAll("[data-finish]").forEach(function (btn) {
    var slide = btn.closest(".slide");
    var panel = slide.querySelector("[data-finish-panel]");
    btn.addEventListener("click", function () {
      state.completed = true;
      computeResult();
      panel.hidden = false;
    });
    panel.addEventListener("click", function (e) {
      if (e.target === panel || e.target.closest("[data-finish-close]")) panel.hidden = true;
    });
  });

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

    if (!id) { audio.removeAttribute("src"); audio.load(); return; }
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
