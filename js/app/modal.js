"use strict";

// =============================================================================
// MODALE GENERIQUE (remplace confirm()/alert()/prompt() natifs du navigateur)
// =============================================================================

let modalResolve = null;
let modalLastFocusedEl = null;

/**
 * Ferme la modale et résout la promesse en attente avec le résultat fourni.
 */
function closeModal(result) {
  if (elModalOverlay.hidden) return;
  elModalOverlay.hidden = true;
  document.removeEventListener("keydown", onModalKeydown);

  const resolve = modalResolve;
  modalResolve = null;
  if (resolve) resolve(result);

  if (modalLastFocusedEl && typeof modalLastFocusedEl.focus === "function") {
    modalLastFocusedEl.focus();
  }
}

/**
 * Gère Échap (annule) et un piège de focus basique (Tab reste dans la modale).
 */
function onModalKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal(false);
    return;
  }
  if (e.key !== "Tab") return;

  const focusables = [btnModalCancel, elModalCopyInput, btnModalDownload, btnModalConfirm].filter(
    el => el && !el.hidden && el.offsetParent !== null
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Ouvre la modale générique et renvoie une promesse résolue à la fermeture :
 * `true` si l'utilisateur a cliqué sur le bouton de confirmation, `false` sinon
 * (annulation, clic en dehors, Échap).
 */
function openModal({ icon = "⚠️", title, message, confirmText = "Confirmer", cancelText = "Annuler", danger = false, showCancel = true, copyText = null, imageSrc = null, downloadFilename = null }) {
  modalLastFocusedEl = document.activeElement;

  elModalIcon.textContent = icon;
  elModalTitle.textContent = title;
  elModalMessage.textContent = message;

  if (copyText != null) {
    elModalCopyArea.hidden = false;
    elModalCopyInput.value = copyText;
  } else {
    elModalCopyArea.hidden = true;
    elModalCopyInput.value = "";
  }

  if (imageSrc != null) {
    elModalImageArea.hidden = false;
    elModalImagePreview.src = imageSrc;
  } else {
    elModalImageArea.hidden = true;
    elModalImagePreview.src = "";
  }

  if (downloadFilename) {
    btnModalDownload.hidden = false;
    btnModalDownload.dataset.filename = downloadFilename;
  } else {
    btnModalDownload.hidden = true;
    btnModalDownload.dataset.filename = "";
  }

  btnModalConfirm.textContent = confirmText;
  btnModalConfirm.className = danger ? "danger" : "";
  btnModalCancel.hidden = !showCancel;
  btnModalCancel.textContent = cancelText;

  elModalOverlay.hidden = false;
  document.addEventListener("keydown", onModalKeydown);

  if (copyText != null) {
    elModalCopyInput.focus();
    elModalCopyInput.select();
  } else {
    (showCancel ? btnModalCancel : btnModalConfirm).focus();
  }

  return new Promise(resolve => { modalResolve = resolve; });
}

btnModalConfirm.addEventListener("click", () => closeModal(true));
btnModalCancel.addEventListener("click", () => closeModal(false));
elModalOverlay.addEventListener("click", (e) => {
  if (e.target === elModalOverlay) closeModal(false);
});

/**
 * Bouton "Télécharger" de la modale image : le long-press/clic-droit sur l'image ne
 * suffit pas partout (notamment dans la WebView Android, qui n'active pas nativement
 * le menu contextuel "Enregistrer l'image" sans configuration native supplémentaire).
 * On propose donc aussi un vrai <a download> déclenché explicitement au clic.
 */
btnModalDownload.addEventListener("click", () => {
  const src = elModalImagePreview.src;
  if (!src) return;

  const link = document.createElement("a");
  link.href = src;
  link.download = btnModalDownload.dataset.filename || "image.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/** Remplace confirm() : question à 2 issues (confirmer / annuler), destructif par défaut. */
function confirmModal(message, opts = {}) {
  return openModal({
    icon: opts.icon ?? "⚠️",
    title: opts.title ?? "Confirmation requise",
    message,
    confirmText: opts.confirmText ?? "Confirmer",
    cancelText: opts.cancelText ?? "Annuler",
    danger: opts.danger ?? true,
    showCancel: true
  });
}

/** Remplace alert() : information à acquitter, un seul bouton "OK". */
function alertModal(message, opts = {}) {
  return openModal({
    icon: opts.icon ?? "ℹ️",
    title: opts.title ?? "Information",
    message,
    confirmText: opts.confirmText ?? "OK",
    showCancel: false
  });
}

/** Remplace le prompt() utilisé en secours quand navigator.clipboard échoue. */
function copyFallbackModal(text, opts = {}) {
  return openModal({
    icon: opts.icon ?? "🔗",
    title: opts.title ?? "Copier manuellement",
    message: opts.message ?? "La copie automatique a échoué. Le texte est sélectionné ci-dessous : copiez-le avec Ctrl+C (ou Cmd+C).",
    confirmText: "Fermer",
    showCancel: false,
    copyText: text
  });
}

/**
 * Affiche une image (data URI) dans la modale au lieu de tenter un téléchargement
 * automatique via <a download> — cette technique ne déclenche généralement AUCUNE
 * sauvegarde dans une WebView Android brute (pas de gestionnaire de téléchargement
 * natif comme dans un vrai navigateur). Un appui long sur l'image affichée déclenche
 * en revanche le menu natif Android "Enregistrer l'image", qui fonctionne partout,
 * y compris dans l'app installée, sans plugin ni permission particulière.
 */
function imagePreviewModal(dataUri, opts = {}) {
  return openModal({
    icon: opts.icon ?? "📷",
    title: opts.title ?? "Image générée",
    message: opts.message ?? "Appuyez sur \"Télécharger\" pour l'enregistrer.",
    confirmText: "Fermer",
    showCancel: false,
    imageSrc: dataUri,
    downloadFilename: opts.downloadFilename ?? null
  });
}

/**
 * Copie un texte dans le presse-papiers en essayant plusieurs méthodes dans l'ordre :
 * 1. navigator.clipboard.writeText (moderne, mais souvent bloqué par permission dans
 *    une WebView Android : DOMException "Write permission denied" / "Document is not focused")
 * 2. document.execCommand("copy") (dépréciée, mais historiquement plus fiable dans les
 *    WebView embarquées que l'API Clipboard moderne)
 * Renvoie true si l'une des deux méthodes a réussi, false sinon (l'appelant doit alors
 * proposer une copie manuelle, voir copyFallbackModal).
 */
async function copyTextRobust(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // On retente avec la méthode historique execCommand("copy"), via un textarea
    // temporaire hors-écran (nécessaire car execCommand copie la sélection courante).
    try {
      const tempEl = document.createElement("textarea");
      tempEl.value = text;
      tempEl.setAttribute("readonly", "");
      tempEl.style.position = "fixed";
      tempEl.style.top = "0";
      tempEl.style.left = "-9999px";
      document.body.appendChild(tempEl);
      tempEl.focus();
      tempEl.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(tempEl);
      return ok;
    } catch {
      return false;
    }
  }
}


