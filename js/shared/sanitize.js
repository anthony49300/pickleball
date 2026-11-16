"use strict";

// =============================================================================
// VALIDATION DES DONNÉES IMPORTÉES (liens de partage, sauvegardes, historique)
// =============================================================================
// Tout état qui ne vient pas d'une saisie dans la page elle-même est considéré
// comme non fiable : lien de partage (?d=...), sauvegarde automatique et
// historique relus depuis localStorage (une sauvegarde déjà empoisonnée par un
// ancien lien piégé est ainsi nettoyée au chargement suivant), groupes de
// joueurs. Les fonctions ci-dessous en renvoient une COPIE propre :
// - scores : entiers de 0 à 99, ou null (tout le reste devient null) ;
// - identifiants : /^[\w:.|-]{1,64}$/, sinon l'élément est écarté ou
//   l'identifiant régénéré ;
// - textes libres (noms, terrains, graine) : restent des chaînes, tronquées à
//   une longueur raisonnable (ils sont échappés au moment de l'affichage) ;
// - nombres (terrains, tours, poules, curseurs, niveaux, présences) : ramenés
//   dans les mêmes bornes que les <input> correspondants de la page ;
// - clés inconnues : retirées.
// Un état structurellement invalide (pas un objet, tournoi incohérent...) lève
// une exception : à l'appelant de l'ignorer (voir init.js / state.js).
//
// Fonctions pures, sans accès au DOM : testées dans Node (voir
// tests/security.test.js). Chargé par les deux pages avant leurs scripts.

/** Bornes communes, alignées sur les attributs min/max des pages HTML. */
const SANITIZE_LIMITS = {
  nameLength: 60,          // nom de joueur, de terrain, graine
  teamNameLength: 130,     // "Joueur A & Joueur B" (ou nom renommé)
  maxPlayers: 60,          // mode Rotation
  maxTeams: 64,            // mode Tournoi
  maxIndividualPlayers: 128,
  maxCourtNames: 16,
  maxHistory: 20,
  maxGroups: 100,
  scoreMax: 99
};

const SAFE_ID_RE = /^[\w:.|-]{1,64}$/;

// Longueur maximale du paramètre ?d= d'un lien de partage (texte compressé) :
// très au-delà d'un vrai tournoi de 64 équipes, mais borne le travail de
// décompression et d'analyse d'un lien démesuré.
const MAX_SHARED_DATA_LENGTH = 200000;

/** Un identifiant sûr (nombre ou chaîne) au format attendu ? */
function isSafeId(id) {
  if (typeof id === "number") return Number.isFinite(id) && SAFE_ID_RE.test(String(id));
  return typeof id === "string" && SAFE_ID_RE.test(id);
}

/** Objet "simple" (ni tableau, ni null) ? */
function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Dictionnaire sans prototype : une clé "__proto__" ou "constructor" y est une clé comme une autre. */
function nullProtoDict() {
  return Object.create(null);
}

/**
 * Score de match : entier de 0 à 99, ou null pour toute autre valeur (texte,
 * objet, NaN, négatif...). Un nombre écrit en texte ("11") est accepté.
 */
function toScore(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(SANITIZE_LIMITS.scoreMax, Math.max(0, Math.round(n)));
}

/** Valeur à placer dans l'attribut value="" d'un champ de score : un entier, ou rien. */
function scoreInputValue(v) {
  const n = toScore(v);
  return n === null ? "" : String(n);
}

/** Tronque une chaîne ; toute autre valeur devient `fallback`. */
function cleanString(v, maxLength, fallback = undefined) {
  if (typeof v !== "string") return fallback;
  return v.length > maxLength ? v.slice(0, maxLength) : v;
}

/**
 * Nombre ramené dans [min, max] (arrondi si `integer`). Une valeur valide est
 * renvoyée telle quelle (même type : les champs de formulaire sont sauvegardés
 * en texte), une valeur hors bornes est ramenée à la borne et signalée dans
 * `report.clamped`. Une valeur non numérique renvoie undefined (champ ignoré :
 * la page garde sa valeur par défaut).
 */
function cleanNumber(v, min, max, integer, report) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return undefined;
  if (typeof v !== "number" && typeof v !== "string") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  let out = integer ? Math.round(n) : n;
  if (out < min || out > max) {
    out = Math.min(max, Math.max(min, out));
    if (report) report.clamped = true;
  }
  if (out === n) return v;
  return typeof v === "string" ? String(out) : out;
}

