// ----------------------------
// Générateur Aléatoire Seeded
// ----------------------------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function makeRng(seedText) {
  const seedStr = (seedText ?? "").trim();
  if (!seedStr) return Math.random;
  const seedGen = xmur3(seedStr);
  return sfc32(seedGen(), seedGen(), seedGen(), seedGen());
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffled(arr, rng) {
  const copy = [...arr];
  shuffleInPlace(copy, rng);
  return copy;
}

function generateSeed() {
  return Math.random().toString(36).slice(2, 10);
}

// ----------------------------
// Utilitaires de Matchmaking
// ----------------------------
function pairKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function getCount(map, key) {
  return map.get(key) ?? 0;
}

function incCount(map, key, amt = 1) {
  map.set(key, (map.get(key) ?? 0) + amt);
}

function fmtMatch(match) {
  const [t1, t2] = match;
  return `${t1[0]} & ${t1[1]} contre ${t2[0]} & ${t2[1]}`;
}

function topPairs(map, limit = 15) {
  const arr = [...map.entries()].filter(([, v]) => v > 0);
  arr.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return arr.slice(0, limit);
}

// ----------------------------
// Algorithme Beam Search
// ----------------------------
function scoreTeam(a, b, teammateCount, playsCount, wT, wP, squareRepeats) {
  const t = getCount(teammateCount, pairKey(a, b));
  const tPen = squareRepeats ? t * t : t;
  const pPen = (playsCount.get(a) ?? 0) + (playsCount.get(b) ?? 0);
  return wT * tPen + wP * pPen;
}

function scoreOpponents(a, b, c, d, opponentCount, wO, squareRepeats) {
  const vals = [
    getCount(opponentCount, pairKey(a, c)),
    getCount(opponentCount, pairKey(a, d)),
    getCount(opponentCount, pairKey(b, c)),
    getCount(opponentCount, pairKey(b, d)),
  ];
  const sum = vals.reduce((acc, v) => acc + (squareRepeats ? v * v : v), 0);
  return wO * sum;
}

function bestSplitForFour(p4, teammateCount, opponentCount, playsCount, wT, wO, wP, squareRepeats) {
  const [a, b, c, d] = p4;
  const splits = [
    [a, b, c, d],
    [a, c, b, d],
    [a, d, b, c],
  ];

  let best = null;
  let bestScore = Infinity;

  for (const [x1, x2, y1, y2] of splits) {
    const s =
      scoreTeam(x1, x2, teammateCount, playsCount, wT, wP, squareRepeats) +
      scoreTeam(y1, y2, teammateCount, playsCount, wT, wP, squareRepeats) +
      scoreOpponents(x1, x2, y1, y2, opponentCount, wO, squareRepeats);

    if (s < bestScore) {
      bestScore = s;
      const t1 = [x1, x2].sort();
      const t2 = [y1, y2].sort();
      best = (t2.join() < t1.join()) ? [t2, t1] : [t1, t2];
    }
  }
  return { match: best, score: bestScore };
}

function pickBenchesByQueue(availablePlayers, benchesNeeded, benchQueue, lastBenchedSet) {
  if (benchesNeeded <= 0) return [];
  const benched = [];
  const availableSet = new Set(availablePlayers);

  for (const p of availablePlayers) {
    if (!benchQueue.includes(p)) benchQueue.push(p);
  }

  let guard = 0;
  while (benched.length < benchesNeeded && guard < benchQueue.length * 3) {
    guard++;
    const p = benchQueue.shift();

    if (!availableSet.has(p)) continue;

    if (lastBenchedSet.has(p) && benchQueue.length > 0 && benchesNeeded === 1) {
      benchQueue.push(p);
      continue;
    }

    benched.push(p);
    benchQueue.push(p);
  }

  return benched;
}

