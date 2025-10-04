import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { Group } from "three";
import { Chess } from "chess.js";
import type { Move as ChessJsMove } from "chess.js";
import { Loader2, Lightbulb, RefreshCw, SkipForward } from "lucide-react";

import { ChessBoard3D } from "@/components/ChessBoard3D";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/services/supabase/client";
import type { Tables } from "@/services/supabase/types";

type PuzzleRow = Tables<"puzzles">;

type SelectionState = { square: string; moves: ChessJsMove[] } | null;

type TrainerStatus = "loading" | "ready" | "replaying" | "solved" | "failed" | "review";

interface PuzzleTrainerProps {
  className?: string;
}

function parseBestLine(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      }
    } catch {
      if (raw.trim().length > 0) {
        return [raw.trim()];
      }
    }
  }

  return [];
}

function sanitizeSan(move: string): string {
  return move.replace(/[+#?!]/g, "").replace(/\s+/g, "").trim();
}

function shuffleArray<T>(input: T[]): T[] {
  const array = [...input];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function isPuzzleValid(puzzle: PuzzleRow): boolean {
  const line = parseBestLine(puzzle.best_line);
  if (line.length === 0) {
    return false;
  }

  try {
    const chess = new Chess();
    chess.load(puzzle.fen);
  } catch {
    return false;
  }

  return sanitizeSan(line[0] ?? "").length > 0;
}

export function PuzzleTrainer({ className }: PuzzleTrainerProps) {
  const chessRef = useRef(new Chess());
  const boardRef = useRef<Group>(null);

  const [puzzleQueue, setPuzzleQueue] = useState<PuzzleRow[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<PuzzleRow | null>(null);
  const [status, setStatus] = useState<TrainerStatus>("loading");
  const [fen, setFen] = useState<string>("");
  const [selection, setSelection] = useState<SelectionState>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [attempted, setAttempted] = useState(0);
  const [solved, setSolved] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [hasRecordedResult, setHasRecordedResult] = useState(false);

  const solutionLine = useMemo(() => (currentPuzzle ? parseBestLine(currentPuzzle.best_line) : []), [currentPuzzle]);
  const sanitizedSolution = useMemo(() => solutionLine.map(sanitizeSan), [solutionLine]);

  const playerColor = useMemo(() => {
    if (!currentPuzzle) return "white";
    const parts = currentPuzzle.fen.split(" ");
    return parts[1] === "b" ? "black" : "white";
  }, [currentPuzzle]);

  const successRate = attempted > 0 ? Math.round((solved / attempted) * 100) : 0;

  const recordResult = useCallback(
    (result: "solved" | "failed") => {
      setHasRecordedResult((already) => {
        if (already) {
          return true;
        }
        setAttempted((count) => count + 1);
        if (result === "solved") {
          setSolved((count) => count + 1);
        }
        return true;
      });
    },
    [],
  );

  const resetInteractionState = useCallback(() => {
    setSelection(null);
    setPossibleMoves([]);
    setLastMove(null);
    setFeedback(null);
    setSolutionIndex(0);
    setShowSolution(false);
    setHasRecordedResult(false);
  }, []);

  const fetchPuzzles = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    setStatus("loading");
    try {
      const { data, error: queryError } = await supabase
        .from("puzzles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);

      if (queryError) {
        throw queryError;
      }

      const valid = shuffleArray((data ?? []).filter(isPuzzleValid));

      if (valid.length === 0) {
        setPuzzleQueue([]);
        setCurrentPuzzle(null);
        setStatus("loading");
        setError("Aucun puzzle disponible pour le moment. Reviens après ta prochaine partie analysée.");
        return;
      }

      setCurrentPuzzle(valid[0]);
      setPuzzleQueue(valid.slice(1));
      setError(null);
    } catch (err) {
      console.error("Failed to fetch puzzles", err);
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(`Impossible de récupérer les puzzles : ${message}`);
      setPuzzleQueue([]);
      setCurrentPuzzle(null);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchPuzzles();
  }, [fetchPuzzles]);

  const advancePuzzle = useCallback(() => {
    resetInteractionState();
    setStatus("loading");
    setPuzzleQueue((queue) => {
      if (queue.length === 0) {
        setCurrentPuzzle(null);
        void fetchPuzzles();
        return [];
      }
      const [next, ...rest] = queue;
      setCurrentPuzzle(next);
      return rest;
    });
  }, [fetchPuzzles, resetInteractionState]);

  useEffect(() => {
    if (!currentPuzzle) {
      setFen("");
      return;
    }

    try {
      const chess = new Chess();
      chess.load(currentPuzzle.fen);
      chessRef.current = chess;
      setFen(chess.fen());
      resetInteractionState();
      setStatus("ready");
    } catch (err) {
      console.error("Invalid puzzle FEN", err);
      setFeedback("Ce puzzle est invalide, passage automatique au suivant.");
      recordResult("failed");
      setTimeout(() => {
        advancePuzzle();
      }, 0);
    }
  }, [advancePuzzle, currentPuzzle, recordResult, resetInteractionState]);

  const handlePlayerMove = useCallback(
    (candidate: ChessJsMove) => {
      if (!currentPuzzle || status !== "ready") {
        return;
      }

      const expected = sanitizedSolution[solutionIndex];
      if (!expected) {
        return;
      }

      const attemptedSan = sanitizeSan(candidate.san);
      if (attemptedSan !== expected) {
        setStatus("failed");
        setFeedback("Ce n'était pas le coup gagnant. Analyse la solution puis réessaie.");
        setSelection(null);
        setPossibleMoves([]);
        setShowSolution(true);
        recordResult("failed");
        return;
      }

      const executed = chessRef.current.move({
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion ?? "q",
      });

      if (!executed) {
        return;
      }

      setFen(chessRef.current.fen());
      setLastMove({ from: executed.from, to: executed.to });
      setSelection(null);
      setPossibleMoves([]);

      let nextIndex = solutionIndex + 1;

      if (nextIndex >= solutionLine.length) {
        setSolutionIndex(nextIndex);
        setStatus("solved");
        setFeedback("Bravo ! Vous avez trouvé la combinaison gagnante.");
        setShowSolution(true);
        recordResult("solved");
        return;
      }

      setStatus("replaying");
      const replySan = solutionLine[nextIndex];
      if (replySan) {
        try {
          const replyMove = chessRef.current.move(replySan);
          if (replyMove) {
            setFen(chessRef.current.fen());
            setLastMove({ from: replyMove.from, to: replyMove.to });
            nextIndex += 1;
          } else {
            console.warn("Unable to replay engine reply", currentPuzzle.id);
            setStatus("failed");
            setFeedback("Impossible de rejouer la suite de la combinaison.");
            setShowSolution(true);
            recordResult("failed");
            return;
          }
        } catch {
          console.warn("Unable to replay engine reply", currentPuzzle.id);
          setStatus("failed");
          setFeedback("Impossible de rejouer la suite de la combinaison.");
          setShowSolution(true);
          recordResult("failed");
          return;
        }
      }

      setSolutionIndex(nextIndex);

      if (nextIndex >= solutionLine.length) {
        setStatus("solved");
        setFeedback("Bravo ! Vous avez trouvé la combinaison gagnante.");
        setShowSolution(true);
        recordResult("solved");
      } else {
        setStatus("ready");
      }
    },
    [currentPuzzle, recordResult, sanitizedSolution, solutionIndex, solutionLine, status],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!currentPuzzle || status !== "ready") {
        return;
      }

      const chess = chessRef.current;
      const expectedTurn = playerColor === "white" ? "w" : "b";

      if (chess.turn() !== expectedTurn) {
        setSelection(null);
        setPossibleMoves([]);
        return;
      }

      if (selection && selection.square !== square) {
        const move = selection.moves.find((candidate) => candidate.to === square);
        if (move) {
          handlePlayerMove(move);
          return;
        }
      }

      const moves = chess.moves({ square, verbose: true }) as ChessJsMove[];

      if (moves.length === 0) {
        setSelection(null);
        setPossibleMoves([]);
        return;
      }

      setSelection({ square, moves });
      setPossibleMoves(moves.map((move) => move.to));
    },
    [currentPuzzle, handlePlayerMove, playerColor, selection, status],
  );

  const handleRetry = useCallback(() => {
    if (!currentPuzzle) return;
    try {
      const chess = new Chess();
      chess.load(currentPuzzle.fen);
      chessRef.current = chess;
      setFen(chess.fen());
      setStatus("ready");
      resetInteractionState();
    } catch (err) {
      console.error("Unable to reset puzzle", err);
      setError("Impossible de réinitialiser ce puzzle.");
    }
  }, [currentPuzzle, resetInteractionState]);

  const handleSkip = useCallback(() => {
    if (!hasRecordedResult) {
      recordResult("failed");
    }
    advancePuzzle();
  }, [advancePuzzle, hasRecordedResult, recordResult]);

  const handleNext = useCallback(() => {
    if (!hasRecordedResult && status === "ready") {
      recordResult("failed");
    }
    advancePuzzle();
  }, [advancePuzzle, hasRecordedResult, recordResult, status]);

  const handleRevealSolution = useCallback(() => {
    if (!currentPuzzle) return;
    try {
      const chess = new Chess();
      chess.load(currentPuzzle.fen);
      let latest: { from: string; to: string } | null = null;
      for (const san of solutionLine) {
        try {
          const move = chess.move(san);
          if (!move) break;
          latest = { from: move.from, to: move.to };
        } catch {
          break;
        }
      }
      chessRef.current = chess;
      setFen(chess.fen());
      setLastMove(latest);
      setSelection(null);
      setPossibleMoves([]);
      setSolutionIndex(solutionLine.length);
      setStatus("review");
      setShowSolution(true);
      setFeedback("Analysez la solution pour mémoriser le motif tactique.");
      if (!hasRecordedResult) {
        recordResult("failed");
      }
    } catch (err) {
      console.error("Unable to reveal solution", err);
      setError("Impossible d'afficher la solution complète.");
    }
  }, [currentPuzzle, hasRecordedResult, recordResult, solutionLine]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "ready":
        return "À vous de jouer";
      case "replaying":
        return "Réponse de l'adversaire...";
      case "solved":
        return "Puzzle résolu";
      case "failed":
        return "Opportunité manquée";
      case "review":
        return "Étudiez la solution";
      default:
        return "Chargement";
    }
  }, [status]);

  const canShowBoard = Boolean(currentPuzzle) && !isFetching;

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-semibold">Entraînement tactique express</CardTitle>
            <CardDescription>
              Résous des puzzles générés automatiquement à partir de tes propres erreurs.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono uppercase">
            {playerColor === "white" ? "Blancs" : "Noirs"} à jouer
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            {status === "loading" || isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            {statusLabel}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-medium">Taux de réussite</span>
            <Progress value={successRate} className="h-2 w-32" />
            <span className="font-mono text-xs">{successRate}% ({solved}/{attempted})</span>
          </div>
        </div>
        {currentPuzzle && currentPuzzle.theme.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {currentPuzzle.theme.map((theme) => (
              <Badge key={theme} variant="secondary" className="capitalize">
                {theme}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Oups...</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isFetching && !currentPuzzle ? (
          <div className="space-y-4">
            <Skeleton className="h-[420px] w-full" />
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ) : !canShowBoard ? (
          <Alert>
            <AlertTitle>Pas encore de puzzle</AlertTitle>
            <AlertDescription>
              Lance une analyse de partie pour alimenter automatiquement ta collection de tactiques.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-square w-full">
              <Canvas shadows>
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 10, 5]} intensity={0.9} castShadow />
                <PerspectiveCamera makeDefault position={[8, 10, 8]} />
                <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minPolarAngle={Math.PI / 6} />
                <Environment preset="city" />
                <group rotation={[0, playerColor === "black" ? Math.PI : 0, 0]}>
                  <ChessBoard3D
                    ref={boardRef}
                    position={fen}
                    onSquareClick={handleSquareClick}
                    selectedSquare={selection?.square ?? null}
                    possibleMoves={possibleMoves}
                    lastMove={lastMove}
                  />
                </group>
              </Canvas>
              {(status === "replaying" || status === "loading") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-primary">
                  {status === "loading" ? "Chargement du puzzle..." : "Réponse forcée..."}
                </div>
              )}
              {status === "solved" && (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 text-emerald-900">
                  Bravo !
                </div>
              )}
              {status === "failed" && (
                <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 text-destructive">
                  Rejoue la combinaison pour la retenir
                </div>
              )}
            </div>
            {feedback && (
              <Alert variant={status === "solved" ? "default" : status === "failed" ? "destructive" : "default"}>
                <AlertTitle>
                  {status === "solved" ? "Bien joué !" : status === "failed" ? "Opportunité manquée" : "Information"}
                </AlertTitle>
                <AlertDescription>{feedback}</AlertDescription>
              </Alert>
            )}
            {(showSolution || status === "solved" || status === "review") && solutionLine.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                {solutionLine.map((san, index) => (
                  <span key={`${san}-${index}`} className="rounded bg-muted px-2 py-1">
                    {san}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleRetry} disabled={!currentPuzzle || status === "loading"}>
            <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
          </Button>
          <Button type="button" variant="secondary" onClick={handleRevealSolution} disabled={!currentPuzzle}>
            <Lightbulb className="mr-2 h-4 w-4" /> Voir la solution
          </Button>
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={!currentPuzzle}>
            <SkipForward className="mr-2 h-4 w-4" /> Passer
          </Button>
        </div>
        <Button type="button" onClick={handleNext} disabled={isFetching}>
          Puzzle suivant
        </Button>
      </CardFooter>
    </Card>
  );
}
