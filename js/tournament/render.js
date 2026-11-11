"use strict";

// =============================================================================
// MODE TOURNOI — RENDU (équipes, répartition manuelle, poules, classements)
// =============================================================================

// Icônes "œil" (masquer/afficher une poule ou un match, voir plus bas) en SVG
// inline plutôt qu'en emoji : rendu identique et net sur toutes les
// plateformes (contrairement aux emoji, dont le style varie beaucoup d'un
// système à l'autre), et stroke="currentColor" suit automatiquement la
// couleur du bouton (thème clair/sombre, survol...) sans rien coder en dur.
const ICON_EYE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Libellés du niveau 1-5 (voir window.__PT_TEAM_LEVELS__) : 3 = valeur
// neutre par défaut tant que rien n'est renseigné (même échelle que le mode
// Rotation, voir LEVEL_LABELS dans js/app/form-and-render.js).
const TEAM_LEVEL_LABELS = { 1: "Débutant", 2: "Occasionnel", 3: "Intermédiaire", 4: "Avancé", 5: "Expert" };

// Icônes des actions "Renommer" et "Forfait" (classements de poule).
const ICON_EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_FORFEIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';

/**
 * Met à jour le badge "X équipe(s)" à côté du champ de saisie, et la liste
 * des niveaux par équipe (voir renderTeamLevelsList) : les deux dépendent du
 * même texte source (#teams) et doivent donc rester synchronisés ensemble.
 */
function updateTeamCountBadge() {
  const { teams } = parseTeams(elTeams.value);
  elTeamCountBadge.textContent = `${teams.length} équipe${teams.length > 1 ? "s" : ""}`;
  renderTeamLevelsList(teams, window.__PT_TEAM_LEVELS__);
  // Pastilles d'équipe de l'écran Préparer (voir teams-ui.js).
  renderTeamChips();
}

/**
 * Affiche la liste éditable "équipe → niveau" (voir window.__PT_TEAM_LEVELS__,
 * entièrement optionnel). Même structure que renderManualAssignList, avec un
 * niveau 1-5 à la place d'une poule.
 * @param {Array} teams
 * @param {Object<number,number>} levels - id d'équipe → niveau (1-5)
 */
function renderTeamLevelsList(teams, levels) {
  if (!elTeamLevelsList) return;
  elTeamLevelsList.innerHTML = teams.map(team => {
    const current = levels[team.id] ?? 3;
    const options = [1, 2, 3, 4, 5].map(n =>
      `<option value="${n}" ${n === current ? "selected" : ""}>${n} — ${TEAM_LEVEL_LABELS[n]}</option>`
    ).join("");

    return `
      <div class="manual-assign-row">
        <span class="team-name">${escapeHtml(team.name)}</span>
        <select class="team-level-select" data-team-id="${team.id}">${options}</select>
      </div>
    `;
  }).join("");
}

/**
 * Affiche la liste éditable "joueur → niveau" pour la formation automatique
 * des paires (voir window.__PT_PLAYER_LEVELS__ et autoPairPlayers dans
 * engine.js). Même principe que renderTeamLevelsList, mais indexée par nom :
 * un joueur individuel n'a pas d'id stable avant la formation des équipes.
 */
function renderIndividualPlayerLevels() {
  if (!elIndividualPlayerLevelsList) return;
  const { players } = parsePlayerList(elIndividualPlayers.value);
  const levels = window.__PT_PLAYER_LEVELS__;

  elIndividualPlayerLevelsList.innerHTML = players.map(p => {
    const current = levels[p] ?? 3;
    const options = [1, 2, 3, 4, 5].map(n =>
      `<option value="${n}" ${n === current ? "selected" : ""}>${n} — ${TEAM_LEVEL_LABELS[n]}</option>`
    ).join("");

    return `
      <div class="manual-assign-row">
        <span class="team-name">${escapeHtml(p)}</span>
        <select class="player-level-select" data-player="${escapeHtml(p)}">${options}</select>
      </div>
    `;
  }).join("");
}

/**
 * Remplit la liste déroulante d'import à partir des groupes de joueurs
 * enregistrés par le mode Rotation (localStorage partagé entre les deux pages).
 */
