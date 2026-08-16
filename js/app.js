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


// =============================================================================
// IHM & ELEMENTS DU DOM
// =============================================================================

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
const elSessionStepper = document.getElementById("sessionStepper");
const elDiag = document.getElementById("diagnostics");
const elDiagSection = document.getElementById("diagnosticsSection") || (elDiag ? elDiag.closest("section") || elDiag.parentElement : null);
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
const btnResetAll = document.getElementById("resetAllBtn");

const elPlayerGroupsList = document.getElementById("playerGroupsList");
const elNewGroupName = document.getElementById("newGroupName");
const btnSavePlayerGroup = document.getElementById("savePlayerGroupBtn");

const elModalOverlay = document.getElementById("modalOverlay");
const elModalIcon = document.getElementById("modalIcon");
const elModalTitle = document.getElementById("modalTitle");
const elModalMessage = document.getElementById("modalMessage");
const elModalCopyArea = document.getElementById("modalCopyArea");
const elModalCopyInput = document.getElementById("modalCopyInput");
const btnModalCancel = document.getElementById("modalCancelBtn");
const btnModalConfirm = document.getElementById("modalConfirmBtn");

// Variables globales de mémoire
window.__PB_SCORES__ = {};
window.__PB_PRESENCE__ = {};
let currentHeatmapMode = "teammates";


// =============================================================================
// CONTROLES UI MODERNISES : STEPPERS (TERRAINS/TOURS) & SLIDERS (ALGORITHME)
// =============================================================================

/**
 * Câble les boutons +/- des steppers numériques (Terrains, Tours).
 * Redispatche "input"/"change" pour que les listeners existants (autosave, présence…)
 * continuent de fonctionner normalement.
 */
