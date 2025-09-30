import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, User, Bot } from "lucide-react";

interface GameTimerProps {
  whiteTime: number;
  blackTime: number;
  isWhiteTurn: boolean;
  gameStatus: 'playing' | 'checkmate' | 'draw' | 'resignation';
}

export function GameTimer({ whiteTime, blackTime, isWhiteTurn, gameStatus }: GameTimerProps) {
  const [currentWhiteTime, setCurrentWhiteTime] = useState(whiteTime);
  const [currentBlackTime, setCurrentBlackTime] = useState(blackTime);

  useEffect(() => {
    if (gameStatus !== 'playing') return;

    const interval = setInterval(() => {
      if (isWhiteTurn) {
        setCurrentWhiteTime(prev => Math.max(0, prev - 1));
      } else {
        setCurrentBlackTime(prev => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isWhiteTurn, gameStatus]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimePercentage = (current: number, initial: number) => {
    return Math.max(0, (current / initial) * 100);
  };

  const isLowTime = (time: number) => time < 60;

  return (
    <div className="space-y-4">
      {/* Ordinateur (Black) */}
      <Card className={`p-4 gradient-card transition-all ${!isWhiteTurn && gameStatus === 'playing' ? 'ring-2 ring-primary animate-board-glow' : ''}`}>
        <div className="flex items-center gap-3 mb-3">
          <Bot className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Ordinateur</span>
          {!isWhiteTurn && gameStatus === 'playing' && (
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-gold" />
          )}
        </div>
        
        <div className="text-2xl font-bold text-center mb-2">
          <span className={`${isLowTime(currentBlackTime) ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
            {formatTime(currentBlackTime)}
          </span>
        </div>
        
        <Progress 
          value={getTimePercentage(currentBlackTime, blackTime)} 
          className="h-2"
        />
        
        {isLowTime(currentBlackTime) && gameStatus === 'playing' && (
          <div className="text-xs text-destructive text-center mt-1 animate-pulse">
            Temps critique !
          </div>
        )}
      </Card>

      {/* Game status */}
      <Card className="p-3 text-center gradient-card border-chess">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {gameStatus === 'playing' ? 
              `Tour des ${isWhiteTurn ? 'Blancs' : 'Noirs'}` :
              gameStatus === 'checkmate' ? 'Échec et mat' :
              gameStatus === 'draw' ? 'Partie nulle' : 'Abandon'
            }
          </span>
        </div>
        
        {gameStatus === 'playing' && (
          <div className="text-xs text-muted-foreground">
            {isWhiteTurn ? "À vous de jouer" : "L'IA réfléchit..."}
          </div>
        )}
      </Card>

      {/* Joueur (White) */}
      <Card className={`p-4 gradient-card transition-all ${isWhiteTurn && gameStatus === 'playing' ? 'ring-2 ring-primary animate-board-glow' : ''}`}>
        <div className="flex items-center gap-3 mb-3">
          <User className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Vous</span>
          {isWhiteTurn && gameStatus === 'playing' && (
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-gold" />
          )}
        </div>
        
        <div className="text-2xl font-bold text-center mb-2">
          <span className={`${isLowTime(currentWhiteTime) ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
            {formatTime(currentWhiteTime)}
          </span>
        </div>
        
        <Progress 
          value={getTimePercentage(currentWhiteTime, whiteTime)} 
          className="h-2"
        />
        
        {isLowTime(currentWhiteTime) && gameStatus === 'playing' && (
          <div className="text-xs text-destructive text-center mt-1 animate-pulse">
            Temps critique !
          </div>
        )}
      </Card>
    </div>
  );
}