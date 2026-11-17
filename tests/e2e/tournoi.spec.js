"use strict";
// Parcours du mode Tournoi (tournoi.html), dans un vrai navigateur.
const { test, expect } = require("@playwright/test");
const { shareParam, watchPage, expectNoProblems, goTo, expectNoHorizontalScroll, confirmModal } = require("./helpers");

const TEAMS = ["Alice & Bob", "Chloé & David", "Émilie & Farid", "Gaël & Hana", "Inès & Jules", "Karim & Lou", "Mia & Noé", "Oscar & Paul"];

let problems;
test.beforeEach(async ({ page }) => {
  problems = watchPage(page);
  await page.goto("tournoi.html");
});

/** Ajoute les équipes d'un coup (séparées par des points-virgules). */
async function addTeams(page, teams) {
  await page.locator("#addTeamInput").fill(teams.join("; "));
  await page.locator("#addTeamInput").press("Enter");
  await expect(page.locator("#teamChips .chip")).toHaveCount(teams.length);
}

/**
 * Remplit, un par un, les champs de score modifiables encore vides d'un
 * conteneur (11 pour l'équipe A, 6 pour l'équipe B). La page se redessine
 * au fil de la saisie (un tour de tableau complet passe en lecture seule et
 * le suivant apparaît) : on recherche donc le premier champ vide à chaque fois.
 */
async function fillScores(page, container) {
  for (let guard = 0; guard < 200; guard++) {
    const next = await page.locator(`${container} .score-input:not([readonly])`).evaluateAll(els => {
      const i = els.findIndex(e => e.value === "");
      return i === -1 ? null : { i, side: els[i].dataset.side || els[i].dataset.team };
    });
    if (!next) return;
    await page.locator(`${container} .score-input:not([readonly])`).nth(next.i).fill(next.side === "a" || next.side === "1" ? "11" : "6");
  }
}

/** Joue un tableau (phase finale ou consolante) jusqu'au bout. */
const playBracket = fillScores;

test("tournoi complet : poules, renommage, forfait, phase finale, consolante, classement final", async ({ page }) => {
  await addTeams(page, TEAMS);
  await page.locator("#generatePools").click();
  await expect(page.locator("#poolsContainer .pool-card")).toHaveCount(2);
  await fillScores(page, "#poolsContainer");

  // Renommage et forfait, depuis les classements de poule.
  await goTo(page, "classement");
  await expect(page.locator("#poolStandingsContainer tbody tr")).toHaveCount(TEAMS.length);
  await page.locator("#poolStandingsContainer .team-rename-btn").first().click();
  await page.locator(".team-rename-input").fill("Les Invincibles");
  await page.locator(".team-rename-input").press("Enter");
  await expect(page.locator("#poolStandingsContainer")).toContainText("Les Invincibles");
  await page.locator("#poolStandingsContainer .team-forfeit-btn").last().click();
  await confirmModal(page);
  await expect(page.locator("#poolStandingsContainer tr.forfeited")).toHaveCount(1);

  // Phase finale.
  await goTo(page, "jouer");
  await page.locator('.stage-tab[data-stage="finale"]').click();
  await page.locator("#generateFinalPhase").click();
  await expect(page.locator("#finalPhaseContainer .match-card").first()).toBeVisible();
  await playBracket(page, "#finalPhaseContainer");

  // Consolante (équipes non qualifiées).
  await page.locator('.stage-tab[data-stage="classement"]').click();
  await page.locator("#generateConsolationPhase").click();
  await playBracket(page, "#consolationPhaseContainer");

  await goTo(page, "classement");
  await expect(page.locator("#finalRankingContainer tbody tr")).toHaveCount(TEAMS.length);
  await expect(page.locator("#finalRankingContainer")).toContainText("Les Invincibles");

  // Export en image (html2canvas chargé à ce moment-là seulement).
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe("undefined");
  await page.locator("#exportFinalRankingPng").click();
  await expect(page.locator("#modalImagePreview")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.locator("#modalOverlay").getByRole("button", { name: "Fermer" }).click();
  await expect(page.locator("#modalOverlay")).toBeHidden();
  for (const screen of ["preparer", "jouer", "classement", "historique"]) {
    await goTo(page, screen);
    await expectNoHorizontalScroll(page);
  }
  expectNoProblems(problems);
});

test("rechargement et lien de partage : le tournoi et ses scores sont retrouvés", async ({ page, browser }) => {
  await addTeams(page, TEAMS.slice(0, 6));
  await page.locator("#generatePools").click();
  await fillScores(page, "#poolsContainer");
  const scores = await page.locator("#poolsContainer .score-input").evaluateAll(els => els.map(e => e.value));

  await page.reload();
  await goTo(page, "jouer");
  expect(await page.locator("#poolsContainer .score-input").evaluateAll(els => els.map(e => e.value))).toEqual(scores);

  const url = await page.evaluate(() => buildTournamentShareableUrl());
  const other = await browser.newContext();
  const page2 = await other.newPage();
  const problems2 = watchPage(page2);
  await page2.goto(url);
  await goTo(page2, "jouer");
  expect(await page2.locator("#poolsContainer .score-input").evaluateAll(els => els.map(e => e.value))).toEqual(scores);
  expectNoProblems(problems2);
  await other.close();
  expectNoProblems(problems);
});

test("lien piégé : aucun script exécuté, tournoi chargé avec le score piégé vide", async ({ page }) => {
  // On part d'un vrai tournoi généré par l'app, puis on piège un score.
  await addTeams(page, TEAMS.slice(0, 4));
  await page.locator("#generatePools").click();
  const state = await page.evaluate(() => getTournamentState());
  const firstKey = Object.keys(state.tournament.pools[0].scores)[0] || "0-0";
  state.tournament.pools[0].scores[firstKey] = { a: '"><img src=x onerror=alert(1)>', b: 7 };

  await page.goto(`tournoi.html?d=${shareParam(state)}`);
  await goTo(page, "jouer");
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator("#poolsContainer .score-input").first()).toHaveValue("");
  expectNoProblems(problems);
});