document.querySelectorAll(".stepper-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrapper = btn.closest(".stepper");
    const input = wrapper?.querySelector("input[type='number']");
    if (!input) return;

    const step = parseInt(btn.dataset.step, 10) || 0;
    const min = parseInt(wrapper.dataset.min ?? input.min, 10);
    const max = parseInt(wrapper.dataset.max ?? input.max, 10);
    const current = parseInt(input.value, 10) || 0;
    const next = Math.min(
      Number.isNaN(max) ? Infinity : max,
      Math.max(Number.isNaN(min) ? -Infinity : min, current + step)
    );

    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

/**
 * Affiche et met à jour en direct la valeur numérique à côté de chaque slider.
 */
document.querySelectorAll(".slider-field input[type='range']").forEach(range => {
  const output = range.parentElement.querySelector(".slider-value");
  if (!output) return;
  const syncValue = () => { output.textContent = range.value; };
  syncValue();
  range.addEventListener("input", syncValue);
});


// =============================================================================
// MODALE GENERIQUE (remplace confirm()/alert()/prompt() natifs du navigateur)
// =============================================================================

let modalResolve = null;
let modalLastFocusedEl = null;

/**
 * Ferme la modale et résout la promesse en attente avec le résultat fourni.
 */
function closeModal(result) {
  if (elModalOverlay.hidden) return;
  elModalOverlay.hidden = true;
  document.removeEventListener("keydown", onModalKeydown);

  const resolve = modalResolve;
  modalResolve = null;
  if (resolve) resolve(result);

  if (modalLastFocusedEl && typeof modalLastFocusedEl.focus === "function") {
    modalLastFocusedEl.focus();
  }
}

/**
 * Gère Échap (annule) et un piège de focus basique (Tab reste dans la modale).
 */
function onModalKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal(false);
    return;
  }
  if (e.key !== "Tab") return;

  const focusables = [btnModalCancel, elModalCopyInput, btnModalConfirm].filter(
    el => el && !el.hidden && el.offsetParent !== null
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Ouvre la modale générique et renvoie une promesse résolue à la fermeture :
 * `true` si l'utilisateur a cliqué sur le bouton de confirmation, `false` sinon
 * (annulation, clic en dehors, Échap).
 */
function openModal({ icon = "⚠️", title, message, confirmText = "Confirmer", cancelText = "Annuler", danger = false, showCancel = true, copyText = null }) {
  modalLastFocusedEl = document.activeElement;

  elModalIcon.textContent = icon;
  elModalTitle.textContent = title;
  elModalMessage.textContent = message;

  if (copyText != null) {
    elModalCopyArea.hidden = false;
    elModalCopyInput.value = copyText;
  } else {
    elModalCopyArea.hidden = true;
    elModalCopyInput.value = "";
  }

  btnModalConfirm.textContent = confirmText;
  btnModalConfirm.className = danger ? "danger" : "";
  btnModalCancel.hidden = !showCancel;
  btnModalCancel.textContent = cancelText;

  elModalOverlay.hidden = false;
  document.addEventListener("keydown", onModalKeydown);

  if (copyText != null) {
    elModalCopyInput.focus();
    elModalCopyInput.select();
  } else {
    (showCancel ? btnModalCancel : btnModalConfirm).focus();
  }

  return new Promise(resolve => { modalResolve = resolve; });
}

btnModalConfirm.addEventListener("click", () => closeModal(true));
btnModalCancel.addEventListener("click", () => closeModal(false));
elModalOverlay.addEventListener("click", (e) => {
  if (e.target === elModalOverlay) closeModal(false);
});

/** Remplace confirm() : question à 2 issues (confirmer / annuler), destructif par défaut. */
function confirmModal(message, opts = {}) {
  return openModal({
    icon: opts.icon ?? "⚠️",
    title: opts.title ?? "Confirmation requise",
    message,
    confirmText: opts.confirmText ?? "Confirmer",
    cancelText: opts.cancelText ?? "Annuler",
    danger: opts.danger ?? true,
    showCancel: true
  });
}

/** Remplace alert() : information à acquitter, un seul bouton "OK". */
function alertModal(message, opts = {}) {
  return openModal({
    icon: opts.icon ?? "ℹ️",
    title: opts.title ?? "Information",
    message,
    confirmText: opts.confirmText ?? "OK",
    showCancel: false
  });
}

/** Remplace le prompt() utilisé en secours quand navigator.clipboard échoue. */
function copyFallbackModal(text, opts = {}) {
  return openModal({
    icon: opts.icon ?? "🔗",
    title: opts.title ?? "Copier manuellement",
    message: opts.message ?? "La copie automatique a échoué. Le texte est sélectionné ci-dessous : copiez-le avec Ctrl+C (ou Cmd+C).",
    confirmText: "Fermer",
    showCancel: false,
    copyText: text
  });
}


// =============================================================================
// FONCTIONS D'ANALYSE DU FORMULAIRE ET PRESENCE
// =============================================================================

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
 * Synchronise l'interface des plages d'arrivée/départ pour chaque joueur.
 */
function syncPresenceInputs() {
  const players = parsePlayers(elPlayers.value);
  const totalRounds = parseInt(elRounds.value || "8", 10);

  updatePlayerCountBadge();
  elPresenceList.innerHTML = "";

  players.forEach(p => {
    if (!window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p] = { start: 1, end: totalRounds };
    }

    const item = document.createElement("div");
    item.className = "presence-item";
    item.innerHTML = `
      <span><strong>${escapeHtml(p)}</strong></span>
      <div class="presence-inputs">
        <label style="font-size: 0.75rem;">De</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].start}" data-player="${escapeHtml(p)}" data-type="start" />
        <label style="font-size: 0.75rem;">à</label>
        <input type="number" min="1" max="${totalRounds}" value="${window.__PB_PRESENCE__[p].end}" data-player="${escapeHtml(p)}" data-type="end" />
      </div>
    `;
    elPresenceList.appendChild(item);
  });
}

// Écoute dynamique sur la présence (instantanée sur input et change)
["change", "input"].forEach(evt => {
  elPresenceList.addEventListener(evt, (e) => {
    const p = e.target.dataset.player;
    const type = e.target.dataset.type;
    const val = parseInt(e.target.value, 10);
    
    if (p && type && window.__PB_PRESENCE__[p]) {
      window.__PB_PRESENCE__[p][type] = isNaN(val) ? 1 : val;
      autoSaveState();
    }
  });
});

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

  elSchedule.innerHTML = `
    <div class="empty-state-card" style="text-align: center; padding: 2.5rem 1rem; border: 2px dashed rgba(255,255,255,0.15); border-radius: 12px; margin: 1.5rem 0;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎾</div>
      <h3 style="margin-bottom: 0.5rem;">Aucune session active</h3>
      <p class="subtle" style="max-width: 400px; margin: 0 auto;">
        Renseignez vos joueurs et vos paramètres, puis cliquez sur <strong>Générer</strong> pour créer un nouveau planning.
      </p>
    </div>
  `;
  
  if (elSessionStepper) elSessionStepper.hidden = true;
  if (elDiag) elDiag.innerHTML = "";
  if (elDiagSection) elDiagSection.hidden = true;
  
  elMeta.textContent = "";
  if (elRankingSection) elRankingSection.hidden = true;
  if (elHeatmapSection) elHeatmapSection.hidden = true;
  
  btnCopy.disabled = true;
  btnCopyLink.disabled = true;
  btnSaveToHistory.disabled = true;
}

