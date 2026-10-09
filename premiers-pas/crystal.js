/* ==========================================================================
   Sphère de cristal de l'accueil : verre laiteux, arêtes lumineuses d'un
   maillage géodésique irrégulier, poussière d'étoiles en spirale au cœur,
   volutes roses à l'intérieur, liseré irisé. Dessin en canvas 2D.
   Usage : var c = CrystalOrb(); c.draw(ctx, cx, cy, R, t, { rx, ry, glow });
   ========================================================================== */
(function () {
  "use strict";

  function rnd(seed) {
    var a = seed | 0;
    return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function randSphere(n, r) {
    var pts = [];
    while (pts.length < n) {
      var u = r() * 2 - 1, th = r() * 6.283, q = Math.sqrt(1 - u * u), p = [q * Math.cos(th), u, q * Math.sin(th)];
      // pas deux sommets collés : des triangles irréguliers mais lisibles
      if (pts.every(function (o) { return Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) > .26; })) pts.push(p);
    }
    return pts;
  }
  function onSphere(n, r) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      // répartition régulière (Fibonacci) puis bousculée : un maillage irrégulier, sans trous
      var y = 1 - 2 * (i + .5) / n, q = Math.sqrt(1 - y * y), th = i * 2.399963;
      var p = [Math.cos(th) * q + (r() - .5) * .5 / Math.sqrt(n) * 3, y + (r() - .5) * .5 / Math.sqrt(n) * 3, Math.sin(th) * q + (r() - .5) * .5 / Math.sqrt(n) * 3];
      var l = Math.hypot(p[0], p[1], p[2]); pts.push([p[0] / l, p[1] / l, p[2] / l]);
    }
    return pts;
  }
  // triangulation de Delaunay sur la sphère = enveloppe convexe ; on ne garde que les arêtes
  function hullEdges(P, near) {
    var n = P.length, nb = [], seen = {}, edges = [];
    for (var i = 0; i < n; i++) {
      nb.push([]);
      for (var j = 0; j < n; j++) if (j !== i) { var d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]); if (d < near) nb[i].push(j); }
    }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    for (i = 0; i < n; i++) {
      var L = nb[i];
      for (var x = 0; x < L.length; x++) for (var y = x + 1; y < L.length; y++) {
        var j2 = L[x], k = L[y];
        if (j2 < i || k < i) continue;
        var a = P[i], u = sub(P[j2], a), v = sub(P[k], a);
        var nr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (nr[0] * a[0] + nr[1] * a[1] + nr[2] * a[2] < 0) nr = [-nr[0], -nr[1], -nr[2]];
        var ok = true;
        for (var m = 0; m < L.length && ok; m++) {
          var p = P[L[m]];
          if (L[m] === j2 || L[m] === k) continue;
          if (nr[0] * (p[0] - a[0]) + nr[1] * (p[1] - a[1]) + nr[2] * (p[2] - a[2]) > 1e-9) ok = false;
        }
        if (!ok) continue;
        [[i, j2], [i, k], [j2, k]].forEach(function (e) {
          var key = Math.min(e[0], e[1]) + "-" + Math.max(e[0], e[1]);
          if (!seen[key]) { seen[key] = 1; edges.push([e[0], e[1]]); }
        });
      }
    }
    return edges;
  }

  window.CrystalOrb = function () {
    var r = rnd(11);
    var big = randSphere(40, r), bigE = hullEdges(big, 1.5);
    var fine = onSphere(190, r), fineE = hullEdges(fine, .62);
    bigE.forEach(function (e) { var k = r(); e.push(k < .3 ? .35 : k < .75 ? .7 : 1); });

    // poussière : une galaxie en spirale au cœur, des paillettes roses dans le volume
    var dust = [];
    for (var i = 0; i < 1500; i++) {
      var arm = i % 3, s = Math.pow(r(), .7), ang = arm * 2.094 + s * 5.2 + (r() - .5) * .9;
      var rad = .06 + s * .62, gx = Math.cos(ang) * rad, gy = (r() - .5) * .1 * (1 - s * .5), gz = Math.sin(ang) * rad;
      // disque penché vers le lecteur (vu aux trois quarts)
      dust.push([gx, gy * .5 - gz * .87, gy * .87 + gz * .5, r() < .12 ? 1.7 : 1.05, 0]);
    }
    for (i = 0; i < 520; i++) {
      var u = r() * 2 - 1, th = r() * 6.283, q = Math.sqrt(1 - u * u), rr = Math.cbrt(r()) * .96;
      dust.push([q * Math.cos(th) * rr, u * rr, q * Math.sin(th) * rr, r() < .2 ? 1.6 : 1, 1]);
    }

    // volutes roses floues, dessinées une fois
    var sw = document.createElement("canvas"); sw.width = sw.height = 512;
    var g = sw.getContext("2d");
    g.filter = "blur(18px)"; g.lineCap = "round";
    [[0, "rgba(246,110,220,.75)", 40, 1.1], [2.3, "rgba(226,130,255,.6)", 30, .9], [4.1, "rgba(255,170,225,.4)", 20, 1.3]].forEach(function (s) {
      g.save(); g.translate(256, 256); g.rotate(s[0]); g.scale(1, .42);
      g.strokeStyle = s[1]; g.lineWidth = s[2];
      g.beginPath(); g.arc(0, 0, 150, -.4, -.4 + s[3] * 2.2); g.stroke(); g.restore();
    });

    function rot(p, ca, sa, cb, sb) {
      var x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca;
      var y = p[1] * cb - z * sb; z = p[1] * sb + z * cb;
      return [x, y, z];
    }

    return {
      draw: function (ctx, cx, cy, R, t, o) {
        o = o || {};
        if (!(R > 4)) return;
        var a = t * .11 + (o.ry || 0), b = .32 + (o.rx || 0), glow = o.glow || 0;
        var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
        ctx.save();

        // halo autour de la sphère
        var hg = ctx.createRadialGradient(cx, cy, R * .85, cx, cy, R * 1.35);
        hg.addColorStop(0, "rgba(255,225,250," + (.28 + .15 * glow) + ")"); hg.addColorStop(1, "rgba(255,225,250,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 6.283); ctx.fill();

        // verre laiteux, plus dense sur le bord
        var bg = ctx.createRadialGradient(cx - R * .25, cy - R * .3, R * .1, cx, cy, R);
        bg.addColorStop(0, "rgba(255,246,252,.16)"); bg.addColorStop(.7, "rgba(246,226,246,.28)"); bg.addColorStop(1, "rgba(255,236,252,.62)");
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();

        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * .995, 0, 6.283); ctx.clip();
        ctx.globalCompositeOperation = "screen";
        ctx.translate(cx, cy); ctx.rotate(t * .07); ctx.drawImage(sw, -R * 1.05, -R * 1.05, R * 2.1, R * 2.1); ctx.rotate(2.6); ctx.globalAlpha = .7; ctx.drawImage(sw, -R * .8, -R * .8, R * 1.6, R * 1.6);
        ctx.restore();

        ctx.globalCompositeOperation = "lighter";
        function edges(P, E, front, alpha, w) {
          for (var i = 0; i < E.length; i++) {
            var p = rot(P[E[i][0]], ca, sa, cb, sb), q = rot(P[E[i][1]], ca, sa, cb, sb), z = (p[2] + q[2]) / 2;
            if ((z > 0) !== front) continue;
            var k = E[i][2] || 1, al = front ? alpha * k * (.55 + .45 * z) : alpha * k * (.6 + .4 * (1 + z));
            // les arêtes près du bord accrochent davantage la lumière
            al *= 1 + .6 * Math.pow(1 - Math.abs(z), 3);
            ctx.globalAlpha = Math.min(1, al);
            ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(cx + p[0] * R, cy + p[1] * R); ctx.lineTo(cx + q[0] * R, cy + q[1] * R); ctx.stroke();
          }
        }
        ctx.strokeStyle = "#fff4fc";
        edges(fine, fineE, false, .1, .8);
        edges(big, bigE, false, .22, 1.1);

        // poussière
        for (var i = 0; i < dust.length; i++) {
          var d = dust[i], p = rot(d, ca, sa, cb, sb), dep = (p[2] + 1) / 2;
          ctx.globalAlpha = (d[4] ? .3 : .55) + .45 * dep;
          ctx.fillStyle = d[4] ? "#ff9fe0" : (i % 4 ? "#ffffff" : "#c9fff4");
          var s = d[3] * (.9 + .6 * dep) * Math.max(.8, R / 300);
          ctx.fillRect(cx + p[0] * R, cy + p[1] * R, s, s);
        }

        edges(fine, fineE, true, .26, .8);
        ctx.strokeStyle = "rgba(255,200,245,1)";
        edges(big, bigE, true, .28, 4.5);             // halo des grandes arêtes
        ctx.strokeStyle = "#ffffff";
        edges(big, bigE, true, .95, 1.4);

        // éclats aux sommets
        for (i = 0; i < big.length; i += 3) {
          var v = rot(big[i], ca, sa, cb, sb);
          if (v[2] < .1) continue;
          var tw = .5 + .5 * Math.sin(t * 1.7 + i * 1.3), x = cx + v[0] * R, y = cy + v[1] * R, rr2 = 3 + 7 * tw * v[2];
          var sg = ctx.createRadialGradient(x, y, 0, x, y, rr2);
          sg.addColorStop(0, "rgba(255,255,255," + (.7 * tw * v[2]) + ")"); sg.addColorStop(1, "rgba(255,255,255,0)");
          ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, rr2, 0, 6.283); ctx.fill();
        }

        // liseré irisé
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.lineWidth = 2.2; ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,140,220,.35)"; ctx.beginPath(); ctx.arc(cx + 1.5, cy, R + 2, 0, 6.283); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,200,255,.3)"; ctx.beginPath(); ctx.arc(cx - 1.5, cy, R - 2.5, 0, 6.283); ctx.stroke();
        ctx.restore();
      }
    };
  };
})();
