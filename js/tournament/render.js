"use strict";

// =============================================================================
// MODE TOURNOI — RENDU (équipes, répartition manuelle, poules, classements)
// =============================================================================

/**
 * Met à jour le badge "X équipe(s)" à côté du champ de saisie.
 */
function updateTeamCountBadge() {
  const { teams } = parseTeams(elTeams.value);
  elTeamCountBadge.textContent = `${teams.length} équipe${teams.length > 1 ? "s" : ""}`;
}

/**
 * Remplit la liste déroulante d'import à partir des groupes de joueurs
 * enregistrés par le mode Rotation (localStorage partagé entre les deux pages).
 */
function renderImportGroupOptions() {
  let groups = [];
  try {
    groups = JSON.parse(localStorage.getItem("pb_player_groups") || "[]");
  } catch {
    groups = [];
  }

  const options = groups
    .map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.players.length} joueur${g.players.length > 1 ? "s" : ""})</option>`)
    .join("");

  elImportGroupSelect.innerHTML = `<option value="">— Importer depuis un groupe enregistré —</option>${options}`;
}

/**
 * Affiche la liste éditable "équipe → poule" du mode de répartition manuelle.
 * @param {Array} teams
 * @param {number} numPools
 * @param {Object<number,number>} currentAssignment - id d'équipe → index de poule
 */
function renderManualAssignList(teams, numPools, currentAssignment) {
  elManualAssignList.innerHTML = teams.map(team => {
    const selected = currentAssignment[team.id] ?? 0;
    const options = Array.from({ length: numPools }, (_, i) =>
      `<option value="${i}" ${i === selected ? "selected" : ""}>Poule ${String.fromCharCode(65 + i)}</option>`
    ).join("");

    return `
      <div class="manual-assign-row">
        <span class="team-name">${escapeHtml(team.name)}</span>
        <select class="manual-pool-select" data-team-id="${team.id}">${options}</select>
      </div>
    `;
  }).join("");
}

/**
 * Enveloppe le rendu d'un match réel (score à saisir — pas un repos/bye, pas
 * une affiche déjà résolue par forfait, qui restent déjà des lignes compactes
 * sans rien à replier) dans un conteneur muni d'un bouton masquer/afficher
 * (voir events.js, délégation `.match-hide-btn`). Masquer un match est
 * purement visuel : ça ne touche à aucun score, juste au rendu (`innerHtml`
 * replié en un intitulé compact "Équipe A vs Équipe B").
 * @param {string} hideKey - identifiant stable du match (voir appelants)
 * @param {string} label - intitulé affiché une fois replié
 * @param {string} innerHtml - rendu complet du match (déplié)
 * @param {Set<string>} hiddenMatchKeys
 */
function wrapHideableMatch(hideKey, label, innerHtml, hiddenMatchKeys) {
  const isHidden = !!hiddenMatchKeys?.has(hideKey);
  return `
    <div class="match-wrapper ${isHidden ? "match-hidden" : ""}">
      <button type="button" class="match-hide-btn" data-hide-key="${hideKey}" title="${isHidden ? "Afficher ce match" : "Masquer ce match"}" aria-label="${isHidden ? "Afficher" : "Masquer"} le match ${label}">${isHidden ? "👁️" : "🙈"}</button>
      <div class="match-hidden-label">${label}</div>
      <div class="match-hideable-content">${innerHtml}</div>
    </div>
  `;
}

/**
 * Affiche le calendrier de chaque poule avec les champs de saisie des scores.
 * Reprend exactement le visuel "terrain de pickleball" du mode Rotation
 * (mêmes classes : match-card, court-badge, team-score, team, vs, score-input)
 * pour une apparence cohérente entre les deux modes.
 * @param {Array} pools
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {number[][]} courtAllocation - pour chaque poule, les index de
 *   terrain (0-based) qui lui sont attribués (voir allocateCourtsToPools) ;
 *   les matchs d'une même journée y cyclent dans l'ordre.
 * @param {number[]} hiddenPoolIndices - index de poules repliées manuellement
 *   (voir events.js, bouton `.pool-hide-btn`)
 * @param {Set<string>} hiddenMatchKeys - voir wrapHideableMatch
 */
function renderPools(pools, courtNames = [], courtAllocation = [], hiddenPoolIndices = [], hiddenMatchKeys = new Set()) {
  elPoolsContainer.innerHTML = pools.map((pool, poolIdx) => {
    const poolCourts = courtAllocation[poolIdx]?.length ? courtAllocation[poolIdx] : [poolIdx];
    const isPoolHidden = hiddenPoolIndices.includes(poolIdx);

    const roundsHtml = pool.rounds.map((matches, rIdx) => {
      const matchesHtml = matches.map((match, mIdx) => {
        if (match.bye) {
          return `<div class="subtle" style="padding: 6px 2px;">🪑 Repos ce tour : <strong>${escapeHtml(match.team.name)}</strong></div>`;
        }

        const score = pool.scores[`${rIdx}-${mIdx}`] || {};
        const globalCourtIdx = poolCourts[mIdx % poolCourts.length];
        const courtLabel = escapeHtml(courtNames[globalCourtIdx] || `Terrain ${globalCourtIdx + 1}`);
        const forfeitBadge = score.forfeit ? `<span class="forfeit-badge" title="Résultat automatique (forfait)">🚫 Forfait</span>` : "";
        const matchCardHtml = `
          <div class="match-card">
            <span class="court-badge">${courtLabel}</span>
            ${forfeitBadge}
            <div class="team-score">
              <span class="team">${escapeHtml(match.a.name)}</span>
              <input type="number" class="score-input" min="0" placeholder="-" data-pool="${poolIdx}" data-round="${rIdx}" data-match="${mIdx}" data-side="a" value="${score.a ?? ""}" />
            </div>
            <span class="vs">VS</span>
            <div class="team-score">
              <input type="number" class="score-input" min="0" placeholder="-" data-pool="${poolIdx}" data-round="${rIdx}" data-match="${mIdx}" data-side="b" value="${score.b ?? ""}" />
              <span class="team">${escapeHtml(match.b.name)}</span>
            </div>
          </div>
        `;
        const hideKey = `pool:${poolIdx}:${rIdx}:${mIdx}`;
        const label = `${escapeHtml(match.a.name)} vs ${escapeHtml(match.b.name)}`;
        return wrapHideableMatch(hideKey, label, matchCardHtml, hiddenMatchKeys);
      }).join("");

      return `
        <div class="round">
          <div class="roundTitle"><h3>Journée ${rIdx + 1}</h3></div>
          <div class="matches-list">${matchesHtml}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="pool-card ${isPoolHidden ? "pool-collapsed" : ""}">
        <div class="pool-card-header">
          <h3 class="pool-card-title">${escapeHtml(pool.name)}</h3>
          <button type="button" class="round-hide-btn pool-hide-btn" data-pool-index="${poolIdx}" title="${isPoolHidden ? "Afficher cette poule" : "Masquer cette poule"}">${isPoolHidden ? "👁️ Afficher" : "🙈 Masquer"}</button>
        </div>
        <div class="pool-content">${roundsHtml}</div>
      </div>
    `;
  }).join("");
}

/**
 * Affiche le tableau de classement de chaque poule, en surlignant les équipes
 * actuellement qualifiées pour la phase finale. Chaque équipe peut y être
 * renommée (✏️) ou déclarée forfait (🚫) — seul endroit où chaque équipe est
 * listée individuellement quel que soit l'avancement du tournoi (voir
 * events.js, section "RENOMMAGE ET FORFAIT D'UNE EQUIPE").
 * @param {Array} pools
 * @param {number} qualifiersPerPool
 * @param {Set<number>} forfeitedTeamIds
 */
function renderPoolStandings(pools, qualifiersPerPool, forfeitedTeamIds = new Set()) {
  elPoolStandingsContainer.innerHTML = pools.map(pool => {
    const standings = computePoolStandings(pool);

    const rows = standings.map((s, i) => {
      const qualified = i < qualifiersPerPool;
      const forfeited = forfeitedTeamIds.has(s.team.id);
      const diffSign = s.diff > 0 ? "+" : "";
      const teamNameEscaped = escapeHtml(s.team.name);
      return `
        <tr class="${qualified ? "qualified" : ""} ${forfeited ? "forfeited" : ""}">
          <td>${i + 1}</td>
          <td>
            <span class="team-name-text">${teamNameEscaped}</span>
            <span class="team-name-actions">
              <button type="button" class="icon-btn team-rename-btn" data-team-id="${s.team.id}" title="Renommer l'équipe" aria-label="Renommer ${teamNameEscaped}">✏️</button>
              <button type="button" class="icon-btn team-forfeit-btn ${forfeited ? "active" : ""}" data-team-id="${s.team.id}" data-team-name="${teamNameEscaped}" title="${forfeited ? "Annuler le forfait" : "Déclarer forfait"}" aria-label="${forfeited ? "Annuler le forfait de" : "Déclarer forfait pour"} ${teamNameEscaped}">🚫</button>
            </span>
          </td>
          <td>${s.m}</td>
          <td>${s.w}</td>
          <td>${s.l}</td>
          <td>${s.pf}</td>
          <td>${s.pa}</td>
          <td>${diffSign}${s.diff}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="pool-standing-card">
        <h3>${escapeHtml(pool.name)}</h3>
        <table class="ranking-table">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Équipe</th>
              <th>MJ</th>
              <th>V</th>
              <th>D</th>
              <th>PP</th>
              <th>PC</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");
}

