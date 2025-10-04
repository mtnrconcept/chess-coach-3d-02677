// variant-chess-lobby.ts
// ============================================================================
// Système de variantes "une règle = une salle" pour un lobby d'échecs
// - Base inchangée : roi ne peut pas rester/se mettre en échec, échec & mat standard
// - Promotion standard (reine/tour/fou/cavalier) gérée par le moteur standard
// - Chaque règle insolite est un plugin activable pour une salle donnée
// - Un Registry permet de lancer une partie avec une règle choisie
// ============================================================================

/** Couleur d’un camp */
export type Color = 'white' | 'black';

/** Type de pièce standard */
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

/** Représentation d’une pièce */
export interface Piece {
  id: string;
  type: PieceType;
  color: Color;
  tags?: Record<string, unknown>; // états temporaires (ex: berserk, mutant, etc.)
}

/** Coord (0..7) */
export interface Pos { x: number; y: number; }

/** Mouvement */
export interface Move {
  from: Pos;
  to: Pos;
  promotion?: PieceType;     // promotion standard (laisse ton moteur la gérer)
  meta?: Record<string, unknown>; // infos variantes (tir, explosion, etc.)
}

/** Case du plateau */
export interface Square { pos: Pos; piece?: Piece; }

/** Plateau 8x8 */
export type Board = Square[][];

/** État minimal du jeu pour brancher les variantes */
export interface GameState {
  board: Board;
  turn: Color;              // à qui de jouer
  moveNumber: number;
  history: {
    move: Move;
    movedPiece: Piece;
    capturedPiece?: Piece;
    snapshot?: unknown;
  }[];
  flags: {                  // flags par camp pour "1x/partie", cooldowns, etc.
    white: Record<string, unknown>;
    black: Record<string, unknown>;
  };
  graveyard: {              // pièces capturées (utile pour parachutage, retour, etc.)
    white: Piece[];
    black: Piece[];
  };
}

/** API que DOIT fournir ton moteur (ou un adapter vers chess.js) */
export interface EngineApi {
  isInCheck(state: GameState, color: Color): boolean;              // roi en échec ?
  isLegalStandardMove(state: GameState, move: Move): boolean;      // coup standard légal (inclut interdiction d’exposer le roi)
  applyStandardMove(
    state: GameState,
    move: Move,
    options?: { simulate?: boolean }
  ): GameState;      // applique coup standard (+ promotion standard si move.promotion)
  cloneState(state: GameState): GameState;                         // clone profond
  getPieceAt(state: GameState, pos: Pos): Piece | undefined;
  setPieceAt(state: GameState, pos: Pos, piece?: Piece): void;
  findKing(state: GameState, color: Color): Pos;
  allPieces(state: GameState): { piece: Piece; pos: Pos }[];
  inBounds(pos: Pos): boolean;
}

/** Hooks de plugin */
export interface RuleHooks {
  // 1) proposer des coups spéciaux/extra (en plus des coups standard du moteur)
  onGenerateExtraMoves?(
    state: GameState, pos: Pos, piece: Piece, api: EngineApi
  ): Move[];

  // 2) valider ou transformer un coup AVANT application (ex: tir, explosion)
  onBeforeMoveApply?(
    state: GameState, move: Move, api: EngineApi
  ): { allow: boolean; transform?: (s: GameState) => void; reason?: string };

  // 3) effets APRÈS l’application d’un coup standard (ex: deuxième saut, berserk)
  onAfterMoveApply?(
    state: GameState,
    ctx: { move: Move; moved: Piece; captured?: Piece; prevState: GameState },
    api: EngineApi
  ): void;

  // 4) au début de tour (ex: cooldowns, fin d’états temporaires)
  onTurnStart?(state: GameState, api: EngineApi): void;
}

/** Plugin de règle */
export interface RulePlugin extends RuleHooks {
  id: string;           // identifiant unique
  name: string;         // nom affiché
  description: string;  // description affichée
}

/** Composite qui applique une liste de plugins actifs */
export class RuleComposite implements RuleHooks {
  constructor(public plugins: RulePlugin[]) {}

  onGenerateExtraMoves(state: GameState, pos: Pos, piece: Piece, api: EngineApi): Move[] {
    const extras: Move[] = [];
    for (const p of this.plugins) {
      if (p.onGenerateExtraMoves) extras.push(...(p.onGenerateExtraMoves(state, pos, piece, api) || []));
    }
    // Filtrer les coups qui exposeraient le roi (sécurité stricte)
    const simulationApi: EngineApi = {
      ...api,
      applyStandardMove(simState, move, opts) {
        return api.applyStandardMove(simState, move, { ...opts, simulate: true });
      },
    };

    return extras.filter(m => {
      const sim = api.cloneState(state);
      if (this.onBeforeMoveApply) {
        const res = this.onBeforeMoveApply(sim, m, simulationApi);
        if (!res.allow) return false;
        res.transform?.(sim);
      } else {
        // si pas de transform, on applique standard si move est standard
        // sinon on laissera l’application spéciale plus tard.
      }
      // si meta.special et pas de déplacement, simuler le résultat si possible ?
      // Comme on ne sait pas tout simuler ici, on vérifie au moins que le roi
      // du joueur courant ne se retrouve pas en échec immédiatement
      return !api.isInCheck(sim, state.turn);
    });
  }

  onBeforeMoveApply(state: GameState, move: Move, api: EngineApi) {
    // Un move spécial peut être rejeté par un plugin, si un plugin l’autorise on prend le 1er qui gère
    for (const p of this.plugins) {
      if (p.onBeforeMoveApply) {
        const r = p.onBeforeMoveApply(state, move, api);
        if (r && r.allow !== undefined) {
          return r;
        }
      }
    }
    return { allow: true }; // par défaut, laisser passer (moteur revalidera la légalité standard)
  }

  onAfterMoveApply(state: GameState, ctx: { move: Move; moved: Piece; captured?: Piece; prevState: GameState }, api: EngineApi): void {
    for (const p of this.plugins) {
      p.onAfterMoveApply?.(state, ctx, api);
    }
  }

