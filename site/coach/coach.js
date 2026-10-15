/* Le coach : une bille de verre bleu-violet (orb.js) avec deux yeux expressifs (orb-face.js), qui apparaît et disparaît
   en particules (orb-particles.js), rebondit quand on clique dessus et se tortille quand on la gratte.
   Aucune dépendance, aucun framework : des modules ES à servir tels quels (voir README.md).

   Usage :
     import { Coach } from "./coach/coach.js";
     const coach = new Coach(document.querySelector("#coach"), { size: 176, onClick: () => rejouerLaConsigne() });
     coach.setMood("speaking");                 // "speaking" | "thinking" | "listening" | "idle"
     coach.setLevel(audioLevel(monAudio));      // niveau de la voix 0..1 (audio-level.js), ou () => -1
     coach.lookAt(() => document.querySelector("textarea"));   // là où l'utilisateur doit agir (élément, { x, y } ou null)
     coach.glance(element);                     // un coup d'œil, puis le regard revient
     coach.express("happy");                    // "happy" | "surprised" | "curious" | "sad"
     coach.followWords(mots, audio.currentTime) // réactions au mot près pendant la voix (sourires, hésitations…) */
import { Orb } from "./orb.js";
import { OrbFace } from "./orb-face.js";
import { orbParticles } from "./orb-particles.js";

