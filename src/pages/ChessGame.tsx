/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import type { DirectionalLight } from "three";
import { FbxChessSet } from "@/components/FbxChessSet";
import { Chess } from "chess.js";
import type { Move } from "chess.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCcw, Flag, MessageCircle, Sparkles } from "lucide-react";
import { ChessBoard3D } from "@/components/ChessBoard3D";
import { GameTimer } from "@/components/GameTimer";
import { MoveHistory } from "@/components/MoveHistory";
import { CoachingPanel } from "@/components/CoachingPanel";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  analyzePlayerMove,
  analyzeAIMove,
  withEngineAdvice,
  type CoachingInsights,
} from "@/lib/chessAnalysis";
import {
  coachLanguageOptions,
  getCoachDisabledMessage,
  getCoachLanguageConfig,
  translateCoachingInsights,
  translateCoachingText,
  type CoachLanguage,
} from "@/lib/coachLanguage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function AnimatedCamera() {
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);

  useFrame((state) => {
    const t = Math.min(state.clock.getElapsedTime(), 6);
    const angle = (t / 6) * Math.PI * 2;
    const radius = 8;
    if (cameraRef.current) {
      cameraRef.current.position.x = Math.sin(angle) * radius;
      cameraRef.current.position.z = Math.cos(angle) * radius;
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = t >= 6;
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[8, 8, 8]} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 6}
        maxDistance={15}
        minDistance={5}
      />
    </>
  );
}

