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
