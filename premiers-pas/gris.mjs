// Thème gris clair du module 1 : génère gris.css à partir de app.css (partagée avec le module 2).
// Chaque gris beige d'app.css devient un gris neutre de même clarté (les fonds clairs un peu plus soutenus).
// La surcouche reprend les déclarations concernées dans le même ordre, avec la même spécificité :
// les règles d'app.css gardent entre elles le même ordre de priorité.
// Après une modification d'app.css : node premiers-pas/gris.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/* ---------- couleurs ---------- */
const COLOR = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)/g;
function rgbOf(m) {
  if (m[1]) {
    let h = m[1];
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  return [+m[2], +m[3], +m[4]];
}
// beige : rouge ≥ vert ≥ bleu, faiblement saturé, teinte jaune (les teintes orangées et rosées des accents restent)
const KEEP = ["#fdf6ec"];                                 // --ko-50 : le fond des avertissements
function isWarm([r, g, b]) {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  if (!(r >= g && g >= b && r - b >= 2 && r - b <= 40 && (hi - lo) / Math.max(1, hi) < 0.16)) return false;
  if (KEEP.includes(hex([r, g, b]))) return false;
  return (60 * (g - b)) / (hi - lo) >= 30;
}
function gray([r, g, b]) {
  let v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  if (v >= 230) v -= 5;                                   // les fonds clairs : un gris clair qui se voit
  const c = (x) => Math.max(0, Math.min(255, x));
  return [c(v - 1), c(v - 1), c(v + 1)];                  // une pointe de bleu, comme l'accueil
}
const hex = (rgb) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");
function hasWarm(v) { return [...v.matchAll(COLOR)].some((m) => isWarm(rgbOf(m))); }
function toGray(v) {
  return v.replace(COLOR, (...m) => {
    const rgb = rgbOf(m);
    if (!isWarm(rgb)) return m[0];
    const g = gray(rgb);
    return m[1] ? hex(g) : m[5] ? `rgba(${g.join(", ")}${m[5].replace(/\s+/g, " ")})` : `rgb(${g.join(", ")})`;
  });
}

/* ---------- lecture de la feuille ---------- */
// découpe au premier niveau, sans couper dans les parenthèses ni les guillemets (url(data:…;…))
function splitTop(s, sep) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const ch of s) {
    if (q) { if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function blocks(s) {                                      // [prélude, contenu] des blocs { … } de premier niveau
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, j = open;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) break;
    }
    out.push([s.slice(i, open).trim(), s.slice(open + 1, j)]);
    i = j + 1;
  }
  return out;
}

/* ---------- spécificité ---------- */
function spec(sel) {
  let a = 0, b = 0, c = 0, i = 0;
  const ident = () => { const m = /^-?[_a-zA-Z][\w-]*/.exec(sel.slice(i)); i += m ? m[0].length : 1; return m ? m[0] : ""; };
  const parens = () => {                                  // contenu de ( … ), curseur après « ) »
    if (sel[i] !== "(") return "";
    let d = 0, j = i;
    for (; j < sel.length; j++) { if (sel[j] === "(") d++; else if (sel[j] === ")" && --d === 0) break; }
    const inner = sel.slice(i + 1, j); i = j + 1; return inner;
  };
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === "#") { i++; ident(); a++; }
    else if (ch === ".") { i++; ident(); b++; }
    else if (ch === "[") { i = sel.indexOf("]", i) + 1; b++; }
    else if (ch === ":") {
      if (sel[i + 1] === ":") { i += 2; ident(); parens(); c++; continue; }
      i++;
      const name = ident().toLowerCase(), inner = parens();
      if (name === "where") continue;
      if (["not", "is", "has"].includes(name)) {
        const best = splitTop(inner, ",").map(spec).reduce((x, y) => (cmp(x, y) >= 0 ? x : y), [0, 0, 0]);
        a += best[0]; b += best[1]; c += best[2];
      } else if (["before", "after", "first-line", "first-letter"].includes(name)) c++;
      else b++;
    }
    else if (/[a-zA-Z]/.test(ch)) { ident(); c++; }
    else i++;
  }
  return [a, b, c];
}
function cmp(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }

/* ---------- déclarations, dans l'ordre de la feuille ---------- */
const entries = [];                                       // { at, sel, prop, value, n }
const keyframes = [];
function walk(css, at) {
  for (const [pre, body] of blocks(css)) {
    if (pre.startsWith("@keyframes")) { if (hasWarm(body)) keyframes.push(`${pre} {${toGray(body)}}`); continue; }
    if (pre.startsWith("@font-face")) continue;
    if (pre.startsWith("@media") || pre.startsWith("@supports")) { walk(body, pre); continue; }
    const decls = splitTop(body, ";").map((d) => { const k = d.indexOf(":"); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; });
    for (const sel of splitTop(pre, ",")) for (const [prop, value] of decls) entries.push({ at, sel, prop, value, n: entries.length });
  }
}
walk(src, "");

// une propriété et ses formes longues (background / background-color, border / border-top-color…)
const family = (p) => (p.startsWith("--") ? p : p.replace(/^-[a-z]+-/, "").split("-")[0]);
const keyOf = (e) => family(e.prop) + "|" + spec(e.sel).join(",");
const first = {};
for (const e of entries) if (hasWarm(e.value)) { const k = keyOf(e); if (!(k in first)) first[k] = e.n; }
// à partir de la première déclaration beige d'un groupe, tout le groupe est repris dans l'ordre
const kept = entries.filter((e) => { const k = keyOf(e); return k in first && e.n >= first[k]; });

/* ---------- écriture ---------- */
let out = "/* Module 1 · Première rencontre : thème gris clair (au lieu du beige d'app.css).\n" +
  "   Fichier généré par gris.mjs à partir d'app.css : ne pas modifier à la main. */\n";
let run = null;
const flush = () => {
  if (!run) return;
  const rule = `${run.sel} { ${run.decls.join("; ")}; }`;
  out += run.at ? `${run.at} { ${rule} }\n` : rule + "\n";
  run = null;
};
for (const e of kept) {
  if (!run || run.at !== e.at || run.sel !== e.sel) { flush(); run = { at: e.at, sel: e.sel, decls: [] }; }
  run.decls.push(`${e.prop}: ${toGray(e.value)}`);
}
flush();
out += keyframes.join("\n") + (keyframes.length ? "\n" : "");
fs.writeFileSync(path.join(dir, "gris.css"), out);
console.log(`gris.css : ${kept.length} déclarations, ${keyframes.length} animations`);
