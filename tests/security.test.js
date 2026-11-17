"use strict";
/**
 * Tests de sécurité : validation des états importés (liens de partage,
 * sauvegardes), échappement des gabarits HTML, tables indexées par nom et
 * empreinte de la Content-Security-Policy.
 *
 * Même principe que tests/algorithm.test.js : uniquement les modules natifs
 * de Node, les scripts du site (scripts classiques, sans export) étant
 * chargés dans le realm courant avec vm.runInThisContext. Exécuter avec :
 *
 *   node tests/security.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
function load(rel) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}
// sanitize.js est partagé ; algorithm.js + templates.js forment le mode
// Rotation, engine.js + render.js le mode Tournoi (escapeHtml et ownValue,
// définis à l'identique dans algorithm.js et engine.js, sont simplement
// redéclarés par le second).
load("js/shared/sanitize.js");
load("js/app/algorithm.js");
load("js/app/templates.js");
load("js/tournament/engine.js");
load("js/tournament/render.js");

const {
  sanitizeRotationState, sanitizeTournamentState, sanitizeRotationHistory,
  sanitizeTournamentHistory, sanitizePlayerGroups, toScore, clampFormInt,
  buildMatchCard, buildTournamentMatchCard, wrapHideableMatch, renderBracketTreeLeaf,
  scheduleRotations, writeMatchScore, computePlayerStats, escapeHtml,
  estimateScheduleCost, prepareSharedRotationState
} = global;

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
// Copie JSON « normale » (sans objets sans prototype) pour comparer en profondeur.
const plain = (v) => JSON.parse(JSON.stringify(v));

const PAYLOAD = '"><img src=x onerror=alert(1)>';

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

/** Parcourt tous les objets de score d'un état et vérifie leurs valeurs. */
function assertCleanScores(obj, keys) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k) && (typeof v !== "object" || v === null)) {
        assert.ok(v === null || (Number.isInteger(v) && v >= 0 && v <= 99), `score ${k}=${JSON.stringify(v)} invalide`);
      }
      walk(v);
    }
  };
  walk(obj);
}

/**
 * Aucune injection dans un fragment HTML. Un nom hostile est du texte libre :
 * il doit apparaître UNIQUEMENT sous sa forme échappée (&quot;&gt;&lt;img...).
 * Une fois ces occurrences retirées, il ne doit rester ni <img, ni onerror,
 * ni la charge utile brute ("><img... qui fermerait l'attribut en cours).
 */
function assertNoInjection(html) {
  assert.ok(!html.includes(PAYLOAD), "charge utile brute dans la sortie");
  const rest = html.split(escapeHtml(PAYLOAD)).join("");
  assert.ok(!/<img/i.test(rest), "balise <img injectée");
  assert.ok(!/onerror/i.test(rest), "onerror injecté");
  assert.ok(!rest.includes('"><img'), "sortie d'attribut injectée");
}

// ---------------------------------------------------------------------------
// 1. Charges utiles de la revue de sécurité
// ---------------------------------------------------------------------------

test("Rotation : la charge utile du lien ?d= ne laisse aucun score texte", () => {
  const raw = { p: "Antoine\nJulien\nMarc\nSophie", c: 1, r: 3, s: "x", sc: { "0-0": { "1": PAYLOAD, "2": 3 } } };
  const clean = sanitizeRotationState(raw);
  assert.strictEqual(clean.sc["0-0"]["1"], null);
  assert.strictEqual(clean.sc["0-0"]["2"], 3);
  assertCleanScores(clean.sc, ["1", "2"]);
  assert.ok(!JSON.stringify(clean).includes("onerror"));
});

test("Tournoi : la charge utile dans pools[0].scores['0-0'].a est neutralisée", () => {
  const raw = fixture("tournament-state.json");
  raw.tournament.pools[0].scores["0-0"] = { a: PAYLOAD, b: 7 };
  const clean = sanitizeTournamentState(raw);
  assert.strictEqual(clean.tournament.pools[0].scores["0-0"].a, null);
  assert.strictEqual(clean.tournament.pools[0].scores["0-0"].b, 7);
  assertCleanScores(clean.tournament, ["a", "b"]);
  assert.ok(!JSON.stringify(clean).includes("onerror"));
});

