"use strict";

// =============================================================================
// MODE TOURNOI — SAUVEGARDE ET CHARGEMENT (localStorage)
// =============================================================================
// Clé dédiée, distincte de celles du mode Rotation (pb_autosave, pb_history...)
// pour que les deux modes ne se marchent jamais dessus.
const TOURNAMENT_STORAGE_KEY = "pb_tournament_autosave";

/**
 * Capture l'intégralité de l'état courant du tournoi (formulaire + poules
 * générées, si elles existent).
 */
function getTournamentState() {
  return {
    teamsText: elTeams.value,
    individualPlayersText: elIndividualPlayers.value,
    numPools: elNumPools.value,
    qualifiersPerPool: elQualifiersPerPool.value,
    numCourts: elNumCourts.value,
    poolAssignMode: elPoolAssignMode.value,
    courtNamesText: elCourtNames.value,
    tournament: window.__PT_TOURNAMENT__
  };
}

/**
 * Sauvegarde l'état courant dans localStorage et met à jour le badge d'en-tête.
 */
function autoSaveTournamentState() {
  try {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(getTournamentState()));
    if (elAutosaveBadge) {
      elAutosaveBadge.textContent = "💾 Sauvegardé";
      elAutosaveBadge.style.opacity = "1";
    }
  } catch (e) {
    if (elAutosaveBadge) elAutosaveBadge.textContent = "⚠️ Sauvegarde impossible";
  }
}

/**
 * Recharge l'état sauvegardé (s'il existe) au chargement de la page : formulaire
 * et, le cas échéant, poules déjà générées avec leurs scores.
 */
function loadTournamentState() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(TOURNAMENT_STORAGE_KEY) || "null");
  } catch {
    state = null;
  }
  if (!state) return;

  if (state.teamsText != null) elTeams.value = state.teamsText;
  if (state.individualPlayersText != null) elIndividualPlayers.value = state.individualPlayersText;
  if (state.numPools != null) elNumPools.value = state.numPools;
  if (state.qualifiersPerPool != null) elQualifiersPerPool.value = state.qualifiersPerPool;
  if (state.numCourts != null) elNumCourts.value = state.numCourts;
  if (state.poolAssignMode != null) elPoolAssignMode.value = state.poolAssignMode;
  if (state.courtNamesText != null) elCourtNames.value = state.courtNamesText;

  if (state.tournament) {
    window.__PT_TOURNAMENT__ = state.tournament;
    // Compatibilité avec un tournoi sauvegardé avant l'introduction de
    // l'allocation de terrains par poule : on la calcule si elle manque.
    if (!state.tournament.courtAllocation) {
      state.tournament.courtAllocation = allocateCourtsToPools(state.tournament.pools, state.tournament.numCourts || 1);
    }
    renderPools(state.tournament.pools, state.tournament.courtNames || [], state.tournament.courtAllocation);
    renderPoolStandings(state.tournament.pools, state.tournament.qualifiersPerPool);
    elPoolsSection.hidden = false;
    elPoolStandingsSection.hidden = false;

    if (state.tournament.finalPhase) {
      renderBracketPhase(state.tournament.finalPhase, elFinalPhaseContainer);
    }
    if (state.tournament.consolationPhase) {
      renderBracketPhase(state.tournament.consolationPhase, elConsolationPhaseContainer);
    }
    renderFinalRanking(state.tournament);
  }
}
