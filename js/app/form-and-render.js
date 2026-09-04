"use strict";

// =============================================================================
// FONCTIONS D'ANALYSE DU FORMULAIRE ET PRESENCE
// =============================================================================

/**
 * Efface les messages d'erreur et d'avertissement à l'écran.
 */
function clearMessages() {
  if (elError) elError.hidden = true;
  if (elWarning) elWarning.hidden = true;
}

/**
 * Découpe la saisie libre en une liste de noms de joueurs.
 * Normalise les espaces et déduplique les doublons (insensible à la casse et aux espaces),
 * pour éviter qu'un même joueur saisi deux fois (ex: "Marc" et "marc") ne fausse
 * silencieusement le classement et l'algorithme de rotation.
 */
function parsePlayers(text) {
  const lines = text.split(/\n/).flatMap(line => line.split(","));
  const seen = new Set();
  const result = [];
  for (const raw of lines) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * Compte le nombre d'entrées non vides de la saisie brute (avant déduplication),
 * pour pouvoir signaler à l'utilisateur si des doublons ont été ignorés.
 */
function countRawPlayerEntries(text) {
  return text.split(/\n/).flatMap(line => line.split(","))
    .map(s => s.trim().replace(/\s+/g, " "))
    .filter(Boolean).length;
}

function parseCourtNames() {
  const raw = elCourtNames.value.trim();
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Met à jour le badge affichant le nombre de joueurs détectés (et les doublons ignorés).
 */
function updatePlayerCountBadge() {
  const elPlayerCountBadge = document.getElementById("playerCountBadge");
  if (!elPlayerCountBadge) return;

  const players = parsePlayers(elPlayers.value);
  const duplicates = countRawPlayerEntries(elPlayers.value) - players.length;
  const label = players.length > 1 ? "joueurs" : "joueur";

  elPlayerCountBadge.textContent = duplicates > 0
    ? `${players.length} ${label} · ${duplicates} doublon${duplicates > 1 ? "s" : ""} ignoré${duplicates > 1 ? "s" : ""}`
    : `${players.length} ${label}`;
  elPlayerCountBadge.classList.toggle("has-duplicates", duplicates > 0);
}

/**
 * Synchronise l'interface des plages d'arrivée/départ pour chaque joueur.
 */
function syncPresenceInputs() {
  const players = parsePlayers(elPlayers.value);
  const totalRounds = parseInt(elRounds.value || "8", 10);

  updatePlayerCountBadge();
  elPresenceList.innerHTML = "";

  players.forEach(p => {
    if (!window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p] = { start: 1, end: totalRounds };
    }

    const item = document.createElement("div");
    item.className = "presence-item";
    item.innerHTML = `
      <span><strong>${escapeHtml(p)}</strong></span>
      <div class="presence-inputs">
        <label style="font-size: 0.75rem;">De</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].start}" data-player="${escapeHtml(p)}" data-type="start" />
        <label style="font-size: 0.75rem;">à</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].end}" data-player="${escapeHtml(p)}" data-type="end" />
      </div>
    `;
    elPresenceList.appendChild(item);
  });
}

// Écoute dynamique sur la présence (instantanée sur input et change)
["change", "input"].forEach(evt => {
  elPresenceList.addEventListener(evt, (e) => {
    const p = e.target.dataset.player;
    const type = e.target.dataset.type;
    const val = parseInt(e.target.value, 10);
    
    if (p && type && window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p][type] = isNaN(val) ? 1 : val;
      autoSaveState();
    }
  });
});

elPlayers.addEventListener("input", () => {
  clearMessages();
  syncPresenceInputs();
  autoSaveState();
});

elRounds.addEventListener("input", () => {
  clearMessages();
  syncPresenceInputs();
  autoSaveState();
});


// =============================================================================
// RENDU VISUEL DU PLANNING (HTML) ET ETAT VIDE
// =============================================================================

/**
 * Affiche un visuel neutre lorsqu'aucune session n'est générée ou chargée.
 */