function renderImportGroupOptions() {
  let groups = [];
  try {
    groups = JSON.parse(localStorage.getItem("pb_player_groups") || "[]");
  } catch {
    groups = [];
  }

  const options = groups
    .map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.players.length} joueur${g.players.length > 1 ? "s" : ""})</option>`)
    .join("");

  elImportGroupSelect.innerHTML = `<option value="">— Importer depuis un groupe enregistré —</option>${options}`;
}

/**
 * Affiche la liste éditable "équipe → poule" du mode de répartition manuelle.
 * @param {Array} teams
 * @param {number} numPools
 * @param {Object<number,number>} currentAssignment - id d'équipe → index de poule
 */
function renderManualAssignList(teams, numPools, currentAssignment) {
  elManualAssignList.innerHTML = teams.map(team => {
    const selected = currentAssignment[team.id] ?? 0;
    const options = Array.from({ length: numPools }, (_, i) =>
      `<option value="${i}" ${i === selected ? "selected" : ""}>Poule ${String.fromCharCode(65 + i)}</option>`
    ).join("");

    return `
      <div class="manual-assign-row">
        <span class="team-name">${escapeHtml(team.name)}</span>
        <select class="manual-pool-select" data-team-id="${team.id}">${options}</select>
      </div>
    `;
  }).join("");
}

/**
 * Enveloppe le rendu d'un match réel (score à saisir — pas un repos/bye, pas
 * une affiche déjà résolue par forfait, qui restent déjà des lignes compactes
 * sans rien à replier) dans un conteneur muni d'un bouton masquer/afficher
 * (voir events.js, délégation `.match-hide-btn`). Masquer un match est
 * purement visuel : ça ne touche à aucun score, juste au rendu (`innerHtml`
 * replié en un intitulé compact "Équipe A vs Équipe B"). Le bouton est hors
 * de l'ordre de tabulation (tabindex="-1") : sinon, tabuler entre les champs
 * de score d'un match à l'autre passerait systématiquement par lui.
 * @param {string} hideKey - identifiant stable du match (voir appelants)
 * @param {string} label - intitulé affiché une fois replié
 * @param {string} innerHtml - rendu complet du match (déplié)
 * @param {Set<string>} hiddenMatchKeys
 */
function wrapHideableMatch(hideKey, label, innerHtml, hiddenMatchKeys) {
  label = label.replace(" vs ", " contre ");
  const isHidden = !!hiddenMatchKeys?.has(hideKey);
  return `
    <div class="match-wrapper ${isHidden ? "match-hidden" : ""}">
      <button type="button" class="match-hide-btn" tabindex="-1" data-hide-key="${hideKey}" title="${isHidden ? "Afficher ce match" : "Masquer ce match"}" aria-label="${isHidden ? "Afficher" : "Masquer"} le match ${label}">${isHidden ? ICON_EYE_SVG : ICON_EYE_OFF_SVG}</button>
      <div class="match-hidden-label">${label}</div>
      <div class="match-hideable-content">${innerHtml}</div>
    </div>
  `;
}

/**
 * Carte d'un match (poule ou bracket), même format que le mode Rotation (voir
 * buildMatchCard dans js/app/form-and-render.js et css/app.css) : bandeau
 * "terrain", puis une ligne par équipe avec ses boutons −/+ autour du champ
 * de score. Les attributs data-* des champs sont fournis par l'appelant : ce
 * sont eux que lisent les listeners de saisie (events.js), inchangés.
 * L'état visuel (gagnant, égalité...) est posé par paintScoreCard.
 * @param {Object} o
 * @param {string} o.courtLabel - déjà échappé
 * @param {string} o.nameA
 * @param {string} o.nameB
 * @param {*} o.scoreA
 * @param {*} o.scoreB
 * @param {string} o.inputClass - classes du champ de score
 * @param {string} o.dataAttrs - attributs data-* communs aux deux champs
 * @param {boolean} [o.readonly] - match déjà joué (historique de bracket)
 * @param {boolean} [o.forfeit] - résultat automatique (forfait)
 */
function buildTournamentMatchCard({ courtLabel, nameA, nameB, scoreA, scoreB, inputClass, dataAttrs, readonly = false, forfeit = false }) {
  const row = (name, side, value) => {
    const label = escapeHtml(name);
    const minus = readonly ? "" : `<button type="button" class="score-step" data-delta="-1" tabindex="-1" aria-label="Retirer un point à ${label}">−</button>`;
    const plus = readonly ? "" : `<button type="button" class="score-step" data-delta="1" tabindex="-1" aria-label="Ajouter un point à ${label}">+</button>`;
    return `
      <div class="team-row">
        <div class="team-names"><span>${label}</span><span class="win-tag">Gagnant</span></div>
        <div class="score-ctl${readonly ? " is-readonly" : ""}">
          ${minus}
          <input type="number" class="${inputClass}" min="0" max="99" inputmode="numeric" placeholder="–" ${dataAttrs} data-side="${side}" ${readonly ? "readonly" : ""} value="${value ?? ""}" aria-label="Score de ${label}" />
          ${plus}
        </div>
      </div>`;
  };
  return `
    <article class="match-card"${forfeit ? ' data-forfeit="1"' : ""}${readonly ? ' data-readonly="1"' : ""}>
      <header class="court-strip"><span class="court-name">${courtLabel}</span><span class="court-state"></span></header>
      ${row(nameA, "a", scoreA)}
      <div class="net"><span>contre</span></div>
      ${row(nameB, "b", scoreB)}
      <p class="tie-warning" hidden>Égalité : aucun vainqueur. Une partie de pickleball ne se termine pas à égalité, vérifiez le score.</p>
    </article>`;
}

/**
 * Met à jour l'état visuel d'une carte de match à partir de ses deux champs
 * de score (gagnant, perdant, égalité, état du bandeau). Ne lit que le DOM :
 * appelé après chaque rendu et à chaque saisie (voir navigation.js).
 */
function paintScoreCard(card) {
  if (!card) return;
  const inputs = card.querySelectorAll(".score-input");
  if (inputs.length !== 2) return;
  const a = parseInt(inputs[0].value, 10);
  const b = parseInt(inputs[1].value, 10);
  const full = !isNaN(a) && !isNaN(b);
  const tie = full && a === b;
  const rows = card.querySelectorAll(".team-row");
  rows[0]?.classList.toggle("is-win", full && a > b);
  rows[0]?.classList.toggle("is-lose", full && a < b);
  rows[1]?.classList.toggle("is-win", full && b > a);
  rows[1]?.classList.toggle("is-lose", full && b < a);
  card.classList.toggle("is-done", full && !tie);
  card.classList.toggle("is-tie", tie);
  const state = card.querySelector(".court-state");
  if (state) {
    state.textContent = card.dataset.forfeit
      ? "Forfait"
      : !full ? (card.dataset.readonly ? "Non joué" : "À saisir") : tie ? "Égalité ?" : `Terminé ${Math.max(a, b)}–${Math.min(a, b)}`;
  }
  const tieWarning = card.querySelector(".tie-warning");
  if (tieWarning) tieWarning.hidden = !tie;
}

function paintScoreCards(container) {
  container?.querySelectorAll(".match-card").forEach(paintScoreCard);
}

/**
 * Affiche le calendrier de chaque poule avec les champs de saisie des scores
 * (cartes de match au même format que le mode Rotation, voir
 * buildTournamentMatchCard).
 * @param {Array} pools
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {number[][]} courtAllocation - pour chaque poule, les index de
 *   terrain (0-based) qui lui sont attribués (voir allocateCourtsToPools) ;
 *   les matchs d'une même journée y cyclent dans l'ordre.
 * @param {number[]} hiddenPoolIndices - index de poules repliées manuellement
 *   (voir events.js, bouton `.pool-hide-btn`)
 * @param {Set<string>} hiddenMatchKeys - voir wrapHideableMatch
 */
function renderPools(pools, courtNames = [], courtAllocation = [], hiddenPoolIndices = [], hiddenMatchKeys = new Set()) {
  elPoolsContainer.innerHTML = pools.map((pool, poolIdx) => {
    const isPoolHidden = hiddenPoolIndices.includes(poolIdx);

    const roundsHtml = pool.rounds.map((matches, rIdx) => {
      const matchesHtml = matches.map((match, mIdx) => {
        if (match.bye) {
          return `<div class="bye-row"><span class="eyebrow">Repos</span><span>${escapeHtml(match.team.name)}</span></div>`;
        }

        const score = pool.scores[`${rIdx}-${mIdx}`] || {};
        const globalCourtIdx = poolCourtIndex(courtAllocation, poolIdx, mIdx);
        const matchCardHtml = buildTournamentMatchCard({
          courtLabel: escapeHtml(formatCourtLabel(courtNames, globalCourtIdx)),
          nameA: match.a.name,
          nameB: match.b.name,
          scoreA: score.a,
          scoreB: score.b,
          inputClass: "score-input",
          dataAttrs: `data-pool="${poolIdx}" data-round="${rIdx}" data-match="${mIdx}"`,
          forfeit: !!score.forfeit,
        });
        const hideKey = `pool:${poolIdx}:${rIdx}:${mIdx}`;
        const label = `${escapeHtml(match.a.name)} vs ${escapeHtml(match.b.name)}`;
        return wrapHideableMatch(hideKey, label, matchCardHtml, hiddenMatchKeys);
      }).join("");

      return `
        <div class="pool-round">
          <h4 class="eyebrow">Journée ${rIdx + 1}</h4>
          <div class="matches-list">${matchesHtml}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="pool-card ${isPoolHidden ? "pool-collapsed" : ""}">
        <div class="pool-card-header">
          <h3 class="pool-card-title">${escapeHtml(pool.name)}</h3>
          <button type="button" class="pool-hide-btn" tabindex="-1" data-pool-index="${poolIdx}" title="${isPoolHidden ? "Afficher cette poule" : "Masquer cette poule"}">${isPoolHidden ? ICON_EYE_SVG : ICON_EYE_OFF_SVG}<span>${isPoolHidden ? "Afficher" : "Masquer"}</span></button>
        </div>
        <div class="pool-content">${roundsHtml}</div>
      </div>
    `;
  }).join("");

  paintScoreCards(elPoolsContainer);
}

/**
 * Affiche le tableau de classement de chaque poule, en surlignant les équipes
 * actuellement qualifiées pour la phase finale. Chaque équipe peut y être
 * renommée (✏️) ou déclarée forfait (🚫) — seul endroit où chaque équipe est
 * listée individuellement quel que soit l'avancement du tournoi (voir
 * events.js, section "RENOMMAGE ET FORFAIT D'UNE EQUIPE").
 * @param {Array} pools
 * @param {number} qualifiersPerPool
 * @param {Set<number>} forfeitedTeamIds
 */
function renderPoolStandings(pools, qualifiersPerPool, forfeitedTeamIds = new Set()) {
  elPoolStandingsContainer.innerHTML = pools.map(pool => {
    const standings = computePoolStandings(pool);

    const rows = standings.map((s, i) => {
      const qualified = i < qualifiersPerPool;
      const forfeited = forfeitedTeamIds.has(s.team.id);
      const diffSign = s.diff > 0 ? "+" : "";
      const teamNameEscaped = escapeHtml(s.team.name);
      const diffClass = s.diff > 0 ? "diff-positive" : s.diff < 0 ? "diff-negative" : "";
      return `
        <tr class="${qualified ? "qualified" : ""} ${forfeited ? "forfeited" : ""}">
          <td>${i + 1}</td>
          <td>
            <span class="team-cell">
              <span class="team-name-text">${teamNameEscaped}</span>
              <span class="team-name-actions">
                <button type="button" class="icon-btn team-rename-btn" data-team-id="${s.team.id}" title="Renommer l'équipe" aria-label="Renommer ${teamNameEscaped}">${ICON_EDIT_SVG}</button>
                <button type="button" class="icon-btn team-forfeit-btn ${forfeited ? "active" : ""}" data-team-id="${s.team.id}" data-team-name="${teamNameEscaped}" title="${forfeited ? "Annuler le forfait" : "Déclarer forfait"}" aria-label="${forfeited ? "Annuler le forfait de" : "Déclarer forfait pour"} ${teamNameEscaped}" aria-pressed="${forfeited}">${ICON_FORFEIT_SVG}</button>
              </span>
            </span>
          </td>
          <td>${s.m}</td>
          <td>${s.w}</td>
          <td>${s.l}</td>
          <td>${s.pf}</td>
          <td>${s.pa}</td>
          <td class="${diffClass}">${diffSign}${s.diff}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="pool-standing-card">
        <h3>${escapeHtml(pool.name)}</h3>
        <div class="table-wrap">
          <table class="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Équipe</th>
                <th title="Matchs joués">MJ</th>
                <th title="Victoires">V</th>
                <th title="Défaites">D</th>
                <th title="Points pour">PP</th>
                <th title="Points contre">PC</th>
                <th>+/−</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");

  refreshBracketGenerateButtons(pools, qualifiersPerPool, forfeitedTeamIds);
}

