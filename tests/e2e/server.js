"use strict";
/**
 * Petit serveur statique pour les tests navigateur (voir playwright.config.js) :
 * sert le dépôt tel quel en HTTP, comme GitHub Pages, pour tester l'app dans
 * les mêmes conditions (Content-Security-Policy, service worker...). Aucune
 * dépendance : uniquement les modules natifs de Node.
 *
 *   node tests/e2e/server.js [port]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

// Simulation d'une nouvelle version publiée (tests de la bannière de mise à
// jour) : GET /__test/sw-version?v=xxx ajoute un commentaire à la fin de
// service-worker.js, ce qui suffit au navigateur pour y voir une mise à jour.
let swTestMarker = "";

http.createServer((req, res) => {
  let pathname;
  let url;
  try {
    url = new URL(req.url, "http://localhost");
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === "/__test/sw-version") {
    swTestMarker = (url.searchParams.get("v") || "").replace(/[^\w-]/g, "");
    res.writeHead(204).end();
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(ROOT, "." + pathname);
  // Jamais en dehors du dépôt (ex. /../../fichier).
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (!err && pathname === "/service-worker.js" && swTestMarker) {
      data = Buffer.concat([data, Buffer.from(`\n// version de test : ${swTestMarker}\n`)]);
    }
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Serveur de test : http://127.0.0.1:${PORT}/`);
});
