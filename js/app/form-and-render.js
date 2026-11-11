"use strict";

// =============================================================================
// FONCTIONS D'ANALYSE DU FORMULAIRE ET PRESENCE
// =============================================================================

// Libellés du niveau 1-5 (voir window.__PB_LEVELS__ et la fiche joueur dans
// players-ui.js) : 3 = valeur neutre par défaut tant que rien n'est renseigné.
const LEVEL_LABELS = { 1: "Débutant", 2: "Occasionnel", 3: "Intermédiaire", 4: "Avancé", 5: "Expert" };

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
 * Garantit une plage de présence et un niveau par défaut pour chaque joueur,
 * puis rafraîchit la liste des joueurs (pastilles, voir players-ui.js).
 * Les réglages individuels se font dans la fiche joueur.
 */
function syncPresenceInputs() {
  const players = parsePlayers(elPlayers.value);
  const totalRounds = parseInt(elRounds.value || "8", 10);

  players.forEach(p => {
    if (!window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p] = { start: 1, end: totalRounds };
    }
    // 3 = valeur neutre par défaut (voir LEVEL_LABELS) : tant qu'elle n'est
    // pas changée, ce joueur n'a aucun impact sur l'équilibrage (voir
    // levelGapPenalty dans algorithm.js).
    if (window.__PB_LEVELS__[p] == null) window.__PB_LEVELS__[p] = 3;
  });

  updatePlayerCountBadge();
  renderPlayerChips();
}

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

  elSchedule.innerHTML = "";
  if (elSessionStepper) elSessionStepper.innerHTML = "";
  if (elDiag) elDiag.innerHTML = "";
  if (elDiagSection) elDiagSection.hidden = true;

  elMeta.textContent = "";
  if (elRankingSection) elRankingSection.hidden = true;
  if (elHeatmapSection) elHeatmapSection.hidden = true;

  btnCopy.disabled = true;
  btnCopyLink.disabled = true;
  btnSaveToHistory.disabled = true;

  refreshPlayView();
}

/**
 * Un tour est complet quand TOUS ses matchs ont leurs deux scores saisis
 * (un tour sans match, faute de joueurs, compte comme complet).
 */
function isRoundComplete(rounds, rIdx) {
  return rounds[rIdx].every((match, mIdx) => {
    const sc = readMatchScore(window.__PB_SCORES__, rIdx, mIdx, match);
    return !!sc && sc["1"] != null && sc["2"] != null;
  });
}

/**
 * Tour en cours : le premier tour pas encore complet (le dernier si tous le sont).
 */
function getActiveRoundIndex(rounds) {
  if (!rounds || !rounds.length) return -1;
  const idx = rounds.findIndex((_, rIdx) => !isRoundComplete(rounds, rIdx));
  return idx === -1 ? rounds.length - 1 : idx;
}

/**
 * Met à jour la frise des tours (#sessionStepper) : un segment par tour,
 * plein s'il est complet, accentué s'il est en cours, encadré s'il est
 * affiché. Chaque segment est un bouton qui affiche ce tour.
 * @returns {number} l'index du tour en cours
 */
function updateSessionStepper(rounds, viewedIdx) {
  if (!elSessionStepper || !rounds || !rounds.length) return -1;

  const activeIdx = getActiveRoundIndex(rounds);
  elSessionStepper.innerHTML = rounds.map((_, idx) => {
    const done = isRoundComplete(rounds, idx);
    const current = idx === activeIdx && !done;
    const state = done ? ", scores saisis" : current ? ", en cours" : "";
    return `<button type="button" class="dot${done ? " is-done" : ""}${current ? " is-current" : ""}${idx === viewedIdx ? " is-view" : ""}" data-round="${idx}" aria-label="Tour ${idx + 1}${state}"${idx === viewedIdx ? ' aria-current="step"' : ""}></button>`;
  }).join("");

  return activeIdx;
}

/**
 * Carte d'un match : bandeau "terrain", puis une ligne par équipe avec ses
 * boutons −/+ autour du champ de score (.score-input, écouté dans
 * history-and-events.js). L'état visuel (gagnant, égalité...) est posé par
 * refreshMatchCard.
 */
