/* ==========================================================================
   Module 3 · Prendre en main Claude — atelier
   À gauche : Claude (simulation de l'interface), où l'apprenant écrit.
   À droite : le module d'origine (écrans de Léa) dans le panneau de formation.
   L'orbe, assistant pédagogique, lit la consigne de chaque écran : les voix
   enregistrées quand elles existent, sinon la synthèse vocale du navigateur.
   ========================================================================== */
(function () {
  "use strict";

  var API = window.ATELIER_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "module3-atelier";
  var FIRST_BYTE_TIMEOUT = 20000;
  var MODULE_URL = "../index.html?embed=1";
  var INTRO_URL = "intro.html";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* voix off du storyboard, écran par écran */
  var VO = {
    "3.01": "Vous allez observer une situation, essayer, puis vérifier votre résultat.",
    "3.02": "Vous utilisez la même façon de travailler : observer, essayer et vérifier.",
    "3.03": "Un tableau peut rendre ces notes plus faciles à suivre.",
    "3.04": "Les commandes remplissent des fonctions proches, même si leur présentation diffère.",
    "3.05": "Sélectionnez une étiquette, puis sa catégorie. Vous pouvez aussi utiliser le clavier.",
    "3.06": "Une pièce jointe n’est pas nécessaire pour un court texte.",
    "3.07": "Le tableau reprend les faits et conserve les informations manquantes.",
    "3.08": "Essayez vous-même, dans Claude, à gauche. Revenez ensuite vérifier votre résultat dans le module.",
    "3.09": "Choisissez votre réponse, puis consultez son explication.",
    "3.10": "La correction nomme exactement l’erreur et le résultat attendu.",
    "3.11": "La lecture de certains fichiers peut être incomplète. Gardez toujours la source.",
    "3.12": "Choisissez votre réponse, puis consultez son explication.",
    "3.13": "La comparaison porte sur un même travail, avec les mêmes informations.",
    "3.14": "Votre préférence doit s’appuyer sur des critères observables.",
    "3.15": "Choisissez votre réponse, puis consultez son explication.",
    "3.16": "Citez un élément visible du résultat.",
    "3.17": "Le score montre les activités réussies. Une tâche réelle doit aussi être contrôlée.",
    "3.18": "Gardez cette fiche pour votre prochaine utilisation."
  };
  var INTRO_SAY = { audio: "ecran-01", text: "Bienvenue dans ce troisième module. Faites défiler l’introduction, puis cliquez sur Commencer." };
  var PRACTICE = { "3.08": 1, "3.10": 1, "3.13": 1 };
  var REPERES = [
    ["new", "Nouvelle conversation", "Démarre un échange vierge pour un nouveau sujet."],
    ["input", "Zone de saisie", "Vous y écrivez votre demande et collez vos notes."],
    ["send", "Envoyer", "La flèche envoie le message. La touche Entrée aussi."],
    ["history", "Échanges précédents", "Retrouvez vos conversations passées."]
  ];

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.convs = S.convs || [];
  S.learner = S.learner || Math.random().toString(36).slice(2, 12);
  S.stats = S.stats || { live: 0, sim: 0 };
  if (S.sound === undefined) S.sound = true;
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }

  var app = $("[data-app]"), frame = $("[data-frame]"), claudeEl = $(".claude"), split = $("[data-shell]");
  var messagesEl = $("[data-messages]"), input = $("[data-input]"), composer = $("[data-composer]"), sendBtn = $(".send");
  var capEl = $("[data-cap]"), audio = $("[data-audio]"), toastEl = $("[data-toast]");
  var mode = "sim", busy = false, screen = null;

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  /* ---------- Orbe ---------- */

  var gateOrb = SiriOrb($("[data-gate-orb]"), { size: 168, colorFrom: "#14b8d6", colorTo: "#c93be0", label: "Assistant pédagogique" });
  var orb = SiriOrb($("[data-orb]"), { size: 44, colorFrom: "#14b8d6", colorTo: "#c93be0", label: "Assistant pédagogique" });
  var speaking = false, typingTimer = null;
  function orbMood() {
    if (speaking) return orb.setState("speaking");
    if (busy) return orb.setState("thinking");
    if (typingTimer) return orb.setState("listening");
    orb.setState("idle");
  }

  /* niveau sonore réel de la voix (seulement en http : en fichier local, le navigateur couperait le son) */
  var actx = null, analyser = null, levelData = null;
  function unlockAudio() {
    if (actx || !/^https?:$/.test(location.protocol) || !window.AudioContext) return;
    try {
      actx = new AudioContext();
      var src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyser.connect(actx.destination);
      levelData = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { actx = null; analyser = null; }
  }
  var smoothed = 0;
  function voiceLevel() {
    if (!analyser || audio.paused) return -1;
    analyser.getByteFrequencyData(levelData);
    var nyq = actx.sampleRate / 2, bins = levelData.length;
    var lo = Math.max(1, Math.round(85 / nyq * bins)), hi = Math.max(lo + 1, Math.round(3800 / nyq * bins));
    var sum = 0, peak = 0;
    for (var i = lo; i < hi; i++) { sum += levelData[i]; if (levelData[i] > peak) peak = levelData[i]; }
    var energy = 0.65 * (sum / (hi - lo) / 255) + 0.35 * (peak / 255);
    var norm = Math.min(1, Math.max(0, (energy - 0.14) / 0.62));
    smoothed += (norm - smoothed) * 0.15;
    return smoothed;
  }
  orb.setLevel(voiceLevel);

  /* ---------- Narration ---------- */

  var voices = [];
  function frVoice() {
    if (!window.speechSynthesis) return null;
    if (!voices.length) voices = speechSynthesis.getVoices();
    var fr = voices.filter(function (v) { return /^fr/i.test(v.lang); });
    return fr.filter(function (v) { return /google|natural|neural|amélie|thomas|audrey|aurélie/i.test(v.name); })[0] || fr[0] || null;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { voices = speechSynthesis.getVoices(); };

  function caption(text, idle) {
    capEl.classList.toggle("is-idle", !!idle);
    capEl.innerHTML = "";
    // lettres animées, regroupées par mot pour que les retours à la ligne tombent entre les mots
    var i = 0;
    (text || "").split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { capEl.appendChild(document.createTextNode(" ")); i++; return; }
      var w = document.createElement("span");
      w.className = "w";
      Array.prototype.forEach.call(part, function (ch) {
        var c = document.createElement("span");
        c.className = "ch";
        c.style.setProperty("--i", Math.min(i++, 90));
        c.textContent = ch;
        w.appendChild(c);
      });
      capEl.appendChild(w);
    });
    capEl.setAttribute("aria-label", text || "");
  }

  var cues = [], cueIdx = -1, current = null;
  function stopVoice() {
    audio.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
    speaking = false;
    orbMood();
  }
  function ended() {
    speaking = false;
    orbMood();
    caption(current ? current.text : "", true);
    post({ type: "voice-ended" });
  }
  function narrate(item) {
    current = item;
    stopVoice();
    cues = []; cueIdx = -1;
    if (!item) return;
    if (!S.sound || !unlocked) { caption(item.text, true); return; }
    var capts = (window.COURSE_CAPTIONS || {})[item.audio];
    if (item.audio && capts) {
      cues = capts;
      audio.src = "../assets/audio/" + item.audio + ".mp3";
      audio.currentTime = 0;
      caption(cues[0][2]);
      var p = audio.play();
      if (p && p.catch) p.catch(function () { caption(item.text, true); });
      return;
    }
    var v = frVoice();
    if (!v) { caption(item.text, true); return; }
    var u = new SpeechSynthesisUtterance(item.text);
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    u.onstart = function () { speaking = true; orbMood(); };
    u.onend = ended;
    u.onerror = function () { speaking = false; orbMood(); caption(item.text, true); };
    caption(item.text);
    speechSynthesis.speak(u);
  }
  audio.addEventListener("play", function () { speaking = true; orbMood(); if (actx && actx.state === "suspended") actx.resume(); });
  audio.addEventListener("pause", function () { if (!audio.ended) { speaking = false; orbMood(); } });
  audio.addEventListener("ended", ended);
  audio.addEventListener("timeupdate", function () {
    var t = audio.currentTime, i = -1;
    for (var k = 0; k < cues.length; k++) if (cues[k][0] <= t) i = k;
    if (i !== cueIdx && i >= 0) { cueIdx = i; caption(cues[i][2]); }
  });

  $("[data-replay]").addEventListener("click", function () { narrate(current); });
  var soundBtn = $("[data-sound]");
  function paintSound() {
    soundBtn.querySelector("use").setAttribute("href", S.sound ? "#i-sound" : "#i-mute");
    soundBtn.setAttribute("aria-label", S.sound ? "Couper le son" : "Remettre le son");
  }
  soundBtn.addEventListener("click", function () {
    S.sound = !S.sound; save(); paintSound();
    if (!S.sound) { stopVoice(); if (current) caption(current.text, true); } else narrate(current);
  });
  paintSound();

  /* ---------- Échanges avec le panneau de formation ---------- */

  function post(msg) {
    msg.src = "atelier";
    try { frame.contentWindow.postMessage(msg, location.origin && location.origin !== "null" ? location.origin : "*"); } catch (e) { /* cadre indisponible */ }
  }
  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || !e.data) return;
    var d = e.data;
    if (d.src === "atelier-intro" && d.type === "intro-done") { S.introDone = true; save(); frame.src = MODULE_URL; return; }
    if (d.src !== "module3") return;
    if (d.type === "screen") onScreen(d);
    if (d.type === "need-table") {
      var text = lastTable();
      post({ type: "table", text: text || "" });
      if (!text) toast("Aucun tableau dans la conversation. Envoyez d’abord votre demande à Claude.");
    }
    if (d.type === "open-claude") focusClaude();
  });

  function onScreen(d) {
    screen = d.code;
    var text = VO[d.code] || "";
    if (!d.audio && d.lead) text += " " + d.lead;
    narrate({ audio: d.audio, text: text });
    claudeEl.classList.toggle("is-practice", !!PRACTICE[d.code]);
    $("[data-tab-dot]").hidden = !PRACTICE[d.code];
    spots(d.code === "3.04");
  }

  function focusClaude() {
    showTab("claude");
    input.focus();
    claudeEl.classList.remove("flash"); void claudeEl.offsetWidth; claudeEl.classList.add("flash");
  }

  /* ---------- 3.04 : pastilles orange sur l'interface de Claude ---------- */

  var tipEl = null;
  function spots(on) {
    $$(".spot-badge").forEach(function (b) { b.remove(); });
    if (tipEl) { tipEl.remove(); tipEl = null; }
    if (!on) return;
    REPERES.forEach(function (r, i) {
      var z = $(".app [data-fn='" + r[0] + "']");
      if (!z) return;
      if (getComputedStyle(z).position === "static") z.style.position = "relative";
      var b = h('<button type="button" class="spot-badge" aria-label="' + esc(r[1]) + '">' + (i + 1) + "</button>");
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        $$(".spot-badge").forEach(function (x) { x.classList.toggle("is-cur", x === b); });
        if (tipEl) tipEl.remove();
        tipEl = h('<div class="spot-tip" role="status"><b>' + esc(r[1]) + "</b>" + esc(r[2]) + "</div>");
        document.body.appendChild(tipEl);
        var rc = b.getBoundingClientRect();
        tipEl.style.left = Math.max(8, Math.min(window.innerWidth - 270, rc.left - 20)) + "px";
        tipEl.style.top = (rc.bottom + 8 + tipEl.offsetHeight > window.innerHeight ? rc.top - tipEl.offsetHeight - 8 : rc.bottom + 8) + "px";
      });
      z.appendChild(b);
    });
  }
  document.addEventListener("click", function (e) { if (tipEl && !e.target.closest(".spot-badge")) { tipEl.remove(); tipEl = null; $$(".spot-badge").forEach(function (x) { x.classList.remove("is-cur"); }); } });

  /* ---------- Markdown minimal ---------- */

  function inline(t) {
    return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }
  function cells(line) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (x) { return x.trim(); }); }
  function markdown(src) {
    var lines = src.replace(/\r/g, "").split("\n"), out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        var head = cells(l), rows = []; i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push("<table><thead><tr>" + head.map(function (x) { return "<th>" + inline(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + inline(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>");
        continue;
      }
      if (/^\s*[-*•]\s+/.test(l)) { var it = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; } out.push("<ul>" + it.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>"); continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { var on = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { on.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; } out.push("<ol>" + on.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ol>"); continue; }
      if (/^\s*#{1,6}\s+/.test(l)) { out.push("<p><strong>" + inline(l.replace(/^\s*#+\s+/, "")) + "</strong></p>"); i++; continue; }
      if (!l.trim()) { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#)/.test(lines[i])) { para.push(lines[i]); i++; }
      if (!para.length) { para.push(l); i++; }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }
  function hasTable(text) { return /^\s*\|.*\|\s*$/m.test(text || "") && /^\s*\|?\s*:?-{2,}/m.test(text || ""); }
  function lastTable() {
    var list = [conv()].concat(S.convs).filter(Boolean);
    for (var k = 0; k < list.length; k++) {
      var ms = list[k].messages;
      for (var i = ms.length - 1; i >= 0; i--) if (ms[i].role === "assistant" && hasTable(ms[i].content)) return ms[i].content;
    }
    return null;
  }

  /* ---------- Conversations ---------- */

  function conv(id) { var want = arguments.length ? id : S.current; if (!want) return null; return S.convs.filter(function (c) { return c.id === want; })[0] || null; }
  function newConv() {
    var c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "Nouvelle conversation", messages: [] };
    S.convs.unshift(c);
    S.current = c.id;
    save();
    return c;
  }
  function openConv(id) { S.current = id; save(); renderConv(); }

  function msgNode(m) {
    var el = document.createElement("div");
    if (m.role === "user") {
      el.className = "msg msg--user";
      el.innerHTML = '<div class="bubble"></div>';
      el.firstChild.textContent = m.content;
    } else {
      el.className = "msg msg--ai";
      el.innerHTML = '<span class="av"><svg><use href="#i-spark"/></svg></span><div class="body"></div>';
      el.lastChild.innerHTML = markdown(m.content) + (m.tag === "sim" ? '<span class="msg-tag">Réponse simulée</span>' : "");
    }
    return el;
  }
  function renderConv() {
    var c = conv();
    $("[data-conv-title]").textContent = c && c.messages.length ? c.title : "Nouvelle conversation";
    messagesEl.innerHTML = "";
    if (!c || !c.messages.length) {
      messagesEl.innerHTML = '<div class="empty-state"><svg class="mark"><use href="#i-spark"/></svg><h2>Comment puis-je vous aider ?</h2><p>Environnement de formation · dossiers fictifs uniquement</p></div>';
    } else c.messages.forEach(function (m) { messagesEl.appendChild(msgNode(m)); });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderRecents();
  }
  function renderRecents() {
    var ul = $("[data-recents]");
    ul.innerHTML = "";
    var list = S.convs.filter(function (c) { return c.messages.length; });
    if (!list.length) { ul.innerHTML = '<li class="empty">Vos échanges apparaîtront ici.</li>'; return; }
    list.forEach(function (c) {
      var li = document.createElement("li");
      var b = h('<button type="button"><svg><use href="#i-chat"/></svg><span></span></button>');
      b.lastChild.textContent = c.title;
      b.setAttribute("aria-current", String(c.id === S.current));
      b.onclick = function () { openConv(c.id); if (window.innerWidth <= 980) toggleSide(false); };
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function toggleSide(force) {
    var on = force === undefined ? !claudeEl.classList.contains("side-open") : force;
    claudeEl.classList.toggle("side-open", on);
    $("[data-side-toggle]").setAttribute("aria-expanded", String(on));
  }
  $("[data-side-toggle]").addEventListener("click", function (e) { if (e.target.closest(".spot-badge")) return; toggleSide(); });
  function startNew() {
    var c = conv();
    if (!c || c.messages.length) newConv();
    renderConv();
    input.focus();
  }
  $("[data-new]").addEventListener("click", function (e) { if (e.target.closest(".spot-badge")) return; startNew(); });
  $("[data-side-new]").addEventListener("click", startNew);

  /* ---------- Réponses : Claude (API) ou simulation ---------- */

  var NOTES_RE = /nora/;
  var REF_TABLE = "| Action | Responsable | Échéance |\n|---|---|---|\n| Préparer l’affiche | Nora | 5 novembre |\n| Vérifier le stock | Sami | 6 novembre |\n| Confirmer le lieu de la prochaine rencontre | non précisé | non précisé |";
  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = ((users[users.length - 1] || {}).content || "").toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    var hadTable = c.messages.some(function (m) { return m.role === "assistant" && hasTable(m.content); });
    var hasNotes = NOTES_RE.test(all) && /sami/.test(all);
    var signals = /non pr[ée]cis|absente?|manquant|inconnu|n.invente|seulement les notes|uniquement les notes/.test(all);
    if (hadTable && /(remplace|corrige|modifie|n.est pas indiqu|pas de responsable|non pr[ée]cis)/.test(t)) return "Vous avez raison, les notes n’indiquent pas qui confirme le lieu. Voici le tableau corrigé :\n\n" + REF_TABLE;
    if (hasNotes && /tableau|colonnes?/.test(all)) {
      if (signals) return "Voici le tableau établi à partir de vos notes :\n\n" + REF_TABLE;
      return "Voici un tableau des actions à partir de vos notes :\n\n| Action | Responsable | Échéance |\n|---|---|---|\n| Préparer l’affiche | Nora | 5 novembre |\n| Vérifier le stock | Sami | 6 novembre |\n| Confirmer le lieu de la prochaine rencontre | Nora | 5 novembre |";
    }
    if (/tableau/.test(t) && !hasNotes) return "Avec plaisir. Pouvez-vous me transmettre les notes à organiser ? Je n’ai pas accès à vos documents : collez le texte dans votre message.";
    if (hasNotes) return "Voici ce que je retiens de ces notes :\n\n- Nora prépare l’affiche pour le 5 novembre.\n- Sami vérifie le stock pour le 6 novembre.\n- Le lieu de la prochaine rencontre reste à confirmer.\n\nSouhaitez-vous un tableau Action, Responsable, Échéance ?";
    if (/accueil|visiteurs/.test(t) && /12 octobre/.test(t)) return "Madame, Monsieur,\n\nNous vous informons que l’accueil sera fermé le 12 octobre de 14 h à 16 h. Pendant cette période, notre messagerie reste à votre disposition pour toute demande.\n\nNous vous remercions de votre compréhension.";
    if (/accueil|visiteurs/.test(t)) return "Volontiers. Indiquez-moi la date, les horaires de fermeture et le moyen de contact qui reste disponible, pour que le message soit exact.";
    if (/^(bonjour|salut|hello|bonsoir)\b/.test(t.trim())) return "Bonjour ! Comment puis-je vous aider ?";
    return "Je suis en mode simulé : je réponds surtout aux exercices de la formation. Suivez la consigne affichée à droite.";
  }

  function addPending() {
    var el = msgNode({ role: "assistant", content: "" });
    el.lastChild.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    var e = messagesEl.querySelector(".empty-state");
    if (e) e.remove();
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }
  function streamText(el, text, done) {
    var i = 0, body = el.lastChild;
    (function step() {
      i = Math.min(text.length, i + 5 + Math.floor(Math.random() * 9));
      body.innerHTML = markdown(text.slice(0, i));
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (i < text.length) setTimeout(step, 16); else done();
    })();
  }
  function setBusy(b) { busy = b; input.disabled = false; sendBtn.disabled = b; orbMood(); }
  function finish(c, text, tag) {
    c.messages.push({ role: "assistant", content: text, tag: tag, screen: screen });
    S.stats[tag === "sim" ? "sim" : "live"]++;
    save();
    setBusy(false);
    renderConv();
  }
  function showError(el, c, msg) {
    el.lastChild.innerHTML = '<div class="msg-error"><span></span><div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn-line" data-r>Réessayer</button><button type="button" class="btn-line" data-s>Utiliser la simulation</button></div></div>';
    el.querySelector(".msg-error span").textContent = msg;
    el.querySelector("[data-r]").onclick = function () { el.remove(); ask(c); };
    el.querySelector("[data-s]").onclick = function () { setMode("sim", true); el.remove(); ask(c); };
    setBusy(false);
  }
  function ask(c) {
    setBusy(true);
    var el = addPending();
    if (mode !== "live") { setTimeout(function () { var t = simulate(c); streamText(el, t, function () { finish(c, t, "sim"); }); }, 450); return; }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FIRST_BYTE_TIMEOUT);
    fetch(API, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ module: "module3", learner: S.learner, messages: c.messages.map(function (m) { return { role: m.role, content: m.content }; }) })
    }).then(function (res) {
      if (res.status === 503) { clearTimeout(timer); setMode("sim"); el.remove(); ask(c); return; }
      if (res.status === 429) { clearTimeout(timer); showError(el, c, "La limite d’échanges du jour est atteinte. Votre travail est conservé. Vous pouvez continuer avec la simulation."); return; }
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      var reader = res.body.getReader(), dec = new TextDecoder(), text = "", started = false;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (text.indexOf("\u0000ERREUR") >= 0 || !text.trim()) { showError(el, c, "Votre travail est conservé. Réessayez ou consultez le corrigé."); return; }
            finish(c, text, "live");
            return;
          }
          if (!started) { started = true; clearTimeout(timer); }
          text += dec.decode(r.value, { stream: true });
          el.lastChild.innerHTML = markdown(text.replace("\u0000ERREUR", ""));
          messagesEl.scrollTop = messagesEl.scrollHeight;
          return pump();
        });
      })();
    }).catch(function () { clearTimeout(timer); showError(el, c, "Votre travail est conservé. Réessayez ou consultez le corrigé."); });
  }

  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; }
  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    var c = conv() || newConv();
    c.messages.push({ role: "user", content: text, screen: screen });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 44) + (text.length > 44 ? "…" : "");
    input.value = "";
    autosize();
    clearTimeout(typingTimer); typingTimer = null;
    save();
    renderConv();
    ask(c);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
  });
  input.addEventListener("input", function () {
    autosize();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { typingTimer = null; orbMood(); }, 1400);
    orbMood();
  });
  // démonstration de l'ajout d'un fichier fictif
  $("[data-attach]").addEventListener("click", function (e) { if (e.target.closest(".spot-badge")) return; $("[data-attach-chip]").hidden = false; });
  $("[data-attach-remove]").addEventListener("click", function () { $("[data-attach-chip]").hidden = true; });

  /* ---------- Mode réel ou simulé ---------- */

  var modeBtn = $("[data-mode]");
  function setMode(m, forced) {
    mode = m;
    if (forced) { S.forceSim = m === "sim"; save(); }
    modeBtn.dataset.state = m;
    modeBtn.textContent = m === "live" ? "Claude connecté" : "Mode simulé";
    modeBtn.title = m === "live" ? "Cliquer pour passer en simulation" : "Cliquer pour tenter la connexion à Claude";
    $("[data-work-note]").textContent = m === "live"
      ? "Interface simulée pour la formation. Réponses générées par Claude : vérifiez toujours les faits."
      : "Interface et réponses simulées pour la formation. Ce n’est pas l’interface réelle de Claude.";
  }
  function probe() {
    if (!API || S.forceSim) { setMode("sim"); return; }
    fetch(API).then(function (r) { return r.json(); }).then(function (j) { setMode(j && j.live ? "live" : "sim"); }).catch(function () { setMode("sim"); });
  }
  modeBtn.addEventListener("click", function () { if (mode === "live") setMode("sim", true); else { S.forceSim = false; save(); probe(); } });

  /* ---------- Panneau : largeur, introduction, onglets ---------- */

  $("[data-wide]").addEventListener("click", function () {
    var on = !app.classList.contains("is-wide");
    app.classList.toggle("is-wide", on);
    this.setAttribute("aria-pressed", String(on));
    this.textContent = on ? "Réduire" : "Agrandir";
  });
  $("[data-intro-open]").addEventListener("click", function () {
    frame.src = INTRO_URL;
    screen = null;
    narrate(INTRO_SAY);
    showTab("story");
  });

  function showTab(tab) {
    split.dataset.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  /* ---------- Démarrage : un clic lance la voix ---------- */

  var unlocked = false;
  function start(withSound) {
    unlocked = true;
    S.sound = withSound;
    save();
    paintSound();
    unlockAudio();
    if (withSound && window.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* rien */ } }
    var gate = $("[data-gate]");
    gate.classList.add("is-leaving");
    setTimeout(function () { gate.hidden = true; }, 500);
    app.hidden = false;
    if (!S.introDone) { frame.src = INTRO_URL; narrate(INTRO_SAY); }
    else frame.src = MODULE_URL;           // l'écran repris déclenche sa propre consigne
  }
  $("[data-gate-start]").addEventListener("click", function () { start(true); });
  $("[data-gate-silent]").addEventListener("click", function () { start(false); });
  if (S.introDone) $("[data-gate-start]").firstChild.textContent = "Reprendre";
  gateOrb.setState("speaking");
  setTimeout(function () { gateOrb.setState("idle"); }, 2600);

  if (!conv()) newConv();
  renderConv();
  showTab("story");
  setMode("sim");
  probe();

  window.AtelierTracking = {
    snapshot: function () {
      var inner = null;
      try { inner = frame.contentWindow.CourseTracking.snapshot(); } catch (e) { inner = null; }
      return { module: inner, screen: screen, claudeResponses: S.stats, introSeen: !!S.introDone };
    }
  };
})();
