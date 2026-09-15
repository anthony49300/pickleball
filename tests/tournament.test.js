"use strict";
/**
 * Tests unitaires du moteur du mode Tournoi (js/tournament/engine.js).
 *
 * Aucune dépendance externe (pas de Jest/Vitest) : uniquement les modules
 * natifs de Node (assert, vm, fs). Exécuter avec :
 *
 *   node tests/tournament.test.js
 *
 * Comme js/app/algorithm.js (voir tests/algorithm.test.js), engine.js est un
 * script classique de navigateur (pas de module, pas d'export) : on le charge
 * ici dans un contexte `vm` Node isolé pour récupérer ses fonctions.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

// Important : vm.runInThisContext (et non vm.createContext + vm.runInContext)
// exécute le script dans le MÊME realm V8 que ce fichier de test. Avec un
// contexte séparé, les tableaux/objets créés par engine.js appartiennent à un
// autre realm (Array/Object différents bien qu'identiques structurellement) :
// assert.deepStrictEqual les considère alors comme non égaux ("Values have
// same structure but are not reference-equal"), même quand les valeurs sont
// réellement identiques. engine.js ne déclare que des fonctions au niveau
// racine (aucun const/let global) : elles s'attachent normalement à `global`.
const enginePath = path.join(__dirname, "..", "js", "tournament", "engine.js");
const code = fs.readFileSync(enginePath, "utf8");
vm.runInThisContext(code, { filename: enginePath });
const {
  parseTeams,
  parsePlayerList,
  autoPairPlayers,
  parseCourtNames,
  allocateCourtsToPools,
  generateRoundRobin,
  dealRoundRobinIntoPools,
  dealSnakeIntoPools,
  buildPools,
  computePoolStandings,
  isPoolComplete,
  nextPowerOfTwo,
  seedOrder,
  seedQualifiedTeams,
  seedNonQualifiedTeams,
  buildFinalPhase,
  segmentPairs,
  isSegmentRoundComplete,
  advanceSegment,
  progressFinalPhase,
  computeFinalRanking,
  computeOverallTeamStats,
  assignCourtsToActiveMatches,
  renameTeamEverywhere,
  setTeamForfeited
} = global;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function makeTeams(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i, players: [`P${i}a`, `P${i}b`], name: `Team${i}` }));
}

// ---------------------------------------------------------------------------
// parseTeams
// ---------------------------------------------------------------------------

test("parseTeams : reconnaît les séparateurs &, virgule et 'et'", () => {
  const { teams, invalidLines } = parseTeams("Alice & Bob\nChloé, David\nÉmilie et Farid");
  assert.strictEqual(invalidLines.length, 0);
  assert.strictEqual(teams.length, 3);
  assert.deepStrictEqual(teams[0].players, ["Alice", "Bob"]);
  assert.deepStrictEqual(teams[1].players, ["Chloé", "David"]);
  assert.deepStrictEqual(teams[2].players, ["Émilie", "Farid"]);
});

test("parseTeams : signale les lignes invalides (pas exactement 2 joueurs)", () => {
  const { teams, invalidLines } = parseTeams("Alice & Bob\nSeulUnJoueur\nA & B & C");
  assert.strictEqual(teams.length, 1);
  assert.strictEqual(invalidLines.length, 2);
});

test("parseTeams : ignore les lignes vides", () => {
  const { teams } = parseTeams("Alice & Bob\n\n\nChloé & David\n");
  assert.strictEqual(teams.length, 2);
});

test("parseTeams : signale un joueur présent dans plusieurs équipes (insensible à la casse)", () => {
  const { duplicatePlayers } = parseTeams("Alice & Bob\nalice & Chloé");
  assert.deepStrictEqual(duplicatePlayers, ["Alice"]);
});

test("parseTeams : aucun doublon signalé quand tous les joueurs sont uniques", () => {
  const { duplicatePlayers } = parseTeams("Alice & Bob\nChloé & David");
  assert.strictEqual(duplicatePlayers.length, 0);
});

// ---------------------------------------------------------------------------
// parsePlayerList / autoPairPlayers / parseCourtNames
// ---------------------------------------------------------------------------

test("parsePlayerList : accepte une liste sur une ligne par joueur ou séparée par des virgules", () => {
  const { players } = parsePlayerList("Alice\nBob, Chloé\n\nDavid");
  assert.deepStrictEqual(players, ["Alice", "Bob", "Chloé", "David"]);
});

test("parsePlayerList : signale les doublons (insensible à la casse)", () => {
  const { duplicatePlayers } = parsePlayerList("Alice\nBOB\nbob");
  assert.deepStrictEqual(duplicatePlayers, ["BOB"]);
});

test("autoPairPlayers : associe tous les joueurs par 2, sans laissé-pour-compte si effectif pair", () => {
  const players = ["Alice", "Bob", "Chloé", "David"];
  const { pairs, leftover } = autoPairPlayers(players);
  assert.strictEqual(pairs.length, 2);
  assert.strictEqual(leftover, null);
  const allPaired = pairs.flat().sort();
  assert.deepStrictEqual(allPaired, [...players].sort());
});

test("autoPairPlayers : signale le joueur seul si l'effectif est impair", () => {
  const players = ["Alice", "Bob", "Chloé"];
  const { pairs, leftover } = autoPairPlayers(players);
  assert.strictEqual(pairs.length, 1);
  assert.ok(players.includes(leftover));
});

test("parseCourtNames : sépare sur les virgules et ignore les entrées vides", () => {
  assert.deepStrictEqual(parseCourtNames("Court Central, Court 1,, Terrain A"), ["Court Central", "Court 1", "Terrain A"]);
  assert.deepStrictEqual(parseCourtNames(""), []);
});

// ---------------------------------------------------------------------------
// allocateCourtsToPools
// ---------------------------------------------------------------------------

test("allocateCourtsToPools : au moins 1 terrain dédié par poule dès qu'il y en a assez", () => {
  const pools = [{ teams: makeTeams(4) }, { teams: makeTeams(4) }, { teams: makeTeams(4) }];
  const allocation = allocateCourtsToPools(pools, 3);

  allocation.forEach(courts => assert.ok(courts.length >= 1));

  // Aucun terrain partagé entre deux poules différentes.
  const allIndices = allocation.flat();
  assert.strictEqual(new Set(allIndices).size, allIndices.length, "un même terrain a été attribué à plusieurs poules");
  assert.deepStrictEqual([...new Set(allIndices)].sort((a, b) => a - b), [0, 1, 2]);
});

test("allocateCourtsToPools : les terrains excédentaires vont aux poules les plus grandes", () => {
  const pools = [{ teams: makeTeams(2) }, { teams: makeTeams(6) }];
  const allocation = allocateCourtsToPools(pools, 3);
  // 3 terrains pour 2 poules : 1 chacune + 1 en plus pour la plus grande (poule 1, 6 équipes).
  assert.strictEqual(allocation[0].length, 1);
  assert.strictEqual(allocation[1].length, 2);
});

test("allocateCourtsToPools : moins de terrains que de poules -> tout le monde partage", () => {
  const pools = [{ teams: makeTeams(2) }, { teams: makeTeams(2) }, { teams: makeTeams(2) }];
  const allocation = allocateCourtsToPools(pools, 2);
  assert.deepStrictEqual(allocation[0], [0, 1]);
  assert.deepStrictEqual(allocation[1], [0, 1]);
  assert.deepStrictEqual(allocation[2], [0, 1]);
});

// ---------------------------------------------------------------------------
// generateRoundRobin
// ---------------------------------------------------------------------------

function assertRoundRobinCorrect(numTeams) {
  const teams = makeTeams(numTeams);
  const rounds = generateRoundRobin(teams);

  // Aucune équipe ne joue deux fois sur une même journée (le repos éventuel
  // ne compte pas comme un "match").
  rounds.forEach((matches, rIdx) => {
    const seen = new Set();
    matches.forEach(match => {
      if (match.bye) return;
      for (const team of [match.a, match.b]) {
        assert.ok(!seen.has(team.id), `Team ${team.id} apparaît deux fois à la journée ${rIdx + 1} (N=${numTeams})`);
        seen.add(team.id);
      }
    });
  });

  // Exactement une équipe au repos par journée si l'effectif est impair, aucune sinon.
  rounds.forEach((matches, rIdx) => {
    const byeCount = matches.filter(m => m.bye).length;
    const expected = numTeams % 2 === 1 ? 1 : 0;
    assert.strictEqual(byeCount, expected, `Nombre de repos inattendu à la journée ${rIdx + 1} (N=${numTeams})`);
  });

  // Chaque paire d'équipes se rencontre exactement une fois sur l'ensemble des journées.
  const encounters = new Map();
  rounds.forEach(matches => {
    matches.forEach(match => {
      if (match.bye) return;
      const key = [match.a.id, match.b.id].sort((a, b) => a - b).join("-");
      encounters.set(key, (encounters.get(key) ?? 0) + 1);
    });
  });

  let expectedPairs = 0;
  for (let i = 0; i < numTeams; i++) {
    for (let j = i + 1; j < numTeams; j++) {
      expectedPairs++;
      const key = `${i}-${j}`;
      assert.strictEqual(encounters.get(key), 1, `La paire ${key} devrait se rencontrer exactement 1 fois (N=${numTeams}), reçu ${encounters.get(key) ?? 0}`);
    }
  }
  assert.strictEqual(encounters.size, expectedPairs, `Nombre de rencontres distinctes inattendu (N=${numTeams})`);
}

test("generateRoundRobin : calendrier correct pour un nombre pair d'équipes (4)", () => {
  assertRoundRobinCorrect(4);
});

test("generateRoundRobin : calendrier correct pour un nombre pair d'équipes (6)", () => {
  assertRoundRobinCorrect(6);
});

test("generateRoundRobin : calendrier correct pour un nombre impair d'équipes (5, avec bye)", () => {
  assertRoundRobinCorrect(5);
});

test("generateRoundRobin : calendrier correct pour un nombre impair d'équipes (3, avec bye)", () => {
  assertRoundRobinCorrect(3);
});

test("generateRoundRobin : l'ordre d'appel dans chaque journée tourne, pour ne pas toujours mettre la même équipe en 1re position", () => {
  // 6 équipes -> 5 journées de 3 matchs. Sans rotation, l'algorithme du
  // cercle laisse toujours team0 ("fixed") dans le tout premier match de
  // CHAQUE journée (voir le commentaire de generateRoundRobin) : sans
  // assez de terrains pour jouer une journée entière en même temps, elle
  // serait alors systématiquement appelée en premier terrain, jour après
  // jour, tandis qu'une autre équipe serait systématiquement en dernier.
  const teams = makeTeams(6);
  const rounds = generateRoundRobin(teams);

  const roundsWithTeam0First = rounds.filter(matches => {
    const first = matches[0];
    const ids = first.bye ? [first.team.id] : [first.a.id, first.b.id];
    return ids.includes(0);
  }).length;

  assert.ok(
    roundsWithTeam0First < rounds.length,
    `team0 ne devrait pas être en 1re position à chaque journée (l'est à ${roundsWithTeam0First}/${rounds.length})`
  );
});

test("generateRoundRobin : renvoie un tableau vide pour moins de 2 équipes", () => {
  assert.deepStrictEqual(generateRoundRobin(makeTeams(1)), []);
  assert.deepStrictEqual(generateRoundRobin(makeTeams(0)), []);
});

// ---------------------------------------------------------------------------
// Répartition en poules
// ---------------------------------------------------------------------------

test("dealRoundRobinIntoPools : répartit toutes les équipes, tailles équilibrées (±1)", () => {
  const teams = makeTeams(10);
  const pools = dealRoundRobinIntoPools(teams, 3);
  const sizes = pools.map(p => p.length);
  assert.strictEqual(sizes.reduce((a, b) => a + b, 0), 10);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `Écart de taille trop grand : ${sizes}`);
});

test("dealSnakeIntoPools : répartit toutes les équipes, tailles équilibrées (±1)", () => {
  const teams = makeTeams(10);
  const pools = dealSnakeIntoPools(teams, 3);
  const sizes = pools.map(p => p.length);
  assert.strictEqual(sizes.reduce((a, b) => a + b, 0), 10);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `Écart de taille trop grand : ${sizes}`);
});

test("dealSnakeIntoPools : la tête de série n°1 (première équipe) va en poule A", () => {
  const teams = makeTeams(8);
  const pools = dealSnakeIntoPools(teams, 4);
  assert.strictEqual(pools[0][0].id, teams[0].id);
});

test("buildPools : mode manuel respecte l'affectation fournie", () => {
  const teams = makeTeams(4);
  const manualAssignment = { 0: 0, 1: 1, 2: 0, 3: 1 };
  const pools = buildPools(teams, 2, "manual", manualAssignment);
  assert.deepStrictEqual(pools[0].teams.map(t => t.id), [0, 2]);
  assert.deepStrictEqual(pools[1].teams.map(t => t.id), [1, 3]);
});

// ---------------------------------------------------------------------------
// Classement de poule
// ---------------------------------------------------------------------------

test("computePoolStandings : classe par victoires puis différentiel puis points marqués", () => {
  const teams = makeTeams(3);
  const pool = { teams, rounds: generateRoundRobin(teams), scores: {} };

  // On identifie les rencontres par les équipes impliquées plutôt que par
  // position, pour ne pas dépendre de l'ordre exact produit par l'algorithme.
  const findMatchKey = (idA, idB) => {
    for (let r = 0; r < pool.rounds.length; r++) {
      for (let m = 0; m < pool.rounds[r].length; m++) {
        const match = pool.rounds[r][m];
        if (!match.bye && ((match.a.id === idA && match.b.id === idB) || (match.a.id === idB && match.b.id === idA))) {
          return { key: `${r}-${m}`, reversed: match.a.id === idB };
        }
      }
    }
    throw new Error(`Match ${idA} vs ${idB} introuvable`);
  };

  const setScore = (idA, idB, scoreA, scoreB) => {
    const { key, reversed } = findMatchKey(idA, idB);
    pool.scores[key] = reversed ? { a: scoreB, b: scoreA } : { a: scoreA, b: scoreB };
  };

  // Team0 gagne ses 2 matchs (large), Team1 gagne 1 et perd 1, Team2 perd ses 2.
  setScore(0, 1, 11, 5);
  setScore(0, 2, 11, 3);
  setScore(1, 2, 11, 9);

  const standings = computePoolStandings(pool);
  assert.strictEqual(standings[0].team.id, 0);
  assert.strictEqual(standings[1].team.id, 1);
  assert.strictEqual(standings[2].team.id, 2);
  assert.strictEqual(standings[0].w, 2);
  assert.strictEqual(standings[2].w, 0);
});

test("isPoolComplete : false tant qu'un score manque, true une fois tous saisis", () => {
  const teams = makeTeams(4);
  const pool = { teams, rounds: generateRoundRobin(teams), scores: {} };
  assert.strictEqual(isPoolComplete(pool), false);

  pool.rounds.forEach((matches, rIdx) => {
    matches.forEach((match, mIdx) => {
      if (!match.bye) pool.scores[`${rIdx}-${mIdx}`] = { a: 11, b: 5 };
    });
  });
  assert.strictEqual(isPoolComplete(pool), true);
});

// ---------------------------------------------------------------------------
// PHASE FINALE
// ---------------------------------------------------------------------------

test("nextPowerOfTwo : arrondit à la puissance de 2 supérieure ou égale", () => {
  assert.strictEqual(nextPowerOfTwo(1), 1);
  assert.strictEqual(nextPowerOfTwo(2), 2);
  assert.strictEqual(nextPowerOfTwo(3), 4);
  assert.strictEqual(nextPowerOfTwo(5), 8);
  assert.strictEqual(nextPowerOfTwo(8), 8);
  assert.strictEqual(nextPowerOfTwo(9), 16);
});

test("seedOrder : affiches standard du 1er tour (têtes de série écartées le plus longtemps possible)", () => {
  assert.deepStrictEqual(seedOrder(2), [1, 2]);
  assert.deepStrictEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepStrictEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("seedQualifiedTeams : tous les 1ers de poule d'abord, puis tous les 2èmes, etc.", () => {
  const poolA = { teams: makeTeams(3), rounds: [], scores: {} };
  poolA.rounds = generateRoundRobin(poolA.teams);
  const poolB = { teams: makeTeams(3).map(t => ({ ...t, id: t.id + 100 })), rounds: [], scores: {} };
  poolB.rounds = generateRoundRobin(poolB.teams);

  // Poule A : team0 gagne tout (1er), team1 2e, team2 3e.
  poolA.rounds.forEach((matches, rIdx) => matches.forEach((match, mIdx) => {
    if (match.bye) return;
    const key = `${rIdx}-${mIdx}`;
    poolA.scores[key] = match.a.id < match.b.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
  }));
  // Poule B : team102 gagne tout (1er), etc. (ids 100,101,102 -> ordre inverse pour varier)
  poolB.rounds.forEach((matches, rIdx) => matches.forEach((match, mIdx) => {
    if (match.bye) return;
    const key = `${rIdx}-${mIdx}`;
    poolB.scores[key] = match.a.id > match.b.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
  }));

  const seeded = seedQualifiedTeams([poolA, poolB], 2);
  // 2 qualifiés par poule -> 4 équipes : les deux 1ers de poule d'abord (bande 0),
  // puis les deux 2èmes (bande 1).
  assert.strictEqual(seeded.length, 4);
  assert.strictEqual(seeded[0].id, 0);   // 1er de poule A
  assert.strictEqual(seeded[1].id, 102); // 1er de poule B
  assert.strictEqual(seeded[2].id, 1);   // 2e de poule A
  assert.strictEqual(seeded[3].id, 101); // 2e de poule B
});

test("seedNonQualifiedTeams : ne prend que les équipes classées après les qualifiés, mêmes bandes", () => {
  const poolA = { teams: makeTeams(3), rounds: [], scores: {} };
  poolA.rounds = generateRoundRobin(poolA.teams);
  const poolB = { teams: makeTeams(3).map(t => ({ ...t, id: t.id + 100 })), rounds: [], scores: {} };
  poolB.rounds = generateRoundRobin(poolB.teams);

  poolA.rounds.forEach((matches, rIdx) => matches.forEach((match, mIdx) => {
    if (match.bye) return;
    poolA.scores[`${rIdx}-${mIdx}`] = match.a.id < match.b.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
  }));
  poolB.rounds.forEach((matches, rIdx) => matches.forEach((match, mIdx) => {
    if (match.bye) return;
    poolB.scores[`${rIdx}-${mIdx}`] = match.a.id > match.b.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
  }));

  // qualifiersPerPool=2 -> seuls les 3èmes de poule (derniers) sont NON qualifiés ici.
  const nonQualified = seedNonQualifiedTeams([poolA, poolB], 2);
  assert.strictEqual(nonQualified.length, 2);
  assert.strictEqual(nonQualified[0].id, 2);   // dernier de poule A
  assert.strictEqual(nonQualified[1].id, 100); // dernier de poule B
});

test("seedQualifiedTeams / seedNonQualifiedTeams : une équipe forfait AVANT le tirage libère sa place, prise par la suivante de sa poule", () => {
  const teams = makeTeams(4);
  const pool = { teams, rounds: generateRoundRobin(teams), scores: {} };

  const findMatchKey = (idA, idB) => {
    for (let r = 0; r < pool.rounds.length; r++) {
      for (let m = 0; m < pool.rounds[r].length; m++) {
        const match = pool.rounds[r][m];
        if (!match.bye && ((match.a.id === idA && match.b.id === idB) || (match.a.id === idB && match.b.id === idA))) {
          return { key: `${r}-${m}`, reversed: match.a.id === idB };
        }
      }
    }
    throw new Error(`Match ${idA} vs ${idB} introuvable`);
  };
  const setScore = (idA, idB, scoreA, scoreB) => {
    const { key, reversed } = findMatchKey(idA, idB);
    pool.scores[key] = reversed ? { a: scoreB, b: scoreA } : { a: scoreA, b: scoreB };
  };

  // Team0 gagne tout (1er), Team1 bat tout sauf Team0 (2e), Team2 ne bat
  // que Team3 (3e), Team3 perd tout (4e).
  setScore(0, 1, 11, 5);
  setScore(0, 2, 11, 5);
  setScore(0, 3, 11, 5);
  setScore(1, 2, 11, 5);
  setScore(1, 3, 11, 5);
  setScore(2, 3, 11, 5);

  const forfeitedTeamIds = new Set([0]); // Team0 (1er) déclare forfait avant tout tirage

  const qualified = seedQualifiedTeams([pool], 2, forfeitedTeamIds);
  assert.deepStrictEqual(qualified.map(t => t.id), [1, 2], "Team2 (3e à l'origine) doit prendre la place laissée par Team0");

  const nonQualified = seedNonQualifiedTeams([pool], 2, forfeitedTeamIds);
  assert.deepStrictEqual(nonQualified.map(t => t.id), [3], "Team0 (forfait) ne doit apparaître dans AUCUN des deux tirages");

  // Sans forfait, le comportement d'origine reste inchangé (non-régression).
  assert.deepStrictEqual(seedQualifiedTeams([pool], 2).map(t => t.id), [0, 1]);
  assert.deepStrictEqual(seedNonQualifiedTeams([pool], 2).map(t => t.id), [2, 3]);
});

test("buildFinalPhase + computeFinalRanking : rankOffset décale les places affichées", () => {
  const teams = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `Seed${i + 1}` }));
  const finalPhase = buildFinalPhase(teams, 4); // continue après 4 places déjà prises ailleurs
  assert.strictEqual(finalPhase.segments[0].rankStart, 5);

  let guard = 0;
  while (!finalPhase.finalRanking && guard < 10) {
    guard++;
    finalPhase.segments.forEach(segment => {
      if (segment.slots.length === 1) return;
      segmentPairs(segment).forEach(([a, b], idx) => {
        if (a.bye || b.bye || segment.scores[idx]) return;
        segment.scores[idx] = a.team.id < b.team.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
      });
    });
    progressFinalPhase(finalPhase);
  }

  assert.deepStrictEqual(finalPhase.finalRanking.map(r => r.rank), [5, 6, 7, 8]);
});

test("buildFinalPhase : complète avec des repos jusqu'à la puissance de 2 supérieure, données aux moins bonnes têtes de série", () => {
  const teams = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Seed${i + 1}` }));
  const finalPhase = buildFinalPhase(teams);
  assert.strictEqual(finalPhase.bracketSize, 8);

  const topSegment = finalPhase.segments[0];
  assert.strictEqual(topSegment.slots.length, 8);
  const realCount = topSegment.slots.filter(s => s.team).length;
  const byeCount = topSegment.slots.filter(s => s.bye).length;
  assert.strictEqual(realCount, 5);
  assert.strictEqual(byeCount, 3);

  // Aucune affiche "bye contre bye" ne devrait exister dès le 1er tour ici
  // (5 réelles, 3 repos, sur 4 affiches) : au moins une affiche 100% réelle.
  const pairs = segmentPairs(topSegment);
  assert.ok(pairs.some(([a, b]) => a.team && b.team));
});

/**
 * Simule une phase finale complète où l'équipe à l'id le plus bas (= la
 * meilleure tête de série) gagne systématiquement, sans aucune surprise.
 * Sert à vérifier que l'algorithme reproduit alors exactement l'ordre du
 * seeding en sortie — la propriété la plus parlante pour valider le moteur.
 */
