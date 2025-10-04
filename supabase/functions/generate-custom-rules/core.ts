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
  geminiApiKey?: string;
  logger?: Pick<typeof console, "error" | "warn" | "info">;
  fetchImpl?: typeof fetch;
}

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: "débutant",
  intermediate: "intermédiaire",
  advanced: "avancé",
};

const focusPoints: Record<DifficultyLevel, string> = {
  beginner: "l’apprentissage des mouvements de base et des principes simples",
  intermediate: "la planification, la tactique et l’anticipation des échanges",
  advanced: "les stratégies complexes, la gestion du temps et la pression positionnelle",
};

const specialActions: Record<DifficultyLevel, string> = {
  beginner:
    "Une pièce alliée peut, une fois par partie, se repositionner sur une case libre adjacente à votre roi pour clarifier les mouvements essentiels.",
  intermediate:
    "Choisissez une pièce (hors roi) qui obtient un « mouvement de maîtrise » utilisable une fois par partie : elle peut soit répéter son déplacement habituel, soit rester en place pour bloquer une attaque.",
  advanced:
    "Désignez une pièce majeure qui reçoit une « impulsion stratégique » : une seule fois par partie, elle peut cumuler deux déplacements légaux successifs tant qu’elle ne donne pas échec direct.",
};

const endgameChallenges: Record<DifficultyLevel, string> = {
  beginner:
    "atteindre la promotion d’un pion ou mettre le roi adverse en échec et mat en moins de 30 coups pour encourager la progression",
  intermediate:
    "gagner en conservant au moins une pièce mineure en vie, ce qui pousse à équilibrer attaque et défense",
  advanced:
    "remporter la partie après avoir exécuté une combinaison tactique impliquant au moins trois pièces différentes",
};

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
  const metaRaw = base.meta;
  if (!metaRaw || typeof metaRaw !== "object") {
    return null;
  }

  const metaObj = metaRaw as Record<string, unknown>;
  const name = typeof metaObj.name === "string" && metaObj.name.trim().length > 0
    ? metaObj.name.trim()
    : fallbackName;
  const baseId = typeof metaObj.base === "string" && metaObj.base.trim().length > 0
    ? metaObj.base.trim()
    : "chess-base@1.0.0";
  const version = typeof metaObj.version === "string" && metaObj.version.trim().length > 0
    ? metaObj.version.trim()
    : "1.0.0";
  const description = typeof metaObj.description === "string" ? metaObj.description : undefined;
  const priority = typeof metaObj.priority === "number" ? metaObj.priority : 50;

  const patches = Array.isArray(base.patches) ? (base.patches as RuleSpec["patches"]) : undefined;
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
  const geminiApiKey = options.geminiApiKey;

  const suggestedRuleName = ruleName && ruleName.trim().length > 0
    ? ruleName.trim()
    : buildRuleNameSuggestion(description, difficulty);

  const ruleBaseSlug = slugify(suggestedRuleName.length > 0 ? suggestedRuleName : description);
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const ruleId = ruleBaseSlug ? `${ruleBaseSlug}-${uniqueSuffix}` : `variant-${uniqueSuffix}`;

  let ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
  let warning: string | undefined;
  let compilerWarnings: string[] = [];

  if (!geminiApiKey) {
    warning = "Mode démo : configurez la variable d'environnement GEMINI_API_KEY pour activer la génération IA.";
    logger.warn?.("No Gemini API key found. Returning fallback RuleSpec.");
  } else {
    const specPromptLines = [
      "Tu es un compilateur de variantes d'échecs. Retourne UNIQUEMENT un JSON valide (sans texte autour) qui respecte ce schéma minimal :",
      "{",
      '  "meta": {',
      '    "name": string,',
      '    "base": string,',
      '    "version": string,',
      '    "description"?: string,',
      '    "priority"?: number',
      '  },',
      '  "patches"?: Array<{ "op": "extend"|"replace"|"remove", "path": string, "value"?: unknown, "priority"?: number }>,',
      '  "tests"?: Array<{ "name": string, "fen": string, "script": Array<Record<string, unknown>> }>',
      "}",
      "Contraintes :",
      '- Base autorisée par défaut : "chess-base@1.0.0".',
      '- Décris uniquement les modifications nécessaires par rapport à la base.',
      '- Chaque patch doit cibler une clé précise (ex: "pieces[id=knight].moves").',
      "- Les tests doivent être courts (2-5 étapes) et vérifier l'effet clé.",
      "- Pas de code, pas de texte hors JSON.",
      `Description utilisateur : ${description}`,
      `Nom suggéré : ${suggestedRuleName}`,
      `Niveau : ${difficultyLabels[difficulty]}.`,
    ];
    const specPrompt = specPromptLines.join("\n");
    const payload = {
      contents: [
        {
          role: "user" as const,
          parts: [
            { text: specPrompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 800,
      },
    };

    try {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        logger.error?.("Gemini API error:", errorData);
        warning = `Erreur lors de la génération IA (${response.status}). Utilisation du mode hors-ligne.`;
      } else {
        const data = await response.json();
        const generatedSpecRaw = data.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .join("\n")
          .trim();

        if (generatedSpecRaw) {
          try {
            const parsed = parseJsonLike(generatedSpecRaw);
            const normalised = normalizeRuleSpec(parsed, suggestedRuleName);
            if (normalised) {
              ruleSpec = normalised;
            } else {
              warning = "La génération IA a produit un format inattendu. Utilisation du mode hors-ligne.";
            }
          } catch (specError) {
            logger.error?.("Failed to parse generated spec:", specError);
            warning = "Impossible de parser le JSON généré. Utilisation du mode hors-ligne.";
          }
        } else {
          warning = "La génération IA n’a pas renvoyé de règles exploitables. Utilisation du mode hors-ligne.";
        }
      }
    } catch (error) {
      logger.error?.("Gemini spec generation error:", error);
      warning = "Erreur de communication avec le modèle IA. Utilisation du mode hors-ligne.";
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
