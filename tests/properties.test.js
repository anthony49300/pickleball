"use strict";
/**
 * Tests de propriétés : au lieu de quelques cas écrits à la main, des
 * centaines de configurations tirées au hasard (graine fixe, donc toujours
 * les mêmes d'une exécution à l'autre), sur lesquelles on vérifie des règles
 * qui doivent TOUJOURS tenir (personne ne joue deux fois dans un tour, un
 * absent ne joue jamais, un tour n'est jamais vide s'il y a 4 joueurs...).
 * En cas d'échec, le message indique la configuration fautive pour la rejouer.
 *
 * Même harnais que tests/algorithm.test.js (Node vm, aucune dépendance) :
 *
 *   node tests/properties.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
for (const rel of ["js/shared/sanitize.js", "js/app/algorithm.js", "js/tournament/engine.js"]) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}
const {
  scheduleRotations, adaptPresenceToRounds, countSessionPairs, buildPriorCounts, generateSeed,
  sanitizeRotationState, sanitizeTournamentState,
  buildPools, isPoolComplete, seedQualifiedTeams, seedNonQualifiedTeams, buildFinalPhase,
  segmentPairs, progressFinalPhase
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

let knownIssues = 0;

/**
 * Problème connu de l'application, pas encore corrigé : affiché à chaque
 * exécution (avec le nombre de cas), sans faire échouer les tests ni la CI.
 * Quand il ne se reproduit plus, le message demande de repasser la
 * vérification en test() normal.
 */
function knownIssue(name, fn) {
  try {
    fn();
    console.log(`CORRIGÉ ? ${name}`);
    console.log("     Ne se reproduit plus : transformer ce knownIssue() en test() pour le garder corrigé.");
  } catch (err) {
    console.log(`CONNU ${name}`);
    console.log(`     ${err.message}`);
    knownIssues++;
  }
}

/** Générateur pseudo-aléatoire à graine fixe (mulberry32) : tirages reproductibles. */
function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p
  };
}

const OPTIONS = { wT: 5, wO: 2, wP: 1, wBalance: 3, beamWidth: 20, partnerK: 6, squareRepeats: true, avoidB2B: true };
const names = (n) => Array.from({ length: n }, (_, i) => `J${i + 1}`);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Configuration Rotation aléatoire (joueurs, terrains, tours, arrivées/départs, niveaux). */
function randomRotationConfig(rnd, { withPresence = true } = {}) {
  const players = names(rnd.int(4, 24));
  const courts = rnd.int(1, 8);
  const rounds = rnd.int(1, 12);
  const presence = {};
  if (withPresence) {
    for (const p of players) {
      if (!rnd.chance(0.3)) continue;
      const start = rnd.int(1, rounds);
      presence[p] = { start, end: rnd.int(start, rounds) };
    }
  }
  const levels = {};
  for (const p of players) if (rnd.chance(0.4)) levels[p] = rnd.int(1, 5);
  return { players, courts, rounds, presence, levels, seed: `prop-${rnd.int(0, 1e9)}` };
}

const describe = (cfg) => `${cfg.players.length} joueurs, ${cfg.courts} terrains, ${cfg.rounds} tours, graine ${cfg.seed}`;

/** Joueurs actifs d'un tour (même règle que scheduleRotations). */
function activeAt(cfg, roundNumber) {
  return cfg.players.filter(p => {
    const pr = cfg.presence[p];
    return !pr || (roundNumber >= pr.start && roundNumber <= pr.end);
  });
}

// ---------------------------------------------------------------------------
// MODE ROTATION : planning
// ---------------------------------------------------------------------------

