"use strict";

// =============================================================================
// NAVIGATION (mode Rotation) : AFFICHAGE TOUR PAR TOUR
// =============================================================================
// Les écrans, les onglets et les menus sont gérés par js/shared/shell.js
// (commun avec la page Tournoi). Ici : ce qui est propre à l'écran Jouer du
// mode Rotation.
//
// Écran Jouer : tous les tours sont présents dans le DOM (voir render() dans
// form-and-render.js) mais un seul est affiché. Changer de tour ne fait que
// basculer leur attribut hidden : aucune saisie en cours n'est perdue.

const elPlayTabBadge = document.getElementById("playTabBadge");
const elPlayEmpty = document.getElementById("playEmpty");
const elPlayView = document.getElementById("playView");
const elRoundStatus = document.getElementById("roundStatus");
const elRoundNum = document.getElementById("roundNum");
const btnPrevRound = document.getElementById("prevRoundBtn");
const btnNextRound = document.getElementById("nextRoundBtn");
const btnNextStep = document.getElementById("nextStepBtn");
const elNextStepNote = document.getElementById("nextStepNote");
const elCurrentSessionCard = document.getElementById("currentSessionCard");
const elCurrentSessionProgress = document.getElementById("currentSessionProgress");
const elCurrentSessionMeta = document.getElementById("currentSessionMeta");

let viewedRound = 0;

function showRound(idx) {
  const rounds = window.__PB_LAST_RESULT__?.rounds;
  if (!rounds || !rounds.length) {
    refreshPlayView();
    return;
  }
  const changed = idx !== viewedRound;
  viewedRound = Math.min(rounds.length - 1, Math.max(0, idx));
  elSchedule.querySelectorAll(".round").forEach(el => {
    el.hidden = parseInt(el.dataset.round, 10) !== viewedRound;
  });
  refreshPlayView();
  if (changed && currentScreen === "jouer" && elPlayView && elPlayView.getBoundingClientRect().top < 0) {
    window.scrollTo(0, 0);
  }
}

/**
 * Remet à jour tout ce qui dépend des scores saisis sur l'écran Jouer (frise
 * des tours, titre, bouton d'action, badge de l'onglet) et la carte "Session
 * en cours" de l'historique. Appelé après chaque saisie de score.
 */
function refreshPlayView() {
  const result = window.__PB_LAST_RESULT__;
  const rounds = result?.rounds;
  const hasSession = !!(rounds && rounds.length);

  if (elPlayEmpty) elPlayEmpty.hidden = hasSession;
  if (elPlayView) elPlayView.hidden = !hasSession;
  refreshCurrentSessionCard();

  if (!hasSession) {
    if (elPlayTabBadge) elPlayTabBadge.hidden = true;
    return;
  }

  if (viewedRound >= rounds.length) viewedRound = rounds.length - 1;
  const r = viewedRound;
  const total = rounds.length;
  const activeIdx = updateSessionStepper(rounds, r);
  const complete = isRoundComplete(rounds, r);
  const allComplete = rounds.every((_, i) => isRoundComplete(rounds, i));

  elRoundNum.innerHTML = `Tour ${r + 1}<span> / ${total}</span>`;
  elRoundStatus.textContent = complete ? "Scores saisis" : r === activeIdx ? "En cours" : r > activeIdx ? "À venir" : "Scores incomplets";
  elRoundStatus.classList.toggle("is-live", !complete && r === activeIdx);
  btnPrevRound.disabled = r === 0;
  btnNextRound.disabled = r === total - 1;

  if (elPlayTabBadge) {
    elPlayTabBadge.hidden = allComplete;
    elPlayTabBadge.textContent = `T${activeIdx + 1}`;
  }

  // Bouton d'action principal : passer au tour suivant (ou au classement à la
  // fin). Il reste utilisable même sans scores, pour qui ne les note pas ;
  // il passe simplement en style secondaire et la note indique ce qui manque.
  const missing = rounds[r].filter((match, mIdx) => {
    const sc = readMatchScore(window.__PB_SCORES__, r, mIdx, match);
    return !sc || sc["1"] == null || sc["2"] == null;
  }).length;
  const isLast = r === total - 1;
  btnNextStep.textContent = isLast ? "Voir le classement" : `Tour ${r + 2} →`;
  btnNextStep.classList.toggle("secondary", !complete);
  if (elNextStepNote) {
    elNextStepNote.hidden = complete;
    elNextStepNote.textContent = `${missing} score${missing > 1 ? "s" : ""} à saisir sur ce tour`;
  }
}

/**
 * Bas de l'écran Préparer : avec des scores déjà saisis, « Générer » met à jour
 * la session en cours (tours notés figés) et « Nouvelle session » apparaît.
 */
function refreshPrepareCta() {
  const hasScores = Object.keys(window.__PB_SCORES__ || {}).length > 0;
  if (btnNewSession) btnNewSession.hidden = !hasScores;
  if (btnGenerate) btnGenerate.textContent = hasScores ? "Mettre à jour les matchs" : "Générer les matchs";
}

function refreshCurrentSessionCard() {
  refreshPrepareCta();
  if (!elCurrentSessionCard) return;
  const rounds = window.__PB_LAST_RESULT__?.rounds;
  if (!rounds || !rounds.length) {
    elCurrentSessionCard.hidden = true;
    return;
  }
  const done = rounds.filter((_, i) => isRoundComplete(rounds, i)).length;
  const players = parsePlayers(elPlayers.value).length;
  elCurrentSessionCard.hidden = false;
  elCurrentSessionProgress.style.width = `${Math.round((100 * done) / rounds.length)}%`;
  elCurrentSessionProgress.parentElement.setAttribute("aria-label", `${done} tours complets sur ${rounds.length}`);
  elCurrentSessionMeta.innerHTML = `<span><b>${done}/${rounds.length}</b> tours complets</span><span><b>${players}</b> joueurs</span>`;
}

if (btnPrevRound) btnPrevRound.addEventListener("click", () => showRound(viewedRound - 1));
if (btnNextRound) btnNextRound.addEventListener("click", () => showRound(viewedRound + 1));
if (elSessionStepper) {
  elSessionStepper.addEventListener("click", (e) => {
    const dot = e.target.closest(".dot");
    if (dot) showRound(parseInt(dot.dataset.round, 10));
  });
}
if (btnNextStep) {
  btnNextStep.addEventListener("click", () => {
    const total = window.__PB_LAST_RESULT__?.rounds?.length || 0;
    if (viewedRound >= total - 1) showScreen("classement");
    else {
      showRound(viewedRound + 1);
      window.scrollTo(0, 0);
    }
  });
}

/**
 * Premier affichage, appelé par init.js une fois la session restaurée : écran
 * de l'URL (#jouer...) s'il y en a un, sinon Jouer si une session est en
 * cours, Préparer sinon.
 */
function initNavigation() {
  syncSliderOutputs();
  showScreen(screenFromHash() || (window.__PB_LAST_RESULT__ ? "jouer" : "preparer"), { scroll: false });
  refreshPlayView();
}
