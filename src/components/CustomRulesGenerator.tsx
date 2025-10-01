import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Wand2, Loader2, Sparkles } from "lucide-react";
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

type DifficultyLevel = "beginner" | "intermediate" | "advanced";

const difficultyLevels: Array<{ value: DifficultyLevel; label: string }> = [
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
];

const isDifficultyLevel = (value: string): value is DifficultyLevel =>
  difficultyLevels.some((option) => option.value === value);

export function CustomRulesGenerator() {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("intermediate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRules, setGeneratedRules] = useState("");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [variantName, setVariantName] = useState("");
  const [isSavingVariant, setIsSavingVariant] = useState(false);
  const [lastSavedVariantId, setLastSavedVariantId] = useState<string | null>(null);

  const slugify = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

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

  const buildDefaultVariantName = (promptValue: string, level: DifficultyLevel) => {
    const trimmed = promptValue.trim();
    if (trimmed.length === 0) {
      return `Variante personnalisée (${difficultyLabels[level]})`;
    }

    const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
    const sanitized = firstLine.length > 0 ? firstLine : trimmed;
    return sanitized.length > 60 ? `${sanitized.slice(0, 57)}…` : sanitized;
  };

  const handleSaveVariant = async () => {
    if (!generatedRules.trim()) {
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
      const metadata = { slug: slugify(variantName) };

      const payload: TablesInsert<'chess_variants'> = {
        title: variantName.trim(),
        summary,
        rules: generatedRules,
        difficulty,
        prompt: promptText.length > 0 ? promptText : null,
        source: 'generated',
        metadata,
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
    try {
      const { data, error } = await supabase.functions.invoke('generate-custom-rules', {
        body: { description, difficulty }
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

      const rules = typeof data?.rules === 'string' ? data.rules : "";
      setGeneratedRules(rules);
      setVariantName((previous) => (previous ? previous : buildDefaultVariantName(description, difficulty)));
      setLastSavedVariantId(null);

      if (data?.warning && typeof data.warning === 'string') {
        setWarningMessage(data.warning);
        toast.info(data.warning);
      } else {
        toast.success("Règles générées avec succès !");
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

        {generatedRules && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-primary">
                  Règles générées
                </Badge>
              </div>
              {warningMessage && (
                <p className="mb-3 text-sm text-muted-foreground italic">
                  {warningMessage}
                </p>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {generatedRules}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-dashed border-primary/40 bg-primary/5">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Nom de la variante</label>
                  <Input
                    value={variantName}
                    onChange={(event) => setVariantName(event.target.value)}
                    placeholder="Ex: Gambit Aérien" 
                  />
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
                    ✅ Variante enregistrée ! Retrouvez-la dans la section "Variantes du lobby".
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
