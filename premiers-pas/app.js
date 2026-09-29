/* ==========================================================================
   Module 1 · Première rencontre
   Découvrir Claude, à quoi il sert, écrire son premier prompt, commencer simple.
   Même moteur que l'atelier : Claude simulé à gauche, la formation à droite,
   l'orbe lit chaque consigne (voix de synthèse en attendant les enregistrements).
   ========================================================================== */
(function () {
  "use strict";

  var API = window.ATELIER_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "premiers-pas";
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
        sayReveal(mine.filter(function (w) { return w[0] <= t + 0.04; }).length);
      } else sayProgress(t >= c[1] ? 1 : (t - c[0]) / Math.max(0.4, c[1] - c[0]) * 1.12);
    }
    capRaf = requestAnimationFrame(capLoop);
  }
  function stopVoice() {
    saying(false);
    audio.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
    speaking = false;
    orbMood();
  }
  function ended() {
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
    var u = new SpeechSynthesisUtterance(item.text);
    narrate.u = u;
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    var t0 = 0;
    u.onstart = function () {
      speaking = true; orbMood(); t0 = performance.now();
      (function est() { if (!speaking) return; sayProgress((performance.now() - t0) / (item.text.length * 62)); requestAnimationFrame(est); })();
    };
    u.onboundary = function (ev) { if (ev.charIndex) sayProgress((ev.charIndex + (ev.charLength || 1)) / item.text.length); };
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

  var RE_BUDGET = /\d+\s*(€|euros?)|budget|cagnotte/i;
  var RE_PEOPLE = /\d+\s*(personnes|pers\b|collègues|invités|participants|convives)|(on sera|nous serons|on est|nous sommes|pour)\s*\d+|douzaine|dizaine|quinzaine|vingtaine/i;
  var RE_PLACE = /salle|bureau|pause|caf[ée]t|terrasse|jardin|open.?space|réfectoire|dans les locaux|au travail/i;
  var RE_AGE = /\d+\s*ans|\bcm1\b|\bcm2\b|\bce1\b|\bce2\b|\bcp\b|6e|sixième|5e|cinquième|collège|primaire|classe de|élève/i;
  var RE_TIME = /\d+\s*(min|minutes?)|durée|temps de parole/i;
  var RE_FORMAT = /diapo|diaporama|affiche|panneau|\bplan\b|parties|\boral\b|questions?|images?/i;
  function countRe(list, t) { return list.filter(function (r) { return r.test(t); }).length; }
  function potPrecisions(t) { return countRe([RE_BUDGET, RE_PEOPLE, RE_PLACE], t); }
  function volcanPrecisions(t) { return countRe([RE_AGE, RE_TIME, RE_FORMAT], t); }
  function grab(re, t, fallback) { var m = t.match(re); return m ? m[0] : fallback; }

  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = ((users[users.length - 1] || {}).content || "").toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    if (/olá|obras|barulho/.test(all)) {
      if (/tradu|fran[çc]ais|que veut dire|signifie|comprends pas|explique/.test(t)) return "Voici la traduction :\n\n« Bonjour ! Samedi matin, je vais faire des travaux dans l’appartement. Je m’excuse pour le bruit. Merci ! — Rui, 3e étage »\n\nSi vous le souhaitez, je peux vous aider à lui répondre en portugais.";
      return "Ce message est écrit en portugais. Que souhaitez-vous que j’en fasse : le traduire, le résumer ou y répondre ?";
    }
    if (/volcan/.test(all)) {
      if (volcanPrecisions(all) >= 2) return "Voici un plan d’exposé court, adapté à un élève de primaire :\n\n1. **C’est quoi, un volcan ?** Une montagne qui laisse sortir la lave venue du centre de la Terre.\n2. **Comment se passe une éruption ?** Le magma remonte, la pression augmente, puis la lave, les cendres et les gaz sortent.\n3. **Des volcans célèbres** : l’Etna en Italie, le Piton de la Fournaise à La Réunion.\n4. **Vivre près d’un volcan** : les scientifiques le surveillent pour prévenir les habitants.\n5. **Pour finir** : une question à poser à la classe.\n\nAstuce : une image par partie suffit pour le support.";
      return "Les volcans sont des ouvertures de la croûte terrestre par lesquelles le magma remonte à la surface. On distingue notamment les volcans effusifs, aux coulées de lave fluides, et les volcans explosifs, aux éruptions violentes chargées de cendres.\n\nUn exposé peut aborder :\n\n- la formation des volcans et la tectonique des plaques ;\n- les différents types d’éruption ;\n- les grands volcans du monde ;\n- les risques et la surveillance volcanique ;\n- les bienfaits des sols volcaniques pour l’agriculture.";
    }
    if (/\bpot\b|départ|retraite|martine/.test(all)) {
      if (potPrecisions(all) >= 2) {
        var budget = grab(/\d+\s*(€|euros?)/i, all, "votre budget"), people = grab(/\d+\s*(personnes|collègues|invités|participants|convives)|une douzaine|une dizaine|une quinzaine|une vingtaine/i, all, "") || ((all.match(/(?:on sera|nous serons|on est|nous sommes|pour)\s*(\d+)/) || [])[1] ? all.match(/(?:on sera|nous serons|on est|nous sommes|pour)\s*(\d+)/)[1] + " personnes" : "votre équipe"), place = grab(/la salle de pause|salle de réunion|la salle|la cafétéria|la terrasse|le jardin|le bureau|l’open.?space/i, all, "le lieu prévu");
        return "Avec **" + budget + "**, pour **" + people + "** et **" + place + "**, voici une proposition simple :\n\n- **Buffet partagé** : chacun apporte un plat salé ou sucré ; le budget paie les boissons et un beau gâteau.\n- **Cadeau** : un bon pour une activité qu’aime Martine, avec une carte signée par toute l’équipe.\n- **Souvenirs** : un diaporama de photos, projeté pendant le pot.\n- **Déroulé** : installation 15 minutes avant, puis un petit mot d’au revoir au bout d’une demi-heure.\n\nVoulez-vous un modèle de message pour inviter l’équipe ?";
      }
      return "Voici quelques idées pour un pot de départ :\n\n- Faire appel à un traiteur pour un buffet complet\n- Louer une salle avec un DJ ou un karaoké\n- Offrir un week-end ou un voyage en cadeau\n- Organiser un repas au restaurant\n- Préparer un diaporama de souvenirs";
    }
    if (/fête des voisins|voisins/.test(t) && /nom/.test(t)) return "Voici 5 idées de noms pour votre fête des voisins :\n\n1. **La Rue en fête**\n2. **Voisins & Cie**\n3. **Le Grand Apéro de la rue**\n4. **Bonjour voisin !**\n5. **La Tablée du quartier**\n\nDites-moi l’ambiance souhaitée (familiale, festive, rétro…) et j’affinerai.";
    if (/net imposable/.test(t)) return "Le **net imposable**, c’est la part de votre salaire qui sert à calculer l’impôt sur le revenu.\n\nIl est un peu plus élevé que le **net à payer** (ce que vous recevez sur votre compte), car certaines sommes prélevées, comme une partie de la CSG et la CRDS, sont quand même comptées comme un revenu.\n\nEn bref : le net à payer, c’est ce que vous touchez ; le net imposable, c’est ce que l’administration fiscale prend en compte.";
    if (/r[ée]sum/.test(t)) return "En 3 points :\n\n1. **Gymnase** : la rénovation est votée, travaux de mars à juin.\n2. **Cantine** : repas bio deux jours par semaine.\n3. **Réunion publique** : le 14, à 18 h.";
    if (/^(bonjour|salut|hello|bonsoir|coucou|hey)\b/.test(t.trim()) || /qui es.?tu|présente.?toi|que sais.?tu|tu sais faire|tu peux faire/.test(t))
      return "Bonjour ! Je suis Claude, un assistant d’intelligence artificielle conçu par Anthropic.\n\nVous pouvez m’écrire comme à une personne : me poser une question, me demander d’écrire un message, de résumer un texte, de trouver des idées ou de traduire.\n\nPar quoi voulez-vous commencer ?";
    return "Je suis en mode simulé : je réponds surtout aux exercices de la formation. Suivez l’étape affichée à droite.";
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
      body: JSON.stringify({ module: "premiers-pas", learner: S.learner, messages: c.messages.map(function (m) { return { role: m.role, content: m.content }; }) })
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
    sendBtn.disabled = !on;
    claudeEl.classList.toggle("is-locked", !composeOn);
    input.placeholder = composeOn ? "Répondre à Claude…" : "Le champ s’activera quand ce sera à vous d’écrire.";
  }
  function compose(on, tip) {
    composeOn = !!on;
    app.classList.toggle("focus-compose", composeOn);
    if (composeTip) { composeTip.remove(); composeTip = null; }
    if (composeOn && tip) {
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
    var text = input.value.trim();
    if (!text || busy || !composeOn) return;
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

  var SEQS = ["Faire connaissance", "À quoi ça sert ?", "Mon premier vrai prompt", "Les bons gestes", "Bilan"];
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
    var pv = h('<div class="pv"></div>'), side = pv;
    if (s.portrait) {
      var hero = h('<div class="pv-hero"><img class="pv-hero-img" alt=""><div class="pv-hero-main"></div></div>');
      hero.firstChild.src = s.portrait[0];
      hero.firstChild.alt = s.portrait[1];
      pv.appendChild(hero);
      side = hero.lastChild;
    }
    side.appendChild(h('<p class="pv-seq">Séquence ' + (s.seq + 1) + "<i></i>" + esc(SEQS[s.seq]) + "</p>"));
    if (s.pill) side.appendChild(h('<span class="pv-pill"><svg><use href="#i-' + (s.icon || "clock") + '"/></svg>' + esc(s.pill) + "</span>"));
    side.appendChild(h('<h1 class="pv-h1">' + esc(s.title) + "</h1>"));
    side.appendChild(h('<span class="pv-rule"></span>'));
    s.render(pv, side);
    if (!fresh) Array.prototype.forEach.call(pv.children, function (c) { c.style.animation = "none"; });
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
  function triesLine(pv, a, pts, max) {
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
          for (var j = Math.min(cards.length - 1, k + 1); j >= k; j--) {
            var c = h('<div class="sw-card"><span class="sw-n"></span><p></p><span class="sw-lab no">Faux</span><span class="sw-lab yes">Vrai</span></div>');
            c.querySelector(".sw-n").textContent = "Carte " + (j + 1) + " sur " + cards.length;
            c.querySelector("p").textContent = "« " + cards[j][0] + " »";
            if (j === k) c.classList.add("is-top"); else c.classList.add("is-under");
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
            }
            function up() {
              top.removeEventListener("pointermove", move);
              top.removeEventListener("pointerup", up);
              top.removeEventListener("pointercancel", up);
              if (Math.abs(dx) > 90) { decide(dx > 0); return; }
              top.style.transition = "transform .3s var(--ease)";
              top.style.transform = "";
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
          fb(pv, last.ok ? "ok" : "ko", "<b>" + (last.ok ? "Bien vu" : "Pas tout à fait") + " :</b> « " + esc(cards[k - 1][0]) + " » est " + (cards[k - 1][1] ? "vrai" : "faux") + ". " + esc(cards[k - 1][2]));
        }
        if (k === cards.length) {
          var ul = h('<ul class="sw-recap"></ul>');
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
        pv.appendChild(h('<div class="ord-axis"><span>Le plus simple</span><i></i><span>Le plus détaillé</span></div>'));
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
        if (!locked) pv.appendChild(h('<p class="pv-hint">Cliquez d’abord sur le prompt le plus simple, puis sur le suivant. Un nouveau clic annule.</p>'));
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
          fb(pv, ok ? "ok" : "ko", ok ? okText : "<b>À reprendre :</b> gardez seulement ce que Claude ne pouvait pas deviner, et qui change vraiment la réponse.");
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
          if ((locked && fn) || (a.good && a.good[k])) b.classList.add(fn === n2[1] ? "is-good" : "is-bad");
          b.disabled = !!locked || !!(a.good && a.good[k]);
          b.onclick = function () { a.sel = k; refresh(); };
          m.children[1].appendChild(b);
        });
        cfg.right.forEach(function (f) {
          var b = h('<button type="button" class="mc fn"><span class="dot"></span><span></span></button>');
          b.lastChild.textContent = f[1];
          b.dataset.fn = f[0];
          if (Object.keys(a.links).some(function (k) { return a.links[k] === f[0]; })) { b.classList.add("is-linked"); b.style.setProperty("--c", cfg.colors[f[0]]); }
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

  /* ---------- Situations (fictives) ---------- */

  var NOTE_PT = "Olá! No sábado de manhã vou fazer obras no apartamento. Peço desculpa pelo barulho. Obrigado! — Rui, 3.º andar";
  var MAILS = [
    { id: "pot", from: "Karim Benali", time: "08:42", subj: "Pot de départ de Martine", prev: "Salut ! Martine part à la retraite…",
      body: ["Salut !", "Martine part à la retraite : son pot est vendredi à 16 h. Tu peux t’en occuper ?", "On sera une douzaine. La cagnotte a récolté 60 €, et on peut utiliser la salle de pause.", "Merci, tu me sauves !", "Karim"] },
    { id: "rh", from: "Service RH", time: "08:15", subj: "Rappel : entretiens annuels", prev: "Les entretiens annuels commencent lundi…" },
    { id: "lettre", from: "La lettre du quartier", time: "Hier", subj: "Fête des voisins : on cherche un nom !", prev: "Cette année, la fête aura lieu le 6 juin…" }
  ];
  var ESSAIS = [
    { k: "idees", icon: "bulb", title: "Trouver des idées", sub: "Un nom pour la fête des voisins", start: "Propose 5 noms pour la fête des voisins de notre rue. L’ambiance : " },
    { k: "apprendre", icon: "eye", title: "Apprendre", sub: "Une ligne de votre fiche de paie", start: "Explique-moi simplement ce que veut dire « net imposable » sur une fiche de paie. Je suis " },
    { k: "resumer", icon: "doc", title: "Résumer", sub: "Le compte rendu du conseil", start: "Résume en 3 points ce compte rendu : « Le conseil a voté la rénovation du gymnase, avec des travaux de mars à juin. La cantine passera au bio deux jours par semaine. Une réunion publique aura lieu le 14 à 18 h. » C’est pour " }
  ];
  function isPotConv(c) { return c && c.kind === "pot"; }

  /* ---------- Les étapes ---------- */

  var STEPS = [
    /* 1.2 · Dire bonjour ------------------------------------------------------ */
    {
      id: "bonjour", seq: 0, pill: "À vous d’écrire", icon: "pencil", title: "Dites bonjour à Claude",
      say: "Voici Claude, à gauche. Son champ de saisie est maintenant actif. Écrivez-lui un premier message, par exemple : bonjour, qui es-tu ? Puis envoyez-le.",
      render: function (pv) {
        var a = act("bonjour");
        lead(pv, "Claude est ouvert <b>à gauche</b>. On lui écrit comme à une personne : avec des phrases normales, pas besoin de mots-clés.");
        stepsList(pv, [
          { html: "Écrivez un premier message dans le champ de Claude." },
          { html: "Envoyez-le : <b>flèche</b> ou touche <b>Entrée</b>." },
          { html: "Lisez sa réponse." }
        ], a.done ? 3 : a.sent ? 2 : a.typed ? 1 : 0);
        if (!a.sent) suggestions(pv, "Pas d’idée ? Cliquez sur une suggestion :", ["Bonjour, qui es-tu ?", "Bonjour ! Que sais-tu faire ?", "Salut Claude, présente-toi en deux phrases."]);
        if (a.done) fb(pv, "ok", "<b>Premier échange réussi.</b> Claude est un assistant d’intelligence artificielle, conçu par Anthropic. Il répond à ce que vous lui écrivez.");
      },
      ready: function () { return !!act("bonjour").done; },
      enter: function () { if (!act("bonjour").done) compose(true, "À vous : écrivez un premier message"); },
      onType: function () { var a = act("bonjour"); if (!a.typed) { a.typed = true; refresh(); } },
      onInsert: function () { var a = act("bonjour"); if (!a.typed) { a.typed = true; refresh(); } },
      onSend: function () { act("bonjour").sent = true; compose(false); refresh(); },
      onAnswer: function () { act("bonjour").done = true; refresh(); autoNext(5200); }
    },

    /* 1.3 · Vrai ou faux (swipe) ------------------------------------------------ */
    extend({
      id: "vraifaux", seq: 0, pill: "Glissez les cartes · 3 points", icon: "hand", title: "Vrai ou faux ?",
      say: "Trois idées reçues sur Claude. Glissez la carte vers la droite si c’est vrai, vers la gauche si c’est faux. Vous pouvez aussi utiliser les boutons.",
      render: null
    }, (function () {
      var w = swipe("vraifaux", [
        ["Claude connaît déjà mon entreprise et mes dossiers.", false, "Il ne sait que ce que vous lui écrivez ou lui donnez dans la conversation."],
        ["On peut lui écrire en français, comme à une personne.", true, "Des phrases normales suffisent. Il fonctionne aussi dans beaucoup d’autres langues."],
        ["Ses réponses sont toujours justes.", false, "Claude peut se tromper : on relit, et on vérifie les faits importants."]
      ]);
      var r = w.render;
      w.render = function (pv) { lead(pv, "Vrai à droite, faux à gauche. Une carte à la fois."); r(pv); };
      return w;
    })()),

    /* 1.4 · Où le trouver (glisser-déposer) ------------------------------------ */
    extend({
      id: "acces", seq: 0, pill: "Glissez-déposez · 3 points", icon: "hand", title: "Où trouver Claude ?",
      say: "Claude s’utilise de trois façons : dans le navigateur, avec l’application pour ordinateur, ou avec l’application mobile. Glissez chaque situation dans la bonne zone."
    }, (function () {
      var w = dragDrop("acces", {
        items: [
          ["Dans le train, sur votre téléphone", "mobile"],
          ["Sur l’ordinateur d’un collègue, sans rien installer", "web"],
          ["Dans sa propre fenêtre, sur votre Mac ou votre PC", "desktop"]
        ],
        buckets: [
          ["web", "Navigateur", "Le site claude.ai", "globe"],
          ["desktop", "Application ordinateur", "Mac et Windows", "laptop"],
          ["mobile", "Application mobile", "iOS et Android", "phone"]
        ],
        after: function (pv, a) { if (a.done) fb(pv, "", "Pour utiliser Claude, il faut avoir <b>au moins 18 ans</b> et se trouver dans une région où le service est proposé."); }
      });
      var r = w.render;
      w.render = function (pv) { lead(pv, "Glissez chaque carte dans la bonne zone. Vous pouvez aussi cliquer sur une carte, puis sur une zone."); r(pv); };
      return w;
    })()),

    /* 2.1 · Sept usages (relier) ------------------------------------------------ */
    extend({
      id: "usages", seq: 1, pill: "Reliez · 5 points", icon: "clock", title: "À quoi sert Claude ?",
      say: "L’aide de Claude cite sept usages : écrire, apprendre, résumer, trouver des idées, traduire, analyser une image, et programmer. Reliez chaque situation de la vie courante à l’usage qui convient."
    }, (function () {
      var COLORS = { tra: "#db2777", res: "#0d9488", ide: "#d97706", app: "#2563eb", img: "#7c3aed" };
      var w = relier("usages", {
        heads: ["Situations", "Usages"],
        left: [
          ["Un voisin vous laisse un mot en portugais", "tra"],
          ["Le compte rendu du conseil fait 12 pages", "res"],
          ["Il faut un nom pour la fête des voisins", "ide"],
          ["Une ligne de votre fiche de paie vous échappe", "app"],
          ["Vous avez la photo d’un graphique de consommation", "img"]
        ],
        right: [["ide", "Trouver des idées"], ["img", "Analyser une image"], ["tra", "Traduire"], ["app", "Apprendre"], ["res", "Résumer"]],
        colors: COLORS
      });
      var r = w.render;
      w.render = function (pv) {
        var u = h('<div class="usages"></div>');
        [["pencil", "Écrire"], ["eye", "Apprendre"], ["doc", "Résumer"], ["bulb", "Trouver des idées"], ["globe", "Traduire"], ["image", "Analyser une image"], ["code", "Programmer"]].forEach(function (x) {
          u.appendChild(h('<span class="usage"><svg><use href="#i-' + x[0] + '"/></svg>' + x[1] + "</span>"));
        });
        pv.appendChild(u);
        lead(pv, "Cliquez sur une situation, puis sur l’usage qui convient.");
        r(pv);
      };
      return w;
    })()),

    /* 2.2 · Essayer pour de vrai ------------------------------------------------ */
    {
      id: "essayer", seq: 1, pill: "À vous d’écrire", icon: "pencil", title: "Essayez un usage",
      say: "À vous d’essayer. Choisissez une situation. Le début de la demande se place dans le champ de Claude : terminez la phrase avec vos mots, puis envoyez.",
      render: function (pv) {
        var a = act("essayer");
        lead(pv, "Choisissez une situation. Le début de la demande se place dans Claude : <b>terminez la phrase</b> avec vos mots, puis envoyez.");
        var g = h('<div class="sit-grid"></div>');
        ESSAIS.forEach(function (e) {
          var b = h('<button type="button" class="sit"><span class="ic"><svg><use href="#i-' + e.icon + '"/></svg></span><b></b><small></small></button>');
          b.querySelector("b").textContent = e.title;
          b.querySelector("small").textContent = e.sub;
          if (a.pick === e.k) b.classList.add("is-on");
          b.disabled = !!a.sent;
          b.onclick = function () {
            a.pick = e.k;
            newConv();
            renderConv();
            compose(true, "Terminez la phrase, puis envoyez");
            insert(e.start);
            refresh();
          };
          g.appendChild(b);
        });
        pv.appendChild(g);
        if (a.pick && !a.sent) fb(pv, "", "Le début est dans le champ de Claude. Complétez-le (par exemple : « familiale et festive »), puis envoyez.");
        if (a.done) fb(pv, "ok", "<b>C’est aussi simple que ça.</b> Une situation réelle, une phrase claire : Claude s’occupe du reste. Pensez à relire sa réponse.");
      },
      ready: function () { return !!act("essayer").done; },
      onSend: function () { act("essayer").sent = true; compose(false); refresh(); },
      onAnswer: function () { act("essayer").done = true; refresh(); autoNext(6000); }
    },

    /* 3.1 · C'est quoi, un prompt (ordre) --------------------------------------- */
    extend({
      id: "prompt", seq: 2, pill: "Classez · 1 point", icon: "clock", title: "C’est quoi, un prompt ?",
      say: "Un prompt, c’est simplement ce que vous écrivez à Claude. Il peut être une question toute simple, ou une demande très détaillée. Classez ces trois prompts, du plus simple au plus détaillé."
    }, (function () {
      var w = orderUp("prompt", [
        "Des idées de dessert ?",
        "Donne-moi 3 idées de dessert faciles pour 6 personnes.",
        "Donne-moi 3 idées de dessert sans four, pour 6 personnes dont un enfant allergique aux noix, prêtes en 20 minutes, avec la liste des courses."
      ], [1, 2, 0]);
      var r = w.render;
      w.render = function (pv) { lead(pv, "Un <b>prompt</b>, c’est ce que vous écrivez à Claude : d’une question courte à une demande détaillée."); r(pv); };
      return w;
    })()),

    /* 3.2 · La situation : la boîte mail ---------------------------------------- */
    {
      id: "mail", seq: 2, pill: "La situation", icon: "eye", title: "Un mail ce matin",
      say: "Place à une vraie situation. Vous avez trois nouveaux mails. Ouvrez celui qui parle du pot de départ de Martine.",
      render: function (pv) {
        var a = act("mail");
        lead(pv, "Trois nouveaux mails ce matin. <b>Ouvrez celui du pot de départ.</b>");
        var box = h('<div class="inbox"><div class="ib-list"></div><div class="ib-read"></div></div>');
        MAILS.forEach(function (m) {
          var b = h('<button type="button" class="ib-item"><span class="ib-av"></span><span class="ib-tx"><span class="ib-top"><b></b><time></time></span><span class="ib-subj"></span><span class="ib-prev"></span></span></button>');
          b.querySelector(".ib-av").textContent = m.from.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2);
          b.querySelector("b").textContent = m.from;
          b.querySelector("time").textContent = m.time;
          b.querySelector(".ib-subj").textContent = m.subj;
          b.querySelector(".ib-prev").textContent = m.prev;
          if (a.open === m.id) b.classList.add("is-on");
          if (a.opened && a.opened[m.id]) b.classList.add("is-read");
          b.onclick = function () { a.open = m.id; a.opened = a.opened || {}; a.opened[m.id] = true; refresh(); };
          box.firstChild.appendChild(b);
        });
        var cur = MAILS.filter(function (m) { return m.id === a.open; })[0];
        var rd = box.lastChild;
        if (!cur) rd.appendChild(h('<p class="ib-empty">Sélectionnez un mail pour le lire.</p>'));
        else if (!cur.body) { rd.appendChild(h('<p class="ib-empty"></p>')); rd.firstChild.textContent = "« " + cur.subj + " » : ce n’est pas celui-là. Cherchez le mail du pot de départ."; }
        else {
          rd.appendChild(h('<div class="ib-h"><b></b><span></span></div>'));
          rd.querySelector(".ib-h b").textContent = cur.subj;
          rd.querySelector(".ib-h span").textContent = "De : " + cur.from + " · " + cur.time;
          cur.body.forEach(function (p) { var e = document.createElement("p"); e.textContent = p; rd.appendChild(e); });
        }
        pv.appendChild(box);
        if (a.open === "pot") fb(pv, "", "Votre mission : organiser ce pot avec l’aide de Claude. On commence simple.");
      },
      ready: function () { return act("mail").open === "pot"; }
    },

    /* 3.3 · Commencer simple --------------------------------------------------- */
    {
      id: "simple", seq: 2, pill: "À vous d’écrire", icon: "pencil", title: "Commencer simple",
      say: "Premier conseil de l’aide de Claude : commencer simple. Écrivez une demande courte sur le pot de départ, sans chercher la perfection. Par exemple : donne-moi des idées pour un pot de départ.",
      render: function (pv) {
        var a = act("simple");
        lead(pv, "Premier conseil : <b>commencer simple</b>. Une phrase courte suffit pour démarrer.");
        pv.appendChild(h('<div class="pv-card is-peach"><span class="pv-tag"><i><svg><use href="#i-bulb"/></svg></i>Exemple</span><p>« Donne-moi des idées pour un pot de départ. »</p></div>'));
        if (a.off) fb(pv, "ko", "Parlez à Claude du <b>pot de départ</b> : c’est notre situation.");
        if (a.long) fb(pv, "", "Votre demande est déjà détaillée : très bien ! On va quand même voir ce que donne une demande courte.");
        if (a.done) fb(pv, "ok", "<b>C’est parti.</b> Regardez la réponse de Claude, à gauche : est-elle adaptée à votre pot ?");
      },
      ready: function () { return !!act("simple").done; },
      enter: function () {
        var a = act("simple");
        if (a.done) return;
        var c = newConv("pot"); c.title = "Pot de départ";
        renderConv();
        compose(true, "Une demande courte sur le pot de départ");
      },
      onSend: function (c, text) {
        var a = act("simple");
        c.kind = "pot";
        a.off = !/\bpot\b|départ|retraite|martine|fête|au revoir/i.test(text);
        a.long = text.split(/\s+/).length > 25;
        refresh();
      },
      onAnswer: function (c) {
        var a = act("simple");
        if (a.off) { compose(true, "Parlez du pot de départ"); refresh(); return; }
        a.done = true;
        P.potConv = c.id;
        compose(false);
        refresh();
        autoNext(5200);
      }
    },

    /* 3.4 · Qu'est-ce qui manque (étiquettes) ---------------------------------- */
    extend({
      id: "manque", seq: 2, pill: "Cochez · 1 point", icon: "clock", title: "Qu’est-ce qui manque ?",
      say: "Claude propose un traiteur, un DJ, un voyage… Ce n’est pas adapté, car il ne connaît pas votre situation. Cochez les informations qu’il ne pouvait pas deviner, et qui changent tout."
    }, (function () {
      var w = pickMany("manque", [
        ["Le budget : 60 € de cagnotte", true],
        ["Le nombre de personnes : une douzaine", true],
        ["Le lieu : la salle de pause", true],
        ["La couleur préférée de Martine", false],
        ["La météo de vendredi", false]
      ], "<b>Réussi :</b> budget, nombre de personnes et lieu. Ces trois informations sont dans le mail de Karim, mais Claude ne peut pas les deviner.");
      var r = w.render;
      w.render = function (pv) { lead(pv, "La réponse de Claude est générique : <b>traiteur, DJ, voyage…</b> Cochez les informations qu’il ne pouvait pas deviner, et qui changent vraiment la réponse."); r(pv); };
      w.enter = function () { if (P.potConv) openConv(P.potConv); };
      return w;
    })()),

    /* 3.5 · Préciser et relancer ------------------------------------------------ */
    {
      id: "relance", seq: 2, pill: "À vous d’écrire · 2 points", icon: "pencil", title: "Préciser, puis relancer",
      say: "Deuxième conseil : être précis, puis affiner. Pas besoin de tout recommencer : dans la même conversation, écrivez une relance avec au moins deux précisions. Le budget, le nombre de personnes ou le lieu.",
      render: function (pv) {
        var a = act("relance");
        a.subs = a.subs || [];
        lead(pv, "Dans <b>la même conversation</b>, donnez à Claude au moins <b>deux précisions</b> du mail de Karim.");
        var chips = h('<div class="need-chips"></div>');
        [["€", "Budget : 60 €", RE_BUDGET], ["👥", "12 personnes", RE_PEOPLE], ["📍", "Salle de pause", RE_PLACE]].forEach(function (x) {
          var on = a.last && x[2].test(a.last);
          chips.appendChild(h('<span class="need' + (on ? " is-on" : "") + '"><i>' + x[0] + "</i>" + x[1] + "</span>"));
        });
        pv.appendChild(chips);
        pv.appendChild(h('<p class="pv-hint">Exemple : « Le budget est de 60 €, on sera 12, dans la salle de pause. »</p>'));
        if (a.subs.length && !a.done) fb(pv, "ko", "<b>Encore un effort :</b> " + a.subs[a.subs.length - 1] + " précision" + (a.subs[a.subs.length - 1] > 1 ? "s" : "") + " sur 2. Ajoutez le budget, le nombre de personnes ou le lieu, puis renvoyez.");
        if (a.done) fb(pv, "ok", "<b>Réussi :</b> avec vos précisions, la réponse de Claude colle à votre situation. Vous avez affiné, sans recommencer.");
        if (a.shown) fb(pv, "", "<b>Correction :</b> « Le budget est de 60 €, on sera 12, dans la salle de pause. »");
        if (!a.done) pv.appendChild(h('<p class="pv-tries">2 points · essai ' + Math.min(a.subs.length + 1, 3) + " sur 3</p>"));
      },
      primary: function () {
        var a = act("relance");
        if (a.done || a.shown) return { label: "Continuer", run: next, success: a.best === 2 };
        return { label: "Continuer", disabled: true, run: next };
      },
      enter: function () {
        var a = act("relance");
        if (P.potConv) openConv(P.potConv);
        if (!a.done && !a.shown) compose(true, "Ajoutez deux précisions, puis envoyez");
      },
      onSend: function (c, text) { var a = act("relance"); a.last = text; compose(false); refresh(); },
      onAnswer: function (c) {
        var a = act("relance");
        a.subs = a.subs || [];
        var n = potPrecisions(a.last || "");
        if (n >= 2) {
          a.done = true;
          a.best = a.subs.length === 0 ? 2 : 1;
          P.potBetter = c.id;
          refresh();
          toast("Deux précisions : réponse adaptée");
          autoNext(5200);
          return;
        }
        a.subs.push(n);
        if (a.subs.length >= 3) { a.shown = true; a.best = 0; refresh(); return; }
        refresh();
        compose(true, "Ajoutez une précision, puis renvoyez");
      }
    },

    /* 3.6 · Avant / après ------------------------------------------------------- */
    {
      id: "avantapres", seq: 2, pill: "À vous de choisir · 1 point", icon: "trophy", title: "Avant, après",
      say: "Voici vos deux réponses, côte à côte. Laquelle utiliseriez-vous vraiment pour le pot de Martine ? Cliquez dessus.",
      render: function (pv) {
        var a = act("avantapres");
        var c = conv(P.potConv), ai = (c ? c.messages : []).filter(function (m) { return m.role === "assistant"; });
        var first = ai[0] ? ai[0].content : "", last = ai.length > 1 ? ai[ai.length - 1].content : "";
        lead(pv, "Laquelle utiliseriez-vous vraiment ? <b>Cliquez sur une réponse.</b>");
        var g = h('<div class="cmp"></div>');
        [[0, "Demande courte", first], [1, "Avec vos précisions", last]].forEach(function (x) {
          var b = h('<button type="button" class="cmp-card"><span class="cmp-tag"></span><div class="cmp-body"></div></button>');
          b.querySelector(".cmp-tag").textContent = x[1];
          b.querySelector(".cmp-body").innerHTML = markdown(x[2] || "(pas de réponse)");
          if (a.pick !== undefined) { b.disabled = true; if (a.pick === x[0]) b.classList.add(x[0] === 1 ? "is-good" : "is-bad"); if (x[0] === 1) b.classList.add("is-right"); }
          b.onclick = function () { a.pick = x[0]; a.best = x[0] === 1 ? 1 : 0; refresh(); if (a.best) autoNext(4200); };
          g.appendChild(b);
        });
        pv.appendChild(g);
        if (a.pick !== undefined) fb(pv, a.best ? "ok" : "ko", a.best ? "<b>Exact :</b> la seconde réponse tient compte du budget, du nombre de personnes et du lieu. On peut s’en servir tout de suite." : "<b>Pas vraiment :</b> la première réponse propose un traiteur ou un voyage, hors budget. La seconde, elle, colle à la situation.");
      },
      ready: function () { return act("avantapres").pick !== undefined; }
    },

    /* 4.1 · Les repères de l'écran --------------------------------------------- */
    {
      id: "reperes", seq: 3, pill: "Repérez", icon: "eye", title: "Les repères de l’écran",
      say: "Place aux bons gestes. Cinq repères sont signalés sur l’écran de Claude. Cliquez sur chaque pastille orange pour découvrir à quoi elle sert.",
      render: function (pv) { lead(pv, "Regardez à gauche : cinq pastilles orange. Cliquez sur chacune."); },
      primary: function () { return null; },
      enter: function () {
        repSeen = [];
        openConv(P.potConv || P.current);
        autoTimer = setTimeout(function () {
          split.classList.add("panel-away");
          showTab("claude");
          REPERES.forEach(function (r, i) {
            badge(r[0], String(i + 1), function (b) {
              if (repSeen.indexOf(i) < 0) repSeen.push(i);
              b.classList.add("is-seen");
              showTip(b, r[1], r[2]);
              if (repSeen.length === REPERES.length) {
                act("reperes").done = true;
                setTimeout(function () { toast("Les cinq repères sont vus"); }, 900);
                setTimeout(function () { next(); }, 2800);
              }
            }, r[3]);
          });
        }, 900);
      },
      leave: function () { split.classList.remove("panel-away"); showTab("story"); }
    },

    /* 4.2 · Un sujet, une conversation ------------------------------------------ */
    {
      id: "voisin", seq: 3, pill: "À vous de faire", icon: "hand", title: "Un sujet, une conversation",
      say: "Nouveau sujet : votre voisin Rui vous a laissé un mot en portugais. On ne le mélange pas avec le pot de départ. Ouvrez une nouvelle conversation, placez le mot dans le champ, et dites à Claude ce que vous voulez.",
      render: function (pv) {
        var a = act("voisin");
        var phase = a.done ? 3 : a.sent ? 2 : a.fresh ? 1 : 0;
        var note = h('<div class="postit"><p></p><small>Glissé sous votre porte</small></div>');
        note.firstChild.textContent = NOTE_PT;
        pv.appendChild(note);
        stepsList(pv, [
          { html: "Ouvrez une <b>nouvelle conversation</b> : bouton ✎ en haut à gauche." },
          { html: "Placez le mot dans le champ, puis <b>dites à Claude ce que vous voulez</b>.", act: function (el) {
            el.appendChild(button(a.placed ? "Mot placé dans le champ" : "Placer le mot dans le champ", "copy", function () { a.placed = true; insert("« " + NOTE_PT + " »\n\n"); input.setSelectionRange(0, 0); refresh(); }));
          } },
          { html: "Envoyez, puis lisez la traduction." }
        ], phase);
        if (a.vague) fb(pv, "ko", "Claude vous demande ce que vous voulez en faire. Précisez-le : « Traduis ce mot en français. »");
        if (a.done) fb(pv, "ok", "<b>Réussi :</b> un sujet, une conversation. Retrouver vos échanges sera plus simple, et Claude ne mélange pas les contextes.");
      },
      ready: function () { return !!act("voisin").done; },
      enter: function () {
        var a = act("voisin");
        if (a.done) return;
        if (!a.fresh) { spot("new"); badge("new", "1"); }
        else compose(true, "Placez le mot, puis dites ce que vous voulez");
      },
      onNewConv: function () {
        var a = act("voisin");
        if (a.fresh) return;
        a.fresh = true;
        clearSpots();
        refresh();
        compose(true, "Placez le mot, puis dites ce que vous voulez");
      },
      onSend: function (c, text) {
        var a = act("voisin");
        if (!a.fresh || isPotConv(c)) { toast("Ouvrez d’abord une nouvelle conversation."); }
        a.sent = true; a.text = text; compose(false); refresh();
      },
      onAnswer: function (c) {
        var a = act("voisin");
        var ok = /olá|obras|barulho/i.test(a.text) && /tradu|fran[çc]ais|que veut dire|signifie|comprends pas|explique/i.test(a.text);
        a.vague = !ok;
        if (ok && !isPotConv(c)) { a.done = true; refresh(); autoNext(5200); return; }
        a.sent = false;
        refresh();
        compose(true, "Dites à Claude ce que vous voulez");
      }
    },

    /* 5.1 · Défi final ---------------------------------------------------------- */
    {
      id: "defi", seq: 4, pill: "Défi · 2 points", icon: "trophy", title: "Le défi : l’exposé de Léna",
      say: "Dernier défi, sans aide. Votre fille Léna a besoin d’aide pour son exposé sur les volcans. Ouvrez une nouvelle conversation, commencez simple, puis relancez avec deux précisions.",
      render: function (pv) {
        var a = act("defi");
        var phase = a.done ? 3 : a.simple ? 2 : a.fresh ? 1 : 0;
        var sms = h('<div class="sms"><span class="sms-who">Léna</span><p>Tu peux m’aider pour mon exposé sur les volcans ? C’est pour lundi. Je suis en CM2 et je dois parler 5 minutes, avec des images 🙏</p></div>');
        pv.appendChild(sms);
        stepsList(pv, [
          { html: "Ouvrez une <b>nouvelle conversation</b>." },
          { html: "<b>Commencez simple</b> : une demande courte sur l’exposé." },
          { html: "<b>Relancez</b> avec au moins deux précisions du message de Léna." }
        ], phase);
        if (a.miss) fb(pv, "ko", "<b>Encore un effort :</b> ajoutez au moins deux précisions : la classe ou l’âge, la durée, le support.");
        if (a.done) fb(pv, a.best === 2 ? "ok" : "", a.best === 2 ? "<b>Défi réussi :</b> un début simple, puis des précisions. La réponse est adaptée à Léna." : "Défi terminé. Retenez : la classe, la durée et le support changent tout.");
      },
      ready: function () { return !!act("defi").done; },
      primary: function () {
        var a = act("defi");
        if (a.done) return { label: "Continuer", run: next, success: a.best === 2 };
        if ((a.tries || 0) >= 3) return { label: "Voir mon résultat", run: function () { a.done = true; a.best = 0; next(); } };
        return { label: "Continuer", disabled: true, run: next };
      },
      enter: function () {
        var a = act("defi");
        if (a.done) return;
        if (!a.fresh) { spot("new"); badge("new", "1"); }
        else compose(true, a.simple ? "Relancez avec deux précisions" : "Commencez simple");
      },
      onNewConv: function () {
        var a = act("defi");
        if (a.fresh) return;
        a.fresh = true;
        clearSpots();
        refresh();
        compose(true, "Commencez simple");
      },
      onSend: function (c, text) { act("defi").last = text; compose(false); },
      onAnswer: function (c) {
        var a = act("defi");
        if (!/volcan/i.test(a.last) && !a.simple) { refresh(); compose(true, "Parlez de l’exposé sur les volcans"); return; }
        if (!a.simple) {
          a.simple = true;
          if (volcanPrecisions(a.last) >= 2) { a.done = true; a.best = 2; refresh(); toast("Déjà précis : bravo"); autoNext(5200); return; }
          refresh();
          compose(true, "Relancez avec deux précisions");
          return;
        }
        a.tries = (a.tries || 0) + 1;
        if (volcanPrecisions(a.last) >= 2) { a.done = true; a.best = 2; a.miss = false; refresh(); toast("Défi réussi"); autoNext(5200); return; }
        a.miss = true;
        refresh();
        if (a.tries < 3) compose(true, "Ajoutez deux précisions");
      }
    },

    /* 5.2 · Résultat ------------------------------------------------------------ */
    {
      id: "resultat", seq: 4, pill: "Bilan", icon: "trophy", title: "Votre résultat", full: true,
      say: "Voici votre résultat, activité par activité. Si une activité n’est pas réussie, vous pouvez la revoir.",
      render: function (pv) {
        var items = scoreItems(), total = items.reduce(function (s, x) { return s + x.pts; }, 0);
        pv.appendChild(h('<p class="pv-score">' + fmt(total) + " <small>sur " + MAX + "</small></p>"));
        pv.appendChild(h('<div class="pv-bar"><i style="width:' + (total / MAX * 100) + '%"></i><b style="left:70%"></b></div>'));
        pv.appendChild(h('<p class="pv-hint">Seuil de validation : 70 % du maximum.</p>'));
        var ul = h('<ul class="pv-acts"></ul>');
        items.forEach(function (it) {
          var li = h('<li><span></span><span class="pts"></span></li>');
          li.firstChild.textContent = it.label;
          li.children[1].textContent = fmt(it.pts) + " / " + it.max;
          if (it.pts < it.max) { var b = h('<button type="button" class="pv-link">Revoir</button>'); b.onclick = function () { resetAct(it.id); go(it.idx); }; li.appendChild(b); }
          ul.appendChild(li);
        });
        pv.appendChild(ul);
        P.validated = total / MAX >= 0.7;
        fb(pv, P.validated ? "ok" : "ko", P.validated ? "<b>Seuil atteint :</b> module validé. Bravo pour cette première rencontre !" : "<b>Sous le seuil :</b> revoyez les activités indiquées, puis revenez ici.");
      }
    },

    /* 5.3 · Fiche --------------------------------------------------------------- */
    {
      id: "fiche", seq: 4, pill: "À garder", icon: "check", title: "Mes premiers réflexes", full: true,
      say: "Voici vos quatre premiers réflexes. Gardez cette fiche : elle vous servira dès votre prochaine conversation avec Claude.",
      render: function (pv) {
        var a = act("fiche");
        pv.appendChild(h('<div class="pv-card pv-sheet"><ol><li><i>1</i>Commencer simple : une phrase suffit pour démarrer.</li><li><i>2</i>Donner ce que Claude ne peut pas deviner : budget, nombre, lieu, âge, durée…</li><li><i>3</i>Relancer dans la même conversation pour affiner.</li><li><i>4</i>Un nouveau sujet, une nouvelle conversation.</li></ol></div>'));
        var p = h("<p></p>");
        p.appendChild(button(a.saved ? "Fiche enregistrée" : "Enregistrer la fiche", "check", function () { a.saved = true; refresh(); }));
        pv.appendChild(p);
        if (a.saved) fb(pv, "ok", "Fiche enregistrée. Prochain module : <b>Le mail mécontent</b>.");
      },
      primary: function () { return null; }
    }
  ];

  var MAX = 18;
  function stepIdx(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i; return 0; }
  function resetAct(id) {
    var a = act(id);
    var best = a.best;
    P.act[id] = { best: best };
  }
  function scoreItems() {
    var best = function (id) { return (P.act[id] || {}).best || 0; };
    return [
      { id: "vraifaux", idx: stepIdx("vraifaux"), label: "Vrai ou faux ?", pts: best("vraifaux"), max: 3 },
      { id: "acces", idx: stepIdx("acces"), label: "Où trouver Claude ?", pts: best("acces"), max: 3 },
      { id: "usages", idx: stepIdx("usages"), label: "À quoi sert Claude ?", pts: best("usages"), max: 5 },
      { id: "prompt", idx: stepIdx("prompt"), label: "C’est quoi, un prompt ?", pts: best("prompt"), max: 1 },
      { id: "manque", idx: stepIdx("manque"), label: "Qu’est-ce qui manque ?", pts: best("manque"), max: 1 },
      { id: "relance", idx: stepIdx("relance"), label: "Préciser, puis relancer", pts: best("relance"), max: 2 },
      { id: "avantapres", idx: stepIdx("avantapres"), label: "Avant, après", pts: best("avantapres"), max: 1 },
      { id: "defi", idx: stepIdx("defi"), label: "Le défi : l’exposé de Léna", pts: best("defi"), max: 2 }
    ];
  }

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

  /* ---------- Accueil : l'orbe au centre, le message de bienvenue mot à mot ---------- */

  var WELCOME_TEXT = "Bonjour et bienvenue ! Je suis votre assistante d’apprentissage. Aujourd’hui, vous allez rencontrer Claude, une intelligence artificielle, et lui écrire vos premiers messages. Pas de théorie : on apprend en faisant. C’est parti !";
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
    showGo("Commencer");
  }
  function speakWelcome() {
    var once = false;
    function end() { if (once) return; once = true; speaking = false; orbMood(); sayProgress(1); setTimeout(leaveWelcome, 900); }
    var v = S.sound ? frVoice() : null, n = tokens(WELCOME_TEXT).length;
    if (!v) {
      var k = 0;
      speaking = true; orbMood();
      (function tick() { if (!inWelcome) return; sayReveal(++k); if (k < n) setTimeout(tick, 240); else { speaking = false; orbMood(); setTimeout(end, 1200); } })();
      return;
    }
    var u = new SpeechSynthesisUtterance(WELCOME_TEXT);
    speakWelcome.u = u;
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    u.onstart = function () { speaking = true; orbMood(); };
    u.onboundary = function (ev) { if (ev.charIndex !== undefined) sayProgress((ev.charIndex + (ev.charLength || 1)) / WELCOME_TEXT.length); };
    u.onend = end;
    u.onerror = end;
    setTimeout(end, WELCOME_TEXT.length * 95 + 4000);            // filet : certains navigateurs n'émettent pas « end »
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  function showGo(label) { wlGo.firstChild.textContent = label; wlGo.hidden = false; requestAnimationFrame(function () { wlGo.classList.add("is-on"); }); }
  wlGo.addEventListener("click", function () {
    if (!inWelcome) return;
    if (wlStarted) { leaveWelcome(); return; }
    wlStarted = true;
    wlGo.classList.remove("is-on");
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
      return { module: "premiers-pas", step: st() ? st().id : null, score: total, max: MAX, validated: total / MAX >= 0.7, activities: items, responses: P.stats };
    }
  };
})();
