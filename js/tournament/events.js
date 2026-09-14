"use strict";

// =============================================================================
// MODE TOURNOI — EVENEMENTS
// =============================================================================

function clearTeamsMessages() {
  if (elTeamsWarning) { elTeamsWarning.hidden = true; elTeamsWarning.textContent = ""; }
  if (elTeamsError) { elTeamsError.hidden = true; elTeamsError.textContent = ""; }
}

/**
 * La phase finale a-t-elle déjà une progression (au moins un tour joué, ou
 * un score en cours de saisie) ? Sert à avertir avant de l'écraser.
 */
function finalPhaseHasAnyProgress(finalPhase) {
  if (!finalPhase) return false;
  if (finalPhase.rounds.length > 0) return true;
  return finalPhase.segments.some(s => Object.keys(s.scores).length > 0);
}

/**
 * Le tournoi actuel a-t-il déjà une progression (score de poule, de phase
 * finale ou de matchs de classement) ? Sert à avertir avant de régénérer les
 * poules et tout perdre.
 */
function tournamentHasAnyScore(tournament) {
  if (!tournament) return false;
  const poolsHaveScores = tournament.pools.some(pool =>
    Object.values(pool.scores).some(s => s && (s.a != null || s.b != null))
  );
  if (poolsHaveScores) return true;
  return finalPhaseHasAnyProgress(tournament.finalPhase) || finalPhaseHasAnyProgress(tournament.consolationPhase);
}

// --------------------------------------------------
// SAISIE DES EQUIPES
// --------------------------------------------------

elTeams.addEventListener("input", () => {
  clearTeamsMessages();
  updateTeamCountBadge();
  autoSaveTournamentState();
});

btnImportGroup.addEventListener("click", async () => {
  const groupId = elImportGroupSelect.value;
  if (!groupId) return;

  let groups = [];
  try {
    groups = JSON.parse(localStorage.getItem("pb_player_groups") || "[]");
  } catch {
    groups = [];
  }
  const group = groups.find(g => String(g.id) === String(groupId));
  if (!group || !group.players || !group.players.length) return;

  const players = group.players;
  const lines = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    lines.push(`${players[i]} & ${players[i + 1]}`);
  }
  const leftover = players.length % 2 === 1 ? players[players.length - 1] : null;

  const doImport = async () => {
    elTeams.value = lines.join("\n");
    clearTeamsMessages();
    updateTeamCountBadge();
    autoSaveTournamentState();
    if (leftover) {
      await alertModal(
        `"${leftover}" n'a pas pu être associé(e) (nombre impair de joueurs dans le groupe) : ajoutez-le/la manuellement à une équipe si besoin.`,
        { title: "Import partiel", icon: "⚠️" }
      );
    }
  };

  if (elTeams.value.trim()) {
    const confirmed = await confirmModal(
      "Cela remplacera les équipes actuellement saisies. Continuer ?",
      { title: "Remplacer les équipes ?", confirmText: "Remplacer", icon: "📥" }
    );
    if (!confirmed) return;
  }
  await doImport();
});

btnFormPairs.addEventListener("click", async () => {
  const { players, duplicatePlayers } = parsePlayerList(elIndividualPlayers.value);

  if (players.length < 2) {
    await alertModal("Saisissez au moins 2 joueurs à associer.", { title: "Liste trop courte", icon: "⚠️" });
    return;
  }

  if (elTeams.value.trim()) {
    const confirmed = await confirmModal(
      "Cela remplacera les équipes actuellement saisies. Continuer ?",
      { title: "Remplacer les équipes ?", confirmText: "Remplacer", icon: "🎲" }
    );
    if (!confirmed) return;
  }

  const { pairs, leftover } = autoPairPlayers(players);
  elTeams.value = pairs.map(([a, b]) => `${a} & ${b}`).join("\n");
  clearTeamsMessages();
  updateTeamCountBadge();
  autoSaveTournamentState();

  if (duplicatePlayers.length) {
    await alertModal(
      `Nom(s) en double dans la liste (avant association) : ${duplicatePlayers.join(", ")}. Vérifiez qu'il ne s'agit pas d'une erreur de saisie.`,
      { title: "Doublon détecté", icon: "⚠️" }
    );
  }
  if (leftover) {
    await alertModal(
      `"${leftover}" n'a pas pu être associé(e) (nombre impair de joueurs) : ajoutez-le/la manuellement à une équipe si besoin.`,
      { title: "Association partielle", icon: "⚠️" }
    );
  }
});

// --------------------------------------------------
// GENERATION DES POULES
// --------------------------------------------------

