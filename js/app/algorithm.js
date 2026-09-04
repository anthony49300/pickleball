"use strict";
// Note : passer de <script type="module"> à un script classique (voir index.html) permet
// d'ouvrir index.html directement en double-cliquant (file://), sans serveur local — les
// navigateurs bloquent le chargement des modules ES par CORS sous file://. Ce fichier n'utilise
// aucun import/export, donc le mode module ne servait qu'à activer le mode strict implicitement ;
// on le restaure explicitement ici pour conserver un comportement identique.

// =============================================================================
// GENERATEUR ALEATOIRE PSEUDO-RANDOM (SEEDED RNG)
// Permet de reproduire exactement les mêmes tirages à partir d'une même clé (seed)
// =============================================================================

/**
 * Génère une fonction de hachage 32-bit à partir d'une chaîne de caractères.
 * @param {string} str - La clé (seed) sous forme de texte.
 * @returns {function(): number} - Fonction renvoyant un entier 32-bit.
 */
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

/**
 * Algorithme SFC32 (Simple Fast Counter 32-bit) pour générer des nombres flottants entre 0 et 1.
 */
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

/**
 * Crée le générateur de nombres aléatoires basé sur la clé fournie.
 * @param {string} seedText - La graine de génération.
 * @returns {function(): number} - Fonction renvoyant un nombre entre 0 et 1.
 */
function makeRng(seedText) {
  const seedStr = (seedText ?? "").trim();
  if (!seedStr) return Math.random;
  const seedGen = xmur3(seedStr);
  return sfc32(seedGen(), seedGen(), seedGen(), seedGen());
}

/**
 * Mélange un tableau en place selon l'algorithme de Fisher-Yates et un générateur défini.
 */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Renvoie une copie mélangée d'un tableau sans altérer le tableau d'origine.
 */
function shuffled(arr, rng) {
  const copy = [...arr];
  shuffleInPlace(copy, rng);
  return copy;
}

/**
 * Génère une clé aléatoire par défaut si aucune clé n'est saisie.
 */
function generateSeed() {
  return Math.random().toString(36).slice(2, 10);
}


// =============================================================================
// UTILITAIRES DE MATCHMAKING & COMPTAGE DES PAIRS
// =============================================================================

/**
 * Crée une clé unique et ordonnée pour représenter une paire de joueurs (ex: "Alice||Bob").
 */
function pairKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

/**
 * Extrait un compteur depuis un objet Map (renvoie 0 par défaut si absent).
 */
function getCount(map, key) {
  return map.get(key) ?? 0;
}

/**
 * Incrémente la valeur associée à une clé dans un Map.
 */
function incCount(map, key, amt = 1) {
  map.set(key, (map.get(key) ?? 0) + amt);
}

/**
 * Échappe les caractères HTML sensibles d'une chaîne avant toute injection via innerHTML.
 * Indispensable pour toute donnée saisie par l'utilisateur (noms de joueurs, terrains, seed…)
 * afin d'éviter les failles XSS (ex: un nom de joueur du type "<img src=x onerror=...>").
 */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formate l'affichage texte d'une rencontre.
 */
function fmtMatch(match) {
  const [t1, t2] = match;
  return `${t1.join(" & ")} contre ${t2.join(" & ")}`;
}

/**
 * Extrait les N paires les plus fréquentes à partir d'une Map de statistiques.
 */
function topPairs(map, limit = 15) {
  const arr = [...map.entries()].filter(([, v]) => v > 0);
  arr.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return arr.slice(0, limit);
}


// =============================================================================
// ALGORITHME BEAM SEARCH (OPTIMISATION DES ROTATIONS)
// =============================================================================

/**
 * Calcule la pénalité liée au fait de mettre deux joueurs ensemble dans une équipe.
 */
