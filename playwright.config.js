"use strict";
// =============================================================================
// TESTS NAVIGATEUR (Playwright) : parcours complets, comme un utilisateur
// =============================================================================
// Lancer : npm run test:e2e        (ou npx playwright test --ui pour voir
// chaque étape). Sur la CI, Chromium est installé par le workflow
// .github/workflows/e2e.yml ; en local, PW_CHANNEL=msedge (ou chrome)
// utilise le navigateur déjà installé au lieu d'en télécharger un.
const { defineConfig, devices } = require("@playwright/test");

const PORT = 4173;
const channel = process.env.PW_CHANNEL || undefined;

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // Le service worker resservirait d'anciennes versions entre deux tests :
    // bloqué partout, sauf dans le test qui le vérifie (voir commun.spec.js).
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Vidéo des échecs sur la CI seulement (ffmpeg y est installé avec Chromium).
    video: process.env.CI ? "retain-on-failure" : "off",
    locale: "fr-FR"
  },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1280, height: 800 } } },
    { name: "téléphone", use: { ...devices["Pixel 7"], channel } }
  ],
  webServer: {
    command: `node tests/e2e/server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