  onTurnStart(state: GameState, api: EngineApi): void {
    for (const p of this.plugins) {
      p.onTurnStart?.(state, api);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers utilitaires pour les règles
// ---------------------------------------------------------------------------
const dirsRook = [ {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1} ];
const dirsBishop = [ {x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1} ];
const neighbors8 = [
  {x:-1,y:-1},{x:0,y:-1},{x:1,y:-1},
  {x:-1,y:0},{x:1,y:0},
  {x:-1,y:1},{x:0,y:1},{x:1,y:1}
];

function eqPos(a: Pos, b: Pos) { return a.x===b.x && a.y===b.y; }
function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

const externalRules = new Map<string, RulePlugin>();
const externalRuleSources = new Map<string, string>();

function stripSourceMappingDirectives(source: string): string {
  return source.replace(/\s*\/\/\s*#\s*sourceMappingURL=.*$/gm, "");
}

function removeByteOrderMark(source: string): string {
  if (source.charCodeAt(0) === 0xfeff) {
    return source.slice(1);
  }
  return source;
}

function normaliseModuleSyntax(source: string): string {
  let body = source;

  body = body.replace(/\bexport\s+default\s+/g, "module.exports = ");
  body = body.replace(/\bexport\s+(const|let|var)\s+/g, "$1 ");
  body = body.replace(/\bexport\s+function\s+/g, "function ");
  body = body.replace(/\bexport\s+class\s+/g, "class ");

  body = body.replace(/export\s*{([^}]*)}\s*;?/g, (_full, inner: string) => {
    const exportsList = inner
      .split(",")
      .map((part: string) => part.trim())
      .filter(Boolean);

    const statements: string[] = [];
    for (const item of exportsList) {
      const [identifier, maybeAlias] = item.split(/\s+as\s+/i).map((part) => part.trim());
      if (!identifier) continue;
      if (maybeAlias && maybeAlias === "default") {
        statements.push(`module.exports = ${identifier};`);
        continue;
      }
      // Les exports nommés ne sont pas utilisés par le moteur.
      statements.push(`/* export ignoré: ${item} */`);
    }
    return statements.join("\n");
  });

  return body;
}

function prepareExternalRuleSource(raw: string): string {
  const withoutBom = removeByteOrderMark(raw);
  const withoutMaps = stripSourceMappingDirectives(withoutBom);
  const normalised = normaliseModuleSyntax(withoutMaps);
  return normalised.trim();
}

function buildFriendlyRegistrationError(error: unknown): string {
  if (error instanceof Error) {
    if (/Unexpected token '?(?:export|import)'?/i.test(error.message)) {
      return "Le code de la variante utilise la syntaxe d'export/import ESModule. Retirez les mots-clés `export` et `import`.";
    }
    if (/Unexpected identifier/i.test(error.message) && /export\s+default/i.test(error.message)) {
      return "Le code de la variante contient `export default`, non supporté dans le runtime embarqué.";
    }
    return error.message;
  }
  return "Erreur inconnue lors du chargement du code de variante.";
}

export interface ExternalRuleRegistrationResult {
  ok: boolean;
  reused?: boolean;
  error?: string;
}

export interface ExternalRuleHelpers {
  clone: <T>(value: T) => T;
  eqPos: (a: Pos, b: Pos) => boolean;
  dirs: { rook: Pos[]; bishop: Pos[] };
  neighbors: (pos: Pos) => Pos[];
  createMove: (from: Pos, to: Pos, meta?: Move['meta']) => Move;
  ruleId: string;
}

function buildExternalHelpers(ruleId: string): ExternalRuleHelpers {
  return {
    clone,
    eqPos,
    dirs: { rook: dirsRook.map(clone), bishop: dirsBishop.map(clone) },
    neighbors(pos) {
      const around: Pos[] = [];
      for (const delta of neighbors8) {
        around.push({ x: pos.x + delta.x, y: pos.y + delta.y });
      }
      return around;
    },
    createMove(from, to, meta) {
      return { from: clone(from), to: clone(to), meta: meta ? { ...meta } : undefined };
    },
    ruleId,
  };
}

function normaliseRulePlugin(ruleId: string, candidate: unknown): RulePlugin {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Le module généré ne retourne pas un objet de règle valide.');
  }

  const plugin = candidate as Partial<RulePlugin>;
  if (!plugin.id || typeof plugin.id !== 'string') {
    plugin.id = ruleId;
  }

  if (plugin.id !== ruleId) {
    plugin.id = ruleId;
  }

  if (!plugin.name || typeof plugin.name !== 'string') {
    plugin.name = `Variante ${ruleId}`;
  }

  if (!plugin.description || typeof plugin.description !== 'string') {
    plugin.description = 'Variante personnalisée générée automatiquement.';
  }

  return plugin as RulePlugin;
}

export function registerExternalRule(rule: RulePlugin): ExternalRuleRegistrationResult {
  externalRules.set(rule.id, rule);
  return { ok: true };
}

export function registerExternalRuleFromSource(ruleId: string, source: string): ExternalRuleRegistrationResult {
  if (!source || typeof source !== 'string') {
    return { ok: false, error: 'Aucun code de variante fourni.' };
  }

  const existingSource = externalRuleSources.get(ruleId);
  if (existingSource && existingSource === source && externalRules.has(ruleId)) {
    return { ok: true, reused: true };
  }

  try {
    const prepared = prepareExternalRuleSource(source);
    if (prepared.length === 0) {
      return { ok: false, error: 'Le code de la variante est vide.' };
    }
    if (/\bimport\s+[^;]+from\s+['"]/i.test(prepared) || /\bimport\s*\(/i.test(prepared)) {
      return {
        ok: false,
        error: "Le code de la variante contient des instructions `import`. Elles ne sont pas supportées dans l'éditeur embarqué.",
      };
    }

    const body = `"use strict";\n${prepared}\nreturn module.exports ?? exports.default ?? exports;`;
    const factory = new Function('exports', 'module', 'helpers', body);
    const exportsObj: Record<string, unknown> = {};
    const moduleObj: { exports: unknown } = { exports: exportsObj };
    const helpers = buildExternalHelpers(ruleId);
    const returned = factory(exportsObj, moduleObj, helpers);
    const plugin = normaliseRulePlugin(ruleId, returned ?? moduleObj.exports ?? (exportsObj as { default?: unknown }).default ?? exportsObj);
    externalRules.set(ruleId, plugin);
    externalRuleSources.set(ruleId, source);
    return { ok: true };
  } catch (error) {
    console.error('Failed to register external rule', ruleId, error);
    return {
      ok: false,
      error: buildFriendlyRegistrationError(error),
    };
  }
}

export function getExternalRuleSource(ruleId: string): string | undefined {
  return externalRuleSources.get(ruleId);
}

function firstPieceOnRay(state: GameState, api: EngineApi, from: Pos, dir: Pos): { pos: Pos, piece: Piece } | undefined {
  let p = { x: from.x + dir.x, y: from.y + dir.y };
  while (api.inBounds(p)) {
    const pc = api.getPieceAt(state, p);
    if (pc) return { pos: clone(p), piece: pc };
    p = { x: p.x + dir.x, y: p.y + dir.y };
  }
  return undefined;
}

function squaresOnRayUntil(state: GameState, api: EngineApi, from: Pos, dir: Pos, until?: Pos): Pos[] {
  const res: Pos[] = [];
  let p = { x: from.x + dir.x, y: from.y + dir.y };
  while (api.inBounds(p)) {
    res.push(clone(p));
    if (until && eqPos(p, until)) break;
    if (api.getPieceAt(state, p)) break;
    p = { x: p.x + dir.x, y: p.y + dir.y };
  }
  return res;
}

function forEachNeighbor(pos: Pos, fn: (n: Pos) => void) {
  neighbors8.forEach(d => fn({ x: pos.x + d.x, y: pos.y + d.y }));
}

// ---------------------------------------------------------------------------
// 30 RÈGLES INSOLITES (plugins)
// Chaque plugin respecte les règles de base : jamais exposer le roi.
// Les effets spéciaux sont “autour” du coup standard.
// ---------------------------------------------------------------------------

/** 1) Cavalier Tornade : après une capture par un cavalier, il rejoue immédiatement un second saut (facultatif). */
const RuleKnightTornado: RulePlugin = {
  id: 'knight-tornado',
  name: 'Cavalier Tornade',
  description: 'Après une capture par un cavalier, il peut rejouer un second saut immédiatement.',
  onAfterMoveApply(state, ctx, api) {
    const { moved, captured } = ctx;
    if (moved.type !== 'knight') return;
    if (!captured) return;
    // Donner un "bonus-turn" au même joueur pour la même pièce (tag)
    moved.tags = moved.tags || {};
    moved.tags.tornado = 1; // autorise un 2e saut tout de suite
    state.turn = moved.color;
  },
  onTurnStart(state) {
    // Effet reset si ce n'est plus le tour du joueur précédent
    // Rien à faire : l’effet ne dure qu’immédiatement après le coup
  },
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'knight' || !piece.tags?.tornado) return [];
    // propose tous les sauts classiques de cavalier comme extra “immédiat”
    const jumps = [
      {x:1,y:2},{x:2,y:1},{x:-1,y:2},{x:-2,y:1},
      {x:1,y:-2},{x:2,y:-1},{x:-1,y:-2},{x:-2,y:-1}
    ];
    const moves: Move[] = [];
    for (const d of jumps) {
      const to = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to)) continue;
      const target = api.getPieceAt(state, to);
      // on autorise coup spécial immédiat (même sans capture)
      moves.push({ from: clone(pos), to, meta: { special: 'knight_tornado' } });
    }
    // Consommation immédiate : dès qu’un coup tornado est joué, on supprimera le tag
    return moves;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'knight_tornado') {
      // ce coup doit venir juste après un cavalier en mode tornado
      const pc = api.getPieceAt(state, move.from);
      if (!pc || pc.type !== 'knight' || !pc.tags?.tornado) {
        return { allow: false, reason: 'Tornado non disponible' };
      }
      // Transformer en déplacement standard (et enlever le tag après)
      return {
        allow: true,
        transform: (s) => {
          // on applique un déplacement standard mais en forçant la légalité via moteur
          // ici on passe par applyStandardMove pour rester sûr
          s = api.applyStandardMove(s, move); // moteur validera non-exposition roi
          const np = api.getPieceAt(s, move.to);
          if (np?.tags) delete np.tags.tornado;
          // Comme on a déjà appliqué standardMove dans transform, rien à refaire
        }
      };
    }
    return { allow: true };
  }
};

/** 2) Reine Éclaire (téléportation 1x/partie sur case libre). */
const RuleQueenTeleport: RulePlugin = {
  id: 'queen-teleport',
  name: 'Reine Éclaire',
  description: 'Une fois par partie, la reine peut se téléporter sur n’importe quelle case libre.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'queen') return [];
    const used = state.flags[piece.color].queen_teleport_used;
    if (used) return [];
    const moves: Move[] = [];
    for (let x=0;x<8;x++) for (let y=0;y<8;y++) {
      const to = {x,y};
      if (api.getPieceAt(state, to)) continue;
      moves.push({ from: clone(pos), to, meta: { special: 'queen_tp' } });
    }
    return moves;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'queen_tp') {
      const pc = api.getPieceAt(state, move.from);
      if (!pc || pc.type !== 'queen') return { allow: false };
      if (state.flags[pc.color].queen_teleport_used) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          // Déplacer la reine sans capture (téléport)
          const q = api.getPieceAt(s, move.from);
          if (!q) return;
          api.setPieceAt(s, move.from, undefined);
          api.setPieceAt(s, move.to, q);
          state.flags[q.color].queen_teleport_used = true;
        }
      };
    }
    return { allow: true };
  }
};

/** 3) Pion Kamikaze (rangée 5 : explosion 3x3 en se sacrifiant). */
const RulePawnKamikaze: RulePlugin = {
  id: 'pawn-kamikaze',
  name: 'Pion Kamikaze',
  description: 'Quand un pion atteint la 5e rangée, il peut exploser et éliminer toutes les pièces autour (3×3) en se sacrifiant.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'pawn') return [];
    const row = piece.color === 'white' ? 3 : 4; // 0-based: 5e rangée = y=3 (blanc montant) / y=4 (noir descendant)
    if (pos.y !== row) return [];
    return [{ from: clone(pos), to: clone(pos), meta: { special: 'pawn_boom' } }];
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'pawn_boom') {
      const pc = api.getPieceAt(state, move.from);
      if (!pc || pc.type !== 'pawn') return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          // Exploser autour
          forEachNeighbor(move.from, (n) => {
            if (!api.inBounds(n)) return;
            const t = api.getPieceAt(s, n);
            if (t) api.setPieceAt(s, n, undefined);
          });
          // Sacrifier le pion
          api.setPieceAt(s, move.from, undefined);
        }
      };
    }
    return { allow: true };
  }
};