/**
 * Affiche les affiches d'un tour/segment de phase finale. Reprend les mêmes
 * classes que les matchs de poule (match-card, court-badge, team-score, team,
 * vs, score-input) pour une apparence cohérente.
 * @param {Array} pairs - paires [a, b] où a/b sont {team} ou {bye:true}
 * @param {Object} scores - scores saisis, indexés par position dans `pairs`
 * @param {boolean} editable - true pour le tour en cours (saisie active),
 *   false pour l'historique (déjà joué, affiché en lecture seule)
 * @param {string|null} segmentId - identifiant du segment (nécessaire si editable)
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {Map<string,number>|null} activeCourtAssignment - pour le tour en
 *   cours uniquement (editable=true) : terrain (0-based) attribué à chaque
 *   match, calculé globalement à travers tous les brackets actifs en même
 *   temps (voir assignCourtsToActiveMatches). Sans elle, replie sur la
 *   position locale dans `pairs` (historique : un terrain "réservé" n'a plus
 *   d'importance pour un match déjà joué).
 * @param {number} phaseIdx - index de la phase (0 = finalPhase, 1 =
 *   consolationPhase...) : les ids de segment ne sont PAS uniques entre deux
 *   phases (buildFinalPhase part toujours de "seg-1"), phaseIdx désambiguïse
 *   la clé de recherche dans activeCourtAssignment.
 * @param {Set<number>|null} forfeitedTeamIds - voir setTeamForfeited
 *   (engine.js) : une affiche impliquant l'une de ces équipes n'a jamais de
 *   score saisi (elle est résolue automatiquement dès qu'elle apparaît, voir
 *   progressFinalPhase), on l'affiche donc comme le repos ci-dessus plutôt
 *   que comme un match à saisir.
 * @param {Set<string>|null} hiddenMatchKeys - voir wrapHideableMatch ; ne
 *   s'applique qu'aux vrais matchs (score à saisir), pas aux affiches de
 *   repos/forfait ci-dessus, déjà des lignes compactes.
 */