/** Entier dans [min, max] ou undefined (pour les données internes, sans signalement). */
function cleanInt(v, min, max) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return undefined;
  return v;
}

/**
 * Lecture d'un champ numérique du formulaire au moment de générer : entier
 * ramené dans [min, max] (un <input type="number"> n'impose pas son max quand
 * la valeur est posée par script ou saisie au clavier).
 * @returns {{value: number, clamped: boolean}}
 */
function clampFormInt(raw, min, max, fallback) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return { value: fallback, clamped: false };
  const value = Math.min(max, Math.max(min, n));
  return { value, clamped: value !== n };
}

function cleanBool(v) {
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Découpe une liste de noms saisie librement (une par ligne, ou séparés par
 * des virgules), comme parsePlayers dans js/app/form-and-render.js. Si elle
 * respecte les limites, le texte d'origine est conservé tel quel ; sinon il
 * est reconstruit (un nom par ligne), tronqué, et signalé dans `report`.
 */
function cleanNameList(text, maxNames, maxNameLength, report, separators = /[\n,]/) {
  if (typeof text !== "string") return undefined;
  const entries = text.split(separators).map(s => s.trim()).filter(Boolean);
  const tooMany = entries.length > maxNames;
  const tooLong = entries.some(s => s.length > maxNameLength);
  if (!tooMany && !tooLong && text.length <= maxNames * (maxNameLength + 2)) return text;
  if (report) report.clamped = true;
  return entries.slice(0, maxNames).map(s => s.slice(0, maxNameLength)).join("\n");
}

/** Clé de nom (joueur) acceptable dans les tables niveaux/présences ? */
function isNameKey(k) {
  return typeof k === "string" && k.trim().length > 0 && k.length <= SANITIZE_LIMITS.nameLength;
}

/** Table nom → niveau (1-5), sans prototype. */
function cleanLevelsByName(raw, maxEntries = 500) {
  const out = nullProtoDict();
  if (!isPlainObject(raw)) return out;
  let count = 0;
  for (const k of Object.keys(raw)) {
    if (count >= maxEntries) break;
    const lvl = cleanInt(raw[k], 1, 5);
    if (isNameKey(k) && lvl !== undefined) { out[k] = lvl; count++; }
  }
  return out;
}

// -----------------------------------------------------------------------------
// MODE ROTATION
// -----------------------------------------------------------------------------

/** Bornes des champs du formulaire Rotation (voir index.html). */
const ROTATION_FIELDS = {
  c: [1, 10, true],
  r: [1, 50, true],
  wt: [0, 20, false],
  wo: [0, 20, false],
  wp: [0, 10, false],
  wbal: [0, 20, false],
  bw: [10, 500, true],
  pk: [4, 30, true]
};

// Clés de score : "tour::joueurs" (voir matchScoreKey, algorithm.js) ou
// l'ancienne clé positionnelle "tour-match" (voir readMatchScore).
const ROTATION_SCORE_KEY_RE = /^(?:\d{1,2}-\d{1,2}|\d{1,2}::[^]{1,300})$/;

/**
 * Nettoie un état du mode Rotation (voir getCurrentState dans
 * js/app/state-and-groups.js pour la forme exacte).
 * @param {*} raw - état non fiable (lien de partage, localStorage...)
 * @param {{clamped?: boolean}} [report] - reçoit clamped=true si des
 *   réglages hors limites ont été ramenés aux bornes
 * @returns {Object} copie propre (seules les clés connues sont conservées)
 */
function sanitizeRotationState(raw, report = {}) {
  if (!isPlainObject(raw)) throw new Error("État de session invalide.");
  const out = {};

  const p = cleanNameList(raw.p, SANITIZE_LIMITS.maxPlayers, SANITIZE_LIMITS.nameLength, report);
  if (p !== undefined) out.p = p;

  for (const [key, [min, max, integer]] of Object.entries(ROTATION_FIELDS)) {
    const v = cleanNumber(raw[key], min, max, integer, report);
    if (v !== undefined) out[key] = v;
  }

  const s = cleanString(raw.s, SANITIZE_LIMITS.nameLength);
  if (s !== undefined) out.s = s;
  const cn = cleanString(raw.cn, SANITIZE_LIMITS.maxCourtNames * (SANITIZE_LIMITS.nameLength + 2));
  if (cn !== undefined) out.cn = cn;

  for (const key of ["sq", "b2b", "mem", "sp"]) {
    const v = cleanBool(raw[key]);
    if (v !== undefined) out[key] = v;
  }

  // Identifiant de session (mémoire entre les semaines) : régénéré par
  // loadState s'il est absent.
  if (raw.sid === null || isSafeId(raw.sid)) out.sid = raw.sid;

  if (raw.sc !== undefined) {
    const sc = nullProtoDict();
    if (isPlainObject(raw.sc)) {
      let count = 0;
      for (const k of Object.keys(raw.sc)) {
        if (count >= 5000) break;
        const entry = raw.sc[k];
        if (!ROTATION_SCORE_KEY_RE.test(k) || !isPlainObject(entry)) continue;
        const clean = {};
        if (typeof entry.teamA === "string") clean.teamA = entry.teamA.slice(0, 300);
        if ("1" in entry) clean["1"] = toScore(entry["1"]);
        if ("2" in entry) clean["2"] = toScore(entry["2"]);
        sc[k] = clean;
        count++;
      }
    }
    out.sc = sc;
  }

  if (raw.pr !== undefined) {
    const pr = nullProtoDict();
    if (isPlainObject(raw.pr)) {
      let count = 0;
      for (const k of Object.keys(raw.pr)) {
        if (count >= 500) break;
        const v = raw.pr[k];
        if (!isNameKey(k) || !isPlainObject(v)) continue;
        const start = Math.min(50, Math.max(1, Math.round(Number(v.start)) || 1));
        const end = Math.min(50, Math.max(start, Math.round(Number(v.end)) || 50));
        pr[k] = { start, end };
        count++;
      }
    }
    out.pr = pr;
  }

  if (raw.lv !== undefined) out.lv = cleanLevelsByName(raw.lv);

  if (raw.hr !== undefined) {
    out.hr = Array.isArray(raw.hr) ? raw.hr.filter(i => cleanInt(i, 0, 49) !== undefined).slice(0, 50) : [];
  }

  return out;
}

// -----------------------------------------------------------------------------
// COÛT D'UNE GÉNÉRATION (mode Rotation)
// -----------------------------------------------------------------------------
// La génération (scheduleRotations, algorithm.js) tourne sur le fil principal :
// un planning démesuré, même dans les bornes des champs, peut figer la page
// pendant des minutes (40 joueurs, 10 terrains, 50 tours : ~1 min au réglage
// par défaut, plusieurs avec une recherche élargie). Le coût suit le nombre
// d'affiches évaluées par la recherche en faisceau (beamSearchRound) : pour
// chaque terrain d'un tour, (états du faisceau) × (partenaires) × (paires
// d'adversaires), le faisceau étant plafonné à beamWidth.
//
// Étalonnage (Node 24, PC de bureau récent, novembre 2026) : ~3 µs par
// affiche évaluée, de 16 joueurs/4 terrains (1,3 s pour 8 tours) à
// 40 joueurs/10 terrains (10,6 s pour 10 tours). Un téléphone est en général
// 3 à 5 fois plus lent.
const SCHEDULE_COST_NS_PER_UNIT = 3000;
/** Au-delà (estimation sur un PC de bureau), pas de génération sans accord. */
const SCHEDULE_COST_BUDGET_MS = 2000;

/** Réglages du mode expert : ceux d'un lien partagé sont ignorés (voir prepareSharedRotationState). */
const ROTATION_EXPERT_KEYS = ["wt", "wo", "wp", "wbal", "bw", "pk", "sq"];
const ROTATION_DEFAULTS = { c: 2, r: 10, bw: 80, pk: 10 };

/**
 * Durée estimée (ms, PC de bureau) d'une génération complète.
 * @param {number} players - joueurs dans la liste
 * @param {number} courts - terrains demandés
 * @param {number} rounds - tours à calculer
 * @param {number} [beamWidth]
 * @param {number} [partnerK]
 * @returns {number}
 */
function estimateScheduleCost(players, courts, rounds, beamWidth = ROTATION_DEFAULTS.bw, partnerK = ROTATION_DEFAULTS.pk) {
  const courtsUsed = Math.min(Math.max(1, courts), Math.floor(players / 4));
  if (!(courtsUsed > 0) || !(rounds > 0)) return 0;
  const playing = courtsUsed * 4;
  let units = 0;
  let beam = 1;
  for (let step = 0; step < courtsUsed; step++) {
    const remaining = playing - 4 * step;
    const partners = Math.min(Math.max(2, Math.min(partnerK, playing - 1)), remaining - 1);
    const shortlist = Math.min(12, remaining - 2);
    const candidates = beam * partners * (shortlist * (shortlist - 1)) / 2;
    units += candidates;
    beam = Math.min(beamWidth, candidates);
  }
  return (units * rounds * SCHEDULE_COST_NS_PER_UNIT) / 1e6;
}

/** Nombre de joueurs distincts d'une liste saisie (même règle que parsePlayers). */
function countPlayerNames(text) {
  if (typeof text !== "string") return 0;
  const seen = new Set();
  for (const raw of text.split(/[\n,]/)) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name) seen.add(name.toLowerCase());
  }
  return seen.size;
}

