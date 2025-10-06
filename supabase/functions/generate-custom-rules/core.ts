import { compileRuleSpec, RuleCompilationError } from "../_shared/rulesets/compiler.ts";
import type { CompiledRuleset, RuleSpec } from "../_shared/rulesets/types.ts";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export interface CustomRulesRequest {
  description: string;
  difficulty?: DifficultyLevel;
  ruleName?: string;
}

export interface CustomRulesResponse {
  rules: string;
  difficulty: DifficultyLevel;
  ruleId: string;
  ruleName: string;
  pluginCode: string;
  warning?: string;
  compiledRuleset: CompiledRuleset;
  compiledHash: string;
  ruleSpec: RuleSpec;
  compilerWarnings?: string[];
}

export interface GenerateCustomRulesOptions {
  lovableApiKey?: string;
  logger?: Pick<typeof console, "error" | "warn" | "info">;
  fetchImpl?: typeof fetch;
}

const stripDiacritics = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const toSearchable = (value: string) => stripDiacritics(value).toLowerCase();

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObjectKeys(item)] as const);

    return Object.fromEntries(entries);
  }

  return value;
};

const computeCompiledRulesetHash = async (ruleset: CompiledRuleset): Promise<string> => {
  const canonical = JSON.stringify(sortObjectKeys(ruleset));
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

type PrecompiledVariant = {
  matches: (searchableDescription: string) => boolean;
  ruleset: CompiledRuleset;
  warning?: string;
};

const PRECOMPILED_VARIANTS: PrecompiledVariant[] = [
  {
    matches: (text) =>
      text.includes("pion") &&
      (text.includes("saute") || text.includes("sauter") || text.includes("saut ") || text.includes("bond")) &&
      (text.includes("par dessus") || text.includes("pardessus") || text.includes("enjambe")),
    ruleset: {
      meta: {
        name: "Pion saute par-dessus",
        id: "pion-saute-par-dessus",
        base: "chess-base@1.0.0",
        version: "1.0.0",
        description: "Les pions gardent leurs déplacements et captures habituels. En plus, si une pièce (alliée ou ennemie) bloque la case immédiatement devant, un pion peut sauter au-dessus et atterrir deux cases devant, si la case d'atterrissage est vide. Ce saut n'est pas une capture.",
      },
      board: { size: "8x8", zones: [] },
      pieces: [
        {
          id: "king",
          from: "king",
          side: "both",
          moves: [{ pattern: "king" }],
          spawn: { count: 2, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 2, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 4, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 4, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 4, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 16,
            startSquares: [
              "a2",
              "b2",
              "c2",
              "d2",
              "e2",
              "f2",
              "g2",
              "h2",
              "a7",
              "b7",
              "c7",
              "d7",
              "e7",
              "f7",
              "g7",
              "h7",
            ],
          },
        },
      ],
      effects: [
        {
          id: "pawnLeapOverFrontIfBlocked",
          applyTo: ["pawn"],
          on: "onGenerateMoves",
          logic: "allowPawnLeapOverFrontIfBlocked",
          params: {
            white: { blockDx: 0, blockDy: 1, landDx: 0, landDy: 2 },
            black: { blockDx: 0, blockDy: -1, landDx: 0, landDy: -2 },
            requireEmptyLanding: true,
            captureOnLanding: false,
            ignoreCheckRules: false,
          },
        },
      ],
      rules: {
        turnOrder: "whiteThenBlack",
        checkRules: "classic",
        promotion: [{ piece: "pawn", to: ["queen", "rook", "bishop", "knight"] }],
        winConditions: [
          { type: "checkmate" },
          { type: "timeout" },
          { type: "stalemate", params: { result: "draw" } },
        ],
        conflictPolicy: {
          onDuplicatePieceId: "error",
          onMoveOverride: "replace",
          onEffectCollision: "priorityHighWins",
        },
      },
      tests: [
        {
          name: "Smoke",
          fen: "startpos",
          script: [
            { move: "e2-e4", by: "pawn" },
            { move: "b8-c6", by: "knight" },
          ],
        },
        {
          name: "Saut du pion bloqué",
          fen: "7p/8/8/8/8/3p4/3P4/8 w - - 0 1",
          script: [
            { move: "d2-d4", by: "pawn" },
            { move: "h7-h5", by: "pawn" },
          ],
        },
      ],
    },
  },
  {
    matches: (text) =>
      text.includes("pion") &&
      text.includes("tour") &&
      (text.includes("transform") || text.includes("promouv") || text.includes("promotion")) &&
      (text.includes("une fois") || text.includes("seule fois") || text.includes("uniquement") || text.includes("seulement")),
    ruleset: {
      meta: {
        name: "Promotion tour unique",
        id: "promotion-tour-unique",
        base: "chess-base@1.0.0",
        version: "1.0.0",
        description: "Variante classique où les pions ne peuvent se promouvoir qu'en tour, une seule option disponible à la promotion.",
        priority: 50,
      },
      board: { size: "8x8", zones: [] },
      pieces: [
        {
          id: "king",
          from: "king",
          side: "both",
          moves: [{ pattern: "king" }],
          spawn: { count: 2, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 2, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 4, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 4, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 4, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 16,
            startSquares: [
              "a2",
              "b2",
              "c2",
              "d2",
              "e2",
              "f2",
              "g2",
              "h2",
              "a7",
              "b7",
              "c7",
              "d7",
              "e7",
              "f7",
              "g7",
              "h7",
            ],
          },
        },
      ],
      effects: [],
      rules: {
        turnOrder: "whiteThenBlack",
        checkRules: "classic",
        promotion: [{ piece: "pawn", to: ["rook"] }],
        winConditions: [
          { type: "checkmate" },
          { type: "timeout" },
          { type: "stalemate", params: { result: "draw" } },
        ],
        conflictPolicy: {
          onDuplicatePieceId: "error",
          onMoveOverride: "replace",
          onEffectCollision: "priorityHighWins",
        },
      },
      tests: [
        {
          name: "Promotion en tour",
          fen: "8/P7/8/8/8/8/8/8 w - - 0 1",
          script: [{ move: "a7-a8=rook", by: "pawn" }],
        },
        {
          name: "Promotion en dame interdite",
          fen: "8/P7/8/8/8/8/8/8 w - - 0 1",
          script: [{ move: "a7-a8=queen", illegal: "INVALID_PROMOTION" }],
        },
      ],
    },
    warning: "Variante précompilée : promotion limitée à la tour.",
  },
  {
    matches: (text) =>
      text.includes("fou") && (text.includes("mine") || text.includes("explos") || text.includes("bombe")),
    ruleset: {
      meta: {
        name: "Fou: mine invisible",
        id: "fou-mine-invisible",
        base: "chess-base@1.0.0",
        version: "1.0.0",
        description: "Les règles classiques restent en vigueur. Chaque fou peut, une fois par partie, déposer une mine invisible sur sa case. La mine élimine la première pièce ennemie qui entre sur cette case. Les alliés ne déclenchent pas la mine. La mine est révélée à l'explosion.",
      },
      board: { size: "8x8", zones: [] },
      pieces: [
        {
          id: "king",
          from: "king",
          side: "both",
          moves: [{ pattern: "king" }],
          spawn: { count: 2, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 2, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 4, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 4, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 4, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 16,
            startSquares: [
              "a2",
              "b2",
              "c2",
              "d2",
              "e2",
              "f2",
              "g2",
              "h2",
              "a7",
              "b7",
              "c7",
              "d7",
              "e7",
              "f7",
              "g7",
              "h7",
            ],
          },
        },
      ],
      effects: [
        {
          id: "bishopPlaceInvisibleMine",
          applyTo: ["bishop"],
          when: "onPlayerAction",
          logic: "bishopPlaceInvisibleMine",
          params: {
            usesPerBishop: 1,
            placeOnCurrentSquare: true,
            trigger: "enemyStepsOn",
            affects: "enemyOnly",
            destroyEnteringPiece: true,
            revealOnDetonation: true,
          },
        },
      ],
      rules: {
        turnOrder: "whiteThenBlack",
        checkRules: "classic",
        promotion: [{ piece: "pawn", to: ["queen", "rook", "bishop", "knight"] }],
        winConditions: [
          { type: "checkmate" },
          { type: "timeout" },
          { type: "stalemate", params: { result: "draw" } },
        ],
        conflictPolicy: {
          onDuplicatePieceId: "error",
          onMoveOverride: "replace",
          onEffectCollision: "priorityHighWins",
        },
      },
      tests: [
        {
          name: "Smoke",
          fen: "startpos",
          script: [
            { move: "e2-e4", by: "pawn" },
            { move: "b8-c6", by: "knight" },
          ],
        },
        {
          name: "Déplacement du fou",
          fen: "startpos",
          script: [
            { move: "e2-e3", by: "pawn" },
            { move: "b8-c6", by: "knight" },
            { move: "f1-b5", by: "bishop" },
          ],
        },
      ],
    },
    warning: "Variante précompilée : capacité spéciale des fous.",
  },
  {
    matches: (text) => text.includes("dame") && (text.includes("gele") || text.includes("geler") || text.includes("freeze")),
    ruleset: {
      meta: {
        name: "Dame gèle une pièce",
        id: "dame-gele-une-piece",
        base: "chess-base@1.0.0",
        version: "1.0.0",
        description: "Chaque dame peut, une fois par partie, geler une pièce adverse visible sur ses lignes (comme un coup de dame). La pièce gelée ne peut ni se déplacer ni capturer pendant un tour adverse. Toutes les autres règles restent classiques.",
      },
      board: { size: "8x8", zones: [] },
      pieces: [
        {
          id: "king",
          from: "king",
          side: "both",
          moves: [{ pattern: "king" }],
          spawn: { count: 2, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 2, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 4, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 4, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 4, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 16,
            startSquares: [
              "a2",
              "b2",
              "c2",
              "d2",
              "e2",
              "f2",
              "g2",
              "h2",
              "a7",
              "b7",
              "c7",
              "d7",
              "e7",
              "f7",
              "g7",
              "h7",
            ],
          },
        },
      ],
      effects: [
        {
          id: "queenFreezeEnemy",
          applyTo: ["queen"],
          when: "onPlayerAction",
          logic: "freezeTargetAlongQueenLines",
          params: {
            usesPerQueen: 1,
            durationPlies: 2,
            cannot: ["move", "capture"],
            requiresLineOfSight: true,
            includeOrthogonalAndDiagonal: true,
          },
        },
      ],
      rules: {
        turnOrder: "whiteThenBlack",
        checkRules: "classic",
        promotion: [{ piece: "pawn", to: ["queen", "rook", "bishop", "knight"] }],
        winConditions: [
          { type: "checkmate" },
          { type: "timeout" },
          { type: "stalemate", params: { result: "draw" } },
        ],
        conflictPolicy: {
          onDuplicatePieceId: "error",
          onMoveOverride: "replace",
          onEffectCollision: "priorityHighWins",
        },
      },
      tests: [
        {
          name: "Smoke",
          fen: "startpos",
          script: [
            { move: "e2-e4", by: "pawn" },
            { move: "b8-c6", by: "knight" },
          ],
        },
        {
          name: "Mobilité de la dame",
          fen: "startpos",
          script: [
            { move: "d2-d4", by: "pawn" },
            { move: "g8-f6", by: "knight" },
            { move: "d1-h5", by: "queen" },
          ],
        },
      ],
    },
    warning: "Variante précompilée : gel des dames.",
  },
];

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "débutant",
  intermediate: "intermédiaire",
  advanced: "avancé",
};