function renderBracketPairs(pairs, scores, editable, segmentId, courtNames = [], activeCourtAssignment = null, phaseIdx = 0, forfeitedTeamIds = null, hiddenMatchKeys = null) {
  return pairs.map(([a, b], idx) => {
    if (a.bye && b.bye) return "";

    if (a.bye || b.bye) {
      const realTeam = a.bye ? b.team : a.team;
      return `<div class="subtle" style="padding: 6px 2px;">🪑 <strong>${escapeHtml(realTeam.name)}</strong> qualifié(e) sans jouer (repos)</div>`;
    }

    const aForfeited = forfeitedTeamIds?.has(a.team.id);
    const bForfeited = forfeitedTeamIds?.has(b.team.id);
    if (aForfeited || bForfeited) {
      const winner = aForfeited ? b.team : a.team;
      const loser = aForfeited ? a.team : b.team;
      return `<div class="subtle" style="padding: 6px 2px;">🚫 <strong>${escapeHtml(loser.name)}</strong> forfait — <strong>${escapeHtml(winner.name)}</strong> qualifié(e) sans jouer</div>`;
    }

    const score = scores[idx] || {};
    const readonlyAttr = editable ? "" : "readonly";
    const dataAttrs = editable ? `data-segment="${segmentId}" data-match="${idx}"` : "";
    const courtIdx = activeCourtAssignment?.get(`${phaseIdx}-${segmentId}-${idx}`) ?? idx;
    const courtLabel = escapeHtml(courtNames[courtIdx] || `Terrain ${courtIdx + 1}`);
    const matchCardHtml = `
      <div class="match-card">
        <span class="court-badge">${courtLabel}</span>
        <div class="team-score">
          <span class="team">${escapeHtml(a.team.name)}</span>
          <input type="number" class="score-input bracket-score-input" min="0" placeholder="-" ${dataAttrs} data-side="a" ${readonlyAttr} value="${score.a ?? ""}" />
        </div>
        <span class="vs">VS</span>
        <div class="team-score">
          <input type="number" class="score-input bracket-score-input" min="0" placeholder="-" ${dataAttrs} data-side="b" ${readonlyAttr} value="${score.b ?? ""}" />
          <span class="team">${escapeHtml(b.team.name)}</span>
        </div>
      </div>
    `;
    const hideKey = `bracket:${phaseIdx}:${segmentId}:${idx}`;
    const label = `${escapeHtml(a.team.name)} vs ${escapeHtml(b.team.name)}`;
    return wrapHideableMatch(hideKey, label, matchCardHtml, hiddenMatchKeys);
  }).join("");
}