function scoreTeam(a, b, teammateCount, playsCount, wT, wP, squareRepeats) {
  const t = getCount(teammateCount, pairKey(a, b));
  const tPen = squareRepeats ? t * t : t;
  const pPen = (playsCount.get(a) ?? 0) + (playsCount.get(b) ?? 0);
  return wT * tPen + wP * pPen;
}

/**
 * Calcule la pénalité d'affrontement entre deux équipes (4 joueurs).
 */
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

/**
 * Trouve la meilleure combinaison d'équipes possible pour un groupe de 4 joueurs.
 */
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

/**
 * Sélectionne équitablement les joueurs qui iront sur le banc pour un tour donné.
 * Évite les passages consécutifs et réduit la répétition des mêmes duos sur le banc.
 */
function pickBenchesByQueue(availablePlayers, benchesNeeded, benchQueue, lastBenchedSet, avoidB2B = true, benchPairCounts = new Map()) {
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

    const canAvoidB2B = avoidB2B && lastBenchedSet.has(p);
    const hasOtherCandidates = benchQueue.some(
      candidate => availableSet.has(candidate) && !lastBenchedSet.has(candidate) && !benched.includes(candidate)
    );

    if (canAvoidB2B && hasOtherCandidates) {
      benchQueue.push(p);
      continue;
    }

    // Évite d'associer deux joueurs qui ont déjà partagé le banc ensemble
    let pairConflict = false;
    if (benched.length > 0 && benchPairCounts) {
      for (const existing of benched) {
        if ((benchPairCounts.get(pairKey(p, existing)) ?? 0) > 0) {
          const hasOtherPairCandidates = benchQueue.some(c => 
            availableSet.has(c) && 
            !benched.includes(c) && 
            (!avoidB2B || !lastBenchedSet.has(c)) &&
            !benched.some(b => (benchPairCounts.get(pairKey(c, b)) ?? 0) > 0)
          );
          if (hasOtherPairCandidates) {
            pairConflict = true;
            break;
          }
        }
      }
    }

    if (pairConflict) {
      benchQueue.push(p);
      continue;
    }

    benched.push(p);
    benchQueue.push(p);
  }

  if (benchPairCounts) {
    for (let i = 0; i < benched.length; i++) {
      for (let j = i + 1; j < benched.length; j++) {
        incCount(benchPairCounts, pairKey(benched[i], benched[j]));
      }
    }
  }

  return benched;
}

/**
 * Recherche par faisceau (Beam Search) pour composer les rencontres optimales d'un tour.
 */
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


// =============================================================================
// ENCHAINEMENT COMPLET DES ROTATIONS
// =============================================================================

