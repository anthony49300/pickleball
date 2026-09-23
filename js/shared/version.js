"use strict";

// =============================================================================
// VERSION DE L'APPLICATION
// =============================================================================
// Affichée dans la modale "À propos" (voir js/shared/modal.js, bouton
// #aboutBtn du pied de page). Pas de build step dans ce projet pour la
// dériver automatiquement de package.json (l'app doit rester un simple
// ensemble de fichiers statiques, ouvrables sans rien compiler) : cette
// constante est donc à incrémenter manuellement à chaque lot de travail
// mergé, en cohérence avec le champ "version" de package.json.
const APP_VERSION = "1.1.0";
