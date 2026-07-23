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
  // court, lisible et compatible avec les URL
  return Math.random().toString(36).slice(2, 10);
}

// ----------------------------
// Fonctions utilitaires pour les données de base
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

function encodePlayers(players) {
  // compact et lisible par un humain : séparé par des virgules
  return players.join(",");
}

function decodePlayers(str) {
  // accepte les virgules et/ou retours à la ligne si quelqu'un modifie l'URL
  return str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

// ----------------------------
// Calcul des scores pour l'attribution des matchs
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
      // ordonne les équipes pour un affichage cohérent
      best = (t2.join() < t1.join()) ? [t2, t1] : [t1, t2];
    }
  }
  return { match: best, score: bestScore };
}

// ----------------------------
// Sélection équitable des remplaçants (banc)
// ----------------------------
function pickBenchesByQueue(players, benchesNeeded, benchQueue, lastBenchedSet) {
  if (benchesNeeded <= 0) return [];

  const benched = [];
  const inQueue = new Set(benchQueue);

  // S'assure que la file contient tous les joueurs (en cas de modification)
  for (const p of players) {
    if (!inQueue.has(p)) benchQueue.push(p);
  }

  // Parcourt la file et choisit les joueurs à mettre sur le banc,
  // en évitant de reprendre quelqu'un qui était sur le banc au tour précédent si possible.
  let guard = 0;
  while (benched.length < benchesNeeded && guard < benchQueue.length * 3) {
    guard++;

    const p = benchQueue.shift(); // retire de l'avant

    // évite d'être sur le banc deux tours d'affilée si possible
    if (lastBenchedSet.has(p) && benchQueue.length > 0 && benchesNeeded === 1) {
      benchQueue.push(p); // remet à la fin
      continue;
    }

    benched.push(p);
    benchQueue.push(p); // remet à la fin une fois sélectionné
  }

  return benched;
}

function pickActiveSet(allPlayers, perRoundCapacity, playsCount, benchCount, lastBenchedSet, lastBenchedRound, avoidB2B, rng) {
  const cap = Math.min(perRoundCapacity, allPlayers.length);
  if (cap <= 0) return { activePool: [], initiallyBenched: [...allPlayers] };

  // Mélange d'abord pour éviter que les égalités soient alphabétiques
  const ordered = shuffled([...allPlayers], rng);

  function prio(p) {
    const plays = playsCount.get(p) ?? 0;
    const bench = benchCount.get(p) ?? 0;
    const b2bBonus = (avoidB2B && lastBenchedSet.has(p)) ? -1 : 0; // priorité pour jouer

    // Ancienneté : plus la valeur est grande, plus le passage sur le banc est récent
    const last = lastBenchedRound.get(p);
    const recency = (last == null) ? -1e9 : last;

    // Plus la clé de tri est basse, plus le joueur a de chances d'être ACTIF.
    return [plays, bench, b2bBonus, -recency];
  }

  ordered.sort((x, y) => {
    const ax = prio(x), ay = prio(y);
    for (let i = 0; i < ax.length; i++) {
      if (ax[i] < ay[i]) return -1;
      if (ax[i] > ay[i]) return 1;
    }
    return 0; // les égalités conservent l'ordre mélangé
  });

  return {
    activePool: ordered.slice(0, cap),
    initiallyBenched: ordered.slice(cap),
  };
}

