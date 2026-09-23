"use strict";

// =============================================================================
// MODALE GENERIQUE (remplace confirm()/alert()/prompt() natifs du navigateur)
// =============================================================================
// Module partagé entre toutes les pages du site (index.html, tournoi.html...) :
// entièrement autonome (ses propres références DOM ci-dessous), à charger sur
// toute page qui inclut le balisage de la modale (voir index.html, section
// "MODALE GENERIQUE") et souhaite utiliser confirmModal/alertModal/etc.

const elModalOverlay = document.getElementById("modalOverlay");
const elModalIcon = document.getElementById("modalIcon");
const elModalTitle = document.getElementById("modalTitle");
const elModalMessage = document.getElementById("modalMessage");
const elModalCopyArea = document.getElementById("modalCopyArea");
const elModalCopyInput = document.getElementById("modalCopyInput");
const elModalImageArea = document.getElementById("modalImageArea");
const elModalImagePreview = document.getElementById("modalImagePreview");
const btnModalCancel = document.getElementById("modalCancelBtn");
const btnModalDownload = document.getElementById("modalDownloadBtn");
const btnModalShare = document.getElementById("modalShareBtn");
const btnModalConfirm = document.getElementById("modalConfirmBtn");
const btnAbout = document.getElementById("aboutBtn");

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

  const focusables = [btnModalCancel, elModalCopyInput, btnModalDownload, btnModalShare, btnModalConfirm].filter(
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
 * Le partage natif d'un FICHIER (pas juste du texte/d'une URL) est-il possible
 * sur cet appareil/navigateur ? Test avec un fichier factice minuscule (aucun
 * coût réel, rien n'est affiché ni envoyé) : navigator.share existe sur pas
 * mal de navigateurs, mais le partage de fichiers (files: [...]) est une
 * capacité distincte, pas systématiquement supportée (essentiellement mobile
 * à ce jour — peu ou pas sur desktop).
 */
function canShareFiles() {
  try {
    return !!(navigator.canShare && navigator.share &&
      navigator.canShare({ files: [new File([""], "test.png", { type: "image/png" })] }));
  } catch {
    return false;
  }
}

/**
 * Ouvre la modale générique et renvoie une promesse résolue à la fermeture :
 * `true` si l'utilisateur a cliqué sur le bouton de confirmation, `false` sinon
 * (annulation, clic en dehors, Échap).
 */
function openModal({ icon = "⚠️", title, message, confirmText = "Confirmer", cancelText = "Annuler", danger = false, showCancel = true, copyText = null, imageSrc = null, downloadFilename = null, shareText = null }) {
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

  // Le partage direct (vers WhatsApp et consorts) n'a de sens que pour une
  // image, et seulement là où le partage de fichiers est réellement possible
  // (voir canShareFiles) : pas de bouton mort qui échouerait à tous les clics.
  if (imageSrc != null && downloadFilename && canShareFiles()) {
    btnModalShare.hidden = false;
    btnModalShare.dataset.filename = downloadFilename;
    btnModalShare.dataset.shareText = shareText || "";
  } else {
    btnModalShare.hidden = true;
    btnModalShare.dataset.filename = "";
    btnModalShare.dataset.shareText = "";
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
 * Bouton "À propos" du pied de page (#aboutBtn, discret exprès — voir
 * .footer-link dans styles.css) : affiche juste le numéro de version
 * (APP_VERSION, voir js/shared/version.js), sans rien d'autre à construire —
 * réutilise alertModal() telle quelle.
 */
if (btnAbout) {
  btnAbout.addEventListener("click", () => {
    alertModal(
      `JF Pickleball — version ${APP_VERSION}\nModes Rotation & Tournoi.`,
      { title: "À propos", icon: "🥒" }
    );
  });
}

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

/**
 * Bouton "Partager" : ouvre le sélecteur de partage natif du téléphone
 * (WhatsApp, Messages, Mail...) avec l'image en pièce jointe directement —
 * plus rapide que "Télécharger" puis rouvrir l'app cible depuis la galerie.
 * N'est affiché que là où le partage de fichiers est supporté (voir
 * canShareFiles dans openModal) : pas de tentative sur un navigateur qui ne
 * le permet pas.
 */
btnModalShare.addEventListener("click", async () => {
  const src = elModalImagePreview.src;
  if (!src) return;

  try {
    // data: URI -> Blob -> File (navigator.share veut un vrai File, pas une chaîne).
    const blob = await (await fetch(src)).blob();
    const file = new File([blob], btnModalShare.dataset.filename || "image.png", { type: blob.type || "image/png" });

    if (!navigator.canShare({ files: [file] })) {
      // PAS alertModal() ici : la fenêtre d'export est encore ouverte, et la
      // modale générique n'a qu'une seule instance partagée (un seul
      // elModalOverlay/modalResolve) — en ouvrir une 2e par-dessus détournerait
      // la promesse de imagePreviewModal(), qui ne se résoudrait alors plus
      // jamais (le bouton d'export resterait bloqué sur "Génération..."). On
      // remplace juste le message de la modale déjà ouverte à la place.
      elModalMessage.textContent = "Le partage direct n'est pas possible pour ce fichier sur cet appareil/navigateur : utilisez \"Télécharger\" puis partagez-le depuis votre galerie.";
      return;
    }

    await navigator.share({ files: [file], text: btnModalShare.dataset.shareText || "" });
  } catch (err) {
    // AbortError : l'utilisateur a simplement annulé le partage (fermé le
    // sélecteur natif) — pas une vraie erreur, rien à signaler.
    if (err?.name === "AbortError") return;
    console.error(err);
  }
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
    downloadFilename: opts.downloadFilename ?? null,
    shareText: opts.shareText ?? null
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