const focusPoints: Record<DifficultyLevel, string> = {
  beginner: "l'apprentissage des mouvements de base et des principes simples",
  intermediate: "la planification, la tactique et l'anticipation des échanges",
  advanced: "les stratégies complexes, la gestion du temps et la pression positionnelle",
};

const specialActions: Record<DifficultyLevel, string> = {
  beginner:
    "Une pièce alliée peut, une fois par partie, se repositionner sur une case libre adjacente à votre roi pour clarifier les mouvements essentiels.",
  intermediate:
    "Choisissez une pièce (hors roi) qui obtient un « mouvement de maîtrise » utilisable une fois par partie : elle peut soit répéter son déplacement habituel, soit rester en place pour bloquer une attaque.",
  advanced:
    "Désignez une pièce majeure qui reçoit une « impulsion stratégique » : une seule fois par partie, elle peut cumuler deux déplacements légaux successifs tant qu'elle ne donne pas échec direct.",
};

const endgameChallenges: Record<DifficultyLevel, string> = {
  beginner:
    "atteindre la promotion d'un pion ou mettre le roi adverse en échec et mat en moins de 30 coups pour encourager la progression",
  intermediate:
    "gagner en conservant au moins une pièce mineure en vie, ce qui pousse à équilibrer attaque et défense",
  advanced:
    "remporter la partie après avoir exécuté une combinaison tactique impliquant au moins trois pièces différentes",
};

