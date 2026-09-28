/* ==========================================================================
   Découvrir Claude — une journée chez Lumen (scénario fictif)
   Une action à la fois : le fil de gauche propose une seule étape active ;
   l'espace Claude ne s'ouvre qu'aux étapes « Essayer ».
   ========================================================================== */
(function () {
  "use strict";

  var API = window.CLAUDE_API || (/^https?:$/.test(location.protocol) ? "/api/chat" : null);
  var STORE = "decouvrir-claude";
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
    "Parlez à Claude en phrases, comme à un collègue. Dans une même conversation, il garde le fil : relancez pour préciser.",
    "Une bonne demande contient une tâche, du contexte et un format : les informations qu’un collègue vous demanderait.",
    "Pour améliorer une réponse, dites précisément ce qui ne va pas et ce que vous voulez à la place. Même sujet : même conversation.",
    "Claude ne voit que ce que vous lui donnez : collez la source, puis précisez le résultat attendu. Nouveau sujet : nouvelle conversation.",
    "Claude peut se tromper ou combler un vide. Vérifiez chiffres, noms et dates dans la source, et demandez-lui de citer le passage.",
    "Jamais de mot de passe. Pour les données personnelles ou confidentielles, suivez la politique de votre entreprise ; dans le doute, anonymisez."
  ];

  /* analyse d'une demande : tâche, contexte, format (indicatif) */
  var FACTS = [/hugo/i, /stagiaire|stage\b/i, /design|graphi/i, /lundi|14 avril/i, /[ée]quipe|studio|lumen/i, /6 mois|six mois/i, /vendredi|d[ée]jeun/i];
  function analyze(text) {
    var t = /(^|[^a-zà-ÿ])(r[ée]dige|r[ée]diger|[ée]cri[st]|[ée]crire|r[ée]sume|r[ée]sumer|liste|lister|cr[ée]e|cr[ée]er|propose|proposer|fai[st]|faire|pr[ée]pare|pr[ée]parer|tradui|corrige|reformule|g[ée]n[èe]re|compose|aide-moi|pourrais-tu|peux-tu|pouvez-vous)/i.test(text);
    var facts = FACTS.filter(function (re) { return re.test(text); }).length;
    var f = /(\d+\s*(lignes?|mots|phrases?|paragraphes?)|court|bref|concis|\bton\b|chaleureu|convivial|d[ée]contract|formel|slack|tutoi|vouvoi|[ée]moji|liste|puces|tableau)/i.test(text);
    return { T: t, C: facts >= 2 ? 2 : facts, F: f };
  }

  /* ---------- Les missions : chaque étape = une seule action ---------- */
  // ph : S = situation, C = comprendre, E = essayer, R = retenir

  var CH = [
    {
      label: "Mission 1", title: "Faire connaissance", goal: "Mener une conversation avec Claude et la relancer.",
      steps: [
        { t: "ines", ph: "S", text: "Bonjour et bienvenue chez Lumen ! Je suis Inès, je dirige le studio. Ici, tout le monde travaille avec Claude, un assistant IA." },
        { t: "ines", ph: "S", text: "Avant de vous confier un vrai dossier, voyons ce que vous en savez déjà." },
        { t: "multi", ph: "C", pts: 10, q: "Selon vous, que peut faire Claude ? Cochez toutes les bonnes réponses.",
          opts: [
            ["Rédiger un e-mail ou un message", true, "Oui : c’est l’un de ses usages les plus courants."],
            ["Résumer un long document que vous lui donnez", true, "Oui, à condition de lui transmettre le document."],
            ["Lire vos e-mails sans que vous les lui donniez", false, "Non : il ne voit que ce que vous lui transmettez dans la conversation."],
            ["Proposer des idées et reformuler un texte", true, "Oui : il est très utile pour trouver des pistes."],
            ["Garantir que ses réponses sont toujours exactes", false, "Non : il peut se tromper. Vous verrez comment vérifier à la mission 5."]
          ] },
        { t: "note", ph: "C", title: "Remarque", html: "Claude est un <b>assistant conversationnel</b> : il répond à ce que vous écrivez. Parlez-lui <b>comme à un collègue</b>, en phrases complètes. Pas besoin de mots-clés ni de formules magiques." },
        { t: "practice", ph: "E", pts: 20, title: "Présentez-vous à Claude",
          task: "Présentez-vous (vous êtes chargé·e de projet dans un studio de design) et demandez-lui comment il peut vous aider. Puis relancez-le sur un point de sa réponse.",
          criteria: [["first", "Envoyer un premier message et lire la réponse"], ["follow", "Le relancer dans la même conversation"]],
          hints: [
            { text: "Bonjour ! Je suis chargé·e de projet dans un studio de design. Comment peux-tu m’aider au quotidien ?" },
            { text: "Peux-tu me donner un exemple concret pour le premier point ?" }
          ] },
        { t: "qcm", ph: "C", pts: 10, q: "Vous l’avez relancé sans tout réexpliquer. Pourquoi est-ce que ça marche ?",
          opts: [
            ["Il tient compte de toute la conversation en cours", true, "Exact : dans une même conversation, il garde le fil de vos échanges."],
            ["Il se souvient de toutes vos conversations passées", false, "Pas par défaut : une nouvelle conversation repart de zéro. Redonnez le contexte utile."],
            ["Il devine ce que vous voulez", false, "Non : il s’appuie uniquement sur ce que vous avez écrit."]
          ] },
        { t: "keep", ph: "R", i: 0 }
      ]
    },
    {
      label: "Mission 2", title: "La recette d’une bonne demande", goal: "Formuler une demande complète : tâche, contexte, format.",
      steps: [
        { t: "ines", ph: "S", text: "Premier vrai dossier ! Hugo, notre nouveau stagiaire, arrive lundi. Pouvez-vous préparer un message de bienvenue à poster sur le canal de l’équipe ?" },
        { t: "ines", ph: "S", text: "Avant de vous lancer, regardez la différence entre ces deux demandes." },
        { t: "compare", ph: "C" },
        { t: "link", ph: "C", pts: 10, q: "Reliez chaque morceau de la bonne demande à son rôle.",
          sub: "Cliquez sur un morceau, puis sur son rôle.",
          items: [
            ["Rédige un message de bienvenue", "T"],
            ["pour Hugo, stagiaire designer graphique", "C"],
            ["qui rejoint notre studio lundi pour six mois", "C"],
            ["Ton chaleureux, tutoiement", "F"],
            ["5 lignes maximum, pour Slack", "F"]
          ] },
        { t: "note", ph: "C", title: "La recette", html: "<b><span class=\"tok-t\">Tâche</span> + <span class=\"tok-c\">Contexte</span> + <span class=\"tok-f\">Format</span></b>. Ce ne sont pas des formules magiques : ce sont les informations qu’un collègue vous demanderait avant de s’y mettre." },
        { t: "practice", ph: "E", pts: 20, analysis: true, title: "Écrivez votre propre demande",
          task: "Demandez à Claude le message de bienvenue pour Hugo, avec vos mots. Votre demande doit contenir une tâche, du contexte et un format.",
          facts: ["Hugo", "stagiaire designer graphique", "6 mois", "arrive lundi 14 avril", "studio de 12 personnes", "message pour Slack"],
          criteria: [["T", "Une tâche : ce que Claude doit faire"], ["C", "Du contexte : au moins deux informations sur la situation"], ["F", "Un format : longueur, ton ou support"]],
          hints: [
            { text: "Rappel : Tâche = le verbe (rédige, résume…). Contexte = pour qui, quelle situation. Format = longueur, ton, support.", plain: true },
            { after: 2, text: "Rédige un message de bienvenue pour Hugo, stagiaire designer graphique qui rejoint notre studio lundi pour six mois. Ton chaleureux, tutoiement, 5 lignes maximum, pour Slack." }
          ] },
        { t: "qcm", ph: "C", pts: 10, q: "Comparez avec la demande vague. Qu’est-ce qui a surtout changé dans la réponse ?",
          opts: [
            ["Elle est adaptée à Hugo et presque prête à poster", true, "Oui : plus vous donnez d’informations utiles, moins vous avez à retoucher."],
            ["Elle est simplement plus longue", false, "Pas forcément : c’est la précision qui change, pas la longueur."],
            ["Rien, Claude répond toujours la même chose", false, "Au contraire : la réponse dépend directement de votre demande."]
          ] },
        { t: "keep", ph: "R", i: 1 }
      ]
    },
    {
      label: "Mission 3", title: "Améliorer sans recommencer", goal: "Améliorer une réponse avec une relance précise.",
      steps: [
        { t: "ines", ph: "S", text: "Joli travail ! Deux choses : c’est un peu long pour Slack, et il manque le déjeuner d’équipe de vendredi." },
        { t: "qcm", ph: "C", pts: 10, q: "Quelle relance donnera le meilleur résultat ?",
          opts: [
            ["« Bof, refais. »", false, "Claude ne sait pas ce qui ne va pas : il changera au hasard."],
            ["Ouvrir une nouvelle conversation et tout réécrire", false, "Vous perdriez le contexte déjà donné. Ce n’est utile que pour un nouveau sujet."],
            ["« Raccourcis à 3 lignes et ajoute qu’on déjeune tous ensemble vendredi. »", true, "Oui : vous dites ce qui ne va pas et ce que vous voulez à la place."]
          ] },
        { t: "practice", ph: "E", pts: 20, title: "Demandez les deux ajustements",
          task: "Dans la conversation du message de bienvenue, demandez à Claude de raccourcir le message et d’ajouter le déjeuner de vendredi.",
          criteria: [["same", "Rester dans la même conversation"], ["short", "Demander un message plus court"], ["lunch", "Ajouter le déjeuner de vendredi"]],
          hints: [{ text: "Raccourcis-le à 3 lignes et ajoute qu’on déjeune tous ensemble vendredi midi." }] },
        { t: "tf", ph: "C", pts: 5, q: "Vrai ou faux ?", choices: ["Vrai", "Faux"],
          items: [
            ["Pour un nouveau sujet, mieux vaut ouvrir une nouvelle conversation.", "Vrai", "Vrai : cela évite de mélanger les contextes."],
            ["Si la réponse ne convient pas, il faut tout réécrire soi-même.", "Faux", "Faux : une relance précise suffit souvent."],
            ["On peut demander plusieurs versions pour choisir la meilleure.", "Vrai", "Vrai : par exemple « Propose trois versions, du plus sobre au plus enjoué »."]
          ] },
        { t: "keep", ph: "R", i: 2 }
      ]
    },
    {
      label: "Mission 4", title: "Travailler sur un document", goal: "Faire travailler Claude sur une source fournie.",
      steps: [
        { t: "ines", ph: "S", text: "Je sors d’une réunion avec un client, Maison Aubrac. Voici mon compte rendu. Il me faut la liste des actions : qui fait quoi, et pour quand." },
        { t: "doc", ph: "S" },
        { t: "order", ph: "C", pts: 10, q: "Dans quel ordre procéder ?", sub: "Cliquez sur les étapes dans le bon ordre.",
          items: ["Ouvrir une nouvelle conversation", "Coller le compte rendu", "Demander les actions dans un tableau", "Relire le tableau avec le compte rendu sous les yeux"] },
        { t: "practice", ph: "E", pts: 20, doc: true, title: "Obtenez la liste des actions",
          task: "Ouvrez une nouvelle conversation, donnez le compte rendu à Claude, et demandez-lui les actions dans un tableau (qui, quoi, quand).",
          criteria: [["new", "Ouvrir une nouvelle conversation"], ["doc", "Donner le compte rendu à Claude"], ["fmt", "Demander un tableau des actions"]],
          hints: [{ text: "Voici le compte rendu d’une réunion. Liste les actions dans un tableau : action, responsable, échéance." }] },
        { t: "note", ph: "C", title: "Remarque", html: "Claude <b>ne voit que ce que vous lui donnez</b>. Sans le compte rendu dans la conversation, il ne pourrait pas deviner ce qui s’est dit en réunion : il risquerait d’inventer." },
        { t: "keep", ph: "R", i: 3 }
      ]
    },
    {
      label: "Mission 5", title: "Vérifier, toujours", goal: "Vérifier une réponse à partir de la source.",
      steps: [
        { t: "ines", ph: "S", text: "Le client me demande deux choses : le budget validé, et la date à laquelle Paul doit nous envoyer les anciens emballages. Posez la question à Claude." },
        { t: "practice", ph: "E", pts: 20, title: "Posez les deux questions",
          task: "Dans la conversation du compte rendu, demandez à Claude le budget validé et la date d’envoi des anciens emballages.",
          criteria: [["budget", "Demander le budget validé"], ["emb", "Demander la date d’envoi des anciens emballages"]],
          hints: [{ text: "Quel budget le client a-t-il validé ? Et quand Paul doit-il envoyer les anciens emballages ?" }] },
        { t: "multi", ph: "C", pts: 10, q: "Relisez le compte rendu (mission 4). Qu’y trouve-t-on vraiment ?",
          opts: [
            ["Un budget validé", false, "Non : le compte rendu ne parle d’aucun budget."],
            ["Une date pour l’envoi des anciens emballages", false, "Non : l’action de Paul n’a pas de date."],
            ["La date de présentation des logos", true, "Oui : le 22 avril."]
          ] },
        { t: "qcm", ph: "C", reflect: true, q: "Et Claude, qu’a-t-il répondu ?",
          opts: [
            ["Il a signalé que ces informations n’y figurent pas", null, "Très bien : c’est le comportement attendu. Gardez tout de même le réflexe de vérifier."],
            ["Il a donné un montant ou une date", null, "C’est exactement le piège : une réponse assurée n’est pas une preuve. Revenez toujours à la source."],
            ["Je ne suis pas sûr·e", null, "Dans le doute, relisez sa réponse à côté du compte rendu. C’est le bon réflexe."]
          ] },
        { t: "spot", ph: "C", pts: 10, q: "Voici la réponse d’un assistant moins prudent. Cliquez sur les 2 informations inventées.",
          parts: ["Le budget validé est de ", { hot: "15 000 €", bad: true }, ". Paul doit envoyer les anciens emballages avant le ", { hot: "15 avril", bad: true }, ". Les pistes de logo seront présentées le ", { hot: "22 avril", bad: false }, "."] },
        { t: "practice", ph: "E", pts: 20, title: "Faites citer la source",
          task: "Demandez à Claude de citer le passage du compte rendu qui justifie l’une de ses réponses.",
          criteria: [["cite", "Demander à Claude de citer le passage exact"]],
          hints: [{ text: "Cite le passage exact du compte rendu qui indique la date de présentation des logos." }] },
        { t: "keep", ph: "R", i: 4 }
      ]
    },
    {
      label: "Mission 6", title: "Les bons réflexes", goal: "Savoir ce que l’on peut partager avec Claude.",
      steps: [
        { t: "ines", ph: "S", text: "Dernier point, et pas le moindre : ce que vous pouvez confier à Claude. Pour chaque situation, que faites-vous ?" },
        { t: "tf", ph: "C", pts: 5, q: "Puis-je le faire ?", choices: ["Oui", "Selon la politique de l’entreprise", "Jamais"],
          items: [
            ["Coller le compte rendu fictif de cette formation.", "Oui", "Oui : ce sont des données fictives, prévues pour l’exercice."],
            ["Coller la liste réelle des clients, avec e-mails et téléphones, pour la trier.", "Selon la politique de l’entreprise", "Des données personnelles : seulement avec un outil et un usage autorisés par votre entreprise. Dans le doute, anonymisez."],
            ["Donner mon mot de passe pour qu’il se connecte à ma messagerie.", "Jamais", "Jamais : aucun mot de passe ni identifiant dans une conversation."],
            ["Lui demander de reformuler un texte que j’ai écrit.", "Oui", "Oui : c’est un usage simple et sans risque."]
          ] },
        { t: "note", ph: "C", title: "Dans le doute", html: "Retirez les noms et les informations sensibles avant de coller un texte, ou demandez à votre responsable. <b>Aucun mot de passe, jamais.</b>" },
        { t: "keep", ph: "R", i: 5 }
      ]
    },
    {
      label: "Bilan", title: "Votre aide-mémoire", goal: "Repartir avec vos réflexes.",
      steps: [
        { t: "ines", ph: "S", text: "Bravo, quelle première journée ! Voici votre aide-mémoire. Gardez-le sous la main." },
        { t: "final", ph: "R" }
      ]
    }
  ];
  var MISSIONS = CH.length - 1;

  /* ---------- État ---------- */

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  var S = load();
  S.ch = S.ch || 0;
  S.pos = S.pos || {};
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

  /* ---------- Éléments ---------- */

  var thread = $("[data-thread]"), chaptersEl = $("[data-chapters]"), messagesEl = $("[data-messages]");
  var input = $("[data-input]"), composer = $("[data-composer]"), sendBtn = $(".send"), banner = $("[data-banner]");
  var work = $(".work"), shell = $("[data-shell]"), toastEl = $("[data-toast]");

  function h(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
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
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }
  function award(k, pts, text) {
    S.awarded = S.awarded || {};
    if (!pts || S.awarded[k]) { if (text) toast(text); return; }
    S.awarded[k] = pts;
    S.xp += pts;
    save();
    toast(text || "Bonne réponse", pts);
    renderRail();
  }

  /* ---------- Rail des missions ---------- */

  function renderRail() {
    chaptersEl.innerHTML = "";
    CH.forEach(function (c, i) {
      var done = S.done.indexOf(i) >= 0, cur = i === S.ch, open = done || cur;
      var b = h('<button type="button" class="ch-item"><span class="ch-ico"></span><span class="ch-t"><small></small><b></b></span><span class="ch-pts"></span></button>');
      b.classList.toggle("is-cur", cur);
      b.classList.toggle("is-done", done);
      b.classList.toggle("is-locked", !open);
      b.disabled = !open;
      b.querySelector(".ch-ico").innerHTML = done ? '<svg><use href="#i-check"/></svg>' : open ? String(i + 1 > MISSIONS ? "★" : i + 1) : '<svg><use href="#i-lock"/></svg>';
      b.querySelector("small").textContent = c.label;
      b.querySelector("b").textContent = c.title;
      b.onclick = function () { var a = thread.querySelector('[data-anchor="' + i + '"]'); if (a) a.scrollIntoView({ behavior: "smooth", block: "start" }); showTab("story"); };
      chaptersEl.appendChild(b);
    });
    var n = S.done.filter(function (x) { return x < MISSIONS; }).length;
    $("[data-progress-label]").textContent = n + " / " + MISSIONS;
    $("[data-progress-bar]").style.width = (n / MISSIONS * 100) + "%";
    $("[data-xp]").textContent = S.xp;
  }

  /* ---------- Fil de l'histoire ---------- */

  var shownKeys = {};
  var typingTimer = null;
  var typingNow = false;     // un message d'Inès est en cours d'écriture : il n'est pas encore affiché

  function currentStep() { var c = CH[S.ch]; return c && c.steps[pos(S.ch)]; }

  function renderThread() {
    thread.innerHTML = "";
    for (var c = 0; c <= S.ch; c++) {
      var ch = CH[c];
      var headKey = "h" + c;
      var head = h('<div class="m-head block" data-anchor="' + c + '"><small></small><h2></h2><p></p><div class="phases"><span>Situation</span><span>Comprendre</span><span>Essayer</span><span>Retenir</span></div></div>');
      head.querySelector("small").textContent = ch.label;
      head.querySelector("h2").textContent = ch.title;
      head.querySelector("p").textContent = "Objectif : " + ch.goal;
      var curPh = c === S.ch && ch.steps[pos(c)] ? ch.steps[pos(c)].ph : null;
      var order = ["S", "C", "E", "R"];
      $$(".phases span", head).forEach(function (sp, k) {
        var reached = c < S.ch || S.done.indexOf(c) >= 0 || ch.steps.slice(0, pos(c)).some(function (s) { return s.ph === order[k]; });
        sp.classList.toggle("is-on", curPh === order[k]);
        sp.classList.toggle("is-done", reached && curPh !== order[k]);
      });
      if (!shownKeys[headKey]) { head.classList.add("is-new"); shownKeys[headKey] = 1; }
      thread.appendChild(head);
      var upto = c < S.ch ? ch.steps.length - 1 : pos(c) - (typingNow ? 1 : 0);
      for (var i = 0; i <= upto && i < ch.steps.length; i++) {
        var node = renderStep(c, i);
        if (!node) continue;
        var wrap = document.createElement("div");
        wrap.className = "block";
        var isCur = c === S.ch && i === pos(c);
        if (isCur && isInteractive(ch.steps[i])) { wrap.classList.add("is-current"); wrap.appendChild(h('<span class="now">À vous</span>')); }
        else if (!isCur) wrap.classList.add("is-past");
        wrap.appendChild(node);
        var k = key(c, i);
        if (!shownKeys[k]) { wrap.classList.add("is-new"); shownKeys[k] = 1; }
        thread.appendChild(wrap);
      }
    }
    var cur = thread.querySelector(".is-current") || thread.lastElementChild;
    if (cur) setTimeout(function () { cur.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 60);
    renderWorkState();
  }

  function isInteractive(s) { return s && s.t !== "ines" && s.t !== "final"; }

  /* avance automatique : les messages d'Inès arrivent l'un après l'autre */
  function flow() {
    clearTimeout(typingTimer);
    var s = currentStep();
    if (!s || s.t !== "ines") { typingNow = false; renderThread(); renderRail(); return; }
    typingNow = true;
    renderThread();
    var typing = h('<div class="msg-ines block"><span class="av av-ines">IM</span><div><div class="who">Inès <span>écrit…</span></div><div class="typing-ines" style="margin-top:6px"><i></i><i></i><i></i></div></div></div>');
    thread.appendChild(typing);
    typing.scrollIntoView({ behavior: "smooth", block: "nearest" });
    typingTimer = setTimeout(function () {
      S.pos[S.ch] = pos(S.ch) + 1;
      save();
      flow();
    }, Math.min(2200, 700 + s.text.length * 12));
    if (window.innerWidth <= 960 && shell.dataset.tab === "claude") $("[data-tab-dot]").hidden = false;
  }

  function next() {
    S.pos[S.ch] = pos(S.ch) + 1;
    save();
    flow();
  }

  function completeChapter() {
    if (S.done.indexOf(S.ch) < 0) S.done.push(S.ch);
    if (S.ch < CH.length - 1) S.ch++;
    save();
    renderRail();
    flow();
  }

  function continueBtn(label) {
    var row = h('<div class="card-actions continue-row"><button type="button" class="btn btn-dark">' + (label || "Continuer") + ' <svg><use href="#i-arrow"/></svg></button></div>');
    row.firstChild.onclick = next;
    return row;
  }

  function renderStep(c, i) {
    var s = CH[c].steps[i];
    var active = c === S.ch && i === pos(c);
    var R = RENDER[s.t];
    return R ? R(s, c, i, active) : null;
  }

  var RENDER = {
    ines: function (s) {
      var el = h('<div class="msg-ines"><span class="av av-ines">IM</span><div><div class="who">Inès Morel <span>Directrice du studio</span></div><p></p></div></div>');
      el.querySelector("p").textContent = s.text;
      return el;
    },

    note: function (s, c, i, active) {
      var el = h('<div><div class="note"><span class="ic"><svg><use href="#i-bulb"/></svg></span><div><b></b><div class="nt"></div></div></div></div>');
      el.querySelector("b").textContent = s.title + " · ";
      el.querySelector(".nt").innerHTML = s.html;
      el.querySelector(".nt").style.display = "inline";
      if (active) el.appendChild(continueBtn("J’ai compris"));
      return el;
    },

    compare: function (s, c, i, active) {
      var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>Observer</div><h3>Même besoin, deux demandes</h3><div class="compare">' +
        '<div class="cmp bad"><small>Demande vague</small><div class="q">Écris un message de bienvenue.</div>' +
        '<div class="a"><span class="av av-claude"><svg><use href="#i-spark"/></svg></span><span>« Bienvenue à [Prénom] ! Nous sommes ravis de t’accueillir au sein de [nom de l’équipe]… »</span></div>' +
        '<div class="verdict">Générique, avec des trous à compléter.</div></div>' +
        '<div class="cmp good"><small>Demande complète</small><div class="q"><span class="tok-t">Rédige un message de bienvenue</span> <span class="tok-c">pour Hugo, stagiaire designer graphique, qui rejoint notre studio lundi pour six mois</span>. <span class="tok-f">Ton chaleureux, tutoiement, 5 lignes maximum, pour Slack.</span></div>' +
        '<div class="a"><span class="av av-claude"><svg><use href="#i-spark"/></svg></span><span>« Bienvenue Hugo ! Lundi, tu rejoins le studio pour six mois… »</span></div>' +
        '<div class="verdict">Précis, presque prêt à poster.</div></div></div></div>');
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active) wrap.appendChild(continueBtn("Voir pourquoi"));
      return wrap;
    },

    doc: function (s, c, i, active) {
      var el = h('<div class="doc is-open"><div class="doc-head"><span class="doc-ic"><svg><use href="#i-doc"/></svg></span><div><b>Compte rendu · Maison Aubrac</b><small>Document fictif · partagé par Inès</small></div></div><div class="doc-body"><pre></pre></div></div>');
      el.querySelector("pre").textContent = DOC;
      if (!active) el.classList.remove("is-open");
      el.querySelector(".doc-head").style.cursor = "pointer";
      el.querySelector(".doc-head").onclick = function () { el.classList.toggle("is-open"); };
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active) wrap.appendChild(continueBtn("J’ai lu le compte rendu"));
      return wrap;
    },

    qcm: function (s, c, i, active) { return choiceCard(s, c, i, active, false); },
    multi: function (s, c, i, active) { return choiceCard(s, c, i, active, true); },

    link: function (s, c, i, active) {
      var state = st(c, i);
      state.map = state.map || {};
      var CATS = [["T", "Tâche", "ce qu’il doit faire"], ["C", "Contexte", "la situation"], ["F", "Format", "la forme attendue"]];
      var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>Relier<span class="pts"></span></div><h3></h3><p class="sub"></p><div class="link-wrap"><div class="link-items"></div><div class="link-cats"></div></div></div>');
      el.querySelector("h3").textContent = s.q;
      el.querySelector(".sub").textContent = s.sub;
      el.querySelector(".pts").textContent = s.pts + " pts";
      var items = shuffle(s.items.map(function (x, k) { return [x[0], x[1], k]; }), 7 + c);
      var sel = null;
      items.forEach(function (it) {
        var b = h('<button type="button" class="li-item"></button>');
        b.textContent = it[0];
        var got = state.map[it[2]];
        if (got) b.appendChild(h('<span class="tag tag-' + got + '">' + got + "</span>"));
        if (state.checked) b.classList.add(got === it[1] ? "is-right" : "is-wrong");
        b.disabled = !!state.checked;
        b.onclick = function () { sel = it[2]; $$(".li-item", el).forEach(function (x) { x.classList.toggle("is-sel", x === b); }); };
        el.querySelector(".link-items").appendChild(b);
      });
      CATS.forEach(function (ct) {
        var b = h('<button type="button" class="li-cat" data-cat="' + ct[0] + '"><span></span><small></small></button>');
        b.firstChild.textContent = ct[1];
        b.lastChild.textContent = ct[2];
        b.disabled = !!state.checked;
        b.onclick = function () { if (sel === null) return; state.map[sel] = ct[0]; sel = null; save(); rerender(); };
        el.querySelector(".link-cats").appendChild(b);
      });
      if (!state.checked && active) {
        var all = Object.keys(state.map).length === s.items.length;
        var acts = h('<div class="card-actions"><button type="button" class="btn btn-dark">Valider</button></div>');
        acts.firstChild.disabled = !all;
        acts.firstChild.onclick = function () {
          state.checked = true;
          state.score = s.items.filter(function (x, k) { return state.map[k] === x[1]; }).length;
          save();
          if (state.score === s.items.length) award(key(c, i), s.pts, "Tout est relié correctement");
          rerender();
        };
        el.appendChild(acts);
      }
      if (state.checked) {
        var ok = state.score === s.items.length;
        el.appendChild(result(ok, ok ? "Parfait : vous savez reconnaître les trois ingrédients d’une demande."
          : state.score + " sur " + s.items.length + ". Les morceaux en orange étaient mal placés : relisez les couleurs de la demande complète."));
      }
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active && state.checked) wrap.appendChild(continueBtn());
      return wrap;
    },

    order: function (s, c, i, active) {
      var state = st(c, i);
      state.picked = state.picked || [];
      var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>Remettre dans l’ordre<span class="pts"></span></div><h3></h3><p class="sub"></p><div class="order-list"></div></div>');
      el.querySelector("h3").textContent = s.q;
      el.querySelector(".sub").textContent = s.sub;
      el.querySelector(".pts").textContent = s.pts + " pts";
      var items = shuffle(s.items.map(function (x, k) { return [x, k]; }), 11);
      items.forEach(function (it) {
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
          save(); rerender();
        };
        el.querySelector(".order-list").appendChild(b);
      });
      if (!state.checked && active) {
        var acts = h('<div class="card-actions"><button type="button" class="btn btn-dark">Valider</button><button type="button" class="btn btn-soft">Effacer</button></div>');
        acts.firstChild.disabled = state.picked.length !== s.items.length;
        acts.firstChild.onclick = function () {
          state.checked = true;
          state.ok = state.picked.every(function (v, k) { return v === k; });
          save();
          if (state.ok) award(key(c, i), s.pts, "Bon ordre");
          rerender();
        };
        acts.lastChild.onclick = function () { state.picked = []; save(); rerender(); };
        el.appendChild(acts);
      }
      if (state.checked) {
        el.appendChild(result(state.ok, state.ok ? "Exactement : nouveau sujet, source, demande précise, puis relecture."
          : "Le bon ordre : " + s.items.map(function (x, k) { return (k + 1) + ". " + x; }).join(" · ")));
      }
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active && state.checked) wrap.appendChild(continueBtn());
      return wrap;
    },

    spot: function (s, c, i, active) {
      var state = st(c, i);
      state.sel = state.sel || [];
      var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>Repérer l’erreur<span class="pts"></span></div><h3></h3><div class="spot-text"><span class="av av-claude"><svg><use href="#i-spark"/></svg></span></div></div>');
      el.querySelector("h3").textContent = s.q;
      el.querySelector(".pts").textContent = s.pts + " pts";
      var box = el.querySelector(".spot-text");
      s.parts.forEach(function (p, k) {
        if (typeof p === "string") { box.appendChild(document.createTextNode(p)); return; }
        var b = h('<button type="button" class="hot"></button>');
        b.textContent = p.hot;
        var on = state.sel.indexOf(k) >= 0;
        b.classList.toggle("is-sel", on && !state.checked);
        if (state.checked && (on || p.bad)) b.classList.add(p.bad ? (on ? "is-right" : "is-wrong") : "is-wrong");
        b.disabled = !!state.checked;
        b.onclick = function () {
          var at = state.sel.indexOf(k);
          if (at >= 0) state.sel.splice(at, 1); else state.sel.push(k);
          save(); rerender();
        };
        box.appendChild(b);
      });
      var bad = s.parts.map(function (p, k) { return p && p.bad ? k : -1; }).filter(function (k) { return k >= 0; });
      if (!state.checked && active) {
        var acts = h('<div class="card-actions"><button type="button" class="btn btn-dark">Valider</button></div>');
        acts.firstChild.disabled = !state.sel.length;
        acts.firstChild.onclick = function () {
          state.checked = true;
          state.ok = state.sel.length === bad.length && bad.every(function (k) { return state.sel.indexOf(k) >= 0; });
          save();
          if (state.ok) award(key(c, i), s.pts, "Inventions repérées");
          rerender();
        };
        el.appendChild(acts);
      }
      if (state.checked) {
        el.appendChild(result(state.ok, state.ok ? "Bien vu : ni budget ni date d’envoi dans le compte rendu. Le 22 avril, lui, y figure."
          : "Les inventions étaient « 15 000 € » et « 15 avril » : absents du compte rendu. Le 22 avril, lui, y figure bien."));
      }
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active && state.checked) wrap.appendChild(continueBtn());
      return wrap;
    },

    tf: function (s, c, i, active) {
      var state = st(c, i);
      state.ans = state.ans || {};
      var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>' + (s.choices.length > 2 ? "Décider" : "Vrai ou faux") + '<span class="pts"></span></div><h3></h3><div class="tf"></div></div>');
      el.querySelector("h3").textContent = s.q;
      el.querySelector(".pts").textContent = s.pts + " pts par bonne réponse";
      s.items.forEach(function (it, k) {
        var row = h('<div class="tf-row"><p></p><div class="tf-btns"></div></div>');
        row.firstChild.textContent = it[0];
        var given = state.ans[k];
        s.choices.forEach(function (ch) {
          var b = h('<button type="button"></button>');
          b.textContent = ch;
          if (given) { b.disabled = true; if (ch === it[1]) b.classList.add("is-right"); else if (ch === given) b.classList.add("is-wrong"); }
          b.onclick = function () {
            state.ans[k] = ch;
            save();
            if (ch === it[1]) award(key(c, i) + "." + k, s.pts, "Bonne réponse");
            rerender();
          };
          row.lastChild.appendChild(b);
        });
        if (given) { var f = h('<p class="opt-fb"></p>'); f.textContent = it[2]; row.appendChild(f); }
        el.querySelector(".tf").appendChild(row);
      });
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active && Object.keys(state.ans).length === s.items.length) wrap.appendChild(continueBtn());
      return wrap;
    },

    practice: function (s, c, i, active) {
      var state = st(c, i);
      var res = evaluate(s, c, i);
      var el = h('<div class="practice"><div class="card-k"><svg><use href="#i-spark"/></svg>Essayer avec Claude<span class="pts"></span></div><h3></h3><p class="task"></p><ul class="crit"></ul></div>');
      el.querySelector("h3").textContent = s.title;
      el.querySelector(".pts").textContent = s.pts + " pts";
      el.querySelector(".task").textContent = s.task;
      el.querySelector(".task").style.cssText = "margin:0 0 12px;font-size:14.5px;line-height:1.55;color:var(--ink-2)";
      if (s.facts) {
        var f = h('<div style="margin:0 0 12px"><p style="margin:0 0 7px;font:600 12.5px/1 var(--text);color:var(--muted)">Les informations dont vous disposez :</p><div class="facts"></div></div>');
        s.facts.forEach(function (x) { var sp = document.createElement("span"); sp.textContent = x; f.lastChild.appendChild(sp); });
        el.insertBefore(f, el.querySelector(".crit"));
      }
      s.criteria.forEach(function (cr) {
        var li = h('<li><span class="ck"><svg><use href="#i-check"/></svg></span><span></span></li>');
        li.lastChild.textContent = cr[1];
        li.classList.toggle("is-ok", !!res[cr[0]]);
        el.querySelector(".crit").appendChild(li);
      });
      if (s.analysis && active && !state.done) {
        el.appendChild(h('<div class="analysis" data-analysis><small>Analyse de votre demande, pendant que vous écrivez</small><div class="an-chips"><span class="an" data-an="T"><i></i>Tâche</span><span class="an" data-an="C"><i></i>Contexte</span><span class="an" data-an="F"><i></i>Format</span></div><p class="an-tip" data-an-tip>Commencez à écrire dans la zone de Claude.</p></div>'));
      }
      if (active && !state.done) {
        var acts = h('<div class="card-actions"></div>');
        if (s.doc) {
          var d = h('<button type="button" class="btn btn-line"><svg><use href="#i-doc"/></svg>Coller le compte rendu dans Claude</button>');
          d.onclick = function () { insert("Voici le compte rendu d’une réunion :\n\n" + DOC + "\n\n"); };
          acts.appendChild(d);
        }
        var g = h('<button type="button" class="btn btn-dark go-claude">Aller dans Claude <svg><use href="#i-arrow"/></svg></button>');
        g.onclick = function () { showTab("claude"); input.focus(); };
        acts.appendChild(g);
        if (acts.children.length) el.appendChild(acts);
        var hints = (s.hints || []).filter(function (x) { return !x.after || (state.tries || 0) >= x.after; });
        if (hints.length) {
          var open = S.level === "jamais" || state.hintsOpen;
          var hb = h('<div class="hints"><button type="button" class="toggle"></button><div class="chips"></div></div>');
          hb.firstChild.textContent = open ? "Masquer les idées" : "Besoin d’une idée ?";
          hb.firstChild.onclick = function () { state.hintsOpen = !open; if (S.level === "jamais") S.level = "parfois"; save(); rerender(); };
          if (open) hints.forEach(function (x) {
            if (x.plain) { var p = h('<p class="an-tip" style="margin:0"></p>'); p.textContent = x.text; hb.lastChild.appendChild(p); return; }
            var ch = h('<button type="button" class="chip"></button>');
            ch.textContent = x.text;
            ch.onclick = function () { insert(x.text); };
            hb.lastChild.appendChild(ch);
          });
          else hb.lastChild.remove();
          el.appendChild(hb);
        }
      }
      if (state.done) el.appendChild(result(true, "Mission réussie : relisez la réponse de Claude avant de continuer."));
      var wrap = document.createElement("div");
      wrap.appendChild(el);
      if (active && state.done) wrap.appendChild(continueBtn());
      return wrap;
    },

    keep: function (s, c, i, active) {
      var el = h('<div class="keep"><div class="card-k"><svg><use href="#i-bulb"/></svg>À retenir · ajouté à votre aide-mémoire</div><p></p></div>');
      el.querySelector("p").textContent = TAKEAWAYS[s.i];
      if (active) {
        var a = h('<div class="card-actions"><button type="button" class="btn btn-dark"></button></div>');
        a.firstChild.innerHTML = (c < MISSIONS - 1 ? "Mission suivante" : "Voir mon bilan") + ' <svg><use href="#i-arrow"/></svg>';
        a.firstChild.onclick = function () { toast(CH[c].label + " accomplie"); completeChapter(); };
        el.appendChild(a);
      }
      return el;
    },

    final: function () {
      var badges = [];
      if (S.bestPrompt) badges.push("Demande complète");
      if ((st(4, 4) || {}).ok) badges.push("Œil de lynx");
      var dec = st(5, 1).ans || {};
      if (CH[5].steps[1].items.every(function (it, k) { return dec[k] === it[1]; })) badges.push("Réflexes sûrs");
      var el = h('<div class="final"><div class="card-k" style="color:var(--claude)"><svg><use href="#i-spark"/></svg>Votre première journée</div><h3>Aide-mémoire : Claude au quotidien</h3>' +
        '<div class="stats"><div class="stat"><b data-f-xp></b><span>points</span></div><div class="stat"><b data-f-m></b><span>missions</span></div><div class="stat"><b data-f-msg></b><span>échanges avec Claude</span></div></div>' +
        '<div class="badges"></div><ol class="memo"></ol><div data-f-prompt></div>' +
        '<div class="card-actions"><button type="button" class="btn btn-dark" data-print>Imprimer ou enregistrer en PDF</button><button type="button" class="btn btn-soft" data-restart>Recommencer</button></div></div>');
      el.querySelector("[data-f-xp]").textContent = S.xp;
      el.querySelector("[data-f-m]").textContent = S.done.filter(function (x) { return x < MISSIONS; }).length + "/" + MISSIONS;
      el.querySelector("[data-f-msg]").textContent = S.stats.live + S.stats.sim;
      badges.forEach(function (b) { el.querySelector(".badges").appendChild(h('<span class="badge"><svg><use href="#i-check"/></svg>' + esc(b) + "</span>")); });
      TAKEAWAYS.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; el.querySelector(".memo").appendChild(li); });
      if (S.bestPrompt) {
        var p = h('<div style="margin-top:14px"><p style="margin:0;font:600 13px/1 var(--text);color:var(--muted)">Votre demande complète de la mission 2 :</p><div class="my-prompt"></div></div>');
        p.querySelector(".my-prompt").textContent = S.bestPrompt;
        el.querySelector("[data-f-prompt]").appendChild(p);
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

  function result(ok, text) {
    var el = h('<div class="result ' + (ok ? "result--good" : "result--mid") + '"><svg><use href="#i-' + (ok ? "check" : "bulb") + '"/></svg><span></span></div>');
    el.lastChild.textContent = text;
    return el;
  }

  function choiceCard(s, c, i, active, multi) {
    var state = st(c, i);
    state.sel = state.sel || [];
    var el = h('<div class="card"><div class="card-k"><svg><use href="#i-target"/></svg>' + (s.reflect ? "Prendre du recul" : multi ? "Plusieurs réponses" : "Question") + '<span class="pts"></span></div><h3></h3><div class="opts"></div></div>');
    el.querySelector("h3").textContent = s.q;
    el.querySelector(".pts").textContent = s.pts ? s.pts + " pts" : "";
    s.opts.forEach(function (o, k) {
      var b = h('<button type="button" class="opt"><span class="box' + (multi ? "" : " round") + '"><svg><use href="#i-check"/></svg></span><span></span></button>');
      b.lastChild.textContent = o[0];
      var on = state.sel.indexOf(k) >= 0;
      if (state.checked) {
        b.disabled = true;
        if (s.reflect) b.classList.toggle("is-sel", on);
        else if (o[1]) b.classList.add("is-right");
        else if (on) b.classList.add("is-wrong");
      } else b.classList.toggle("is-sel", on);
      b.onclick = function () {
        if (multi) { var at = state.sel.indexOf(k); if (at >= 0) state.sel.splice(at, 1); else state.sel.push(k); save(); rerender(); return; }
        state.sel = [k];
        state.checked = true;
        save();
        if (!s.reflect && o[1]) award(key(c, i), s.pts, "Bonne réponse");
        rerender();
      };
      el.querySelector(".opts").appendChild(b);
      if (state.checked && (on || (multi && !s.reflect))) {
        var fbk = h('<p class="opt-fb"></p>');
        fbk.textContent = o[2];
        el.querySelector(".opts").appendChild(fbk);
      }
    });
    if (multi && !state.checked && active) {
      var acts = h('<div class="card-actions"><button type="button" class="btn btn-dark">Valider</button></div>');
      acts.firstChild.disabled = !state.sel.length;
      acts.firstChild.onclick = function () {
        state.checked = true;
        state.ok = s.opts.every(function (o, k) { return !!o[1] === (state.sel.indexOf(k) >= 0); });
        save();
        if (state.ok) award(key(c, i), s.pts, "Toutes les bonnes réponses");
        rerender();
      };
      el.appendChild(acts);
    }
    if (multi && state.checked) el.appendChild(result(state.ok, state.ok ? "Parfait, toutes les bonnes réponses." : "Pas tout à fait : lisez les explications sous chaque proposition."));
    var wrap = document.createElement("div");
    wrap.appendChild(el);
    if (active && state.checked) wrap.appendChild(continueBtn());
    return wrap;
  }

  function rerender() {
    var y = thread.scrollTop;
    renderThread();
    thread.scrollTop = y;
    renderRail();
  }

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
      if (best) { S.bestPrompt = best.m.content; S.welcomeConv = best.conv.id; } else { r.all = false; }
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
    var s = currentStep();
    if (!s || s.t !== "practice") return;
    var state = st(S.ch, pos(S.ch));
    if (state.done) return;
    var r = evaluate(s, S.ch, pos(S.ch));
    var complete = r.__complete !== undefined ? r.__complete : s.criteria.every(function (cr) { return r[cr[0]]; });
    if (complete) {
      state.done = true;
      save();
      award(key(S.ch, pos(S.ch)), s.pts, "Étape réussie");
      if (window.innerWidth <= 960) setTimeout(function () { showTab("story"); }, 1400);
    }
    rerender();
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
    var s = currentStep();
    var practice = s && s.t === "practice" && !st(S.ch, pos(S.ch)).done;
    work.classList.toggle("is-locked", !practice);
    input.disabled = !practice || busy;
    sendBtn.disabled = !practice || busy;
    input.placeholder = practice ? "Écrivez à Claude…" : "Terminez d’abord l’étape en cours, à gauche.";
    banner.hidden = false;
    banner.className = "work-banner " + (practice ? "is-task" : "is-wait");
    banner.innerHTML = '<svg><use href="#i-' + (practice ? "target" : "lock") + '"/></svg><span></span>';
    banner.lastChild.textContent = practice ? "À vous : " + s.task : "Claude vous attend. Suivez d’abord l’étape en cours dans le fil de gauche.";
    $("[data-new]").classList.toggle("is-spot", !!practice && S.ch === 3 && !evaluate(s, 3, pos(3)).new);
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
    el.lastChild.innerHTML = '<div class="msg-error"><span></span><div class="card-actions"><button type="button" class="btn btn-soft" data-r>Réessayer</button><button type="button" class="btn btn-soft" data-s>Utiliser la simulation</button></div></div>';
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
    var s = currentStep();
    var text = input.value.trim();
    if (!text || busy || !s || s.t !== "practice") return;
    var c = conv() || newConv();
    c.messages.push({ role: "user", content: text, ch: S.ch, step: pos(S.ch) });
    if (c.messages.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 44) + (text.length > 44 ? "…" : "");
    var state = st(S.ch, pos(S.ch));
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
    if (tab === "story") $("[data-tab-dot]").hidden = true;
  }
  $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  /* ---------- Aide-mémoire imprimable ---------- */

  function printMemo() {
    var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aide-mémoire · Découvrir Claude</title><style>' +
      '@font-face{font-family:Inter;src:url(../assets/fonts/inter.woff2) format("woff2-variations");font-weight:100 900}' +
      '@page{size:A4;margin:18mm}body{font-family:Inter,system-ui,sans-serif;color:#0d1220}h1{font-size:26pt;margin:0 0 4mm;letter-spacing:-.02em}' +
      '.k{font:600 9pt Inter;letter-spacing:.2em;text-transform:uppercase;color:#6b7288}.bar{height:1.2mm;width:30mm;border-radius:1mm;background:linear-gradient(90deg,#d9612b,#e0457b,#4f46e5);margin-bottom:8mm}' +
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
    renderRail();
    // les étapes déjà affichées ne se réaniment pas au retour
    if (!animate) for (var c = 0; c <= S.ch; c++) { shownKeys["h" + c] = 1; for (var i = 0; i < pos(c); i++) shownKeys[key(c, i)] = 1; }
    flow();
  }

  $("[data-start]").addEventListener("click", function () { S.started = true; save(); openApp(true); });
  showTab("story");
  setMode("sim");
  probe();
  if (S.started) openApp(false);

  window.DecouvrirTracking = { snapshot: function () { return { chapter: S.ch, done: S.done, xp: S.xp, level: S.level, stats: S.stats, bestPrompt: S.bestPrompt || null }; } };
})();
