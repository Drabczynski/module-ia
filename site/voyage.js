/* ==========================================================================
   L'immeuble : une entreprise en maquette 3D, pilotée par le défilement.
   On tourne lentement autour ; à chaque étage, un service s'éclaire et montre
   un usage concret de l'IA. Au cœur du bâtiment, un flux de données monte
   jusqu'au toit, où se tient l'assistant ; une nuée de particules enveloppe
   l'ensemble. Verre réfléchissant (environnement), ombres douces, halo sur
   les étages éclairés (bloom), particules animées sur la carte graphique.
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "./vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/addons/postprocessing/OutputPass.js";

const sec = document.querySelector("[data-voyage]");
const cv = document.querySelector("[data-vg-cv]");
if (sec && cv) start();

function start() {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const small = matchMedia("(max-width: 800px)").matches;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- rendu ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { sec.classList.add("no-gl"); return; }
  renderer.setPixelRatio(Math.min(small ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const BG = new THREE.Color("#faf9f5");
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 120, 240);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;   // reflets du verre
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfbf, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1e0, 1.25);
  sun.position.set(-22, 40, 18); sun.castShadow = !small;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -14, near: 1, far: 100 });
  scene.add(sun);

  /* ---------- l'immeuble ---------- */
  const FLOORS = 6, FH = 3.4, W = 16, D = 11, HOLE = 1.7, H = FLOORS * FH;
  const building = new THREE.Group(); scene.add(building);
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeae1, roughness: 0.85, envMapIntensity: 0.3 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8d887e, roughness: 0.5, metalness: 0.3 });

  // le socle, et une ombre douce au sol
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ color: 0x2a2620, opacity: 0.16 }));   // un sol invisible : seule l'ombre apparaît
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const r = g.createRadialGradient(128, 128, 20, 128, 128, 128); r.addColorStop(0, "rgba(40,36,30,.35)"); r.addColorStop(1, "rgba(40,36,30,0)"); g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; scene.add(blob);

  // dalles percées au centre : le flux de données les traverse
  const slabShape = new THREE.Shape(); slabShape.moveTo(-W / 2 - 0.4, -D / 2 - 0.4); slabShape.lineTo(W / 2 + 0.4, -D / 2 - 0.4); slabShape.lineTo(W / 2 + 0.4, D / 2 + 0.4); slabShape.lineTo(-W / 2 - 0.4, D / 2 + 0.4); slabShape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, HOLE, 0, Math.PI * 2, true); slabShape.holes.push(hole);
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 48 });
  slabGeo.rotateX(-Math.PI / 2);

  const floors = [];
  for (let i = 0; i <= FLOORS; i++) {
    const slab = new THREE.Mesh(slabGeo, white); slab.position.y = i * FH; slab.castShadow = slab.receiveShadow = true; building.add(slab);
    if (i === FLOORS) break;
    const y0 = i * FH + 0.38, fl = { y: i * FH, lit: 0 };
    // vitrage : légèrement teinté, il se réchauffe quand l'étage s'éclaire
    fl.glass = new THREE.MeshPhysicalMaterial({ color: 0xdbe7ef, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    [[W, 0, D / 2, 0], [W, 0, -D / 2, 0], [D, W / 2, 0, Math.PI / 2], [D, -W / 2, 0, Math.PI / 2]].forEach(([len, x, z, r]) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, FH - 0.4), fl.glass); g.position.set(x, y0 + (FH - 0.4) / 2, z); g.rotation.y = r; building.add(g);
    });
    // plafond lumineux (il fait briller l'étage éclairé)
    fl.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.5), transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, D - 0.6), fl.glowMat); glow.rotation.x = Math.PI / 2; glow.position.y = (i + 1) * FH - 0.05; building.add(glow);
    // liseré lumineux autour de l'étage éclairé
    fl.edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.6, 1.15, 0.45), transparent: true, opacity: 0, toneMapped: false });
    const e = 0.5, ex = W / 2 + e, ez = D / 2 + e;
    for (const yy of [i * FH + 0.36, (i + 1) * FH - 0.02]) {
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ex, yy, -ez), new THREE.Vector3(ex, yy, -ez), new THREE.Vector3(ex, yy, ez), new THREE.Vector3(-ex, yy, ez)]), fl.edgeMat);
      building.add(loop);
    }
    floors.push(fl);
  }
  // montants de façade
  {
    const posts = [];
    for (let i = 0; i < FLOORS; i++) {
      for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 6) posts.push([x, i * FH, D / 2], [x, i * FH, -D / 2]);
      for (let z = -D / 2 + D / 4; z < D / 2 - 0.01; z += D / 4) posts.push([W / 2, i * FH, z], [-W / 2, i * FH, z]);
    }
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, FH - 0.32, 0.07), frameMat, posts.length), o = new THREE.Object3D();
    posts.forEach((p, k) => { o.position.set(p[0], p[1] + 0.32 + (FH - 0.32) / 2, p[2]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
    m.castShadow = true; building.add(m);
  }
  // le noyau de verre, au centre
  const core = new THREE.Mesh(new THREE.CylinderGeometry(HOLE - 0.05, HOLE - 0.05, H + 0.4, 48, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe0ec, roughness: 0.02, transparent: true, opacity: 0.16, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }));
  core.position.y = H / 2; building.add(core);

  // l'intérieur : postes de travail, écrans, personnes
  const desks = [], screens = [], people = [];
  for (let i = 0; i < FLOORS; i++) {
    const y = i * FH + 0.38;
    for (let gx = -3; gx <= 3; gx++) for (let gz = -1; gz <= 1; gz += 2) {
      const x = gx * 2.05, z = gz * 2.6;
      if (Math.hypot(x, z) < HOLE + 1.6) continue;
      if (i === FLOORS - 1 && Math.abs(gx) < 2) continue;       // la direction : une grande table
      desks.push([x, y, z, i]);
      for (const s of [-1, 1]) { screens.push([x + s * 0.42, y, z - 0.18, i]); if (rnd() < 0.8) people.push([x + s * 0.42, y, z + 0.62, i]); }
    }
  }
  const deskMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.07, 1.0), new THREE.MeshStandardMaterial({ color: 0xd9c3a2, roughness: 0.7 }), desks.length);
  const legMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.66, 0.9), new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.9 }), desks.length);
  const o3 = new THREE.Object3D();
  desks.forEach((d, k) => { o3.position.set(d[0], d[1] + 0.74, d[2]); o3.updateMatrix(); deskMesh.setMatrixAt(k, o3.matrix); o3.position.y = d[1] + 0.36; o3.updateMatrix(); legMesh.setMatrixAt(k, o3.matrix); });
  deskMesh.castShadow = true; building.add(deskMesh, legMesh);
  const screenMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const screenMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.38, 0.03), screenMat, screens.length);
  screens.forEach((s, k) => { o3.position.set(s[0], s[1] + 1.02, s[2]); o3.rotation.set(-0.08, 0, 0); o3.updateMatrix(); screenMesh.setMatrixAt(k, o3.matrix); screenMesh.setColorAt(k, new THREE.Color(0.55, 0.6, 0.66)); });
  building.add(screenMesh);
  const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0xd9c3a2, roughness: 0.6 }));
  tableMesh.position.set(-5.2, (FLOORS - 1) * FH + 0.38 + 0.74, 0); tableMesh.castShadow = true; building.add(tableMesh);
  const tones = [0x3d3d3a, 0x6b6f7a, 0x8a5a3c, 0x2f4a6b, 0x9b8f80, 0xc06a4a];
  const personMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.62, 4, 12), new THREE.MeshStandardMaterial({ roughness: 0.8 }), people.length + 8);
  people.forEach((p, k) => { o3.rotation.set(0, 0, 0); o3.position.set(p[0], p[1] + 0.52, p[2]); o3.updateMatrix(); personMesh.setMatrixAt(k, o3.matrix); personMesh.setColorAt(k, new THREE.Color(tones[k % tones.length])); });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; o3.position.set(-5.2 + Math.cos(a) * 2.9, (FLOORS - 1) * FH + 0.38 + 0.52, Math.sin(a) * 2.9); o3.updateMatrix(); personMesh.setMatrixAt(people.length + k, o3.matrix); personMesh.setColorAt(people.length + k, new THREE.Color(tones[(k + 2) % tones.length])); }
  personMesh.castShadow = true; building.add(personMesh);

  // sur le toit : l'assistant, une petite orbe lumineuse
  const orbMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, toneMapped: false,
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vP = position; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uT; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      float b(float y, float c, float w){ return exp(-pow((y-c)/w,2.)); }
      void main(){ float f = 1. - max(dot(vN,vV),0.); float y = vP.y/1.2 + .15*sin(vP.x*2.6+uT) + .08*sin(vP.z*3.-uT*1.3);
        vec3 c = vec3(1.02,1.,.98);
        c = mix(c, vec3(1.25,.6,.5), b(y,.2,.16)); c = mix(c, vec3(1.2,.7,.85), b(y,.36,.1)*.8);
        c = mix(c, vec3(1.1,1.05,.55), b(y,-.04,.08)*.8); c = mix(c, vec3(.4,1.1,1.2), b(y,-.18,.09));
        c = mix(c, mix(vec3(.6,1.,1.1), vec3(1.15,.9,.6), .5+.5*sin(atan(vN.y,vN.x)*1.5+uT*.6)), smoothstep(.55,1.,f));
        gl_FragColor = vec4(c, 1.); }`
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 64, 48), orbMat);
  orb.position.y = H + 2.2; building.add(orb);

  /* ---------- particules (animées par la carte graphique) ---------- */
  const floorLit = new Float32Array(FLOORS);
  const partUniforms = { uT: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uLit: { value: floorLit }, uH: { value: H } };
  function points(n, fill, vertexBody) {
    const g = new THREE.BufferGeometry(), a = new Float32Array(n * 4), b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) fill(i, a, b);
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("a", new THREE.BufferAttribute(a, 4)); g.setAttribute("b", new THREE.BufferAttribute(b, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), 60);
    const m = new THREE.ShaderMaterial({
      uniforms: partUniforms, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute vec4 a; attribute vec4 b; uniform float uT; uniform float uPR; uniform float uH; uniform float uLit[${FLOORS}];
        varying vec3 vC; varying float vA;
        void main(){ vec3 p; float s; ${vertexBody}
          vec4 mv = modelViewMatrix*vec4(p,1.); gl_PointSize = s*uPR*(160./max(-mv.z,1.)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord-.5); if (r>.5) discard; gl_FragColor = vec4(vC, vA*smoothstep(.5,.15,r)); }`
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); return pts;
  }
  const K = small ? 0.4 : 1;
  // 1. le flux qui monte dans le noyau
  points(Math.round(9000 * K), (i, a, b) => { const r = Math.sqrt(rnd()) * (HOLE - 0.3); a.set([Math.cos(i) * r, rnd() * (H + 3), Math.sin(i * 1.7) * r, 0.8 + rnd() * 2.2], i * 4); b.set([rnd() * 6.28, rnd(), 0, 0], i * 4); },
    `float y = mod(a.y + uT*a.w, uH + 3.); float sp = b.x + uT*.6; p = vec3(a.x*cos(sp)-a.z*sin(sp), y, a.x*sin(sp)+a.z*cos(sp));
     float k = y/uH; vC = mix(vec3(.25,.6,2.2), vec3(2.4,1.05,.45), k); vA = .9*smoothstep(0.,1.,y)*(1.-smoothstep(uH+1.5,uH+3.,y)); s = .55 + b.y*.5;`);
  // 2. la nuée qui enveloppe l'immeuble, en spirale ascendante
  points(Math.round(24000 * K), (i, a, b) => {
      const j = i % 3, y = rnd() * (H + 6) - 1, g = () => (rnd() + rnd() + rnd() - 1.5);
      a.set([j * 2.094 + y * 0.3 + g() * 0.18, 12.5 + g() * 1.3, y, 0], i * 4); b.set([rnd() * 6.28, rnd(), rnd() < 0.16 ? 1 : 0, 0], i * 4);
    },
    `float ang = a.x + uT*.06; float y = a.z + sin(uT*.5 + b.x)*.25; p = vec3(cos(ang)*a.y, y, sin(ang)*a.y*.82);
     vC = b.z > .5 ? vec3(.89,.42,.18) : vec3(.12,.16,.27); vA = (.45 + .45*b.y) * smoothstep(-1., 1., y) * (1. - smoothstep(uH + 3., uH + 5., y)); s = .32 + b.y*.38;`);
  // 3. les impulsions : des postes de l'étage éclairé vers le noyau
  points(Math.round(6000 * K), (i, a, b) => { const f = i % FLOORS, ang = rnd() * 6.28, r = 3 + rnd() * 4.5; a.set([Math.cos(ang) * r * 1.4, f * FH + 1.3 + rnd() * 0.3, Math.sin(ang) * r * 0.9, f], i * 4); b.set([rnd(), 0.3 + rnd() * 0.5, 0, 0], i * 4); },
    `float lit = 0.; for (int k = 0; k < ${FLOORS}; k++) if (float(k) == a.w) lit = uLit[k];
     float t = fract(b.x + uT*b.y); p = mix(vec3(a.x, a.y, a.z), vec3(0., a.y + .6, 0.), t*t);
     vC = mix(vec3(2.6,1.3,.55), vec3(.6,1.3,2.4), t); vA = lit * sin(t*3.1416); s = .5;`);

  /* ---------- post-traitement : un halo sur ce qui brille ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 1.6);   // seuls les éléments « plus que blancs » brillent
  if (!small) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- caméra : on tourne autour, étage par étage ---------- */
  const caps = Array.from(sec.querySelectorAll("[data-cap]"));
  const STEPS = FLOORS + 2;                          // vue d'ensemble, six étages, le toit
  function shotOf(k) {
    const z = small ? 1.55 : 1;                      // sur mobile, on recule pour voir l'immeuble entier
    if (k <= 0) return { az: -0.75, r: 78 * z, y: 34, ty: H * 0.45 };
    if (k >= STEPS - 1) return { az: 3.3, r: 74 * z, y: H + 24, ty: H * 0.5 };
    const i = k - 1; return { az: -0.5 + i * 0.62, r: 48 * z, y: i * FH + 7, ty: i * FH + 1.7 };
  }
  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    if (!small) camera.setViewOffset(w, h, -w * 0.16, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.2, w, h);   // l'immeuble à droite (ou en haut sur mobile), le texte à côté
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  let P = 0, visible = false, last = performance.now(), t0 = last;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);
  const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight), 0, 1); };
  const warm = new THREE.Color(1, 0.9, 0.8), cool = new THREE.Color(0xdbe7ef), scrOn = new THREE.Color(3.2, 2.2, 1.3), scrOff = new THREE.Color(0.55, 0.6, 0.66), tmp = new THREE.Color();

  // une lumière chaude suit l'étage allumé
  const floorLight = new THREE.PointLight(0xffb27a, 0, 18, 1.6); floorLight.position.set(0, FH * 0.6, 0); scene.add(floorLight);

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const target = progress(); P += (target - P) * (1 - Math.exp(-dt * 4.5)); if (Math.abs(target - P) < 1e-4) P = target;
    const time = (now - t0) / 1000;
    partUniforms.uT.value = time; orbMat.uniforms.uT.value = time;

    // étape : on reste sur le plan (55 %), puis on glisse vers le suivant
    const x = P * (STEPS - 1), k = Math.min(STEPS - 2, Math.floor(x)), f = x - k, m = ease(seg(f, 0.55, 1));
    const A = shotOf(k), B = shotOf(k + 1), az = A.az + (B.az - A.az) * m + time * 0.012, r = A.r + (B.r - A.r) * m, y = A.y + (B.y - A.y) * m, ty = A.ty + (B.ty - A.ty) * m;
    camera.position.set(Math.sin(az) * r, y, Math.cos(az) * r); camera.lookAt(0, ty, 0);

    const active = f < 0.55 ? k : (f > 0.9 ? k + 1 : -1), shown = f < 0.7 ? k : k + 1;
    const focus = active >= 1 && active <= FLOORS ? 1 : 0;
    floors.forEach((fl, i) => {
      const want = active === i + 1 ? 1 : active === STEPS - 1 ? 0.7 : 0;
      fl.lit += (want - fl.lit) * (1 - Math.exp(-dt * 4)); floorLit[i] = fl.lit;
      fl.glowMat.opacity = fl.lit * 0.5; fl.edgeMat.opacity = fl.lit;
      fl.glass.color.copy(cool).lerp(warm, fl.lit); fl.glass.opacity = 0.16 + fl.lit * 0.06 + (focus - fl.lit) * 0.32;   // les autres étages se givrent
      if (active === i + 1) { floorLight.position.y += (i * FH + FH * 0.6 - floorLight.position.y) * (1 - Math.exp(-dt * 4)); }
    });
    screens.forEach((s, j) => { screenMesh.setColorAt(j, tmp.copy(scrOff).lerp(scrOn, floors[s[3]].lit)); });
    screenMesh.instanceColor.needsUpdate = true;
    floorLight.intensity += (focus * (small ? 120 : 70) - floorLight.intensity) * (1 - Math.exp(-dt * 4));
    orb.scale.setScalar(1 + 0.04 * Math.sin(time * 2.2));
    caps.forEach((el) => el.classList.toggle("on", +el.dataset.cap === shown));

    composer.render();
  }
  requestAnimationFrame(render);
}
