import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { compileRuleSpec, RuleCompilationError } from "../_shared/rulesets/compiler.ts";
import type { CompiledRuleset, RuleSpec } from "../_shared/rulesets/types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

interface CustomRulesRequest {
  description: string;
  difficulty?: DifficultyLevel;
  ruleName?: string;
}

interface CustomRulesResponse {
  rules: string;
  difficulty: DifficultyLevel;
  ruleId: string;
  ruleName: string;
  pluginCode: string;
  warning?: string;
  pluginWarning?: string;
  compiledRuleset: CompiledRuleset;
  compiledHash: string;
  ruleSpec: RuleSpec;
  compilerWarnings?: string[];
}

const difficultyLabels: Record<DifficultyLevel, string> = {
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  advanced: 'avancé',
};

const focusPoints: Record<DifficultyLevel, string> = {
  beginner: 'l’apprentissage des mouvements de base et des principes simples',
  intermediate: 'la planification, la tactique et l’anticipation des échanges',
  advanced: 'les stratégies complexes, la gestion du temps et la pression positionnelle',
};

const specialActions: Record<DifficultyLevel, string> = {
  beginner: 'Une pièce alliée peut, une fois par partie, se repositionner sur une case libre adjacente à votre roi pour clarifier les mouvements essentiels.',
  intermediate: 'Choisissez une pièce (hors roi) qui obtient un « mouvement de maîtrise » utilisable une fois par partie : elle peut soit répéter son déplacement habituel, soit rester en place pour bloquer une attaque.',
  advanced: 'Désignez une pièce majeure qui reçoit une « impulsion stratégique » : une seule fois par partie, elle peut cumuler deux déplacements légaux successifs tant qu’elle ne donne pas échec direct.',
};

const endgameChallenges: Record<DifficultyLevel, string> = {
  beginner: 'atteindre la promotion d’un pion ou mettre le roi adverse en échec et mat en moins de 30 coups pour encourager la progression',
  intermediate: 'gagner en conservant au moins une pièce mineure en vie, ce qui pousse à équilibrer attaque et défense',
  advanced: 'remporter la partie après avoir exécuté une combinaison tactique impliquant au moins trois pièces différentes',
};

