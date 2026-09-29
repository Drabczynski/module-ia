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

  var smallOrb = SiriOrb($("[data-orb]"), { size: 52, label: "Assistant pédagogique" });
  // grande orbe au centre de Claude, à la place de l'étoile, tant que la conversation est vide
  var bigHost = document.createElement("div");
  bigHost.className = "big-orb";
  var bigOrb = SiriOrb(bigHost, { size: 176, label: "Assistant pédagogique" });
  var bigSay = document.createElement("div");
  bigSay.className = "orb-say";
  bigSay.setAttribute("aria-live", "polite");
  var orb = {
    setState: function (st) { smallOrb.setState(st); bigOrb.setState(st); },
    setLevel: function (fn) { smallOrb.setLevel(fn); bigOrb.setLevel(fn); }
  };
  var speaking = false, typingTimer = null;
  function orbMood() {
    if (speaking) return orb.setState("listening");      // l'orbe réagit à la voix (contour et bandes)
    if (busy) return orb.setState("thinking");
    if (typingTimer) return orb.setState("listening");
    orb.setState("idle");
  }

  /* niveau de la voix calé sur l'enregistrement : enveloppe d'amplitude calculée à l'avance
     (60 valeurs par seconde), lue à la position de lecture. Aucune dérivation du son : rien ne peut le couper. */
  var ENV_RATE = 60, envelopes = {};
  function loadEnvelope(id) {
    if (envelopes[id] || !window.fetch || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return;
    envelopes[id] = "loading";
    fetch("../assets/audio/" + id + ".mp3").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      return new Ctx(1, 2, 44100).decodeAudioData(buf);
    }).then(function (audioBuf) {
      var data = audioBuf.getChannelData(0), step = Math.floor(audioBuf.sampleRate / ENV_RATE), out = [];
      for (var i = 0; i < data.length; i += step) {
        var sum = 0, end = Math.min(data.length, i + step);
        for (var k = i; k < end; k++) sum += data[k] * data[k];
        out.push(Math.sqrt(sum / (end - i)));
      }
      var sorted = out.slice().sort(function (x, y) { return x - y; });
      var ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
      envelopes[id] = out.map(function (v) { return Math.min(1, Math.pow(v / ref, 0.8)); });
    }).catch(function () { envelopes[id] = null; });
  }
  function unlockAudio() { /* conservé pour compatibilité : la lecture n'a plus besoin d'être dérivée */ }
  function voiceLevel() {
    var env = envelopes[audio.dataset.id];
    if (audio.paused || !env || env === "loading") return -1;
    var i = Math.floor(audio.currentTime * ENV_RATE);
    var v = env[Math.min(env.length - 1, i)] || 0, w = env[Math.min(env.length - 1, i + 1)] || 0;
    return Math.max(v, w) * 0.95;
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

  /* texte de la voix affiché mot à mot, au rythme de l'enregistrement */
  // découpe en mots ; la ponctuation isolée (« : », « ! ») reste attachée au mot précédent
  function tokens(t) {
    var out = [];
    (t || "").split(/\s+/).filter(Boolean).forEach(function (w) {
      if (/^[:;!?»«.,…]+$/.test(w) && out.length) out[out.length - 1] += "\u00a0" + w; else out.push(w);
    });
    return out;
  }
  function Streamer(el) {
    var words = [], text = null, shown = 0;
    return {
      set: function (t) {
        if (t === text) return;
        text = t; words = []; shown = 0; el.innerHTML = "";
        tokens(t).forEach(function (w) {
          var sp = document.createElement("span");
          sp.className = "sw";
          sp.textContent = w;
          el.appendChild(sp);
          el.appendChild(document.createTextNode(" "));
          words.push(sp);
        });
        el.setAttribute("aria-label", t || "");
      },
      progress: function (p) { this.reveal(Math.ceil(words.length * Math.max(0, p))); },
      reveal: function (k) {
        k = Math.min(words.length, k);
        for (; shown < k; shown++) words[shown].classList.add("on");
      }
    };
  }
  var capStream = Streamer(capEl), sayStream = Streamer(bigSay);
  function sayText(text) { capStream.set(text); sayStream.set(text); }
  function sayProgress(p) { capStream.progress(p); sayStream.progress(p); }
  function sayReveal(k) { capStream.reveal(k); sayStream.reveal(k); }
  var sayTimer = null;
  function saying(on) {
    clearTimeout(sayTimer);
    if (on) app.classList.add("is-saying");
    else sayTimer = setTimeout(function () { app.classList.remove("is-saying"); }, 2600);
  }
  // texte complet, sans voix (son coupé ou voix indisponible)
  function caption(text, idle) {
    capEl.classList.toggle("is-idle", !!idle);
    sayText(text);
    sayProgress(1);
  }

  // boucle d'affichage pendant la lecture d'un enregistrement
  var capRaf = 0;
  function capLoop() {
    capRaf = 0;
    if (audio.paused) return;
    var t = audio.currentTime, i = -1;
    for (var k = 0; k < cues.length; k++) if (cues[k][0] <= t + 0.05) i = k;
    if (i >= 0) {
      var c = cues[i], W = (window.COURSE_WORDS || {})[audio.dataset.id];
      sayText(c[2]);
      if (W) {
        var next = cues[i + 1] ? cues[i + 1][0] - 0.12 : Infinity;
        var mine = W.filter(function (w) { return w[0] >= c[0] - 0.12 && w[0] < next; });
        sayReveal(mine.filter(function (w) { return w[0] <= t + 0.04; }).length);
      } else sayProgress(t >= c[1] ? 1 : (t - c[0]) / Math.max(0.4, c[1] - c[0]) * 1.12);
    }
    capRaf = requestAnimationFrame(capLoop);
  }

  var cues = [], cueIdx = -1, current = null;
  function stopVoice() {
    saying(false);
    audio.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
    speaking = false;
    orbMood();
  }
  function ended() {
    speaking = false;
    orbMood();
    sayProgress(1);
    saying(false);
    capEl.classList.add("is-idle");
    post({ type: "voice-ended" });
  }
  function narrate(item) {
    current = item;
    stopVoice();
    cues = []; cueIdx = -1;
    if (!item) return;
    if (!S.sound) { caption(item.text, true); return; }
    var capts = (window.COURSE_CAPTIONS || {})[item.audio];
    if (item.audio && capts) {
      cues = capts;
      capEl.classList.remove("is-idle");
      sayText(""); saying(true);
      audio.src = "../assets/audio/" + item.audio + ".mp3";
      audio.dataset.id = item.audio;
      loadEnvelope(item.audio);
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { blocked = true; caption(item.text, true); });
      return;
    }
    var v = frVoice();
    if (!v) { caption(item.text, true); return; }
    var u = new SpeechSynthesisUtterance(item.text);
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    var t0 = 0, estRaf = 0;
    u.onstart = function () {
      speaking = true; orbMood(); t0 = performance.now();
      (function est() {           // si le navigateur ne signale pas les mots, estimation au temps écoulé
        if (!speaking) return;
        sayProgress((performance.now() - t0) / (item.text.length * 62));
        estRaf = requestAnimationFrame(est);
      })();
    };
    u.onboundary = function (ev) { if (ev.name === "word" || ev.charIndex) sayProgress((ev.charIndex + (ev.charLength || 1)) / item.text.length); };
    u.onend = ended;
    u.onerror = function (ev) { if (ev && ev.error === "not-allowed") blocked = true; speaking = false; orbMood(); caption(item.text, true); };
    capEl.classList.remove("is-idle");
    sayText(item.text); saying(true);
    speechSynthesis.speak(u);
  }
  audio.addEventListener("play", function () { speaking = true; orbMood(); if (!capRaf) capLoop(); });
  audio.addEventListener("pause", function () { if (!audio.ended) { speaking = false; orbMood(); } });
  audio.addEventListener("ended", ended);


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
  var introFrame = $("[data-intro-frame]");
  window.addEventListener("message", function (e) {
    if (introFrame && e.source === introFrame.contentWindow && e.data && e.data.src === "atelier-intro" && e.data.type === "intro-done") { closeIntro(); return; }
    if (e.source !== frame.contentWindow || !e.data) return;
    var d = e.data;

    if (d.src !== "module3") return;
    if (d.type === "screen") onScreen(d);
    if (d.type === "need-table") {
      var text = lastTable();
      post({ type: "table", text: text || "" });
      if (!text) toast("Aucun tableau dans la conversation. Envoyez d’abord votre demande à Claude.");
    }
    if (d.type === "open-claude") focusClaude();
    if (d.type === "cta") paintNext(d);
  });

  /* bouton d'action de l'écran, affiché dans la barre : il reprend le libellé et l'état du module */
  var nextBtn = $("[data-next]");
  function paintNext(d) {
    nextBtn.hidden = !d.label;
    if (!d.label) return;
    $("[data-next-label]").textContent = d.label;
    nextBtn.classList.toggle("is-success", !!d.success);
    nextBtn.classList.toggle("is-ready", !!d.ready);
    if (d.denied) { nextBtn.classList.remove("is-denied"); void nextBtn.offsetWidth; nextBtn.classList.add("is-denied"); }
  }
  nextBtn.addEventListener("click", function () { post({ type: "cta" }); });

  function onScreen(d) {
    screen = d.code;
    var text = VO[d.code] || "";
    if (!d.audio && d.lead) text += " " + d.lead;
    narrate({ audio: d.audio, text: text });
    claudeEl.classList.toggle("is-practice", !!PRACTICE[d.code]);
    $("[data-tab-dot]").hidden = !PRACTICE[d.code];
    clearTimeout(repTimer);
    if (d.code === "3.04") repTimer = setTimeout(startReperes, 900);
    else endReperes(true);
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
      if (repSeen.indexOf(i) >= 0) b.classList.add("is-seen");
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (repSeen.indexOf(i) < 0) repSeen.push(i);
        b.classList.add("is-seen");
        paintRepCard();
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
  /* 3.04 : le panneau de formation se replie, les repères se font sur Claude, puis le panneau revient */
  var repSeen = [], repCard = null, repTimer = null;
  function paintRepCard() {
    if (!repCard) return;
    var n = repSeen.length;
    repCard.querySelector(".rep-count").innerHTML = "<b>" + n + "</b> / 4 repères";
    repCard.querySelector("p").textContent = n >= 4 ? "Tous les repères sont vus. Retrouvez les mêmes fonctions dans votre compte." : "Cliquez sur chaque pastille orange pour découvrir à quoi elle sert.";
  }
  function startReperes() {
    if (repCard) return;
    split.classList.add("panel-away");
    showTab("claude");
    spots(true);
    repCard = h('<div class="rep-card" role="dialog" aria-label="Les repères dans Claude"><h3>Les repères dans Claude</h3><p></p><div class="rep-foot"><span class="rep-count"></span><button type="button" class="btn-next btn-sm">Continuer<svg><use href="#i-arrow"/></svg></button></div></div>');
    repCard.querySelector("button").addEventListener("click", endReperes);
    claudeEl.appendChild(repCard);
    paintRepCard();
    requestAnimationFrame(function () { repCard.classList.add("is-on"); });
  }
  function endReperes(silent) {
    clearTimeout(repTimer);
    if (!repCard) return;
    var card = repCard;
    repCard = null;
    card.classList.remove("is-on");
    setTimeout(function () { card.remove(); }, 400);
    spots(false);
    split.classList.remove("panel-away");
    if (repSeen.length >= 4) post({ type: "spots-all" });
    if (silent !== true) showTab("story");
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
    if (inWelcome) return;
    var c = conv(), big = !c || !c.messages.length;
    var wasBig = app.classList.contains("has-big-orb") && bigHost.isConnected && !app.hidden;
    var from = wasBig ? bigHost.getBoundingClientRect() : null;
    $("[data-conv-title]").textContent = c && c.messages.length ? c.title : "Nouvelle conversation";
    messagesEl.innerHTML = "";
    if (big) {
      messagesEl.innerHTML = '<div class="empty-state"><h2>Comment puis-je vous aider ?</h2><p>Environnement de formation · dossiers fictifs uniquement</p></div>';
      messagesEl.firstChild.insertBefore(bigSay, messagesEl.firstChild.firstChild);
      messagesEl.firstChild.insertBefore(bigHost, messagesEl.firstChild.firstChild);
    } else c.messages.forEach(function (m) { messagesEl.appendChild(msgNode(m)); });
    var smallFrom = !wasBig && big && !app.hidden ? smallOrb.el.getBoundingClientRect() : null;
    app.classList.toggle("has-big-orb", big);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderRecents();
    if (from && !big) flyToCorner(from);
    else if (smallFrom && smallFrom.width) flyToCenter(smallFrom);
  }

  /* l'orbe se déplace visiblement : du centre de Claude vers la barre du panneau, et inversement */
  var FLY = "transform .85s cubic-bezier(.65, 0, .25, 1)";
  function centerDelta(a, b) { return [b.left + b.width / 2 - (a.left + a.width / 2), b.top + b.height / 2 - (a.top + a.height / 2)]; }
  function flyToCorner(from) {
    var target = smallOrb.el, to = target.getBoundingClientRect();
    if (!to.width) return;
    target.style.opacity = "0";
    var h = bigHost, d = centerDelta(from, to);
    document.body.appendChild(h);
    ["position:fixed", "left:" + from.left + "px", "top:" + from.top + "px", "margin:0", "z-index:65", "transition:none", "transform:none"].forEach(function (r) {
      var kv = r.split(":"); h.style.setProperty(kv[0], kv.slice(1).join(":"));
    });
    void h.offsetWidth;
    h.style.transition = FLY;
    h.style.transform = "translate(" + d[0] + "px," + d[1] + "px) scale(" + (to.width / from.width) + ")";
    setTimeout(function () {
      ["position", "left", "top", "margin", "z-index", "transition", "transform"].forEach(function (k) { h.style.removeProperty(k); });
      if (h.parentNode === document.body) h.remove();
      target.style.opacity = "";
    }, 880);
  }
  function flyToCenter(from) {
    var h = bigHost, to = h.getBoundingClientRect(), d = centerDelta(to, from);
    h.style.transition = "none";
    h.style.transform = "translate(" + d[0] + "px," + d[1] + "px) scale(" + (from.width / to.width) + ")";
    void h.offsetWidth;
    h.style.transition = FLY;
    h.style.transform = "";
    setTimeout(function () { h.style.removeProperty("transition"); }, 880);
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

  /* largeur du panneau de formation : poignée à glisser, flèches du clavier, double-clic pour revenir au réglage par défaut */
  var resizer = $("[data-resizer]");
  function setPanelW(w, keep) {
    if (w == null) { split.style.removeProperty("--panel-w"); if (keep) { delete S.panelW; save(); } return; }
    var max = split.clientWidth ? split.clientWidth - 320 - 20 : Infinity;   // interface encore masquée : pas de borne
    w = Math.round(Math.max(380, Math.min(max, w)));
    split.style.setProperty("--panel-w", w + "px");
    if (keep) { S.panelW = w; save(); }
  }
  if (S.panelW) setPanelW(S.panelW);
  resizer.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    split.classList.add("is-resizing");
    var right = split.getBoundingClientRect().right - 8;
    function move(ev) { setPanelW(right - ev.clientX - 6); }
    function up() {
      split.classList.remove("is-resizing");
      resizer.removeEventListener("pointermove", move);
      resizer.removeEventListener("pointerup", up);
      setPanelW($(".panel").getBoundingClientRect().width, true);
    }
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
  });
  resizer.addEventListener("dblclick", function () { setPanelW(null, true); });
  resizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var w = $(".panel").getBoundingClientRect().width;
    setPanelW(w + (e.key === "ArrowLeft" ? 32 : -32), true);
  });
  window.addEventListener("resize", function () { if (S.panelW) setPanelW(S.panelW); });

  function openIntro() {
    stopVoice();
    introFrame.classList.remove("is-leaving");
    introFrame.hidden = false;
    introFrame.src = INTRO_URL;
  }
  function closeIntro() {
    // le clic sur « Commencer » dans l'introduction autorise aussi la voix ici
    var first = !S.introDone;
    S.introDone = true; save();
    unlocked = true; unlockAudio();
    introFrame.classList.add("is-leaving");
    setTimeout(function () { introFrame.hidden = true; introFrame.removeAttribute("src"); }, 450);
    if (first) { startWelcome(); return; }
    app.hidden = false;
    if (!frame.getAttribute("src")) frame.src = MODULE_URL + "#2";   // 3.01 : l'introduction vient de la remplacer
    else if (current) narrate(current);
  }
  $("[data-intro-open]").addEventListener("click", openIntro);

  function showTab(tab) {
    split.dataset.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  /* ---------- Accueil de l'assistante d'apprentissage ---------- */

  // voix « bienvenue » (enregistrement ElevenLabs) : phrases et minutage relevés sur l'enregistrement
  var WELCOME = [
    [0.14, 0.94, "Hey, salut !"],
    [1.46, 3.5, "On va apprendre à utiliser l’IA ensemble."],
    [4.06, 6.44, "Et quoi de mieux qu’une IA pour t’épauler ?"],
    [6.96, 8.2, "Je vais te guider pas à pas."],
    [8.94, 9.42, "Suis-moi !"]
  ];
  var welcomeEl = $("[data-welcome]"), wlGo = $("[data-wl-go]"), wlStream = Streamer($("[data-wl-say]"));
  var wlRaf = 0, inWelcome = false;
  function wlLoop() {
    wlRaf = 0;
    if (!inWelcome) return;
    // le texte s'accumule : chaque phrase apparaît mot à mot pendant qu'elle est prononcée
    var t = audio.currentTime, W = (window.COURSE_WORDS || {}).bienvenue || [];
    wlStream.reveal(W.filter(function (w) { return w[0] <= t + 0.04; }).length);
    if (!audio.paused) wlRaf = requestAnimationFrame(wlLoop);
  }
  function startWelcome() {
    inWelcome = true;
    stopVoice();
    cues = [];
    app.hidden = false;
    app.classList.add("is-welcome");
    welcomeEl.hidden = false;
    $("[data-wl-slot]").appendChild(bigHost);
    wlStream.set(WELCOME.map(function (c) { return c[2]; }).join(" "));
    setTimeout(function () { wlGo.classList.add("is-on"); }, 1400);
    if (!S.sound) { wlStream.progress(1); return; }
    audio.src = "../assets/audio/bienvenue.mp3";
    audio.dataset.id = "bienvenue";
    loadEnvelope("bienvenue");
    var p = audio.play();
    if (p && p.catch) p.catch(function () { blocked = false; wlStream.progress(1); });
    audio.addEventListener("play", function onPlay() { audio.removeEventListener("play", onPlay); if (!wlRaf) wlLoop(); });
  }
  wlGo.addEventListener("click", function () {
    if (!inWelcome) return;
    inWelcome = false;
    audio.pause();
    wlStream.progress(1);
    welcomeEl.classList.add("is-leaving");
    setTimeout(function () {
      // l'orbe s'envole vers sa place, au centre de Claude, pendant que l'interface apparaît
      var from = bigHost.getBoundingClientRect();
      app.classList.remove("is-welcome");
      renderConv();
      var to = bigHost.getBoundingClientRect();
      bigHost.style.transform = "translate(" + (from.left - to.left) + "px," + (from.top - to.top) + "px)";
      void bigHost.offsetWidth;
      bigHost.classList.add("is-flying");
      bigHost.style.transform = "";
      welcomeEl.hidden = true;
      setTimeout(function () {
        bigHost.classList.remove("is-flying");
        frame.src = MODULE_URL + "#2";            // la formation démarre, avec sa première consigne
      }, 1000);
    }, 280);
  });

  /* ---------- Démarrage ---------- */

  // le navigateur n'autorise le son qu'après un clic : si la voix a été bloquée, elle part au premier clic
  var unlocked = false, blocked = false;
  function firstGesture() {
    unlocked = true;
    unlockAudio();
    if (blocked && current) { blocked = false; narrate(current); }
  }
  ["pointerdown", "keydown"].forEach(function (ev) { window.addEventListener(ev, firstGesture, true); });

  if (S.introDone) { app.hidden = false; frame.src = MODULE_URL + "#2"; }   // retour : directement dans le module, exercices vierges
  else openIntro();

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
