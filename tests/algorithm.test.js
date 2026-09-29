"use strict";
/**
 * Tests unitaires du moteur de rotation (js/app/algorithm.js).
 *
 * Aucune dépendance externe (pas de Jest/Vitest) : uniquement les modules
 * natifs de Node (assert, vm, fs). Exécuter avec :
 *
 *   node tests/algorithm.test.js
 *
 * js/app/algorithm.js est un script classique de navigateur (pas de module,
 * pas d'export) — voir la note en tête de ce fichier pour l'explication
 * (compatibilité file://). On le charge donc ici dans un contexte `vm` Node
 * isolé pour récupérer ses fonctions, sans y toucher ni changer son
 * fonctionnement dans le navigateur.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

// Important : vm.runInThisContext (et non vm.createContext + vm.runInContext)
// exécute le script dans le MÊME realm V8 que ce fichier de test. Avec un
// contexte séparé, les tableaux/objets créés par algorithm.js appartiennent à
// un autre realm (Array/Object différents bien qu'identiques structurellement) :
// assert.deepStrictEqual les considère alors comme non égaux ("Values have
// same structure but are not reference-equal"), même quand les valeurs sont
// réellement identiques — voir le test "6 joueurs / 2 terrains" plus bas, dont
// le contournement (assert.strictEqual par valeur plutôt que deepStrictEqual
// sur le tableau) n'est donc plus strictement nécessaire, mais reste correct.
// algorithm.js ne déclare que des fonctions au niveau racine (aucun const/let
// global) : elles s'attachent normalement à `global`.
const algoPath = path.join(__dirname, "..", "js", "app", "algorithm.js");
const code = fs.readFileSync(algoPath, "utf8");
vm.runInThisContext(code, { filename: algoPath });
const { scheduleRotations, matchScoreKey, readMatchScore, writeMatchScore, getFrozenRounds } = global;

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

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => `P${i + 1}`);
}

// Options par défaut alignées sur celles proposées dans le formulaire (index.html).
const DEFAULT_OPTIONS = {
  wT: 10, wO: 3, wP: 1,
  beamWidth: 24, partnerK: 6,
  squareRepeats: true, avoidB2B: true
};

function noPresence() { return {}; }

// ---------------------------------------------------------------------------

test("lève une erreur avec moins de 4 joueurs", () => {
  assert.throws(() => {
    scheduleRotations(["A", "B", "C"], 1, 3, "seed", DEFAULT_OPTIONS, noPresence());
  });
});

test("chaque joueur n'apparaît qu'une seule fois par tour (aucun doublon sur les terrains)", () => {
  const players = makePlayers(12);
  const result = scheduleRotations(players, 3, 6, "seed-1", DEFAULT_OPTIONS, noPresence());

  result.rounds.forEach((matches, rIdx) => {
    const seen = new Set();
    for (const [t1, t2] of matches) {
      for (const p of [...t1, ...t2]) {
        assert.ok(!seen.has(p), `Le joueur ${p} apparaît deux fois au tour ${rIdx + 1}`);
        seen.add(p);
      }
    }
  });
});

test("chaque joueur est soit sur un terrain, soit sur le banc, jamais les deux ni aucun", () => {
  const players = makePlayers(10);
  const result = scheduleRotations(players, 2, 5, "seed-2", DEFAULT_OPTIONS, noPresence());

  result.rounds.forEach((matches, rIdx) => {
    const playing = new Set();
    for (const [t1, t2] of matches) for (const p of [...t1, ...t2]) playing.add(p);
    const benched = new Set(result.benches[rIdx]);

    for (const p of players) {
      const isPlaying = playing.has(p);
      const isBenched = benched.has(p);
      assert.ok(
        isPlaying !== isBenched,
        `${p} doit être soit sur un terrain, soit sur le banc au tour ${rIdx + 1} (pas les deux, pas aucun)`
      );
    }
  });
});

test("ne dépasse jamais le nombre de terrains disponibles", () => {
  const players = makePlayers(20);
  const result = scheduleRotations(players, 3, 4, "seed-3", DEFAULT_OPTIONS, noPresence());
  result.rounds.forEach((matches, rIdx) => {
    assert.ok(matches.length <= 3, `Tour ${rIdx + 1} a ${matches.length} matchs pour seulement 3 terrains`);
  });
});

test("le même seed reproduit exactement le même planning (déterminisme)", () => {
  const players = makePlayers(9);
  const r1 = scheduleRotations([...players], 2, 5, "seed-repro", DEFAULT_OPTIONS, noPresence());
  const r2 = scheduleRotations([...players], 2, 5, "seed-repro", DEFAULT_OPTIONS, noPresence());
  assert.strictEqual(JSON.stringify(r1.rounds), JSON.stringify(r2.rounds));
});

test("respecte les fenêtres de présence (un joueur absent ne joue pas sur ce tour)", () => {
  const players = makePlayers(8);
  const presence = { P1: { start: 3, end: 8 } }; // P1 absent des tours 1 et 2
  const result = scheduleRotations(players, 2, 4, "seed-presence", DEFAULT_OPTIONS, presence);

  for (let r = 0; r < 2; r++) {
    const playing = new Set();
    for (const [t1, t2] of result.rounds[r]) for (const p of [...t1, ...t2]) playing.add(p);
    assert.ok(!playing.has("P1"), `P1 ne devrait pas jouer au tour ${r + 1} (absent)`);
    assert.ok(result.absents[r].includes("P1"), `P1 devrait être listé comme absent au tour ${r + 1}`);
  }
});

test("cas spécial 6 joueurs / 2 terrains : 1 double + 1 simple, personne au banc", () => {
  const players = makePlayers(6);
  const result = scheduleRotations(players, 2, 3, "seed-six", DEFAULT_OPTIONS, noPresence());

  result.rounds.forEach((matches, rIdx) => {
    assert.strictEqual(matches.length, 2, `Tour ${rIdx + 1} devrait avoir 2 matchs (1 double + 1 simple)`);

    const sizes = matches.map(([t1, t2]) => t1.length + t2.length).sort((a, b) => a - b);
    const detail = `reçu ${JSON.stringify(sizes)} (tour ${rIdx + 1})`;
    assert.strictEqual(sizes.length, 2, `Devrait y avoir exactement 2 tailles de match, ${detail}`);
    assert.strictEqual(sizes[0], 2, `Devrait y avoir un simple (2 joueurs), ${detail}`);
    assert.strictEqual(sizes[1], 4, `Devrait y avoir un double (4 joueurs), ${detail}`);

    assert.strictEqual(result.benches[rIdx].length, 0, `Tour ${rIdx + 1} ne devrait avoir personne au banc`);
  });
});

test("répartition raisonnablement équitable des passages au banc sur une longue session", () => {
  // 10 joueurs, 2 terrains -> 8 joueurs actifs par tour -> 2 au banc par tour.
  // Sur 20 tours (40 passages au banc au total, 4 en moyenne par joueur), l'écart
  // entre le plus et le moins banni ne devrait pas s'envoler. Seuil volontairement
  // large (pas une preuve d'optimalité, juste un garde-fou contre une régression
  // qui casserait complètement la logique de rotation du banc).
  const players = makePlayers(10);
  const result = scheduleRotations(players, 2, 20, "seed-fair", DEFAULT_OPTIONS, noPresence());

  const benchCounts = new Map(players.map(p => [p, 0]));
  result.benches.forEach(benched => {
    benched.forEach(p => benchCounts.set(p, (benchCounts.get(p) ?? 0) + 1));
  });

  const counts = [...benchCounts.values()];
  const spread = Math.max(...counts) - Math.min(...counts);
  assert.ok(
    spread <= 4,
    `Écart de passages au banc trop grand : ${spread} (détail: ${JSON.stringify([...benchCounts])})`
  );
});

// ---------------------------------------------------------------------------
// CLÉ DE SCORE PAR COMPOSITION (matchScoreKey / readMatchScore / writeMatchScore)
// ---------------------------------------------------------------------------

test("writeMatchScore puis readMatchScore retrouvent le score par composition du match", () => {
  const scores = {};
  const match = [["Antoine", "Marc"], ["Hugo", "Lucas"]];

  writeMatchScore(scores, 0, match, "1", 11);
  writeMatchScore(scores, 0, match, "2", 3);

  const sc = readMatchScore(scores, 0, 0, match);
  assert.strictEqual(sc["1"], 11);
  assert.strictEqual(sc["2"], 3);
});

test("readMatchScore n'attribue jamais un score à la mauvaise affiche (repro de la revue : reshuffle après un score)", () => {
  // Reproduit exactement le scénario signalé : Antoine & Marc battent Hugo &
  // Lucas 11-3 au tour 1, puis une régénération change les affiches du tour 1
  // ("Hugo & Marc contre Lucas & Zoé"). Avec l'ancienne clé positionnelle
  // "0-0", ce nouveau match aurait hérité du score 11-3, créditant Hugo à tort.
  const scores = {};
  const originalMatch = [["Antoine", "Marc"], ["Hugo", "Lucas"]];
  writeMatchScore(scores, 0, originalMatch, "1", 11);
  writeMatchScore(scores, 0, originalMatch, "2", 3);

  const reshuffledMatch = [["Hugo", "Marc"], ["Lucas", "Zoe"]];
  const sc = readMatchScore(scores, 0, 0, reshuffledMatch);
  assert.strictEqual(sc, null, "Une affiche totalement différente ne doit récupérer aucun score");
});

test("readMatchScore renvoie le score en miroir si team1/team2 sont inversées à la même composition", () => {
  const scores = {};
  const match = [["Antoine", "Marc"], ["Hugo", "Lucas"]];
  writeMatchScore(scores, 0, match, "1", 11);
  writeMatchScore(scores, 0, match, "2", 3);

  const swapped = [["Hugo", "Lucas"], ["Antoine", "Marc"]];
  const sc = readMatchScore(scores, 0, 0, swapped);
  assert.strictEqual(sc["1"], 3);
  assert.strictEqual(sc["2"], 11);
});

test("readMatchScore se replie sur l'ancienne clé positionnelle si aucune clé composite n'existe (compatibilité)", () => {
  const scores = { "0-0": { "1": 11, "2": 3 } };
  const match = [["Antoine", "Marc"], ["Hugo", "Lucas"]];
  const sc = readMatchScore(scores, 0, 0, match);
  assert.strictEqual(sc["1"], 11);
  assert.strictEqual(sc["2"], 3);
});

test("matchScoreKey ignore l'ordre des joueurs au sein d'une équipe et l'ordre des équipes", () => {
  const m1 = [["Antoine", "Marc"], ["Hugo", "Lucas"]];
  const m2 = [["Marc", "Antoine"], ["Lucas", "Hugo"]];
  assert.strictEqual(matchScoreKey(0, m1), matchScoreKey(0, m2));
});

// ---------------------------------------------------------------------------
// GEL DES TOURS DÉJÀ NOTÉS (getFrozenRounds / scheduleRotations)
// ---------------------------------------------------------------------------

test("getFrozenRounds ne gèle rien tant qu'aucun score n'est saisi", () => {
  const players = makePlayers(8);
  const result = scheduleRotations(players, 2, 4, "seed-freeze-1", DEFAULT_OPTIONS, noPresence());
  const frozen = getFrozenRounds(result, {});
  assert.deepStrictEqual(frozen, []);
});

test("getFrozenRounds gèle tous les tours jusqu'au dernier tour noté (inclus)", () => {
  const players = makePlayers(8);
  const result = scheduleRotations(players, 2, 4, "seed-freeze-2", DEFAULT_OPTIONS, noPresence());

  const scores = {};
  // Un seul match noté, au tour 2 (index 1) : les tours 0 et 1 doivent être
  // gelés, les tours 2 et 3 (jamais notés) doivent rester libres.
  writeMatchScore(scores, 1, result.rounds[1][0], "1", 11);
  writeMatchScore(scores, 1, result.rounds[1][0], "2", 5);

  const frozen = getFrozenRounds(result, scores);
  assert.strictEqual(frozen.length, 2);
  assert.deepStrictEqual(frozen[0].matches, result.rounds[0]);
  assert.deepStrictEqual(frozen[1].matches, result.rounds[1]);
});

test("scheduleRotations rejoue à l'identique les tours gelés même si la liste de joueurs change (repro de la revue : arrivée tardive)", () => {
  // Reproduit le scénario signalé : les tours 1 à 3 sont joués et notés, puis
  // un joueur arrive en cours de session (présence à partir du tour 4). Sans
  // gel, la seed rejoue une toute autre séquence dès le tour 1 pour TOUS les
  // tours dès que la liste de joueurs change (shuffleInPlace est le tout
  // premier tirage RNG de la fonction).
  const players = makePlayers(8);
  const seed = "seed-latecomer";

  const before = scheduleRotations(players, 2, 3, seed, DEFAULT_OPTIONS, noPresence());

  // Score saisi sur chaque match de chaque tour joué (les 3 tours existants).
  const scores = {};
  before.rounds.forEach((matches, rIdx) => {
    matches.forEach(match => {
      writeMatchScore(scores, rIdx, match, "1", 11);
      writeMatchScore(scores, rIdx, match, "2", 7);
    });
  });
  const frozenRounds = getFrozenRounds(before, scores);
  assert.strictEqual(frozenRounds.length, 3);

  // Arrivée tardive : Zoé rejoint à partir du tour 4 (absente des 3 premiers,
  // déjà notés). Sans presenceMap, elle n'aurait de toute façon pas pu jouer
  // sur les 3 premiers tours puisqu'ils sont gelés.
  const playersWithLatecomer = [...players, "Zoe"];
  const presence = { Zoe: { start: 4, end: 4 } };

  const after = scheduleRotations(playersWithLatecomer, 2, 4, seed, DEFAULT_OPTIONS, presence, frozenRounds);

  assert.deepStrictEqual(after.rounds[0], before.rounds[0], "Le tour 1 (déjà noté) ne doit pas changer");
  assert.deepStrictEqual(after.rounds[1], before.rounds[1], "Le tour 2 (déjà noté) ne doit pas changer");
  assert.deepStrictEqual(after.rounds[2], before.rounds[2], "Le tour 3 (déjà noté) ne doit pas changer");

  // Le nouveau tour 4 (jamais joué) peut, lui, intégrer Zoé normalement.
  const round4Players = new Set(after.rounds[3].flatMap(([t1, t2]) => [...t1, ...t2]));
  const round4Benched = new Set(after.benches[3]);
  assert.ok(round4Players.has("Zoe") || round4Benched.has("Zoe"), "Zoé doit apparaître au tour 4 (jouée ou au banc)");
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exitCode = failed > 0 ? 1 : 0;
