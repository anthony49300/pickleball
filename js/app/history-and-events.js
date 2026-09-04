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
  localStorage.setItem("pb_history", JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  if (!elHistoryList) return;
  const history = getHistory();
  if (!history.length) {
    elHistoryList.innerHTML = `<p class="subtle">Aucune session enregistrée dans l'historique.</p>`;
    return;
  }

  elHistoryList.innerHTML = history.map(item => `
    <div class="history-card">
      <div>
        <h4>Session #${escapeHtml(item.seed)}</h4>
        <div class="subtle" style="font-size: 0.8rem; margin-top: 4px;">
          📅 ${escapeHtml(item.date)} · 👥 ${item.playersCount} Joueurs · 🔄 ${item.roundsCount} Tours
        </div>
      </div>
      <div class="history-actions">
        <button class="secondary load-hist-btn" data-id="${item.id}">Charger</button>
        <button class="secondary del-hist-btn" data-id="${item.id}" style="color: var(--danger);">Supprimer</button>
      </div>
    </div>
  `).join('');
}

if (elHistoryList) {
  elHistoryList.addEventListener("click", (e) => {
    const id = parseInt(e.target.dataset.id, 10);
    if (!id) return;

    let history = getHistory();

    if (e.target.classList.contains("load-hist-btn")) {
      const item = history.find(x => x.id === id);
      if (item) loadState(item.state);
    } else if (e.target.classList.contains("del-hist-btn")) {
      history = history.filter(x => x.id !== id);
      localStorage.setItem("pb_history", JSON.stringify(history));
      renderHistory();
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

    // Réinitialise l'état en mémoire
    window.__PB_SCORES__ = {};
    window.__PB_PRESENCE__ = {};
    window.__PB_LAST_RESULT__ = null;

    // Réinitialise les champs du formulaire à leurs valeurs par défaut
    elPlayers.value = "";
    elCourts.value = "2";
    elRounds.value = "8";
    elSeed.value = generateSeed();
    elCourtNames.value = "";
    elwT.value = "5";
    elwO.value = "2";
    elwP.value = "1";
    elBeamWidth.value = "80";
    elPartnerK.value = "10";
    elSquare.checked = true;
    elAvoidB2B.checked = true;

    // Nettoie l'URL (retire un éventuel paramètre de partage ?d=...) sans recharger
    window.history.replaceState({}, "", window.location.pathname);

    clearMessages();
    syncPresenceInputs();
    renderEmptyState();
    renderHistory();
  });
}

if (btnSaveToHistory) {
  btnSaveToHistory.addEventListener("click", () => {
    saveToHistory();
    btnSaveToHistory.textContent = "Session Sauvegardée !";
    setTimeout(() => (btnSaveToHistory.textContent = "💾 Enregistrer Session"), 1200);
  });
}


// =============================================================================
// EVENEMENTS GENERALISTES & FONCTIONNALITES EXPORT / PARTAGE
// =============================================================================

btnNewSeed.addEventListener("click", () => {
  elSeed.value = generateSeed();
  autoSaveState();
});

btnGenerate.addEventListener("click", () => {
  const hasScores = Object.keys(window.__PB_SCORES__).length > 0;
  generateSession(hasScores);
});

// Écoute instantanée sur la saisie des scores (input + change)
["input", "change"].forEach(evt => {
  elSchedule.addEventListener(evt, (e) => {
    if (e.target.classList.contains("score-input")) {
      const r = e.target.dataset.round;
      const m = e.target.dataset.match;
      const t = e.target.dataset.team;
      const val = parseInt(e.target.value, 10);
      
      const key = `${r}-${m}`;
      if (!window.__PB_SCORES__[key]) window.__PB_SCORES__[key] = {};
      window.__PB_SCORES__[key][t] = isNaN(val) ? null : val;
      
      if (window.__PB_LAST_RESULT__) {
        updateSessionStepper(window.__PB_LAST_RESULT__.rounds);
        
        // Re-marquer visuellement le tour actif sans régénérer tout le DOM
        const roundEls = elSchedule.querySelectorAll('.round');
        const activeIdx = updateSessionStepper(window.__PB_LAST_RESULT__.rounds);
        roundEls.forEach((el, idx) => {
          if (idx === activeIdx) {
            el.classList.add('active-round');
            if (!el.querySelector('.active-round-badge')) {
              const tags = el.querySelector('.round-tags');
              if (tags) {
                const b = document.createElement('span');
                b.className = 'active-round-badge';
                b.textContent = '⚡ Tour en cours';
                tags.prepend(b);
              }
            }
          } else {
            el.classList.remove('active-round');
            const badge = el.querySelector('.active-round-badge');
            if (badge) badge.remove();
          }
        });
      }

      updateRankings();
      autoSaveState();
    }
  });
});

// Écoute instantanée de tous les paramètres du formulaire (input + change)
[elPlayers, elCourts, elRounds, elSeed, elCourtNames, elwT, elwO, elwP, elBeamWidth, elPartnerK, elSquare, elAvoidB2B].forEach(el => {
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
    if (result.benches[i]?.length) lines.push(`  Banc : ${result.benches[i].join(", ")}`);
    if (result.absents[i]?.length) lines.push(`  Inactifs : ${result.absents[i].join(", ")}`);
    lines.push("");
  });

  const text = lines.join("\n").trim();
  if (await copyTextRobust(text)) {
    btnCopy.textContent = "Copié !";
    setTimeout(() => (btnCopy.textContent = "📋 Copier"), 900);
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

async function copyShareUrl(btnElement) {
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
    const originalText = btnElement.textContent;
    btnElement.textContent = "Lien copié !";
    setTimeout(() => (btnElement.textContent = originalText), 1500);
  } else {
    await copyFallbackModal(urlToShare, { title: "Copier le lien de partage", icon: "🔗" });
  }
}

if (btnCopyLink) btnCopyLink.addEventListener("click", () => copyShareUrl(btnCopyLink));
if (btnCopyRankingLink) btnCopyRankingLink.addEventListener("click", () => copyShareUrl(btnCopyRankingLink));

if (btnExportPng) {
  btnExportPng.addEventListener("click", async () => {
    const targetArea = document.getElementById("rankingCaptureArea");
    if (!targetArea) return;

    const originalBtnText = btnExportPng.textContent;
    btnExportPng.textContent = "⏳ Génération...";

    try {
      const canvas = await html2canvas(targetArea, {
        backgroundColor: "#0a0f18",
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
        downloadFilename: `Classement-Pickleball-${elSeed.value || "session"}.png`
      });
    } catch (err) {
      console.error(err);
      await alertModal(
        "Une erreur est survenue lors de la génération de l'image. Réessayez, ou changez de navigateur si le problème persiste.",
        { title: "Export impossible", icon: "⚠️" }
      );
    } finally {
      btnExportPng.textContent = originalBtnText;
    }
  });
}