test("toScore : seuls les entiers 0-99 survivent", () => {
  assert.strictEqual(toScore(11), 11);
  assert.strictEqual(toScore("12"), 12);
  assert.strictEqual(toScore(150), 99);
  assert.strictEqual(toScore(-5), 0);
  assert.strictEqual(toScore(7.6), 8);
  for (const bad of [PAYLOAD, "abc", NaN, Infinity, {}, [], true, null, undefined, ""]) {
    assert.strictEqual(toScore(bad), null, `toScore(${String(bad)})`);
  }
});

// ---------------------------------------------------------------------------
// 2. États légitimes : aller-retour sans modification
// ---------------------------------------------------------------------------

test("état Rotation réel (fixture) : aller-retour identique", () => {
  const raw = fixture("rotation-state.json");
  const report = {};
  assert.deepStrictEqual(plain(sanitizeRotationState(raw, report)), raw);
  assert.ok(!report.clamped);
});

test("historique Rotation réel (fixture) : aller-retour identique", () => {
  const raw = fixture("rotation-history.json");
  assert.deepStrictEqual(plain(sanitizeRotationHistory(raw)), raw);
});

test("état Tournoi réel avec phase finale (fixture) : aller-retour identique", () => {
  const raw = fixture("tournament-state.json");
  const report = {};
  assert.deepStrictEqual(plain(sanitizeTournamentState(raw, report)), raw);
  assert.ok(!report.clamped);
});

test("historique Tournoi : aller-retour identique", () => {
  const state = fixture("tournament-state.json");
  const raw = [{ id: 1700000000000, tournamentId: state.tournament.tournamentId, date: "15 nov., 19:52", teamsCount: 7, numPools: 2, state }];
  assert.deepStrictEqual(plain(sanitizeTournamentHistory(raw)), raw);
});

test("ancien lien légitime (clé de score positionnelle 'tour-match') : toujours accepté", () => {
  const raw = { p: "A\nB\nC\nD", c: "1", r: "3", s: "abc", sc: { "0-0": { "1": 11, "2": 5 } } };
  assert.deepStrictEqual(plain(sanitizeRotationState(raw)), raw);
});

// ---------------------------------------------------------------------------
// 3. Identifiants, clés inconnues, bornes
// ---------------------------------------------------------------------------

test("identifiants invalides : écartés ou régénérés", () => {
  const t = fixture("tournament-state.json");
  t.tournament.hiddenMatchKeys = ["pool:0:1:0", '"><img src=x>', "x".repeat(65)];
  t.tournament.forfeitedTeamIds = [1, "1", PAYLOAD, -3];
  const clean = sanitizeTournamentState(t);
  assert.deepStrictEqual(clean.tournament.hiddenMatchKeys, ["pool:0:1:0"]);
  assert.deepStrictEqual(clean.tournament.forfeitedTeamIds, [1]);

  const badTeam = fixture("tournament-state.json");
  badTeam.tournament.teams[0].id = PAYLOAD;
  assert.throws(() => sanitizeTournamentState(badTeam), /Tournoi invalide/);

  const badSegment = fixture("tournament-state.json");
  badSegment.tournament.finalPhase.segments[0].id = PAYLOAD;
  assert.throws(() => sanitizeTournamentState(badSegment), /Tournoi invalide/);

  const rot = sanitizeRotationState({ p: "A\nB\nC\nD", sid: PAYLOAD });
  assert.ok(!("sid" in rot), "sid invalide écarté (régénéré au chargement)");

  const groups = sanitizePlayerGroups([{ id: PAYLOAD, name: "Mardi", players: ["A", "B"] }, { id: 5, name: "Jeudi", players: ["C"] }]);
  assert.strictEqual(groups.length, 2);
  assert.ok(Number.isSafeInteger(groups[0].id) && groups[0].id > 0, "id de groupe régénéré");
  assert.strictEqual(groups[1].id, 5);

  const hist = sanitizeRotationHistory([{ id: PAYLOAD, date: "x", seed: "s", playersCount: PAYLOAD, roundsCount: 4, state: { p: "A" } }]);
  assert.ok(Number.isSafeInteger(hist[0].id), "id d'historique régénéré");
  assert.strictEqual(hist[0].playersCount, 0);
});

