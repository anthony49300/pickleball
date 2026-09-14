"use strict";

// =============================================================================
// MODE TOURNOI — MOTEUR (équipes, poules, classement)
// =============================================================================
// Fichier volontairement indépendant de js/app/ (mode Rotation) : aucune
// fonction de ce fichier n'est partagée avec l'autre page. Voir js/shared/
// pour ce qui est réellement commun (modale, thème).

/**
 * Échappe les caractères HTML sensibles avant toute injection via innerHTML.
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
 * Analyse le texte saisi dans #teams : une équipe par ligne, sous la forme
 * "Joueur A & Joueur B" (accepte aussi "," ou " et " comme séparateur).
 * Signale aussi les joueurs qui apparaissent dans plusieurs équipes (doublon
 * de prénom probable, ou vraie erreur de saisie) — comparaison insensible à
 * la casse, comme la détection de doublons du mode Rotation.
 * @returns {{ teams: Array<{id:number, players:string[], name:string}>, invalidLines: string[], duplicatePlayers: string[] }}
 */
function parseTeams(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const teams = [];
  const invalidLines = [];

  lines.forEach((line, idx) => {
    const players = line
      .split(/\s*(?:&|,|\bet\b)\s*/i)
      .map(p => p.trim())
      .filter(Boolean);

    if (players.length === 2) {
      teams.push({ id: idx, players, name: `${players[0]} & ${players[1]}` });
    } else {
      invalidLines.push(line);
    }
  });

  const countByKey = new Map();
  const originalByKey = new Map();
  teams.flatMap(t => t.players).forEach(p => {
    const key = p.toLowerCase();
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    if (!originalByKey.has(key)) originalByKey.set(key, p);
  });
  const duplicatePlayers = [...countByKey.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => originalByKey.get(key));

  return { teams, invalidLines, duplicatePlayers };
}

/**
 * Analyse une liste de joueurs individuels (un par ligne, ou séparés par des
 * virgules) — comme le champ "Joueurs" du mode Rotation. Sert à former des
 * paires automatiquement (voir autoPairPlayers) plutôt que de saisir
 * directement des équipes.
 * @returns {{ players: string[], duplicatePlayers: string[] }}
 */
function parsePlayerList(text) {
  const players = String(text ?? "")
    .split(/\r?\n|,/)
    .map(p => p.trim())
    .filter(Boolean);

  const countByKey = new Map();
  const originalByKey = new Map();
  players.forEach(p => {
    const key = p.toLowerCase();
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    if (!originalByKey.has(key)) originalByKey.set(key, p);
  });
  const duplicatePlayers = [...countByKey.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => originalByKey.get(key));

  return { players, duplicatePlayers };
}

/**
 * Forme des paires aléatoires à partir d'une liste de joueurs individuels.
 * @param {string[]} players
 * @returns {{ pairs: Array<[string,string]>, leftover: string|null }} leftover
 *   est le joueur resté seul si l'effectif est impair (à ajouter manuellement
 *   à une équipe).
 */
function autoPairPlayers(players) {
  const shuffled = shuffledCopy(players);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  const leftover = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
  return { pairs, leftover };
}

/**
 * Analyse la liste optionnelle de noms de terrains (mêmes conventions que le
 * champ équivalent du mode Rotation : séparés par des virgules).
 * @returns {string[]}
 */