// l'humeur du coach → l'état de la lumière de l'orbe
const ORB_STATES = { speaking: "listening", thinking: "thinking", listening: "listening", idle: "disabled" };
// mots qui le font sourire
const HAPPY_WORDS = /^[«"]?(bonjour|bienvenue|bravo|super|parfait|excellent|félicitations|merci|réussi|génial|plaisir|ravie?|bien joué|à vous)/i;
// une animation CSS finie retire sa classe (sinon elle rejouerait si l'élément est déplacé dans la page)
const ANIMATION_CLASSES = { "coach-poke": "is-poked", "coach-tickle": "is-tickled", "coach-appear": "is-appearing" };

export class Coach {
  /**
   * host : un élément vide, de la taille du coach (le CSS .coach le positionne) ;
   * options : { size (px, 176), eyes (couleur des yeux, "#ffffff"), glow (yeux lumineux, true), label (texte lu par les lecteurs d'écran),
   *             onClick (facultatif : un clic ou Entrée sur le coach ; il rebondit, puis onClick() — ex. réécouter la consigne),
   *             tickle (gratter le coach le fait se tortiller, true) }
   */
  constructor(host, options = {}) {
    const { size = 176, eyes = "#ffffff", glow = true, label = "Assistant", onClick = null, tickle = true } = options;
    this.host = host;
    host.classList.add("coach");
    this.orb = new Orb(host, { size, label, style: "glass", state: "disabled" });
    this.face = new OrbFace([this.orb], { color: eyes, glow });
    this.mood = "idle";
    this.reacted = { words: null, count: 0, time: 0, pondered: false };
    host.addEventListener("animationend", (event) => {
      if (event.target === host && ANIMATION_CLASSES[event.animationName]) host.classList.remove(ANIMATION_CLASSES[event.animationName]);
    });
    if (onClick) this.makeClickable(label, onClick);
    if (tickle) this.watchTickle();
  }

  /* ---------- Humeur, voix, regard, expressions ---------- */

  /** "speaking" : il parle (il regarde l'utilisateur) ; "thinking" : il réfléchit (regard en l'air) ; "listening" : l'utilisateur écrit
      (il regarde la cible de lookAt, yeux grands ouverts) ; "idle" : il attend (il regarde la cible, ou autour de lui). */
  setMood(mood) {
    this.mood = ORB_STATES[mood] ? mood : "idle";
    this.orb.setState(ORB_STATES[this.mood]);
    this.face.setMood(this.mood);
  }

  /** Niveau de la voix : fonction qui renvoie 0..1 (ou -1 : rien à lire) ; les yeux et la lumière bougent avec. */
  setLevel(levelFunction) {
    this.orb.setLevel(levelFunction);
    this.face.setLevel(levelFunction);
  }

  /** Là où l'utilisateur doit agir : fonction (appelée à chaque image) qui renvoie un élément, un point { x, y } de la fenêtre, ou null. */
  lookAt(target) { this.face.lookAt(target); }

  /** Un coup d'œil (ms) vers un élément ou un point, puis le regard revient. */
  glance(target, duration = 1100) { this.face.glance(target, duration); }

  /** Une expression passagère : "happy" (yeux plissés en sourire), "surprised" (ronds), "curious" (tête penchée), "sad" (tombants). */
  express(name, duration = 1200) { this.face.express(name, duration); }

  /** Un petit hochement de tête. */
  nod() { this.face.nod(); }

  /** Il réfléchit (ms) : regard en l'air, yeux mi-clos. */
  ponder(duration = 1000) { this.face.ponder(duration); }

  /** Il regarde l'utilisateur droit dans les yeux (ms), sans détourner le regard. */
  faceViewer(duration = 1500) { this.face.faceViewer(duration); }

  /**
   * Réactions au mot près pendant que la voix parle : à appeler à chaque image (ou à chaque timeupdate) avec le minutage des mots
   * de l'enregistrement en cours ([[début en s, "mot"], …]) et l'instant de lecture. Sourire sur bonjour, bravo… et les « ! » ;
   * tête penchée sur une question ; hochement en fin de phrase ; une hésitation « … » : il réfléchit jusqu'au mot suivant, puis « oui » :
   * il regarde l'utilisateur en face. Un nouveau tableau de mots (ou un retour en arrière) repart du début.
   */
  followWords(words, time) {
    const reacted = this.reacted;
    if (!words) return;
    if (reacted.words !== words || time < reacted.time) Object.assign(reacted, { words, count: 0, pondered: false });
    reacted.time = time;
    while (reacted.count < words.length && words[reacted.count][0] <= time) {
      const [start, word] = words[reacted.count++];
      const following = words[reacted.count];
      if (/…\s*$/.test(word)) { reacted.pondered = true; this.ponder(following ? (following[0] - start) * 1000 + 250 : 1000); continue; }
      if (reacted.pondered && /^oui\b/i.test(word)) { reacted.pondered = false; this.faceViewer(1800); continue; }
      if (HAPPY_WORDS.test(word)) this.express("happy", 1100);
      else if (/\?\s*»?$/.test(word)) this.express("curious", 1000);
      else if (/!\s*»?$/.test(word)) this.express("happy", 800);
      else if (/\.\s*»?$/.test(word)) this.nod();
    }
  }

  /* ---------- Apparition, disparition, rebond, chatouilles ---------- */

  /** Il apparaît : des particules se rassemblent en spirale et la bille se forme en leur centre. */
  appear() {
    const { host } = this;
    host.classList.remove("is-gone", "is-appearing");
    void host.offsetWidth;
    host.classList.add("is-appearing");
    orbParticles(host.getBoundingClientRect(), this.orb.sphere, "in");
  }

  /** Il disparaît : la bille se défait en particules qui s'envolent (l'élément reste en place, invisible : .is-gone). */
  vanish() {
    const { host } = this;
    orbParticles(host.getBoundingClientRect(), this.orb.sphere, "out");
    host.classList.add("is-gone");
  }

  /** Un petit rebond, les yeux grands ouverts (fait au clic si onClick est donné). */
  poke() {
    this.restartAnimation("is-poked");
    this.express("surprised", 600);
  }

  /** Il se tortille de plaisir, les yeux plissés (fait quand on le gratte). */
  tickle() {
    const { host } = this;
    this.express("happy", 1500);
    this.restartAnimation("is-tickled");
  }

  restartAnimation(className) {
    this.host.classList.remove(className);
    void this.host.offsetWidth;
    this.host.classList.add(className);
  }

  makeClickable(label, onClick) {
    const { host } = this;
    host.classList.add("is-clickable");
    host.tabIndex = 0;
    host.setAttribute("role", "button");
    host.setAttribute("aria-label", label);
    const activate = () => { this.poke(); onClick(); };
    host.addEventListener("click", activate);
    host.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
  }

  // gratter : la souris (ou le doigt) va et vient vite sur le coach ; 4 demi-tours en 0,7 s déclenchent tickle(), au plus une fois par seconde
  watchTickle() {
    const { host } = this;
    let last = null, directionX = 0, directionY = 0, turns = [], lastTickle = 0;
    host.addEventListener("pointerleave", () => { last = null; turns = []; });
    host.addEventListener("pointermove", (event) => {
      const point = { x: event.clientX, y: event.clientY };
      if (!last) { last = point; return; }
      const dx = point.x - last.x, dy = point.y - last.y;
      last = point;
      const now = performance.now();
      if (Math.abs(dx) > 2) { const sign = Math.sign(dx); if (directionX && sign !== directionX) turns.push(now); directionX = sign; }
      if (Math.abs(dy) > 2) { const sign = Math.sign(dy); if (directionY && sign !== directionY) turns.push(now); directionY = sign; }
      turns = turns.filter((time) => now - time < 700);
      if (turns.length >= 4 && now - lastTickle > 1000) { lastTickle = now; turns = []; this.tickle(); }
    });
  }
}
