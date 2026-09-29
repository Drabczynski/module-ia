/* ==========================================================================
   Module 2 · La structure d'un prompt
   Rôle, cible, objectif, contexte, format : construire un prompt solide (compétence C2).
   Même moteur que l’atelier : assistant d’IA simulé à gauche, la formation à droite,
   l'orbe lit chaque consigne (voix de synthèse en attendant les enregistrements).
   ========================================================================== */
(function () {
  "use strict";

  var API = window.ATELIER_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "structure-prompt";
  var FIRST_BYTE_TIMEOUT = 20000;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Préférences (mémorisées) et parcours (repart de zéro à chaque ouverture) ---------- */

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.learner = S.learner || Math.random().toString(36).slice(2, 12);
  if (S.sound === undefined) S.sound = true;
  delete S.convs; delete S.current;
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }
  var P = { i: 0, act: {}, convs: [], current: null, stats: { live: 0, sim: 0 } };

  var app = $("[data-app]"), claudeEl = $(".claude"), split = $("[data-shell]"), bodyEl = $("[data-p-body]");
  var messagesEl = $("[data-messages]"), input = $("[data-input]"), composer = $("[data-composer]"), sendBtn = $(".send");
  var capEl = $("[data-cap]"), audio = $("[data-audio]"), toastEl = $("[data-toast]"), nextBtn = $("[data-next]");
  var attachBtn = $("[data-attach]");
  var mode = "sim", busy = false;

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return String(n).replace(".", ","); }
  var toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  /* ---------- Orbe ---------- */

  var smallOrb = SiriOrb($("[data-orb]"), { size: 52, label: "Assistante d’apprentissage" });
  var bigHost = document.createElement("div");
  bigHost.className = "big-orb";
  var bigOrb = SiriOrb(bigHost, { size: 176, label: "Assistante d’apprentissage" });
  var bigSay = document.createElement("div");
  bigSay.className = "orb-say";
  bigSay.setAttribute("aria-live", "polite");
  var orb = {
    setState: function (st) { smallOrb.setState(st); bigOrb.setState(st); },
    setLevel: function (fn) { smallOrb.setLevel(fn); bigOrb.setLevel(fn); }
  };
  var speaking = false, typingTimer = null;
  function orbMood() {
    if (speaking) return orb.setState("listening");
    if (busy) return orb.setState("thinking");
    if (typingTimer) return orb.setState("listening");
    orb.setState("disabled");                            // sans parole : orbe immobile et éteinte
  }

  // niveau de la voix : enveloppe d'amplitude de l'enregistrement, lue à la position de lecture
  var ENV_RATE = 60, envelopes = {};
  function loadEnvelope(id) {
    if (envelopes[id] || !window.fetch || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return;
    envelopes[id] = "loading";
    fetch("../assets/audio/" + id + ".mp3").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      return new Ctx(1, 2, 44100).decodeAudioData(buf);
    }).then(function (ab) {
      var data = ab.getChannelData(0), step = Math.floor(ab.sampleRate / ENV_RATE), out = [];
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
  orb.setLevel(function () {
    var env = envelopes[audio.dataset.id];
    if (audio.paused || !env || env === "loading") return -1;
    var i = Math.floor(audio.currentTime * ENV_RATE);
    return Math.max(env[Math.min(env.length - 1, i)] || 0, env[Math.min(env.length - 1, i + 1)] || 0) * 0.95;
  });

  /* ---------- Voix et texte en flux ---------- */

  var voices = [];
  function frVoice() {
    if (!window.speechSynthesis) return null;
    if (!voices.length) voices = speechSynthesis.getVoices();
    var fr = voices.filter(function (v) { return /^fr/i.test(v.lang); });
    return fr.filter(function (v) { return /google|natural|neural|amélie|thomas|audrey|aurélie/i.test(v.name); })[0] || fr[0] || null;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { voices = speechSynthesis.getVoices(); };

  function tokens(t) {
    var out = [];
    (t || "").split(/\s+/).filter(Boolean).forEach(function (w) {
      if (/^[:;!?»«.,…]+$/.test(w) && out.length) out[out.length - 1] += " " + w; else out.push(w);
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
      reveal: function (k) { k = Math.min(words.length, k); for (; shown < k; shown++) words[shown].classList.add("on"); }
    };
  }
  var capStream = Streamer(capEl), sayStream = Streamer(bigSay);
  function sayText(t) { capStream.set(t); sayStream.set(t); }
  function sayProgress(p) { capStream.progress(p); sayStream.progress(p); }
  function sayReveal(k) { capStream.reveal(k); sayStream.reveal(k); }
  var sayTimer = null;
  function saying(on) {
    clearTimeout(sayTimer);
    if (on) app.classList.add("is-saying");
    else sayTimer = setTimeout(function () { app.classList.remove("is-saying"); }, 2600);
  }
  function caption(text, idle) { capEl.classList.toggle("is-idle", !!idle); sayText(text); sayProgress(1); }

  var cues = [], current = null, capRaf = 0, blocked = false, markT = 999;
  function syncMarks(t) {
    markT = t;
    $$("[data-at]", bodyEl).forEach(function (el) {
      el.classList.toggle("hl-on", t >= +el.dataset.at && !(el.dataset.until && t >= +el.dataset.until));
    });
  }
  function capLoop() {
    capRaf = 0;
    if (audio.paused) return;
    var t = audio.currentTime, i = -1;
    syncMarks(t);
    for (var k = 0; k < cues.length; k++) if (cues[k][0] <= t + 0.05) i = k;
    if (i >= 0) {
      var c = cues[i], W = (window.COURSE_WORDS || {})[audio.dataset.id];
      sayText(c[2]);
      if (W) {
        var next = cues[i + 1] ? cues[i + 1][0] - 0.12 : Infinity;
        var mine = W.filter(function (w) { return w[0] >= c[0] - 0.12 && w[0] < next; });
        var nOn = mine.filter(function (w) { return w[0] <= t + 0.04; }).length, nTok = tokens(c[2]).length;
        sayReveal(mine.length ? Math.round(nOn * nTok / mine.length) : 0);
      } else sayProgress(t >= c[1] ? 1 : (t - c[0]) / Math.max(0.4, c[1] - c[0]) * 1.12);
    }
    capRaf = requestAnimationFrame(capLoop);
  }
  function stopVoice() {
    voiceId++;
    saying(false);
    audio.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
    speaking = false;
    orbMood();
  }
  function ended() {
    setTimeout(function () { hook("onVoiceEnd"); }, 250);
    syncMarks(999);
    speaking = false;
    orbMood();
    sayProgress(1);
    saying(false);
    capEl.classList.add("is-idle");
  }
  function narrate(item) {
    current = item;
    stopVoice();
    cues = [];
    if (!item) return;
    if (!S.sound) { syncMarks(999); caption(item.text, true); return; }
    var capts = (window.COURSE_CAPTIONS || {})[item.audio];
    if (item.audio && capts) {
      cues = capts;
      capEl.classList.remove("is-idle");
      sayText(""); saying(true);
      audio.src = "../assets/audio/" + item.audio + ".mp3";
      audio.dataset.id = item.audio;
      loadEnvelope(item.audio);
      var p = audio.play();
      if (p && p.catch) p.catch(function () { blocked = true; syncMarks(999); caption(item.text, true); });
      syncMarks(0);
      return;
    }
    syncMarks(999);
    var v = frVoice();
    if (!v) { caption(item.text, true); return; }
    capEl.classList.remove("is-idle");
    sayText(item.text); saying(true);
    var my = voiceId;
    speakTTS(item.text, v, function () { return my === voiceId; }, ended, function (ev) {
      if (ev && ev.error === "not-allowed") blocked = true;
      speaking = false; orbMood(); caption(item.text, true);
    });
  }
  // voix de synthèse : le texte avance mot à mot, même quand le navigateur n'envoie pas la position de lecture
  var voiceId = 0;
  function speakTTS(text, v, alive, onEnd, onErr) {
    var u = new SpeechSynthesisUtterance(text);
    speakTTS.u = u;                                   // garder une référence, sinon « end » peut ne jamais arriver
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    var t0 = 0, best = 0, done = false;
    function prog(p) { best = Math.max(best, Math.min(1, p)); sayProgress(best); }
    function begin() { if (!t0 && !done && alive()) { t0 = performance.now(); speaking = true; orbMood(); } }
    (function loop() {
      if (done || !alive()) return;
      if (t0) prog((performance.now() - t0) / (text.length * 64));
      requestAnimationFrame(loop);
    })();
    u.onstart = begin;
    setTimeout(begin, 800);                             // certains navigateurs n'émettent pas « start »
    u.onboundary = function (ev) { begin(); if (alive() && ev.charIndex !== undefined) prog((ev.charIndex + (ev.charLength || 1)) / text.length); };
    u.onend = function () { if (done || !alive()) return; done = true; prog(1); onEnd(); };
    u.onerror = function (ev) { if (done || !alive()) return; done = true; (onErr || onEnd)(ev); };
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

  /* ---------- Markdown minimal ---------- */

  function inline(t) {
    return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }
  function markdown(src) {
    var ls = src.replace(/\r/g, "").split("\n"), out = [], i = 0;
    while (i < ls.length) {
      var l = ls[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < ls.length && /^\s*\|?\s*:?-{2,}/.test(ls[i + 1])) {
        var head = cells(l), rows = []; i += 2;
        while (i < ls.length && /^\s*\|.*\|\s*$/.test(ls[i])) { rows.push(cells(ls[i])); i++; }
        out.push("<table><thead><tr>" + head.map(function (x) { return "<th>" + inline(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + inline(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>");
        continue;
      }
      if (/^\s*[-*•]\s+/.test(l)) { var it = []; while (i < ls.length && /^\s*[-*•]\s+/.test(ls[i])) { it.push(ls[i].replace(/^\s*[-*•]\s+/, "")); i++; } out.push("<ul>" + it.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>"); continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { var on = []; while (i < ls.length && /^\s*\d+[.)]\s+/.test(ls[i])) { on.push(ls[i].replace(/^\s*\d+[.)]\s+/, "")); i++; } out.push("<ol>" + on.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ol>"); continue; }
      if (/^\s*#{1,6}\s+/.test(l)) { out.push("<p><strong>" + inline(l.replace(/^\s*#+\s+/, "")) + "</strong></p>"); i++; continue; }
      if (!l.trim()) { i++; continue; }
      var para = [];
      while (i < ls.length && ls[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#)/.test(ls[i])) { para.push(ls[i]); i++; }
      if (!para.length) { para.push(l); i++; }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }

  /* ---------- Conversations ---------- */

  function conv(id) { var want = arguments.length ? id : P.current; if (!want) return null; return P.convs.filter(function (c) { return c.id === want; })[0] || null; }
  function newConv(kind, title) {
    var c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: kind || "free", title: title || "Nouvelle conversation", messages: [] };
    P.convs.unshift(c);
    P.current = c.id;
    return c;
  }
  function openConv(id) { P.current = id; renderConv(); }
  function lastAssistant(c) { var a = (c ? c.messages : []).filter(function (m) { return m.role === "assistant"; }); return a[a.length - 1]; }

  function msgNode(m) {
    var el = document.createElement("div");
    if (m.role === "user") {
      el.className = "msg msg--user";
      el.innerHTML = '<div class="bubble"></div>';
      el.firstChild.textContent = m.content;
    } else {
      el.className = "msg msg--ai";
      el.innerHTML = '<span class="av"><svg><use href="#i-spark"/></svg></span><div class="body"></div>';
      el.lastChild.innerHTML = markdown(m.content) + (m.tag === "demo" ? '<span class="msg-tag msg-tag--demo">Exemple relu pour la formation</span>' : m.tag === "sim" ? '<span class="msg-tag">Réponse simulée</span>' : "");
    }
    return el;
  }
  function renderConv() {
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
  function renderRecents() {
    var ul = $("[data-recents]");
    ul.innerHTML = "";
    var list = P.convs.filter(function (c) { return c.messages.length; });
    if (demoRecents) {
      // exemples fictifs, pour illustrer le repère « Échanges précédents »
      ["Idées pour l’affiche", "Relance du fournisseur", "Ordre du jour du point équipe"].forEach(function (t) {
        var li = h('<li><button type="button" class="is-demo" tabindex="-1"><svg><use href="#i-chat"/></svg><span></span></button></li>');
        li.querySelector("span").textContent = t;
        ul.appendChild(li);
      });
      if (!list.length) return;
    }
    if (!list.length) { ul.innerHTML = '<li class="empty">Vos échanges apparaîtront ici.</li>'; return; }
    list.forEach(function (c) {
      var li = document.createElement("li");
      var b = h('<button type="button"><svg><use href="#i-chat"/></svg><span></span></button>');
      b.lastChild.textContent = c.title;
      b.setAttribute("aria-current", String(c.id === P.current));
      b.onclick = function () { openConv(c.id); if (window.innerWidth <= 980) toggleSide(false); };
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  // l'orbe se déplace visiblement : du centre de Claude vers la barre du panneau, et inversement
  var FLY = "transform .85s cubic-bezier(.65, 0, .25, 1)";
  function centerDelta(a, b) { return [b.left + b.width / 2 - (a.left + a.width / 2), b.top + b.height / 2 - (a.top + a.height / 2)]; }
  function flyToCorner(from) {
    var target = smallOrb.el, to = target.getBoundingClientRect();
    if (!to.width) return;
    target.style.opacity = "0";
    var hh = bigHost, d = centerDelta(from, to);
    document.body.appendChild(hh);
    hh.style.position = "fixed"; hh.style.left = from.left + "px"; hh.style.top = from.top + "px";
    hh.style.margin = "0"; hh.style.zIndex = "65"; hh.style.transition = "none"; hh.style.transform = "none";
    void hh.offsetWidth;
    hh.style.transition = FLY;
    hh.style.transform = "translate(" + d[0] + "px," + d[1] + "px) scale(" + (to.width / from.width) + ")";
    setTimeout(function () {
      ["position", "left", "top", "margin", "z-index", "transition", "transform"].forEach(function (k) { hh.style.removeProperty(k); });
      if (hh.parentNode === document.body) hh.remove();
      target.style.opacity = "";
    }, 880);
  }
  function flyToCenter(from) {
    var hh = bigHost, to = hh.getBoundingClientRect(), d = centerDelta(to, from);
    hh.style.transition = "none";
    hh.style.transform = "translate(" + d[0] + "px," + d[1] + "px) scale(" + (from.width / to.width) + ")";
    void hh.offsetWidth;
    hh.style.transition = FLY;
    hh.style.transform = "";
    setTimeout(function () { hh.style.removeProperty("transition"); }, 880);
  }

  function toggleSide(force) {
    var on = force === undefined ? !claudeEl.classList.contains("side-open") : force;
    claudeEl.classList.toggle("side-open", on);
    $("[data-side-toggle]").setAttribute("aria-expanded", String(on));
  }
  $("[data-side-toggle]").addEventListener("click", function (e) { if (e.target.closest(".spot-badge")) return; toggleSide(); });
  function startNew() {
    var c = conv();
    if (!c || c.messages.length || c.kind === "demo") newConv();
    renderConv();
    hook("onNewConv");
    if (composeOn) input.focus();
  }
  $("[data-new]").addEventListener("click", function (e) { if (e.target.closest(".spot-badge")) return; startNew(); });
  $("[data-side-new]").addEventListener("click", startNew);

  /* ---------- Réponses : Claude (API) ou simulation ---------- */

  /* ---------- Les cinq briques d'un prompt : détection simple, pour guider (pas pour noter la qualité) ---------- */

  var BRICKS = [
    { k: "role", name: "Rôle", q: "Qui l’IA doit-elle être ?", re: /\b(tu es|vous êtes|en tant qu|agi[st]? comme|agissez comme|joue[sz]? (le rôle|un|une)|incarne|mets-toi (dans la peau|à la place)|imagine que tu es|comporte-toi comme)\b/i },
    { k: "cible", name: "Cible", q: "Pour qui est le texte ?", re: /\b(clients?|clientèle|candidats?|équipes?|salariés?|collègues?|lecteurs?|public|habitants?|parents?|abonnés?|visiteurs?|usagers?|adhérents?|patients?|élèves?|étudiants?|partenaires?|fournisseurs?|voisins?|destinataires?)\b/i },
    { k: "obj", name: "Objectif", q: "Que doit-il produire, et pourquoi ?", re: /\b(rédige[sz]?|écri[st]|écrire|propose[sz]?|prépare[sz]?|crée[sz]?|annonce[rsz]?|informe[rsz]?|explique[rsz]?|préviens|prévenir|afin de|pour que|objectif|le but)\b/i },
    { k: "ctx", name: "Contexte", q: "Quelles informations doit-il connaître ?", re: /\d{1,2}\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)|\b(fermé|fermée|fermés|fermeture|rouvr|réouverture|horaires?|boutique|magasin|agence|entreprise|pme|association|contexte|situation)/i },
    { k: "fmt", name: "Format", q: "Sous quelle forme ?", re: /\d+\s*(mots|lignes|phrases|caractères|points)|\b(ton|court|courte|bref|brève|paragraphes?|liste|puces|objet|rubriques?|tableau|format|titre|mail|e-mail|email|courriel|lettre|affiche|publication|post|sms|message court)\b/i }
  ];
  function bricksIn(t) { var o = {}; BRICKS.forEach(function (b) { o[b.k] = b.re.test(t || ""); }); return o; }

  var OFFRE_VAGUE = "**Assistant administratif H/F**\n\nRejoignez une entreprise dynamique et en pleine croissance ! Nous recherchons un assistant administratif motivé pour renforcer notre équipe à **Paris**.\n\nVos missions : gestion du courrier, accueil téléphonique, classement et suivi administratif.\n\nProfil : Bac +2 minimum, 5 ans d’expérience souhaités, maîtrise des outils bureautiques.\n\nRémunération : **3 500 € brut par mois**, avec un **13e mois**.\n\nEnvoyez votre candidature dès maintenant !";

  function offre(withDate) {
    return "**Assistant·e administratif·ve · CDI · Lyon 7e**\n\nVous aimez que tout soit bien organisé, et vous débutez ou changez de voie ? Ce poste est pour vous.\n\n**Vos missions**\n- Accueillir nos visiteurs et répondre au téléphone\n- Gérer le courrier et les agendas de l’équipe\n- Suivre les commandes et les factures\n\n**Votre profil**\n- Débutant·e bienvenu·e : nous vous formons\n- Sens de l’organisation et goût du contact\n\n**Ce que nous offrons**\n- CDI, 35 h, avec 1 jour de télétravail par semaine\n- 24 à 26 k€ brut par an, selon profil" + (withDate ? "\n- Prise de poste le **3 mars**" : "") + "\n\nCandidatures ouvertes jusqu’au 15 février.";
  }

  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = ((users[users.length - 1] || {}).content || "").toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    if (/offre d.emploi|recrut|candidat/.test(all)) {
      var structured = /tu es|en tant que/.test(all) && /lyon|cdi|télétravail|24/.test(all);
      if (!structured) return OFFRE_VAGUE;
      return offre(/3 mars|mars|prise de poste|démarr|début/.test(all)) + (/3 mars|mars|prise de poste|démarr|début/.test(t) && users.length > 1 ? "\n\nJ’ai ajouté la date de prise de poste." : "");
    }
    if (/24 décembre|fermeture|fermé/.test(all)) {
      var b = bricksIn(all), n = BRICKS.filter(function (x) { return b[x.k]; }).length;
      if (n >= 4) return "**Objet : Fermeture exceptionnelle le 24 décembre**\n\nBonjour,\n\nNotre boutique sera exceptionnellement **fermée le mardi 24 décembre**, pour permettre à toute l’équipe de fêter Noël en famille.\n\nNous vous accueillerons à nouveau dès le **jeudi 26 décembre**, aux horaires habituels.\n\nMerci de votre fidélité, et très belles fêtes de fin d’année !\n\nL’équipe de la boutique";
      return "Voici un message possible :\n\n« Nous vous informons que nous serons fermés le 24 décembre. Merci de votre compréhension. »\n\nDites-moi à qui il s’adresse, le ton souhaité et le format (mail, affiche, publication), je l’adapterai.";
    }
    if (/^(bonjour|salut|hello|bonsoir|coucou|hey)\b/.test(t.trim())) return "Bonjour ! Que puis-je faire pour vous ?";
    return "Je vous lis ! Pour cet exercice, suivez la consigne affichée à droite : je vous répondrai au mieux.";
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
  function setBusy(b) { busy = b; paintComposer(); orbMood(); }
  function finish(c, text, tag) {
    c.messages.push({ role: "assistant", content: text, tag: tag });
    P.stats[tag === "sim" ? "sim" : "live"]++;
    setBusy(false);
    renderConv();
    hook("onAnswer", c, text);
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
      body: JSON.stringify({ module: "structure-prompt", learner: S.learner, messages: c.messages.map(function (m) { return { role: m.role, content: m.content }; }) })
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

  /* ---------- Champ de Claude : actif seulement quand c'est à l'apprenant d'écrire ---------- */

  var composeOn = false, composeTip = null;
  function paintComposer() {
    var on = composeOn && !busy;
    input.disabled = !on;
    sendBtn.disabled = !on || !!(tpl && !tplDone());
    claudeEl.classList.toggle("is-locked", !composeOn);
    input.placeholder = composeOn ? "Écrire à l’IA…" : "Le champ s’activera quand ce sera à vous d’écrire.";
  }
  function compose(on, tip) {
    composeOn = !!on;
    app.classList.toggle("focus-compose", composeOn);
    if (composeTip) { composeTip.remove(); composeTip = null; }
    if (false && composeOn && tip) {
      composeTip = h('<span class="compose-tip"></span>');
      composeTip.textContent = tip;
      composer.appendChild(composeTip);
    }
    paintComposer();
    if (composeOn) { showTab("claude"); setTimeout(function () { if (!input.disabled) input.focus(); }, 60); }
  }
  function insert(text) {
    input.value = text;
    autosize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    hook("onInsert");
  }
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; }
  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    if (tpl && !tplDone()) { openSlot(null); return; }
    var text = tpl ? tplText().trim() : input.value.trim();
    if (!text || busy || !composeOn) return;
    clearTemplate();
    if (st().send) { input.value = ""; autosize(); if (composeTip) { composeTip.remove(); composeTip = null; } st().send(text); return; }
    var c = conv();
    if (!c || c.kind === "demo") c = newConv();
    c.messages.push({ role: "user", content: text });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 44) + (text.length > 44 ? "…" : "");
    input.value = "";
    autosize();
    clearTimeout(typingTimer); typingTimer = null;
    if (composeTip) { composeTip.remove(); composeTip = null; }
    renderConv();
    hook("onSend", c, text);
    ask(c);
  });
  /* demande à compléter : des cases orange à remplir au clic, dans le champ de Claude */
  var tpl = null, tplPop = null;
  function tplText() { return tpl.parts.map(function (p) { return typeof p === "string" ? p : (tpl.vals[p.k] || ""); }).join(""); }
  function tplDone() { return tpl.parts.every(function (p) { return typeof p === "string" || tpl.vals[p.k]; }); }
  function template(parts, tip) {
    clearTemplate();
    tpl = { parts: parts, vals: {} };
    tpl.el = h('<div class="tpl" aria-label="Demande à compléter"></div>');
    composer.insertBefore(tpl.el, input);
    composer.classList.add("has-tpl");
    compose(true, tip);
    paintTemplate();
  }
  function paintTemplate() {
    var box = tpl.el;
    box.innerHTML = "";
    tpl.parts.forEach(function (p) {
      if (typeof p === "string") { box.appendChild(document.createTextNode(p)); return; }
      var b = h('<button type="button" class="tpl-slot"></button>');
      b.textContent = tpl.vals[p.k] || p.label;
      b.dataset.k = p.k;
      b.classList.toggle("is-set", !!tpl.vals[p.k]);
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openSlot(p); };
      box.appendChild(b);
    });
    input.value = tplDone() ? tplText() : "";
    paintComposer();
    hook("onTemplate", tpl.vals, tplDone());
  }
  function closeSlot() { if (composeTip) composeTip.style.visibility = ""; if (tplPop) { tplPop.remove(); tplPop = null; } $$(".tpl-slot.is-open").forEach(function (b) { b.classList.remove("is-open"); }); }
  // ouvre la case demandée, ou la première case vide
  function openSlot(p) {
    closeSlot();
    if (!tpl || !composeOn || busy) return;
    if (!p) p = tpl.parts.filter(function (x) { return typeof x !== "string" && !tpl.vals[x.k]; })[0];
    if (!p) return;
    var b = tpl.el.querySelector('.tpl-slot[data-k="' + p.k + '"]');
    if (!b) return;
    b.classList.add("is-open");
    if (composeTip) composeTip.style.visibility = "hidden";
    tplPop = h('<div class="tpl-pop" role="dialog"><p class="tpl-t"></p><div class="tpl-opts"></div><form class="tpl-own"><input type="text" maxlength="60" placeholder="Ou écrivez votre réponse…"><button type="submit">OK</button></form></div>');
    tplPop.querySelector(".tpl-t").textContent = p.label;
    p.opts.forEach(function (o) {
      var c = document.createElement("button");
      c.type = "button";
      c.textContent = o;
      if (tpl.vals[p.k] === o) c.className = "is-on";
      c.onclick = function () { choose(p, o); };
      tplPop.querySelector(".tpl-opts").appendChild(c);
    });
    tplPop.querySelector("form").onsubmit = function (e) { e.preventDefault(); var v = this.querySelector("input").value.trim(); if (v) choose(p, v); };
    document.body.appendChild(tplPop);
    var r = b.getBoundingClientRect();
    tplPop.style.left = Math.max(8, Math.min(window.innerWidth - tplPop.offsetWidth - 8, r.left + r.width / 2 - tplPop.offsetWidth / 2)) + "px";
    tplPop.style.top = Math.max(8, r.top - tplPop.offsetHeight - 12) + "px";
  }
  function choose(p, v) {
    tpl.vals[p.k] = v;
    closeSlot();
    paintTemplate();
    if (tplDone() && composeTip) composeTip.textContent = "Tout est prêt : envoyez (flèche ou Entrée)";
  }
  function clearTemplate() {
    closeSlot();
    if (tpl) tpl.el.remove();
    tpl = null;
    composer.classList.remove("has-tpl");
    paintComposer();
  }
  document.addEventListener("pointerdown", function (e) { if (tplPop && !e.target.closest(".tpl-pop, .tpl-slot")) closeSlot(); });
  document.addEventListener("keydown", function (e) {
    if (!tpl || !composeOn || e.target.closest(".tpl-pop")) return;
    if (e.target.closest("button, input, textarea, select, a") && !e.target.closest(".composer")) return;
    if (e.key === "Escape") closeSlot();
    if (e.key === "Enter" && tplDone() && !busy) { e.preventDefault(); composer.requestSubmit(); }
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
  });
  input.addEventListener("input", function () {
    autosize();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { typingTimer = null; orbMood(); }, 1400);
    orbMood();
    hook("onType");
  });
  attachBtn.addEventListener("click", function (e) {
    if (e.target.closest(".spot-badge") || attachBtn.disabled) return;
    $("[data-attach-chip]").hidden = false;
    hook("onAttach");
  });
  $("[data-attach-remove]").addEventListener("click", function () { $("[data-attach-chip]").hidden = true; });

  /* ---------- Pastilles et repères sur l'interface de Claude ---------- */

  var REPERES = [
    ["input", "Zone de saisie", "Vous y écrivez votre message, comme dans une messagerie.", false],
    ["slash", "Commandes « / »", "Tapez « / » au début du champ pour afficher des commandes supplémentaires.", true],
    ["attach", "Bouton « + »", "Ajoute un fichier ou une image à votre message, et donne accès à d’autres options.", false],
    ["send", "Envoyer", "La flèche envoie le message. La touche Entrée aussi.", false],
    ["new", "Nouvelle conversation", "Un nouveau sujet ? Repartez d’une page blanche.", false]
  ];
  var tipEl = null, repSeen = [], repCard = null, demoRecents = false;
  function clearSpots() {
    $$(".spot-badge").forEach(function (b) { b.remove(); });
    $$(".is-spot").forEach(function (b) { b.classList.remove("is-spot"); });
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }
  function badge(fn, label, onClick, left) {
    var z = $(".app [data-fn='" + fn + "']");
    if (!z) return null;
    // calque fixe au-dessus de toute l'interface : jamais rognée ni atténuée
    var b = h('<button type="button" class="spot-badge"></button>');
    b.textContent = label;
    b._zone = z;
    b._left = !!left;
    if (onClick) b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); onClick(b); });
    else b.style.pointerEvents = "none";
    document.body.appendChild(b);
    placeBadges();
    return b;
  }
  var badgeRaf = 0;
  function placeBadges() {
    cancelAnimationFrame(badgeRaf);
    var list = $$(".spot-badge");
    if (!list.length) return;
    list.forEach(function (b) {
      var r = b._zone.getBoundingClientRect();
      b.style.visibility = r.width ? "" : "hidden";
      var x = b._left ? r.left - 12 : r.right - 16, y = b._left ? r.top - 14 : r.top < 30 ? r.bottom - 12 : r.top - 16;
      b.style.left = Math.max(6, Math.min(window.innerWidth - 34, x)) + "px";
      b.style.top = Math.max(6, Math.min(window.innerHeight - 34, y)) + "px";
    });
    badgeRaf = requestAnimationFrame(placeBadges);
  }
  function showTip(b, title, text) {
    if (tipEl) tipEl.remove();
    tipEl = h('<div class="spot-tip" role="status"><button type="button" class="spot-x" aria-label="Fermer">×</button><b></b><span></span></div>');
    tipEl.querySelector("b").textContent = title;
    tipEl.lastChild.textContent = text;
    tipEl.firstChild.onclick = function () { if (tipEl) { tipEl.remove(); tipEl = null; } };
    document.body.appendChild(tipEl);
    var rc = b.getBoundingClientRect();
    tipEl.style.left = Math.max(8, Math.min(window.innerWidth - 270, rc.left - 20)) + "px";
    tipEl.style.top = (rc.bottom + 8 + tipEl.offsetHeight > window.innerHeight ? rc.top - tipEl.offsetHeight - 8 : rc.bottom + 8) + "px";
  }
  document.addEventListener("click", function (e) { if (tipEl && !e.target.closest(".spot-badge, .spot-tip")) { tipEl.remove(); tipEl = null; } });
  function spot(fn) { var z = $(".app [data-fn='" + fn + "']"); if (z) z.classList.add("is-spot"); }

  /* ---------- Moteur du parcours ---------- */

  var SEQS = ["Le problème", "Les cinq briques", "Construire", "En autonomie", "Bilan"];
  function act(id) { return P.act[id] || (P.act[id] = {}); }
  function st() { return STEPS[P.i]; }
  function hook(name) {
    var s = st(), args = Array.prototype.slice.call(arguments, 1);
    if (s && s[name]) s[name].apply(s, args);
  }
  var autoTimer = null, renderScroll = 0;
  function go(i) {
    var cur = st();
    if (cur && cur.leave) cur.leave();
    clearTimeout(autoTimer);
    clearSpots();
    clearTemplate();
    compose(false);
    attachBtn.disabled = true;
    P.i = Math.max(0, Math.min(STEPS.length - 1, i));
    markT = S.sound && STEPS[P.i].audio ? 0 : 999;
    split.classList.toggle("panel-full", !!STEPS[P.i].full);     // bilan : le panneau passe en plein écran
    app.classList.toggle("is-full", !!STEPS[P.i].full);
    render(true);
    var s = st();
    if (s.enter) s.enter();
    narrate({ audio: s.audio || null, text: s.say });
  }
  function next() { go(P.i + 1); }
  function autoNext(delay) { clearTimeout(autoTimer); autoTimer = setTimeout(next, delay || 2600); }

  function render(fresh) {
    var s = st();
    var y = bodyEl.scrollTop;
    bodyEl.innerHTML = "";
    var pv = h('<div class="pv' + (s.compact ? " is-compact" : "") + (s.cover ? " is-cover" : "") + '"></div>'), side = pv;
    if (s.portrait) {
      var hero = h('<div class="pv-hero"><img class="pv-hero-img" alt=""><div class="pv-hero-main"></div></div>');
      hero.firstChild.src = s.portrait[0];
      hero.firstChild.alt = s.portrait[1];
      pv.appendChild(hero);
      side = hero.lastChild;
    }
    if (!s.bare) {
      side.appendChild(h('<h1 class="pv-h1">' + esc(s.title) + "</h1>"));
      side.appendChild(h('<span class="pv-rule"></span>'));
    }
    s.render(pv, side);
    if (!fresh) Array.prototype.forEach.call(pv.children, function (c) { if (!c.classList.contains("is-new")) c.style.animation = "none"; });
    bodyEl.appendChild(pv);
    syncMarks(markT);
    bodyEl.scrollTop = fresh ? 0 : y;
    $("[data-prog]").style.width = ((P.i + 1) / STEPS.length * 100) + "%";
    paintNext();
  }
  function refresh() { render(false); }
  var backBtn = $("[data-back]"), quitBtn = $("[data-quit]");
  quitBtn.addEventListener("click", quit);
  // Quitter : signale la fin à la plateforme (SCORM 1.2 ou 2004) si elle est présente, puis ferme la fenêtre
  function findApi(name) {
    for (var w = window, n = 0; w && n < 8; n++) {
      try { if (w[name]) return w[name]; } catch (e) { return null; }
      if (w.parent && w.parent !== w) w = w.parent; else if (w.opener) w = w.opener; else break;
    }
    return null;
  }
  function quit() {
    stopVoice();
    var snap = window.AtelierTracking.snapshot(), pct = Math.round(snap.score / snap.max * 100);
    var api12 = findApi("API"), api04 = findApi("API_1484_11");
    try {
      if (api04) {
        api04.SetValue("cmi.score.scaled", String(snap.score / snap.max));
        api04.SetValue("cmi.score.raw", String(snap.score)); api04.SetValue("cmi.score.min", "0"); api04.SetValue("cmi.score.max", String(snap.max));
        api04.SetValue("cmi.completion_status", "completed");
        api04.SetValue("cmi.success_status", snap.validated ? "passed" : "failed");
        api04.SetValue("cmi.exit", "normal");
        api04.Commit(""); api04.Terminate("");
      } else if (api12) {
        api12.LMSSetValue("cmi.core.score.raw", String(pct)); api12.LMSSetValue("cmi.core.score.min", "0"); api12.LMSSetValue("cmi.core.score.max", "100");
        api12.LMSSetValue("cmi.core.lesson_status", snap.validated ? "passed" : "failed");
        api12.LMSCommit(""); api12.LMSFinish("");
      }
    } catch (e) {}
    try { window.top.close(); } catch (e) {}
    try { window.close(); } catch (e) {}
    setTimeout(function () { $("[data-end]").hidden = false; }, 250);
  }
  backBtn.addEventListener("click", function () { if (P.i > 0) go(P.i - 1); });
  function paintNext() {
    backBtn.hidden = P.i === 0;
    quitBtn.hidden = !st().full;
    var s = st(), p = s.primary ? s.primary() : { label: "Continuer", disabled: s.ready ? !s.ready() : false, run: next };
    if (!p) { nextBtn.hidden = true; return; }
    nextBtn.hidden = false;
    $("[data-next-label]").textContent = p.label;
    nextBtn.disabled = !!p.disabled;
    nextBtn.classList.toggle("is-success", !!p.success);
    nextBtn.onclick = function () { if (!p.disabled && p.run) p.run(); };
  }

  /* petits constructeurs de contenu */
  function lead(pv, html) { pv.appendChild(h('<p class="pv-lead">' + html + "</p>")); }
  function fbNew(pv, kind, html) { fb(pv, kind, html); pv.lastChild.classList.add("is-new", "fb-pop"); }
  function fb(pv, kind, html) {
    var icon = kind === "ok" ? "check" : kind === "ko" ? "bulb" : "info";
    pv.appendChild(h('<p class="pv-fb' + (kind ? " is-" + kind : "") + '"><svg><use href="#i-' + icon + '"/></svg><span>' + html + "</span></p>"));
  }
  function stepsList(pv, items, curIdx) {
    var ol = h('<ol class="pv-steps"></ol>');
    items.forEach(function (it, k) {
      var li = h('<li><span class="n">' + (k < curIdx ? "✓" : k + 1) + '</span><div class="tx"></div></li>');
      li.classList.toggle("is-done", k < curIdx);
      li.classList.toggle("is-cur", k === curIdx);
      li.querySelector(".tx").innerHTML = it.html;
      if (it.act && k === curIdx) { var a = h('<div class="act"></div>'); it.act(a); li.querySelector(".tx").appendChild(a); }
      ol.appendChild(li);
    });
    pv.appendChild(ol);
  }
  function button(label, icon, onClick) {
    var b = h('<button type="button" class="pv-btn">' + (icon ? '<svg><use href="#i-' + icon + '"/></svg>' : "") + "<span></span></button>");
    b.lastChild.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  /* quiz à choix unique : 1 point, deux essais avant le corrigé */
  function quiz(id, q, opts, answer) {
    return {
      render: function (pv) {
        var a = act(id);
        a.tries = a.tries || [];
        pv.appendChild(h('<p class="pv-q"></p>')).textContent = q;
        var box = h('<div class="pv-opts" role="radiogroup"></div>');
        var checked = a.checked;
        opts.forEach(function (o, k) {
          var b = h('<button type="button" class="qo" role="radio"><span class="r"></span><span><b>' + "ABC"[k] + ".</b> " + esc(o[0]) + "</span></button>");
          var chosen = checked ? a.tries[a.tries.length - 1] === k : a.sel === k;
          b.setAttribute("aria-checked", String(chosen && !checked));
          if (a.done && k === answer) b.classList.add("is-right");
          else if (checked && chosen) b.classList.add(k === answer ? "is-right" : "is-wrong");
          else if (a.done && a.tries.indexOf(k) >= 0) b.classList.add("is-wrong");
          else if (a.done) b.classList.add("is-dim");
          b.disabled = !!(checked || a.done);
          b.onclick = function () { a.sel = k; refresh(); };
          box.appendChild(b);
        });
        pv.appendChild(box);
        if (a.tries.length) {
          var last = a.tries[a.tries.length - 1], ok = last === answer;
          fb(pv, ok ? "ok" : "ko", "<b>" + (ok ? "Correct" : "À reprendre") + " :</b> " + esc(opts[last][1]));
          if (a.done && !ok) fb(pv, "", "<b>Correction :</b> " + "ABC"[answer] + ". " + esc(opts[answer][0]) + " · " + esc(opts[answer][1]));
        }
        if (checked && !a.done) {
          var l = h('<p class="pv-hint"></p>');
          l.appendChild(button("Voir la correction", "eye", function () { a.corrected = true; a.done = true; a.checked = false; refresh(); }));
          pv.appendChild(l);
        }
        pv.appendChild(h('<p class="pv-tries">1 point · essai ' + Math.min(a.tries.length + (a.done || checked ? 0 : 1), 2) + " sur 2</p>"));
      },
      primary: function () {
        var a = act(id);
        a.tries = a.tries || [];
        if (a.done) return { label: "Continuer", run: next, success: a.best === 1 };
        if (a.checked) return { label: "Réessayer", run: function () { a.checked = false; a.sel = null; refresh(); } };
        return { label: "Valider", disabled: a.sel === null || a.sel === undefined, run: function () {
          a.tries.push(a.sel);
          var ok = a.sel === answer;
          a.best = ok ? 1 : (a.best || 0);
          a.checked = true;
          if (ok || a.tries.length >= 2) { a.done = true; a.checked = ok; }
          refresh();
          if (ok) autoNext(2600);
        } };
      }
    };
  }
  function extend(base, more) { Object.keys(more).forEach(function (k) { base[k] = more[k]; }); return base; }

  /* ---------- Activités interactives ---------- */

  // essais : "done" quand réussi ou après deux essais ; "checked" entre deux essais
  function triesLine() {}
  function triesLineOld(pv, a, pts, max) {
    pv.appendChild(h('<p class="pv-tries">' + pts + " point" + (pts > 1 ? "s" : "") + " · essai " + Math.min((a.tries || []).length + (a.done || a.checked ? 0 : 1), max || 2) + " sur " + (max || 2) + "</p>"));
  }

  // glisser à la souris ou au doigt ; un simple clic sélectionne (alternative au glisser)
  function dragify(el, onDrop, onTap) {
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var sx = e.clientX, sy = e.clientY, ghost = null, over = null, r = el.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);
      function target(x, y) {
        if (ghost) ghost.style.visibility = "hidden";
        var t = document.elementFromPoint(x, y);
        if (ghost) ghost.style.visibility = "";
        return t ? t.closest(".dd-bucket, .dd-pool") : null;
      }
      function move(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!ghost && Math.abs(dx) + Math.abs(dy) < 7) return;
        if (!ghost) {
          ghost = el.cloneNode(true);
          ghost.classList.add("dd-ghost");
          ghost.style.width = r.width + "px";
          document.body.appendChild(ghost);
          el.classList.add("is-dragging");
        }
        ghost.style.transform = "translate(" + (r.left + dx) + "px," + (r.top + dy) + "px) rotate(" + Math.max(-6, Math.min(6, dx / 30)) + "deg)";
        var t = target(ev.clientX, ev.clientY);
        if (t !== over) { if (over) over.classList.remove("is-over"); over = t; if (over) over.classList.add("is-over"); }
      }
      function up(ev) {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (over) over.classList.remove("is-over");
        if (!ghost) { onTap(); return; }
        var t = target(ev.clientX, ev.clientY);
        ghost.remove();
        el.classList.remove("is-dragging");
        if (t) onDrop(t.classList.contains("dd-bucket") ? t.dataset.key : null);
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  // cartes à déposer dans des zones (glisser-déposer)
  function dragDrop(id, cfg) {
    var n = cfg.items.length;
    return {
      render: function (pv) {
        var a = act(id);
        a.place = a.place || {}; a.tries = a.tries || [];
        var locked = a.done || a.checked;
        var wrap = h('<div class="dd"><div class="dd-pool"><p class="dd-h">Cartes à placer</p></div><div class="dd-buckets"></div></div>');
        var pool = wrap.firstChild, bk = wrap.lastChild;
        cfg.buckets.forEach(function (b) {
          var el = h('<div class="dd-bucket"><div class="dd-bh"><span class="ic"><svg><use href="#i-' + b[3] + '"/></svg></span><div><b></b><small></small></div></div><div class="dd-slot"></div></div>');
          el.dataset.key = b[0];
          el.querySelector("b").textContent = b[1];
          el.querySelector("small").textContent = b[2];
          el.addEventListener("click", function (e) {
            if (locked || a.sel === null || a.sel === undefined || e.target.closest(".dd-card")) return;
            a.place[a.sel] = b[0]; a.sel = null; refresh();
          });
          bk.appendChild(el);
        });
        cfg.items.forEach(function (it, k) {
          var c = h('<button type="button" class="dd-card"></button>');
          c.textContent = it[0];
          var at = a.place[k], good = a.good && a.good[k];
          if ((locked && at) || good) c.classList.add(at === it[1] ? "is-good" : "is-bad");
          if (a.sel === k) c.classList.add("is-sel");
          c.disabled = !!locked || !!good;
          (at ? bk.querySelector('[data-key="' + at + '"] .dd-slot') : pool).appendChild(c);
          if (!c.disabled) dragify(c, function (key) {
            if (key) a.place[k] = key; else delete a.place[k];
            a.sel = null; refresh();
          }, function () { a.sel = a.sel === k ? null : k; refresh(); });
        });
        if (pool.children.length === 1) pool.appendChild(h('<p class="dd-empty">Toutes les cartes sont placées.</p>'));
        pv.appendChild(wrap);
        if (!locked && a.sel !== null && a.sel !== undefined) pv.appendChild(h('<p class="pv-hint">Carte sélectionnée : cliquez maintenant sur la bonne zone.</p>'));
        if (a.tries.length) {
          var last = a.tries[a.tries.length - 1];
          fb(pv, last === n ? "ok" : "ko", last === n ? "<b>Réussi :</b> " + n + " cartes bien placées sur " + n + "." : "<b>À reprendre :</b> " + last + " carte" + (last > 1 ? "s" : "") + " bien placée" + (last > 1 ? "s" : "") + " sur " + n + ". Les cartes en rouge sont à déplacer.");
        }
        if (a.done && a.best < n) fb(pv, "", "<b>Correction :</b> " + cfg.items.map(function (it) { return esc(it[0]) + " → " + esc(cfg.buckets.filter(function (b) { return b[0] === it[1]; })[0][1]); }).join(" · "));
        if (cfg.after) cfg.after(pv, a);
        triesLine(pv, a, n);
      },
      primary: function () {
        var a = act(id);
        a.place = a.place || {}; a.tries = a.tries || [];
        if (a.done) return { label: "Continuer", run: next, success: a.best === n };
        if (a.checked) return { label: "Réessayer", run: function () {
          a.good = {};
          cfg.items.forEach(function (it, k) { if (a.place[k] === it[1]) a.good[k] = true; else delete a.place[k]; });
          a.checked = false; refresh();
        } };
        return { label: "Valider", disabled: Object.keys(a.place).length < n, run: function () {
          var score = cfg.items.filter(function (it, k) { return a.place[k] === it[1]; }).length;
          a.tries.push(score);
          a.best = Math.max(a.best || 0, score);
          if (score === n || a.tries.length >= 2) a.done = true; else a.checked = true;
          refresh();
          if (score === n) autoNext(3000);
        } };
      }
    };
  }

  // cartes à balayer : à droite = vrai, à gauche = faux
  function swipe(id, cards) {
    var swKey = null;
    function decide(v) {
      var a = act(id), k = a.res.length, card = $(".sw-card.is-top", bodyEl);
      if (k >= cards.length || a.anim) return;
      a.anim = true;
      a.res.push({ v: v, ok: v === cards[k][1] });
      a.best = a.res.filter(function (r) { return r.ok; }).length;
      if (card) { card.style.transition = "transform .38s var(--ease), opacity .38s"; card.style.transform = "translateX(" + (v ? 130 : -130) + "%) rotate(" + (v ? 16 : -16) + "deg)"; card.style.opacity = "0"; }
      setTimeout(function () { a.anim = false; refresh(); }, 360);
    }
    return {
      render: function (pv) {
        var a = act(id);
        a.res = a.res || [];
        var k = a.res.length;
        var stack = h('<div class="sw-stack"></div>');
        if (k < cards.length) {
          for (var j = Math.min(cards.length - 1, k + 2); j >= k; j--) {
            var c = h('<div class="sw-card"><div class="sw-head"><span class="sw-q">“</span><span class="sw-n"></span></div><p></p><div class="sw-foot"><span>← Faux</span><span>Vrai →</span></div><span class="sw-lab no"><svg><use href="#i-x"/></svg>Faux</span><span class="sw-lab yes"><svg><use href="#i-check"/></svg>Vrai</span></div>');
            c.querySelector(".sw-n").textContent = (j + 1) + " / " + cards.length;
            c.querySelector("p").textContent = cards[j][0];
            if (j === k) c.classList.add("is-top"); else c.classList.add("is-under", "u" + (j - k));
            stack.appendChild(c);
          }
          pv.appendChild(stack);
          var top = stack.lastChild;
          top.addEventListener("pointerdown", function (e) {
            var sx = e.clientX, dx = 0;
            top.setPointerCapture(e.pointerId);
            top.style.transition = "none";
            function move(ev) {
              dx = ev.clientX - sx;
              top.style.transform = "translateX(" + dx + "px) rotate(" + dx / 18 + "deg)";
              top.querySelector(".yes").style.opacity = Math.max(0, Math.min(1, dx / 90));
              top.querySelector(".no").style.opacity = Math.max(0, Math.min(1, -dx / 90));
              top.style.setProperty("--tint", dx > 0 ? "26, 154, 90" : "217, 54, 54");
              top.style.setProperty("--ta", Math.min(.14, Math.abs(dx) / 900));
            }
            function up() {
              top.removeEventListener("pointermove", move);
              top.removeEventListener("pointerup", up);
              top.removeEventListener("pointercancel", up);
              if (Math.abs(dx) > 90) { decide(dx > 0); return; }
              top.style.transition = "transform .3s var(--ease)";
              top.style.transform = "";
              top.style.setProperty("--ta", 0);
              $$(".sw-lab", top).forEach(function (l) { l.style.opacity = ""; });
            }
            top.addEventListener("pointermove", move);
            top.addEventListener("pointerup", up);
            top.addEventListener("pointercancel", up);
          });
          var btns = h('<div class="sw-btns"><button type="button" class="sw-b no"><svg><use href="#i-back"/></svg>Faux</button><span>ou glissez la carte</span><button type="button" class="sw-b yes">Vrai<svg><use href="#i-arrow"/></svg></button></div>');
          btns.firstChild.onclick = function () { decide(false); };
          btns.lastChild.onclick = function () { decide(true); };
          pv.appendChild(btns);
        }
        if (k) {
          var last = a.res[k - 1];
          fbNew(pv, last.ok ? "ok" : "ko", "<b>" + (last.ok ? "Bien vu, c’est " : "Eh non, c’est ") + (cards[k - 1][1] ? "vrai" : "faux") + ".</b> " + esc(cards[k - 1][2]));
        }
        if (k === cards.length) {
          var ul = h('<ul class="sw-recap is-new"></ul>');
          cards.forEach(function (cd, j) {
            var li = h('<li><span class="st"></span><span></span></li>');
            li.firstChild.textContent = a.res[j].ok ? "✓" : "✗";
            li.firstChild.classList.add(a.res[j].ok ? "ok" : "ko");
            li.lastChild.textContent = cd[0] + " — " + (cd[1] ? "vrai" : "faux");
            ul.appendChild(li);
          });
          pv.appendChild(ul);
          pv.appendChild(h('<p class="pv-tries">' + a.best + " bonne" + (a.best > 1 ? "s" : "") + " réponse" + (a.best > 1 ? "s" : "") + " sur " + cards.length + "</p>"));
        }
      },
      ready: function () { var a = act(id); return a.res && a.res.length === cards.length; },
      enter: function () {
        swKey = function (e) {
          if (e.target.closest("input, textarea")) return;
          if (e.key === "ArrowRight") decide(true);
          if (e.key === "ArrowLeft") decide(false);
        };
        document.addEventListener("keydown", swKey);
      },
      leave: function () { document.removeEventListener("keydown", swKey); }
    };
  }

  // cliquer dans l'ordre : du plus simple au plus détaillé
  function orderUp(id, items, shown) {
    return {
      render: function (pv) {
        var a = act(id);
        a.seq = a.seq || []; a.tries = a.tries || [];
        var locked = a.done || a.checked;
        var box = h('<div class="ord"></div>');
        shown.forEach(function (k) {
          var pos = a.seq.indexOf(k);
          var b = h('<button type="button" class="ord-card"><span class="ord-n"></span><span class="ord-t"></span></button>');
          b.querySelector(".ord-t").textContent = "« " + items[k] + " »";
          b.querySelector(".ord-n").textContent = pos >= 0 ? pos + 1 : "";
          if (pos >= 0) b.classList.add("is-on");
          if (locked && pos >= 0) b.classList.add(pos === k ? "is-good" : "is-bad");
          b.disabled = !!locked;
          b.onclick = function () {
            if (pos >= 0) { if (pos === a.seq.length - 1) a.seq.pop(); else a.seq = a.seq.slice(0, pos); }
            else a.seq.push(k);
            refresh();
          };
          box.appendChild(b);
        });
        pv.appendChild(box);
        if (a.tries.length) {
          var ok = a.tries[a.tries.length - 1];
          fb(pv, ok ? "ok" : "ko", ok ? "<b>Réussi :</b> plus on donne de précisions, plus la réponse sera adaptée. Les trois restent des prompts." : "<b>À reprendre :</b> comparez la quantité de précisions dans chaque prompt.");
        }
        if (a.done && !a.best) fb(pv, "", "<b>Correction :</b> " + items.map(function (t, k) { return (k + 1) + ". « " + esc(t) + " »"; }).join(" · "));
        triesLine(pv, a, 1);
      },
      primary: function () {
        var a = act(id);
        a.seq = a.seq || []; a.tries = a.tries || [];
        if (a.done) return { label: "Continuer", run: next, success: a.best === 1 };
        if (a.checked) return { label: "Réessayer", run: function () { a.seq = []; a.checked = false; refresh(); } };
        return { label: "Valider", disabled: a.seq.length < items.length, run: function () {
          var ok = a.seq.every(function (k, i) { return k === i; });
          a.tries.push(ok);
          a.best = ok ? 1 : (a.best || 0);
          if (ok || a.tries.length >= 2) a.done = true; else a.checked = true;
          refresh();
          if (ok) autoNext(3000);
        } };
      }
    };
  }

  // étiquettes à cocher (plusieurs bonnes réponses)
  function pickMany(id, items, okText) {
    var goodCount = items.filter(function (x) { return x[1]; }).length;
    return {
      render: function (pv) {
        var a = act(id);
        a.sel = a.sel || {}; a.tries = a.tries || [];
        var locked = a.done || a.checked;
        var box = h('<div class="pick"></div>');
        items.forEach(function (it, k) {
          var b = h('<button type="button" class="pick-b"><span class="pick-c"><svg><use href="#i-check"/></svg></span><span></span></button>');
          b.lastChild.textContent = it[0];
          b.setAttribute("aria-pressed", String(!!a.sel[k]));
          if (locked && a.sel[k]) b.classList.add(it[1] ? "is-good" : "is-bad");
          if (a.done && it[1] && !a.sel[k]) b.classList.add("is-miss");
          b.disabled = !!locked;
          b.onclick = function () { a.sel[k] = !a.sel[k]; refresh(); };
          box.appendChild(b);
        });
        pv.appendChild(box);
        if (a.tries.length) {
          var ok = a.tries[a.tries.length - 1];
          fb(pv, ok ? "ok" : "ko", ok ? okText : "<b>À reprendre :</b> gardez seulement ce que l’IA ne pouvait pas deviner, et qui change vraiment la réponse.");
        }
        if (a.done && !a.best) fb(pv, "", "<b>Correction :</b> " + items.filter(function (x) { return x[1]; }).map(function (x) { return esc(x[0]); }).join(" · "));
        triesLine(pv, a, 1);
      },
      primary: function () {
        var a = act(id);
        a.sel = a.sel || {}; a.tries = a.tries || [];
        if (a.done) return { label: "Continuer", run: next, success: a.best === 1 };
        if (a.checked) return { label: "Réessayer", run: function () {
          items.forEach(function (it, k) { if (!it[1]) delete a.sel[k]; });
          a.checked = false; refresh();
        } };
        var nSel = Object.keys(a.sel).filter(function (k) { return a.sel[k]; }).length;
        return { label: "Valider", disabled: !nSel, run: function () {
          var ok = items.every(function (it, k) { return !!a.sel[k] === it[1]; });
          a.tries.push(ok);
          a.best = ok ? 1 : (a.best || 0);
          if (ok || a.tries.length >= 2) a.done = true; else a.checked = true;
          refresh();
          if (ok) autoNext(3200);
        } };
      },
      count: goodCount
    };
  }

  // relier : un élément à gauche, puis sa réponse à droite (des courbes apparaissent)
  var redrawLinks = null;
  function relier(id, cfg) {
    var n = cfg.left.length;
    function draw(m, a, locked) {
      var svg = m.querySelector(".pv-lines"), box = m.getBoundingClientRect();
      svg.innerHTML = "";
      Object.keys(a.links).forEach(function (k) {
        var nb = m.querySelector('.mc[data-k="' + k + '"]'), fbn = m.querySelector('.mc[data-fn="' + a.links[k] + '"]');
        if (!nb || !fbn) return;
        var r1 = nb.getBoundingClientRect(), r2 = fbn.getBoundingClientRect();
        var x1 = r1.right - box.left - 12, y1 = r1.top + r1.height / 2 - box.top, x2 = r2.left - box.left + 12, y2 = r2.top + r2.height / 2 - box.top, dx = (x2 - x1) * .55;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2);
        var good = a.links[k] === cfg.left[k][1];
        path.setAttribute("stroke", locked ? (good ? "#1a9a5a" : "#d93636") : cfg.colors[a.links[k]]);
        svg.appendChild(path);
        path.style.setProperty("--len", path.getTotalLength());
        if (a.drawn && a.drawn[k] === a.links[k]) { path.style.animation = "none"; path.style.strokeDashoffset = 0; }
      });
      a.drawn = JSON.parse(JSON.stringify(a.links));
    }
    return {
      render: function (pv) {
        var a = act(id);
        a.links = a.links || {}; a.tries = a.tries || [];
        if (a.sel === undefined) a.sel = 0;
        var locked = a.done || a.checked;
        var m = h('<div class="pv-match"><svg class="pv-lines"></svg><div class="pv-col need"><h3></h3></div><div class="pv-col fn"><h3></h3></div></div>');
        m.children[1].firstChild.textContent = cfg.heads[0];
        m.children[2].firstChild.textContent = cfg.heads[1];
        cfg.left.forEach(function (n2, k) {
          var b = h('<button type="button" class="mc"><span></span><span class="dot"></span></button>');
          b.firstChild.textContent = n2[0];
          b.dataset.k = k;
          var fn = a.links[k];
          if (fn) { b.classList.add("is-linked"); b.style.setProperty("--c", cfg.colors[fn]); }
          if (a.sel === k && !locked) b.classList.add("is-sel");
          if ((locked && fn) || (a.good && a.good[k])) { b.classList.add(fn === n2[1] ? "is-good" : "is-bad"); b.style.setProperty("--c", fn === n2[1] ? "#1a9a5a" : "#d93636"); }
          b.disabled = !!locked || !!(a.good && a.good[k]);
          b.onclick = function () { a.sel = k; refresh(); };
          m.children[1].appendChild(b);
        });
        cfg.right.forEach(function (f) {
          var b = h('<button type="button" class="mc fn"><span class="dot"></span><span></span></button>');
          b.lastChild.textContent = f[1];
          b.dataset.fn = f[0];
          var from = Object.keys(a.links).filter(function (k) { return a.links[k] === f[0]; })[0];
          if (from !== undefined) {
            b.classList.add("is-linked"); b.style.setProperty("--c", cfg.colors[f[0]]);
            if (locked || (a.good && a.good[from])) { var ok = cfg.left[from][1] === f[0]; b.classList.add(ok ? "is-good" : "is-bad"); b.style.setProperty("--c", ok ? "#1a9a5a" : "#d93636"); }
          }
          b.disabled = !!locked;
          b.onclick = function () {
            if (a.sel === null || a.sel === undefined) { toast("Choisissez d’abord un élément, à gauche."); return; }
            Object.keys(a.links).forEach(function (k) { if (a.links[k] === f[0] && !(a.good && a.good[k])) delete a.links[k]; });
            a.links[a.sel] = f[0];
            var nk = cfg.left.map(function (x, k) { return k; }).filter(function (k) { return !a.links[k]; })[0];
            a.sel = nk === undefined ? null : nk;
            refresh();
          };
          m.children[2].appendChild(b);
        });
        pv.appendChild(m);
        redrawLinks = function () { draw(m, a, locked); };
        requestAnimationFrame(redrawLinks);
        if (a.tries.length) {
          var last = a.tries[a.tries.length - 1];
          fb(pv, last === n ? "ok" : "ko", last === n ? "<b>Réussi :</b> " + n + " associations exactes sur " + n + "." : "<b>À reprendre :</b> " + last + " association" + (last > 1 ? "s" : "") + " exacte" + (last > 1 ? "s" : "") + " sur " + n + ".");
        }
        if (a.done && a.best < n) fb(pv, "", "<b>Correction :</b> " + cfg.left.map(function (x) { return esc(x[0]) + " → " + esc(cfg.right.filter(function (f) { return f[0] === x[1]; })[0][1]); }).join(" · "));
        triesLine(pv, a, n);
      },
      primary: function () {
        var a = act(id);
        a.links = a.links || {}; a.tries = a.tries || [];
        if (a.done) return { label: "Continuer", run: next, success: a.best === n };
        if (a.checked) return { label: "Réessayer", run: function () {
          a.good = {};
          Object.keys(a.links).forEach(function (k) { if (a.links[k] === cfg.left[k][1]) a.good[k] = true; else delete a.links[k]; });
          a.sel = cfg.left.map(function (x, k) { return k; }).filter(function (k) { return !a.links[k]; })[0];
          a.checked = false; refresh();
        } };
        return { label: "Valider", disabled: Object.keys(a.links).length < n, run: function () {
          var score = cfg.left.filter(function (x, k) { return a.links[k] === x[1]; }).length;
          a.tries.push(score);
          a.best = Math.max(a.best || 0, score);
          a.sel = null;
          if (score === n || a.tries.length >= 2) a.done = true; else a.checked = true;
          refresh();
          if (score === n) autoNext(3000);
        } };
      },
      leave: function () { redrawLinks = null; }
    };
  }
  window.addEventListener("resize", function () { if (redrawLinks) redrawLinks(); });

  function suggestions(pv, label, list) {
    var box = h('<div class="pv-sugg"><p></p><div class="pv-chips"></div></div>');
    box.firstChild.textContent = label;
    list.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.onclick = function () { insert(t); };
      box.lastChild.appendChild(b);
    });
    pv.appendChild(box);
  }

  /* ---------- Situation (fictive) : l'offre d'emploi ---------- */

  var BRIEF = [
    "Peux-tu préparer l’offre d’emploi pour le poste d’assistant·e administratif·ve ?",
    "CDI, 35 h. Bureaux à Lyon 7e, télétravail 1 jour par semaine.",
    "Salaire : 24 à 26 k€ brut par an, selon profil. Débutants bienvenus.",
    "Prise de poste le 3 mars. Candidatures jusqu’au 15 février.",
    "Merci ! Sophie"
  ];
  var INVENTS = [["Paris", 1], ["3 500 € brut par mois", 1], ["13e mois", 1], ["gestion du courrier", 0], ["maîtrise des outils bureautiques", 0]];

  var RESULT_STEP = {
      id: "resultat", seq: 4, title: "Votre résultat", full: true, bare: true,
      audio: "module-2/resultat", say: "Voici votre résultat, activité par activité. Si une activité n’est pas réussie, vous pouvez la revoir.",
      render: function (pv) {
        var items = scoreItems(), total = items.reduce(function (s2, x) { return s2 + x.pts; }, 0), ok = total / MAX >= 0.7;
        P.validated = ok;
        var C = 2 * Math.PI * 74;
        var res = h('<div class="res"><div class="res-top"><div class="res-ring' + (ok ? " is-ok" : "") + '"><svg viewBox="0 0 168 168"><circle class="bg" cx="84" cy="84" r="74"/><circle class="fg" cx="84" cy="84" r="74"/></svg><div class="res-num"><span><b>0</b><small>sur ' + MAX + '</small></span></div></div>' +
          '<div class="res-msg"><span class="res-badge ' + (ok ? "ok" : "ko") + '">' + (ok ? "✓ Module validé" : "Seuil de validation : 70 %") + "</span><h2>" + (ok ? "Vos prompts ont de la structure !" : "Encore un petit effort") + "</h2><p>" + (ok ? "Rôle, cible, objectif, contexte, format : vous savez les assembler." : "Revoyez les activités indiquées, puis revenez ici.") + '</p></div></div><ul class="res-list"></ul></div>');
        var fg = res.querySelector(".fg");
        fg.style.strokeDasharray = C;
        fg.style.strokeDashoffset = C;
        var ul = res.querySelector(".res-list"), bars = [];
        items.forEach(function (it, k) {
          var li = h('<li><span></span><span class="res-bar"><i></i></span><span class="res-pts"></span><span class="res-act"></span></li>');
          li.firstChild.textContent = it.label;
          li.querySelector(".res-pts").textContent = fmt(it.pts) + " / " + it.max;
          li.style.animationDelay = (0.35 + k * 0.08) + "s";
          if (it.pts < it.max) { var b = h('<button type="button" class="pv-link">Revoir</button>'); b.onclick = function () { resetAct(it.id); go(it.idx); }; li.lastChild.appendChild(b); }
          bars.push([li.querySelector(".res-bar i"), it.pts / it.max]);
          ul.appendChild(li);
        });
        pv.appendChild(res);
        setTimeout(function () {
          fg.style.strokeDashoffset = C * (1 - total / MAX);
          bars.forEach(function (x, k) { setTimeout(function () { x[0].style.width = (x[1] * 100) + "%"; if (x[1] === 1) x[0].classList.add("full"); }, 350 + k * 80); });
          var num = res.querySelector(".res-num b"), t0 = performance.now();
          (function count(t) { var p = Math.min(1, ((t || performance.now()) - t0) / 1400); num.textContent = fmt(Math.round(total * (1 - Math.pow(1 - p, 3)) * 2) / 2); if (p < 1) requestAnimationFrame(count); })();
        }, 250);
      }
    };

  var STEPS = [
    /* 1 · Le problème --------------------------------------------------------------- */
    {
      id: "vague", seq: 0, title: "Une demande trop vague", audio: "module-2/vague",
      say: "Sophie, votre responsable, vous demande de rédiger une offre d’emploi. Premier réflexe : on demande directement à l’IA. La demande est prête dans le champ. Envoyez-la, et regardez le résultat.",
      render: function (pv) {
        var a = act("vague");
        lead(pv, "Sophie vous demande de rédiger une <b>offre d’emploi</b>. Premier réflexe : on demande directement à l’IA.");
        stepsList(pv, [
          { html: "La demande est prête dans le champ, à gauche : <b>envoyez-la</b>." },
          { html: "Lisez la réponse de l’IA." }
        ], a.done ? 2 : a.sent ? 1 : 0);
        if (a.done) fbNew(pv, "", "L’offre a l’air correcte… Mais d’où viennent la ville, le salaire et le 13e mois ? Vous ne les avez jamais donnés.");
      },
      ready: function () { return !!act("vague").done; },
      enter: function () {
        if (act("vague").done) return;
        newConv(); renderConv();
        template(["Écris une offre d’emploi pour un poste d’assistant administratif."]);
      },
      onSend: function () { act("vague").sent = true; compose(false); refresh(); },
      onAnswer: function (c) { act("vague").done = true; P.vagueConv = c.id; refresh(); }
    },

    /* 2 · Ce que l'IA a inventé (clic dans la réponse) ----------------------------------- */
    {
      id: "invente", seq: 0, title: "Ce que l’IA a inventé", audio: "module-2/invente",
      say: "L’IA ne connaît pas votre poste. Alors elle a comblé les trous. Dans sa réponse, à gauche, cliquez sur les trois informations qu’elle a inventées.",
      render: function (pv) {
        var a = act("invente");
        a.found = a.found || {};
        var n = Object.keys(a.found).length;
        lead(pv, "Dans la réponse, à gauche, <b>cliquez sur les 3 informations inventées</b> par l’IA. <span class='pv-count'>" + n + " / 3</span>");
        if (a.why && !a.done) fbNew(pv, "ko", a.why);
        if (a.done) fbNew(pv, "ok", "<b>Bien vu.</b> Sans informations, l’IA invente ce qui manque : une ville, un salaire, un avantage. Pour l’éviter, il faut lui donner un <b>contexte</b>, et plus largement une demande structurée.");
      },
      ready: function () { return !!act("invente").done; },
      enter: function () {
        var a = act("invente");
        if (P.vagueConv) openConv(P.vagueConv);
        setTimeout(function () {
          huntChat(INVENTS, function (txt, ok) {
            if (ok) { a.found[txt] = true; a.why = null; }
            else { a.miss = (a.miss || 0) + 1; a.why = "« " + esc(txt) + " » : c’est une tâche ou une compétence banale pour ce poste, pas une information inventée."; }
            if (Object.keys(a.found).length === 3 && !a.done) { a.done = true; a.best = (a.miss || 0) <= 1 ? 1 : 0; autoNext(5200); }
            refresh();
          }, a.found);
        }, 350);
      },
      leave: function () { unhuntChat(); }
    },

    /* 2 bis · Pourquoi ces inventions ? (QCM) --------------------------------------------- */
    extend({
      id: "pourquoi", seq: 0, title: "Pourquoi ces inventions ?", audio: "module-2/pourquoi",
      say: "Une question pour bien comprendre. Pourquoi l’IA a-t-elle inventé une ville, un salaire et un 13e mois ?"
    }, quiz("pourquoi", "Pourquoi l’IA a-t-elle inventé la ville, le salaire et le 13e mois ?", [
      ["Elle se trompe à chaque fois : il ne faut pas s’en servir.", "Non : avec les bonnes informations, elle fait un travail utile. Le problème vient de la demande."],
      ["On ne lui a donné aucun contexte : elle a comblé les trous.", "Exact : sans informations, l’IA complète avec ce qui lui semble plausible. D’où l’importance du contexte."],
      ["Elle a copié une vraie offre trouvée sur Internet.", "Non : elle a produit un texte plausible, pas une copie. Mais les détails ne viennent pas de vous."]
    ], 1)),

    /* 3 · Les cinq briques (cartes à retourner) ----------------------------------------- */
    extend({
      id: "briques", seq: 1, title: "Les cinq briques d’un prompt", audio: "module-2/briques",
      say: "Un bon prompt se construit avec cinq briques : le rôle, la cible, l’objectif, le contexte et le format. Retournez chaque carte pour découvrir à quoi elle sert."
    }, flipCards("briques", [
      ["R", "Rôle", "Qui l’IA doit-elle être ?", "« Tu es chargé·e de recrutement dans une PME. »"],
      ["C", "Cible", "Pour qui est le texte ?", "« …pour des candidats débutants. »"],
      ["O", "Objectif", "Que doit-il produire, et pourquoi ?", "« Rédige une offre qui donne envie de postuler. »"],
      ["C", "Contexte", "Quelles informations doit-il connaître ?", "« CDI, 35 h, Lyon, 24 à 26 k€… »"],
      ["F", "Format", "Sous quelle forme ?", "« 150 mots, 3 rubriques, ton chaleureux. »"]
    ])),

    /* 4 · Reconnaître les briques (relier) --------------------------------------------- */
    extend({
      id: "relier", seq: 1, title: "Reconnaître les briques", audio: "module-2/relier",
      say: "Voici un prompt découpé en morceaux. Reliez chaque morceau à la brique qui lui correspond."
    }, (function () {
      var B = "#1f5cf0";
      var w = relier("relier", {
        heads: ["Morceaux du prompt", "Briques"],
        left: [
          ["« Tu es chargé·e de recrutement »", "role"],
          ["« pour des candidats débutants »", "cible"],
          ["« Rédige une offre qui donne envie de postuler »", "obj"],
          ["« CDI, Lyon 7e, télétravail 1 jour par semaine »", "ctx"],
          ["« 150 mots, 3 rubriques, ton chaleureux »", "fmt"]
        ],
        right: [["ctx", "Contexte"], ["role", "Rôle"], ["fmt", "Format"], ["obj", "Objectif"], ["cible", "Cible"]],
        colors: { role: B, cible: B, obj: B, ctx: B, fmt: B }
      });
      var r = w.render;
      w.render = function (pv) { lead(pv, "<b>Cliquez sur un morceau, puis sur sa brique.</b>"); r(pv); };
      return w;
    })()),

    /* 5 · Quelle brique manque ? ------------------------------------------------------- */
    extend({
      id: "manque", seq: 1, title: "La brique oubliée",
      say: "Chacun de ces deux prompts a oublié une brique. Laquelle ?"
    }, whichMissing("manque", [
      ["Rédige une publication pour les abonnés de notre boulangerie, afin d’annoncer la nouvelle galette. En 3 phrases, ton gourmand.", "role", "Qui écrit ? Un community manager, par exemple."],
      ["Tu es juriste. Résume ce contrat en 5 points clairs, pour un nouveau salarié.", "ctx", "Le contrat n’est pas donné : rien à résumer."]
    ])),

    /* 6 · Le brief de Sophie, puis le prompt à construire ---------------------------------- */
    {
      id: "construire", seq: 2, title: "Construire le prompt", audio: "module-2/construire",
      say: "Voici le message de Sophie. À gauche, le prompt est prêt en cinq cases, une par brique. Cliquez sur chaque case orange, choisissez la bonne réponse ou écrivez la vôtre, puis envoyez.",
      render: function (pv) {
        var a = act("construire");
        var note = h('<div class="brief"><div class="brief-h"><span class="brief-av">S</span><div><b>Sophie Laurent</b><small>Responsable · aujourd’hui, 09:12</small></div></div></div>');
        BRIEF.forEach(function (l) { var p = document.createElement("p"); p.textContent = l; note.appendChild(p); });
        pv.appendChild(note);
        var chips = h('<div class="bk-row"></div>');
        BRICKS.forEach(function (b) {
          var on = a.vals && a.vals[b.k];
          var c = h('<span class="bk' + (on ? " is-on" : "") + '"><i></i></span>');
          c.appendChild(document.createTextNode(b.name));
          chips.appendChild(c);
        });
        pv.appendChild(chips);
        if (a.done) fbNew(pv, a.best === 5 ? "ok" : "", "<b>" + a.best + " brique" + (a.best > 1 ? "s" : "") + " bien choisie" + (a.best > 1 ? "s" : "") + " sur 5.</b> " + (a.best === 5 ? "Regardez la différence avec la première offre : rien n’est inventé." : "Comparez avec le brief de Sophie : les bonnes briques reprennent ses informations."));
      },
      ready: function () { return !!act("construire").done; },
      enter: function () {
        if (act("construire").done) return;
        var c = newConv(); c.title = "Offre d’emploi"; P.offreConv = c.id; renderConv();
        template([
          "Tu es ", { k: "role", label: "Rôle", opts: ["chargé·e de recrutement dans une PME", "poète", "avocat·e en droit du travail"] },
          ". Rédige une offre d’emploi pour ", { k: "cible", label: "Cible", opts: ["des candidats débutants ou en reconversion", "les clients de l’entreprise", "des experts avec 10 ans d’expérience"] },
          ", afin de ", { k: "obj", label: "Objectif", opts: ["donner envie de postuler", "présenter l’histoire de l’entreprise", "décourager les candidats"] },
          ". Contexte : ", { k: "ctx", label: "Contexte", opts: ["CDI, 35 h, Lyon 7e, télétravail 1 jour par semaine, 24 à 26 k€ brut par an", "CDD de 3 mois à Paris", "aucune précision"] },
          ". Format : ", { k: "fmt", label: "Format", opts: ["environ 150 mots, 3 rubriques (missions, profil, avantages), ton chaleureux", "un poème en alexandrins", "10 pages détaillées"] }, "."
        ]);
      },
      onTemplate: function (vals) { act("construire").vals = JSON.parse(JSON.stringify(vals)); refresh(); },
      onSend: function () {
        var a = act("construire"), v = a.vals || {};
        var good = { role: /recrutement|rh|ressources humaines/i, cible: /débutant|reconversion|candidat/i, obj: /postuler|candidat|attir/i, ctx: /cdi|lyon|35|télétravail|26/i, fmt: /mots|rubrique|ton/i };
        a.best = BRICKS.filter(function (b) { return v[b.k] && good[b.k].test(v[b.k]); }).length;
        compose(false); refresh();
      },
      onAnswer: function () { act("construire").done = true; refresh(); autoNext(7000); }
    },

    /* 7 · Vérifier le résultat ------------------------------------------------------------ */
    extend({
      id: "verifier", seq: 2, title: "Vérifier le résultat", audio: "module-2/verifier",
      say: "Un prompt structuré donne un bien meilleur résultat. Mais on vérifie toujours. Comparez l’offre, à gauche, avec le message de Sophie. Quelle information manque ?"
    }, (function () {
      var w = pickMany("verifier", [
        ["Le contrat : CDI, 35 h", false],
        ["Le lieu : Lyon 7e", false],
        ["Le télétravail : 1 jour par semaine", false],
        ["Le salaire : 24 à 26 k€", false],
        ["La date de prise de poste : 3 mars", true]
      ], "<b>Bien vu :</b> la date de prise de poste manque. Elle n’était pas dans votre contexte : l’IA ne pouvait pas l’inventer… et c’est tant mieux !");
      var r = w.render;
      w.render = function (pv) { lead(pv, "Comparez l’offre, à gauche, avec le brief de Sophie. <b>Cochez ce qui manque.</b>"); r(pv); };
      w.enter = function () { if (P.offreConv) openConv(P.offreConv); };
      return w;
    })()),

    /* 8 · Compléter, sans tout recommencer --------------------------------------------------- */
    {
      id: "completer", seq: 2, title: "Compléter la demande", audio: "module-2/completer",
      say: "Pas besoin de tout recommencer. Dans la même conversation, demandez à l’IA d’ajouter la date de prise de poste.",
      render: function (pv) {
        var a = act("completer");
        lead(pv, "Dans <b>la même conversation</b>, écrivez un court message pour ajouter la <b>date de prise de poste : le 3 mars</b>.");
        if (a.miss) fbNew(pv, "ko", "Précisez la date : <b>le 3 mars</b>.");
        if (a.done) fbNew(pv, "ok", "<b>Réussi :</b> l’offre est complète. Une relance courte suffit quand la base est bonne.");
      },
      ready: function () { return !!act("completer").done; },
      enter: function () { if (P.offreConv) openConv(P.offreConv); if (!act("completer").done) compose(true); },
      onSend: function (c, text) { var a = act("completer"); a.miss = !/3 mars/i.test(text); compose(false); refresh(); },
      onAnswer: function () { var a = act("completer"); if (a.miss) { refresh(); compose(true); return; } a.done = true; refresh(); autoNext(5200); }
    },

    /* 9 · À vous, sans aide ------------------------------------------------------------------ */
    {
      id: "seul", seq: 3, title: "À vous, sans aide", audio: "module-2/seul",
      say: "Dernière étape, sans cases à compléter. La boutique sera fermée le 24 décembre. Écrivez vous-même un prompt complet, avec les cinq briques, pour prévenir les clients. Les briques s’allument à droite, au fur et à mesure que vous écrivez.",
      render: function (pv) {
        var a = act("seul");
        pv.appendChild(h('<div class="sms"><span class="sms-who">Sophie</span><p>La boutique sera fermée le mardi 24 décembre. Tu peux prévenir nos clients par mail ? On rouvre le 26 😊</p></div>'));
        lead(pv, "Écrivez un prompt complet dans le champ, à gauche. <b>Les briques s’allument</b> quand l’IA les repère.");
        var chips = h('<div class="bk-row bk-live"></div>'), got = bricksIn((a.sent || "") + " " + (a.draft || ""));
        BRICKS.forEach(function (b) {
          var c = h('<span class="bk' + (got[b.k] ? " is-on" : "") + '"><i></i></span>');
          c.appendChild(document.createTextNode(b.name));
          c.title = b.q;
          chips.appendChild(c);
        });
        pv.appendChild(chips);
        if (a.missing && !a.done) fbNew(pv, "ko", "<b>Il manque :</b> " + a.missing + ". Envoyez un message pour compléter : les briques déjà données restent acquises.");
        if (a.done) fbNew(pv, a.best === 5 ? "ok" : "", "<b>" + a.best + " briques sur 5.</b> " + (a.best === 5 ? "Un prompt complet, écrit par vous. Bravo !" : "Pensez à la brique qui manquait la prochaine fois."));
      },
      ready: function () { return !!act("seul").done; },
      primary: function () {
        var a = act("seul");
        if (a.done) return { label: "Continuer", run: next, success: a.best === 5 };
        if ((a.tries || 0) >= 3) return { label: "Voir mon résultat", run: function () { a.done = true; next(); } };
        return { label: "Continuer", disabled: true, run: next };
      },
      enter: function () {
        var a = act("seul");
        if (a.done) return;
        var c = newConv(); c.title = "Fermeture du 24 décembre"; renderConv();
        compose(true);
      },
      onType: function () {
        var a = act("seul"), before = JSON.stringify(bricksIn((a.sent || "") + " " + (a.draft || "")));
        a.draft = input.value;
        if (JSON.stringify(bricksIn((a.sent || "") + " " + a.draft)) !== before) refresh();
      },
      onSend: function (c, text) {
        var a = act("seul");
        a.sent = (a.sent || "") + " " + text;
        a.draft = "";
        var got = bricksIn(a.sent);
        a.tries = (a.tries || 0) + 1;
        a.best = Math.max(a.best || 0, BRICKS.filter(function (b) { return got[b.k]; }).length);
        var miss = BRICKS.filter(function (b) { return !got[b.k]; }).map(function (b) { return b.name.toLowerCase(); });
        a.missing = miss.join(", ");
        if (!miss.length || a.tries >= 3) a.done = true;
        compose(false); refresh();
      },
      onAnswer: function () { var a = act("seul"); if (!a.done) { a.draft = ""; compose(true); refresh(); } else if (a.best === 5) autoNext(6500); }
    },

    /* 10 · Résultat ---------------------------------------------------------------------------- */
    RESULT_STEP,

    /* 11 · Fiche -------------------------------------------------------------------------------- */
    {
      id: "fiche", seq: 4, title: "Ma structure de prompt", audio: "module-2/fiche", full: true,
      say: "Voici votre structure en cinq briques. Gardez-la sous la main : elle vous servira pour tous vos prompts.",
      render: function (pv) {
        var a = act("fiche");
        pv.appendChild(h('<div class="pv-card pv-sheet"><ol><li><i>R</i><span><b>Rôle</b> · Tu es…</span></li><li><i>C</i><span><b>Cible</b> · pour…</span></li><li><i>O</i><span><b>Objectif</b> · Rédige… afin de…</span></li><li><i>C</i><span><b>Contexte</b> · les informations utiles, rien d’inventé</span></li><li><i>F</i><span><b>Format</b> · longueur, structure, ton</span></li></ol></div>'));
        var p = h("<p></p>");
        p.appendChild(button(a.saved ? "Fiche enregistrée" : "Enregistrer la fiche", "check", function () { a.saved = true; refresh(); }));
        pv.appendChild(p);
        if (a.saved) fb(pv, "ok", "Fiche enregistrée. Prochain module : <b>Des prompts pour les images</b>.");
      },
      primary: function () { return null; }
    }
  ];

  function stepIdx(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i; return 0; }
  function resetAct(id) { var best = act(id).best; P.act[id] = { best: best }; }
  var MAX = 20;
  function scoreItems() {
    var best = function (id) { return (P.act[id] || {}).best || 0; };
    return [
      { id: "invente", idx: stepIdx("invente"), label: "Ce que l’IA a inventé", pts: best("invente"), max: 1 },
      { id: "pourquoi", idx: stepIdx("pourquoi"), label: "Pourquoi ces inventions ?", pts: best("pourquoi"), max: 1 },
      { id: "relier", idx: stepIdx("relier"), label: "Reconnaître les briques", pts: best("relier"), max: 5 },
      { id: "manque", idx: stepIdx("manque"), label: "La brique oubliée", pts: best("manque"), max: 2 },
      { id: "construire", idx: stepIdx("construire"), label: "Construire le prompt", pts: best("construire"), max: 5 },
      { id: "verifier", idx: stepIdx("verifier"), label: "Vérifier le résultat", pts: best("verifier"), max: 1 },
      { id: "seul", idx: stepIdx("seul"), label: "À vous, sans aide", pts: best("seul"), max: 5 }
    ];
  }

  /* cartes à retourner ------------------------------------------------------------------------ */
  function flipCards(id, cards) {
    return {
      render: function (pv) {
        var a = act(id);
        a.seen = a.seen || {};
        var g = h('<div class="flip-grid"></div>');
        cards.forEach(function (c, k) {
          var b = h('<button type="button" class="flip"><span class="flip-in"><span class="flip-f"><em></em><b></b><small>Cliquer pour retourner</small></span><span class="flip-b"><em></em><span class="flip-txt"><span class="flip-q"></span><span class="flip-ex"></span></span></span></span></button>');
          b.querySelector(".flip-b em").textContent = c[1];
          b.querySelector(".flip-f em").textContent = c[0];
          b.querySelector(".flip-f b").textContent = c[1];
          b.querySelector(".flip-q").textContent = c[2];
          b.querySelector(".flip-ex").textContent = c[3];
          if (a.seen[k]) b.classList.add("is-on");
          b.onclick = function () { a.seen[k] = !a.seen[k] || true; b.classList.add("is-on"); if (Object.keys(a.seen).length === cards.length && !a.all) { a.all = true; setTimeout(refresh, 700); } };
          g.appendChild(b);
        });
        lead(pv, "<b>Retournez les 5 cartes.</b>");
        pv.appendChild(g);
        if (a.all) fbNew(pv, "", "Retenez l’ordre : <b>R · C · O · C · F</b>. Rôle, Cible, Objectif, Contexte, Format.");
      },
      ready: function () { return !!act(id).all; }
    };
  }

  /* quelle brique manque ? --------------------------------------------------------------------- */
  function whichMissing(id, items) {
    return {
      render: function (pv) {
        var a = act(id);
        a.ans = a.ans || {};
        lead(pv, "Chaque prompt a oublié une brique. <b>Laquelle ?</b>");
        items.forEach(function (it, k) {
          var box = h('<div class="wm"><p class="wm-p"></p><div class="wm-opts"></div></div>');
          box.querySelector(".wm-p").textContent = "« " + it[0] + " »";
          BRICKS.forEach(function (b) {
            var o = h('<button type="button" class="qo"><span class="r"></span><span></span></button>');
            o.lastChild.textContent = b.name;
            var picked = a.ans[k];
            if (picked !== undefined) {
              o.disabled = true;
              if (b.k === it[1]) o.classList.add("is-right");
              else if (picked === b.k) o.classList.add("is-wrong");
              else o.classList.add("is-dim");
            }
            o.onclick = function () {
              a.ans[k] = b.k;
              a.best = items.filter(function (x, j) { return a.ans[j] === x[1]; }).length;
              refresh();
              if (Object.keys(a.ans).length === items.length && a.best === items.length) autoNext(4200);
            };
            box.querySelector(".wm-opts").appendChild(o);
          });
          if (a.ans[k] !== undefined) {
            var ok = a.ans[k] === it[1], name = BRICKS.filter(function (b) { return b.k === it[1]; })[0].name.toLowerCase();
            box.appendChild(h('<p class="wm-fb ' + (ok ? "ok" : "ko") + '"></p>')).textContent = (ok ? "✓ " : "✗ C’était le " + name + ". ") + it[2];
          }
          pv.appendChild(box);
        });
      },
      ready: function () { return Object.keys(act(id).ans || {}).length === items.length; }
    };
  }

  /* repérer des passages dans la réponse de l'IA, à gauche --------------------------------------- */
  function huntChat(list, onPick, found) {
    var body = $(".msg--ai .body", messagesEl);
    if (!body) return;
    list.forEach(function (it) {
      var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), n;
      while ((n = walker.nextNode())) {
        var i = n.nodeValue.indexOf(it[0]);
        if (i < 0) continue;
        var rest = n.splitText(i); rest.splitText(it[0].length);
        var mk = document.createElement("mark");
        mk.className = "chat-hunt" + (found && found[it[0]] ? " is-found" : "");
        mk.textContent = it[0];
        mk.onclick = function () {
          if (mk.classList.contains("is-found")) return;
          if (it[1]) mk.classList.add("is-found"); else { mk.classList.remove("is-nope"); void mk.offsetWidth; mk.classList.add("is-nope"); }
          onPick(it[0], !!it[1]);
        };
        rest.replaceWith(mk);
        break;
      }
    });
    messagesEl.classList.add("is-hunting");
  }
  function unhuntChat() {
    messagesEl.classList.remove("is-hunting");
    $$(".chat-hunt", messagesEl).forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
  }

  /* ---------- Mode réel ou simulé ---------- */

  var modeBtn = $("[data-mode]");
  function setMode(m, forced) {
    mode = m;
    if (forced) { S.forceSim = m === "sim"; save(); }
    modeBtn.dataset.state = m;
    modeBtn.textContent = m === "live" ? "IA connectée" : "Mode simulé";
    modeBtn.title = m === "live" ? "Cliquer pour passer en simulation" : "Cliquer pour tenter la connexion à l’IA";
    $("[data-work-note]").textContent = m === "live"
      ? "Interface simulée pour la formation. Réponses générées par une IA : vérifiez toujours les faits."
      : "Interface et réponses simulées pour la formation. Ce n’est pas l’interface réelle d’un outil d’IA.";
  }
  function probe() {
    if (!API || S.forceSim) { setMode("sim"); return; }
    fetch(API).then(function (r) { return r.json(); }).then(function (j) { setMode(j && j.live ? "live" : "sim"); }).catch(function () { setMode("sim"); });
  }
  modeBtn.addEventListener("click", function () { if (mode === "live") setMode("sim", true); else { S.forceSim = false; save(); probe(); } });

  /* ---------- Largeur du panneau ---------- */

  var resizer = $("[data-resizer]");
  function setPanelW(w, keep) {
    if (w == null) { split.style.removeProperty("--panel-w"); if (keep) { delete S.panelW; save(); } return; }
    var max = split.clientWidth ? split.clientWidth - 320 - 20 : Infinity;
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
      if (redrawLinks) redrawLinks();
    }
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
  });
  resizer.addEventListener("dblclick", function () { setPanelW(null, true); });
  resizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPanelW($(".panel").getBoundingClientRect().width + (e.key === "ArrowLeft" ? 32 : -32), true);
  });
  window.addEventListener("resize", function () { if (S.panelW) setPanelW(S.panelW); });

  /* ---------- Onglets (petits écrans) ---------- */

  function showTab(tab) {
    if (window.innerWidth > 980 && tab === "claude") return;
    split.dataset.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { split.dataset.tab = b.dataset.tab; $$("[data-tab]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); }); }); });

  /* ---------- Accueil : nuage de points autour de l'orbe, qui tourbillonne sous la souris ---------- */

  var cloud = (function () {
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d"), pts = [], raf = 0, on = false;
    var mx = -9999, my = -9999, R = 0, Rt = 1, A = 1, At = 1, rot = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.className = "wl-canvas";
    claudeEl.insertBefore(cv, claudeEl.firstChild);
    for (var i = 0; i < 2600; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 0.5 + 0.5 * Math.pow(Math.random(), 0.35), q = Math.sqrt(1 - u * u);
      pts.push({ x: q * Math.cos(th) * r, y: u * r, z: q * Math.sin(th) * r, ox: 0, oy: 0, s: Math.random() < 0.08 ? 1.9 : 1.1 });
    }
    window.addEventListener("pointermove", function (e) { var b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; });
    function size() { var b = cv.getBoundingClientRect(); cv.width = b.width * dpr; cv.height = b.height * dpr; }
    function frame() {
      if (!on) return;
      raf = requestAnimationFrame(frame);
      if (cv.width !== Math.round(cv.getBoundingClientRect().width * dpr)) size();
      var b = cv.getBoundingClientRect(), o = bigHost.getBoundingClientRect();
      var cx = o.width ? o.left + o.width / 2 - b.left : b.width / 2, cy = o.width ? o.top + o.height / 2 - b.top : b.height / 2;
      var base = Math.min(330, Math.min(b.width, b.height) * 0.36);
      R += (base * Rt - R) * 0.05; A += (At - A) * 0.05; rot += 0.0016;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, b.width, b.height);
      var cs = Math.cos(rot), sn = Math.sin(rot), cT = Math.cos(0.35), sT = Math.sin(0.35);
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        var x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * cT - z * sT; z = p.y * sT + z * cT;
        var px = cx + x * R, py = cy + y * R;
        var dx = px + p.ox - mx, dy = py + p.oy - my, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150 && d > 0.5) {                        // tourbillon autour du curseur
          var f = (1 - d / 150);
          p.ox += (-dy / d * 3.2 + dx / d * 1.1) * f * f * 6;
          p.oy += (dx / d * 3.2 + dy / d * 1.1) * f * f * 6;
        }
        p.ox *= 0.93; p.oy *= 0.93;
        var al = (0.18 + 0.5 * (z + 1) / 2) * A;
        ctx.fillStyle = "rgba(31, 30, 28," + al.toFixed(3) + ")";
        ctx.fillRect(px + p.ox, py + p.oy, p.s, p.s);
      }
    }
    return {
      start: function () { if (on) return; on = true; cv.classList.remove("is-off"); size(); R = 0; Rt = 1; A = 0; At = 1; frame(); },
      gather: function () { Rt = 0.62; At = 0.55; },
      stop: function () { cv.classList.add("is-off"); setTimeout(function () { on = false; cancelAnimationFrame(raf); }, 950); }
    };
  })();
  var wlHero = $("[data-wl-hero]");

  /* ---------- Le parcours : douze modules, du premier contact à l'usage autonome ---------- */

  // [titre, description, (inutilisé), contenu à apprendre] ; modules déjà construits : MOD_URLS
  var MOD_CURRENT = 2;
  var MOD_URLS = { 1: "../premiers-pas/", 2: "../structure-prompt/" };
  var PARCOURS = [
    ["Démarrer", [
      ["Première rencontre", "Découvrir l’IA, écrire un premier prompt, commencer simple."]
    ]],
    ["Rédiger des prompts", [
      ["La structure d’un prompt", "Rôle, cible, objectif, contexte, format."],
      ["Des prompts pour les images", "Décrire un visuel pour un post ou un rapport."]
    ]],
    ["Améliorer les contenus", [
      ["Dialoguer pour affiner", "Enrichir le contexte, corriger sans recommencer."],
      ["Optimiser un contenu existant", "Réécrire selon un ton, un format, une contrainte."]
    ]],
    ["Protéger les données", [
      ["Ce qu’on ne partage pas", "Repérer les données sensibles, anonymiser un prompt."]
    ]],
    ["Des contenus pour tous", [
      ["Écrire pour tous", "Un texte clair et structuré pour un handicap cognitif."],
      ["Images, audio, vidéo accessibles", "Texte alternatif, transcription, sous-titres.", false, true]
    ]],
    ["Le cadre légal", [
      ["RGPD et IA Act : l’essentiel", "Les règles utiles au poste de travail.", false, true],
      ["Biais et risques", "Analyser un cas, proposer des corrections."],
      ["Tenir sa veille réglementaire", "Sources officielles, dernière version des textes.", false, true]
    ]],
    ["Intégrer l’IA à son poste", [
      ["Cartographier son poste", "Repérer les tâches que l’IA peut optimiser."],
      ["Choisir ses outils", "Comparer les outils, estimer un budget.", false, true],
      ["Son plan d’intégration", "Rédiger la stratégie, sans oublier le handicap."]
    ]],
    ["Se préparer", [
      ["Préparer la certification", "Des entraînements au format des six mises en situation."]
    ]]
  ];
  (function buildMenu() {
    var list = $("[data-menu-list]"), n = 0;
    PARCOURS.forEach(function (part) {
      var sec = h('<section class="mm-part"><h3></h3><ol></ol></section>');
      sec.firstChild.textContent = part[0];
      part[1].forEach(function (m) {
        n++;
        var li = h('<li class="mm-mod"><span class="mm-n"></span><span class="mm-tx"><b></b><small></small></span><em></em></li>');
        li.querySelector(".mm-n").textContent = String(n).padStart(2, "0");
        li.querySelector("b").textContent = m[0];
        if (m[3]) li.querySelector("b").appendChild(h('<sup class="mm-star" title="Module avec du contenu à apprendre">*</sup>'));
        li.querySelector("small").textContent = m[1];
        var url = MOD_URLS[n], here = n === MOD_CURRENT;
        li.querySelector("em").textContent = here ? "En cours" : url ? "Disponible" : "Bientôt";
        if (here) { li.classList.add("is-on"); li.tabIndex = 0; li.onclick = closeMenu; }
        else if (url) { li.classList.add("is-open"); li.tabIndex = 0; li.onclick = function () { location.href = url; }; }
        sec.lastChild.appendChild(li);
      });
      list.appendChild(sec);
    });
    list.appendChild(h('<p class="mm-note"><sup class="mm-star">*</sup> Module avec du contenu à apprendre.</p>'));
  })();
  var menuEl = $("[data-menu]");
  function openMenu() { menuEl.hidden = false; requestAnimationFrame(function () { menuEl.classList.add("is-on"); }); }
  function closeMenu() { menuEl.classList.remove("is-on"); setTimeout(function () { menuEl.hidden = true; }, 350); }
  $("[data-menu-open]").addEventListener("click", openMenu);
  $$("[data-menu-close]").forEach(function (b) { b.addEventListener("click", closeMenu); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menuEl.hidden) closeMenu(); });

  /* ---------- Accueil : l'orbe au centre, le message de bienvenue mot à mot ---------- */

  var WELCOME_TEXT = "Bon retour ! Dans ce module, vous allez apprendre à construire un prompt solide, avec cinq briques : le rôle, la cible, l’objectif, le contexte et le format. Fini les réponses inventées. C’est parti !";
  var wlGo = $("[data-wl-go]");
  var inWelcome = false, wlStarted = false;
  // la synthèse vocale a besoin d'un geste : l'accueil s'ouvre sur « Commencer »
  function startWelcome() {
    stopVoice();
    cues = [];
    app.hidden = false;
    app.classList.add("is-welcome");
    split.classList.add("panel-away");
    compose(false);
    renderConv();
    inWelcome = true;
    saying(true);
    sayText(WELCOME_TEXT);
    sayReveal(0);
    wlHero.classList.add("is-on");
    cloud.start();
    showGo("Commencer");
  }
  function speakWelcome() {
    var once = false;
    function end() { if (once) return; once = true; speaking = false; orbMood(); sayProgress(1); setTimeout(leaveWelcome, 900); }
    var W = (window.COURSE_WORDS || {})["module-2/bienvenue"];
    if (S.sound && W) {
      audio.src = "../assets/audio/module-2/bienvenue.mp3";
      audio.dataset.id = "module-2/bienvenue";
      loadEnvelope("module-2/bienvenue");
      (function wl() { if (!inWelcome || audio.ended) return; sayReveal(W.filter(function (w) { return w[0] <= audio.currentTime + 0.04; }).length); requestAnimationFrame(wl); })();
      audio.addEventListener("ended", function onEnd() { audio.removeEventListener("ended", onEnd); if (inWelcome) end(); });
      var pl = audio.play();
      if (pl && pl.catch) pl.catch(function () { sayProgress(1); end(); });
      return;
    }
    var v = S.sound ? frVoice() : null, n = tokens(WELCOME_TEXT).length;
    if (!v) {
      var k = 0;
      speaking = true; orbMood();
      (function tick() { if (!inWelcome) return; sayReveal(++k); if (k < n) setTimeout(tick, 240); else { speaking = false; orbMood(); setTimeout(end, 1200); } })();
      return;
    }
    speechSynthesis.cancel();
    speakTTS(WELCOME_TEXT, v, function () { return inWelcome; }, end, end);
    setTimeout(end, WELCOME_TEXT.length * 95 + 4000);            // filet : certains navigateurs n'émettent pas « end »
  }
  function showGo(label) { wlGo.firstChild.textContent = label; wlGo.hidden = false; requestAnimationFrame(function () { wlGo.classList.add("is-on"); }); }
  wlGo.addEventListener("click", function () {
    if (!inWelcome) return;
    if (wlStarted) { leaveWelcome(); return; }
    wlStarted = true;
    wlGo.classList.remove("is-on");
    wlHero.classList.add("is-started");
    cloud.gather();
    speakWelcome();
  });
  function leaveWelcome() {
    if (!inWelcome) return;
    inWelcome = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    sayProgress(1);
    wlGo.classList.remove("is-on");
    app.classList.remove("is-welcome");
    split.classList.remove("panel-away");
    wlHero.classList.remove("is-on");
    cloud.stop();
    saying(false);
    setTimeout(function () { go(0); }, 800);
  }

  /* ---------- Démarrage ---------- */

  function firstGesture() { if (blocked && current) { blocked = false; narrate(current); } }
  ["pointerdown", "keydown"].forEach(function (ev) { window.addEventListener(ev, firstGesture, true); });

  attachBtn.disabled = true;
  compose(false);
  renderConv();
  showTab("story");
  setMode("sim");
  probe();
  startWelcome();

  window.AtelierTracking = {
    snapshot: function () {
      var items = scoreItems(), total = items.reduce(function (s, x) { return s + x.pts; }, 0);
      return { module: "structure-prompt", step: st() ? st().id : null, score: total, max: MAX, validated: total / MAX >= 0.7, activities: items, responses: P.stats };
    }
  };
})();
