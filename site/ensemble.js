/* ==========================================================================
   L'ensemble, au trait : des barres de bureaux empilées et croisées autour
   de cours hexagonales, dessinées dans le style et sur le moteur de Hairline
   (@lucasmarkes/hairline, licence MIT, dans vendor/hairline). Projection
   isométrique, un seul trait, plaques opaques triées de l'arrière vers
   l'avant (plans séparateurs). L'ensemble principal compte six niveaux,
   un par service. Au défilement : l'ensemble s'assemble, tourne sur
   lui-même, et s'éclate au niveau présenté, qui se soulève, s'écarte et
   prend le trait orange.
   ========================================================================== */
import HL from "./vendor/hairline/kernel.js";

const { Cam, proj, rrect, hull, ringAt, run, poly, open, seg, mk, register, spring, stepS, clamp, inject } = HL;

const sec = document.querySelector("[data-voyage]");
const stage = document.querySelector("[data-vg-hl]");
if (sec && stage) start();

function start() {
  const seg01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  inject(document);
  stage.setAttribute("data-hairline", "ensemble");
  stage.setAttribute("data-hairline-theme", "light");
  const svg = mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);

  /* ---------- l'entrelacs : trois cours hexagonales qui partagent leurs murs ---------- */
  const S = 34, AP = (S * Math.sqrt(3)) / 2, LEN = S * 1.3, WID = 8, HB = 9, LEVELS = 6;
  const items = [];                                  // tout ce qui se trie : barres et arbres
  const ring = (cx, cy, ang, L, Wd, r) => {          // un rectangle arrondi tourné, en échantillons du monde
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return rrect(-L / 2, -Wd / 2, L / 2, Wd / 2, r, 3).map((q) => ({ u: cx + q.u * ca - q.v * sa, v: cy + q.u * sa + q.v * ca, nu: q.nu * ca - q.nv * sa, nv: q.nu * sa + q.nv * ca }));
  };
  function bar(cx, cy, ang, level, main, hx) {
    const g = mk("g", {}, null);
    items.push({
      kind: "bar", g, cx, cy, ang, L: LEN, Wd: WID, level, main, hx,
      sil: mk("path", { class: "sil" }, g), cr: mk("path", { class: "nf lo" }, g), fac: mk("path", { class: "nf lo" }, g), roof: mk("path", { class: "nf lo" }, g),
      hut: rnd() < 0.55 ? { sil: mk("path", { class: "sil" }, g), cr: mk("path", { class: "nf lo" }, g), at: (rnd() - 0.5) * LEN * 0.6 } : null,
      pool: (rnd() < 0.5 ? -1 : 1) * LEN * 0.24,
    });
  }
  const at = (a, d) => [d * Math.cos((a * Math.PI) / 180), d * Math.sin((a * Math.PI) / 180)];
  const hexes = [{ ox: 0, oy: 0, levels: LEVELS, main: true }, { levels: 4, dir: 150 }, { levels: 3, dir: 270 }];
  hexes.slice(1).forEach((h) => { [h.ox, h.oy] = at(h.dir, 2 * AP); });
  const corner = (h, e) => [h.ox + S * Math.cos((e * Math.PI) / 3), h.oy + S * Math.sin((e * Math.PI) / 3)];
  hexes.forEach((h, hx) => {
    for (let l = 0; l < h.levels; l++) for (let e = 0; e < 6; e++) {
      const [x0, y0] = corner(h, e), [x1, y1] = corner(h, e + 1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const shared = hx > 0 && Math.hypot(mx, my) < AP + 1;
      // chaque niveau occupe un côté sur deux, et le mur partagé prend l'autre parité : les barres se croisent
      if (shared ? l % 2 !== 1 : e % 2 !== l % 2) continue;
      bar(mx, my, Math.atan2(y1 - y0, x1 - x0), l, !!h.main, hx);
    }
  });
  for (const [x, y] of [[62, 34], [70, -6], [48, 62], [8, 70], [-34, 66], [-98, 70], [-124, 18], [44, -84], [70, -60], [-62, -84], [-30, -112]]) {
    const g = mk("g", {}, null);
    items.push({ kind: "tree", g, x, y, trunk: mk("path", { class: "sil" }, g), crown: mk("path", { class: "sil" }, g), crc: mk("path", { class: "nf lo" }, g) });
  }

  // le sol : seulement le contour du terrain, au trait, et sa limite en pointillé
  const ground = mk("g", {}, svg), site = mk("path", { class: "nf lo" }, ground), siteOut = mk("path", { class: "nf dash" }, ground);
  const guides = mk("path", { class: "nf dash" }, svg), body = mk("g", {}, svg);
  const OUT = [[-150, -10], [-118, 92], [-20, 112], [86, 86], [104, 10], [80, -96], [10, -128], [-92, -98]];

  /* ---------- une barre à sa pose courante, puis son dessin ---------- */
  const cam = Cam(45, 0.5, small ? 1.7 : 1.85);
  let P = proj(cam), s = 0, c = 0, T = [0, 0, 0];
  const front = (q) => q.nu * s + q.nv * c >= -1e-6;
  function pose(it, dz, k) {                         // dz : soulèvement ; k : écart vers l'extérieur, en part du rayon
    const hx = hexes[it.hx], cx = hx.ox + (it.cx - hx.ox) * (1 + k), cy = hx.oy + (it.cy - hx.oy) * (1 + k), z0 = it.level * HB + dz;
    it.p = { cx, cy, z0, z1: z0 + HB };
    const ca = Math.cos(it.ang), sa = Math.sin(it.ang), hl = it.L / 2, hw = it.Wd / 2;
    it.corners = [];
    for (const [u, v] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) for (const z of [z0, z0 + HB + 2.4]) it.corners.push([cx + u * ca - v * sa, cy + u * sa + v * ca, z]);
    const N = [[ca, sa], [-ca, -sa], [-sa, ca], [sa, -ca]], D = [hl, hl, hw, hw];
    it.planes = N.map((n, i) => ({ n: [n[0], n[1], 0], d: n[0] * cx + n[1] * cy + D[i] })).concat([{ n: [0, 0, 1], d: z0 + HB }, { n: [0, 0, -1], d: -z0 }]);
  }
  function poseTree(it) {
    it.corners = []; for (const [u, v] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) for (const z of [0, 7]) it.corners.push([it.x + u, it.y + v, z]);
    it.planes = [[1, 0], [-1, 0], [0, 1], [0, -1]].map((n) => ({ n: [n[0], n[1], 0], d: n[0] * it.x + n[1] * it.y + 2.2 })).concat([{ n: [0, 0, 1], d: 7 }, { n: [0, 0, -1], d: 0 }]);
  }
  function drawBar(it, lit) {
    const { cx, cy, z0, z1 } = it.p;
    const rg = ring(cx, cy, it.ang, it.L, it.Wd, 1), inner = ring(cx, cy, it.ang, it.L - 1.6, it.Wd - 1.6, 0.4);
    it.sil.setAttribute("d", poly(hull(ringAt(P, rg, z1).concat(ringAt(P, rg, z0)))));
    it.cr.setAttribute("d", open(ringAt(P, run(inner, front), z1)));
    it.sil.classList.toggle("hi", lit);
    // la façade : les planchers et la trame, sur les faces tournées vers nous
    const ca = Math.cos(it.ang), sa = Math.sin(it.ang), hl = it.L / 2 - 1, hw = it.Wd / 2, W = (u, v, z) => P(cx + u * ca - v * sa, cy + u * sa + v * ca, z);
    let d = "";
    for (const sd of [1, -1]) {                        // les longues faces
      if (-sa * sd * s + ca * sd * c <= 0) continue;
      for (let k = 1; k < 4; k++) d += seg(W(-hl, hw * sd, z0 + (HB * k) / 4), W(hl, hw * sd, z0 + (HB * k) / 4));
      for (let u = -hl + 3; u < hl - 1; u += 3) d += seg(W(u, hw * sd, z0), W(u, hw * sd, z1));
    }
    for (const sd of [1, -1]) {                        // les pignons
      if (ca * sd * s + sa * sd * c <= 0) continue;
      for (let k = 1; k < 4; k++) d += seg(W(hl * sd + sd, -hw + 1, z0 + (HB * k) / 4), W(hl * sd + sd, hw - 1, z0 + (HB * k) / 4));
    }
    it.fac.setAttribute("d", d);
    it.fac.classList.toggle("sil", lit); it.fac.classList.toggle("lo", !lit);
    // sur le toit : un patio rond, parfois un édicule
    const pr = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; pr.push(W(it.pool + Math.cos(a) * 2.6, Math.sin(a) * 2.6, z1)); }
    it.roof.setAttribute("d", open(pr));
    if (it.hut) {
      const hx = cx + it.hut.at * ca, hy = cy + it.hut.at * sa, hr = ring(hx, hy, it.ang, 3, 3, 0.5), hi = ring(hx, hy, it.ang, 2.2, 2.2, 0.3);
      it.hut.sil.setAttribute("d", poly(hull(ringAt(P, hr, z1 + 2.4).concat(ringAt(P, hr, z1)))));
      it.hut.cr.setAttribute("d", open(ringAt(P, run(hi, front), z1 + 2.4)));
    }
  }
  function drawTree(it) {
    const tr = ring(it.x, it.y, 0, 0.7, 0.7, 0.35), cr = ring(it.x, it.y, 0, 4.4, 4.4, 2.2), ci = ring(it.x, it.y, 0, 3.4, 3.4, 1.7);
    it.trunk.setAttribute("d", poly(hull(ringAt(P, tr, 3.5).concat(ringAt(P, tr, 0)))));
    it.crown.setAttribute("d", poly(hull(ringAt(P, cr, 7).concat(ringAt(P, cr, 3.5)))));
    it.crc.setAttribute("d", open(ringAt(P, run(ci, front), 7)));
  }

  /* ---------- l'ordre de peinture : un plan séparateur décide qui passe devant ---------- */
  const dot = (n, p) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
  function behind(A, B) {                             // -1 : A derrière B ; 1 : B derrière A ; 0 : rien ne les sépare
    for (const [X, Y, sg] of [[A, B, 1], [B, A, -1]]) for (const pl of X.planes)
      if (Y.corners.every((p) => dot(pl.n, p) >= pl.d - 1e-3)) return (dot(pl.n, T) > 0 ? -1 : 1) * sg;
    return 0;
  }
  let lastOrder = "";
  function sortItems(vis) {
    for (const it of vis) {
      let a = 1e9, b = -1e9, cc = 1e9, dd = -1e9;
      for (const q of it.corners) { const p = P(q[0], q[1], q[2]); a = Math.min(a, p[0]); b = Math.max(b, p[0]); cc = Math.min(cc, p[1]); dd = Math.max(dd, p[1]); }
      it.bb = [a, b, cc, dd]; it.depth = it.corners.reduce((m, q) => m + dot(T, q), 0) / 8; it.nin = 0; it.out = []; it.done = false;
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const A = vis[i], Bb = vis[j];
      if (A.bb[1] < Bb.bb[0] || Bb.bb[1] < A.bb[0] || A.bb[3] < Bb.bb[2] || Bb.bb[3] < A.bb[2]) continue;
      const o = behind(A, Bb) || (A.depth < Bb.depth ? -1 : 1);
      if (o < 0) { A.out.push(Bb); Bb.nin++; } else { Bb.out.push(A); A.nin++; }
    }
    const out = [];
    while (out.length < vis.length) {
      // le plus lointain de ceux que rien ne cache encore ; en cas de cycle, le plus lointain tout court
      let pick = null;
      for (const v of vis) if (!v.done && !v.nin && (!pick || v.depth < pick.depth)) pick = v;
      if (!pick) for (const v of vis) if (!v.done && (!pick || v.depth < pick.depth)) pick = v;
      pick.done = true; out.push(pick);
      for (const w of pick.out) w.nin--;
    }
    const key = out.map((v) => items.indexOf(v)).join(",");
    if (key !== lastOrder) { lastOrder = key; for (const v of out) body.appendChild(v.g); }
  }

  /* ---------- le défilement ---------- */
  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  const STEPS = LEVELS + 2;
  const sp = spring(0, { eps: 1e-4 }), spPre = spring(0, { eps: 1e-4 });
  const lev = Array.from({ length: LEVELS }, () => ({ ex: spring(0), up: spring(0) }));
  let last = "";
  const B = register(stage, (dt) => {
    const r = sec.getBoundingClientRect();
    sp.t = clamp(-r.top / (r.height - innerHeight), 0, 1);
    spPre.t = clamp(1 - r.top / innerHeight, 0, 1);
    let moving = stepS(sp, dt); moving = stepS(spPre, dt) || moving;
    const x = sp.x * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg01(f, 0.55, 1));
    const active = f < 0.55 ? k : f > 0.9 ? k + 1 : -1, shown = f < 0.7 ? k : k + 1;
    const al = active >= 1 && active <= LEVELS ? active - 1 : -1, outro = active === STEPS - 1;
    lev.forEach((L, l) => {
      L.ex.t = l === al ? 1 : 0; L.up.t = al >= 0 && l > al ? 1 : 0;
      moving = stepS(L.ex, dt) || moving; moving = stepS(L.up, dt) || moving;
    });
    const build = clamp(spPre.x * 0.8 + x * 0.5, 0, 1);              // l'assemblage, à l'arrivée
    const az = 30 + ((k + m) * 360) / (STEPS - 1);                    // un tour complet

    const sig = [az, build, ...lev.map((L) => L.ex.x * 7 + L.up.x)].map((v) => v.toFixed(3)).join("|") + active;
    if (sig !== last) {
      last = sig;
      cam.az = (az * Math.PI) / 180; s = Math.sin(cam.az); c = Math.cos(cam.az);
      T = [s * Math.cos(Math.PI / 6), c * Math.cos(Math.PI / 6), 0.5];   // vers la caméra
      const open14 = lev.reduce((a, L) => Math.max(a, L.up.x), 0) * 24;
      cam.ox = cam.oy = 0; P = proj(cam);
      const q = P(-14, -8, (LEVELS * HB + open14) / 2);
      cam.ox = 200 - q[0]; cam.oy = (small ? 150 : 162) - q[1]; P = proj(cam);

      site.setAttribute("d", poly(OUT.map(([gx, gy]) => P(gx, gy, 0))));
      siteOut.setAttribute("d", poly(OUT.map(([gx, gy]) => P(gx * 1.08 - 3, gy * 1.08, -4))));
      const vis = []; let gd = "";
      for (const it of items) {
        if (it.kind === "tree") {
          const t = seg01(build, 0.7, 0.9); it.g.style.display = t > 0 ? "" : "none";
          if (t > 0) { poseTree(it); drawTree(it); vis.push(it); }
          continue;
        }
        const t0 = it.level * 0.1 + it.hx * 0.03, t = ease(seg01(build, t0, t0 + 0.32));
        it.g.style.display = t > 0 ? "" : "none";
        if (!t) continue;
        const L = it.main ? lev[it.level] : null, ex = L ? L.ex.x : 0, up = L ? L.up.x : 0;
        pose(it, (1 - t) * 80 + ex * 8 + up * 24, ex * 0.5);
        drawBar(it, !!it.main && (ex > 0.5 || outro)); vis.push(it);
        if (ex > 0.05) {                               // l'éclaté : des pointillés rattachent la barre à sa place
          const hx = hexes[it.hx], ca = Math.cos(it.ang), sa = Math.sin(it.ang);
          for (const [u, v] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
            const lu = (u * it.L) / 2, lv = (v * it.Wd) / 2, ox = it.cx + lu * ca - lv * sa, oy = it.cy + lu * sa + lv * ca;
            gd += seg(P(ox, oy, it.level * HB), P(hx.ox + (ox - hx.ox) * (1 + ex * 0.5), hx.oy + (oy - hx.oy) * (1 + ex * 0.5), it.p.z0));
          }
        }
      }
      guides.setAttribute("d", gd);
      sortItems(vis);
    }
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === shown));
    return moving;
  });
  addEventListener("scroll", B.wake, { passive: true });
  addEventListener("resize", B.wake);
}
