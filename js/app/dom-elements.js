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
const btnThemeToggle = document.getElementById("themeToggleBtn");
const elMetaThemeColor = document.getElementById("metaThemeColor");

const elSchedule = document.getElementById("schedule");
const elSessionStepper = document.getElementById("sessionStepper");
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

const elModalOverlay = document.getElementById("modalOverlay");
const elModalIcon = document.getElementById("modalIcon");
const elModalTitle = document.getElementById("modalTitle");
const elModalMessage = document.getElementById("modalMessage");
const elModalCopyArea = document.getElementById("modalCopyArea");
const elModalCopyInput = document.getElementById("modalCopyInput");
const elModalImageArea = document.getElementById("modalImageArea");
const elModalImagePreview = document.getElementById("modalImagePreview");
const btnModalCancel = document.getElementById("modalCancelBtn");
const btnModalDownload = document.getElementById("modalDownloadBtn");
const btnModalConfirm = document.getElementById("modalConfirmBtn");

// Variables globales de mémoire
window.__PB_SCORES__ = {};
window.__PB_PRESENCE__ = {};
let currentHeatmapMode = "teammates";


// =============================================================================
// CONTROLES UI MODERNISES : STEPPERS (TERRAINS/TOURS) & SLIDERS (ALGORITHME)
// =============================================================================

/**
 * Câble les boutons +/- des steppers numériques (Terrains, Tours).
 * Redispatche "input"/"change" pour que les listeners existants (autosave, présence…)
 * continuent de fonctionner normalement.
 */
document.querySelectorAll(".stepper-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrapper = btn.closest(".stepper");
    const input = wrapper?.querySelector("input[type='number']");
    if (!input) return;

    const step = parseInt(btn.dataset.step, 10) || 0;
    const min = parseInt(wrapper.dataset.min ?? input.min, 10);
    const max = parseInt(wrapper.dataset.max ?? input.max, 10);
    const current = parseInt(input.value, 10) || 0;
    const next = Math.min(
      Number.isNaN(max) ? Infinity : max,
      Math.max(Number.isNaN(min) ? -Infinity : min, current + step)
    );

    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

/**
 * Affiche et met à jour en direct la valeur numérique à côté de chaque slider.
 */
document.querySelectorAll(".slider-field input[type='range']").forEach(range => {
  const output = range.parentElement.querySelector(".slider-value");
  if (!output) return;
  const syncValue = () => { output.textContent = range.value; };
  syncValue();
  range.addEventListener("input", syncValue);
});