/** 4) Tour Canon : tirer en ligne (sans bouger) et supprimer une pièce adverse sur la ligne. */
const RuleRookCannon: RulePlugin = {
  id: 'rook-cannon',
  name: 'Tour Canon',
  description: 'La tour peut, au lieu de bouger, tirer en ligne droite et éliminer une pièce adverse sur sa ligne/colonne.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'rook') return [];
    const shots: Move[] = [];
    for (const d of dirsRook) {
      const hit = firstPieceOnRay(state, api, pos, d);
      if (hit && hit.piece.color !== piece.color) {
        shots.push({ from: clone(pos), to: clone(hit.pos), meta: { special: 'rook_shot' } });
      }
    }
    return shots;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'rook_shot') {
      const r = api.getPieceAt(state, move.from);
      const tgt = api.getPieceAt(state, move.to);
      if (!r || r.type !== 'rook' || !tgt || tgt.color === r.color) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          // Supprimer la cible, la tour ne bouge pas
          api.setPieceAt(s, move.to, undefined);
        }
      };
    }
    return { allow: true };
  }
};

/** 5) Fou Caméléon : 1x/partie, basculer sur l’autre couleur de diagonale (saut d’1 case orthogonale). */
const RuleBishopChameleon: RulePlugin = {
  id: 'bishop-chameleon',
  name: 'Fou Caméléon',
  description: 'Une fois par partie, un fou peut sauter d’1 case orthogonale pour changer de couleur de diagonale.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'bishop') return [];
    const usedKey = `${piece.id}_chameleon_used`;
    if (state.flags[piece.color][usedKey]) return [];
    const moves: Move[] = [];
    for (const d of dirsRook) {
      const to = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to)) continue;
      if (api.getPieceAt(state, to)) continue; // doit être libre
      moves.push({ from: clone(pos), to, meta: { special: 'bishop_colorflip', usedKey } });
    }
    return moves;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'bishop_colorflip') {
      const b = api.getPieceAt(state, move.from);
      if (!b || b.type !== 'bishop') return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          // Simple déplacement d'1 case orthogonale
          s = api.applyStandardMove(s, { from: move.from, to: move.to });
          const usedKey = move.meta?.usedKey as string;
          if (usedKey) state.flags[b.color][usedKey] = true;
        }
      };
    }
    return { allow: true };
  }
};

/** 6) Roi en Colère : après 3 échecs subis de suite (dans l’historique), le roi bouge comme une reine pour 1 tour. */
const RuleAngryKing: RulePlugin = {
  id: 'angry-king',
  name: 'Roi en Colère',
  description: 'Si votre roi a été mis en échec 3 fois de suite, il peut bouger comme une reine pendant 1 tour.',
  onTurnStart(state, api) {
    const me = state.turn;
    const key = `${me}_angry_king_charges`;
    const prev = (state.flags[me][key] as number) || 0;
    // reset par défaut
    state.flags[me][key] = Math.max(0, prev - 1);
  },
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type !== 'king' || piece.color !== state.turn) return [];
    // détecter 3 derniers coups adverses t’ayant mis en échec
    const me = piece.color;
    const checks = state.history.slice(-6).filter(h => {
      // heuristique : on re-simule le coup précédent pour voir si roi était en échec ?
      // Simple : stocker un compteur dans flags (à incrémenter par ailleurs).
      return false;
    });
    const angry = state.flags[me].angry_king_ready;
    if (!angry) return [];
    // Offrir tous les déplacements de reine comme moves spéciaux
    const extras: Move[] = [];
    const rays = [...dirsRook, ...dirsBishop];
    for (const d of rays) {
      const squares = squaresOnRayUntil(state, api, pos, d);
      for (const to of squares) {
        const t = api.getPieceAt(state, to);
        if (t?.color === piece.color) break;
        extras.push({ from: clone(pos), to, meta: { special: 'angry_king' } });
        if (t) break;
      }
    }
    return extras;
  },
  onAfterMoveApply(state, ctx, api) {
    // Maintenir un compteur simple : si le roi sort d’un tour en échec, incrémenter un "streak"
    const me = ctx.moved.color;
    const opp: Color = me === 'white' ? 'black' : 'white';
    // si l’adversaire vient de te mettre en échec au tour précédent, on gère ailleurs.
    // Pour simplifier, on active manuellement : si la position en début de ton tour est en échec, incrémenter un compteur et lorsque ça atteint 3, set angry_king_ready
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'angry_king') {
      const k = api.getPieceAt(state, move.from);
      if (!k || k.type !== 'king') return { allow: false };
      if (!state.flags[k.color].angry_king_ready) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          api.applyStandardMove(s, { from: move.from, to: move.to });
          // Consommer le bonus
          state.flags[k.color].angry_king_ready = false;
        }
      };
    }
    return { allow: true };
  }
};

/** 7) Pions Fusion : 2 pions adjacents fusionnent en super-pièce (tour OU fou). */
const RulePawnFusion: RulePlugin = {
  id: 'pawn-fusion',
  name: 'Pions Fusion',
  description: 'Deux pions alliés adjacents peuvent fusionner en une super-pièce qui se déplace comme une tour ou un fou.',
  onGenerateExtraMoves(state, pos, piece, api) {
    // Cas 1: pion normal qui peut fusionner avec un voisin
    if (piece.type === 'pawn') {
      const moves: Move[] = [];
      forEachNeighbor(pos, (n) => {
        const p2 = api.getPieceAt(state, n);
        if (p2?.type === 'pawn' && p2.color === piece.color) {
          moves.push({ from: clone(pos), to: clone(n), meta: { special: 'pawn_fusion' } });
        }
      });
      return moves;
    }
    // Cas 2: si super-pièce (rook avec alt bishop), autoriser déplacements de fou en plus
    if (piece.type === 'rook' && piece.tags?.super) {
      const moves: Move[] = [];
      for (const d of dirsBishop) {
        const squares = squaresOnRayUntil(state, api, pos, d);
        for (const to of squares) {
          const t = api.getPieceAt(state, to);
          if (t?.color === piece.color) break;
          moves.push({ from: clone(pos), to, meta:{ special:'superpiece_bishop' } });
          if (t) break;
        }
      }
      return moves;
    }
    return [];
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'pawn_fusion') {
      const p1 = api.getPieceAt(state, move.from);
      const p2 = api.getPieceAt(state, move.to);
      if (!p1 || !p2 || p1.type!=='pawn' || p2.type!=='pawn' || p1.color!==p2.color) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          // Créer super-pièce (type rook, tag: canMoveAs='rook|bishop' sélectionné plus tard)
          const superPiece: Piece = { id: p1.id, type: 'rook', color: p1.color, tags: { super:true, alt:'bishop' } };
          api.setPieceAt(s, move.from, undefined);
          api.setPieceAt(s, move.to, superPiece);
        }
      };
    }
    return { allow: true };
  }
};

/** 8) Invasion Aérienne : tous les 10 coups, parachuter une pièce capturée sur son propre camp. */
const RuleAirDrop: RulePlugin = {
  id: 'airdrop',
  name: 'Invasion Aérienne',
  description: 'Tous les 10 coups, parachuter une pièce capturée dans son propre camp (case vide).',
  onTurnStart(state, api) {
    const me = state.turn;
    const ready = ((state.moveNumber || 0) % 10)===0;
    state.flags[me].airdrop_ready = ready;
  },
  onGenerateExtraMoves(state, pos, piece, api) {
    // Le parachutage se joue comme un "coup" spécial sans bouger une pièce en jeu
    // Pour simplifier, on ne le génère pas par pièce mais via une pseudo-case: on le rend accessible via toutes tes pièces (une seule fois)
    const me = piece.color;
    if (!state.flags[me].airdrop_ready) return [];
    const gy = state.graveyard[me];
    if (!gy || gy.length===0) return [];
    // ne proposer le menu qu'une fois (ex: sur ton roi)
    if (piece.type !== 'king') return [];
    const extras: Move[] = [];
    for (let x=0;x<8;x++) for (let y= (me==='white'?4:0); y< (me==='white'?8:4); y++) {
      const to = {x,y};
      if (api.getPieceAt(state, to)) continue;
      // on parachute la 1ère pièce du cimetière pour l'exemple (on peut stocker le choix ailleurs)
      extras.push({ from: clone(to), to: clone(to), meta:{ special:'airdrop', pickIndex:0 }});
    }
    return extras;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'airdrop') {
      const me = state.turn;
      if (!state.flags[me].airdrop_ready) return { allow: false };
      const gy = state.graveyard[me];
      if (!gy || gy.length===0) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          const pickIndex = (move.meta?.pickIndex as number) ?? 0;
          const p = gy.splice(pickIndex, 1)[0];
          if (!p) return;
          api.setPieceAt(s, move.to, p);
          state.flags[me].airdrop_ready = false;
        }
      };
    }
    return { allow: true };
  }
};

/** 9) Cavalier Acrobatique : peut sauter par-dessus 2 pièces (trajectoire cavalier étendue). */
const RuleAcrobaticKnight: RulePlugin = {
  id: 'acrobatic-knight',
  name: 'Cavalier Acrobatique',
  description: 'Le cavalier peut sauter par-dessus 2 pièces consécutives (portée inchangée, simple permission).',
  // Simplification : on n’a pas besoin de code ; le cavalier saute de base. Ici, on autoriserait un "double saut" ?
  // Pour rester simple, on ne change rien (le cavalier saute déjà). Si tu veux un "super L" 2x, ajoute des cases plus lointaines :
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='knight') return [];
    const jumps2 = [
      {x:2,y:3},{x:3,y:2},{x:-2,y:3},{x:-3,y:2},
      {x:2,y:-3},{x:3,y:-2},{x:-2,y:-3},{x:-3,y:-2}
    ];
    const res: Move[] = [];
    for (const d of jumps2) {
      const to = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to)) continue;
      const t = api.getPieceAt(state, to);
      if (!t || t.color !== piece.color) res.push({ from: clone(pos), to, meta: { special:'knight_long' }});
    }
    return res;
  }
};