function simulateFinalPhase(numRealTeams) {
  const teams = Array.from({ length: numRealTeams }, (_, i) => ({ id: i + 1, name: `Seed${i + 1}` }));
  const finalPhase = buildFinalPhase(teams);

  let guard = 0;
  while (!finalPhase.finalRanking && guard < 20) {
    guard++;
    finalPhase.segments.forEach(segment => {
      if (segment.slots.length === 1) return;
      segmentPairs(segment).forEach(([a, b], idx) => {
        if (a.bye || b.bye || segment.scores[idx]) return;
        segment.scores[idx] = a.team.id < b.team.id ? { a: 11, b: 5 } : { a: 5, b: 11 };
      });
    });
    progressFinalPhase(finalPhase);
  }

  if (!finalPhase.finalRanking) throw new Error("La phase finale ne s'est pas résolue (boucle infinie ?)");
  return finalPhase;
}

[2, 3, 4, 5, 6, 7, 8, 9].forEach(n => {
  test(`phase finale : sans surprise, le classement final reproduit l'ordre de seeding (${n} équipes)`, () => {
    const finalPhase = simulateFinalPhase(n);
    const order = finalPhase.finalRanking.map(r => r.team.id);
    assert.deepStrictEqual(order, Array.from({ length: n }, (_, i) => i + 1));
  });
});

