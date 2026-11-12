"use strict";

// =============================================================================
// HISTORIQUE ET REINITIALISATION COMPLETE DU CACHE
// =============================================================================

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("pb_history") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory() {
  let history = getHistory();
  const state = getCurrentState();

  if (!state.s) return;

  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const existingIndex = history.findIndex(item => item.seed === state.s);

  const newItem = {
    id: existingIndex !== -1 ? history[existingIndex].id : Date.now(),
    date: dateStr,
    seed: state.s,
    playersCount: parsePlayers(state.p).length,
    roundsCount: state.r,
    state: state
  };

  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  history.unshift(newItem);
  history = history.slice(0, 20);
  localStorage.setItem("pb_history", JSON.stringify(history));
  renderHistory(history);
}

/**
 * @param {Array} [history] - déjà en mémoire chez l'appelant (sauvegarde,
 *   suppression) ? On lui évite un aller-retour localStorage.getItem +
 *   JSON.parse inutile en le passant directement, plutôt que de le relire.
 */
function renderHistory(history = getHistory()) {
  if (!elHistoryList) return;
  if (btnClearHistory) btnClearHistory.disabled = !history.length;
  if (!history.length) {
    elHistoryList.innerHTML = `<p class="subtle">Aucune session enregistrée pour l'instant. Utilisez « Enregistrer dans l'historique » sur la session en cours pour la retrouver ici.</p>`;
    return;
  }

  elHistoryList.innerHTML = history.map(item => `
    <article class="history-card">
      <div class="h-top">
        <span class="h-name">${escapeHtml(item.date)}</span>
        <span class="h-date">n° ${escapeHtml(item.seed)}</span>
      </div>
      <div class="h-meta"><span><b>${item.playersCount}</b> joueurs</span><span><b>${escapeHtml(item.roundsCount)}</b> tours</span></div>
      <div class="history-actions">
        <button type="button" class="secondary load-hist-btn" data-id="${item.id}">Charger</button>
        <button type="button" class="secondary danger del-hist-btn" data-id="${item.id}">Supprimer</button>
      </div>
    </article>
  `).join('');
}

if (elHistoryList) {
  elHistoryList.addEventListener("click", (e) => {
    const id = parseInt(e.target.dataset.id, 10);
    if (!id) return;

    let history = getHistory();

    if (e.target.classList.contains("load-hist-btn")) {
      const item = history.find(x => x.id === id);
      if (item) {
        loadState(item.state);
        // Session rechargée telle quelle : sa graine ne doit pas être
        // remplacée par un tirage automatique (voir le bouton Générer).
        window.__PB_SEED_PINNED__ = true;
        autoSaveState();
        if (window.__PB_LAST_RESULT__) {
          showScreen("jouer");
          showToast("Session chargée");
        }
      }
    } else if (e.target.classList.contains("del-hist-btn")) {
      history = history.filter(x => x.id !== id);
      localStorage.setItem("pb_history", JSON.stringify(history));
      renderHistory(history);
    }
  });
}

// BOUTON DE SUPPRESSION DE L'HISTORIQUE UNIQUEMENT
// (ne touche ni à la session en cours, ni à l'autosave : cohérent avec le libellé du bouton)
if (btnClearHistory) {
  btnClearHistory.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      "Voulez-vous vraiment vider l'historique des sessions enregistrées ? Cette action est irréversible.",
      { title: "Vider l'historique ?", confirmText: "Vider l'historique", icon: "🗑️" }
    );
    if (confirmed) {
      localStorage.removeItem("pb_history");
      renderHistory();
    }
  });
}

