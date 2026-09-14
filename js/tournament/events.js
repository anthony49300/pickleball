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

// --------------------------------------------------
// GENERATION DES POULES
// --------------------------------------------------

btnGeneratePools.addEventListener("click", async () => {
  clearTeamsMessages();

  const { teams, invalidLines } = parseTeams(elTeams.value);

  if (invalidLines.length) {
    elTeamsWarning.hidden = false;
    elTeamsWarning.textContent = `${invalidLines.length} ligne(s) ignorée(s) (format attendu : "Joueur A & Joueur B") : ${invalidLines.join(" / ")}`;
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
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: mode, pools };

  elManualAssignSection.hidden = true;
  renderPools(pools);
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
  window.__PT_TOURNAMENT__ = { teams, numPools, qualifiersPerPool, poolAssignMode: "manual", pools };

  elManualAssignSection.hidden = true;
  renderPools(pools);
  renderPoolStandings(pools, qualifiersPerPool);
  elPoolsSection.hidden = false;
  elPoolStandingsSection.hidden = false;
  autoSaveTournamentState();
});

// --------------------------------------------------
// SAISIE DES SCORES DE POULE (délégation d'événement)
// --------------------------------------------------

elPoolsContainer.addEventListener("input", (e) => {
  if (!e.target.classList.contains("pool-score-input")) return;

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
