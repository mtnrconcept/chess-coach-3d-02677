import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Wand2, Loader2, Sparkles, Code, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TablesInsert } from "@/services/supabase/types";
import { registerExternalRuleFromSource } from "@/variant-chess-lobby";

type DifficultyLevel = "beginner" | "intermediate" | "advanced";

type GenerationResponse = {
  rules?: string;
  difficulty?: DifficultyLevel;
  warning?: string;
  pluginWarning?: string;
  ruleId?: string;
  ruleName?: string;
  pluginCode?: string;
};

const difficultyLevels: Array<{ value: DifficultyLevel; label: string }> = [
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
];

const difficultyLabelMap: Record<DifficultyLevel, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

const isDifficultyLevel = (value: string): value is DifficultyLevel =>
  difficultyLevels.some((option) => option.value === value);

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const buildDefaultVariantName = (promptValue: string, level: DifficultyLevel) => {
  const trimmed = promptValue.trim();
  if (trimmed.length === 0) {
    return `Variante personnalisée (${difficultyLabelMap[level]})`;
  }

  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  const sanitized = firstLine.length > 0 ? firstLine : trimmed;
  return sanitized.length > 60 ? `${sanitized.slice(0, 57)}…` : sanitized;
};

const buildSummary = (promptValue: string, rulesValue: string) => {
  const trimmedPrompt = promptValue.trim();
  if (trimmedPrompt.length > 0) {
    return trimmedPrompt.length > 240 ? `${trimmedPrompt.slice(0, 237)}…` : trimmedPrompt;
  }

  const firstLine = rulesValue
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "Variante personnalisée générée avec l’outil IA.";
  }

  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
};

