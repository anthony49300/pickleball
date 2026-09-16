"use strict"; // Chaque <script> classique a son propre mode strict : on le réactive dans chaque fichier.

// =============================================================================
// MODE TOURNOI — ELEMENTS DU DOM
// =============================================================================

const elTeams = document.getElementById("teams");
const elTeamCountBadge = document.getElementById("teamCountBadge");
const elImportGroupSelect = document.getElementById("importGroupSelect");
const btnImportGroup = document.getElementById("importGroupBtn");
const elIndividualPlayers = document.getElementById("individualPlayers");
const btnFormPairs = document.getElementById("formPairsBtn");
const elTeamsWarning = document.getElementById("teamsWarning");
const elTeamsError = document.getElementById("teamsError");

const elNumPools = document.getElementById("numPools");
const elQualifiersPerPool = document.getElementById("qualifiersPerPool");
const elNumCourts = document.getElementById("numCourts");
const elPoolAssignMode = document.getElementById("poolAssignMode");
const elCourtNames = document.getElementById("courtNames");
const btnGeneratePools = document.getElementById("generatePools");

const elManualAssignSection = document.getElementById("manualAssignSection");
const elManualAssignList = document.getElementById("manualAssignList");
const btnConfirmManualAssign = document.getElementById("confirmManualAssign");

const elPoolsSection = document.getElementById("poolsSection");
const elPoolsContainer = document.getElementById("poolsContainer");

const elPoolStandingsSection = document.getElementById("poolStandingsSection");
const elPoolStandingsContainer = document.getElementById("poolStandingsContainer");

const btnGenerateFinalPhase = document.getElementById("generateFinalPhase");
const elFinalPhaseContainer = document.getElementById("finalPhaseContainer");

const btnGenerateConsolationPhase = document.getElementById("generateConsolationPhase");
const elConsolationPhaseContainer = document.getElementById("consolationPhaseContainer");

const elFinalRankingSection = document.getElementById("finalRankingSection");
const elFinalRankingContainer = document.getElementById("finalRankingContainer");
const btnExportFinalRankingPng = document.getElementById("exportFinalRankingPng");

const elAutosaveBadge = document.getElementById("autosaveBadge");
const elTournamentProgress = document.getElementById("tournamentProgress");
const elNextMatchesSection = document.getElementById("nextMatchesSection");
const elNextMatchesContainer = document.getElementById("nextMatchesContainer");
const btnScrollToActive = document.getElementById("scrollToActiveBtn");
const btnCopyTournamentLink = document.getElementById("copyTournamentLink");

const elTournamentHistoryList = document.getElementById("tournamentHistoryList");
const btnSaveTournamentToHistory = document.getElementById("saveTournamentToHistory");
const btnClearTournamentHistory = document.getElementById("clearTournamentHistoryBtn");

// Etat en mémoire de la répartition manuelle en cours (avant validation), et du
// tournoi une fois les poules générées. Voir js/tournament/state.js pour la
// sauvegarde/le chargement, et js/tournament/engine.js pour la structure exacte.
window.__PT_TEAMS__ = [];
window.__PT_MANUAL_ASSIGNMENT__ = null;
window.__PT_TOURNAMENT__ = null;
