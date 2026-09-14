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
 * Affiche le calendrier de chaque poule avec les champs de saisie des scores.
 */
function renderPools(pools) {
  elPoolsContainer.innerHTML = pools.map((pool, poolIdx) => {
    const roundsHtml = pool.rounds.map((matches, rIdx) => {
      const matchesHtml = matches.map((match, mIdx) => {
        if (!match) {
          return `<div class="pool-match bye">Exempt(e) ce tour</div>`;
        }
        const score = pool.scores[`${rIdx}-${mIdx}`] || {};
        return `
          <div class="pool-match">
            <span class="pool-team-name">${escapeHtml(match.a.name)}</span>
            <input type="number" inputmode="numeric" class="pool-score-input" data-pool="${poolIdx}" data-round="${rIdx}" data-match="${mIdx}" data-side="a" value="${score.a ?? ""}" />
            <span class="pool-vs-badge">VS</span>
            <input type="number" inputmode="numeric" class="pool-score-input" data-pool="${poolIdx}" data-round="${rIdx}" data-match="${mIdx}" data-side="b" value="${score.b ?? ""}" />
            <span class="pool-team-name">${escapeHtml(match.b.name)}</span>
          </div>
        `;
      }).join("");

      return `
        <div class="pool-round">
          <div class="pool-round-title">Journée ${rIdx + 1}</div>
          ${matchesHtml}
        </div>
      `;
    }).join("");

    return `
      <div class="pool-card">
        <h3>${escapeHtml(pool.name)}</h3>
        ${roundsHtml}
      </div>
    `;
  }).join("");
}

/**
 * Affiche le tableau de classement de chaque poule, en surlignant les équipes
 * actuellement qualifiées pour la phase finale.
 */
function renderPoolStandings(pools, qualifiersPerPool) {
  elPoolStandingsContainer.innerHTML = pools.map(pool => {
    const standings = computePoolStandings(pool);

    const rows = standings.map((s, i) => {
      const qualified = i < qualifiersPerPool;
      const diffSign = s.diff > 0 ? "+" : "";
      return `
        <tr class="${qualified ? "qualified" : ""}">
          <td>${i + 1}</td>
          <td>${escapeHtml(s.team.name)}</td>
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
