/* Le visage de l'orbe : deux yeux « pilule » posés sur la sphère. Ils sont dessinés en 3D : ils glissent à sa surface
   et s'aplatissent vers le bord quand le regard se tourne. Le regard et l'expression vivent tout seuls :
   - "speaking" (la voix parle) : il regarde l'apprenant, en face, par petits mouvements ; il jette un coup d'œil à ce qu'il cite
     (glance : un repère du panneau qui s'allume, ou Coach.glance) ;
   - "idle" : il regarde là où l'apprenant doit agir (lookAt) ; rien à faire : il regarde autour de lui et revient vers l'apprenant ;
   - "listening" (l'apprenant écrit) : il regarde le champ de saisie, les yeux un peu plus ouverts ;
   - "thinking" (l'IA répond) : il regarde en l'air, les yeux mi-clos, d'un côté puis de l'autre.
   Expressions passagères : express("happy" | "surprised" | "curious" | "sad", durée en ms) : yeux plissés en sourire, ronds, tête penchée,
   tombants ; nod() : un petit hochement (fin de phrase) ; ponder() : il réfléchit, en l'air ; faceViewer() : il regarde l'apprenant en face. Il cligne des yeux tout seul, et souvent avant un grand mouvement du regard.
   Usage : const face = new OrbFace([orbe, orbe], { color, glow }); face.setMood("speaking"); face.lookAt(() => élément | { x, y } | null);
           face.setLevel(() => niveau de la voix 0..1). Les orbes (orb.js) suivent le regard : leur contenu tourne avec lui (orb.look). */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => min + Math.random() * (max - min);
const mix = (from, to, ratio) => from + (to - from) * ratio;
const approach = (current, target, rate, delta) => current + (target - current) * (1 - Math.exp(-rate * delta));

// en unités du rayon de la sphère : demi-largeur et demi-hauteur d'un œil, écart entre les deux
const EYE = { halfWidth: 0.074, halfHeight: 0.195, spacing: 0.26 };
const MAX_YAW = 0.85;
const MAX_PITCH = 0.68;
const MAX_REACH = 0.72;
const DEPTH = 520;                    // distance (px) de l'écran au regard : une cible à 520 px sur le côté = 45°

// ressort amorti : le regard se pose avec un léger dépassement, comme une saccade
class Spring {
  constructor(stiffness, damping) { this.value = 0; this.velocity = 0; this.stiffness = stiffness; this.damping = damping; }

  update(target, delta) {
    for (let left = delta; left > 0; left -= 1 / 120) {
      const step = Math.min(left, 1 / 120);
      this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * step;
      this.value += this.velocity * step;
    }
    return this.value;
  }
}

