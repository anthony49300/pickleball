"use strict";

// =============================================================================
// SERVICE WORKER : FONCTIONNEMENT HORS LIGNE (PWA)
// =============================================================================
// Enregistré par js/shared/pwa.js, uniquement quand l'app est servie en
// http(s) : un service worker n'existe pas en file://, et l'APK Android
// (Capacitor) embarque déjà tous ses fichiers.
//
// Stratégie :
// - À l'installation, TOUS les fichiers de l'app (PRECACHE_URLS) sont mis en
//   cache : après une seule visite en ligne, tout fonctionne sans réseau, y
//   compris la page Tournoi jamais ouverte.
// - Ensuite, chaque fichier est servi immédiatement depuis le cache, et une
//   version fraîche est téléchargée en arrière-plan pour la visite suivante
//   ("stale-while-revalidate"). Une mise à jour du site apparaît donc au
//   2e chargement, sans jamais bloquer l'app hors ligne.
//
// ⚠️ Nouveau fichier ajouté au site (script, feuille de style, police...) :
// l'ajouter à PRECACHE_URLS ci-dessous. Un oubli n'empêche rien en ligne (le
// fichier est mis en cache à sa première utilisation), mais il manquerait
// hors ligne tant qu'il n'a jamais été chargé. Changer la liste ou le contenu
// de ce fichier suffit à déclencher la mise à jour du service worker ; pensez
// alors à incrémenter CACHE_VERSION pour repartir d'un cache propre.

const CACHE_VERSION = 1;
const CACHE_NAME = `pb-app-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "index.html",
  "tournoi.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon-pickleball.svg",

  "css/app.css",
  "css/fonts.css",
  "css/styles.css",
  "css/tournament.css",

  "fonts/barlow-400.woff2",
  "fonts/barlow-500.woff2",
  "fonts/barlow-600.woff2",
  "fonts/barlow-700.woff2",
  "fonts/barlow-condensed-600.woff2",
  "fonts/barlow-condensed-700.woff2",
  "fonts/inter-variable.woff2",
  "fonts/manrope-variable.woff2",
  "fonts/outfit-variable.woff2",
  "fonts/sora-variable.woff2",

  "js/vendor/lz-string.min.js",
  "js/vendor/html2canvas.min.js",

  "js/shared/version.js",
  "js/shared/modal.js",
  "js/shared/theme.js",
  "js/shared/ui-controls.js",
  "js/shared/pwa.js",

  "js/app/algorithm.js",
  "js/app/dom-elements.js",
  "js/app/form-and-render.js",
  "js/app/stats-visualizations.js",
  "js/app/state-and-groups.js",
  "js/app/history-and-events.js",
  "js/app/players-ui.js",
  "js/app/navigation.js",
  "js/app/init.js",

  "js/tournament/engine.js",
  "js/tournament/dom-elements.js",
  "js/tournament/state.js",
  "js/tournament/render.js",
  "js/tournament/events.js",
  "js/tournament/init.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: "reload" : on veut les fichiers du serveur, pas une copie
      // éventuellement périmée du cache HTTP du navigateur.
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("pb-app-") && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages : "index.html?d=..." (lien de partage) doit être servi par
  // index.html en cache ; le paramètre est lu ensuite par la page elle-même.
  const isPage = request.mode === "navigate";
  const matchOptions = isPage ? { ignoreSearch: true } : {};

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, matchOptions);

    const network = fetch(request)
      .then(response => {
        // Les réponses partielles ou en erreur ne remplacent pas une bonne copie.
        if (response.ok && response.status === 200) {
          cache.put(isPage ? new Request(url.origin + url.pathname) : request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    if (fresh) return fresh;
    // Hors ligne et jamais mis en cache : pour une page, on retombe sur l'accueil.
    if (isPage) {
      const fallback = await cache.match("index.html");
      if (fallback) return fallback;
    }
    return new Response("Hors ligne : ressource indisponible.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  })());
});