test("phase finale : aucune équipe ne joue deux fois dans le même tour", () => {
  const finalPhase = simulateFinalPhase(6);
  const seenPerRound = new Map();
  finalPhase.rounds.forEach(round => {
    round.pairs.forEach(([a, b]) => {
      for (const slot of [a, b]) {
        if (slot.bye) continue;
        const key = `${round.rankStart}-${round.rankSize}`; // approx. "round" par segment
        // Une même équipe ne doit jamais apparaître 2 fois DANS UN MEME SEGMENT
        // (elle ne peut de toute façon apparaître que dans 1 seul segment à la fois).
        if (!seenPerRound.has(key)) seenPerRound.set(key, new Set());
        const seen = seenPerRound.get(key);
        assert.ok(!seen.has(slot.team.id), `Team ${slot.team.id} apparaît deux fois dans le segment ${key}`);
        seen.add(slot.team.id);
      }
    });
  });
});

test("computeFinalRanking : filtre les repos et renumérote les places en continu", () => {
  const segments = [
    { slots: [{ team: { id: 1 } }], rankStart: 1 },
    { slots: [{ bye: true }], rankStart: 2 },
    { slots: [{ team: { id: 2 } }], rankStart: 3 },
    { slots: [{ bye: true }], rankStart: 4 }
  ];
  const ranking = computeFinalRanking(segments);
  assert.deepStrictEqual(ranking.map(r => r.team.id), [1, 2]);
  assert.deepStrictEqual(ranking.map(r => r.rank), [1, 2]);
});

