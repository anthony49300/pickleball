"use strict";

// =============================================================================
// GESTION DE L'ETAT, SAUVEGARDE ET CHARGEMENT SECURISE
// =============================================================================

/**
 * Capture l'intégralité des paramètres et scores courants de l'application.
 */
function getCurrentState() {
  return {
    p: elPlayers.value,
    c: elCourts.value,
    r: elRounds.value,
    s: elSeed.value,
    cn: elCourtNames.value,
    wt: elwT.value,
    wo: elwO.value,
    wp: elwP.value,
    wbal: elwBalance.value,
    bw: elBeamWidth.value,
    pk: elPartnerK.value,
    sq: elSquare.checked,
    b2b: elAvoidB2B.checked,
    mem: elPairMemory ? elPairMemory.checked : true,
    sp: !!window.__PB_SEED_PINNED__,
    sid: window.__PB_SESSION_ID__ || null,
    bv: window.__PB_BENCH_VERSION__,
    sc: window.__PB_SCORES__ || {},
    pr: window.__PB_PRESENCE__ || {},
    lv: window.__PB_LEVELS__ || {},
    hr: window.__PB_HIDDEN_ROUNDS__ || []
  };
}

let saveBadgePulseTimer = null;

/**
 * Fait "pulser" le badge de sauvegarde (bref pic d'opacité, voir la classe
 * .save-badge-pulse dans app.css) au lieu de changer son opacité en dur à
 * chaque appel : un debounce (clearTimeout/setTimeout) évite qu'il clignote à
 * chaque frappe lors d'une saisie rapide — il ne redescend au repos qu'une
 * fois la saisie terminée.
 */
function pulseSaveBadge() {
  if (!elAutosaveBadge) return;
  elAutosaveBadge.classList.add("save-badge-pulse");
  clearTimeout(saveBadgePulseTimer);
  saveBadgePulseTimer = setTimeout(() => {
    elAutosaveBadge.classList.remove("save-badge-pulse");
  }, 900);
}

/**
 * Sauvegarde la session dans le stockage local (localStorage).
 */
function autoSaveState() {
  const state = getCurrentState();
  localStorage.setItem("pb_autosave", JSON.stringify(state));
  recordPairMemory();
  pulseSaveBadge();
}

// =============================================================================
// MÉMOIRE ENTRE LES SESSIONS (« Varier d'une semaine à l'autre »)
// =============================================================================
// Chaque session (identifiée par __PB_SESSION_ID__, attribué quand on génère
// une nouvelle session, indépendant de la graine) laisse ici le compte de ses
// duos et oppositions réellement joués (tours notés). À la génération d'une
// session suivante, les dernières entrées amorcent l'algorithme (voir
// buildPriorCounts dans algorithm.js) pour varier les affiches d'une semaine
// à l'autre. Indépendant de l'historique manuel : rien à enregistrer à la
// main. Effacé par « Tout réinitialiser ».
const PAIR_MEMORY_KEY = "pb_pair_memory";
const PAIR_MEMORY_MAX = 6;

function getPairMemory() {
  try {
    return sanitizePairMemory(JSON.parse(localStorage.getItem(PAIR_MEMORY_KEY) || "[]"));
  } catch {
    return [];
  }
}

function newSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Met à jour l'entrée de la session en cours dans la mémoire : ses tours notés
 * (voir getFrozenRounds). Sans tour noté, l'entrée est retirée (scores effacés,
 * planning régénéré avant de jouer...).
 */