function parseCourtNames(text) {
  return String(text ?? "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean);
}

/**
 * Répartit les terrains disponibles entre les poules, pour qu'elles puissent
 * jouer en parallèle (plutôt que de se contenter d'étiqueter les matchs sans
 * coordination réelle entre poules) :
 * - S'il y a au moins autant de terrains que de poules, chaque poule reçoit
 *   un ou plusieurs terrains QUI LUI SONT DÉDIÉS (jamais partagés avec une
 *   autre poule) : les terrains excédentaires vont en priorité aux poules
 *   ayant le plus d'équipes (donc le plus de matchs simultanés par journée à
 *   paralléliser).
 * - S'il y a moins de terrains que de poules, il est impossible de dédier un
 *   terrain à chacune : toutes les poules se partagent alors l'ensemble des
 *   terrains disponibles (leurs matchs s'enchaînent, un terrain à la fois).
 * @param {Array} pools
 * @param {number} numCourts
 * @returns {number[][]} pour chaque poule (même ordre que `pools`), la liste
 *   des index de terrain (0-based) qui lui sont attribués.
 */
function allocateCourtsToPools(pools, numCourts) {
  const n = Math.max(1, numCourts);
  const numPools = pools.length;
  if (numPools === 0) return [];

  if (n < numPools) {
    const shared = Array.from({ length: n }, (_, i) => i);
    return pools.map(() => shared);
  }

  const courtsPerPool = pools.map(() => Math.floor(n / numPools));
  let extra = n % numPools;

  // Terrains excédentaires : priorité aux poules avec le plus d'équipes.
  pools
    .map((pool, idx) => ({ idx, size: pool.teams.length }))
    .sort((a, b) => b.size - a.size)
    .forEach(({ idx }) => {
      if (extra > 0) { courtsPerPool[idx]++; extra--; }
    });

  let cursor = 0;
  return courtsPerPool.map(count => {
    const indices = Array.from({ length: count }, (_, i) => cursor + i);
    cursor += count;
    return indices;
  });
}

/**
 * Génère un calendrier round-robin pour une poule : chaque équipe affronte
 * toutes les autres exactement une fois (algorithme du cercle / circle method).
 * Si le nombre d'équipes est impair, une équipe est exemptée ("bye") à tour de
 * rôle sur une journée (représenté par `{ bye: true, team }` à la place du
 * match — `team` est l'équipe au repos ce tour-là, pour pouvoir l'afficher).
 * @param {Array} teams - équipes de la poule
 * @returns {Array<Array<{a:object,b:object}|{bye:true,team:object}>>} - journées
 */
function generateRoundRobin(teams) {
  if (teams.length < 2) return [];

  const PLACEHOLDER = { isPlaceholder: true };
  const list = teams.length % 2 === 0 ? [...teams] : [...teams, PLACEHOLDER];
  const n = list.length;
  const numRounds = n - 1;

  const fixed = list[0];
  let rotation = list.slice(1);
  const rounds = [];

  for (let r = 0; r < numRounds; r++) {
    const current = [fixed, ...rotation];
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      const a = current[i];
      const b = current[n - 1 - i];
      if (a.isPlaceholder) matches.push({ bye: true, team: b });
      else if (b.isPlaceholder) matches.push({ bye: true, team: a });
      else matches.push({ a, b });
    }
    rounds.push(matches);
    rotation = [rotation[rotation.length - 1], ...rotation.slice(0, -1)];
  }

  return rounds;
}

/**
 * Répartit une liste ordonnée d'équipes dans N poules en distribution simple
 * (0,1,...,N-1,0,1,...). Utilisé pour le mode "Aléatoire" (après mélange) et
 * comme pré-remplissage par défaut du mode "Manuelle".
 */
function dealRoundRobinIntoPools(orderedTeams, numPools) {
  const pools = Array.from({ length: numPools }, () => []);
  orderedTeams.forEach((team, i) => pools[i % numPools].push(team));
  return pools;
}

/**
 * Répartit une liste ordonnée d'équipes (1re = tête de série n°1, etc.) en
 * "serpentin" : 0,1,...,N-1, puis N-1,...,1,0, puis 0,1,...  — pour éviter que
 * les meilleures têtes de série se retrouvent concentrées dans les mêmes poules.
 */