/**
 * Active/désactive les boutons "Générer la phase finale" / "Générer les
 * matchs de classement" selon que les poules sont réellement prêtes, plutôt
 * que de les laisser cliquables en permanence (l'utilisateur ne découvrait
 * l'impossibilité qu'après le clic, via une modale). Appelé à chaque
 * renderPoolStandings, donc à chaque fois que l'état des poules peut avoir
 * changé (génération, score, forfait...).
 */
function refreshBracketGenerateButtons(pools, qualifiersPerPool, forfeitedTeamIds = new Set()) {
  if (!btnGenerateFinalPhase && !btnGenerateConsolationPhase) return;

  if (!pools || !pools.length) {
    if (btnGenerateFinalPhase) {
      btnGenerateFinalPhase.disabled = true;
      btnGenerateFinalPhase.title = "Générez d'abord les poules.";
    }
    if (btnGenerateConsolationPhase) {
      btnGenerateConsolationPhase.disabled = true;
      btnGenerateConsolationPhase.title = "Générez d'abord les poules.";
    }
    return;
  }

  const poolsComplete = pools.every(isPoolComplete);
  const notCompleteTitle = "Tous les matchs de poule doivent être terminés (scores saisis) avant de continuer.";

  if (btnGenerateFinalPhase) {
    const qualified = seedQualifiedTeams(pools, qualifiersPerPool, forfeitedTeamIds);
    const ready = poolsComplete && qualified.length >= 2;
    btnGenerateFinalPhase.disabled = !ready;
    btnGenerateFinalPhase.title = ready ? "" : (!poolsComplete ? notCompleteTitle : "Il faut au moins 2 équipes qualifiées pour lancer une phase finale.");
  }

  if (btnGenerateConsolationPhase) {
    const nonQualified = seedNonQualifiedTeams(pools, qualifiersPerPool, forfeitedTeamIds);
    const ready = poolsComplete && nonQualified.length >= 2;
    btnGenerateConsolationPhase.disabled = !ready;
    btnGenerateConsolationPhase.title = ready ? "" : (!poolsComplete ? notCompleteTitle : "Il faut au moins 2 équipes non qualifiées pour générer une consolante.");
  }
}