test("computeOverallTeamStats : agrège les matchs de poule et de bracket pour chaque équipe", () => {
  const team1 = { id: 1, name: "Team1" };
  const team2 = { id: 2, name: "Team2" };

  const tournament = {
    pools: [{
      teams: [team1, team2],
      rounds: [[{ a: team1, b: team2 }]],
      scores: { "0-0": { a: 11, b: 5 } }
    }],
    finalPhase: {
      rounds: [{
        pairs: [[{ team: team1 }, { team: team2 }]],
        scores: { 0: { a: 11, b: 9 } }
      }]
    },
    consolationPhase: null
  };

  const stats = computeOverallTeamStats(tournament);
  const s1 = stats.get(1);
  const s2 = stats.get(2);

  assert.strictEqual(s1.m, 2);
  assert.strictEqual(s1.w, 2);
  assert.strictEqual(s1.l, 0);
  assert.strictEqual(s1.pf, 22);
  assert.strictEqual(s1.pa, 14);

  assert.strictEqual(s2.m, 2);
  assert.strictEqual(s2.w, 0);
  assert.strictEqual(s2.l, 2);
  assert.strictEqual(s2.pf, 14);
  assert.strictEqual(s2.pa, 22);
});

test("computeOverallTeamStats : ignore les affiches de repos (bye) dans les brackets", () => {
  const team1 = { id: 1, name: "Team1" };
  const tournament = {
    pools: [],
    finalPhase: {
      rounds: [{
        pairs: [[{ team: team1 }, { bye: true }]],
        scores: {}
      }]
    },
    consolationPhase: null
  };

  const stats = computeOverallTeamStats(tournament);
  // L'équipe n'a joué aucun vrai match (juste un repos) : pas d'entrée du tout,
  // plutôt qu'une entrée à 0 — au rendu, on retombe sur des stats à zéro par défaut.
  assert.strictEqual(stats.has(1), false);
});

