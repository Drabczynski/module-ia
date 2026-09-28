/* ==========================================================================
   Module 3 — version immersive (prototype : écrans 3.04 à 3.10)
   Le coach guide l'apprenant ; la conversation passe par /api/chat (Claude)
   ou, si le serveur n'est pas joignable, par des réponses simulées.
   ========================================================================== */
(function () {
  "use strict";

  var API = window.IMMERSIF_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var FIRST_BYTE_TIMEOUT = 20000;          // storyboard : au-delà de 20 s, proposer de réessayer
  var STORE = "module3-immersif";

  var NOTES = "Point équipe du 3 novembre. Nora prépare l’affiche pour le 5 novembre. Sami vérifie le stock pour le 6 novembre. Le lieu de la prochaine rencontre reste à confirmer.";
  var CONSIGNE = "À partir des notes suivantes, crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris « non précisé » pour une donnée absente.";
  var PROMPT_COMPLET = CONSIGNE + "\n\nNotes : " + NOTES;
  var CORRECTION = "Le responsable de la confirmation du lieu n’est pas indiqué. Remplace-le par non précisé.";
  var REFERENCE_ANSWER =
    "Voici le tableau établi à partir de vos notes :\n\n" +
    "| Action | Responsable | Échéance |\n|---|---|---|\n" +
    "| Préparer l’affiche | Nora | 5 novembre |\n" +
    "| Vérifier le stock | Sami | 6 novembre |\n" +
    "| Confirmer le lieu de la prochaine rencontre | non précisé | non précisé |";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("[data-app]");
  var coach = $("[data-coach]");
  var body = $("[data-coach-body]");
  var nextBtn = $("[data-next]");
  var prevBtn = $("[data-prev]");
  var messagesEl = $("[data-messages]");
  var input = $("[data-input]");
  var composer = $("[data-composer]");
  var sendBtn = $(".send");
  var recentsEl = $("[data-recents]");
  var connEl = $("[data-conn]");
  var noteEl = $("[data-composer-note]");
  var chatEl = $(".chat");

  /* ---------- État (mémorisé dans le navigateur, futur suivi SCORM) ---------- */

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.step = S.step || 0;
  S.convs = S.convs || [];
  S.learner = S.learner || Math.random().toString(36).slice(2, 12);
  S.scores = S.scores || {};
  S.practice = S.practice || { live: 0, simulated: 0 };
  S.forceSim = !!S.forceSim;
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }

  var mode = "sim";            // "live" (Claude via l'API) ou "sim" (réponses simulées)
  var busy = false;

  /* ---------- Rendu Markdown minimal (paragraphes, listes, tableaux, gras) ---------- */

  function esc(t) { return t.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }
  function cells(line) {
    var p = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    return p.map(function (x) { return x.trim(); });
  }
  function markdown(src) {
    var lines = src.replace(/\r/g, "").split("\n");
    var out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        var head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push("<table><thead><tr>" + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>");
        continue;
      }
      if (/^\s*[-*•]\s+/.test(l)) {
        var items = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; }
        out.push("<ul>" + items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>");
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(l)) {
        var its = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { its.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
        out.push("<ol>" + its.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ol>");
        continue;
      }
      if (/^\s*#{1,6}\s+/.test(l)) { out.push("<p><strong>" + inline(l.replace(/^\s*#+\s+/, "")) + "</strong></p>"); i++; continue; }
      if (!l.trim()) { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#)/.test(lines[i])) { para.push(lines[i]); i++; }
      if (!para.length) { para.push(l); i++; }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }

  // dernier tableau Markdown d'une réponse : lignes [action, responsable, échéance]
  function lastTable(text) {
    var lines = (text || "").replace(/\r/g, "").split("\n"), tables = [], cur = null;
    lines.forEach(function (l) {
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|?\s*:?-{2,}/.test(l)) return;
        cur = cur || [];
        cur.push(cells(l).map(function (c) { return c.replace(/\*\*/g, ""); }));
      } else if (cur) { tables.push(cur); cur = null; }
    });
    if (cur) tables.push(cur);
    var t = tables[tables.length - 1];
    if (!t) return null;
    if (/action/i.test(t[0][0] || "")) t = t.slice(1);
    return t;
  }

  /* ---------- Contrôle du tableau (mêmes critères que le module) ---------- */

  var CRIT_LABELS = ["Actions conformes", "Responsables exacts", "Échéances exactes", "Inconnues signalées"];
  var STATUS = { ok: "Respecté", part: "Partiel", ko: "À reprendre" };

  function lieuRow(rows) {
    return (rows || []).map(function (r) { return { a: (r[0] || "").toLowerCase(), r: (r[1] || "").toLowerCase(), e: (r[2] || "").toLowerCase() }; })
      .filter(function (l) { return /lieu/.test(l.a); })[0];
  }
  function checkTable(rows) {
    var lines = rows.map(function (r) { return { a: (r[0] || "").toLowerCase(), r: (r[1] || "").toLowerCase(), e: (r[2] || "").toLowerCase() }; });
    var find = function (re) { return lines.filter(function (l) { return re.test(l.a); })[0]; };
    var aff = find(/affiche/), sto = find(/stock/), lieu = find(/lieu/);
    var np = /non pr[ée]cis[ée]e?/;
    var level = function (n, of) { return n === of ? "ok" : n > 0 ? "part" : "ko"; };
    var c1 = [aff, sto, lieu].filter(Boolean).length;
    var c2 = (aff && /nora/.test(aff.r) ? 1 : 0) + (sto && /sami/.test(sto.r) ? 1 : 0);
    var c3 = (aff && /\b5\b/.test(aff.e) ? 1 : 0) + (sto && /\b6\b/.test(sto.e) ? 1 : 0);
    var c4 = lieu ? (np.test(lieu.r) ? 1 : 0) + (np.test(lieu.e) ? 1 : 0) : 0;
    if (lieu && (/nora|sami/.test(lieu.r) || /\d/.test(lieu.e))) c4 = Math.min(c4, 1);
    return [level(c1, 3), level(c2, 2), level(c3, 2), level(c4, 2)];
  }
  function inventedOwner(rows) {
    var l = lieuRow(rows);
    return !!l && !!l.r && !/non pr[ée]cis|à confirmer|a confirmer|inconnu|non indiqu|non désign|—|^-$/.test(l.r);
  }

  /* ---------- Réponses simulées (mode de secours, sans serveur) ---------- */

  function simulate(conv) {
    var users = conv.messages.filter(function (m) { return m.role === "user"; });
    var last = (users[users.length - 1] || {}).content || "";
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    var t = last.toLowerCase();
    var hadTable = conv.messages.some(function (m) { return m.role === "assistant" && lastTable(m.content); });
    var hasNotes = /nora/.test(all) && /sami/.test(all);
    var wantsTable = /tableau|table|colonnes?/.test(t) || (/tableau/.test(all) && /nora/.test(t));
    var signals = /non pr[ée]cis|absente?|manquant|inconnu|n.invente|seulement les notes|uniquement les notes/.test(all);
    var correction = hadTable && /(remplace|corrige|modifie|n.est pas indiqu|pas de responsable|non pr[ée]cis)/.test(t);

    if (correction) {
      return "Vous avez raison, les notes n’indiquent pas qui confirme le lieu. Voici le tableau corrigé :\n\n" + REFERENCE_ANSWER.split("\n\n")[1];
    }
    if (hasNotes && wantsTable) {
      if (signals) return REFERENCE_ANSWER;
      // sans consigne sur les données absentes, la simulation « complète » : c'est l'erreur étudiée à l'écran 3.10
      return "Voici un tableau des actions à partir de vos notes :\n\n| Action | Responsable | Échéance |\n|---|---|---|\n" +
        "| Préparer l’affiche | Nora | 5 novembre |\n| Vérifier le stock | Sami | 6 novembre |\n" +
        "| Confirmer le lieu de la prochaine rencontre | Nora | 5 novembre |\n\n" +
        "J’ai confié la confirmation du lieu à Nora, qui prépare déjà l’affiche.";
    }
    if (wantsTable && !hasNotes) {
      return "Avec plaisir. Pouvez-vous me transmettre les notes à organiser ? Je n’ai pas accès à vos documents : collez simplement le texte dans votre message.";
    }
    if (hasNotes && /nora/.test(t)) {
      return "Voici ce que je retiens de ces notes :\n\n- Nora prépare l’affiche pour le 5 novembre.\n- Sami vérifie le stock pour le 6 novembre.\n- Le lieu de la prochaine rencontre reste à confirmer.\n\nSouhaitez-vous que je les présente sous forme de tableau (action, responsable, échéance) ?";
    }
    if (/^(bonjour|salut|hello|bonsoir|coucou)\b/.test(t.trim())) return "Bonjour ! Comment puis-je vous aider aujourd’hui ?";
    return "Je suis en mode simulé : je réponds surtout à l’exercice en cours. Collez les notes de la réunion et précisez le résultat attendu, par exemple un tableau Action, Responsable, Échéance.";
  }

  /* ---------- Conversations ---------- */

  function newConv(kind, title) {
    var c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: kind || "free", title: title || "Nouvelle conversation", messages: [] };
    S.convs.unshift(c);
    S.current = c.id;
    save();
    return c;
  }
  function conv(id) { return S.convs.filter(function (c) { return c.id === (id || S.current); })[0]; }

  function renderRecents() {
    recentsEl.innerHTML = "";
    var list = S.convs.filter(function (c) { return c.messages.length; });
    if (!list.length) { recentsEl.innerHTML = '<li class="empty">Vos échanges apparaîtront ici.</li>'; return; }
    list.forEach(function (c) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.conv = c.id;
      b.setAttribute("aria-current", c.id === S.current);
      b.innerHTML = '<svg aria-hidden="true"><use href="#i-chat"/></svg><span></span>';
      b.querySelector("span").textContent = c.title;
      li.appendChild(b);
      recentsEl.appendChild(li);
    });
  }

  function msgNode(m) {
    var el = document.createElement("div");
    if (m.role === "user") {
      el.className = "msg msg--user";
      el.innerHTML = '<div class="bubble"></div>';
      el.querySelector(".bubble").textContent = m.content;
    } else {
      el.className = "msg msg--ai";
      el.innerHTML = '<span class="av" aria-hidden="true"><svg><use href="#i-mark"/></svg></span><div class="body"></div>';
      el.querySelector(".body").innerHTML = markdown(m.content) +
        (m.tag === "demo" ? '<span class="msg-tag msg-tag--demo">Exemple relu</span>' : m.tag === "sim" ? '<span class="msg-tag">Réponse simulée</span>' : "");
    }
    return el;
  }

  function renderConv() {
    var c = conv();
    $("[data-conv-title]").textContent = c ? c.title : "Nouvelle conversation";
    messagesEl.innerHTML = "";
    if (!c || !c.messages.length) {
      messagesEl.innerHTML = '<div class="empty-state"><svg class="mark" aria-hidden="true"><use href="#i-mark"/></svg><h2>Comment puis-je vous aider ?</h2><p>Environnement de formation · dossiers fictifs uniquement</p></div>';
    } else {
      c.messages.forEach(function (m) { messagesEl.appendChild(msgNode(m)); });
    }
    var readOnly = c && c.kind === "demo";
    input.disabled = readOnly || busy;
    input.placeholder = readOnly ? "Conversation d’exemple : lecture seule" : "Écrivez votre message ici…";
    sendBtn.disabled = readOnly || busy;
    renderRecents();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function openConv(id) { S.current = id; save(); renderConv(); chatEl.classList.remove("side-open"); }

  /* ---------- Envoi d'un message ---------- */

  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; }

  function streamInto(el, text, done) {
    // affichage progressif pour les réponses simulées et l'exemple relu
    var i = 0, bodyEl = el.querySelector(".body");
    (function step() {
      i = Math.min(text.length, i + 6 + Math.floor(Math.random() * 10));
      bodyEl.innerHTML = markdown(text.slice(0, i));
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (i < text.length) setTimeout(step, 18); else done();
    })();
  }

  function addPending() {
    var el = msgNode({ role: "assistant", content: "" });
    el.querySelector(".body").innerHTML = '<span class="typing" aria-label="Réponse en cours"><i></i><i></i><i></i></span>';
    var empty = messagesEl.querySelector(".empty-state");
    if (empty) empty.remove();
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function finish(c, text, tag) {
    c.messages.push({ role: "assistant", content: text, tag: tag });
    if (tag === "sim") S.practice.simulated++; else S.practice.live++;
    busy = false;
    save();
    renderConv();
    onAssistant(c);
  }

  function replySimulated(c, pending) {
    var text = simulate(c);
    setTimeout(function () {
      streamInto(pending, text, function () { finish(c, text, "sim"); });
    }, 500);
  }

  function showError(pending, c, message) {
    pending.querySelector(".body").innerHTML = '<div class="msg-error"><p></p><div class="actions"><button type="button" class="btn-soft" data-retry>Réessayer</button><button type="button" class="btn-soft" data-use-sim>Utiliser la simulation</button></div></div>';
    pending.querySelector("p").textContent = message;
    pending.querySelector("[data-retry]").onclick = function () { pending.remove(); ask(c); };
    pending.querySelector("[data-use-sim]").onclick = function () { setMode("sim", true); pending.remove(); ask(c); };
    busy = false;
    input.disabled = sendBtn.disabled = false;
  }

  function ask(c) {
    busy = true;
    input.disabled = sendBtn.disabled = true;
    var pending = addPending();
    if (mode !== "live") { replySimulated(c, pending); return; }

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FIRST_BYTE_TIMEOUT);
    var payload = { learner: S.learner, messages: c.messages.map(function (m) { return { role: m.role, content: m.content }; }) };
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal })
      .then(function (res) {
        if (res.status === 503) { clearTimeout(timer); setMode("sim"); replySimulated(c, pending); return; }
        if (res.status === 429) { clearTimeout(timer); showError(pending, c, "La limite d’échanges du jour est atteinte. Votre travail est conservé. Vous pouvez continuer avec la simulation."); return; }
        if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
        var reader = res.body.getReader(), decoder = new TextDecoder(), text = "", started = false;
        var bodyEl = pending.querySelector(".body");
        return (function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              if (text.indexOf("\u0000ERREUR") >= 0 || !text.trim()) {
                showError(pending, c, "Claude n’a pas pu répondre. Votre travail est conservé. Réessayez ou consultez le corrigé.");
                return;
              }
              finish(c, text, "live");
              return;
            }
            if (!started) { started = true; clearTimeout(timer); }
            text += decoder.decode(r.value, { stream: true });
            bodyEl.innerHTML = markdown(text.replace("\u0000ERREUR", ""));
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return pump();
          });
        })();
      })
      .catch(function () {
        clearTimeout(timer);
        showError(pending, c, "Votre travail est conservé. Réessayez ou consultez le corrigé.");
      });
  }

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    if (targetMode) return;
    var text = input.value.trim();
    var c = conv();
    if (!text || busy || !c || c.kind === "demo") return;
    c.messages.push({ role: "user", content: text });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 42) + (text.length > 42 ? "…" : "");
    input.value = "";
    autosize();
    save();
    renderConv();
    ask(c);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
  });
  input.addEventListener("input", autosize);

  $("[data-fn='new']").addEventListener("click", function () {
    if (targetMode) return;
    var c = conv();
    if (c && !c.messages.length && c.kind !== "demo") { input.focus(); return; }
    newConv("free");
    renderConv();
    input.focus();
    onNewConv();
  });
  recentsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-conv]");
    if (b && !targetMode) openConv(b.dataset.conv);
  });
  $("[data-side-toggle]").addEventListener("click", function () { chatEl.classList.toggle("side-open"); });
  // mobile : toucher la discussion referme la colonne des conversations
  $(".chat-main").addEventListener("click", function (e) {
    if (!e.target.closest("[data-side-toggle]") && !targetMode && !document.querySelector(".chat-side .is-spot")) chatEl.classList.remove("side-open");
  });

  function insert(text) {
    var c = conv();
    if (!c || c.kind === "demo") { newConv("free"); renderConv(); }
    input.value = input.value.trim() ? input.value.trim() + "\n\n" + text : text;
    autosize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  /* ---------- Mode réel / simulé ---------- */

  function setMode(m, forced) {
    mode = m;
    if (forced) { S.forceSim = m === "sim"; save(); }
    connEl.dataset.mode = m;
    connEl.textContent = m === "live" ? "Claude connecté" : "Mode simulé";
    connEl.title = m === "live" ? "Cliquer pour passer en simulation" : (API ? "Cliquer pour réessayer la connexion" : "Aucun serveur configuré");
    noteEl.textContent = m === "live"
      ? "Réponses générées par Claude, dans un environnement de formation. Vérifiez toujours les faits."
      : "Mode simulé : réponses préparées pour l’exercice. Elles ne reflètent pas tout le comportement de Claude.";
  }
  function probe() {
    if (!API || S.forceSim) { setMode("sim"); return; }
    connEl.textContent = "Connexion…";
    fetch(API, { method: "GET" }).then(function (r) { return r.json(); })
      .then(function (j) { setMode(j && j.live ? "live" : "sim"); })
      .catch(function () { setMode("sim"); });
  }
  connEl.addEventListener("click", function () {
    if (mode === "live") setMode("sim", true);
    else { S.forceSim = false; save(); probe(); }
  });

  /* ---------- Désignation d'une fonction de l'interface (3.04, 3.05) ---------- */

  var targetMode = null;   // fonction appelée quand l'apprenant clique sur une zone [data-fn]
  document.addEventListener("click", function (e) {
    if (!targetMode) return;
    var zone = e.target.closest(".chat [data-fn]");
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    targetMode(zone.dataset.fn, zone);
  }, true);
  document.addEventListener("focusin", function (e) {
    if (targetMode && e.target === input) { input.blur(); targetMode("input", composer); }
  });

  function zoneEl(fn) { return $(".chat [data-fn='" + fn + "']"); }
  function spot(fn, n) {
    document.querySelectorAll(".is-spot").forEach(function (el) { el.classList.remove("is-spot"); });
    document.querySelectorAll(".spot-badge").forEach(function (el) { el.remove(); });
    if (!fn) return;
    var el = zoneEl(fn);
    el.classList.add("is-spot");
    if (n) { var b = document.createElement("span"); b.className = "spot-badge"; b.textContent = n; el.appendChild(b); }
    if (fn === "new" || fn === "history") chatEl.classList.add("side-open");
    else chatEl.classList.remove("side-open");
  }
  function flash(el, ok) {
    var cls = ok ? "flash-ok" : "flash-ko";
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 900);
  }

  /* ---------- Étapes du coach ---------- */

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function fb(kind, html) { return h('<div class="fb fb--' + kind + '"><svg aria-hidden="true"><use href="#i-' + (kind === "good" ? "check" : "info") + '"/></svg><span>' + html + "</span></div>"); }

  var REPERES = [
    { fn: "new", title: "Nouvelle conversation", text: "Démarrez un échange vierge pour chaque nouvelle tâche." },
    { fn: "input", title: "Zone de saisie", text: "Écrivez votre demande ou collez vos notes." },
    { fn: "send", title: "Envoi", text: "Cliquez sur la flèche ou appuyez sur Entrée pour envoyer." },
    { fn: "history", title: "Échanges précédents", text: "Retrouvez vos conversations passées dans la colonne de gauche." }
  ];
  var MATCH = [
    { label: "Démarrer un sujet", fn: "new" },
    { label: "Saisir les notes", fn: "input" },
    { label: "Soumettre la demande", fn: "send" },
    { label: "Reprendre un échange", fn: "history" }
  ];
  var FN_NAMES = { new: "Nouvelle conversation", input: "Zone de saisie", send: "Envoyer", history: "Historique" };
  var QCM09 = {
    q: "Qui doit confirmer le lieu de la prochaine rencontre ?", answer: "c",
    opts: [["a", "Nora", "Nora est chargée de l’affiche. Ne lui attribuez pas une autre tâche sans information."],
           ["b", "Sami", "Sami vérifie le stock. La confirmation du lieu n’a pas de responsable indiqué."],
           ["c", "La source ne le précise pas", "La bonne réponse reste « non précisé »."]]
  };

  function practiceConv() {
    return S.convs.filter(function (c) { return c.id === S.practiceId; })[0];
  }
  function lastAssistant(c) {
    var a = (c ? c.messages : []).filter(function (m) { return m.role === "assistant"; });
    return a[a.length - 1];
  }

  var STEPS = [
    /* 3.04 ---------------------------------------------------------------- */
    {
      code: "3.04", title: "Les repères dans Claude",
      render: function () {
        var st = S.s04 || (S.s04 = { i: 0, seen: [] });
        if (st.seen.indexOf(st.i) < 0) { st.seen.push(st.i); save(); }      // repère affiché = repère vu
        body.appendChild(h('<p class="lead">Retrouvez une nouvelle conversation, la zone de saisie, l’envoi et les échanges précédents.</p>'));
        var ol = h('<ol class="rep-list"></ol>');
        REPERES.forEach(function (r, i) {
          var li = h('<li><span class="n">' + (i + 1) + '</span><span><b></b><span></span></span></li>');
          li.querySelector("b").textContent = r.title;
          li.querySelector("span span").textContent = r.text;
          li.classList.toggle("is-cur", i === st.i);
          li.classList.toggle("is-seen", st.seen.indexOf(i) >= 0);
          ol.appendChild(li);
        });
        body.appendChild(ol);
        var done = st.seen.length === REPERES.length;
        var acts = h('<div class="actions"></div>');
        var b = h('<button type="button" class="btn">' + (done ? "Revoir les repères" : "Repère suivant") + "</button>");
        b.onclick = function () {
          if (st.seen.indexOf(st.i) < 0) st.seen.push(st.i);
          st.i = (st.i + 1) % REPERES.length;
          save(); refresh();
        };
        acts.appendChild(b);
        body.appendChild(acts);
        if (st.seen.length === REPERES.length) body.appendChild(fb("info", "Recherchez les mêmes fonctions dans votre compte."));
        spot(REPERES[st.i].fn, st.i + 1);
      },
      leave: function () { spot(null); chatEl.classList.remove("side-open"); }
    },

    /* 3.05 ---------------------------------------------------------------- */
    {
      code: "3.05", title: "Associer les commandes",
      canContinue: function () { var m = S.s05; return m && (m.done || m.corrected); },
      render: function () {
        var m = S.s05 || (S.s05 = { i: 0, first: [], done: false });
        body.appendChild(h('<p class="lead">Associez le besoin à sa fonction dans Claude. Cliquez directement dans l’interface.</p>'));
        var dots = h('<div class="dots-progress" aria-hidden="true"></div>');
        MATCH.forEach(function (x, i) { dots.appendChild(h('<i class="' + (m.first[i] === true ? "is-ok" : m.first[i] === false ? "is-ko" : i === m.i && !m.done ? "is-cur" : "") + '"></i>')); });
        body.appendChild(dots);
        if (!m.done && !m.corrected) {
          var task = h('<div class="task"><small>Besoin ' + (m.i + 1) + " sur 4</small><strong></strong><span>Quelle fonction utilisez-vous ?</span></div>");
          task.querySelector("strong").textContent = MATCH[m.i].label;
          body.appendChild(task);
          var alt = h('<div><p class="muted">Ou choisissez la fonction dans la liste :</p><div class="actions" style="margin-top:8px"></div></div>');
          Object.keys(FN_NAMES).forEach(function (fn) {
            var b = h('<button type="button" class="btn-soft"></button>');
            b.textContent = FN_NAMES[fn];
            b.onclick = function () { answer(fn, zoneEl(fn)); };
            alt.querySelector(".actions").appendChild(b);
          });
          body.appendChild(alt);
          targetMode = answer;
          app.classList.add("is-target-mode");
        } else {
          targetMode = null;
          app.classList.remove("is-target-mode");
          var score = m.first.filter(function (x) { return x === true; }).length;
          S.scores.match = score;
          body.appendChild(fb(score === 4 ? "good" : "info", "<b>" + score + " association" + (score > 1 ? "s" : "") + " exacte" + (score > 1 ? "s" : "") + " sur 4.</b>"));
          body.appendChild(h('<div class="c-card"><h4>Correction</h4><p>Démarrer un sujet → Nouvelle conversation<br>Saisir les notes → Zone de saisie<br>Soumettre la demande → Envoyer<br>Reprendre un échange → Historique</p></div>'));
          save();
        }
        if (!m.done && !m.corrected) {
          var corr = h('<div class="actions"><button type="button" class="btn-ghost">Voir la correction</button></div>');
          corr.firstChild.onclick = function () {
            for (var k = m.i; k < MATCH.length; k++) if (m.first[k] === undefined) m.first[k] = false;
            m.corrected = true; save(); refresh();
          };
          body.appendChild(corr);
        }
        function answer(fn, el) {
          var ok = fn === MATCH[m.i].fn;
          if (m.first[m.i] === undefined) m.first[m.i] = ok;
          flash(el, ok);
          save();
          var fbWrap = body.querySelector("[data-match-fb]");
          if (fbWrap) fbWrap.remove();
          if (!ok) {
            var f = fb("bad", "<b>À reprendre :</b> ce n’est pas cette fonction. Essayez encore.");
            f.setAttribute("data-match-fb", "");
            body.appendChild(f);
            return;
          }
          targetMode = null;
          setTimeout(function () {
            if (m.i < MATCH.length - 1) m.i++; else m.done = true;
            save(); refresh();
          }, 650);
        }
      },
      leave: function () { targetMode = null; app.classList.remove("is-target-mode"); }
    },

    /* 3.06 ---------------------------------------------------------------- */
    {
      code: "3.06", title: "Préparer les notes",
      render: function () {
        body.appendChild(h('<p class="lead">Copiez seulement les notes de l’exercice. Ajoutez ce que vous attendez : un tableau avec Action, Responsable et Échéance.</p>'));
        var n = h('<div class="c-card c-card--peach"><h4>Notes</h4><p></p><div class="actions"><button type="button" class="btn">Copier les notes</button></div></div>');
        n.querySelector("p").textContent = NOTES;
        var k = h('<div class="c-card"><h4>Consigne</h4><p>Crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris non précisé pour une donnée absente.</p><div class="actions"><button type="button" class="btn">Copier le prompt complet</button></div></div>');
        n.querySelector("button").onclick = function () { insert(NOTES); showFb(); };
        k.querySelector("button").onclick = function () { insert(PROMPT_COMPLET); showFb(); };
        body.appendChild(n);
        body.appendChild(k);
        body.appendChild(h('<p class="muted">Le texte est placé dans la zone de saisie. Rien n’est envoyé automatiquement.</p>'));
        function showFb() {
          if (body.querySelector("[data-fb6]")) return;
          var f = fb("info", "Le texte source doit accompagner votre demande. Claude ne peut pas le deviner.");
          f.setAttribute("data-fb6", "");
          body.appendChild(f);
        }
      }
    },

    /* 3.07 ---------------------------------------------------------------- */
    {
      code: "3.07", title: "Voir la transformation",
      enter: function () {
        var demo = S.convs.filter(function (c) { return c.kind === "demo"; })[0];
        if (!demo) { demo = newConv("demo", "Exemple relu : tableau des actions"); }
        openConv(demo.id);
      },
      render: function () {
        var demo = S.convs.filter(function (c) { return c.kind === "demo"; })[0];
        var lvl = demo ? demo.messages.length : 0;
        body.appendChild(h('<p class="lead">Observez une demande et sa réponse, préparées et relues pour la formation.</p>'));
        var acts = h('<div class="actions"></div>');
        var b1 = h('<button type="button" class="btn">Révéler le prompt</button>');
        var b2 = h('<button type="button" class="btn">Révéler la réponse</button>');
        b1.disabled = lvl >= 1; b2.disabled = lvl !== 1;
        b1.onclick = function () {
          demo.messages.push({ role: "user", content: PROMPT_COMPLET });
          if (demo.messages.length === 1) demo.title = "Exemple relu : tableau des actions";
          save(); renderConv(); refresh();
        };
        b2.onclick = function () {
          b2.disabled = true;
          var el = addPending();
          setTimeout(function () {
            streamInto(el, REFERENCE_ANSWER, function () {
              demo.messages.push({ role: "assistant", content: REFERENCE_ANSWER, tag: "demo" });
              save(); renderConv(); refresh();
            });
          }, 500);
        };
        acts.appendChild(b1); acts.appendChild(b2);
        body.appendChild(acts);
        if (lvl >= 2) {
          body.appendChild(h('<p>Repérez les éléments communs : Nora et le 5 novembre, Sami et le 6 novembre se retrouvent dans le tableau. Le lieu, sans responsable, reste « non précisé ».</p>'));
          body.appendChild(fb("info", "Cette réponse est un exemple relu. Votre outil peut proposer une autre formulation. Vérifiez les mêmes critères."));
        }
      }
    },

    /* 3.08 ---------------------------------------------------------------- */
    {
      code: "3.08", title: "Créer votre tableau",
      enter: function () {
        var p = practiceConv();
        if (!p) { p = newConv("practice", "Tableau des actions"); S.practiceId = p.id; save(); }
        openConv(p.id);
      },
      canContinue: function () { var t = S.s08; return t && (t.subs.length || t.corrected); },
      render: function () {
        var t = S.s08 || (S.s08 = { subs: [], corrected: false });
        var p = practiceConv();
        body.appendChild(h('<p class="lead">Dans cette nouvelle conversation, utilisez le prompt et les notes. Envoyez votre demande, puis validez le tableau obtenu.</p>'));
        var helper = h('<div class="actions"><button type="button" class="btn">Copier le prompt complet</button></div>');
        helper.firstChild.onclick = function () { if (S.current !== p.id) openConv(p.id); insert(PROMPT_COMPLET); };
        body.appendChild(helper);
        var a = lastAssistant(p);
        var rows = a ? lastTable(a.content) : null;
        var validate = h('<div class="actions"><button type="button" class="btn-primary">Valider le tableau</button><button type="button" class="btn-ghost">Voir la correction</button></div>');
        var vb = validate.children[0];
        vb.disabled = !rows || t.subs.length >= 3 || (t.lastChecked === (a && a.content));
        vb.onclick = function () {
          t.subs.push(checkTable(rows));
          t.lastChecked = a.content;
          S.scores.table = t.subs.map(function (s) { return s.filter(function (x) { return x === "ok"; }).length; }).reduce(function (x, y) { return Math.max(x, y); }, 0);
          save(); refresh();
        };
        validate.children[1].onclick = function () { t.corrected = true; save(); refresh(); };
        if (!a) body.appendChild(h('<p class="muted">En attente de la réponse de Claude…</p>'));
        else if (!rows) body.appendChild(fb("bad", "La réponse ne contient pas encore de tableau. Précisez votre demande dans la conversation."));
        body.appendChild(validate);
        var last = t.subs[t.subs.length - 1];
        if (last) {
          var ok = last.every(function (s) { return s === "ok"; });
          var ul = h('<ul class="crit"></ul>');
          last.forEach(function (s, i) { ul.appendChild(h('<li><span class="cs cs--' + s + '">' + STATUS[s] + "</span>" + CRIT_LABELS[i] + "</li>")); });
          body.appendChild(ul);
          body.appendChild(fb(ok ? "good" : "bad", ok
            ? "<b>Réussi :</b> Les critères sont respectés. Contrôlez encore les faits avant utilisation."
            : "<b>À reprendre :</b> Comparez avec la source. Corrigez le point indiqué, puis essayez de nouveau."));
          body.appendChild(h('<p class="muted">Soumission ' + t.subs.length + " sur 3" + (t.subs.length < 3 && !ok ? " · demandez une correction dans la conversation, puis validez à nouveau." : "") + "</p>"));
        }
        if (t.corrected) {
          body.appendChild(h('<div class="c-card"><h4>Correction</h4><table class="ref-table"><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr><tr><td>Préparer l’affiche</td><td>Nora</td><td>5 novembre</td></tr><tr><td>Vérifier le stock</td><td>Sami</td><td>6 novembre</td></tr><tr><td>Confirmer le lieu</td><td>non précisé</td><td>non précisée</td></tr></table></div>'));
        }
      }
    },

    /* 3.09 ---------------------------------------------------------------- */
    {
      code: "3.09", title: "Traiter le responsable absent",
      canContinue: function () { return !!S.q09; },
      render: function () {
        body.appendChild(h('<p class="lead"></p>')).textContent = QCM09.q;
        body.appendChild(h('<p class="muted">À vous de choisir · 1 point</p>'));
        var box = h('<div class="qcm" role="radiogroup"></div>');
        var choice = S.q09 ? S.q09.choice : null;
        QCM09.opts.forEach(function (o) {
          var b = h('<button type="button" class="q-opt" role="radio" aria-checked="false"><span class="r"></span><span><b>' + o[0].toUpperCase() + ".</b> " + o[1] + "</span></button>");
          b.dataset.v = o[0];
          b.onclick = function () { choice = o[0]; box.querySelectorAll(".q-opt").forEach(function (x) { x.setAttribute("aria-checked", x === b); }); };
          box.appendChild(b);
        });
        body.appendChild(box);
        if (S.q09) {
          box.classList.add("is-locked");
          box.querySelectorAll(".q-opt").forEach(function (x) {
            x.setAttribute("aria-checked", x.dataset.v === S.q09.choice);
            x.classList.toggle("is-right", x.dataset.v === QCM09.answer);
            x.classList.toggle("is-wrong", x.dataset.v === S.q09.choice && S.q09.choice !== QCM09.answer);
          });
          var o = QCM09.opts.filter(function (x) { return x[0] === S.q09.choice; })[0];
          body.appendChild(fb(S.q09.correct ? "good" : "bad", o[2]));
        } else {
          var v = h('<div class="actions"><button type="button" class="btn-primary">Valider</button></div>');
          v.firstChild.onclick = function () {
            if (!choice) { v.firstChild.classList.remove("is-denied"); void v.firstChild.offsetWidth; v.firstChild.classList.add("is-denied"); return; }
            S.q09 = { choice: choice, correct: choice === QCM09.answer };
            S.scores.q09 = S.q09.correct ? 1 : 0;
            save(); refresh();
          };
          body.appendChild(v);
        }
      }
    },

    /* 3.10 ---------------------------------------------------------------- */
    {
      code: "3.10", title: "Demander une correction",
      enter: function () { var p = practiceConv(); if (p) openConv(p.id); },
      render: function () {
        var p = practiceConv();
        var a = lastAssistant(p);
        var rows = a ? lastTable(a.content) : null;
        var invented = rows && inventedOwner(rows);
        body.appendChild(h('<p class="lead">Si un responsable a été ajouté, écrivez :</p>'));
        var card = h('<div class="c-card c-card--peach"><h4>Demande de correction</h4><p></p><div class="actions"><button type="button" class="btn">Insérer dans la conversation</button></div></div>');
        card.querySelector("p").textContent = "« " + CORRECTION + " »";
        card.querySelector("button").onclick = function () { if (p && S.current !== p.id) openConv(p.id); insert(CORRECTION); };
        body.appendChild(card);
        if (invented) { S.s10invented = true; save(); }
        if (!rows) body.appendChild(h('<p class="muted">Aucun tableau dans votre conversation pour l’instant. Revenez à l’étape 3.08 pour en obtenir un.</p>'));
        else if (invented) body.appendChild(fb("bad", "<b>À reprendre :</b> dans votre tableau, un responsable a été ajouté pour la confirmation du lieu. Envoyez la correction dans le même échange."));
        else if (S.s10invented) body.appendChild(fb("good", "<b>Correction appliquée :</b> la confirmation du lieu n’a plus de responsable attribué."));
        else body.appendChild(fb("good", "Dans votre tableau, aucun responsable n’a été ajouté pour le lieu. Si cela arrive, utilisez cette phrase dans le même échange."));
        if (S.s10sent) body.appendChild(fb("info", "Vérifiez aussi les cellules qui n’étaient pas concernées par la correction."));
      }
    },

    /* Fin du prototype ----------------------------------------------------- */
    {
      code: "Bilan", title: "Fin de la démonstration",
      render: function () {
        body.appendChild(h('<p class="lead">Vous avez parcouru la partie pratique du module dans l’interface de conversation.</p>'));
        var rows = [["Associer les commandes", S.scores.match, 4], ["Tableau validé (critères respectés)", S.scores.table, 4], ["Traiter le responsable absent", S.scores.q09, 1]];
        rows.forEach(function (r) {
          var el = h('<div class="score-row"><span></span><b></b></div>');
          el.firstChild.textContent = r[0];
          el.lastChild.textContent = (r[1] == null ? "—" : r[1]) + " / " + r[2];
          body.appendChild(el);
        });
        body.appendChild(h('<p class="muted">Échanges avec Claude : ' + S.practice.live + " · réponses simulées : " + S.practice.simulated + "</p>"));
        var acts = h('<div class="actions"><button type="button" class="btn">Recommencer</button><a class="btn-soft" href="../index.html#7" style="text-decoration:none">Revenir au module</a></div>');
        acts.firstChild.onclick = function () {
          if (!confirm("Effacer votre progression dans la version immersive ?")) return;
          try { localStorage.removeItem(STORE); } catch (e) { /* rien à effacer */ }
          location.reload();
        };
        body.appendChild(acts);
      }
    }
  ];

  /* réactions du coach aux événements de la conversation */
  function onAssistant(c) {
    var st = STEPS[S.step];
    // la conversation d'exercice est celle où l'apprenant a obtenu sa dernière réponse
    if (st.code === "3.08" && c.kind !== "demo") { S.practiceId = c.id; save(); }
    if (st.code === "3.10" && c.id === S.practiceId) { S.s10sent = true; save(); }
    if (st.code === "3.08" || st.code === "3.10") refresh();
  }
  function onNewConv() { if (STEPS[S.step].code === "3.08") refresh(); }

  /* ---------- Navigation entre étapes ---------- */

  function refresh() {
    var st = STEPS[S.step];
    body.innerHTML = "";
    $("[data-step-code]").textContent = st.code;
    $("[data-step-title]").textContent = st.title;
    $("[data-progress]").style.width = ((S.step + 1) / STEPS.length * 100) + "%";
    st.render();
    prevBtn.disabled = S.step === 0;
    prevBtn.style.visibility = S.step === 0 ? "hidden" : "visible";
    nextBtn.hidden = S.step === STEPS.length - 1;
    var ok = !st.canContinue || st.canContinue();
    nextBtn.classList.toggle("is-waiting", !ok);
    nextBtn.setAttribute("aria-disabled", !ok);
  }

  function goStep(i) {
    var cur = STEPS[S.step];
    if (cur.leave) cur.leave();
    S.step = Math.max(0, Math.min(STEPS.length - 1, i));
    save();
    var st = STEPS[S.step];
    if (st.enter) st.enter();
    refresh();
    body.scrollTop = 0;
  }

  nextBtn.addEventListener("click", function () {
    var st = STEPS[S.step];
    if (st.canContinue && !st.canContinue()) {
      nextBtn.classList.remove("is-denied"); void nextBtn.offsetWidth; nextBtn.classList.add("is-denied");
      return;
    }
    goStep(S.step + 1);
  });
  prevBtn.addEventListener("click", function () { goStep(S.step - 1); });
  $("[data-coach-toggle]").addEventListener("click", function () {
    if (window.innerWidth > 900) return;
    coach.classList.toggle("is-collapsed");
    this.setAttribute("aria-expanded", !coach.classList.contains("is-collapsed"));
  });

  /* ---------- Démarrage ---------- */

  if (!conv()) newConv("free");
  setMode("sim");
  probe();
  renderConv();
  var first = STEPS[S.step];
  if (first.enter) first.enter();
  refresh();

  // point d'accès pour le futur adaptateur SCORM
  window.ImmersifTracking = {
    snapshot: function () {
      return { step: STEPS[S.step].code, scores: S.scores, practice: S.practice, mode: mode, q09: S.q09 || null, tableSubmissions: (S.s08 || {}).subs || [] };
    }
  };
})();
