"use strict";

// =============================================================================
// MODE TOURNOI — NAVIGATION : PHASES DE L'ÉCRAN JOUER, BADGES, TOURNOI EN COURS
// =============================================================================
// Les écrans, les onglets et les menus sont gérés par js/shared/shell.js
// (commun avec le mode Rotation). Ici : ce qui est propre au Tournoi.
//
// L'écran Jouer affiche une phase à la fois (Poules, Phase finale, Classement
// des non-qualifiés), choisie par des onglets. Chaque onglet indique le nombre
// de matchs qui restent à jouer dans sa phase.

const STAGES = ["poules", "finale", "classement"];

const elStageTabs = document.querySelectorAll(".stage-tab");
const elStagePanels = document.querySelectorAll("[data-stage-panel]");
const elTournamentPlayEmpty = document.getElementById("playEmpty");
const elTournamentPlayView = document.getElementById("playView");
const elTournamentTabBadge = document.getElementById("playTabBadge");
const elPoolsDoneCallout = document.getElementById("poolsDoneCallout");
const elTournamentRankingSummary = document.getElementById("rankingSummary");
const elCurrentTournamentCard = document.getElementById("currentTournamentCard");
const elCurrentTournamentProgress = document.getElementById("currentTournamentProgress");
const elCurrentTournamentMeta = document.getElementById("currentTournamentMeta");

let currentStage = "poules";

/** Affiche une phase de l'écran Jouer (sans changer d'écran). */
function setStage(stage) {
  if (!STAGES.includes(stage)) stage = "poules";
  currentStage = stage;
  elStageTabs.forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.stage === stage)));
  elStagePanels.forEach(panel => { panel.hidden = panel.dataset.stagePanel !== stage; });
}

/** Va à l'écran Jouer, sur la phase demandée. */
function goToStage(stage) {
  setStage(stage);
  showScreen("jouer");
}

/**
 * Phase à afficher par défaut : celle où il reste des matchs à jouer, dans
 * l'ordre du tournoi (poules, puis phase finale, puis classement des autres).
 */
function autoStage(tournament) {
  if (!tournament?.pools?.length) return "poules";
  if (!tournament.pools.every(isPoolComplete)) return "poules";
  if (tournament.finalPhase && !tournament.finalPhase.finalRanking) return "finale";
  if (tournament.consolationPhase && !tournament.consolationPhase.finalRanking) return "classement";
  return tournament.finalPhase ? "finale" : "poules";
}

elStageTabs.forEach(tab => tab.addEventListener("click", () => setStage(tab.dataset.stage)));

// Raccourcis vers une phase (ex : "Phase finale →" quand les poules sont finies).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stage-go]");
  if (btn) {
    setStage(btn.dataset.stageGo);
    window.scrollTo(0, 0);
  }
});

// Gagnant, égalité et état du bandeau de chaque carte de match, à la saisie
// (clavier ou boutons −/+). Les listeners de events.js, eux, enregistrent le
// score : ils ne sont pas modifiés.
document.addEventListener("input", (e) => {
  if (e.target.classList?.contains("score-input")) paintScoreCard(e.target.closest(".match-card"));
});

/**
 * Remet à jour tout ce qui dépend de l'avancement du tournoi : écran Jouer
 * vide ou non, compteurs de matchs restants par phase, badge de l'onglet
 * Jouer, encart "Poules terminées", résumé du classement et carte "Tournoi en
 * cours" de l'historique. Appelé par renderTournamentProgress (render.js),
 * donc après chaque changement.
 */
function refreshTournamentNav(tournament) {
  const hasTournament = !!tournament?.pools?.length;
  if (elTournamentPlayEmpty) elTournamentPlayEmpty.hidden = hasTournament;
  if (elTournamentPlayView) elTournamentPlayView.hidden = !hasTournament;

  if (!hasTournament) {
    if (elTournamentTabBadge) elTournamentTabBadge.hidden = true;
    if (elCurrentTournamentCard) elCurrentTournamentCard.hidden = true;
    if (elPoolsDoneCallout) elPoolsDoneCallout.hidden = true;
    if (elTournamentRankingSummary) elTournamentRankingSummary.textContent = "";
    return;
  }

  // Matchs restants par phase (voir collectNextMatches, render.js).
  const remaining = { poules: 0, finale: 0, classement: 0 };
  collectNextMatches(tournament).forEach(item => {
    if (item.source.startsWith("Phase finale")) remaining.finale++;
    else if (item.source.startsWith("Consolante")) remaining.classement++;
    else remaining.poules++;
  });
  document.querySelectorAll("[data-stage-count]").forEach(el => {
    const n = remaining[el.dataset.stageCount];
    el.hidden = !n;
    el.textContent = n ? String(n) : "";
  });
  const total = remaining.poules + remaining.finale + remaining.classement;
  if (elTournamentTabBadge) {
    elTournamentTabBadge.hidden = !total;
    elTournamentTabBadge.textContent = String(total);
  }

  const poolsDone = tournament.pools.every(isPoolComplete);
  if (elPoolsDoneCallout) elPoolsDoneCallout.hidden = !poolsDone || !!tournament.finalPhase;

  const finalDone = !!tournament.finalPhase?.finalRanking;
  const consolationDone = !!tournament.consolationPhase?.finalRanking;
  if (elTournamentRankingSummary) {
    elTournamentRankingSummary.textContent = finalDone && (consolationDone || !tournament.consolationPhase)
      ? "Tournoi terminé"
      : poolsDone ? "Poules terminées, phase finale en cours" : "Phase de poules en cours";
  }

  refreshCurrentTournamentCard(tournament, remaining.poules, poolsDone, finalDone, consolationDone);
}

function refreshCurrentTournamentCard(tournament, poolsRemaining, poolsDone, finalDone, consolationDone) {
  if (!elCurrentTournamentCard) return;
  elCurrentTournamentCard.hidden = false;

  // Avancement : moitié pour les poules (au prorata des matchs joués), un
  // quart pour la phase finale, un quart pour le classement des autres.
  const poolMatches = tournament.pools.reduce((sum, pool) => sum + pool.rounds.flat().filter(m => !m.bye).length, 0);
  const poolShare = poolMatches ? (poolMatches - poolsRemaining) / poolMatches : 1;
  const progress = poolShare * 0.5 + (finalDone ? 0.25 : 0) + (consolationDone ? 0.25 : 0);
  elCurrentTournamentProgress.style.width = `${Math.round(progress * 100)}%`;

  const teams = tournament.teams?.length || 0;
  const stageLabel = finalDone ? "Phase finale terminée" : tournament.finalPhase ? "Phase finale en cours" : poolsDone ? "Poules terminées" : "Poules en cours";
  elCurrentTournamentMeta.innerHTML = `<span><b>${teams}</b> équipes</span><span><b>${tournament.pools.length}</b> poule${tournament.pools.length > 1 ? "s" : ""}</span><span>${stageLabel}</span>`;
}

/**
 * Premier affichage, appelé par init.js une fois l'état restauré : écran de
 * l'URL (#jouer...) s'il y en a un, sinon Jouer si un tournoi est en cours,
 * Préparer sinon ; et la phase où il reste des matchs à jouer.
 */
function initTournamentNavigation() {
  const tournament = window.__PT_TOURNAMENT__;
  setStage(autoStage(tournament));
  showScreen(screenFromHash() || (tournament?.pools?.length ? "jouer" : "preparer"), { scroll: false });
  refreshTournamentNav(tournament);
}
