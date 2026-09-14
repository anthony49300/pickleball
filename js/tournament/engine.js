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
 * @returns {{ teams: Array<{id:number, players:string[], name:string}>, invalidLines: string[] }}
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

  return { teams, invalidLines };
}

/**
 * Génère un calendrier round-robin pour une poule : chaque équipe affronte
 * toutes les autres exactement une fois (algorithme du cercle / circle method).
 * Si le nombre d'équipes est impair, une équipe est exemptée ("bye") à tour de
 * rôle sur une journée (représenté par `null` à la place du match).
 * @param {Array} teams - équipes de la poule
 * @returns {Array<Array<{a:object,b:object}|null>>} - journées, une par élément
 */
function generateRoundRobin(teams) {
  if (teams.length < 2) return [];

  const BYE = { bye: true };
  const list = teams.length % 2 === 0 ? [...teams] : [...teams, BYE];
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
      matches.push(a.bye || b.bye ? null : { a, b });
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
      if (!match) return; // journée de bye
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
      if (!match) return true;
      const score = pool.scores[`${rIdx}-${mIdx}`];
      return score && score.a != null && score.b != null;
    })
  );
}
