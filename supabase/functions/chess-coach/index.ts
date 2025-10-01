import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChessCoachRequest {
  position: string;
  lastMove?: { from: string; to: string; san: string };
  gamePhase?: 'opening' | 'middlegame' | 'endgame';
  moveCount?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const sendSuccess = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { position, lastMove, gamePhase = 'opening', moveCount = 1 }: ChessCoachRequest = await req.json();

    const baseResponse = {
      coaching: 'Continuez à jouer, chaque coup est une leçon !',
      gamePhase,
      moveCount,
    };

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      console.warn('GROQ_API_KEY is not set – returning fallback coaching message');
      return sendSuccess({ ...baseResponse, warning: 'missing_api_key' });
    }

    // Construct coaching prompt based on game context
    let systemPrompt = `Tu es un maître d'échecs professionnel et coach IA. Tu analyses les positions d'échecs et donnes des conseils en français.

INSTRUCTIONS:
- Sois concis (maximum 2-3 phrases)
- Utilise un ton encourageant et pédagogique
- Mentionne les principes d'échecs quand pertinent
- Identifie les ouvertures, tactiques et stratégies
- Adapte tes conseils au niveau débutant/intermédiaire

CONTEXTE DU JEU:
- Phase: ${gamePhase}
- Coup numéro: ${moveCount}
- Position FEN: ${position}
${lastMove ? `- Dernier coup: ${lastMove.san} (${lastMove.from}->${lastMove.to})` : ''}

Analyse brièvement la position et donne un conseil constructif.`;

    // Phase-specific advice
    if (gamePhase === 'opening') {
      systemPrompt += `\n\nPRINCIPES D'OUVERTURE à rappeler:
- Développement des pièces
- Contrôle du centre (e4, d4, e5, d5)
- Sécurité du roi (roque)
- Ne pas sortir la dame trop tôt`;
    } else if (gamePhase === 'middlegame') {
      systemPrompt += `\n\nPRINCIPES DE MILIEU DE JEU:
- Amélioration des pièces
- Tactiques (fourchettes, clouages, découvertes)
- Contrôle des colonnes et diagonales
- Structure de pions`;
    } else if (gamePhase === 'endgame') {
      systemPrompt += `\n\nPRINCIPES DE FINALE:
- Activation du roi
- Promotion des pions
- Techniques de mat élémentaires
- Opposition et zugzwang`;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: lastMove
              ? `Analyse le coup ${lastMove.san} dans cette position.`
              : `Analyse cette position d'échecs et donne un conseil.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Groq API error:', errorData);
      return sendSuccess({ ...baseResponse, warning: `groq_error_${response.status}` });
    }

    const data = await response.json();
    const coaching = data.choices?.[0]?.message?.content?.trim();

    if (!coaching) {
      console.warn('Groq API returned no coaching content – using fallback message');
      return sendSuccess({ ...baseResponse, warning: 'empty_response' });
    }

    console.log('Generated coaching:', coaching);

    return sendSuccess({
      coaching,
      gamePhase,
      moveCount,
    });
  } catch (error) {
    console.error('Error in chess-coach function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return sendSuccess({
      coaching: 'Continuez à jouer, chaque coup est une leçon !',
      error: errorMessage,
    });
  }
});
