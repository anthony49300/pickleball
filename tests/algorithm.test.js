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

const algoPath = path.join(__dirname, "..", "js", "app", "algorithm.js");
const code = fs.readFileSync(algoPath, "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: algoPath });
const { scheduleRotations } = sandbox;

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

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exitCode = failed > 0 ? 1 : 0;