// BOUTON DE REINITIALISATION COMPLETE DE LA PAGE
// (distinct de "Vider l'historique" : celui-ci efface la session en cours, l'autosave
// et l'historique des sessions — et repart de zéro. Le libellé et la confirmation le précisent
// explicitement. Les groupes de joueurs réguliers (pb_player_groups) sont volontairement
// PRÉSERVÉS : ce sont des données de type "carnet d'adresses", indépendantes d'une session
// donnée, et les effacer ici irait à l'encontre de leur intérêt (ne pas retaper les joueurs).
//
// Important : on ne fait PAS de rechargement de page (location.reload / location.href).
// Après un vidage du storage, un rechargement vers la même URL laisse certains
// navigateurs (Chrome/Firefox) restaurer automatiquement les anciennes valeurs des champs
// de formulaire (textarea joueurs, scores...) depuis leur propre cache de formulaire,
// indépendamment de localStorage — ce qui donnait l'impression que le reset "ne marchait pas".
// On réinitialise donc directement les champs du DOM et l'état en mémoire, sans recharger.
if (btnResetAll) {
  btnResetAll.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      "Cela effacera la session en cours, la sauvegarde automatique ET l'historique des sessions enregistrées.\n\nLes groupes de joueurs réguliers enregistrés seront conservés. Cette action est irréversible.",
      { title: "Réinitialiser entièrement la page ?", confirmText: "Tout réinitialiser", icon: "🔄" }
    );
    if (!confirmed) return;

    localStorage.removeItem("pb_autosave");
    localStorage.removeItem("pb_history");
    localStorage.removeItem(PAIR_MEMORY_KEY);

    // Réinitialise l'état en mémoire
    window.__PB_SCORES__ = {};
    window.__PB_PRESENCE__ = {};
    window.__PB_LEVELS__ = {};
    window.__PB_HIDDEN_ROUNDS__ = [];
    window.__PB_LAST_RESULT__ = null;
    window.__PB_SESSION_ID__ = null;
    window.__PB_SEED_PINNED__ = false;

    // Réinitialise les champs du formulaire à leurs valeurs par défaut
    elPlayers.value = "";
    elCourts.value = "2";
    elRounds.value = "8";
    elSeed.value = generateSeed();
    elCourtNames.value = "";
    elwT.value = "5";
    elwO.value = "2";
    elwP.value = "1";
    elwBalance.value = "3";
    elBeamWidth.value = "80";
    elPartnerK.value = "10";
    elSquare.checked = true;
    elAvoidB2B.checked = true;
    if (elPairMemory) elPairMemory.checked = true;

    // Nettoie l'URL (retire un éventuel paramètre de partage ?d=...) sans recharger
    window.history.replaceState({}, "", window.location.pathname);

    clearMessages();
    syncSliderOutputs();
    syncPresenceInputs();
    renderEmptyState();
    renderHistory();
    renderPairMemoryInfo();
    showScreen("preparer");
    showToast("Page réinitialisée");
  });
}

if (btnSaveToHistory) {
  btnSaveToHistory.addEventListener("click", () => {
    saveToHistory();
    showToast("Session enregistrée dans l'historique");
  });
}


// =============================================================================
// EVENEMENTS GENERALISTES & FONCTIONNALITES EXPORT / PARTAGE
// =============================================================================
// Le thème clair/sombre est géré par js/shared/theme.js (module partagé avec
// les autres pages du site, chargé avant celui-ci — voir index.html).

// La liste de joueurs (pastilles + fiche joueur) est gérée par players-ui.js.

// Graine choisie explicitement (bouton « Nouvelle graine » ou saisie) : elle
// est respectée par le bouton Générer au lieu d'être remplacée par un tirage.
btnNewSeed.addEventListener("click", () => {
  elSeed.value = generateSeed();
  window.__PB_SEED_PINNED__ = true;
  autoSaveState();
});
elSeed.addEventListener("input", () => {
  window.__PB_SEED_PINNED__ = true;
});