function dealSnakeIntoPools(orderedTeams, numPools) {
  const pools = Array.from({ length: numPools }, () => []);
  const poolIndices = Array.from({ length: numPools }, (_, i) => i);
  let idx = 0;
  let round = 0;

  while (idx < orderedTeams.length) {
    const order = round % 2 === 0 ? poolIndices : [...poolIndices].reverse();
    for (const poolIdx of order) {
      if (idx >= orderedTeams.length) break;
      pools[poolIdx].push(orderedTeams[idx]);
      idx++;
    }
    round++;
  }

  return pools;
}

/**
 * Mélange une copie du tableau fourni (Fisher-Yates). Un tirage de poules n'a
 * pas besoin d'être reproductible via une graine (contrairement au mode
 * Rotation) : Math.random() suffit ici.
 */
function shuffledCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Construit les poules (calendrier round-robin inclus) à partir des équipes,
 * du nombre de poules et du mode de répartition.
 * @param {Array} teams
 * @param {number} numPools
 * @param {"random"|"seeded"|"manual"} mode
 * @param {Array<number>|null} manualPoolIndexByTeamId - requis si mode==="manual" :
 *   pour chaque équipe (par id), l'index de poule choisi.
 * @returns {Array<{name:string, teams:Array, rounds:Array, scores:object}>}
 */
function buildPools(teams, numPools, mode, manualPoolIndexByTeamId) {
  let teamsByPool;

  if (mode === "seeded") {
    teamsByPool = dealSnakeIntoPools(teams, numPools);
  } else if (mode === "manual") {
    teamsByPool = Array.from({ length: numPools }, () => []);
    teams.forEach(team => {
      const poolIdx = manualPoolIndexByTeamId?.[team.id] ?? 0;
      teamsByPool[Math.min(Math.max(poolIdx, 0), numPools - 1)].push(team);
    });
  } else {
    teamsByPool = dealRoundRobinIntoPools(shuffledCopy(teams), numPools);
  }

  return teamsByPool.map((poolTeams, i) => ({
    name: `Poule ${String.fromCharCode(65 + i)}`, // A, B, C...
    teams: poolTeams,
    rounds: generateRoundRobin(poolTeams),
    scores: {}
  }));
}

/**
 * Calcule le classement d'une poule à partir des scores déjà saisis.
 * Départage identique au mode Rotation : victoires → différentiel → points marqués.
 * @returns {Array} équipes triées, chacune enrichie de {w,l,pf,pa,m,diff}
 */
function computePoolStandings(pool) {
  const stats = new Map();
  pool.teams.forEach(team => stats.set(team.id, { team, w: 0, l: 0, pf: 0, pa: 0, m: 0 }));

  pool.rounds.forEach((matches, rIdx) => {
    matches.forEach((match, mIdx) => {
      if (!match || match.bye) return; // journée de repos pour cette équipe
      const score = pool.scores[`${rIdx}-${mIdx}`];
      if (!score || score.a == null || score.b == null) return;

      const sa = stats.get(match.a.id);
      const sb = stats.get(match.b.id);
      sa.m++; sb.m++;
      sa.pf += score.a; sa.pa += score.b;
      sb.pf += score.b; sb.pa += score.a;
      if (score.a > score.b) { sa.w++; sb.l++; }
      else if (score.b > score.a) { sb.w++; sa.l++; }
    });
  });

  return [...stats.values()]
    .map(s => ({ ...s, diff: s.pf - s.pa }))
    .sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pf - a.pf;
    });
}

/**
 * Une poule est-elle terminée (tous les matchs ont un score saisi) ?
 */
function isPoolComplete(pool) {
  return pool.rounds.every((matches, rIdx) =>
    matches.every((match, mIdx) => {
      if (!match || match.bye) return true;
      const score = pool.scores[`${rIdx}-${mIdx}`];
      return score && score.a != null && score.b != null;
    })
  );
}