/**
 * Met à jour le Stepper d'Étape de Session.
 */
function updateSessionStepper(rounds) {
  if (!elSessionStepper || !rounds || !rounds.length) return;
  
  elSessionStepper.hidden = false;
  elSessionStepper.innerHTML = "";

  // Un tour est considéré comme complété si TOUS ses matchs ont des scores saisis
  let activeRoundIndex = -1;
  const roundStatuses = rounds.map((matches, rIdx) => {
    if (!matches.length) return true;
    let isComplete = true;
    matches.forEach((_, mIdx) => {
      const key = `${rIdx}-${mIdx}`;
      const sc = window.__PB_SCORES__[key];
      if (!sc || sc['1'] == null || sc['2'] == null) {
        isComplete = false;
      }
    });
    return isComplete;
  });

  // Le tour actif est le premier tour non entièrement complété
  activeRoundIndex = roundStatuses.findIndex(status => status === false);
  if (activeRoundIndex === -1 && roundStatuses.length > 0) {
    activeRoundIndex = roundStatuses.length - 1; // Tous complétés
  }

  rounds.forEach((_, idx) => {
    const isCompleted = roundStatuses[idx];
    const isActive = (idx === activeRoundIndex) && !isCompleted;

    const stepItem = document.createElement("div");
    stepItem.className = `step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;
    stepItem.innerHTML = `
      <div class="step-number">${isCompleted ? '✓' : idx + 1}</div>
      <span>Tour ${idx + 1}</span>
    `;
    elSessionStepper.appendChild(stepItem);

    if (idx < rounds.length - 1) {
      const divider = document.createElement("div");
      divider.className = `step-divider ${isCompleted ? 'active' : ''}`;
      elSessionStepper.appendChild(divider);
    }
  });

  return activeRoundIndex;
}

/**
 * Construit la structure HTML affichant les terrains, matchs, scores et diagnostics.
 */
function render(result, players, numCourts, numRounds) {
  elSchedule.innerHTML = "";
  if (elDiag) elDiag.innerHTML = "";

  const { rounds, benches, absents, stats } = result;
  const courtCustomNames = parseCourtNames();

  elMeta.textContent = `${players.length} Joueurs · ${numCourts} Terrain(s) · ${numRounds} Tours`;

  const activeRoundIndex = updateSessionStepper(rounds);

  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    const isActiveRound = (idx === activeRoundIndex);
    wrap.className = `round ${isActiveRound ? 'active-round' : ''}`;

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    
    const tagsDiv = document.createElement("div");
    tagsDiv.className = "round-tags";

    if (isActiveRound) {
      const activeBadge = document.createElement("span");
      activeBadge.className = "active-round-badge";
      activeBadge.textContent = "⚡ Tour en cours";
      tagsDiv.appendChild(activeBadge);
    }

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
        const courtLabel = escapeHtml(courtCustomNames[mIdx] || `Terrain ${mIdx + 1}`);
        const matchCard = document.createElement("div");
        matchCard.className = "match-card";

        // Récupération des scores sauvegardés en mémoire pour réinjection direct
        const key = `${idx}-${mIdx}`;
        const savedScore1 = window.__PB_SCORES__[key]?.['1'] ?? "";
        const savedScore2 = window.__PB_SCORES__[key]?.['2'] ?? "";

        matchCard.innerHTML = `
          <span class="court-badge">${courtLabel}</span>
          <div class="team-score">
            <span class="team">${t1.map(escapeHtml).join(" & ")}</span>
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="1" min="0" placeholder="-" value="${savedScore1}" />
          </div>
          <span class="vs">VS</span>
          <div class="team-score">
            <input type="number" class="score-input" data-round="${idx}" data-match="${mIdx}" data-team="2" min="0" placeholder="-" value="${savedScore2}" />
            <span class="team">${t2.map(escapeHtml).join(" & ")}</span>
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

  const tmTop = topPairs(stats.teammateCount).map(([k, v]) => `${escapeHtml(k.replace("||", " & "))} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount).map(([k, v]) => `${escapeHtml(k.replace("||", " vs "))} (${v})`).join(", ");

  // Détection de la présence de matchs en simple dans la session
  const hasSingles = stats.singlesCount && Array.from(stats.singlesCount.values()).some(v => v > 0);
  const ratioLabel = hasSingles
    ? "Ratio individuel (J=Joué, S=Simple, B=Banc)"
    : "Ratio individuel (J=Joué, B=Banc)";

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const j = stats.playsCount.get(p) ?? 0;
      const b = stats.benchCount.get(p) ?? 0;
      const s = stats.singlesCount?.get(p) ?? 0;
      return hasSingles
        ? `<strong>${escapeHtml(p)}</strong> : ${j}J / ${s}S / ${b}B`
        : `<strong>${escapeHtml(p)}</strong> : ${j}J / ${b}B`;
    })
    .join(" · ");

  if (elDiag) {
    elDiag.innerHTML = `
      <p><strong>Équilibre Matchs :</strong> Min ${minPlays} - Max ${maxPlays} joués</p>
      <p><strong>Équilibre Banc :</strong> Min ${minBen} - Max ${maxBen} passages</p>
      <p><strong>Paires les plus fréquentes :</strong> ${tmTop || "Aucune"}</p>
      <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "Aucune"}</p>
      <p><strong>${ratioLabel} :</strong> ${fairnessLine}</p>
    `;
  }

  if (elDiagSection) elDiagSection.hidden = false;

  renderHeatmap();
  updateRankings();

  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
  btnSaveToHistory.disabled = false;
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
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.m}</td>
        <td>${p.w}</td>
        <td>${p.l}</td>
        <td>${p.pf}</td>
        <td>${p.pa}</td>
        <td class="${diffClass}">${diffSign}${p.diff}</td>
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


// =============================================================================
// GESTION DE L'ETAT, SAUVEGARDE ET CHARGEMENT SECURISE
// =============================================================================

/**
 * Capture l'intégralité des paramètres et scores courants de l'application.
 */
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

/**
 * Sauvegarde la session dans le stockage local (localStorage).
 */
function autoSaveState() {
  const state = getCurrentState();
  localStorage.setItem("pb_autosave", JSON.stringify(state));
  
  if (elAutosaveBadge) {
    elAutosaveBadge.style.opacity = "1";
    setTimeout(() => { elAutosaveBadge.style.opacity = "0.5"; }, 1000);
  }
}

/**
 * Fonction centrale de génération du planning.
 * @param {boolean} preserveScores - Si true, conserve les scores déjà saisis lors de l'actualisation.
 */
function generateSession(preserveScores = true) {
  clearMessages();
  btnCopy.disabled = true;

  if (!preserveScores) {
    window.__PB_SCORES__ = {};
    if (elRankingSection) elRankingSection.hidden = true;
  }

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

    const warnings = [];

    // Signale les doublons de joueurs (même nom, éventuellement casse différente) ignorés au parsing
    const rawCount = countRawPlayerEntries(elPlayers.value);
    if (rawCount > players.length) {
      const duplicates = rawCount - players.length;
      warnings.push(`${duplicates} doublon(s) de joueur ignoré(s).`);
    }

    // Prendre en compte les 2 terrains possibles à 6 joueurs (1 double + 1 simple)
    const maxUsableCourts = (players.length === 6 && numCourts >= 2) ? 2 : Math.floor(players.length / 4);
    if (numCourts > maxUsableCourts && maxUsableCourts > 0) {
      warnings.push(`${numCourts} terrain(s) demandé(s), mais seulement ${maxUsableCourts} utilisé(s) pour ${players.length} joueur(s).`);
    }

    if (warnings.length && elWarning) {
      elWarning.hidden = false;
      elWarning.textContent = `Attention : ${warnings.join(" ")}`;
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
    window.__PB_LAST_RESULT__ = result;

    render(result, players, numCourts, numRounds);

    autoSaveState();

  } catch (e) {
    if (elError) {
      elError.hidden = false;
      elError.textContent = e?.message ?? String(e);
    }
  }
}

/**
 * Restaure un état complet préenregistré (depuis l'historique, l'URL ou le stockage).
 */
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

  if (state.sc) {
    window.__PB_SCORES__ = state.sc;
  } else {
    window.__PB_SCORES__ = {};
  }

  if (state.p && parsePlayers(state.p).length >= 4) {
    generateSession(true);
  } else {
    renderEmptyState();
  }
}


// =============================================================================
// GROUPES DE JOUEURS RÉGULIERS (CLUBS RÉCURRENTS)
// Distinct de l'historique de sessions : ici on ne sauvegarde qu'une liste de noms
// réutilisable ("Mardi Soir", "Club du dimanche"...), sans scores ni réglages, pour
// éviter de retaper la même liste de joueurs à chaque nouvelle session.
// =============================================================================

function getPlayerGroups() {
  try {
    return JSON.parse(localStorage.getItem("pb_player_groups") || "[]");
  } catch {
    return [];
  }
}

function savePlayerGroupsToStorage(groups) {
  localStorage.setItem("pb_player_groups", JSON.stringify(groups));
}

function renderPlayerGroups() {
  if (!elPlayerGroupsList) return;
  const groups = getPlayerGroups();

  if (!groups.length) {
    elPlayerGroupsList.innerHTML = `<p class="subtle">Aucun groupe enregistré pour le&nbsp;moment.</p>`;
    return;
  }

  elPlayerGroupsList.innerHTML = groups.map(g => `
    <div class="group-card">
      <div>
        <h4>${escapeHtml(g.name)}</h4>
        <div class="subtle" style="font-size: 0.78rem; margin-top: 2px;">👥 ${g.players.length} joueur(s)</div>
      </div>
      <div class="group-actions">
        <button type="button" class="secondary load-group-btn" data-id="${g.id}">📥 Charger</button>
        <button type="button" class="secondary danger del-group-btn" data-id="${g.id}" title="Supprimer ce groupe">🗑️</button>
      </div>
    </div>
  `).join('');
}

if (btnSavePlayerGroup) {
  btnSavePlayerGroup.addEventListener("click", () => {
    const name = (elNewGroupName.value || "").trim();
    const players = parsePlayers(elPlayers.value);

    if (!name) {
      elNewGroupName.focus();
      return;
    }
    if (!players.length) {
      if (elWarning) {
        elWarning.hidden = false;
        elWarning.textContent = "Attention : ajoutez au moins un joueur dans la liste avant d'enregistrer un groupe.";
      }
      return;
    }

    const groups = getPlayerGroups();
    const existingIndex = groups.findIndex(g => g.name.toLowerCase() === name.toLowerCase());

    const newGroup = {
      id: existingIndex !== -1 ? groups[existingIndex].id : Date.now(),
      name,
      players
    };

    if (existingIndex !== -1) groups.splice(existingIndex, 1);
    groups.unshift(newGroup);

    savePlayerGroupsToStorage(groups);
    renderPlayerGroups();

    elNewGroupName.value = "";
    btnSavePlayerGroup.textContent = "✓ Groupe enregistré !";
    setTimeout(() => (btnSavePlayerGroup.textContent = "💾 Enregistrer les joueurs actuels"), 1200);
  });
}

if (elNewGroupName) {
  elNewGroupName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnSavePlayerGroup?.click();
    }
  });
}

if (elPlayerGroupsList) {
  elPlayerGroupsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const groups = getPlayerGroups();

    if (btn.classList.contains("load-group-btn")) {
      const group = groups.find(g => g.id === id);
      if (group) {
        elPlayers.value = group.players.join("\n");
        clearMessages();
        syncPresenceInputs();
        autoSaveState();
      }
    } else if (btn.classList.contains("del-group-btn")) {
      const filtered = groups.filter(g => g.id !== id);
      savePlayerGroupsToStorage(filtered);
      renderPlayerGroups();
    }
  });
}


// =============================================================================
// HISTORIQUE ET REINITIALISATION COMPLETE DU CACHE
// =============================================================================

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("pb_history") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory() {
  let history = getHistory();
  const state = getCurrentState();

  if (!state.s) return;

  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const existingIndex = history.findIndex(item => item.seed === state.s);

  const newItem = {
    id: existingIndex !== -1 ? history[existingIndex].id : Date.now(),
    date: dateStr,
    seed: state.s,
    playersCount: parsePlayers(state.p).length,
    roundsCount: state.r,
    state: state
  };

  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  history.unshift(newItem);
  localStorage.setItem("pb_history", JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  if (!elHistoryList) return;
  const history = getHistory();
  if (!history.length) {
    elHistoryList.innerHTML = `<p class="subtle">Aucune session enregistrée dans l'historique.</p>`;
    return;
  }

  elHistoryList.innerHTML = history.map(item => `
    <div class="history-card">
      <div>
        <h4>Session #${escapeHtml(item.seed)}</h4>
        <div class="subtle" style="font-size: 0.8rem; margin-top: 4px;">
          📅 ${escapeHtml(item.date)} · 👥 ${item.playersCount} Joueurs · 🔄 ${item.roundsCount} Tours
        </div>
      </div>
      <div class="history-actions">
        <button class="secondary load-hist-btn" data-id="${item.id}">Charger</button>
        <button class="secondary del-hist-btn" data-id="${item.id}" style="color: var(--danger);">Supprimer</button>
      </div>
    </div>
  `).join('');
}

if (elHistoryList) {
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
}

// BOUTON DE SUPPRESSION DE L'HISTORIQUE UNIQUEMENT
// (ne touche ni à la session en cours, ni à l'autosave : cohérent avec le libellé du bouton)
if (btnClearHistory) {
  btnClearHistory.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      "Voulez-vous vraiment vider l'historique des sessions enregistrées ? Cette action est irréversible.",
      { title: "Vider l'historique ?", confirmText: "Vider l'historique", icon: "🗑️" }
    );
    if (confirmed) {
      localStorage.removeItem("pb_history");
      renderHistory();
    }
  });
}