function renderEmptyState() {
  clearMessages();
  window.__PB_LAST_RESULT__ = null;

  elSchedule.innerHTML = `
    <div class="empty-state-card" style="text-align: center; padding: 2.5rem 1rem; border: 2px dashed rgba(255,255,255,0.15); border-radius: 12px; margin: 1.5rem 0;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎾</div>
      <h3 style="margin-bottom: 0.5rem;">Aucune session active</h3>
      <p class="subtle" style="max-width: 400px; margin: 0 auto;">
        Renseignez vos joueurs et vos paramètres, puis cliquez sur <strong>Générer</strong> pour créer un nouveau planning.
      </p>
    </div>
  `;
  
  if (elSessionStepper) elSessionStepper.hidden = true;
  if (elDiag) elDiag.innerHTML = "";
  if (elDiagSection) elDiagSection.hidden = true;
  
  elMeta.textContent = "";
  if (elRankingSection) elRankingSection.hidden = true;
  if (elHeatmapSection) elHeatmapSection.hidden = true;
  
  btnCopy.disabled = true;
  btnCopyLink.disabled = true;
  btnSaveToHistory.disabled = true;
}

/**
 * Met à jour le Stepper d'Étape de Session.
 */
function updateSessionStepper(rounds) {
  if (!elSessionStepper || !rounds || !rounds.length) return;
  
  elSessionStepper.hidden = false;
  elSessionStepper.innerHTML = "";

  // Un tour est considéré comme complété si TOUS ses matchs ont des scores saisis
  let activeRoundIndex = -1;
  const roundStatuses = rounds.map((matches, rIdx) => {
    if (!matches.length) return true;
    let isComplete = true;
    matches.forEach((_, mIdx) => {
      const key = `${rIdx}-${mIdx}`;
      const sc = window.__PB_SCORES__[key];
      if (!sc || sc['1'] == null || sc['2'] == null) {
        isComplete = false;
      }
    });
    return isComplete;
  });

  // Le tour actif est le premier tour non entièrement complété
  activeRoundIndex = roundStatuses.findIndex(status => status === false);
  if (activeRoundIndex === -1 && roundStatuses.length > 0) {
    activeRoundIndex = roundStatuses.length - 1; // Tous complétés
  }

  rounds.forEach((_, idx) => {
    const isCompleted = roundStatuses[idx];
    const isActive = (idx === activeRoundIndex) && !isCompleted;

    const stepItem = document.createElement("div");
    stepItem.className = `step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;
    stepItem.innerHTML = `
      <div class="step-number">${isCompleted ? '✓' : idx + 1}</div>
      <span>Tour ${idx + 1}</span>
    `;
    elSessionStepper.appendChild(stepItem);

    if (idx < rounds.length - 1) {
      const divider = document.createElement("div");
      divider.className = `step-divider ${isCompleted ? 'active' : ''}`;
      elSessionStepper.appendChild(divider);
    }
  });

  return activeRoundIndex;
}

/**
 * Construit la structure HTML affichant les terrains, matchs, scores et diagnostics.
 */
function render(result, players, numCourts, numRounds) {
  elSchedule.innerHTML = "";
  if (elDiag) elDiag.innerHTML = "";

  const { rounds, benches, absents, stats } = result;
  const courtCustomNames = parseCourtNames();

  elMeta.textContent = `${players.length} Joueurs · ${numCourts} Terrain(s) · ${numRounds} Tours`;

  const activeRoundIndex = updateSessionStepper(rounds);

  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    const isActiveRound = (idx === activeRoundIndex);
    wrap.className = `round ${isActiveRound ? 'active-round' : ''}`;

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    
    const tagsDiv = document.createElement("div");
    tagsDiv.className = "round-tags";

    if (isActiveRound) {
      const activeBadge = document.createElement("span");
      activeBadge.className = "active-round-badge";
      activeBadge.textContent = "⚡ Tour en cours";
      tagsDiv.appendChild(activeBadge);
    }

    if (benches[idx]?.length) {
      const bench = document.createElement("span");
      bench.className = "bench";
      bench.textContent = `🪑 Banc: ${benches[idx].join(", ")}`;
      tagsDiv.appendChild(bench);
    }

    if (absents[idx]?.length) {
      const absent = document.createElement("span");
      absent.className = "absent-tag";
      absent.textContent = `⏸️ Inactifs: ${absents[idx].join(", ")}`;
      tagsDiv.appendChild(absent);
    }

    titleRow.appendChild(h3);
    titleRow.appendChild(tagsDiv);
    wrap.appendChild(titleRow);

    if (!matches.length) {
      const p = document.createElement("div");
      p.className = "subtle";
      p.style.marginTop = "8px";
      p.textContent = "Pas assez de joueurs disponibles pour un match ce tour-ci.";
      wrap.appendChild(p);
    } else {
      const matchesList = document.createElement("div");
      matchesList.className = "matches-list";

      matches.forEach((m, mIdx) => {
        const [t1, t2] = m;
        const courtLabel = escapeHtml(courtCustomNames[mIdx] || `Terrain ${mIdx + 1}`);
        const matchCard = document.createElement("div");
        matchCard.className = "match-card";

        // Récupération des scores sauvegardés en mémoire pour réinjection direct
        const key = `${idx}-${mIdx}`;
        const savedScore1 = window.__PB_SCORES__[key]?.['1'] ?? "";
        const savedScore2 = window.__PB_SCORES__[key]?.['2'] ?? "";

        matchCard.innerHTML = `
          <span class="court-badge">${courtLabel}</span>
          <div class="team-score">
            <span class="team">${t1.map(escapeHtml).join(" & ")}</span>
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="1" min="0" placeholder="-" value="${savedScore1}" />
          </div>
          <span class="vs">VS</span>
          <div class="team-score">
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="2" min="0" placeholder="-" value="${savedScore2}" />
            <span class="team">${t2.map(escapeHtml).join(" & ")}</span>
          </div>
        `;
        matchesList.appendChild(matchCard);
      });
      wrap.appendChild(matchesList);
    }

    elSchedule.appendChild(wrap);
  });

  const plays = players.map(p => [p, stats.playsCount.get(p) ?? 0]);
  const benchesCount = players.map(p => [p, stats.benchCount.get(p) ?? 0]);

  const minPlays = Math.min(...plays.map(x => x[1]));
  const maxPlays = Math.max(...plays.map(x => x[1]));
  const minBen = Math.min(...benchesCount.map(x => x[1]));
  const maxBen = Math.max(...benchesCount.map(x => x[1]));

  const tmTop = topPairs(stats.teammateCount).map(([k, v]) => `${escapeHtml(k.replace("||", " & "))} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount).map(([k, v]) => `${escapeHtml(k.replace("||", " vs "))} (${v})`).join(", ");

  // Détection de la présence de matchs en simple dans la session
  const hasSingles = stats.singlesCount && Array.from(stats.singlesCount.values()).some(v => v > 0);
  const ratioLabel = hasSingles
    ? "Ratio individuel (J=Joué, S=Simple, B=Banc)"
    : "Ratio individuel (J=Joué, B=Banc)";

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const j = stats.playsCount.get(p) ?? 0;
      const b = stats.benchCount.get(p) ?? 0;
      const s = stats.singlesCount?.get(p) ?? 0;
      return hasSingles
        ? `<strong>${escapeHtml(p)}</strong> : ${j}J / ${s}S / ${b}B`
        : `<strong>${escapeHtml(p)}</strong> : ${j}J / ${b}B`;
    })
    .join(" · ");

  if (elDiag) {
    elDiag.innerHTML = `
      <p><strong>Équilibre Matchs :</strong> Min ${minPlays} - Max ${maxPlays} joués</p>
      <p><strong>Équilibre Banc :</strong> Min ${minBen} - Max ${maxBen} passages</p>
      <p><strong>Paires les plus fréquentes :</strong> ${tmTop || "Aucune"}</p>
      <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "Aucune"}</p>
      <p><strong>${ratioLabel} :</strong> ${fairnessLine}</p>
    `;
  }

  if (elDiagSection) elDiagSection.hidden = false;

  renderHeatmap();
  updateRankings();

  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
  btnSaveToHistory.disabled = false;
}