test("planning : chaque joueur est à un seul endroit par tour, les absents ne jouent jamais, aucun tour vide (300 configurations)", () => {
  const rnd = makeRandom(20261116);
  for (let i = 0; i < 300; i++) {
    const cfg = randomRotationConfig(rnd);
    const res = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, cfg.presence, [], cfg.levels);
    const where = describe(cfg);
    assert.strictEqual(res.rounds.length, cfg.rounds, where);

    res.rounds.forEach((matches, r) => {
      const active = activeAt(cfg, r + 1);
      const playing = matches.flat(2);
      const benched = res.benches[r];
      const absent = res.absents[r];
      const all = [...playing, ...benched, ...absent];

      assert.strictEqual(new Set(all).size, all.length, `${where} : joueur en double au tour ${r + 1}`);
      assert.deepStrictEqual([...all].sort(), [...cfg.players].sort(), `${where} : joueur oublié au tour ${r + 1}`);
      assert.deepStrictEqual([...absent].sort(), cfg.players.filter(p => !active.includes(p)).sort(), `${where} : absents faux au tour ${r + 1}`);

      // Nombre de matchs attendu : 6 joueurs et 2 terrains ou plus = 1 double + 1 simple.
      const special = cfg.courts >= 2 && active.length === 6;
      const expected = special ? 2 : Math.min(cfg.courts, Math.floor(active.length / 4));
      assert.strictEqual(matches.length, expected, `${where} : ${matches.length} match(s) au tour ${r + 1}, ${expected} attendu(s) pour ${active.length} actifs`);
      for (const [t1, t2] of matches) {
        const sizes = `${t1.length}v${t2.length}`;
        assert.ok(sizes === "2v2" || (special && sizes === "1v1"), `${where} : match ${sizes} au tour ${r + 1}`);
      }
    });
  }
});

test("planning : même graine et mêmes réglages = même planning (100 configurations)", () => {
  const rnd = makeRandom(7);
  for (let i = 0; i < 100; i++) {
    const cfg = randomRotationConfig(rnd);
    const a = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, cfg.presence, [], cfg.levels);
    const b = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, cfg.presence, [], cfg.levels);
    assert.strictEqual(JSON.stringify(b.rounds), JSON.stringify(a.rounds), describe(cfg));
  }
});

// Écart de pauses maximal entre deux joueurs d'une même session (sélection
// des pauses v2, voir pickBenchesFair). Avec l'ancienne sélection (v1),
// ~14 % des configurations dépassaient 1, jusqu'à 4.
const MAX_BENCH_SPREAD = 1;

test("planning : pauses réparties avec un écart borné (200 configurations sans arrivée ni départ)", () => {
  const rnd = makeRandom(42);
  for (let i = 0; i < 200; i++) {
    const cfg = randomRotationConfig(rnd, { withPresence: false });
    const res = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, {}, [], cfg.levels);
    const where = describe(cfg);
    const benchCounts = cfg.players.map(p => res.benches.filter(b => b.includes(p)).length);
    const spread = Math.max(...benchCounts) - Math.min(...benchCounts);
    assert.ok(spread <= MAX_BENCH_SPREAD, `${where} : écart de pauses ${spread} (${benchCounts.join(",")})`);

  }
});

test("« Pas de pause deux fois de suite » : jamais deux pauses d'affilée quand c'est évitable (200 configurations)", () => {
  // Évitable dès qu'au moins autant de joueurs jouent qu'il y en a en pause :
  // les joueurs en pause au tour suivant peuvent tous être pris parmi ceux
  // qui viennent de jouer. Avec l'ancienne sélection (v1), ~8 % des
  // configurations le violaient (ex. 13 joueurs, 2 terrains, 8 tours et plus).
  const rnd = makeRandom(42);
  const failures = [];
  for (let i = 0; i < 200; i++) {
    const cfg = randomRotationConfig(rnd, { withPresence: false });
    const res = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, {}, [], cfg.levels);
    const perRound = res.benches[0]?.length ?? 0;
    if (!(perRound > 0 && perRound * 2 <= cfg.players.length)) continue;
    for (let r = 1; r < res.benches.length; r++) {
      const twice = res.benches[r].filter(p => res.benches[r - 1].includes(p));
      if (twice.length) {
        failures.push(`${describe(cfg)} : ${twice.join(", ")} en pause aux tours ${r} et ${r + 1}`);
        break;
      }
    }
  }
  assert.strictEqual(failures.length, 0, `${failures.length} configuration(s), dont ${failures[0]}`);
});