// BOUTON DE REINITIALISATION COMPLETE DE LA PAGE
// (distinct de "Vider l'historique" : celui-ci efface la session en cours, l'autosave
// et l'historique des sessions — et repart de zéro. Le libellé et la confirmation le précisent
// explicitement. Les groupes de joueurs réguliers (pb_player_groups) sont volontairement
// PRÉSERVÉS : ce sont des données de type "carnet d'adresses", indépendantes d'une session
// donnée, et les effacer ici irait à l'encontre de leur intérêt (ne pas retaper les joueurs).
//
// Important : on ne fait PAS de rechargement de page (location.reload / location.href).
// Après un vidage du storage, un rechargement vers la même URL laisse certains
// navigateurs (Chrome/Firefox) restaurer automatiquement les anciennes valeurs des champs
// de formulaire (textarea joueurs, scores...) depuis leur propre cache de formulaire,
// indépendamment de localStorage — ce qui donnait l'impression que le reset "ne marchait pas".
// On réinitialise donc directement les champs du DOM et l'état en mémoire, sans recharger.
if (btnResetAll) {
  btnResetAll.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      "Cela effacera la session en cours, la sauvegarde automatique ET l'historique des sessions enregistrées.\n\nLes groupes de joueurs réguliers enregistrés seront conservés. Cette action est irréversible.",
      { title: "Réinitialiser entièrement la page ?", confirmText: "Tout réinitialiser", icon: "🔄" }
    );
    if (!confirmed) return;

    localStorage.removeItem("pb_autosave");
    localStorage.removeItem("pb_history");

    // Réinitialise l'état en mémoire
    window.__PB_SCORES__ = {};
    window.__PB_PRESENCE__ = {};
    window.__PB_LAST_RESULT__ = null;

    // Réinitialise les champs du formulaire à leurs valeurs par défaut
    elPlayers.value = "";
    elCourts.value = "2";
    elRounds.value = "8";
    elSeed.value = generateSeed();
    elCourtNames.value = "";
    elwT.value = "5";
    elwO.value = "2";
    elwP.value = "1";
    elBeamWidth.value = "80";
    elPartnerK.value = "10";
    elSquare.checked = true;
    elAvoidB2B.checked = true;

    // Nettoie l'URL (retire un éventuel paramètre de partage ?d=...) sans recharger
    window.history.replaceState({}, "", window.location.pathname);

    clearMessages();
    syncPresenceInputs();
    renderEmptyState();
    renderHistory();
  });
}