test("assignCourtsToActiveMatches : répartit les terrains entre plusieurs brackets actifs en même temps", () => {
  const makeSegment = (id, numRealTeams) => ({
    id,
    slots: makeTeams(numRealTeams).map(t => ({ team: t }))
  });

  const phaseA = { segments: [makeSegment("a1", 4)] };  // 2 vrais matchs
  const phaseB = { segments: [makeSegment("b1", 4)] };  // 2 vrais matchs

  // 4 terrains pour 4 matchs au total : chacun un terrain distinct, sans chevauchement.
  const assignment = assignCourtsToActiveMatches([phaseA, phaseB], 4);
  const used = [
    assignment.get("0-a1-0"), assignment.get("0-a1-1"),
    assignment.get("1-b1-0"), assignment.get("1-b1-1")
  ];
  assert.strictEqual(new Set(used).size, 4, `Les 4 matchs devraient utiliser 4 terrains distincts : ${used}`);
  assert.deepStrictEqual([...new Set(used)].sort((x, y) => x - y), [0, 1, 2, 3]);
});

test("assignCourtsToActiveMatches : ne mélange pas deux phases dont les segments partagent le même id", () => {
  // buildFinalPhase part TOUJOURS de l'id "seg-1" : la phase finale et les
  // matchs de classement ont donc typiquement le même id de segment. Sans
  // distinction par phase, la 2e phase traitée écraserait l'attribution de
  // la 1re dans la map (même clé) — régression du bug remonté par l'utilisateur.
  const makeSegment = numRealTeams => ({
    id: "seg-1",
    slots: makeTeams(numRealTeams).map(t => ({ team: t }))
  });

  const finalPhase = { segments: [makeSegment(4)] };       // 2 vrais matchs
  const consolationPhase = { segments: [makeSegment(4)] }; // 2 vrais matchs, même id "seg-1"

  const assignment = assignCourtsToActiveMatches([finalPhase, consolationPhase], 4);
  const finalCourts = [assignment.get("0-seg-1-0"), assignment.get("0-seg-1-1")];
  const consolationCourts = [assignment.get("1-seg-1-0"), assignment.get("1-seg-1-1")];

  assert.ok(finalCourts.every(c => c != null), "Attribution manquante pour la phase finale");
  assert.ok(consolationCourts.every(c => c != null), "Attribution manquante pour les matchs de classement");

  const overlap = finalCourts.filter(c => consolationCourts.includes(c));
  assert.strictEqual(overlap.length, 0, `Les deux phases partagent un terrain alors qu'il y en a assez : ${JSON.stringify({ finalCourts, consolationCourts })}`);
});

