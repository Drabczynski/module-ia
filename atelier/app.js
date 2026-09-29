/* ==========================================================================
   Module 3 · Prendre en main Claude — atelier
   Claude à gauche (simulation de l'interface), la formation à droite, pas à pas.
   Tout se passe au même endroit : l'apprenant écrit dans Claude quand l'étape
   le demande, la réponse est contrôlée automatiquement, puis on avance.
   L'orbe, assistante d'apprentissage, lit chaque consigne.
   ========================================================================== */
(function () {
  "use strict";

  var API = window.ATELIER_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "module3-atelier";
  var FIRST_BYTE_TIMEOUT = 20000;
  var INTRO_URL = "intro.html";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Textes de référence (storyboard) ---------- */

  var NOTES = "Point équipe du 3 novembre. Nora prépare l’affiche pour le 5 novembre. Sami vérifie le stock pour le 6 novembre. Le lieu de la prochaine rencontre reste à confirmer.";
  var CONSIGNE = "À partir des notes suivantes, crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris « non précisé » pour une donnée absente.";
  var PROMPT = CONSIGNE + "\n\nNotes : " + NOTES;
  var CORRECTION = "Le responsable de la confirmation du lieu n’est pas indiqué. Remplace-le par non précisé.";
  var ACCUEIL_PROMPT = "Rédige un message pour les visiteurs. L’accueil sera fermé le 12 octobre de 14 h à 16 h. La messagerie reste disponible. Ton courtois. Maximum 60 mots. N’invente aucune cause.";
  var CHATGPT_ANSWER = "L’accueil sera fermé le 12 octobre de 14 h à 16 h. Vous pouvez laisser un message pendant cette fermeture. Merci de votre compréhension.";
  var REF_TABLE = "| Action | Responsable | Échéance |\n|---|---|---|\n| Préparer l’affiche | Nora | 5 novembre |\n| Vérifier le stock | Sami | 6 novembre |\n| Confirmer le lieu de la prochaine rencontre | non précisé | non précisé |";

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

  /* ---------- Tableaux : lecture et contrôle (4 critères du storyboard) ---------- */

  function cells(line) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (x) { return x.trim(); }); }
  function readTable(text) {
    var rows = [];
    (text || "").replace(/\r/g, "").split("\n").forEach(function (l) {
      if (!/^\s*\|.*\|\s*$/.test(l) || /^\s*\|?\s*:?-{2,}/.test(l)) return;
      rows.push(cells(l).map(function (c) { return c.replace(/\*\*/g, ""); }));
    });
    if (rows.length && /action/i.test(rows[0][0] || "")) rows = rows.slice(1);
    return rows.length ? rows : null;
  }
  var CRIT = ["Actions conformes", "Responsables exacts", "Échéances exactes", "Inconnues signalées"];
  var LEVEL = { ok: ["Respecté", 1], part: ["Partiel", 0.5], ko: ["À reprendre", 0] };
  function lines(rows) { return rows.map(function (r) { return { a: (r[0] || "").toLowerCase(), r: (r[1] || "").toLowerCase(), e: (r[2] || "").toLowerCase() }; }); }
  function checkTable(rows) {
    var L = lines(rows), find = function (re) { return L.filter(function (l) { return re.test(l.a); })[0]; };
    var aff = find(/affiche/), sto = find(/stock/), lieu = find(/lieu/), np = /non pr[ée]cis[ée]e?/;
    var level = function (n, of) { return n === of ? "ok" : n > 0 ? "part" : "ko"; };
    var c1 = [aff, sto, lieu].filter(Boolean).length - (L.length > 3 ? 1 : 0);
    var c2 = (aff && /nora/.test(aff.r) ? 1 : 0) + (sto && /sami/.test(sto.r) ? 1 : 0);
    var c3 = (aff && /\b5\b/.test(aff.e) ? 1 : 0) + (sto && /\b6\b/.test(sto.e) ? 1 : 0);
    var c4 = lieu ? (np.test(lieu.r) ? 1 : 0) + (np.test(lieu.e) ? 1 : 0) : 0;
    if (lieu && (/nora|sami/.test(lieu.r) || /\d/.test(lieu.e))) c4 = Math.min(c4, 1);
    return [level(Math.max(0, c1), 3), level(c2, 2), level(c3, 2), level(c4, 2)];
  }
  function tableScore(crit) { return crit.reduce(function (s, c) { return s + LEVEL[c][1]; }, 0); }
  function inventedOwner(rows) {
    var l = lines(rows || []).filter(function (x) { return /lieu/.test(x.a); })[0];
    return !!l && !!l.r && !/non pr[ée]cis|à confirmer|a confirmer|inconnu|non indiqu|non désign|—|^-$/.test(l.r);
  }

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

  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = ((users[users.length - 1] || {}).content || "").toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    var hadTable = c.messages.some(function (m) { return m.role === "assistant" && readTable(m.content); });
    var hasNotes = /nora/.test(all) && /sami/.test(all);
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
    ["new", "Nouvelle conversation", "Démarre un échange vierge pour un nouveau sujet."],
    ["input", "Zone de saisie", "Vous y écrivez votre demande et collez vos notes."],
    ["send", "Envoyer", "La flèche envoie le message. La touche Entrée aussi."],
    ["history", "Échanges précédents", "Retrouvez vos conversations passées."]
  ];
  var tipEl = null, repSeen = [], repCard = null, demoRecents = false;
  function clearSpots() {
    $$(".spot-badge").forEach(function (b) { b.remove(); });
    $$(".is-spot").forEach(function (b) { b.classList.remove("is-spot"); });
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }
  function badge(fn, label, onClick) {
    var z = $(".app [data-fn='" + fn + "']");
    if (!z) return null;
    // calque fixe au-dessus de toute l'interface : jamais rognée ni atténuée
    var b = h('<button type="button" class="spot-badge"></button>');
    b.textContent = label;
    b._zone = z;
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
      var x = r.right - 16, y = r.top < 30 ? r.bottom - 12 : r.top - 16;
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

  var SEQS = ["Découvrir Claude", "Repérer et saisir", "Produire et contrôler un tableau", "Ajouter un contenu autorisé", "Comparer les deux outils", "Conserver les acquis"];
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
  var backBtn = $("[data-back]");
  backBtn.addEventListener("click", function () { if (P.i > 0) go(P.i - 1); });
  function paintNext() {
    backBtn.hidden = P.i === 0;
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

  /* ---------- Les étapes ---------- */

  var STEPS = [
    /* 3.02 · Claude est ici --------------------------------------------------- */
    {
      id: "claude", seq: 0, pill: "Premier contact", icon: "hand", title: "Voici Claude", audio: "sequence-1",
      say: "Claude est ouvert à gauche. C’est là que vous écrirez vos demandes. De mon côté, je vous guide étape par étape, et le champ de Claude s’active quand c’est à vous d’écrire.",
      render: function (pv) {
        lead(pv, "Claude est ouvert <b>à gauche</b>. Pendant tout le module, c’est là que vous écrirez vos demandes, et qu’il vous répondra.");
        pv.appendChild(h('<div class="pv-card is-blue"><span class="pv-tag is-blue"><i><svg><use href="#i-spark"/></svg></i>À gauche : Claude</span><p>Vous écrivez, il répond. Le champ en bas s’active quand c’est à vous d’écrire.</p></div>'));
        pv.appendChild(h('<div class="pv-card is-peach"><span class="pv-tag"><i><svg><use href="#i-hand"/></svg></i>À droite : votre formation</span><p>Une étape à la fois. Je vous dis quoi faire, puis je vérifie avec vous.</p></div>'));
        fb(pv, "", "Simulation pédagogique : l’interface reproduit Claude pour la formation. Les identifiants ne sont jamais demandés.");
      },
      enter: function () { claudeEl.classList.remove("flash"); void claudeEl.offsetWidth; claudeEl.classList.add("flash"); }
    },

    /* 3.03 · La tâche de Léa -------------------------------------------------- */
    {
      id: "lea", seq: 0, pill: "La situation", icon: "eye", title: "La nouvelle tâche de Léa", audio: "ecran-03",
      portrait: ["../assets/img/lea-portrait.jpg", "Léa, qui sort du point d’équipe"],
      say: "Voici Léa. Elle sort d’un point d’équipe et elle a pris quelques notes rapides. Nora prépare l’affiche pour le 5 novembre. Sami vérifie le stock pour le 6. Et le lieu de la prochaine rencontre… reste à confirmer. Ce que Léa veut maintenant, c’est un tableau simple : qui fait quoi, et pour quand. Remarquez ce dernier point : il n’a encore ni responsable ni date. Gardez-le en tête, on y reviendra.",
      render: function (pv, side) {
        side.appendChild(h('<p class="pv-lead">Léa sort du point d’équipe avec quelques notes. Elle veut savoir <b>qui fait quoi, et pour quand</b>.</p>'));
        // les repères se surlignent au moment où la voix les prononce (data-at, en secondes)
        side.appendChild(h('<div class="pv-nb"><p>Point équipe du 3 novembre.</p>' +
          '<p><span class="hl ok" data-at="4.98">Nora</span> <span class="hl" data-at="5.42">prépare l’affiche</span> pour le <span class="hl ok" data-at="6.92">5 novembre</span>.</p>' +
          '<p><span class="hl ok" data-at="7.63">Sami</span> <span class="hl" data-at="8.07">vérifie le stock</span> pour le <span class="hl ok" data-at="9.35">6 novembre</span>.</p>' +
          '<p><span class="hl" data-at="10.3">Le lieu de la prochaine rencontre</span> <span class="hl warn" data-at="12.21">reste à confirmer.</span></p></div>'));
        pv.appendChild(h('<div class="pv-grid" data-at="16.2" data-until="17.1"><div class="th">Action</div><div class="th" data-at="17.17" data-until="19.4">Responsable</div><div class="th" data-at="18.16" data-until="19.4">Échéance</div>' +
          '<div>Préparer l’affiche</div><div class="empty"></div><div class="empty"></div>' +
          '<div>Vérifier le stock</div><div class="empty"></div><div class="empty"></div>' +
          '<div class="gl" data-at="19.45">Confirmer le lieu</div><div class="empty gl" data-at="21.89"></div><div class="empty gl" data-at="22.7"></div></div>'));
        fb(pv, "ko", "<b>Point à retenir :</b> le lieu reste à confirmer. Aucun responsable n’est désigné pour cette action.");
      }
    },

    /* 3.04 · Les repères, directement sur Claude ------------------------------- */
    {
      id: "reperes", seq: 1, pill: "Repérer", icon: "eye", title: "Les repères dans Claude", audio: "ecran-04",
      say: "Repérons les éléments essentiels de l’écran. Cliquez sur chaque pastille orange.",
      render: function (pv) { lead(pv, "Regardez à gauche : quatre pastilles orange. Cliquez sur chacune pour découvrir à quoi elle sert."); },
      primary: function () { return null; },
      enter: function () {
        repSeen = [];
        autoTimer = setTimeout(function () {
          split.classList.add("panel-away");
          showTab("claude");
          REPERES.forEach(function (r, i) {
            badge(r[0], String(i + 1), function (b) {
              if (repSeen.indexOf(i) < 0) repSeen.push(i);
              b.classList.add("is-seen");
              if (r[0] === "history") { demoRecents = true; renderRecents(); toggleSide(true); }
              else toggleSide(false);
              setTimeout(function () { showTip(b, r[1], r[2]); }, r[0] === "history" ? 280 : 0);
              paintRep();
              if (repSeen.length === 4) {
                act("reperes").done = true;
                setTimeout(function () { toast("Les quatre repères sont vus"); }, 900);
                setTimeout(function () { next(); }, 2600);          // étape suivante, sans repasser par l'écran
              }
            });
          });
        }, 700);
      },
      leave: function () {
        split.classList.remove("panel-away");
        if (demoRecents) { demoRecents = false; toggleSide(false); renderRecents(); }
        if (repCard) { var c = repCard; repCard = null; c.classList.remove("is-on"); setTimeout(function () { c.remove(); }, 400); }
        showTab("story");
      }
    },

    /* 3.05 · Associer les commandes (4 points) --------------------------------- */
    {
      id: "associer", seq: 1, pill: "À vous de jouer · 4 points", icon: "clock", title: "Associer les commandes", audio: "associer",
      say: "Associez chaque besoin à sa fonction dans Claude. Sélectionnez un besoin, puis sa fonction.",
      render: function (pv) { renderMatch(pv); },
      primary: function () { return matchPrimary(); }
    },

    /* 3.06 · Une demande complète ------------------------------------------ */
    {
      id: "demande", seq: 1, pill: "Préparer", icon: "bulb", title: "Une demande complète",
      audio: "notes",
      say: "Claude ne connaît pas les notes de Léa. Une bonne demande lui donne la source, et le résultat attendu. Une pièce jointe n’est pas nécessaire pour un court texte.",
      render: function (pv) {
        lead(pv, "Claude ne connaît pas les notes de Léa. Une bonne demande lui donne <b>deux choses</b> :");
        var c1 = h('<div class="pv-card is-peach"><span class="pv-tag"><i><svg><use href="#i-doc"/></svg></i>1 · La source</span><p></p></div>');
        c1.querySelector("p").textContent = NOTES;
        var c2 = h('<div class="pv-card is-blue"><span class="pv-tag is-blue"><i><svg><use href="#i-pencil"/></svg></i>2 · Le résultat attendu</span><p></p></div>');
        c2.querySelector("p").textContent = CONSIGNE;
        pv.appendChild(c1); pv.appendChild(c2);
        fb(pv, "", "Le texte source doit accompagner votre demande : Claude ne peut pas le deviner.");
      }
    },

    /* 3.07 · Démonstration dans Claude ----------------------------------------- */
    {
      id: "demo", seq: 2, pill: "Démonstration", icon: "eye", title: "Voir la transformation", audio: "demo",
      say: "La demande est déjà écrite dans le champ de Claude. Envoyez-la. Le tableau reprend les faits, et conserve les informations manquantes.",
      render: function (pv) {
        var a = act("demo");
        if (!a.shown) {
          lead(pv, a.sent ? "La demande est partie. Claude répond, à gauche." : "La demande est déjà écrite dans le champ de Claude. <b>Envoyez-la</b> : flèche ou touche Entrée.");
          return;
        }
        lead(pv, "Voici la réponse, à gauche. Elle se vérifie en trois points :");
        var ul = h('<ul class="pv-check is-static"></ul>');
        ["Nora prépare l’affiche, pour le 5 novembre", "Sami vérifie le stock, pour le 6 novembre", "Le lieu : « non précisé », rien d’inventé"].forEach(function (t, k) {
          var li = h('<li><div class="pv-check-row"><span class="n">' + (k + 1) + "</span><span></span></div></li>");
          li.querySelector("span:last-child").textContent = t;
          ul.appendChild(li);
        });
        pv.appendChild(ul);
        fb(pv, "", "Cette réponse est un exemple relu. Claude peut formuler autrement : vérifiez les mêmes critères.");
      },
      ready: function () { return !!act("demo").shown; },
      enter: function () {
        var a = act("demo");
        if (a.shown || a.sent) return;
        newConv("demo", "Exemple relu : tableau des actions");
        renderConv();
        input.readOnly = true;
        compose(true, "Envoyez la demande : flèche ou Entrée");
        insert(PROMPT);
      },
      leave: function () { input.readOnly = false; if (!act("demo").shown) { input.value = ""; autosize(); } },
      send: function () {
        var a = act("demo"), c = conv();
        a.sent = true;
        input.readOnly = false;
        compose(false);
        c.messages.push({ role: "user", content: PROMPT });
        renderConv();
        refresh();
        setBusy(true);
        var el = addPending();
        var answer = "Voici le tableau établi à partir de vos notes :\n\n" + REF_TABLE;
        setTimeout(function () {
          streamText(el, answer, function () {
            c.messages.push({ role: "assistant", content: answer, tag: "demo" });
            setBusy(false);
            renderConv();
            a.shown = true;
            refresh();
          });
        }, 700);
      }
    },

    /* 3.08 · À vous : créez votre tableau (4 points) ----------------------------- */
    {
      id: "pratique", seq: 2, pill: "À vous de jouer · 4 points", icon: "clock", title: "Créez votre tableau", audio: "pratique",
      say: "À vous. Ouvrez une nouvelle conversation, écrivez la demande avec la source et le résultat attendu, puis envoyez-la.",
      render: function (pv) {
        var a = act("pratique");
        a.subs = a.subs || [];
        var phase = a.phase || 0;
        lead(pv, "À votre tour, dans Claude. Trois gestes :");
        stepsList(pv, [
          { html: "Ouvrez une <b>nouvelle conversation</b> : bouton ✎ en haut à gauche." },
          { html: "Écrivez la demande dans le champ : <b>la source</b> et <b>le résultat attendu</b>.", act: function (el) {
            el.appendChild(button("Placer la demande dans le champ", "pencil", function () { insert(PROMPT); }));
            el.appendChild(h('<p class="pv-hint">ou écrivez-la vous-même, avec vos mots.</p>'));
          } },
          { html: "<b>Envoyez-la</b> : flèche ou touche Entrée. Je vérifie la réponse de Claude." }
        ], phase);
        var last = a.subs[a.subs.length - 1];
        if (a.noTable) fb(pv, "ko", "<b>À reprendre :</b> la réponse ne contient pas de tableau. Précisez le résultat attendu, puis renvoyez votre demande.");
        if (last) {
          var ul = h('<ul class="pv-crit"></ul>');
          last.forEach(function (c, i) { ul.appendChild(h('<li><span class="st ' + c + '">' + LEVEL[c][0] + "</span>" + CRIT[i] + "</li>")); });
          pv.appendChild(ul);
          var ok = last.every(function (c) { return c === "ok"; });
          fb(pv, ok ? "ok" : "ko", ok ? "<b>Réussi :</b> les critères sont respectés. Contrôlez encore les faits avant utilisation."
            : "<b>À reprendre :</b> comparez avec la source. Corrigez le point indiqué, puis essayez de nouveau.");
          pv.appendChild(h('<p class="pv-tries">Soumission ' + a.subs.length + " sur 3 · meilleure version : " + fmt(a.best) + " / 4</p>"));
        }
        if (a.corrected) fb(pv, "", "<b>Correction :</b> Préparer l’affiche · Nora · 5 novembre — Vérifier le stock · Sami · 6 novembre — Confirmer le lieu · non précisé · non précisée.");
        else if (a.subs.length && !(last || []).every(function (c) { return c === "ok"; })) {
          var p = h('<p class="pv-hint"></p>');
          p.appendChild(button("Voir la correction", "eye", function () { a.corrected = true; refresh(); }));
          pv.appendChild(p);
        }
      },
      primary: function () {
        var a = act("pratique");
        if (!a.subs || !a.subs.length) return { label: "Continuer", disabled: !a.corrected, run: next };
        return { label: "Continuer", run: next, success: a.best === 4 };
      },
      enter: function () {
        var a = act("pratique");
        a.phase = a.subs && a.subs.length ? 2 : 0;
        refresh();
        if (a.phase === 0) { spot("new"); badge("new", "1"); }
        else compose(true, "Corrigez ou renvoyez votre demande");
      },
      onNewConv: function () {
        var a = act("pratique");
        if (a.phase !== 0) return;
        a.phase = 1;
        clearSpots();
        refresh();
        compose(true, "À vous : écrivez la demande");
      },
      onInsert: function () { var a = act("pratique"); if (a.phase === 1) { a.phase = 2; refresh(); if (composeTip) composeTip.textContent = "Envoyez-la : flèche ou Entrée"; } },
      onType: function () { var a = act("pratique"); if (a.phase === 1 && input.value.length > 20) { a.phase = 2; refresh(); } },
      onSend: function () { var a = act("pratique"); a.phase = 3; a.noTable = false; refresh(); },
      onAnswer: function (c, text) {
        var a = act("pratique"), rows = readTable(text);
        if (!rows) { a.noTable = true; a.phase = 2; refresh(); compose(true, "Précisez le résultat attendu"); return; }
        var crit = checkTable(rows);
        a.subs.push(crit);
        a.best = Math.max(a.best || 0, tableScore(crit));
        a.rows = rows;
        P.practiceConv = c.id;
        refresh();
        if (crit.every(function (x) { return x === "ok"; })) { compose(false); toast("Réussi : 4 critères sur 4"); autoNext(3200); }
        else if (a.subs.length < 3) compose(true, "Corrigez dans la même conversation");
        else compose(false);
      }
    },

    /* 3.09 · Le responsable absent (1 point) ---------------------------------- */
    extend({ id: "absent", seq: 2, pill: "À vous de choisir · 1 point", icon: "trophy", title: "Traiter le responsable absent", audio: "absent",
      say: "Choisissez votre réponse, puis consultez son explication." },
      quiz("absent", "Qui doit confirmer le lieu de la prochaine rencontre ?", [
        ["Nora", "Nora est chargée de l’affiche. Ne lui attribuez pas une autre tâche sans information."],
        ["Sami", "Sami vérifie le stock. La confirmation du lieu n’a pas de responsable indiqué."],
        ["La source ne le précise pas", "La bonne réponse reste « non précisé »."]], 2)),

    /* 3.10 · Demander une correction ------------------------------------------ */
    {
      id: "correction", seq: 2, pill: "Corriger", icon: "pencil", title: "Demander une correction", audio: "correction",
      say: "Si Claude ajoute une information, nommez exactement l’erreur, et le résultat attendu, dans le même échange.",
      needed: function () { var a = act("pratique"); return !!(a.rows && inventedOwner(a.rows)) && !act("correction").done; },
      render: function (pv) {
        var a = act("correction");
        var card = h('<div class="pv-card is-blue"><span class="pv-tag is-blue"><i><svg><use href="#i-pencil"/></svg></i>La phrase de correction</span><p></p></div>');
        card.querySelector("p").textContent = "« " + CORRECTION + " »";
        if (a.need) {
          lead(pv, "Dans votre tableau, Claude a attribué la confirmation du lieu à quelqu’un. <b>Les notes ne le disent pas.</b>");
          pv.appendChild(card);
          stepsList(pv, [
            { html: "Placez la correction dans le champ, <b>dans la même conversation</b>.", act: function (el) { el.appendChild(button("Placer la correction dans le champ", "pencil", function () { insert(CORRECTION); })); } },
            { html: "<b>Envoyez-la</b>, puis contrôlez le tableau corrigé." }
          ], a.phase || 0);
          if (a.done) fb(pv, "ok", "<b>Correction appliquée.</b> Vérifiez aussi les cellules qui n’étaient pas concernées par la correction.");
          else if (a.fail) fb(pv, "ko", "<b>À reprendre :</b> le lieu a encore un responsable. Renvoyez la correction.");
        } else {
          lead(pv, a.done ? "Le tableau est maintenant juste." : "Votre tableau n’a rien inventé. Si un jour Claude ajoute une information, nommez l’erreur et le résultat attendu, <b>dans le même échange</b> :");
          pv.appendChild(card);
          fb(pv, "", "Vérifiez aussi les cellules qui n’étaient pas concernées par la correction.");
        }
      },
      ready: function () { var a = act("correction"); return !a.need || a.done; },
      enter: function () {
        var a = act("correction");
        a.need = this.needed();
        refresh();
        if (a.need) { if (P.practiceConv) openConv(P.practiceConv); highlightRow(2); compose(true, "À vous : placez la correction"); }
      },
      onInsert: function () { var a = act("correction"); if (a.need) { a.phase = 1; refresh(); if (composeTip) composeTip.textContent = "Envoyez-la : flèche ou Entrée"; } },
      onAnswer: function (c, text) {
        var a = act("correction"), rows = readTable(text);
        if (!a.need) return;
        if (rows && !inventedOwner(rows)) { a.done = true; a.fail = false; compose(false); refresh(); autoNext(3400); }
        else { a.fail = true; refresh(); }
      }
    },

    /* 3.11 · Joindre ou coller -------------------------------------------------- */
    {
      id: "joindre", seq: 3, pill: "Découvrir", icon: "hand", title: "Joindre ou coller",
      say: "Un document autorisé peut être joint, si la fonction existe. Pour un court texte, le coller suffit. Cliquez sur le plus, dans le champ de Claude.",
      render: function (pv) {
        var a = act("joindre");
        lead(pv, "Un document autorisé peut être joint si la fonction existe. <b>Pour un court texte, le coller suffit.</b>");
        stepsList(pv, [{ html: "Cliquez sur <b>« + »</b> dans le champ de Claude pour voir l’ajout d’un fichier." }], a.done ? 1 : 0);
        if (a.done) fb(pv, "", "Le fichier fictif est ajouté. Le contenu à analyser doit être accessible dans la conversation. Gardez toujours la source : la lecture d’un fichier peut être incomplète.");
      },
      ready: function () { return !!act("joindre").done; },
      enter: function () { attachBtn.disabled = false; spot("attach"); badge("attach", "+"); app.classList.add("focus-compose"); showTab("claude"); },
      onAttach: function () { var a = act("joindre"); a.done = true; clearSpots(); app.classList.remove("focus-compose"); refresh(); showTab("story"); },
      leave: function () { $("[data-attach-chip]").hidden = true; app.classList.remove("focus-compose"); }
    },

    /* 3.12 · Repérer une limite (1 point) ------------------------------------ */
    extend({ id: "limite", seq: 3, pill: "À vous de choisir · 1 point", icon: "trophy", title: "Repérer une limite",
      say: "Claude ne retrouve pas une phrase dans une image floue. Que faites-vous ?" },
      (function () {
        var qz = quiz("limite", "Claude ne retrouve pas une phrase dans une image floue. Que faites-vous ?", [
          ["Je fournis une source lisible et je vérifie", "Une meilleure source réduit l’incertitude. Le contrôle reste nécessaire."],
          ["Je lui demande d’inventer ce qui manque", "Une donnée absente doit être signalée, pas inventée."],
          ["Je considère sa première réponse comme exacte", "Une lecture incomplète peut produire une réponse erronée."]], 0);
        var r = qz.render;
        qz.render = function (pv) {
          pv.appendChild(h('<div class="pv-blur" aria-hidden="true"><div class="is-blur"><small>Image floue</small><span>Le lieu de la prochaine rencontre reste à confirmer.</span></div><div class="is-clear"><small>Texte lisible</small>Le lieu de la prochaine rencontre reste à confirmer.</div></div>'));
          r(pv);
        };
        return qz;
      })()),

    /* 3.13 · Une comparaison équitable --------------------------------------- */
    {
      id: "comparer", seq: 4, pill: "À vous de jouer", icon: "clock", title: "Une comparaison équitable",
      say: "La comparaison porte sur un même travail, avec les mêmes informations. Ouvrez une nouvelle conversation, et envoyez à Claude le prompt du module 2.",
      render: function (pv) {
        var a = act("comparer");
        lead(pv, "Au module 2, ChatGPT a reçu cette demande. Envoyez <b>exactement la même</b> à Claude.");
        var w = h('<div class="pv-win"><div class="pv-win-h">ChatGPT<small>première réponse, conservée</small></div><div class="pv-win-b"></div></div>');
        w.lastChild.textContent = CHATGPT_ANSWER;
        pv.appendChild(w);
        stepsList(pv, [
          { html: "Ouvrez une <b>nouvelle conversation</b> : bouton ✎ en haut à gauche." },
          { html: "Placez le prompt du module 2 dans le champ.", act: function (el) { el.appendChild(button("Placer le prompt dans le champ", "pencil", function () { insert(ACCUEIL_PROMPT); })); } },
          { html: "<b>Envoyez-le</b>, puis lisez la première réponse de Claude." }
        ], a.phase || 0);
        if (a.done) fb(pv, "ok", "Les deux premières réponses sont prêtes. Ne comparez pas un premier brouillon avec une version déjà corrigée.");
      },
      ready: function () { return !!act("comparer").done; },
      enter: function () { var a = act("comparer"); a.phase = a.done ? 3 : 0; refresh(); if (!a.done) { spot("new"); badge("new", "1"); } },
      onNewConv: function () { var a = act("comparer"); if (a.phase !== 0) return; a.phase = 1; clearSpots(); refresh(); compose(true, "À vous : placez le prompt"); },
      onInsert: function () { var a = act("comparer"); if (a.phase === 1) { a.phase = 2; refresh(); if (composeTip) composeTip.textContent = "Envoyez-le : flèche ou Entrée"; } },
      onSend: function () { var a = act("comparer"); a.phase = 3; refresh(); },
      onAnswer: function (c, text) { var a = act("comparer"); if (a.done) return; a.done = true; P.claudeAnswer = text; compose(false); refresh(); autoNext(3200); }
    },

    /* 3.14 · Une grille de lecture -------------------------------------------- */
    {
      id: "grille", seq: 4, pill: "Comparer", icon: "eye", title: "Une grille de lecture",
      say: "Votre préférence doit s’appuyer sur des critères observables. Comparez les deux réponses, critère par critère.",
      render: function (pv) {
        var a = act("grille");
        a.v = a.v || {};
        lead(pv, "Comparez les deux premières réponses : <b>Claude à gauche</b>, ChatGPT ci-dessous.");
        var w = h('<div class="pv-win"><div class="pv-win-h">ChatGPT<small>première réponse</small></div><div class="pv-win-b"></div></div>');
        w.lastChild.textContent = CHATGPT_ANSWER;
        pv.appendChild(w);
        var CRITS = ["Date et horaires", "Messagerie", "Absence d’ajout", "Longueur demandée"];
        var t = h('<table class="pv-rub"><thead><tr><th>Critère</th><th>ChatGPT</th><th>Claude</th></tr></thead><tbody></tbody></table>');
        CRITS.forEach(function (c, i) {
          var tr = document.createElement("tr");
          var td0 = document.createElement("td"); td0.textContent = c; tr.appendChild(td0);
          ["gpt", "claude"].forEach(function (tool) {
            var td = document.createElement("td");
            var sel = h('<select><option value="">Choisir…</option><option value="conforme">Conforme</option><option value="corriger">À corriger</option><option value="impossible">Impossible à vérifier</option></select>');
            sel.value = a.v[tool + i] || "";
            sel.dataset.v = sel.value;
            sel.setAttribute("aria-label", c + " · " + (tool === "gpt" ? "ChatGPT" : "Claude"));
            sel.onchange = function () { a.v[tool + i] = sel.value; refresh(); };
            td.appendChild(sel); tr.appendChild(td);
          });
          t.lastChild.appendChild(tr);
        });
        pv.appendChild(t);
        if (Object.keys(a.v).filter(function (k) { return a.v[k]; }).length === 8) fb(pv, "", "Un résultat peut être agréable à lire et oublier un horaire. Signalez les deux aspects séparément.");
      },
      enter: function () { if (P.claudeAnswer) { var c = P.convs.filter(function (x) { return x.messages.some(function (m) { return m.content === P.claudeAnswer; }); })[0]; if (c) openConv(c.id); } }
    },

    /* 3.15 · Choisir une conclusion (1 point) --------------------------------- */
    extend({ id: "conclusion", seq: 4, pill: "À vous de choisir · 1 point", icon: "trophy", title: "Choisir une conclusion",
      say: "Les deux réponses sont bonnes, mais l’une est plus courte. Quelle conclusion est justifiée ?" },
      quiz("conclusion", "Les deux réponses sont bonnes, mais l’une est plus courte. Quelle conclusion est justifiée ?", [
        ["Cet outil est toujours meilleur", "Un seul essai ne permet pas ce classement général."],
        ["Cette réponse est plus adaptée à cette affiche", "La conclusion est limitée à cette tâche et à ces critères."],
        ["L’autre outil ne sait pas rédiger", "Une différence de longueur ne démontre pas une incapacité."]], 1)),

    /* 3.16 · Votre préférence argumentée -------------------------------------- */
    {
      id: "preference", seq: 4, pill: "À vous d’écrire", icon: "pencil", title: "Votre préférence argumentée",
      say: "Complétez la phrase, en citant un élément visible du résultat.",
      render: function (pv) {
        var a = act("preference");
        var PREFIX = "Pour cette tâche, je retiens cette réponse parce que ";
        lead(pv, "Complétez la phrase, en citant <b>un élément visible</b> du résultat.");
        var ta = h('<textarea class="pv-area" aria-label="Votre argument"></textarea>');
        ta.value = a.text || PREFIX;
        ta.oninput = function () { a.text = ta.value; paintNext(); };
        pv.appendChild(ta);
        var chips = h('<div class="pv-chips"></div>');
        ["les horaires sont présents", "le message est plus court", "aucune information n’est ajoutée"].forEach(function (x) {
          var b = h("<button type='button'></button>"); b.textContent = x;
          b.onclick = function () { ta.value = (ta.value.trim().length > PREFIX.trim().length ? ta.value.trim() + ", " : PREFIX) + x + "."; a.text = ta.value; paintNext(); };
          chips.appendChild(b);
        });
        pv.appendChild(chips);
        if (a.saved) fb(pv, "ok", "Un argument précis vous aidera à choisir selon vos besoins futurs.");
      },
      primary: function () {
        var a = act("preference"), okLen = (a.text || "").replace("Pour cette tâche, je retiens cette réponse parce que", "").trim().length > 3;
        if (a.saved) return { label: "Continuer", run: next };
        return { label: "Enregistrer", disabled: !okLen, run: function () { a.saved = true; refresh(); autoNext(2600); } };
      }
    },

    /* 3.17 · Votre résultat ----------------------------------------------------- */
    {
      id: "resultat", seq: 5, pill: "Bilan", icon: "trophy", title: "Votre résultat",
      say: "Le score montre les activités réussies. Une tâche réelle doit aussi être contrôlée.",
      render: function (pv) {
        var items = scoreItems(), total = items.reduce(function (s, x) { return s + x.pts; }, 0);
        pv.appendChild(h('<p class="pv-score">' + fmt(total) + " <small>sur 11</small></p>"));
        pv.appendChild(h('<div class="pv-bar"><i style="width:' + (total / 11 * 100) + '%"></i><b style="left:70%"></b></div>'));
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
        var practice = (act("pratique").subs || []).length > 0;
        if (!practice) fb(pv, "ko", "<b>Pratique non faite :</b> terminez la manipulation dans Claude pour valider la prise en main.");
        if (practice && total / 11 >= 0.7) fb(pv, "ok", "<b>Seuil atteint :</b> module validé.");
        else if (total / 11 < 0.7) fb(pv, "ko", "<b>Sous le seuil :</b> reprenez les activités indiquées, puis tentez une nouvelle réponse.");
        P.validated = practice && total / 11 >= 0.7;
      }
    },

    /* 3.18 · Votre fiche ---------------------------------------------------------- */
    {
      id: "fiche", seq: 5, pill: "À conserver", icon: "check", title: "Mes premiers gestes dans Claude",
      say: "Gardez cette fiche pour votre prochaine utilisation.",
      render: function (pv) {
        var a = act("fiche");
        pv.appendChild(h('<div class="pv-card pv-sheet"><ol><li><i>1</i>Fournir la source.</li><li><i>2</i>Préciser le tableau attendu.</li><li><i>3</i>Signaler ce qui manque.</li><li><i>4</i>Comparer les résultats sur les mêmes critères.</li></ol></div>'));
        var p = h("<p></p>");
        p.appendChild(button(a.saved ? "Fiche enregistrée" : "Enregistrer dans Mes repères", "check", function () { a.saved = true; S.reperes = true; save(); refresh(); }));
        pv.appendChild(p);
        if (a.saved) fb(pv, "ok", "Fiche enregistrée dans Mes repères.");
      },
      primary: function () { return null; }
    }
  ];

  function stepIdx(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i; return 0; }
  function resetAct(id) {
    var a = act(id);
    a.history = (a.history || []).concat([{ tries: a.tries || a.subs, best: a.best }]);
    var best = a.best;
    P.act[id] = { history: a.history, best: best };
  }
  function scoreItems() {
    var best = function (id) { return (P.act[id] || {}).best || 0; };
    return [
      { id: "associer", idx: stepIdx("associer"), label: "Associer les commandes", pts: best("associer"), max: 4 },
      { id: "pratique", idx: stepIdx("pratique"), label: "Créer votre tableau", pts: best("pratique"), max: 4 },
      { id: "absent", idx: stepIdx("absent"), label: "Traiter le responsable absent", pts: best("absent"), max: 1 },
      { id: "limite", idx: stepIdx("limite"), label: "Repérer une limite", pts: best("limite"), max: 1 },
      { id: "conclusion", idx: stepIdx("conclusion"), label: "Choisir une conclusion", pts: best("conclusion"), max: 1 }
    ];
  }

  // 3.07 : met en valeur une ligne du tableau affiché par Claude
  function highlightRow(r) {
    $$(".msg--ai .body td.cell-hl").forEach(function (td) { td.classList.remove("cell-hl"); });
    var tables = $$(".msg--ai .body table", messagesEl), t = tables[tables.length - 1];
    if (!t) return;
    var row = t.tBodies[0] && t.tBodies[0].rows[r];
    if (!row) return;
    Array.prototype.forEach.call(row.cells, function (td) { td.classList.add("cell-hl"); });
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    showTab("claude");
  }

  /* ---------- 3.05 : relier (clic sur un besoin, puis sur sa fonction) ---------- */

  var NEEDS = [["Démarrer un sujet", "new"], ["Saisir les notes", "input"], ["Soumettre la demande", "send"], ["Reprendre un échange", "history"]];
  var FNS = [["history", "Historique"], ["send", "Envoyer"], ["new", "Nouvelle conversation"], ["input", "Zone de saisie"]];
  var FN_COLORS = { history: "#7c3aed", send: "#0d9488", new: "#2563eb", input: "#db2777" };
  function renderMatch(pv) {
    var a = act("associer");
    a.links = a.links || {};
    a.tries = a.tries || [];
    lead(pv, "Associez chaque besoin à sa fonction dans Claude. Cliquez sur un besoin, puis sur sa fonction.");
    var m = h('<div class="pv-match"><svg class="pv-lines"></svg><div class="pv-col need"><h3>Besoins</h3></div><div class="pv-col fn"><h3>Fonctions dans Claude</h3></div></div>');
    var locked = a.done || a.checked;
    NEEDS.forEach(function (n, k) {
      var b = h('<button type="button" class="mc"><span></span><span class="dot"></span></button>');
      b.firstChild.textContent = n[0];
      b.dataset.k = k;
      var fn = a.links[k];
      if (fn) { b.classList.add("is-linked"); b.style.setProperty("--c", FN_COLORS[fn]); }
      if (a.sel === k) b.classList.add("is-sel");
      if (locked && fn) b.classList.add(fn === n[1] ? "is-good" : "is-bad");
      b.disabled = !!locked || (a.good && a.good[k]);
      b.onclick = function () { a.sel = k; refresh(); };
      m.children[1].appendChild(b);
    });
    FNS.forEach(function (f) {
      var b = h('<button type="button" class="mc fn"><span class="dot"></span><span></span></button>');
      b.lastChild.textContent = f[1];
      b.dataset.fn = f[0];
      var used = Object.keys(a.links).some(function (k) { return a.links[k] === f[0]; });
      if (used) { b.classList.add("is-linked"); b.style.setProperty("--c", FN_COLORS[f[0]]); }
      b.disabled = !!locked;
      b.onclick = function () {
        if (a.sel === null || a.sel === undefined) { toast("Choisissez d’abord un besoin, à gauche."); return; }
        a.links[a.sel] = f[0];
        var nextK = NEEDS.map(function (n, k) { return k; }).filter(function (k) { return !a.links[k]; })[0];
        a.sel = nextK === undefined ? null : nextK;
        refresh();
      };
      m.children[2].appendChild(b);
    });
    pv.appendChild(m);
    requestAnimationFrame(function () { drawLinks(m, a, locked); });
    if (a.checked || a.done) {
      var last = a.tries[a.tries.length - 1];
      fb(pv, last === 4 ? "ok" : "ko", last === 4 ? "<b>Réussi :</b> 4 associations exactes sur 4." : "<b>À reprendre :</b> " + last + " association" + (last > 1 ? "s" : "") + " exacte" + (last > 1 ? "s" : "") + " sur 4.");
    }
    if (a.done && a.best < 4) fb(pv, "", "<b>Correction :</b> Démarrer un sujet → Nouvelle conversation · Saisir les notes → Zone de saisie · Soumettre la demande → Envoyer · Reprendre un échange → Historique.");
    if (a.checked && !a.done) { var p = h('<p class="pv-hint"></p>'); p.appendChild(button("Voir la correction", "eye", function () { a.done = true; a.checked = false; refresh(); })); pv.appendChild(p); }
    pv.appendChild(h('<p class="pv-tries">4 points · essai ' + Math.min(a.tries.length + (a.done || a.checked ? 0 : 1), 2) + " sur 2</p>"));
  }
  function drawLinks(m, a, locked) {
    var svg = m.querySelector(".pv-lines"), box = m.getBoundingClientRect();
    svg.innerHTML = "";
    Object.keys(a.links).forEach(function (k) {
      var nb = m.querySelector('.mc[data-k="' + k + '"]'), fbn = m.querySelector('.mc[data-fn="' + a.links[k] + '"]');
      if (!nb || !fbn) return;
      var r1 = nb.getBoundingClientRect(), r2 = fbn.getBoundingClientRect();
      var x1 = r1.right - box.left - 12, y1 = r1.top + r1.height / 2 - box.top, x2 = r2.left - box.left + 12, y2 = r2.top + r2.height / 2 - box.top, dx = (x2 - x1) * .55;
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2);
      var good = a.links[k] === NEEDS[k][1];
      path.setAttribute("stroke", locked ? (good ? "#1a9a5a" : "#d93636") : FN_COLORS[a.links[k]]);
      svg.appendChild(path);
      path.style.setProperty("--len", path.getTotalLength());
      if (a.drawn && a.drawn[k] === a.links[k]) { path.style.animation = "none"; path.style.strokeDashoffset = 0; }
    });
    a.drawn = JSON.parse(JSON.stringify(a.links));
  }
  function matchPrimary() {
    var a = act("associer");
    a.links = a.links || {}; a.tries = a.tries || [];
    if (a.done) return { label: "Continuer", run: next, success: a.best === 4 };
    if (a.checked) return { label: "Réessayer", run: function () {
      Object.keys(a.links).forEach(function (k) { if (a.links[k] !== NEEDS[k][1]) delete a.links[k]; });
      a.good = {}; Object.keys(a.links).forEach(function (k) { a.good[k] = true; });
      a.sel = NEEDS.map(function (n, k) { return k; }).filter(function (k) { return !a.links[k]; })[0];
      a.checked = false; refresh();
    } };
    return { label: "Valider", disabled: Object.keys(a.links).length < 4, run: function () {
      var score = NEEDS.filter(function (n, k) { return a.links[k] === n[1]; }).length;
      a.tries.push(score);
      a.best = Math.max(a.best || 0, score);
      a.sel = null;
      if (score === 4 || a.tries.length >= 2) a.done = true; else a.checked = true;
      refresh();
      if (score === 4) autoNext(2800);
    } };
  }
  window.addEventListener("resize", function () { var m = $(".pv-match", bodyEl); if (m) drawLinks(m, act("associer"), act("associer").done || act("associer").checked); });

  // carte des repères (3.04), côté Claude
  function paintRep() {
    if (!repCard) return;
    var n = repSeen.length;
    repCard.querySelector(".rep-count").innerHTML = "<b>" + n + "</b> / 4 repères";
    repCard.querySelector("p").textContent = n >= 4 ? "Tous les repères sont vus. On passe à la suite." : "Cliquez sur chaque pastille orange pour découvrir à quoi elle sert.";
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
      var m = $(".pv-match", bodyEl); if (m) drawLinks(m, act("associer"), act("associer").done || act("associer").checked);
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

  /* ---------- Introduction plein écran, puis accueil de l'assistante ---------- */

  var introFrame = $("[data-intro-frame]");
  window.addEventListener("message", function (e) {
    if (introFrame && e.source === introFrame.contentWindow && e.data && e.data.src === "atelier-intro" && e.data.type === "intro-done") closeIntro();
  });
  function openIntro() {
    stopVoice();
    introFrame.classList.remove("is-leaving");
    introFrame.hidden = false;
    introFrame.src = INTRO_URL;
  }
  var started = false;
  function closeIntro() {
    var first = !S.introDone;
    S.introDone = true; save();
    introFrame.classList.add("is-leaving");
    setTimeout(function () { introFrame.hidden = true; introFrame.removeAttribute("src"); }, 450);
    if (first || !started) { startWelcome(); return; }
    app.hidden = false;
    if (current) narrate(current);
  }

  var WELCOME_WORDS = function () { return (window.COURSE_WORDS || {}).bienvenue || []; };
  var WELCOME_TEXT = "Hey, salut ! On va apprendre à utiliser l’IA ensemble. Et quoi de mieux qu’une IA pour t’épauler ? Je vais te guider pas à pas. Suis-moi !";
  var wlGo = $("[data-wl-go]");
  var wlRaf = 0, inWelcome = false;
  function wlLoop() {
    wlRaf = 0;
    if (!inWelcome) return;
    var t = audio.currentTime;
    sayReveal(WELCOME_WORDS().filter(function (w) { return w[0] <= t + 0.04; }).length);
    if (!audio.paused) wlRaf = requestAnimationFrame(wlLoop);
  }
  // ouverture : l'interface de Claude, l'orbe au centre et le message de bienvenue mot à mot ;
  // le panneau de formation est replié et s'ouvre à la fin du message
  function startWelcome() {
    inWelcome = false;
    stopVoice();
    cues = [];
    app.hidden = false;
    app.classList.add("is-welcome");
    saying(true);
    split.classList.add("panel-away");
    compose(false);
    renderConv();
    inWelcome = true;
    sayText(WELCOME_TEXT);
    if (!S.sound) { sayProgress(1); showGo("Continuer"); return; }
    audio.src = "../assets/audio/bienvenue.mp3";
    audio.dataset.id = "bienvenue";
    loadEnvelope("bienvenue");
    audio.addEventListener("play", function onPlay() { audio.removeEventListener("play", onPlay); wlStarted = true; wlGo.classList.remove("is-on"); if (!wlRaf) wlLoop(); });
    audio.addEventListener("ended", function onEnd() {
      audio.removeEventListener("ended", onEnd);
      if (!inWelcome) return;
      sayProgress(1);
      setTimeout(leaveWelcome, 900);                // fin du message : le panneau de formation apparaît
    });
    var p = audio.play();
    if (p && p.catch) p.catch(function () { showGo("Commencer"); });   // lecture bloquée par le navigateur : un clic la lance
  }
  var wlStarted = false;
  function showGo(label) { wlGo.firstChild.textContent = label; wlGo.hidden = false; requestAnimationFrame(function () { wlGo.classList.add("is-on"); }); }
  wlGo.addEventListener("click", function () {
    if (!inWelcome) return;
    if (!wlStarted && S.sound) { audio.play().catch(function () { leaveWelcome(); }); return; }
    leaveWelcome();
  });
  function leaveWelcome() {
    if (!inWelcome) return;
    inWelcome = false;
    audio.pause();
    sayProgress(1);
    wlGo.classList.remove("is-on");
    app.classList.remove("is-welcome");
    split.classList.remove("panel-away");          // le panneau glisse, l'orbe se recentre avec Claude
    saying(false);
    setTimeout(beginParcours, 800);
  }
  function beginParcours() { started = true; go(0); }

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
      return { step: st() ? st().id : null, score: total, max: 11, validated: !!P.validated, activities: items, practice: (act("pratique").subs || []).length, responses: P.stats };
    }
  };
})();
