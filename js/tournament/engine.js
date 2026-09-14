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
 *
 * L'ordre des matchs DANS chaque journée est ensuite tourné (voir en bas de
 * fonction) : la méthode du cercle laisse structurellement une équipe fixe
 * ("fixed", toujours `teams[0]`) dans le tout premier match généré, à
 * CHAQUE journée. Sans terrains en nombre suffisant pour jouer tous les
 * matchs d'une journée en même temps (voir poolCourts dans renderPools),
 * l'ordre des matchs détermine l'ordre d'appel des terrains — `teams[0]`
 * serait alors systématiquement appelée en premier terrain à chaque
 * journée, et une autre équipe systématiquement en dernier, tournoi après
 * tournoi. La rotation ci-dessous ne change JAMAIS qui joue contre qui
 * (seul le calendrier compte pour ça), seulement l'ordre d'affichage/appel.
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

  // Rotation de l'ordre d'appel (voir commentaire ci-dessus) : décalage
  // croissant d'une journée à l'autre, sans jamais toucher au contenu des
  // matchs (juste leur position dans le tableau de la journée).
  return rounds.map((matches, r) => {
    const offset = r % matches.length;
    return [...matches.slice(offset), ...matches.slice(0, offset)];
  });
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
 * Construit un classement global d'équipes à partir d'une PLAGE de positions
 * de poule (0-indexée, incluse des deux côtés) : toutes les équipes classées
 * `poolRankStart`-ième de leur poule d'abord (départagées entre elles comme
 * un classement de poule normal : victoires → différentiel → points
 * marqués), puis toutes les `poolRankStart+1`-ièmes, etc. Sert de base
 * commune à seedQualifiedTeams et seedNonQualifiedTeams ci-dessous.
 * @param {Array} pools
 * @param {number} poolRankStart - 0-indexé
 * @param {number} poolRankEnd - 0-indexé, inclus
 * @param {Set<number>|null} forfeitedTeamIds - équipes à exclure AVANT de
 *   découper par rang (voir setTeamForfeited) : une équipe forfait déclarée
 *   pendant la phase de poules (donc avant tout tirage de bracket) libère
 *   ainsi sa place — la suivante de sa poule prend directement sa place
 *   dans la bande de rang concernée (qualification ou classement), sans
 *   qu'aucune place ne saute ni ne se retrouve occupée deux fois.
 * @returns {Array} équipes, dans l'ordre du seeding (meilleure en premier)
 */
