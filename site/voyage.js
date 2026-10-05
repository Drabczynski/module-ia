/* ==========================================================================
   L'immeuble : une entreprise en maquette 3D, seule sur fond beige.
   Un immeuble de bureaux (façade vitrée, hall d'accueil, toit technique)
   et son ombre portée. On en fait le tour au défilement ; à
   chaque étage, les bureaux du service s'allument et une carte montre un
   usage concret de l'IA. Derrière chaque vitre, une vraie pièce en
   perspective (interior mapping) : plafonds lumineux, postes, écrans,
   collaborateurs au travail. Ombres, bloom et flou de bascule (effet maquette).
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "./vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "./vendor/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "./vendor/addons/postprocessing/OutputPass.js";

const sec = document.querySelector("[data-voyage]");
const cv = document.querySelector("[data-vg-cv]");
if (sec && cv) start();

function start() {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- rendu ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { sec.classList.add("no-gl"); return; }
  renderer.setPixelRatio(Math.min(small ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;   // le beige du fond reste exactement celui de la page
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const BEIGE = new THREE.Color("#faf9f5");   // exactement le fond du site (--bg)
  const scene = new THREE.Scene();
  scene.background = BEIGE;
  scene.fog = new THREE.Fog(BEIGE, 80, 220);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.12;

  const FOV = small ? 26 : 22;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);
  scene.add(new THREE.HemisphereLight(0xfffaf2, 0xd8ccb6, 1.0));
  const moon = new THREE.DirectionalLight(0xfff0dc, 1.3);
  moon.position.set(-30, 52, 26); moon.castShadow = true;
  moon.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.02; moon.shadow.radius = 4;
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -22, near: 1, far: 140 });
  scene.add(moon);

  /* ---------- textures dessinées ---------- */
  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const solarTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#1d2a4a"; g.fillRect(0, 0, w, h); g.strokeStyle = "#7f93c2"; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  });

  /* ---------- outils ---------- */
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const mesh = (geo, m, x, y, z, { sx = 1, sy = 1, sz = 1, ry = 0, cast = true, recv = true, parent = scene } = {}) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = ry;
    o.castShadow = cast; o.receiveShadow = recv; parent.add(o); return o;
  };
  const inst = (geo, m, list, { cast = true, recv = true, parent = scene } = {}) => {
    const im = new THREE.InstancedMesh(geo, m, list.length), o = new THREE.Object3D();
    list.forEach((t, i) => { o.position.set(t[0], t[1], t[2]); o.rotation.set(0, t[3] || 0, 0); o.scale.set(t[4] ?? 1, t[5] ?? 1, t[6] ?? 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = cast; im.receiveShadow = recv; parent.add(im); return im;
  };
  const planeUV = (w, h, tile) => { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); return g; };

  /* ---------- le sol : rien que l'ombre portée ---------- */
  const CURB = 0;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x5a4a35, opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const blobTex = canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 30, 128, 128, 128); r.addColorStop(0, "rgba(90,74,53,.28)"); r.addColorStop(1, "rgba(90,74,53,0)"); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(40, 32), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.01; scene.add(blob);

  /* ---------- l'immeuble de bureaux ---------- */
  const FLOORS = 6, GH = 4.6, FH = 3.6, W = 18, D = 12, H = GH + (FLOORS - 1) * FH, BAY = 1.5;
  const floorY = (i) => (i === 0 ? 0 : GH + (i - 1) * FH), floorH = (i) => (i === 0 ? GH : FH);
  const B = new THREE.Group(); B.position.y = CURB; scene.add(B);
  const opt = { parent: B };
  const SIDES = [{ th: 0, len: W, half: D / 2 }, { th: Math.PI / 2, len: D, half: W / 2 }, { th: Math.PI, len: W, half: D / 2 }, { th: -Math.PI / 2, len: D, half: W / 2 }];
  const [sFront, sRight, sBack, sLeft] = SIDES;
  const at = (s, a, y, o) => { const c = Math.cos(s.th), n = Math.sin(s.th); return [c * a + n * (s.half + o), y, -n * a + c * (s.half + o)]; };

  const panel = mat(0xaaa7a0, { roughness: 0.5, metalness: 0.2 }), alu = mat(0x2e333b, { roughness: 0.35, metalness: 0.7 });
  const stone = mat(0xcfc9bd, { roughness: 0.8 }), dark = mat(0x23252b, { roughness: 0.5, metalness: 0.4 });
  const bulb = new THREE.SphereGeometry(1, 10, 8);

  /* les bureaux derrière les vitres : chaque vitre ouvre sur une vraie pièce en perspective
     (« interior mapping ») : plafond et ses dalles lumineuses, postes de travail, écrans,
     collaborateurs. Aucune géométrie : un rayon par pixel, calculé sur la carte graphique. */
  const floorLit = new Float32Array(FLOORS);
  const winUniforms = { uLit: { value: floorLit }, uAll: { value: 0 }, uT: { value: 0 } };
  const panes = [];
  const addPane = (s, a, y, w, h, f, room, kind) => panes.push({ p: at(s, a, y, kind ? -0.9 : 0), th: s.th, w, h, f, ...room, kind });
  // étages : bandeaux vitrés, une pièce tous les trois ou quatre modules
  for (let i = 1; i < FLOORS; i++) SIDES.forEach((s) => {
    const n = Math.round(s.len / BAY), per = s.len === W ? 3 : 4;
    for (let r0 = 0; r0 < n; r0 += per) {
      const cnt = Math.min(per, n - r0), seed = rnd(), mid = -s.len / 2 + (r0 + cnt / 2) * BAY;
      for (let j = r0; j < r0 + cnt; j++) { const a = -s.len / 2 + (j + 0.5) * BAY; addPane(s, a, floorY(i) + 0.75 + 1.275, BAY, 2.55, i, { off: a - mid, rw: cnt * BAY, seed, y0: -2.025, y1: 1.475, depth: 5 }, 0); }
    }
  });
  // rez-de-chaussée : le hall d'accueil (en retrait, côté rue et côté droit), des bureaux derrière
  for (const s of [sFront, sRight]) { const L = s.len - 0.5, n = Math.round(L / 3); for (let j = 0; j < n; j++) { const w = L / n, a = -L / 2 + (j + 0.5) * w; addPane(s, a, 2.25, w, 3.9, 0, { off: a, rw: L, seed: 0.5, y0: -2.25, y1: 2.15, depth: 8 }, 1); } }
  for (const s of [sBack, sLeft]) { const n = Math.round(s.len / BAY); for (let j = 0; j < n; j++) { const a = -s.len / 2 + (j + 0.5) * BAY, mid = -s.len / 2 + (Math.floor(j / 4) * 4 + 2) * BAY; addPane(s, a, 0.75 + 1.6, BAY, 3.2, 0, { off: a - mid, rw: 4 * BAY, seed: rnd(), y0: -2.35, y1: 2.05, depth: 5 }, 0); } }
  {
    const g = new THREE.PlaneGeometry(1, 1), n = panes.length;
    const A = new Float32Array(n * 4), Bv = new Float32Array(n * 4), C = new Float32Array(n * 4);
    panes.forEach((p, i) => { A.set([p.w, p.h, p.off, p.rw], i * 4); Bv.set([p.y0, p.y1, p.depth, p.seed], i * 4); C.set([p.f, p.kind, 0, 0], i * 4); });
    g.setAttribute("aA", new THREE.InstancedBufferAttribute(A, 4)); g.setAttribute("aB", new THREE.InstancedBufferAttribute(Bv, 4)); g.setAttribute("aC", new THREE.InstancedBufferAttribute(C, 4));
    const wm = new THREE.ShaderMaterial({
      uniforms: winUniforms,
      vertexShader: `attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; varying vec3 vP; flat varying vec3 vE; flat varying vec4 vA; flat varying vec4 vB; flat varying vec4 vC;
        void main(){
          mat4 m = modelMatrix * instanceMatrix; vec3 s = vec3(aA.xy, 1.);
          vP = position * s; vE = (inverse(m) * vec4(cameraPosition, 1.)).xyz * s;   // l'œil, dans le repère de la pièce (en mètres)
          vA = aA; vB = aB; vC = aC; gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.); }`,
      fragmentShader: `uniform float uLit[${FLOORS}]; uniform float uAll; uniform float uT; varying vec3 vP; flat varying vec3 vE; flat varying vec4 vA; flat varying vec4 vB; flat varying vec4 vC;
        float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
        float box2(vec2 p, vec2 c, vec2 r){ vec2 d = abs(p - c) - r; return step(max(d.x, d.y), 0.); }
        float soft(vec2 p, vec2 r){ vec2 q = abs(p - .5) - r; float d = max(q.x, q.y), w = fwidth(d) + .02; return 1. - smoothstep(-w, w, d); }
        void main(){
          float lit = 0.; for (int k = 0; k < ${FLOORS}; k++) if (float(k) == vC.x) lit = uLit[k];
          bool lobby = vC.y > .5;
          float seed = floor(vB.w * 997.) / 997., hw = vA.w * .5, y0 = vB.x, y1 = vB.y, dep = vB.z;
          vec3 o = vP + vec3(vA.z, 0., 0.), d = normalize(vP - vE);
          float on = max(lit, uAll), roomOn = lobby ? 1. : step(.28, h1(seed * 91.7 + vC.x));
          float L = max(mix(.32, .8, roomOn), on);
          vec3 lc = mix(vec3(1.,.95,.86), vec3(2.3,1.35,.6), on) * L;          // blanc froid le soir, chaud quand l'IA s'allume
          // le rayon traverse la pièce : murs, sol, plafond
          float tx = ((d.x > 0. ? hw : -hw) - o.x) / d.x, ty = ((d.y > 0. ? y1 : y0) - o.y) / d.y, tz = (-dep - o.z) / d.z;
          float t = min(tx, min(ty, tz)); vec3 p = o + d * t; vec3 c;
          if (t == ty && d.y > 0.) {                                       // plafond et dalles lumineuses
            float pan = soft(vec2(fract(p.x / 1.5 + .5), fract(-p.z / 1.8)), vec2(.3, .16));
            c = vec3(.55) * lc + pan * lc * 1.6;
          } else if (t == ty) c = vec3(.26,.26,.28) * lc * (.7 + .3 * smoothstep(-dep, 0., p.z));   // moquette
          else if (t == tz) {                                              // le mur du fond
            c = vec3(.62,.6,.57) * lc * (.6 + .4 * smoothstep(y0, y1, p.y));
            if (lobby) { float r = length(p.xy - vec2(0., .2)); c = mix(c, mix(vec3(2.6,1.2,.55), vec3(.8,1.6,2.), .5 + .5 * sin(p.y * 4. + uT)), smoothstep(.75, .7, r)); }
            else c = mix(c, vec3(.25,.4,.3) * lc, box2(p.xy, vec2((h1(seed * 7.) - .5) * vA.w * .6, y0 + 1.6), vec2(.5, .35)));   // un tableau
          } else c = vec3(.56,.55,.52) * lc * (.6 + .4 * smoothstep(y0, y1, p.y));   // cloisons
          // le mobilier, en deux plans : les collaborateurs, puis les bureaux et leurs écrans
          vec3 scr = mix(vec3(.45,.7,1.35), vec3(2.6,1.25,.5), on) * (.75 + .25 * sin(uT * 2. + seed * 40.));
          float zP = lobby ? -3.4 : -1.5, zD = lobby ? -2.9 : -2.1;
          if (lobby) { float tmp = zP; zP = zD; zD = tmp; }
          for (int layer = 0; layer < 2; layer++) {
            float z = layer == 0 ? zP : zD, tl = (z - o.z) / d.z;
            if (tl <= 0. || tl >= t) continue;
            vec3 q = o + d * tl; float y = q.y - y0; bool hit = false; vec3 col;
            bool deskLayer = (layer == 1) != lobby;
            for (int k = 0; k < 5; k++) {
              float xs = lobby ? 0. : -hw + .75 + float(k) * 1.5;
              if (xs > hw - .5) break;
              float here = lobby ? 1. : step(.3, h1(seed * 13. + float(k) + vC.x)) * roomOn;
              if (deskLayer) {
                if (lobby) { if (box2(vec2(q.x, y), vec2(0., .55), vec2(2.4, .55)) > 0.) { col = mix(vec3(.75,.6,.45), vec3(.9,.82,.7), step(1.02, y)) * L; hit = true; } }
                else {
                  if (box2(vec2(q.x, y), vec2(xs, .9 + .2), vec2(.3, .19)) > 0.) { col = (y > .94 && y < 1.26 && abs(q.x - xs) < .27) ? scr * (roomOn * here * .9 + on * .6) * (.8 + .2 * step(.5, fract(y * 22.))) : vec3(.05); hit = true; }
                  else if (box2(vec2(q.x, y), vec2(xs, .86), vec2(.035, .1)) > 0.) { col = vec3(.05); hit = true; }
                  else if (box2(vec2(q.x, y), vec2(q.x, .37), vec2(10., .37)) > 0.) { col = (y > .7 ? vec3(.86,.8,.72) : vec3(.3,.31,.33)) * lc; hit = true; }
                }
              } else if (here > .5) {
                float px = xs + (h1(seed * 3. + float(k)) - .5) * .3;
                float head = step(length(vec2(q.x - px, y - 1.27)), .12), body = box2(vec2(q.x, y), vec2(px, .9), vec2(.21, .27)) * step(length(vec2(abs(q.x - px) - .1, max(y - 1.05, 0.))), .13);
                float chair = box2(vec2(q.x, y), vec2(px, .65), vec2(.25, .3));
                if (head + body > 0.) { col = mix(vec3(.04,.035,.04), scr * .25, .35); hit = true; }
                else if (chair > 0.) { col = vec3(.08,.08,.1) * (.5 + L); hit = true; }
              }
              if (hit) break;
            }
            if (hit) { c = col; break; }
          }
          // le verre : reflet du ciel nocturne, montants fins
          float fres = .06 + .55 * pow(1. - abs(d.z), 4.);
          c = mix(c, mix(vec3(.42,.45,.5), vec3(.7,.71,.72), vP.y / vA.y + .5), fres);
          vec2 e = abs(vP.xy) - vA.xy * .5;
          if (max(e.x, e.y) > -.035) c = vec3(.09,.1,.12);
          gl_FragColor = vec4(c, 1.);
        }`
    });
    const im = new THREE.InstancedMesh(g, wm, panes.length), o = new THREE.Object3D();
    panes.forEach((p, i) => { o.position.set(...p.p); o.rotation.set(0, p.th, 0); o.scale.set(p.w, p.h, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.frustumCulled = false; B.add(im);
  }

  // allèges : un bandeau clair à chaque étage, le couronnement en haut
  const bands = [];
  for (let i = 1; i < FLOORS; i++) bands.push([floorY(i) - 0.3, 1.05]);
  bands.push([H - 0.3, 1.9]);
  bands.forEach(([y, h]) => {
    for (const z of [1, -1]) mesh(box, panel, 0, y + h / 2, z * (D / 2 + 0.06), { ...opt, sx: W + 0.24, sy: h, sz: 0.12 });
    for (const x of [1, -1]) mesh(box, panel, x * (W / 2 + 0.06), y + h / 2, 0, { ...opt, sx: 0.12, sy: h, sz: D + 0.24 });
    for (const z of [1, -1]) mesh(box, alu, 0, y + 0.06, z * (D / 2 + 0.13), { ...opt, sx: W + 0.3, sy: 0.05, sz: 0.04, cast: false });
  });
  // rez-de-chaussée : soubassement et linteau autour des vitres
  for (const s of [sBack, sLeft]) { mesh(box, panel, ...at(s, 0, 0.375, 0.06), { ...opt, sx: s.len, sy: 0.75, sz: 0.12, ry: s.th }); mesh(box, panel, ...at(s, 0, 4.12, 0.06), { ...opt, sx: s.len, sy: 0.36, sz: 0.12, ry: s.th }); }
  for (const s of [sFront, sRight]) mesh(box, alu, ...at(s, 0, 0.15, -0.9), { ...opt, sx: s.len - 0.5, sy: 0.3, sz: 0.1, ry: s.th });
  // ailettes verticales en aluminium, à chaque module
  const fins = [];
  SIDES.forEach((s) => { const n = Math.round(s.len / BAY); for (let j = 1; j < n; j++) fins.push([...at(s, -s.len / 2 + j * BAY, GH + (H - 0.3 - GH) / 2 + 0.375, 0.16), s.th, 0.07, H - 0.3 - GH - 0.75, 0.32]); });
  inst(box, alu, fins, opt);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box, panel, sx * W / 2, (H + 1.6) / 2, sz * D / 2, { ...opt, sx: 0.5, sy: H + 1.6, sz: 0.5 });
  // le hall : poteaux, sous-face éclairée, auvent d'entrée
  const posts = [];
  for (const s of [sFront, sRight]) for (let a = -s.len / 2 + 4.25; a < s.len / 2 - 1; a += 4.5) posts.push([...at(s, a, (GH - 0.3) / 2, -0.2), 0, 0.42, GH - 0.3, 0.42]);
  inst(box, panel, posts, opt);
  mesh(box, mat(0x3a3d44), 0, GH - 0.32, D / 2 - 0.45, { ...opt, sx: W, sy: 0.04, sz: 0.9, cast: false });
  mesh(box, mat(0x3a3d44), W / 2 - 0.45, GH - 0.32, 0, { ...opt, sx: 0.9, sy: 0.04, sz: D, cast: false });
  mesh(box, panel, 0, GH - 0.9, D / 2 + 1.6, { ...opt, sx: 7.5, sy: 0.32, sz: 3.6 });
  const downs = [];
  for (let x = -3; x <= 3; x += 1.5) for (const z of [D / 2 + 0.8, D / 2 + 2.4]) downs.push([x, GH - 1.07, z, 0, 0.16, 0.02, 0.16]);
  for (let x = -W / 2 + 1; x < W / 2; x += 2) downs.push([x, GH - 0.35, D / 2 - 0.45, 0, 0.14, 0.02, 0.14]);
  inst(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.6, 3.2) }), downs, { ...opt, cast: false });
  mesh(box, mat(0x6f6c66), 0, 0.08, D / 2 + 1.6, { ...opt, sx: 7.5, sy: 0.16, sz: 3.6, cast: false });
  // le nom de l'entreprise, en lettres lumineuses sur le couronnement
  const nameTex = canvasTex(1024, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 44); r.addColorStop(0, "#fff3e6"); r.addColorStop(0.5, "#ff9a6a"); r.addColorStop(1, "#7fc8e8");
    g.fillStyle = r; g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "700 66px Inter, 'Helvetica Neue', Arial, sans-serif"; g.textBaseline = "middle"; g.letterSpacing = "4px";
    g.fillText("VOTRE ENTREPRISE", 136, 68);
  });
  const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, color: new THREE.Color(2.2, 2.1, 2.0), depthWrite: false });
  const name = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.2), nameMat); name.position.set(0.6, H + 0.65, D / 2 + 0.14); B.add(name);
  const name2 = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), nameMat); name2.rotation.y = Math.PI / 2; name2.position.set(W / 2 + 0.14, H + 0.65, 0); B.add(name2);

  /* ---------- le toit technique ---------- */
  const R0 = H + 0.9;
  mesh(box, mat(0x3a3b42, { roughness: 0.95 }), 0, R0 - 0.1, 0, { ...opt, sx: W - 0.3, sy: 0.2, sz: D - 0.3 });
  const louverTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#8d9097"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = "#4d5057"; g.fillRect(0, y, w, 3); } }, true);
  louverTex.repeat.set(4, 2);
  const louver = mat(0xffffff, { map: louverTex, roughness: 0.6, metalness: 0.3 });
  mesh(box, louver, -3.6, R0 + 1.4, -1.6, { ...opt, sx: 7, sy: 2.8, sz: 4.6 });
  mesh(box, panel, -3.6, R0 + 2.86, -1.6, { ...opt, sx: 7.3, sy: 0.14, sz: 4.9 });
  const fans = [], acMat = mat(0xc9ccd0, { roughness: 0.5, metalness: 0.2 }), bladeMat = mat(0x8a8d93);
  for (const [x, z] of [[3.4, -3.2], [5.6, -3.2], [6.6, -0.6]]) {
    mesh(box, acMat, x, R0 + 0.55, z, { ...opt, sx: 1.9, sy: 1.1, sz: 1.5 });
    mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24), dark, x, R0 + 1.12, z, opt);
    const fan = new THREE.Group(); fan.position.set(x, R0 + 1.17, z); B.add(fan);
    for (let k = 0; k < 2; k++) mesh(box, bladeMat, 0, 0, 0, { parent: fan, sx: 0.95, sy: 0.02, sz: 0.16, ry: (k * Math.PI) / 2 });
    fans.push(fan);
  }
  const solarTop = mat(0xffffff, { map: solarTex, roughness: 0.3, metalness: 0.5 });
  for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) {
    const x = -6.6 + k * 1.45, z = 2.6 + r * 2.2;
    mesh(new THREE.BoxGeometry(1.3, 0.06, 1.9), [dark, dark, solarTop, dark, dark, dark], x, R0 + 0.55, z, opt).rotation.x = -0.4;
  }
  // antenne et son feu rouge
  mesh(new THREE.CylinderGeometry(0.06, 0.1, 6, 8), alu, -6.2, R0 + 2.8 + 3, -2.6, opt);
  const beacon = mesh(bulb, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) }), -6.2, R0 + 2.8 + 6.05, -2.6, { ...opt, sx: 0.14, sy: 0.14, sz: 0.14, cast: false });

  // l'assistant : l'orbe, posée au centre du toit
  const orbMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vP = position; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uT; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      float b(float y, float c, float w){ return exp(-pow((y-c)/w,2.)); }
      void main(){ float f = 1. - max(dot(vN,vV),0.); float y = vP.y/1.1 + .15*sin(vP.x*2.6+uT) + .08*sin(vP.z*3.-uT*1.3);
        vec3 c = vec3(1.1,1.08,1.05);
        c = mix(c, vec3(1.6,.7,.55), b(y,.2,.16)); c = mix(c, vec3(1.5,.8,1.05), b(y,.36,.1)*.8);
        c = mix(c, vec3(1.4,1.3,.6), b(y,-.04,.08)*.8); c = mix(c, vec3(.45,1.3,1.45), b(y,-.18,.09));
        c = mix(c, mix(vec3(.7,1.2,1.3), vec3(1.4,1.05,.7), .5+.5*sin(atan(vN.y,vN.x)*1.5+uT*.6)), smoothstep(.55,1.,f));
        gl_FragColor = vec4(c*.85, 1.); }`
  });
  const ORB_Y = R0 + 2.4;
  const orb = mesh(new THREE.SphereGeometry(1.1, 64, 48), orbMat, 3.6, ORB_Y, 2.8, { ...opt, cast: false, recv: false });
  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 32), stone, 3.6, R0 + 0.25, 2.8, opt);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 1) }));
  halo.rotation.x = Math.PI / 2; halo.position.set(3.6, R0 + 0.55, 2.8); B.add(halo);
  const orbLight = new THREE.PointLight(0xffc9a0, 18, 9, 1.6); orbLight.position.set(3.6, ORB_Y, 2.8); B.add(orbLight);

  /* ---------- lucioles : elles s'échappent des fenêtres de l'étage éclairé ---------- */
  const N = small ? 900 : 2200;
  const motes = (() => {
    const g = new THREE.BufferGeometry(), a = new Float32Array(N * 4), b = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const s = SIDES[Math.floor(rnd() * 4)], f = Math.floor(rnd() * FLOORS), p = at(s, (rnd() - 0.5) * s.len, floorY(f) + rnd() * floorH(f) + CURB, 0.2);
      a.set([p[0], p[1], p[2], f], i * 4); b.set([Math.sin(s.th), Math.cos(s.th), rnd(), 0.6 + rnd() * 0.8], i * 4);
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("a", new THREE.BufferAttribute(a, 4)); g.setAttribute("b", new THREE.BufferAttribute(b, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uLit: { value: floorLit }, uScale: { value: 800 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 a; attribute vec4 b; uniform float uT; uniform float uScale; uniform float uLit[${FLOORS}]; varying float vA;
        void main(){ float lit = 0.; for (int k = 0; k < ${FLOORS}; k++) if (float(k) == a.w) lit = uLit[k];
          float t = fract(uT * .12 * b.w + b.z);
          vec3 p = a.xyz + vec3(b.x, 0., b.y) * (t * 2.6) + vec3(sin(t * 6. + b.z * 30.) * .3, t * 3.2, cos(t * 5. + b.z * 20.) * .3);
          vA = lit * sin(t * 3.1416);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = .2 * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - .5); if (r > .5) discard; gl_FragColor = vec4(vec3(1.6,.62,.25), vA * smoothstep(.5,.1,r)); }`
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); return m;
  })();

  /* ---------- post-traitement : bloom, puis flou de bascule (effet maquette) ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), small ? 0.35 : 0.45, 0.4, 1.25));
  const tilt = (dir, vig) => new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(...dir) }, uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: 0.5 }, uBand: { value: 0.16 }, uMax: { value: 4 }, uVig: { value: vig } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uMax; uniform float uVig; varying vec2 vUv;
      void main(){ float r = smoothstep(uBand, uBand + .34, abs(vUv.y - uFocus)) * uMax; vec2 d = uDir / uRes * r;
        vec4 c = texture2D(tDiffuse, vUv) * .227;
        c += (texture2D(tDiffuse, vUv + d) + texture2D(tDiffuse, vUv - d)) * .1945;
        c += (texture2D(tDiffuse, vUv + d * 2.) + texture2D(tDiffuse, vUv - d * 2.)) * .1216;
        c += (texture2D(tDiffuse, vUv + d * 3.) + texture2D(tDiffuse, vUv - d * 3.)) * .054;
        c += (texture2D(tDiffuse, vUv + d * 4.) + texture2D(tDiffuse, vUv - d * 4.)) * .0162;
        vec2 q = vUv - .5; c.rgb *= 1. - uVig * dot(q, q) * 1.5;
        gl_FragColor = c; }`
  });
  const tiltH = tilt([1, 0], 0), tiltV = tilt([0, 1], 0);
  composer.addPass(tiltH); composer.addPass(tiltV);
  composer.addPass(new OutputPass());

  /* ---------- caméra : on fait le tour, étage par étage ---------- */
  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  const STEPS = FLOORS + 2;                          // vue d'ensemble, six étages, le toit
  function shotOf(k) {                               // az : angle autour de l'immeuble ; e : pente du regard ; need : largeur à garder visible
    if (k <= 0) return { az: -0.8, r: 96, e: 0.5, ty: 11, need: 34 };
    if (k >= STEPS - 1) return { az: 5.55, r: 96, e: 0.62, ty: 12, need: 34 };
    const i = k - 1; return { az: -0.45 + i * 0.74, r: 78, e: 0.4, ty: CURB + floorY(i) + floorH(i) / 2, need: 30 };
  }
  let fitK = 1;
  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    if (!small) camera.setViewOffset(w, h, -w * 0.16, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.2, w, h);   // l'immeuble à droite (en haut sur mobile), le texte à côté
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    for (const p of [tiltH, tiltV]) { p.uniforms.uRes.value.set(w * pr, h * pr); p.uniforms.uMax.value = (small ? 2.2 : 3.6) * pr; p.uniforms.uFocus.value = small ? 0.7 : 0.5; }
    motes.uniforms.uScale.value = (h * pr) / (2 * Math.tan((FOV * Math.PI) / 360));
    fitK = Math.tan((FOV * Math.PI) / 360) * camera.aspect * (small ? 1 : 0.68);   // demi-largeur visible par unité de distance
  }
  addEventListener("resize", resize); resize();

  const floors = Array.from({ length: FLOORS }, () => ({ lit: 0 }));
  let P = 0, visible = false, last = performance.now(), t0 = last;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);
  const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight), 0, 1); };
  const floorLight = new THREE.PointLight(0xffb27a, 0, 16, 1.5); scene.add(floorLight);
  const shopLight = new THREE.PointLight(0xffc08a, 0, 12, 1.5); shopLight.position.set(0, CURB + 2, D / 2 + 3); scene.add(shopLight);
  const fy = new THREE.Vector3();

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const target = progress(); P += (target - P) * (1 - Math.exp(-dt * 4.5)); if (Math.abs(target - P) < 1e-4) P = target;
    const time = (now - t0) / 1000;
    motes.uniforms.uT.value = time; orbMat.uniforms.uT.value = time;

    // étape : on reste sur le plan, puis on glisse vers le suivant
    const x = P * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg(f, 0.55, 1));
    const A = shotOf(k), Bs = shotOf(k + 1), mix = (p) => A[p] + (Bs[p] - A[p]) * m;
    const az = mix("az") + Math.sin(time * 0.15) * 0.03, ty = mix("ty"), r = Math.max(mix("r"), mix("need") / 2 / fitK), y = ty + r * mix("e");
    camera.position.set(Math.sin(az) * r, y, Math.cos(az) * r); camera.lookAt(0, ty, 0);
    const dist = camera.position.length(); scene.fog.near = dist * 1.4; scene.fog.far = dist * 3;

    const active = f < 0.55 ? k : (f > 0.9 ? k + 1 : -1), shown = f < 0.7 ? k : k + 1;
    const ease4 = 1 - Math.exp(-dt * 4);
    floors.forEach((fl, i) => { fl.lit += ((active === i + 1 ? 1 : 0) - fl.lit) * ease4; floorLit[i] = fl.lit; });
    winUniforms.uAll.value += ((active === STEPS - 1 ? 1 : 0) - winUniforms.uAll.value) * ease4;
    // une lueur chaude devant l'étage éclairé, du côté de la caméra
    const fi = clamp(active - 1, 0, FLOORS - 1), focus = active >= 1 && active <= FLOORS ? 1 : 0;
    const cx = Math.sin(az), cz = Math.cos(az), reach = Math.abs(cx) * W / 2 + Math.abs(cz) * D / 2 + 2.5;
    fy.set(cx * reach, CURB + floorY(fi) + floorH(fi) * 0.6, cz * reach);
    floorLight.position.lerp(fy, ease4); floorLight.intensity += (focus * 55 - floorLight.intensity) * ease4;
    shopLight.intensity += ((floors[0].lit + winUniforms.uAll.value) * 40 - shopLight.intensity) * ease4;

    beacon.visible = (time % 1.6) < 0.25;
    winUniforms.uT.value = time;
    fans.forEach((fan, i) => { fan.rotation.y = time * (5 + i * 1.3); });
    orb.scale.setScalar(1 + 0.04 * Math.sin(time * 2.2));
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === shown));

    composer.render();
  }
  requestAnimationFrame(render);
}
