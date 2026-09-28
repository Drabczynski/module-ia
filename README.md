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
