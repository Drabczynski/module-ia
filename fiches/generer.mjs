/* Fiches « À retenir » : rend chaque fiche HTML de ce dossier en PDF A4 (Chromium, via Playwright).
   Usage, depuis la racine du dépôt :  node fiches/generer.mjs            (toutes les fiches)
                                       node fiches/generer.mjs module-1   (une seule)
   Playwright doit être disponible (npm i -D playwright, ou NODE_PATH vers une installation existante) ;
   CHROMIUM=/chemin/vers/chrome pour utiliser un navigateur déjà installé.
   Les PDF sont écrits dans assets/fiches/. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIR = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(DIR, ".."), OUT = path.join(ROOT, "assets", "fiches");
// nom du PDF : le titre de la fiche, sans accents (« Initiation IA · Module 1 · Première rencontre · … » → initiation-ia-module-1-premiere-rencontre.pdf)
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };

// un petit serveur pour que les polices et les images se chargent comme sur le site
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const wanted = process.argv.slice(2);
const pages = fs.readdirSync(DIR).filter((f) => /^module-\d+\.html$/.test(f) && (!wanted.length || wanted.includes(f.replace(".html", ""))));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const f of pages) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/fiches/${f}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const title = await page.title();
  const name = slug(title.split(" · ").slice(0, 3).join(" ")) + ".pdf";
  await page.pdf({ path: path.join(OUT, name), preferCSSPageSize: true, printBackground: true });
  console.log("assets/fiches/" + name);
  await page.close();
}
await browser.close();
server.close();
