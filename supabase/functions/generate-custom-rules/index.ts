import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  generateCustomRules,
  type CustomRulesRequest,
  type DifficultyLevel,
} from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isDifficulty = (value: unknown): value is DifficultyLevel =>
  value === "beginner" || value === "intermediate" || value === "advanced";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Invalid JSON payload received:", parseError);
      return new Response(
        JSON.stringify({
          error: "Requête invalide: le corps doit être un JSON valide.",
          rules: "Impossible de générer les règles pour le moment. Veuillez réessayer.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = (body ?? {}) as Partial<CustomRulesRequest>;
    const { description, difficulty = "intermediate", ruleName } = payload;

    if (typeof description !== "string" || description.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: "Requête invalide: veuillez fournir une description des règles à générer.",
          rules: "Impossible de générer les règles pour le moment. Veuillez réessayer.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const selectedDifficulty = isDifficulty(difficulty) ? difficulty : "intermediate";

    const geminiApiKey =
      Deno.env.get("LOVABLE_GEMINI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? undefined;

    const responsePayload = await generateCustomRules(
      {
        description,
        difficulty: selectedDifficulty,
        ruleName: typeof ruleName === "string" ? ruleName : undefined,
      },
      { geminiApiKey },
    );

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-custom-rules function:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({
        error: errorMessage,
        rules: "Impossible de générer les règles pour le moment. Veuillez réessayer.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