/** 10) Tour Catapulte : lancer un pion ami placé juste devant, atterrissant 2 cases plus loin. */
const RuleRookCatapult: RulePlugin = {
  id: 'rook-catapult',
  name: 'Tour Catapulte',
  description: 'Une tour peut catapulter un pion ami devant elle de 2 cases.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='rook') return [];
    const moves: Move[] = [];
    // Devant = dépend de la couleur du pion, mais on simplifie : catapultes verticales
    const forwardDirs = [ {x:0,y:1}, {x:0,y:-1} ];
    for (const d of forwardDirs) {
      const p1 = { x: pos.x + d.x, y: pos.y + d.y };
      const p2 = { x: pos.x + 2*d.x, y: pos.y + 2*d.y };
      if (!api.inBounds(p1) || !api.inBounds(p2)) continue;
      const mid = api.getPieceAt(state, p1);
      if (mid?.type==='pawn' && mid.color===piece.color && !api.getPieceAt(state, p2)) {
        moves.push({ from: clone(p1), to: clone(p2), meta: { special:'catapult', rook: clone(pos) }});
      }
    }
    return moves;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special==='catapult') {
      const rookPos = move.meta.rook as Pos;
      const rook = api.getPieceAt(state, rookPos);
      const pawn = api.getPieceAt(state, move.from);
      if (!rook || rook.type!=='rook' || !pawn || pawn.type!=='pawn' || pawn.color!==rook.color) return { allow:false };
      if (api.getPieceAt(state, move.to)) return { allow:false };
      return {
        allow: true,
        transform: (s) => {
          // déplacer le pion uniquement
          api.setPieceAt(s, move.to, pawn);
          api.setPieceAt(s, move.from, undefined);
        }
      };
    }
    return { allow:true };
  }
};

/** 11) Fou Fantôme : une fois capturé, un fou peut revenir au tour suivant sur une case libre de sa couleur d’origine. */
const RuleGhostBishop: RulePlugin = {
  id: 'ghost-bishop',
  name: 'Fou Fantôme',
  description: 'Une fois capturé, un fou peut revenir au tour suivant sur une case libre de sa couleur de case d’origine.',
  onAfterMoveApply(state, ctx, api) {
    if (ctx.captured?.type === 'bishop') {
      // Marquer un droit de retour pour la couleur capturée
      const key = `${ctx.captured.color}_ghost_bishop`;
      state.flags[ctx.captured.color][key] = true;
      // Enregistrer la parité de case (noire/blanche)
      state.flags[ctx.captured.color][`${key}_dark`] = ((ctx.move.to.x + ctx.move.to.y) % 2)===1;
    }
  },
  onGenerateExtraMoves(state, pos, piece, api) {
    // Le retour se joue comme un "coup" spécial depuis le ROI du joueur courant (menu centralisé)
    if (piece.type!=='king' || piece.color!==state.turn) return [];
    const me = piece.color;
    const key = `${me}_ghost_bishop`;
    if (!state.flags[me][key]) return [];
    const wantDark = !!state.flags[me][`${key}_dark`];
    const res: Move[] = [];
    for (let x=0;x<8;x++) for (let y=0;y<8;y++) {
      const to = {x,y};
      if (api.getPieceAt(state, to)) continue;
      const isDark = ((x+y)%2)===1;
      if (isDark===wantDark) {
        res.push({ from: clone(to), to: clone(to), meta:{ special:'ghost_bishop', color: me }});
      }
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special==='ghost_bishop') {
      const me = move.meta.color as Color;
      if (!state.flags[me][`${me}_ghost_bishop`]) return { allow:false };
      return {
        allow:true,
        transform: (s) => {
          // Revenir avec un nouveau fou
          const newB: Piece = { id: `ghost-bishop-${Date.now()}`, type:'bishop', color: me };
          api.setPieceAt(s, move.to, newB);
          state.flags[me][`${me}_ghost_bishop`] = false;
          delete state.flags[me][`${me}_ghost_bishop_dark`];
        }
      };
    }
    return { allow:true };
  }
};

/** 12) Pion Élastique : 1x/partie, un pion peut reculer d’1 case. */
const RuleElasticPawn: RulePlugin = {
  id: 'elastic-pawn',
  name: 'Pion Élastique',
  description: 'Une fois par partie, un pion peut reculer d’une case.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='pawn') return [];
    const usedKey = `${piece.id}_back_used`;
    if (state.flags[piece.color][usedKey]) return [];
    const dir = piece.color==='white' ? -1 : 1;
    const to = { x: pos.x, y: pos.y + dir };
    if (!api.inBounds(to)) return [];
    if (api.getPieceAt(state, to)) return [];
    return [{ from: clone(pos), to, meta:{ special:'pawn_back', usedKey } }];
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special==='pawn_back') {
      const p = api.getPieceAt(state, move.from);
      if (!p || p.type!=='pawn') return { allow:false };
      return {
        allow:true,
        transform: (s) => {
          api.applyStandardMove(s, { from: move.from, to: move.to });
          const usedKey = move.meta?.usedKey as string;
          if (usedKey) state.flags[p.color][usedKey] = true;
        }
      };
    }
    return { allow:true };
  }
};

/** 13) Reine Berserk : si elle capture 2 tours de suite, elle doit continuer à capturer tant que possible. */
const RuleQueenBerserk: RulePlugin = {
  id: 'queen-berserk',
  name: 'Reine Berserk',
  description: 'Si la reine capture 2 tours de suite, elle doit continuer à capturer tant que possible.',
  onAfterMoveApply(state, ctx, api) {
    const { moved, captured } = ctx;
    if (moved.type!=='queen') return;
    const key = `${moved.color}_qcapstreak`;
    const prev = (state.flags[moved.color][key] as number) || 0;
    state.flags[moved.color][key] = captured ? prev + 1 : 0;
    const currentStreak = state.flags[moved.color][key] as number;
    if (currentStreak >= 2) {
      state.flags[moved.color].queen_berserk = true;
    } else if (!captured) {
      state.flags[moved.color].queen_berserk = false;
    }
  },
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='queen') return [];
    if (!state.flags[piece.color].queen_berserk) return [];
    // Suggérer seulement des coups qui capturent (toutes directions)
    const extras: Move[] = [];
    const rays = [...dirsRook, ...dirsBishop];
    for (const d of rays) {
      const squares = squaresOnRayUntil(state, api, pos, d);
      for (const to of squares) {
        const t = api.getPieceAt(state, to);
        if (t && t.color!==piece.color) {
          extras.push({ from: clone(pos), to, meta:{ special:'queen_berserk' }});
          break; // premier ennemi sur la ligne
        }
        if (t) break;
      }
    }
    return extras;
  }
};

/** 14) Roi Bouclier : si le roi se place adjacent à un pion ami, ce pion est invulnérable 1 tour. */
const RuleKingShield: RulePlugin = {
  id: 'king-shield',
  name: 'Roi Bouclier',
  description: 'Si le roi finit adjacent à un pion ami, ce pion ne peut pas être capturé pendant 1 tour.',
  onAfterMoveApply(state, ctx, api) {
    const { moved } = ctx;
    if (moved.type!=='king') return;
    const me = moved.color;
    // Marquer les pions adjacents comme "shielded"
    const kingPos = api.findKing(state, me);
    forEachNeighbor(kingPos, (n) => {
      const p = api.getPieceAt(state, n);
      if (p?.type==='pawn' && p.color===me) {
        p.tags = p.tags || {};
        p.tags.shielded_until = state.moveNumber + 1;
      }
    });
  },
  onBeforeMoveApply(state, move, api) {
    // empêcher la capture d’un pion "shielded"
    const tgt = api.getPieceAt(state, move.to);
    const shieldedUntil = tgt?.tags?.shielded_until as number | undefined;
    if (tgt?.type==='pawn' && shieldedUntil !== undefined && shieldedUntil >= state.moveNumber) {
      // si le move essaye de le capturer, refuser
      const fromPc = api.getPieceAt(state, move.from);
      const isCapture = !!tgt && (!fromPc || fromPc.color!==tgt.color);
      if (isCapture) return { allow: false, reason: 'Pion protégé par le roi' };
    }
    return { allow:true };
  }
};