/**
 * Affiche les affiches d'un tour/segment de phase finale. Reprend les mêmes
 * classes que les matchs de poule (match-card, court-badge, team-score, team,
 * vs, score-input) pour une apparence cohérente.
 * @param {Array} pairs - paires [a, b] où a/b sont {team} ou {bye:true}
 * @param {Object} scores - scores saisis, indexés par position dans `pairs`
 * @param {boolean} editable - true pour le tour en cours (saisie active),
 *   false pour l'historique (déjà joué, affiché en lecture seule)
 * @param {string|null} segmentId - identifiant du segment (nécessaire si editable)
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {Map<string,number>|null} activeCourtAssignment - pour le tour en
 *   cours uniquement (editable=true) : terrain (0-based) attribué à chaque
 *   match, calculé globalement à travers tous les brackets actifs en même
 *   temps (voir assignCourtsToActiveMatches). Sans elle, replie sur la
 *   position locale dans `pairs` (historique : un terrain "réservé" n'a plus
 *   d'importance pour un match déjà joué).
 * @param {number} phaseIdx - index de la phase (0 = finalPhase, 1 =
 *   consolationPhase...) : les ids de segment ne sont PAS uniques entre deux
 *   phases (buildFinalPhase part toujours de "seg-1"), phaseIdx désambiguïse
 *   la clé de recherche dans activeCourtAssignment.
 * @param {Set<number>|null} forfeitedTeamIds - voir setTeamForfeited
 *   (engine.js) : une affiche impliquant l'une de ces équipes n'a jamais de
 *   score saisi (elle est résolue automatiquement dès qu'elle apparaît, voir
 *   progressFinalPhase), on l'affiche donc comme le repos ci-dessus plutôt
 *   que comme un match à saisir.
 * @param {Set<string>|null} hiddenMatchKeys - voir wrapHideableMatch ; ne
 *   s'applique qu'aux vrais matchs (score à saisir), pas aux affiches de
 *   repos/forfait ci-dessus, déjà des lignes compactes.
 */
function renderBracketPairs(pairs, scores, editable, segmentId, courtNames = [], activeCourtAssignment = null, phaseIdx = 0, forfeitedTeamIds = null, hiddenMatchKeys = null) {
  return pairs.map(([a, b], idx) => {
    if (a.bye && b.bye) return "";

    if (a.bye || b.bye) {
      const realTeam = a.bye ? b.team : a.team;
      return `<div class="bye-row"><span class="eyebrow">Repos</span><span><strong>${escapeHtml(realTeam.name)}</strong> passe au tour suivant sans jouer</span></div>`;
    }

    const aForfeited = forfeitedTeamIds?.has(a.team.id);
    const bForfeited = forfeitedTeamIds?.has(b.team.id);
    if (aForfeited || bForfeited) {
      const winner = aForfeited ? b.team : a.team;
      const loser = aForfeited ? a.team : b.team;
      return `<div class="bye-row is-forfeit"><span class="eyebrow">Forfait</span><span><strong>${escapeHtml(loser.name)}</strong> forfait : <strong>${escapeHtml(winner.name)}</strong> passe sans jouer</span></div>`;
    }

    const score = scores[idx] || {};
    const courtIdx = activeCourtAssignment?.get(`${phaseIdx}-${segmentId}-${idx}`) ?? idx;
    const matchCardHtml = buildTournamentMatchCard({
      courtLabel: escapeHtml(courtNames[courtIdx] || `Terrain ${courtIdx + 1}`),
      nameA: a.team.name,
      nameB: b.team.name,
      scoreA: score.a,
      scoreB: score.b,
      inputClass: "score-input bracket-score-input",
      dataAttrs: editable ? `data-segment="${segmentId}" data-match="${idx}"` : "",
      readonly: !editable,
    });
    const hideKey = `bracket:${phaseIdx}:${segmentId}:${idx}`;
    const label = `${escapeHtml(a.team.name)} vs ${escapeHtml(b.team.name)}`;
    return wrapHideableMatch(hideKey, label, matchCardHtml, hiddenMatchKeys);
  }).join("");
}

