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

/**
 * Câble une "vue liste" éditable (un champ texte + un bouton supprimer par
 * ligne) par-dessus un <textarea> qui contient une entrée par ligne (joueurs,
 * équipes...) — pratique pour corriger/retirer une entrée précise dans une
 * longue liste, sans avoir à repérer la bonne ligne dans un gros bloc de
 * texte. Le <textarea> reste l'unique source de vérité (aucune logique de
 * parsing/génération existante à toucher) : la vue liste se contente de
 * réécrire sa valeur et de redéclencher "input"/"change" comme si
 * l'utilisateur avait tapé directement dedans (autosave, badge de comptage...
 * continuent de fonctionner normalement).
 *
 * Pendant l'édition, les lignes ne sont JAMAIS filtrées/recoupées (une ligne
 * vide reste une ligne, à son index) : sinon une ligne vide au milieu (juste
 * ajoutée, ou en cours de réécriture) déciderait l'index des champs affichés
 * de celui des lignes réelles au premier caractère tapé ailleurs. Seule
 * l'ouverture de la vue liste effectue un nettoyage ponctuel (voir `split`).
 *
 * @param {Object} opts
 * @param {string} opts.textareaId
 * @param {string} opts.listContainerId - conteneur de la vue liste (à côté du textarea, masqué par défaut)
 * @param {string} opts.toggleBtnId - bouton "Vue liste" / "Vue texte"
 * @param {string} [opts.addBtnId] - bouton "+ Ajouter une ligne" (masqué hors vue liste)
 * @param {string} [opts.rowPlaceholder]
 * @param {(text:string) => string[]} [opts.split] - découpe le texte en lignes
 *   à l'OUVERTURE de la vue liste uniquement (nettoyage ponctuel : espaces,
 *   lignes vides, éventuels séparateurs supplémentaires comme la virgule
 *   pour la liste de joueurs) ; par défaut, un simple découpage sur les
 *   retours à la ligne.
 */
function wireEditableListView({ textareaId, listContainerId, toggleBtnId, addBtnId, rowPlaceholder = "", split = text => text.split(/\r?\n/) }) {
  const textarea = document.getElementById(textareaId);
  const listContainer = document.getElementById(listContainerId);
  const toggleBtn = document.getElementById(toggleBtnId);
  const addBtn = addBtnId ? document.getElementById(addBtnId) : null;
  if (!textarea || !listContainer || !toggleBtn) return;

  const currentLines = () => textarea.value.split(/\r?\n/);

  function commit(lines) {
    textarea.value = lines.join("\n");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderRows() {
    const lines = currentLines();
    listContainer.innerHTML = lines.length
      ? lines.map((line, i) => `
        <div class="editable-list-row">
          <input type="text" class="editable-list-input" data-index="${i}" value="${escapeHtml(line)}" placeholder="${escapeHtml(rowPlaceholder)}" />
          <button type="button" class="icon-btn editable-list-remove" data-index="${i}" title="Supprimer cette ligne" aria-label="Supprimer cette ligne">🗑️</button>
        </div>
      `).join("")
      : `<p class="subtle" style="font-size: 0.85rem;">Aucune entrée pour l'instant — utilisez "➕ Ajouter une ligne".</p>`;
  }

  listContainer.addEventListener("input", (e) => {
    if (!e.target.classList.contains("editable-list-input")) return;
    const idx = parseInt(e.target.dataset.index, 10);
    const lines = currentLines();
    lines[idx] = e.target.value;
    // Pas de renderRows() ici : ça ferait perdre le focus du champ en cours
    // de frappe. On réécrit juste le textarea (source de vérité) et on
    // redéclenche "input" pour l'autosave/le badge de comptage.
    textarea.value = lines.join("\n");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });

  listContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("editable-list-input")) {
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  listContainer.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".editable-list-remove");
    if (!removeBtn) return;
    const idx = parseInt(removeBtn.dataset.index, 10);
    const lines = currentLines();
    lines.splice(idx, 1);
    commit(lines);
    renderRows();
  });

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const lines = currentLines();
      lines.push("");
      commit(lines);
      renderRows();
      const inputs = listContainer.querySelectorAll(".editable-list-input");
      inputs[inputs.length - 1]?.focus();
    });
  }

  toggleBtn.addEventListener("click", () => {
    const switchingToList = listContainer.hidden;

    if (switchingToList) {
      // Nettoyage ponctuel à l'ouverture uniquement (voir doc ci-dessus).
      commit(split(textarea.value));
      renderRows();
    }

    listContainer.hidden = !switchingToList;
    textarea.hidden = switchingToList;
    if (addBtn) addBtn.hidden = !switchingToList;
    toggleBtn.textContent = switchingToList ? "📄 Vue texte" : "📝 Vue liste";
  });
}
