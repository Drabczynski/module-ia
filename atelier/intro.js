/* Introduction à faire défiler, affichée dans le panneau de formation de l'atelier. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function tell(type) {
    if (window.parent === window) { location.href = "index.html"; return; }
    window.parent.postMessage({ src: "atelier-intro", type: type }, location.origin && location.origin !== "null" ? location.origin : "*");
  }
  $$("[data-start]").forEach(function (b) { b.addEventListener("click", function () { audio.pause(); tell("intro-done"); }); });
  var audio = $("[data-audio]"), vo = $("[data-vo]");
  vo.addEventListener("click", function () {
    if (!audio.paused) { audio.pause(); return; }
    if (!audio.getAttribute("src")) audio.src = "../assets/audio/ecran-01.mp3";
    audio.play().catch(function () { /* lecture refusée */ });
  });
  ["play", "pause", "ended"].forEach(function (ev) { audio.addEventListener(ev, function () {
    var on = !audio.paused;
    vo.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
    vo.lastChild.textContent = on ? "Pause" : "Écouter";
  }); });
  (function scrollIntro() {
    var intro = $("[data-intro]");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-reveal");
    var countUp = function (el) {
      var to = +el.dataset.count;
      if (reduce || el.dataset.done) { el.textContent = to; return; }
      el.dataset.done = "1";
      var t0 = performance.now();
      (function tick(t) {
        var k = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    };
    var rv = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$(".x-count", e.target).forEach(countUp);
        rv.unobserve(e.target);
      });
    }, { root: intro, threshold: 0.15 });
    $$(".rv", intro).forEach(function (el) { rv.observe(el); });

    // le titre « Une réunion produit des actions » reste affiché pendant le récit
    var tache = $("#x-tache", intro), tBlock = $("#x-tache .x-intro-block", intro);
    var setTh = function () { tache.style.setProperty("--th", tBlock.offsetHeight + "px"); };
    setTh();
    if ("ResizeObserver" in window) new ResizeObserver(setTh).observe(tBlock);

    var stage = $(".x-stage", intro), steps = $$(".x-step", intro);
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (x) { x.classList.toggle("is-on", x === e.target); });
        stage.dataset.stage = e.target.dataset.step;
      });
    }, { root: intro, rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (x) { so.observe(x); });

    var links = $$("[data-toc]", intro);
    var to = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { root: intro, rootMargin: "-40% 0px -55% 0px" });
    links.forEach(function (a) {
      var t = $(a.getAttribute("href"), intro);
      if (t) to.observe(t);
      a.addEventListener("click", function (ev) { ev.preventDefault(); t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); });
    });
    $$(".x-down", intro).forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); $("#x-tache", intro).scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }); });

    var bar = $("[data-x-progress]", intro);
    intro.addEventListener("scroll", function () {
      var k = intro.scrollTop / Math.max(1, intro.scrollHeight - intro.clientHeight);
      bar.style.width = (k * 100) + "%";
    }, { passive: true });
  })();
})();
