import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Save, PlayCircle, AlertCircle, CheckCircle, Loader2, FileCode } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import type { RuleSpec, CompiledRuleset } from "@/lib/rulesets/types";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/services/supabase/types";
import {
  buildSummary,
  difficultyLabelMap,
  ensureCompiledHash,
  sanitisePluginSource,
  slugify,
  type DifficultyLevel,
} from "@/lib/rulesets/generator-helpers";

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
  ruleSpec: RuleSpec | null;
  compiledRuleset: CompiledRuleset | null;
  compiledHash: string | null;
  pluginCode: string | null;
  compilerWarnings: string[];
  rulesText: string;
  prompt: string;
};

type SavedRule = {
  id: string;
  ruleId: string | null;
  ruleName: string;
  difficulty: string | null;
  description: string;
  createdAt: string;
  ruleSpecJson: string | null;
  compiledHash: string | null;
};

type SavedVariantForTest = {
  id: string;
  slug: string;
  ruleId: string;
  title: string;
  summary: string;
  rules: string;
  difficulty: DifficultyLevel | null;
  prompt: string | null;
  compiledRuleset: CompiledRuleset | null;
  compiledHash: string | null;
  hasCompiled: boolean;
};

const ChessRuleEngine = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState("");
  const [lastSavedVariant, setLastSavedVariant] = useState<SavedVariantForTest | null>(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const savedVariantsQuery = useQuery({
    queryKey: ["rule-engine", "saved-variants"],
    queryFn: async (): Promise<Tables<'chess_variants'>[]> => {
      const { data, error } = await supabase
        .from("chess_variants")
        .select("id, rule_id, title, summary, difficulty, metadata, created_at")
        .eq("source", "generated")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      return (data ?? []) as Tables<'chess_variants'>[];
    },
  });

  const savedRules = useMemo<SavedRule[]>(() => {
    if (!savedVariantsQuery.data) {
      return [];
    }

    return savedVariantsQuery.data.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const ruleSpec =
        metadata && typeof metadata === "object" && "ruleSpec" in metadata && metadata.ruleSpec
          ? (metadata.ruleSpec as RuleSpec)
          : null;
      const compiledMeta =
        metadata && typeof metadata === "object" && "compiled" in metadata && metadata.compiled
          ? (metadata.compiled as Record<string, unknown>)
          : null;

      const compiledHash =
        compiledMeta && typeof compiledMeta.hash === "string" ? compiledMeta.hash : null;

      return {
        id: row.id,
        ruleId: row.rule_id ?? null,
        ruleName: row.title,
        difficulty: row.difficulty ?? null,
        description: row.summary,
        createdAt: row.created_at,
        ruleSpecJson: ruleSpec ? JSON.stringify(ruleSpec, null, 2) : null,
        compiledHash,
      } satisfies SavedRule;
    });
  }, [savedVariantsQuery.data]);

  const generateRule = async () => {
    if (!prompt.trim()) {
      setError("Veuillez entrer une description de règle");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedRule(null);
    setLastSavedVariant(null);

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
      const ruleSpec = response.ruleSpec ?? null;
      const { ruleset: ensuredRuleset, hash: ensuredHash } = await ensureCompiledHash(
        response.compiledRuleset ?? null,
        response.compiledHash ?? null,
      );

      const compiledRulesetJson = ensuredRuleset ? JSON.stringify(ensuredRuleset, null, 2) : null;
      const ruleSpecJson = ruleSpec ? JSON.stringify(ruleSpec, null, 2) : "";

      const textualRules =
        ensuredRuleset && compiledRulesetJson
          ? compiledRulesetJson
          : typeof response.rules === "string" && response.rules.trim().length > 0
            ? response.rules.trim()
            : prompt.trim();

      const sanitizedPlugin = sanitisePluginSource(response.pluginCode);

      const completedRule: GeneratedRule = {
        ruleId: typeof response.ruleId === "string" && response.ruleId.length > 0 ? response.ruleId : `rule_${Date.now()}`,
        ruleName:
          typeof response.ruleName === "string" && response.ruleName.trim().length > 0
            ? response.ruleName.trim()
            : "Règle personnalisée",
        description:
          ruleSpec?.meta?.description?.trim().length
            ? ruleSpec.meta.description.trim()
            : textualRules.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? prompt.trim(),
        difficulty: response.difficulty ?? "intermediate",
        warning: response.warning,
        pluginWarning: response.pluginWarning,
        ruleSpecJson,
        compiledRulesetJson,
        ruleSpec,
        compiledRuleset: ensuredRuleset,
        compiledHash: ensuredHash ?? null,
        pluginCode: sanitizedPlugin,
        compilerWarnings: Array.isArray(response.compilerWarnings) ? response.compilerWarnings : [],
        rulesText: textualRules,
        prompt: prompt.trim(),
      };

      setGeneratedRule(completedRule);
    } catch (err) {
      console.error("Erreur Lovable:", err);
      const message =
        err instanceof Error ? err.message : "Erreur lors de la génération de la règle. Veuillez réessayer.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!generatedRule) return;

    setIsSaving(true);
    setError("");

    try {
      const { ruleset: ensuredRuleset, hash } = await ensureCompiledHash(
        generatedRule.compiledRuleset,
        generatedRule.compiledHash,
      );

      let compiledBlock:
        | {
            hash: string;
            generatedAt: string;
            warnings: string[];
            ruleset: CompiledRuleset;
          }
        | null = null;

      if (ensuredRuleset && hash) {
        compiledBlock = {
          hash,
          generatedAt: new Date().toISOString(),
          warnings: generatedRule.compilerWarnings,
          ruleset: ensuredRuleset,
        };
      }

      const summary = buildSummary(generatedRule.prompt, generatedRule.rulesText, generatedRule.ruleSpec);
      const baseSlug = slugify(generatedRule.ruleName);
      const fallbackSlug = baseSlug.length > 0 ? baseSlug : slugify(generatedRule.ruleId) || generatedRule.ruleId;
      const slug = compiledBlock?.hash ? `${fallbackSlug}-${compiledBlock.hash.slice(0, 6)}` : fallbackSlug;

      const metadataPayload: Record<string, unknown> = { slug };

      if (compiledBlock) {
        metadataPayload.compiled = compiledBlock;
        metadataPayload.kind = "automated";
      }

      if (generatedRule.ruleSpec) {
        metadataPayload.ruleSpec = generatedRule.ruleSpec;
      }

      const pluginWarning = generatedRule.pluginWarning ? generatedRule.pluginWarning : undefined;

      if (generatedRule.pluginCode) {
        metadataPayload.plugin = {
          source: "external",
          code: generatedRule.pluginCode,
          ruleId: generatedRule.ruleId,
          createdAt: new Date().toISOString(),
          ...(pluginWarning ? { warning: pluginWarning } : {}),
        };
      } else if (compiledBlock || generatedRule.ruleSpec) {
        metadataPayload.plugin = {
          source: "schema",
          ruleId: generatedRule.ruleId,
          createdAt: new Date().toISOString(),
          ...(pluginWarning ? { warning: pluginWarning } : {}),
        };
      } else if (pluginWarning) {
        metadataPayload.plugin = {
          source: "external",
          ruleId: generatedRule.ruleId,
          createdAt: new Date().toISOString(),
          warning: pluginWarning,
        };
      }

      const payload: TablesInsert<'chess_variants'> = {
        title: generatedRule.ruleName,
        summary,
        rules: generatedRule.rulesText,
        difficulty: generatedRule.difficulty,
        prompt: generatedRule.prompt.length > 0 ? generatedRule.prompt : null,
        source: "generated",
        metadata: metadataPayload as TablesInsert<'chess_variants'>['metadata'],
        rule_id: generatedRule.ruleId,
      };

      const { data, error } = await supabase
        .from("chess_variants")
        .insert(payload)
        .select()
        .single();

      let variantId = data?.id ?? null;
      let isUpdate = false;

      if (error) {
        const conflictText = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase().trim();
        const isRuleIdConflict =
          Boolean(generatedRule.ruleId) &&
          (conflictText.includes("duplicate key") ||
            conflictText.includes("chess_variants_rule_id_key") ||
            error.code === "23505");

        if (isRuleIdConflict && generatedRule.ruleId) {
          const updatePayload: TablesUpdate<'chess_variants'> = {
            title: generatedRule.ruleName,
            summary,
            rules: generatedRule.rulesText,
            difficulty: generatedRule.difficulty,
            prompt: generatedRule.prompt.length > 0 ? generatedRule.prompt : null,
            source: "generated",
            metadata: metadataPayload as TablesUpdate<'chess_variants'>['metadata'],
            rule_id: generatedRule.ruleId,
          };

          const { data: updatedVariant, error: updateError } = await supabase
            .from("chess_variants")
            .update(updatePayload)
            .eq("rule_id", generatedRule.ruleId)
            .select()
            .single();

          if (updateError) throw updateError;

          variantId = updatedVariant?.id ?? null;
          isUpdate = true;
        } else {
          throw error;
        }
      }

      if (variantId) {
        const promptPayload: TablesInsert<'chess_variant_prompts'> = {
          variant_id: variantId,
          prompt: generatedRule.prompt.length > 0 ? generatedRule.prompt : summary,
          difficulty: generatedRule.difficulty,
          rules: generatedRule.rulesText,
        };

        const { error: promptError } = await supabase
          .from("chess_variant_prompts")
          .insert(promptPayload);

        if (promptError) {
          console.error("Failed to archive prompt", promptError);
          toast.warning("Variante enregistrée mais l'historique du prompt n'a pas pu être archivé.");
        }
      }

      setLastSavedVariant({
        id: variantId ?? generatedRule.ruleId,
        slug: slug.length > 0 ? slug : generatedRule.ruleId,
        ruleId: generatedRule.ruleId,
        title: generatedRule.ruleName,
        summary,
        rules: generatedRule.rulesText,
        difficulty: generatedRule.difficulty,
        prompt: generatedRule.prompt.length > 0 ? generatedRule.prompt : null,
        compiledRuleset: compiledBlock?.ruleset ?? ensuredRuleset ?? null,
        compiledHash: compiledBlock?.hash ?? hash ?? null,
        hasCompiled: Boolean(compiledBlock?.ruleset ?? ensuredRuleset),
      });

      toast.success(
        isUpdate ? "Votre variante a été mise à jour dans le lobby !" : "Votre variante a été ajoutée au lobby !",
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chess-variants"] }),
        queryClient.invalidateQueries({ queryKey: ["rule-engine", "saved-variants"] }),
      ]);
    } catch (err) {
      console.error("Erreur lors de la sauvegarde:", err);
      const message =
        err instanceof Error ? err.message : "Impossible d'enregistrer la variante pour le moment.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const testRule = () => {
    if (!lastSavedVariant) {
      toast.error("Enregistrez la règle avant de la tester dans l'arène de jeu.");
      return;
    }

    const params = new URLSearchParams();
    params.set("variant", lastSavedVariant.slug);

    if (lastSavedVariant.hasCompiled && lastSavedVariant.compiledRuleset) {
      try {
        localStorage.setItem(
          `compiled-ruleset:${lastSavedVariant.slug}`,
          JSON.stringify(lastSavedVariant.compiledRuleset),
        );
        params.set("compiled", "1");
      } catch (storageError) {
        console.error("Failed to persist compiled ruleset", storageError);
      }
    }

    navigate(`/game?${params.toString()}`, {
      state: {
        timeControl: {
          name: "Blitz 5+0",
          time: "5+0",
          minutes: 5,
          increment: 0,
          description: "Partie avec variante personnalisée",
        },
        eloLevel: { name: "Défi IA", elo: "custom", color: "bg-purple-500" },
        coachingMode: false,
        gameMode: "ai",
        variant: {
          id: lastSavedVariant.id,
          title: lastSavedVariant.title,
          ruleId: lastSavedVariant.ruleId,
          description: lastSavedVariant.summary,
          rules: lastSavedVariant.rules,
          source: "generated" as const,
          difficulty: lastSavedVariant.difficulty ?? undefined,
          prompt: lastSavedVariant.prompt ?? undefined,
          slug: lastSavedVariant.slug,
          compiledHash: lastSavedVariant.compiledHash,
          hasCompiled: lastSavedVariant.hasCompiled,
        },
      },
    });
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
                    <p className="text-white capitalize">
                      {difficultyLabelMap[generatedRule.difficulty] ?? generatedRule.difficulty}
                    </p>
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
                  {generatedRule.compilerWarnings.length > 0 && (
                    <div className="text-amber-200 text-sm bg-amber-500/10 border border-amber-300/40 rounded-lg p-3 space-y-1">
                      <p className="font-semibold">Avertissements du compilateur :</p>
                      <ul className="list-disc list-inside space-y-1">
                        {generatedRule.compilerWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
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

            {generatedRule.pluginCode && (
              <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10 mb-6">
                <h3 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-purple-300" />
                  Plugin externe
                </h3>
                <pre className="bg-black/40 text-purple-200 p-4 rounded-lg overflow-x-auto text-sm">
                  {generatedRule.pluginCode}
                </pre>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={saveRule}
                disabled={isSaving}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={20} />}
                {isSaving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button
                onClick={testRule}
                disabled={!lastSavedVariant}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PlayCircle size={20} />
                Tester
              </button>
            </div>
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mt-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-between">
            <span>Règles sauvegardées ({savedRules.length})</span>
            {savedVariantsQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-purple-200" />}
          </h3>

          {savedVariantsQuery.isError && (
            <div className="text-red-200 text-sm bg-red-500/10 border border-red-500/40 rounded-lg p-4">
              Impossible de charger l'historique des variantes enregistrées.
            </div>
          )}

          {!savedVariantsQuery.isLoading && savedRules.length === 0 && !savedVariantsQuery.isError && (
            <p className="text-sm text-purple-200">
              Aucune variante enregistrée pour le moment. Générez et sauvegardez vos règles pour les retrouver ici.
            </p>
          )}

          <div className="space-y-3">
            {savedRules.map((rule) => (
              <div key={rule.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
                  <div>
                    <p className="text-white font-semibold">{rule.ruleName}</p>
                    <p className="text-purple-300 text-sm capitalize">
                      {rule.difficulty ? rule.difficulty : "Difficulté inconnue"}
                    </p>
                  </div>
                  <span className="text-slate-300 text-sm">{new Date(rule.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-slate-200 text-sm mb-3">{rule.description}</p>
                {rule.compiledHash && (
                  <p className="text-xs text-emerald-300 font-mono mb-2">
                    Hash&nbsp;: #{rule.compiledHash.slice(0, 12)}
                  </p>
                )}
                {rule.ruleSpecJson ? (
                  <pre className="bg-black/40 text-green-300 p-3 rounded-lg overflow-x-auto text-xs">
                    {rule.ruleSpecJson}
                  </pre>
                ) : (
                  <p className="text-xs text-purple-200 italic">RuleSpec non disponible.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessRuleEngine;