test("planning : les tours déjà notés restent identiques après une arrivée ou un départ (150 configurations)", () => {
  const rnd = makeRandom(99);
  for (let i = 0; i < 150; i++) {
    const cfg = randomRotationConfig(rnd, { withPresence: false });
    if (cfg.rounds < 2) continue;
    const before = scheduleRotations([...cfg.players], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, {}, [], cfg.levels);
    const played = rnd.int(1, cfg.rounds - 1);
    const frozen = before.rounds.slice(0, played).map((matches, r) => ({ matches, benched: before.benches[r] }));

    // Un joueur part après le dernier tour noté, un nouveau arrive au tour suivant.
    const leaving = rnd.pick(cfg.players);
    const presence = { [leaving]: { start: 1, end: played }, Nouveau: { start: played + 1, end: cfg.rounds } };
    const after = scheduleRotations([...cfg.players, "Nouveau"], cfg.courts, cfg.rounds, cfg.seed, OPTIONS, presence, frozen, cfg.levels);
    const where = `${describe(cfg)}, ${played} tour(s) noté(s)`;

    assert.strictEqual(JSON.stringify(after.rounds.slice(0, played)), JSON.stringify(before.rounds.slice(0, played)), `${where} : tours notés modifiés`);
    after.rounds.slice(played).forEach((matches, k) => {
      assert.ok(!matches.flat(2).includes(leaving), `${where} : ${leaving} joue encore au tour ${played + k + 1}`);
    });
  }
});

