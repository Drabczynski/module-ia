# Module 3 · Prendre en main Claude

Module e-learning en HTML / CSS (+ un peu de JavaScript pour la navigation et les interactions).
Il sera empaqueté en SCORM dans une étape suivante.

## Lancer

Ouvrir `index.html` dans un navigateur. `#3` dans l'URL ouvre directement l'écran 3.
Navigation : boutons, ou flèches ← → du clavier.

## Structure

- `index.html` : tous les écrans (`<section class="slide">`), un par écran fourni.
- `assets/css/course.css` : design system et styles par écran.
- `assets/js/course.js` : navigation, mise à l'échelle, repères interactifs.
  Le suivi passe par `CourseTracking` (localStorage aujourd'hui, API SCORM demain).
- `assets/fonts` : polices embarquées (fonctionne hors ligne dans un LMS).
- `assets/img` : photos.

La scène fait 1600×900 et s'adapte à la fenêtre.
Chaque écran règle la largeur du panneau photo via `--pw` ; la photo s'anime d'un écran à l'autre.

## Voix off

- Un MP3 par écran dans `assets/audio/ecran-XX.mp3`, lié via `data-audio="ecran-XX"` sur la `<section>`.
- Sous-titres dans `assets/audio/sous-titres.js` : `[début, fin, texte]` en secondes.
- La voix démarre seule à l'arrivée sur l'écran. Si le navigateur bloque le son (premier écran), le bouton lecture clignote avec « Écouter la voix off ».
- Sous-titres et coupure du son se règlent dans le dock en bas ; les choix sont mémorisés.

## Conformité au storyboard

- Retours pédagogiques exacts du storyboard (QCM, bilan et écrans de contenu).
- Écran 3.08 : validation sur 4 critères (Réussi / À reprendre), 3 soumissions maximum, « Voir la correction ».
- Menu (bouton en haut à droite) : écrans par séquence, écrans vus accessibles, « Mes repères » avec la fiche.
- Suivi : mode réel ou simulation (écran 3.02), manipulation déclarée, résultat déposé et simulation enregistrés séparément.
  `CourseTracking.snapshot()` renvoie l'état complet pour le futur adaptateur SCORM.
- La réponse ChatGPT de l'écran 3.13 vient de `window.COURSE_CONTEXT.chatgptFirstResponse` (plateforme) ;
  à défaut, la réponse illustrative relue du storyboard est affichée avec la mention « exemple ».
- Sous 820 px de large, la scène devient une page où les colonnes s'empilent.

## Version immersive (storyboard complet, écrans 3.01 à 3.18)

`immersif/` suit le storyboard *Module 3 · Prendre en main Claude* avec une simulation de l'interface de Claude à droite.

- **3.01** : introduction à faire défiler (récit des notes de Léa qui deviennent un tableau, méthode,
  objectifs, parcours, évaluation, règles), apparitions au défilement, sommaire latéral, barre de progression.
- **3.02 à 3.18** : une étape à la fois, voix off transcrite (audio 3.01 à 3.03), boutons stables
  (Continuer, Valider, Réessayer, Voir la correction, Revenir au menu), menu et *Mes repères*.
- Barème : 11 points (3.05 : 4, 3.08 : 4, 3.09, 3.12, 3.15 : 1). Deux essais avant le corrigé, meilleur essai retenu ;
  tableau 3.08 contrôlé de façon déterministe sur 4 critères (1 / 0,5 / 0), meilleure de trois soumissions ;
  reprise explicite avec historique. Validation : score ÷ 11 ≥ 0,70 et pratique faite.
- Pratique : dans l'onglet Claude réel (tableau collé dans le module) ou dans la simulation ;
  les deux sont enregistrés séparément (`window.ImmersifTracking.snapshot()`).
- Aucun retour personnalisé par IA.

- `api/chat.ts` : fonction Vercel qui appelle Claude (modèle `claude-opus-5`, réponses en continu).
  La clé reste côté serveur. Variables d'environnement Vercel :
  - `ANTHROPIC_API_KEY` (obligatoire pour le mode réel) ;
  - `ALLOWED_ORIGINS` : domaines des LMS autorisés, séparés par des virgules
    (la page servie par Vercel elle-même est toujours autorisée) ;
  - facultatif : `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` pour un compteur d'usage partagé,
    `LIMIT_PER_LEARNER` (60 par jour par défaut) et `LIMIT_PER_IP` (300).
- Sans clé, sans réseau ou en cas de panne, le module passe en **mode simulé** (réponses préparées pour l'exercice).
- Dans un LMS, définir `window.IMMERSIF_API = "https://<projet>.vercel.app/api/chat"` avant `app.js`.
- Vérification des types : `npm install && npm run typecheck`.

## Atelier (`atelier/`)

Claude à gauche (simulation de l'interface), la formation à droite, **pas à pas**, tout au même endroit.

- Ouverture : l'orbe seule au centre, message vocal `bienvenue.mp3` affiché mot à mot ; à la fin du message, elle
  rejoint sa place dans Claude et le panneau de formation apparaît (si le navigateur bloque le son : « Commencer »).
- Parcours réécrit pour l'atelier à partir du storyboard (3.02 à 3.18), dans la mise en forme des écrans d'origine :
  une étape à la fois, pas de doublon avec les réponses de Claude, pas de copier-coller entre deux outils.
- Le champ de Claude n'est actif que lorsque l'étape demande d'écrire ; il est alors mis en avant (phase d'écriture).
- Les réponses de Claude sont contrôlées automatiquement (tableau : 4 critères du storyboard) ; une réponse juste
  fait passer à l'étape suivante. 3.04 : panneau replié, repères sur Claude, suite automatique après les 4 pastilles.
- Barème : 11 points (associer 4, tableau 4, trois QCM à 1 point), deux essais par activité, seuil 70 %.
- Orbe (`atelier/orb.js`) : voix des consignes (MP3 quand ils existent, synthèse vocale ailleurs), texte mot à mot
  (`assets/audio/mots.js`), état « listening » pendant la voix ; elle glisse vers la barre du panneau quand la
  conversation commence. Panneau redimensionnable, boutons Retour et Continuer dans la barre du bas. Chaque ouverture repart de zéro.

## Module 1 · Première rencontre (`premiers-pas/`)

Nouveau parcours court, sur un seul thème : découvrir Claude, à quoi il sert, écrire son premier prompt, commencer simple.
Contenu tiré des articles d'aide Claude « Get started with Claude » et « What are some things I can use Claude for? ».
Storyboard : `premiers-pas/STORYBOARD.md`.

- Accueil : le même écran que le module « Des prompts pour les images » (`premiers-pas/accueil.css`, `accueil.js`,
  règles sous `.acc`), posé par-dessus l'application : barre blanche (module, « Les modules », « Quitter »),
  collage 03 avec le ciel en vidéo, globe de points, lueur animée en bas, réflexion puis titre et description
  à la machine à écrire. « Commencer » envoie `module:start` : l'accueil s'efface, l'assistante souhaite la bienvenue
  (interface épurée, sans champ de saisie, mention ni mode), puis la première étape s'ouvre.
- Thème gris clair (au lieu du beige d'`app.css`, partagée avec le module 2) : `premiers-pas/gris.css`, générée par
  `node premiers-pas/gris.mjs` (à relancer après une modification d'`app.css`).
- Même moteur que l'atelier (Claude simulé à gauche, formation à droite, orbe, pas à pas), situations fictives de la vie courante :
  pot de départ, mot d'un voisin en portugais, exposé scolaire.
- Activités variées : écrire dans Claude, cartes à glisser (vrai/faux), glisser-déposer, relier, classer dans l'ordre,
  étiquettes à cocher, boîte mail simulée, choisir entre deux réponses, pastilles sur l'interface, défi final.
- Barème : 15 points, seuil 70 %. Quand il faut écrire, la demande arrive dans Claude avec des cases orange à compléter au clic. Bilan et fiche en plein écran, bouton Quitter (SCORM si présent).
- Voix de synthèse du navigateur en attendant les enregistrements ; l'accueil démarre au clic sur « Commencer ».
- Fonction `api/chat.ts`, identifiant `premiers-pas` ; mode simulé automatique sans clé.

## Module 2 · La structure d’un prompt (`structure-prompt/`)

Compétence C2 de la certification RS6776 : Rôle, Cible, Objectif, Contexte, Format, sur le cas d’une offre d’emploi.
Même moteur que le module 1 (styles et orbe partagés avec `premiers-pas/`). Storyboard et textes à enregistrer : `structure-prompt/STORYBOARD.md`.
Fonction `api/chat.ts`, identifiant `structure-prompt`. Le menu « Les modules » relie les modules déjà construits.

## Site vitrine (`site/`)

Page de présentation commerciale. Elle s’ouvre sur la vidéo du bureau
(`assets/Photorealistic-cinematic-16-9-opening-fr.mp4`, découpée en 169 images dans
`assets/video/bureau/`) qui avance au défilement, avec des messages sur l’IA au travail, puis
plonge dans l’écran, d’où surgit directement l’orbe. Après la démonstration, un immeuble de bureaux dessiné au trait, plein centre (`site/tour.js`, sur le moteur de
[Hairline](https://github.com/lucasmarkes/hairline), licence MIT, embarqué dans `site/vendor/hairline/`) :
au défilement, il se construit étage par étage, s’ouvre à l’étage présenté (accueil, RH,
communication, finance, juridique, direction), qui glisse vers le lecteur avec ses postes,
ses écrans et ses collaborateurs, et fait un tour complet sur lui-même. Les encarts arrivent
une fois à gauche, une fois à droite ; chacun affiche une photo Unsplash liée à l’étape
(chargée depuis images.unsplash.com, avec le crédit du photographe). Ensuite, le défilement
raconte un module par chapitres : le titre, puis une sphère de particules qui se forme,
tourne et éclate pour laisser place à l’orbe qui parle, puis le module dans un écran
dont une caméra cadre la zone utile, avec cinq gestes de l’apprenant (écrire, repérer,
construire, varier : glisser, QCM, roue, génération d’image et d’un document Word) et, à gauche, des étapes qui présentent chaque type
d’interaction. Des étiquettes expliquent les clics de la démonstration. Mouvements à ressorts. Suivent les modules,
les formules et la FAQ. Réutilise `premiers-pas/orb.js` et les
polices de `assets/fonts`. Photo de paysage : Liang Zhao sur Unsplash (licence Unsplash), chargée
depuis images.unsplash.com. Nom « Atelier IA », formules « Sur devis » et adresse de contact
à remplacer.

## Découvrir Claude (`decouvrir/`)

Module autonome de découverte : une journée fictive chez Lumen, six missions et un bilan.

- Interface sobre : le guide (à gauche) n'affiche qu'un écran à la fois, avec un seul bouton principal
  (Valider, Continuer, Mission suivante) ; « Précédent » et le menu des missions permettent de revoir un écran.
- Activités : QCM, choix multiples, relier, remettre dans l'ordre, repérer une erreur, vrai/faux, décisions,
  pratique réelle avec Claude (critères vérifiés automatiquement, analyse Tâche / Contexte / Format en direct).
- L'espace Claude (à droite) n'est utilisable qu'aux étapes « Essayer ».
- Points, badges et aide-mémoire final imprimable, avec la demande rédigée par l'apprenant.
- Utilise la même fonction `api/chat.ts` (identifiant `decouvrir`) ; mode simulé automatique sans clé.

## Film de présentation (`site/video/`)

`atelier-ia-film.mp4` (40 s, 1920×1080) : la fenêtre de l'Atelier IA sur le dégradé du site, zooms sur le menu,
ouverture du module 2, blocs glissés pour construire la demande, envoi à l'Assistant IA, réponse en continu
avec un document Word, validation, puis sphère de particules et icônes. Source animée : `promo.html` et `promo.js`
(chaque image se calcule par `render(t)`, lecture en boucle si on ouvre la page). Rendu :
`node site/video/render.cjs http://localhost:8787/site/video/promo.html sortie.mp4 <ffmpeg> 30` (Playwright et ffmpeg).

## Module « Des prompts pour les images » (`prompts-images/`)

Écran d'accueil d'après la maquette « M3 · 00 — Accueil ».
- Barre d'outils blanche : nom du module et bouton « Quitter » (ferme la session SCORM en « suspend », puis écran de fin).
- « Module 3 » en IBM Plex Mono ; grand titre en Inter Tight, interlettrage serré ; description en gris ;
  bouton « Commencer » avec notre orbe (`premiers-pas/orb.js`) dedans, posé en bas à gauche.
- Fond `assets/img/03.png` (`?fond=01` pour le premier collage) ; le ciel de nuages est remplacé par la vidéo
  `assets/img/after.mp4`, rebouclée sans à-coup (`after-loop.webm`, `after-loop.mp4` : la fin se fond dans le début) ;
  le rectangle dégradé de l'image ondule (WebGL) ; devant, les deux personnes `assets/img/02.png`.
- Entre le fond et les personnes, un globe en trame de points qui tourne lentement (mode « différence »).
- En bas, sur toute la largeur, une lueur animée (corail, rose, magenta, lavande, orange, pêche) passe devant l'image
  et les personnes ; seul le bouton « Commencer » passe devant elle.
- Entrée (≈ 2,8 s) : « Réflexion » scintille pendant que des lignes grises s'écrivent, se replie puis s'efface ;
  le titre et la description s'écrivent à la machine à écrire, une bille noire au bout ; puis le bouton apparaît.
- `accueil.js` règle la taille du collage d'après la largeur réelle du texte, pour qu'il ne passe jamais sous le titre.
- Polices IBM Plex Sans et IBM Plex Mono (licence SIL OFL), dans `assets/fonts`.