/**
 * Affiche l'intégralité d'un bracket à classement complet (phase finale OU
 * matchs de classement des non-qualifiés — même moteur, même affichage) :
 * l'historique des tours déjà joués (en lecture seule) suivi des segments
 * encore en cours (saisie active).
 * @param {Object} phase - finalPhase ou consolationPhase (voir engine.js)
 * @param {HTMLElement} container
 * @param {string[]} courtNames - noms de terrains optionnels (voir #courtNames)
 * @param {Map<string,number>|null} activeCourtAssignment - voir renderBracketPairs
 *   et assignCourtsToActiveMatches (calculée à travers tous les brackets
 *   actifs en même temps, pas seulement celui-ci).
 * @param {number} phaseIdx - voir renderBracketPairs (0 pour finalPhase, 1
 *   pour consolationPhase — doit correspondre à l'ordre passé à
 *   assignCourtsToActiveMatches pour que les clés se retrouvent).
 * @param {Set<number>|null} forfeitedTeamIds - voir renderBracketPairs
 * @param {Set<string>|null} hiddenMatchKeys - voir wrapHideableMatch
 */
function renderBracketPhase(phase, container, courtNames = [], activeCourtAssignment = null, phaseIdx = 0, forfeitedTeamIds = null, hiddenMatchKeys = null) {
  if (!phase) {
    container.innerHTML = "";
    return;
  }

  const historyCards = phase.rounds.map(round => `
    <div class="pool-card is-past">
      <div class="pool-card-header"><h3 class="pool-card-title">${escapeHtml(round.label)}</h3><span class="eyebrow">Joué</span></div>
      <div class="matches-list">${renderBracketPairs(round.pairs, round.scores, false, round.segmentId, courtNames, null, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)}</div>
    </div>
  `);

  const activeCards = phase.segments
    .filter(segment => segment.slots.length > 1)
    .map(segment => `
      <div class="pool-card is-live">
        <div class="pool-card-header"><h3 class="pool-card-title">${escapeHtml(segmentLabel(segment))}</h3><span class="eyebrow round-status is-live">En cours</span></div>
        <div class="matches-list">${renderBracketPairs(segmentPairs(segment), segment.scores, true, segment.id, courtNames, activeCourtAssignment, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)}</div>
      </div>
    `);

  // Tours en cours d'abord : c'est là qu'on saisit ; l'historique suit.
  container.innerHTML = [...activeCards, ...historyCards.reverse()].join("");
  paintScoreCards(container);
}

/**
 * Rend une "feuille" (rankSize===1) de l'arbre du bracket (voir
 * buildBracketTree, engine.js) : juste l'équipe (ou un espace réservé tant
 * qu'elle n'est pas encore déterminée) et la place finale visée.
 */
function renderBracketTreeLeaf(node) {
  const content = node.team
    ? escapeHtml(node.team.name)
    : `<span class="muted">à déterminer</span>`;
  return `
    <div class="bracket-tree-node bracket-tree-leaf">
      <span class="bracket-tree-rank">Place ${node.rankStart}</span>
      <strong class="bracket-tree-leaf-team">${content}</strong>
    </div>
  `;
}

/**
 * Rend un "groupe" de l'arbre du bracket (rankSize>1, peut contenir
 * plusieurs matchs simultanés tant qu'il n'a pas encore été scindé, voir le
 * commentaire de buildBracketTree) : réutilise EXACTEMENT renderBracketPairs
 * (même rendu que la vue liste), pour ne jamais dupliquer/désynchroniser la
 * logique de saisie des scores — seule la disposition change (colonnes).
 */
function renderBracketTreeGroup(node, courtNames, activeCourtAssignment, phaseIdx, forfeitedTeamIds, hiddenMatchKeys) {
  const label = segmentLabel({ rankStart: node.rankStart, rankSize: node.rankSize });

  if (node.status === "pending") {
    return `
      <div class="bracket-tree-node pool-card">
        <h3 class="pool-card-title">${escapeHtml(label)}</h3>
        <p class="hint">À déterminer</p>
      </div>
    `;
  }

  const editable = node.status === "active";
  return `
    <div class="bracket-tree-node pool-card${editable ? " is-live" : ""}">
      <h3 class="pool-card-title">${escapeHtml(label)}</h3>
      <div class="matches-list">${renderBracketPairs(node.pairs, node.scores, editable, node.id, courtNames, activeCourtAssignment, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)}</div>
    </div>
  `;
}

/**
 * Affiche un bracket à classement complet en "vue arbre" : les groupes de
 * places (voir buildBracketTree, engine.js) en colonnes par profondeur,
 * plutôt qu'empilés chronologiquement (vue par défaut, voir
 * renderBracketPhase juste au-dessus) — pratique pour voir d'un coup d'œil
 * la forme générale du tableau. Réutilise renderBracketPairs pour le
 * contenu de chaque groupe : la saisie des scores fonctionne à l'identique
 * (même délégation d'événement sur le conteneur, voir wireBracketScoreInputs
 * dans events.js), seule la disposition change.
 * @param {Object} phase
 * @param {HTMLElement} container
 * @param {string[]} courtNames
 * @param {Map<string,number>|null} activeCourtAssignment
 * @param {number} phaseIdx
 * @param {Set<number>|null} forfeitedTeamIds
 * @param {Set<string>|null} hiddenMatchKeys
 */
