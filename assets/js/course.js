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
    var cs = getComputedStyle(slide);
    ["--pw", "--ph", "--pr", "--pos"].forEach(function (v) {
      stage.style.setProperty(v, cs.getPropertyValue(v).trim());
    });
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
    if (i === cues.length - 1 && t > cues[i][1] + 0.6) i = -1;
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
