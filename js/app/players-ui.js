"use strict";

// =============================================================================
// LISTE DES JOUEURS : PASTILLES + FICHE JOUEUR (écran Préparer)
// =============================================================================
// Le <textarea id="players"> reste l'unique source de vérité de la liste
// (sauvegarde, partage, groupes, génération : rien ne change de ce côté).
// Les pastilles n'en sont qu'une vue : ajouter ou retirer un joueur réécrit
// le textarea puis redéclenche "input", comme une saisie au clavier.
//
// La fiche joueur regroupe ce qui était avant dans deux sections séparées
// ("Arrivées & départs" et "Niveaux des joueurs") : niveau 1-5
// (window.__PB_LEVELS__) et plage de présence (window.__PB_PRESENCE__).

const elPlayerChips = document.getElementById("playerChips");
const elAddPlayerRow = document.getElementById("addPlayerRow");
const elAddPlayerInput = document.getElementById("addPlayerInput");
const btnAddPlayer = document.getElementById("addPlayerBtn");
const btnPlayersTextToggle = document.getElementById("playersTextToggle");
const elPlayersHint = document.getElementById("playersHint");
const elFormatHint = document.getElementById("formatHint");

const elPlayerSheet = document.getElementById("playerSheet");
const elSheetTitle = document.getElementById("sheetTitle");
const elSheetLevels = document.getElementById("sheetLevels");
const elSheetStart = document.getElementById("sheetStart");
const elSheetEnd = document.getElementById("sheetEnd");
const btnSheetRemove = document.getElementById("sheetRemove");

let sheetPlayer = null;
let sheetReturnFocus = null;

function totalRoundsValue() {
  return Math.max(1, parseInt(elRounds.value || "8", 10) || 8);
}

/** Réécrit la liste (source de vérité) et prévient le reste de l'app. */
function writePlayers(names) {
  elPlayers.value = names.join("\n");
  elPlayers.dispatchEvent(new Event("input", { bubbles: true }));
  elPlayers.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Rappel du format sous les compteurs : combien jouent, combien en pause. */
function updateFormatHint() {
  if (!elFormatHint) return;
  const n = parsePlayers(elPlayers.value).length;
  const courts = Math.max(1, parseInt(elCourts.value || "1", 10) || 1);
  if (n < 4) {
    elFormatHint.textContent = `Ajoutez au moins 4 joueurs (${n} pour l'instant).`;
    return;
  }
  // Même règle que generateSession : à 6 joueurs sur 2 terrains ou plus,
  // 1 double + 1 simple, personne sur le banc.
  if (n === 6 && courts >= 2) {
    elFormatHint.textContent = "6 joueurs : un double et un simple à chaque tour, personne en pause.";
    return;
  }
  const usable = Math.min(courts, Math.floor(n / 4));
  const bench = n - usable * 4;
  const prefix = usable < courts ? `Pas assez de joueurs pour ${courts} terrains : ${usable} utilisé${usable > 1 ? "s" : ""}. ` : "";
  elFormatHint.textContent = `${prefix}${usable * 4} joueurs en jeu, ${bench} en pause à chaque tour.`;
}

function renderPlayerChips() {
  updateFormatHint();
  if (!elPlayerChips) return;

  const players = parsePlayers(elPlayers.value);
  const totalRounds = totalRoundsValue();

  if (!players.length) {
    elPlayerChips.innerHTML = `<p class="hint">Aucun joueur pour l'instant. Tapez un nom ci-dessous, ou chargez un groupe enregistré.</p>`;
    return;
  }

  elPlayerChips.innerHTML = players.map(p => {
    const level = window.__PB_LEVELS__[p] ?? 3;
    const pr = window.__PB_PRESENCE__[p];
    const tags = [];
    if (pr && pr.start > 1) tags.push(`dès T${pr.start}`);
    if (pr && pr.end < totalRounds) tags.push(`jusqu'à T${pr.end}`);
    const dots = [1, 2, 3, 4, 5].map(k => `<i class="${k <= level ? "on" : ""}"></i>`).join("");
    const label = `${p}, niveau ${level} ${LEVEL_LABELS[level] || ""}${tags.length ? ", " + tags.join(", ") : ""}. Modifier`;
    return `<button type="button" class="chip" data-player="${escapeHtml(p)}" aria-label="${escapeHtml(label)}">${escapeHtml(p)}<span class="lv" aria-hidden="true">${dots}</span>${tags.map(t => `<span class="chip-tag">${escapeHtml(t)}</span>`).join("")}</button>`;
  }).join("");
}

function addPlayersFromInput() {
  const typed = parsePlayers(elAddPlayerInput.value);
  if (!typed.length) {
    elAddPlayerInput.focus();
    return;
  }
  const existing = parsePlayers(elPlayers.value);
  const known = new Set(existing.map(n => n.toLowerCase()));
  const added = typed.filter(n => !known.has(n.toLowerCase()));

  if (added.length) writePlayers([...existing, ...added]);
  elAddPlayerInput.value = "";
  elAddPlayerInput.focus();

  const skipped = typed.length - added.length;
  if (skipped && !added.length) showToast(typed.length > 1 ? "Ces joueurs sont déjà dans la liste" : `${typed[0]} est déjà dans la liste`);
  else if (skipped) showToast(`${added.length} ajouté${added.length > 1 ? "s" : ""}, ${skipped} déjà dans la liste`);
  else if (added.length > 1) showToast(`${added.length} joueurs ajoutés`);
}

if (btnAddPlayer) btnAddPlayer.addEventListener("click", addPlayersFromInput);
if (elAddPlayerInput) {
  elAddPlayerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPlayersFromInput();
    }
  });
}

