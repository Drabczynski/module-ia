/* ==========================================================================
   L'immeuble, au trait : une figure dans le style et sur le moteur de
   Hairline (@lucasmarkes/hairline, licence MIT, dans vendor/hairline).
   Dessin isométrique en un seul trait, solides arrondis, plaques opaques
   peintes de l'arrière vers l'avant. Le défilement pilote tout :
   1. la construction : les étages tombent et s'empilent, échafaudage en pointillé ;
   2. l'éclaté : les étages s'écartent, celui qu'on présente glisse vers nous
      et prend le trait orange (bureaux, écrans, collaborateurs à l'intérieur) ;
   3. un tour complet de l'immeuble sur toute la section ;
   4. l'immeuble se referme, l'orbe sur le toit.
   ========================================================================== */
import HL from "./vendor/hairline/kernel.js";

const { Cam, proj, facing, rings, prism, open, seg, mk, solid, put, register, spring, stepS, clamp, inject } = HL;

const sec = document.querySelector("[data-voyage]");
const stage = document.querySelector("[data-vg-hl]");
if (sec && stage) start();

function start() {
  const seg01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;

  inject(document);
  stage.setAttribute("data-hairline", "immeuble");
  stage.setAttribute("data-hairline-theme", "light");
  const svg = mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);

  /* ---------- l'immeuble, en unités du monde : x et y au sol, z vers le haut ---------- */
  const W = 60, D = 42, SLAB = 2.4, FLOORS = 6, CLEAR = [13, 10, 10, 10, 10, 10], GAP = 3, OPEN = 17, SLIDE = 20, DROP = 90;
  const base = [];
  for (let i = 0, z = 0; i <= FLOORS; i++) { base.push(z); z += SLAB + (CLEAR[i] || 0); }

  const box = (x0, y0, x1, y1, z0, z1, r = 1.2, b = 0.6, tag = "") => ({ z0, z1, tag, rg: rings(x0, y0, x1, y1, r, b), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  const pillar = (x, y, R, z0, z1, tag) => box(x - R, y - R, x + R, y + R, z0, z1, R, Math.min(0.5, R * 0.4), tag);
  const person = (x, y, out) => out.push(pillar(x, y, 1.6, 0, 6.2, "body"), pillar(x, y, 1.15, 6.9, 9.2, "head"));

  function furnish(i) {
    const it = [];
    for (const [x, y] of [[2.6, 2.6], [W - 2.6, 2.6], [2.6, D - 2.6], [W - 2.6, D - 2.6]]) it.push(pillar(x, y, 1.3, 0, CLEAR[i], "post"));
    if (i === 0) {                                   // l'accueil : comptoir, hôtesse, visiteurs, plantes
      it.push(box(18, 9, 42, 14, 0, 4.2, 2.2, 0.8, "desk"));
      person(30, 5.6, it); person(24, 25, it); person(36, 28, it);
      it.push(pillar(8.5, 33, 3, 0, 4, "pot"), pillar(51.5, 33, 3, 0, 4, "pot"));
    } else if (i === FLOORS - 1) {                   // la direction : la grande table du comité
      it.push(box(17, 13, 43, 29, 0, 3.6, 7, 1.2, "desk"));
      for (const [x, y] of [[23, 9.6], [30, 9.6], [37, 9.6], [23, 32.4], [30, 32.4], [37, 32.4], [13, 21], [47, 21]]) person(x, y, it);
    } else {                                         // les plateaux : deux rangées de postes
      for (const y of [8, 25]) for (const x of [7, 24, 41]) {
        it.push(box(x, y, x + 12, y + 5, 0, 3.4, 1, 0.5, "desk"));
        it.push(box(x + 3.5, y + 0.6, x + 8.5, y + 1.4, 3.4, 7, 0.3, 0.12, "screen"));
        if ((x + y + i * 7) % 3) person(x + 6, y + 8.2, it);
      }
    }
    return it;
  }
  function furnishRoof() {
    return [box(7, 7, 21, 17, 0, 5, 1.6, 0.7), box(24, 7, 33, 13, 0, 4, 1.2, 0.6), pillar(45, 27, 3.2, 0, 2.2, "plinth"), pillar(14, 31, 0.5, 0, 12, "mast")];
  }

  /* ---------- les éléments, créés une fois, dans l'ordre de peinture ---------- */
  const guides = mk("path", { class: "nf dash" }, svg);
  const plinth = solid(svg), plinthRg = rings(-9, -9, W + 9, D + 9, 9, 2.2);
  const slabRg = rings(0, 0, W, D, 3, 1.4);
  const layers = [];
  for (let L = 0; L <= FLOORS; L++) {
    const g = mk("g", {}, svg), roof = L === FLOORS;
    const lay = { L, g, roof, slab: solid(g), back: mk("path", { class: "nf lo" }, g), gi: mk("g", {}, g), sl: spring(0), lf: spring(0), order: "" };
    lay.items = (roof ? furnishRoof() : furnish(L)).map((it) => ({ ...it, el: solid(lay.gi) }));
    lay.mull = mk("path", { class: "nf lo" }, g);
    lay.top = mk("path", { class: "nf sil" }, g);
    if (roof) lay.orb = mk("ellipse", { class: "sil" }, g), lay.orbIn = mk("ellipse", { class: "nf lo" }, g);
    layers.push(lay);
  }

  /* ---------- une couche : dalle, mobilier trié par profondeur, façade vitrée ---------- */
  const SIDES = [{ n: [0, -1], a: [0, 0], b: [W, 0] }, { n: [1, 0], a: [W, 0], b: [W, D] }, { n: [0, 1], a: [W, D], b: [0, D] }, { n: [-1, 0], a: [0, D], b: [0, 0] }];
  function drawLayer(lay, zb, dx, dy, s, c, lit) {
    const Pt = (x, y, z) => P(x + dx, y + dy, z), zf = zb + SLAB;
    put(lay.slab, prism(Pt, front, slabRg[0], slabRg[1], zb, zf));
    lay.slab.sil.classList.toggle("hi", lit);
    // le mobilier, du plus loin au plus près
    const order = lay.items.map((it, k) => [it.cx * s + it.cy * c + it.z0 * 1e-3, k]).sort((a, b) => a[0] - b[0]);
    const key = order.map((o) => o[1]).join(",");
    if (key !== lay.order) { lay.order = key; for (const [, k] of order) lay.gi.appendChild(lay.items[k].el.g); }
    for (const it of lay.items) {
      put(it.el, prism(Pt, front, it.rg[0], it.rg[1], zf + it.z0, zf + it.z1));
      it.el.sil.classList.toggle("hi", lit && it.tag === "screen");
    }
    if (lay.roof) {
      const q = Pt(45, 27, zf + 2.2 + 4.2), R = 4.2 * C.S;
      for (const [e, r] of [[lay.orb, R], [lay.orbIn, R * 0.62]]) { e.setAttribute("cx", q[0].toFixed(2)); e.setAttribute("cy", q[1].toFixed(2)); e.setAttribute("rx", r.toFixed(2)); e.setAttribute("ry", r.toFixed(2)); }
      lay.top.setAttribute("d", ""); lay.mull.setAttribute("d", ""); lay.back.setAttribute("d", "");
      return;
    }
    // la façade : arêtes hautes partout, montants seulement sur les faces tournées vers nous
    const zt = zf + CLEAR[lay.L];
    let back = "", top = "", mull = "";
    for (const sd of SIDES) {
      const f = sd.n[0] * s + sd.n[1] * c > 0, A = Pt(sd.a[0], sd.a[1], zt), Bp = Pt(sd.b[0], sd.b[1], zt);
      if (!f) { back += seg(A, Bp); continue; }
      top += seg(A, Bp);
      const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]), n = Math.round(len / 7.5);
      for (let k = 1; k < n; k++) {
        const t = k / n, x = sd.a[0] + (sd.b[0] - sd.a[0]) * t, y = sd.a[1] + (sd.b[1] - sd.a[1]) * t;
        mull += seg(Pt(x, y, zf), Pt(x, y, zt));
      }
    }
    lay.back.setAttribute("d", back); lay.top.setAttribute("d", top); lay.mull.setAttribute("d", mull);
    lay.top.classList.toggle("hi", lit);
  }

  /* ---------- le défilement ---------- */
  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  const STEPS = FLOORS + 2;                              // vue d'ensemble, six étages, la fin
  const C = Cam(45, 0.5, small ? 1.95 : 2.0);
  let P = proj(C), front = facing(C);
  const sp = spring(0, { eps: 1e-4 }), spPre = spring(0, { eps: 1e-4 });
  // le cadrage : zoom, hauteur du regard, et part du cadre donnée à l'étage ouvert, chacun sur son ressort
  const zoom = spring(small ? 1.7 : 1.8, { k: 60, c: 15.5, eps: 1e-3 }), tilt = spring(0.6, { k: 60, c: 15.5, eps: 1e-4 }), aim = spring(0, { k: 60, c: 15.5, eps: 1e-4 }), side = spring(0, { k: 60, c: 15.5, eps: 1e-3 });
  let last = "";

  const B = register(stage, (dt) => {
    const r = sec.getBoundingClientRect();
    sp.t = clamp(-r.top / (r.height - innerHeight), 0, 1);
    spPre.t = clamp(1 - r.top / innerHeight, 0, 1);
    let moving = stepS(sp, dt); moving = stepS(spPre, dt) || moving;

    const x = sp.x * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg01(f, 0.55, 1));
    const active = f < 0.55 ? k : f > 0.9 ? k + 1 : -1, shown = f < 0.7 ? k : k + 1;
    const build = clamp(spPre.x * 0.75 + x * 0.6, 0, 1);                    // la construction, à l'arrivée
    const burst = ease(seg01(x, 0.5, 1.05)) * (1 - ease(seg01(x, 6.5, 7)));   // l'éclaté, pendant les étages
    const az = 45 + ((k + m) * 360) / (STEPS - 1);                          // un tour complet
    const af = active >= 1 && active <= FLOORS ? active - 1 : -1;            // l'étage ouvert
    for (const lay of layers) {
      lay.sl.t = lay.L === af ? 1 : 0; lay.lf.t = af >= 0 && lay.L > af ? 1 : 0;   // il glisse vers nous, ceux du dessus se soulèvent
      moving = stepS(lay.sl, dt) || moving; moving = stepS(lay.lf, dt) || moving;
    }

    // la prise de vue visée : large et plongeante à l'arrivée, serrée et rasante sur l'étage ouvert, en recul à la fin
    const tk = f < 0.55 ? k : k + 1, tf = tk >= 1 && tk <= FLOORS ? tk - 1 : -1;
    zoom.t = tf >= 0 ? (small ? 3.0 : 3.5) : tk === 0 ? (small ? 1.7 : 1.8) : (small ? 1.8 : 1.95);
    tilt.t = tf >= 0 ? (tf % 2 ? 0.44 : 0.3) : tk === 0 ? 0.62 : 0.52;
    aim.t = tf >= 0 ? 1 : 0;
    side.t = small ? 0 : tk % 2 ? -58 : 58;              // l'immeuble se range du côté opposé à l'encart
    moving = stepS(side, dt) || moving;
    moving = stepS(zoom, dt) || moving; moving = stepS(tilt, dt) || moving; moving = stepS(aim, dt) || moving;

    const sig = [az, build, burst, zoom.x, tilt.x, aim.x * 3, side.x / 50, ...layers.map((l) => l.sl.x + l.lf.x * 3)].map((v) => v.toFixed(3)).join("|") + active;
    if (sig !== last) {
      last = sig;
      C.az = (az * Math.PI) / 180;
      const s = Math.sin(C.az), c = Math.cos(C.az);
      const top = base[FLOORS] + SLAB + 6 + burst * GAP * FLOORS + layers[FLOORS].lf.x * OPEN;
      C.ox = C.oy = 0; P = proj(C);
      C.S = zoom.x; C.k = tilt.x; P = proj(C);
      // le point visé : le centre de l'immeuble, ou l'étage ouvert, là où il a glissé
      let fx = W / 2, fy = D / 2, fz = top / 2;
      let sw = 0, sx = 0, sy = 0, sz = 0;                 // moyenne pondérée par le glissement : le cadre passe d'un étage à l'autre sans saut
      for (const l of layers) if (!l.roof && l.sl.x > 0.001) {
        const w = l.sl.x, o = SLIDE * w; sw += w;
        sx += w * (W / 2 + o * s); sy += w * (D / 2 + o * c); sz += w * (base[l.L] + l.L * GAP * burst + l.lf.x * OPEN + SLAB + CLEAR[l.L] / 2);
      }
      if (sw > 0.01) { fx = sx / sw; fy = sy / sw; fz = sz / sw; }
      const a = aim.x, q = P(W / 2 + (fx - W / 2) * a, D / 2 + (fy - D / 2) * a, top / 2 + (fz - top / 2) * a);
      C.ox = 200 + side.x - q[0]; C.oy = (small ? 158 : 166) - q[1];
      P = proj(C); front = facing(C);

      put(plinth, prism(P, front, plinthRg[0], plinthRg[1], -3, 0));
      // l'échafaudage : visible pendant la construction et l'éclaté, peint derrière tout
      const show = build < 1 || burst > 0.02;
      guides.setAttribute("d", show ? [[0, 0], [W, 0], [0, D], [W, D]].map(([gx, gy]) => seg(P(gx, gy, 0), P(gx, gy, top))).join("") : "");
      const outro = active === STEPS - 1;
      for (const lay of layers) {
        const t = ease(seg01(build, lay.L * 0.1, lay.L * 0.1 + 0.34));
        lay.g.style.display = t > 0 ? "" : "none";
        if (!t) continue;
        const zb = base[lay.L] + lay.L * GAP * burst + lay.lf.x * OPEN + (1 - t) * DROP;
        const o = SLIDE * lay.sl.x;
        drawLayer(lay, zb, o * s, o * c, s, c, (!lay.roof && active === lay.L + 1) || (outro && !lay.roof));
      }
      const orbLit = active === 0 || active === -1 && k === 0 || outro;
      layers[FLOORS].orb.classList.toggle("hi", orbLit);
    }
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === shown));
    return moving;
  });
  addEventListener("scroll", B.wake, { passive: true });
  addEventListener("resize", B.wake);
}
