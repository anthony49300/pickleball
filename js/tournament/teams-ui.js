"use strict";

// =============================================================================
// MODE TOURNOI — LISTE DES ÉQUIPES : PASTILLES + FICHE ÉQUIPE (écran Préparer)
// =============================================================================
// Même principe que la liste de joueurs du mode Rotation (js/app/players-ui.js) :
// le <textarea id="teams"> reste l'unique source de vérité (sauvegarde,
// partage, génération des poules : rien ne change de ce côté). Les pastilles
// n'en sont qu'une vue ; ajouter ou retirer une équipe réécrit le textarea puis
// redéclenche "input", comme une saisie au clavier.
//
// Niveaux d'équipe : window.__PT_TEAM_LEVELS__ est indexé par team.id, c'est-à-
// dire la position de la ligne dans la liste (voir parseTeams, engine.js).
// Retirer une équipe décale donc les lignes suivantes : leurs niveaux sont
// décalés en même temps (voir removeTeamLine).

const elTeamChips = document.getElementById("teamChips");
const elAddTeamRow = document.getElementById("addTeamRow");
const elAddTeamInput = document.getElementById("addTeamInput");
const btnAddTeam = document.getElementById("addTeamBtn");
const btnTeamsTextToggle = document.getElementById("teamsTextToggle");
const elTeamsHint = document.getElementById("teamsHint");
const elTournamentFormatHint = document.getElementById("formatHint");

const elTeamSheet = document.getElementById("teamSheet");
const elTeamSheetTitle = document.getElementById("teamSheetTitle");
const elTeamSheetLevels = document.getElementById("teamSheetLevels");
const elTeamSheetLevelText = document.getElementById("teamSheetLevelText");
const btnTeamSheetRemove = document.getElementById("teamSheetRemove");

let sheetTeamId = null;

/** Lignes non vides de la liste, dans l'ordre (leur index = team.id). */
function teamLines() {
  return elTeams.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function writeTeamLines(lines) {
  elTeams.value = lines.join("\n");
  elTeams.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Rappel sous les compteurs : équipes par poule et qualifiés. */
function updateTournamentFormatHint() {
  if (!elTournamentFormatHint) return;
  const n = parseTeams(elTeams.value).teams.length;
  const pools = Math.max(1, parseInt(elNumPools.value || "1", 10) || 1);
  const qualifiers = Math.max(1, parseInt(elQualifiersPerPool.value || "1", 10) || 1);
  if (n < 2) {
    elTournamentFormatHint.textContent = `Ajoutez au moins 2 équipes (${n} pour l'instant).`;
    return;
  }
  if (pools > n) {
    elTournamentFormatHint.textContent = `${pools} poules pour ${n} équipes : réduisez le nombre de poules.`;
    return;
  }
  const min = Math.floor(n / pools);
  const max = Math.ceil(n / pools);
  const perPool = min === max ? `${min} équipes par poule` : `${min} à ${max} équipes par poule`;
  const qualified = Math.min(n, pools * Math.min(qualifiers, min));
  elTournamentFormatHint.textContent = `${perPool}, ${qualified} qualifiées pour la phase finale.`;
}

function renderTeamChips() {
  updateTournamentFormatHint();
  if (!elTeamChips) return;

  const { teams, invalidLines } = parseTeams(elTeams.value);
  if (!teams.length && !invalidLines.length) {
    elTeamChips.innerHTML = `<p class="hint">Aucune équipe pour l'instant. Tapez deux prénoms séparés par « & », ou formez les équipes automatiquement ci-dessous.</p>`;
    return;
  }

  const chips = teams.map(team => {
    const level = window.__PT_TEAM_LEVELS__[team.id] ?? 3;
    const dots = [1, 2, 3, 4, 5].map(k => `<i class="${k <= level ? "on" : ""}"></i>`).join("");
    const label = `${team.name}, niveau ${level} ${TEAM_LEVEL_LABELS[level] || ""}. Modifier`;
    return `<button type="button" class="chip" data-team-id="${team.id}" aria-label="${escapeHtml(label)}">${escapeHtml(team.name)}<span class="lv" aria-hidden="true">${dots}</span></button>`;
  }).join("");

  // Lignes qui ne forment pas une équipe de 2 : signalées (elles seront
  // ignorées à la génération), à corriger dans la saisie en texte.
  const invalid = invalidLines.map(line =>
    `<span class="chip is-invalid" title="Format attendu : Joueur A & Joueur B">${escapeHtml(line)}<span class="chip-tag">à corriger</span></span>`
  ).join("");

  elTeamChips.innerHTML = chips + invalid;
}

function addTeamsFromInput() {
  const raw = elAddTeamInput.value.trim();
  if (!raw) {
    elAddTeamInput.focus();
    return;
  }
  // Plusieurs équipes collées d'un coup : séparées par des retours à la ligne
  // ou des points-virgules (la virgule sépare déjà les deux joueurs d'une équipe).
  const newLines = raw.split(/\r?\n|;/).map(l => l.trim()).filter(Boolean);
  const { teams } = parseTeams(newLines.join("\n"));
  if (!teams.length) {
    showToast("Format attendu : deux prénoms séparés par « & », par exemple Alice & Bob", 4000);
    return;
  }
  writeTeamLines([...teamLines(), ...teams.map(t => t.name)]);
  elAddTeamInput.value = "";
  elAddTeamInput.focus();
  if (teams.length > 1) showToast(`${teams.length} équipes ajoutées`);
}

if (btnAddTeam) btnAddTeam.addEventListener("click", addTeamsFromInput);
if (elAddTeamInput) {
  elAddTeamInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTeamsFromInput();
    }
  });
}

