"use strict";
// Éléments communs aux deux pages : Content-Security-Policy, apparence,
// fonctionnement hors ligne.
const { test, expect } = require("@playwright/test");
const { watchPage, expectNoProblems, expectNoHorizontalScroll } = require("./helpers");

for (const pageName of ["index.html", "tournoi.html"]) {
  test(`${pageName} : CSP active, aucun blocage ni erreur au chargement`, async ({ page }) => {
    const problems = watchPage(page);
    const response = await page.goto(pageName);
    expect(response.ok()).toBe(true);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    // Un script injecté dans la page doit être bloqué par la CSP.
    const injected = await page.evaluate(() => new Promise(resolve => {
      document.addEventListener("securitypolicyviolation", () => resolve("bloqué"), { once: true });
      const s = document.createElement("script");
      s.textContent = "window.__injected = true;";
      document.head.append(s);
      setTimeout(() => resolve(window.__injected ? "exécuté" : "bloqué"), 500);
    }));
    expect(injected).toBe("bloqué");
    expectNoProblems(problems, [/Content Security Policy/]);
  });

  test(`${pageName} : identités visuelles et thème clair/sombre`, async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(pageName);
    for (const skin of ["nuit", "plein-air", "score"]) {
      await page.locator("#moreMenuBtn").click();
      await page.locator(`[data-skin-choice="${skin}"]`).click();
      await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
      await page.keyboard.press("Escape");
      await expectNoHorizontalScroll(page);
    }
    await page.locator("#moreMenuBtn").click();
    const before = await page.locator("html").getAttribute("data-theme");
    await page.locator("#themeToggleBtn").click();
    expect(await page.locator("html").getAttribute("data-theme")).not.toBe(before);
    expectNoProblems(problems);
  });
}

test.describe("hors ligne", () => {
  test.use({ serviceWorkers: "allow" });

  test("service worker installé : l'app se recharge sans réseau", async ({ page, context }) => {
    const problems = watchPage(page);
    await page.goto("index.html");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // désormais contrôlée par le service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#generate")).toBeVisible();
    await page.goto("tournoi.html");
    await expect(page.locator("#generatePools")).toBeVisible();
    await context.setOffline(false);
    expectNoProblems(problems);
  });
});
