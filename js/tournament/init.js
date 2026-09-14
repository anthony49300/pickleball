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
  loadTournamentState();
  updateTeamCountBadge();
});
