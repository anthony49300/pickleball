"use strict";

// =============================================================================
// MODE TOURNOI — INITIALISATION
// =============================================================================

// Forcer la sauvegarde instantanée avant toute fermeture/rechargement de la page.
window.addEventListener("beforeunload", () => {
  autoSaveTournamentState();
});

window.addEventListener("DOMContentLoaded", () => {
  renderImportGroupOptions();
  renderTournamentHistory();

  // Lien de partage (?d=...) prioritaire sur l'autosave, même principe que
  // le mode Rotation (voir js/app/init.js) : un tournoi ouvert via un lien
  // partagé écrase ce qui était éventuellement déjà en cours sur cet appareil.
  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("d");

  if (sharedData) {
    try {
      const jsonString = LZString.decompressFromEncodedURIComponent(sharedData);
      applyTournamentState(JSON.parse(jsonString));
      autoSaveTournamentState();
    } catch (e) {
      console.error(e);
      alertModal("Lien de partage invalide ou corrompu.", { title: "Lien invalide", icon: "⚠️" });
      loadTournamentState();
    }
  } else {
    loadTournamentState();
  }

  updateTeamCountBadge();
});
