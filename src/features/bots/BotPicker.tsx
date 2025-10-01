import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/services/supabase/client";
import type { Tables } from "@/services/supabase/types";
import { cn } from "@/lib/utils";

interface ParsedBotStyle {
  label: string;
  personality: string;
  description: string;
  traits: string[];
}

interface ParsedBotProfile {
  row: Tables<"bot_profiles">;
  style: ParsedBotStyle;
}

interface BotPickerProps {
  onSelect?: (bot: Tables<"bot_profiles">) => void;
  selectedBotId?: string;
  className?: string;
  autoSelectFirst?: boolean;
}

function toArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseStyle(style: unknown): ParsedBotStyle {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return {
      label: "Inconnu",
      personality: "Style non spécifié",
      description: "Aucune description disponible.",
      traits: [],
    };
  }

  const data = style as Record<string, unknown>;
  return {
    label: typeof data.label === "string" ? data.label : "Inconnu",
    personality: typeof data.personality === "string" ? data.personality : "Style non spécifié",
    description: typeof data.description === "string" ? data.description : "Aucune description disponible.",
    traits: toArrayOfStrings(data.traits),
  };
}

export function BotPicker({
  onSelect,
  selectedBotId,
  className,
  autoSelectFirst = false,
}: BotPickerProps) {
  const [bots, setBots] = useState<ParsedBotProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    void supabase
      .from("bot_profiles")
      .select("*")
      .order("elo_target", { ascending: true })
      .then((response) => {
        if (!isMounted) return;
        if (response.error) {
          console.error("Failed to load bot profiles", response.error);
          setError("Impossible de charger les profils de bots.");
          setBots([]);
          return;
        }
        const parsed = (response.data ?? []).map((row) => ({
          row,
          style: parseStyle(row.style),
        }));
        setBots(parsed);
        setError(null);
        if (autoSelectFirst && !selectedBotId && parsed.length > 0 && onSelect) {
          onSelect(parsed[0].row);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [autoSelectFirst, onSelect, selectedBotId]);

  const selected = useMemo(
    () => bots.find((bot) => bot.row.id === selectedBotId)?.row ?? null,
    [bots, selectedBotId],
  );

  const handleSelect = (bot: Tables<"bot_profiles">) => {
    if (onSelect) {
      onSelect(bot);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="p-6">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive", className)}>
        {error}
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className={cn("rounded-md border border-dashed p-6 text-center text-muted-foreground", className)}>
        Aucun profil de bot n'est disponible pour le moment.
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
      {bots.map(({ row, style }) => {
        const isSelected = selected?.id === row.id;
        return (
          <Card
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => handleSelect(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelect(row);
              }
            }}
            className={cn(
              "relative flex h-full flex-col border transition-all",
              "hover:border-primary/40 hover:shadow-lg",
              isSelected && "border-primary shadow-lg",
            )}
          >
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xl font-semibold">{row.name}</CardTitle>
                <Badge variant={isSelected ? "default" : "secondary"}>{style.label}</Badge>
              </div>
              <CardDescription className="text-muted-foreground">
                {style.personality}
              </CardDescription>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  Elo ~ {row.elo_target}
                </Badge>
                <span>•</span>
                <span>{style.description}</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {style.traits.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {style.traits.map((trait) => (
                    <Badge key={trait} variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-xs">
                      {trait}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="w-full"
                onClick={() => handleSelect(row)}
              >
                {isSelected ? "Sélectionné" : "Choisir ce bot"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

export default BotPicker;
