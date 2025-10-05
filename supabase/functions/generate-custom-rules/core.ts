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
    typeof metaRaw.name === "string" ? metaRaw.name,
    typeof base.name === "string" ? base.name,
    fallbackName,
  ];
  const name = nameCandidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? fallbackName;

  const topLevelBaseVersion = (base as Record<string, unknown>)["base_version"];
  const baseCandidates = [
    typeof metaRaw.base === "string" ? metaRaw.base,
    typeof base.base === "string" ? base.base,
    typeof topLevelBaseVersion === "string" ? topLevelBaseVersion : undefined,
  ];
  const baseId = baseCandidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? "chess-base@1.0.0";

  const topLevelRulesetVersion = (base as Record<string, unknown>)["ruleset_version"];
  const versionCandidates = [
    typeof metaRaw.version === "string" ? metaRaw.version,
    typeof base.version === "string" ? base.version,
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
  const ruleId = ruleBaseSlug ? `${ruleBaseSlug}-${uniqueSuffix}` : `variant-${uniqueSuffix}`;

  // Check for "pawn backward" recipe
  const wantsPawnBackward = /\bpion[s]?\b.*\brecul/iu.test(description);
  
  let ruleSpec: RuleSpec;
  let warning: string | undefined;
  let compilerWarnings: string[] = [];

  if (wantsPawnBackward) {
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

  let compiledRuleset: CompiledRuleset;
  let compiledHash: string;

  try {
    const compilation = await compileRuleSpec(ruleSpec);
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

  const prettySpec = JSON.stringify(ruleSpec, null, 2);
  return {
    rules: prettySpec,
    difficulty,
    ruleId,
    ruleName: ruleSpec.meta.name ?? suggestedRuleName,
    pluginCode: "",
    warning,
    compiledRuleset,
    compiledHash,
    ruleSpec,
    compilerWarnings: compilerWarnings.length > 0 ? compilerWarnings : undefined,
  };
}