if (btnSaveToHistory) {
  btnSaveToHistory.addEventListener("click", () => {
    saveToHistory();
    btnSaveToHistory.textContent = "Session Sauvegardée !";
    setTimeout(() => (btnSaveToHistory.textContent = "💾 Enregistrer Session"), 1200);
  });
}


// =============================================================================
// EVENEMENTS GENERALISTES & FONCTIONNALITES EXPORT / PARTAGE
// =============================================================================

btnNewSeed.addEventListener("click", () => {
  elSeed.value = generateSeed();
  autoSaveState();
});

btnGenerate.addEventListener("click", () => {
  const hasScores = Object.keys(window.__PB_SCORES__).length > 0;
  generateSession(hasScores);
});

// Écoute instantanée sur la saisie des scores (input + change)
["input", "change"].forEach(evt => {
  elSchedule.addEventListener(evt, (e) => {
    if (e.target.classList.contains("score-input")) {
      const r = e.target.dataset.round;
      const m = e.target.dataset.match;
      const t = e.target.dataset.team;
      const val = parseInt(e.target.value, 10);
      
      const key = `${r}-${m}`;
      if (!window.__PB_SCORES__[key]) window.__PB_SCORES__[key] = {};
      window.__PB_SCORES__[key][t] = isNaN(val) ? null : val;
      
      if (window.__PB_LAST_RESULT__) {
        updateSessionStepper(window.__PB_LAST_RESULT__.rounds);
        
        // Re-marquer visuellement le tour actif sans régénérer tout le DOM
        const roundEls = elSchedule.querySelectorAll('.round');
        const activeIdx = updateSessionStepper(window.__PB_LAST_RESULT__.rounds);
        roundEls.forEach((el, idx) => {
          if (idx === activeIdx) {
            el.classList.add('active-round');
            if (!el.querySelector('.active-round-badge')) {
              const tags = el.querySelector('.round-tags');
              if (tags) {
                const b = document.createElement('span');
                b.className = 'active-round-badge';
                b.textContent = '⚡ Tour en cours';
                tags.prepend(b);
              }
            }
          } else {
            el.classList.remove('active-round');
            const badge = el.querySelector('.active-round-badge');
            if (badge) badge.remove();
          }
        });
      }

      updateRankings();
      autoSaveState();
    }
  });
});