btnGeneratePools.addEventListener("click", async () => {
  clearTeamsMessages();

  const { teams, invalidLines, duplicatePlayers } = parseTeams(elTeams.value);

  const warnings = [];
  if (invalidLines.length) {
    warnings.push(`${invalidLines.length} ligne(s) ignorée(s) (format attendu : "Joueur A & Joueur B") : ${invalidLines.join(" / ")}`);
  }
  if (duplicatePlayers.length) {
    warnings.push(`Joueur(s) présent(s) dans plusieurs équipes : ${duplicatePlayers.join(", ")}.`);
  }
  if (warnings.length) {
    elTeamsWarning.hidden = false;
    elTeamsWarning.textContent = warnings.join(" ");
  }

  if (teams.length < 2) {
    elTeamsError.hidden = false;
    elTeamsError.textContent = "Il faut au moins 2 équipes valides pour générer des poules.";
    return;
  }

  const numPools = Math.max(1, parseInt(elNumPools.value || "1", 10));
  const qualifiersPerPool = Math.max(1, parseInt(elQualifiersPerPool.value || "1", 10));
  const mode = elPoolAssignMode.value;

  if (numPools > teams.length) {
    elTeamsError.hidden = false;
    elTeamsError.textContent = `${numPools} poules demandées, mais seulement ${teams.length} équipe(s) au total.`;
    return;
  }

  if (tournamentHasAnyScore(window.__PT_TOURNAMENT__)) {
    const confirmed = await confirmModal(
      "Des scores sont déjà saisis pour ce tournoi. Régénérer les poules maintenant les effacera. Continuer ?",
      { title: "Régénérer les poules ?", confirmText: "Régénérer", icon: "⚠️" }
    );
    if (!confirmed) return;
  }

  if (mode === "manual") {
    const defaultPools = dealRoundRobinIntoPools(teams, numPools);
    const assignment = {};
    defaultPools.forEach((poolTeams, poolIdx) => {
      poolTeams.forEach(team => { assignment[team.id] = poolIdx; });
    });
    window.__PT_MANUAL_ASSIGNMENT__ = assignment;

    renderManualAssignList(teams, numPools, assignment);
    elManualAssignSection.hidden = false;
    elPoolsSection.hidden = true;
    elPoolStandingsSection.hidden = true;
    elManualAssignSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const pools = buildPools(teams, numPools, mode, null);
  const numCourts = Math.max(1, parseInt(elNumCourts.value || "1", 10));
  const courtNames = parseCourtNames(elCourtNames.value);
  const courtAllocation = allocateCourtsToPools(pools, numCourts);
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: mode, numCourts, courtNames, courtAllocation, pools };

  elManualAssignSection.hidden = true;
  renderPools(pools, courtNames, courtAllocation);
  renderPoolStandings(pools, qualifiersPerPool);
  elPoolsSection.hidden = false;
  elPoolStandingsSection.hidden = false;
  autoSaveTournamentState();
});

// --------------------------------------------------
// REPARTITION MANUELLE
// --------------------------------------------------

btnConfirmManualAssign.addEventListener("click", () => {
  const { teams } = parseTeams(elTeams.value);
  const numPools = Math.max(1, parseInt(elNumPools.value || "1", 10));
  const qualifiersPerPool = Math.max(1, parseInt(elQualifiersPerPool.value || "1", 10));

  const manualPoolIndexByTeamId = {};
  elManualAssignList.querySelectorAll(".manual-pool-select").forEach(select => {
    const teamId = parseInt(select.dataset.teamId, 10);
    manualPoolIndexByTeamId[teamId] = parseInt(select.value, 10) || 0;
  });

  const pools = buildPools(teams, numPools, "manual", manualPoolIndexByTeamId);
  const numCourts = Math.max(1, parseInt(elNumCourts.value || "1", 10));
  const courtNames = parseCourtNames(elCourtNames.value);
  const courtAllocation = allocateCourtsToPools(pools, numCourts);
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: "manual", numCourts, courtNames, courtAllocation, pools };

  elManualAssignSection.hidden = true;
  renderPools(pools, courtNames, courtAllocation);
  renderPoolStandings(pools, qualifiersPerPool);
  elPoolsSection.hidden = false;
  elPoolStandingsSection.hidden = false;
  autoSaveTournamentState();
});

// --------------------------------------------------
// TERRAINS (mise à jour à chaud si des poules existent déjà, sans jamais
// toucher aux matchs/scores déjà saisis — seul l'étiquetage change)
// --------------------------------------------------

function refreshCourtsOnExistingTournament() {
  autoSaveTournamentState();
  const tournament = window.__PT_TOURNAMENT__;
  if (!tournament) return;

  tournament.numCourts = Math.max(1, parseInt(elNumCourts.value || "1", 10));
  tournament.courtNames = parseCourtNames(elCourtNames.value);
  tournament.courtAllocation = allocateCourtsToPools(tournament.pools, tournament.numCourts);
  renderPools(tournament.pools, tournament.courtNames, tournament.courtAllocation);
}

elCourtNames.addEventListener("input", refreshCourtsOnExistingTournament);
elNumCourts.addEventListener("input", refreshCourtsOnExistingTournament);

// --------------------------------------------------
// SAISIE DES SCORES DE POULE (délégation d'événement)
// --------------------------------------------------