/**
 * Affiche l'intégralité d'un bracket à classement complet (phase finale OU
 * matchs de classement des non-qualifiés — même moteur, même affichage) :
 * l'historique des tours déjà joués (en lecture seule) suivi des segments
 * encore en cours (saisie active).
 * @param {Object} phase - finalPhase ou consolationPhase (voir engine.js)
 * @param {HTMLElement} container
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {Map<string,number>|null} activeCourtAssignment - voir renderBracketPairs
 *   et assignCourtsToActiveMatches (calculée à travers tous les brackets
 *   actifs en même temps, pas seulement celui-ci).
 * @param {number} phaseIdx - voir renderBracketPairs (0 pour finalPhase, 1
 *   pour consolationPhase — doit correspondre à l'ordre passé à
 *   assignCourtsToActiveMatches pour que les clés se retrouvent).
 * @param {Set<number>|null} forfeitedTeamIds - voir renderBracketPairs
 * @param {Set<string>|null} hiddenMatchKeys - voir wrapHideableMatch
 */
function renderBracketPhase(phase, container, courtNames = [], activeCourtAssignment = null, phaseIdx = 0, forfeitedTeamIds = null, hiddenMatchKeys = null) {
  if (!phase) {
    container.innerHTML = "";
    return;
  }

  const historyCards = phase.rounds.map(round => `
    <div class="pool-card">
      <h3 class="pool-card-title">${escapeHtml(round.label)}</h3>
      <div class="round">
        <div class="matches-list">${renderBracketPairs(round.pairs, round.scores, false, round.segmentId, courtNames, null, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)}</div>
      </div>
    </div>
  `);

  const activeCards = phase.segments
    .filter(segment => segment.slots.length > 1)
    .map(segment => `
      <div class="pool-card">
        <h3 class="pool-card-title">${escapeHtml(segmentLabel(segment))}</h3>
        <div class="round">
          <div class="matches-list">${renderBracketPairs(segmentPairs(segment), segment.scores, true, segment.id, courtNames, activeCourtAssignment, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)}</div>
        </div>
      </div>
    `);

  container.innerHTML = [...historyCards, ...activeCards].join("");
}

