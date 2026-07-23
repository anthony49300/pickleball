// ----------------------------
// Générateur de nombres aléatoires à seed (déterministe)
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
// Fonctions utilitaires
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

function topPairs(map, limit = 20) {
  const arr = [...map.entries()].filter(([, v]) => v > 0);
  arr.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return arr.slice(0, limit);
}

// ----------------------------
// Algorithme de Matchmaking
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

function pickBenchesByQueue(players, benchesNeeded, benchQueue, lastBenchedSet) {
  if (benchesNeeded <= 0) return [];
  const benched = [];
  const inQueue = new Set(benchQueue);

  for (const p of players) {
    if (!inQueue.has(p)) benchQueue.push(p);
  }

  let guard = 0;
  while (benched.length < benchesNeeded && guard < benchQueue.length * 3) {
    guard++;
    const p = benchQueue.shift();

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

  const seen = new Set();
  const uniq = [];
  for (const p of playing) {
    if (!seen.has(p)) { seen.add(p); uniq.push(p); }
  }
  playing = uniq.slice(0, need);

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

function scheduleRotations(players, numCourts, numRounds, seedText, options) {
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
  let lastBenched = new Set();
  const lastBenchedRound = new Map();

  for (let r = 0; r < numRounds; r++) {
    const targetMatches = Math.min(numCourts, Math.floor(players.length / 4));
    const need = 4 * targetMatches;
    const benchesNeeded = players.length - need;

    let benched = pickBenchesByQueue(players, benchesNeeded, benchQueue, lastBenched);
    let playing = players.filter(p => !new Set(benched).has(p));

    const matches = beamSearchRound(
      playing, targetMatches, teammateCount, opponentCount, playsCount,
      {
        wT: options.wT, wO: options.wO, wP: options.wP,
        beamWidth: options.beamWidth, partnerK: options.partnerK, squareRepeats: options.squareRepeats
      },
      rng
    );

    const activePlayers = new Set();
    for (const match of matches) {
      const [t1, t2] = match;
      const [a, b] = t1;
      const [c, d] = t2;

      incCount(teammateCount, pairKey(a, b));
      incCount(teammateCount, pairKey(c, d));

      for (const p of [a, b, c, d]) {
        playsCount.set(p, (playsCount.get(p) ?? 0) + 1);
        activePlayers.add(p);
      }

      for (const x of [a, b]) {
        for (const y of [c, d]) {
          incCount(opponentCount, pairKey(x, y));
        }
      }
    }

    for (const p of playing) {
      if (!activePlayers.has(p)) benched.push(p);
    }

    benched = [...new Set(benched)];
    benches.push(benched);
    for (const b of benched) {
      benchCount.set(b, (benchCount.get(b) ?? 0) + 1);
      lastBenchedRound.set(b, r);
    }

    lastBenched = new Set(benched);
    rounds.push(matches);
  }

  return { rounds, benches, stats: { teammateCount, opponentCount, playsCount, benchCount } };
}

// ----------------------------
// Éléments UI & Événements
// ----------------------------
const elPlayers = document.getElementById("players");
const elCourts = document.getElementById("courts");
const elRounds = document.getElementById("rounds");
const elSeed = document.getElementById("seed");

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
const btnNewSeed = document.getElementById("newSeed");

const elSchedule = document.getElementById("schedule");
const elDiag = document.getElementById("diagnostics");
const elWarning = document.getElementById("warning");
const elError = document.getElementById("error");
const elMeta = document.getElementById("meta");

function parsePlayers(text) {
  const lines = text.split(/\n/).flatMap(line => line.split(","));
  return lines.map(s => s.trim()).filter(Boolean);
}

function render(result, players, numCourts, numRounds, seedText) {
  elSchedule.innerHTML = "";
  elDiag.innerHTML = "";

  const { rounds, benches, stats } = result;

  elMeta.textContent = `${players.length} Joueurs · ${numCourts} Terrain(s) · ${numRounds} Tours`;

  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "round";

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    
    const bench = document.createElement("div");
    bench.className = "bench";
    bench.textContent = benches[idx].length ? `🪑 Banc: ${benches[idx].join(", ")}` : "🪑 Banc: Aucun";

    titleRow.appendChild(h3);
    titleRow.appendChild(bench);
    wrap.appendChild(titleRow);

    if (!matches.length) {
      const p = document.createElement("div");
      p.className = "subtle";
      p.style.marginTop = "8px";
      p.textContent = "Pas assez de joueurs pour un match ce tour-ci.";
      wrap.appendChild(p);
    } else {
      const matchesList = document.createElement("div");
      matchesList.className = "matches-list";

      matches.forEach((m, mIdx) => {
        const [t1, t2] = m;
        const matchCard = document.createElement("div");
        matchCard.className = "match-card";
        
        matchCard.innerHTML = `
          <span style="color: var(--text-subtle); font-size: 0.8rem; font-weight: bold;">T${mIdx+1}</span>
          <span class="team">${t1[0]} & ${t1[1]}</span>
          <span class="vs">VS</span>
          <span class="team">${t2[0]} & ${t2[1]}</span>
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

  const tmTop = topPairs(stats.teammateCount, 15).map(([k, v]) => `${k.replace("||", " & ")} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount, 15).map(([k, v]) => `${k.replace("||", " vs ")} (${v})`).join(", ");

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const pl = stats.playsCount.get(p) ?? 0;
      const bn = stats.benchCount.get(p) ?? 0;
      return `<strong>${p}</strong> : ${pl}J / ${bn}B`;
    })
    .join(" · ");

  elDiag.innerHTML = `
    <p><strong>Équilibre Matchs :</strong> Min ${minPlays} - Max ${maxPlays} joués</p>
    <p><strong>Équilibre Banc :</strong> Min ${minBen} - Max ${maxBen} passages</p>
    <p><strong>Paires les plus fréquentes :</strong> ${tmTop || "Aucune"}</p>
    <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "Aucune"}</p>
    <p><strong>Ratio individuel (J=Joué, B=Banc) :</strong> ${fairnessLine}</p>
  `;

  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
}

function buildCopyText(result) {
  const { rounds, benches } = result;
  const lines = [];
  rounds.forEach((matches, i) => {
    lines.push(`Tour ${i + 1}`);
    if (!matches.length) {
      lines.push(`  (Aucun match)`);
    } else {
      matches.forEach((m, j) => {
        lines.push(`  ${j+1}. ${fmtMatch(m)}`);
      });
    }
    if (benches[i]?.length) lines.push(`  Banc : ${benches[i].join(", ")}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

btnNewSeed.addEventListener("click", () => {
  elSeed.value = generateSeed();
});

btnGenerate.addEventListener("click", () => {
  elWarning.hidden = true;
  elError.hidden = true;
  btnCopy.disabled = true;

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

    const result = scheduleRotations(players, numCourts, numRounds, seedText, options);
    render(result, players, numCourts, numRounds, seedText);

    window.__PB_LAST_RESULT__ = result;

  } catch (e) {
    elError.hidden = false;
    elError.textContent = e?.message ?? String(e);
  }
});

btnCopy.addEventListener("click", async () => {
  const result = window.__PB_LAST_RESULT__;
  if (!result) return;
  const text = buildCopyText(result);
  try {
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = "Copié !";
    setTimeout(() => (btnCopy.textContent = "📋 Copier Planning"), 900);
  } catch {
    window.prompt("Copier le texte :", text);
  }
});

btnCopyLink.addEventListener("click", async () => {
  // 1. Rassembler tous les paramètres actuels
  const state = {
    p: elPlayers.value,
    c: elCourts.value,
    r: elRounds.value,
    s: elSeed.value,
    wt: elwT.value,
    wo: elwO.value,
    wp: elwP.value,
    bw: elBeamWidth.value,
    pk: elPartnerK.value,
    sq: elSquare.checked,
    b2b: elAvoidB2B.checked
  };

  // 2. Compresser les données en une chaîne sécurisée pour l'URL
  const jsonString = JSON.stringify(state);
  const compressedData = LZString.compressToEncodedURIComponent(jsonString);
  
  // 3. Créer le lien final (ex: https://tonsite.com/?d=TexteCompressé)
  const urlBase = window.location.origin + window.location.pathname;
  const urlToShare = `${urlBase}?d=${compressedData}`;

  // 4. Copier dans le presse-papiers
  try {
    await navigator.clipboard.writeText(urlToShare);
    const originalText = btnCopyLink.textContent;
    btnCopyLink.textContent = "Lien avec données copié !";
    setTimeout(() => (btnCopyLink.textContent = originalText), 1500);
  } catch {
    window.prompt("Copier le lien :", urlToShare);
  }
});

if (!elSeed.value) {
  elSeed.value = generateSeed();
}

// ----------------------------
// Chargement depuis l'URL (Lien partagé)
// ----------------------------
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("d");

  if (sharedData) {
    try {
      // Décompresser et analyser les données de l'URL
      const jsonString = LZString.decompressFromEncodedURIComponent(sharedData);
      const state = JSON.parse(jsonString);

      // Remplir les champs avec les données partagées
      if (state.p !== undefined) elPlayers.value = state.p;
      if (state.c !== undefined) elCourts.value = state.c;
      if (state.r !== undefined) elRounds.value = state.r;
      if (state.s !== undefined) elSeed.value = state.s;
      if (state.wt !== undefined) elwT.value = state.wt;
      if (state.wo !== undefined) elwO.value = state.wo;
      if (state.wp !== undefined) elwP.value = state.wp;
      if (state.bw !== undefined) elBeamWidth.value = state.bw;
      if (state.pk !== undefined) elPartnerK.value = state.pk;
      if (state.sq !== undefined) elSquare.checked = state.sq;
      if (state.b2b !== undefined) elAvoidB2B.checked = state.b2b;

      // Optionnel : Générer automatiquement le tableau en arrivant sur la page
      btnGenerate.click();
      
    } catch (e) {
      console.error("Erreur lors de la lecture du lien partagé", e);
      elError.hidden = false;
      elError.textContent = "Le lien de partage est invalide ou corrompu.";
    }
  }
});