// ce que chaque expression change aux yeux : wide (ronds), squint (plissés), smile (plissés en arc), roll (tête penchée), droop (tombants)
const EXPRESSIONS = {
  happy: { squint: 1, smile: 1 },
  surprised: { wide: 1 },
  curious: { wide: 0.35, roll: 0.24 },
  sad: { droop: 1 }
};

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export class OrbFace {
  /** orbs : instances d'Orb (orb.js) ; options : { color (la couleur des yeux), glow (true : les yeux luisent légèrement) } */
  constructor(orbs, options = {}) {
    this.color = options.color || "#1c1530";
    this.glow = !!options.glow;
    this.views = orbs.map((orb) => this.mount(orb));
    this.mood = "idle";
    this.target = null;
    this.levelFunction = null;
    this.yaw = new Spring(330, 26);
    this.pitch = new Spring(330, 26);
    this.roll = new Spring(120, 15);
    this.shape = { open: 1, wide: 0, squint: 0, smile: 0, droop: 0 };
    this.level = 0;
    this.fixation = { yaw: 0, pitch: 0, kind: "", until: 0 };
    this.offset = { yaw: 0, pitch: 0 };
    this.glanceAt = null;
    this.glanceUntil = 0;
    this.ponderUntil = 0;             // ponder() : il réfléchit, le regard en l'air
    this.ponderSide = 1;
    this.holdUntil = 0;               // faceViewer() : il regarde l'apprenant bien en face
    this.expression = null;
    this.expressionUntil = 0;
    this.blinkStart = -1;
    this.nextBlink = 0;
    this.lastTime = 0;
    this.frame = 0;
    this.still = reducedMotion();
    this.tick = this.tick.bind(this);
    document.addEventListener("visibilitychange", () => this.wake());
    this.wake();
  }

  // un canevas par-dessus l'orbe, à sa taille
  mount(orb) {
    const canvas = document.createElement("canvas");
    canvas.className = "orb-face";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: `${orb.size}px`, height: `${orb.size}px`, pointerEvents: "none" });
    orb.host.appendChild(canvas);
    return { orb, canvas, size: orb.size };
  }

  /** "idle" | "speaking" | "listening" | "thinking" */
  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.fixation.until = 0;
    this.wake();
  }

  /** Là où l'apprenant doit agir : fonction qui renvoie un élément, un point { x, y } de la fenêtre, ou null. */
  lookAt(target) { this.target = target; }

  setLevel(levelFunction) { this.levelFunction = levelFunction; }

  /** Un coup d'œil (durée en ms) vers un élément ou un point, puis le regard revient. */
  glance(target, duration = 1100) {
    if (!target) return;
    this.glanceAt = target;
    this.glanceUntil = performance.now() + duration;
    this.fixation.until = 0;
    this.wake();
  }

  /** Une expression passagère : "happy", "surprised", "curious" ou "sad". */
  express(name, duration = 1200) {
    if (!EXPRESSIONS[name]) return;
    this.expression = name;
    this.expressionUntil = performance.now() + duration;
    if (name === "surprised") this.blink();
    this.wake();
  }

  /** Un petit hochement de tête (fin de phrase). */
  nod() { this.pitch.velocity -= 2.2; this.wake(); }

  /** Il réfléchit (durée en ms) : regard en l'air, d'un côté, les yeux mi-clos (« Vous allez… »). */
  ponder(duration = 1000) {
    this.ponderUntil = performance.now() + duration;
    this.ponderSide = Math.random() < 0.5 ? -1 : 1;
    this.holdUntil = this.glanceUntil = 0;
    this.fixation.until = 0;
    this.wake();
  }

  /** Il regarde l'apprenant droit dans les yeux (durée en ms), sans détourner le regard (« Oui, c'est ça »). */
  faceViewer(duration = 1500) {
    this.holdUntil = performance.now() + duration;
    this.ponderUntil = this.glanceUntil = 0;
    this.fixation.until = 0;
    this.wake();
  }

  blink() { this.blinkStart = performance.now(); }

  wake() { if (!this.frame && document.visibilityState !== "hidden") this.frame = requestAnimationFrame(this.tick); }

  // l'orbe affichée (la petite ou la grande), ou null
  visibleView() { return this.views.find((view) => view.orb.host.isConnected && view.orb.host.offsetParent) || null; }

  // direction (yaw, pitch en radians) d'un élément ou d'un point vu depuis le centre de l'orbe ; null s'il n'est pas à l'écran
  directionTo(target, view) {
    const found = typeof target === "function" ? target() : target;
    if (!found) return null;
    let point = found;
    if (found instanceof Element) {
      if (!found.isConnected) return null;
      const rect = found.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    const box = view.orb.host.getBoundingClientRect();
    const dx = point.x - (box.left + box.width / 2);
    const dy = point.y - (box.top + box.height / 2);
    const yaw = clamp(Math.atan2(dx, DEPTH) * 1.15, -MAX_YAW, MAX_YAW);
    const pitch = clamp(-Math.atan2(dy, DEPTH) * 1.15, -MAX_PITCH, MAX_PITCH);
    // en diagonale, les yeux restent assez loin du bord pour être lisibles
    const reach = Math.hypot(yaw, pitch) / MAX_REACH;
    return reach > 1 ? { yaw: yaw / reach, pitch: pitch / reach } : { yaw, pitch };
  }

  // où regarder maintenant : « kind » nomme l'intention, pour ne choisir un nouveau point (petit mouvement) qu'à la fin d'une fixation
  intent(now, view) {
    const viewer = { yaw: 0, pitch: 0, kind: "viewer" };
    if (now < this.ponderUntil) return { yaw: 0.32 * this.ponderSide, pitch: 0.56, kind: "ponder" };
    if (now < this.holdUntil) return { yaw: 0, pitch: 0, kind: "hold" };
    if (now < this.glanceUntil) {
      const direction = this.directionTo(this.glanceAt, view);
      if (direction) return { ...direction, kind: "glance" };
    }
    if (this.mood === "thinking") {
      const side = Math.floor(now / 1600) % 2 ? 1 : -1;
      return { yaw: 0.42 * side, pitch: 0.46, kind: `think${side}` };
    }
    const action = this.target ? this.directionTo(this.target, view) : null;
    if (this.mood === "speaking") return viewer;          // il parle : il regarde l'apprenant (les coups d'œil viennent de glance)
    if (this.mood === "listening") return action ? { ...action, kind: "action" } : viewer;
    if (action) return { ...action, kind: "action" };     // la voix s'est tue : il regarde là où l'apprenant doit agir
    // rien à faire : il regarde autour de lui et revient vers l'apprenant
    if (now > this.fixation.until || this.fixation.kind.indexOf("wander") !== 0) {
      const look = Math.random() < 0.45 ? { yaw: 0, pitch: 0 } : { yaw: random(-0.6, 0.6), pitch: random(-0.3, 0.4) };
      return { ...look, kind: `wander${Math.random()}` };
    }
    return { yaw: this.fixation.yaw, pitch: this.fixation.pitch, kind: this.fixation.kind };
  }

  update(now, delta, view) {
    const intent = this.intent(now, view);
    if (intent.kind !== this.fixation.kind || now > this.fixation.until) {
      const jump = Math.hypot(intent.yaw - this.fixation.yaw, intent.pitch - this.fixation.pitch);
      if (jump > 0.45 && Math.random() < 0.6 && now - this.blinkStart > 500) this.blink();
      // petits mouvements autour du point fixé (plus vifs quand il parle ou réfléchit)
      const jitter = this.mood === "speaking" ? 0.07 : this.mood === "thinking" ? 0.09 : 0.04;
      this.offset = intent.kind === "glance" || intent.kind === "hold" ? { yaw: 0, pitch: 0 } : { yaw: random(-jitter, jitter), pitch: random(-jitter, jitter) * 0.7 };
      this.fixation = { yaw: intent.yaw, pitch: intent.pitch, kind: intent.kind, until: now + (intent.kind.indexOf("wander") === 0 ? random(1400, 3400) : random(500, 1300)) };
    } else {
      this.fixation.yaw = intent.yaw;              // une cible qui bouge (défilement) est suivie
      this.fixation.pitch = intent.pitch;
    }

    if (now > this.nextBlink) {
      this.blink();
      if (Math.random() < 0.18) setTimeout(() => this.blink(), 230);      // parfois deux fois
      this.nextBlink = now + random(2200, 5600);
    }

    const level = this.levelFunction && this.mood === "speaking" ? clamp(this.levelFunction(), 0, 1) : 0;
    this.level = approach(this.level, level, level > this.level ? 18 : 6, delta);
    this.yaw.update(clamp(this.fixation.yaw + this.offset.yaw, -MAX_YAW, MAX_YAW), delta);
    this.pitch.update(clamp(this.fixation.pitch + this.offset.pitch + 0.035 * this.level, -MAX_PITCH, MAX_PITCH), delta);

    const expression = now < this.expressionUntil ? EXPRESSIONS[this.expression] : null;
    const wanted = {
      wide: (expression?.wide || 0) + (this.mood === "listening" ? 0.22 : 0),
      squint: expression?.squint || (this.mood === "thinking" || now < this.ponderUntil ? 0.38 : 0),
      smile: expression?.smile || 0,
      droop: expression?.droop || 0
    };
    Object.keys(wanted).forEach((key) => { this.shape[key] = approach(this.shape[key], wanted[key], 16, delta); });
    this.roll.update(expression?.roll || 0, delta);

    // clignement : se ferme en 60 ms, se rouvre en 110 ms
    const blinkTime = (now - this.blinkStart) / 1000;
    this.shape.open = blinkTime < 0 || blinkTime > 0.17 ? 1 : blinkTime < 0.06 ? 1 - blinkTime / 0.06 : (blinkTime - 0.06) / 0.11;
  }

  tick(now) {
    this.frame = 0;
    const view = this.visibleView();
    const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = now;
    if (view) {
      if (this.still) { this.yaw.value = this.pitch.value = 0; this.shape.open = 1; } else this.update(now, delta, view);
      this.views.forEach((other) => { other.orb.look = { x: Math.sin(this.yaw.value), y: Math.sin(this.pitch.value) }; });
      this.draw(view);
    }
    if (document.visibilityState !== "hidden" && !this.still) this.frame = requestAnimationFrame(this.tick);
    else this.lastTime = 0;
  }

  // contour d'un œil dans le plan tangent (unités du rayon) : rectangle aux coins ronds, éventuellement courbé en sourire
  outline(halfWidth, halfHeight, smile) {
    const radius = Math.min(halfWidth, halfHeight);
    const corners = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
    const points = [];
    corners.forEach(([sx, sy, start]) => {
      const cx = sx * (halfWidth - radius);
      const cy = sy * (halfHeight - radius);
      for (let index = 0; index <= 8; index++) {
        const angle = start + index / 8 * Math.PI / 2;
        points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
    });
    // sourire : les bouts descendent, le milieu monte (yeux en arc)
    return smile ? points.map(([u, v]) => [u, v - smile * 0.07 * ((u / halfWidth) ** 2 - 0.35)]) : points;
  }

  draw(view) {
    const { canvas, size, orb } = view;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.round(size * pixelRatio);
    if (canvas.width !== pixels) { canvas.width = canvas.height = pixels; }
    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size, size);

    const { open, wide, squint, smile, droop } = this.shape;
    const radius = size * orb.sphere.radius;
    const scale = size < 100 ? 1.15 : 1;        // petite orbe : des yeux un peu plus grands, pour rester lisibles
    const center = size / 2;
    const middle = size / 2 + size * orb.sphere.offsetY;
    const yaw = this.yaw.value;
    const pitch = this.pitch.value - 0.05 * droop;
    const roll = this.roll.value;
    const halfWidth = scale * mix(mix(EYE.halfWidth, 0.115, wide), 0.105, squint);
    const halfHeight = scale * Math.max(0.012, mix(mix(EYE.halfHeight, 0.14, wide), 0.034, squint) * (1 - 0.3 * droop) * (1 + 0.07 * this.level) * open);
    const spacing = EYE.spacing + 0.02 * wide;

    // repère de la face : centre C, droite T, haut B (la face regarde vers yaw, pitch)
    const C = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const T = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const B = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)];
    const project = (u, v) => {
      const x = C[0] + u * T[0] + v * B[0], y = C[1] + u * T[1] + v * B[1], z = C[2] + u * T[2] + v * B[2];
      const length = Math.hypot(x, y, z);
      return [center + radius * x / length, middle - radius * y / length];
    };

    context.save();
    context.beginPath();
    context.arc(center, middle, radius * 0.985, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = this.color;
    if (this.glow) { context.shadowColor = "rgba(255, 255, 255, .6)"; context.shadowBlur = size * 0.035; }
    const shape = this.outline(halfWidth, halfHeight, smile * squint);
    [-1, 1].forEach((side) => {
      // mi-clos : les bouts extérieurs descendent un peu ; tombants : davantage
      const tilt = -side * (0.1 * squint * (1 - smile) + 0.22 * droop) + roll;
      const cosine = Math.cos(tilt), sine = Math.sin(tilt);
      const eyeX = side * spacing * Math.cos(roll), eyeY = side * spacing * Math.sin(roll);
      context.beginPath();
      shape.forEach(([u, v], index) => {
        const [x, y] = project(eyeX + u * cosine - v * sine, eyeY + u * sine + v * cosine);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.closePath();
      context.fill();
    });
    context.restore();
  }
}
