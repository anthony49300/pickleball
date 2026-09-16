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

// Icônes soleil/lune en SVG inline plutôt qu'en emoji (☀️/🌙) : rendu
// identique sur toutes les plateformes, et stroke="currentColor" suit
// automatiquement la couleur du bouton (thème clair/sombre, survol...).
const ICON_SUN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICON_MOON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

/**
 * Applique le thème demandé (attribut sur <html>, icône du bouton, couleur de
 * la barre d'adresse mobile). N'écrit jamais dans localStorage lui-même : voir
 * le click listener plus bas pour la persistance.
 */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (btnThemeToggle) btnThemeToggle.innerHTML = ICON_SUN_SVG;
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (btnThemeToggle) btnThemeToggle.innerHTML = ICON_MOON_SVG;
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
