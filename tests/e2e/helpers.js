"use strict";
// Outils communs aux tests navigateur (voir playwright.config.js).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { expect } = require("@playwright/test");

// LZString (celui de l'app) pour fabriquer des liens de partage ?d=...
const lzContext = {};
vm.createContext(lzContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "js", "vendor", "lz-string.min.js"), "utf8"), lzContext);
const shareParam = (state) => vm.runInContext(`LZString.compressToEncodedURIComponent(${JSON.stringify(JSON.stringify(state))})`, lzContext);

/**
 * Surveille la page : erreurs JavaScript, messages d'erreur de la console
 * (dont les blocages par la Content-Security-Policy) et fenêtres alert().
 * À vérifier en fin de test avec expectNoProblems().
 */
function watchPage(page) {
  const problems = [];
  page.on("pageerror", err => problems.push(`erreur JavaScript : ${err.message}`));
  page.on("console", msg => {
    if (msg.type() === "error") problems.push(`console : ${msg.text()}`);
  });
  page.on("dialog", async dialog => {
    problems.push(`fenêtre ${dialog.type()} : ${dialog.message()}`);
    await dialog.dismiss();
  });
  return problems;
}

/**
 * Aucun problème relevé par watchPage. `allowed` : motifs de messages
 * attendus par le test (ex. lien volontairement invalide).
 */
function expectNoProblems(problems, allowed = []) {
  expect(problems.filter(p => !allowed.some(re => re.test(p)))).toEqual([]);
}

/** Va sur un écran (Préparer, Jouer, Classement, Historique). */
async function goTo(page, screen) {
  await page.locator(`[data-screen-tab="${screen}"]`).click();
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

/** Ajoute des joueurs avec le champ « Ajouter un joueur » (liste séparée par des virgules). */
async function addPlayers(page, names) {
  await page.locator("#addPlayerInput").fill(names.join(", "));
  await page.locator("#addPlayerInput").press("Enter");
  await expect(page.locator("#playerChips .chip")).toHaveCount(names.length);
}

/** Clique `times` fois sur + (delta 1) ou − (delta -1) d'un compteur (terrains, tours...). */
async function step(page, inputId, delta, times = 1) {
  const btn = page.locator(`.stepper:has(#${inputId}) [data-step="${delta}"]`);
  for (let i = 0; i < times; i++) await btn.click();
}

/** Saisit une valeur au clavier dans un compteur, puis la valide (Tab). */
async function typeStepper(page, inputId, value) {
  const input = page.locator(`#${inputId}`);
  await input.fill(String(value));
  await input.press("Tab");
}

/** Bouton « Générer les matchs » / « Mettre à jour les matchs » ; attend l'écran Jouer. */
async function generate(page) {
  await page.locator("#generate").click();
  await expect(page.locator('[data-screen="jouer"]')).toBeVisible();
}

/** Nombre de matchs de chaque tour du planning (cartes de match dans le DOM). */
async function matchesPerRound(page) {
  return page.locator("#schedule .round").evaluateAll(rounds => rounds.map(r => r.querySelectorAll(".match-card").length));
}

/** Texte des affiches de chaque tour (pour comparer deux plannings). */
async function scheduleText(page) {
  return page.locator("#schedule .round").evaluateAll(rounds =>
    rounds.map(r => [...r.querySelectorAll(".match-card .team-names span:first-child")].map(s => s.textContent).join(" / ")));
}

/** Affiche le tour `r` (0-based) via la frise, puis saisit ses scores (11 à x). */
async function scoreRound(page, r) {
  await page.locator(`#sessionStepper .dot[data-round="${r}"]`).click();
  await expect(page.locator(`#schedule .round[data-round="${r}"]`)).toBeVisible();
  const inputs = page.locator(`#schedule .round[data-round="${r}"] .score-input`);
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill(String(i % 2 === 0 ? 11 : 5 + (i % 4)));
  }
}

/** Pas de défilement horizontal (rien ne dépasse de la largeur de l'écran). */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Confirme la modale ouverte (confirmModal). */
async function confirmModal(page) {
  await expect(page.locator("#modalOverlay")).toBeVisible();
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#modalOverlay")).toBeHidden();
}

module.exports = {
  shareParam, watchPage, expectNoProblems, goTo, addPlayers, step, typeStepper,
  generate, matchesPerRound, scheduleText, scoreRound, expectNoHorizontalScroll, confirmModal
};