function beamSearchRound(
  playing, targetMatches, teammateCount, opponentCount, playsCount,
  { wT, wO, wP, beamWidth, partnerK, squareRepeats }, rng
) {
  const need = 4 * targetMatches;
  if (targetMatches <= 0 || playing.length < 4) return [];
  if (!rng) rng = Math.random;

  playing = playing.slice(0, need);

  const partnerRank = new Map();
  for (const p of playing) {
    const others = playing.filter(q => q !== p);
    const shuf = shuffled(others, rng);
    shuf.sort((q1, q2) => {
      const s1 = scoreTeam(p, q1, teammateCount, playsCount, wT, wP, squareRepeats);
      const s2 = scoreTeam(p, q2, teammateCount, playsCount, wT, wP, squareRepeats);
      return s1 - s2;
    });
    partnerRank.set(p, shuf.slice(0, Math.max(2, Math.min(partnerK, shuf.length))));
  }

  function pickPivot(remainingSet) {
    const rem = shuffled([...remainingSet], rng);
    let best = rem[0];
    let bestPlays = playsCount.get(best) ?? 0;
    for (let i = 1; i < rem.length; i++) {
      const p = rem[i];
      const pl = playsCount.get(p) ?? 0;
      if (pl > bestPlays) { best = p; bestPlays = pl; }
    }
    return best;
  }

  let beam = [{ score: 0, matches: [], remaining: new Set(playing) }];

  for (let step = 0; step < targetMatches; step++) {
    const cand = [];
    for (const state of beam) {
      if (state.remaining.size < 4) continue;
      const pivot = pickPivot(state.remaining);

      let partners = (partnerRank.get(pivot) ?? []).filter(q => state.remaining.has(q));
      if (!partners.length) partners = [...state.remaining].filter(q => q !== pivot);
      partners = shuffled(partners, rng);

      for (const partner of partners) {
        if (partner === pivot) continue;
        const rem2 = new Set(state.remaining);
        rem2.delete(pivot); rem2.delete(partner);
        if (rem2.size < 2) continue;

        let rem2Arr = shuffled([...rem2], rng);
        rem2Arr.sort((x, y) => {
          const sx = getCount(opponentCount, pairKey(pivot, x)) + getCount(opponentCount, pairKey(partner, x));
          const sy = getCount(opponentCount, pairKey(pivot, y)) + getCount(opponentCount, pairKey(partner, y));
          return sx - sy;
        });

        const shortlist = rem2Arr.slice(0, Math.min(12, rem2Arr.length));
        const idxs = [];
        for (let i = 0; i < shortlist.length; i++) {
          for (let j = i + 1; j < shortlist.length; j++) {
            idxs.push([i, j]);
          }
        }
        shuffleInPlace(idxs, rng);

        for (const [i, j] of idxs) {
          const r = shortlist[i], s = shortlist[j];
          const { match, score: matchScore } = bestSplitForFour(
            [pivot, partner, r, s],
            teammateCount, opponentCount, playsCount, wT, wO, wP, squareRepeats
          );

          const futurePen = 0.05 * ((playsCount.get(pivot) ?? 0) + (playsCount.get(partner) ?? 0) + (playsCount.get(r) ?? 0) + (playsCount.get(s) ?? 0));
          const newRemaining = new Set(state.remaining);
          newRemaining.delete(pivot); newRemaining.delete(partner); newRemaining.delete(r); newRemaining.delete(s);

          cand.push({
            score: state.score + matchScore + futurePen,
            matches: [...state.matches, match],
            remaining: newRemaining
          });
        }
      }
    }
    if (!cand.length) break;
    cand.sort((a, b) => a.score - b.score);
    beam = cand.slice(0, beamWidth);
  }

  if (!beam.length) return [];
  beam.sort((a, b) => (b.matches.length - a.matches.length) || (a.score - b.score));
  return beam[0].matches;
}

