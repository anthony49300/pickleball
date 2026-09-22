"use strict";

// =============================================================================
// CONTROLES UI MODERNISES : STEPPERS NUMERIQUES & SLIDERS
// =============================================================================
// Module partagé entre toutes les pages du site : câble tout élément
// `.stepper-btn` / `.slider-field` présent sur la page, sans référence à un
// champ précis — utilisable tel quel sur n'importe quelle page qui reprend ce
// balisage (voir index.html et tournoi.html).

/**
 * Câble les boutons +/- des steppers numériques.
 * Redispatche "input"/"change" pour que les listeners existants (autosave, présence…)
 * continuent de fonctionner normalement.
 */
document.querySelectorAll(".stepper-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrapper = btn.closest(".stepper");
    const input = wrapper?.querySelector("input[type='number']");
    if (!input) return;

    const step = parseInt(btn.dataset.step, 10) || 0;
    const min = parseInt(wrapper.dataset.min ?? input.min, 10);
    const max = parseInt(wrapper.dataset.max ?? input.max, 10);
    const current = parseInt(input.value, 10) || 0;
    const next = Math.min(
      Number.isNaN(max) ? Infinity : max,
      Math.max(Number.isNaN(min) ? -Infinity : min, current + step)
    );

    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

/**
 * Affiche et met à jour en direct la valeur numérique à côté de chaque slider.
 */
document.querySelectorAll(".slider-field input[type='range']").forEach(range => {
  const output = range.parentElement.querySelector(".slider-value");
  if (!output) return;
  const syncValue = () => { output.textContent = range.value; };
  syncValue();
  range.addEventListener("input", syncValue);
});

/**
 * Navigation clavier rapide dans la saisie des scores (mode Rotation ET mode
 * Tournoi, d'où sa place ici plutôt que dans l'un des deux) : Entrée dans un
 * champ ".score-input" passe directement au suivant dans l'ordre du DOM
 * (donc match par match, poule/tour par poule/tour). Ces champs ne sont dans
 * aucun <form> : Entrée n'a par défaut aucun effet dessus. Un champ en
 * lecture seule (historique de bracket déjà joué, mode Tournoi) est ignoré :
 * rien à y saisir.
 */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList.contains("score-input") || e.target.readOnly) return;
  e.preventDefault();

  const inputs = Array.from(document.querySelectorAll(".score-input:not([readonly])"));
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) { next.focus(); next.select(); }
});
