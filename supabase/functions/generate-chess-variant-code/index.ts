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

const RULES_SYSTEM_PROMPT = `Tu es un expert en game design d'échecs et en création de variantes d'échecs.

Ton rôle est de créer des règles de variantes d'échecs équilibrées, créatives et adaptées au niveau demandé.

Directives:
- Pour niveau débutant: règles simples, peu de nouvelles mécaniques
- Pour niveau intermédiaire: règles avec quelques mécaniques originales mais compréhensibles
- Pour niveau avancé: règles complexes, tactiques profondes, mécaniques sophistiquées

Génère une description détaillée en français incluant:
1. Nom de la variante
2. Objectif du jeu
3. Placement initial des pièces (si différent)
4. Règles de mouvement spéciales
5. Conditions de victoire/défaite
6. Règles spéciales (captures, promotions, etc.)

Sois créatif mais équilibré. Les règles doivent être jouables et intéressantes.`;

const CODE_SYSTEM_PROMPT = `Tu es un expert en TypeScript/JavaScript et en programmation d'échecs avec chess.js.

Ton rôle est de générer du code JavaScript modulaire CommonJS pour automatiser les règles d'une variante d'échecs.

CRITICAL - Structure du code:
- Exporter un objet avec la structure suivante:
  {
    validateMove(game, move): boolean - Valide si un coup est légal selon les règles
    getValidMoves(game, square?): string[] - Retourne les coups valides
    isGameOver(game): boolean - Vérifie si la partie est terminée
    getGameResult(game): 'white' | 'black' | 'draw' | null - Retourne le résultat
    modifyPosition?(game): void - Optionnel: modifie la position initiale
  }

CRITICAL - chess.js API moderne:
- Utilise game.moves() pour les coups valides (retourne string[])
- Utilise game.history() pour l'historique
- Utilise game.fen() pour la position FEN
- Utilise game.isGameOver() pour vérifier la fin
- Utilise game.move(move) pour jouer un coup
- JAMAIS de {sloppy: true}, cette option n'existe plus
- JAMAIS de load_pgn(), utilise loadPgn()

Exemple de structure:
\`\`\`javascript
module.exports = {
  validateMove(game, move) {
    const validMoves = this.getValidMoves(game);
    return validMoves.includes(move.san || move);
  },
  
  getValidMoves(game, square) {
    const moves = game.moves({ verbose: true });
    if (square) {
      return moves
        .filter(m => m.from === square)
        .map(m => m.san);
    }
    return moves.map(m => m.san);
  },
  
  isGameOver(game) {
    return game.isGameOver();
  },
  
  getGameResult(game) {
    if (!this.isGameOver(game)) return null;
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? 'black' : 'white';
    }
    return 'draw';
  }
};
\`\`\`

Génère un code propre, bien commenté, avec gestion d'erreurs robuste.
IMPORTANT: Le code doit être du JavaScript CommonJS pur (module.exports), PAS de TypeScript, PAS d'import ES6.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { description, difficulty = 'intermediate' } = await req.json() as GenerateRequest;
    
    console.log(`[generate-chess-variant-code] Generating rules for: ${description} (${difficulty})`);

    // Étape 1: Générer les règles détaillées
    const rulesResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: RULES_SYSTEM_PROMPT },
          { 
            role: 'user', 
            content: `Crée une variante d'échecs ${difficulty} basée sur: ${description}\n\nGénère une description détaillée et complète des règles.` 
          },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!rulesResponse.ok) {
      const errorText = await rulesResponse.text();
      console.error('[generate-chess-variant-code] Rules generation error:', rulesResponse.status, errorText);
      
      if (rulesResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atteinte. Veuillez réessayer dans quelques instants.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (rulesResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Crédits insuffisants. Veuillez ajouter des crédits à votre workspace Lovable AI.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${rulesResponse.status}`);
    }

    const rulesData = await rulesResponse.json();
    const rules = rulesData.choices?.[0]?.message?.content || '';
    
    console.log('[generate-chess-variant-code] Rules generated, now generating code...');

    // Étape 2: Générer le code d'automatisation
    const codeResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: CODE_SYSTEM_PROMPT },
          { 
            role: 'user', 
            content: `Génère le code JavaScript CommonJS (module.exports) pour automatiser cette variante d'échecs:\n\n${rules}\n\nDescription originale: ${description}\n\nLe code doit:\n1. Exporter un objet avec validateMove, getValidMoves, isGameOver, getGameResult\n2. Utiliser l'API moderne de chess.js (pas de sloppy, pas de load_pgn)\n3. Être du JavaScript CommonJS pur (module.exports)\n4. Inclure des commentaires explicatifs\n5. Gérer les erreurs proprement\n\nRETOURNE UNIQUEMENT LE CODE JAVASCRIPT, sans markdown, sans explications.` 
          },
        ],
        max_completion_tokens: 3000,
      }),
    });

    if (!codeResponse.ok) {
      const errorText = await codeResponse.text();
      console.error('[generate-chess-variant-code] Code generation error:', codeResponse.status, errorText);
      throw new Error(`AI Gateway error: ${codeResponse.status}`);
    }

    const codeData = await codeResponse.json();
    let code = codeData.choices?.[0]?.message?.content || '';
    
    // Nettoyer le code (enlever les markdown wrappers si présents)
    code = code.replace(/```javascript\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('[generate-chess-variant-code] Code generated successfully');

    return new Response(JSON.stringify({ 
      rules,
      code,
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
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
