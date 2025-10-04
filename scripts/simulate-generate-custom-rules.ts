import { generateCustomRules, type DifficultyLevel } from "../supabase/functions/generate-custom-rules/core.ts";

const PROMPT = `Je veux une variante pour apprendre aux enfants à utiliser les fous et les cavaliers.
Les pièces doivent garder leurs déplacements classiques, mais les promotions devraient encourager ces pièces.`;

const difficulty: DifficultyLevel = "beginner";

async function main() {
  const geminiApiKey = process.env.LOVABLE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? undefined;

  const result = await generateCustomRules(
    {
      description: PROMPT,
      difficulty,
    },
    {
      geminiApiKey,
    },
  );

  console.log("[simulate-generate-custom-rules] Règle générée avec succès.");
  console.log("Identifiant:", result.ruleId);
  console.log("Nom suggéré:", result.ruleName);
  if (result.warning) {
    console.log("Avertissement:", result.warning);
  }
  console.log("Hash de compilation:", result.compiledHash.slice(0, 12));
  console.log("Aperçu des règles:\n", result.rules.split("\n").slice(0, 12).join("\n"));
}

main().catch((error) => {
  console.error("Échec de la simulation de génération de règles:", error);
  process.exitCode = 1;
});
