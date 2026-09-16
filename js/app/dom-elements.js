"use strict"; // Chaque <script> classique a son propre mode strict : on le réactive dans chaque fichier.

// =============================================================================
// IHM & ELEMENTS DU DOM
// =============================================================================

const elPlayers = document.getElementById("players");
const elCourts = document.getElementById("courts");
const elRounds = document.getElementById("rounds");
const elSeed = document.getElementById("seed");
const elCourtNames = document.getElementById("courtNames");

const elwT = document.getElementById("wT");
const elwO = document.getElementById("wO");
const elwP = document.getElementById("wP");
const elBeamWidth = document.getElementById("beamWidth");
const elPartnerK = document.getElementById("partnerK");
const elSquare = document.getElementById("squareRepeats");
const elAvoidB2B = document.getElementById("avoidB2B");

const btnGenerate = document.getElementById("generate");
const btnCopy = document.getElementById("copy");
const btnCopyLink = document.getElementById("copyLink");
const btnSaveToHistory = document.getElementById("saveToHistory");
const btnNewSeed = document.getElementById("newSeed");

const elSchedule = document.getElementById("schedule");
const elSessionStepper = document.getElementById("sessionStepper");
const btnScrollToActive = document.getElementById("scrollToActiveBtn");
const elDiag = document.getElementById("diagnostics");
const elDiagSection = document.getElementById("diagnosticsSection") || (elDiag ? elDiag.closest("section") || elDiag.parentElement : null);
const elWarning = document.getElementById("warning");
const elError = document.getElementById("error");
const elMeta = document.getElementById("meta");

const elRankingSection = document.getElementById("rankingSection");
const elRankingTableBody = document.querySelector("#rankingTable tbody");
const elPodiumContainer = document.getElementById("podiumContainer");
const elBadgesContainer = document.getElementById("badgesContainer");
const btnExportPng = document.getElementById("exportRankingsPng");
const btnCopyRankingLink = document.getElementById("copyRankingLink");

const elHeatmapSection = document.getElementById("heatmapSection");
const elHeatmapContainer = document.getElementById("heatmapTableContainer");
const btnHmModeTeammates = document.getElementById("hmModeTeammates");
const btnHmModeOpponents = document.getElementById("hmModeOpponents");

const elPresenceList = document.getElementById("presenceList");
const elAutosaveBadge = document.getElementById("autosaveBadge");
const elHistoryList = document.getElementById("historyList");
const btnClearHistory = document.getElementById("clearHistoryBtn");
const btnResetAll = document.getElementById("resetAllBtn");

const elPlayerGroupsList = document.getElementById("playerGroupsList");
const elNewGroupName = document.getElementById("newGroupName");
const btnSavePlayerGroup = document.getElementById("savePlayerGroupBtn");

// Les références DOM de la modale générique et du bouton de thème sont
// désormais dans js/shared/modal.js et js/shared/theme.js (modules partagés
// avec les autres pages du site, chargés avant celui-ci — voir index.html).

// Variables globales de mémoire
window.__PB_SCORES__ = {};
window.__PB_PRESENCE__ = {};
// Index (0-based) des tours repliés manuellement par l'utilisateur (bouton
// "Masquer" dans l'en-tête de chaque tour) — purement visuel, les scores
// restent enregistrés normalement. Voir render() dans form-and-render.js.
window.__PB_HIDDEN_ROUNDS__ = [];
let currentHeatmapMode = "teammates";

// Le câblage des steppers numériques (+/-) et des sliders est dans
// js/shared/ui-controls.js (module partagé avec les autres pages du site).

