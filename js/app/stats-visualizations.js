"use strict";

/**
 * Formate un nombre décimal à la française (virgule plutôt que point), pour
 * les moyennes affichées dans le classement et les badges.
 */
function fmtDecimal(n, digits = 1) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

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

  // Le "." ne s'ajoute que si le nom est réellement tronqué : sinon "Anto."
  // pouvait désigner aussi bien "Antoine" (tronqué) que "Anto" (pas tronqué,
  // mais suffixé quand même), les rendant impossibles à distinguer dans
  // l'en-tête. Le nom complet reste disponible via le title (survol).
  let html = `<table class="heatmap-table"><thead><tr><th></th>`;
  players.forEach(p => {
    const short = p.substring(0, 4);
    const label = short.length < p.length ? `${short}.` : short;
    html += `<th title="${escapeHtml(p)}">${escapeHtml(label)}</th>`;
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
    playersStats[p] = { w: 0, l: 0, pf: 0, pa: 0, m: 0, maxWin: 0, maxLoss: 0, streak: 0, closeWins: 0, closeLosses: 0, results: [] };
  });
  
  let hasAnyScore = false;
  const pairWins = new Map();

  result.rounds.forEach((matches, rIdx) => {
    matches.forEach((match, mIdx) => {
      const scores = readMatchScore(window.__PB_SCORES__, rIdx, mIdx, match);
      
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
              const margin = Math.abs(ptsFor - ptsAgainst);
              if (ptsFor > ptsAgainst) {
                stats.w++;
                stats.maxWin = Math.max(stats.maxWin, ptsFor - ptsAgainst);
                stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1;
                if (margin <= 2) stats.closeWins++;
                stats.results.push("W");
              } else if (ptsFor < ptsAgainst) {
                stats.l++;
                stats.maxLoss = Math.max(stats.maxLoss, ptsAgainst - ptsFor);
                stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1;
                if (margin <= 2) stats.closeLosses++;
                stats.results.push("L");
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

  // Tri selon les règles de départage (Taux de victoire -> Différentiel moyen -> Victoires brutes).
  // Le taux de victoire passe avant le nombre de victoires brutes pour ne pas
  // défavoriser un joueur qui a simplement moins joué (rotation du banc) mais
  // gagné dans les mêmes proportions (ex: 2V/2 ne doit pas être classé après
  // 3V/3 uniquement parce qu'il totalise moins de victoires).
  const sortedPlayers = Object.entries(playersStats).map(([name, stats]) => {
    const winRate = stats.m > 0 ? stats.w / stats.m : 0;
    const avgDiff = stats.m > 0 ? (stats.pf - stats.pa) / stats.m : 0;
    return { name, ...stats, diff: stats.pf - stats.pa, winRate, avgDiff };
  }).sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate; // 1. Taux de victoire
    if (b.avgDiff !== a.avgDiff) return b.avgDiff - a.avgDiff; // 2. Différentiel moyen par match
    return b.w - a.w;                                           // 3. Victoires brutes
  });

  renderPodium(sortedPlayers);
  renderBadges(sortedPlayers, pairWins);

  // Rendu du tableau de classement
  elRankingTableBody.innerHTML = sortedPlayers.map((p, i) => {
    const diffClass = p.diff > 0 ? "diff-positive" : (p.diff < 0 ? "diff-negative" : "");
    const diffSign = p.diff > 0 ? "+" : "";
    const winPct = p.m > 0 ? Math.round((p.w / p.m) * 100) : 0;
    const avgPf = fmtDecimal(p.m > 0 ? p.pf / p.m : 0);
    const avgPa = fmtDecimal(p.m > 0 ? p.pa / p.m : 0);
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

  noteEl.innerHTML = `💡 <strong>Règle de départage en cas d'égalité :</strong> 1. Taux de victoire (%) &nbsp;➔&nbsp; 2. Différentiel moyen par match &nbsp;➔&nbsp; 3. Nombre de victoires (V).`;
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

/**
 * Compte le nombre de fois où le résultat (victoire/défaite) change d'un match
 * au suivant, dans l'ordre chronologique (utilisé pour le badge Montagnes Russes).
 */
function countAlternations(results) {
  let count = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) count++;
  }
  return count;
}

function renderBadges(sorted, pairWins) {
  const badges = [];

  // Moyennes par match plutôt que des totaux bruts : sinon, un joueur ayant
  // simplement joué plus de matchs (rotation du banc) rafle ces badges même
  // avec une production par match inférieure à celle d'un joueur moins présent.
  const bestAttacker = [...sorted].filter(p => p.m > 0).sort((a, b) => (b.pf / b.m) - (a.pf / a.m))[0];
  if (bestAttacker) {
    badges.push({
      icon: "💥",
      title: "Canonnière",
      player: bestAttacker.name,
      desc: `${fmtDecimal(bestAttacker.pf / bestAttacker.m)} points marqués en moyenne par match (${bestAttacker.pf} au total)`
    });
  }

  const bestDefender = [...sorted].filter(p => p.m > 0).sort((a, b) => (a.pa / a.m) - (b.pa / b.m))[0];
  if (bestDefender) {
    badges.push({
      icon: "🛡️",
      title: "Roc Défensif",
      player: bestDefender.name,
      desc: `${fmtDecimal(bestDefender.pa / bestDefender.m)} points encaissés en moyenne par match (${bestDefender.pa} au total)`
    });
  }

  // Seuil minimum (3 victoires ensemble) pour éviter qu'un duo n'ayant joué
  // qu'une seule fois décroche le badge sur un simple coup de chance.
  const topDuoEntry = [...pairWins.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDuoEntry && topDuoEntry[1] >= 3) {
    const pairName = topDuoEntry[0].replace("||", " & ");
    badges.push({
      icon: "🔥",
      title: "Incollable en Duo",
      player: pairName,
      desc: `${topDuoEntry[1]} victoire${topDuoEntry[1] > 1 ? "s" : ""} ensemble`
    });
  }

  const bestDiff = [...sorted].filter(p => p.m > 0).sort((a, b) => b.avgDiff - a.avgDiff)[0];
  if (bestDiff && bestDiff.avgDiff > 0) {
    badges.push({
      icon: "🚀",
      title: "Maître du Différentiel",
      player: bestDiff.name,
      desc: `Différentiel moyen de +${fmtDecimal(bestDiff.avgDiff)} par match (total ${bestDiff.diff > 0 ? "+" : ""}${bestDiff.diff})`
    });
  }

  const coldBlood = [...sorted].filter(p => p.closeWins > 0).sort((a, b) => b.closeWins - a.closeWins)[0];
  if (coldBlood) {
    badges.push({
      icon: "🧊",
      title: "Sang-Froid",
      player: coldBlood.name,
      desc: `${coldBlood.closeWins} victoire${coldBlood.closeWins > 1 ? "s" : ""} arrachée${coldBlood.closeWins > 1 ? "s" : ""} à 2 points ou moins`
    });
  }

  // "Malgré un bon différentiel global" : on exige un différentiel positif, pour ne
  // récompenser que les joueurs dont la malchance sur les matchs serrés ne reflète
  // pas leur niveau réel sur l'ensemble de la session. Le 1er du classement est
  // exclu : son classement en tête contredirait déjà l'idée de "malchance".
  const unlucky = [...sorted].filter((p, idx) => idx > 0 && p.closeLosses > 0 && p.diff > 0).sort((a, b) => b.closeLosses - a.closeLosses)[0];
  if (unlucky) {
    badges.push({
      icon: "😬",
      title: "Poissard",
      player: unlucky.name,
      desc: `${unlucky.closeLosses} défaite${unlucky.closeLosses > 1 ? "s" : ""} à 2 points ou moins malgré un différentiel de +${unlucky.diff}`
    });
  }

  // Seuil minimum de 4 matchs : sur 2-3 matchs, un simple "W puis L" compte
  // déjà comme 100% d'alternance et déclenchait le badge pour presque rien.
  const rollercoaster = [...sorted]
    .filter(p => p.m >= 4)
    .map(p => ({ ...p, alternations: countAlternations(p.results) }))
    .sort((a, b) => b.alternations - a.alternations)[0];
  if (rollercoaster && rollercoaster.alternations > 0) {
    badges.push({
      icon: "🎢",
      title: "Montagnes Russes",
      player: rollercoaster.name,
      desc: `${rollercoaster.alternations} changement${rollercoaster.alternations > 1 ? "s" : ""} de résultat sur ${rollercoaster.m} matchs`
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