btnGenerate.addEventListener("click", () => {
  const hasScores = Object.keys(window.__PB_SCORES__).length > 0;
  if (!hasScores) {
    // Nouvelle session (aucun score encore saisi) : nouvelle graine, sauf si
    // l'utilisateur en a fixé une, pour ne pas reproduire à l'identique le
    // planning de la semaine passée avec la même liste de joueurs. Avec des
    // scores (arrivée/départ en cours de session), la graine et la session
    // sont conservées : les tours notés restent figés (voir generateSession).
    if (!window.__PB_SEED_PINNED__) elSeed.value = generateSeed();
    window.__PB_SESSION_ID__ = newSessionId();
  }
  generateSession(hasScores);
  // Planning prêt (pas d'erreur affichée) : on passe directement à l'écran Jouer.
  if (window.__PB_LAST_RESULT__ && (!elError || elError.hidden)) {
    showScreen("jouer");
    // Un avertissement (doublons ignorés, terrains en trop...) s'affiche sur
    // l'écran Préparer, qu'on vient de quitter : on le reprend dans le toast.
    const n = window.__PB_LAST_RESULT__.rounds.length;
    showToast(elWarning && !elWarning.hidden
      ? elWarning.textContent
      : `${n} tour${n > 1 ? "s" : ""} générés`, elWarning && !elWarning.hidden ? 5000 : 2400);
  }
});

// NOUVELLE SESSION : efface matchs, scores et arrivées/départs, mais garde les
// joueurs, leurs niveaux et les réglages (la session terminée reste dans la
// mémoire « Varier d'une semaine à l'autre », et dans l'historique si elle y a
// été enregistrée).
if (btnNewSession) {
  btnNewSession.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      "Les matchs et les scores de la session en cours vont être effacés de l'écran. Les joueurs et les réglages sont conservés.\n\nPour la garder, enregistrez-la d'abord dans l'historique.",
      { title: "Démarrer une nouvelle session ?", confirmText: "Nouvelle session", icon: "🔄" }
    );
    if (!confirmed) return;

    window.__PB_SCORES__ = {};
    window.__PB_PRESENCE__ = {};
    window.__PB_HIDDEN_ROUNDS__ = [];
    window.__PB_LAST_RESULT__ = null;
    window.__PB_SESSION_ID__ = null;
    window.__PB_SEED_PINNED__ = false;
    elSeed.value = generateSeed();

    clearMessages();
    syncPresenceInputs();
    renderEmptyState();
    autoSaveState();
    renderPairMemoryInfo();
    showScreen("preparer");
    showToast("Nouvelle session prête : générez les matchs");
  });
}

// Écoute instantanée sur la saisie des scores (input + change)
["input", "change"].forEach(evt => {
  elSchedule.addEventListener(evt, (e) => {
    if (e.target.classList.contains("score-input")) {
      const r = parseInt(e.target.dataset.round, 10);
      const m = parseInt(e.target.dataset.match, 10);
      const t = e.target.dataset.team;
      let val = parseInt(e.target.value, 10);

      // Un score négatif ou aberrant (saisi au clavier, le spinner natif ne
      // l'empêche pas) n'a pas de sens pour un score de match : on corrige
      // la saisie plutôt que d'enregistrer une valeur invalide.
      if (!isNaN(val)) {
        val = Math.min(99, Math.max(0, val));
        if (String(val) !== e.target.value) e.target.value = val;
      }

      const match = window.__PB_LAST_RESULT__?.rounds?.[r]?.[m];
      if (match) {
        writeMatchScore(window.__PB_SCORES__, r, match, t, isNaN(val) ? null : val);
        // Gagnant, état du terrain et alerte d'égalité (au pickleball une partie
        // ne se termine jamais à égalité : c'est sans doute une erreur de saisie).
        refreshMatchCard(e.target.closest(".match-card"));
      }

      // Frise des tours, bouton "Tour suivant", badge de l'onglet Jouer...
      refreshPlayView();
      updateRankings();
      autoSaveState();
    }
  });
});

// Boutons −/+ autour de chaque score : voir js/shared/ui-controls.js (commun
// aux deux pages). Ils modifient le champ puis redéclenchent "input", donc
// passent par le listener ci-dessus comme une saisie au clavier.

// Navigation clavier rapide (Entrée -> champ de score suivant) : voir
// js/shared/ui-controls.js, module chargé sur les deux pages.