// =============================================================================
// PHASE FINALE : bracket à élimination AVEC classement complet des perdants
// =============================================================================
// Principe : à chaque tour, les vainqueurs continuent vers le haut du
// classement (parmi eux, "places 1 à N/2"), et les perdants ne sortent PAS du
// tournoi — ils s'affrontent entre eux pour se départager sur la moitié
// inférieure des places restantes ("places N/2+1 à N"). Ce découpage se
// répète récursivement jusqu'à ce que chaque équipe ait une place précise :
// tout le monde joue exactement le même nombre de tours (contrairement à une
// élimination directe classique, où la moitié du tableau s'arrête au 1er
// tour). La finale (places 1-2) et la petite finale (places 3-4) tombent
// naturellement de cet algorithme, sans cas particulier à coder.

/**
 * Plus petite puissance de 2 supérieure ou égale à n (n >= 1).
 */
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Ordre de tirage au sort standard d'un tableau à élimination directe (celui
 * qui écarte le plus longtemps possible les meilleures têtes de série) :
 * pour une taille de 8, renvoie [1,8,4,5,2,7,3,6] — les affiches du 1er tour
 * sont donc 1v8, 4v5, 2v7, 3v6.
 * @param {number} size - puissance de 2
 * @returns {number[]} les numéros de tête de série (1 = la meilleure), dans
 *   l'ordre des places du tableau.
 */
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) {
      next.push(s);
      next.push(n + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * Construit le classement global des équipes qualifiées, tous poules
 * confondues : d'abord tous les 1ers de poule (départagés entre eux comme un
 * classement de poule normal : victoires → différentiel → points marqués),
 * puis tous les 2èmes de poule, etc. Sert de base au tirage au sort de la
 * phase finale (seed 1 = la meilleure équipe qualifiée).
 * @param {Array} pools
 * @param {number} qualifiersPerPool
 * @returns {Array} équipes qualifiées, dans l'ordre du seeding (meilleure en premier)
 */
function seedQualifiedTeams(pools, qualifiersPerPool) {
  const byRank = [];

  pools.forEach(pool => {
    const standings = computePoolStandings(pool);
    for (let i = 0; i < qualifiersPerPool && i < standings.length; i++) {
      if (!byRank[i]) byRank[i] = [];
      byRank[i].push(standings[i]);
    }
  });

  const seeded = [];
  byRank.forEach(bandTeams => {
    if (!bandTeams) return;
    const sorted = [...bandTeams].sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pf - a.pf;
    });
    seeded.push(...sorted.map(s => s.team));
  });

  return seeded;
}

/**
 * Construit l'état initial de la phase finale à partir des équipes classées
 * par ordre de seeding (voir seedQualifiedTeams). Complète avec des repos
 * ("bye") jusqu'à la prochaine puissance de 2, placés aux moins bonnes têtes
 * de série selon la convention standard (elles sautent alors le 1er tour).
 * @param {Array} seededTeams
 * @returns {{bracketSize:number, segments:Array, rounds:Array, finalRanking:null}}
 */
function buildFinalPhase(seededTeams) {
  const bracketSize = nextPowerOfTwo(seededTeams.length);
  const order = seedOrder(bracketSize);
  const slots = order.map(seedNum => {
    const team = seededTeams[seedNum - 1];
    return team ? { team } : { bye: true };
  });

  return {
    bracketSize,
    segments: [{ id: "seg-1", rankStart: 1, rankSize: bracketSize, slots, scores: {} }],
    rounds: [],
    finalRanking: null
  };
}

/**
 * Les affiches (paires) du tour courant d'un segment.
 */
function segmentPairs(segment) {
  const pairs = [];
  for (let i = 0; i < segment.slots.length; i += 2) {
    pairs.push([segment.slots[i], segment.slots[i + 1]]);
  }
  return pairs;
}

/**
 * Le tour courant d'un segment est-il terminé ? Une affiche impliquant un
 * repos ("bye") n'a besoin d'aucune saisie (résolution automatique).
 */
function isSegmentRoundComplete(segment) {
  return segmentPairs(segment).every(([a, b], idx) => {
    if (a.bye || b.bye) return true;
    const score = segment.scores[idx];
    return score && score.a != null && score.b != null;
  });
}