test("adaptPresenceToRounds : plages toujours valides, « jusqu'au bout » suit le total (500 cas)", () => {
  const rnd = makeRandom(5);
  for (let i = 0; i < 500; i++) {
    const prev = rnd.int(1, 50);
    const next = rnd.int(1, 50);
    const presence = {};
    for (let k = 0; k < rnd.int(1, 10); k++) {
      const start = rnd.int(1, prev);
      presence[`J${k}`] = { start, end: rnd.int(start, prev) };
    }
    const before = plain(presence);
    adaptPresenceToRounds(presence, prev, next);
    const where = `${prev} → ${next} tours, ${JSON.stringify(before)}`;
    for (const [name, pr] of Object.entries(presence)) {
      assert.ok(pr.start >= 1 && pr.start <= pr.end && pr.end <= Math.max(next, pr.start), `${where} : plage invalide ${JSON.stringify(pr)}`);
      if (prev !== next && before[name].end === prev) assert.strictEqual(pr.end, next, `${where} : ${name} n'a pas suivi le nouveau total`);
      if (before[name].end < prev && before[name].end <= next && before[name].start <= next) {
        assert.strictEqual(pr.end, before[name].end, `${where} : départ prévu de ${name} modifié`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// MODE ROTATION : d'une semaine à l'autre
// ---------------------------------------------------------------------------

/** Joue `weeks` sessions de suite (nouvelle graine à chaque fois) et compte les duos inédits. */
function simulateWeeks({ withMemory, weeks, players, courts, rounds, seedBase }) {
  const memory = [];
  const seenDuos = new Set();
  const newDuosPerWeek = [];
  for (let w = 0; w < weeks; w++) {
    const prior = withMemory ? buildPriorCounts(memory) : null;
    const res = scheduleRotations([...players], courts, rounds, `${seedBase}-${w}`, OPTIONS, {}, [], {}, prior);
    const pairs = countSessionPairs(res.rounds.map(matches => ({ matches })));
    newDuosPerWeek.push(Object.keys(pairs.t).filter(k => !seenDuos.has(k)).length);
    Object.keys(pairs.t).forEach(k => seenDuos.add(k));
    memory.unshift(pairs); // la plus récente en premier, comme getPreviousSessionsMemory
  }
  return { seenDuos: seenDuos.size, newDuosPerWeek };
}

test("« Varier d'une semaine à l'autre » : sur 6 semaines, plus de duos différents qu'au hasard (15 joueurs, 4 terrains)", () => {
  const players = names(15);
  let withMem = 0;
  let without = 0;
  for (let s = 0; s < 5; s++) {
    withMem += simulateWeeks({ withMemory: true, weeks: 6, players, courts: 4, rounds: 8, seedBase: `mem${s}` }).seenDuos;
    without += simulateWeeks({ withMemory: false, weeks: 6, players, courts: 4, rounds: 8, seedBase: `mem${s}` }).seenDuos;
  }
  assert.ok(withMem > without, `duos différents sur 6 semaines : ${withMem} avec mémoire, ${without} sans`);
});

test("« Varier d'une semaine à l'autre » : chaque semaine apporte encore des duos inédits tant qu'il en reste", () => {
  const players = names(15);
  const totalDuos = (15 * 14) / 2;
  const { newDuosPerWeek, seenDuos } = simulateWeeks({ withMemory: true, weeks: 6, players, courts: 4, rounds: 8, seedBase: "inedits" });
  newDuosPerWeek.forEach((n, w) => {
    if (seenDuos < totalDuos) assert.ok(n > 0, `semaine ${w + 1} : aucun duo inédit (${newDuosPerWeek.join(",")})`);
  });
});

test("nouvelle session : deux graines tirées de suite ne donnent jamais le même planning (50 essais)", () => {
  // Reproduit le bouton « Générer les matchs » sans score (nouvelle graine à
  // chaque nouvelle session), avec la même liste dans le même ordre.
  const players = names(15);
  for (let i = 0; i < 50; i++) {
    const s1 = generateSeed();
    const s2 = generateSeed();
    assert.notStrictEqual(s1, s2);
    const a = scheduleRotations([...players], 4, 8, s1, OPTIONS, {});
    const b = scheduleRotations([...players], 4, 8, s2, OPTIONS, {});
    assert.notStrictEqual(JSON.stringify(b.rounds), JSON.stringify(a.rounds), `graines ${s1} et ${s2}`);
  }
});

// ---------------------------------------------------------------------------
// VALIDATION DES ÉTATS IMPORTÉS (fuzzing)
// ---------------------------------------------------------------------------

/** Valeur JSON aléatoire, souvent hostile. */
function randomValue(rnd, depth = 0) {
  const kinds = ["str", "num", "bool", "null", "hostile", "big", depth < 3 ? "obj" : "num", depth < 3 ? "arr" : "str"];
  switch (rnd.pick(kinds)) {
    case "str": return rnd.pick(["", "A", "Léa & Zoé", "0::A|B", "pool:0:1:2", "seg-1-w", "x".repeat(rnd.int(1, 300))]);
    case "num": return rnd.pick([0, 1, -1, 3.7, 99, 100, 1e9, -1e9, NaN, Infinity]);
    case "bool": return rnd.chance(0.5);
    case "null": return null;
    case "hostile": return rnd.pick(['"><img src=x onerror=alert(1)>', "__proto__", "constructor", "<script>x</script>", "1e400"]);
    case "big": return rnd.int(0, 1e6);
    case "obj": {
      const o = {};
      for (let k = 0; k < rnd.int(0, 5); k++) o[rnd.pick(["1", "2", "a", "b", "0-0", "1-2", "0", "id", "name", "__proto__", "x"])] = randomValue(rnd, depth + 1);
      return o;
    }
    case "arr": return Array.from({ length: rnd.int(0, 5) }, () => randomValue(rnd, depth + 1));
  }
  return null;
}

function assertValidScores(node, keys, where) {
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (keys.includes(k) && (v === null || typeof v !== "object")) {
      assert.ok(v === null || (Number.isInteger(v) && v >= 0 && v <= 99), `${where} : score ${k}=${JSON.stringify(v)}`);
    }
    assertValidScores(v, keys, where);
  }
}

test("sanitizeRotationState : n'importe quel objet donne un état valide, et le nettoyer deux fois ne change rien (1 000 essais)", () => {
  const rnd = makeRandom(1234);
  const KEYS = ["p", "c", "r", "s", "cn", "wt", "wo", "wp", "wbal", "bw", "pk", "sq", "b2b", "mem", "sp", "sid", "sc", "pr", "lv", "hr", "evil"];
  for (let i = 0; i < 1000; i++) {
    const raw = {};
    for (const k of KEYS) if (rnd.chance(0.5)) raw[k] = randomValue(rnd);
    const where = `essai ${i}`;
    const once = sanitizeRotationState(raw);
    assertValidScores(once.sc, ["1", "2"], where);
    assert.ok(!("evil" in once), `${where} : clé inconnue conservée`);
    if (once.c !== undefined) assert.ok(Number(once.c) >= 1 && Number(once.c) <= 10, `${where} : c=${once.c}`);
    if (once.r !== undefined) assert.ok(Number(once.r) >= 1 && Number(once.r) <= 50, `${where} : r=${once.r}`);
    assert.deepStrictEqual(plain(sanitizeRotationState(plain(once))), plain(once), `${where} : pas idempotent`);
  }
});

test("sanitizeTournamentState : un tournoi réel abîmé au hasard est soit refusé, soit valide et stable (500 essais)", () => {
  const rnd = makeRandom(4321);
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "tournament-state.json"), "utf8"));
  // Chemins (dans l'objet) où injecter une valeur aléatoire.
  const leaves = [];
  (function collect(node, p) {
    if (node && typeof node === "object") Object.keys(node).forEach(k => collect(node[k], [...p, k]));
    else leaves.push(p);
  })(base, []);

  for (let i = 0; i < 500; i++) {
    const raw = plain(base);
    for (let k = 0; k < rnd.int(1, 4); k++) {
      const p = rnd.pick(leaves);
      let node = raw;
      for (const key of p.slice(0, -1)) node = node[key];
      node[p[p.length - 1]] = randomValue(rnd);
    }
    let once;
    try {
      once = sanitizeTournamentState(raw);
    } catch (e) {
      assert.ok(/invalide/.test(e.message), `essai ${i} : exception inattendue ${e.message}`);
      continue;
    }
    assertValidScores(once.tournament, ["a", "b"], `essai ${i}`);
    assert.deepStrictEqual(plain(sanitizeTournamentState(plain(once))), plain(once), `essai ${i} : pas idempotent`);
  }
});

// ---------------------------------------------------------------------------
// MODE TOURNOI : poules et tableaux
// ---------------------------------------------------------------------------

/** Joue un tableau final jusqu'au bout, avec des scores aléatoires sans égalité. */
function playBracket(phase, rnd) {
  let guard = 0;
  while (!phase.finalRanking && guard++ < 20) {
    phase.segments.forEach(segment => {
      if (segment.slots.length === 1) return;
      segmentPairs(segment).forEach(([a, b], idx) => {
        if (a.bye || b.bye || segment.scores[idx]) return;
        const winA = rnd.chance(0.5);
        segment.scores[idx] = { a: winA ? 11 : rnd.int(0, 9), b: winA ? rnd.int(0, 9) : 11 };
      });
    });
    progressFinalPhase(phase);
  }
  return phase;
}

test("poules : chaque équipe dans une seule poule, tailles équilibrées, chaque affiche jouée une fois (200 tournois)", () => {
  const rnd = makeRandom(777);
  for (let i = 0; i < 200; i++) {
    const nTeams = rnd.int(2, 32);
    const teams = Array.from({ length: nTeams }, (_, id) => ({ id, players: [`A${id}`, `B${id}`], name: `A${id} & B${id}` }));
    const numPools = rnd.int(1, Math.min(8, nTeams));
    const mode = rnd.pick(["random", "seeded", "balanced"]);
    const levels = {};
    teams.forEach(t => { if (rnd.chance(0.5)) levels[t.id] = rnd.int(1, 5); });
    const pools = buildPools(teams, numPools, mode, null, levels);
    const where = `${nTeams} équipes, ${numPools} poules, mode ${mode}`;

    const ids = pools.flatMap(p => p.teams.map(t => t.id));
    assert.deepStrictEqual([...ids].sort((a, b) => a - b), teams.map(t => t.id), `${where} : répartition`);
    const sizes = pools.map(p => p.teams.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${where} : tailles ${sizes.join(",")}`);

    for (const pool of pools) {
      const meetings = new Map();
      pool.rounds.forEach((matches, r) => {
        const inRound = [];
        matches.forEach(m => {
          if (m.bye) { inRound.push(m.team.id); return; }
          inRound.push(m.a.id, m.b.id);
          const key = [m.a.id, m.b.id].sort((x, y) => x - y).join("-");
          meetings.set(key, (meetings.get(key) || 0) + 1);
        });
        assert.strictEqual(new Set(inRound).size, inRound.length, `${where} : équipe deux fois dans la journée ${r + 1}`);
      });
      const n = pool.teams.length;
      assert.strictEqual(meetings.size, (n * (n - 1)) / 2, `${where} : affiches manquantes`);
      assert.ok([...meetings.values()].every(v => v === 1), `${where} : affiche jouée deux fois`);
    }
  }
});

test("phase finale et consolante : jouées jusqu'au bout, chaque équipe a une place distincte (150 tournois)", () => {
  const rnd = makeRandom(31337);
  for (let i = 0; i < 150; i++) {
    const nTeams = rnd.int(3, 24);
    const teams = Array.from({ length: nTeams }, (_, id) => ({ id, players: [`A${id}`, `B${id}`], name: `T${id}` }));
    const numPools = rnd.int(1, Math.min(6, Math.floor(nTeams / 2)));
    const qualifiers = rnd.int(1, 4);
    const pools = buildPools(teams, numPools, "random", null, {});
    pools.forEach(pool => pool.rounds.forEach((matches, r) => matches.forEach((m, k) => {
      if (m.bye) return;
      const winA = rnd.chance(0.5);
      pool.scores[`${r}-${k}`] = { a: winA ? 11 : rnd.int(0, 9), b: winA ? rnd.int(0, 9) : 11 };
    })));
    const where = `${nTeams} équipes, ${numPools} poules, ${qualifiers} qualifiés`;
    assert.ok(pools.every(isPoolComplete), `${where} : poule incomplète`);

    const qualified = seedQualifiedTeams(pools, qualifiers, null);
    const others = seedNonQualifiedTeams(pools, qualifiers, null);
    assert.strictEqual(qualified.length + others.length, nTeams, `${where} : équipes perdues entre qualifiés et non qualifiés`);

    const ranks = [];
    if (qualified.length >= 2) ranks.push(...playBracket(buildFinalPhase(qualified, 0), rnd).finalRanking);
    else ranks.push(...qualified.map((team, k) => ({ team, rank: k + 1 })));
    if (others.length >= 2) ranks.push(...playBracket(buildFinalPhase(others, qualified.length), rnd).finalRanking);
    else ranks.push(...others.map((team, k) => ({ team, rank: qualified.length + k + 1 })));

    assert.deepStrictEqual(ranks.map(r => r.rank).sort((a, b) => a - b), Array.from({ length: nTeams }, (_, k) => k + 1), `${where} : places`);
    assert.strictEqual(new Set(ranks.map(r => r.team.id)).size, nTeams, `${where} : équipe classée deux fois`);
  }
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s), ${knownIssues} problème(s) connu(s).`);
process.exitCode = failed > 0 ? 1 : 0;