/**
 * Prépare un état reçu par lien de partage (?d=) :
 * - nettoyé comme tout état importé (sanitizeRotationState) ;
 * - réglages du mode expert du lien ignorés : on garde ceux de l'appareil
 *   (`recipient`, sa sauvegarde) ou, à défaut, ceux par défaut de la page ;
 * - génération automatique seulement si son coût estimé tient dans le
 *   budget (sinon, la page charge le formulaire et propose de générer).
 * @param {*} raw - état décompressé du lien
 * @param {Object|null} [recipient] - état sauvegardé de l'appareil, s'il existe
 * @returns {{state: Object, clamped: boolean, cost: number, autoGenerate: boolean}}
 */
function prepareSharedRotationState(raw, recipient = null) {
  const report = {};
  const state = sanitizeRotationState(raw, report);
  let own = {};
  try {
    own = recipient ? sanitizeRotationState(recipient) : {};
  } catch {
    own = {};
  }
  for (const key of ROTATION_EXPERT_KEYS) {
    if (own[key] !== undefined) state[key] = own[key];
    else delete state[key];
  }
  const cost = estimateScheduleCost(
    countPlayerNames(state.p),
    Number(state.c ?? ROTATION_DEFAULTS.c),
    Number(state.r ?? ROTATION_DEFAULTS.r),
    Number(state.bw ?? ROTATION_DEFAULTS.bw),
    Number(state.pk ?? ROTATION_DEFAULTS.pk)
  );
  return { state, clamped: !!report.clamped, cost, autoGenerate: cost <= SCHEDULE_COST_BUDGET_MS };
}

