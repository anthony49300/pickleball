"use strict";

// =============================================================================
// INITIALISATION ET SAUVEGARDE ULTIME A LA FERMETURE DE PAGE
// =============================================================================

// Forcer la sauvegarde instantanée avant toute recharge ou fermeture de la page
window.addEventListener("beforeunload", () => {
  autoSaveState();
});

window.addEventListener("DOMContentLoaded", () => {
  if (!elSeed.value) elSeed.value = generateSeed();
  renderHistory();
  renderPlayerGroups();

  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("d");

  if (sharedData) {
    // Retire "?d=..." de l'URL une fois appliqué (sans recharger la page) :
    // sinon, un rechargement ultérieur (accidentel, ou l'onglet restauré par
    // le navigateur) réappliquerait ce même instantané figé au moment du
    // partage, effaçant silencieusement toute la progression faite depuis
    // (déjà pourtant sauvegardée dans pb_autosave entre-temps).
    window.history.replaceState({}, "", window.location.origin + window.location.pathname);

    try {
      const jsonString = LZString.decompressFromEncodedURIComponent(sharedData);
      const state = JSON.parse(jsonString);
      loadState(state);
    } catch (e) {
      console.error(e);
      if (elError) {
        elError.hidden = false;
        elError.textContent = "Lien de partage invalide ou corrompu.";
      }
      renderEmptyState();
    }
  } else {
    const saved = localStorage.getItem("pb_autosave");
    if (saved) {
      try {
        loadState(JSON.parse(saved));
      } catch (e) { 
        console.error("Erreur lecture autosave", e); 
        syncPresenceInputs();
        renderEmptyState();
      }
    } else {
      syncPresenceInputs();
      renderEmptyState();
    }
  }
});
