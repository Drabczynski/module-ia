/* ==========================================================================
   L'ensemble : des barres de bureaux empilées et croisées, en dessin
   d'architecte (trait sombre, façades tramées, sol rose). Six niveaux de
   barres autour d'une cour hexagonale : un niveau par service. Au défilement,
   la caméra survole l'ensemble, en fait le tour à hauteur d'œil, entre dans
   la cour par une trouée et lève les yeux, remonte par le vide central
   jusqu'aux toits, puis repart en vue aérienne. Le niveau présenté prend
   le ton rose et le trait orange.
   ========================================================================== */
import * as THREE from "three";

const sec = document.querySelector("[data-voyage]");
const cv = document.querySelector("[data-vg-cv]");
if (sec && cv) start();

function start() {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- rendu ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); }
  catch (e) { sec.classList.add("no-gl"); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#faf9f5");                 // le fond du site (--bg)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.4, 3000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe2d9d2, 1.25 * Math.PI));   // éclairage physique : la diffusion est divisée par π
  const sun = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI); sun.position.set(-60, 110, 90); scene.add(sun);

  /* ---------- textures dessinées : façades tramées, sous-faces en nid d'abeille ---------- */
  const INK = "#3b3634", aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (w, h, draw) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const facade = (bays, tall) => (g, w, h) => {      // 4 niveaux sur la hauteur, `bays` travées sur la largeur
    g.fillStyle = "#f7f4ef"; g.fillRect(0, 0, w, h);
    const bw = w / bays, sh = h / 4;
    for (let s = 0; s < 4; s++) for (let b = 0; b < bays; b++) {
      const x = b * bw, y = s * sh, loggia = !tall && rnd() < 0.12;
      if (loggia) {                                     // une loggia : renfoncement sombre, garde-corps hachuré
        g.fillStyle = "#b9aeaa"; g.fillRect(x + 3, y + sh * 0.12, bw - 6, sh * 0.8);
        g.strokeStyle = "#d9d2cc"; g.lineWidth = 1.5;
        for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(x + 3, y + sh * (0.55 + k * 0.05)); g.lineTo(x + bw - 3, y + sh * (0.55 + k * 0.05)); g.stroke(); }
      } else {
        g.fillStyle = tall ? "#ebe6e0" : "#eee9e3"; g.fillRect(x + 5, y + sh * 0.14, bw - 10, sh * 0.72);
        g.strokeStyle = "#4e4845"; g.lineWidth = 1.7; g.strokeRect(x + 5, y + sh * 0.14, bw - 10, sh * 0.72);
        g.lineWidth = 1; g.beginPath(); g.moveTo(x + bw / 2, y + sh * 0.14); g.lineTo(x + bw / 2, y + sh * 0.86);
        g.moveTo(x + 5, y + sh * 0.42); g.lineTo(x + bw - 5, y + sh * 0.42); g.stroke();
      }
    }
    g.fillStyle = "#5a5350";
    for (let s = 0; s <= 4; s++) g.fillRect(0, s * sh - 1.5, w, 3);
    for (let b = 0; b <= bays; b++) g.fillRect(b * bw - 0.75, 0, 1.5, h);
  };
  const facTex = [tex(1024, 512, facade(8, false)), tex(1024, 512, facade(8, false))];
  const endTex = tex(256, 512, facade(2, true));
  const soffTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = "#c9b9b1"; g.fillRect(0, 0, w, h); g.strokeStyle = "#e6dcd6"; g.lineWidth = 2;
    const r = 42, dx = r * 1.5, dy = r * Math.sqrt(3);
    for (let i = -1; i < w / dx + 1; i++) for (let j = -1; j < h / dy + 1; j++) {
      const cx = i * dx, cy = j * dy + (i % 2 ? dy / 2 : 0);
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3; g[k ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.stroke();
    }
  });

  const INKc = new THREE.Color(INK), ORANGE = new THREE.Color("#e2622b"), PINK = new THREE.Color(1, 0.8, 0.74), WHITE = new THREE.Color(1, 1, 1);
  const lineMat = new THREE.LineBasicMaterial({ color: INKc });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xefeae4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xf0c3bb });
  const ventMat = new THREE.MeshLambertMaterial({ color: 0x4a4442 });
  const withEdges = (mesh, mat = lineMat, thr = 1) => { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, thr), mat)); return mesh; };

  /* ---------- une barre : façades tramées, toit, sous-face, édicule, patio rond ---------- */
  const blocks = [];
  function bar(cx, cz, ang, y, L, Wd, H, level, main) {
    const g = new THREE.BoxGeometry(L, H, Wd), uv = g.attributes.uv;
    for (let i = 16; i < 24; i++) uv.setX(i, uv.getX(i) * L / 24);               // les longues façades : une trame de 3 m
    for (let i = 12; i < 16; i++) uv.setXY(i, uv.getX(i) * L / 14, uv.getY(i) * Wd / 14);
    const off = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    const mLong = new THREE.MeshLambertMaterial({ map: facTex[(level + (main ? 0 : 1)) % 2], ...off });
    const mEnd = new THREE.MeshLambertMaterial({ map: endTex, ...off });
    const mSoff = new THREE.MeshLambertMaterial({ map: soffTex, ...off });
    const mRoof = roofMat.clone();
    const edge = new THREE.LineBasicMaterial({ color: INKc.clone() });
    const m = withEdges(new THREE.Mesh(g, [mEnd, mEnd, mRoof, mSoff, mLong, mLong]), edge);
    m.position.set(cx, y + H / 2, cz); m.rotation.y = -ang; scene.add(m);
    // sur le toit : un patio rond, un édicule, des aérations
    const side = rnd() < 0.5 ? -1 : 1, top = H / 2;
    const pool = withEdges(new THREE.Mesh(new THREE.CircleGeometry(Wd * 0.3, 40), poolMat), edge);
    pool.rotation.x = -Math.PI / 2; pool.position.set(side * L * 0.22, top + 0.04, 0); m.add(pool);
    const hut = withEdges(new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.3, 2.8), roofMat), edge);
    hut.position.set(-side * L * 0.28, top + 1.15, (rnd() - 0.5) * 2); m.add(hut);
    for (const k of [-1, 1]) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), ventMat); v.position.set(side * L * 0.05 + k * 2.4, top + 0.45, Wd * 0.28 * k); m.add(v); }
    const par = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * (L / 2 - 0.5), top + 0.03, b * (Wd / 2 - 0.5)))), edge);
    m.add(par);
    blocks.push({ m, level, main, mats: [mLong, mEnd, mRoof], edge, lit: 0 });
  }

  /* ---------- l'entrelacs : un hexagone de barres, chaque niveau tourné d'un côté ---------- */
  const LEVELS = 6, HB = 9;
  function cluster(ox, oz, rot, s, levels, main) {
    for (let l = 0; l < levels; l++) for (let e = l % 2; e < 6; e += 2) {
      const tw0 = rot + l * 0.11, a0 = tw0 + (e * Math.PI) / 3, a1 = tw0 + ((e + 1) * Math.PI) / 3;   // chaque niveau tourne un peu : l'entrelacs
      const x0 = s * Math.cos(a0), z0 = s * Math.sin(a0), x1 = s * Math.cos(a1), z1 = s * Math.sin(a1);
      const tw = (rnd() - 0.5) * 0.1;
      bar(ox + (x0 + x1) / 2, oz + (z0 + z1) / 2, Math.atan2(z1 - z0, x1 - x0) + tw, l * HB, s * 1.38, 8, HB, l, main);
    }
  }
  cluster(0, 0, 0, 42, LEVELS, true);           // l'ensemble principal : un niveau par service
  cluster(100, -82, 0.35, 30, 4, false);
  cluster(132, 22, -0.2, 26, 3, false);

  /* ---------- le sol : une dalle rose, son emmarchement, les arbres, les terrains ---------- */
  const outline = [[-80, -55], [-42, -112], [64, -124], [152, -62], [156, 38], [104, 96], [18, 102], [-62, 82], [-90, 18]].map(([x, z]) => [30 + (x - 30) * 1.3, -10 + (z + 10) * 1.3]);
  {
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -1.6, 0);
    scene.add(withEdges(new THREE.Mesh(g, [new THREE.MeshBasicMaterial({ color: 0xf5d7d2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), new THREE.MeshLambertMaterial({ color: 0xffffff })]), lineMat, 20));
    const cx = 32, cz = -6, far = outline.map(([x, z]) => new THREE.Vector3(cx + (x - cx) * 1.1, -4, cz + (z - cz) * 1.1));
    scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(far), lineMat));
    const ribs = [];
    outline.forEach(([x, z], i) => ribs.push(new THREE.Vector3(x, -1.6, z), far[i]));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ribs), lineMat));
  }
  const inside = (x, z) => { let c = false; for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) { const [xi, zi] = outline[i], [xj, zj] = outline[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const clear = (x, z) => Math.hypot(x, z) > 64 && Math.hypot(x - 100, z + 82) > 46 && Math.hypot(x - 132, z - 22) > 40;
  {
    const pts = [];
    for (let n = 0; n < 160 && pts.length < 26 * 2 * 16; n++) {
      const x = -110 + rnd() * 300, z = -160 + rnd() * 280;
      if (!inside(x, z) || !clear(x, z) || !inside(x + 6, z + 6) || !inside(x - 6, z - 6)) continue;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, b = ((k + 1) / 12) * Math.PI * 2; pts.push(x + 1.8 * Math.cos(a), 0.05, z + 1.8 * Math.sin(a), x + 1.8 * Math.cos(b), 0.05, z + 1.8 * Math.sin(b)); }
      pts.push(x, 0, z, x, 4, z);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; pts.push(x, 4, z, x + 2.2 * Math.cos(a), 3.1, z + 2.2 * Math.sin(a)); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, lineMat));
  }
  const walk = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const a of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {   // les allées qui partent des trouées
    const p = withEdges(new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 3.2), walk));
    p.position.set(Math.cos(a) * 66, 0.15, Math.sin(a) * 66); p.rotation.y = -a; scene.add(p);
  }
  for (let i = 0; i < 3; i++) {                                               // trois terrains de sport
    const c = withEdges(new THREE.Mesh(new THREE.BoxGeometry(13, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xef4b3c })));
    c.position.set(-82 + i * 8, 0.13, -40 - i * 13); c.rotation.y = 0.45; scene.add(c);
  }

  /* ---------- la caméra : survol, tour à hauteur d'œil, la cour, les toits ---------- */
  const SH = [
    { p: [200, 175, 245], t: [25, 12, -15], f: 30 },    // l'ensemble, vu d'avion
    { p: [88, 20, 118], t: [0, 7, 0], f: 40 },          // 0 · l'accueil, au pied des barres
    { p: [-120, 40, 88], t: [0, 14, 0], f: 38 },        // 1 · les RH
    { p: [-25, 28, -150], t: [0, 24, 0], f: 34 },       // 2 · la communication, en élévation
    { p: [0, 5, 118], t: [0, 24, 0], f: 46 },           // 3 · la finance, devant la trouée
    { p: [0, 2.5, 4], t: [0, 42, -20], f: 80 },         // 4 · le juridique : dans la cour, on lève les yeux
    { p: [10, 92, 20], t: [0, 47, -8], f: 46 },         // 5 · la direction, sur les toits
    { p: [-205, 185, 215], t: [25, 12, -15], f: 30 },   // retour à la vue d'avion
  ];
  const STEPS = SH.length;
  const cam = (A, B, m, time) => {                       // les positions tournent autour de l'ensemble, sans le traverser
    const ra = Math.hypot(A.p[0], A.p[2]), rb = Math.hypot(B.p[0], B.p[2]);
    const aa = Math.atan2(A.p[2], A.p[0]); let da = Math.atan2(B.p[2], B.p[0]) - aa;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const r = lerp(ra, rb, m), a = aa + da * m + Math.sin(time * 0.12) * 0.03 * clamp((r - 40) / 60, 0, 1);
    camera.position.set(r * Math.cos(a), lerp(A.p[1], B.p[1], m), r * Math.sin(a));
    camera.lookAt(lerp(A.t[0], B.t[0], m), lerp(A.t[1], B.t[1], m), lerp(A.t[2], B.t[2], m));
    const f = Math.min(100, lerp(A.f, B.f, m) * (small ? 1.6 : 1));   // écran étroit : on ouvre le champ
    if (Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix(); }
  };
  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (!small) camera.setViewOffset(w, h, -w * 0.16, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  let P = 0, visible = false, last = performance.now(), t0 = last;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);
  const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight), 0, 1); };
  const tmp = new THREE.Color();

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const target = progress(); P += (target - P) * (1 - Math.exp(-dt * 4.5)); if (Math.abs(target - P) < 1e-4) P = target;
    const time = (now - t0) / 1000;
    const x = P * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg(f, 0.55, 1));
    cam(SH[k], SH[k + 1], m, time);

    const active = f < 0.55 ? k : f > 0.9 ? k + 1 : -1, shown = f < 0.7 ? k : k + 1;
    const ek = 1 - Math.exp(-dt * 4);
    for (const b of blocks) {
      const want = b.main && (active === b.level + 1 || active === STEPS - 1) ? 1 : 0;
      if (Math.abs(want - b.lit) < 1e-3 && b.done) continue;
      b.lit += (want - b.lit) * ek; b.done = Math.abs(want - b.lit) < 1e-3;
      tmp.copy(WHITE).lerp(PINK, b.lit); b.mats.forEach((mm) => mm.color.copy(tmp));
      b.edge.color.copy(INKc).lerp(ORANGE, b.lit);
    }
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === shown));
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
