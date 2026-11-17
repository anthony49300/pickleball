"use strict";
// Parcours du mode Rotation (index.html), dans un vrai navigateur.
const { test, expect } = require("@playwright/test");
const {
  shareParam, watchPage, expectNoProblems, goTo, addPlayers, step, typeStepper,
  generate, matchesPerRound, scheduleText, scoreRound, expectNoHorizontalScroll, confirmModal
} = require("./helpers");

const PLAYERS = ["Antoine", "Julien", "Marc", "Sophie", "Claire", "Thomas", "Léa", "Hugo"];

let problems;
test.beforeEach(async ({ page }) => {
  problems = watchPage(page);
  await page.goto("index.html");
});

test("4 joueurs ajoutés à 3 tours, puis passage à 10 tours : un match à chaque tour", async ({ page }) => {
  await typeStepper(page, "rounds", 3);
  await typeStepper(page, "courts", 1);
  await addPlayers(page, PLAYERS.slice(0, 4));
  await step(page, "rounds", 1, 7);
  await expect(page.locator("#rounds")).toHaveValue("10");
  await expect(page.locator("#playerChips .chip-tag")).toHaveCount(0);

  await generate(page);
  expect(await matchesPerRound(page)).toEqual(Array(10).fill(1));
  expectNoProblems(problems);
});

for (const order of [
  ["joueurs", "terrains", "tours"],
  ["tours", "joueurs", "terrains"],
  ["terrains", "tours", "joueurs"]
]) {
  test(`réglages dans l'ordre ${order.join(" → ")} : nombre de matchs attendu à chaque tour`, async ({ page }) => {
    const players = [...PLAYERS, "Inès", "Karim", "Lou"]; // 11 joueurs : 2 terrains utilisés, 3 en pause
    for (const what of order) {
      if (what === "joueurs") await addPlayers(page, players);
      if (what === "terrains") await step(page, "courts", 1, 2); // 2 -> 4 terrains demandés
      if (what === "tours") await step(page, "rounds", -1, 4); // 10 -> 6 tours
    }
    await generate(page);
    expect(await matchesPerRound(page)).toEqual(Array(6).fill(2));
    expectNoProblems(problems);
  });
}

test("départ en cours de session : les tours notés restent identiques, le joueur ne joue plus", async ({ page }) => {
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 6);
  await generate(page);
  await scoreRound(page, 0);
  await scoreRound(page, 1);
  const before = (await scheduleText(page)).slice(0, 2);

  // Fiche joueur : Marc part après le tour 2.
  await goTo(page, "preparer");
  await page.locator('#playerChips .chip[data-player="Marc"]').click();
  await expect(page.locator("#playerSheet")).toBeVisible();
  await page.locator("#sheetEnd").fill("2");
  await page.locator("#playerSheet button[data-close-sheet]").click();
  await expect(page.locator('#playerChips .chip[data-player="Marc"] .chip-tag')).toHaveText("jusqu'à T2");

  await expect(page.locator("#generate")).toHaveText("Mettre à jour les matchs");
  await generate(page);
  const after = await scheduleText(page);
  expect(after.slice(0, 2)).toEqual(before);
  for (const roundText of after.slice(2)) expect(roundText).not.toContain("Marc");
  expectNoProblems(problems);
});

test("scores, classement, rechargement puis nouvelle session", async ({ page }) => {
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 4);
  await generate(page);
  for (let r = 0; r < 4; r++) await scoreRound(page, r);
  const planning = await scheduleText(page);

  await goTo(page, "classement");
  await expect(page.locator("#rankingCards .rk")).toHaveCount(PLAYERS.length);

  // Rechargement : planning et scores retrouvés.
  await page.reload();
  await goTo(page, "jouer");
  expect(await scheduleText(page)).toEqual(planning);
  await expect(page.locator('#schedule .round[data-round="0"] .score-input').first()).toHaveValue("11");

  // Nouvelle session : même liste, planning différent (nouvelle graine).
  const seed = await page.locator("#seed").inputValue();
  await goTo(page, "preparer");
  await page.locator("#newSessionBtn").click();
  await confirmModal(page);
  await expect(page.locator("#generate")).toHaveText("Générer les matchs");
  await generate(page);
  expect(await page.locator("#seed").inputValue()).not.toBe(seed);
  expect(await scheduleText(page)).not.toEqual(planning);
  expectNoProblems(problems);
});

