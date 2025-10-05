import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCompiled, hasCompiled, getSlug, type ChessVariantRow } from "@/lib/variants/compiled";
import { Play, Code2 } from "lucide-react";

type Props = {
  variant: ChessVariantRow;
  onLaunch: (opts: { variant: ChessVariantRow; compiled?: ReturnType<typeof getCompiled> }) => void;
};

export function VariantCard({ variant, onLaunch }: Props) {
  const compiled = getCompiled(variant);
  const automated = hasCompiled(variant);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{variant.title}</h3>
        <div className="flex items-center gap-2">
          {automated ? (
            <Badge className="bg-emerald-600/10 text-emerald-600 border-emerald-600/30">Automatisée</Badge>
          ) : (
            <Badge variant="secondary">Descriptive</Badge>
          )}
          {compiled?.hash && (
            <Badge variant="outline" className="font-mono">#{compiled.hash.slice(0, 8)}</Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {variant.summary || "Variante personnalisée."}
      </p>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => onLaunch({ variant, compiled })}
          className="gap-2"
          aria-label={automated ? "Lancer (règles personnalisées)" : "Lancer (règles classiques)"}
        >
          <Play className="w-4 h-4" />
          {automated ? "Lancer (règles perso)" : "Lancer (règles classiques)"}
        </Button>

        {automated && (
          <Button variant="outline" className="gap-2" onClick={() => onLaunch({ variant, compiled })}>
            <Code2 className="w-4 h-4" />
            Voir ruleset
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-mono">slug:</span> {getSlug(variant)}
      </div>
    </Card>
  );
}
