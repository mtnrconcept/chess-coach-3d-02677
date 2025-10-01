import { useMemo } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalysisTag, MoveAnalysis } from '@/services/analysisClient';
import { useGameReview } from './hooks/useGameReview';

type BadgeVariant = BadgeProps['variant'];

const TAG_METADATA: Record<AnalysisTag, { icon: string; label: string; badgeVariant: BadgeVariant }> = {
  ok: { icon: '✅', label: 'Meilleur', badgeVariant: 'default' },
  inaccuracy: { icon: '🟡', label: 'Imprécision', badgeVariant: 'secondary' },
  mistake: { icon: '🟠', label: 'Erreur', badgeVariant: 'secondary' },
  blunder: { icon: '🔴', label: 'Gaffe', badgeVariant: 'destructive' },
  brilliant: { icon: '💎', label: 'Brillant', badgeVariant: 'default' },
  great: { icon: '⭐', label: 'Great move', badgeVariant: 'default' },
};

export interface GameReviewPanelProps {
  pgn: string;
  depth?: number;
  multiPv?: number;
  reviewMode?: 'auto' | 'local' | 'edge';
  accuracyForElo?: number;
  onShowBestMove?: (move: MoveAnalysis) => void;
}

export function GameReviewPanel({
  pgn,
  depth = 18,
  multiPv = 3,
  reviewMode = 'auto',
  accuracyForElo,
  onShowBestMove,
}: GameReviewPanelProps) {
  const { review, isPending, error, startReview } = useGameReview({
    pgn,
    depth,
    multiPv,
    reviewMode,
    accuracyForElo,
    autoStart: true,
  });

  const accuracy = review?.accuracy ?? 0;

  const summaryChips = useMemo(() => {
    if (!review?.summary || !('counts' in review.summary)) return [] as Array<{ tag: AnalysisTag; value: number }>;
    const counts = review.summary.counts as Record<AnalysisTag, number>;
    return (Object.keys(counts) as AnalysisTag[])
      .filter((tag) => counts[tag] > 0)
      .map((tag) => ({ tag, value: counts[tag] }));
  }, [review?.summary]);

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-semibold">Game review</CardTitle>
          <Button size="sm" variant="outline" onClick={() => startReview()} disabled={isPending}>
            Re-run
          </Button>
        </div>
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Precision</span>
              <span className="font-semibold text-foreground">{accuracy.toFixed(1)}%</span>
            </div>
            <Progress value={accuracy} className="h-2" />
            {summaryChips.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {summaryChips.map(({ tag, value }) => {
                  const meta = TAG_METADATA[tag];
                  return (
                    <Badge key={tag} variant={meta.badgeVariant} className="flex items-center gap-1">
                      <span>{meta.icon}</span>
                      <span className="uppercase text-xs font-medium">{meta.label}</span>
                      <span className="text-xs font-semibold">{value}</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="h-[420px]">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : !review ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Submit a game to start the review.
          </div>
        ) : (
          <ScrollArea className="h-full pr-2">
            <ol className="space-y-3">
              {review.moves.map((move) => {
                const meta = TAG_METADATA[move.tag];
                return (
                  <li
                    key={`${move.ply}-${move.san}`}
                    className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition hover:border-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Badge variant={meta.badgeVariant} className="flex items-center gap-1 text-xs">
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </Badge>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            #{move.ply} · {move.san}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Best: {move.bestMove} · Δ {(move.delta / 100).toFixed(2)} p
                          </p>
                        </div>
                      </div>
                      {onShowBestMove && (
                        <Button size="sm" variant="ghost" onClick={() => onShowBestMove(move)}>
                          Show best move
                        </Button>
                      )}
                    </div>
                    {move.principalVariation.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        PV: {move.principalVariation.join(' ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