elNumPools.addEventListener("input", updateTournamentFormatHint);
elQualifiersPerPool.addEventListener("input", updateTournamentFormatHint);

// Bascule pastilles <-> saisie en texte (pratique pour coller ou corriger
// une longue liste d'un coup).
if (btnTeamsTextToggle) {
  btnTeamsTextToggle.addEventListener("click", () => {
    const toText = elTeams.hidden;
    elTeams.hidden = !toText;
    elTeamChips.hidden = toText;
    elAddTeamRow.hidden = toText;
    if (elTeamsHint) elTeamsHint.hidden = toText;
    btnTeamsTextToggle.textContent = toText ? "Vue pastilles" : "Saisie en texte";
    if (toText) elTeams.focus();
    else renderTeamChips();
  });
}

// ---------------------------------------------------------------------------
// Fiche équipe
// ---------------------------------------------------------------------------

function renderTeamSheetLevels() {
  const level = window.__PT_TEAM_LEVELS__[sheetTeamId] ?? 3;
  elTeamSheetLevels.innerHTML = [1, 2, 3, 4, 5].map(k => `
    <button type="button" class="lvl" data-level="${k}" aria-pressed="${k === level}" aria-label="${k}, ${TEAM_LEVEL_LABELS[k]}"><b>${k}</b></button>
  `).join("");
  elTeamSheetLevelText.textContent = `${TEAM_LEVEL_LABELS[level]}${level === 3 ? " (neutre)" : ""}`;
}

function openTeamSheet(teamId) {
  const team = parseTeams(elTeams.value).teams.find(t => t.id === teamId);
  if (!team) return;
  sheetTeamId = teamId;
  elTeamSheetTitle.textContent = team.name;
  renderTeamSheetLevels();
  elTeamSheet.hidden = false;
  document.addEventListener("keydown", onTeamSheetKeydown);
  elTeamSheetTitle.focus();
}

function closeTeamSheet() {
  if (elTeamSheet.hidden) return;
  const teamId = sheetTeamId;
  elTeamSheet.hidden = true;
  document.removeEventListener("keydown", onTeamSheetKeydown);
  sheetTeamId = null;
  renderTeamChips();
  const again = teamId != null ? elTeamChips.querySelector(`.chip[data-team-id="${teamId}"]`) : null;
  (again || elAddTeamInput)?.focus();
}

function onTeamSheetKeydown(e) {
  if (e.key === "Escape") closeTeamSheet();
}

/** Retire la ligne `lineIdx` et décale les niveaux des lignes suivantes. */
function removeTeamLine(lineIdx) {
  const lines = teamLines();
  lines.splice(lineIdx, 1);
  const shifted = {};
  Object.entries(window.__PT_TEAM_LEVELS__).forEach(([key, level]) => {
    const idx = parseInt(key, 10);
    if (idx < lineIdx) shifted[idx] = level;
    else if (idx > lineIdx) shifted[idx - 1] = level;
  });
  window.__PT_TEAM_LEVELS__ = shifted;
  writeTeamLines(lines);
}

if (elTeamChips) {
  elTeamChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-team-id]");
    if (chip) openTeamSheet(parseInt(chip.dataset.teamId, 10));
  });
}

if (elTeamSheet) {
  elTeamSheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-sheet]")) {
      closeTeamSheet();
      return;
    }
    const lvl = e.target.closest(".lvl");
    if (lvl && sheetTeamId != null) {
      window.__PT_TEAM_LEVELS__[sheetTeamId] = parseInt(lvl.dataset.level, 10);
      renderTeamSheetLevels();
      elTeamSheetLevels.querySelector(`[data-level="${lvl.dataset.level}"]`)?.focus();
      autoSaveTournamentState();
    }
  });

  btnTeamSheetRemove.addEventListener("click", () => {
    if (sheetTeamId == null) return;
    const lineIdx = sheetTeamId;
    const name = elTeamSheetTitle.textContent;
    sheetTeamId = null;
    elTeamSheet.hidden = true;
    document.removeEventListener("keydown", onTeamSheetKeydown);
    removeTeamLine(lineIdx);
    elAddTeamInput?.focus();
    showToast(`${name} retirée`);
  });
}