test("assignCourtsToActiveMatches : boucle si moins de terrains que de matchs simultanés", () => {
  const segment = { id: "s1", slots: makeTeams(4).map(t => ({ team: t })) }; // 2 vrais matchs
  const assignment = assignCourtsToActiveMatches([{ segments: [segment] }], 1);
  assert.strictEqual(assignment.get("0-s1-0"), 0);
  assert.strictEqual(assignment.get("0-s1-1"), 0);
});

test("assignCourtsToActiveMatches : ignore les segments déjà résolus et les affiches de repos", () => {
  const resolvedSegment = { id: "done", slots: [{ team: makeTeams(1)[0] }] }; // taille 1 : plus actif
  const byeSegment = { id: "bye", slots: [{ team: makeTeams(1)[0] }, { bye: true }] };
  const assignment = assignCourtsToActiveMatches([{ segments: [resolvedSegment, byeSegment] }], 4);
  assert.strictEqual(assignment.size, 0);
});

// ---------------------------------------------------------------------------
// FORFAIT : isSegmentRoundComplete / advanceSegment / progressFinalPhase
// ---------------------------------------------------------------------------

test("advanceSegment : une équipe forfait perd automatiquement face à une équipe active (sans score)", () => {
  const teams = makeTeams(2);
  const segment = { id: "s", rankStart: 1, rankSize: 2, slots: [{ team: teams[0] }, { team: teams[1] }], scores: {} };
  const forfeitedTeamIds = new Set([teams[0].id]);

  assert.strictEqual(isSegmentRoundComplete(segment, forfeitedTeamIds), true);
  const [winnerSeg, loserSeg] = advanceSegment(segment, forfeitedTeamIds);
  assert.strictEqual(winnerSeg.slots[0].team.id, teams[1].id);
  assert.strictEqual(loserSeg.slots[0].team.id, teams[0].id);
});

