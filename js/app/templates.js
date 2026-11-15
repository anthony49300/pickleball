"use strict";

// =============================================================================
// GABARITS HTML PURS DU MODE ROTATION
// =============================================================================
// Fonctions qui ne font que construire du texte HTML à partir de leurs
// paramètres (aucun accès au DOM ni à window) : testables dans Node (voir
// tests/security.test.js). Toute valeur venant de l'état (noms, scores...)
// passe par escapeHtml (algorithm.js) ou scoreInputValue (sanitize.js).

/**
 * Carte d'un match : bandeau "terrain", puis une ligne par équipe avec ses
 * boutons −/+ autour du champ de score (.score-input, écouté dans
 * history-and-events.js). L'état visuel (gagnant, égalité...) est posé par
 * refreshMatchCard (form-and-render.js).
 * @param {Array} match - [équipe1, équipe2], chaque équipe étant 1 ou 2 noms
 * @param {number} rIdx - index du tour
 * @param {number} mIdx - index du match dans le tour
 * @param {string} courtLabel - nom du terrain (texte brut, échappé ici)
 * @param {{'1': *, '2': *}|null} savedScore - voir readMatchScore
 */
function buildMatchCard(match, rIdx, mIdx, courtLabel, savedScore) {
  const round = Number(rIdx);
  const matchNo = Number(mIdx);
  const teamRow = (team, teamNo) => {
    const label = escapeHtml(team.join(" et "));
    return `
      <div class="team-row" data-team="${teamNo}">
        <div class="team-names"><span>${team.map(escapeHtml).join("<br>")}</span><span class="win-tag">Gagnant</span></div>
        <div class="score-ctl">
          <button type="button" class="score-step" data-delta="-1" tabindex="-1" aria-label="Retirer un point à ${label}">−</button>
          <input type="number" class="score-input" data-round="${round}" data-match="${matchNo}" data-team="${teamNo}" min="0" max="99" inputmode="numeric" placeholder="–" value="${scoreInputValue(savedScore?.[teamNo])}" aria-label="Score de ${label}, tour ${round + 1}" />
          <button type="button" class="score-step" data-delta="1" tabindex="-1" aria-label="Ajouter un point à ${label}">+</button>
        </div>
      </div>`;
  };

  const [t1, t2] = match;
  return `
    <article class="match-card" data-round="${round}" data-match="${matchNo}">
      <header class="court-strip"><span class="court-name">${escapeHtml(courtLabel)}</span><span class="court-state"></span></header>
      ${teamRow(t1, "1")}
      <div class="net"><span>contre</span></div>
      ${teamRow(t2, "2")}
      <p class="tie-warning" hidden>Égalité : aucun vainqueur enregistré. Une partie de pickleball ne se termine pas à égalité, vérifiez le score.</p>
    </article>`;
}