// Courts : le rappel "X en jeu, Y en pause" suit le nombre de terrains.
elCourts.addEventListener("input", updateFormatHint);

// Bascule pastilles <-> saisie en texte (pratique pour coller ou corriger une
// longue liste d'un coup).
if (btnPlayersTextToggle) {
  btnPlayersTextToggle.addEventListener("click", () => {
    const toText = elPlayers.hidden;
    elPlayers.hidden = !toText;
    elPlayerChips.hidden = toText;
    elAddPlayerRow.hidden = toText;
    if (elPlayersHint) elPlayersHint.hidden = toText;
    btnPlayersTextToggle.textContent = toText ? "Vue pastilles" : "Saisie en texte";
    if (toText) elPlayers.focus();
    else renderPlayerChips();
  });
}

// ---------------------------------------------------------------------------
// Fiche joueur
// ---------------------------------------------------------------------------

function renderSheetLevels() {
  const level = window.__PB_LEVELS__[sheetPlayer] ?? 3;
  // Boutons numérotés (les libellés complets ne tiennent pas sur 5 colonnes
  // à largeur de téléphone) ; le libellé du niveau choisi s'affiche dessous.
  elSheetLevels.innerHTML = [1, 2, 3, 4, 5].map(k => `
    <button type="button" class="lvl" data-level="${k}" aria-pressed="${k === level}" aria-label="${k}, ${LEVEL_LABELS[k]}"><b>${k}</b></button>
  `).join("");
  const elLevelText = document.getElementById("sheetLevelText");
  if (elLevelText) elLevelText.textContent = `${LEVEL_LABELS[level]}${level === 3 ? " (neutre)" : ""}`;
}

function openPlayerSheet(name, trigger) {
  sheetPlayer = name;
  sheetReturnFocus = trigger || null;
  const total = totalRoundsValue();
  if (!window.__PB_PRESENCE__[name]) window.__PB_PRESENCE__[name] = { start: 1, end: total };
  const pr = window.__PB_PRESENCE__[name];

  elSheetTitle.textContent = name;
  renderSheetLevels();
  [elSheetStart, elSheetEnd].forEach(el => {
    el.max = total;
    el.closest(".stepper").dataset.max = String(total);
  });
  elSheetStart.value = Math.min(pr.start, total);
  elSheetEnd.value = Math.min(pr.end, total);

  elPlayerSheet.hidden = false;
  document.addEventListener("keydown", onSheetKeydown);
  elSheetTitle.focus();
}

function closePlayerSheet() {
  if (elPlayerSheet.hidden) return;
  elPlayerSheet.hidden = true;
  document.removeEventListener("keydown", onSheetKeydown);
  sheetPlayer = null;
  renderPlayerChips();
  // Les pastilles ont été recréées : on rend le focus à celle du même joueur.
  const name = sheetReturnFocus?.dataset?.player;
  const again = name ? elPlayerChips.querySelector(`.chip[data-player="${CSS.escape(name)}"]`) : null;
  (again || elAddPlayerInput)?.focus();
  sheetReturnFocus = null;
}

function onSheetKeydown(e) {
  if (e.key === "Escape") closePlayerSheet();
}

if (elPlayerChips) {
  elPlayerChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) openPlayerSheet(chip.dataset.player, chip);
  });
}

if (elPlayerSheet) {
  elPlayerSheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-sheet]")) {
      closePlayerSheet();
      return;
    }
    const lvl = e.target.closest(".lvl");
    if (lvl && sheetPlayer) {
      window.__PB_LEVELS__[sheetPlayer] = parseInt(lvl.dataset.level, 10);
      renderSheetLevels();
      elSheetLevels.querySelector(`[data-level="${lvl.dataset.level}"]`)?.focus();
      autoSaveState();
    }
  });

  // Plage de présence : "arrive au tour" <= "part après le tour", tous deux
  // dans [1, nombre de tours]. Les steppers (ui-controls.js) redéclenchent
  // "input" sur les champs, d'où une seule écoute pour clavier et boutons.
  const onPresenceInput = (e) => {
    if (!sheetPlayer) return;
    const total = totalRoundsValue();
    const pr = window.__PB_PRESENCE__[sheetPlayer] || (window.__PB_PRESENCE__[sheetPlayer] = { start: 1, end: total });
    let start = parseInt(elSheetStart.value, 10);
    let end = parseInt(elSheetEnd.value, 10);
    if (isNaN(start) || isNaN(end)) return; // saisie en cours (champ vidé)
    start = Math.min(total, Math.max(1, start));
    end = Math.min(total, Math.max(1, end));
    if (start > end) {
      if (e.target === elSheetStart) end = start;
      else start = end;
    }
    pr.start = start;
    pr.end = end;
    if (String(start) !== elSheetStart.value) elSheetStart.value = start;
    if (String(end) !== elSheetEnd.value) elSheetEnd.value = end;
    autoSaveState();
  };
  elSheetStart.addEventListener("input", onPresenceInput);
  elSheetEnd.addEventListener("input", onPresenceInput);

  btnSheetRemove.addEventListener("click", () => {
    if (!sheetPlayer) return;
    const name = sheetPlayer;
    const remaining = parsePlayers(elPlayers.value).filter(n => n !== name);
    sheetReturnFocus = null;
    closePlayerSheet();
    writePlayers(remaining);
    showToast(`${name} retiré de la session`);
  });
}
