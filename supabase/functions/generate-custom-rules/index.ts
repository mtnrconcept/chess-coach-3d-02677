import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const buildFallbackRules = (description: string, difficulty: DifficultyLevel) => {
  const sanitizedDescription = description.trim() || 'Aucune description fournie';
  const levelLabel = difficultyLabels[difficulty];

  return [
    'Mode hors ligne — génération assistée indisponible pour le moment.',
    '',
    `Voici un canevas ${levelLabel} basé sur votre idée :`,
    `• Idée de départ : "${sanitizedDescription}"`,
    `• Objectif pédagogique : ${focusPoints[difficulty]}.`,
    '',
    'Règles proposées :',
    `1. Phase d’ouverture : chaque joueur dispose d’un « droit d’adaptation » une fois par partie pour déplacer une pièce différemment, tant que le déplacement reste logique avec votre thème.`,
    `2. Action spéciale : ${specialActions[difficulty]}`,
    `3. Zones d’influence : toute case contrôlée par deux pièces alliées devient un « bastion » qui annule les effets spéciaux adverses lorsqu’on y termine un déplacement.`,
    `4. Condition de victoire alternative : ${endgameChallenges[difficulty]}.`,
    '',
    'Ajustez chaque point selon vos envies, ajoutez des limites de temps ou des récompenses supplémentaires et testez-les sur quelques parties rapides pour affiner l’équilibre.',
  ].join('\n');
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const buildFallbackPlugin = (
  ruleId: string,
  ruleName: string,
  rules: string,
  difficulty: DifficultyLevel,
): string => `const rule = {
  id: '${ruleId}',
  name: '${ruleName.replace(/'/g, "\\'")}',
  description: 'Variante générée automatiquement (mode démo ${difficulty}).',
  onAfterMoveApply(state, ctx, api) {
    console.log('[demo-rule]', '${ruleId}', 'aucun effet automatique – appliquez les règles manuellement.');
  },
};

module.exports = rule;
`;

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

    const systemPrompt = `Tu es un expert en échecs et en conception de règles de jeu. Tu crées des règles d'échecs personnalisées qui sont:
- Équilibrées et justes pour les deux joueurs
- Claires et faciles à comprendre
- Intéressantes et innovantes
- Adaptées au niveau: ${difficulty}

INSTRUCTIONS:
- Réponds en français
- Fournis des règles précises et détaillées
- Explique comment ces règles modifient le jeu standard
- Donne des exemples concrets si nécessaire
- Assure-toi que les règles sont jouables et logiques`;

    const fallbackRules = buildFallbackRules(description, difficulty);

    let customRules = fallbackRules;
    let pluginCode = buildFallbackPlugin(ruleId, suggestedRuleName, fallbackRules, difficulty);
    let warning: string | undefined;
    let pluginWarning: string | undefined;

    if (!geminiApiKey) {
      warning = "Mode démo : configurez la variable d'environnement GEMINI_API_KEY pour activer la génération IA.";
      console.warn('No Gemini API key found. Returning fallback rules & plugin.');
    } else {
      const payload = {
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Crée des règles d'échecs personnalisées basées sur cette description: ${description}`
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 800
        }
      };

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
        const generatedRules = data.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? '')
          .join('\n')
          .trim();

        if (generatedRules) {
          customRules = generatedRules;
        } else {
          warning = 'La génération IA n’a pas renvoyé de règles exploitables. Utilisation du mode hors-ligne.';
        }
      }

      // Try to generate automation code if the API key is available
      try {
        const pluginPrompt = `Tu génères du code JavaScript (CommonJS) qui exporte un objet respectant l'interface suivante :
interface RulePlugin {
  id: string;
  name: string;
  description: string;
  onGenerateExtraMoves?(state, pos, piece, api): Move[];
  onBeforeMoveApply?(state, move, api): { allow: boolean; transform?: (s) => void; reason?: string };
  onAfterMoveApply?(state, ctx, api): void;
  onTurnStart?(state, api): void;
}

Le moteur fourni ressemble à chess.js. Tu peux utiliser un helper "helpers" passé en paramètre qui expose :
- helpers.clone(value) : clone profond
- helpers.eqPos(a, b)
- helpers.dirs : { rook: Pos[], bishop: Pos[] }
- helpers.neighbors(pos) : renvoie les 8 cases autour
- helpers.createMove(from, to, meta?) : construit un Move
- helpers.ruleId : identifiant imposé (${ruleId})

Rédige du code modulaire, sans dépendances externes, en respectant strictement CommonJS (module.exports = rule). Le code doit automatiser la variante décrite ci-dessous en respectant les règles classiques des échecs. N'invente pas de nouvelles pièces.
VARIANTE: ${suggestedRuleName}
DIFFICULTÉ: ${difficultyLabels[difficulty]}
DESCRIPTION UTILISATEUR: ${description}
RÈGLES DÉTAILLÉES:\n${customRules}`;

        const pluginResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              role: 'system',
              parts: [{ text: 'Tu es un expert en développement TypeScript et en variantes d\'échecs.' }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: pluginPrompt }]
              }
            ],
            generationConfig: {
              maxOutputTokens: 1200
            }
          }),
        });

        if (pluginResponse.ok) {
          const pluginData = await pluginResponse.json();
          const rawCode = pluginData.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? '')
            .join('\n')
            .trim();

          if (rawCode) {
            const sanitizeGeneratedCode = (value: string) => {
              const codeBlockMatch = value.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
              const trimmed = codeBlockMatch ? codeBlockMatch[1] : value;
              return trimmed
                .replace(/^export\s+default\s+/m, 'module.exports = ')
                .trim();
            };

            let sanitizedCode = sanitizeGeneratedCode(rawCode);

            if (!/module\.exports\s*=/.test(sanitizedCode)) {
              // Some generations return an object literal directly. Wrap it into a rule variable.
              const directObjectExport = sanitizedCode.match(/^{[\s\S]*}$/);
              if (directObjectExport) {
                sanitizedCode = `const rule = ${sanitizedCode}\n\nmodule.exports = rule;`;
              } else {
                pluginWarning =
                  'Le code généré ne respecte pas le format attendu. Utilisation d’un squelette de règle.';
              }
            }

            if (!pluginWarning) {
              const ensureRuleId = (source: string) => {
                if (source.includes(ruleId) || source.includes('helpers.ruleId')) {
                  return source;
                }

                const idPropertyRegex = /(id\s*:\s*)(['"])(.*?)\2/;
                if (idPropertyRegex.test(source)) {
                  return source.replace(idPropertyRegex, `$1'${ruleId}'`);
                }

                if (/const\s+rule\s*=\s*{/.test(source)) {
                  return source.replace(
                    /const\s+rule\s*=\s*{/,
                    `const rule = {\n  id: '${ruleId}',`
                  );
                }

                if (/module\.exports\s*=\s*{/.test(source)) {
                  return source.replace(
                    /module\.exports\s*=\s*{/,
                    `const rule = {\n  id: '${ruleId}',`
                  ).concat('\n\nmodule.exports = rule;');
                }

                return `const rule = ${source.startsWith('module.exports') ? source.replace(/module\.exports\s*=\s*/, '') : source}\n\nrule.id = '${ruleId}';\nmodule.exports = rule;`;
              };

              sanitizedCode = ensureRuleId(sanitizedCode);

              if (!/module\.exports\s*=/.test(sanitizedCode)) {
                sanitizedCode += `\n\nmodule.exports = rule;`;
              }

              pluginCode = sanitizedCode.trim();
            }
          } else {
            pluginWarning = 'La génération du code automatique a échoué. Utilisation d’un squelette de règle.';
          }
        } else {
          const pluginError = await pluginResponse.text();
          console.error('Gemini plugin generation error:', pluginError);
          pluginWarning = 'Le code de la variante n’a pas pu être généré automatiquement.';
        }
      } catch (pluginError) {
        console.error('Failed to generate plugin code:', pluginError);
        pluginWarning = 'La génération du code automatique a rencontré une erreur.';
      }
    }

    const responsePayload: CustomRulesResponse = {
      rules: customRules,
      difficulty,
      ruleId,
      ruleName: suggestedRuleName,
      pluginCode,
      warning,
      pluginWarning,
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