/**
 * Moteur principal : génère l'ensemble du planning sur tous les tours demandés.
 */
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
  const singlesCount = new Map();
  const singlesPairCounts = new Map();
  const benchPairCounts = new Map();

  const rounds = [];
  const benches = [];
  const absents = [];
  let lastBenched = new Set();
  let lastSingles = new Set();

  for (let r = 0; r < numRounds; r++) {
    const roundNumber = r + 1;

    const activePlayers = players.filter(p => {
      const pres = presenceMap[p];
      if (!pres) return true;
      return roundNumber >= pres.start && roundNumber <= pres.end;
    });

    const inactivePlayers = players.filter(p => !activePlayers.includes(p));
    absents.push(inactivePlayers);

    let targetMatches = Math.min(numCourts, Math.floor(activePlayers.length / 4));
    let need = 4 * targetMatches;
    let benchesNeeded = activePlayers.length - need;

    let matches = [];
    let benched = [];

    // Cas spécifique : 6 joueurs et au moins 2 terrains -> 1 Double (4 j.) + 1 Simple (2 j.) = 0 personne sur le banc
    if (numCourts >= 2 && activePlayers.length === 6) {
      benchesNeeded = 0;
      benched = [];

      // Évaluation des 15 duos possibles en simple pour éviter le blocage en duos fixes
      const candidatePairs = [];
      for (let i = 0; i < activePlayers.length; i++) {
        for (let j = i + 1; j < activePlayers.length; j++) {
          candidatePairs.push([activePlayers[i], activePlayers[j]]);
        }
      }

      let bestPair = null;
      let minPairCost = Infinity;

      const shuffledPairs = shuffled(candidatePairs, rng);

      for (const [p1, p2] of shuffledPairs) {
        let cost = 0;

        // 1. Éviter le passage consécutif en simple (B2B) si activé
        if (options.avoidB2B) {
          if (lastSingles.has(p1)) cost += 1000;
          if (lastSingles.has(p2)) cost += 1000;
        }

        // 2. Équilibrer les passages globaux en simple pour chaque joueur
        const c1 = singlesCount.get(p1) ?? 0;
        const c2 = singlesCount.get(p2) ?? 0;
        cost += (c1 + c2) * 100;

        // 3. Pénaliser la répétition de la MÊME affiche de simple
        const pairRepeats = getCount(singlesPairCounts, pairKey(p1, p2));
        cost += pairRepeats * 500;

        // 4. Évaluer la qualité de la rencontre de double générée pour les 4 autres joueurs
        const doublesPlayers = activePlayers.filter(p => p !== p1 && p !== p2);
        const { score: doubleScore } = bestSplitForFour(
          doublesPlayers,
          teammateCount, opponentCount, playsCount,
          options.wT, options.wO, options.wP, options.squareRepeats
        );
        cost += doubleScore;

        if (cost < minPairCost) {
          minPairCost = cost;
          bestPair = [p1, p2];
        }
      }

      const singlesPlayers = bestPair;
      lastSingles = new Set(singlesPlayers);

      // Mettre à jour les compteurs spécifiques au simple
      incCount(singlesCount, singlesPlayers[0]);
      incCount(singlesCount, singlesPlayers[1]);
      incCount(singlesPairCounts, pairKey(singlesPlayers[0], singlesPlayers[1]));

      // Les 4 autres joueurs sont envoyés en double
      const doublesPlayers = activePlayers.filter(p => !singlesPlayers.includes(p));
      const doublesMatches = beamSearchRound(
        doublesPlayers, 1, teammateCount, opponentCount, playsCount,
        {
          wT: options.wT, wO: options.wO, wP: options.wP,
          beamWidth: options.beamWidth, partnerK: options.partnerK, squareRepeats: options.squareRepeats
        },
        rng
      );

      matches = [...doublesMatches, [[singlesPlayers[0]], [singlesPlayers[1]]]];
    } else {
      benched = pickBenchesByQueue(activePlayers, benchesNeeded, benchQueue, lastBenched, options.avoidB2B, benchPairCounts);
      let playing = activePlayers.filter(p => !benched.includes(p));

      matches = beamSearchRound(
        playing, targetMatches, teammateCount, opponentCount, playsCount,
        {
          wT: options.wT, wO: options.wO, wP: options.wP,
          beamWidth: options.beamWidth, partnerK: options.partnerK, squareRepeats: options.squareRepeats
        },
        rng
      );
    }

    const activeInMatch = new Set();
    for (const match of matches) {
      const [t1, t2] = match;

      if (t1.length === 2 && t2.length === 2) {
        const [a, b] = t1;
        const [c, d] = t2;

        incCount(teammateCount, pairKey(a, b));
        incCount(teammateCount, pairKey(c, d));

        for (const x of [a, b]) {
          for (const y of [c, d]) {
            incCount(opponentCount, pairKey(x, y));
          }
        }
      } else if (t1.length === 1 && t2.length === 1) {
        const a = t1[0];
        const b = t2[0];
        incCount(opponentCount, pairKey(a, b));
      }

      for (const p of [...t1, ...t2]) {
        playsCount.set(p, (playsCount.get(p) ?? 0) + 1);
        activeInMatch.add(p);
      }
    }

    for (const p of activePlayers) {
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

  return { rounds, benches, absents, stats: { teammateCount, opponentCount, playsCount, benchCount, singlesCount } };
}