// ----------------------------
// Algorithme principal
// ----------------------------
function scheduleRotations(players, numCourts, numRounds, seedText, options, presenceMap) {
  const rng = makeRng(seedText);
  players = players.map(p => p.trim()).filter(Boolean);
  if (players.length < 4) throw new Error("Il faut au moins 4 joueurs.");

  shuffleInPlace(players, rng);
  const benchQueue = [...players];

  const teammateCount = new Map();
  const opponentCount = new Map();
  const playsCount = new Map();
  const benchCount = new Map();

  const rounds = [];
  const benches = [];
  const absents = [];
  let lastBenched = new Set();

  for (let r = 0; r < numRounds; r++) {
    const roundNumber = r + 1;

    const activePlayers = players.filter(p => {
      const pres = presenceMap[p];
      if (!pres) return true;
      return roundNumber >= pres.start && roundNumber <= pres.end;
    });

    const inactivePlayers = players.filter(p => !activePlayers.includes(p));
    absents.push(inactivePlayers);

    const targetMatches = Math.min(numCourts, Math.floor(activePlayers.length / 4));
    const need = 4 * targetMatches;
    const benchesNeeded = activePlayers.length - need;

    let benched = pickBenchesByQueue(activePlayers, benchesNeeded, benchQueue, lastBenched);
    let playing = activePlayers.filter(p => !benched.includes(p));

    const matches = beamSearchRound(
      playing, targetMatches, teammateCount, opponentCount, playsCount,
      {
        wT: options.wT, wO: options.wO, wP: options.wP,
        beamWidth: options.beamWidth, partnerK: options.partnerK, squareRepeats: options.squareRepeats
      },
      rng
    );

    const activeInMatch = new Set();
    for (const match of matches) {
      const [t1, t2] = match;
      const [a, b] = t1;
      const [c, d] = t2;

      incCount(teammateCount, pairKey(a, b));
      incCount(teammateCount, pairKey(c, d));

      for (const p of [a, b, c, d]) {
        playsCount.set(p, (playsCount.get(p) ?? 0) + 1);
        activeInMatch.add(p);
      }

      for (const x of [a, b]) {
        for (const y of [c, d]) {
          incCount(opponentCount, pairKey(x, y));
        }
      }
    }

    for (const p of playing) {
      if (!activeInMatch.has(p) && !benched.includes(p)) benched.push(p);
    }

    benched = [...new Set(benched)];
    benches.push(benched);

    for (const b of benched) {
      benchCount.set(b, (benchCount.get(b) ?? 0) + 1);
    }

    lastBenched = new Set(benched);
    rounds.push(matches);
  }

  return { rounds, benches, absents, stats: { teammateCount, opponentCount, playsCount, benchCount } };
}

// ----------------------------
// Éléments UI & Gestionnaires
// ----------------------------
const elPlayers = document.getElementById("players");
const elCourts = document.getElementById("courts");
const elRounds = document.getElementById("rounds");
const elSeed = document.getElementById("seed");
const elCourtNames = document.getElementById("courtNames");

const elwT = document.getElementById("wT");
const elwO = document.getElementById("wO");
const elwP = document.getElementById("wP");
const elBeamWidth = document.getElementById("beamWidth");
const elPartnerK = document.getElementById("partnerK");
const elSquare = document.getElementById("squareRepeats");
const elAvoidB2B = document.getElementById("avoidB2B");

const btnGenerate = document.getElementById("generate");
const btnCopy = document.getElementById("copy");
const btnCopyLink = document.getElementById("copyLink");
const btnSaveToHistory = document.getElementById("saveToHistory");
const btnNewSeed = document.getElementById("newSeed");

const elSchedule = document.getElementById("schedule");
const elDiag = document.getElementById("diagnostics");
const elWarning = document.getElementById("warning");
const elError = document.getElementById("error");
const elMeta = document.getElementById("meta");

const elRankingSection = document.getElementById("rankingSection");
const elRankingTableBody = document.querySelector("#rankingTable tbody");
const elPodiumContainer = document.getElementById("podiumContainer");
const elBadgesContainer = document.getElementById("badgesContainer");
const btnExportPng = document.getElementById("exportRankingsPng");
const btnCopyRankingLink = document.getElementById("copyRankingLink");

const elHeatmapSection = document.getElementById("heatmapSection");
const elHeatmapContainer = document.getElementById("heatmapTableContainer");
const btnHmModeTeammates = document.getElementById("hmModeTeammates");
const btnHmModeOpponents = document.getElementById("hmModeOpponents");

const elPresenceList = document.getElementById("presenceList");
const elAutosaveBadge = document.getElementById("autosaveBadge");
const elHistoryList = document.getElementById("historyList");
const btnClearHistory = document.getElementById("clearHistoryBtn");

window.__PB_SCORES__ = {};
window.__PB_PRESENCE__ = {};
let currentHeatmapMode = "teammates";

function parsePlayers(text) {
  const lines = text.split(/\n/).flatMap(line => line.split(","));
  return lines.map(s => s.trim()).filter(Boolean);
}

function parseCourtNames() {
  const raw = elCourtNames.value.trim();
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function syncPresenceInputs() {
  const players = parsePlayers(elPlayers.value);
  const totalRounds = parseInt(elRounds.value || "8", 10);
  
  elPresenceList.innerHTML = "";

  players.forEach(p => {
    if (!window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p] = { start: 1, end: totalRounds };
    }

    const item = document.createElement("div");
    item.className = "presence-item";
    item.innerHTML = `
      <span><strong>${p}</strong></span>
      <div class="presence-inputs">
        <label style="font-size: 0.75rem;">De</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].start}" data-player="${p}" data-type="start" />
        <label style="font-size: 0.75rem;">à</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].end}" data-player="${p}" data-type="end" />
      </div>
    `;
    elPresenceList.appendChild(item);
  });
}

