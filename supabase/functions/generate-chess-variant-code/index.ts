import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  description: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

const VARIANT_SPEC_SYSTEM_PROMPT = `Tu es un générateur de variantes d'échecs pour la plateforme Chess Coach 3D.

Ta mission est de produire un JSON de configuration complet pour un plugin de variante basé sur la structure suivante:
{
  "meta": {
    "id": string (kebab-case, unique),
    "name": string,
    "version": string,
    "base": "chess-base@1.0.0",
    "description": string
  },
  "capabilities": { "requires": string[] },
  "parameters"?: Record<string, {
    "type": "boolean" | "number" | "string",
    "default": unknown,
    "description": string
  }>,
  "ui": {
    "badges": string[],
    "tips": string[],
    "themeHints"?: Record<string, unknown>
  },
  "overrides": Record<string, unknown>,
  "objects"?: Record<string, unknown>,
  "logic": {
    "moveGeneration": string,
    "specialMoves"?: Record<string, string>,
    "checkDetection": string,
    "endgame": string
  },
  "arbiter": {
    "uiDisclosure"?: { "forbidden"?: string[], "allowed"?: string[] },
    "notation"?: { "pgn"?: { "includeHiddenEvents"?: boolean } }
  }
}

Règles impératives:
- Toujours répondre uniquement par un JSON valide, sans balise Markdown.
- Réutiliser le modèle de logique fourni dans l'exemple "Pion dépose une mine" pour définir les actions spéciales, objets cachés, triggers, etc.
- Adapter chaque section pour refléter fidèlement le prompt utilisateur (nom, description, badges, capabilities, overrides, objets, triggers).
- Lorsque le prompt mentionne des effets spéciaux, utilise les clés "specialActions", "hidden objects", "triggers", etc. comme dans l'exemple.
- S'il n'y a pas d'effets spéciaux, garde les sections pertinentes mais avec des valeurs neutres (par exemple pas d'"objects").
- Toujours renseigner meta.base = "chess-base@1.0.0" et meta.version = "1.0.0" si aucune version n'est fournie.
- Génère un identifiant stable en slugifiant le nom ou le prompt, et ajoute un suffixe aléatoire court pour l'unicité.
- Décris précisément l'expérience utilisateur dans ui.tips et ui.themeHints.
- Utilise des champs cohérents pour les overrides (ex: pieces, board, events) et assure-toi que les drapeaux d'état nécessaires sont définis.
- Ajoute les capabilities requises en fonction des mécaniques (ex: hidden-objects, trigger-events, owner-aware-rendering).
- Mentionne au moins trois badges décrivant la variante.

Voici un exemple détaillé à suivre lorsque le prompt est « les pions peuvent déposer une mine »:
{
  "meta": {
    "id": "pion-depose-une-mine-9835ec72",
    "name": "Pion dépose une mine",
    "version": "1.0.1",
    "base": "chess-base@1.0.0",
    "description": "Chaque pion peut, une seule fois, déposer une mine sur la case qu’il vient de quitter. La mine est invisible pour l’adversaire et détruit toute pièce entrant sur la case."
  },
  "capabilities": { "requires": ["special-actions", "hidden-objects", "trigger-events", "owner-aware-rendering"] },
  "parameters": {
    "allowAllyExplosion": {
      "type": "boolean", "default": true,
      "description": "Si vrai, vos propres pièces peuvent aussi exploser en entrant sur vos mines."
    }
  },
  "ui": {
    "badges": ["intermédiaire", "piège", "explosif"],
    "tips": [
      "Après avoir déplacé un pion, tu peux déposer une mine sur la case quittée (une fois par pion).",
      "La mine est invisible pour l’adversaire.",
      "Toute pièce qui marche sur une mine est détruite immédiatement; la mine disparaît."
    ],
    "themeHints": {
      "mineIcon": "💣",
      "mineOwnerVisibility": true,
      "mineOpponentVisibility": false,
      "explosionEffect": "particles-explosion",
      "explosionSound": "sfx-explosion-soft"
    }
  },
  "overrides": {
    "pieces": {
      "pawn": {
        "rules": "inherit",
        "state": { "flags": { "usedMine": false } },
        "specialActions": [
          {
            "id": "drop-mine",
            "name": "Déposer une mine",
            "trigger": "after-move",
            "consumesTurn": false,
            "conditions": [
              { "notFlag": { "piece": "self", "flag": "usedMine" } },
              { "squareExists": "previousSquare" }
            ],
            "effect": [
              { "placeHiddenObject": { "type": "mine", "at": "previousSquare", "owner": "same" } },
              { "setFlag": { "piece": "self", "flag": "usedMine", "value": true } }
            ],
            "ui": {
              "prompt": "Déposer une mine sur la case quittée ? (une fois par pion)",
              "confirmLabel": "Déposer la mine",
              "cancelLabel": "Ne pas déposer"
            }
          }
        ]
      }
    }
  },
  "objects": {
    "mine": {
      "type": "hidden",
      "ownerVisibility": true,
      "opponentVisibility": false,
      "render": { "ownerView": { "icon": "mineIcon", "opacity": 0.9 }, "opponentView": { "visible": false } },
      "triggers": [
        {
          "on": "enter-square",
          "conditions": [
            { "any": [ { "paramEquals": ["allowAllyExplosion", true] }, { "pieceOwner": "opponent-of-object-owner" } ] }
          ],
          "actions": [
            { "playEffect": "explosionEffect" },
            { "playSound": "explosionSound" },
            { "destroy": "enteringPiece" },
            { "remove": "self" }
          ]
        }
      ]
    }
  },
  "logic": {
    "moveGeneration": "inherit-all",
    "specialMoves": { "enPassant": "inherit", "castling": "inherit", "promotion": "inherit" },
    "checkDetection": "inherit",
    "endgame": "inherit"
  },
  "arbiter": {
    "uiDisclosure": {
      "forbidden": ["opponentMines", "opponentMineHints"],
      "allowed": ["checkStatus", "mateStatus", "turnIndicator"]
    },
    "notation": { "pgn": { "includeHiddenEvents": false } }
  }
}

Adapte-toi à tous les prompts, y compris ceux qui modifient d'autres pièces, le plateau, des événements aléatoires ou des règles d'équipe.`;

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

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

