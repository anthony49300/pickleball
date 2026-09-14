"use strict";

// =============================================================================
// THEME CLAIR / SOMBRE
// =============================================================================
// Module partagé entre toutes les pages du site : entièrement autonome (ses
// propres références DOM ci-dessous), à charger sur toute page qui inclut un
// bouton #themeToggleBtn et un <meta name="theme-color" id="metaThemeColor">
// (voir index.html) — le choix (localStorage "pb_theme") est ainsi cohérent
// d'une page à l'autre du site.
//
// Le script anti-flash dans le <head> de chaque page (qui pose data-theme="light"
// avant le premier rendu si besoin) est indépendant de ce fichier : il doit
// rester inline dans le <head> pour s'exécuter avant que la page ne se dessine,
// alors que ce fichier n'est chargé qu'en fin de page.

const btnThemeToggle = document.getElementById("themeToggleBtn");
const elMetaThemeColor = document.getElementById("metaThemeColor");

const THEME_STORAGE_KEY = "pb_theme";
const THEME_COLOR_DARK = "#0a0f18";
const THEME_COLOR_LIGHT = "#eef2f7";

/**
 * Applique le thème demandé (attribut sur <html>, icône du bouton, couleur de
 * la barre d'adresse mobile). N'écrit jamais dans localStorage lui-même : voir
 * le click listener plus bas pour la persistance.
 */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (btnThemeToggle) btnThemeToggle.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (btnThemeToggle) btnThemeToggle.textContent = "🌙";
  }
  if (elMetaThemeColor) {
    elMetaThemeColor.setAttribute("content", theme === "light" ? THEME_COLOR_LIGHT : THEME_COLOR_DARK);
  }
}

// Synchronise l'icône du bouton avec le thème déjà appliqué au chargement de la
// page (voir le script anti-flash dans le <head>, qui lit localStorage et pose
// data-theme="light" avant même le premier rendu).
applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", () => {
    const isCurrentlyLight = document.documentElement.getAttribute("data-theme") === "light";
    const nextTheme = isCurrentlyLight ? "dark" : "light";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (e) {
      // localStorage indisponible (navigation privée, quota dépassé...) : le thème
      // choisi reste appliqué pour cette session, mais ne survivra pas à un rechargement.
    }
  });
}
