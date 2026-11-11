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
        html += `<td class="heatmap-self">–</td>`;
      } else {
        // Intensité dérivée de la couleur d'accent de l'identité visuelle en
        // cours (color-mix), pour rester lisible dans tous les thèmes.
        const count = getCount(map, pairKey(p1, p2));
        const pct = count > 0 ? Math.round((count / maxVal) * 80 + 15) : 0;
        const bg = count > 0 ? `color-mix(in srgb, var(--accent) ${pct}%, var(--surface-2))` : "var(--surface-2)";
        const color = pct > 55 ? "var(--on-accent)" : "var(--text)";
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
  let scoredMatches = 0;
  let totalMatches = 0;
  const pairWins = new Map();

  result.rounds.forEach((matches, rIdx) => {
    matches.forEach((match, mIdx) => {
      totalMatches++;
      const scores = readMatchScore(window.__PB_SCORES__, rIdx, mIdx, match);

      if (scores && scores['1'] != null && scores['2'] != null) {
        hasAnyScore = true;
        scoredMatches++;
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

  const elRankingSummary = document.getElementById("rankingSummary");
  if (elRankingSummary) {
    elRankingSummary.textContent = scoredMatches === totalMatches
      ? `Classement final · ${totalMatches} matchs`
      : `${scoredMatches} match${scoredMatches > 1 ? "s" : ""} saisi${scoredMatches > 1 ? "s" : ""} sur ${totalMatches}`;
  }

  const fmtDiff = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
  const diffClassOf = (d) => (d > 0 ? "diff-positive" : d < 0 ? "diff-negative" : "");
  const rows = sortedPlayers.map((p, i) => {
    let streakLabel = "—";
    let streakClass = "";
    if (p.streak > 0) {
      streakLabel = `${p.streak} V`;
      streakClass = "diff-positive";
    } else if (p.streak < 0) {
      streakLabel = `${Math.abs(p.streak)} D`;
      streakClass = "diff-negative";
    }
    return {
      p,
      rank: i + 1,
      name: escapeHtml(p.name),
      diff: fmtDiff(p.diff),
      diffClass: diffClassOf(p.diff),
      winPct: p.m > 0 ? Math.round((p.w / p.m) * 100) : 0,
      avgPf: fmtDecimal(p.m > 0 ? p.pf / p.m : 0),
      avgPa: fmtDecimal(p.m > 0 ? p.pa / p.m : 0),
      bestWin: p.maxWin > 0 ? `+${p.maxWin}` : "—",
      worstLoss: p.maxLoss > 0 ? `−${p.maxLoss}` : "—",
      streakLabel,
      streakClass,
    };
  });

  // Tableau complet (affiché sur grand écran)
  elRankingTableBody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.rank}</td>
        <td>${r.name}</td>
        <td>${r.p.m}</td>
        <td>${r.p.w}</td>
        <td>${r.p.l}</td>
        <td>${r.winPct} %</td>
        <td>${r.p.pf}</td>
        <td>${r.p.pa}</td>
        <td class="${r.diffClass}">${r.diff}</td>
        <td>${r.avgPf} / ${r.avgPa}</td>
        <td class="${r.p.maxWin > 0 ? "diff-positive" : ""}">${r.bestWin}</td>
        <td class="${r.p.maxLoss > 0 ? "diff-negative" : ""}">${r.worstLoss}</td>
        <td class="${r.streakClass}">${r.streakLabel}</td>
      </tr>
    `).join('');

  // Cartes dépliables (affichées sur téléphone) : l'essentiel, puis le détail
  // au toucher (<details> natif, aucun JS à prévoir).
  const elRankingCards = document.getElementById("rankingCards");
  if (elRankingCards) {
    elRankingCards.innerHTML = rows.map(r => `
      <li class="rk">
        <details>
          <summary>
            <span class="rk-pos">${r.rank}</span>
            <span class="rk-name">${r.name}<small>${r.p.w} V · ${r.p.l} D · ${r.p.m} match${r.p.m > 1 ? "s" : ""}</small></span>
            <span class="diff ${r.diffClass}">${r.diff}</span>
            <svg class="rk-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div class="rk-detail">
            <div><span>% victoires</span><b>${r.winPct} %</b></div>
            <div><span>Points pour</span><b>${r.p.pf}</b></div>
            <div><span>Points contre</span><b>${r.p.pa}</b></div>
            <div><span>Moy. pour / contre</span><b>${r.avgPf} / ${r.avgPa}</b></div>
            <div><span>Meilleure V</span><b class="${r.p.maxWin > 0 ? "diff-positive" : ""}">${r.bestWin}</b></div>
            <div><span>Série en cours</span><b class="${r.streakClass}">${r.streakLabel}</b></div>
          </div>
        </details>
      </li>
    `).join('');
  }
}

function renderPodium(sorted) {
  if (sorted.length < 3) {
    elPodiumContainer.innerHTML = "";
    return;
  }

  const step = (p, cls, place) => `
    <div class="pod ${cls}">
      <span class="pod-name">${escapeHtml(p.name)}</span>
      <span class="pod-sub">${p.w} V · ${p.diff > 0 ? "+" : ""}${p.diff}</span>
      <div class="pod-bar" aria-label="${place}e place">${place}</div>
    </div>`;

  // Ordre visuel classique : 2e, 1er, 3e.
  elPodiumContainer.innerHTML = step(sorted[1], "p2", 2) + step(sorted[0], "p1", 1) + step(sorted[2], "p3", 3);
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
      <span class="eyebrow">${b.title}</span>
      <span class="badge-player">${escapeHtml(b.player)}</span>
      <span class="badge-desc">${escapeHtml(b.desc)}</span>
    </div>
  `).join('');
}


