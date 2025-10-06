import { useState } from "react";
import { Sparkles, Save, PlayCircle, AlertCircle, CheckCircle } from "lucide-react";

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const fencePattern = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)```$/;
  const match = trimmed.match(fencePattern);

  if (match) {
    return match[1]?.trim() ?? trimmed;
  }

  const firstBreak = trimmed.indexOf("\n");
  const closingIndex = trimmed.lastIndexOf("```");

  if (firstBreak !== -1 && closingIndex > firstBreak) {
    return trimmed.slice(firstBreak + 1, closingIndex).trim();
  }

  return trimmed;
};

const cleanJsonOutput = (value: string) => stripCodeFences(value).trim();

type GeneratedRule = {
  ruleId: string;
  ruleName: string;
  description: string;
  category: string;
  affectedPieces: string[];
  trigger: string;
  conditions: Array<Record<string, unknown>>;
  effects: Array<Record<string, unknown>>;
  priority: number;
  isActive: boolean;
};

type SavedRule = GeneratedRule & {
  createdAt: string;
  status: "active" | "inactive";
};

type LovableMessage = {
  role?: string;
  content?: string;
};

type LovableChoice = {
  message?: LovableMessage;
};

type LovableResponse = {
  choices?: LovableChoice[];
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

    const apiKey = import.meta.env.VITE_LOVABLE_API_KEY;

    if (!apiKey || typeof apiKey !== "string") {
      setError("Clé API Lovable manquante. Ajoutez VITE_LOVABLE_API_KEY à votre configuration.");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedRule(null);

    try {
      const payload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert en règles d'échecs et en génération de configurations JSON pour un moteur de jeu d'échecs personnalisable.",
          },
          {
            role: "user",
            content: `L’utilisateur veut créer une règle personnalisée : "${prompt}"\n\nTu dois générer un objet JSON structuré qui représente cette règle de manière exécutable par un moteur de jeu. Le JSON doit contenir :\n\n1. "ruleId": un identifiant unique (format: rule_[timestamp])\n1. "ruleName": un nom court et descriptif\n1. "description": une description détaillée de la règle\n1. "category": catégorie parmi ["movement", "capture", "special", "condition", "victory", "restriction"]\n1. "affectedPieces": liste des pièces affectées ["king", "queen", "rook", "bishop", "knight", "pawn", "all"]\n1. "trigger": quand la règle s’applique ["always", "onMove", "onCapture", "onCheck", "turnBased", "conditional"]\n1. "conditions": tableau d’objets condition avec {type, value, operator}\n1. "effects": tableau d’objets effet avec {action, target, parameters}\n1. "priority": niveau de priorité (1-10)\n1. "isActive": true par défaut\n\nIMPORTANT: Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans backticks ni formatage markdown. Juste le JSON pur.`,
          },
        ],
        stream: false,
      };

      const response = await fetch(LOVABLE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Erreur Lovable (${response.status}): ${message}`);
      }

      const data = (await response.json()) as LovableResponse;
      const rawContent = data.choices?.[0]?.message?.content?.trim();

      if (!rawContent) {
        throw new Error("La réponse de Lovable ne contient aucun contenu généré.");
      }

      const parsedRule = JSON.parse(cleanJsonOutput(rawContent)) as Partial<GeneratedRule>;

      const completedRule: GeneratedRule = {
        ruleId: parsedRule.ruleId ?? `rule_${Date.now()}`,
        ruleName: parsedRule.ruleName ?? "Règle personnalisée",
        description: parsedRule.description ?? prompt.trim(),
        category: parsedRule.category ?? "special",
        affectedPieces: Array.isArray(parsedRule.affectedPieces)
          ? (parsedRule.affectedPieces.filter((piece) => typeof piece === "string") as string[])
          : ["all"],
        trigger: parsedRule.trigger ?? "always",
        conditions: Array.isArray(parsedRule.conditions)
          ? (parsedRule.conditions as Array<Record<string, unknown>>)
          : [],
        effects: Array.isArray(parsedRule.effects)
          ? (parsedRule.effects as Array<Record<string, unknown>>)
          : [],
        priority: typeof parsedRule.priority === "number" ? parsedRule.priority : 5,
        isActive: parsedRule.isActive ?? true,
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
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <CheckCircle className="text-green-400" size={28} />
                {generatedRule.ruleName}
              </h2>
              <span className="bg-purple-500 text-white px-3 py-1 rounded-full text-sm">
                {generatedRule.category}
              </span>
            </div>

            <p className="text-purple-200 mb-4">{generatedRule.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-purple-300 text-sm mb-1">Pièces affectées</p>
                <p className="text-white font-semibold">{generatedRule.affectedPieces.join(", ")}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-purple-300 text-sm mb-1">Déclencheur</p>
                <p className="text-white font-semibold">{generatedRule.trigger}</p>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <p className="text-purple-300 text-sm mb-2">Configuration JSON</p>
              <pre className="text-green-400 text-xs overflow-x-auto">
                {JSON.stringify(generatedRule, null, 2)}
              </pre>
            </div>

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
                <div key={rule.ruleId} className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{rule.ruleName}</p>
                    <p className="text-purple-300 text-sm">{rule.description}</p>
                  </div>
                  <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                    Actif
                  </span>
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