elPoolsContainer.addEventListener("input", (e) => {
  if (!e.target.classList.contains("score-input")) return;

  const tournament = window.__PT_TOURNAMENT__;
  if (!tournament) return;

  const poolIdx = parseInt(e.target.dataset.pool, 10);
  const roundIdx = e.target.dataset.round;
  const matchIdx = e.target.dataset.match;
  const side = e.target.dataset.side;
  const val = parseInt(e.target.value, 10);

  const pool = tournament.pools[poolIdx];
  if (!pool) return;

  const key = `${roundIdx}-${matchIdx}`;
  if (!pool.scores[key]) pool.scores[key] = {};
  pool.scores[key][side] = Number.isNaN(val) ? null : val;

  renderPoolStandings(tournament.pools, tournament.qualifiersPerPool);
  autoSaveTournamentState();
});

// --------------------------------------------------
// PHASE FINALE
// --------------------------------------------------

/**
 * Câble le bouton "Générer..." d'un bracket à classement complet (phase
 * finale ou matchs de classement des non-qualifiés — même moteur pour les
 * deux, voir engine.js) : mêmes vérifications, seules la source des équipes,
 * le décalage de classement et le conteneur d'affichage changent.
 */
function wireBracketGenerateButton(button, { phaseKey, getSeededTeams, getRankOffset, notEnoughMessage, container }) {
  button.addEventListener("click", async () => {
    const tournament = window.__PT_TOURNAMENT__;
    if (!tournament) {
      await alertModal("Générez d'abord les poules.", { title: "Poules manquantes", icon: "⚠️" });
      return;
    }

    if (!tournament.pools.every(isPoolComplete)) {
      await alertModal(
        "Tous les matchs de poule doivent être terminés (scores saisis) avant de continuer.",
        { title: "Poules non terminées", icon: "⚠️" }
      );
      return;
    }

    const seeded = getSeededTeams(tournament);
    if (seeded.length < 2) {
      await alertModal(notEnoughMessage, { title: "Pas assez d'équipes", icon: "⚠️" });
      return;
    }

    if (finalPhaseHasAnyProgress(tournament[phaseKey])) {
      const confirmed = await confirmModal(
        "Une progression existe déjà ici. La régénérer l'effacera. Continuer ?",
        { title: "Régénérer ?", confirmText: "Régénérer", icon: "⚠️" }
      );
      if (!confirmed) return;
    }

    tournament[phaseKey] = buildFinalPhase(seeded, getRankOffset(tournament));
    progressFinalPhase(tournament[phaseKey]);

    renderBracketPhase(tournament[phaseKey], container);
    renderFinalRanking(tournament);
    autoSaveTournamentState();
  });
}

/**
 * Délégation d'événement pour la saisie des scores d'un bracket. On ne
 * réaffiche PAS le conteneur à chaque frappe (ça ferait perdre le focus du
 * champ en cours de saisie) : uniquement quand un segment vient réellement
 * de se terminer et de produire de nouveaux segments enfants.
 */
function wireBracketScoreInputs(container, phaseKey) {
  container.addEventListener("input", (e) => {
    if (!e.target.classList.contains("bracket-score-input") || e.target.readOnly) return;

    const tournament = window.__PT_TOURNAMENT__;
    const phase = tournament?.[phaseKey];
    if (!phase) return;

    const segmentId = e.target.dataset.segment;
    const matchIdx = e.target.dataset.match;
    const side = e.target.dataset.side;
    const val = parseInt(e.target.value, 10);

    const segment = phase.segments.find(s => s.id === segmentId);
    if (!segment) return;

    if (!segment.scores[matchIdx]) segment.scores[matchIdx] = {};
    segment.scores[matchIdx][side] = Number.isNaN(val) ? null : val;

    const roundsBefore = phase.rounds.length;
    progressFinalPhase(phase);

    if (phase.rounds.length !== roundsBefore) {
      renderBracketPhase(phase, container);
    }
    renderFinalRanking(tournament);
    autoSaveTournamentState();
  });
}

wireBracketGenerateButton(btnGenerateFinalPhase, {
  phaseKey: "finalPhase",
  getSeededTeams: t => seedQualifiedTeams(t.pools, t.qualifiersPerPool),
  getRankOffset: () => 0,
  notEnoughMessage: "Il faut au moins 2 équipes qualifiées pour lancer une phase finale.",
  container: elFinalPhaseContainer
});

wireBracketGenerateButton(btnGenerateConsolationPhase, {
  phaseKey: "consolationPhase",
  getSeededTeams: t => seedNonQualifiedTeams(t.pools, t.qualifiersPerPool),
  getRankOffset: t => seedQualifiedTeams(t.pools, t.qualifiersPerPool).length,
  notEnoughMessage: "Il faut au moins 2 équipes non qualifiées pour générer des matchs de classement.",
  container: elConsolationPhaseContainer
});

wireBracketScoreInputs(elFinalPhaseContainer, "finalPhase");
wireBracketScoreInputs(elConsolationPhaseContainer, "consolationPhase");