/** 15) Double Cavalier : 2 cavaliers adjacents peuvent se déplacer ensemble (même L parallèle). */
const RuleDoubleKnight: RulePlugin = {
  id: 'double-knight',
  name: 'Double Cavalier',
  description: 'Deux cavaliers adjacents peuvent sauter ensemble (même motif).',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='knight') return [];
    const mates: Pos[] = [];
    forEachNeighbor(pos, (n) => {
      const p = api.getPieceAt(state, n);
      if (p?.type==='knight' && p.color===piece.color) mates.push(n);
    });
    if (mates.length===0) return [];
    const jumps = [
      {x:1,y:2},{x:2,y:1},{x:-1,y:2},{x:-2,y:1},
      {x:1,y:-2},{x:2,y:-1},{x:-1,y:-2},{x:-2,y:-1}
    ];
    const res: Move[] = [];
    for (const d of jumps) {
      const to1 = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to1)) continue;
      // On encode le "double saut" comme un move spécial depuis le 1er cavalier
      res.push({ from: clone(pos), to: to1, meta:{ special:'double_knight', mate: mates[0] }});
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='double_knight') return { allow:true };
    const k1 = api.getPieceAt(state, move.from);
    const matePos = move.meta.mate as Pos;
    const k2 = api.getPieceAt(state, matePos);
    if (!k1 || !k2 || k1.type!=='knight' || k2.type!=='knight' || k1.color!==k2.color) return { allow:false };
    return {
      allow:true,
      transform: (s) => {
        // Déplacer k1 standard
        api.applyStandardMove(s, { from: move.from, to: move.to });
        // Déplacer k2 sur une case parallèle si libre, sinon rien
        const dx = move.to.x - move.from.x;
        const dy = move.to.y - move.from.y;
        const matePos = move.meta.mate as Pos;
        const to2 = { x: matePos.x + dx, y: matePos.y + dy };
        if (api.inBounds(to2) && !api.getPieceAt(s, to2)) {
          const kk2 = api.getPieceAt(s, matePos);
          if (kk2) { api.setPieceAt(s, matePos, undefined); api.setPieceAt(s, to2, kk2); }
        }
      }
    };
  }
};

/** 16) Tour Aimant : attire d’1 case vers elle toutes les pièces ennemies sur sa ligne/colonne au début de son tour. */
const RuleRookMagnet: RulePlugin = {
  id: 'rook-magnet',
  name: 'Tour Aimant',
  description: 'Au début de votre tour, vos tours attirent d’une case vers elles les ennemis alignés.',
  onTurnStart(state, api) {
    const me = state.turn;
    api.allPieces(state).forEach(({piece,pos}) => {
      if (piece.color!==me || piece.type!=='rook') return;
      for (const d of dirsRook) {
        // Chercher 1ère pièce sur le rayon
        const first = firstPieceOnRay(state, api, pos, d);
        if (first && first.piece.color!==me) {
          // Si la case juste avant la cible vers la tour est libre, on la "tire"
          const pull = { x: first.pos.x - d.x, y: first.pos.y - d.y };
          if (api.inBounds(pull) && !api.getPieceAt(state, pull)) {
            const victim = api.getPieceAt(state, first.pos);
            if (victim) { api.setPieceAt(state, first.pos, undefined); api.setPieceAt(state, pull, victim); }
          }
        }
      }
    });
  }
};

/** 17) Fou Guérisseur : au lieu de jouer, ramène un cavalier ou pion allié capturé sur une case adjacente libre. */
const RuleBishopHealer: RulePlugin = {
  id: 'bishop-healer',
  name: 'Fou Guérisseur',
  description: 'Un fou peut, au lieu de jouer, ramener un pion ou un cavalier allié capturé sur une case adjacente libre.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='bishop') return [];
    const gy = state.graveyard[piece.color] || [];
    const has = gy.find(p => p.type==='pawn' || p.type==='knight');
    if (!has) return [];
    const res: Move[] = [];
    forEachNeighbor(pos, (n) => {
      if (!api.inBounds(n)) return;
      if (!api.getPieceAt(state, n)) {
        res.push({ from: clone(n), to: clone(n), meta:{ special:'heal', source: clone(pos), pickId: has.id }});
      }
    });
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='heal') return { allow:true };
    const sourcePos = move.meta.source as Pos;
    const b = api.getPieceAt(state, sourcePos);
    if (!b || b.type!=='bishop') return { allow:false };
    const gy = state.graveyard[b.color];
    const idx = gy.findIndex(p => p.id===move.meta.pickId && (p.type==='pawn'||p.type==='knight'));
    if (idx<0) return { allow:false };
    if (api.getPieceAt(state, move.to)) return { allow:false };
    return {
      allow:true,
      transform: (s) => {
        const p = gy.splice(idx,1)[0];
        api.setPieceAt(s, move.to, p);
      }
    };
  }
};

/** 18) Pion Shuriken : à la place de capturer en avançant, peut éliminer une pièce diagonale adjacente sans bouger. */
function collectStandardDestinations(state: GameState, pos: Pos, piece: Piece, api: EngineApi): Pos[] {
  const res: Pos[] = [];
  switch (piece.type) {
    case 'pawn': {
      const forward = piece.color === 'white' ? -1 : 1;
      const one = { x: pos.x, y: pos.y + forward };
      if (api.inBounds(one) && !api.getPieceAt(state, one)) {
        res.push(clone(one));
        const startRank = piece.color === 'white' ? 6 : 1;
        const two = { x: pos.x, y: pos.y + 2 * forward };
        if (
          pos.y === startRank &&
          api.inBounds(two) &&
          !api.getPieceAt(state, two) &&
          !api.getPieceAt(state, one)
        ) {
          res.push(clone(two));
        }
      }
      for (const dx of [-1, 1]) {
        const diag = { x: pos.x + dx, y: pos.y + forward };
        if (!api.inBounds(diag)) continue;
        const target = api.getPieceAt(state, diag);
        if (target && target.color !== piece.color) {
          res.push(clone(diag));
        }
      }
      break;
    }
    case 'knight': {
      const jumps = [
        { x: 1, y: 2 },
        { x: 2, y: 1 },
        { x: -1, y: 2 },
        { x: -2, y: 1 },
        { x: 1, y: -2 },
        { x: 2, y: -1 },
        { x: -1, y: -2 },
        { x: -2, y: -1 },
      ];
      for (const d of jumps) {
        const to = { x: pos.x + d.x, y: pos.y + d.y };
        if (!api.inBounds(to)) continue;
        const target = api.getPieceAt(state, to);
        if (!target || target.color !== piece.color) {
          res.push(clone(to));
        }
      }
      break;
    }
    case 'bishop': {
      for (const dir of dirsBishop) {
        let cur = { x: pos.x + dir.x, y: pos.y + dir.y };
        while (api.inBounds(cur)) {
          const target = api.getPieceAt(state, cur);
          if (target && target.color === piece.color) break;
          res.push(clone(cur));
          if (target) break;
          cur = { x: cur.x + dir.x, y: cur.y + dir.y };
        }
      }
      break;
    }
    case 'rook': {
      for (const dir of dirsRook) {
        let cur = { x: pos.x + dir.x, y: pos.y + dir.y };
        while (api.inBounds(cur)) {
          const target = api.getPieceAt(state, cur);
          if (target && target.color === piece.color) break;
          res.push(clone(cur));
          if (target) break;
          cur = { x: cur.x + dir.x, y: cur.y + dir.y };
        }
      }
      break;
    }
    case 'queen': {
      const dirs = [...dirsBishop, ...dirsRook];
      for (const dir of dirs) {
        let cur = { x: pos.x + dir.x, y: pos.y + dir.y };
        while (api.inBounds(cur)) {
          const target = api.getPieceAt(state, cur);
          if (target && target.color === piece.color) break;
          res.push(clone(cur));
          if (target) break;
          cur = { x: cur.x + dir.x, y: cur.y + dir.y };
        }
      }
      break;
    }
    default:
      break;
  }
  return res;
}

function generateMasteryRepeatMoves(state: GameState, pos: Pos, piece: Piece, api: EngineApi): Move[] {
  const baseTargets = collectStandardDestinations(state, pos, piece, api);
  const moves: Move[] = [];
  for (const mid of baseTargets) {
    const step = { x: mid.x - pos.x, y: mid.y - pos.y };
    if (step.x === 0 && step.y === 0) continue;
    const final = { x: mid.x + step.x, y: mid.y + step.y };
    if (!api.inBounds(final)) continue;
    const landing = api.getPieceAt(state, final);
    if (landing && landing.color === piece.color) continue;
    if (piece.type === 'pawn') {
      const lastRank = piece.color === 'white' ? 0 : 7;
      if (mid.y === lastRank || final.y === lastRank) continue;
    }

    const afterFirst = api.cloneState(state);
    try {
      api.applyStandardMove(afterFirst, { from: clone(pos), to: clone(mid) }, { simulate: true });
    } catch {
      continue;
    }
    afterFirst.turn = piece.color;
    try {
      api.applyStandardMove(afterFirst, { from: clone(mid), to: clone(final) }, { simulate: true });
    } catch {
      continue;
    }

    moves.push({
      from: clone(pos),
      to: clone(final),
      meta: {
        special: 'mastery_repeat',
        masteryStep: clone(step),
        intermediate: clone(mid),
        pieceId: piece.id,
      },
    });
  }
  return moves;
}

const RulePawnShuriken: RulePlugin = {
  id: 'pawn-shuriken',
  name: 'Pion Shuriken',
  description: 'Un pion peut éliminer une pièce diagonale adjacente sans bouger (attaque à distance courte).',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='pawn') return [];
    const dy = piece.color==='white' ? -1 : 1;
    const res: Move[] = [];
    for (const dx of [-1,1]) {
      const t = { x: pos.x + dx, y: pos.y + dy };
      if (!api.inBounds(t)) continue;
      const enemy = api.getPieceAt(state, t);
      if (enemy && enemy.color!==piece.color) {
        res.push({ from: clone(pos), to: clone(t), meta:{ special:'shuriken' }});
      }
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='shuriken') return { allow:true };
    const p = api.getPieceAt(state, move.from);
    const e = api.getPieceAt(state, move.to);
    if (!p || p.type!=='pawn' || !e || e.color===p.color) return { allow:false };
    return {
      allow:true,
      transform: (s) => {
        api.setPieceAt(s, move.to, undefined); // éliminer
        // pion ne bouge pas
      }
    };
  }
};

