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

- Première visite : l'introduction à faire défiler s'affiche en plein écran (`atelier/intro.html`), sans Claude.
- Ensuite : Claude à gauche (simulation de l'interface, où l'apprenant écrit), la formation à droite dans un panneau
  étroit. Le panneau affiche le module d'origine (`index.html?embed=1`) en colonne, sans photo : mêmes écrans,
  mêmes cartes, « relier » avec ses liens, quiz, bilan. Le bouton d'action de chaque écran (Valider, Continuer…)
  est reporté dans la barre de l'assistant, en bas du panneau.
- 3.08 : « Reprendre le tableau de Claude » importe le dernier tableau de la conversation dans la grille.
- Après l'introduction : accueil de l'assistante d'apprentissage (orbe au centre, voix `assets/audio/bienvenue.mp3`,
  texte mot à mot). « Continuer » : l'orbe rejoint sa place au centre de Claude, l'interface apparaît en fondu.
- 3.04 : le panneau de formation se replie, les repères se font sur l'interface de Claude (pastilles orange),
  puis le panneau revient et l'écran du module les marque comme vus.
- 3.03 : la photo de Léa s'affiche (écrans qui parlent d'elle) ; titres agrandis dans le panneau.
- Minutage mot à mot des voix (`assets/audio/mots.js`), mesuré sur les creux d'énergie de chaque enregistrement.
- Quand la conversation commence, l'orbe glisse du centre de Claude vers la barre du panneau (et revient si la
  conversation est vidée).
- Assistant pédagogique en forme d'orbe (`atelier/orb.js`, WebGL, sphère laiteuse aux bandes pastel) : il lit la
  consigne de chaque écran dès l'arrivée (MP3 pour 3.01 à 3.04, synthèse vocale du navigateur ailleurs). Pendant la
  voix, l'orbe passe à l'état « listening » et suit l'amplitude de l'enregistrement (enveloppe calculée à l'avance) ;
  le texte s'affiche mot à mot sous la grande orbe, au rythme des sous-titres.
- Largeur du panneau réglable : poignée entre Claude et la formation (glisser, flèches du clavier, double-clic pour
  revenir au réglage par défaut) ; la largeur est mémorisée.
- Chaque ouverture repart de zéro : exercices vierges, reprise à l'écran 3.02 (le suivi de la version diapositives
  n'est pas touché). Au retour, pas d'écran d'accueil : si le navigateur bloque la voix, elle démarre au premier clic.

## Découvrir Claude (`decouvrir/`)

Module autonome de découverte : une journée fictive chez Lumen, six missions et un bilan.

- Interface sobre : le guide (à gauche) n'affiche qu'un écran à la fois, avec un seul bouton principal
  (Valider, Continuer, Mission suivante) ; « Précédent » et le menu des missions permettent de revoir un écran.
- Activités : QCM, choix multiples, relier, remettre dans l'ordre, repérer une erreur, vrai/faux, décisions,
  pratique réelle avec Claude (critères vérifiés automatiquement, analyse Tâche / Contexte / Format en direct).
- L'espace Claude (à droite) n'est utilisable qu'aux étapes « Essayer ».
- Points, badges et aide-mémoire final imprimable, avec la demande rédigée par l'apprenant.
- Utilise la même fonction `api/chat.ts` (identifiant `decouvrir`) ; mode simulé automatique sans clé.