/**
 * Historique des sessions (pb_history) : écarte les entrées illisibles,
 * régénère un identifiant invalide et nettoie l'état de chaque session.
 */
function sanitizeRotationHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const usedIds = new Set();
  for (const item of raw.slice(0, SANITIZE_LIMITS.maxHistory)) {
    if (!isPlainObject(item)) continue;
    let state;
    try {
      state = sanitizeRotationState(item.state);
    } catch {
      continue;
    }
    let id = Number.isSafeInteger(item.id) && item.id > 0 ? item.id : null;
    if (id === null || usedIds.has(id)) id = Date.now() + out.length;
    usedIds.add(id);
    const playersCount = Number.isInteger(item.playersCount) ? Math.max(0, Math.min(SANITIZE_LIMITS.maxPlayers, item.playersCount)) : 0;
    out.push({
      id,
      date: cleanString(item.date, 40, ""),
      seed: cleanString(item.seed, SANITIZE_LIMITS.nameLength, ""),
      playersCount,
      roundsCount: cleanNumber(item.roundsCount, 1, 50, true) ?? "",
      state
    });
  }
  return out;
}

/**
 * Groupes de joueurs réguliers (pb_player_groups, partagés par les deux
 * pages) : identifiant numérique, nom et liste de noms bornés.
 */
function sanitizePlayerGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const usedIds = new Set();
  for (const g of raw.slice(0, SANITIZE_LIMITS.maxGroups)) {
    if (!isPlainObject(g) || typeof g.name !== "string" || !g.name.trim()) continue;
    const players = Array.isArray(g.players)
      ? g.players.filter(p => typeof p === "string" && p.trim()).slice(0, SANITIZE_LIMITS.maxIndividualPlayers).map(p => p.slice(0, SANITIZE_LIMITS.nameLength))
      : [];
    let id = Number.isSafeInteger(g.id) && g.id > 0 ? g.id : null;
    if (id === null || usedIds.has(id)) id = Date.now() + out.length;
    usedIds.add(id);
    out.push({ id, name: g.name.slice(0, SANITIZE_LIMITS.nameLength), players });
  }
  return out;
}