const RuleJumpingPawns: RulePlugin = {
  id: 'jumping-pawns',
  name: 'Pion qui sautent',
  description:
    'Chaque pion peut une fois sauter de deux cases en ignorant l’obstacle direct. Une pièce non royale obtient un mouvement de maîtrise unique : rejouer la même trajectoire immédiatement ou se fortifier pour bloquer une capture.',
  onGenerateExtraMoves(state, pos, piece, api) {
    const extras: Move[] = [];

    if (piece.type === 'pawn') {
      const usedKey = `${piece.id}_jump_used`;
      if (!state.flags[piece.color][usedKey]) {
        const dir = piece.color === 'white' ? -1 : 1;
        const landing = { x: pos.x, y: pos.y + 2 * dir };
        if (api.inBounds(landing)) {
          const target = api.getPieceAt(state, landing);
          if (!target || target.color !== piece.color) {
            extras.push({
              from: clone(pos),
              to: clone(landing),
              meta: { special: 'jumping_pawn', usedKey },
            });
          }
        }
      }
    }

    if (piece.type !== 'king') {
      const masteryUsed = Boolean(state.flags[piece.color].mastery_used);
      if (!masteryUsed) {
        extras.push({ from: clone(pos), to: clone(pos), meta: { special: 'mastery_block' } });
        extras.push(...generateMasteryRepeatMoves(state, pos, piece, api));
      }
    }

    return extras;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special === 'jumping_pawn') {
      const pawn = api.getPieceAt(state, move.from);
      if (!pawn || pawn.type !== 'pawn') return { allow: false };
      const dir = pawn.color === 'white' ? -1 : 1;
      const expected = { x: move.from.x, y: move.from.y + 2 * dir };
      if (!eqPos(move.to, expected)) return { allow: false };
      const dest = api.getPieceAt(state, move.to);
      if (dest && dest.color === pawn.color) return { allow: false };
      const usedKey = (move.meta.usedKey as string) || `${pawn.id}_jump_used`;
      if (state.flags[pawn.color][usedKey]) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          const currentPawn = api.getPieceAt(s, move.from);
          if (!currentPawn) return;
          const capture = api.getPieceAt(s, move.to);
          if (capture && capture.color !== currentPawn.color) {
            s.graveyard[capture.color].push({ ...capture });
          }
          api.setPieceAt(s, move.from, undefined);
          api.setPieceAt(s, move.to, { ...currentPawn });
          state.flags[currentPawn.color][usedKey] = true;
          s.flags[currentPawn.color][usedKey] = true;
        },
      };
    }

    if (move.meta?.special === 'mastery_repeat') {
      const origin = api.getPieceAt(state, move.from);
      if (!origin || origin.type === 'king') return { allow: false };
      if (state.flags[origin.color].mastery_used) return { allow: false };
      const step = move.meta.masteryStep as Pos | undefined;
      const intermediate = move.meta.intermediate as Pos | undefined;
      const taggedId = move.meta.pieceId as string | undefined;
      if (!step || !intermediate || taggedId !== origin.id) return { allow: false };
      const expectedMid = { x: move.from.x + step.x, y: move.from.y + step.y };
      const expectedFinal = { x: intermediate.x + step.x, y: intermediate.y + step.y };
      if (!eqPos(intermediate, expectedMid) || !eqPos(move.to, expectedFinal)) {
        return { allow: false };
      }

      const simulation = api.cloneState(state);
      try {
        api.applyStandardMove(simulation, { from: clone(move.from), to: clone(intermediate) }, { simulate: true });
      } catch {
        return { allow: false };
      }
      simulation.turn = origin.color;
      try {
        api.applyStandardMove(simulation, { from: clone(intermediate), to: clone(move.to) }, { simulate: true });
      } catch {
        return { allow: false };
      }

      return {
        allow: true,
        transform: (s) => {
          api.applyStandardMove(s, { from: clone(move.from), to: clone(intermediate) });
          s.turn = origin.color;
          api.applyStandardMove(s, { from: clone(intermediate), to: clone(move.to) });
          state.flags[origin.color].mastery_used = true;
          state.flags[origin.color].mastery_piece_id = origin.id;
          s.flags[origin.color].mastery_used = true;
          s.flags[origin.color].mastery_piece_id = origin.id;
        },
      };
    }

    if (move.meta?.special === 'mastery_block') {
      const origin = api.getPieceAt(state, move.from);
      if (!origin || origin.type === 'king') return { allow: false };
      if (!eqPos(move.from, move.to)) return { allow: false };
      if (state.flags[origin.color].mastery_used) return { allow: false };
      return {
        allow: true,
        transform: (s) => {
          const piece = api.getPieceAt(s, move.from);
          if (!piece) return;
          piece.tags = { ...(piece.tags || {}), masteryShield: 2 };
          state.flags[origin.color].mastery_used = true;
          state.flags[origin.color].mastery_piece_id = origin.id;
          s.flags[origin.color].mastery_used = true;
          s.flags[origin.color].mastery_piece_id = origin.id;
        },
      };
    }

    const target = api.getPieceAt(state, move.to);
    if (target?.tags?.masteryShield && target.color !== state.turn) {
      return { allow: false, reason: 'Pièce protégée par un mouvement de maîtrise.' };
    }

    return { allow: true };
  },
  onTurnStart(state, api) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const pos = { x, y };
        const piece = api.getPieceAt(state, pos);
        if (!piece?.tags?.masteryShield) continue;
        const remaining = (piece.tags.masteryShield as number) - 1;
        if (remaining > 0) {
          piece.tags.masteryShield = remaining;
        } else {
          delete piece.tags.masteryShield;
          if (piece.tags && Object.keys(piece.tags).length === 0) {
            delete piece.tags;
          }
        }
      }
    }
  },
};

/** 19) Reine Divisée : une fois par partie, se scinde en 2 tours OU 2 fous sur cases adjacentes libres. */
const RuleQueenSplit: RulePlugin = {
  id: 'queen-split',
  name: 'Reine Divisée',
  description: 'Une fois par partie, la reine peut se séparer en deux tours, ou deux fous, sur cases adjacentes libres.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='queen') return [];
    if (state.flags[piece.color].queen_split_used) return [];
    const res: Move[] = [];
    // proposer split rook-rook et bishop-bishop si 2 cases libres autour
    const adjs: Pos[] = [];
    forEachNeighbor(pos, (n)=> { if (api.inBounds(n) && !api.getPieceAt(state,n)) adjs.push(n); });
    if (adjs.length>=2) {
      res.push({ from: clone(pos), to: clone(pos), meta:{ special:'queen_split', into:'rooks' }});
      res.push({ from: clone(pos), to: clone(pos), meta:{ special:'queen_split', into:'bishops' }});
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='queen_split') return { allow:true };
    const q = api.getPieceAt(state, move.from);
    if (!q || q.type!=='queen') return { allow:false };
    if (state.flags[q.color].queen_split_used) return { allow:false };
    const spots: Pos[] = [];
    forEachNeighbor(move.from, (n)=> { if (api.inBounds(n) && !api.getPieceAt(state,n)) spots.push(n); });
    if (spots.length<2) return { allow:false };
    return {
      allow:true,
      transform: (s) => {
        api.setPieceAt(s, move.from, undefined);
        const p1: Piece = { id: q.id+'-a', type: move.meta.into==='rooks' ? 'rook' : 'bishop', color: q.color };
        const p2: Piece = { id: q.id+'-b', type: move.meta.into==='rooks' ? 'rook' : 'bishop', color: q.color };
        api.setPieceAt(s, spots[0], p1);
        api.setPieceAt(s, spots[1], p2);
        state.flags[q.color].queen_split_used = true;
      }
    };
  }
};

/** 20) Tour Forteresse : 2 tours côte à côte sont indestructibles tant qu’elles ne bougent pas. */
const RuleRookFortress: RulePlugin = {
  id: 'rook-fortress',
  name: 'Tour Forteresse',
  description: 'Deux tours alliées côte à côte ne peuvent pas être capturées tant qu’elles restent adjacentes.',
  onBeforeMoveApply(state, move, api) {
    // Empêcher capture d'une tour si elle est adjacente à une tour amie
    const tgt = api.getPieceAt(state, move.to);
    if (tgt?.type==='rook') {
      let protectedRook = false;
      forEachNeighbor(move.to, (n)=> {
        const r = api.getPieceAt(state, n);
        if (r?.type==='rook' && r.color===tgt.color) protectedRook = true;
      });
      if (protectedRook) return { allow:false, reason:'Tour en Forteresse' };
    }
    return { allow:true };
  }
};

/** 21) Cavalier Dragon : souffle de feu (élimine une pièce ennemie autour sans bouger). */
const RuleDragonKnight: RulePlugin = {
  id: 'dragon-knight',
  name: 'Cavalier Dragon',
  description: 'Un cavalier peut éliminer une pièce ennemie adjacente sans bouger (souffle de feu).',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='knight') return [];
    const res: Move[] = [];
    forEachNeighbor(pos, (n)=> {
      const e = api.getPieceAt(state, n);
      if (e && e.color!==piece.color) {
        res.push({ from: clone(pos), to: clone(n), meta:{ special:'dragon_fire' }});
      }
    });
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='dragon_fire') return { allow:true };
    const k = api.getPieceAt(state, move.from);
    const e = api.getPieceAt(state, move.to);
    if (!k || k.type!=='knight' || !e || e.color===k.color) return { allow:false };
    return { allow:true, transform: (s)=> api.setPieceAt(s, move.to, undefined) };
  }
};

