/* ==========================================================================
   Module 3 · Prendre en main Claude — version immersive
   Suit le storyboard (écrans 3.01 à 3.18) : la formation à gauche, une
   simulation de l'interface de Claude à droite. Les réponses viennent de
   /api/chat (Claude) ou, sans serveur, de réponses préparées.
   Aucun retour personnalisé par IA : les contrôles sont déterministes.
   ========================================================================== */
(function () {
  "use strict";

  var API = window.IMMERSIF_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "module3-immersif-v2";
  var FIRST_BYTE_TIMEOUT = 20000;
  var MAX = 11, SEUIL = 0.7;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Textes de référence (storyboard) ---------- */

  var NOTES = "Point équipe du 3 novembre. Nora prépare l’affiche pour le 5 novembre. Sami vérifie le stock pour le 6 novembre. Le lieu de la prochaine rencontre reste à confirmer.";
  var CONSIGNE = "À partir des notes suivantes, crée un tableau Action, Responsable, Échéance. Utilise seulement les notes. Écris « non précisé » pour une donnée absente.";
  var PROMPT_COMPLET = CONSIGNE + "\n\nNotes : " + NOTES;
  var CORRECTION = "Le responsable de la confirmation du lieu n’est pas indiqué. Remplace-le par non précisé.";
  var REF_TABLE =
    "| Action | Responsable | Échéance |\n|---|---|---|\n" +
    "| Préparer l’affiche | Nora | 5 novembre |\n" +
    "| Vérifier le stock | Sami | 6 novembre |\n" +
    "| Confirmer le lieu de la prochaine rencontre | non précisé | non précisé |";
  var REF_ANSWER = "Voici le tableau établi à partir de vos notes :\n\n" + REF_TABLE;
  var ACCUEIL_PROMPT = "Rédige un message pour les visiteurs. L’accueil sera fermé le 12 octobre de 14 h à 16 h. La messagerie reste disponible. Ton courtois. Maximum 60 mots. N’invente aucune cause.";
  var CHATGPT_ANSWER = "L’accueil sera fermé le 12 octobre de 14 h à 16 h. Vous pouvez laisser un message pendant cette fermeture. Merci de votre compréhension.";
  var CLAUDE_SIM_ACCUEIL = "Madame, Monsieur,\n\nNous vous informons que l’accueil sera fermé le 12 octobre de 14 h à 16 h. Pendant cette période, notre messagerie reste à votre disposition pour toute demande.\n\nNous vous remercions de votre compréhension.";

  /* ---------- Suivi ---------- */

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.cur = S.cur || 0;               // écran affiché (index dans SCREENS, 0 = 3.01)
  S.far = S.far || 0;               // écran le plus loin atteint
  S.act = S.act || {};              // activités : essais, scores, corrigés
  S.convs = S.convs || [];
  S.learner = S.learner || Math.random().toString(36).slice(2, 12);
  S.stats = S.stats || { live: 0, sim: 0 };
  S.practice = S.practice || { declared: false, pasted: 0, simulated: 0, live: 0 };
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }
  function A(code) { return S.act[code] || (S.act[code] = {}); }

  var mode = "sim", busy = false;

  /* ---------- Éléments ---------- */

  var bodyEl = $("[data-g-body]"), messagesEl = $("[data-messages]");
  var input = $("[data-input]"), composer = $("[data-composer]"), sendBtn = $(".send");
  var work = $(".work"), shell = $("[data-shell]"), toastEl = $("[data-toast]");
  var nextBtn = $("[data-next]"), backBtn = $("[data-back]"), attachBtn = $("[data-attach]");
  var audio = $("[data-audio]");

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function txt(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
  function btn(cls, label, fn) { var b = txt("button", cls, label); b.type = "button"; if (fn) b.onclick = fn; return b; }
  function fb(ok, label, text) {
    var el = h('<div class="feedback ' + (ok ? "is-ok" : "is-ko") + '"><svg><use href="#i-' + (ok ? "check" : "bulb") + '"/></svg><span></span></div>');
    el.lastChild.textContent = (label ? label + " : " : "") + text;
    return el;
  }
  function info(text) {
    var el = h('<div class="feedback is-info"><svg><use href="#i-bulb"/></svg><span></span></div>');
    el.lastChild.textContent = text;
    return el;
  }
  function note(text) { var n = txt("div", "note", text); return n; }
  function fmt(n) { return String(n).replace(".", ","); }

  /* ---------- Markdown minimal et lecture des tableaux ---------- */

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

  // tableau lu dans un texte : Markdown (|) ou copié depuis une page (tabulations)
  function readTable(text) {
    var lines = (text || "").replace(/\r/g, "").split("\n"), tables = [], cur = null;
    lines.forEach(function (l) {
      var row = null;
      if (/^\s*\|.*\|\s*$/.test(l)) { if (/^\s*\|?\s*:?-{2,}/.test(l)) return; row = cells(l); }
      else if (l.indexOf("\t") >= 0) row = l.split("\t").map(function (x) { return x.trim(); });
      if (row) { cur = cur || []; cur.push(row.map(function (c) { return c.replace(/\*\*/g, ""); })); }
      else if (cur) { tables.push(cur); cur = null; }
    });
    if (cur) tables.push(cur);
    var t = tables[tables.length - 1];
    if (!t) return null;
    if (/action/i.test(t[0][0] || "")) t = t.slice(1);
    return t.length ? t : null;
  }

  /* ---------- Critères du tableau (écran 3.08) : 1, 0,5 ou 0 point ---------- */

  var CRIT = ["Actions conformes", "Responsables exacts", "Échéances exactes", "Inconnues signalées"];
  var LEVEL = { ok: ["Respecté", 1], part: ["Partiel", 0.5], ko: ["À reprendre", 0] };
  function lines(rows) { return rows.map(function (r) { return { a: (r[0] || "").toLowerCase(), r: (r[1] || "").toLowerCase(), e: (r[2] || "").toLowerCase() }; }); }
  function checkTable(rows) {
    var L = lines(rows), find = function (re) { return L.filter(function (l) { return re.test(l.a); })[0]; };
    var aff = find(/affiche/), sto = find(/stock/), lieu = find(/lieu/);
    var np = /non pr[ée]cis[ée]e?/;
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

  /* ---------- Séquences et écrans ---------- */

  var SEQS = ["Découvrir le second outil", "Repérer et saisir", "Produire et contrôler un tableau", "Ajouter un contenu autorisé", "Comparer les deux outils", "Conserver les acquis"];

  var QCM = {
    "3.09": { q: "Qui doit confirmer le lieu de la prochaine rencontre ?", answer: 2,
      opts: [["Nora", "Nora est chargée de l’affiche. Ne lui attribuez pas une autre tâche sans information."],
             ["Sami", "Sami vérifie le stock. La confirmation du lieu n’a pas de responsable indiqué."],
             ["La source ne le précise pas", "La bonne réponse reste « non précisé »."]] },
    "3.12": { q: "Claude ne retrouve pas une phrase dans une image floue. Que faites-vous ?", answer: 0,
      opts: [["Je fournis une source lisible et je vérifie", "Une meilleure source réduit l’incertitude. Le contrôle reste nécessaire."],
             ["Je lui demande d’inventer ce qui manque", "Une donnée absente doit être signalée, pas inventée."],
             ["Je considère sa première réponse comme exacte", "Une lecture incomplète peut produire une réponse erronée."]] },
    "3.15": { q: "Les deux réponses sont bonnes, mais l’une est plus courte. Quelle conclusion est justifiée ?", answer: 1,
      opts: [["Cet outil est toujours meilleur", "Un seul essai ne permet pas ce classement général."],
             ["Cette réponse est plus adaptée à cette affiche", "La conclusion est limitée à cette tâche et à ces critères."],
             ["L’autre outil ne sait pas rédiger", "Une différence de longueur ne démontre pas une incapacité."]] }
  };

  var CLS_CATS = [["new", "Nouvelle conversation"], ["input", "Zone de saisie"], ["send", "Envoyer"], ["history", "Historique"]];
  var CLS_TAGS = [["Démarrer un sujet", "new"], ["Saisir les notes", "input"], ["Soumettre la demande", "send"], ["Reprendre un échange", "history"]];
  var REPERES = [
    ["new", "Nouvelle conversation", "Démarre un échange vierge pour un nouveau sujet."],
    ["input", "Zone de saisie", "Vous y écrivez votre demande et collez vos notes."],
    ["send", "Envoi", "La flèche envoie le message. La touche Entrée aussi."],
    ["history", "Échanges précédents", "Vous y retrouvez vos conversations."]
  ];
  var GRID_CRIT = ["Date et horaires", "Messagerie", "Absence d’ajout", "Longueur demandée"];
  var GRID_VALS = [["conforme", "Conforme"], ["corriger", "À corriger"], ["impossible", "Impossible à vérifier"]];

  var SCREENS = [
    { code: "3.01", seq: 0, title: "Entrer dans le module", vo: "Vous allez observer une situation, essayer, puis vérifier votre résultat.", audio: "ecran-01" },
    { code: "3.02", seq: 0, title: "Ouvrir Claude", vo: "Vous utilisez la même façon de travailler : observer, essayer et vérifier.", audio: "ecran-02", render: r302 },
    { code: "3.03", seq: 0, title: "La nouvelle tâche de Léa", vo: "Un tableau peut rendre ces notes plus faciles à suivre.", audio: "ecran-03", render: r303 },
    { code: "3.04", seq: 1, title: "Les repères dans Claude", vo: "Les commandes remplissent des fonctions proches, même si leur présentation diffère.", render: r304, leave: function () { spot(null); } },
    { code: "3.05", seq: 1, title: "Associer les commandes", vo: "Sélectionnez une étiquette, puis sa catégorie. Vous pouvez aussi utiliser le clavier.", max: 4, render: r305, primary: p305, leave: function () { work.classList.remove("is-target"); } },
    { code: "3.06", seq: 1, title: "Préparer les notes", vo: "Une pièce jointe n’est pas nécessaire pour un court texte.", render: r306 },
    { code: "3.07", seq: 2, title: "Voir la transformation", vo: "Le tableau reprend les faits et conserve les informations manquantes.", claude: "demo", render: r307, enter: e307 },
    { code: "3.08", seq: 2, title: "Créer votre tableau", vo: "Essayez vous-même. Revenez ensuite vérifier votre résultat dans le module.", max: 4, claude: "practice", render: r308, enter: e308 },
    { code: "3.09", seq: 2, title: "Traiter le responsable absent", vo: "Choisissez votre réponse, puis consultez son explication.", max: 1, qcm: true },
    { code: "3.10", seq: 2, title: "Demander une correction", vo: "La correction nomme exactement l’erreur et le résultat attendu.", claude: "practice", render: r310, enter: function () { var p = conv(S.practiceId); if (p) openConv(p.id); } },
    { code: "3.11", seq: 3, title: "Joindre ou coller", vo: "La lecture de certains fichiers peut être incomplète. Gardez toujours la source.", claude: "attach", render: r311, leave: function () { setAttach(false); } },
    { code: "3.12", seq: 3, title: "Repérer une limite", vo: "Choisissez votre réponse, puis consultez son explication.", max: 1, qcm: true, before: blurDemo },
    { code: "3.13", seq: 4, title: "Une comparaison équitable", vo: "La comparaison porte sur un même travail, avec les mêmes informations.", claude: "practice", render: r313, enter: e313 },
    { code: "3.14", seq: 4, title: "Une grille de lecture", vo: "Votre préférence doit s’appuyer sur des critères observables.", render: r314 },
    { code: "3.15", seq: 4, title: "Choisir une conclusion", vo: "Choisissez votre réponse, puis consultez son explication.", max: 1, qcm: true, before: shortWins },
    { code: "3.16", seq: 4, title: "Votre préférence argumentée", vo: "Citez un élément visible du résultat.", render: r316 },
    { code: "3.17", seq: 5, title: "Votre résultat", vo: "Le score montre les activités réussies. Une tâche réelle doit aussi être contrôlée.", render: r317 },
    { code: "3.18", seq: 5, title: "Votre fiche à conserver", vo: "Gardez cette fiche pour votre prochaine utilisation.", render: r318, last: true }
  ];
  function idx(code) { for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].code === code) return i; return 0; }
  var SCORED = SCREENS.filter(function (s) { return s.max; });

  /* ---------- Points ---------- */

  function best(code) { var a = S.act[code]; return a && a.best ? a.best : 0; }
  function actDone(code) {
    var a = S.act[code] || {};
    if (code === "3.08") return !!((a.subs && a.subs.length) || a.corrected);
    return !!a.done;
  }
  function total() { return SCORED.reduce(function (s, x) { return s + best(x.code); }, 0); }
  function practiceDone() { var a = S.act["3.08"] || {}; return !!(a.subs && a.subs.length); }
  function validated() { return practiceDone() && total() / MAX >= SEUIL; }

  var toastTimer;
  function toast(text) {
    toastEl.innerHTML = '<span class="t-ic"><svg><use href="#i-check"/></svg></span><span></span>';
    toastEl.children[1].textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  /* ---------- Voix off : transcription, lecture facultative ---------- */

  var voUI = null;
  function syncVo() {
    if (!voUI) return;
    var mine = audio.dataset.src === voUI.id, on = mine && !audio.paused;
    voUI.play.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
    voUI.play.lastChild.textContent = on ? "Pause" : "Écouter";
    var cues = (window.COURSE_CAPTIONS || {})[voUI.id] || [];
    var c = on ? cues.filter(function (q) { return audio.currentTime >= q[0] && audio.currentTime <= q[1] + .6; })[0] : null;
    voUI.cap.hidden = !c;
    if (c) voUI.cap.textContent = c[2];
  }
  ["timeupdate", "play", "pause", "ended"].forEach(function (ev) { audio.addEventListener(ev, syncVo); });

  function speaker(sc) {
    var el = h('<div class="speaker"><img class="av-lea" src="../assets/img/lea-portrait.jpg" alt=""><div><div class="who">Léa</div><p></p></div></div>');
    el.querySelector("p").textContent = sc.vo;
    if (sc.audio) {
      var play = h('<button type="button" class="vo-play"><svg><use href="#i-play"/></svg><span>Écouter</span></button>');
      var cap = txt("p", "vo-cap", "");
      cap.hidden = true;
      play.onclick = function () {
        if (!audio.paused && audio.dataset.src === sc.audio) { audio.pause(); return; }
        if (audio.dataset.src !== sc.audio) { audio.src = "../assets/audio/" + sc.audio + ".mp3"; audio.dataset.src = sc.audio; }
        audio.play().catch(function () { /* lecture refusée */ });
      };
      el.lastChild.appendChild(play);
      el.lastChild.appendChild(cap);
      voUI = { play: play, cap: cap, id: sc.audio };
      syncVo();
    }
    return el;
  }

  /* ---------- Rendu d'un écran ---------- */

  function curScreen() { return SCREENS[S.cur]; }

  function renderHeader() {
    var sc = curScreen();
    $("[data-g-code]").textContent = "Écran " + sc.code;
    $("[data-g-seq]").textContent = "Séquence " + (sc.seq + 1) + " · " + SEQS[sc.seq];
    $("[data-g-title]").textContent = sc.title;
    var bar = $("[data-g-steps]");
    bar.innerHTML = "";
    SCREENS.forEach(function (x, i) {
      if (x.seq !== sc.seq) return;
      var seg = document.createElement("i");
      if (i === S.cur) seg.className = "is-cur"; else if (i <= S.far) seg.className = "is-done";
      bar.appendChild(seg);
    });
  }

  function render(fresh) {
    var sc = curScreen();
    renderHeader();
    var y = bodyEl.scrollTop;
    bodyEl.innerHTML = "";
    voUI = null;
    bodyEl.appendChild(speaker(sc));
    if (sc.before) sc.before(bodyEl);
    if (sc.qcm) rQcm(sc, bodyEl); else if (sc.render) sc.render(bodyEl);
    bodyEl.scrollTop = fresh ? 0 : y;
    var p = sc.primary ? sc.primary() : sc.qcm ? pQcm(sc) : null;
    if (!p) p = { label: "Continuer", disabled: sc.max && !actDone(sc.code), run: forward };
    nextBtn.hidden = !!sc.last;
    nextBtn.textContent = p.label;
    nextBtn.disabled = !!p.disabled;
    nextBtn.onclick = function () { if (!p.disabled) p.run(); };
    backBtn.disabled = S.cur <= 1;
    renderWorkState();
  }

  function go(i) {
    var cur = curScreen();
    if (cur && cur.leave) cur.leave();
    S.cur = Math.max(1, Math.min(SCREENS.length - 1, i));
    spot(null);
    if (audio.dataset.src && audio.dataset.src !== curScreen().audio) audio.pause();
    S.far = Math.max(S.far, S.cur);
    save();
    if (curScreen().enter) curScreen().enter();
    render(true);
    showTab("story");
  }
  function forward() { go(S.cur + 1); }
  backBtn.addEventListener("click", function () { go(S.cur - 1); });

  /* ---------- 3.02 Ouvrir Claude ---------- */

  function r302(el) {
    el.appendChild(txt("p", "lead", "Ouvrez Claude dans un autre onglet avec votre accès autorisé. Gardez la formation ouverte."));
    var open = h('<a class="btn-line" href="https://claude.ai" target="_blank" rel="noopener"><svg><use href="#i-ext"/></svg>Ouvrir claude.ai</a>');
    open.onclick = function () { A("3.02").opened = true; save(); };
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(open);
    el.appendChild(row);
    el.appendChild(txt("p", "section-k", "Ensuite, choisissez :"));
    var choice = h('<div class="inline-actions"></div>');
    [["reel", "Je suis connecté"], ["simulation", "Utiliser la simulation"]].forEach(function (c) {
      var b = btn(S.toolMode === c[0] ? "btn-primary" : "btn-line", c[1], function () {
        S.toolMode = c[0];
        if (c[0] === "reel") S.practice.declared = true;
        save(); render();
      });
      b.setAttribute("aria-pressed", String(S.toolMode === c[0]));
      choice.appendChild(b);
    });
    el.appendChild(choice);
    if (S.toolMode) {
      el.appendChild(note(S.toolMode === "reel"
        ? "Vous ferez les manipulations dans votre onglet Claude. La simulation, à droite, reste disponible en secours."
        : "Vous ferez les manipulations dans la simulation, à droite. Elle est signalée comme telle et ne remplace pas l’interface réelle."));
    }
    el.appendChild(info("Les identifiants ne sont jamais demandés dans le module."));
  }

  /* ---------- 3.03 La nouvelle tâche de Léa ---------- */

  function r303(el) {
    var a = A("3.03");
    a.names = a.names || []; a.dates = a.dates || [];
    var phase = a.names.length < 2 ? "names" : a.dates.length < 2 ? "dates" : "done";
    el.appendChild(txt("p", "step-hint", phase === "names" ? "Lisez les notes. Cliquez sur les deux noms." : phase === "dates" ? "Cliquez maintenant sur les deux échéances." : "Léa veut savoir qui fait quoi et pour quand."));
    var src = h('<div class="src"><div class="src-lbl"><span class="tag-l tag-c"><i>C</i>Notes · Point équipe</span></div><div class="src-body"></div></div>');
    var b = src.querySelector(".src-body");
    var parts = ["Point équipe du ", ["3 novembre", "d0"], ". ", ["Nora", "n1"], " prépare l’affiche pour le ", ["5 novembre", "d1"], ". ", ["Sami", "n2"], " vérifie le stock pour le ", ["6 novembre", "d2"], ". ", ["Le lieu de la prochaine rencontre reste à confirmer.", "lieu"]];
    parts.forEach(function (p) {
      if (typeof p === "string") { b.appendChild(document.createTextNode(p)); return; }
      if (p[1] === "lieu") { b.appendChild(phase === "done" ? txt("span", "pending", p[0]) : document.createTextNode(p[0])); return; }
      var k = p[1], on = a.names.indexOf(k) >= 0 || a.dates.indexOf(k) >= 0;
      var s = btn("pick" + (on ? " is-on" : ""), p[0], function () {
        if (on) return;
        if (phase === "names" && k[0] === "n") a.names.push(k);
        else if (phase === "dates" && k[0] === "d" && k !== "d0") a.dates.push(k);
        else {
          a.miss = phase === "names" ? "Cherchez d’abord les prénoms." : k === "d0" ? "C’est la date de la réunion, pas une échéance." : "Cliquez sur une date.";
          save(); render(); return;
        }
        a.miss = null;
        save(); render();
      });
      s.disabled = phase === "done";
      b.appendChild(s);
    });
    el.appendChild(src);
    if (a.miss && phase !== "done") el.appendChild(fb(false, "À reprendre", a.miss));
    var has = function (k) { return a.names.indexOf(k) >= 0 || a.dates.indexOf(k) >= 0; };
    var cell = function (k, v) { return has(k) ? "<td>" + v + "</td>" : '<td class="empty">…</td>'; };
    el.appendChild(h('<table class="mini"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>' +
      "<tr><td>Préparer l’affiche</td>" + cell("n1", "Nora") + cell("d1", "5 novembre") + "</tr>" +
      "<tr><td>Vérifier le stock</td>" + cell("n2", "Sami") + cell("d2", "6 novembre") + "</tr>" +
      "<tr><td>Confirmer le lieu</td>" + (phase === "done" ? '<td class="warn">?</td><td class="warn">?</td>' : '<td class="empty">…</td><td class="empty">…</td>') + "</tr></tbody></table>"));
    if (phase === "done") el.appendChild(fb(false, "Point à confirmer", "Le lieu reste à confirmer. Aucun responsable n’est désigné pour cette action."));
  }

  /* ---------- 3.04 Les repères dans Claude ---------- */

  function r304(el) {
    var a = A("3.04");
    a.i = a.i || 0;
    a.seen = a.seen || [0];
    el.appendChild(txt("p", "lead", "Retrouvez une nouvelle conversation, la zone de saisie, l’envoi et les échanges précédents."));
    var ol = h('<ol class="rep"></ol>');
    REPERES.forEach(function (r, i) {
      var li = h('<li><span class="n">' + (i + 1) + '</span><span><b></b><span></span></span></li>');
      li.querySelector("b").textContent = r[1];
      li.querySelector("span span").textContent = r[2];
      li.classList.toggle("is-cur", i === a.i);
      li.style.cursor = "pointer";
      li.onclick = function () { a.i = i; if (a.seen.indexOf(i) < 0) a.seen.push(i); save(); render(); };
      ol.appendChild(li);
    });
    el.appendChild(ol);
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", a.seen.length < 4 ? "Repère suivant" : "Revoir depuis le début", function () {
      a.i = (a.i + 1) % 4;
      if (a.seen.indexOf(a.i) < 0) a.seen.push(a.i);
      save(); render();
    }));
    el.appendChild(row);
    if (a.seen.length === 4) el.appendChild(info("Recherchez les mêmes fonctions dans votre compte."));
    spot(REPERES[a.i][0], a.i + 1);
    if (window.innerWidth <= 900) el.appendChild(btn("btn-line go-claude", "Voir dans Claude", function () { showTab("claude"); }));
  }

  function spot(fn, n) {
    $$(".is-spot").forEach(function (e) { e.classList.remove("is-spot"); });
    $$(".spot-badge").forEach(function (e) { e.remove(); });
    if (!fn) return;
    var z = $(".work [data-fn='" + fn + "']");
    z.classList.add("is-spot");
    if (n) z.appendChild(txt("span", "spot-badge", String(n)));
  }

  /* ---------- 3.05 Associer les commandes (4 points, 2 essais) ---------- */

  function r305(el) {
    var a = A("3.05");
    a.map = a.map || {};
    a.tries = a.tries || [];
    var locked = a.done;
    var checked = a.checkedTry === a.tries.length && a.tries.length > 0;
    el.appendChild(txt("p", "lead", "Associez le besoin à sa fonction dans Claude."));
    el.appendChild(txt("p", "step-hint", "Sélectionnez une étiquette, puis sa catégorie ci-dessous ou directement dans l’interface de Claude."));
    var wrap = h('<div class="cls-wrap"><div class="cls-tags" role="listbox" aria-label="Étiquettes"></div><div class="cls-cats"></div></div>');
    CLS_TAGS.forEach(function (t, k) {
      var placed = a.map[k] !== undefined;
      var b = btn("cls-tag" + (a.sel === k ? " is-sel" : "") + (placed ? " is-placed" : ""), t[0], function () { a.sel = a.sel === k ? null : k; save(); render(); });
      b.setAttribute("aria-pressed", String(a.sel === k));
      b.disabled = locked || checked;
      wrap.firstChild.appendChild(b);
    });
    CLS_CATS.forEach(function (c) {
      var cat = h('<button type="button" class="cls-cat"><b></b><span></span></button>');
      cat.firstChild.textContent = c[1];
      cat.classList.toggle("is-target", a.sel !== null && a.sel !== undefined && !locked);
      Object.keys(a.map).forEach(function (k) {
        if (a.map[k] !== c[0]) return;
        var right = CLS_TAGS[k][1] === c[0];
        var chip = txt("span", "placed" + (checked || locked ? (right ? " is-right" : " is-wrong") : ""), ((checked || locked) ? (right ? "✓ " : "✗ ") : "") + CLS_TAGS[k][0]);
        cat.lastChild.appendChild(chip);
      });
      cat.disabled = locked || checked;
      cat.onclick = function () { place(c[0]); };
      wrap.lastChild.appendChild(cat);
    });
    el.appendChild(wrap);
    work.classList.toggle("is-target", !locked && !checked && a.sel !== null && a.sel !== undefined);

    if (checked || locked) {
      var last = a.tries[a.tries.length - 1];
      if (last === 4) el.appendChild(fb(true, "Réussi", "4 associations exactes sur 4."));
      else el.appendChild(fb(false, "À reprendre", last + " association" + (last > 1 ? "s" : "") + " exacte" + (last > 1 ? "s" : "") + " sur 4."));
    }
    if (a.done && (a.tries[a.tries.length - 1] !== 4 || a.corrected)) el.appendChild(corrige305());
    if (!a.done && checked) {
      var r = h('<div class="inline-actions"></div>');
      r.appendChild(btn("link-btn", "Voir la correction", function () { a.corrected = true; a.done = true; save(); render(); }));
      el.appendChild(r);
    }
    el.appendChild(txt("p", "attempts", "Essai " + Math.min(a.tries.length + (a.done || checked ? 0 : 1), 2) + " sur 2" + (a.tries.length ? " · meilleur score : " + a.best + " / 4" : "")));
    if (a.done && best("3.05") < 4) el.appendChild(reprise("3.05", function () { a.map = {}; a.sel = null; a.tries = []; a.checkedTry = null; }));
  }
  function place(fn) {
    var a = A("3.05");
    if (a.sel === null || a.sel === undefined || a.done) return;
    a.map[a.sel] = fn;
    var next = CLS_TAGS.map(function (t, k) { return k; }).filter(function (k) { return a.map[k] === undefined; })[0];
    a.sel = next === undefined ? null : next;
    save(); render();
  }
  function corrige305() {
    return h('<div class="corrige"><h3>Correction</h3>Démarrer un sujet → Nouvelle conversation<br>Saisir les notes → Zone de saisie<br>Soumettre la demande → Envoyer<br>Reprendre un échange → Historique</div>');
  }
  function p305() {
    var a = A("3.05");
    var checked = a.checkedTry === (a.tries || []).length && (a.tries || []).length > 0;
    if (a.done) return { label: "Continuer", run: forward };
    if (checked) return { label: "Réessayer", run: function () {
      Object.keys(a.map).forEach(function (k) { if (CLS_TAGS[k][1] !== a.map[k]) delete a.map[k]; });
      a.sel = CLS_TAGS.map(function (t, k) { return k; }).filter(function (k) { return a.map[k] === undefined; })[0];
      a.checkedTry = null; save(); render();
    } };
    return { label: "Valider", disabled: Object.keys(a.map || {}).length < 4, run: function () {
      var score = CLS_TAGS.filter(function (t, k) { return a.map[k] === t[1]; }).length;
      a.tries.push(score);
      a.best = Math.max(a.best || 0, score);
      a.checkedTry = a.tries.length;
      if (score === 4 || a.tries.length >= 2) a.done = true;
      a.sel = null;
      save(); render();
    } };
  }

  // zones de l'interface de Claude comme destinations (3.05)
  document.addEventListener("click", function (e) {
    if (!work.classList.contains("is-target")) return;
    var z = e.target.closest(".work [data-fn]");
    if (!z || !/^(new|input|send|history)$/.test(z.dataset.fn)) return;
    e.preventDefault(); e.stopPropagation();
    place(z.dataset.fn);
    if (window.innerWidth <= 900) showTab("story");
  }, true);

  /* reprise explicite d'une activité : les essais précédents restent dans le suivi */
  function reprise(code, reset) {
    var r = h('<div class="inline-actions"></div>');
    r.appendChild(btn("btn-line", "Reprendre l’activité", function () {
      var a = A(code);
      a.history = (a.history || []).concat([{ tries: a.tries || a.subs, best: a.best, corrected: !!a.corrected }]);
      a.done = false; a.corrected = false;
      reset();
      save(); render();
    }));
    return r;
  }

  /* ---------- QCM : 1 point, 2 essais avant le corrigé ---------- */

  function rQcm(sc, el) {
    var q = QCM[sc.code], a = A(sc.code);
    a.tries = a.tries || [];
    var checked = a.checkedTry === a.tries.length && a.tries.length > 0;
    el.appendChild(txt("h2", "q", q.q));
    var box = h('<div class="opts" role="radiogroup"></div>');
    q.opts.forEach(function (o, k) {
      var b = h('<button type="button" class="opt" role="radio"><span class="box round"><svg><use href="#i-check"/></svg></span><span></span></button>');
      b.lastChild.textContent = "ABC"[k] + ". " + o[0];
      var chosen = checked ? a.tries[a.tries.length - 1] === k : a.sel === k;
      b.setAttribute("aria-checked", String(chosen));
      if (a.done && (k === q.answer)) b.classList.add("is-right");
      else if (checked && chosen) b.classList.add(k === q.answer ? "is-right" : "is-wrong");
      else if (!checked && !a.done && chosen) b.classList.add("is-sel");
      if (a.done && !checked && a.tries.indexOf(k) >= 0 && k !== q.answer) b.classList.add("is-wrong");
      b.disabled = checked || a.done;
      b.onclick = function () { a.sel = k; save(); render(); };
      box.appendChild(b);
    });
    el.appendChild(box);
    if (a.tries.length) {
      var last = a.tries[a.tries.length - 1];
      var ok = last === q.answer;
      el.appendChild(fb(ok, ok ? "Correct" : "À reprendre", q.opts[last][1]));
      if (a.done && !ok) el.appendChild(h('<div class="corrige"><h3>Correction</h3>' + "ABC"[q.answer] + ". " + esc(q.opts[q.answer][0]) + " · " + esc(q.opts[q.answer][1]) + "</div>"));
    }
    if (checked && !a.done) {
      var r = h('<div class="inline-actions"></div>');
      r.appendChild(btn("link-btn", "Voir la correction", function () { a.corrected = true; a.done = true; a.checkedTry = null; save(); render(); }));
      el.appendChild(r);
    }
    el.appendChild(txt("p", "attempts", "1 point · essai " + Math.min(a.tries.length + (a.done || checked ? 0 : 1), 2) + " sur 2"));
    if (a.done && best(sc.code) < 1) el.appendChild(reprise(sc.code, function () { a.tries = []; a.sel = null; a.checkedTry = null; }));
  }
  function pQcm(sc) {
    var q = QCM[sc.code], a = A(sc.code);
    a.tries = a.tries || [];
    var checked = a.checkedTry === a.tries.length && a.tries.length > 0;
    if (a.done) return { label: "Continuer", run: forward };
    if (checked) return { label: "Réessayer", run: function () { a.sel = null; a.checkedTry = null; save(); render(); } };
    return { label: "Valider", disabled: a.sel === null || a.sel === undefined, run: function () {
      a.tries.push(a.sel);
      a.checkedTry = a.tries.length;
      var ok = a.sel === q.answer;
      if (ok) a.best = 1; else a.best = a.best || 0;
      if (ok || a.tries.length >= 2) { a.done = true; a.checkedTry = ok ? a.checkedTry : null; }
      save(); render();
    } };
  }

  function blurDemo(el) {
    el.appendChild(h('<div class="blur-demo" aria-hidden="true"><div class="bd is-blur"><small>Image floue</small><p>Le lieu de la prochaine rencontre reste à confirmer.</p></div><div class="bd is-clear"><small>Texte lisible</small><p>Le lieu de la prochaine rencontre reste à confirmer.</p></div></div>'));
  }

  /* ---------- 3.06 Préparer les notes ---------- */

  function copy(text, b, done) {
    var ok = function () { b.classList.add("is-done"); b.lastChild.textContent = "Copié"; if (done) done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, ok); else ok();
  }
  function copyBtn(label, text, done) {
    var b = h('<button type="button" class="copy-btn"><svg><use href="#i-copy"/></svg><span></span></button>');
    b.lastChild.textContent = label;
    b.onclick = function () { copy(text, b, done); };
    return b;
  }
  function sourceBlock(extra) {
    var n = h('<div class="src"><div class="src-lbl"><span class="tag-l tag-c"><i>C</i>Notes</span></div><div class="src-body"></div></div>');
    n.querySelector(".src-body").textContent = NOTES;
    if (extra) n.firstChild.appendChild(extra);
    return n;
  }
  function consigneBlock(extra) {
    var k = h('<div class="src"><div class="src-lbl"><span class="tag-l tag-f"><i>F</i>Consigne</span></div><div class="src-body"></div></div>');
    k.querySelector(".src-body").textContent = CONSIGNE;
    if (extra) k.firstChild.appendChild(extra);
    return k;
  }

  function r306(el) {
    var a = A("3.06");
    el.appendChild(txt("p", "lead", "Copiez seulement les notes de l’exercice. Ajoutez ce que vous attendez : un tableau avec Action, Responsable et Échéance."));
    var mark = function () { a.copied = true; save(); if (!el.querySelector("[data-fb6]")) { var f = info("Le texte source doit accompagner votre demande. Claude ne peut pas le deviner."); f.setAttribute("data-fb6", ""); el.appendChild(f); } };
    el.appendChild(sourceBlock(copyBtn("Copier les notes", NOTES, mark)));
    el.appendChild(consigneBlock(copyBtn("Copier le prompt complet", PROMPT_COMPLET, mark)));
    el.appendChild(txt("p", "step-hint", "Rien n’est envoyé automatiquement."));
    if (a.copied) mark();
  }

  /* ---------- 3.07 Voir la transformation (démonstration préparée) ---------- */

  function demoConv() { return S.convs.filter(function (c) { return c.kind === "demo"; })[0]; }
  function e307() { var d = demoConv() || newConv("demo", "Exemple relu : tableau des actions"); openConv(d.id); }
  function r307(el) {
    var d = demoConv(), lvl = d ? d.messages.length : 0;
    el.appendChild(txt("p", "lead", "Observez une demande et sa réponse, préparées et relues pour la formation."));
    var row = h('<div class="inline-actions"></div>');
    var b1 = btn(lvl < 1 ? "btn-primary" : "btn-line", "Révéler le prompt", function () {
      d.messages.push({ role: "user", content: PROMPT_COMPLET });
      save(); renderConv(); render(); if (window.innerWidth <= 900) showTab("claude");
    });
    var b2 = btn(lvl === 1 ? "btn-primary" : "btn-line", "Révéler la réponse", function () {
      b2.disabled = true;
      var p = addPending();
      setTimeout(function () {
        streamText(p, REF_ANSWER, function () { d.messages.push({ role: "assistant", content: REF_ANSWER, tag: "demo" }); save(); renderConv(); render(); });
      }, 400);
      if (window.innerWidth <= 900) showTab("claude");
    });
    b1.disabled = lvl >= 1; b2.disabled = lvl !== 1;
    row.appendChild(b1); row.appendChild(b2);
    el.appendChild(row);
    if (lvl >= 2) {
      el.appendChild(txt("p", "section-k", "Repérez les éléments communs"));
      var s = h('<div class="src"><div class="src-lbl"><span class="tag-l tag-c"><i>C</i>Source</span></div><div class="src-body">Point équipe du 3 novembre. <b>Nora</b><i class="mk">1</i> prépare l’affiche pour le <b>5 novembre</b><i class="mk">1</i>. <b>Sami</b><i class="mk">2</i> vérifie le stock pour le <b>6 novembre</b><i class="mk">2</i>. <span class="pending">Le lieu de la prochaine rencontre reste à confirmer.</span><i class="mk">3</i></div></div>');
      el.appendChild(s);
      el.appendChild(h('<table class="mini"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>' +
        '<tr><td>Préparer l’affiche</td><td><b>Nora</b><i class="mk">1</i></td><td><b>5 novembre</b><i class="mk">1</i></td></tr>' +
        '<tr><td>Vérifier le stock</td><td><b>Sami</b><i class="mk">2</i></td><td><b>6 novembre</b><i class="mk">2</i></td></tr>' +
        '<tr><td>Confirmer le lieu<i class="mk">3</i></td><td class="warn">non précisé</td><td class="warn">non précisé</td></tr></tbody></table>'));
      el.appendChild(info("Cette réponse est un exemple relu. Votre outil peut proposer une autre formulation. Vérifiez les mêmes critères."));
    }
  }

  /* ---------- 3.08 Créer votre tableau (4 points, 3 soumissions) ---------- */

  function e308() {
    var p = conv(S.practiceId);
    if (!p) { p = newConv("practice", "Nouvelle conversation"); S.practiceId = p.id; save(); }
    openConv(p.id);
  }
  function r308(el) {
    var a = A("3.08");
    a.subs = a.subs || [];
    var reel = S.toolMode === "reel";
    el.appendChild(txt("p", "lead", "Dans une nouvelle conversation Claude, utilisez le prompt et les notes affichés. Copiez votre tableau dans le module."));
    el.appendChild(consigneBlock(copyBtn("Copier le prompt complet", PROMPT_COMPLET)));
    el.appendChild(sourceBlock());
    var ins = h('<div class="inline-actions"></div>');
    ins.appendChild(btn("btn-line", "Insérer le prompt dans la simulation", function () { var p = conv(S.practiceId); if (p) openConv(p.id); insert(PROMPT_COMPLET); }));
    el.appendChild(ins);

    var open = !a.corrected && a.subs.length < 3;
    if (open) {
      el.appendChild(txt("p", "section-k", "Votre tableau"));
      var p = conv(S.practiceId), last = lastAssistant(p), rows = last ? readTable(last.content) : null;
      var fromClaude = btn(reel ? "btn-line" : "btn-primary", "Valider le tableau de la simulation", function () { submit(rows, last.tag === "live" ? "api" : "simulation", last.content); });
      fromClaude.disabled = !rows || a.lastText === (last && last.content);
      var paste = h('<textarea class="paste" data-paste placeholder="Collez ici le tableau obtenu dans votre onglet Claude."></textarea>');
      paste.value = a.draft || "";
      var fromPaste = btn(reel ? "btn-primary" : "btn-line", "Valider le tableau collé", function () {
        var r = readTable(paste.value);
        if (!r) { a.pasteErr = true; save(); render(); return; }
        a.pasteErr = false;
        S.practice.pasted++;
        submit(r, "reel", paste.value);
      });
      paste.oninput = function () { a.draft = paste.value; save(); fromPaste.disabled = !paste.value.trim(); };
      fromPaste.disabled = !paste.value.trim();
      var blockSim = h('<div></div>'), blockReel = h('<div></div>');
      blockSim.appendChild(txt("p", "step-hint", rows ? "La simulation contient un tableau." : "Envoyez votre demande dans la simulation, à droite."));
      var r1 = h('<div class="inline-actions" style="margin-top:0"></div>'); r1.appendChild(fromClaude); blockSim.appendChild(r1);
      blockReel.appendChild(paste);
      var r2 = h('<div class="inline-actions"></div>'); r2.appendChild(fromPaste); blockReel.appendChild(r2);
      if (a.pasteErr) blockReel.appendChild(fb(false, "À reprendre", "Aucun tableau reconnu. Collez les lignes du tableau, avec ses colonnes."));
      if (reel) { el.appendChild(blockReel); el.appendChild(txt("p", "or", "ou")); el.appendChild(blockSim); }
      else { el.appendChild(blockSim); el.appendChild(txt("p", "or", "ou, si vous travaillez dans votre onglet Claude :")); el.appendChild(blockReel); }
    }

    var lastSub = a.subs[a.subs.length - 1];
    if (lastSub) {
      var box = h('<div class="crit-box"><ul class="crit"></ul></div>');
      lastSub.crit.forEach(function (c, i) {
        var li = h('<li><span class="lbl ' + c + '"></span><span></span></li>');
        li.firstChild.textContent = LEVEL[c][0];
        li.lastChild.textContent = CRIT[i];
        box.firstChild.appendChild(li);
      });
      el.appendChild(box);
      var okAll = lastSub.crit.every(function (c) { return c === "ok"; });
      el.appendChild(okAll ? fb(true, "Réussi", "Les critères sont respectés. Contrôlez encore les faits avant utilisation.")
        : fb(false, "À reprendre", "Comparez avec la source. Corrigez le point indiqué, puis essayez de nouveau."));
      el.appendChild(txt("p", "attempts", "Soumission " + a.subs.length + " sur 3 · meilleure version : " + fmt(a.best) + " / 4"));
    }
    if (!a.corrected) {
      var r = h('<div class="inline-actions"></div>');
      r.appendChild(btn("link-btn", "Voir la correction", function () { a.corrected = true; save(); render(); }));
      el.appendChild(r);
    } else {
      el.appendChild(h('<div class="corrige"><h3>Correction</h3><table class="mini"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody><tr><td>Préparer l’affiche</td><td>Nora</td><td>5 novembre</td></tr><tr><td>Vérifier le stock</td><td>Sami</td><td>6 novembre</td></tr><tr><td>Confirmer le lieu</td><td>non précisé</td><td>non précisée</td></tr></tbody></table></div>'));
    }
    if ((a.subs.length >= 3 || a.corrected) && best("3.08") < 4) el.appendChild(reprise("3.08", function () { a.subs = []; a.lastText = null; }));
  }
  function submit(rows, source, text) {
    var a = A("3.08");
    var crit = checkTable(rows);
    a.subs.push({ crit: crit, score: tableScore(crit), source: source });
    a.best = Math.max(a.best || 0, tableScore(crit));
    a.lastText = text;
    if (source === "simulation") S.practice.simulated++;
    if (source === "api") S.practice.live++;
    save(); render();
  }

  /* ---------- 3.10 Demander une correction ---------- */

  function r310(el) {
    var p = conv(S.practiceId), last = lastAssistant(p), rows = last ? readTable(last.content) : null;
    var invented = rows && inventedOwner(rows);
    if (invented) { A("3.10").invented = true; save(); }
    el.appendChild(txt("p", "lead", "Si un responsable a été ajouté, écrivez :"));
    var c = h('<div class="src"><div class="src-lbl"><span>Correction</span></div><div class="src-body"></div></div>');
    c.querySelector(".src-body").textContent = "« " + CORRECTION + " »";
    c.firstChild.appendChild(copyBtn("Copier", CORRECTION));
    el.appendChild(c);
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", "Insérer dans la simulation", function () { if (p) openConv(p.id); insert(CORRECTION); }));
    el.appendChild(row);
    if (rows) {
      el.appendChild(txt("p", "section-k", "Votre tableau actuel"));
      var t = h('<table class="mini"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody></tbody></table>');
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        var isLieu = /lieu/i.test(r[0] || "");
        [0, 1, 2].forEach(function (k) {
          var td = txt("td", isLieu && k === 1 ? (invented ? "warn" : "hl") : "", r[k] || "");
          tr.appendChild(td);
        });
        t.lastChild.appendChild(tr);
      });
      el.appendChild(t);
    }
    if (!rows) el.appendChild(note("La simulation ne contient pas encore de tableau. Si vous travaillez dans votre onglet Claude, envoyez-y la correction."));
    else if (invented) el.appendChild(fb(false, "À reprendre", "Un responsable a été ajouté pour la confirmation du lieu. Envoyez la correction dans le même échange."));
    else if (A("3.10").invented) el.appendChild(fb(true, "Correction appliquée", "La confirmation du lieu n’a plus de responsable attribué."));
    else el.appendChild(note("Aucun responsable n’a été ajouté pour le lieu. Si cela arrive, envoyez cette phrase dans le même échange."));
    if (A("3.10").sent || !rows) el.appendChild(info("Vérifiez aussi les cellules qui n’étaient pas concernées par la correction."));
  }

  /* ---------- 3.11 Joindre ou coller ---------- */

  function setAttach(on) {
    $("[data-attach-chip]").hidden = !on;
    if (on) { A("3.11").demo = true; save(); }
  }
  function r311(el) {
    var a = A("3.11");
    el.appendChild(txt("p", "lead", "Un document autorisé peut être joint si la fonction est disponible. Pour cet exercice, le texte à copier suffit."));
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", "Voir l’ajout d’un fichier", function () { setAttach(true); spot("attach"); render(); if (window.innerWidth <= 900) showTab("claude"); }));
    row.appendChild(copyBtn("Copier le texte", NOTES, function () { a.copied = true; save(); render(); }));
    el.appendChild(row);
    el.appendChild(txt("p", "step-hint", "Dans Claude, le trombone ajoute un fichier. Si la commande est absente ou bloquée, copiez le texte."));
    if (a.demo) el.appendChild(note("Démonstration : le fichier fictif « note-reunion-fictive.txt » est ajouté à la zone de saisie. Aucun dossier réel n’est utilisé."));
    if (a.demo || a.copied) el.appendChild(info("Le contenu à analyser doit être accessible dans la conversation."));
  }

  /* ---------- 3.13 à 3.16 : comparaison ---------- */

  function compareConv() { return conv(S.compareId); }
  function e313() {
    var c = compareConv();
    if (!c) { c = newConv("compare", "Nouvelle conversation"); S.compareId = c.id; save(); }
    openConv(c.id);
  }
  function claudeAnswer() {
    var a = A("3.13");
    if (a.pasted) return { text: a.pasted, from: "reel" };
    var l = lastAssistant(compareConv());
    return l ? { text: l.content, from: l.tag === "live" ? "api" : "simulation" } : null;
  }
  function win(name, sub, text) {
    var w = h('<div class="win"><div class="win-h"><span></span><small></small></div><div class="win-b"></div></div>');
    w.querySelector("span").textContent = name;
    w.querySelector("small").textContent = sub;
    w.querySelector(".win-b").textContent = text || "Pas encore de réponse.";
    if (!text) w.querySelector(".win-b").classList.add("empty");
    return w;
  }
  function wins() {
    var c = claudeAnswer();
    var box = h('<div class="wins"></div>');
    box.appendChild(win("ChatGPT", "première réponse conservée", CHATGPT_ANSWER));
    box.appendChild(win("Claude", c ? (c.from === "reel" ? "réponse collée" : c.from === "api" ? "première réponse" : "réponse simulée") : "", c ? c.text : ""));
    return box;
  }
  function r313(el) {
    var a = A("3.13");
    el.appendChild(txt("p", "lead", "Reprenez le prompt du message d’accueil. Utilisez exactement les mêmes faits et contraintes dans une nouvelle conversation Claude."));
    var p = h('<div class="src"><div class="src-lbl"><span>Prompt du module 2</span></div><div class="src-body"></div></div>');
    p.querySelector(".src-body").textContent = ACCUEIL_PROMPT;
    p.firstChild.appendChild(copyBtn("Copier", ACCUEIL_PROMPT));
    el.appendChild(p);
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", "Insérer dans la simulation", function () { var c = compareConv(); if (c) openConv(c.id); insert(ACCUEIL_PROMPT); }));
    el.appendChild(row);
    el.appendChild(txt("p", "section-k", "Les deux premières réponses"));
    el.appendChild(wins());
    var paste = h('<textarea class="paste" placeholder="Si vous travaillez dans votre onglet Claude, collez ici sa première réponse."></textarea>');
    paste.value = a.pasted || "";
    paste.style.minHeight = "70px";
    paste.onchange = function () { a.pasted = paste.value.trim() || null; save(); render(); };
    el.appendChild(paste);
    el.appendChild(info("Ne comparez pas un premier brouillon avec une version déjà corrigée."));
  }
  function r314(el) {
    var g = A("3.14");
    g.v = g.v || {};
    el.appendChild(txt("p", "lead", "Comparez : date et horaires, messagerie, absence d’ajout, longueur demandée."));
    el.appendChild(wins());
    var t = h('<table class="grid-tbl"><thead><tr><th>Critère</th><th>ChatGPT</th><th>Claude</th></tr></thead><tbody></tbody></table>');
    GRID_CRIT.forEach(function (c, i) {
      var tr = document.createElement("tr");
      tr.appendChild(txt("td", "crit-name", c));
      tr.appendChild(document.createElement("td"));
      tr.appendChild(document.createElement("td"));
      ["chatgpt", "claude"].forEach(function (tool, k) {
        var seg = h('<div class="seg3" role="group"></div>');
        seg.setAttribute("aria-label", c + ", " + (k ? "Claude" : "ChatGPT"));
        GRID_VALS.forEach(function (v) {
          var b = btn("", v[1], function () { g.v[i + tool] = v[0]; save(); render(); });
          b.dataset.v = v[0];
          b.setAttribute("aria-pressed", String(g.v[i + tool] === v[0]));
          seg.appendChild(b);
        });
        tr.children[k + 1].appendChild(seg);
      });
      t.lastChild.appendChild(tr);
    });
    el.appendChild(t);
    if (Object.keys(g.v).length === 8) el.appendChild(info("Un résultat peut être agréable à lire et oublier un horaire. Signalez les deux aspects séparément."));
  }
  function shortWins(el) { el.appendChild(wins()); }
  function r316(el) {
    var a = A("3.16");
    el.appendChild(wins());
    el.appendChild(txt("p", "pref-lead", "Complétez : « Pour cette tâche, je retiens cette réponse parce que… »"));
    var ta = h('<textarea class="pref" aria-label="Votre argument"></textarea>');
    ta.value = a.text || "";
    el.appendChild(ta);
    var ex = h('<div class="inline-actions" style="flex-wrap:wrap"></div>');
    ["les horaires sont présents", "le message est plus court", "aucune information n’est ajoutée"].forEach(function (x) {
      ex.appendChild(btn("chip", x, function () { ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + x; ta.focus(); }));
    });
    el.appendChild(txt("p", "step-hint", "Exemples d’arguments :"));
    el.appendChild(ex);
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", "Enregistrer ma phrase", function () { a.text = ta.value.trim(); a.saved = !!a.text; save(); render(); }));
    el.appendChild(row);
    if (a.saved) el.appendChild(info("Un argument précis vous aidera à choisir selon vos besoins futurs."));
  }

  /* ---------- 3.17 Votre résultat ---------- */

  function r317(el) {
    var sc = total();
    el.appendChild(h('<p class="score-big">' + fmt(sc) + ' <small>sur ' + MAX + "</small></p>"));
    el.appendChild(h('<div class="score-bar"><i style="width:' + (sc / MAX * 100) + '%"></i><b style="left:' + (SEUIL * 100) + '%"></b></div>'));
    el.appendChild(txt("p", "score-legend", "Seuil de validation : 70 % du maximum."));
    el.appendChild(txt("p", "lead", "Vos activités sont conservées. Consultez les points à reprendre."));
    var ul = h('<ul class="acts"></ul>');
    SCORED.forEach(function (x) {
      var b = best(x.code), done = actDone(x.code);
      var li = h('<li><span></span><span class="pts"></span></li>');
      li.firstChild.textContent = x.code + " · " + x.title;
      li.children[1].textContent = done ? fmt(b) + " / " + x.max : "non fait";
      if (!done || b < x.max) li.appendChild(btn("link-btn", "Revoir", function () { go(idx(x.code)); }));
      ul.appendChild(li);
    });
    el.appendChild(ul);
    if (!practiceDone()) el.appendChild(fb(false, "Pratique non faite", "Terminez la manipulation dans l’outil pour valider la prise en main."));
    if (validated()) el.appendChild(fb(true, "Seuil atteint", "Module validé."));
    else if (sc / MAX < SEUIL) el.appendChild(fb(false, "Sous le seuil", "Reprenez les activités indiquées, puis tentez une nouvelle réponse."));
    var p = S.practice;
    el.appendChild(txt("p", "attempts", "Suivi · manipulation déclarée : " + (p.declared ? "oui" : "non") + " · tableaux collés : " + p.pasted + " · réponses simulées : " + S.stats.sim + " · réponses de Claude : " + S.stats.live));
    var row = h('<div class="inline-actions"></div>');
    row.appendChild(btn("btn-line", "Revenir au menu", openMenu));
    el.appendChild(row);
    S.validated = validated();
    save();
  }

  /* ---------- 3.18 Votre fiche à conserver ---------- */

  function fiche() {
    return h('<div class="fiche"><h3>Mes premiers gestes dans Claude</h3><ol>' +
      '<li><i class="fi-c">C</i>Fournir la source.</li>' +
      '<li><i class="fi-f">F</i>Préciser le tableau attendu.</li>' +
      '<li><i class="fi-t">?</i>Signaler ce qui manque.</li>' +
      '<li><i class="fi-r">=</i>Comparer les résultats sur les mêmes critères.</li></ol></div>');
  }
  function r318(el) {
    el.appendChild(fiche());
    var row = h('<div class="inline-actions" style="flex-wrap:wrap"></div>');
    row.appendChild(btn(S.reperes ? "btn-line" : "btn-primary", S.reperes ? "Fiche enregistrée" : "Enregistrer la fiche", function () { S.reperes = true; save(); render(); toast("Fiche enregistrée dans Mes repères."); }));
    row.appendChild(btn("btn-line", "Revenir au menu", openMenu));
    row.appendChild(btn("btn-ghost", "Ouvrir le module 4", function () { toast("Le module 4 s’ouvre depuis la plateforme de formation."); }));
    el.appendChild(row);
    if (S.reperes) el.appendChild(info("Fiche enregistrée dans Mes repères."));
  }

  /* ---------- Menu et Mes repères ---------- */

  var menuEl = $("[data-menu]");
  function openMenu() {
    var list = $("[data-menu-list]");
    list.innerHTML = "";
    var intro = btn("menu-item", "", function () { closeMenu(); showIntro(); });
    intro.innerHTML = '<span class="code">3.01</span><span>Revoir l’introduction</span>';
    list.appendChild(intro);
    SEQS.forEach(function (title, sq) {
      var block = h('<div class="menu-seq"><h3></h3></div>');
      block.firstChild.textContent = (sq + 1) + ". " + title;
      SCREENS.forEach(function (x, i) {
        if (x.seq !== sq || i === 0) return;
        var b = h('<button type="button" class="menu-item"><span class="code"></span><span></span><span class="st"></span></button>');
        b.children[0].textContent = x.code;
        b.children[1].textContent = x.title;
        var st = b.children[2];
        if (x.max && actDone(x.code)) { st.textContent = fmt(best(x.code)) + " / " + x.max; st.classList.add(best(x.code) === x.max ? "ok" : "ko"); }
        else if (i <= S.far) st.textContent = i === S.cur ? "en cours" : "vu";
        b.classList.toggle("is-cur", i === S.cur);
        b.disabled = i > S.far;
        b.onclick = function () { closeMenu(); go(i); };
        block.appendChild(b);
      });
      list.appendChild(block);
    });
    $("[data-menu-score]").textContent = "Score : " + fmt(total()) + " sur " + MAX + (S.validated ? " · module validé" : "");
    var rep = $("[data-reperes]");
    rep.innerHTML = "";
    if (S.reperes) rep.appendChild(fiche()); else rep.appendChild(txt("p", "", "Votre fiche sera enregistrée ici à l’écran 3.18."));
    menuEl.hidden = false;
    $("[data-menu-close]").focus();
  }
  function closeMenu() { menuEl.hidden = true; }
  $("[data-menu-open]").addEventListener("click", openMenu);
  $("[data-menu-close]").addEventListener("click", closeMenu);
  menuEl.addEventListener("click", function (e) { if (e.target === menuEl) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menuEl.hidden) closeMenu(); });

  /* ---------- Espace Claude (simulation de l'interface) ---------- */

  function conv(id) { var want = arguments.length ? id : S.current; if (!want) return null; return S.convs.filter(function (c) { return c.id === want; })[0] || null; }
  function newConv(kind, title) {
    var c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: kind || "free", title: title || "Nouvelle conversation", messages: [] };
    S.convs.unshift(c);
    S.current = c.id;
    save();
    return c;
  }
  function openConv(id) { S.current = id; save(); renderConv(); renderWorkState(); }
  function lastAssistant(c) { var a = (c ? c.messages : []).filter(function (m) { return m.role === "assistant"; }); return a[a.length - 1]; }

  function msgNode(m) {
    var el = document.createElement("div");
    if (m.role === "user") {
      el.className = "msg msg--user";
      el.innerHTML = '<div class="bubble"></div>';
      el.firstChild.textContent = m.content;
    } else {
      el.className = "msg msg--ai";
      el.innerHTML = '<span class="av av-claude"><svg><use href="#i-spark"/></svg></span><div class="body"></div>';
      el.lastChild.innerHTML = markdown(m.content) + (m.tag === "demo" ? '<span class="msg-tag msg-tag--demo">Exemple relu</span>' : m.tag === "sim" ? '<span class="msg-tag">Réponse simulée</span>' : "");
    }
    return el;
  }
  function renderConv() {
    var c = conv();
    messagesEl.innerHTML = "";
    if (!c || !c.messages.length) {
      messagesEl.innerHTML = '<div class="empty-state"><svg class="mark"><use href="#i-spark"/></svg><h2>Comment puis-je vous aider ?</h2><p>Environnement de formation · dossiers fictifs uniquement</p></div>';
    } else c.messages.forEach(function (m) { messagesEl.appendChild(msgNode(m)); });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderHistory();
  }
  function renderHistory() {
    var pop = $("[data-hist]");
    pop.innerHTML = "";
    var list = S.convs.filter(function (c) { return c.messages.length; });
    if (!list.length) { pop.innerHTML = '<div class="empty">Vos échanges apparaîtront ici.</div>'; return; }
    list.forEach(function (c) {
      var b = btn("", c.title, function () { openConv(c.id); pop.hidden = true; });
      b.setAttribute("aria-current", String(c.id === S.current));
      pop.appendChild(b);
    });
  }

  function practiceScreen() { return curScreen().claude === "practice"; }
  function renderWorkState() {
    var sc = curScreen();
    var active = practiceScreen() && conv() && conv().kind !== "demo";
    work.classList.toggle("is-active", !!active);
    work.classList.toggle("is-locked", !active);
    input.disabled = !active || busy;
    sendBtn.disabled = !active || busy;
    attachBtn.disabled = sc.claude !== "attach";
    input.placeholder = active ? "Écrivez à Claude…" : sc.claude === "demo" ? "Démonstration : lecture seule" : "La saisie s’ouvre aux étapes pratiques.";
    $("[data-tab-dot]").hidden = !(active && shell.dataset.tab === "story");
  }

  function insert(text) {
    showTab("claude");
    input.value = input.value.trim() ? input.value.trim() + "\n\n" + text : text;
    autosize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 240) + "px"; }

  /* réponses préparées quand Claude n'est pas joignable */
  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = ((users[users.length - 1] || {}).content || "").toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    var hadTable = c.messages.some(function (m) { return m.role === "assistant" && readTable(m.content); });
    var hasNotes = /nora/.test(all) && /sami/.test(all);
    var signals = /non pr[ée]cis|absente?|manquant|inconnu|n.invente|seulement les notes|uniquement les notes/.test(all);
    if (hadTable && /(remplace|corrige|modifie|n.est pas indiqu|pas de responsable|non pr[ée]cis)/.test(t)) {
      return "Vous avez raison, les notes n’indiquent pas qui confirme le lieu. Voici le tableau corrigé :\n\n" + REF_TABLE;
    }
    if (hasNotes && /tableau|colonnes?/.test(all)) {
      if (signals) return REF_ANSWER;
      // sans consigne sur les données absentes, la simulation complète à tort : c'est le cas traité à l'écran 3.10
      return "Voici un tableau des actions à partir de vos notes :\n\n| Action | Responsable | Échéance |\n|---|---|---|\n" +
        "| Préparer l’affiche | Nora | 5 novembre |\n| Vérifier le stock | Sami | 6 novembre |\n| Confirmer le lieu de la prochaine rencontre | Nora | 5 novembre |";
    }
    if (/tableau/.test(t) && !hasNotes) return "Avec plaisir. Pouvez-vous me transmettre les notes à organiser ? Je n’ai pas accès à vos documents : collez le texte dans votre message.";
    if (hasNotes) return "Voici ce que je retiens de ces notes :\n\n- Nora prépare l’affiche pour le 5 novembre.\n- Sami vérifie le stock pour le 6 novembre.\n- Le lieu de la prochaine rencontre reste à confirmer.\n\nSouhaitez-vous un tableau Action, Responsable, Échéance ?";
    if (/accueil|visiteurs/.test(t) && /12 octobre/.test(t)) return CLAUDE_SIM_ACCUEIL;
    if (/accueil|visiteurs/.test(t)) return "Volontiers. Indiquez-moi la date, les horaires de fermeture et le moyen de contact qui reste disponible, pour que le message soit exact.";
    if (/^(bonjour|salut|hello|bonsoir)\b/.test(t.trim())) return "Bonjour ! Comment puis-je vous aider ?";
    return "Je suis en mode simulé : je réponds surtout à l’exercice en cours. Suivez la consigne affichée dans la formation.";
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
  function finish(c, text, tag) {
    c.messages.push({ role: "assistant", content: text, tag: tag, screen: curScreen().code });
    S.stats[tag === "sim" ? "sim" : "live"]++;
    var code = curScreen().code;
    if (code === "3.08" && c.kind !== "demo") S.practiceId = c.id;
    if (code === "3.10" && c.id === S.practiceId) A("3.10").sent = true;
    if (code === "3.13") S.compareId = c.id;
    busy = false;
    save();
    renderConv();
    render();
  }
  function showError(el, c, msg) {
    el.lastChild.innerHTML = '<div class="msg-error"><span></span><div class="inline-actions"><button type="button" class="btn-line" data-r>Réessayer</button><button type="button" class="btn-line" data-s>Utiliser la simulation</button></div></div>';
    el.querySelector(".msg-error span").textContent = msg;
    el.querySelector("[data-r]").onclick = function () { el.remove(); ask(c); };
    el.querySelector("[data-s]").onclick = function () { setMode("sim", true); el.remove(); ask(c); };
    busy = false;
    renderWorkState();
  }
  function ask(c) {
    busy = true;
    renderWorkState();
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

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    var c = conv();
    if (!text || busy || !practiceScreen() || !c || c.kind === "demo") return;
    c.messages.push({ role: "user", content: text, screen: curScreen().code });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 44) + (text.length > 44 ? "…" : "");
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

  $("[data-new]").addEventListener("click", function () {
    if (work.classList.contains("is-target")) return;
    var c = conv();
    var code = curScreen().code;
    if (!c || c.messages.length || c.kind === "demo") c = newConv(code === "3.13" ? "compare" : "practice");
    if (code === "3.08") S.practiceId = c.id;
    if (code === "3.13") S.compareId = c.id;
    save(); renderConv(); render();
    if (!input.disabled) input.focus();
  });
  $("[data-hist-toggle]").addEventListener("click", function () {
    if (work.classList.contains("is-target")) return;
    var pop = $("[data-hist]");
    pop.hidden = !pop.hidden;
    this.setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".hist")) { $("[data-hist]").hidden = true; $("[data-hist-toggle]").setAttribute("aria-expanded", "false"); }
  });
  attachBtn.addEventListener("click", function () { if (curScreen().code === "3.11") { setAttach(true); render(); } });
  $("[data-attach-remove]").addEventListener("click", function () { setAttach(false); });

  /* ---------- Mode réel (Claude via l'API) ou simulé ---------- */

  var modeBtn = $("[data-mode]");
  function setMode(m, forced) {
    mode = m;
    if (forced) { S.forceSim = m === "sim"; save(); }
    modeBtn.dataset.state = m;
    modeBtn.textContent = m === "live" ? "Claude connecté" : "Mode simulé";
    modeBtn.title = m === "live" ? "Cliquer pour passer en simulation" : "Cliquer pour tenter la connexion à Claude";
    $("[data-work-note]").textContent = m === "live"
      ? "Interface simulée. Réponses générées par Claude dans un environnement de formation. Vérifiez toujours les faits."
      : "Interface et réponses simulées pour l’exercice. Ce n’est pas l’interface réelle de Claude.";
  }
  function probe() {
    if (!API || S.forceSim) { setMode("sim"); return; }
    fetch(API).then(function (r) { return r.json(); }).then(function (j) { setMode(j && j.live ? "live" : "sim"); }).catch(function () { setMode("sim"); });
  }
  modeBtn.addEventListener("click", function () { if (mode === "live") setMode("sim", true); else { S.forceSim = false; save(); probe(); } });

  /* ---------- Onglets (mobile) ---------- */

  function showTab(tab) {
    shell.dataset.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
    $("[data-tab-dot]").hidden = tab === "claude" || !work.classList.contains("is-active");
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  /* ---------- Démarrage (3.01) et reprise au dernier écran ---------- */

  function openShell(animate) {
    var intro = $("[data-intro]");
    shell.hidden = false;
    if (animate) { intro.classList.add("is-leaving"); setTimeout(function () { intro.hidden = true; }, 450); }
    else intro.hidden = true;
    if (!conv()) newConv("free");
    renderConv();
    if (curScreen().enter) curScreen().enter();
    render(true);
  }

  var introVo = speaker(SCREENS[0]);
  introVo.classList.add("speaker--intro", "rv");
  $("[data-vo-intro]").replaceWith(introVo);

  function start() {
    audio.pause();
    if (S.cur >= 1) { openShell(true); return; }
    S.far = Math.max(S.far, 1);
    go(1);
    openShell(true);
  }
  $$("[data-start], [data-start-top]").forEach(function (b) { b.addEventListener("click", start); });
  function showIntro() {
    var intro = $("[data-intro]");
    intro.classList.remove("is-leaving");
    intro.hidden = false;
    intro.scrollTop = 0;
    $$("[data-start]").forEach(function (b) { b.textContent = S.cur >= 1 ? "Reprendre à l’écran " + curScreen().code : "Commencer"; });
    $("[data-start-top]").textContent = S.cur >= 1 ? "Revenir au module" : "Passer l’introduction";
  }

  /* introduction : apparitions, récit à défilement, sommaire, compteurs */
  (function scrollIntro() {
    var intro = $("[data-intro]");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-reveal");
    var countUp = function (el) {
      var to = +el.dataset.count;
      if (reduce || el.dataset.done) { el.textContent = to; return; }
      el.dataset.done = "1";
      var t0 = performance.now();
      (function tick(t) {
        var k = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    };
    var rv = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$(".x-count", e.target).forEach(countUp);
        rv.unobserve(e.target);
      });
    }, { root: intro, threshold: 0.15 });
    $$(".rv", intro).forEach(function (el) { rv.observe(el); });

    // le titre « Une réunion produit des actions » reste affiché pendant le récit
    var tache = $("#x-tache", intro), tBlock = $("#x-tache .x-intro-block", intro);
    var setTh = function () { tache.style.setProperty("--th", tBlock.offsetHeight + "px"); };
    setTh();
    if ("ResizeObserver" in window) new ResizeObserver(setTh).observe(tBlock);

    var stage = $(".x-stage", intro), steps = $$(".x-step", intro);
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (x) { x.classList.toggle("is-on", x === e.target); });
        stage.dataset.stage = e.target.dataset.step;
      });
    }, { root: intro, rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (x) { so.observe(x); });

    var links = $$("[data-toc]", intro);
    var to = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { root: intro, rootMargin: "-40% 0px -55% 0px" });
    links.forEach(function (a) {
      var t = $(a.getAttribute("href"), intro);
      if (t) to.observe(t);
      a.addEventListener("click", function (ev) { ev.preventDefault(); t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); });
    });
    $$(".x-down", intro).forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); $("#x-tache", intro).scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }); });

    var bar = $("[data-x-progress]", intro);
    intro.addEventListener("scroll", function () {
      var k = intro.scrollTop / Math.max(1, intro.scrollHeight - intro.clientHeight);
      bar.style.width = (k * 100) + "%";
    }, { passive: true });
  })();

  showTab("story");
  setMode("sim");
  probe();
  if (S.cur >= 1) openShell(false); else showIntro();

  // point d'accès pour le futur adaptateur SCORM
  window.ImmersifTracking = {
    snapshot: function () {
      return {
        screen: curScreen().code, furthest: SCREENS[S.far].code,
        score: total(), max: MAX, threshold: SEUIL, validated: validated(),
        activities: SCORED.map(function (x) { var a = S.act[x.code] || {}; return { screen: x.code, best: best(x.code), max: x.max, done: actDone(x.code), attempts: a.tries || a.subs || [], corrected: !!a.corrected, history: a.history || [] }; }),
        toolMode: S.toolMode || null, practice: S.practice, responses: S.stats, reperes: !!S.reperes, preference: (S.act["3.16"] || {}).text || null
      };
    }
  };
})();
