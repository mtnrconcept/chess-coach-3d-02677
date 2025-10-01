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

    const { description, difficulty = 'intermediate' } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return new Response(JSON.stringify({
        error: "Requête invalide: veuillez fournir une description des règles à générer.",
        rules: 'Impossible de générer les règles pour le moment. Veuillez réessayer.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      const fallbackRules = buildFallbackRules(description, difficulty);
      console.warn('GEMINI_API_KEY is not set. Returning fallback rules.');
      return new Response(JSON.stringify({
        rules: fallbackRules,
        difficulty,
        warning: "Mode démo : configurez la variable d'environnement GEMINI_API_KEY pour activer la génération IA."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      return new Response(JSON.stringify({
        error: `Erreur lors de la génération des règles (${response.status}).`,
        details: errorData,
        rules: 'Impossible de générer les règles pour le moment. Veuillez réessayer.'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const customRules = data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')
      .trim();

    if (!customRules) {
      console.error('Gemini API response did not contain any content:', data);
      throw new Error('Aucune règle générée par le modèle Gemini');
    }

    console.log('Generated custom rules:', customRules);

    return new Response(JSON.stringify({ 
      rules: customRules,
      difficulty
    }), {
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