test("lien de partage ouvert sur un autre appareil : même planning, mêmes scores", async ({ page, browser }) => {
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 5);
  await generate(page);
  await scoreRound(page, 0);
  const planning = await scheduleText(page);
  const url = await page.evaluate(() => buildShareableUrl());

  const other = await browser.newContext();
  const page2 = await other.newPage();
  const problems2 = watchPage(page2);
  await page2.goto(url);
  await expect(page2.locator('[data-screen="jouer"]')).toBeVisible();
  expect(await scheduleText(page2)).toEqual(planning);
  await expect(page2.locator('#schedule .round[data-round="0"] .score-input').first()).toHaveValue("11");
  expectNoProblems(problems2);
  await other.close();
  expectNoProblems(problems);
});

test("lien piégé : aucun script exécuté, score piégé vide", async ({ page }) => {
  const payload = '"><img src=x onerror=alert(1)>';
  await page.goto(`index.html?d=${shareParam({ p: "Antoine\nJulien\nMarc\nSophie", c: 1, r: 3, s: "x", sc: { "0-0": { 1: payload, 2: 3 } } })}`);
  await expect(page.locator('[data-screen="jouer"]')).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.locator('#schedule .round[data-round="0"] .score-input').evaluateAll(els => els.map(e => e.value))).toEqual(["", "3"]);
  expectNoProblems(problems); // une alert() aurait été relevée ici
});

test("lien démesuré : la page reste réactive et propose de générer", async ({ page }) => {
  const players = Array.from({ length: 40 }, (_, i) => `J${i + 1}`).join("\n");
  const start = Date.now();
  await page.goto(`index.html?d=${shareParam({ p: players, c: 10, r: 2000, s: "x", bw: 500, pk: 30 })}`);
  await expect(page.locator("#warning")).toContainText("long à calculer");
  expect(Date.now() - start).toBeLessThan(10_000);
  await expect(page.locator("#warning button")).toHaveText("Générer quand même");
  await expect(page.locator("#schedule .round")).toHaveCount(0);
  await expect(page.locator("#rounds")).toHaveValue("50");
  await expect(page.locator("#beamWidth")).toHaveValue("80"); // réglage expert du lien ignoré
  expectNoProblems(problems);
});

test("frise des tours : un seul appui suffit juste après la saisie d'un score", async ({ page }) => {
  // Régression : la frise était recréée quand le champ de score perdait le
  // focus, entre l'appui et le relâchement, et ce premier appui était perdu.
  await addPlayers(page, PLAYERS);
  await generate(page);
  const inputs = page.locator('#schedule .round[data-round="0"] .score-input');
  for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill("11");
  await page.locator('#sessionStepper .dot[data-round="1"]').click();
  await expect(page.locator('#schedule .round[data-round="1"]')).toBeVisible({ timeout: 2000 });
});

test("sauvegarde de la version 2.0.1 : scores retrouvés, puis nouvelle session avec la sélection des pauses v2", async ({ page }) => {
  // Vraie sauvegarde d'avant la sélection des pauses v2 (pas de clé "bv").
  const saved = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "fixtures", "rotation-state.json"), "utf8"));
  // Injectée au chargement suivant, AVANT les scripts de l'app : en quittant
  // la page actuelle, l'app réenregistre son propre état (beforeunload).
  await page.addInitScript(state => {
    if (sessionStorage.getItem("fixture-injectee")) return;
    sessionStorage.setItem("fixture-injectee", "1");
    localStorage.setItem("pb_autosave", JSON.stringify(state));
  }, saved);
  await page.reload();
  await goTo(page, "jouer");
  const filled = await page.locator("#schedule .score-input").evaluateAll(els => els.filter(e => e.value !== "").length);
  expect(filled).toBe(Object.keys(saved.sc).length * 2);
  expect(await page.evaluate(() => window.__PB_BENCH_VERSION__)).toBe(1);

  await goTo(page, "preparer");
  await page.locator("#newSessionBtn").click();
  await confirmModal(page);
  await generate(page);
  expect(await page.evaluate(() => window.__PB_BENCH_VERSION__)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pb_autosave")).bv)).toBe(2);
  expectNoProblems(problems);
});