test("advanceSegment : deux équipes forfait dans la même affiche restent toutes les deux suivies (aucune ne disparaît)", () => {
  const teams = makeTeams(2);
  const segment = { id: "s", rankStart: 1, rankSize: 2, slots: [{ team: teams[0] }, { team: teams[1] }], scores: {} };
  const forfeitedTeamIds = new Set([teams[0].id, teams[1].id]);

  assert.strictEqual(isSegmentRoundComplete(segment, forfeitedTeamIds), true);
  const [winnerSeg, loserSeg] = advanceSegment(segment, forfeitedTeamIds);
  assert.strictEqual(winnerSeg.slots[0].team.id, teams[0].id);
  assert.strictEqual(loserSeg.slots[0].team.id, teams[1].id);
});

test("advanceSegment : une équipe forfait face à un repos (bye) ne profite pas du repos", () => {
  const teams = makeTeams(1);
  const segment = { id: "s", rankStart: 1, rankSize: 2, slots: [{ team: teams[0] }, { bye: true }], scores: {} };
  const forfeitedTeamIds = new Set([teams[0].id]);

  const [winnerSeg, loserSeg] = advanceSegment(segment, forfeitedTeamIds);
  assert.strictEqual(winnerSeg.slots[0].bye, true);
  assert.strictEqual(loserSeg.slots[0].team.id, teams[0].id);
});

test("progressFinalPhase : une équipe forfait perd automatiquement à chaque tour, jusqu'à finir dernière au classement", () => {
  const teams = makeTeams(4);
  const finalPhase = buildFinalPhase(teams, 0);
  const forfeitedTeamIds = new Set([teams[0].id]); // tête de série n°1 -> 1er créneau du tableau

  // 1er tour : seule l'affiche Team0(forfait) vs Team3 se résout automatiquement.
  // L'autre affiche (Team1 vs Team2) attend toujours un vrai score : le tour
  // entier n'est donc pas encore complet, rien n'avance.
  progressFinalPhase(finalPhase, forfeitedTeamIds);
  assert.strictEqual(finalPhase.rounds.length, 0);
  assert.strictEqual(finalPhase.segments.length, 1);

  finalPhase.segments[0].scores[1] = { a: 11, b: 5 }; // Team1 bat Team2
  progressFinalPhase(finalPhase, forfeitedTeamIds);

  // Le 1er tour se termine (Team3 et Team1 avancent en demi-finale), ET la
  // "petite finale" des places 3-4 (Team0 forfait vs Team2) se résout
  // AUSSITÔT dans la foulée, sans qu'aucun score n'ait été saisi pour elle :
  // progressFinalPhase avance en cascade tant que de nouveaux segments se
  // terminent immédiatement (ici, tout segment impliquant Team0 se termine
  // dès qu'il est créé). D'où 2 rounds enregistrés après ce seul appel, pas 1.
  assert.strictEqual(finalPhase.rounds.length, 2);
  const winnerFinal = finalPhase.segments.find(s => s.rankStart === 1);
  const rank3Segment = finalPhase.segments.find(s => s.rankStart === 3);
  const rank4Segment = finalPhase.segments.find(s => s.rankStart === 4);
  assert.ok(winnerFinal.slots.some(s => s.team?.id === teams[3].id), "Team3 doit avoir avancé sans jouer");
  assert.ok(!winnerFinal.slots.some(s => s.team?.id === teams[0].id), "Team0 (forfait) ne doit pas être côté vainqueurs");
  assert.strictEqual(rank3Segment.slots[0].team.id, teams[2].id, "Team2 doit déjà être 3e (bat Team0, forfait, sans jouer)");
  assert.strictEqual(rank4Segment.slots[0].team.id, teams[0].id, "Team0 (forfait) doit déjà être 4e");

  // Dernier tour : seule la vraie finale (Team3 vs Team1) a encore besoin d'un score.
  winnerFinal.scores[0] = { a: 11, b: 9 };
  progressFinalPhase(finalPhase, forfeitedTeamIds);

  assert.ok(finalPhase.finalRanking, "le classement final devrait être entièrement résolu");
  const team0Rank = finalPhase.finalRanking.find(r => r.team.id === teams[0].id).rank;
  assert.strictEqual(team0Rank, 4, "l'équipe forfait doit finir dernière");
});