/**
 * Réaffiche la phase finale ET les matchs de classement ensemble, avec une
 * attribution de terrain partagée entre les deux (voir
 * assignCourtsToActiveMatches) — sinon chacun recommence sa numérotation à
 * "Terrain 1" indépendamment, alors qu'ils peuvent tourner en même temps et
 * ne peuvent pas physiquement partager les mêmes terrains. L'ordre passé ici
 * (finalPhase = index 0, consolationPhase = index 1) doit correspondre à
 * celui utilisé pour construire `assignment`.
 */
function renderBothBracketPhases(tournament) {
  const assignment = assignCourtsToActiveMatches(
    [tournament.finalPhase, tournament.consolationPhase],
    tournament.numCourts
  );
  const forfeitedTeamIds = new Set(tournament.forfeitedTeamIds || []);
  const hiddenMatchKeys = new Set(tournament.hiddenMatchKeys || []);
  renderBracketPhase(tournament.finalPhase, elFinalPhaseContainer, tournament.courtNames, assignment, 0, forfeitedTeamIds, hiddenMatchKeys);
  renderBracketPhase(tournament.consolationPhase, elConsolationPhaseContainer, tournament.courtNames, assignment, 1, forfeitedTeamIds, hiddenMatchKeys);
}

/**
 * Podium visuel des 3 premiers du classement final (mêmes classes que le
 * podium du mode Rotation : podium-container/podium-step/gold/silver/bronze).
 */
function renderFinalPodium(combined, statsByTeamId) {
  if (combined.length < 3) return "";

  const statLine = r => {
    const s = statsByTeamId.get(r.team.id) || { w: 0, pf: 0, pa: 0 };
    const diff = s.pf - s.pa;
    return `${s.w}V · ${diff > 0 ? "+" : ""}${diff}`;
  };

  const [p1, p2, p3] = combined;
  return `
    <div class="podium-container">
      <div class="podium-step silver">
        <div class="podium-avatar">🥈</div>
        <div class="podium-name">${escapeHtml(p2.team.name)}</div>
        <div class="podium-stats">${statLine(p2)}</div>
      </div>
      <div class="podium-step gold">
        <div class="podium-avatar">🥇</div>
        <div class="podium-name">${escapeHtml(p1.team.name)}</div>
        <div class="podium-stats">${statLine(p1)}</div>
      </div>
      <div class="podium-step bronze">
        <div class="podium-avatar">🥉</div>
        <div class="podium-name">${escapeHtml(p3.team.name)}</div>
        <div class="podium-stats">${statLine(p3)}</div>
      </div>
    </div>
  `;
}

/**
 * Retrouve une équipe par id n'importe où dans le tournoi (liste d'équipes,
 * ou à défaut poules). Sert à retrouver le nom d'une équipe forfait AVANT le
 * tirage d'un bracket (voir renderFinalRanking) : elle n'apparaît alors dans
 * AUCUN classement de bracket calculé (elle n'a jamais été tirée au sort,
 * voir seedTeamsByPoolRange), il faut donc aller chercher son nom ailleurs.
 */
function findTeamById(tournament, teamId) {
  const inTeams = (tournament.teams || []).find(t => t.id === teamId);
  if (inTeams) return inTeams;
  for (const pool of tournament.pools || []) {
    const found = pool.teams.find(t => t.id === teamId);
    if (found) return found;
  }
  return null;
}