test("ancienne session rechargée depuis l'historique après d'autres sessions : planning et scores intacts", async ({ page }) => {
  // « Varier d'une semaine à l'autre » est activé par défaut : les sessions
  // jouées ensuite enrichissent la mémoire de l'appareil. Le planning de la
  // session rechargée ne doit pas en dépendre.
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 5);
  await generate(page);
  await scoreRound(page, 0);
  await scoreRound(page, 1);
  const planningA = await scheduleText(page);
  await goTo(page, "historique");
  await page.locator("#saveToHistory").click();

  for (let week = 0; week < 2; week++) {
    await goTo(page, "preparer");
    await page.locator("#newSessionBtn").click();
    await confirmModal(page);
    await generate(page);
    for (let r = 0; r < 5; r++) await scoreRound(page, r);
  }

  await goTo(page, "historique");
  await page.locator(".load-hist-btn").first().click();
  await expect(page.locator('[data-screen="jouer"]')).toBeVisible();
  expect(await scheduleText(page)).toEqual(planningA);
  const filled = await page.locator("#schedule .score-input").evaluateAll(els => els.filter(e => e.value !== "").length);
  expect(filled).toBe(2 * 2 * 2); // 2 tours notés × 2 matchs × 2 scores
  expectNoProblems(problems);
});

test("lien partagé ouvert sur un appareil qui a sa propre mémoire : planning complet identique", async ({ page, browser }) => {
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 6);
  await generate(page);
  await scoreRound(page, 0);
  const planning = await scheduleText(page);
  const url = await page.evaluate(() => buildShareableUrl());

  // L'autre appareil a déjà joué ses propres sessions avec les mêmes joueurs.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  const problems2 = watchPage(page2);
  await page2.goto("index.html");
  await addPlayers(page2, PLAYERS);
  await typeStepper(page2, "rounds", 6);
  await generate(page2);
  for (let r = 0; r < 6; r++) await scoreRound(page2, r);
  expect(await page2.evaluate(() => JSON.parse(localStorage.getItem("pb_pair_memory") || "[]").length)).toBeGreaterThan(0);

  await page2.goto(url);
  await expect(page2.locator('[data-screen="jouer"]')).toBeVisible();
  expect(await scheduleText(page2)).toEqual(planning); // tours joués ET tours à venir
  expectNoProblems(problems2);
  await other.close();
  expectNoProblems(problems);
});

test("export du classement en image : librairie chargée seulement au premier export", async ({ page }) => {
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe("undefined");
  await addPlayers(page, PLAYERS);
  await typeStepper(page, "rounds", 2);
  await generate(page);
  await scoreRound(page, 0);
  await goTo(page, "classement");
  await page.locator("#exportRankingsPng").click();
  await expect(page.locator("#modalOverlay")).toBeVisible();
  await expect(page.locator("#modalImagePreview")).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe("function");
  expectNoProblems(problems);
});

test("chaque écran : aucune erreur, rien ne dépasse en largeur", async ({ page }) => {
  await addPlayers(page, [...PLAYERS, "Inès", "Karim-Alexandre de la Fontaine"]);
  await generate(page);
  await scoreRound(page, 0);
  await page.locator("#saveToHistory").evaluate(btn => btn.click());
  for (const screen of ["preparer", "jouer", "classement", "historique"]) {
    await goTo(page, screen);
    await expectNoHorizontalScroll(page);
  }
  expectNoProblems(problems);
});
