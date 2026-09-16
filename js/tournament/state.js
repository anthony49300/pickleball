"use strict";

// =============================================================================
// MODE TOURNOI — SAUVEGARDE ET CHARGEMENT (localStorage)
// =============================================================================
// Clé dédiée, distincte de celles du mode Rotation (pb_autosave, pb_history...)
// pour que les deux modes ne se marchent jamais dessus.
const TOURNAMENT_STORAGE_KEY = "pb_tournament_autosave";

// Icônes du badge de sauvegarde (voir autoSaveTournamentState) : SVG inline,
// même logique que les icônes "œil" (rendu identique partout, currentColor
// suit la couleur du badge — vert en cas de succès, rouge en cas d'erreur).
const ICON_CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_ALERT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
let tournamentSaveBadgePulseTimer = null;

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
 * Sauvegarde l'état courant dans localStorage et met à jour le badge d'en-tête :
 * bref pic d'opacité (.save-badge-pulse, voir styles.css) plutôt qu'un
 * changement d'opacité en dur — un debounce (clearTimeout/setTimeout) évite
 * qu'il clignote à chaque frappe lors d'une saisie rapide. En cas d'échec
 * (localStorage indisponible), le badge reste affiché en rouge tant que le
 * problème persiste (pas d'auto-masquage, contrairement au succès).
 */
function autoSaveTournamentState() {
  try {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(getTournamentState()));
    if (elAutosaveBadge) {
      elAutosaveBadge.classList.remove("save-badge-error");
      elAutosaveBadge.innerHTML = `${ICON_CHECK_SVG}<span>Sauvegardé</span>`;
      elAutosaveBadge.classList.add("save-badge-pulse");
      clearTimeout(tournamentSaveBadgePulseTimer);
      tournamentSaveBadgePulseTimer = setTimeout(() => {
        elAutosaveBadge.classList.remove("save-badge-pulse");
      }, 900);
    }
  } catch (e) {
    if (elAutosaveBadge) {
      clearTimeout(tournamentSaveBadgePulseTimer);
      elAutosaveBadge.classList.remove("save-badge-pulse");
      elAutosaveBadge.classList.add("save-badge-error");
      elAutosaveBadge.innerHTML = `${ICON_ALERT_SVG}<span>Sauvegarde impossible</span>`;
    }
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
    // Compatibilité avec un tournoi sauvegardé avant l'introduction des forfaits.
    if (!state.tournament.forfeitedTeamIds) state.tournament.forfeitedTeamIds = [];
    // Compatibilité avec un tournoi sauvegardé avant l'introduction du
    // masquage manuel des poules/matchs.
    if (!state.tournament.hiddenPoolIndices) state.tournament.hiddenPoolIndices = [];
    if (!state.tournament.hiddenMatchKeys) state.tournament.hiddenMatchKeys = [];

    renderPools(
      state.tournament.pools,
      state.tournament.courtNames || [],
      state.tournament.courtAllocation,
      state.tournament.hiddenPoolIndices,
      new Set(state.tournament.hiddenMatchKeys)
    );
    renderPoolStandings(state.tournament.pools, state.tournament.qualifiersPerPool, new Set(state.tournament.forfeitedTeamIds));
    elPoolsSection.hidden = false;
    elPoolStandingsSection.hidden = false;

    renderBothBracketPhases(state.tournament);
    renderFinalRanking(state.tournament);
    renderTournamentProgress(state.tournament);
  }
}