function recordPairMemory() {
  const sid = window.__PB_SESSION_ID__;
  if (!sid) return;
  const played = getFrozenRounds(window.__PB_LAST_RESULT__, window.__PB_SCORES__ || {});
  const memory = getPairMemory();
  const idx = memory.findIndex(e => e.sid === sid);
  if (!played.length) {
    if (idx === -1) return;
    memory.splice(idx, 1);
  } else {
    const at = idx !== -1 ? memory[idx].at : Date.now();
    const entry = { sid, at, ...countSessionPairs(played) };
    if (idx !== -1) memory[idx] = entry;
    else memory.push(entry);
    memory.sort((a, b) => b.at - a.at);
    memory.length = Math.min(memory.length, PAIR_MEMORY_MAX);
  }
  try {
    localStorage.setItem(PAIR_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Stockage plein ou indisponible : la mémoire est un plus, pas bloquant.
  }
  renderPairMemoryInfo();
}

/** Sessions précédentes (hors session en cours), la plus récente d'abord. */
function getPreviousSessionsMemory() {
  const sid = window.__PB_SESSION_ID__;
  return getPairMemory().filter(e => e.sid !== sid);
}

/** Petit rappel sous l'interrupteur « Varier d'une semaine à l'autre ». */
function renderPairMemoryInfo() {
  if (!elPairMemoryInfo) return;
  const n = Math.min(getPreviousSessionsMemory().length, 4);
  elPairMemoryInfo.textContent = n
    ? `${n} session${n > 1 ? "s" : ""} précédente${n > 1 ? "s" : ""} prise${n > 1 ? "s" : ""} en compte.`
    : "Aucune session précédente pour l'instant.";
}

/**
 * Fonction centrale de génération du planning.
 * @param {boolean} preserveScores - Si true, conserve les scores déjà saisis lors de l'actualisation.
 */
function generateSession(preserveScores = true) {
  clearMessages();
  btnCopy.disabled = true;

  if (!preserveScores) {
    window.__PB_SCORES__ = Object.create(null);
    window.__PB_HIDDEN_ROUNDS__ = [];
    if (elRankingSection) elRankingSection.hidden = true;
  }

  try {
    // Bornes revérifiées ici (en plus de sanitizeRotationState) : le
    // formulaire peut aussi être modifié à la main, et un planning démesuré
    // gèlerait la page (calcul de chaque tour par recherche en faisceau).
    let players = parsePlayers(elPlayers.value);
    const courts = clampFormInt(elCourts.value, 1, 10, 1);
    const roundsInput = clampFormInt(elRounds.value, 1, 50, 1);
    const numCourts = courts.value;
    const numRounds = roundsInput.value;
    if (courts.clamped) elCourts.value = numCourts;
    if (roundsInput.clamped) elRounds.value = numRounds;
    let seedText = (elSeed.value || "").trim();

    if (!seedText) {
      seedText = generateSeed();
      elSeed.value = seedText;
    }

    if (players.length < 4) {
      throw new Error("Veuillez entrer au moins 4 joueurs.");
    }

    const warnings = [];
    if (courts.clamped || roundsInput.clamped) {
      warnings.push("Réglages hors limites ramenés au maximum autorisé (10 terrains, 50 tours).");
    }

    // Signale les doublons de joueurs (même nom, éventuellement casse différente) ignorés au parsing
    const rawCount = countRawPlayerEntries(elPlayers.value);
    if (rawCount > players.length) {
      const duplicates = rawCount - players.length;
      warnings.push(`${duplicates} doublon(s) de joueur ignoré(s).`);
    }

    if (players.length > SANITIZE_LIMITS.maxPlayers) {
      warnings.push(`Seuls les ${SANITIZE_LIMITS.maxPlayers} premiers joueurs sont pris en compte.`);
      players = players.slice(0, SANITIZE_LIMITS.maxPlayers);
    }

    // Prendre en compte les 2 terrains possibles à 6 joueurs (1 double + 1 simple)
    const maxUsableCourts = (players.length === 6 && numCourts >= 2) ? 2 : Math.floor(players.length / 4);
    if (numCourts > maxUsableCourts && maxUsableCourts > 0) {
      warnings.push(`${numCourts} terrain(s) demandé(s), mais seulement ${maxUsableCourts} utilisé(s) pour ${players.length} joueur(s).`);
    }

    if (warnings.length && elWarning) {
      elWarning.hidden = false;
      elWarning.textContent = `Attention : ${warnings.join(" ")}`;
    }

    // Curseurs : mêmes bornes que leurs attributs min/max (voir index.html).
    const slider = (el, min, max, fallback) => {
      const n = parseFloat(el.value);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const options = {
      wT: slider(elwT, 0, 20, 5),
      wO: slider(elwO, 0, 20, 2),
      wP: slider(elwP, 0, 10, 1),
      wBalance: slider(elwBalance, 0, 20, 3),
      beamWidth: Math.round(slider(elBeamWidth, 10, 500, 80)),
      partnerK: Math.round(slider(elPartnerK, 4, 30, 10)),
      squareRepeats: !!elSquare.checked,
      avoidB2B: !!elAvoidB2B.checked,
      benchVersion: window.__PB_BENCH_VERSION__,
    };

    // Gèle les tours déjà notés (voir getFrozenRounds) plutôt que de les
    // laisser être rejoués sous un autre tirage : sans ça, la moindre
    // modification de la liste de joueurs (arrivée/départ) ou de la graine
    // change la séquence aléatoire dès le tour 1, y compris pour des tours
    // déjà joués et notés à l'écran.
    const frozenRounds = preserveScores
      ? getFrozenRounds(window.__PB_LAST_RESULT__, window.__PB_SCORES__)
      : [];

    // Mémoire des semaines précédentes (voir PAIR_MEMORY_KEY), si activée.
    const priorCounts = elPairMemory && elPairMemory.checked
      ? buildPriorCounts(getPreviousSessionsMemory())
      : null;

    const result = scheduleRotations(players, numCourts, numRounds, seedText, options, window.__PB_PRESENCE__, frozenRounds, window.__PB_LEVELS__, priorCounts);
    window.__PB_LAST_RESULT__ = result;

    render(result, players, numCourts, numRounds);

    autoSaveState();

  } catch (e) {
    if (elError) {
      elError.hidden = false;
      elError.textContent = e?.message ?? String(e);
    }
  }
}

/** Message affiché quand un lien importé a dû être ramené dans les limites. */
const IMPORT_CLAMPED_MESSAGE = "Ce lien contenait des réglages hors limites ; ils ont été ramenés aux valeurs maximales.";

/**
 * Affiche un avertissement non bloquant dans #warning, avant celui
 * éventuellement déjà présent (doublons, terrains en trop...).
 */
function prependWarning(message) {
  if (!elWarning) return;
  if (elWarning.hidden) {
    elWarning.textContent = message;
  } else {
    // Nœud texte plutôt que textContent : garde un éventuel bouton déjà
    // présent (voir showHeavyScheduleWarning).
    elWarning.prepend(document.createTextNode(`${message} `));
  }
  elWarning.hidden = false;
}

/**
 * Durée estimée (ms, PC de bureau) d'une génération avec les réglages
 * actuels du formulaire, ramenés aux mêmes bornes que generateSession.
 * @param {number} [frozenRounds] - tours déjà notés, qui ne seront pas recalculés
 */
function estimateFormScheduleCost(frozenRounds = 0) {
  const players = Math.min(parsePlayers(elPlayers.value).length, SANITIZE_LIMITS.maxPlayers);
  const courts = clampFormInt(elCourts.value, 1, 10, 1).value;
  const rounds = clampFormInt(elRounds.value, 1, 50, 1).value - frozenRounds;
  const beamWidth = clampFormInt(elBeamWidth.value, 10, 500, 80).value;
  const partnerK = clampFormInt(elPartnerK.value, 4, 30, 10).value;
  return estimateScheduleCost(players, courts, rounds, beamWidth, partnerK);
}

/** Durée lisible pour les messages : « environ 12 s », « environ 3 min ». */
function formatScheduleCost(ms) {
  const s = Math.max(3, Math.round(ms / 1000));
  return s < 120 ? `environ ${s} s` : `environ ${Math.round(s / 60)} min`;
}

/**
 * Planning trop lourd pour être généré automatiquement au chargement : avertit
 * dans #warning (non bloquant) avec un bouton « Générer quand même ».
 */
function showHeavyScheduleWarning(costMs) {
  if (!elWarning) return;
  elWarning.textContent = `Ce planning est long à calculer (${formatScheduleCost(costMs)} sur un ordinateur, davantage sur un téléphone) : il n'a pas été généré automatiquement. `;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary";
  btn.textContent = "Générer quand même";
  btn.addEventListener("click", () => {
    generateSession(true);
    if (window.__PB_LAST_RESULT__ && (!elError || elError.hidden)) showScreen("jouer");
  });
  elWarning.append(btn);
  elWarning.hidden = false;
}

/**
 * Restaure un état complet préenregistré (depuis l'historique, l'URL ou le stockage).
 * L'état est d'abord nettoyé (voir sanitizeRotationState dans
 * js/shared/sanitize.js) : il peut venir d'un lien partagé ou d'une
 * sauvegarde modifiée, donc jamais utilisé tel quel. Lève une exception s'il
 * est structurellement invalide.
 * Le planning est ensuite régénéré automatiquement, sauf si son coût estimé
 * dépasse SCHEDULE_COST_BUDGET_MS (lien piégé, ou sauvegarde issue d'un tel
 * lien) : la page charge alors le formulaire et propose de générer.
 * @param {Object} rawState
 * @param {{clamped?: boolean}} [report] - voir sanitizeRotationState
 */
function loadState(rawState, report = {}) {
  const state = sanitizeRotationState(rawState, report);
  if (state.p !== undefined) elPlayers.value = state.p;
  if (state.c !== undefined) elCourts.value = state.c;
  if (state.r !== undefined) elRounds.value = state.r;
  if (state.s !== undefined) elSeed.value = state.s;
  if (state.cn !== undefined) elCourtNames.value = state.cn;
  if (state.wt !== undefined) elwT.value = state.wt;
  if (state.wo !== undefined) elwO.value = state.wo;
  if (state.wp !== undefined) elwP.value = state.wp;
  if (state.wbal !== undefined) elwBalance.value = state.wbal;
  if (state.bw !== undefined) elBeamWidth.value = state.bw;
  if (state.pk !== undefined) elPartnerK.value = state.pk;
  if (state.sq !== undefined) elSquare.checked = state.sq;
  if (state.b2b !== undefined) elAvoidB2B.checked = state.b2b;
  if (elPairMemory) elPairMemory.checked = state.mem !== false;
  window.__PB_SEED_PINNED__ = !!state.sp;
  window.__PB_BENCH_VERSION__ = state.bv === 2 ? 2 : 1;
  // Session enregistrée avant l'introduction de l'identifiant de session : on
  // lui en donne un si elle a des scores (c'est bien une session en cours).
  window.__PB_SESSION_ID__ = state.sid
    || (state.sc && Object.keys(state.sc).length ? newSessionId() : null);
  if (state.pr) window.__PB_PRESENCE__ = state.pr;
  window.__PB_LEVELS__ = state.lv || Object.create(null);
  window.__PB_HIDDEN_ROUNDS__ = state.hr || [];

  // Plages de présence telles qu'enregistrées : calées sur le nombre de tours chargé.
  presenceRoundsBaseline = null;
  syncPresenceInputs();

  window.__PB_SCORES__ = state.sc || Object.create(null);

  // Curseurs réécrits ci-dessus sans événement "input" : on resynchronise
  // les valeurs affichées à côté (voir navigation.js).
  syncSliderOutputs();

  if (state.p && parsePlayers(state.p).length >= 4) {
    const cost = estimateFormScheduleCost();
    if (cost > SCHEDULE_COST_BUDGET_MS) {
      renderEmptyState();
      showHeavyScheduleWarning(cost);
    } else {
      generateSession(true);
    }
  } else {
    renderEmptyState();
  }
}


// =============================================================================
// GROUPES DE JOUEURS RÉGULIERS (CLUBS RÉCURRENTS)
// Distinct de l'historique de sessions : ici on ne sauvegarde qu'une liste de noms
// réutilisable ("Mardi Soir", "Club du dimanche"...), sans scores ni réglages, pour
// éviter de retaper la même liste de joueurs à chaque nouvelle session.
// =============================================================================

function getPlayerGroups() {
  try {
    return sanitizePlayerGroups(JSON.parse(localStorage.getItem("pb_player_groups") || "[]"));
  } catch {
    return [];
  }
}

function savePlayerGroupsToStorage(groups) {
  localStorage.setItem("pb_player_groups", JSON.stringify(groups));
}

function renderPlayerGroups() {
  if (!elPlayerGroupsList) return;
  const groups = getPlayerGroups();

  if (!groups.length) {
    elPlayerGroupsList.innerHTML = `<p class="hint">Aucun groupe enregistré pour le&nbsp;moment.</p>`;
    return;
  }

  elPlayerGroupsList.innerHTML = groups.map(g => `
    <div class="group-card">
      <div>
        <h4>${escapeHtml(g.name)}</h4>
        <div class="hint">${Number(g.players.length)} joueur${g.players.length > 1 ? "s" : ""}</div>
      </div>
      <div class="group-actions">
        <button type="button" class="load-group-btn" data-id="${escapeHtml(g.id)}">Charger</button>
        <button type="button" class="secondary danger del-group-btn" data-id="${escapeHtml(g.id)}" aria-label="Supprimer le groupe ${escapeHtml(g.name)}">Supprimer</button>
      </div>
    </div>
  `).join('');
}

if (btnSavePlayerGroup) {
  btnSavePlayerGroup.addEventListener("click", () => {
    const name = (elNewGroupName.value || "").trim();
    const players = parsePlayers(elPlayers.value);

    if (!name) {
      elNewGroupName.focus();
      return;
    }
    if (!players.length) {
      if (elWarning) {
        elWarning.hidden = false;
        elWarning.textContent = "Attention : ajoutez au moins un joueur dans la liste avant d'enregistrer un groupe.";
      }
      return;
    }

    const groups = getPlayerGroups();
    const existingIndex = groups.findIndex(g => g.name.toLowerCase() === name.toLowerCase());

    const newGroup = {
      id: existingIndex !== -1 ? groups[existingIndex].id : Date.now(),
      name,
      players
    };

    if (existingIndex !== -1) groups.splice(existingIndex, 1);
    groups.unshift(newGroup);

    savePlayerGroupsToStorage(groups);
    renderPlayerGroups();

    elNewGroupName.value = "";
    showToast(`Groupe « ${name} » enregistré`);
  });
}

if (elNewGroupName) {
  elNewGroupName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnSavePlayerGroup?.click();
    }
  });
}

if (elPlayerGroupsList) {
  elPlayerGroupsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const groups = getPlayerGroups();

    if (btn.classList.contains("load-group-btn")) {
      const group = groups.find(g => g.id === id);
      if (group) {
        elPlayers.value = group.players.join("\n");
        clearMessages();
        syncPresenceInputs();
        autoSaveState();
        showToast(`Groupe « ${group.name} » chargé : ${group.players.length} joueurs`);
      }
    } else if (btn.classList.contains("del-group-btn")) {
      const filtered = groups.filter(g => g.id !== id);
      savePlayerGroupsToStorage(filtered);
      renderPlayerGroups();
    }
  });
}


