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
//
// Mise à jour : la page est servie depuis le cache, donc une nouvelle version
// publiée n'apparaissait qu'au 2e rechargement. Quand une nouvelle version du
// service worker prend la main (il s'installe en arrière-plan puis s'active
// aussitôt, voir skipWaiting/clients.claim dans service-worker.js), une
// bannière propose de recharger. La page n'est JAMAIS rechargée toute seule
// (une saisie de scores peut être en cours) : c'est l'utilisateur qui choisit.
if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol) && !window.Capacitor) {
  // Déjà contrôlée au chargement ? Sinon, la première prise de contrôle est
  // la toute première installation (première visite), pas une mise à jour.
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) showUpdateBanner();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then(registration => {
      // Retour au premier plan (app restée ouverte longtemps, onglet en
      // arrière-plan) : on vérifie s'il y a une nouvelle version.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          registration.update().catch(() => {});
        }
      });
    }).catch(err => {
      // Pas bloquant : l'app fonctionne normalement en ligne sans service worker.
      console.warn("Service worker non enregistré :", err);
    });
  });
}

/**
 * Bannière « Nouvelle version disponible » avec un bouton « Recharger »
 * (créée à la volée, une seule fois). « Plus tard » la masque : la nouvelle
 * version s'appliquera alors à la prochaine ouverture de l'app.
 */
function showUpdateBanner() {
  if (document.getElementById("updateBanner")) return;
  const banner = document.createElement("div");
  banner.id = "updateBanner";
  banner.className = "update-banner";
  banner.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = "Nouvelle version disponible";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Recharger";
  reload.addEventListener("click", () => window.location.reload());
  const later = document.createElement("button");
  later.type = "button";
  later.className = "secondary";
  later.textContent = "Plus tard";
  later.addEventListener("click", () => banner.remove());

  banner.append(text, reload, later);
  document.body.append(banner);
}