// Écoute instantanée de tous les paramètres du formulaire (input + change)
[elPlayers, elCourts, elRounds, elSeed, elCourtNames, elwT, elwO, elwP, elBeamWidth, elPartnerK, elSquare, elAvoidB2B].forEach(el => {
  if (el) {
    ["change", "input"].forEach(evt => {
      el.addEventListener(evt, () => {
        clearMessages();
        autoSaveState();
      });
    });
  }
});

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
    await copyFallbackModal(text, { title: "Copier le planning" });
  }
});

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
    await copyFallbackModal(urlToShare, { title: "Copier le lien de partage", icon: "🔗" });
  }
}

if (btnCopyLink) btnCopyLink.addEventListener("click", () => copyShareUrl(btnCopyLink));
if (btnCopyRankingLink) btnCopyRankingLink.addEventListener("click", () => copyShareUrl(btnCopyRankingLink));

if (btnExportPng) {
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
      await alertModal(
        "Une erreur est survenue lors de la génération de l'image. Réessayez, ou changez de navigateur si le problème persiste.",
        { title: "Export impossible", icon: "⚠️" }
      );
    } finally {
      btnExportPng.textContent = originalBtnText;
    }
  });
}


// =============================================================================
// INITIALISATION ET SAUVEGARDE ULTIME A LA FERMETURE DE PAGE
// =============================================================================

// Forcer la sauvegarde instantanée avant toute recharge ou fermeture de la page
window.addEventListener("beforeunload", () => {
  autoSaveState();
});

window.addEventListener("DOMContentLoaded", () => {
  if (!elSeed.value) elSeed.value = generateSeed();
  renderHistory();
  renderPlayerGroups();

  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("d");

  if (sharedData) {
    try {
      const jsonString = LZString.decompressFromEncodedURIComponent(sharedData);
      const state = JSON.parse(jsonString);
      loadState(state);
    } catch (e) {
      console.error(e);
      if (elError) {
        elError.hidden = false;
        elError.textContent = "Lien de partage invalide ou corrompu.";
      }
      renderEmptyState();
    }
  } else {
    const saved = localStorage.getItem("pb_autosave");
    if (saved) {
      try {
        loadState(JSON.parse(saved));
      } catch (e) { 
        console.error("Erreur lecture autosave", e); 
        syncPresenceInputs();
        renderEmptyState();
      }
    } else {
      syncPresenceInputs();
      renderEmptyState();
    }
  }
});
