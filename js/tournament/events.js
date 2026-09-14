"use strict";

// =============================================================================
// MODE TOURNOI — EVENEMENTS
// =============================================================================

function clearTeamsMessages() {
  if (elTeamsWarning) { elTeamsWarning.hidden = true; elTeamsWarning.textContent = ""; }
  if (elTeamsError) { elTeamsError.hidden = true; elTeamsError.textContent = ""; }
}

/**
 * Le tournoi actuel a-t-il déjà au moins un score saisi ? Sert à avertir avant
 * de régénérer les poules et perdre ces scores.
 */
function tournamentHasAnyScore(tournament) {
  if (!tournament) return false;
  return tournament.pools.some(pool =>
    Object.values(pool.scores).some(s => s && (s.a != null || s.b != null))
  );
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
  const courtNames = parseCourtNames(elCourtNames.value);
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: mode, courtNames, pools };

  elManualAssignSection.hidden = true;
  renderPools(pools, courtNames);
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
  const courtNames = parseCourtNames(elCourtNames.value);
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: "manual", courtNames, pools };

  elManualAssignSection.hidden = true;
  renderPools(pools, courtNames);
  renderPoolStandings(pools, qualifiersPerPool);
  elPoolsSection.hidden = false;
  elPoolStandingsSection.hidden = false;
  autoSaveTournamentState();
});

// --------------------------------------------------
// NOMS DES TERRAINS (mise à jour à chaud si des poules existent déjà)
// --------------------------------------------------

elCourtNames.addEventListener("input", () => {
  autoSaveTournamentState();
  const tournament = window.__PT_TOURNAMENT__;
  if (!tournament) return;
  tournament.courtNames = parseCourtNames(elCourtNames.value);
  renderPools(tournament.pools, tournament.courtNames);
});

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
