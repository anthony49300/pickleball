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
  isPoolComplete
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

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exitCode = failed > 0 ? 1 : 0;