// ----------------------------
// Recherche par faisceau (Beam search) : choix complet des matchs pour un tour
// ----------------------------
function beamSearchRound(
  playing,
  targetMatches,
  teammateCount,
  opponentCount,
  playsCount,
  { wT, wO, wP, beamWidth, partnerK, squareRepeats },
  rng
) {
  const need = 4 * targetMatches;
  if (targetMatches <= 0 || playing.length < 4) return [];
  if (!rng) rng = Math.random;

  // doublons éliminés + nettoyage
  const seen = new Set();
  const uniq = [];
  for (const p of playing) {
    if (!seen.has(p)) { seen.add(p); uniq.push(p); }
  }
  playing = uniq.slice(0, need);

  // Présélection des partenaires :
  // Mélange d'abord ; trie de manière déterministe.
  const partnerRank = new Map();
  for (const p of playing) {
    const others = playing.filter(q => q !== p);
    const shuf = shuffled(others, rng);

    shuf.sort((q1, q2) => {
      const s1 = scoreTeam(p, q1, teammateCount, playsCount, wT, wP, squareRepeats);
      const s2 = scoreTeam(p, q2, teammateCount, playsCount, wT, wP, squareRepeats);
      if (s1 !== s2) return s1 - s2;
      return 0;
    });

    partnerRank.set(p, shuf.slice(0, Math.max(2, Math.min(partnerK, shuf.length))));
  }

  // Choix du pivot : le plus grand nombre de matchs joués.
  function pickPivot(remainingSet) {
    const rem = shuffled([...remainingSet], rng);
    let best = rem[0];
    let bestPlays = playsCount.get(best) ?? 0;

    for (let i = 1; i < rem.length; i++) {
      const p = rem[i];
      const pl = playsCount.get(p) ?? 0;
      if (pl > bestPlays) {
        best = p;
        bestPlays = pl;
      }
    }
    return best;
  }

  // État du faisceau : { score, matches, remaining:Set }
  let beam = [{ score: 0, matches: [], remaining: new Set(playing) }];

  for (let step = 0; step < targetMatches; step++) {
    const cand = [];

    for (const state of beam) {
      if (state.remaining.size < 4) continue;

      const pivot = pickPivot(state.remaining);

      // Privilégie les partenaires pré-classés, mais mélange la liste
      let partners = (partnerRank.get(pivot) ?? []).filter(q => state.remaining.has(q));
      if (!partners.length) partners = [...state.remaining].filter(q => q !== pivot);
      partners = shuffled(partners, rng);

      for (const partner of partners) {
        if (partner === pivot) continue;

        const rem2 = new Set(state.remaining);
        rem2.delete(pivot);
        rem2.delete(partner);
        if (rem2.size < 2) continue;

        // Présélection des adversaires :
        let rem2Arr = shuffled([...rem2], rng);

        rem2Arr.sort((x, y) => {
          const sx =
            getCount(opponentCount, pairKey(pivot, x)) +
            getCount(opponentCount, pairKey(partner, x));
          const sy =
            getCount(opponentCount, pairKey(pivot, y)) +
            getCount(opponentCount, pairKey(partner, y));
          if (sx !== sy) return sx - sy;

          const px = playsCount.get(x) ?? 0;
          const py = playsCount.get(y) ?? 0;
          if (px !== py) return px - py;

          return 0;
        });

        const shortlist = rem2Arr.slice(0, Math.min(12, rem2Arr.length));

        // Choix des paires d'adversaires
        const idxs = [];
        for (let i = 0; i < shortlist.length; i++) {
          for (let j = i + 1; j < shortlist.length; j++) {
            idxs.push([i, j]);
          }
        }
        shuffleInPlace(idxs, rng);

        for (const [i, j] of idxs) {
          const r = shortlist[i];
          const s = shortlist[j];

          const { match, score: matchScore } = bestSplitForFour(
            [pivot, partner, r, s],
            teammateCount, opponentCount, playsCount,
            wT, wO, wP, squareRepeats
          );

          const futurePen =
            0.05 * ((playsCount.get(pivot) ?? 0) + (playsCount.get(partner) ?? 0) +
                    (playsCount.get(r) ?? 0) + (playsCount.get(s) ?? 0));

          const newRemaining = new Set(state.remaining);
          newRemaining.delete(pivot);
          newRemaining.delete(partner);
          newRemaining.delete(r);
          newRemaining.delete(s);

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
// Générateur principal du planning
// ----------------------------
function scheduleRotations(players, numCourts, numRounds, seedText, options) {
  const rng = makeRng(seedText);

  players = players.map(p => p.trim()).filter(Boolean);
  if (players.length < 4) throw new Error("Il faut au moins 4 joueurs.");

  shuffleInPlace(players, rng);
  const benchQueue = [...players]; // déjà mélangé ; sert d'ordre de rotation

  const teammateCount = new Map();
  const opponentCount = new Map();
  const playsCount = new Map();
  const benchCount = new Map();

  const rounds = [];
  const benches = [];
  let lastBenched = new Set();
  const lastBenchedRound = new Map();

  const perRoundCapacity = 4 * numCourts;

  for (let r = 0; r < numRounds; r++) {
    // Combien de matchs peuvent être joués ce tour selon les terrains + total joueurs
    const targetMatches = Math.min(numCourts, Math.floor(players.length / 4));
    const need = 4 * targetMatches;
    const benchesNeeded = players.length - need;

    // Sélection des remplaçants selon un ordre de rotation stable
    let benched = pickBenchesByQueue(players, benchesNeeded, benchQueue, lastBenched);

    // Tous les autres jouent
    let playing = players.filter(p => !new Set(benched).has(p));

    const matches = beamSearchRound(
      playing,
      targetMatches,
      teammateCount,
      opponentCount,
      playsCount,
      {
        wT: options.wT,
        wO: options.wO,
        wP: options.wP,
        beamWidth: options.beamWidth,
        partnerK: options.partnerK,
        squareRepeats: options.squareRepeats
      },
      rng
    );

    // Mise à jour des compteurs
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

    // Si certains joueurs "actifs" n'ont pas été utilisés, ils vont sur le banc
    for (const p of playing) {
      if (!activePlayers.has(p)) benched.push(p);
    }

    // Sécurisation unique + stable
    benched = [...new Set(benched)];

    benches.push(benched);
    for (const b of benched) {
      benchCount.set(b, (benchCount.get(b) ?? 0) + 1);
      lastBenchedRound.set(b, r);
    }

    lastBenched = new Set(benched);
    rounds.push(matches);
  }

  return {
    rounds,
    benches,
    stats: { teammateCount, opponentCount, playsCount, benchCount }
  };
}

// ----------------------------
// Liaison avec l'interface utilisateur (UI)
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

function buildShareUrlCompact(configObj) {
  // LZString est chargé globalement via CDN
  const packed = LZString.compressToEncodedURIComponent(JSON.stringify(configObj));
  const url = new URL(window.location.href);
  url.search = "";                 // nettoie l'URL
  url.hash = `s=${packed}`;        // stocke dans le hash
  return url.toString();
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copier ceci :", text);
    return false;
  }
}

function parsePlayers(text) {
  const lines = text.split(/\n/).flatMap(line => line.split(","));
  return lines.map(s => s.trim()).filter(Boolean);
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

function render(result, players, numCourts, numRounds, seedText) {
  elSchedule.innerHTML = "";
  elDiag.innerHTML = "";

  const { rounds, benches, stats } = result;

  // métadonnées
  const maxMatchesPossible = Math.floor(players.length / 4);
  const capCourts = Math.min(numCourts, maxMatchesPossible);
  elMeta.textContent = `Joueurs : ${players.length} · Terrains : ${numCourts} (jusqu'à ${capCourts}) · Tours : ${numRounds}${seedText ? ` · Seed : ${seedText}` : ""}`;

  // planning
  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "round";

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    const bench = document.createElement("div");
    bench.className = "bench";
    bench.textContent = benches[idx].length ? `Sur le banc : ${benches[idx].join(", ")}` : "Sur le banc : aucun";

    titleRow.appendChild(h3);
    titleRow.appendChild(bench);
    wrap.appendChild(titleRow);

    if (!matches.length) {
      const p = document.createElement("div");
      p.className = "subtle";
      p.style.marginTop = "8px";
      p.textContent = "Aucun match complet possible pour ce tour avec les paramètres actuels.";
      wrap.appendChild(p);
    } else {
      const ol = document.createElement("ol");
      matches.forEach(m => {
        const li = document.createElement("li");
        li.textContent = fmtMatch(m);
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
    }

    elSchedule.appendChild(wrap);
  });

  // diagnostics
  const plays = players.map(p => [p, stats.playsCount.get(p) ?? 0]);
  const benchesCount = players.map(p => [p, stats.benchCount.get(p) ?? 0]);

  const minPlays = Math.min(...plays.map(x => x[1]));
  const maxPlays = Math.max(...plays.map(x => x[1]));
  const minBen = Math.min(...benchesCount.map(x => x[1]));
  const maxBen = Math.max(...benchesCount.map(x => x[1]));

  const tmTop = topPairs(stats.teammateCount, 15).map(([k, v]) => `${k.replace("||", "&")}:${v}`).join(", ");
  const opTop = topPairs(stats.opponentCount, 15).map(([k, v]) => `${k.replace("||", " contre ")}:${v}`).join(", ");

  const playsLine = plays
    .slice()
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([p, v]) => `${p}:${v}`)
    .join(", ");

  const benchesLine = benchesCount
    .slice()
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([p, v]) => `${p}:${v}`)
    .join(", ");

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const pl = stats.playsCount.get(p) ?? 0;
      const bn = stats.benchCount.get(p) ?? 0;
      return `${p} : joués=${pl}, banc=${bn}, total=${pl + bn}`;
    })
    .join(" · ");

  elDiag.innerHTML = `
    <p><strong>Matchs joués</strong> : min=${minPlays}, max=${maxPlays}</p>
    <p><strong>Passages sur le banc</strong> : min=${minBen}, max=${maxBen}</p>
    <p><strong>Matchs par joueur</strong> : ${playsLine}</p>
    <p><strong>Passages sur le banc par joueur</strong> : ${benchesLine}</p>
    <p><strong>Partenaires les plus fréquents</strong> : ${tmTop || "aucun"}</p>
    <p><strong>Adversaires les plus fréquents</strong> : ${opTop || "aucun"}</p>
    <p><strong>Vérification d'équité</strong> : ${fairnessLine}</p>
  `;

  // active la copie
  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
}

function buildCopyText(result) {
  const { rounds, benches } = result;
  const lines = [];
  rounds.forEach((matches, i) => {
    lines.push(`Tour ${i + 1}`);
    if (!matches.length) {
      lines.push(`  (Aucun match complet possible)`);
    } else {
      matches.forEach((m, j) => {
        lines.push(`  ${j+1}. ${fmtMatch(m)}`);
      });
    }
    if (benches[i]?.length) lines.push(`  Sur le banc : ${benches[i].join(", ")}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

btnNewSeed.addEventListener("click", () => {
  const s = generateSeed();
  elSeed.value = s;
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
      elSeed.value = seedText; // affiche dans l'interface
    }

    if (players.length < 4) {
      throw new Error("Veuillez entrer au moins 4 joueurs.");
    }

    const maxMatchesPossible = Math.floor(players.length / 4);
    if (numCourts > maxMatchesPossible && maxMatchesPossible > 0) {
      elWarning.hidden = false;
      elWarning.textContent =
        `Vous avez ${players.length} joueurs ; au maximum ${maxMatchesPossible} match(s) peuvent être joués simultanément. ` +
        `Planification limitée à ce nombre de terrains par tour.`;
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

    // sauvegarde pour la copie
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
    setTimeout(() => (btnCopy.textContent = "Copier le planning"), 900);
  } catch {
    // secours : boîte de dialogue
    window.prompt("Copier le texte du planning :", text);
  }
});

btnCopyLink.addEventListener("click", async () => {
  const players = parsePlayers(elPlayers.value);
  let seedText = (elSeed.value || "").trim();
  if (!seedText) { seedText = generateSeed(); elSeed.value = seedText; }

  const cfg = {
    players,
    courts: parseInt(elCourts.value || "1", 10),
    rounds: parseInt(elRounds.value || "1", 10),
    seed: seedText,
    wT: parseFloat(elwT.value || "5"),
    wO: parseFloat(elwO.value || "2"),
    wP: parseFloat(elwP.value || "1"),
    beamWidth: parseInt(elBeamWidth.value || "80", 10),
    partnerK: parseInt(elPartnerK.value || "10", 10),
    square: !!elSquare.checked,
    avoidB2B: !!elAvoidB2B.checked,
    auto: 1
  };

  const url = buildShareUrlCompact(cfg);
  const ok = await copyTextToClipboard(url);
  if (ok) { btnCopyLink.textContent = "Lien copié !"; setTimeout(() => btnCopyLink.textContent = "Copier le lien", 900); }
});

function applyParamsFromUrlCompact() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const packed = params.get("s");
  if (!packed) return false;

  try {
    const json = LZString.decompressFromEncodedURIComponent(packed);
    if (!json) return false;
    const cfg = JSON.parse(json);

    // applique à l'interface
    if (cfg.players) elPlayers.value = cfg.players.join("\n");
    if (cfg.courts) elCourts.value = cfg.courts;
    if (cfg.rounds) elRounds.value = cfg.rounds;
    if (cfg.seed) elSeed.value = cfg.seed;

    if (cfg.wT != null) elwT.value = cfg.wT;
    if (cfg.wO != null) elwO.value = cfg.wO;
    if (cfg.wP != null) elwP.value = cfg.wP;
    if (cfg.beamWidth != null) elBeamWidth.value = cfg.beamWidth;
    if (cfg.partnerK != null) elPartnerK.value = cfg.partnerK;
    if (cfg.square != null) elSquare.checked = !!cfg.square;
    if (cfg.avoidB2B != null) elAvoidB2B.checked = !!cfg.avoidB2B;

    if (cfg.auto) btnGenerate.click();
    return true;
  } catch {
    return false;
  }
}

applyParamsFromUrlCompact();
if (!elSeed.value) {
  elSeed.value = generateSeed();
}