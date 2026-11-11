"use strict";

// =============================================================================
// ENREGISTREMENT DU SERVICE WORKER (mode hors ligne, PWA)
// =============================================================================
// Voir service-worker.js à la racine du site. Module partagé, chargé par
// toutes les pages. Ignoré :
// - en file:// (ouverture directe du fichier) : les service workers n'y
//   existent pas ;
// - dans l'APK Android (Capacitor) : tous les fichiers sont déjà embarqués
//   dans l'application, un cache supplémentaire n'apporterait rien.
if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol) && !window.Capacitor) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(err => {
      // Pas bloquant : l'app fonctionne normalement en ligne sans service worker.
      console.warn("Service worker non enregistré :", err);
    });
  });
}
