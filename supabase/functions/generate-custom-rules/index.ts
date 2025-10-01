import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CustomRulesRequest {
  description: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const { description, difficulty = 'intermediate' }: CustomRulesRequest = await req.json();

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Crée des règles d'échecs personnalisées basées sur cette description: ${description}`
          }
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const customRules = data.choices[0].message.content.trim();

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
