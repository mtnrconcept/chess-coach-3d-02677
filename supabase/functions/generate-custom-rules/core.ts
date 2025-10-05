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
          spawn: { count: 1, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 1, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 2, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 2, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 2, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 8,
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
          applyTo: "pawn",
          when: "canMove",
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
      ],
    },
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
          spawn: { count: 1, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 1, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 2, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 2, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 2, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 8,
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
          applyTo: "bishop",
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
          spawn: { count: 1, startSquares: ["e1", "e8"] },
        },
        {
          id: "queen",
          from: "queen",
          side: "both",
          moves: [{ pattern: "queen" }],
          spawn: { count: 1, startSquares: ["d1", "d8"] },
        },
        {
          id: "rook",
          from: "rook",
          side: "both",
          moves: [{ pattern: "rook" }],
          spawn: { count: 2, startSquares: ["a1", "h1", "a8", "h8"] },
        },
        {
          id: "bishop",
          from: "bishop",
          side: "both",
          moves: [{ pattern: "bishop" }],
          spawn: { count: 2, startSquares: ["c1", "f1", "c8", "f8"] },
        },
        {
          id: "knight",
          from: "knight",
          side: "both",
          moves: [{ pattern: "knight" }],
          spawn: { count: 2, startSquares: ["b1", "g1", "b8", "g8"] },
        },
        {
          id: "pawn",
          from: "pawn",
          side: "both",
          moves: [{ pattern: "pawn" }],
          spawn: {
            count: 8,
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
          applyTo: "queen",
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

const parseJsonLike = (value: string): unknown => {
  const trimmed = value.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\n([\s\S]*?)```/i);
  const jsonText = codeBlockMatch ? codeBlockMatch[1] : trimmed;
  return JSON.parse(jsonText);
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
  "patches"?: Array<{ "op": "extend"|"replace"|"remove", "path": string, "value"?: unknown }>,
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

  const prettySpec = JSON.stringify(ruleSpec, null, 2);
  return {
    rules: prettySpec,
    difficulty,
    ruleId,
    ruleName: ruleSpec.meta.name ?? suggestedRuleName,
    pluginCode: "",
    warning,
    compiledRuleset: compiledRuleset!,
    compiledHash: compiledHash!,
    ruleSpec,
    compilerWarnings: compilerWarnings.length > 0 ? compilerWarnings : undefined,
  };
}