test("clés inconnues retirées (racine et tournoi)", () => {
  // JSON.parse crée une vraie clé "__proto__" (comme un lien de partage forgé).
  const rot = sanitizeRotationState(JSON.parse('{"p":"A","evil":"x","__proto__":{"polluted":true}}'));
  assert.deepStrictEqual(Object.keys(rot), ["p"]);
  assert.strictEqual({}.polluted, undefined);

  const t = fixture("tournament-state.json");
  t.evil = 1;
  t.tournament.evil = 2;
  t.tournament.pools[0].evil = 3;
  const clean = sanitizeTournamentState(t);
  assert.ok(!("evil" in clean) && !("evil" in clean.tournament) && !("evil" in clean.tournament.pools[0]));
});

test("nombres ramenés aux bornes des champs (r: 2000, c: 10_000, 500 joueurs)", () => {
  const players = Array.from({ length: 500 }, (_, i) => `Joueur ${i}`).join("\n");
  const report = {};
  const clean = sanitizeRotationState({ p: players, c: 10_000, r: 2000, bw: 1e9, pk: -4, wt: "999", lv: { A: 9, B: 0, C: 4 }, pr: { A: { start: -5, end: 900 } } }, report);
  assert.strictEqual(clean.c, 10);
  assert.strictEqual(clean.r, 50);
  assert.strictEqual(clean.bw, 500);
  assert.strictEqual(clean.pk, 4);
  assert.strictEqual(clean.wt, "20");
  assert.strictEqual(clean.p.split("\n").length, 60);
  assert.deepStrictEqual(plain(clean.lv), { C: 4 });
  assert.deepStrictEqual(plain(clean.pr), { A: { start: 1, end: 50 } });
  assert.ok(report.clamped);

  const tReport = {};
  const t = sanitizeTournamentState({
    teamsText: Array.from({ length: 200 }, (_, i) => `A${i} & B${i}`).join("\n"),
    numPools: 999, qualifiersPerPool: 50, numCourts: 1e9
  }, tReport);
  assert.strictEqual(t.numPools, 16);
  assert.strictEqual(t.qualifiersPerPool, 8);
  assert.strictEqual(t.numCourts, 16);
  assert.strictEqual(t.teamsText.split("\n").length, 64);
  assert.ok(tReport.clamped);

  assert.deepStrictEqual(clampFormInt("2000", 1, 50, 1), { value: 50, clamped: true });
  assert.deepStrictEqual(clampFormInt("abc", 1, 50, 8), { value: 8, clamped: false });
});

test("état structurellement invalide : exception", () => {
  for (const bad of [null, 42, "texte", [], undefined]) {
    assert.throws(() => sanitizeRotationState(bad));
    assert.throws(() => sanitizeTournamentState(bad));
  }
  assert.throws(() => sanitizeTournamentState({ tournament: { teams: "x", pools: [] } }), /Tournoi invalide/);
});

test("planning enregistré (pl) : conservé à l'identique, écarté en entier s'il est incohérent", () => {
  const players = ["Antoine", "Julien", "Marc", "Sophie", "Claire", "Thomas"];
  const res = scheduleRotations([...players], 2, 4, "plan", { wT: 5, wO: 2, wP: 1, beamWidth: 20, partnerK: 6, squareRepeats: true, avoidB2B: true }, {});
  const pl = { r: res.rounds, b: res.benches };
  const base = { p: players.join("\n"), c: 2, r: 4, s: "plan" };
  assert.deepStrictEqual(plain(sanitizeRotationState({ ...base, pl })).pl, plain(pl));

  const broken = (mutate) => { const copy = plain(pl); mutate(copy); return sanitizeRotationState({ ...base, pl: copy }).pl; };
  assert.strictEqual(broken(c => { c.r[0][0][0][0] = c.r[0][0][1][0]; }), undefined, "joueur deux fois dans un tour");
  assert.strictEqual(broken(c => { c.r[1][0][0][0] = PAYLOAD + "x".repeat(60); }), undefined, "nom trop long");
  assert.strictEqual(broken(c => { c.r[0][0][0] = "Antoine"; }), undefined, "équipe qui n'est pas une liste");
  assert.strictEqual(broken(c => { c.b.pop(); }), undefined, "pauses et tours désalignés");
  assert.strictEqual(broken(c => { c.r = Array(51).fill(c.r[0]); c.b = Array(51).fill(c.b[0]); }), undefined, "plus de 50 tours");
});