/**
 * Affiche (ou masque) le classement final complet du tournoi, en fusionnant
 * la phase finale (places 1..N) et les matchs de classement des non-qualifiés
 * (places N+1..) — ce qui est déjà résolu s'affiche au fur et à mesure, même
 * si l'autre bracket n'est pas encore terminé (ou pas encore lancé). Podium
 * pour le top 3, tableau avec les statistiques agrégées sur tout le tournoi
 * (poules + phase finale + matchs de classement).
 *
 * Une équipe déclarée forfait AVANT le tirage d'un bracket (encore en phase
 * de poules) n'est tirée au sort dans AUCUN des deux brackets — sa place y
 * est prise par la suivante de sa poule (voir seedTeamsByPoolRange) — donc
 * absente des classements ci-dessus alors que le principe de ce mode est que
 * TOUTE équipe inscrite obtienne une place : elle est ajoutée en fin de
 * liste, avec les places restantes (dans l'ordre où les forfaits ont été
 * déclarés), visuellement distinguée comme forfait plutôt que classée sur un
 * vrai parcours.
 */
function renderFinalRanking(tournament) {
  const fromFinalPhase = tournament?.finalPhase?.finalRanking || [];
  const fromConsolationPhase = tournament?.consolationPhase?.finalRanking || [];
  const combined = [...fromFinalPhase, ...fromConsolationPhase].sort((a, b) => a.rank - b.rank);

  const rankedTeamIds = new Set(combined.map(r => r.team.id));
  const forfeitedBeforeBracket = (tournament.forfeitedTeamIds || [])
    .filter(id => !rankedTeamIds.has(id))
    .map(id => findTeamById(tournament, id))
    .filter(Boolean);

  if (!combined.length && !forfeitedBeforeBracket.length) {
    elFinalRankingSection.hidden = true;
    return;
  }

  const statsByTeamId = computeOverallTeamStats(tournament);
  const zeroStats = { m: 0, w: 0, l: 0, pf: 0, pa: 0 };

  const rows = combined.map(r => {
    const s = statsByTeamId.get(r.team.id) || zeroStats;
    const diff = s.pf - s.pa;
    const diffClass = diff > 0 ? "diff-positive" : diff < 0 ? "diff-negative" : "";
    const diffSign = diff > 0 ? "+" : "";
    return `
      <tr>
        <td>${r.rank}</td>
        <td>${escapeHtml(r.team.name)}</td>
        <td>${s.m}</td>
        <td>${s.w}</td>
        <td>${s.l}</td>
        <td>${s.pf}</td>
        <td>${s.pa}</td>
        <td class="${diffClass}">${diffSign}${diff}</td>
      </tr>
    `;
  }).join("") + forfeitedBeforeBracket.map((team, i) => {
    const s = statsByTeamId.get(team.id) || zeroStats;
    const diff = s.pf - s.pa;
    const diffSign = diff > 0 ? "+" : "";
    return `
      <tr class="forfeited">
        <td>${combined.length + i + 1}</td>
        <td>${escapeHtml(team.name)} <span class="forfeit-badge-inline">🚫 Forfait</span></td>
        <td>${s.m}</td>
        <td>${s.w}</td>
        <td>${s.l}</td>
        <td>${s.pf}</td>
        <td>${s.pa}</td>
        <td>${diffSign}${diff}</td>
      </tr>
    `;
  }).join("");

  elFinalRankingContainer.innerHTML = `
    ${renderFinalPodium(combined, statsByTeamId)}
    <div style="overflow-x:auto;">
      <table class="ranking-table">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Équipe</th>
            <th>MJ</th>
            <th>V</th>
            <th>D</th>
            <th>PP</th>
            <th>PC</th>
            <th>+/-</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="subtle" style="margin-top: 0.75rem; font-size: 0.8rem;">
      💡 <strong>Le rang est déterminé par le parcours en phase finale et matchs de classement</strong> (qui a gagné/perdu chaque match d'élimination), pas par les statistiques ci-dessus — elles sont uniquement informatives.
    </p>
    ${forfeitedBeforeBracket.length ? `
      <p class="subtle" style="font-size: 0.8rem;">
        🚫 <strong>${forfeitedBeforeBracket.length > 1 ? "Équipes forfait" : "Équipe forfait"}</strong> avant le tirage d'un bracket : sa place dans la poule a été prise par l'équipe suivante (voir le classement de poule), d'où les dernières places ci-dessus.
      </p>
    ` : ""}
  `;
  elFinalRankingSection.hidden = false;
}
