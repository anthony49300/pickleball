"use strict";

// =============================================================================
// RENDU DE LA MATRICE (HEATMAP)
// =============================================================================

/**
 * Dessine la matrice visuelle des interactions entre partenaires ou adversaires.
 */
function renderHeatmap() {
  const result = window.__PB_LAST_RESULT__;
  const players = parsePlayers(elPlayers.value);
  if (!result || players.length === 0) {
    elHeatmapSection.hidden = true;
    return;
  }

  elHeatmapSection.hidden = false;
  const map = currentHeatmapMode === "teammates" ? result.stats.teammateCount : result.stats.opponentCount;

  let maxVal = 1;
  map.forEach(val => { if (val > maxVal) maxVal = val; });

  let html = `<table class="heatmap-table"><thead><tr><th></th>`;
  players.forEach(p => {
    html += `<th>${escapeHtml(p.substring(0, 4))}.</th>`;
  });
  html += `</tr></thead><tbody>`;

  players.forEach(p1 => {
    html += `<tr><th>${escapeHtml(p1)}</th>`;
    players.forEach(p2 => {
      if (p1 === p2) {
        html += `<td style="background: rgba(0,0,0,0.3); color: #555;">-</td>`;
      } else {
        const count = getCount(map, pairKey(p1, p2));
        const alpha = (count / maxVal) * 0.75 + (count > 0 ? 0.15 : 0);
        const bg = count > 0 ? `rgba(204, 255, 0, ${alpha})` : "rgba(255, 255, 255, 0.02)";
        const color = alpha > 0.4 ? "#000" : "#fff";
        html += `<td class="heatmap-cell" style="background: ${bg}; color: ${color};">${count}</td>`;
      }
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  elHeatmapContainer.innerHTML = html;
}

btnHmModeTeammates.addEventListener("click", () => {
  currentHeatmapMode = "teammates";
  btnHmModeTeammates.classList.add("active");
  btnHmModeOpponents.classList.remove("active");
  renderHeatmap();
});

btnHmModeOpponents.addEventListener("click", () => {
  currentHeatmapMode = "opponents";
  btnHmModeOpponents.classList.add("active");
  btnHmModeTeammates.classList.remove("active");
  renderHeatmap();
});


// =============================================================================
// CLASSEMENT, PODIUM & BADGES
// =============================================================================

/**
 * Calcule et actualise le tableau des scores, le podium et les badges honorifiques.
 */
function updateRankings() {
  const result = window.__PB_LAST_RESULT__;
  if (!result) return;
  
  const playersStats = {};
  const allPlayers = parsePlayers(elPlayers.value);
  
  allPlayers.forEach(p => {
    playersStats[p] = { w: 0, l: 0, pf: 0, pa: 0, m: 0, maxWin: 0, maxLoss: 0, streak: 0 };
  });
  
  let hasAnyScore = false;
  const pairWins = new Map();

  result.rounds.forEach((matches, rIdx) => {
    matches.forEach((match, mIdx) => {
      const key = `${rIdx}-${mIdx}`;
      const scores = window.__PB_SCORES__[key];
      
      if (scores && scores['1'] != null && scores['2'] != null) {
        hasAnyScore = true;
        const [t1, t2] = match;
        const s1 = scores['1'];
        const s2 = scores['2'];
        
        const updateTeamStats = (team, ptsFor, ptsAgainst) => {
          team.forEach(p => {
            const stats = playersStats[p];
            if (stats) {
              stats.m++;
              stats.pf += ptsFor;
              stats.pa += ptsAgainst;
              if (ptsFor > ptsAgainst) {
                stats.w++;
                stats.maxWin = Math.max(stats.maxWin, ptsFor - ptsAgainst);
                stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1;
              } else if (ptsFor < ptsAgainst) {
                stats.l++;
                stats.maxLoss = Math.max(stats.maxLoss, ptsAgainst - ptsFor);
                stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1;
              }
            }
          });
        };

        updateTeamStats(t1, s1, s2);
        updateTeamStats(t2, s2, s1);

        if (s1 > s2 && t1.length > 1) incCount(pairWins, pairKey(t1[0], t1[1]));
        if (s2 > s1 && t2.length > 1) incCount(pairWins, pairKey(t2[0], t2[1]));
      }
    });
  });
  
  if (!hasAnyScore) {
    elRankingSection.hidden = true;
    return;
  }
  
  elRankingSection.hidden = false;
  
  // Tri selon les règles de départage (Victoires -> Différentiel -> Points marqués)
  const sortedPlayers = Object.entries(playersStats).map(([name, stats]) => {
    return { name, ...stats, diff: stats.pf - stats.pa };
  }).sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;        // 1. Victoires
    if (b.diff !== a.diff) return b.diff - a.diff; // 2. Différentiel (+/-)
    return b.pf - a.pf;                         // 3. Points marqués (PF)
  });

  renderPodium(sortedPlayers);
  renderBadges(sortedPlayers, pairWins);

  // Rendu du tableau de classement
  elRankingTableBody.innerHTML = sortedPlayers.map((p, i) => {
    const diffClass = p.diff > 0 ? "diff-positive" : (p.diff < 0 ? "diff-negative" : "");
    const diffSign = p.diff > 0 ? "+" : "";
    const winPct = p.m > 0 ? Math.round((p.w / p.m) * 100) : 0;
    const avgPf = p.m > 0 ? (p.pf / p.m).toFixed(1) : "0.0";
    const avgPa = p.m > 0 ? (p.pa / p.m).toFixed(1) : "0.0";
    const bestWin = p.maxWin > 0 ? `+${p.maxWin}` : "—";
    const worstLoss = p.maxLoss > 0 ? `-${p.maxLoss}` : "—";
    let streakLabel = "—";
    let streakClass = "";
    if (p.streak > 0) {
      streakLabel = `🔥 ${p.streak}V`;
      streakClass = "diff-positive";
    } else if (p.streak < 0) {
      streakLabel = `❄️ ${Math.abs(p.streak)}D`;
      streakClass = "diff-negative";
    }
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.m}</td>
        <td>${p.w}</td>
        <td>${p.l}</td>
        <td>${winPct}%</td>
        <td>${p.pf}</td>
        <td>${p.pa}</td>
        <td class="${diffClass}">${diffSign}${p.diff}</td>
        <td>${avgPf} / ${avgPa}</td>
        <td class="${p.maxWin > 0 ? "diff-positive" : ""}">${bestWin}</td>
        <td class="${p.maxLoss > 0 ? "diff-negative" : ""}">${worstLoss}</td>
        <td class="${streakClass}">${streakLabel}</td>
      </tr>
    `;
  }).join('');

  // Ajout / Mise à jour de la note de départage explicative sous le tableau
  let noteEl = document.getElementById("rankingTieBreakNote");
  if (!noteEl) {
    noteEl = document.createElement("p");
    noteEl.id = "rankingTieBreakNote";
    noteEl.className = "subtle";
    noteEl.style.marginTop = "0.75rem";
    noteEl.style.fontSize = "0.8rem";
    const rankingTable = document.getElementById("rankingTable");
    if (rankingTable && rankingTable.parentElement) {
      rankingTable.parentElement.appendChild(noteEl);
    }
  }

  noteEl.innerHTML = `💡 <strong>Règle de départage en cas d'égalité :</strong> 1. Nombre de victoires (V) &nbsp;➔&nbsp; 2. Différentiel de points (+/-) &nbsp;➔&nbsp; 3. Points pour (PP).`;
}

function renderPodium(sorted) {
  if (sorted.length < 3) {
    elPodiumContainer.innerHTML = "";
    return;
  }

  const p1 = sorted[0];
  const p2 = sorted[1];
  const p3 = sorted[2];

  elPodiumContainer.innerHTML = `
    <div class="podium-step silver">
      <div class="podium-avatar">🥈</div>
      <div class="podium-name">${escapeHtml(p2.name)}</div>
      <div class="podium-stats">${p2.w}V · ${p2.diff > 0 ? '+' : ''}${p2.diff}</div>
    </div>
    <div class="podium-step gold">
      <div class="podium-avatar">🥇</div>
      <div class="podium-name">${escapeHtml(p1.name)}</div>
      <div class="podium-stats">${p1.w}V · ${p1.diff > 0 ? '+' : ''}${p1.diff}</div>
    </div>
    <div class="podium-step bronze">
      <div class="podium-avatar">🥉</div>
      <div class="podium-name">${escapeHtml(p3.name)}</div>
      <div class="podium-stats">${p3.w}V · ${p3.diff > 0 ? '+' : ''}${p3.diff}</div>
    </div>
  `;
}

function renderBadges(sorted, pairWins) {
  const badges = [];

  const bestAttacker = [...sorted].sort((a, b) => b.pf - a.pf)[0];
  if (bestAttacker && bestAttacker.pf > 0) {
    badges.push({
      icon: "💥",
      title: "Canonnière",
      player: bestAttacker.name,
      desc: `${bestAttacker.pf} points inscrits au total`
    });
  }

  const bestDefender = [...sorted].filter(p => p.m > 0).sort((a, b) => a.pa - b.pa)[0];
  if (bestDefender) {
    badges.push({
      icon: "🛡️",
      title: "Roc Défensif",
      player: bestDefender.name,
      desc: `Seulement ${bestDefender.pa} points encaissés`
    });
  }

  const topDuoEntry = [...pairWins.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDuoEntry && topDuoEntry[1] > 0) {
    const pairName = topDuoEntry[0].replace("||", " & ");
    badges.push({
      icon: "🔥",
      title: "Incollable en Duo",
      player: pairName,
      desc: `${topDuoEntry[1]} victoires ensemble`
    });
  }

  const bestDiff = [...sorted].sort((a, b) => b.diff - a.diff)[0];
  if (bestDiff && bestDiff.diff > 0) {
    badges.push({
      icon: "🚀",
      title: "Maître du Différentiel",
      player: bestDiff.name,
      desc: `Différentiel de +${bestDiff.diff}`
    });
  }

  elBadgesContainer.innerHTML = badges.map(b => `
    <div class="badge-card">
      <div class="badge-icon">${b.icon}</div>
      <div>
        <div class="badge-title">${b.title}</div>
        <div class="badge-player">${escapeHtml(b.player)}</div>
        <div class="badge-desc">${escapeHtml(b.desc)}</div>
      </div>
    </div>
  `).join('');
}


