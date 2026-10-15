/* Particules de l'orbe, le temps d'une apparition ou d'une disparition (moins d'une seconde) :
   - "in" : des grains de lumière venus de tout autour tournent en spirale et se rassemblent au centre, où l'orbe se forme ;
   - "out" : l'orbe se défait en grains qui s'envolent en tourbillonnant et s'éteignent, avec une onde qui s'élargit.
   Un canevas fixe, par-dessus la page, créé pour l'effet puis retiré.
   Usage : orbParticles(rectangle de l'orbe, { radius, offsetY } (sa sphère, en part de la taille : orb.sphere), "in" | "out"). */

// bleu-violet de la bille de verre, lavande et cyan (pas de blanc : invisible sur le fond clair)
const COLORS = ["#4b2ff0", "#5a3dff", "#6a50ff", "#7a62ff", "#9d8cff", "#b8adff", "#62d6ff"];
const COUNT = 230;
const DURATION = { in: 1000, out: 950 };

const random = (min, max) => min + Math.random() * (max - min);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// un grain : un halo léger, puis un cœur plus vif
const drawGrain = (context, x, y, size, color, alpha) => {
  context.globalAlpha = alpha * 0.16;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, size * 3.2, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = alpha;
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fill();
};

// les grains, avec leur trajet : "in" de l'anneau extérieur vers un point de la sphère, "out" de la sphère vers l'extérieur
const createGrains = (mode, radius) => Array.from({ length: COUNT }, () => {
  const angle = random(0, Math.PI * 2);
  const inside = radius * Math.sqrt(Math.random()) * 0.92;
  const turn = random(0.7, 1.6) * (Math.random() < 0.8 ? 1 : -1);        // la plupart tournent dans le même sens
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size = random(0.7, 1.9);
  if (mode === "in") {
    return { angle, turn, color, size, from: radius * random(1.7, 3.1), to: inside, delay: random(0, 0.22), span: random(0.55, 0.75) };
  }
  return { angle, turn: turn * 0.8, color, size, from: inside, to: radius * random(1.5, 3.2), delay: random(0, 0.12), span: random(0.6, 0.85), rise: random(0.1, 0.5) * radius };
});

export const orbParticles = (rect, sphere, mode) => {
  if (!rect || !rect.width || reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "orb-particles";
  canvas.setAttribute("aria-hidden", "true");
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth, height = window.innerHeight;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  Object.assign(canvas.style, { position: "fixed", left: "0", top: "0", width: `${width}px`, height: `${height}px`, zIndex: "66", pointerEvents: "none" });
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  const radius = rect.width * sphere.radius;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2 + rect.height * sphere.offsetY;
  const grains = createGrains(mode, radius);
  const duration = DURATION[mode];
  const start = performance.now();

  const frame = (now) => {
    const time = (now - start) / duration;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    if (mode === "out") {
      // l'orbe s'efface en un éclat qui rétrécit, et une onde s'élargit
      const flash = Math.max(0, 1 - time / 0.22);
      if (flash > 0) {
        const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * (0.7 + 0.3 * flash));
        glow.addColorStop(0, "rgba(120, 100, 255, .9)");
        glow.addColorStop(0.7, "rgba(85, 54, 255, .55)");
        glow.addColorStop(1, "rgba(85, 54, 255, 0)");
        context.globalAlpha = flash;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(centerX, centerY, radius * (0.7 + 0.3 * flash), 0, Math.PI * 2);
        context.fill();
      }
      const wave = Math.min(1, time / 0.55);
      if (wave < 1) {
        context.globalAlpha = 0.45 * (1 - wave) ** 1.5;
        context.strokeStyle = "#8f7bff";
        context.lineWidth = 1.5 + 2 * (1 - wave);
        context.beginPath();
        context.arc(centerX, centerY, radius * (1 + 1.1 * easeOut(wave)), 0, Math.PI * 2);
        context.stroke();
      }
    } else {
      // au moment où les grains arrivent, une lueur au centre : l'orbe s'y forme
      const glow = Math.max(0, 1 - Math.abs(time - 0.72) / 0.2);
      if (glow > 0) {
        const light = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.3);
        light.addColorStop(0, "rgba(130, 110, 255, .55)");
        light.addColorStop(1, "rgba(130, 110, 255, 0)");
        context.globalAlpha = glow;
        context.fillStyle = light;
        context.beginPath();
        context.arc(centerX, centerY, radius * 1.3, 0, Math.PI * 2);
        context.fill();
      }
    }

    grains.forEach((grain) => {
      const local = (time - grain.delay) / grain.span;
      if (local <= 0 || local >= 1) return;
      const progress = mode === "in" ? easeInOut(local) : easeOut(local);
      const distance = grain.from + (grain.to - grain.from) * progress;
      const angle = grain.angle + grain.turn * progress;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance - (grain.rise || 0) * progress;
      const alpha = mode === "in" ? Math.min(1, local * 5) * (1 - Math.max(0, (local - 0.8) / 0.2)) : (1 - local) ** 1.4;
      const size = grain.size * (mode === "in" ? 1 - 0.4 * progress : 1 - 0.5 * local);
      drawGrain(context, x, y, size, grain.color, alpha);
    });

    if (time < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
};
