import { useState } from "react";
import { Sparkles, Save, PlayCircle, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import type { RuleSpec, CompiledRuleset } from "@/lib/rulesets/types";

type DifficultyLevel = "beginner" | "intermediate" | "advanced";

type CustomRulesResponse = {
  rules?: string;
  difficulty?: DifficultyLevel;
  ruleId?: string;
  ruleName?: string;
  pluginCode?: string;
  warning?: string;
  pluginWarning?: string;
  compiledRuleset?: CompiledRuleset;
  compiledHash?: string;
  ruleSpec?: RuleSpec;
  compilerWarnings?: string[];
};

type GeneratedRule = {
  ruleId: string;
  ruleName: string;
  description: string;
  difficulty: DifficultyLevel;
  warning?: string;
  pluginWarning?: string;
  ruleSpecJson: string;
  compiledRulesetJson: string | null;
};

type SavedRule = GeneratedRule & {
  createdAt: string;
  status: "active" | "inactive";
};

const ChessRuleEngine = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState("");
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);

  const generateRule = async () => {
    if (!prompt.trim()) {
      setError("Veuillez entrer une description de règle");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedRule(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("generate-custom-rules", {
        body: { description: prompt.trim() },
      });

      if (functionError) {
        const message =
          typeof functionError === "object" && functionError !== null && "message" in functionError
            ? (functionError as { message?: string }).message ?? ""
            : "";
        throw new Error(message || "Erreur lors de la génération de la règle via le backend.");
      }

      if (!data) {
        throw new Error("Réponse vide du générateur de règles.");
      }

      const response = data as CustomRulesResponse;
      const ruleSpecJson = response.ruleSpec ? JSON.stringify(response.ruleSpec, null, 2) : "";
      const compiledRulesetJson = response.compiledRuleset ? JSON.stringify(response.compiledRuleset, null, 2) : null;

      const completedRule: GeneratedRule = {
        ruleId: typeof response.ruleId === "string" && response.ruleId.length > 0 ? response.ruleId : `rule_${Date.now()}`,
        ruleName:
          typeof response.ruleName === "string" && response.ruleName.trim().length > 0
            ? response.ruleName.trim()
            : "Règle personnalisée",
        description:
          response.ruleSpec?.meta?.description?.trim().length
            ? response.ruleSpec.meta.description.trim()
            : prompt.trim(),
        difficulty: response.difficulty ?? "intermediate",
        warning: response.warning,
        pluginWarning: response.pluginWarning,
        ruleSpecJson,
        compiledRulesetJson,
      };

      setGeneratedRule(completedRule);
    } catch (err) {
      console.error("Erreur Lovable:", err);
      const message = err instanceof Error ? err.message : "Erreur lors de la génération de la règle. Veuillez réessayer.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!generatedRule) return;

    try {
      const newRule: SavedRule = {
        ...generatedRule,
        createdAt: new Date().toISOString(),
        status: "active",
      };

      setSavedRules((prev) => [...prev, newRule]);
      console.log("Règle sauvegardée dans le backend:", newRule);
      alert("Règle sauvegardée avec succès !");
      setPrompt("");
      setGeneratedRule(null);
    } catch (err) {
      console.error("Erreur lors de la sauvegarde:", err);
      setError("Erreur lors de la sauvegarde");
    }
  };

  const testRule = () => {
    if (!generatedRule) return;

    console.log("Test de la règle:", generatedRule);
    alert("Lancement du test de la règle dans l'environnement de jeu...");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Sparkles className="text-purple-400" size={40} />
            Moteur de Règles d’Échecs
          </h1>
          <p className="text-purple-200">Créez des règles personnalisées avec l’IA</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <label className="block text-white font-semibold mb-3">
            Décrivez votre règle personnalisée
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ex: Le cavalier peut se déplacer deux fois par tour, ou Les pions peuvent capturer en diagonale sur 2 cases..."
            className="w-full h-32 bg-white/10 border border-white/30 rounded-lg p-4 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          <button
            onClick={generateRule}
            disabled={loading}
            className="mt-4 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Générer la règle
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="text-red-400" size={24} />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {generatedRule && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="text-green-400" size={28} />
              <div>
                <h2 className="text-2xl font-bold text-white">Règle générée</h2>
                <p className="text-purple-200">Issue du générateur Lovable via le backend sécurisé</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-semibold text-lg mb-4">Informations principales</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-purple-300 font-medium">Nom de la règle:</span>
                    <p className="text-white text-lg">{generatedRule.ruleName}</p>
                  </div>
                  <div>
                    <span className="text-purple-300 font-medium">Identifiant:</span>
                    <p className="text-white font-mono text-sm">{generatedRule.ruleId}</p>
                  </div>
                  <div>
                    <span className="text-purple-300 font-medium">Difficulté:</span>
                    <p className="text-white capitalize">{generatedRule.difficulty}</p>
                  </div>
                  {generatedRule.warning && (
                    <div className="text-amber-300 text-sm bg-amber-500/10 border border-amber-300/40 rounded-lg p-3">
                      {generatedRule.warning}
                    </div>
                  )}
                  {generatedRule.pluginWarning && (
                    <div className="text-amber-300 text-sm bg-amber-500/10 border border-amber-300/40 rounded-lg p-3">
                      {generatedRule.pluginWarning}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-semibold text-lg mb-4">Description</h3>
                <p className="text-purple-200 whitespace-pre-wrap">{generatedRule.description}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10 mb-6">
              <h3 className="text-white font-semibold text-lg mb-3">RuleSpec généré</h3>
              <pre className="bg-black/40 text-green-300 p-4 rounded-lg overflow-x-auto text-sm">
                {generatedRule.ruleSpecJson}
              </pre>
            </div>

            {generatedRule.compiledRulesetJson && (
              <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10 mb-6">
                <h3 className="text-white font-semibold text-lg mb-3">CompiledRuleset</h3>
                <pre className="bg-black/40 text-green-300 p-4 rounded-lg overflow-x-auto text-sm">
                  {generatedRule.compiledRulesetJson}
                </pre>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={saveRule}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-all flex items-center justify-center gap-2"
              >
                <Save size={20} />
                Sauvegarder
              </button>
              <button
                onClick={testRule}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <PlayCircle size={20} />
                Tester
              </button>
            </div>
          </div>
        )}

        {savedRules.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">
              Règles Sauvegardées ({savedRules.length})
            </h3>
            <div className="space-y-3">
              {savedRules.map((rule) => (
                <div key={rule.ruleId} className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white font-semibold">{rule.ruleName}</p>
                      <p className="text-purple-300 text-sm capitalize">{rule.difficulty}</p>
                    </div>
                    <span className="text-slate-300 text-sm">{new Date(rule.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-200 text-sm mb-3">{rule.description}</p>
                  <pre className="bg-black/40 text-green-300 p-3 rounded-lg overflow-x-auto text-xs">
                    {rule.ruleSpecJson}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChessRuleEngine;