function seedTeamsByPoolRange(pools, poolRankStart, poolRankEnd, forfeitedTeamIds) {
  const byBand = [];

  pools.forEach(pool => {
    const standings = computePoolStandings(pool)
      .filter(s => !forfeitedTeamIds || !forfeitedTeamIds.has(s.team.id));
    const end = Math.min(poolRankEnd, standings.length - 1);
    for (let i = poolRankStart; i <= end; i++) {
      const bandIdx = i - poolRankStart;
      if (!byBand[bandIdx]) byBand[bandIdx] = [];
      byBand[bandIdx].push(standings[i]);
    }
  });

  const seeded = [];
  byBand.forEach(bandTeams => {
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
 * Construit le classement global des équipes QUALIFIÉES, tous poules
 * confondues (les `qualifiersPerPool` premières de chaque poule, forfaits
 * exclus — voir seedTeamsByPoolRange). Sert de base au tirage au sort de la
 * phase finale (seed 1 = la meilleure équipe qualifiée).
 * @param {Array} pools
 * @param {number} qualifiersPerPool
 * @param {Set<number>|null} forfeitedTeamIds
 */
function seedQualifiedTeams(pools, qualifiersPerPool, forfeitedTeamIds) {
  return seedTeamsByPoolRange(pools, 0, qualifiersPerPool - 1, forfeitedTeamIds);
}

/**
 * Construit le classement global des équipes NON qualifiées, tous poules
 * confondues (celles classées après `qualifiersPerPool` dans leur poule,
 * forfaits exclus — voir seedTeamsByPoolRange). Sert de base au tirage au
 * sort des matchs de classement, pour que ces équipes continuent elles
 * aussi à jouer et obtiennent une place finale précise plutôt que de
 * s'arrêter à la fin des poules.
 * @param {Array} pools
 * @param {number} qualifiersPerPool
 * @param {Set<number>|null} forfeitedTeamIds
 */
function seedNonQualifiedTeams(pools, qualifiersPerPool, forfeitedTeamIds) {
  const maxPoolSize = pools.reduce((max, pool) => Math.max(max, pool.teams.length), 0);
  return seedTeamsByPoolRange(pools, qualifiersPerPool, maxPoolSize - 1, forfeitedTeamIds);
}

/**
 * Construit l'état initial d'un bracket à classement complet (phase finale
 * ou matchs de classement des non-qualifiés) à partir des équipes classées
 * par ordre de seeding. Complète avec des repos ("bye") jusqu'à la
 * prochaine puissance de 2, placés aux moins bonnes têtes de série selon la
 * convention standard (elles sautent alors le 1er tour).
 * @param {Array} seededTeams
 * @param {number} rankOffset - décalage des places affichées (0 pour la
 *   phase finale, qui joue pour les places 1..N ; le nombre de qualifiés
 *   pour les matchs de classement, qui jouent pour les places N+1..)
 * @returns {{bracketSize:number, rankOffset:number, segments:Array, rounds:Array, finalRanking:null}}
 */
function buildFinalPhase(seededTeams, rankOffset = 0) {
  const bracketSize = nextPowerOfTwo(seededTeams.length);
  const order = seedOrder(bracketSize);
  const slots = order.map(seedNum => {
    const team = seededTeams[seedNum - 1];
    return team ? { team } : { bye: true };
  });

  return {
    bracketSize,
    rankOffset,
    segments: [{ id: "seg-1", rankStart: 1 + rankOffset, rankSize: bracketSize, slots, scores: {} }],
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
 * Une équipe présente dans un créneau (slot) de bracket est-elle forfait ?
 * Un `{bye:true}` (créneau vide, sans équipe) n'est jamais "forfait" — voir
 * isSegmentRoundComplete/advanceSegment pour la distinction entre les deux.
 * @param {Object} slot - {team} ou {bye:true}
 * @param {Set<number>|null} forfeitedTeamIds
 */
function isForfeitedSlot(slot, forfeitedTeamIds) {
  return !!(slot?.team && forfeitedTeamIds && forfeitedTeamIds.has(slot.team.id));
}

/**
 * Le tour courant d'un segment est-il terminé ? Une affiche impliquant un
 * repos ("bye") n'a besoin d'aucune saisie (résolution automatique) — de
 * même pour une affiche impliquant une équipe déclarée forfait : elle perd
 * automatiquement, sans qu'un score soit à saisir (voir setTeamForfeited).
 * @param {Set<number>|null} forfeitedTeamIds
 */
function isSegmentRoundComplete(segment, forfeitedTeamIds) {
  return segmentPairs(segment).every(([a, b], idx) => {
    if (a.bye || b.bye) return true;
    if (isForfeitedSlot(a, forfeitedTeamIds) || isForfeitedSlot(b, forfeitedTeamIds)) return true;
    const score = segment.scores[idx];
    return score && score.a != null && score.b != null;
  });
}

/**
 * Fait avancer un segment terminé : construit les deux segments enfants
 * (vainqueurs → moitié supérieure des places restantes, perdants → moitié
 * inférieure). Un repos face à une vraie équipe résout automatiquement ce
 * match (l'équipe avance sans jouer) ; un repos face à un repos ne produit
 * rien de réel des deux côtés. Une équipe forfait face à une équipe active
 * perd automatiquement (comme un repos, mais l'équipe forfait elle-même
 * garde sa place — voir plus bas — au lieu de disparaître comme un repos) ;
 * si les deux équipes d'une affiche sont forfait, `a` avance nominalement
 * (choix arbitraire mais déterministe : cas très marginal, les deux équipes
 * continueront de toute façon à perdre automatiquement par la suite).
 * @param {Set<number>|null} forfeitedTeamIds
 * @returns {Array} les 1 ou 2 segments enfants (1 seul si rankSize/2 === … en
 *   pratique toujours 2, sauf tableau dégénéré à 1 équipe au total)
 */
function advanceSegment(segment, forfeitedTeamIds) {
  const pairs = segmentPairs(segment);
  const winners = [];
  const losers = [];

  pairs.forEach(([a, b], idx) => {
    const aForfeited = isForfeitedSlot(a, forfeitedTeamIds);
    const bForfeited = isForfeitedSlot(b, forfeitedTeamIds);

    if (a.bye && b.bye) {
      winners.push({ bye: true });
      losers.push({ bye: true });
    } else if (a.bye) {
      // b est une vraie équipe : si elle est elle-même forfait, personne ne
      // profite du repos (elle garde sa place côté perdants malgré tout).
      if (bForfeited) { winners.push({ bye: true }); losers.push(b); }
      else { winners.push(b); losers.push({ bye: true }); }
    } else if (b.bye) {
      if (aForfeited) { winners.push({ bye: true }); losers.push(a); }
      else { winners.push(a); losers.push({ bye: true }); }
    } else if (aForfeited || bForfeited) {
      if (aForfeited && bForfeited) { winners.push(a); losers.push(b); }
      else if (aForfeited) { winners.push(b); losers.push(a); }
      else { winners.push(a); losers.push(b); }
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
 * continu à partir de `rankOffset + 1` (les repos ne "mangent" jamais que
 * les moins bonnes places, de par la convention de placement des têtes de
 * série). `rankOffset` permet aux matchs de classement des non-qualifiés de
 * continuer la numérotation là où s'arrête la phase finale (voir buildFinalPhase).
 */
function computeFinalRanking(segments, rankOffset = 0) {
  return segments
    .filter(s => s.slots.length === 1 && s.slots[0].team)
    .sort((a, b) => a.rankStart - b.rankStart)
    .map((s, i) => ({ team: s.slots[0].team, rank: rankOffset + i + 1 }));
}

/**
 * Fait avancer la phase finale d'autant de tours que possible dans l'état
 * actuel : tout segment dont le tour courant est terminé se scinde en 2
 * segments enfants, en cascade tant que de nouveaux segments se terminent
 * aussitôt (cas des segments entièrement composés de repos, ou d'équipes
 * forfait). Recalcule le classement final si tout est résolu. Modifie
 * `finalPhase` en place.
 * @param {Object} finalPhase
 * @param {Set<number>|null} forfeitedTeamIds - ids d'équipes forfait (voir
 *   setTeamForfeited) ; une affiche impliquant l'une d'elles se résout
 *   automatiquement, sans score à saisir.
 */
function progressFinalPhase(finalPhase, forfeitedTeamIds) {
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
      if (isSegmentRoundComplete(segment, forfeitedTeamIds)) {
        finalPhase.rounds.push({
          segmentId: segment.id,
          rankStart: segment.rankStart,
          rankSize: segment.rankSize,
          label: segmentLabel(segment),
          pairs: segmentPairs(segment),
          scores: segment.scores
        });
        newlyCreated.push(...advanceSegment(segment, forfeitedTeamIds));
        changed = true;
      } else {
        stillActive.push(segment);
      }
    });

    finalPhase.segments = [...stillActive, ...newlyCreated];
  }

  if (finalPhase.segments.every(s => s.slots.length === 1)) {
    finalPhase.finalRanking = computeFinalRanking(finalPhase.segments, finalPhase.rankOffset || 0);
  } else {
    finalPhase.finalRanking = null;
  }
}

/**
 * Calcule, pour chaque équipe, ses statistiques sur l'ENSEMBLE du tournoi
 * (poules + phase finale + matchs de classement confondus) : matchs joués,
 * victoires, défaites, points marqués/encaissés. Sert à enrichir le
 * classement final combiné avec de vraies statistiques plutôt qu'un simple
 * rang. Une équipe n'appartenant qu'à une seule poule, il n'y a pas
 * d'ambiguïté à agréger ainsi tous ses matchs.
 * @param {Object} tournament
 * @returns {Map<number, {team:object, m:number, w:number, l:number, pf:number, pa:number}>}
 */
function computeOverallTeamStats(tournament) {
  const stats = new Map();

  const ensure = team => {
    if (!stats.has(team.id)) stats.set(team.id, { team, m: 0, w: 0, l: 0, pf: 0, pa: 0 });
    return stats.get(team.id);
  };

  const addResult = (team, ptsFor, ptsAgainst) => {
    const s = ensure(team);
    s.m++;
    s.pf += ptsFor;
    s.pa += ptsAgainst;
    if (ptsFor > ptsAgainst) s.w++;
    else if (ptsFor < ptsAgainst) s.l++;
  };

  (tournament.pools || []).forEach(pool => {
    pool.rounds.forEach((matches, rIdx) => {
      matches.forEach((match, mIdx) => {
        if (!match || match.bye) return;
        const score = pool.scores[`${rIdx}-${mIdx}`];
        if (!score || score.a == null || score.b == null) return;
        addResult(match.a, score.a, score.b);
        addResult(match.b, score.b, score.a);
      });
    });
  });

  [tournament.finalPhase, tournament.consolationPhase].forEach(phase => {
    if (!phase) return;
    phase.rounds.forEach(round => {
      round.pairs.forEach(([a, b], idx) => {
        if (a.bye || b.bye) return;
        const score = round.scores[idx];
        if (!score || score.a == null || score.b == null) return;
        addResult(a.team, score.a, score.b);
        addResult(b.team, score.b, score.a);
      });
    });
  });

  return stats;
}

/**
 * Attribue un terrain (index 0-based) à chaque match RÉELLEMENT en attente de
 * saisie (segments encore actifs, hors repos), à travers PLUSIEURS brackets
 * qui peuvent tourner en même temps (phase finale + matchs de classement).
 * Sans ça, chaque bracket recommence sa numérotation à "Terrain 1" de façon
 * indépendante, alors qu'ils ne peuvent pas physiquement partager les mêmes
 * terrains en même temps. L'historique déjà joué n'est pas concerné (un
 * match déjà joué n'a plus besoin d'un terrain "réservé").
 * @param {Array<Object|null>} phases - ex: [tournament.finalPhase, tournament.consolationPhase]
 * @param {number} numCourts
 * @returns {Map<string, number>} clé "segmentId-pairIndex" -> index de terrain (0-based)
 */
function assignCourtsToActiveMatches(phases, numCourts) {
  const assignment = new Map();
  const n = Math.max(1, numCourts || 1);
  let cursor = 0;

  // Les segments sont numérotés de la même façon dans n'importe quelle phase
  // (buildFinalPhase part toujours de "seg-1", advanceSegment ajoute "-w"/"-l") :
  // la phase finale et les matchs de classement partagent donc souvent le
  // même id de segment. On préfixe la clé par l'index de la phase (0, 1...)
  // pour ne jamais faire écraser l'attribution de l'une par celle de l'autre.
  phases.forEach((phase, phaseIdx) => {
    if (!phase) return;
    phase.segments
      .filter(segment => segment.slots.length > 1)
      .forEach(segment => {
        segmentPairs(segment).forEach(([a, b], idx) => {
          if (a.bye || b.bye) return;
          assignment.set(`${phaseIdx}-${segment.id}-${idx}`, cursor % n);
          cursor++;
        });
      });
  });

  return assignment;
}

// =============================================================================
// EDITION D'UNE EQUIPE : RENOMMAGE ET FORFAIT
// =============================================================================
// Un même id d'équipe apparaît dans PLUSIEURS objets distincts du tournoi (le
// calendrier de poule copie les mêmes équipes que pool.teams, chaque round de
// bracket déjà joué garde un instantané de l'équipe à l'époque, le classement
// final calculé aussi...). En mémoire ce sont souvent les mêmes références,
// mais plus après un rechargement depuis localStorage (JSON.stringify/parse
// duplique tout, sans jamais préserver le partage de référence) : les
// fonctions ci-dessous parcourent donc TOUJOURS l'ensemble de ces endroits et
// comparent par `id`, sans jamais supposer une identité d'objet partagée.

/**
 * Renomme une équipe partout où elle apparaît dans l'état du tournoi.
 * @param {Object} tournament
 * @param {number} teamId
 * @param {string} newName
 */
function renameTeamEverywhere(tournament, teamId, newName) {
  const applyToTeam = team => { if (team && team.id === teamId) team.name = newName; };
  const applyToSlot = slot => applyToTeam(slot?.team);

  (tournament.teams || []).forEach(applyToTeam);

  (tournament.pools || []).forEach(pool => {
    pool.teams.forEach(applyToTeam);
    pool.rounds.forEach(round => {
      round.forEach(match => {
        if (!match) return;
        if (match.bye) applyToTeam(match.team);
        else { applyToTeam(match.a); applyToTeam(match.b); }
      });
    });
  });

  [tournament.finalPhase, tournament.consolationPhase].forEach(phase => {
    if (!phase) return;
    phase.segments.forEach(segment => segment.slots.forEach(applyToSlot));
    phase.rounds.forEach(round => round.pairs.forEach(([a, b]) => { applyToSlot(a); applyToSlot(b); }));
    (phase.finalRanking || []).forEach(applyToTeam);
  });
}

/**
 * Déclare (ou annule) le forfait d'une équipe :
 * - `tournament.forfeitedTeamIds` (liste d'ids, sérialisable telle quelle
 *   dans localStorage) est mise à jour en conséquence ;
 * - en phase de poules, tout match PAS ENCORE joué impliquant cette équipe
 *   est immédiatement résolu en faveur de l'adversaire, avec un score
 *   conventionnel 1-0 (`{a, b, forfeit:true}` — le score minimal possible,
 *   pour ne pas fausser excessivement le différentiel de points des autres
 *   équipes de la poule) ; annuler le forfait retire uniquement CES scores
 *   auto-résolus (repère `forfeit:true`), jamais un vrai résultat déjà saisi.
 * - en phase finale / matchs de classement, la résolution des affiches en
 *   cours n'est PAS faite ici : elle se fait structurellement (comme un
 *   repos) via isSegmentRoundComplete/advanceSegment, il suffit à l'appelant
 *   de relancer progressFinalPhase(phase, new Set(tournament.forfeitedTeamIds))
 *   sur chaque phase existante juste après cet appel.
 * @param {Object} tournament
 * @param {number} teamId
 * @param {boolean} forfeited
 */
function setTeamForfeited(tournament, teamId, forfeited) {
  const ids = new Set(tournament.forfeitedTeamIds || []);
  if (forfeited) ids.add(teamId); else ids.delete(teamId);
  tournament.forfeitedTeamIds = [...ids];

  (tournament.pools || []).forEach(pool => {
    pool.rounds.forEach((matches, rIdx) => {
      matches.forEach((match, mIdx) => {
        if (!match || match.bye) return;
        if (match.a.id !== teamId && match.b.id !== teamId) return;

        const key = `${rIdx}-${mIdx}`;
        const existing = pool.scores[key];

        if (forfeited) {
          if (existing && existing.a != null && existing.b != null && !existing.forfeit) return; // vrai résultat déjà saisi : on n'écrase pas
          const aWins = match.b.id === teamId; // l'équipe qui N'EST PAS forfait gagne
          pool.scores[key] = { a: aWins ? 1 : 0, b: aWins ? 0 : 1, forfeit: true };
        } else if (existing && existing.forfeit) {
          delete pool.scores[key];
        }
      });
    });
  });
}