/**
 * Fait avancer un segment terminé : construit les deux segments enfants
 * (vainqueurs → moitié supérieure des places restantes, perdants → moitié
 * inférieure). Un repos face à une vraie équipe résout automatiquement ce
 * match (l'équipe avance sans jouer) ; un repos face à un repos ne produit
 * rien de réel des deux côtés.
 * @returns {Array} les 1 ou 2 segments enfants (1 seul si rankSize/2 === … en
 *   pratique toujours 2, sauf tableau dégénéré à 1 équipe au total)
 */
function advanceSegment(segment) {
  const pairs = segmentPairs(segment);
  const winners = [];
  const losers = [];

  pairs.forEach(([a, b], idx) => {
    if (a.bye && b.bye) {
      winners.push({ bye: true });
      losers.push({ bye: true });
    } else if (a.bye) {
      winners.push(b);
      losers.push({ bye: true });
    } else if (b.bye) {
      winners.push(a);
      losers.push({ bye: true });
    } else {
      const score = segment.scores[idx];
      if (score.a > score.b) { winners.push(a); losers.push(b); }
      else { winners.push(b); losers.push(a); }
    }
  });

  const half = segment.rankSize / 2;
  return [
    { id: `${segment.id}-w`, rankStart: segment.rankStart, rankSize: half, slots: winners, scores: {} },
    { id: `${segment.id}-l`, rankStart: segment.rankStart + half, rankSize: half, slots: losers, scores: {} }
  ];
}

/**
 * Libellé humain d'un segment, pour l'affichage (reconnaît la finale et la
 * petite finale, qui tombent naturellement de l'algorithme).
 */
function segmentLabel(segment) {
  if (segment.rankSize === 2 && segment.rankStart === 1) return "🥇 Finale (places 1-2)";
  if (segment.rankSize === 2 && segment.rankStart === 3) return "🥉 Petite finale (places 3-4)";
  return `Places ${segment.rankStart} à ${segment.rankStart + segment.rankSize - 1}`;
}

/**
 * Calcule le classement final une fois tous les segments résolus à une seule
 * équipe (ou repos). Les repos sont filtrés puis les places renumérotées en
 * continu de 1 à N (les repos ne "mangent" jamais que les moins bonnes
 * places, de par la convention de placement des têtes de série).
 */
function computeFinalRanking(segments) {
  return segments
    .filter(s => s.slots.length === 1 && s.slots[0].team)
    .sort((a, b) => a.rankStart - b.rankStart)
    .map((s, i) => ({ team: s.slots[0].team, rank: i + 1 }));
}

/**
 * Fait avancer la phase finale d'autant de tours que possible dans l'état
 * actuel : tout segment dont le tour courant est terminé se scinde en 2
 * segments enfants, en cascade tant que de nouveaux segments se terminent
 * aussitôt (cas des segments entièrement composés de repos). Recalcule le
 * classement final si tout est résolu. Modifie `finalPhase` en place.
 */
function progressFinalPhase(finalPhase) {
  let changed = true;
  while (changed) {
    changed = false;
    const stillActive = [];
    const newlyCreated = [];

    finalPhase.segments.forEach(segment => {
      if (segment.slots.length === 1) {
        stillActive.push(segment);
        return;
      }
      if (isSegmentRoundComplete(segment)) {
        finalPhase.rounds.push({
          segmentId: segment.id,
          rankStart: segment.rankStart,
          rankSize: segment.rankSize,
          label: segmentLabel(segment),
          pairs: segmentPairs(segment),
          scores: segment.scores
        });
        newlyCreated.push(...advanceSegment(segment));
        changed = true;
      } else {
        stillActive.push(segment);
      }
    });

    finalPhase.segments = [...stillActive, ...newlyCreated];
  }

  if (finalPhase.segments.every(s => s.slots.length === 1)) {
    finalPhase.finalRanking = computeFinalRanking(finalPhase.segments);
  } else {
    finalPhase.finalRanking = null;
  }
}