function renderBracketTree(phase, container, courtNames = [], activeCourtAssignment = null, phaseIdx = 0, forfeitedTeamIds = null, hiddenMatchKeys = null) {
  const tree = buildBracketTree(phase);
  if (!tree) {
    container.innerHTML = "";
    return;
  }

  const columns = [];
  (function collect(node) {
    if (!node) return;
    if (!columns[node.depth]) columns[node.depth] = [];
    columns[node.depth].push(node);
    if (node.children) { collect(node.children[0]); collect(node.children[1]); }
  })(tree);

  container.innerHTML = `<div class="bracket-tree">${columns.map(nodes => {
    const nodesHtml = [...nodes]
      .sort((a, b) => a.rankStart - b.rankStart)
      .map(node => node.rankSize === 1
        ? renderBracketTreeLeaf(node)
        : renderBracketTreeGroup(node, courtNames, activeCourtAssignment, phaseIdx, forfeitedTeamIds, hiddenMatchKeys)
      ).join("");
    return `<div class="bracket-tree-column">${nodesHtml}</div>`;
  }).join("")}</div>`;
  paintScoreCards(container);
}

/**
 * Réaffiche la phase finale ET les matchs de classement ensemble, avec une
 * attribution de terrain partagée entre les deux (voir
 * assignCourtsToActiveMatches) — sinon chacun recommence sa numérotation à
 * "Terrain 1" indépendamment, alors qu'ils peuvent tourner en même temps et
 * ne peuvent pas physiquement partager les mêmes terrains. L'ordre passé ici
 * (finalPhase = index 0, consolationPhase = index 1) doit correspondre à
 * celui utilisé pour construire `assignment`. Bascule entre vue liste (par
 * défaut) et vue arbre selon tournament.bracketViewMode (voir events.js,
 * bouton #toggleBracketViewBtn) — une seule préférence pour les deux phases.
 */
function renderBothBracketPhases(tournament) {
  const assignment = assignCourtsToActiveMatches(
    [tournament.finalPhase, tournament.consolationPhase],
    tournament.numCourts
  );
  const forfeitedTeamIds = new Set(tournament.forfeitedTeamIds || []);
  const hiddenMatchKeys = new Set(tournament.hiddenMatchKeys || []);
  const renderPhaseFn = tournament.bracketViewMode === "tree" ? renderBracketTree : renderBracketPhase;
  renderPhaseFn(tournament.finalPhase, elFinalPhaseContainer, tournament.courtNames, assignment, 0, forfeitedTeamIds, hiddenMatchKeys);
  renderPhaseFn(tournament.consolationPhase, elConsolationPhaseContainer, tournament.courtNames, assignment, 1, forfeitedTeamIds, hiddenMatchKeys);
}

let activeSectionScrollObserver = null;
let activeScrollTarget = null;

/**
 * Affiche/masque le bouton flottant "Revenir à l'étape en cours"
 * (#scrollToActiveBtn, voir events.js pour le clic) selon que `targetEl` est
 * actuellement visible à l'écran ou non. Un IntersectionObserver (plutôt
 * qu'un listener de scroll) évite tout calcul à chaque pixel défilé ; il est
 * reconstruit à chaque appel car la section "en cours" peut changer d'un
 * appel à l'autre (voir renderTournamentProgress).
 * @param {HTMLElement|null} targetEl
 */
function updateScrollToActiveSection(targetEl) {
  activeScrollTarget = targetEl;
  if (!btnScrollToActive) return;

  if (activeSectionScrollObserver) {
    activeSectionScrollObserver.disconnect();
    activeSectionScrollObserver = null;
  }

  if (!targetEl) {
    btnScrollToActive.hidden = true;
    return;
  }

  activeSectionScrollObserver = new IntersectionObserver(
    ([entry]) => { btnScrollToActive.hidden = !!entry?.isIntersecting; },
    { threshold: 0.15 }
  );
  activeSectionScrollObserver.observe(targetEl);
}

/**
 * Recense tous les matchs SANS score encore complet (poules et brackets
 * confondus), pour la vue "Prochains matchs" (voir renderNextMatches). Un
 * repos (bye) n'est jamais un match à jouer ; une affiche de bracket dont
 * l'une des équipes est forfait ne l'est pas non plus (elle se résout
 * automatiquement, voir progressFinalPhase — aucune saisie possible dessus).
 * @param {Object} tournament
 * @returns {Array<{source:string, teamA:string, teamB:string, court:string|null}>}
 */
function collectNextMatches(tournament) {
  const items = [];
  const courtNames = tournament.courtNames || [];

  (tournament.pools || []).forEach((pool, poolIdx) => {
    pool.rounds.forEach((matches, rIdx) => {
      matches.forEach((match, mIdx) => {
        if (match.bye) return;
        const score = pool.scores[`${rIdx}-${mIdx}`];
        if (score && score.a != null && score.b != null) return;

        const globalCourtIdx = poolCourtIndex(tournament.courtAllocation || [], poolIdx, mIdx);
        items.push({
          source: `${pool.name} · Journée ${rIdx + 1}`,
          teamA: match.a.name,
          teamB: match.b.name,
          court: formatCourtLabel(courtNames, globalCourtIdx)
        });
      });
    });
  });

  const forfeitedTeamIds = new Set(tournament.forfeitedTeamIds || []);
  const assignment = assignCourtsToActiveMatches([tournament.finalPhase, tournament.consolationPhase], tournament.numCourts);

  [
    { phase: tournament.finalPhase, label: "Phase finale", phaseIdx: 0 },
    { phase: tournament.consolationPhase, label: "Consolante", phaseIdx: 1 }
  ].forEach(({ phase, label, phaseIdx }) => {
    if (!phase) return;
    phase.segments
      .filter(segment => segment.slots.length > 1)
      .forEach(segment => {
        segmentPairs(segment).forEach(([a, b], idx) => {
          if (a.bye || b.bye) return;
          if (forfeitedTeamIds.has(a.team.id) || forfeitedTeamIds.has(b.team.id)) return;

          const courtIdx = assignment.get(`${phaseIdx}-${segment.id}-${idx}`);
          items.push({
            source: `${label} · ${segmentLabel(segment)}`,
            teamA: a.team.name,
            teamB: b.team.name,
            court: courtIdx != null ? (courtNames[courtIdx] || `Terrain ${courtIdx + 1}`) : null
          });
        });
      });
  });

  return items;
}

