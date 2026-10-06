/* ==========================================================================
   Ce qu'on apprend : la sphère de particules. Elle se forme à l'arrivée de
   la section, puis éclate au défilement en un nuage léger d'où sortent huit
   points, un par compétence. Toucher un point ouvre sa fiche.
   ========================================================================== */
(function () {
  "use strict";
  var sec = document.querySelector("[data-learn]");
  if (!sec) return;
  var cv = sec.querySelector("[data-lg-cv]"), ctx = cv.getContext("2d"), box = sec.querySelector("[data-lg-nodes]");
  var card = sec.querySelector("[data-lg-card]"), hint = sec.querySelector("[data-lg-hint]");
  var arts = [].slice.call(sec.querySelectorAll("[data-lg-src] .lc"));
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* les particules : une sphère de Fibonacci, chacune avec sa vitesse d'éclatement */
  var N = 1500, GA = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
    pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, sx: (Math.random() * 2 - 1) * 2.4, sy: (Math.random() * 2 - 1) * 1.7, sz: Math.random() * 2 - 1, d: Math.random(), v: .45 + Math.random() * 1.4 });
  }

  /* les huit compétences : un point accroché à la sphère, puis posé sur un anneau */
  var sel = -1;
  var nodes = arts.map(function (a, k) {
    var yy = 1 - ((k + .5) / arts.length) * 2, rr = Math.sqrt(1 - yy * yy), t = GA * k * 3.1;
    var b = document.createElement("button");
    b.type = "button"; b.className = "lg-n"; b.setAttribute("role", "listitem"); b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<span class="lg-d">' + (k + 1) + '</span><span class="lg-t">' + a.querySelector("h3").textContent + "</span>";
    b.addEventListener("click", function () { select(k); });
    box.appendChild(b);
    return { x: Math.cos(t) * rr, y: yy, z: Math.sin(t) * rr, el: b, sx: 0, sy: 0 };
  });
  function select(k) {
    sel = k;
    nodes.forEach(function (n, j) { n.el.setAttribute("aria-pressed", String(j === k)); });
    var a = arts[k];
    card.innerHTML = a.innerHTML + '<p class="lg-count">' + (k + 1) + " / " + arts.length + "</p>";
    card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
    if (hint) hint.classList.add("done");
  }

  function size() {
    var b = cv.getBoundingClientRect(); W = b.width; H = b.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  addEventListener("resize", size); size();

  var vis = false, P = 0, pre = 0, last = performance.now(), rot = 0;
  new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!vis) return;
    var r = sec.getBoundingClientRect(), k = 1 - Math.exp(-dt * 6);
    P += (clamp(-r.top / (r.height - innerHeight), 0, 1) - P) * k;
    pre += (clamp(1 - r.top / innerHeight, 0, 1) - pre) * k;
    var form = reduced ? 1 : ease(seg(pre, .25, 1)), burst = ease(seg(P, .12, .5));
    rot += dt * (.35 - burst * .27);

    var small = W < 800, cx = small ? W * .5 : W * .66, cy = small ? H * .45 : H * .54, R = small ? W * .3 : Math.min(W, H) * .25;
    var rx = small ? W * .3 : R * 1.45, ry = small ? H * .19 : R * 1.25;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(.42), sT = Math.sin(.42);
    function project(px, py, pz) {
      var x0 = px * cs - pz * sn, z0 = px * sn + pz * cs, y0 = py * cT - z0 * sT; z0 = py * sT + z0 * cT;
      return [x0, y0, z0];
    }
    // le nuage
    for (var i = 0; i < N; i++) {
      var p = pts[i], f = ease(clamp((form - p.d * .45) / .55, 0, 1)), q = project(p.x, p.y, p.z);
      var x = lerp(p.sx, q[0], f), y = lerp(p.sy, q[1], f), z = lerp(p.sz, q[2], f), e = 1 + burst * p.v * 1.35;
      var persp = 1 / (1.9 - z * .55), sx = cx + x * e * R * persp * 1.4, sy = cy + y * e * R * persp * 1.4;
      var al = (.12 + .7 * (z + 1) / 2) * (f * .85 + .15) * (1 - burst * .62);
      if (al < .01) continue;
      ctx.fillStyle = "rgba(31,30,28," + al.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(sx, sy, (.45 + (z + 1) * .3) * (1 - burst * .25), 0, 6.2832); ctx.fill();
    }
    // les points des compétences et leurs fils vers le centre
    var show = seg(burst, .45, .95);
    nodes.forEach(function (n, j) {
      var q = project(n.x, n.y, n.z), persp = 1 / (1.9 - q[2] * .55);
      var a = -Math.PI / 2 + (j * 2 * Math.PI) / nodes.length;   // une place fixe : on peut viser
      var tx = cx + Math.cos(a) * rx, ty = cy + Math.sin(a) * ry;
      n.sx = lerp(cx + q[0] * R * persp * 1.4, tx, burst); n.sy = lerp(cy + q[1] * R * persp * 1.4, ty, burst);
      if (show > 0) {
        ctx.strokeStyle = j === sel ? "rgba(226,98,43," + (.7 * show).toFixed(3) + ")" : "rgba(31,30,28," + (.14 * show).toFixed(3) + ")";
        ctx.lineWidth = j === sel ? 1.4 : 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.sx, n.sy); ctx.stroke();
      }
      // l'étiquette se met du côté extérieur, sauf si elle sortirait de l'écran
      var wl = n.el.offsetWidth, left = Math.cos(a) < -.15;
      if (left && n.sx - wl < 12) left = false; else if (!left && n.sx + wl > W - 12) left = true;
      n.el.classList.toggle("lg-l", left);
      n.el.classList.toggle("on", show > .6);
      n.el.style.opacity = show.toFixed(3);
      var dEl = n.el.firstChild, off = dEl.offsetLeft + dEl.offsetWidth / 2, offY = dEl.offsetTop + dEl.offsetHeight / 2;
      n.el.style.transform = "translate(" + (n.sx - off).toFixed(1) + "px," + (n.sy - offY).toFixed(1) + "px)";
    });
    if (show > .9 && sel < 0) select(0);
    card.classList.toggle("on", sel >= 0 && show > .6);
    ctx.fillStyle = "rgba(226,98,43," + (.9 * show).toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(cx, cy, 3.2 * show, 0, 6.2832); ctx.fill();
  }
  requestAnimationFrame(frame);
})();
