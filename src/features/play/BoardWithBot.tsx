
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { Group } from "three";
import { Chess } from "chess.js";
import type { Move as ChessJsMove } from "chess.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, ShieldQuestion } from "lucide-react";
import { ChessBoard3D } from "@/components/ChessBoard3D";
import { MoveHistory } from "@/components/MoveHistory";
import { toast } from "sonner";
import type { Tables } from "@/services/supabase/types";
import {
  createBotSession,
  requestBotMove,
  type BotMoveAnalysis,
  type BotMoveGameOver,
  type BotMoveSuccess,
} from "@/services/botsClient";
import { cn } from "@/lib/utils";

interface BoardWithBotProps {
  bot: Tables<"bot_profiles"> | null;
  orientation?: "white" | "black";
  className?: string;
}

type SelectionState = {
  square: string;
  moves: ChessJsMove[];
} | null;

function getPlayerTurn(orientation: "white" | "black") {
  return orientation === "white" ? "w" : "b";
}

function isGameOverResponse(response: BotMoveSuccess | BotMoveGameOver): response is BotMoveGameOver {
  return "status" in response && response.status === "game_over";
}

export function BoardWithBot({ bot, orientation = "white", className }: BoardWithBotProps) {
  const chessRef = useRef(new Chess());
  const boardRef = useRef<Group>(null);
  const sanHistoryRef = useRef<string[]>([]);
  const moveHistoryRef = useRef<ChessJsMove[]>([]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<ChessJsMove[]>([]);
  const [analysis, setAnalysis] = useState<BotMoveAnalysis | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [selection, setSelection] = useState<SelectionState>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ready" | "playing" | "game_over" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  const playerTurn = useMemo(() => getPlayerTurn(orientation), [orientation]);

  const resetBoard = useCallback(() => {
    chessRef.current = new Chess();
    sanHistoryRef.current = [];
    moveHistoryRef.current = [];
    setFen(chessRef.current.fen());
    setMoveHistory([]);
    setAnalysis(null);
    setLastMove(null);
    setSelection(null);
    setPossibleMoves([]);
    setStatus("idle");
    setError(null);
  }, []);

  const updateHistories = useCallback((move: ChessJsMove) => {
    const updatedSan = [...sanHistoryRef.current, move.san];
    const updatedVerbose = [...moveHistoryRef.current, move];
    sanHistoryRef.current = updatedSan;
    moveHistoryRef.current = updatedVerbose;
    setMoveHistory(updatedVerbose);
  }, []);

  const applyBotMove = useCallback((response: BotMoveSuccess) => {
    const chess = chessRef.current;
    let move;
    try {
      move = chess.move({
        from: response.move.from,
        to: response.move.to,
        promotion: response.move.promotion ?? undefined,
      });
    } catch {
      try {
        move = chess.move(response.move.san);
      } catch {
        throw new Error("Le coup renvoyé par le bot est illégal dans cette position.");
      }
    }
    if (!move) {
      throw new Error("Le coup renvoyé par le bot est illégal dans cette position.");
    }
    return move;
  }, []);

  const performBotTurn = useCallback(
    async (session: string | null = null, skipDelay = false) => {
      if (!bot) return;
      const activeSession = session ?? sessionId;
      if (!activeSession) return;

      if (!skipDelay) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      setIsThinking(true);
      try {
        const response = await requestBotMove({
          botId: bot.id,
          sessionId: activeSession,
          moves: sanHistoryRef.current,
        });

        if (isGameOverResponse(response)) {
          setStatus("game_over");
          setAnalysis(null);
          setError(null);
          return;
        }

        const moveResult = applyBotMove(response);
        updateHistories(moveResult);
        setFen(chessRef.current.fen());
        setLastMove({ from: moveResult.from, to: moveResult.to });
        setAnalysis(response.analysis);
        setStatus(chessRef.current.isGameOver() ? "game_over" : "playing");
      } catch (err) {
        console.error("Bot move error", err);
        const message = err instanceof Error ? err.message : "Erreur inconnue";
        setError(message);
        setStatus("error");
        toast.error("Le bot ne répond plus", { description: message });
      } finally {
        setIsThinking(false);
      }
    },
    [applyBotMove, bot, sessionId, updateHistories],
  );

  const startSession = useCallback(async () => {
    if (!bot) {
      setSessionId(null);
      return;
    }
    resetBoard();
    setIsStarting(true);
    setStatus("idle");
    setSessionId(null);
    try {
      const session = await createBotSession(bot.id);
      setSessionId(session.sessionId);
      setStatus("ready");
      if (orientation === "black") {
        await performBotTurn(session.sessionId, true);
      }
    } catch (err) {
      console.error("Failed to start bot session", err);
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
      setStatus("error");
      toast.error("Impossible de créer la session bot", { description: message });
    } finally {
      setIsStarting(false);
    }
  }, [bot, orientation, performBotTurn, resetBoard]);

  useEffect(() => {
    void startSession();
  }, [startSession, sessionVersion]);

  useEffect(() => {
    return () => {
      chessRef.current = new Chess();
      sanHistoryRef.current = [];
      moveHistoryRef.current = [];
    };
  }, []);

  const handlePlayerMove = useCallback(
    async (candidate: ChessJsMove) => {
      const chess = chessRef.current;
      const executed = chess.move({
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion ?? "q",
      });
      if (!executed) {
        return;
      }
      updateHistories(executed);
      setFen(chess.fen());
      setLastMove({ from: executed.from, to: executed.to });
      setAnalysis(null);
      setSelection(null);
      setPossibleMoves([]);
      setStatus(chess.isGameOver() ? "game_over" : "playing");

      if (chess.isGameOver()) {
        return;
      }

      await performBotTurn();
    },
    [performBotTurn, updateHistories],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!bot || isThinking || status === "game_over" || status === "error") {
        return;
      }
      const chess = chessRef.current;
      if (chess.turn() !== playerTurn) {
        setSelection(null);
        setPossibleMoves([]);
        return;
      }

      if (selection && selection.square !== square) {
        const move = selection.moves.find((candidate) => candidate.to === square);
        if (move) {
          void handlePlayerMove(move);
          return;
        }
      }

      const moves = (chess.moves({ square: square as any, verbose: true }) as ChessJsMove[]).filter(
        (candidate) => candidate.color === playerTurn,
      );

      if (moves.length === 0) {
        setSelection(null);
        setPossibleMoves([]);
        return;
      }

      setSelection({ square, moves });
      setPossibleMoves(moves.map((move) => move.to));
    },
    [bot, handlePlayerMove, isThinking, playerTurn, selection, status],
  );

  const statusLabel = useMemo(() => {
    switch (status) {
      case "idle":
        return "Sélectionnez un coup";
      case "ready":
        return orientation === "black" ? "Le bot commence la partie" : "À vous de jouer";
      case "playing":
        return isThinking ? "Le bot réfléchit..." : "Partie en cours";
      case "game_over":
        return chessRef.current.isCheckmate() ? "Échec et mat" : "Partie terminée";
      case "error":
        return "Erreur de session";
      default:
        return "";
    }
  }, [isThinking, orientation, status]);

  const handleRestart = () => {
    setSessionVersion((version) => version + 1);
  };

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[2fr,1fr]", className)}>
      <Card className="neon-card overflow-hidden bg-transparent">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-2xl font-semibold">
              {bot ? bot.name : "Choisissez un bot"}
            </CardTitle>
            {bot && <Badge variant="outline">Elo cible ~ {bot.elo_target}</Badge>}
            {bot && (
              <Badge variant="secondary" className="capitalize">
                {typeof bot.style === "object" && !Array.isArray(bot.style) && bot.style
                  ? ((bot.style as Record<string, unknown>).label as string | undefined) ?? "Bot"
                  : "Bot"}
              </Badge>
            )}
          </div>
          <CardDescription className="flex items-center gap-2 text-sm">
            <span>{statusLabel}</span>
            {(isStarting || (isThinking && !isStarting)) && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mx-auto aspect-square w-full max-w-mobile-board min-h-mobile-board sm:min-h-0">
            <Canvas shadows>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 10, 5]} intensity={0.9} castShadow />
              <PerspectiveCamera makeDefault position={[8, 10, 8]} />
              <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minPolarAngle={Math.PI / 6} />
              <Environment preset="city" />
              <ChessBoard3D
                ref={boardRef}
                position={fen}
                onSquareClick={handleSquareClick}
                selectedSquare={selection?.square ?? null}
                possibleMoves={possibleMoves}
                lastMove={lastMove}
              />
            </Canvas>
            {isThinking && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-primary">
                Le bot réfléchit...
              </div>
            )}
          </div>
          {analysis && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Badge variant={analysis.source === "book" ? "secondary" : "default"}>
                  {analysis.source === "book" ? "Livre" : "Moteur"}
                </Badge>
                {analysis.evaluation && (
                  <span>
                    Évaluation: {analysis.evaluation.type === "cp"
                      ? `${(analysis.evaluation.value / 100).toFixed(2)}`
                      : `Mat en ${analysis.evaluation.value}`}
                  </span>
                )}
              </div>
              {analysis.principalVariationSan.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  {analysis.principalVariationSan.slice(0, 6).map((san, index) => (
                    <span key={`${san}-${index}`} className="rounded bg-muted px-2 py-1">
                      {san}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={handleRestart} disabled={isStarting}>
            <RefreshCw className="mr-2 h-4 w-4" /> Nouvelle partie
          </Button>
          <Badge variant="outline" className="font-mono uppercase">
            Vous jouez les {orientation === "white" ? "blancs" : "noirs"}
          </Badge>
        </CardFooter>
      </Card>
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <ShieldQuestion className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <MoveHistory moves={moveHistory} />
      </div>
    </div>
  );
}

export default BoardWithBot;