/**
 * Mémoire « Varier d'une semaine à l'autre » (pb_pair_memory, voir
 * state-and-groups.js) : comptes de duos et d'oppositions par session.
 */
function sanitizePairMemory(raw) {
  if (!Array.isArray(raw)) return [];
  const cleanCounts = (obj) => {
    const out = nullProtoDict();
    if (!isPlainObject(obj)) return out;
    for (const k of Object.keys(obj).slice(0, 5000)) {
      const v = obj[k];
      if (k.length <= 2 * SANITIZE_LIMITS.nameLength + 2 && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000) out[k] = v;
    }
    return out;
  };
  return raw
    .filter(e => isPlainObject(e) && isSafeId(e.sid) && Number.isSafeInteger(e.at))
    .slice(0, 12)
    .map(e => ({ sid: e.sid, at: e.at, t: cleanCounts(e.t), o: cleanCounts(e.o) }));
}

// -----------------------------------------------------------------------------
// MODE TOURNOI
// -----------------------------------------------------------------------------

/** Bornes des champs du formulaire Tournoi (voir tournoi.html). */
const TOURNAMENT_FIELDS = {
  numPools: [1, 16, true],
  qualifiersPerPool: [1, 8, true],
  numCourts: [1, 16, true]
};
const POOL_ASSIGN_MODES = ["random", "seeded", "balanced", "manual"];

function invalidTournament(detail) {
  return new Error(`Tournoi invalide (${detail}).`);
}

/** Équipe : identifiant entier (lien avec forfaits, niveaux...), joueurs et nom. */
function cleanTeam(t) {
  if (!isPlainObject(t) || cleanInt(t.id, 0, 9999) === undefined) throw invalidTournament("équipe");
  const players = Array.isArray(t.players)
    ? t.players.filter(p => typeof p === "string").slice(0, 2).map(p => p.slice(0, SANITIZE_LIMITS.nameLength))
    : [];
  const name = typeof t.name === "string"
    ? t.name.slice(0, SANITIZE_LIMITS.teamNameLength)
    : players.join(" & ");
  return { id: t.id, players, name };
}

/** Case d'un tableau final : une équipe, ou un repos. */
function cleanSlot(slot) {
  if (!isPlainObject(slot)) throw invalidTournament("case de tableau");
  if (slot.bye === true) return { bye: true };
  return { team: cleanTeam(slot.team) };
}

/** Scores {a, b} d'un tableau final, indexés par position de l'affiche. */
function cleanSegmentScores(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const k of Object.keys(raw)) {
    if (!/^\d{1,3}$/.test(k) || !isPlainObject(raw[k])) continue;
    const clean = {};
    if ("a" in raw[k]) clean.a = toScore(raw[k].a);
    if ("b" in raw[k]) clean.b = toScore(raw[k].b);
    out[k] = clean;
  }
  return out;
}

function cleanRank(v, max = 1000) {
  const n = cleanInt(v, 0, max);
  if (n === undefined) throw invalidTournament("rang");
  return n;
}

function cleanSegment(seg) {
  if (!isPlainObject(seg) || !isSafeId(seg.id) || !Array.isArray(seg.slots) || seg.slots.length > 128) {
    throw invalidTournament("tableau");
  }
  return {
    id: seg.id,
    rankStart: cleanRank(seg.rankStart),
    rankSize: cleanRank(seg.rankSize, 128),
    slots: seg.slots.map(cleanSlot),
    scores: cleanSegmentScores(seg.scores)
  };
}

function cleanPhaseRound(round) {
  if (!isPlainObject(round) || !isSafeId(round.segmentId) || !Array.isArray(round.pairs)) throw invalidTournament("tour joué");
  return {
    segmentId: round.segmentId,
    rankStart: cleanRank(round.rankStart),
    rankSize: cleanRank(round.rankSize, 128),
    label: cleanString(round.label, 80, ""),
    pairs: round.pairs.slice(0, 64).map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2) throw invalidTournament("affiche");
      return [cleanSlot(pair[0]), cleanSlot(pair[1])];
    }),
    scores: cleanSegmentScores(round.scores)
  };
}

