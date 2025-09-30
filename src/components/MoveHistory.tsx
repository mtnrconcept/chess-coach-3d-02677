/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, Crown } from "lucide-react";

interface MoveHistoryProps {
  moves: any[];
}

export function MoveHistory({ moves }: MoveHistoryProps) {
  const formatMove = (move: any, index: number) => {
    const moveNumber = Math.floor(index / 2) + 1;
    const isWhiteMove = index % 2 === 0;
    
    let notation = move.san;
    
    // Add special move indicators
    if (move.flags?.includes('c')) notation += ' (capture)';
    if (move.flags?.includes('k') || move.flags?.includes('q')) notation += ' (roque)';
    if (move.flags?.includes('e')) notation += ' (en passant)';
    if (move.flags?.includes('p')) notation += ' (promotion)';
    
    return { notation, moveNumber, isWhiteMove };
  };

  return (
    <Card className="p-4 gradient-card border-chess">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <span className="font-semibold">Historique des coups</span>
        <Badge variant="outline" className="ml-auto">
          {moves.length}
        </Badge>
      </div>

      <ScrollArea className="h-64">
        {moves.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Crown className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">La partie commence...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {moves.map((move, index) => {
              const { notation, moveNumber, isWhiteMove } = formatMove(move, index);
              
              return (
                <div key={index} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 transition-colors">
                  {isWhiteMove && (
                    <span className="text-xs text-muted-foreground w-6">
                      {moveNumber}.
                    </span>
                  )}
                  
                  <div className={`flex-1 font-mono text-sm ${
                    isWhiteMove ? 'text-chess-light' : 'text-chess-gold'
                  }`}>
                    {notation}
                  </div>
                  
                  <div className={`w-2 h-2 rounded-full ${
                    isWhiteMove ? 'bg-chess-light/50' : 'bg-chess-gold/50'
                  }`} />
                </div>
              );
            })}
            
            {/* Current turn indicator */}
            {moves.length > 0 && (
              <div className="mt-4 p-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse-gold" />
                  {moves.length % 2 === 0 ? "Blancs à jouer" : "Noirs à jouer"}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}