// Écoute instantanée de tous les paramètres du formulaire (input + change)
[elPlayers, elCourts, elRounds, elSeed, elCourtNames, elwT, elwO, elwP, elwBalance, elBeamWidth, elPartnerK, elSquare, elAvoidB2B, elPairMemory].forEach(el => {
  if (el) {
    ["change", "input"].forEach(evt => {
      el.addEventListener(evt, () => {
        clearMessages();
        autoSaveState();
      });
    });
  }
});

btnCopy.addEventListener("click", async () => {
  const result = window.__PB_LAST_RESULT__;
  if (!result) return;
  const lines = [];
  const courtCustomNames = parseCourtNames();

  result.rounds.forEach((matches, i) => {
    lines.push(`Tour ${i + 1}`);
    matches.forEach((m, j) => {
      const label = courtCustomNames[j] || `Terrain ${j + 1}`;
      lines.push(`  [${label}] ${fmtMatch(m)}`);
    });
    if (result.benches[i]?.length) lines.push(`  En pause : ${result.benches[i].join(", ")}`);
    if (result.absents[i]?.length) lines.push(`  Inactifs : ${result.absents[i].join(", ")}`);
    lines.push("");
  });

  const text = lines.join("\n").trim();
  if (await copyTextRobust(text)) {
    showToast("Matchs copiés");
  } else {
    await copyFallbackModal(text, { title: "Copier le planning" });
  }
});

function buildShareableUrl() {
  const state = getCurrentState();
  const jsonString = JSON.stringify(state);
  const compressedData = LZString.compressToEncodedURIComponent(jsonString);
  const urlBase = window.location.origin + window.location.pathname;
  return `${urlBase}?d=${compressedData}`;
}

async function copyShareUrl() {
  let urlToShare;
  try {
    urlToShare = buildShareableUrl();
  } catch (err) {
    console.error(err);
    await alertModal(
      "Impossible de construire le lien de partage (une dépendance requise n'a peut-être pas pu se charger).",
      { title: "Partage impossible", icon: "⚠️" }
    );
    return;
  }

  if (await copyTextRobust(urlToShare)) {
    showToast("Lien copié");
  } else {
    await copyFallbackModal(urlToShare, { title: "Copier le lien de partage", icon: "🔗" });
  }
}

if (btnCopyLink) btnCopyLink.addEventListener("click", () => copyShareUrl());
if (btnCopyRankingLink) btnCopyRankingLink.addEventListener("click", () => copyShareUrl());

if (btnExportPng) {
  btnExportPng.addEventListener("click", async () => {
    const targetArea = document.getElementById("rankingCaptureArea");
    if (!targetArea) return;

    // innerHTML (pas textContent) pour restaurer l'icône SVG du bouton une
    // fois l'export terminé, sinon elle disparaîtrait.
    const originalBtnHtml = btnExportPng.innerHTML;
    btnExportPng.textContent = "Génération…";
    btnExportPng.disabled = true;

    try {
      // Fond de l'image = fond de l'identité visuelle / du thème en cours.
      const pageBg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0b131d";
      const canvas = await html2canvas(targetArea, {
        backgroundColor: pageBg,
        scale: 2
      });

      // On affiche l'image dans la modale avec un vrai bouton "Télécharger" plutôt que
      // de déclencher un <a download> "invisible" au clic sur le bouton d'export : cette
      // technique échoue silencieusement dans une WebView Android brute (pas de gestionnaire
      // de téléchargement), alors qu'un <a download> déclenché depuis un clic explicite dans
      // la modale (et le long-press/clic droit sur l'image en complément) fonctionne mieux.
      const imageUri = canvas.toDataURL("image/png");
      await imagePreviewModal(imageUri, {
        title: "Classement — image générée",
        downloadFilename: `Classement-Pickleball-${elSeed.value || "session"}.png`,
        shareText: "🏓 Classement de la session"
      });
    } catch (err) {
      console.error(err);
      await alertModal(
        "Une erreur est survenue lors de la génération de l'image. Réessayez, ou changez de navigateur si le problème persiste.",
        { title: "Export impossible", icon: "⚠️" }
      );
    } finally {
      btnExportPng.innerHTML = originalBtnHtml;
      btnExportPng.disabled = false;
    }
  });
}