// ---------------------------------------------------------------------------
// 4. Gabarits HTML : aucune injection, quelles que soient les valeurs
// ---------------------------------------------------------------------------

test("buildMatchCard (Rotation) : noms, terrain et scores hostiles", () => {
  const html = buildMatchCard([[PAYLOAD, "B"], ["C", "<script>x</script>"]], 0, 1, PAYLOAD, { 1: PAYLOAD, 2: '7" autofocus onfocus="x' });
  assertNoInjection(html);
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("autofocus") && !html.includes("onfocus"), "score hostile injecté dans l'attribut value");
  assert.ok(html.includes('value=""'), "score hostile affiché vide");
});

test("buildTournamentMatchCard : noms, terrain et scores hostiles", () => {
  const html = buildTournamentMatchCard({
    courtLabel: escapeHtml(PAYLOAD), nameA: PAYLOAD, nameB: "B", scoreA: PAYLOAD, scoreB: 11,
    inputClass: "score-input", dataAttrs: 'data-pool="0"'
  });
  assertNoInjection(html);
  assert.ok(html.includes('value="11"') && html.includes('value=""'));
});

test("wrapHideableMatch / renderBracketTreeLeaf : clé et rang hostiles", () => {
  assertNoInjection(wrapHideableMatch(PAYLOAD, `${escapeHtml(PAYLOAD)} vs B`, "<p>contenu</p>", new Set()));
  assertNoInjection(renderBracketTreeLeaf({ rankStart: PAYLOAD, team: { name: PAYLOAD } }));
});

// ---------------------------------------------------------------------------
// 5. Tables indexées par nom de joueur
// ---------------------------------------------------------------------------

test("classement : __proto__, constructor, toString et hasOwnProperty ont chacun leur ligne", () => {
  const players = ["__proto__", "constructor", "toString", "hasOwnProperty", "Alice", "Bob", "Chloé", "David"];
  const result = scheduleRotations([...players], 2, 4, "seed-proto", { wT: 10, wO: 3, wP: 1, beamWidth: 24, partnerK: 6, squareRepeats: true, avoidB2B: true }, {});
  const scores = Object.create(null);
  result.rounds.forEach((matches, r) => matches.forEach(match => {
    writeMatchScore(scores, r, match, "1", 11);
    writeMatchScore(scores, r, match, "2", 6);
  }));
  const { sortedPlayers } = computePlayerStats(players, result.rounds, scores);
  assert.strictEqual(sortedPlayers.length, players.length);
  assert.deepStrictEqual(sortedPlayers.map(p => p.name).sort(), [...players].sort());
  assert.ok(sortedPlayers.every(p => p.m === 4), "chaque joueur a ses 4 matchs comptés");
});

test("niveaux et présences : un joueur nommé comme une propriété d'Object.prototype n'hérite de rien", () => {
  const clean = sanitizeRotationState({ p: "constructor\ntoString", lv: { constructor: 5 }, pr: { toString: { start: 2, end: 3 } } });
  assert.strictEqual(clean.lv.constructor, 5);
  assert.strictEqual(clean.lv.toString, undefined);
  assert.deepStrictEqual(clean.pr.toString, { start: 2, end: 3 });
  assert.strictEqual(clean.pr.constructor, undefined);
});

// ---------------------------------------------------------------------------
// 6. Coût de génération et liens partagés (déni de service)
// ---------------------------------------------------------------------------

// Budget de SCHEDULE_COST_BUDGET_MS (constante de sanitize.js, non exposée
// sur global) : 2 s estimées sur un PC de bureau.
const BUDGET_MS = 2000;
const names = (n) => Array.from({ length: n }, (_, i) => `Joueur ${i + 1}`).join("\n");

