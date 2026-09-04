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
