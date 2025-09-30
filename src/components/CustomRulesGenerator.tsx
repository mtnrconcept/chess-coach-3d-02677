import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomRulesGenerator() {
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRules, setGeneratedRules] = useState("");

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error("Veuillez décrire les règles que vous souhaitez");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-custom-rules', {
        body: { description, difficulty }
      });

      if (error) throw error;

      setGeneratedRules(data.rules);
      toast.success("Règles générées avec succès !");
    } catch (error) {
      console.error('Error generating custom rules:', error);
      toast.error("Erreur lors de la génération des règles");
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
          <Select value={difficulty} onValueChange={(value: any) => setDifficulty(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Débutant</SelectItem>
              <SelectItem value="intermediate">Intermédiaire</SelectItem>
              <SelectItem value="advanced">Avancé</SelectItem>
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
          <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-primary">
                Règles générées
              </Badge>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {generatedRules}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