function buildMatchCard(match, rIdx, mIdx, courtLabel) {
  const savedScore = readMatchScore(window.__PB_SCORES__, rIdx, mIdx, match);
  const teamRow = (team, teamNo) => {
    const label = escapeHtml(team.join(" et "));
    const value = savedScore?.[teamNo] ?? "";
    return `
      <div class="team-row" data-team="${teamNo}">
        <div class="team-names"><span>${team.map(escapeHtml).join("<br>")}</span><span class="win-tag">Gagnant</span></div>
        <div class="score-ctl">
          <button type="button" class="score-step" data-delta="-1" tabindex="-1" aria-label="Retirer un point à ${label}">−</button>
          <input type="number" class="score-input" data-round="${rIdx}" data-match="${mIdx}" data-team="${teamNo}" min="0" max="99" inputmode="numeric" placeholder="–" value="${value}" aria-label="Score de ${label}, tour ${rIdx + 1}" />
          <button type="button" class="score-step" data-delta="1" tabindex="-1" aria-label="Ajouter un point à ${label}">+</button>
        </div>
      </div>`;
  };

  const [t1, t2] = match;
  return `
    <article class="match-card" data-round="${rIdx}" data-match="${mIdx}">
      <header class="court-strip"><span class="court-name">${escapeHtml(courtLabel)}</span><span class="court-state"></span></header>
      ${teamRow(t1, "1")}
      <div class="net"><span>contre</span></div>
      ${teamRow(t2, "2")}
      <p class="tie-warning" hidden>Égalité : aucun vainqueur enregistré. Une partie de pickleball ne se termine pas à égalité, vérifiez le score.</p>
    </article>`;
}

/**
 * Met à jour l'état visuel d'une carte de match à partir des scores en mémoire.
 */
function refreshMatchCard(card) {
  const result = window.__PB_LAST_RESULT__;
  if (!card || !result) return;
  const rIdx = parseInt(card.dataset.round, 10);
  const mIdx = parseInt(card.dataset.match, 10);
  const match = result.rounds?.[rIdx]?.[mIdx];
  if (!match) return;

  const sc = readMatchScore(window.__PB_SCORES__, rIdx, mIdx, match);
  const s1 = sc?.["1"], s2 = sc?.["2"];
  const full = s1 != null && s2 != null;
  const tie = full && s1 === s2;

  const rows = card.querySelectorAll(".team-row");
  rows[0]?.classList.toggle("is-win", full && s1 > s2);
  rows[0]?.classList.toggle("is-lose", full && s1 < s2);
  rows[1]?.classList.toggle("is-win", full && s2 > s1);
  rows[1]?.classList.toggle("is-lose", full && s2 < s1);
  card.classList.toggle("is-done", full && !tie);
  card.classList.toggle("is-tie", tie);

  const state = card.querySelector(".court-state");
  if (state) state.textContent = !full ? "À saisir" : tie ? "Égalité ?" : `Terminé ${Math.max(s1, s2)}–${Math.min(s1, s2)}`;
  const tieWarning = card.querySelector(".tie-warning");
  if (tieWarning) tieWarning.hidden = !tie;
}

/**
 * Construit tous les tours du planning (un seul est affiché à la fois, voir
 * showRound dans navigation.js) ainsi que les diagnostics d'équité.
 */
