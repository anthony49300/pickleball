"use strict";

// =============================================================================
// COQUILLE COMMUNE DES PAGES : ÉCRANS, ONGLETS ET MENUS DÉROULANTS
// =============================================================================
// Partagé par index.html (Rotation) et tournoi.html (Tournoi), qui ont la même
// structure : quatre écrans (<section data-screen="...">), une barre
// d'onglets (boutons data-screen-tab), des boutons de raccourci (data-goto)
// et deux menus déroulants dans la barre du haut (sélecteur de mode et ⋮).
//
// Un seul écran est visible à la fois. L'écran affiché est reflété dans l'URL
// (#jouer...) pour survivre à un rechargement ; les liens de partage (?d=...)
// n'en dépendent pas (ils ne reprennent que origin + pathname).

const elShellScreens = document.querySelectorAll("[data-screen]");
const elShellTabs = document.querySelectorAll("[data-screen-tab]");
const SCREENS = Array.from(elShellScreens).map(el => el.dataset.screen);

let currentScreen = null;

/**
 * Affiche un écran (et seulement lui), met à jour l'onglet actif et l'URL.
 * @param {string} name - valeur data-screen ; un nom inconnu affiche le premier écran
 * @param {{scroll?: boolean}} [opts] - scroll:false pour ne pas remonter en haut
 */
function showScreen(name, { scroll = true } = {}) {
  if (!SCREENS.includes(name)) name = SCREENS[0];
  const changed = name !== currentScreen;
  currentScreen = name;

  elShellScreens.forEach(el => { el.hidden = el.dataset.screen !== name; });
  elShellTabs.forEach(tab => {
    if (tab.dataset.screenTab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });

  if (window.location.hash !== `#${name}`) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${name}`);
  }
  if (changed && scroll) window.scrollTo(0, 0);
}

/** Écran demandé par l'URL (#jouer...), ou null s'il n'y en a pas de valide. */
function screenFromHash() {
  const fromHash = window.location.hash.replace("#", "");
  return SCREENS.includes(fromHash) ? fromHash : null;
}

elShellTabs.forEach(tab => tab.addEventListener("click", () => showScreen(tab.dataset.screenTab)));

// Boutons "Préparer la session", "Reprendre"... (data-goto="écran")
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-goto]");
  if (btn) showScreen(btn.dataset.goto);
});

// ---------------------------------------------------------------------------
// Menus déroulants (sélecteur de mode et ⋮)
// ---------------------------------------------------------------------------

const SHELL_MENUS = [
  [document.getElementById("modeMenuBtn"), document.getElementById("modeMenu")],
  [document.getElementById("moreMenuBtn"), document.getElementById("moreMenu")],
].filter(([btn, menu]) => btn && menu);

function closeMenus(exceptMenu = null) {
  SHELL_MENUS.forEach(([btn, menu]) => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  });
}

SHELL_MENUS.forEach(([btn, menu]) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    closeMenus(menu);
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    // Ouverture au clavier (e.detail === 0) : focus sur la première action.
    if (open && e.detail === 0) menu.querySelector("[role='menuitem']:not(:disabled), button:not(:disabled)")?.focus();
  });

  // Une action du menu le referme (le choix d'identité visuelle aussi :
  // l'effet est immédiat et visible).
  menu.addEventListener("click", (e) => {
    if (e.target.closest("[role='menuitem'], [data-skin-choice]")) closeMenus();
  });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-wrap")) closeMenus();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = SHELL_MENUS.find(([, menu]) => !menu.hidden);
  if (open) {
    closeMenus();
    open[0].focus();
  }
});

/**
 * Valeurs affichées à côté des curseurs (.slider-field) : ui-controls.js ne
 * les met à jour qu'à la saisie, pas quand un état chargé (sauvegarde,
 * historique, lien partagé) réécrit les curseurs.
 */
function syncSliderOutputs() {
  document.querySelectorAll(".slider-field input[type='range']").forEach(range => {
    const output = range.closest(".slider-field")?.querySelector(".slider-value");
    if (output) output.textContent = range.value;
  });
}
