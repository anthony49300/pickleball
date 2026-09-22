"use strict";

// =============================================================================
// MODE TOURNOI — SAUVEGARDE ET CHARGEMENT (localStorage)
// =============================================================================
// Clés dédiées, distinctes de celles du mode Rotation (pb_autosave, pb_history...)
// pour que les deux modes ne se marchent jamais dessus.
const TOURNAMENT_STORAGE_KEY = "pb_tournament_autosave";
const TOURNAMENT_HISTORY_KEY = "pb_tournament_history";

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
 * Applique un état complet (formulaire + poules déjà générées, le cas
 * échéant) : utilisé aussi bien pour recharger l'autosave au démarrage que
 * pour charger un tournoi depuis l'historique (voir loadTournamentState et
 * la section HISTORIQUE DES TOURNOIS plus bas).
 * @param {Object} state - voir getTournamentState pour la forme exacte
 */
function applyTournamentState(state) {
  if (!state) return;

  if (state.teamsText != null) elTeams.value = state.teamsText;
  if (state.individualPlayersText != null) elIndividualPlayers.value = state.individualPlayersText;
  if (state.numPools != null) elNumPools.value = state.numPools;
  if (state.qualifiersPerPool != null) elQualifiersPerPool.value = state.qualifiersPerPool;
  if (state.numCourts != null) elNumCourts.value = state.numCourts;
  if (state.poolAssignMode != null) elPoolAssignMode.value = state.poolAssignMode;
  if (state.courtNamesText != null) elCourtNames.value = state.courtNamesText;

  window.__PT_TOURNAMENT__ = state.tournament || null;

  if (state.tournament) {
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
  } else {
    // Etat sans tournoi généré (ex : historique sauvegardé pendant la seule
    // saisie des équipes) : on repart d'un affichage propre plutôt que de
    // garder à l'écran les poules du tournoi précédemment chargé.
    renderPools([], [], []);
    renderPoolStandings([], 1);
    elPoolsSection.hidden = true;
    elPoolStandingsSection.hidden = true;
  }

  renderBothBracketPhases(state.tournament || {});
  renderFinalRanking(state.tournament || {});
  renderTournamentProgress(state.tournament);
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
  applyTournamentState(state);
}

// =============================================================================
// HISTORIQUE DES TOURNOIS (sauvegarde manuelle, distincte de l'autosave —
// même principe que "Historique des sessions" en mode Rotation, voir
// js/app/history-and-events.js)
// =============================================================================

function getTournamentHistory() {
  try {
    return JSON.parse(localStorage.getItem(TOURNAMENT_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Enregistre l'état courant dans l'historique des tournois. Un tournoi déjà
 * enregistré une fois (même tournamentId — attribué à la génération des
 * poules) met à jour son entrée existante au lieu d'en créer une nouvelle à
 * chaque clic, comme l'historique de sessions du mode Rotation (qui, lui,
 * utilise la seed comme identifiant stable).
 * @returns {boolean} false si aucun tournoi n'est en cours (rien à enregistrer)
 */
function saveTournamentToHistory() {
  const tournament = window.__PT_TOURNAMENT__;
  if (!tournament) return false;

  // Compatibilité : un tournoi généré avant l'introduction de tournamentId
  // en reçoit un à la volée, pour que les sauvegardes suivantes le retrouvent.
  if (!tournament.tournamentId) tournament.tournamentId = Date.now();

  const history = getTournamentHistory();
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const existingIndex = history.findIndex(item => item.tournamentId === tournament.tournamentId);

  const newItem = {
    id: existingIndex !== -1 ? history[existingIndex].id : Date.now(),
    tournamentId: tournament.tournamentId,
    date: dateStr,
    teamsCount: tournament.teams?.length || 0,
    numPools: tournament.numPools || 1,
    state: getTournamentState()
  };

  if (existingIndex !== -1) history.splice(existingIndex, 1);

  history.unshift(newItem);
  const trimmedHistory = history.slice(0, 20);
  localStorage.setItem(TOURNAMENT_HISTORY_KEY, JSON.stringify(trimmedHistory));
  renderTournamentHistory(trimmedHistory);
  return true;
}

/**
 * @param {Array} [history] - déjà en mémoire chez l'appelant (sauvegarde,
 *   suppression) ? On lui évite un aller-retour localStorage.getItem +
 *   JSON.parse inutile en le passant directement, plutôt que de le relire.
 */
function renderTournamentHistory(history = getTournamentHistory()) {
  if (!elTournamentHistoryList) return;
  if (!history.length) {
    elTournamentHistoryList.innerHTML = `<p class="subtle">Aucun tournoi enregistré pour le&nbsp;moment.</p>`;
    return;
  }

  elTournamentHistoryList.innerHTML = history.map(item => `
    <div class="history-card">
      <div>
        <h4>${escapeHtml(item.date)}</h4>
        <div class="subtle" style="font-size: 0.8rem; margin-top: 4px;">
          ⚔️ ${item.teamsCount} équipe${item.teamsCount > 1 ? "s" : ""} · 👥 ${item.numPools} poule${item.numPools > 1 ? "s" : ""}
        </div>
      </div>
      <div class="history-actions">
        <button class="secondary load-tournament-hist-btn" data-id="${item.id}">Charger</button>
        <button class="secondary del-tournament-hist-btn" data-id="${item.id}" style="color: var(--danger);">Supprimer</button>
      </div>
    </div>
  `).join("");
}