// ---------------------------------------------------------------------------
// renameTeamEverywhere
// ---------------------------------------------------------------------------

test("renameTeamEverywhere : renomme l'équipe partout, même quand chaque structure a sa PROPRE copie de l'équipe (cas d'un tournoi rechargé depuis localStorage, où JSON casse le partage de référence)", () => {
  const cloneTeam = t => ({ ...t });
  const teams = makeTeams(2);

  const pool = {
    teams: [cloneTeam(teams[0]), cloneTeam(teams[1])],
    rounds: [[{ a: cloneTeam(teams[0]), b: cloneTeam(teams[1]) }]],
    scores: {}
  };

  const finalPhase = {
    segments: [{ id: "seg-1", rankStart: 1, rankSize: 2, slots: [{ team: cloneTeam(teams[0]) }, { team: cloneTeam(teams[1]) }], scores: {} }],
    rounds: [{
      segmentId: "old", rankStart: 1, rankSize: 2, label: "x",
      pairs: [[{ team: cloneTeam(teams[0]) }, { team: cloneTeam(teams[1]) }]],
      scores: {}
    }],
    finalRanking: [{ team: cloneTeam(teams[0]), rank: 1 }, { team: cloneTeam(teams[1]), rank: 2 }]
  };

  const tournament = { teams: [cloneTeam(teams[0]), cloneTeam(teams[1])], pools: [pool], finalPhase };

  renameTeamEverywhere(tournament, 0, "Nouveau Nom");

  assert.strictEqual(tournament.teams.find(t => t.id === 0).name, "Nouveau Nom");
  assert.strictEqual(pool.teams.find(t => t.id === 0).name, "Nouveau Nom");
  assert.strictEqual(pool.rounds[0][0].a.name, "Nouveau Nom");
  assert.strictEqual(finalPhase.segments[0].slots[0].team.name, "Nouveau Nom");
  assert.strictEqual(finalPhase.rounds[0].pairs[0][0].team.name, "Nouveau Nom");
  assert.strictEqual(finalPhase.finalRanking[0].team.name, "Nouveau Nom");

  // L'autre équipe (id 1) n'est jamais touchée.
  assert.strictEqual(pool.teams.find(t => t.id === 1).name, "Team1");
  assert.strictEqual(finalPhase.finalRanking[1].team.name, "Team1");
});

// ---------------------------------------------------------------------------
// setTeamForfeited
// ---------------------------------------------------------------------------

test("setTeamForfeited : résout automatiquement les matchs de poule restants (1-0), sans écraser un score déjà saisi ; l'annulation ne retire que la résolution automatique", () => {
  const teams = makeTeams(3);
  const pool = { teams, rounds: generateRoundRobin(teams), scores: {} };
  const tournament = { pools: [pool] };

  // Round-robin à 3 équipes : chacune joue 2 vrais matchs (+ 1 repos).
  const team0Matches = [];
  pool.rounds.forEach((matches, rIdx) => matches.forEach((match, mIdx) => {
    if (!match.bye && (match.a.id === 0 || match.b.id === 0)) team0Matches.push({ rIdx, mIdx, match });
  }));
  assert.strictEqual(team0Matches.length, 2);

  // Le 1er des 2 matchs de Team0 est déjà joué (vrai résultat) avant le forfait.
  const [{ rIdx: rIdx0, mIdx: mIdx0, match: match0 }, { rIdx: rIdx1, mIdx: mIdx1, match: match1 }] = team0Matches;
  const key0 = `${rIdx0}-${mIdx0}`;
  const realScore = match0.a.id === 0 ? { a: 11, b: 3 } : { a: 3, b: 11 };
  pool.scores[key0] = realScore;

  setTeamForfeited(tournament, 0, true);

  assert.deepStrictEqual(tournament.forfeitedTeamIds, [0]);
  assert.deepStrictEqual(pool.scores[key0], realScore); // le vrai résultat n'a pas bougé

  const key1 = `${rIdx1}-${mIdx1}`;
  const opponentIsA = match1.b.id === 0;
  assert.strictEqual(pool.scores[key1].forfeit, true);
  assert.strictEqual(pool.scores[key1][opponentIsA ? "a" : "b"], 1);
  assert.strictEqual(pool.scores[key1][opponentIsA ? "b" : "a"], 0);

  setTeamForfeited(tournament, 0, false);
  assert.deepStrictEqual(tournament.forfeitedTeamIds, []);
  assert.strictEqual(pool.scores[key1], undefined); // résolution automatique annulée
  assert.deepStrictEqual(pool.scores[key0], realScore); // le vrai résultat, lui, reste intact
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exitCode = failed > 0 ? 1 : 0;