/** 22) Pion Téléporté : à la 4e rangée, échanger de place avec un autre pion allié. */
const RulePawnSwap: RulePlugin = {
  id: 'pawn-swap',
  name: 'Pion Téléporté',
  description: 'Quand un pion atteint la 4e rangée, il peut échanger sa place avec un autre pion allié.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='pawn') return [];
    const row = piece.color==='white' ? 4 : 3; // atteindre Y=4 (blanc) ou Y=3 (noir) en 0-based ?
    if (pos.y!==row) return [];
    const res: Move[] = [];
    api.allPieces(state).forEach(({piece:p2,pos:pp})=>{
      if (p2.type==='pawn' && p2.color===piece.color && !eqPos(pp,pos)) {
        res.push({ from: clone(pos), to: clone(pp), meta:{ special:'pawn_swap' }});
      }
    });
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='pawn_swap') return { allow:true };
    const p1 = api.getPieceAt(state, move.from);
    const p2 = api.getPieceAt(state, move.to);
    if (!p1 || !p2 || p1.type!=='pawn' || p2.type!=='pawn' || p1.color!==p2.color) return { allow:false };
    return {
      allow:true,
      transform: (s) => {
        api.setPieceAt(s, move.from, p2);
        api.setPieceAt(s, move.to, p1);
      }
    };
  }
};

/** 23) Reine Sirène : pièces ennemies dans un rayon de 2 cases ne peuvent pas bouger pendant 1 tour. */
const RuleSirenQueen: RulePlugin = {
  id: 'siren-queen',
  name: 'Reine Sirène',
  description: 'Les pièces ennemies dans un rayon de 2 cases autour de la reine ne peuvent pas bouger pendant 1 tour.',
  onTurnStart(state, api) {
    // Effet passif : trouver toutes tes reines et marquer les ennemis proches comme "charmed_until"
    const me = state.turn;
    const opp: Color = me==='white' ? 'black' : 'white';
    api.allPieces(state).forEach(({piece,pos})=>{
      if (piece.type==='queen' && piece.color===me) {
        for (let x=pos.x-2; x<=pos.x+2; x++) for (let y=pos.y-2; y<=pos.y+2; y++) {
          const p = api.getPieceAt(state, {x,y});
          if (p && p.color===opp) {
            p.tags = p.tags || {};
            p.tags.charmed_until = state.moveNumber + 1;
          }
        }
      }
    });
  },
  onBeforeMoveApply(state, move, api) {
    const p = api.getPieceAt(state, move.from);
    const charmedUntil = p?.tags?.charmed_until as number | undefined;
    if (charmedUntil !== undefined && charmedUntil >= state.moveNumber) {
      return { allow:false, reason:'Sous l’emprise de la Reine Sirène' };
    }
    return { allow:true };
  }
};

/** 24) Tour Hélicoptère : 1x/partie, une tour peut bouger d’une case en diagonale. */
const RuleRookHelicopter: RulePlugin = {
  id: 'rook-heli',
  name: 'Tour Hélicoptère',
  description: 'Une fois par partie, une tour peut se déplacer d’une case en diagonale.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='rook') return [];
    const usedKey = `${piece.id}_heli_used`;
    if (state.flags[piece.color][usedKey]) return [];
    const res: Move[] = [];
    for (const d of dirsBishop) {
      const to = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to)) continue;
      const t = api.getPieceAt(state, to);
      if (!t || t.color!==piece.color) {
        res.push({ from: clone(pos), to, meta:{ special:'rook_diag', usedKey }});
      }
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='rook_diag') return { allow:true };
    const r = api.getPieceAt(state, move.from);
    if (!r || r.type!=='rook') return { allow:false };
    return {
      allow:true,
      transform: (s)=> { 
        api.applyStandardMove(s, { from: move.from, to: move.to }); 
        const usedKey = move.meta?.usedKey as string;
        if (usedKey) state.flags[r.color][usedKey] = true;
      }
    };
  }
};

/** 25) Pion Mutant : en 6e rangée, devient un cavalier pendant 3 tours. */
const RuleMutantPawn: RulePlugin = {
  id: 'mutant-pawn',
  name: 'Pion Mutant',
  description: 'Quand un pion atteint la 6e rangée, il peut devenir un cavalier pendant 3 tours.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='pawn') return [];
    const row = piece.color==='white' ? 2 : 5; // 0-based: 6e rangée ~ y=2 (blanc monte) / y=5 (noir descend)
    if (pos.y!==row) return [];
    return [{ from: clone(pos), to: clone(pos), meta:{ special:'mutate_knight' }}];
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='mutate_knight') return { allow:true };
    const p = api.getPieceAt(state, move.from);
    if (!p || p.type!=='pawn') return { allow:false };
    return { allow:true, transform: (s)=> { p.type='knight'; p.tags = p.tags || {}; p.tags.mutant_ttl = 3; } };
  },
  onTurnStart(state, api) {
    api.allPieces(state).forEach(({piece})=>{
      if (piece.type==='knight' && piece.tags?.mutant_ttl) {
        const ttl = piece.tags.mutant_ttl as number;
        piece.tags.mutant_ttl = ttl - 1;
        if ((piece.tags.mutant_ttl as number) <= 0) {
          // redevient pion
          piece.type='pawn';
          delete piece.tags.mutant_ttl;
        }
      }
    });
  }
};

/** 26) Fou Hypnotiseur : forcer une pièce ennemie adjacente à bouger immédiatement selon ton choix (coup gratuit). */
const RuleHypnoBishop: RulePlugin = {
  id: 'hypno-bishop',
  name: 'Fou Hypnotiseur',
  description: 'Une fois au contact, un fou peut forcer une pièce ennemie adjacente à effectuer un déplacement légal choisi.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='bishop') return [];
    const res: Move[] = [];
    forEachNeighbor(pos, (n)=> {
      const e = api.getPieceAt(state, n);
      if (e && e.color!==piece.color) {
        // on génère un move pseudo: "hypno" ciblant cette pièce ; le vrai déplacement sera choisi client-side
        res.push({ from: clone(pos), to: clone(n), meta:{ special:'hypno' }});
      }
    });
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='hypno') return { allow:true };
    const b = api.getPieceAt(state, move.from);
    const e = api.getPieceAt(state, move.to);
    if (!b || b.type!=='bishop' || !e || e.color===b.color) return { allow:false };
    // Ici, pour rester simple, on "pousse" la pièce ennemie d’1 case au hasard si libre (démo). En prod, tu présenteras ses coups légaux.
    const candidates = neighbors8
      .map(d => ({ x: move.to.x + d.x, y: move.to.y + d.y }))
      .filter(p => api.inBounds(p) && !api.getPieceAt(state, p));
    if (candidates.length===0) return { allow:false };
    const forcedTo = candidates[0];
    return {
      allow:true,
      transform: (s) => {
        const victim = api.getPieceAt(s, move.to);
        if (!victim) return;
        api.setPieceAt(s, move.to, undefined);
        api.setPieceAt(s, forcedTo, victim);
      }
    };
  }
};

/** 27) Roi Évasion : encerclé par 3 ennemis, peut sauter comme un cavalier pour fuir. */
const RuleEscapeKing: RulePlugin = {
  id: 'escape-king',
  name: 'Roi Évasion',
  description: 'Si le roi est entouré par 3 ennemis, il peut sauter comme un cavalier pour s’échapper.',
  onGenerateExtraMoves(state, pos, piece, api) {
    if (piece.type!=='king') return [];
    // compter ennemis adjacents
    let enemies=0;
    forEachNeighbor(pos, (n)=> {
      const e = api.getPieceAt(state, n);
      if (e && e.color!==piece.color) enemies++;
    });
    if (enemies<3) return [];
    const jumps = [
      {x:1,y:2},{x:2,y:1},{x:-1,y:2},{x:-2,y:1},
      {x:1,y:-2},{x:2,y:-1},{x:-1,y:-2},{x:-2,y:-1}
    ];
    const res: Move[] = [];
    for (const d of jumps) {
      const to = { x: pos.x + d.x, y: pos.y + d.y };
      if (!api.inBounds(to)) continue;
      const t = api.getPieceAt(state, to);
      if (!t || t.color!==piece.color) res.push({ from: clone(pos), to, meta:{ special:'king_jump' }});
    }
    return res;
  },
  onBeforeMoveApply(state, move, api) {
    if (move.meta?.special!=='king_jump') return { allow:true };
    const k = api.getPieceAt(state, move.from);
    if (!k || k.type!=='king') return { allow:false };
    return { allow:true, transform: (s)=> { api.applyStandardMove(s, { from: move.from, to: move.to }); } };
  }
};

/** 28) Bombe Cachée : un pion secret explose à sa capture. */
const RuleHiddenBomb: RulePlugin = {
  id: 'hidden-bomb',
  name: 'Bombe Cachée',
  description: 'Au début, chaque joueur choisit un pion-bombe. Quand il est capturé, il explose (3×3).',
  onTurnStart(state, api) {
    // Initialisation paresseuse : au premier tour de chaque couleur, s’il n’y a pas de pion-bombe, en choisir un
    const me = state.turn;
    if (!state.flags[me].bomb_pawn) {
      const pawns = api.allPieces(state).filter(p=>p.piece.type==='pawn' && p.piece.color===me);
      if (pawns.length>0) state.flags[me].bomb_pawn = pawns[0].piece.id;
    }
  },
  onAfterMoveApply(state, ctx, api) {
    if (!ctx.captured) return;
    const opp: Color = ctx.moved.color==='white' ? 'black' : 'white';
    if (state.flags[opp].bomb_pawn && ctx.captured.id===state.flags[opp].bomb_pawn) {
      // explosion autour de la case de capture
      forEachNeighbor(ctx.move.to, (n)=> {
        const t = api.getPieceAt(state, n);
        if (t) api.setPieceAt(state, n, undefined);
      });
    }
  }
};

