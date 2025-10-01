/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import type { DirectionalLight } from "three";
import { FbxChessSet } from "@/components/FbxChessSet";
import { Chess } from "chess.js";
import type { Move as ChessJsMove } from "chess.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCcw, Flag, MessageCircle, Sparkles } from "lucide-react";
import { ChessBoard3D } from "@/components/ChessBoard3D";
import { GameTimer } from "@/components/GameTimer";
import { MoveHistory } from "@/components/MoveHistory";
import { CoachingPanel } from "@/components/CoachingPanel";
import { toast } from "sonner";
import { supabase } from "@/services/supabase/client";
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
import { LiveEvalBadge } from "@/features/analysis/LiveEvalBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GameState, Match, Move as VariantMove, PieceType } from "@/variant-chess-lobby";
import { createMatch, generateMoves, playMove } from "@/variant-chess-lobby";
import {
  algebraicToPos,
  createChessJsEngineAdapter,
  posToAlgebraic,
  type ChessJsEngineAdapter,
  type ExtendedGameState,
} from "@/engine/variantEngineAdapter";

type LobbyVariant = {
  id: string;
  title: string;
  ruleId: string | null;
  description: string;
  rules: string;
  source?: string;
  difficulty?: string | null;
  prompt?: string | null;
};

type GameLocationState = {
  timeControl?: {
    name: string;
    time: string;
    minutes: number;
    increment: number;
    description?: string;
  };
  eloLevel?: { name: string; elo: string; color?: string };
  coachingMode?: boolean;
  gameMode?: 'ai' | 'local';
  variant?: LobbyVariant | null;
  liveEval?: boolean;
  liveEvalUrl?: string;
};

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
  const gameState = (location.state as GameLocationState | undefined) ?? {};
  
  const [chess] = useState(new Chess());
  const [gamePosition, setGamePosition] = useState(chess.fen());
  const [currentPlayer, setCurrentPlayer] = useState<'w' | 'b'>('w');
  const [gameStatus, setGameStatus] = useState<'playing' | 'checkmate' | 'draw' | 'resignation'>('playing');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<ChessJsMove[]>([]);
  const [displayHistory, setDisplayHistory] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [coachingComment, setCoachingComment] = useState<string>("");
  const [analysisDetails, setAnalysisDetails] = useState<CoachingInsights | null>(null);
  const [isCoachAnalyzing, setIsCoachAnalyzing] = useState(false);
  const [isCoachEnabled, setIsCoachEnabled] = useState<boolean>(!!gameState.coachingMode);
  const [coachLanguage, setCoachLanguage] = useState<CoachLanguage>("fr");
  const [isLiveEvalEnabled, setIsLiveEvalEnabled] = useState<boolean>(gameState.liveEval === false ? false : true);

  // Game mode: 'ai' or 'local' (player vs player)
  const [gameMode] = useState<'ai' | 'local'>(gameState.gameMode || 'ai');

  // Variant rules
  const [activeVariant] = useState<LobbyVariant | null>(gameState.variant ?? null);
  
  // Timer states
  const [whiteTime, setWhiteTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [blackTime, setBlackTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [isWhiteTurn, setIsWhiteTurn] = useState(true);

  const boardRef = useRef<any>();
  const playerMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveHistoryRef = useRef<ChessJsMove[]>([]);
  const displayHistoryRef = useRef<any[]>([]);
  const coachingRequestId = useRef(0);
  const variantMatchRef = useRef<Match | null>(null);
  const variantEngineRef = useRef<ChessJsEngineAdapter | null>(null);
  const [availableSpecialMoves, setAvailableSpecialMoves] = useState<VariantMove[]>([]);
  const [isSpecialDialogOpen, setIsSpecialDialogOpen] = useState(false);
  const [pendingSpecialMoves, setPendingSpecialMoves] = useState<VariantMove[]>([]);
  const [isVariantReady, setIsVariantReady] = useState(false);
  const variantWarningRef = useRef<string | null>(null);

  const describeSpecialMove = (move: VariantMove) => {
    const base = move.meta?.label || move.meta?.special || 'coup spécial';
    const target = posToAlgebraic(move.to);
    return `${base.replace(/_/g, ' ')} → ${target}`;
  };

  const promotionCharToPiece: Record<string, PieceType> = {
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
  };

  const liveEvalServerUrl = useMemo(() => {
    if (typeof gameState.liveEvalUrl === "string" && gameState.liveEvalUrl.length > 0) {
      return gameState.liveEvalUrl as string;
    }
    const envUrl = import.meta.env.VITE_LIVE_EVAL_URL;
    if (typeof envUrl === "string" && envUrl.length > 0) {
      return envUrl;
    }
    return "/functions/v1/live-eval";
  }, [gameState.liveEvalUrl]);

  const liveEvalPly = useMemo(() => {
    const parts = gamePosition.trim().split(/\s+/);
    if (parts.length < 6) return 0;
    const fullmove = Number.parseInt(parts[5] ?? "0", 10);
    if (!Number.isFinite(fullmove) || fullmove <= 0) {
      return 0;
    }
    const sideToMove = parts[1] === "b" ? 1 : 0;
    return (fullmove - 1) * 2 + sideToMove;
  }, [gamePosition]);

  const liveEvalToggleLabel = isLiveEvalEnabled
    ? "Désactiver l'évaluation cloud"
    : "Activer l'évaluation cloud";

  const liveEvalActive = isLiveEvalEnabled && gameStatus === "playing";

  const recordStandardMove = (move: ChessJsMove, movingColor: 'white' | 'black') => {
    const updatedHistory = [...moveHistoryRef.current, move];
    moveHistoryRef.current = updatedHistory;
    setMoveHistory(updatedHistory);

    const updatedDisplay = [...displayHistoryRef.current, move];
    displayHistoryRef.current = updatedDisplay;
    setDisplayHistory(updatedDisplay);

    if (isCoachEnabled) {
      void provideCoachingFeedback(move, updatedHistory, gameMode === 'ai' && movingColor === 'black');
    }
  };

  const recordSpecialMove = (move: VariantMove, movingColor: 'white' | 'black', description?: string) => {
    const entry = {
      color: movingColor === 'white' ? 'w' : 'b',
      san: `★ ${description || describeSpecialMove(move)}`,
      from: posToAlgebraic(move.from),
      to: posToAlgebraic(move.to),
      flags: '',
    };
    const updatedDisplay = [...displayHistoryRef.current, entry];
    displayHistoryRef.current = updatedDisplay;
    setDisplayHistory(updatedDisplay);
  };

  const updateGameStatusAfterMove = (movingColor: 'white' | 'black') => {
    if (chess.isCheckmate()) {
      setGameStatus('checkmate');
      if (gameMode === 'ai') {
        if (movingColor === 'white') {
          toast.success("Échec et mat ! Vous gagnez !");
        } else {
          toast.error("Échec et mat ! L'ordinateur gagne !");
        }
      } else {
        toast.success("Échec et mat !");
      }
    } else if (chess.isDraw()) {
      setGameStatus('draw');
      toast.info('Partie nulle !');
    }
  };

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

  useEffect(() => {
    displayHistoryRef.current = displayHistory;
  }, [displayHistory]);

  useEffect(() => {
    setIsVariantReady(false);

    if (!activeVariant) {
      variantMatchRef.current = null;
      variantEngineRef.current = null;
      setAvailableSpecialMoves([]);
      variantWarningRef.current = null;
      return;
    }

    if (!activeVariant.ruleId) {
      variantMatchRef.current = null;
      variantEngineRef.current = null;
      setAvailableSpecialMoves([]);
      chess.reset();
      const fen = chess.fen();
      setGamePosition(fen);
      setCurrentPlayer('w');
      setIsWhiteTurn(true);
      setMoveHistory([]);
      setDisplayHistory([]);
      moveHistoryRef.current = [];
      displayHistoryRef.current = [];
      setLastMove(null);
      if (variantWarningRef.current !== `custom-${activeVariant.id}`) {
        toast.info(`La variante « ${activeVariant.title} » est descriptive. Les règles classiques seront appliquées.`);
        variantWarningRef.current = `custom-${activeVariant.id}`;
      }
      return;
    }

    const adapter = createChessJsEngineAdapter(chess);
    variantEngineRef.current = adapter;

    try {
      const match = createMatch(
        adapter.engine,
        adapter.initialState as GameState,
        activeVariant.ruleId,
        gameMode === 'ai'
      );
      variantMatchRef.current = match;
      const fen = adapter.stateToFen(match.state as ExtendedGameState);
      setGamePosition(fen);
      chess.load(fen);
      setCurrentPlayer(match.state.turn === 'white' ? 'w' : 'b');
      setIsWhiteTurn(match.state.turn === 'white');
      setMoveHistory([]);
      setDisplayHistory([]);
      moveHistoryRef.current = [];
      displayHistoryRef.current = [];
      setLastMove(null);
      setAvailableSpecialMoves([]);
      setIsVariantReady(true);
      variantWarningRef.current = null;
    } catch (error) {
      console.error('Failed to initialise variant', error);
      variantMatchRef.current = null;
      variantEngineRef.current = null;
      setAvailableSpecialMoves([]);
      chess.reset();
      const fen = chess.fen();
      setGamePosition(fen);
      setCurrentPlayer('w');
      setIsWhiteTurn(true);
      setMoveHistory([]);
      setDisplayHistory([]);
      moveHistoryRef.current = [];
      displayHistoryRef.current = [];
      setLastMove(null);
      if (variantWarningRef.current !== `error-${activeVariant.id}`) {
        toast.error(
          `Impossible de charger la variante « ${activeVariant.title} ». Les règles standards seront utilisées.`
        );
        variantWarningRef.current = `error-${activeVariant.id}`;
      }
    }
  }, [activeVariant, chess, gameMode]);

  const provideCoachingFeedback = async (move: ChessJsMove, updatedHistory: ChessJsMove[], isOpponentMove = false) => {
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

  const executeVariantMove = (move: VariantMove, options?: { description?: string }) => {
    const match = variantMatchRef.current;
    const adapter = variantEngineRef.current;
    if (!match || !adapter) return;

    const movingColor = match.state.turn;
    adapter.clearLastMoveResult();
    const result = playMove(match, move);
    if (!result.ok) {
      toast.error(result.reason || "Coup spécial impossible");
      return;
    }

    adapter.syncChessFromState(match.state as ExtendedGameState);
    const fen = adapter.stateToFen(match.state as ExtendedGameState);
    setGamePosition(fen);

    const fromSquare = posToAlgebraic(move.from);
    const toSquare = posToAlgebraic(move.to);
    setLastMove({ from: fromSquare, to: toSquare });
    setCurrentPlayer(chess.turn());
    setIsWhiteTurn(chess.turn() === 'w');

    const lastStandardMove = adapter.getLastMoveResult();
    if (lastStandardMove) {
      recordStandardMove(lastStandardMove as ChessJsMove, movingColor);
    } else {
      recordSpecialMove(move, movingColor, options?.description);
    }

    setSelectedSquare(null);
    setPossibleMoves([]);
    setAvailableSpecialMoves([]);

    updateGameStatusAfterMove(movingColor);

    if (gameMode === 'ai' && !chess.isGameOver() && chess.turn() === 'b') {
      if (playerMoveTimeoutRef.current) {
        clearTimeout(playerMoveTimeoutRef.current);
      }
      playerMoveTimeoutRef.current = setTimeout(() => {
        playerMoveTimeoutRef.current = null;
        makeAIMove();
      }, 1000);
    }
  };

  const handleSquareClick = async (square: string) => {
    if (gameStatus !== 'playing') return;
    if (gameMode === 'ai' && chess.turn() === 'b') return;

    try {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setAvailableSpecialMoves([]);
        return;
      }

      if (selectedSquare && possibleMoves.includes(square)) {
        if (variantMatchRef.current && variantEngineRef.current) {
          const piece = chess.get(selectedSquare as any);
          let promotion: 'queen' | undefined;
          if (piece?.type === 'p') {
            const targetRank = square[1];
            if ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1')) {
              promotion = 'queen';
            }
          }
          const move: VariantMove = {
            from: algebraicToPos(selectedSquare),
            to: algebraicToPos(square),
            promotion,
          };
          executeVariantMove(move);
        } else {
          const move = chess.move({
            from: selectedSquare,
            to: square,
            promotion: 'q',
          });

          if (move) {
            setGamePosition(chess.fen());
            setLastMove({ from: selectedSquare, to: square });
            recordStandardMove(move as ChessJsMove, currentPlayer === 'w' ? 'white' : 'black');
            setCurrentPlayer(chess.turn());
            setIsWhiteTurn(chess.turn() === 'w');
            updateGameStatusAfterMove(currentPlayer === 'w' ? 'white' : 'black');

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
        }

        setSelectedSquare(null);
        setPossibleMoves([]);
        setAvailableSpecialMoves([]);
      } else {
        const piece = chess.get(square as any);
        if (piece && piece.color === currentPlayer) {
          setSelectedSquare(square);
          const moves = chess.moves({ square: square as any, verbose: true }) as ChessJsMove[];
          setPossibleMoves(moves.map((m) => m.to));

          if (variantMatchRef.current && variantEngineRef.current && activeVariant) {
            const extras = generateMoves(variantMatchRef.current, algebraicToPos(square)) || [];
            setAvailableSpecialMoves(extras);
            if (extras.length > 0) {
              toast.info(`${extras.length} coup(s) spécial(aux) disponible(s)`);
            }
          } else {
            setAvailableSpecialMoves([]);
          }
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
          setAvailableSpecialMoves([]);
        }
      }
    } catch (error) {
      console.error('Move error:', error);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setAvailableSpecialMoves([]);
    }
  };

  const makeAIMove = () => {
    if (chess.turn() !== 'b' || chess.isGameOver()) {
      console.log('AI cannot move:', { turn: chess.turn(), gameOver: chess.isGameOver() });
      return;
    }

    setIsThinking(true);

    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
    }

    aiMoveTimeoutRef.current = setTimeout(() => {
      const verboseMoves = chess.moves({ verbose: true }) as ChessJsMove[];

      if (verboseMoves.length === 0) {
        setIsThinking(false);
        aiMoveTimeoutRef.current = null;
        return;
      }

      const selected = verboseMoves[Math.floor(Math.random() * verboseMoves.length)];

      if (variantMatchRef.current && variantEngineRef.current) {
        const move: VariantMove = {
          from: algebraicToPos(selected.from),
          to: algebraicToPos(selected.to),
          promotion: selected.promotion ? promotionCharToPiece[selected.promotion] : undefined,
        };
        executeVariantMove(move);
      } else {
        const move = chess.move({ from: selected.from, to: selected.to, promotion: selected.promotion || 'q' });
        if (move) {
          setGamePosition(chess.fen());
          setLastMove({ from: move.from, to: move.to });
          recordStandardMove(move as ChessJsMove, 'black');
          setCurrentPlayer(chess.turn());
          setIsWhiteTurn(chess.turn() === 'w');
          updateGameStatusAfterMove('black');
        }
      }

      setIsThinking(false);
      aiMoveTimeoutRef.current = null;
    }, 800 + Math.random() * 1200);
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

    if (!isVariantReady) {
      toast.info("Cette variante ne propose pas de coups spéciaux automatisés.");
      return;
    }

    if (!selectedSquare) {
      toast.info("Sélectionnez d'abord une pièce.");
      return;
    }

    if (!variantMatchRef.current || !variantEngineRef.current) {
      toast.error("La variante n'est pas prête.");
      return;
    }

    if (availableSpecialMoves.length === 0) {
      toast.info("Aucun coup spécial disponible pour cette pièce.");
      return;
    }

    if (availableSpecialMoves.length === 1) {
      executeVariantMove(availableSpecialMoves[0]);
      return;
    }

    setPendingSpecialMoves(availableSpecialMoves);
    setIsSpecialDialogOpen(true);
  };

  const handleSpecialDialogChange = (open: boolean) => {
    setIsSpecialDialogOpen(open);
    if (!open) {
      setPendingSpecialMoves([]);
    }
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
            <div className="flex flex-wrap items-center gap-2 justify-center mt-1">
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
              <LiveEvalBadge
                fen={gamePosition}
                ply={liveEvalPly}
                enabled={liveEvalActive}
                serverUrl={liveEvalServerUrl}
              />
              <div className="flex items-center gap-1 text-muted-foreground">
                <Switch
                  id="live-eval-toggle"
                  checked={isLiveEvalEnabled}
                  onCheckedChange={setIsLiveEvalEnabled}
                  aria-label={liveEvalToggleLabel}
                  disabled={gameStatus !== 'playing'}
                />
                <Label htmlFor="live-eval-toggle" className="text-xs font-medium">
                  Éval cloud
                </Label>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {isVariantReady && activeVariant && (
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

            <MoveHistory moves={displayHistory} />
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
      <Dialog open={isSpecialDialogOpen} onOpenChange={handleSpecialDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choisissez une attaque spéciale</DialogTitle>
            <DialogDescription>
              {activeVariant ? activeVariant.description : "Sélectionnez une option spéciale."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {pendingSpecialMoves.map((move, index) => (
              <Button
                key={`special-${index}`}
                className="w-full justify-start"
                onClick={() => {
                  executeVariantMove(move);
                  handleSpecialDialogChange(false);
                }}
              >
                {describeSpecialMove(move)}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleSpecialDialogChange(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
