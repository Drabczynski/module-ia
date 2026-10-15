/* Les titres en dégradé, lettre par lettre : une couleur par lettre plutôt qu'un fond découpé dans le texte,
   pour que le PDF garde du vrai texte (sélectionnable, lu par les lecteurs d'écran) et s'affiche partout pareil. */
(function () {
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  document.querySelectorAll("[data-grad]").forEach(function (el) {
    var c = el.getAttribute("data-grad").split(" ").map(rgb), text = el.textContent, chars = Array.from(text), n = Math.max(1, chars.length - 1);
    el.textContent = "";
    var prev = null;
    chars.forEach(function (ch, i) {
      if (/\s/.test(ch) && prev) { prev.textContent += ch; return; }   // l'espace reste collée à la lettre d'avant : le PDF la garde
      var t = i / n, s = document.createElement("span"); prev = s;
      s.style.color = "rgb(" + [0, 1, 2].map(function (k) { return Math.round(c[0][k] + (c[1][k] - c[0][k]) * t); }).join(",") + ")";
      s.textContent = ch; el.appendChild(s);
    });
    el.setAttribute("aria-label", text);
  });
})();
