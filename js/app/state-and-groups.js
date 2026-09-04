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
    bw: elBeamWidth.value,
    pk: elPartnerK.value,
    sq: elSquare.checked,
    b2b: elAvoidB2B.checked,
    sc: window.__PB_SCORES__ || {},
    pr: window.__PB_PRESENCE__ || {}
  };
}

/**
 * Sauvegarde la session dans le stockage local (localStorage).
 */
function autoSaveState() {
  const state = getCurrentState();
  localStorage.setItem("pb_autosave", JSON.stringify(state));
  
  if (elAutosaveBadge) {
    elAutosaveBadge.style.opacity = "1";
    setTimeout(() => { elAutosaveBadge.style.opacity = "0.5"; }, 1000);
  }
}

/**
 * Fonction centrale de génération du planning.
 * @param {boolean} preserveScores - Si true, conserve les scores déjà saisis lors de l'actualisation.
 */
function generateSession(preserveScores = true) {
  clearMessages();
  btnCopy.disabled = true;

  if (!preserveScores) {
    window.__PB_SCORES__ = {};
    if (elRankingSection) elRankingSection.hidden = true;
  }

  try {
    const players = parsePlayers(elPlayers.value);
    const numCourts = Math.max(1, parseInt(elCourts.value || "1", 10));
    const numRounds = Math.max(1, parseInt(elRounds.value || "1", 10));
    let seedText = (elSeed.value || "").trim();

    if (!seedText) {
      seedText = generateSeed();
      elSeed.value = seedText;
    }

    if (players.length < 4) {
      throw new Error("Veuillez entrer au moins 4 joueurs.");
    }

    const warnings = [];

    // Signale les doublons de joueurs (même nom, éventuellement casse différente) ignorés au parsing
    const rawCount = countRawPlayerEntries(elPlayers.value);
    if (rawCount > players.length) {
      const duplicates = rawCount - players.length;
      warnings.push(`${duplicates} doublon(s) de joueur ignoré(s).`);
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

    const options = {
      wT: parseFloat(elwT.value || "5"),
      wO: parseFloat(elwO.value || "2"),
      wP: parseFloat(elwP.value || "1"),
      beamWidth: parseInt(elBeamWidth.value || "80", 10),
      partnerK: parseInt(elPartnerK.value || "10", 10),
      squareRepeats: !!elSquare.checked,
      avoidB2B: !!elAvoidB2B.checked,
    };

    const result = scheduleRotations(players, numCourts, numRounds, seedText, options, window.__PB_PRESENCE__);
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

/**
 * Restaure un état complet préenregistré (depuis l'historique, l'URL ou le stockage).
 */
function loadState(state) {
  if (state.p !== undefined) elPlayers.value = state.p;
  if (state.c !== undefined) elCourts.value = state.c;
  if (state.r !== undefined) elRounds.value = state.r;
  if (state.s !== undefined) elSeed.value = state.s;
  if (state.cn !== undefined) elCourtNames.value = state.cn;
  if (state.wt !== undefined) elwT.value = state.wt;
  if (state.wo !== undefined) elwO.value = state.wo;
  if (state.wp !== undefined) elwP.value = state.wp;
  if (state.bw !== undefined) elBeamWidth.value = state.bw;
  if (state.pk !== undefined) elPartnerK.value = state.pk;
  if (state.sq !== undefined) elSquare.checked = state.sq;
  if (state.b2b !== undefined) elAvoidB2B.checked = state.b2b;
  if (state.pr) window.__PB_PRESENCE__ = state.pr;

  syncPresenceInputs();

  if (state.sc) {
    window.__PB_SCORES__ = state.sc;
  } else {
    window.__PB_SCORES__ = {};
  }

  if (state.p && parsePlayers(state.p).length >= 4) {
    generateSession(true);
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
    return JSON.parse(localStorage.getItem("pb_player_groups") || "[]");
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
    elPlayerGroupsList.innerHTML = `<p class="subtle">Aucun groupe enregistré pour le&nbsp;moment.</p>`;
    return;
  }

  elPlayerGroupsList.innerHTML = groups.map(g => `
    <div class="group-card">
      <div>
        <h4>${escapeHtml(g.name)}</h4>
        <div class="subtle" style="font-size: 0.78rem; margin-top: 2px;">👥 ${g.players.length} joueur(s)</div>
      </div>
      <div class="group-actions">
        <button type="button" class="secondary load-group-btn" data-id="${g.id}">📥 Charger</button>
        <button type="button" class="secondary danger del-group-btn" data-id="${g.id}" title="Supprimer ce groupe">🗑️</button>
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
    btnSavePlayerGroup.textContent = "✓ Groupe enregistré !";
    setTimeout(() => (btnSavePlayerGroup.textContent = "💾 Enregistrer les joueurs actuels"), 1200);
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
      }
    } else if (btn.classList.contains("del-group-btn")) {
      const filtered = groups.filter(g => g.id !== id);
      savePlayerGroupsToStorage(filtered);
      renderPlayerGroups();
    }
  });
}