/**
 * Affiche la liste consolidée des prochains matchs à jouer (voir
 * collectNextMatches) : masquée s'il n'y a rien en attente (tournoi pas
 * encore lancé, ou entièrement à jour).
 * @param {Object|null} tournament
 */
function renderNextMatches(tournament) {
  if (!elNextMatchesSection || !elNextMatchesContainer) return;

  const items = tournament?.pools?.length ? collectNextMatches(tournament) : [];

  const elCount = document.getElementById("nextMatchesCount");

  if (!items.length) {
    elNextMatchesSection.hidden = true;
    elNextMatchesContainer.innerHTML = "";
    return;
  }

  if (elCount) elCount.textContent = String(items.length);
  elNextMatchesContainer.innerHTML = items.map(item => `
    <div class="next-match-row">
      <span class="next-match-source">${escapeHtml(item.source)}</span>
      <span class="next-match-teams">${escapeHtml(item.teamA)} <span class="vs-inline">contre</span> ${escapeHtml(item.teamB)}</span>
      ${item.court ? `<span class="next-match-court">${escapeHtml(item.court)}</span>` : ""}
    </div>
  `).join("");

  elNextMatchesSection.hidden = false;
}

/**
 * Bandeau chiffré ("24 équipes · 6 poules · 8 terrains") pour avoir une vue
 * d'ensemble immédiate à grande échelle, sans avoir à tout parcourir. Masqué
 * tant qu'aucune poule n'existe.
 * @param {Object|null} tournament
 */
function renderTournamentSummary(tournament) {
  if (!elTournamentSummary) return;

  if (!tournament?.pools?.length) {
    elTournamentSummary.hidden = true;
    return;
  }

  const teamsCount = tournament.teams?.length || 0;
  const poolsCount = tournament.pools.length;
  const courtsCount = Math.max(1, tournament.numCourts || 1);

  elTournamentSummary.textContent =
    `${teamsCount} équipe${teamsCount > 1 ? "s" : ""} · ${poolsCount} poule${poolsCount > 1 ? "s" : ""} · ${courtsCount} terrain${courtsCount > 1 ? "s" : ""}`;
  elTournamentSummary.hidden = false;
}

/**
 * Affiche une vue d'ensemble de l'avancement du tournoi (Poules → Phase
 * finale → Matchs de classement → Classement final), sur le même principe
 * visuel que le stepper de tour du mode Rotation (classes .session-stepper/
 * .step-item/.step-number/.step-divider, réutilisées telles quelles). Phase
 * finale et matchs de classement sont indépendants l'un de l'autre (on peut
 * lancer l'un sans l'autre, ou les deux en parallèle) : chaque étape calcule
 * son propre statut plutôt que de dépendre strictement de la précédente.
 * Met aussi à jour le bouton flottant "Revenir à l'étape en cours" (voir
 * updateScrollToActiveSection) et le bandeau chiffré (renderTournamentSummary).
 * @param {Object|null} tournament
 */
function renderTournamentProgress(tournament) {
  renderNextMatches(tournament);
  renderTournamentSummary(tournament);
  // Onglets de phase, badges, carte "Tournoi en cours"... (voir navigation.js)
  refreshTournamentNav(tournament);

  if (!elTournamentProgress) return;

  if (!tournament?.pools?.length) {
    elTournamentProgress.hidden = true;
    elTournamentProgress.innerHTML = "";
    updateScrollToActiveSection(null);
    return;
  }

  const poolsDone = tournament.pools.every(isPoolComplete);
  const finalStarted = !!tournament.finalPhase;
  const finalDone = !!tournament.finalPhase?.finalRanking;
  const consolationStarted = !!tournament.consolationPhase;
  const consolationDone = !!tournament.consolationPhase?.finalRanking;
  const rankingReady = finalDone || consolationDone;

  const steps = [
    { label: "Poules", started: true, done: poolsDone },
    { label: "Phase finale", started: finalStarted, done: finalDone },
    { label: "Consolante", started: consolationStarted, done: consolationDone },
    { label: "Classement final", started: rankingReady, done: rankingReady }
  ];

  // Frise compacte : un segment par étape (fait, en cours, à venir).
  elTournamentProgress.innerHTML = steps.map(step => {
    const isActive = step.started && !step.done;
    const state = step.done ? "terminé" : isActive ? "en cours" : "à venir";
    return `
      <div class="t-step${step.done ? " is-done" : ""}${isActive ? " is-current" : ""}" aria-label="${escapeHtml(step.label)} : ${state}">
        <span class="t-step-bar"></span>
        <span class="t-step-label">${escapeHtml(step.label)}</span>
      </div>
    `;
  }).join("");

  elTournamentProgress.hidden = false;

  let scrollTarget = null;
  if (!poolsDone) scrollTarget = elPoolsSection;
  else if (finalStarted && !finalDone) scrollTarget = elFinalPhaseContainer;
  else if (consolationStarted && !consolationDone) scrollTarget = elConsolationPhaseContainer;
  else if (rankingReady) scrollTarget = elFinalRankingSection;
  updateScrollToActiveSection(scrollTarget);
}

/**
 * Podium visuel des 3 premiers du classement final (mêmes classes que le
 * podium du mode Rotation : podium-container/podium-step/gold/silver/bronze).
 */