const buildPawnBackwardRecipe = (suggestedRuleName: string): RuleSpec => ({
  meta: {
    name: suggestedRuleName || "Pions avec recul",
    base: "chess-base@1.0.0",
    version: "1.0.0",
    description: "Les pions peuvent reculer d'une case (sans capture arrière).",
    priority: 50,
  },
  patches: [
    {
      op: "extend",
      path: "pieces[id=pawn].moves",
      value: [
        {
          type: "move",
          vectorsWhite: [[0, -1]],
          vectorsBlack: [[0, 1]],
          maxSteps: 1,
        },
      ],
    },
  ],
  tests: [
    {
      name: "Pion blanc peut reculer",
      fen: "startpos",
      script: [
        { move: "e2-e3", by: "pawn" },
        { move: "a7-a6", by: "pawn" },
        { move: "e3-e2", by: "pawn" },
      ],
    },
    {
      name: "Pas de capture arrière",
      fen: "startpos",
      script: [
        { move: "e2-e4", by: "pawn" },
        { move: "d7-d5", by: "pawn" },
        { move: "e4-e3", by: "pawn" },
        { move: "d5-d4", by: "pawn" },
        { assert: "illegal", move: "e3-d2" },
      ],
    },
  ],
});

const buildFallbackRuleSpec = (
  description: string,
  difficulty: DifficultyLevel,
  ruleName: string,
): RuleSpec => {
  const sanitizedDescription = description.trim() || "Aucune description fournie";
  const levelLabel = difficultyLabels[difficulty];
  const overview = `Mode hors ligne — génération assistée indisponible pour le moment. Variante ${levelLabel}. Thème : ${sanitizedDescription}. Focus : ${focusPoints[difficulty]}. Action spéciale suggérée : ${specialActions[difficulty]}. Défi final : ${endgameChallenges[difficulty]}.`;

  const safeName = ruleName.trim().length > 0 ? ruleName.trim() : sanitizedDescription || `Variante ${levelLabel}`;

  return {
    meta: {
      name: safeName,
      base: "chess-base@1.0.0",
      version: "1.0.0",
      description: overview,
      priority: 50,
    },
    patches: [],
    tests: [
      {
        name: "Fallback smoke test",
        fen: "startpos",
        script: [
          { move: "e2-e4", by: "pawn" },
          { move: "b8-c6", by: "knight" },
        ],
      },
    ],
  };
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const buildRuleNameSuggestion = (description: string, difficulty: DifficultyLevel) => {
  const base = description.trim().split(/\n+/)[0]?.trim() ?? "";
  if (base.length === 0) {
    return `Variante ${difficultyLabels[difficulty]}`;
  }

  if (base.length <= 60) {
    return base;
  }

  return `${base.slice(0, 57)}…`;
};

const normaliseSmartQuotes = (value: string) =>
  value
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'");

const extractJsonBlock = (value: string) => {
  const fenceMatch = value.match(/```(?:json|json5)?[\r\n]+([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  return value;
};

const stripJsonPreamble = (value: string) => value.replace(/^\uFEFF/, "").replace(/^\s*(?:json|JSON)\s*[:=-]?\s*/i, "");

const repairDanglingCommas = (value: string) => value.replace(/,\s*([}\]])/g, "$1");

const parseJsonLike = (rawValue: string): unknown => {
  const trimmed = rawValue.trim();
  const unfenced = extractJsonBlock(trimmed);
  const preambleStripped = stripJsonPreamble(unfenced);
  const normalised = normaliseSmartQuotes(preambleStripped).trim();

  const attemptParse = (candidate: string) => {
    const cleaned = candidate.trim();
    if (cleaned.length === 0) {
      throw new Error("Empty JSON payload");
    }
    return JSON.parse(cleaned);
  };

  try {
    return attemptParse(normalised);
  } catch (initialError) {
    const repaired = repairDanglingCommas(normalised.replace(/[;\s]+$/, ""));
    if (repaired !== normalised) {
      try {
        return attemptParse(repaired);
      } catch (repairError) {
        console.error('Failed to parse repaired JSON-like content', repairError, rawValue);
      }
    }

    const firstBrace = normalised.indexOf('{');
    const lastBrace = normalised.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = normalised.slice(firstBrace, lastBrace + 1);
      try {
        return attemptParse(sliced);
      } catch (secondaryError) {
        console.error('Failed to parse sliced JSON-like content', secondaryError, rawValue);
        throw secondaryError;
      }
    }
    console.error('Failed to parse JSON-like content', initialError, rawValue);
    throw initialError;
  }
};

const extractCodeFence = (value: string) => {
  const fenceMatch = value.match(/```(?:javascript|js|typescript|ts)?[\r\n]+([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  return value;
};

type PluginContext = {
  ruleId: string;
  ruleName: string;
  summary: string;
};

const normalisePluginModule = (raw: string, context: PluginContext): string => {
  if (!raw || raw.trim().length === 0) {
    return "";
  }

  const unfenced = extractCodeFence(normaliseSmartQuotes(raw));
  let code = unfenced.trim();

  if (code.length === 0) {
    return "";
  }

  code = code.replace(/\r\n?/g, "\n");
  code = code.replace(/^[ \t]*import[^\n]*$/gim, "");
  code = code.replace(/\bexport\s+default\s+/g, "module.exports = ");
  code = code.replace(/\bexport\s+const\s+([A-Za-z0-9_$]+)\s*=\s*/g, "const $1 = ");
  code = code.replace(/\bexport\s+function\s+([A-Za-z0-9_$]+)\s*\(/g, "function $1(");
  code = code.replace(/^export\s*\{[^}]*\};?/gim, "");

  const pluginAssignmentPattern = /module\.exports\s*=/;
  if (!pluginAssignmentPattern.test(code)) {
    const pluginDeclaration = code.match(/const\s+plugin\s*=\s*{[\s\S]*?};?/);
    const returnPlugin = code.match(/return\s+plugin\s*;?/);
    if (pluginDeclaration && !/module\.exports\s*=/.test(code)) {
      code = `${code}\nmodule.exports = plugin;`;
    } else if (returnPlugin) {
      code = code.replace(/return\s+plugin\s*;?/g, "module.exports = plugin;");
    } else {
      const inlineObjectMatch = code.match(/return\s+{[\s\S]*?};?/);
      if (inlineObjectMatch) {
        code = code.replace(/return\s+({[\s\S]*?});?/, "module.exports = $1;");
      }
    }
  }

  if (!pluginAssignmentPattern.test(code)) {
    code = `${code}\nmodule.exports = {\n  id: ${JSON.stringify(context.ruleId)},\n  name: ${JSON.stringify(context.ruleName)},\n  description: ${JSON.stringify(context.summary)},\n  onGenerateExtraMoves() { return []; },\n  onBeforeMoveApply() { return { allow: true }; },\n  onAfterMoveApply() {},\n  onTurnStart() {},\n};`;
  }

  const trimmed = code.trim();
  const strictPrefix = /^['"]use strict['"];?/;
  const withStrict = strictPrefix.test(trimmed)
    ? trimmed
    : `'use strict';\n${trimmed}`;

  const enforcement = `\n;(function(mod){\n  let plugin = (mod && typeof mod === "object" && !Array.isArray(mod)) ? mod : {};\n  if (!plugin.id || typeof plugin.id !== "string") plugin.id = ${JSON.stringify(context.ruleId)};\n  if (!plugin.name || typeof plugin.name !== "string") plugin.name = ${JSON.stringify(context.ruleName)};\n  if (!plugin.description || typeof plugin.description !== "string") plugin.description = ${JSON.stringify(context.summary)};\n  if (typeof plugin.onBeforeMoveApply !== "function") {\n    plugin.onBeforeMoveApply = () => ({ allow: true });\n  }\n  if (typeof plugin.onAfterMoveApply !== "function") {\n    plugin.onAfterMoveApply = () => {};\n  }\n  if (typeof plugin.onGenerateExtraMoves !== "function") {\n    plugin.onGenerateExtraMoves = () => [];\n  }\n  if (typeof plugin.onTurnStart !== "function") {\n    plugin.onTurnStart = () => {};\n  }\n  module.exports = plugin;\n})(typeof module !== "undefined" ? module.exports : {});\n`;

  return `${withStrict}\n${enforcement}`;
};

const buildFallbackPluginModule = (context: PluginContext): string => {
  const baseline = `'use strict';\nmodule.exports = {\n  id: helpers.ruleId || ${JSON.stringify(context.ruleId)},\n  name: ${JSON.stringify(context.ruleName)},\n  description: ${JSON.stringify(context.summary)},\n  onGenerateExtraMoves() {\n    return [];\n  },\n  onBeforeMoveApply() {\n    return { allow: true };\n  },\n  onAfterMoveApply() {},\n  onTurnStart() {},\n};`;

  return normalisePluginModule(baseline, context);
};

const pluginGenerationSystemPrompt = `Tu es un générateur de modules JavaScript pour Chess Coach 3D.\n\nTon objectif est de produire du code exécutable qui implémente précisément la variante décrite. Le runtime chargera ton module via new Function('exports', 'module', 'helpers', code). Respecte strictement ces règles :\n- Écris uniquement du JavaScript (pas de TypeScript, pas d'import/export, pas de require).\n- Commence le fichier par 'use strict'; si ce n'est pas déjà fait.\n- Exporte l'objet final avec module.exports.\n- L'objet doit contenir : id, name, description, onGenerateExtraMoves, onBeforeMoveApply, onAfterMoveApply, onTurnStart.\n- Utilise helpers.ruleId pour l'identifiant si nécessaire.\n- Les helpers disponibles : helpers.clone(value), helpers.eqPos(a,b), helpers.dirs.rook / helpers.dirs.bishop, helpers.neighbors(pos), helpers.createMove(from, to, meta), helpers.ruleId.\n- Les hooks reçoivent api fournissant : isInCheck, isLegalStandardMove, applyStandardMove, cloneState, getPieceAt, setPieceAt, findKing, allPieces, inBounds.\n- Stocke les états persistants sur piece.tags ou state.flags[color] selon le besoin.\n- Ajoute des indications visuelles/animations via move.meta (ex: { highlight: { squares: ['e4'], color: 'gold' }, animation: { type: 'dash', duration: 600 }, sound: 'whoosh' }).\n- Ne casse jamais les règles de sécurité : ne laisse pas un roi volontairement en échec, vérifie la légalité des coups spéciaux avec l'API.\n- Le code doit être concis, lisible et directement exécutable sans transformation supplémentaire.\nRéponds uniquement avec le code JavaScript final, sans balises Markdown.`;

const truncateForPrompt = (value: string, maxLength = 12000) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}\n/* tronqué pour la requête */` : value;

interface PluginGenerationRequest {
  description: string;
  difficulty: DifficultyLevel;
  ruleSpec: RuleSpec;
  ruleId: string;
  ruleName: string;
  compiled?: CompiledRuleset | null;
}

interface PluginGenerationEnv {
  lovableApiKey?: string;
  fetchImpl: typeof fetch;
  logger: Pick<typeof console, "error" | "warn" | "info">;
}

const generateVariantPlugin = async (
  request: PluginGenerationRequest,
  env: PluginGenerationEnv,
): Promise<{ code: string; warning?: string }> => {
  const summaryCandidate = request.ruleSpec.meta?.description?.trim() ?? request.description.trim();
  const safeSummary = summaryCandidate && summaryCandidate.length > 0
    ? summaryCandidate
    : `Variante ${request.ruleName}`;

  const context: PluginContext = {
    ruleId: request.ruleId,
    ruleName: request.ruleName,
    summary: safeSummary,
  };

  const fallback = buildFallbackPluginModule(context);

  if (!env.lovableApiKey) {
    return {
      code: fallback,
      warning: "Mode démo : configurez LOVABLE_API_KEY pour générer le code JavaScript de la variante. Un squelette simplifié a été créé.",
    };
  }

  const ruleSpecJson = JSON.stringify(request.ruleSpec, null, 2);
  const promptParts = [
    `Description utilisateur : ${request.description}`,
    `Nom de la règle : ${request.ruleName}`,
    `Identifiant technique : ${request.ruleId}`,
    `Niveau ciblé : ${difficultyLabels[request.difficulty]}.`,
    "Implémente fidèlement la mécanique, les états persistants, le visuel et les animations décrits.",
    `RuleSpec JSON :\n${truncateForPrompt(ruleSpecJson)}`,
  ];

  if (request.compiled) {
    const compiledJson = JSON.stringify(request.compiled, null, 2);
    promptParts.push(`CompiledRuleset JSON :\n${truncateForPrompt(compiledJson)}`);
  }

  promptParts.push("Réponds uniquement avec le module JavaScript final (CommonJS).");

  const userPrompt = promptParts.join("\n\n");

  try {
    env.logger.info?.("Generating plugin module via Lovable AI Gateway...");
    const response = await env.fetchImpl("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: pluginGenerationSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => null);
      env.logger.error?.("Plugin generation failed", response.status, errorText);
      return {
        code: fallback,
        warning: `Échec de génération du plugin (HTTP ${response.status}). Un squelette basique a été inséré.`,
      };
    }

    const payload = await response.json();
    const generated = payload.choices?.[0]?.message?.content?.trim();

    if (!generated) {
      env.logger.warn?.("Plugin generation returned empty content");
      return {
        code: fallback,
        warning: "Le générateur IA n'a renvoyé aucun code plugin. Un squelette basique a été inséré.",
      };
    }

    const normalised = normalisePluginModule(generated, context);
    if (!normalised || normalised.trim().length === 0) {
      env.logger.warn?.("Normalisation du plugin impossible, utilisation du fallback");
      return {
        code: fallback,
        warning: "Le code IA était invalide. Un squelette basique a été inséré.",
      };
    }

    return { code: normalised };
  } catch (error) {
    env.logger.error?.("Unexpected error during plugin generation", error);
    return {
      code: fallback,
      warning: "Erreur lors de la génération du plugin IA. Un squelette basique a été inséré.",
    };
  }
};

const normalizeRuleSpec = (raw: unknown, fallbackName: string): RuleSpec | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const base = raw as Record<string, unknown>;
  const metaRaw = base.meta && typeof base.meta === "object" ? (base.meta as Record<string, unknown>) : {};

  const nameCandidates = [
    typeof metaRaw.name === "string" ? metaRaw.name : undefined,
    typeof base.name === "string" ? base.name : undefined,
    fallbackName,
  ];
  const name = nameCandidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? fallbackName;

  const topLevelBaseVersion = (base as Record<string, unknown>)["base_version"];
  const baseCandidates = [
    typeof metaRaw.base === "string" ? metaRaw.base : undefined,
    typeof base.base === "string" ? base.base : undefined,
    typeof topLevelBaseVersion === "string" ? topLevelBaseVersion : undefined,
  ];
  const baseId = baseCandidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? "chess-base@1.0.0";

  const topLevelRulesetVersion = (base as Record<string, unknown>)["ruleset_version"];
  const versionCandidates = [
    typeof metaRaw.version === "string" ? metaRaw.version : undefined,
    typeof base.version === "string" ? base.version : undefined,
    typeof topLevelRulesetVersion === "string" ? topLevelRulesetVersion : undefined,
  ];
  const version = versionCandidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? "1.0.0";

  let description: string | undefined;
  if (typeof metaRaw.description === "string") {
    description = metaRaw.description;
  } else if (typeof base.description === "string") {
    description = base.description;
  }

  let priority = 50;
  if (typeof metaRaw.priority === "number") {
    priority = metaRaw.priority;
  } else if (typeof base.priority === "number") {
    priority = base.priority;
  }

  const alternatePatchField = (base as Record<string, unknown>)["patch"];
  const patches = Array.isArray(base.patches)
    ? (base.patches as RuleSpec["patches"])
    : Array.isArray(alternatePatchField)
      ? (alternatePatchField as RuleSpec["patches"])
      : undefined;
  const tests = Array.isArray(base.tests) ? (base.tests as RuleSpec["tests"]) : undefined;

  return {
    meta: {
      name,
      base: baseId,
      version,
      description,
      priority,
    },
    patches: patches ?? [],
    tests,
  };
};

const chainedSelectorPattern = /\]\s*\[/;

const sanitiseRuleSpecPatches = (
  spec: RuleSpec,
  logger?: Pick<typeof console, "warn">,
): RuleSpec => {
  if (!Array.isArray(spec.patches) || spec.patches.length === 0) {
    return spec;
  }

  const safePatches = spec.patches.filter((patch) => {
    if (!patch || typeof patch.path !== "string") {
      logger?.warn?.("Patch sans chemin valide ignoré lors de la compilation.");
      return false;
    }

    if (chainedSelectorPattern.test(patch.path)) {
      logger?.warn?.(`Patch ignoré : sélecteur chaîné non pris en charge (${patch.path}).`);
      return false;
    }

    return true;
  });

  if (safePatches.length === spec.patches.length) {
    return spec;
  }

  return {
    ...spec,
    patches: safePatches,
  };
};

export async function generateCustomRules(
  request: CustomRulesRequest,
  options: GenerateCustomRulesOptions = {},
): Promise<CustomRulesResponse> {
  const { description, ruleName } = request;
  const difficulty = request.difficulty ?? "intermediate";

  if (!description || description.trim().length === 0) {
    throw new Error("Description is required to generate custom rules.");
  }

  const logger = options.logger ?? console;
  const fetchImpl = options.fetchImpl ?? fetch;
  const lovableApiKey = options.lovableApiKey;

  const suggestedRuleName = ruleName && ruleName.trim().length > 0
    ? ruleName.trim()
    : buildRuleNameSuggestion(description, difficulty);

  const ruleBaseSlug = slugify(suggestedRuleName.length > 0 ? suggestedRuleName : description);
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  let ruleId = ruleBaseSlug ? `${ruleBaseSlug}-${uniqueSuffix}` : `variant-${uniqueSuffix}`;

  const searchableDescription = toSearchable(description).replace(/[-_]/g, " ");
  const precompiled = PRECOMPILED_VARIANTS.find((variant) => variant.matches(searchableDescription));

  // Check for "pawn backward" recipe
  const wantsPawnBackward = /\bpion[s]?\b.*\brecul/iu.test(description);

  let ruleSpec: RuleSpec | null = null;
  let warning: string | undefined;
  let compilerWarnings: string[] = [];
  let compiledRuleset: CompiledRuleset | null = null;
  let compiledHash: string | null = null;
  let pluginCode = "";
  let pluginWarning: string | undefined;

  if (precompiled) {
    ruleSpec = {
      meta: {
        name: precompiled.ruleset.meta.name,
        base: precompiled.ruleset.meta.base,
        version: precompiled.ruleset.meta.version,
        description: precompiled.ruleset.meta.description,
        priority: precompiled.ruleset.meta.priority,
        id: precompiled.ruleset.meta.id,
      },
      patches: [],
      tests: precompiled.ruleset.tests,
    };
    compiledRuleset = precompiled.ruleset;
    compiledHash = await computeCompiledRulesetHash(precompiled.ruleset);
    warning = precompiled.warning;
    if (precompiled.ruleset.meta.id && precompiled.ruleset.meta.id.trim().length > 0) {
      ruleId = precompiled.ruleset.meta.id.trim();
    }
  } else if (wantsPawnBackward) {
    logger.info?.("Detected pawn backward recipe, using programmatic RuleSpec");
    ruleSpec = buildPawnBackwardRecipe(suggestedRuleName);
    warning = "Règle générée automatiquement (recette pré-configurée).";
  } else if (!lovableApiKey) {
    warning = "Mode démo : configurez LOVABLE_API_KEY pour activer la génération IA.";
    logger.warn?.("No Lovable API key found. Returning fallback RuleSpec.");
    ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
  } else {
    const systemPrompt = `Tu es un compilateur de variantes d'échecs. Retourne UNIQUEMENT un JSON valide (sans texte ni markdown autour) qui respecte ce schéma :
{
  "meta": { "name": string, "base": "chess-base@1.0.0", "version": "1.0.0", "description"?: string, "priority"?: number },
  "patches"?: Array<{ "op": "extend"|"replace"|"remove"|"add", "path": string, "value"?: unknown }>,
  "tests"?: Array<{ "name": string, "fen": string, "script": Array<Record<string, unknown>> }>
}
Règles :
- Décris uniquement les modifications par rapport à chess-base@1.0.0.
- Chaque patch cible une clé précise (ex: "pieces[id=knight].moves").
- Les tests sont courts (2-5 étapes).
- Pas de texte hors JSON.`;

    const userPrompt = `Description utilisateur : ${description}
Nom suggéré : ${suggestedRuleName}
Niveau : ${difficultyLabels[difficulty]}.`;

    const payload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    };

    try {
      logger.info?.("Calling Lovable AI Gateway for rule generation...");
      const response = await fetchImpl(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        logger.error?.("Lovable AI Gateway error:", response.status, errorData);
        warning = `Erreur IA Gateway (${response.status}). Mode hors-ligne.`;
        ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
      } else {
        const data = await response.json();
        const generatedContent = data.choices?.[0]?.message?.content?.trim();

        if (!generatedContent) {
          logger.warn?.("AI Gateway returned empty content");
          warning = "Génération IA vide. Mode hors-ligne.";
          ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
        } else {
          try {
            logger.info?.("Parsing AI-generated RuleSpec...");
            const parsed = parseJsonLike(generatedContent);
            const normalised = normalizeRuleSpec(parsed, suggestedRuleName);
            if (normalised) {
              ruleSpec = normalised;
              logger.info?.("AI-generated RuleSpec successfully parsed");
            } else {
              logger.warn?.("AI produced invalid RuleSpec structure");
              warning = "Format IA inattendu. Mode hors-ligne.";
              ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
            }
          } catch (specError) {
            logger.error?.("Failed to parse AI response:", specError);
            warning = "Impossible de parser le JSON IA. Mode hors-ligne.";
            ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
          }
        }
      }
    } catch (error) {
      logger.error?.("AI Gateway request failed:", error);
      warning = "Erreur réseau avec IA Gateway. Mode hors-ligne.";
      ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
    }
  }

  if (!compiledRuleset) {
    if (ruleSpec) {
      ruleSpec = sanitiseRuleSpecPatches(ruleSpec, logger);
    }

    try {
      const compilation = await compileRuleSpec(ruleSpec!);
      compiledRuleset = compilation.compiled;
      compiledHash = compilation.hash;
      compilerWarnings = compilation.warnings;
    } catch (error) {
      if (error instanceof RuleCompilationError) {
        logger.error?.("Rule compilation error:", error.message);
        warning = `Compilation invalide (${error.message}). Retour au canevas standard.`;
        const fallbackSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
        const fallbackCompilation = await compileRuleSpec(fallbackSpec);
        compiledRuleset = fallbackCompilation.compiled;
        compiledHash = fallbackCompilation.hash;
        compilerWarnings = fallbackCompilation.warnings;
        ruleSpec = fallbackSpec;
      } else {
        throw error;
      }
    }
  }

  if (!ruleSpec) {
    throw new Error("Aucun RuleSpec n'a pu être déterminé pour cette génération.");
  }

  const pluginRuleName = ruleSpec.meta?.name?.trim()?.length
    ? ruleSpec.meta.name.trim()
    : suggestedRuleName;
  const pluginSummary =
    typeof ruleSpec.meta?.description === "string" && ruleSpec.meta.description.trim().length > 0
      ? ruleSpec.meta.description.trim()
      : description.trim().length > 0
        ? description.trim()
        : pluginRuleName;

  try {
    const pluginResult = await generateVariantPlugin(
      {
        description,
        difficulty,
        ruleSpec,
        ruleId,
        ruleName: pluginRuleName,
        compiled: compiledRuleset,
      },
      { lovableApiKey, fetchImpl, logger },
    );

    const trimmedPluginCode = typeof pluginResult.code === "string" ? pluginResult.code.trim() : "";
    pluginCode = trimmedPluginCode.length > 0
      ? trimmedPluginCode
      : buildFallbackPluginModule({ ruleId, ruleName: pluginRuleName, summary: pluginSummary });

    if (pluginResult.warning) {
      pluginWarning = pluginResult.warning;
    }
  } catch (pluginError) {
    logger.error?.("Plugin generation threw unexpectedly", pluginError);
    pluginCode = buildFallbackPluginModule({ ruleId, ruleName: pluginRuleName, summary: pluginSummary });
    pluginWarning = "Génération du plugin impossible. Un squelette basique a été inséré.";
  }

  const prettySpec = JSON.stringify(ruleSpec, null, 2);
  return {
    rules: prettySpec,
    difficulty,
    ruleId,
    ruleName: ruleSpec.meta.name ?? suggestedRuleName,
    pluginCode,
    warning,
    compiledRuleset: compiledRuleset!,
    compiledHash: compiledHash!,
    ruleSpec,
    pluginWarning,
    compilerWarnings: compilerWarnings.length > 0 ? compilerWarnings : undefined,
  };
}