elPresenceList.addEventListener("change", (e) => {
  const p = e.target.dataset.player;
  const type = e.target.dataset.type;
  const val = parseInt(e.target.value, 10);
  
  if (p && type && window.__PB_PRESENCE__[p]) {
    window.__PB_PRESENCE__[p][type] = isNaN(val) ? 1 : val;
    autoSaveState();
  }
});

elPlayers.addEventListener("input", syncPresenceInputs);
elRounds.addEventListener("input", syncPresenceInputs);

// Rendu du Planning
function render(result, players, numCourts, numRounds) {
  elSchedule.innerHTML = "";
  elDiag.innerHTML = "";

  const { rounds, benches, absents, stats } = result;
  const courtCustomNames = parseCourtNames();

  elMeta.textContent = `${players.length} Joueurs · ${numCourts} Terrain(s) · ${numRounds} Tours`;

  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "round";

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    
    const tagsDiv = document.createElement("div");
    tagsDiv.className = "round-tags";

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
        const courtLabel = courtCustomNames[mIdx] || `Terrain ${mIdx + 1}`;
        const matchCard = document.createElement("div");
        matchCard.className = "match-card";
        
        matchCard.innerHTML = `
          <span class="court-badge">${courtLabel}</span>
          <div class="team-score">
            <span class="team">${t1[0]} & ${t1[1]}</span>
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="1" min="0" placeholder="-" />
          </div>
          <span class="vs">VS</span>
          <div class="team-score">
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="2" min="0" placeholder="-" />
            <span class="team">${t2[0]} & ${t2[1]}</span>
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

  const tmTop = topPairs(stats.teammateCount).map(([k, v]) => `${k.replace("||", " & ")} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount).map(([k, v]) => `${k.replace("||", " vs ")} (${v})`).join(", ");

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => `<strong>${p}</strong> : ${stats.playsCount.get(p) ?? 0}J / ${stats.benchCount.get(p) ?? 0}B`)
    .join(" · ");

  elDiag.innerHTML = `
    <p><strong>Équilibre Matchs :</strong> Min ${minPlays} - Max ${maxPlays} joués</p>
    <p><strong>Équilibre Banc :</strong> Min ${minBen} - Max ${maxBen} passages</p>
    <p><strong>Paires les plus fréquentes :</strong> ${tmTop || "Aucune"}</p>
    <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "Aucune"}</p>
    <p><strong>Ratio individuel (J=Joué, B=Banc) :</strong> ${fairnessLine}</p>
  `;

  renderHeatmap();

  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
  btnSaveToHistory.disabled = false;
}