/** Phase finale ou consolante (voir buildFinalPhase dans engine.js). */
function cleanPhase(phase) {
  if (phase === null || phase === undefined) return phase;
  if (!isPlainObject(phase) || !Array.isArray(phase.segments) || !Array.isArray(phase.rounds)) throw invalidTournament("phase finale");
  if (phase.segments.length > 128 || phase.rounds.length > 256) throw invalidTournament("phase finale");
  const out = {
    bracketSize: cleanRank(phase.bracketSize, 128),
    rankOffset: cleanRank(phase.rankOffset ?? 0),
    segments: phase.segments.map(cleanSegment),
    rounds: phase.rounds.map(cleanPhaseRound),
    finalRanking: null
  };
  if (Array.isArray(phase.finalRanking)) {
    out.finalRanking = phase.finalRanking.slice(0, 128).map(r => {
      if (!isPlainObject(r)) throw invalidTournament("classement final");
      return { team: cleanTeam(r.team), rank: cleanRank(r.rank) };
    });
  }
  return out;
}

function cleanPool(pool) {
  if (!isPlainObject(pool) || !Array.isArray(pool.teams) || !Array.isArray(pool.rounds)) throw invalidTournament("poule");
  if (pool.teams.length > SANITIZE_LIMITS.maxTeams || pool.rounds.length > SANITIZE_LIMITS.maxTeams) throw invalidTournament("poule");
  const rounds = pool.rounds.map(matches => {
    if (!Array.isArray(matches) || matches.length > SANITIZE_LIMITS.maxTeams) throw invalidTournament("journée");
    return matches.map(m => {
      if (!isPlainObject(m)) throw invalidTournament("match");
      if (m.bye === true) return { bye: true, team: cleanTeam(m.team) };
      return { a: cleanTeam(m.a), b: cleanTeam(m.b) };
    });
  });
  const scores = {};
  if (isPlainObject(pool.scores)) {
    for (const k of Object.keys(pool.scores)) {
      const v = pool.scores[k];
      if (!/^\d{1,3}-\d{1,3}$/.test(k) || !isPlainObject(v)) continue;
      const clean = {};
      if ("a" in v) clean.a = toScore(v.a);
      if ("b" in v) clean.b = toScore(v.b);
      if (v.forfeit === true) clean.forfeit = true;
      scores[k] = clean;
    }
  }
  return {
    name: cleanString(pool.name, SANITIZE_LIMITS.nameLength, "Poule"),
    teams: pool.teams.map(cleanTeam),
    rounds,
    scores
  };
}

/** Tournoi généré (window.__PT_TOURNAMENT__), voir events.js. */
function cleanTournament(t, report) {
  if (t === null || t === undefined) return null;
  if (!isPlainObject(t) || !Array.isArray(t.teams) || !Array.isArray(t.pools)) throw invalidTournament("structure");
  if (t.teams.length > SANITIZE_LIMITS.maxTeams || t.pools.length > 16) throw invalidTournament("taille");

  const out = {
    tournamentId: Number.isSafeInteger(t.tournamentId) && t.tournamentId > 0 ? t.tournamentId : Date.now(),
    teams: t.teams.map(cleanTeam),
    pools: t.pools.map(cleanPool)
  };
  for (const [key, [min, max, integer]] of Object.entries(TOURNAMENT_FIELDS)) {
    const v = cleanNumber(t[key], min, max, integer, report);
    if (v !== undefined) out[key] = v;
  }
  if (POOL_ASSIGN_MODES.includes(t.poolAssignMode)) out.poolAssignMode = t.poolAssignMode;
  if (Array.isArray(t.courtNames)) {
    out.courtNames = t.courtNames.filter(n => typeof n === "string").slice(0, SANITIZE_LIMITS.maxCourtNames).map(n => n.slice(0, SANITIZE_LIMITS.nameLength));
  }
  // Allocation des terrains : recalculée au chargement si absente (voir
  // applyTournamentState), donc simplement écartée si elle est incohérente.
  if (Array.isArray(t.courtAllocation) && t.courtAllocation.length <= 16 &&
      t.courtAllocation.every(a => Array.isArray(a) && a.length <= 16 && a.every(i => cleanInt(i, 0, 15) !== undefined))) {
    out.courtAllocation = t.courtAllocation.map(a => [...a]);
  }
  if (Array.isArray(t.forfeitedTeamIds)) out.forfeitedTeamIds = t.forfeitedTeamIds.filter(id => cleanInt(id, 0, 9999) !== undefined);
  if (Array.isArray(t.hiddenPoolIndices)) out.hiddenPoolIndices = t.hiddenPoolIndices.filter(i => cleanInt(i, 0, 15) !== undefined);
  if (Array.isArray(t.hiddenMatchKeys)) out.hiddenMatchKeys = t.hiddenMatchKeys.filter(k => typeof k === "string" && isSafeId(k)).slice(0, 5000);
  if (t.finalPhase !== undefined) out.finalPhase = cleanPhase(t.finalPhase);
  if (t.consolationPhase !== undefined) out.consolationPhase = cleanPhase(t.consolationPhase);
  if (t.bracketViewMode === "tree" || t.bracketViewMode === "list") out.bracketViewMode = t.bracketViewMode;
  return out;
}