const shouldRenameHookKey = (record: Record<string, unknown>) =>
  "when" in record && !("on" in record) && ["actions", "effect", "effects", "handler", "then", "do"].some((key) => key in record);

const normaliseVariantSpec = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normaliseVariantSpec(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalisedEntries: Record<string, unknown> = {};

    const renameHook = shouldRenameHookKey(record);

    for (const [key, child] of Object.entries(record)) {
      if (key === "when" && renameHook) {
        normalisedEntries["on"] = normaliseVariantSpec(child);
        continue;
      }

      normalisedEntries[key] = normaliseVariantSpec(child);
    }

    return normalisedEntries;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value;
};

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

const difficultyBadgeMap: Record<NonNullable<GenerateRequest['difficulty']>, string> = {
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  advanced: 'avancé',
};

const buildFallbackSpec = (description: string, difficulty: GenerateRequest['difficulty']) => {
  const baseLine = description.trim().split(/\n+/)[0] || 'Variante personnalisée';
  const slug = slugify(baseLine) || 'variante-personnalisee';
  const suffix = crypto.randomUUID().slice(0, 8);
  const metaName = baseLine.length > 0 ? baseLine : 'Variante personnalisée';
  const badgeDifficulty = difficultyBadgeMap[difficulty ?? 'intermediate'];

  const spec = {
    meta: {
      id: `${slug}-${suffix}`,
      name: metaName,
      version: '1.0.0',
      base: 'chess-base@1.0.0',
      description: `Variante générée hors-ligne basée sur le prompt: ${description.trim()}`,
    },
    capabilities: { requires: ['special-actions'] },
    parameters: {},
    ui: {
      badges: ['personnalisée', badgeDifficulty, 'classique'],
      tips: [
        'Variante générée en mode secours.',
        'Utilise les règles standard des échecs.',
        'Ajoute tes propres effets spéciaux lorsque la génération IA sera disponible.',
      ],
      themeHints: {
        highlightColor: difficulty === 'advanced' ? '#ff6b6b' : '#4dabf7',
        fallback: true,
      },
    },
    overrides: {},
    logic: {
      moveGeneration: 'inherit-all',
      specialMoves: { enPassant: 'inherit', castling: 'inherit', promotion: 'inherit' },
      checkDetection: 'inherit',
      endgame: 'inherit',
    },
    arbiter: {
      uiDisclosure: {
        allowed: ['checkStatus', 'mateStatus', 'turnIndicator'],
      },
      notation: { pgn: { includeHiddenEvents: false } },
    },
  };

  return JSON.stringify(spec, null, 2);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { description, difficulty = 'intermediate' } = await req.json() as GenerateRequest;

    console.log(`[generate-chess-variant-code] Generating plugin spec for: ${description} (${difficulty})`);

    const generationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: VARIANT_SPEC_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Prompt utilisateur: ${description}\nNiveau cible: ${difficulty}.\nGénère le JSON complet du plugin en respectant strictement la structure indiquée.`
          },
        ],
        max_completion_tokens: 3000,
      }),
    });

    if (!generationResponse.ok) {
      const errorText = await generationResponse.text();
      console.error('[generate-chess-variant-code] Spec generation error:', generationResponse.status, errorText);

      if (generationResponse.status === 429) {
        return new Response(JSON.stringify({
          error: 'Rate limit atteinte. Veuillez réessayer dans quelques instants.'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (generationResponse.status === 402) {
        return new Response(JSON.stringify({
          error: 'Crédits insuffisants. Veuillez ajouter des crédits à votre workspace Lovable AI.'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI Gateway error: ${generationResponse.status}`);
    }

    const codeData = await generationResponse.json();
    const rawContent = codeData.choices?.[0]?.message?.content || '';

    let parsedSpec: unknown;
    let formattedSpec = '';

    try {
      parsedSpec = parseJsonLike(rawContent);
      const sanitisedSpec = normaliseVariantSpec(parsedSpec);
      formattedSpec = JSON.stringify(sanitisedSpec, null, 2);
    } catch (error) {
      console.error('[generate-chess-variant-code] Failed to parse generated spec, using fallback.', error);
      formattedSpec = buildFallbackSpec(description, difficulty);
    }

    console.log('[generate-chess-variant-code] Plugin spec generated successfully');

    return new Response(JSON.stringify({
      rules: formattedSpec,
      code: formattedSpec,
      metadata: {
        difficulty,
        model: 'google/gemini-2.5-pro',
        timestamp: new Date().toISOString(),
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-chess-variant-code] Error:', error);
    const fallbackSpec = buildFallbackSpec('Variante indisponible', 'intermediate');
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      rules: fallbackSpec,
      code: fallbackSpec,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
