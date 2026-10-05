/* ==========================================================================
   La galaxie des compétences, pilotée par le défilement.
   Une galaxie de données calme ; la caméra glisse doucement d'un nœud à
   l'autre. Chaque nœud éclairé présente une compétence à acquérir.
   Pas de rotation de caméra, pas de flash : lisible et reposant.
   ========================================================================== */
import * as THREE from "./vendor/three.module.min.js";

const sec = document.querySelector("[data-voyage]");
const cv = document.querySelector("[data-vg-cv]");
if (sec && cv) start();

function start() {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); }
  catch (e) { sec.classList.add("no-gl"); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);

  // un générateur pseudo-aléatoire stable : la galaxie est la même à chaque visite
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- les nœuds : une galaxie en spirale, aplatie ---------- */
  const NODES = small ? 260 : 520, pts = [];
  for (let i = 0; i < NODES; i++) {
    const arm = i % 3, r = 3 + Math.pow(rnd(), 0.7) * 34, a = arm * (Math.PI * 2 / 3) + r * 0.16 + (rnd() - 0.5) * 0.9;
    pts.push(new THREE.Vector3(Math.cos(a) * r, (rnd() - 0.5) * (5 - r * 0.08), Math.sin(a) * r));
  }
  // les six compétences : des nœuds éloignés les uns des autres
  const KEY = [0.12, 0.28, 0.44, 0.6, 0.76, 0.92].map((f, k) => {
    const r = 8 + f * 22, a = k * 2.2 + 0.6;
    return new THREE.Vector3(Math.cos(a) * r, (k % 2 ? 1.2 : -1.2), Math.sin(a) * r);
  });
  const all = pts.concat(KEY);

  // les points
  const pos = new Float32Array(all.length * 3), size = new Float32Array(all.length), ph = new Float32Array(all.length);
  all.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); size[i] = i >= NODES ? 0 : 0.6 + rnd() * 1.4; ph[i] = rnd() * 6.28; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("sz", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float sz; attribute float ph; uniform float uT; uniform float uPR; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); float d = -mv.z;
        vA = (.45 + .2*sin(uT*.8 + ph)) * smoothstep(110., 20., d);
        gl_PointSize = sz * uPR * (70. / max(d, 1.)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord-.5); if (r>.5) discard; gl_FragColor = vec4(.16,.15,.14, vA*smoothstep(.5,.2,r)); }`
  });
  scene.add(new THREE.Points(geo, pmat));

  // les liens : chaque nœud relié à ses deux plus proches voisins
  const lines = [];
  for (let i = 0; i < all.length; i++) {
    const d = all.map((q, j) => [j, i === j ? 1e9 : all[i].distanceToSquared(q)]).sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 2; k++) if (d[k][1] < 60) lines.push(all[i], all[d[k][0]]);
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x3d3d3a, transparent: true, opacity: 0.14, depthWrite: false })));

  // les nœuds des compétences : un point orange et un halo qui respire
  const haloTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(226,98,43,1)"); r.addColorStop(.18, "rgba(226,98,43,1)"); r.addColorStop(.22, "rgba(255,170,130,.45)"); r.addColorStop(1, "rgba(255,170,130,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  const keys = KEY.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false }));
    s.position.copy(p); s.scale.setScalar(1.4); scene.add(s); return s;
  });
  // le fil orange qui relie les compétences déjà vues
  const pathGeo = new THREE.BufferGeometry().setFromPoints(KEY.flatMap((p, i) => (i ? [KEY[i - 1], p] : [])));
  scene.add(new THREE.LineSegments(pathGeo, new THREE.LineBasicMaterial({ color: 0xe2622b, transparent: true, opacity: 0.6, depthWrite: false })));

  /* ---------- caméra : vue d'ensemble, puis de nœud en nœud ---------- */
  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  const STEPS = KEY.length + 2;                      // vue d'ensemble, 6 compétences, vue d'ensemble
  const wide = { pos: new THREE.Vector3(0, 46, 52), look: new THREE.Vector3(0, -2, 0) };
  function shotOf(k) {                               // un plan posé à côté du nœud, le nœud décalé à droite du cadre
    if (k <= 0 || k >= STEPS - 1) return wide;
    const p = KEY[k - 1], out = p.clone().setY(0).normalize(), side = new THREE.Vector3(-out.z, 0, out.x), off = small ? 0 : 3.2;
    return { pos: p.clone().addScaledVector(out, 9).addScaledVector(side, off).add(new THREE.Vector3(0, 3.5, 0)), look: p.clone().addScaledVector(side, off) };
  }
  function resize() { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();

  let P = 0, visible = false, last = performance.now(), t0 = last;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);
  const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight), 0, 1); };
  const cPos = new THREE.Vector3(), cLook = new THREE.Vector3();

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const target = progress(); P += (target - P) * (1 - Math.exp(-dt * 5)); if (Math.abs(target - P) < 1e-4) P = target;
    const time = (now - t0) / 1000; pmat.uniforms.uT.value = time;

    // chaque étape : on reste sur le plan (60 %), puis on glisse vers le suivant (40 %)
    const x = P * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg(f, 0.6, 1));
    const A = shotOf(k), B = shotOf(k + 1);
    cPos.copy(A.pos).lerp(B.pos, m); cLook.copy(A.look).lerp(B.look, m);
    cPos.y += Math.sin(m * Math.PI) * 4;               // un léger arc entre deux nœuds
    camera.position.copy(cPos); camera.lookAt(cLook);

    const active = f < 0.6 ? k : (f > 0.85 ? k + 1 : -1);   // étape affichée (aucune pendant le trajet)
    keys.forEach((s, i) => {
      const on = active === i + 1, sc = on ? 1.9 + 0.15 * Math.sin(time * 2) : 1.1;
      s.scale.setScalar(s.scale.x + (sc - s.scale.x) * 0.1);
      s.material.opacity = on || active <= 0 || active >= STEPS - 1 ? 1 : 0.45;
    });
    pathGeo.setDrawRange(0, Math.max(0, Math.round(Math.min(KEY.length - 1, x - 0.4) * 2)));
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === active));

    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