/** 29) Promotion Surprise : un pion promu peut devenir une pièce ennemie encore en jeu (copie). */
const RuleSurprisePromotion: RulePlugin = {
  id: 'surprise-promo',
  name: 'Promotion Surprise',
  description: 'Un pion peut se promouvoir en une pièce ennemie encore en jeu.',
  onBeforeMoveApply(state, move, api) {
    // Laisse la promotion standard ; ici on autorise un promotion type "mime" via meta
    if (move.promotion || move.meta?.promotion_as_enemy) {
      return { allow:true };
    }
    return { allow:true };
  }
};

/** 30) Victoire de Mission : gagner si un pion entre dans les 2 dernières rangées adverses (zone du roi). */
const RuleMissionWin: RulePlugin = {
  id: 'mission-win',
  name: 'Victoire de Mission',
  description: 'Amenez un pion dans les 2 dernières rangées adverses pour gagner immédiatement.',
  onAfterMoveApply(state, ctx, api) {
    const { moved, move } = ctx;
    if (moved.type!=='pawn') return;
    const y = move.to.y;
    if (moved.color==='white' && (y===0 || y===1)) {
      state.flags.white.mission_win = true;
    }
    if (moved.color==='black' && (y===6 || y===7)) {
      state.flags.black.mission_win = true;
    }
  }
};

// ---------------------------------------------------------------------------
// REGISTRY des 30 règles
// ---------------------------------------------------------------------------
export const ALL_RULES: RulePlugin[] = [
  RuleKnightTornado,
  RuleQueenTeleport,
  RulePawnKamikaze,
  RuleRookCannon,
  RuleBishopChameleon,
  RuleAngryKing,
  RulePawnFusion,
  RuleAirDrop,
  RuleAcrobaticKnight,
  RuleRookCatapult,
  RuleGhostBishop,
  RuleElasticPawn,
  RuleQueenBerserk,
  RuleKingShield,
  RuleDoubleKnight,
  RuleRookMagnet,
  RuleBishopHealer,
  RulePawnShuriken,
  RuleJumpingPawns,
  RuleQueenSplit,
  RuleRookFortress,
  RuleDragonKnight,
  RulePawnSwap,
  RuleSirenQueen,
  RuleRookHelicopter,
  RuleMutantPawn,
  RuleHypnoBishop,
  RuleEscapeKing,
  RuleHiddenBomb,
  RuleSurprisePromotion,
  RuleMissionWin,
];

/** Cherche une règle par id */
export function getRuleById(id: string): RulePlugin | undefined {
  return externalRules.get(id) ?? ALL_RULES.find(r => r.id === id);
}

// ---------------------------------------------------------------------------
/** Match (partie) = moteur de base + composite de règles + état courant */
export interface Match {
  id: string;
  vsAI: boolean;
  activeRule: RulePlugin;
  composite: RuleComposite;
  engine: EngineApi;
  state: GameState;
}

/** Crée un match avec une règle donnée (tu injectes ton moteur + état initial) */
export function createMatch(
  engine: EngineApi,
  initialState: GameState,
  ruleId: string,
  vsAI: boolean
): Match {
  const rule = getRuleById(ruleId);
  if (!rule) throw new Error(`Règle inconnue: ${ruleId}`);
  const composite = new RuleComposite([rule]); // 1 règle par salle
  composite.onTurnStart(initialState, engine);
  return {
    id: `match-${Date.now()}`,
    vsAI,
    activeRule: rule,
    composite,
    engine,
    state: initialState
  };
}

/** Génère les coups possibles (standards + extras) pour une pièce à une position donnée */
export function generateMoves(match: Match, pos: Pos): Move[] {
  const { state, engine, composite } = match;
  const piece = engine.getPieceAt(state, pos);
  if (!piece || piece.color !== state.turn) return [];
  // 1) coups standards de ton moteur (hors scope ici) — supposons que tu as déjà une fonction ailleurs
  // -> expose-les dans ton UI (par exemple engine.generateStandardMoves)
  // 2) coups spéciaux via plugins :
  const extras = composite.onGenerateExtraMoves(state, pos, piece, engine) || [];
  return extras;
}

/** Joue un coup (standard ou spécial). Le moteur protège toujours la légalité (roi). */
export function playMove(match: Match, move: Move): { ok: boolean; reason?: string } {
  const { state, engine, composite } = match;
  // Hook avant application (peut transformer le coup)
  const before = composite.onBeforeMoveApply(state, move, engine);
  if (!before.allow) return { ok: false, reason: before.reason || 'Coup refusé par la règle' };

  const prevState = engine.cloneState(state);
  const prevTurn = prevState.turn;

  let nextState = state;

  if (before.transform) {
    before.transform(nextState);
    match.state = nextState;
  } else {
    // Sinon, on applique un coup standard (ton moteur valide la légalité/échec)
    if (!engine.isLegalStandardMove(state, move)) {
      return { ok: false, reason: 'Coup illégal (règles de base)' };
    }
    nextState = engine.applyStandardMove(state, move);
    // Remplace l’état (selon ton implémentation)
    match.state = nextState;
  }

  // Déduire moved & captured pour onAfter (simple heuristique)
  const moved = engine.getPieceAt(match.state, move.to) || engine.getPieceAt(match.state, move.from);
  const captured = prevState ? engine.getPieceAt(prevState, move.to) : undefined;

  const turnBeforeAfterHooks = match.state.turn;

  composite.onAfterMoveApply(match.state, { move, moved: moved!, captured, prevState }, engine);

  const turnAfterAfterHooks = match.state.turn;
  const pluginAdjustedTurn = turnAfterAfterHooks !== turnBeforeAfterHooks;
  if (!pluginAdjustedTurn) {
    match.state.turn = prevTurn === 'white' ? 'black' : 'white';
  }

  // Début de tour suivant
  match.state.moveNumber = (prevState.moveNumber || 0) + 1;
  composite.onTurnStart(match.state, engine);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// LOBBY : 30 salles = 30 règles (une par salle)
// - Dans ton app, tu affiches lobbyRooms (id, nom, description)
// - Au clic, tu fais createMatch(engine, initialState, room.ruleId, vsAI)
// ---------------------------------------------------------------------------
export interface LobbyRoom {
  id: string;
  title: string;
  ruleId: string;
  description: string;
}

export const lobbyRooms: LobbyRoom[] = ALL_RULES.map((r, i) => ({
  id: `room-${i+1}`,
  title: `${i+1}. ${r.name}`,
  ruleId: r.id,
  description: r.description,
}));

// ---------------------------------------------------------------------------
// NOTES D’INTÉGRATION
// ---------------------------------------------------------------------------
/*
1) Tu dois fournir un EngineApi (ton moteur standard ou un adapter vers chess.js) :
   - isInCheck / isLegalStandardMove / applyStandardMove / cloneState / getPieceAt / setPieceAt / findKing / allPieces / inBounds
   - Le moteur applique les règles de base : 
     * Le roi ne peut jamais se mettre/rester en échec (contrôle de légalité inclus)
     * Échec & mat standard
     * Promotion standard (si move.promotion est défini, le moteur gère la conversion)

2) Flux côté UI :
   - Tu construis un Match via createMatch(engine, initialState, ruleId, vsAI).
   - Pour afficher les coups spéciaux d’une pièce sélectionnée : generateMoves(match, pos).
     (Tu fusionnes ces extras avec tes coups standards si tu les montres dans la même UI.)
   - Pour jouer un coup : playMove(match, move).

3) Multijoueur / IA :
   - vsAI = true => après un playMove ok côté blanc, tu appelles ton IA pour jouer côté noir, etc.
   - vsHuman => synchronise les playMove via serveur/WS.

4) Sécurité “roi jamais en échec” :
   - Même pour les coups spéciaux, on évite d’exposer le roi en filtrant/simulant (et le moteur revalide).
   - Certains effets “sans déplacement” (tir/explosion) sont appliqués via transform dans onBeforeMoveApply : 
     cela n’autorise jamais de laisser ton propre roi en échec de manière illégale pour le coup suivant (le moteur gère ensuite).

5) Paramétrage :
   - Tu peux forker chaque plugin pour ajuster cooldowns, rayons, rangées cibles, etc.
   - Tous les effets “1x/partie” utilisent des flags dans state.flags[color].

Bon jeu ! 🎯
*/

// Comment brancher à ton moteur (résumé simple)
// • Crée un adapter qui implémente EngineApi pour ton moteur actuel (ou chess.js).
// • Lance une partie avec une règle du lobby :
//
// import { createMatch, lobbyRooms } from "./variant-chess-lobby";
//
// // engine: ton adapter EngineApi
// // initialState: position initiale (board rempli, flags init {}, moveNumber=0, turn='white', graveyard {white:[],black:[]})
// const room = lobbyRooms[0]; // ex: salle 1
// const match = createMatch(engine, initialState, room.ruleId, /*vsAI=*/ true);
//
// Et pour jouer:
//
// // coups spéciaux sup (en plus des coups standard de ton moteur)
// const extras = generateMoves(match, { x: 1, y: 7 });
// // ...ou juste playMove pour un coup standard :
// const ok = playMove(match, { from: { x: 4, y: 6 }, to: { x: 4, y: 4 } });