function render(result, players, numCourts, numRounds) {
  elSchedule.innerHTML = "";
  if (elDiag) elDiag.innerHTML = "";

  const { rounds, benches, absents, stats } = result;
  const courtCustomNames = parseCourtNames();
  const courtLabel = (mIdx) => courtCustomNames[mIdx] || `Terrain ${mIdx + 1}`;

  elMeta.textContent = `${players.length} joueurs · ${numCourts} terrain${numCourts > 1 ? "s" : ""} · ${numRounds} tour${numRounds > 1 ? "s" : ""}`;

  const tagList = (names, extraClass = "") => `<div class="tags">${names.map(n => `<span class="tag${extraClass}">${escapeHtml(n)}</span>`).join("")}</div>`;

  elSchedule.innerHTML = rounds.map((matches, idx) => {
    const bench = benches[idx] || [];
    const absent = absents[idx] || [];
    const benchHtml = `
      <div class="bench-card">
        <div class="bench-group"><span class="eyebrow">Au banc</span>${bench.length ? tagList(bench) : `<span class="subtle">Personne ce tour-ci</span>`}</div>
        ${absent.length ? `<div class="bench-group"><span class="eyebrow">Absents</span>${tagList(absent, " is-absent")}</div>` : ""}
      </div>`;

    const courtsHtml = matches.length
      ? matches.map((m, mIdx) => buildMatchCard(m, idx, mIdx, courtLabel(mIdx))).join("")
      : `<p class="subtle">Pas assez de joueurs disponibles pour un match ce tour-ci.</p>`;

    const next = rounds[idx + 1];
    const nextHtml = next
      ? `<div class="next-card">
          <span class="eyebrow">Ensuite · tour ${idx + 2}</span>
          ${next.map((m, mIdx) => `<div class="next-row"><span class="next-court">${escapeHtml(courtCustomNames[mIdx] ? courtCustomNames[mIdx] : `T${mIdx + 1}`)}</span><span>${escapeHtml(m[0].join(" & "))} <em>contre</em> ${escapeHtml(m[1].join(" & "))}</span></div>`).join("")}
          ${benches[idx + 1]?.length ? `<div class="next-row"><span class="next-court">Banc</span><span>${escapeHtml(benches[idx + 1].join(", "))}</span></div>` : ""}
        </div>`
      : `<div class="next-card"><span class="eyebrow">Dernier tour</span><span class="subtle">Le classement final est dans l'onglet Classement.</span></div>`;

    return `
      <div class="round" data-round="${idx}" hidden>
        <div class="play-grid">
          ${benchHtml}
          <div class="courts">${courtsHtml}</div>
          ${nextHtml}
        </div>
      </div>`;
  }).join("");

  elSchedule.querySelectorAll(".match-card").forEach(refreshMatchCard);

  const plays = players.map(p => [p, stats.playsCount.get(p) ?? 0]);
  const benchesCount = players.map(p => [p, stats.benchCount.get(p) ?? 0]);

  const minPlays = Math.min(...plays.map(x => x[1]));
  const maxPlays = Math.max(...plays.map(x => x[1]));
  const minBen = Math.min(...benchesCount.map(x => x[1]));
  const maxBen = Math.max(...benchesCount.map(x => x[1]));

  const tmTop = topPairs(stats.teammateCount).map(([k, v]) => `${escapeHtml(k.replace("||", " & "))} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount).map(([k, v]) => `${escapeHtml(k.replace("||", " contre "))} (${v})`).join(", ");

  // Détection de la présence de matchs en simple dans la session
  const hasSingles = stats.singlesCount && Array.from(stats.singlesCount.values()).some(v => v > 0);
  const ratioLabel = hasSingles
    ? "Par joueur (J = joué, S = simple, B = banc)"
    : "Par joueur (J = joué, B = banc)";

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const j = stats.playsCount.get(p) ?? 0;
      const b = stats.benchCount.get(p) ?? 0;
      const s = stats.singlesCount?.get(p) ?? 0;
      return hasSingles
        ? `<strong>${escapeHtml(p)}</strong> ${j}J / ${s}S / ${b}B`
        : `<strong>${escapeHtml(p)}</strong> ${j}J / ${b}B`;
    })
    .join(" · ");

  if (elDiag) {
    elDiag.innerHTML = `
      <p><strong>Matchs joués :</strong> de ${minPlays} à ${maxPlays} par joueur</p>
      <p><strong>Passages au banc :</strong> de ${minBen} à ${maxBen} par joueur</p>
      <p><strong>Duos les plus fréquents :</strong> ${tmTop || "aucun"}</p>
      <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "aucune"}</p>
      <p><strong>${ratioLabel} :</strong> ${fairnessLine}</p>
    `;
  }

  if (elDiagSection) elDiagSection.hidden = false;

  renderHeatmap();
  updateRankings();

  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
  btnSaveToHistory.disabled = false;

  // Nouveau planning (génération ou chargement) : on affiche le tour en cours.
  showRound(getActiveRoundIndex(rounds));
}