test("estimateScheduleCost : petit planning sous le budget, 40 joueurs / 10 terrains / 50 tours très au-dessus", () => {
  assert.ok(estimateScheduleCost(10, 2, 8, 80, 10) < BUDGET_MS / 10);
  assert.ok(estimateScheduleCost(40, 10, 50, 80, 10) > 20 * BUDGET_MS);
  assert.ok(estimateScheduleCost(40, 10, 50, 500, 30) > estimateScheduleCost(40, 10, 50, 80, 10), "croît avec la largeur du faisceau");
  assert.strictEqual(estimateScheduleCost(3, 2, 8), 0, "moins de 4 joueurs : rien à calculer");
});

test("lien 40 joueurs / 10 terrains / 50 tours avec bw: 500 : pas de génération automatique", () => {
  const { state, autoGenerate, cost } = prepareSharedRotationState({ p: names(40), c: 10, r: 50, s: "x", bw: 500, pk: 30 });
  assert.strictEqual(autoGenerate, false);
  assert.ok(cost > BUDGET_MS);
  assert.strictEqual(state.c, 10);
  assert.strictEqual(state.r, 50);
});

test("lien partagé : les réglages du mode expert du lien sont ignorés", () => {
  const link = { p: names(12), c: 3, r: 6, s: "x", wt: 20, wo: 20, wp: 10, wbal: 20, bw: 500, pk: 30, sq: false };
  const expert = ["wt", "wo", "wp", "wbal", "bw", "pk", "sq"];

  // Sans sauvegarde sur l'appareil : réglages par défaut de la page.
  const fresh = prepareSharedRotationState(link).state;
  for (const k of expert) assert.ok(!(k in fresh), `${k} du lien ignoré`);

  // Avec une sauvegarde : ceux de l'appareil.
  const recipient = { p: "A", wt: "7", wo: "1", wp: "0.5", wbal: "4", bw: "120", pk: "12", sq: true };
  const mine = prepareSharedRotationState(link, recipient).state;
  for (const k of expert) assert.deepStrictEqual(mine[k], recipient[k], `${k} de l'appareil conservé`);
  assert.strictEqual(mine.p, link.p, "les joueurs viennent bien du lien");
  assert.strictEqual(mine.c, 3);
  assert.strictEqual(mine.r, 6);
});

test("lien normal (10 joueurs, 2 terrains, 8 tours) : génération automatique, rapide en vrai", () => {
  const { state, autoGenerate } = prepareSharedRotationState({ p: names(10), c: 2, r: 8, s: "x" });
  assert.strictEqual(autoGenerate, true);
  const t0 = Date.now();
  scheduleRotations(state.p.split("\n"), 2, 8, "x", { wT: 5, wO: 2, wP: 1, wBalance: 3, beamWidth: 80, partnerK: 10, squareRepeats: true, avoidB2B: true }, {});
  assert.ok(Date.now() - t0 < BUDGET_MS, "la génération réelle tient dans le budget");
});

// ---------------------------------------------------------------------------
// 7. Content-Security-Policy
// ---------------------------------------------------------------------------

for (const page of ["index.html", "tournoi.html"]) {
  test(`${page} : CSP en tête de <head> et empreinte du script en ligne à jour`, () => {
    // Le navigateur hache le script après normalisation des fins de ligne
    // (CRLF -> LF), quelle que soit la façon dont le fichier est stocké.
    const html = fs.readFileSync(path.join(ROOT, page), "utf8").replace(/\r\n?/g, "\n");
    assert.ok(/<head>\s*<meta http-equiv="Content-Security-Policy"/.test(html), "la CSP doit être le premier enfant de <head>");
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.strictEqual(inline.length, 1, "un seul script en ligne attendu (le script anti-flash)");
    const hash = crypto.createHash("sha256").update(inline[0], "utf8").digest("base64");
    assert.ok(csp.includes(`'sha256-${hash}'`), `CSP périmée : remplacez l'empreinte par 'sha256-${hash}'`);
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
      assert.ok(csp.includes(directive), `directive manquante : ${directive}`);
    }
  });
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exitCode = failed > 0 ? 1 : 0;