export function CustomRulesGenerator() {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("intermediate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRules, setGeneratedRules] = useState("");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [pluginWarning, setPluginWarning] = useState<string | null>(null);
  const [variantName, setVariantName] = useState("");
  const [isSavingVariant, setIsSavingVariant] = useState(false);
  const [lastSavedVariantId, setLastSavedVariantId] = useState<string | null>(null);
  const [generatedRuleId, setGeneratedRuleId] = useState<string | null>(null);
  const [generatedRuleName, setGeneratedRuleName] = useState<string | null>(null);
  const [generatedPluginSource, setGeneratedPluginSource] = useState<string | null>(null);
  const [isAutomationReady, setIsAutomationReady] = useState(false);

  const hasGeneratedContent = generatedRules.trim().length > 0;

  const handleSaveVariant = async () => {
    if (!hasGeneratedContent) {
      toast.error("Générez d’abord des règles avant d’enregistrer la variante.");
      return;
    }

    if (!variantName.trim()) {
      toast.error("Donnez un nom à votre variante avant de l’enregistrer.");
      return;
    }

    setIsSavingVariant(true);
    setLastSavedVariantId(null);

    try {
      const promptText = description.trim();
      const summary = buildSummary(promptText, generatedRules);
      const metadataPayload: Record<string, unknown> = {
        slug: slugify(variantName),
      };

      if (generatedPluginSource && generatedRuleId) {
        metadataPayload.plugin = {
          source: generatedPluginSource,
          createdAt: new Date().toISOString(),
          ruleId: generatedRuleId,
          warning: pluginWarning,
        };
      }

      const payload: TablesInsert<'chess_variants'> = {
        title: variantName.trim(),
        summary,
        rules: generatedRules,
        difficulty,
        prompt: promptText.length > 0 ? promptText : null,
        source: 'generated',
        metadata: metadataPayload as TablesInsert<'chess_variants'>['metadata'],
        rule_id: generatedRuleId,
      };

      const { data, error } = await supabase
        .from('chess_variants')
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const insertedVariantId = data?.id;

      if (insertedVariantId) {
        const promptPayload: TablesInsert<'chess_variant_prompts'> = {
          variant_id: insertedVariantId,
          prompt: promptText.length > 0 ? promptText : summary,
          difficulty,
          rules: generatedRules,
        };

        const { error: promptError } = await supabase
          .from('chess_variant_prompts')
          .insert(promptPayload);

        if (promptError) {
          console.error('Failed to archive prompt', promptError);
          toast.warning("Variante enregistrée mais l'historique du prompt n'a pas pu être archivé.");
        }
      }

      if (generatedRuleId && generatedPluginSource) {
        const registration = registerExternalRuleFromSource(generatedRuleId, generatedPluginSource);
        if (!registration.ok) {
          toast.warning(
            registration.error
              ? `Variante enregistrée, mais le code n'a pas pu être activé : ${registration.error}`
              : "Variante enregistrée, mais le code n'a pas pu être activé."
          );
        } else {
          setIsAutomationReady(true);
        }
      }

      setLastSavedVariantId(insertedVariantId ?? null);
      toast.success("Votre variante a été ajoutée au lobby !");
      await queryClient.invalidateQueries({ queryKey: ["chess-variants"] });
    } catch (error) {
      console.error('Error saving custom variant:', error);
      const message =
        error instanceof Error ? error.message : "Impossible d'enregistrer la variante pour le moment.";
      toast.error(message);
    } finally {
      setIsSavingVariant(false);
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error("Veuillez décrire les règles que vous souhaitez");
      return;
    }

    setIsGenerating(true);
    setWarningMessage(null);
    setPluginWarning(null);
    setGeneratedPluginSource(null);
    setGeneratedRuleId(null);
    setGeneratedRuleName(null);
    setIsAutomationReady(false);

    try {
      const { data, error } = await supabase.functions.invoke('generate-custom-rules', {
        body: { description, difficulty, ruleName: variantName },
      });

      if (error) {
        console.error('Supabase function error:', error);
        const message =
          typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
            ? error.message
            : "Erreur lors de la génération des règles";
        toast.error(message);
        setGeneratedRules("");
        return;
      }

      const typed = (data ?? {}) as GenerationResponse;
      const rules = typeof typed.rules === 'string' ? typed.rules : "";
      setGeneratedRules(rules);

      const suggestedName =
        typeof typed.ruleName === 'string' && typed.ruleName.trim().length > 0
          ? typed.ruleName.trim()
          : buildDefaultVariantName(description, difficulty);

      setVariantName((previous) => (previous ? previous : suggestedName));
      setGeneratedRuleId(typeof typed.ruleId === 'string' ? typed.ruleId : null);
      setGeneratedRuleName(typeof typed.ruleId === 'string' ? suggestedName : null);
      setLastSavedVariantId(null);

      if (typeof typed.warning === 'string' && typed.warning.length > 0) {
        setWarningMessage(typed.warning);
        toast.info(typed.warning);
      } else {
        toast.success("Règles générées avec succès !");
      }

      if (typeof typed.pluginWarning === 'string' && typed.pluginWarning.length > 0) {
        setPluginWarning(typed.pluginWarning);
        toast.warning(typed.pluginWarning);
      }

      if (typed.pluginCode && typed.ruleId) {
        setGeneratedPluginSource(typed.pluginCode);
        const registration = registerExternalRuleFromSource(typed.ruleId, typed.pluginCode);
        if (registration.ok) {
          setIsAutomationReady(true);
        } else {
          const errorMessage = registration.error
            ? `Code de variante généré mais non activé (${registration.error}).`
            : "Code de variante généré mais non activé.";
          setPluginWarning((previous) => previous ?? errorMessage);
          toast.warning(errorMessage);
        }
      } else {
        setGeneratedPluginSource(null);
      }
    } catch (error) {
      console.error('Error generating custom rules:', error);
      const message = error instanceof Error ? error.message : "Erreur lors de la génération des règles";
      toast.error(message);
      setGeneratedRules("");
    } finally {
      setIsGenerating(false);
    }
  };

  const automationStatus = useMemo(() => {
    if (!generatedRuleId) {
      return { label: "Automatisation indisponible", tone: "muted" as const };
    }

    if (isAutomationReady) {
      return { label: "Code actif", tone: "success" as const };
    }

    if (generatedPluginSource) {
      return { label: "Code généré à valider", tone: "warning" as const };
    }

    return { label: "Automatisation en attente", tone: "muted" as const };
  }, [generatedRuleId, generatedPluginSource, isAutomationReady]);

  return (
    <Card className="p-6 gradient-card border-chess">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold">Générateur de Règles Personnalisées</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Décrivez vos règles personnalisées
          </label>
          <Textarea
            placeholder="Ex: Ajouter une pièce qui peut se téléporter une fois par partie, ou les pions peuvent capturer en avant..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Niveau de difficulté</label>
          <Select
            value={difficulty}
            onValueChange={(value) => {
              if (isDifficultyLevel(value)) {
                setDifficulty(value);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficultyLevels.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !description.trim()}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Générer les règles
            </>
          )}
        </Button>

        {hasGeneratedContent && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Règles générées</label>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {isGenerating && (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Génération…
                    </span>
                  )}
                  {warningMessage && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {warningMessage}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 ${
                      automationStatus.tone === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : automationStatus.tone === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {automationStatus.tone === 'success' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Code className="h-3 w-3" />
                    )}
                    {automationStatus.label}
                  </span>
                </div>
              </div>
              <Textarea
                placeholder="Les règles générées apparaîtront ici"
                value={generatedRules}
                onChange={(e) => setGeneratedRules(e.target.value)}
                rows={8}
                className="resize-none"
              />
              {generatedRuleId && (
                <div className="rounded-md border border-border/60 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Code className="h-4 w-4" />
                    Identifiant de règle&nbsp;: <span className="font-mono text-xs">{generatedRuleId}</span>
                  </div>
                  {generatedRuleName && (
                    <div className="text-xs">Nom suggéré&nbsp;: {generatedRuleName}</div>
                  )}
                  {pluginWarning && (
                    <div className="text-xs text-amber-600 dark:text-amber-400">{pluginWarning}</div>
                  )}
                  {!isAutomationReady && generatedPluginSource && !pluginWarning && (
                    <div className="text-xs text-muted-foreground">
                      Le code a été généré. Vérifiez qu'il fonctionne avant d'enregistrer.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-primary">Automatisation</Badge>
                {isAutomationReady ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    Code prêt pour le lobby
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Enregistrez pour ajouter la variante au lobby
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-2 block">Nom de la variante</label>
                  <Input
                    value={variantName}
                    onChange={(event) => setVariantName(event.target.value)}
                    placeholder="Ex: Gambit Aérien"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Identifiant technique</label>
                  <Input value={generatedRuleId ?? "Non défini"} readOnly className="font-mono text-xs" />
                </div>
              </div>

              <Button
                onClick={handleSaveVariant}
                disabled={isSavingVariant || !variantName.trim()}
                className="w-full"
                variant="secondary"
              >
                {isSavingVariant ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Ajouter la variante au lobby
                  </>
                )}
              </Button>

              {lastSavedVariantId && (
                <p className="text-xs text-muted-foreground">
                  ✅ Variante enregistrée ! Retrouvez-la dans la section « Variantes du lobby ».
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