export default function ChessGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const gameState = location.state || {};
  
  const [chess] = useState(new Chess());
  const [gamePosition, setGamePosition] = useState(chess.fen());
  const [currentPlayer, setCurrentPlayer] = useState<'w' | 'b'>('w');
  const [gameStatus, setGameStatus] = useState<'playing' | 'checkmate' | 'draw' | 'resignation'>('playing');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [coachingComment, setCoachingComment] = useState<string>("");
  const [analysisDetails, setAnalysisDetails] = useState<CoachingInsights | null>(null);
  const [isCoachAnalyzing, setIsCoachAnalyzing] = useState(false);
  const [isCoachEnabled, setIsCoachEnabled] = useState<boolean>(!!gameState.coachingMode);
  const [coachLanguage, setCoachLanguage] = useState<CoachLanguage>("fr");

  // Game mode: 'ai' or 'local' (player vs player)
  const [gameMode] = useState<'ai' | 'local'>(gameState.gameMode || 'ai');
  
  // Variant rules
  const [activeVariant] = useState(gameState.variant || null);
  
  // Timer states
  const [whiteTime, setWhiteTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [blackTime, setBlackTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [isWhiteTurn, setIsWhiteTurn] = useState(true);

  const boardRef = useRef<any>();
  const playerMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveHistoryRef = useRef<Move[]>([]);
  const coachingRequestId = useRef(0);

  useEffect(() => {
    return () => {
      if (playerMoveTimeoutRef.current) {
        clearTimeout(playerMoveTimeoutRef.current);
      }
      if (aiMoveTimeoutRef.current) {
        clearTimeout(aiMoveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  const provideCoachingFeedback = async (move: Move, updatedHistory: Move[], isOpponentMove = false) => {
    if (!isCoachEnabled) return;

    const localInsights = isOpponentMove
      ? analyzeAIMove({ chess, move, history: updatedHistory })
      : analyzePlayerMove({ chess, move, history: updatedHistory });

    setAnalysisDetails(localInsights);
    setCoachingComment(localInsights.comment);

    const requestId = ++coachingRequestId.current;
    setIsCoachAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('chess-coach', {
        body: {
          position: chess.fen(),
          lastMove: {
            from: move.from,
            to: move.to,
            san: move.san,
          },
          gamePhase: localInsights.gamePhase,
          moveCount: updatedHistory.length,
        },
      });

      if (error) {
        console.error(isOpponentMove ? 'Error getting AI coaching for AI move:' : 'Error getting AI coaching:', error);
        return;
      }

      if (data?.coaching) {
        if (coachingRequestId.current !== requestId) {
          return;
        }
        const enriched = withEngineAdvice(localInsights, data.coaching, isOpponentMove ? 'IA' : undefined);
        setAnalysisDetails(enriched);
        setCoachingComment(enriched.comment);
      }
    } catch (error) {
      console.error(isOpponentMove ? 'Error analyzing AI move:' : 'Error analyzing move:', error);
    } finally {
      if (coachingRequestId.current === requestId) {
        setIsCoachAnalyzing(false);
      }
    }
  };

  useEffect(() => {
    if (!gameState.timeControl) {
      navigate("/");
      return;
    }
    
    const gameModeText = gameMode === 'local' ? 'Local (2 joueurs)' : 'vs IA';
    const variantText = activeVariant ? ` • ${activeVariant.title}` : '';
    toast.success(`Partie commencée : ${gameState.timeControl.time} • ${gameModeText}${variantText}`);
    
    if (isCoachEnabled) {
      setCoachingComment("Excellente ouverture ! Commencez par contrôler le centre avec e4 ou d4.");
    }
    
    if (activeVariant) {
      console.log('Variante active:', activeVariant.title, activeVariant.description);
    }
  }, []);

  const handleSquareClick = async (square: string) => {
    // In AI mode, only allow white to play. In local mode, allow both players
    if (gameStatus !== 'playing') return;
    if (gameMode === 'ai' && chess.turn() === 'b') return;

    try {
      if (selectedSquare === square) {
        // Deselect
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      if (selectedSquare && possibleMoves.includes(square)) {
        // Make move
        const move = chess.move({
          from: selectedSquare,
          to: square,
          promotion: 'q', // Auto-promotion to queen
        });

        if (move) {
          setGamePosition(chess.fen());
          setLastMove({ from: selectedSquare, to: square });
          const updatedHistory = [...moveHistory, move];
          setMoveHistory(updatedHistory);
          moveHistoryRef.current = updatedHistory;
          setCurrentPlayer(chess.turn());
          setIsWhiteTurn(!isWhiteTurn);
          
          // Check game status
          if (chess.isCheckmate()) {
            setGameStatus('checkmate');
            toast.success(chess.turn() === 'b' ? "Échec et mat ! Vous gagnez !" : "Échec et mat ! L'ordinateur gagne !");
          } else if (chess.isDraw()) {
            setGameStatus('draw');
            toast.info("Partie nulle !");
          }

          // Coaching mode comment
          if (isCoachEnabled) {
            void provideCoachingFeedback(move, updatedHistory);
          }

          // AI move after small delay (only in AI mode)
          if (gameMode === 'ai' && !chess.isGameOver() && chess.turn() === 'b') {
            if (playerMoveTimeoutRef.current) {
              clearTimeout(playerMoveTimeoutRef.current);
            }
            playerMoveTimeoutRef.current = setTimeout(() => {
              playerMoveTimeoutRef.current = null;
              makeAIMove();
            }, 1000);
          }
        }

        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        // Select square
        const piece = chess.get(square as any);
        if (piece && piece.color === currentPlayer) {
          setSelectedSquare(square);
          const moves = chess.moves({ square: square as any, verbose: true });
          setPossibleMoves(moves.map((move: any) => move.to));
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
        }
      }
    } catch (error) {
      console.error('Move error:', error);
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  const makeAIMove = () => {
    // Check using chess.turn() directly to avoid state race condition
    if (chess.turn() !== 'b' || chess.isGameOver()) {
      console.log('AI cannot move:', { turn: chess.turn(), gameOver: chess.isGameOver() });
      return;
    }

    console.log('AI is thinking...');
    setIsThinking(true);

    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
    }

    // Simple AI: random move (in real app, integrate Stockfish)
    aiMoveTimeoutRef.current = setTimeout(() => {
      const possibleMoves = chess.moves();
      console.log('AI possible moves:', possibleMoves.length);
      
      if (possibleMoves.length === 0) {
        console.log('No possible moves for AI');
        setIsThinking(false);
        aiMoveTimeoutRef.current = null;
        return;
      }

      const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      console.log('AI selected move:', randomMove);
      const move = chess.move(randomMove);
      
      if (move) {
        console.log('AI move executed:', move);
        setGamePosition(chess.fen());
        setLastMove({ from: move.from, to: move.to });
        const updatedHistory = [...moveHistoryRef.current, move];
        setMoveHistory(updatedHistory);
        moveHistoryRef.current = updatedHistory;
        setCurrentPlayer(chess.turn());
        setIsWhiteTurn(chess.turn() === 'w');
        
        // Check game status
        if (chess.isCheckmate()) {
          setGameStatus('checkmate');
          toast.error("Échec et mat ! L'ordinateur gagne !");
        } else if (chess.isDraw()) {
          setGameStatus('draw');
          toast.info("Partie nulle !");
        }

        if (isCoachEnabled) {
          void provideCoachingFeedback(move, updatedHistory, true);
        }
      }

      setIsThinking(false);
      aiMoveTimeoutRef.current = null;
    }, 800 + Math.random() * 1200); // Faster thinking time
  };

  const handleResign = () => {
    setGameStatus('resignation');
    toast.error("Vous abandonnez la partie.");
  };

  const handleNewGame = () => {
    navigate("/", { replace: true });
  };

  const handleSpecialMove = () => {
    if (!activeVariant) {
      toast.info("Aucune variante spéciale sélectionnée.");
      return;
    }

    toast.success(`Attaque spéciale : ${activeVariant.title}`, {
      description: activeVariant.description,
    });
  };

  useEffect(() => {
    if (isCoachEnabled) {
      if (moveHistoryRef.current.length > 0) {
        const latestMove = moveHistoryRef.current[moveHistoryRef.current.length - 1];
        const isOpponentMove = gameMode === 'ai' ? latestMove.color === 'b' : false;
        void provideCoachingFeedback(latestMove, moveHistoryRef.current, isOpponentMove);
      } else if (!coachingComment) {
        setCoachingComment("Excellente ouverture ! Commencez par contrôler le centre avec e4 ou d4.");
      }
    } else {
      setIsCoachAnalyzing(false);
    }
  }, [isCoachEnabled]);

  const coachConfig = useMemo(() => getCoachLanguageConfig(coachLanguage), [coachLanguage]);
  const localizedAnalysis = useMemo(
    () => (analysisDetails ? translateCoachingInsights(analysisDetails, coachLanguage) : null),
    [analysisDetails, coachLanguage],
  );
  const localizedComment = useMemo(
    () => translateCoachingText(coachingComment, coachLanguage),
    [coachingComment, coachLanguage],
  );
  const displayComment = isCoachEnabled ? localizedComment : getCoachDisabledMessage(coachLanguage);
  const displayAnalysis = isCoachEnabled ? localizedAnalysis : null;
  const coachStatusText = (isCoachEnabled
    ? {
        fr: "Le coach commente chaque coup.",
        en: "The coach comments on every move.",
        es: "El coach comenta cada jugada.",
      }
    : {
        fr: "Activez le coach pour recevoir des conseils.",
        en: "Enable the coach to receive advice.",
        es: "Activa el coach para recibir consejos.",
      })[coachLanguage];
  const coachToggleLabel = {
    fr: "Activer ou désactiver le coach",
    en: "Toggle the coach on or off",
    es: "Activar o desactivar el coach",
  }[coachLanguage];
  const coachLanguageLabel = {
    fr: "Langue du coach",
    en: "Coach language",
    es: "Idioma del coach",
  }[coachLanguage];
  const languagePlaceholder = {
    fr: "Choisir une langue",
    en: "Choose a language",
    es: "Elige un idioma",
  }[coachLanguage];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate("/")} className="hover-lift">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-chess-gold">
              {gameState.timeControl?.time} • {gameMode === 'local' ? '2 joueurs' : gameState.coachingMode ? "Mode Coaching" : gameState.eloLevel?.name}
              {activeVariant && ` • ${activeVariant.title}`}
            </h1>
            <div className="flex items-center gap-2 justify-center mt-1">
              <Badge variant={gameStatus === 'playing' ? "default" : "secondary"}>
                {gameStatus === 'playing' ? 'En cours' : 
                 gameStatus === 'checkmate' ? 'Échec et mat' :
                 gameStatus === 'draw' ? 'Nulle' : 'Abandon'}
              </Badge>
              {isThinking && (
                <Badge variant="outline" className="animate-pulse-gold">
                  <MessageCircle className="w-3 h-3 mr-1" />
                  IA réfléchit...
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {activeVariant && (
              <Button variant="outline" onClick={handleSpecialMove} className="hover-lift">
                <Sparkles className="w-4 h-4 mr-2" />
                Attaque spéciale
              </Button>
            )}
            <Button variant="outline" onClick={handleNewGame} className="hover-lift">
              <RotateCcw className="w-4 h-4 mr-2" />
              Nouvelle partie
            </Button>
            {gameStatus === 'playing' && (
              <Button variant="destructive" onClick={handleResign} className="hover-lift">
                <Flag className="w-4 h-4 mr-2" />
                Abandonner
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Timer and game info */}
          <div className="lg:col-span-1 space-y-4">
            <GameTimer
              whiteTime={whiteTime}
              blackTime={blackTime}
              isWhiteTurn={isWhiteTurn}
              gameStatus={gameStatus}
            />
            
            <Card className="p-4 gradient-card border-chess/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{coachConfig.coachTitle}</p>
                  <p className="text-xs text-muted-foreground">{coachStatusText}</p>
                </div>
                <Switch
                  checked={isCoachEnabled}
                  onCheckedChange={setIsCoachEnabled}
                  aria-label={coachToggleLabel}
                />
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="coach-language" className="text-xs uppercase tracking-wide text-muted-foreground">
                  {coachLanguageLabel}
                </Label>
                <Select value={coachLanguage} onValueChange={(value) => setCoachLanguage(value as CoachLanguage)}>
                  <SelectTrigger id="coach-language">
                    <SelectValue placeholder={languagePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {coachLanguageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <CoachingPanel
              comment={displayComment}
              analysis={displayAnalysis}
              isAnalyzing={isCoachAnalyzing && isCoachEnabled}
              language={coachLanguage}
              isEnabled={isCoachEnabled}
            />

            <MoveHistory moves={moveHistory} />
          </div>

          {/* 3D Chess Board */}
          <div className="lg:col-span-3">
            <Card className="p-4 gradient-card border-chess">
              <div className="aspect-square w-full max-w-2xl mx-auto">
                <Canvas shadows>
                  <AnimatedCamera />
                  <Environment preset="sunset" background />
                  <ambientLight intensity={0.3} />
                  <directionalLight
                    position={[10, 10, 5]}
                    intensity={1}
                    castShadow
                    onUpdate={(light: DirectionalLight) => {
                      light.shadow.mapSize.set(2048, 2048);
                    }}
                  />
                  <FbxChessSet />
                  <ChessBoard3D
                    ref={boardRef}
                    position={gamePosition}
                    onSquareClick={handleSquareClick}
                    selectedSquare={selectedSquare}
                    possibleMoves={possibleMoves}
                    lastMove={lastMove}
                    hideBoard={false}
                  />
                </Canvas>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}