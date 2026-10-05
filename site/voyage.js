/* ==========================================================================
   Le voyage 3D, piloté par le défilement.
   0.00–0.12  l'orbe apparaît, en verre, au centre
   0.12–0.40  les 15 modules gravitent autour d'elle ; la caméra tourne
   0.40–0.50  la caméra plonge dans l'orbe
   0.50–0.96  traversée d'un tunnel de données ; cinq points de vue :
              subjectif, travelling latéral, plongée verticale, tonneau, accélération
   0.96–1.00  sortie dans la lumière, retour à la page
   ========================================================================== */
import * as THREE from "./vendor/three.module.min.js";

const sec = document.querySelector("[data-voyage]");
const cv = document.querySelector("[data-vg-cv]");
if (sec && cv) start();

function start() {
  const $$ = (s) => Array.from(sec.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (t) => t * t * (3 - 2 * t);
  const small = matchMedia("(max-width: 800px)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !small, alpha: false, powerPreference: "high-performance" });
  } catch (e) { sec.classList.add("no-gl"); return; }
  renderer.setPixelRatio(Math.min(small ? 1.25 : 2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 600);
  const BEIGE = new THREE.Color("#faf9f5"), DEEP = new THREE.Color("#04070f"), bg = new THREE.Color();

  /* ---------- l'orbe : sphère de verre, bandes de couleur, reflet irisé ---------- */
  const orbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uO: { value: 1 }, uE: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vP = position; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uT; uniform float uO; uniform float uE; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      float band(float y, float c, float w){ return exp(-pow((y-c)/w, 2.)); }
      void main(){
        float f = 1. - max(dot(vN, vV), 0.); float fres = pow(f, 2.2);
        float y = vP.y + .16*sin(vP.x*2.3 + uT*.9) + .09*sin(vP.z*3.1 - uT*1.3) + .05*sin(vP.x*5. + vP.z*4. + uT*2.);
        vec3 c = vec3(.995,.99,.98);
        float k = (1. - fres*.6) * (.75 + .25*uE);
        c = mix(c, vec3(1.,.55,.47), band(y, .2, .14)*.9*k);
        c = mix(c, vec3(1.,.62,.77), band(y, .34, .1)*.7*k);
        c = mix(c, vec3(1.,1.,1.),   band(y, .06, .06)*.9);
        c = mix(c, vec3(.96,.94,.52), band(y, -.06, .07)*.75*k);
        c = mix(c, vec3(.33,.91,.95), band(y, -.17, .08)*.9*k);
        c = mix(c, vec3(1.,.75,.33), band(y + .3*vP.x, -.24, .06)*.7*k);
        float a = atan(vN.y, vN.x);
        vec3 rim = mix(vec3(.55,.9,.95), vec3(.97,.84,.6), .5 + .5*sin(a*1.5 + uT*.6));
        c = mix(c, rim, smoothstep(.55, 1., f)*.9);
        gl_FragColor = vec4(c, uO * (.92 + .08*fres));
      }`
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 96, 64), orbMat);
  scene.add(orb);
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const r = g.createRadialGradient(128, 128, 40, 128, 128, 128);
    r.addColorStop(0, "rgba(255,190,160,.55)"); r.addColorStop(.5, "rgba(160,225,240,.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.scale.set(7, 7, 1); scene.add(glow);

  /* ---------- les 15 modules, en cartes, sur trois anneaux ---------- */
  const MODS = [
    ["Démarrer", "Première rencontre"], ["Rédiger", "La structure d’un prompt"], ["Rédiger", "Des prompts pour les images"],
    ["Améliorer", "Dialoguer pour affiner"], ["Améliorer", "Optimiser un contenu"], ["Protéger", "Ce qu’on ne partage pas"],
    ["Pour tous", "Écrire pour tous"], ["Pour tous", "Images, audio, vidéo accessibles"], ["Cadre légal", "RGPD et IA Act"],
    ["Cadre légal", "Biais et risques"], ["Cadre légal", "Tenir sa veille"], ["Intégrer", "Cartographier son poste"],
    ["Intégrer", "Choisir ses outils"], ["Intégrer", "Son plan d’intégration"], ["Se préparer", "Préparer la certification"]
  ];
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, x, y, maxW, lh) {
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
    g.fillText(line, x, yy);
  }
  const cardGroup = new THREE.Group(); scene.add(cardGroup);
  const cards = [];
  const RINGS = [{ r: 3.4, tilt: 0.32, rot: 0.2 }, { r: 4.7, tilt: -0.22, rot: 1.4 }, { r: 6.0, tilt: 0.12, rot: 2.6 }];
  RINGS.forEach((R) => {
    const pts = new THREE.EllipseCurve(0, 0, R.r, R.r).getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfc9bc, transparent: true, opacity: 0.8 }));
    line.rotation.x = R.tilt; line.rotation.z = R.tilt * 0.4; cardGroup.add(line); R.line = line;
  });
  MODS.forEach((m, i) => {
    const c = document.createElement("canvas"); c.width = 520; c.height = 300; const g = c.getContext("2d");
    g.shadowColor = "rgba(16,24,56,.18)"; g.shadowBlur = 24; g.shadowOffsetY = 8;
    rr(g, 16, 12, 488, 268, 30); g.fillStyle = "#ffffff"; g.fill(); g.shadowColor = "transparent";
    g.strokeStyle = "#e7e5de"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#e2622b"; g.font = "600 22px Inter, system-ui, sans-serif"; g.fillText(m[0].toUpperCase(), 48, 70);
    g.fillStyle = "#d3cfc5"; g.font = "300 78px Inter, system-ui, sans-serif"; g.textAlign = "right"; g.fillText(String(i + 1).padStart(2, "0"), 472, 96); g.textAlign = "left";
    g.fillStyle = "#141413"; g.font = "600 36px Inter, system-ui, sans-serif"; wrap(g, m[1], 48, 178, 420, 44);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.21), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const ring = RINGS[i % 3], k = Math.floor(i / 3);
    mesh.userData = { ring, a: ring.rot + k * (Math.PI * 2 / 5) };
    cardGroup.add(mesh); cards.push(mesh);
  });

  /* ---------- le tunnel de données ---------- */
  const tunnel = new THREE.Group(); tunnel.visible = false; scene.add(tunnel);
  const ctrl = [];
  for (let i = 0; i < 16; i++) ctrl.push(new THREE.Vector3(Math.sin(i * 0.9) * 9 * (i > 0 ? 1 : 0), Math.cos(i * 0.7) * 6 * (i > 0 ? 1 : 0) - (i > 0 ? 3 : 0), -i * 28));
  const path = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
  const UP = new THREE.Vector3(0, 1, 0);
  function frame(u) {
    const p = path.getPointAt(clamp(u, 0, 1)), t = path.getTangentAt(clamp(u, 0, 1)).normalize();
    const side = new THREE.Vector3().crossVectors(t, UP).normalize(), bin = new THREE.Vector3().crossVectors(side, t).normalize();
    return { p, t, side, bin };
  }
  const N = small ? 9000 : 22000;
  {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
    const palette = [new THREE.Color("#5cc8ff"), new THREE.Color("#7aa2ff"), new THREE.Color("#ff9a62"), new THREE.Color("#ffffff"), new THREE.Color("#8ff0d0")];
    for (let i = 0; i < N; i++) {
      const u = Math.random(), F = frame(u), a = Math.random() * Math.PI * 2;
      const shell = Math.random() < 0.7 ? 7 + Math.random() * 6 : 2 + Math.random() * 18;
      const v = F.p.clone().addScaledVector(F.side, Math.cos(a) * shell).addScaledVector(F.bin, Math.sin(a) * shell);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = palette[Math.random() < 0.55 ? 0 : (Math.random() * palette.length) | 0]; col.set([c.r, c.g, c.b], i * 3);
      ph[i] = Math.random() * 6.28; sz[i] = Math.random() < 0.06 ? 3.2 : 0.8 + Math.random() * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("ph", new THREE.BufferAttribute(ph, 1)); geo.setAttribute("sz", new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uT: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float ph; attribute float sz; varying vec3 vC; varying float vA; uniform float uT; uniform float uPR;
        void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); float d = -mv.z;
          vA = smoothstep(140., 20., d) * smoothstep(.5, 4., d) * (.55 + .45*sin(uT*2. + ph));
          gl_PointSize = sz * uPR * (60. / max(d, 1.)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - .5); if (r > .5) discard; gl_FragColor = vec4(vC, vA * smoothstep(.5, .0, r)); }`
    });
    tunnel.add(new THREE.Points(geo, mat)); tunnel.userData.pmat = mat;
  }
  { // flux de données : traits orientés le long du chemin
    const M = small ? 900 : 2400, pos = new Float32Array(M * 6), col = new Float32Array(M * 6);
    for (let i = 0; i < M; i++) {
      const u = Math.random(), F = frame(u), a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10, L = 1 + Math.random() * 5;
      const s = F.p.clone().addScaledVector(F.side, Math.cos(a) * r).addScaledVector(F.bin, Math.sin(a) * r), e = s.clone().addScaledVector(F.t, L);
      pos.set([s.x, s.y, s.z, e.x, e.y, e.z], i * 6);
      const c = Math.random() < 0.7 ? [0.35, 0.75, 1] : [1, 0.6, 0.35]; col.set([...c.map((x) => x * 0.15), ...c], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    tunnel.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
  }
  for (let i = 1; i < 34; i++) { // anneaux de mesure, avec graduations
    const u = i / 34, F = frame(u), R = 11 + (i % 3) * 2, pts = [];
    for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(F.p.clone().addScaledVector(F.side, Math.cos(a) * R).addScaledVector(F.bin, Math.sin(a) * R)); }
    tunnel.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: i % 4 ? 0x2a4a7a : 0xff8a50, transparent: true, opacity: i % 4 ? 0.45 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
    const ticks = [];
    for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2, d = new THREE.Vector3().addScaledVector(F.side, Math.cos(a)).addScaledVector(F.bin, Math.sin(a)); ticks.push(F.p.clone().addScaledVector(d, R), F.p.clone().addScaledVector(d, R - (k % 4 ? 0.4 : 1.1))); }
    tunnel.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), new THREE.LineBasicMaterial({ color: 0x5c8fd6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));
  }
  // glyphes de données
  const GLYPHS = ["{ }", "0x3F", "prompt", "87 %", "</>", "λ", "∑", "tokens", "RGPD", ".docx", "img", "SCORM", "01101", "→", "✦", "#", "C2", "IA"];
  const glyphTex = GLYPHS.map((s) => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 96; const g = c.getContext("2d");
    g.font = "500 52px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#cfe6ff"; g.fillText(s, 128, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
  for (let i = 0; i < (small ? 70 : 160); i++) {
    const u = Math.random(), F = frame(u), a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex[(Math.random() * glyphTex.length) | 0], transparent: true, opacity: 0.55 + Math.random() * 0.4, blending: THREE.AdditiveBlending, depthWrite: false, color: Math.random() < 0.3 ? 0xffb089 : 0xffffff }));
    sp.position.copy(F.p).addScaledVector(F.side, Math.cos(a) * r).addScaledVector(F.bin, Math.sin(a) * r);
    const s = 1 + Math.random() * 1.6; sp.scale.set(s * 2.6, s, 1); tunnel.add(sp);
  }
  // les productions : documents, images, mails, diapositives, tableaux
  function panel(kind) {
    const W = 512, H = kind === "slide" || kind === "chart" ? 288 : kind === "img" ? 384 : 640;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const line = (x, y, w, col, h = 9) => { g.fillStyle = col; rr(g, x, y, w, h, h / 2); g.fill(); };
    if (kind === "doc") {
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#2b5797"; g.fillRect(0, 0, W, 10); g.font = "700 30px Inter, sans-serif"; g.fillStyle = "#14213d"; g.fillText("Rapport annuel 2025", 40, 70);
      line(40, 92, 220, "#c7d2e3", 8);
      let y = 130; for (let s = 0; s < 3; s++) { line(40, y, 160, "#2b5797", 12); y += 30; for (let k = 0; k < 4; k++) { line(40, y, 300 + Math.random() * 130, "#d9dee8"); y += 22; } y += 18; }
      g.fillStyle = "#eef3fb"; g.fillRect(40, y, 432, 90); for (let b = 0; b < 6; b++) { g.fillStyle = b % 2 ? "#ff9a62" : "#4a7fd4"; const h = 20 + Math.random() * 60; g.fillRect(64 + b * 64, y + 84 - h, 34, h); }
    } else if (kind === "img") {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#ffcfae"); gr.addColorStop(.6, "#ffe9d6"); gr.addColorStop(1, "#c9dcb4"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ff9e6b"; g.beginPath(); g.arc(370, 110, 52, 0, 7); g.fill();
      g.fillStyle = "#9cbf8a"; g.beginPath(); g.moveTo(0, 280); g.quadraticCurveTo(160, 200, 320, 260); g.quadraticCurveTo(430, 290, 512, 250); g.lineTo(512, 384); g.lineTo(0, 384); g.fill();
      g.fillStyle = "#7da86e"; g.beginPath(); g.moveTo(0, 330); g.quadraticCurveTo(220, 290, 512, 330); g.lineTo(512, 384); g.lineTo(0, 384); g.fill();
    } else if (kind === "mail") {
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, W, 120);
      g.fillStyle = "#14213d"; g.font = "600 24px Inter, sans-serif"; g.fillText("À : equipe@entreprise.fr", 36, 48); g.font = "700 28px Inter, sans-serif"; g.fillText("Objet : nouveau planning", 36, 92);
      let y = 160; for (let k = 0; k < 14; k++) { line(36, y, k % 5 === 4 ? 180 : 360 + Math.random() * 80, "#dcdad3"); y += k % 5 === 4 ? 46 : 26; }
    } else if (kind === "slide") {
      g.fillStyle = "#141a2e"; g.fillRect(0, 0, W, H); g.fillStyle = "#ff9a62"; g.fillRect(36, 40, 60, 6);
      g.fillStyle = "#fff"; g.font = "700 30px Inter, sans-serif"; g.fillText("Résultats du trimestre", 36, 92);
      for (let b = 0; b < 7; b++) { const h = 30 + Math.random() * 120; g.fillStyle = b === 5 ? "#ff9a62" : "#5cc8ff"; g.fillRect(40 + b * 62, 260 - h, 38, h); }
    } else if (kind === "chart") {
      g.fillStyle = "#0e1424"; g.fillRect(0, 0, W, H); g.strokeStyle = "#22304d"; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(30, 40 + k * 40); g.lineTo(490, 40 + k * 40); g.stroke(); }
      [["#5cc8ff", 0], ["#ff9a62", 1.6]].forEach(([cc, o]) => { g.strokeStyle = cc; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= 46; x++) { const y = 150 - Math.sin(x / 5 + o) * 50 - x * 1.2 + Math.random() * 8; x ? g.lineTo(30 + x * 10, y) : g.moveTo(30, y); } g.stroke(); });
    } else if (kind === "code") {
      g.fillStyle = "#0b1020"; g.fillRect(0, 0, W, H); g.font = "500 22px ui-monospace, Menlo, monospace";
      const L = ['{', '  "role": "chargé de recrutement",', '  "cible": "débutants",', '  "format": "150 mots",', '  "ton": "chaleureux",', '  "données": "anonymisées",', '  "sortie": "offre.docx"', '}'];
      L.forEach((t, k) => { g.fillStyle = k === 0 || k === L.length - 1 ? "#9fb3d9" : "#8ff0d0"; g.fillText(t, 30, 60 + k * 40); });
      for (let k = 0; k < 6; k++) line(30, 400 + k * 36, 120 + Math.random() * 300, "#1f2a44", 12);
    } else { // tableau
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.fillStyle = "#1d6f42"; g.fillRect(0, 0, W, 48); g.fillStyle = "#fff"; g.font = "700 22px Inter, sans-serif"; g.fillText("Suivi_formation.xlsx", 24, 32);
      g.strokeStyle = "#dfe5dc"; for (let r = 0; r < 16; r++) for (let q = 0; q < 4; q++) { g.strokeRect(24 + q * 116, 70 + r * 34, 116, 34); if (r && q) line(34 + q * 116, 82 + r * 34, 40 + Math.random() * 50, q === 3 ? "#9fd3b3" : "#e4e8e3", 10); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W / 100, H / 100), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    return m;
  }
  const KINDS = ["doc", "img", "mail", "slide", "chart", "code", "sheet"], panels = [];
  for (let i = 0; i < (small ? 22 : 40); i++) {
    const u = 0.03 + (i / (small ? 22 : 40)) * 0.94, F = frame(u), side = i % 2 ? 1 : -1, a = (side > 0 ? 0.2 : Math.PI - 0.2) + (Math.random() - 0.5) * 1.2, r = 5 + Math.random() * 3;
    const m = panel(KINDS[i % KINDS.length]); m.position.copy(F.p).addScaledVector(F.side, Math.cos(a) * r).addScaledVector(F.bin, Math.sin(a) * r);
    m.lookAt(F.p.clone().addScaledVector(F.t, -6)); m.rotateZ((Math.random() - 0.5) * 0.4);
    m.userData = { base: m.position.clone(), ph: Math.random() * 6.28 }; tunnel.add(m); panels.push(m);
  }

  /* ---------- caméra ---------- */
  const tmpL = new THREE.Vector3(), tmpU = new THREE.Vector3();
  function tunnelCam(u, time) {
    // cinq points de vue, mélangés en douceur
    const MODES = [[0, 0.2], [0.2, 0.42], [0.42, 0.6], [0.6, 0.8], [0.8, 1.01]], W = 0.05;
    const w = MODES.map(([a, b]) => smooth(seg(u, a - W, a + W)) * (1 - smooth(seg(u, b - W, b + W))));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const F = frame(u), Fa = frame(u + 0.02), pos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3();
    let fov = 0;
    // 1. subjectif
    pos.addScaledVector(F.p.clone().addScaledVector(F.bin, 0.6), w[0]); look.addScaledVector(Fa.p, w[0]); up.addScaledVector(F.bin, w[0]); fov += 58 * w[0];
    // 2. travelling latéral : on longe le flux, de côté
    const side = F.p.clone().addScaledVector(F.side, 9).addScaledVector(F.bin, 2);
    pos.addScaledVector(side, w[1]); look.addScaledVector(F.p.clone().addScaledVector(F.t, 6), w[1]); up.addScaledVector(F.bin, w[1]); fov += 46 * w[1];
    // 3. plongée verticale : la caméra survole le tunnel
    const top = F.p.clone().addScaledVector(F.bin, 15).addScaledVector(F.t, -4);
    pos.addScaledVector(top, w[2]); look.addScaledVector(F.p.clone().addScaledVector(F.t, 8), w[2]); up.addScaledVector(F.t, w[2]); fov += 52 * w[2];
    // 4. tonneau : la caméra tourne sur elle-même en avançant
    const roll = seg(u, 0.6, 0.8) * Math.PI * 2, rup = F.bin.clone().multiplyScalar(Math.cos(roll)).addScaledVector(F.side, Math.sin(roll));
    pos.addScaledVector(F.p.clone().addScaledVector(rup, 1.2), w[3]); look.addScaledVector(Fa.p, w[3]); up.addScaledVector(rup, w[3]); fov += 62 * w[3];
    // 5. accélération : le champ s'ouvre, tout file
    pos.addScaledVector(F.p, w[4]); look.addScaledVector(frame(u + 0.03).p, w[4]); up.addScaledVector(F.bin, w[4]); fov += (64 + 26 * seg(u, 0.84, 1)) * w[4];
    return { pos: pos.divideScalar(sum), look: look.divideScalar(sum), up: up.normalize(), fov: fov / sum };
  }

  /* ---------- légendes et transitions ---------- */
  const caps = $$("[data-cap]"), flashW = sec.querySelector("[data-vg-white]"), flashB = sec.querySelector("[data-vg-beige]");
  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  let P = 0, visible = false, t0 = performance.now(), last = t0;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "200px" }).observe(sec);
  function progress() { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight), 0, 1); }

  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const target = progress(); P += (target - P) * (1 - Math.exp(-dt * 7)); if (Math.abs(target - P) < 1e-4) P = target;
    const p = P, time = (now - t0) / 1000;
    orbMat.uniforms.uT.value = time; tunnel.userData.pmat.uniforms.uT.value = time;

    const emerge = ease(seg(p, 0, 0.1)), sys = seg(p, 0.12, 0.4), dive = seg(p, 0.4, 0.5), trav = seg(p, 0.5, 0.96), out = seg(p, 0.955, 0.975);
    // fond : beige, puis profondeur de la donnée
    bg.copy(BEIGE).lerp(DEEP, smooth(seg(p, 0.468, 0.49)));   // le fond bascule sous le flash
    renderer.setClearColor(bg, 1);

    // l'orbe
    const s = Math.max(0.001, emerge * (1 + 0.12 * Math.sin(emerge * Math.PI)));
    orb.scale.setScalar(s); glow.scale.setScalar(7 * s); orb.rotation.y = time * 0.15;
    orbMat.uniforms.uE.value = 0.5 + 0.5 * Math.sin(time * 1.3);
    orbMat.uniforms.uO.value = 1 - seg(p, 0.47, 0.485); glow.material.opacity = (1 - seg(p, 0.42, 0.47)) * emerge;
    orb.visible = p < 0.5;

    // les cartes en orbite
    const cardsIn = seg(p, 0.1, 0.18), cardsOut = 1 - seg(p, 0.385, 0.42);
    cardGroup.visible = p < 0.425;
    RINGS.forEach((R) => { R.line.material.opacity = 0.8 * cardsIn * cardsOut; });
    const lit = Math.floor(seg(p, 0.16, 0.38) * 15.999);
    cards.forEach((m, i) => {
      const R = m.userData.ring, a = m.userData.a + time * 0.08 + sys * 2.4;
      const v = new THREE.Vector3(Math.cos(a) * R.r, 0, Math.sin(a) * R.r).applyEuler(new THREE.Euler(R.tilt, 0, R.tilt * 0.4));
      const appear = smooth(seg(cardsIn, i / 15 * 0.6, i / 15 * 0.6 + 0.4));
      m.position.copy(v).multiplyScalar(0.6 + 0.4 * appear);
      m.quaternion.copy(camera.quaternion);
      const on = i === lit && p > 0.16 && p < 0.4;
      const sc = (on ? 1.15 : 0.78) * appear; m.scale.lerp(new THREE.Vector3(sc, sc, sc), 0.12);
      m.material.opacity = appear * cardsOut * (on ? 1 : 0.78);
    });

    // la caméra
    tunnel.visible = p > 0.468;
    if (p < 0.5) {
      // orbite autour de l'orbe, puis plongée
      const az = -0.2 + sys * Math.PI * 1.25, el = 0.12 + Math.sin(sys * Math.PI) * 0.42, rad = 15 - emerge * 2.5 - sys * 1.2;
      const orbit = new THREE.Vector3(Math.sin(az) * Math.cos(el) * rad, Math.sin(el) * rad, Math.cos(az) * Math.cos(el) * rad);
      const inside = new THREE.Vector3(0, 0, 0.6), k = ease(dive);
      camera.position.copy(orbit).lerp(inside, k);
      const shift = smooth(seg(p, 0.12, 0.18)) * (1 - smooth(seg(p, 0.38, 0.42)));   // le système glisse à droite, le texte reste lisible à gauche
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(new THREE.Vector3(), orbit).normalize(), UP).normalize();
      tmpL.set(0, 0, 0).addScaledVector(right, -4.2 * shift * (innerWidth > 800 ? 1 : 0)).lerp(new THREE.Vector3(0, 0, -20), k);
      camera.up.copy(UP);
      camera.fov = 42 + 30 * k;
      camera.lookAt(tmpL);
    } else {
      const c = tunnelCam(trav * 0.985, time);
      camera.position.copy(c.pos); camera.up.copy(c.up); camera.fov = c.fov; camera.lookAt(c.look);
    }
    camera.updateProjectionMatrix();
    panels.forEach((m) => { m.position.copy(m.userData.base); m.position.y += Math.sin(time * 0.8 + m.userData.ph) * 0.25; });

    // transitions : flash blanc à l'entrée dans l'orbe, lumière beige à la sortie
    flashW.style.opacity = String(Math.max(0, 1 - Math.abs(p - 0.48) / 0.035) * 0.95);
    flashB.style.opacity = String(smooth(out));
    sec.classList.toggle("is-dark", p > 0.46 && p < 0.975);
    caps.forEach((el) => { const [a, b] = el.dataset.cap.split(",").map(Number); el.classList.toggle("on", p >= a && p < b); });

    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