// ----------------------------
// Matrice Heatmap
// ----------------------------
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
    html += `<th>${p.substring(0, 4)}.</th>`;
  });
  html += `</tr></thead><tbody>`;

  players.forEach(p1 => {
    html += `<tr><th>${p1}</th>`;
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

// ----------------------------
// Classement, Podium & Badges
// ----------------------------
function updateRankings() {
  const result = window.__PB_LAST_RESULT__;
  if (!result) return;
  
  const playersStats = {};
  const allPlayers = parsePlayers(elPlayers.value);
  
  allPlayers.forEach(p => {
    playersStats[p] = { w: 0, l: 0, pf: 0, pa: 0, m: 0 };
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
            if (playersStats[p]) {
              playersStats[p].m++;
              playersStats[p].pf += ptsFor;
              playersStats[p].pa += ptsAgainst;
              if (ptsFor > ptsAgainst) playersStats[p].w++;
              else if (ptsFor < ptsAgainst) playersStats[p].l++;
            }
          });
        };

        updateTeamStats(t1, s1, s2);
        updateTeamStats(t2, s2, s1);

        if (s1 > s2) incCount(pairWins, pairKey(t1[0], t1[1]));
        if (s2 > s1) incCount(pairWins, pairKey(t2[0], t2[1]));
      }
    });
  });
  
  if (!hasAnyScore) {
    elRankingSection.hidden = true;
    return;
  }
  
  elRankingSection.hidden = false;
  
  const sortedPlayers = Object.entries(playersStats).map(([name, stats]) => {
    return { name, ...stats, diff: stats.pf - stats.pa };
  }).sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.pf - a.pf;
  });

  // Podium
  renderPodium(sortedPlayers);

  // Badges
  renderBadges(sortedPlayers, pairWins);

  // Tableau
  elRankingTableBody.innerHTML = sortedPlayers.map((p, i) => {
    const diffClass = p.diff > 0 ? "diff-positive" : (p.diff < 0 ? "diff-negative" : "");
    const diffSign = p.diff > 0 ? "+" : "";
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.m}</td>
        <td>${p.w}</td>
        <td>${p.l}</td>
        <td>${p.pf}</td>
        <td>${p.pa}</td>
        <td class="${diffClass}">${diffSign}${p.diff}</td>
      </tr>
    `;
  }).join('');
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
      <div class="podium-name">${p2.name}</div>
      <div class="podium-stats">${p2.w}V · ${p2.diff > 0 ? '+' : ''}${p2.diff}</div>
    </div>
    <div class="podium-step gold">
      <div class="podium-avatar">🥇</div>
      <div class="podium-name">${p1.name}</div>
      <div class="podium-stats">${p1.w}V · ${p1.diff > 0 ? '+' : ''}${p1.diff}</div>
    </div>
    <div class="podium-step bronze">
      <div class="podium-avatar">🥉</div>
      <div class="podium-name">${p3.name}</div>
      <div class="podium-stats">${p3.w}V · ${p3.diff > 0 ? '+' : ''}${p3.diff}</div>
    </div>
  `;
}

function renderBadges(sorted, pairWins) {
  const badges = [];

  // 💥 Meilleure Attaque (plus de points pour)
  const bestAttacker = [...sorted].sort((a, b) => b.pf - a.pf)[0];
  if (bestAttacker && bestAttacker.pf > 0) {
    badges.push({
      icon: "💥",
      title: "Canonnière",
      player: bestAttacker.name,
      desc: `${bestAttacker.pf} points inscrits au total`
    });
  }

  // 🛡️ Roc Défensif (moins de points contre)
  const bestDefender = [...sorted].filter(p => p.m > 0).sort((a, b) => a.pa - b.pa)[0];
  if (bestDefender) {
    badges.push({
      icon: "🛡️",
      title: "Roc Défensif",
      player: bestDefender.name,
      desc: `Seulement ${bestDefender.pa} points encaissés`
    });
  }

  // 🔥 Incollable en Duo
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

  // ⚡ Roi de la Remontada (meilleur diff)
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
        <div class="badge-player">${b.player}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    </div>
  `).join('');
}

// ----------------------------
// Sauvegarde Automatique
// ----------------------------
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

function autoSaveState() {
  const state = getCurrentState();
  localStorage.setItem("pb_autosave", JSON.stringify(state));
  
  elAutosaveBadge.style.opacity = "1";
  setTimeout(() => { elAutosaveBadge.style.opacity = "0.5"; }, 1000);
}

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

  if (state.p && parsePlayers(state.p).length >= 4) {
    btnGenerate.click();
    if (state.sc) {
      window.__PB_SCORES__ = state.sc;
      document.querySelectorAll(".score-input").forEach(input => {
        const r = input.dataset.round;
        const m = input.dataset.match;
        const t = input.dataset.team;
        const key = `${r}-${m}`;
        if (window.__PB_SCORES__[key] && window.__PB_SCORES__[key][t] != null) {
          input.value = window.__PB_SCORES__[key][t];
        }
      });
      updateRankings();
    }
  }
}

// ----------------------------
// Historique des Sessions
// ----------------------------
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("pb_history") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory() {
  const history = getHistory();
  const state = getCurrentState();
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const newItem = {
    id: Date.now(),
    date: dateStr,
    seed: state.s,
    playersCount: parsePlayers(state.p).length,
    roundsCount: state.r,
    state: state
  };

  history.unshift(newItem);
  localStorage.setItem("pb_history", JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    elHistoryList.innerHTML = `<p class="subtle">Aucune session enregistrée dans l'historique.</p>`;
    return;
  }

  elHistoryList.innerHTML = history.map(item => `
    <div class="history-card">
      <div>
        <h4>Session #${item.seed}</h4>
        <div class="subtle" style="font-size: 0.8rem; margin-top: 4px;">
          📅 ${item.date} · 👥 ${item.playersCount} Joueurs · 🔄 ${item.roundsCount} Tours
        </div>
      </div>
      <div class="history-actions">
        <button class="secondary load-hist-btn" data-id="${item.id}">Charger</button>
        <button class="secondary del-hist-btn" data-id="${item.id}" style="color: var(--danger);">Supprimer</button>
      </div>
    </div>
  `).join('');
}

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