/**
 * Nettoie un état du mode Tournoi (voir getTournamentState dans
 * js/tournament/state.js pour la forme exacte).
 * @param {*} raw
 * @param {{clamped?: boolean}} [report] - voir sanitizeRotationState
 * @returns {Object} copie propre
 */
function sanitizeTournamentState(raw, report = {}) {
  if (!isPlainObject(raw)) throw new Error("État de tournoi invalide.");
  const out = {};

  const teamsText = cleanNameList(raw.teamsText, SANITIZE_LIMITS.maxTeams, SANITIZE_LIMITS.teamNameLength, report, /\r?\n/);
  if (teamsText !== undefined) out.teamsText = teamsText;
  const playersText = cleanNameList(raw.individualPlayersText, SANITIZE_LIMITS.maxIndividualPlayers, SANITIZE_LIMITS.nameLength, report, /\r?\n/);
  if (playersText !== undefined) out.individualPlayersText = playersText;

  for (const [key, [min, max, integer]] of Object.entries(TOURNAMENT_FIELDS)) {
    const v = cleanNumber(raw[key], min, max, integer, report);
    if (v !== undefined) out[key] = v;
  }
  if (POOL_ASSIGN_MODES.includes(raw.poolAssignMode)) out.poolAssignMode = raw.poolAssignMode;
  const courtNamesText = cleanString(raw.courtNamesText, SANITIZE_LIMITS.maxCourtNames * (SANITIZE_LIMITS.nameLength + 2));
  if (courtNamesText !== undefined) out.courtNamesText = courtNamesText;

  if (raw.teamLevels !== undefined) {
    const teamLevels = nullProtoDict();
    if (isPlainObject(raw.teamLevels)) {
      for (const k of Object.keys(raw.teamLevels)) {
        const lvl = cleanInt(raw.teamLevels[k], 1, 5);
        if (/^\d{1,4}$/.test(k) && lvl !== undefined) teamLevels[k] = lvl;
      }
    }
    out.teamLevels = teamLevels;
  }
  if (raw.playerLevels !== undefined) out.playerLevels = cleanLevelsByName(raw.playerLevels);

  if (raw.tournament !== undefined) out.tournament = cleanTournament(raw.tournament, report);
  return out;
}

/** Historique des tournois (pb_tournament_history), voir sanitizeRotationHistory. */
function sanitizeTournamentHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const usedIds = new Set();
  for (const item of raw.slice(0, SANITIZE_LIMITS.maxHistory)) {
    if (!isPlainObject(item)) continue;
    let state;
    try {
      state = sanitizeTournamentState(item.state);
    } catch {
      continue;
    }
    let id = Number.isSafeInteger(item.id) && item.id > 0 ? item.id : null;
    if (id === null || usedIds.has(id)) id = Date.now() + out.length;
    usedIds.add(id);
    const clean = {
      id,
      date: cleanString(item.date, 40, ""),
      teamsCount: cleanInt(item.teamsCount, 0, SANITIZE_LIMITS.maxTeams) ?? 0,
      numPools: cleanInt(item.numPools, 1, 16) ?? 1,
      state
    };
    if (Number.isSafeInteger(item.tournamentId) && item.tournamentId > 0) clean.tournamentId = item.tournamentId;
    out.push(clean);
  }
  return out;
}
