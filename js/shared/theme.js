"use strict";

// =============================================================================
// THEME CLAIR / SOMBRE ET IDENTITÉ VISUELLE
// =============================================================================
// Module partagé entre toutes les pages du site : entièrement autonome (ses
// propres références DOM ci-dessous). Le choix est enregistré dans localStorage
// ("pb_theme" pour clair/sombre, "pb_skin" pour l'identité visuelle) et reste
// donc cohérent d'une page à l'autre.
//
// Identités visuelles (attribut data-skin sur <html>, voir css/app.css) :
// "nuit" (Nocturne, défaut), "plein-air" (Plein air), "score" (Tableau
// d'affichage). Une page qui n'a pas de sélecteur d'identité (tournoi.html,
// pas encore migrée) ignore simplement cet attribut.
//
// Le script anti-flash dans le <head> de chaque page (qui pose data-skin et
// data-theme avant le premier rendu) est indépendant de ce fichier : il doit
// rester inline dans le <head> pour s'exécuter avant que la page ne se dessine.
// Il applique la même règle par défaut que defaultThemeForSkin() ci-dessous.

const btnThemeToggle = document.getElementById("themeToggleBtn");
const elMetaThemeColor = document.getElementById("metaThemeColor");

const THEME_STORAGE_KEY = "pb_theme";
const SKIN_STORAGE_KEY = "pb_skin";
const SKINS = ["nuit", "plein-air", "score"];
// Couleurs de repli de la barre d'adresse mobile, pour une page qui ne
// définit pas la variable CSS --bg (styles.css de tournoi.html).
const THEME_COLOR_DARK = "#0a0f18";
const THEME_COLOR_LIGHT = "#eef2f7";

// Icônes soleil/lune en SVG inline plutôt qu'en emoji (☀️/🌙) : rendu
// identique sur toutes les plateformes, et stroke="currentColor" suit
// automatiquement la couleur du bouton (thème clair/sombre, survol...).
const ICON_SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICON_MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function readStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // localStorage indisponible (navigation privée, quota dépassé...) : le choix
    // reste appliqué pour cette session, mais ne survivra pas à un rechargement.
  }
}

/** Sans choix explicite : sombre pour Nocturne (identité historique), clair sinon. */
function defaultThemeForSkin(skin) {
  return skin === "nuit" ? "dark" : "light";
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function currentSkin() {
  const skin = document.documentElement.getAttribute("data-skin");
  return SKINS.includes(skin) ? skin : "nuit";
}

/** Couleur de la barre d'adresse mobile : suit le fond réel de la page. */
function syncMetaThemeColor() {
  if (!elMetaThemeColor) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  elMetaThemeColor.setAttribute("content", bg || (currentTheme() === "light" ? THEME_COLOR_LIGHT : THEME_COLOR_DARK));
}

/**
 * Applique le thème demandé (attribut sur <html>, icône du bouton, couleur de
 * la barre d'adresse mobile). N'écrit jamais dans localStorage lui-même : voir
 * le click listener plus bas pour la persistance.
 */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  if (btnThemeToggle) {
    const icon = theme === "light" ? ICON_MOON_SVG : ICON_SUN_SVG;
    // Bouton dans un menu (data-with-label, voir index.html) : icône + libellé
    // de l'action. Sinon (ancien bouton d'en-tête de tournoi.html) : icône seule
    // représentant le thème courant, comme avant.
    btnThemeToggle.innerHTML = btnThemeToggle.dataset.withLabel
      ? `${icon}<span>${theme === "light" ? "Passer en thème sombre" : "Passer en thème clair"}</span>`
      : (theme === "light" ? ICON_SUN_SVG : ICON_MOON_SVG);
  }
  syncMetaThemeColor();
}

function applySkin(skin) {
  if (!SKINS.includes(skin)) skin = "nuit";
  document.documentElement.setAttribute("data-skin", skin);
  document.querySelectorAll("[data-skin-choice]").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.skinChoice === skin));
  });
  syncMetaThemeColor();
}

// Synchronise les contrôles avec ce que le script anti-flash a déjà appliqué.
applySkin(currentSkin());
applyTheme(currentTheme());

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", () => {
    const nextTheme = currentTheme() === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    writeStorage(THEME_STORAGE_KEY, nextTheme);
  });
}

document.querySelectorAll("[data-skin-choice]").forEach(btn => {
  btn.addEventListener("click", () => {
    const skin = btn.dataset.skinChoice;
    applySkin(skin);
    writeStorage(SKIN_STORAGE_KEY, skin);
    // Tant que l'utilisateur n'a jamais choisi clair/sombre lui-même, chaque
    // identité s'affiche dans son mode de prédilection.
    if (!readStorage(THEME_STORAGE_KEY)) applyTheme(defaultThemeForSkin(skin));
  });
});