btnClearHistory.addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment effacer tout l'historique ?")) {
    localStorage.removeItem("pb_history");
    renderHistory();
  }
});

btnSaveToHistory.addEventListener("click", () => {
  saveToHistory();
  btnSaveToHistory.textContent = "Session Sauvegardée !";
  setTimeout(() => (btnSaveToHistory.textContent = "💾 Enregistrer Session"), 1200);
});

// ----------------------------
// Événements Généraux
// ----------------------------
btnNewSeed.addEventListener("click", () => {
  elSeed.value = generateSeed();
  autoSaveState();
});

btnGenerate.addEventListener("click", () => {
  elWarning.hidden = true;
  elError.hidden = true;
  btnCopy.disabled = true;
  window.__PB_SCORES__ = {};
  elRankingSection.hidden = true;

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
    render(result, players, numCourts, numRounds);

    window.__PB_LAST_RESULT__ = result;
    autoSaveState();

  } catch (e) {
    elError.hidden = false;
    elError.textContent = e?.message ?? String(e);
  }
});

// Écoute des saisies de scores
elSchedule.addEventListener("input", (e) => {
  if (e.target.classList.contains("score-input")) {
    const r = e.target.dataset.round;
    const m = e.target.dataset.match;
    const t = e.target.dataset.team;
    const val = parseInt(e.target.value, 10);
    
    const key = `${r}-${m}`;
    if (!window.__PB_SCORES__[key]) window.__PB_SCORES__[key] = {};
    window.__PB_SCORES__[key][t] = isNaN(val) ? null : val;
    
    updateRankings();
    autoSaveState();
  }
});

[elPlayers, elCourts, elRounds, elSeed, elCourtNames, elwT, elwO, elwP, elBeamWidth, elPartnerK, elSquare, elAvoidB2B].forEach(el => {
  el.addEventListener("change", autoSaveState);
});

// Copie du planning
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
  try {
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = "Copié !";
    setTimeout(() => (btnCopy.textContent = "📋 Copier"), 900);
  } catch {
    window.prompt("Copier le texte :", text);
  }
});

// Partage par URL
function buildShareableUrl() {
  const state = getCurrentState();
  const jsonString = JSON.stringify(state);
  const compressedData = LZString.compressToEncodedURIComponent(jsonString);
  const urlBase = window.location.origin + window.location.pathname;
  return `${urlBase}?d=${compressedData}`;
}

async function copyShareUrl(btnElement) {
  const urlToShare = buildShareableUrl();
  try {
    await navigator.clipboard.writeText(urlToShare);
    const originalText = btnElement.textContent;
    btnElement.textContent = "Lien copié !";
    setTimeout(() => (btnElement.textContent = originalText), 1500);
  } catch {
    window.prompt("Copier le lien :", urlToShare);
  }
}

btnCopyLink.addEventListener("click", () => copyShareUrl(btnCopyLink));
btnCopyRankingLink.addEventListener("click", () => copyShareUrl(btnCopyRankingLink));

// Export PNG
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
    
    const imageUri = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `Classement-Pickleball-${elSeed.value || "session"}.png`;
    link.href = imageUri;
    link.click();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export PNG.");
  } finally {
    btnExportPng.textContent = originalBtnText;
  }
});

// Initialisation
window.addEventListener("DOMContentLoaded", () => {
  if (!elSeed.value) elSeed.value = generateSeed();
  renderHistory();

  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("d");

  if (sharedData) {
    try {
      const jsonString = LZString.decompressFromEncodedURIComponent(sharedData);
      const state = JSON.parse(jsonString);
      loadState(state);
    } catch (e) {
      console.error(e);
      elError.hidden = false;
      elError.textContent = "Lien de partage invalide ou corrompu.";
    }
  } else {
    const saved = localStorage.getItem("pb_autosave");
    if (saved) {
      try {
        loadState(JSON.parse(saved));
      } catch (e) { console.error("Erreur lecture autosave", e); }
    } else {
      syncPresenceInputs();
    }
  }
});