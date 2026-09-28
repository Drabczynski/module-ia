/* ==========================================================================
   Découvrir Claude — une journée chez Lumen (scénario fictif)
   Une étape à la fois : le guide n'affiche qu'un écran ; l'espace Claude
   ne s'ouvre qu'aux étapes « À faire dans Claude ».
   ========================================================================== */
(function () {
  "use strict";

  var API = window.CLAUDE_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "decouvrir-claude-v2";
  var FIRST_BYTE_TIMEOUT = 20000;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Contenus du scénario ---------- */

  var DOC =
    "Compte rendu — Réunion client Maison Aubrac (document fictif)\n" +
    "Date : mardi 8 avril. Participants : Inès Morel (Lumen), Paul Girard (Maison Aubrac).\n" +
    "Objet : refonte de l’identité visuelle de la marque de thé Maison Aubrac.\n\n" +
    "Points abordés\n" +
    "- Le client souhaite une identité plus moderne, en gardant le vert historique de la marque.\n" +
    "- Trois pistes de logo seront présentées.\n" +
    "- Le site web n’est pas concerné pour l’instant.\n\n" +
    "Décisions\n" +
    "- Présentation des trois pistes de logo le 22 avril.\n" +
    "- Maquettes d’emballage à livrer pour le 6 mai.\n\n" +
    "Actions\n" +
    "- Inès (Lumen) : envoyer le planning détaillé avant le 11 avril.\n" +
    "- Paul (Maison Aubrac) : transmettre les anciens emballages au format numérique.\n" +
    "- Équipe design (Lumen) : préparer les trois pistes de logo.\n\n" +
    "Question en suspens\n" +
    "- La date de lancement en boutique reste à confirmer.";

  var TAKEAWAYS = [
    "Parlez à Claude en phrases. Dans une conversation, il garde le fil.",
    "Une bonne demande : tâche + contexte + format.",
    "Pour améliorer, dites ce qui ne va pas et ce que vous voulez.",
    "Claude ne voit que ce que vous lui donnez : collez la source.",
    "Vérifiez chiffres, noms et dates dans la source.",
    "Jamais de mot de passe. Données sensibles : suivez la politique de l’entreprise."
  ];

  /* analyse d'une demande : tâche, contexte, format (indicatif) */
  var FACTS = [/hugo/i, /stagiaire|stage\b/i, /design|graphi/i, /lundi|14 avril/i, /[ée]quipe|studio|lumen/i, /6 mois|six mois/i, /vendredi|d[ée]jeun/i];
  function analyze(text) {
    var t = /(^|[^a-zà-ÿ])(r[ée]dige|r[ée]diger|[ée]cri[st]|[ée]crire|r[ée]sume|r[ée]sumer|liste|lister|cr[ée]e|cr[ée]er|propose|proposer|fai[st]|faire|pr[ée]pare|pr[ée]parer|tradui|corrige|reformule|g[ée]n[èe]re|compose|aide-moi|pourrais-tu|peux-tu|pouvez-vous)/i.test(text);
    var facts = FACTS.filter(function (re) { return re.test(text); }).length;
    var f = /(\d+\s*(lignes?|mots|phrases?|paragraphes?)|court|bref|concis|\bton\b|chaleureu|convivial|d[ée]contract|formel|slack|tutoi|vouvoi|[ée]moji|liste|puces|tableau)/i.test(text);
    return { T: t, C: facts >= 2 ? 2 : facts, F: f };
  }

  /* ---------- Les missions ---------- */
  // Chaque étape = une seule action. Les messages d'Inès consécutifs
  // forment un seul écran, suivis éventuellement du document ou de la consigne.

  var CH = [
    {
      label: "Mission 1", title: "Faire connaissance",
      steps: [
        { t: "ines", text: "Bienvenue chez Lumen ! Je suis Inès, je dirige le studio. Ici, tout le monde travaille avec Claude, un assistant IA." },
        { t: "ines", text: "Commençons par voir ce que vous en savez." },
        { t: "multi", pts: 10, q: "Que peut faire Claude ?",
          opts: [
            ["Rédiger un e-mail ou un message", true, "C’est l’un de ses usages les plus courants."],
            ["Résumer un document que vous lui donnez", true, "Oui, si vous lui donnez le document."],
            ["Lire vos e-mails sans que vous les lui donniez", false, "Il ne voit que ce que vous lui transmettez."],
            ["Proposer des idées, reformuler un texte", true, "Très utile pour trouver des pistes."],
            ["Garantir des réponses toujours exactes", false, "Il peut se tromper : vous verrez comment vérifier."]
          ] },
        { t: "note", title: "Remarque", html: "Claude répond à ce que vous écrivez. Parlez-lui <b>comme à un collègue</b>, en phrases simples." },
        { t: "practice", pts: 20, title: "Présentez-vous à Claude",
          task: "Dites qui vous êtes et demandez-lui comment il peut vous aider. Puis posez une question sur sa réponse.",
          criteria: [["first", "Envoyer un premier message"], ["follow", "Poser une question de suivi"]],
          hints: [
            { text: "Bonjour ! Je suis chargé·e de projet dans un studio de design. Comment peux-tu m’aider au quotidien ?" },
            { text: "Peux-tu me donner un exemple concret pour le premier point ?" }
          ] },
        { t: "qcm", pts: 10, q: "Vous n’avez rien réexpliqué. Pourquoi Claude a-t-il compris ?",
          opts: [
            ["Il tient compte de toute la conversation en cours", true, "Exact : dans une conversation, il garde le fil."],
            ["Il se souvient de toutes vos conversations passées", false, "Pas par défaut : une nouvelle conversation repart de zéro."],
            ["Il devine ce que vous voulez", false, "Non : il s’appuie sur ce que vous avez écrit."]
          ] },
        { t: "keep", i: 0 }
      ]
    },
    {
      label: "Mission 2", title: "La recette d’une bonne demande",
      steps: [
        { t: "ines", text: "Hugo, notre stagiaire, arrive lundi. Il faut un message de bienvenue pour l’équipe." },
        { t: "ines", text: "Regardez d’abord ces deux demandes." },
        { t: "compare" },
        { t: "link", pts: 10, q: "Reliez chaque morceau à son rôle.", sub: "Cliquez un morceau, puis son rôle.",
          items: [
            ["Rédige un message de bienvenue", "T"],
            ["pour Hugo, stagiaire designer graphique", "C"],
            ["qui rejoint notre studio lundi pour six mois", "C"],
            ["Ton chaleureux, tutoiement", "F"],
            ["5 lignes maximum, pour Slack", "F"]
          ] },
        { t: "note", title: "La recette", html: "<span class=\"tok-t\">Tâche</span> + <span class=\"tok-c\">Contexte</span> + <span class=\"tok-f\">Format</span> : les informations qu’un collègue vous demanderait." },
        { t: "practice", pts: 20, analysis: true, title: "Écrivez votre demande",
          task: "Demandez à Claude le message pour Hugo, avec vos mots.",
          facts: ["Hugo", "stagiaire designer graphique", "6 mois", "arrive lundi", "studio de 12 personnes", "pour Slack"],
          criteria: [["T", "Tâche : ce que Claude doit faire"], ["C", "Contexte : au moins deux informations"], ["F", "Format : longueur, ton ou support"]],
          hints: [
            { text: "Tâche = le verbe (rédige, résume…). Contexte = pour qui, quelle situation. Format = longueur, ton, support.", plain: true },
            { after: 2, text: "Rédige un message de bienvenue pour Hugo, stagiaire designer graphique qui rejoint notre studio lundi pour six mois. Ton chaleureux, tutoiement, 5 lignes maximum, pour Slack." }
          ] },
        { t: "qcm", pts: 10, q: "Par rapport à la demande vague, qu’est-ce qui change ?",
          opts: [
            ["La réponse est adaptée à Hugo, presque prête", true, "Oui : plus d’informations utiles, moins de retouches."],
            ["La réponse est simplement plus longue", false, "C’est la précision qui change, pas la longueur."],
            ["Rien, Claude répond toujours pareil", false, "Au contraire : la réponse dépend de votre demande."]
          ] },
        { t: "keep", i: 1 }
      ]
    },
    {
      label: "Mission 3", title: "Améliorer sans recommencer",
      steps: [
        { t: "ines", text: "C’est un peu long pour Slack, et il manque le déjeuner de vendredi." },
        { t: "qcm", pts: 10, q: "Quelle relance choisir ?",
          opts: [
            ["« Bof, refais. »", false, "Claude ne sait pas ce qui ne va pas : il changera au hasard."],
            ["Ouvrir une nouvelle conversation et tout réécrire", false, "Vous perdriez le contexte déjà donné."],
            ["« Raccourcis à 3 lignes et ajoute qu’on déjeune ensemble vendredi. »", true, "Oui : ce qui ne va pas, et ce que vous voulez."]
          ] },
        { t: "practice", pts: 20, title: "Demandez les ajustements",
          task: "Dans la même conversation, demandez un message plus court, avec le déjeuner de vendredi.",
          criteria: [["same", "Rester dans la même conversation"], ["short", "Demander plus court"], ["lunch", "Ajouter le déjeuner de vendredi"]],
          hints: [{ text: "Raccourcis-le à 3 lignes et ajoute qu’on déjeune tous ensemble vendredi midi." }] },
        { t: "tf", pts: 5, q: "Vrai ou faux ?", choices: ["Vrai", "Faux"],
          items: [
            ["Nouveau sujet : nouvelle conversation.", "Vrai", "Cela évite de mélanger les contextes."],
            ["Si la réponse ne convient pas, il faut tout réécrire soi-même.", "Faux", "Une relance précise suffit souvent."],
            ["On peut demander plusieurs versions pour choisir.", "Vrai", "Par exemple : « Propose trois versions »."]
          ] },
        { t: "keep", i: 2 }
      ]
    },
    {
      label: "Mission 4", title: "Travailler sur un document",
      steps: [
        { t: "ines", text: "Voici le compte rendu d’une réunion client. Il me faut les actions : qui, quoi, quand." },
        { t: "doc" },
        { t: "order", pts: 10, q: "Dans quel ordre procéder ?", sub: "Cliquez les étapes dans l’ordre.",
          items: ["Ouvrir une nouvelle conversation", "Coller le compte rendu", "Demander les actions dans un tableau", "Relire le tableau avec la source"] },
        { t: "practice", pts: 20, doc: true, title: "Obtenez les actions",
          task: "Ouvrez une nouvelle conversation, collez le compte rendu, puis demandez un tableau des actions.",
          criteria: [["new", "Ouvrir une nouvelle conversation"], ["doc", "Coller le compte rendu"], ["fmt", "Demander un tableau"]],
          hints: [{ text: "Liste les actions de ce compte rendu dans un tableau : action, responsable, échéance." }] },
        { t: "note", title: "Remarque", html: "Claude <b>ne voit que ce que vous lui donnez</b>. Sans le compte rendu, il ne peut pas deviner : il risquerait d’inventer." },
        { t: "keep", i: 3 }
      ]
    },
    {
      label: "Mission 5", title: "Vérifier, toujours",
      steps: [
        { t: "ines", text: "Le client demande le budget validé et la date d’envoi des anciens emballages. Demandez à Claude." },
        { t: "practice", pts: 20, title: "Posez les deux questions",
          task: "Dans la conversation du compte rendu, demandez le budget validé et la date d’envoi des anciens emballages.",
          criteria: [["budget", "Demander le budget validé"], ["emb", "Demander la date d’envoi des emballages"]],
          hints: [{ text: "Quel budget le client a-t-il validé ? Et quand Paul doit-il envoyer les anciens emballages ?" }] },
        { t: "multi", pts: 10, peek: true, q: "Qu’y a-t-il vraiment dans le compte rendu ?",
          opts: [
            ["Un budget validé", false, "Aucun budget n’y figure."],
            ["Une date d’envoi des anciens emballages", false, "L’action de Paul n’a pas de date."],
            ["La date de présentation des logos", true, "Le 22 avril."]
          ] },
        { t: "qcm", reflect: true, q: "Et Claude, qu’a-t-il répondu ?",
          opts: [
            ["Que ces informations n’y figurent pas", null, "C’est le comportement attendu. Gardez le réflexe de vérifier."],
            ["Un montant ou une date", null, "C’est le piège : une réponse assurée n’est pas une preuve."],
            ["Je ne suis pas sûr·e", null, "Relisez sa réponse à côté du compte rendu."]
          ] },
        { t: "spot", pts: 10, q: "Un autre assistant a répondu ceci. Cliquez les 2 informations inventées.",
          parts: ["Le budget validé est de ", { hot: "15 000 €", bad: true }, ". Paul doit envoyer les anciens emballages avant le ", { hot: "15 avril", bad: true }, ". Les logos seront présentés le ", { hot: "22 avril", bad: false }, "."] },
        { t: "practice", pts: 20, title: "Faites citer la source",
          task: "Demandez à Claude de citer le passage du compte rendu qui justifie une de ses réponses.",
          criteria: [["cite", "Demander le passage exact"]],
          hints: [{ text: "Cite le passage exact du compte rendu qui indique la date de présentation des logos." }] },
        { t: "keep", i: 4 }
      ]
    },
    {
      label: "Mission 6", title: "Les bons réflexes",
      steps: [
        { t: "ines", text: "Dernier point : que pouvez-vous confier à Claude ?" },
        { t: "tf", pts: 5, q: "Pour chaque situation, que faites-vous ?", choices: ["Oui", "Selon la politique", "Jamais"],
          items: [
            ["Coller le compte rendu fictif de cette formation.", "Oui", "Données fictives, prévues pour l’exercice."],
            ["Coller la liste réelle des clients, avec e-mails et téléphones.", "Selon la politique", "Données personnelles : seulement si votre entreprise l’autorise."],
            ["Donner mon mot de passe pour qu’il lise ma messagerie.", "Jamais", "Aucun mot de passe dans une conversation."],
            ["Faire reformuler un texte que j’ai écrit.", "Oui", "Usage simple et sans risque."]
          ] },
        { t: "note", title: "Dans le doute", html: "Retirez les noms et les informations sensibles, ou demandez à votre responsable. <b>Aucun mot de passe, jamais.</b>" },
        { t: "keep", i: 5 }
      ]
    },
    {
      label: "Bilan", title: "Votre aide-mémoire",
      steps: [
        { t: "ines", text: "Bravo, première journée réussie ! Voici votre aide-mémoire." },
        { t: "final" }
      ]
    }
  ];
  var MISSIONS = CH.length - 1;

  /* écrans : les messages d'Inès consécutifs se regroupent, avec le document,
     la consigne ou le bilan qui les suit */
  var JOIN = { ines: 1, doc: 1, practice: 1, final: 1 };
  var SCREENS = CH.map(function (c) {
    var out = [];
    c.steps.forEach(function (s, i) {
      var last = out[out.length - 1];
      var onlyInes = last && last.every(function (k) { return c.steps[k].t === "ines"; });
      if (onlyInes && JOIN[s.t]) last.push(i); else out.push([i]);
    });
    return out;
  });
  function mainIdx(c, n) { var sc = SCREENS[c][n]; return sc[sc.length - 1]; }

  /* ---------- État ---------- */

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.ch = S.ch || 0;
  S.pos = S.pos || {};        // écran atteint dans chaque mission
  S.st = S.st || {};
  S.done = S.done || [];
  S.xp = S.xp || 0;
  S.convs = S.convs || [];
  S.learner = S.learner || Math.random().toString(36).slice(2, 12);
  S.level = S.level || "parfois";
  S.stats = S.stats || { live: 0, sim: 0 };
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }
  function pos(c) { return S.pos[c] || 0; }
  function key(c, i) { return c + "." + i; }
  function st(c, i) { return S.st[key(c, i)] || (S.st[key(c, i)] = {}); }

  var mode = "sim", busy = false;
  var view = { c: S.ch, n: pos(S.ch) };     // écran affiché (on peut revenir en arrière)

  /* ---------- Éléments ---------- */

  var bodyEl = $("[data-g-body]"), messagesEl = $("[data-messages]");
  var input = $("[data-input]"), composer = $("[data-composer]"), sendBtn = $(".send");
  var work = $(".work"), shell = $("[data-shell]"), toastEl = $("[data-toast]");
  var nextBtn = $("[data-next]"), backBtn = $("[data-back]");

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function txt(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
  function shuffle(arr, seed) {
    var a = arr.slice(), s = seed;
    for (var i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
    return a;
  }

  /* ---------- Rendu Markdown minimal ---------- */

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

  /* ---------- Points et notifications ---------- */

  var toastTimer;
  function toast(text, pts) {
    toastEl.innerHTML = '<span class="t-ic"><svg><use href="#i-check"/></svg></span><span></span>' + (pts ? '<span class="t-pts">+' + pts + " pts</span>" : "");
    toastEl.children[1].textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }
  function award(k, pts, text) {
    S.awarded = S.awarded || {};
    if (!pts || S.awarded[k]) return;
    S.awarded[k] = pts;
    S.xp += pts;
    save();
    toast(text || "Bonne réponse", pts);
    $("[data-xp]").textContent = S.xp;
  }

  /* ---------- Navigation ---------- */

  function reached(c, n) { return c < S.ch || (c === S.ch && n <= pos(c)); }
  function atFrontier() { return view.c === S.ch && view.n === pos(S.ch); }
  function frontierStep() { var c = S.ch, i = mainIdx(c, pos(c)); return { c: c, i: i, s: CH[c].steps[i] }; }
  function currentStep() { return frontierStep().s; }

  function stepDone(s, c, i) {
    var state = st(c, i);
    if (CHECK[s.t] || s.t === "qcm") return !!state.checked;
    if (s.t === "tf") return Object.keys(state.ans || {}).length === s.items.length;
    if (s.t === "practice") return !!state.done;
    return true;
  }

  function go(c, n) {
    view = { c: c, n: n };
    renderAll(true);
  }

  function forward() {
    if (!atFrontier()) {
      if (view.n < SCREENS[view.c].length - 1) go(view.c, view.n + 1);
      else go(view.c + 1, 0);
      return;
    }
    S.pos[S.ch] = pos(S.ch) + 1;
    save();
    go(S.ch, pos(S.ch));
  }

  function backward() {
    if (view.n > 0) go(view.c, view.n - 1);
    else if (view.c > 0) go(view.c - 1, SCREENS[view.c - 1].length - 1);
  }

  function completeChapter() {
    var c = S.ch;
    if (S.done.indexOf(c) < 0) S.done.push(c);
    if (c < CH.length - 1) S.ch++;
    save();
    toast(CH[c].label + " accomplie");
    go(S.ch, pos(S.ch));
  }

  /* bouton principal du pied de page : Valider, Continuer ou Mission suivante */
  function primary() {
    var c = view.c, i = mainIdx(c, view.n), s = CH[c].steps[i], state = st(c, i);
    if (!atFrontier()) return { label: "Suivant", run: forward };
    if (s.t === "final") return null;
    if (CHECK[s.t] && !state.checked) {
      return { label: "Valider", disabled: !READY[s.t](s, state), run: function () { CHECK[s.t](s, c, i, state); save(); renderAll(); } };
    }
    if (!stepDone(s, c, i)) return { label: "Continuer", disabled: true };
    if (s.t === "keep") return { label: c < MISSIONS - 1 ? "Mission suivante" : "Voir mon bilan", run: completeChapter };
    return { label: "Continuer", run: forward };
  }

  $("[data-next]").addEventListener("click", function () { var p = primary(); if (p && p.run && !p.disabled) p.run(); });
  backBtn.addEventListener("click", backward);

  /* ---------- En-tête du guide ---------- */

  function renderHeader() {
    var c = view.c, ch = CH[c];
    $("[data-g-mission]").textContent = c < MISSIONS ? "Mission " + (c + 1) + " sur " + MISSIONS : "Bilan";
    $("[data-g-title]").textContent = ch.title;
    $("[data-xp]").textContent = S.xp;
    var bar = $("[data-g-steps]");
    bar.innerHTML = "";
    SCREENS[c].forEach(function (x, n) {
      var seg = document.createElement("i");
      if (n === view.n) seg.className = "is-cur";
      else if (reached(c, n)) seg.className = "is-done";
      bar.appendChild(seg);
    });
    var pop = $("[data-missions-pop]");
    pop.innerHTML = "";
    CH.forEach(function (m, k) {
      var done = S.done.indexOf(k) >= 0, open = k <= S.ch;
      var b = h('<button type="button" class="mp-item"><span class="st"></span><span></span></button>');
      b.lastChild.textContent = (k < MISSIONS ? (k + 1) + ". " : "") + m.title;
      if (done) b.firstChild.innerHTML = '<svg><use href="#i-check"/></svg>';
      b.classList.toggle("is-done", done);
      b.classList.toggle("is-cur", k === c);
      b.disabled = !open;
      b.onclick = function () { closeMissions(); go(k, k === S.ch ? pos(k) : 0); showTab("story"); };
      pop.appendChild(b);
    });
  }

  function closeMissions() { $("[data-missions-pop]").hidden = true; $("[data-missions]").setAttribute("aria-expanded", "false"); }
  $("[data-missions]").addEventListener("click", function (e) {
    e.stopPropagation();
    var pop = $("[data-missions-pop]");
    pop.hidden = !pop.hidden;
    this.setAttribute("aria-expanded", String(!pop.hidden));
  });

  /* ---------- Écran courant ---------- */

  function renderAll(fresh) {
    renderHeader();
    var y = bodyEl.scrollTop;
    bodyEl.innerHTML = "";
    var c = view.c, frontier = atFrontier();
    SCREENS[c][view.n].forEach(function (i) {
      var s = CH[c].steps[i];
      var node = RENDER[s.t](s, c, i, frontier && i === mainIdx(c, view.n));
      if (node) bodyEl.appendChild(node);
    });
    if (fresh) bodyEl.scrollTop = 0; else bodyEl.scrollTop = y;
    var p = primary();
    nextBtn.hidden = !p;
    if (p) { nextBtn.textContent = p.label; nextBtn.disabled = !!p.disabled; }
    backBtn.disabled = view.c === 0 && view.n === 0;
    renderWorkState();
    liveAnalysis();
  }

  function frag() { return document.createElement("div"); }
  function kind(text, claude) { return txt("p", "kind" + (claude ? " is-claude" : ""), text); }
  function feedback(ok, text) {
    var el = h('<div class="feedback ' + (ok ? "is-ok" : "is-ko") + '"><svg><use href="#i-' + (ok ? "check" : "bulb") + '"/></svg><span></span></div>');
    el.lastChild.textContent = text;
    return el;
  }
  function docBlock() {
    var el = h('<div class="doc"><div class="doc-head"><svg><use href="#i-doc"/></svg><span>Compte rendu · Maison Aubrac</span></div><pre></pre></div>');
    el.querySelector("pre").textContent = DOC;
    return el;
  }

  var RENDER = {
    ines: function (s) {
      var el = h('<div class="speaker"><span class="av av-ines">IM</span><div><div class="who">Inès · directrice du studio</div><p></p></div></div>');
      el.querySelector("p").textContent = s.text;
      return el;
    },

    note: function (s) {
      var el = frag();
      el.appendChild(kind(s.title));
      var n = h('<div class="note"></div>');
      n.innerHTML = s.html;
      el.appendChild(n);
      return el;
    },

    compare: function () {
      return h('<div><p class="kind">Observer</p><h2 class="q">Même besoin, deux demandes</h2><div class="compare">' +
        '<div class="cmp bad"><span class="lbl">Demande vague</span><div class="prompt">Écris un message de bienvenue.</div>' +
        '<div class="answer">« Bienvenue à [Prénom] ! Nous sommes ravis de t’accueillir au sein de [nom de l’équipe]… »<br>Générique, avec des trous.</div></div>' +
        '<div class="cmp good"><span class="lbl">Demande complète</span><div class="prompt"><span class="tok-t">Rédige un message de bienvenue</span> <span class="tok-c">pour Hugo, stagiaire designer graphique, qui rejoint notre studio lundi pour six mois</span>. <span class="tok-f">Ton chaleureux, tutoiement, 5 lignes maximum, pour Slack.</span></div>' +
        '<div class="answer">« Bienvenue Hugo ! Lundi, tu rejoins le studio pour six mois… »<br>Précis, presque prêt à poster.</div></div></div></div>');
    },

    doc: function () { return docBlock(); },

    qcm: function (s, c, i) { return choiceStep(s, c, i, false); },
    multi: function (s, c, i) { return choiceStep(s, c, i, true); },

    link: function (s, c, i) {
      var state = st(c, i);
      state.map = state.map || {};
      var CATS = [["T", "Tâche", "ce qu’il doit faire"], ["C", "Contexte", "la situation"], ["F", "Format", "la forme"]];
      var el = h('<div><p class="kind">Relier</p><h2 class="q"></h2><p class="sub"></p><div class="link-wrap"><div class="link-items"></div><div class="link-cats"></div></div></div>');
      el.querySelector(".q").textContent = s.q;
      el.querySelector(".sub").textContent = s.sub;
      var items = shuffle(s.items.map(function (x, k) { return [x[0], x[1], k]; }), 7 + c);
      items.forEach(function (it) {
        var b = h('<button type="button" class="li-item"></button>');
        b.textContent = it[0];
        var got = state.map[it[2]];
        if (got) b.appendChild(h('<span class="tag tag-' + got + '">' + { T: "Tâche", C: "Contexte", F: "Format" }[got] + "</span>"));
        if (state.checked) b.classList.add(got === it[1] ? "is-right" : "is-wrong");
        b.classList.toggle("is-sel", state.selItem === it[2]);
        b.disabled = !!state.checked;
        b.onclick = function () { state.selItem = it[2]; renderAll(); };
        el.querySelector(".link-items").appendChild(b);
      });
      CATS.forEach(function (ct) {
        var b = h('<button type="button" class="li-cat" data-cat="' + ct[0] + '"><span></span><small></small></button>');
        b.firstChild.textContent = ct[1];
        b.lastChild.textContent = ct[2];
        b.disabled = !!state.checked;
        b.onclick = function () {
          if (state.selItem === undefined || state.selItem === null) return;
          state.map[state.selItem] = ct[0];
          state.selItem = null;
          save(); renderAll();
        };
        el.querySelector(".link-cats").appendChild(b);
      });
      if (state.checked) {
        var ok = state.score === s.items.length;
        el.appendChild(feedback(ok, ok ? "Parfait : vous reconnaissez les trois ingrédients."
          : state.score + " sur " + s.items.length + ". Comparez avec les couleurs de la demande complète."));
      }
      return el;
    },

    order: function (s, c, i) {
      var state = st(c, i);
      state.picked = state.picked || [];
      var el = h('<div><p class="kind">Remettre dans l’ordre</p><h2 class="q"></h2><p class="sub"></p><div class="order-list"></div></div>');
      el.querySelector(".q").textContent = s.q;
      el.querySelector(".sub").textContent = s.sub;
      shuffle(s.items.map(function (x, k) { return [x, k]; }), 11).forEach(function (it) {
        var n = state.picked.indexOf(it[1]);
        var b = h('<button type="button" class="ord"><span class="n"></span><span></span></button>');
        b.lastChild.textContent = it[0];
        b.firstChild.textContent = n >= 0 ? n + 1 : "";
        b.classList.toggle("is-picked", n >= 0);
        if (state.checked) b.classList.add(n === it[1] ? "is-right" : "is-wrong");
        b.disabled = !!state.checked;
        b.onclick = function () {
          var at = state.picked.indexOf(it[1]);
          if (at >= 0) state.picked.splice(at, 1); else state.picked.push(it[1]);
          save(); renderAll();
        };
        el.querySelector(".order-list").appendChild(b);
      });
      if (!state.checked && state.picked.length) {
        var acts = h('<div class="inline-actions"><button type="button" class="btn-ghost">Effacer</button></div>');
        acts.firstChild.onclick = function () { state.picked = []; save(); renderAll(); };
        el.appendChild(acts);
      }
      if (state.checked) {
        el.appendChild(feedback(state.ok, state.ok ? "Exactement."
          : "Le bon ordre : " + s.items.map(function (x, k) { return (k + 1) + ". " + x; }).join(" · ")));
      }
      return el;
    },

    spot: function (s, c, i) {
      var state = st(c, i);
      state.sel = state.sel || [];
      var el = h('<div><p class="kind">Repérer</p><h2 class="q"></h2><div class="spot-text"></div></div>');
      el.querySelector(".q").textContent = s.q;
      var box = el.querySelector(".spot-text");
      s.parts.forEach(function (p, k) {
        if (typeof p === "string") { box.appendChild(document.createTextNode(p)); return; }
        var b = h('<button type="button" class="hot"></button>');
        b.textContent = p.hot;
        var on = state.sel.indexOf(k) >= 0;
        b.classList.toggle("is-sel", on && !state.checked);
        if (state.checked && (on || p.bad)) b.classList.add(p.bad && on ? "is-right" : "is-wrong");
        b.disabled = !!state.checked;
        b.onclick = function () {
          var at = state.sel.indexOf(k);
          if (at >= 0) state.sel.splice(at, 1); else state.sel.push(k);
          save(); renderAll();
        };
        box.appendChild(b);
      });
      if (state.checked) {
        el.appendChild(feedback(state.ok, state.ok ? "Bien vu : ni budget ni date d’envoi dans le compte rendu."
          : "Les inventions : « 15 000 € » et « 15 avril ». Le 22 avril, lui, figure dans le compte rendu."));
      }
      return el;
    },

    tf: function (s, c, i) {
      var state = st(c, i);
      state.ans = state.ans || {};
      var el = h('<div><p class="kind"></p><h2 class="q"></h2><div class="tf"></div></div>');
      el.querySelector(".kind").textContent = s.choices.length > 2 ? "Décider" : "Vrai ou faux";
      el.querySelector(".q").textContent = s.q;
      s.items.forEach(function (it, k) {
        var row = h('<div class="tf-row"><p></p><div class="tf-btns"></div></div>');
        row.firstChild.textContent = it[0];
        var given = state.ans[k];
        s.choices.forEach(function (chx) {
          var b = txt("button", "", chx);
          b.type = "button";
          if (given) { b.disabled = true; if (chx === it[1]) b.classList.add("is-right"); else if (chx === given) b.classList.add("is-wrong"); }
          b.onclick = function () {
            state.ans[k] = chx;
            save();
            if (chx === it[1]) award(key(c, i) + "." + k, s.pts, "Bonne réponse");
            renderAll();
          };
          row.lastChild.appendChild(b);
        });
        if (given) row.appendChild(txt("p", "opt-fb", it[2]));
        el.querySelector(".tf").appendChild(row);
      });
      return el;
    },

    practice: function (s, c, i, active) {
      var state = st(c, i);
      var res = evaluate(s, c, i);
      var el = h('<div><p class="kind is-claude">À faire dans Claude</p><h2 class="q"></h2><p class="task"></p><ul class="crit"></ul></div>');
      el.querySelector(".q").textContent = s.title;
      el.querySelector(".task").textContent = s.task;
      if (s.facts) {
        var f = h('<div class="facts"></div>');
        s.facts.forEach(function (x) { f.appendChild(txt("span", "", x)); });
        el.insertBefore(f, el.querySelector(".crit"));
      }
      s.criteria.forEach(function (cr) {
        var li = h('<li><span class="ck"><svg><use href="#i-check"/></svg></span><span></span></li>');
        li.lastChild.textContent = cr[1];
        li.classList.toggle("is-ok", !!res[cr[0]]);
        el.querySelector(".crit").appendChild(li);
      });
      if (state.done) { el.appendChild(feedback(true, "Réussi. Lisez la réponse de Claude, puis continuez.")); return el; }
      if (!active) return el;
      if (s.analysis) {
        el.appendChild(h('<div data-analysis><div class="analysis"><span class="an" data-an="T">Tâche</span><span class="an" data-an="C">Contexte</span><span class="an" data-an="F">Format</span></div><p class="an-tip" data-an-tip></p></div>'));
      }
      var acts = h('<div class="inline-actions"></div>');
      if (s.doc) {
        var d = h('<button type="button" class="btn-line"><svg><use href="#i-doc"/></svg>Coller le compte rendu</button>');
        d.onclick = function () { insert("Voici le compte rendu d’une réunion :\n\n" + DOC + "\n\n"); };
        acts.appendChild(d);
      }
      var g = h('<button type="button" class="btn-primary go-claude">Ouvrir Claude</button>');
      g.onclick = function () { showTab("claude"); input.focus(); };
      acts.appendChild(g);
      el.appendChild(acts);
      var hints = (s.hints || []).filter(function (x) { return !x.after || (state.tries || 0) >= x.after; });
      if (hints.length) {
        var open = S.level === "jamais" || state.hintsOpen;
        var tg = txt("button", "hint-toggle", open ? "Masquer l’aide" : "Besoin d’une idée ?");
        tg.type = "button";
        tg.onclick = function () { state.hintsOpen = !open; if (S.level === "jamais") S.level = "parfois"; save(); renderAll(); };
        el.appendChild(tg);
        if (open) {
          var chips = h('<div class="chips"></div>');
          hints.forEach(function (x) {
            if (x.plain) { chips.appendChild(txt("p", "an-tip", x.text)); return; }
            var b = txt("button", "chip", x.text);
            b.type = "button";
            b.title = "Insérer dans la zone de message";
            b.onclick = function () { insert(x.text); };
            chips.appendChild(b);
          });
          el.appendChild(chips);
        }
      }
      return el;
    },

    keep: function (s) {
      var el = frag();
      el.appendChild(txt("p", "keep-k", "À retenir"));
      el.appendChild(txt("p", "keep", TAKEAWAYS[s.i]));
      return el;
    },

    final: function () {
      var badges = [];
      if (S.bestPrompt) badges.push("Demande complète");
      if ((st(4, 4) || {}).ok) badges.push("Œil de lynx");
      var dec = st(5, 1).ans || {};
      if (CH[5].steps[1].items.every(function (it, k) { return dec[k] === it[1]; })) badges.push("Réflexes sûrs");
      var el = h('<div class="final"><div class="stats"><div class="stat"><b data-f-xp></b><span>points</span></div><div class="stat"><b data-f-m></b><span>missions</span></div><div class="stat"><b data-f-msg></b><span>échanges</span></div></div>' +
        '<div class="badges"></div><p class="section-k">Vos réflexes</p><ol class="memo"></ol><div data-f-prompt></div>' +
        '<div class="inline-actions"><button type="button" class="btn-primary" data-print>Imprimer l’aide-mémoire</button><button type="button" class="btn-ghost" data-restart>Recommencer</button></div></div>');
      el.querySelector("[data-f-xp]").textContent = S.xp;
      el.querySelector("[data-f-m]").textContent = S.done.filter(function (x) { return x < MISSIONS; }).length + "/" + MISSIONS;
      el.querySelector("[data-f-msg]").textContent = S.stats.live + S.stats.sim;
      badges.forEach(function (b) { el.querySelector(".badges").appendChild(txt("span", "badge", b)); });
      if (!badges.length) el.querySelector(".badges").remove();
      TAKEAWAYS.forEach(function (t) { el.querySelector(".memo").appendChild(txt("li", "", t)); });
      if (S.bestPrompt) {
        var p = el.querySelector("[data-f-prompt]");
        p.appendChild(txt("p", "section-k", "Votre demande de la mission 2"));
        p.appendChild(txt("div", "my-prompt", S.bestPrompt));
      }
      el.querySelector("[data-print]").onclick = printMemo;
      el.querySelector("[data-restart]").onclick = function () {
        if (!confirm("Recommencer la journée depuis le début ?")) return;
        try { localStorage.removeItem(STORE); } catch (e) { /* rien */ }
        location.reload();
      };
      return el;
    }
  };

  function choiceStep(s, c, i, multi) {
    var state = st(c, i);
    state.sel = state.sel || [];
    var el = h('<div><p class="kind"></p><h2 class="q"></h2><div class="opts"></div></div>');
    el.querySelector(".kind").textContent = s.reflect ? "Prendre du recul" : multi ? "Plusieurs réponses possibles" : "Question";
    el.querySelector(".q").textContent = s.q;
    var box = el.querySelector(".opts");
    s.opts.forEach(function (o, k) {
      var b = h('<button type="button" class="opt"><span class="box' + (multi ? "" : " round") + '"><svg><use href="#i-check"/></svg></span><span></span></button>');
      b.lastChild.textContent = o[0];
      var on = state.sel.indexOf(k) >= 0;
      var fb = false;
      if (state.checked) {
        b.disabled = true;
        if (s.reflect) { b.classList.toggle("is-sel", on); fb = on; }
        else if (o[1]) { b.classList.add("is-right"); fb = on || multi; }
        else if (on) { b.classList.add("is-wrong"); fb = true; }
        if (multi && state.ok) fb = false;
      } else b.classList.toggle("is-sel", on);
      b.onclick = function () {
        if (multi) { var at = state.sel.indexOf(k); if (at >= 0) state.sel.splice(at, 1); else state.sel.push(k); save(); renderAll(); return; }
        state.sel = [k];
        state.checked = true;
        save();
        if (!s.reflect && o[1]) award(key(c, i), s.pts, "Bonne réponse");
        renderAll();
      };
      box.appendChild(b);
      if (fb) box.appendChild(txt("p", "opt-fb", o[2]));
    });
    if (multi && state.checked && !s.reflect) el.appendChild(feedback(state.ok, state.ok ? "Parfait, tout est juste." : "Pas tout à fait : lisez les explications."));
    if (s.peek) {
      var d = h('<details class="peek"><summary>Revoir le compte rendu</summary></details>');
      d.appendChild(docBlock());
      el.appendChild(d);
    }
    return el;
  }

  /* validations déclenchées par le bouton « Valider » du pied de page */
  var READY = {
    multi: function (s, state) { return (state.sel || []).length > 0; },
    link: function (s, state) { return Object.keys(state.map || {}).length === s.items.length; },
    order: function (s, state) { return (state.picked || []).length === s.items.length; },
    spot: function (s, state) { return (state.sel || []).length > 0; }
  };
  var CHECK = {
    multi: function (s, c, i, state) {
      state.checked = true;
      state.ok = s.opts.every(function (o, k) { return !!o[1] === (state.sel.indexOf(k) >= 0); });
      if (state.ok) award(key(c, i), s.pts, "Tout est juste");
    },
    link: function (s, c, i, state) {
      state.checked = true;
      state.selItem = null;
      state.score = s.items.filter(function (x, k) { return state.map[k] === x[1]; }).length;
      if (state.score === s.items.length) award(key(c, i), s.pts, "Tout est relié");
    },
    order: function (s, c, i, state) {
      state.checked = true;
      state.ok = state.picked.every(function (v, k) { return v === k; });
      if (state.ok) award(key(c, i), s.pts, "Bon ordre");
    },
    spot: function (s, c, i, state) {
      var bad = s.parts.map(function (p, k) { return p && p.bad ? k : -1; }).filter(function (k) { return k >= 0; });
      state.checked = true;
      state.ok = state.sel.length === bad.length && bad.every(function (k) { return state.sel.indexOf(k) >= 0; });
      if (state.ok) award(key(c, i), s.pts, "Inventions repérées");
    }
  };

  /* ---------- Critères des étapes « Essayer » ---------- */

  function userMsgs(c, i) {
    var out = [];
    S.convs.forEach(function (cv) {
      cv.messages.forEach(function (m, k) {
        if (m.role === "user" && m.ch === c && m.step === i) out.push({ conv: cv, m: m, k: k, answered: !!cv.messages[k + 1] && cv.messages[k + 1].role === "assistant" });
      });
    });
    return out;
  }

  function evaluate(s, c, i) {
    var msgs = userMsgs(c, i).filter(function (x) { return x.answered; });
    var r = {};
    var text = function (x) { return x.m.content.toLowerCase(); };
    if (c === 0) {
      r.first = msgs.length >= 1;
      r.follow = S.convs.some(function (cv) { return msgs.filter(function (x) { return x.conv === cv; }).length >= 2; });
    } else if (c === 1) {
      var best = null;
      msgs.forEach(function (x) {
        var a = analyze(x.m.content);
        if (a.T) r.T = true;
        if (a.C >= 2) r.C = true;
        if (a.F) r.F = true;
        if (a.T && a.C >= 2 && a.F) best = x;
      });
      if (best) { S.bestPrompt = best.m.content; S.welcomeConv = best.conv.id; }
      r.__complete = !!best;
    } else if (c === 2) {
      var inWelcome = msgs.filter(function (x) { return x.conv.id === S.welcomeConv; });
      r.same = inWelcome.length > 0;
      r.short = inWelcome.some(function (x) { return /(\d+\s*(lignes?|mots|phrases?))|court|raccourci|r[ée]duis|bref|concis|moins long/.test(text(x)); });
      r.lunch = inWelcome.some(function (x) { return /vendredi|d[ée]jeun|repas/.test(text(x)); });
    } else if (c === 3) {
      var withDoc = msgs.filter(function (x) { return /maison aubrac/.test(text(x)) && x.m.content.length > 200; });
      r.doc = withDoc.length > 0;
      r.new = withDoc.some(function (x) { return x.conv.messages[0].ch === 3 && x.conv.id !== S.welcomeConv; });
      r.fmt = msgs.some(function (x) { return /tableau|liste|actions?/.test(text(x)) && withDoc.some(function (d) { return d.conv === x.conv; }); });
      if (withDoc.length) S.docConv = withDoc[withDoc.length - 1].conv.id;
    } else if (c === 4 && s.criteria[0][0] === "budget") {
      r.budget = msgs.some(function (x) { return /budget/.test(text(x)); });
      r.emb = msgs.some(function (x) { return /emballage/.test(text(x)); });
    } else if (c === 4) {
      r.cite = msgs.some(function (x) { return /cit|passage|extrait|source|preuve|o[uù] .*(dit|[ée]crit|mentionn|indiqu)/.test(text(x)); });
    }
    return r;
  }

  function checkPractice() {
    var f = frontierStep(), s = f.s;
    if (!s || s.t !== "practice") return;
    var state = st(f.c, f.i);
    if (state.done) return;
    var r = evaluate(s, f.c, f.i);
    var complete = r.__complete !== undefined ? r.__complete : s.criteria.every(function (cr) { return r[cr[0]]; });
    if (complete) {
      state.done = true;
      save();
      award(key(f.c, f.i), s.pts, "Étape réussie");
      if (window.innerWidth <= 900) setTimeout(function () { showTab("story"); }, 1600);
    }
    renderAll();
  }

  /* ---------- Espace Claude ---------- */

  function conv(id) { return S.convs.filter(function (c) { return c.id === (id || S.current); })[0]; }
  function newConv() {
    var c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "Nouvelle conversation", messages: [] };
    S.convs.unshift(c);
    S.current = c.id;
    save();
    return c;
  }

  function msgNode(m) {
    var el = document.createElement("div");
    if (m.role === "user") {
      el.className = "msg msg--user";
      el.innerHTML = '<div class="bubble"></div>';
      el.firstChild.textContent = m.content;
    } else {
      el.className = "msg msg--ai";
      el.innerHTML = '<span class="av av-claude"><svg><use href="#i-spark"/></svg></span><div class="body"></div>';
      el.lastChild.innerHTML = markdown(m.content) + (m.tag === "sim" ? '<span class="msg-tag">Réponse simulée</span>' : "");
    }
    return el;
  }

  function renderConv() {
    var c = conv();
    messagesEl.innerHTML = "";
    if (!c || !c.messages.length) {
      messagesEl.innerHTML = '<div class="empty-state"><svg class="mark"><use href="#i-spark"/></svg><h2>Comment puis-je vous aider ?</h2><p>Environnement de formation · scénario fictif</p></div>';
    } else c.messages.forEach(function (m) { messagesEl.appendChild(msgNode(m)); });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderHistory();
  }

  function renderHistory() {
    var pop = $("[data-hist]");
    pop.innerHTML = "";
    var list = S.convs.filter(function (c) { return c.messages.length; });
    if (!list.length) { pop.innerHTML = '<div class="empty">Aucune conversation pour l’instant.</div>'; return; }
    list.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = c.title;
      b.setAttribute("aria-current", c.id === S.current);
      b.onclick = function () { S.current = c.id; save(); pop.hidden = true; $("[data-hist-toggle]").setAttribute("aria-expanded", "false"); renderConv(); };
      pop.appendChild(b);
    });
  }

  /* une action à la fois : Claude n'est utilisable qu'aux étapes « Essayer » */
  function renderWorkState() {
    var f = frontierStep(), s = f.s;
    var practice = !!s && s.t === "practice" && !st(f.c, f.i).done;
    work.classList.toggle("is-active", practice);
    work.classList.toggle("is-locked", !practice);
    input.disabled = !practice || busy;
    sendBtn.disabled = !practice || busy;
    input.placeholder = practice ? "Écrivez à Claude…" : "Claude s’ouvrira quand le guide vous le demandera.";
    $("[data-new]").classList.toggle("is-spot", practice && f.c === 3 && !evaluate(s, 3, f.i).new);
    $("[data-tab-dot]").hidden = !(practice && shell.dataset.tab === "story");
  }

  function insert(text) {
    showTab("claude");
    input.value = input.value.trim() ? input.value.trim() + "\n\n" + text : text;
    autosize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    liveAnalysis();
  }

  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 240) + "px"; }

  function liveAnalysis() {
    var box = $("[data-analysis]");
    if (!box) return;
    var a = analyze(input.value);
    $$("[data-an]", box).forEach(function (chip) {
      var k = chip.dataset.an;
      chip.className = "an" + ((k === "C" ? a.C > 0 : a[k]) ? " on-" + k : "") + (k === "C" && a.C === 1 ? " half" : "");
    });
    var tip = $("[data-an-tip]", box);
    if (!input.value.trim()) tip.textContent = "Commencez à écrire dans la zone de Claude.";
    else if (!a.T) tip.textContent = "Il manque la tâche : que doit faire Claude ? (« Rédige… », « Propose… »)";
    else if (a.C < 2) tip.textContent = "Ajoutez du contexte : qui est Hugo, quand arrive-t-il, dans quelle équipe ?";
    else if (!a.F) tip.textContent = "Précisez le format : longueur, ton, support (Slack).";
    else tip.textContent = "Votre demande contient les trois ingrédients. Envoyez-la !";
  }

  /* ---------- Réponses simulées (sans serveur) ---------- */

  function simulate(c) {
    var users = c.messages.filter(function (m) { return m.role === "user"; });
    var t = (users[users.length - 1] || {}).content || "";
    var low = t.toLowerCase();
    var all = users.map(function (m) { return m.content; }).join("\n").toLowerCase();
    var hasDoc = /maison aubrac/.test(all);
    var hadWelcome = c.messages.some(function (m) { return m.role === "assistant" && /bienvenue/i.test(m.content); });

    // le compte rendu vient d'être collé : c'est la demande de la mission 4
    if (/maison aubrac/.test(low)) {
      return "Voici les actions issues du compte rendu :\n\n| Action | Responsable | Échéance |\n|---|---|---|\n" +
        "| Envoyer le planning détaillé | Inès (Lumen) | avant le 11 avril |\n| Transmettre les anciens emballages au format numérique | Paul (Maison Aubrac) | non précisée |\n| Préparer les trois pistes de logo | Équipe design (Lumen) | présentation le 22 avril |\n\n" +
        "À noter : la date de lancement en boutique reste à confirmer.";
    }
    if (hasDoc && /budget|emballage/.test(low)) {
      var parts = [];
      if (/budget/.test(low)) parts.push("Le compte rendu ne mentionne **aucun budget** : il n’est ni cité ni validé dans ce document.");
      if (/emballage/.test(low)) parts.push("Pour les anciens emballages, il indique seulement que Paul doit les transmettre au format numérique, **sans date**.");
      return parts.join("\n\n") + "\n\nJe vous suggère de poser directement la question au client.";
    }
    if (hasDoc && /cit|passage|extrait|source|preuve/.test(low)) {
      return "Voici le passage exact du compte rendu :\n\n« Décisions\n- Présentation des trois pistes de logo le 22 avril. »";
    }
    // relance sur le message de bienvenue (mission 3) : on ne redemande pas un nouveau message
    if (hadWelcome && !/bienvenue/.test(low) && /court|raccourci|lignes?|vendredi|d[ée]jeun|r[ée]duis/.test(low)) {
      return "Voici une version plus courte :\n\n« Bienvenue Hugo ! 🎨 Lundi, tu rejoins le studio pour six mois comme stagiaire designer." +
        (/vendredi|d[ée]jeun/.test(low) ? "\nOn t’attend vendredi midi pour déjeuner tous ensemble." : "") + "\nÀ très vite ! »";
    }
    if (/bienvenue|accueil/.test(low)) {
      var a = analyze(t);
      if (a.C >= 2) {
        return "Voici une proposition :\n\n« Bienvenue Hugo ! 🎨\nLundi, tu rejoins le studio pour six mois en tant que stagiaire designer graphique. Toute l’équipe a hâte de te rencontrer et de t’embarquer sur nos projets.\nN’hésite surtout pas à poser tes questions : on est là pour ça.\nÀ lundi ! »";
      }
      return "Voici une proposition :\n\n« Bienvenue à [Prénom] ! Nous sommes ravis de t’accueillir au sein de [nom de l’équipe]. N’hésite pas à venir nous voir si tu as la moindre question. Bonne intégration ! »\n\nPour l’adapter, dites-m’en plus : qui arrive, à quel poste, sur quel ton et pour quel canal ?";
    }
    if (/exemple|concr[eè]t|d[ée]taill|pr[ée]cise/.test(low) && c.messages.length > 1) {
      return "Bien sûr. Par exemple, pour **rédiger** : donnez-moi les notes d’une réunion et je vous propose un compte rendu clair, avec les décisions et les actions. Vous pouvez ensuite me demander de l’adapter : plus court, plus formel, sous forme de tableau…";
    }
    if (/aider|faire|capable|pr[ée]sente|bonjour|salut|hello/.test(low)) {
      return "Bonjour ! Ravi de faire votre connaissance. En tant que chargé·e de projet, je peux notamment vous aider à :\n\n- **rédiger** des e-mails, messages et comptes rendus ;\n- **résumer** des documents que vous me transmettez ;\n- **organiser** des informations en listes ou en tableaux ;\n- **trouver des idées** et reformuler vos textes.\n\nPar quoi voulez-vous commencer ?";
    }
    return "Je suis en mode simulé : je réponds surtout aux missions de la formation. Suivez la consigne affichée au-dessus de la conversation.";
  }

  /* ---------- Envoi ---------- */

  function addPending() {
    var el = msgNode({ role: "assistant", content: "" });
    el.lastChild.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    var e = messagesEl.querySelector(".empty-state");
    if (e) e.remove();
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function finish(c, text, tag) {
    c.messages.push({ role: "assistant", content: text, tag: tag, ch: S.ch });
    S.stats[tag === "sim" ? "sim" : "live"]++;
    busy = false;
    save();
    renderConv();
    checkPractice();
    renderWorkState();
  }

  function streamSim(el, c) {
    var text = simulate(c), i = 0, body = el.lastChild;
    setTimeout(function step() {
      i = Math.min(text.length, i + 5 + Math.floor(Math.random() * 9));
      body.innerHTML = markdown(text.slice(0, i));
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (i < text.length) setTimeout(step, 16); else finish(c, text, "sim");
    }, 450);
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
    if (mode !== "live") { streamSim(el, c); return; }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FIRST_BYTE_TIMEOUT);
    fetch(API, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ module: "decouvrir", learner: S.learner, messages: c.messages.map(function (m) { return { role: m.role, content: m.content }; }) })
    }).then(function (res) {
      if (res.status === 503) { clearTimeout(timer); setMode("sim"); streamSim(el, c); return; }
      if (res.status === 429) { clearTimeout(timer); showError(el, c, "La limite d’échanges du jour est atteinte. Vous pouvez continuer avec la simulation."); return; }
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      var reader = res.body.getReader(), dec = new TextDecoder(), text = "", started = false;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (text.indexOf("\u0000ERREUR") >= 0 || !text.trim()) { showError(el, c, "Claude n’a pas pu répondre. Votre travail est conservé : réessayez."); return; }
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
    }).catch(function () { clearTimeout(timer); showError(el, c, "Votre travail est conservé. Réessayez, ou continuez avec la simulation."); });
  }

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = frontierStep();
    var text = input.value.trim();
    if (!text || busy || !f.s || f.s.t !== "practice") return;
    var c = conv() || newConv();
    c.messages.push({ role: "user", content: text, ch: f.c, step: f.i });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 44) + (text.length > 44 ? "…" : "");
    var state = st(f.c, f.i);
    state.tries = (state.tries || 0) + 1;
    input.value = "";
    autosize();
    save();
    renderConv();
    liveAnalysis();
    ask(c);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
  });
  input.addEventListener("input", function () { autosize(); liveAnalysis(); });

  $("[data-new]").addEventListener("click", function () {
    var c = conv();
    if (!c || c.messages.length) newConv();
    renderConv();
    renderWorkState();
    input.focus();
  });
  $("[data-hist-toggle]").addEventListener("click", function () {
    var pop = $("[data-hist]");
    pop.hidden = !pop.hidden;
    this.setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".hist")) { $("[data-hist]").hidden = true; $("[data-hist-toggle]").setAttribute("aria-expanded", "false"); }
    if (!e.target.closest(".missions")) closeMissions();
  });

  /* ---------- Mode réel ou simulé ---------- */

  var modeBtn = $("[data-mode]");
  function setMode(m, forced) {
    mode = m;
    if (forced) { S.forceSim = m === "sim"; save(); }
    modeBtn.dataset.state = m;
    modeBtn.textContent = m === "live" ? "Claude connecté" : "Mode simulé";
    modeBtn.title = m === "live" ? "Cliquer pour passer en simulation" : "Cliquer pour tenter la connexion à Claude";
    $("[data-work-note]").textContent = m === "live"
      ? "Réponses générées par Claude dans un environnement de formation. Vérifiez toujours les faits."
      : "Mode simulé : réponses préparées pour les missions, sans connexion à Claude.";
  }
  function probe() {
    if (!API || S.forceSim) { setMode("sim"); return; }
    fetch(API).then(function (r) { return r.json(); }).then(function (j) { setMode(j && j.live ? "live" : "sim"); }).catch(function () { setMode("sim"); });
  }
  modeBtn.addEventListener("click", function () { if (mode === "live") setMode("sim", true); else { S.forceSim = false; save(); probe(); } });

  /* ---------- Onglets (mobile) ---------- */

  function showTab(tab) {
    shell.dataset.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === tab); });
    $("[data-tab-dot]").hidden = tab === "claude" || !work.classList.contains("is-active");
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  /* ---------- Aide-mémoire imprimable ---------- */

  function printMemo() {
    var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aide-mémoire · Découvrir Claude</title><style>' +
      '@font-face{font-family:Inter;src:url(../assets/fonts/inter.woff2) format("woff2-variations");font-weight:100 900}' +
      '@page{size:A4;margin:18mm}body{font-family:Inter,system-ui,sans-serif;color:#0d1220}h1{font-size:26pt;margin:0 0 4mm;letter-spacing:-.02em}' +
      '.k{font:600 9pt Inter;letter-spacing:.2em;text-transform:uppercase;color:#6b7288}.bar{height:1.2mm;width:30mm;border-radius:1mm;background:#1a1a19;margin-bottom:8mm}' +
      'ol{padding-left:6mm}li{margin-bottom:4mm;font-size:12pt;line-height:1.5}.p{margin-top:8mm;padding:5mm;border-radius:3mm;background:#efece5;font-size:11pt;white-space:pre-wrap}' +
      'footer{margin-top:10mm;font-size:9pt;color:#6b7288}</style></head><body><div class="k">Découvrir Claude</div><h1>Mon aide-mémoire</h1><div class="bar"></div><ol>' +
      TAKEAWAYS.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      (S.bestPrompt ? '<div class="k">Ma demande complète (mission 2)</div><div class="p">' + esc(S.bestPrompt) + "</div>" : "") +
      "<footer>" + S.xp + " points · " + new Date().toLocaleDateString("fr-FR") + "</footer></body></html>";
    var f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.srcdoc = html;
    f.onload = function () { setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); }, 300); };
  }

  /* ---------- Démarrage ---------- */

  $$("[data-level]").forEach(function (b) {
    b.setAttribute("aria-checked", b.dataset.level === S.level);
    b.addEventListener("click", function () {
      S.level = b.dataset.level;
      save();
      $$("[data-level]").forEach(function (x) { x.setAttribute("aria-checked", x === b); });
    });
  });

  function openApp(animate) {
    var intro = $("[data-intro]");
    shell.hidden = false;
    if (animate) { intro.classList.add("is-leaving"); setTimeout(function () { intro.hidden = true; }, 600); }
    else intro.hidden = true;
    if (!conv()) newConv();
    renderConv();
    renderAll(true);
  }

  $("[data-start]").addEventListener("click", function () { S.started = true; save(); openApp(true); });
  showTab("story");
  setMode("sim");
  probe();
  if (S.started) openApp(false);

  window.DecouvrirTracking = { snapshot: function () { return { chapter: S.ch, done: S.done, xp: S.xp, level: S.level, stats: S.stats, bestPrompt: S.bestPrompt || null }; } };
})();