function renderFinalPodium(combined, statsByTeamId) {
  if (combined.length < 3) return "";

  const statLine = r => {
    const s = statsByTeamId.get(r.team.id) || { w: 0, pf: 0, pa: 0 };
    const diff = s.pf - s.pa;
    return `${s.w}V · ${diff > 0 ? "+" : ""}${diff}`;
  };

  // Même podium que le mode Rotation (voir renderPodium, js/app/stats-visualizations.js).
  const step = (r, cls, place) => `
    <div class="pod ${cls}">
      <span class="pod-name pod-name-team">${escapeHtml(r.team.name)}</span>
      <span class="pod-sub">${statLine(r)}</span>
      <div class="pod-bar" aria-label="${place}e place">${place}</div>
    </div>`;
  const [p1, p2, p3] = combined;
  return `<div class="podium">${step(p2, "p2", 2)}${step(p1, "p1", 1)}${step(p3, "p3", 3)}</div>`;
}

/**
 * Retrouve une équipe par id n'importe où dans le tournoi (liste d'équipes,
 * ou à défaut poules). Sert à retrouver le nom d'une équipe forfait AVANT le
 * tirage d'un bracket (voir renderFinalRanking) : elle n'apparaît alors dans
 * AUCUN classement de bracket calculé (elle n'a jamais été tirée au sort,
 * voir seedTeamsByPoolRange), il faut donc aller chercher son nom ailleurs.
 */
function findTeamById(tournament, teamId) {
  const inTeams = (tournament.teams || []).find(t => t.id === teamId);
  if (inTeams) return inTeams;
  for (const pool of tournament.pools || []) {
    const found = pool.teams.find(t => t.id === teamId);
    if (found) return found;
  }
  return null;
}

/**
 * Affiche (ou masque) le classement final complet du tournoi, en fusionnant
 * la phase finale (places 1..N) et les matchs de classement des non-qualifiés
 * (places N+1..) — ce qui est déjà résolu s'affiche au fur et à mesure, même
 * si l'autre bracket n'est pas encore terminé (ou pas encore lancé). Podium
 * pour le top 3, tableau avec les statistiques agrégées sur tout le tournoi
 * (poules + phase finale + matchs de classement).
 *
 * Une équipe déclarée forfait AVANT le tirage d'un bracket (encore en phase
 * de poules) n'est tirée au sort dans AUCUN des deux brackets — sa place y
 * est prise par la suivante de sa poule (voir seedTeamsByPoolRange) — donc
 * absente des classements ci-dessus alors que le principe de ce mode est que
 * TOUTE équipe inscrite obtienne une place : elle est ajoutée en fin de
 * liste, avec les places restantes (dans l'ordre où les forfaits ont été
 * déclarés), visuellement distinguée comme forfait plutôt que classée sur un
 * vrai parcours.
 */
function renderFinalRanking(tournament) {
  const fromFinalPhase = tournament?.finalPhase?.finalRanking || [];
  const fromConsolationPhase = tournament?.consolationPhase?.finalRanking || [];
  const combined = [...fromFinalPhase, ...fromConsolationPhase].sort((a, b) => a.rank - b.rank);

  const rankedTeamIds = new Set(combined.map(r => r.team.id));
  const forfeitedBeforeBracket = (tournament.forfeitedTeamIds || [])
    .filter(id => !rankedTeamIds.has(id))
    .map(id => findTeamById(tournament, id))
    .filter(Boolean);

  if (!combined.length && !forfeitedBeforeBracket.length) {
    elFinalRankingSection.hidden = true;
    return;
  }

  const statsByTeamId = computeOverallTeamStats(tournament);
  const zeroStats = { m: 0, w: 0, l: 0, pf: 0, pa: 0 };

  const rows = combined.map(r => {
    const s = statsByTeamId.get(r.team.id) || zeroStats;
    const diff = s.pf - s.pa;
    const diffClass = diff > 0 ? "diff-positive" : diff < 0 ? "diff-negative" : "";
    const diffSign = diff > 0 ? "+" : "";
    return `
      <tr>
        <td>${r.rank}</td>
        <td>${escapeHtml(r.team.name)}</td>
        <td>${s.m}</td>
        <td>${s.w}</td>
        <td>${s.l}</td>
        <td>${s.pf}</td>
        <td>${s.pa}</td>
        <td class="${diffClass}">${diffSign}${diff}</td>
      </tr>
    `;
  }).join("") + forfeitedBeforeBracket.map((team, i) => {
    const s = statsByTeamId.get(team.id) || zeroStats;
    const diff = s.pf - s.pa;
    const diffSign = diff > 0 ? "+" : "";
    return `
      <tr class="forfeited">
        <td>${combined.length + i + 1}</td>
        <td>${escapeHtml(team.name)} <span class="forfeit-badge-inline">Forfait</span></td>
        <td>${s.m}</td>
        <td>${s.w}</td>
        <td>${s.l}</td>
        <td>${s.pf}</td>
        <td>${s.pa}</td>
        <td>${diffSign}${diff}</td>
      </tr>
    `;
  }).join("");

  elFinalRankingContainer.innerHTML = `
    ${renderFinalPodium(combined, statsByTeamId)}
    <div class="table-wrap">
      <table class="ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Équipe</th>
            <th title="Matchs joués">MJ</th>
            <th title="Victoires">V</th>
            <th title="Défaites">D</th>
            <th title="Points pour">PP</th>
            <th title="Points contre">PC</th>
            <th>+/−</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="tiebreak-note">Le rang vient du parcours en phase finale et en consolante (qui a battu qui), pas des statistiques du tableau, qui sont seulement indicatives.</p>
    ${forfeitedBeforeBracket.length ? `
      <p class="tiebreak-note">${forfeitedBeforeBracket.length > 1 ? "Les équipes forfait" : "L'équipe forfait"} avant le tirage de la phase finale ${forfeitedBeforeBracket.length > 1 ? "ont été remplacées" : "a été remplacée"} par l'équipe suivante de sa poule, d'où les dernières places.</p>
    ` : ""}
  `;
  elFinalRankingSection.hidden = false;
}