const buildFallbackRuleSpec = (
  description: string,
  difficulty: DifficultyLevel,
  ruleName: string,
): RuleSpec => {
  const promptHeadline = description.trim().split(/\n+/)[0]?.trim() ?? "";
  const proposedName = ruleName.trim().length > 0 ? ruleName.trim() : promptHeadline;
  const sanitizedName = proposedName.length > 0 ? proposedName : "Les pions peuvent capturer en avant";
  const difficultyLabel = difficultyLabels[difficulty];

  return {
    meta: {
      name: sanitizedName,
      base: "chess-base@1.0.0",
      version: "1.0.0",
      description:
        "Variante : les pions conservent leurs déplacements habituels (un pas en avant, deux pas depuis la rangée de départ si libre) et leurs captures diagonales, MAIS ils peuvent également capturer en avançant d'une case si une pièce ennemie se trouve directement devant eux." +
        ` Difficulté suggérée : ${difficultyLabel}.`,
      priority: 50,
    },
    patches: [
      {
        op: "replace",
        path: "pieces[id=pawn]",
        value: {
          id: "pawn",
          from: "none",
          side: "both",
          moves: [
            {
              type: "move",
              vectorsWhite: [[0, 1]],
              vectorsBlack: [[0, -1]],
              maxSteps: 1,
              requires: ["emptyTarget"],
            },
            {
              type: "move",
              vectorsWhite: [[0, 2]],
              vectorsBlack: [[0, -2]],
              maxSteps: 1,
              requires: ["emptyPath", "emptyTarget", "onStartRank"],
            },
            {
              type: "capture",
              vectorsWhite: [[1, 1], [-1, 1]],
              vectorsBlack: [[1, -1], [-1, -1]],
              maxSteps: 1,
              requires: ["enemyOnTarget"],
            },
            {
              type: "capture",
              vectorsWhite: [[0, 1]],
              vectorsBlack: [[0, -1]],
              maxSteps: 1,
              requires: ["enemyOnTarget"],
            },
          ],
          attributes: {
            startRankWhite: 2,
            startRankBlack: 7,
            enPassant: false,
          },
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
      },
    ],
    tests: [
      {
        name: "Smoke: ouverture",
        fen: "startpos",
        script: [
          { move: "e2-e4", by: "pawn" },
          { move: "b8-c6", by: "knight" },
        ],
      },
      {
        name: "Capture de face blanche",
        fen: "rnbqkbnr/pppppppp/8/8/4p3/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        script: [
          { move: "e2-e3", by: "pawn" },
          { assert: "pieceAt", square: "e3", piece: "pawn", side: "white" },
          { move: "e3xe4", by: "pawn" },
          { assert: "pieceAt", square: "e4", piece: "pawn", side: "white" },
          { assert: "empty", square: "e3" },
        ],
      },
      {
        name: "Capture de face noire",
        fen: "rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        script: [
          { move: "e7-e6", by: "pawn" },
          { assert: "pieceAt", square: "e6", piece: "pawn", side: "black" },
          { move: "e6xe5", by: "pawn" },
          { assert: "pieceAt", square: "e5", piece: "pawn", side: "black" },
          { assert: "empty", square: "e6" },
        ],
      },
      {
        name: "Pas de capture de face si case vide",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
        script: [
          { illegal: "e2xe3", by: "pawn" },
        ],
      },
    ],
  };
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const buildRuleNameSuggestion = (description: string, difficulty: DifficultyLevel) => {
  const base = description.trim().split(/\n+/)[0]?.trim() ?? '';
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Partial<CustomRulesRequest> = {};
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Invalid JSON payload received:', parseError);
      return new Response(JSON.stringify({
        error: "Requête invalide: le corps doit être un JSON valide.",
        rules: 'Impossible de générer les règles pour le moment. Veuillez réessayer.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { description, difficulty = 'intermediate', ruleName } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return new Response(JSON.stringify({
        error: "Requête invalide: veuillez fournir une description des règles à générer.",
        rules: 'Impossible de générer les règles pour le moment. Veuillez réessayer.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey =
      Deno.env.get('LOVABLE_GEMINI_API_KEY') ??
      Deno.env.get('GEMINI_API_KEY');

    const suggestedRuleName = ruleName && typeof ruleName === 'string' && ruleName.trim().length > 0
      ? ruleName.trim()
      : buildRuleNameSuggestion(description, difficulty);

    const ruleBaseSlug = slugify(suggestedRuleName.length > 0 ? suggestedRuleName : description);
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const ruleId = ruleBaseSlug ? `${ruleBaseSlug}-${uniqueSuffix}` : `variant-${uniqueSuffix}`;

    let ruleSpec = buildFallbackRuleSpec(description, difficulty, suggestedRuleName);
    let warning: string | undefined;
    const pluginWarning = 'Les plugins JavaScript sont dépréciés. Utilisez le CompiledRuleset JSON.';
    let compilerWarnings: string[] = [];

    if (!geminiApiKey) {
      warning = "Mode démo : configurez la variable d'environnement GEMINI_API_KEY pour activer la génération IA.";
      console.warn('No Gemini API key found. Returning fallback RuleSpec.');
    } else {
      const specPrompt = `Tu es un compilateur de variantes d'échecs. Retourne UNIQUEMENT un JSON valide (sans texte autour) qui respecte ce schéma minimal :
{
  "meta": {
    "name": string,
    "base": string,
    "version": string,
    "description"?: string,
    "priority"?: number
  },
  "patches"?: Array<{ "op": "extend"|"replace"|"remove", "path": string, "value"?: unknown, "priority"?: number }>,
  "tests"?: Array<{ "name": string, "fen": string, "script": Array<Record<string, unknown>> }>
}
Contraintes :
- Base autorisée par défaut : "chess-base@1.0.0".
- Décris uniquement les modifications nécessaires par rapport à la base.
- Chaque patch doit cibler une clé précise (ex: "pieces[id=knight].moves").
- Les tests doivent être courts (2-5 étapes) et vérifier l'effet clé.
- Pas de code, pas de texte hors JSON.
Description utilisateur : ${description}
Nom suggéré : ${suggestedRuleName}
Niveau : ${difficultyLabels[difficulty]}.`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: specPrompt }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 800,
        },
      };

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Gemini API error:', errorData);
          warning = `Erreur lors de la génération IA (${response.status}). Utilisation du mode hors-ligne.`;
        } else {
          const data = await response.json();
          const generatedSpecRaw = data.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? '')
            .join('\n')
            .trim();

          if (generatedSpecRaw) {
            try {
              const parsed = parseJsonLike(generatedSpecRaw);
              const normalised = normalizeRuleSpec(parsed, suggestedRuleName);
              if (normalised) {
                ruleSpec = normalised;
              } else {
                warning = 'La génération IA a produit un format inattendu. Utilisation du mode hors-ligne.';
              }
            } catch (specError) {
              console.error('Failed to parse generated spec:', specError);
              warning = 'Impossible de parser le JSON généré. Utilisation du mode hors-ligne.';
            }
          } else {
            warning = 'La génération IA n’a pas renvoyé de règles exploitables. Utilisation du mode hors-ligne.';
          }
        }
      } catch (error) {
        console.error('Gemini spec generation error:', error);
        warning = 'Erreur de communication avec le modèle IA. Utilisation du mode hors-ligne.';
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
        console.error('Rule compilation error:', error.message);
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
    const responsePayload: CustomRulesResponse = {
      rules: prettySpec,
      difficulty,
      ruleId,
      ruleName: ruleSpec.meta.name ?? suggestedRuleName,
      pluginCode: '',
      warning,
      pluginWarning,
      compiledRuleset,
      compiledHash,
      ruleSpec,
      compilerWarnings: compilerWarnings.length > 0 ? compilerWarnings : undefined,
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-custom-rules function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      rules: 'Impossible de générer les règles pour le moment. Veuillez réessayer.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
