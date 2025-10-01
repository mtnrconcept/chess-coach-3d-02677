import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Activity, AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface EngineEvaluation {
  type: "cp" | "mate";
  value: number;
}

interface EvalPayload {
  type: "eval";
  ply: number;
  bestMove: string;
  evaluation: EngineEvaluation;
  depth: number;
  engineTimeMs: number;
  fen: string;
}

interface ReadyPayload {
  type: "ready";
  depth: number;
  threads: number;
}

interface ErrorPayload {
  type: "error";
  message: string;
}

type ServerMessage = EvalPayload | ReadyPayload | ErrorPayload;

type LiveEvalStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "error"
  | "disconnected";

export interface LiveEvalBadgeProps {
  fen: string;
  ply?: number;
  enabled?: boolean;
  perspective?: "w" | "b";
  serverUrl?: string;
  className?: string;
}

interface PendingRequest {
  fen: string;
  ply: number;
  enqueuedAt: number;
}

interface LatestEvaluation {
  payload: EvalPayload;
  latencyMs?: number;
}

const DEFAULT_SERVER_PATH = "/functions/v1/live-eval";

function buildSocketUrl(serverUrl: string): string {
  if (serverUrl.startsWith("ws://") || serverUrl.startsWith("wss://")) {
    return serverUrl;
  }
  if (serverUrl.startsWith("https://")) {
    return `wss://${serverUrl.slice("https://".length)}`;
  }
  if (serverUrl.startsWith("http://")) {
    return `ws://${serverUrl.slice("http://".length)}`;
  }
  if (typeof window === "undefined") {
    return serverUrl;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  if (serverUrl.startsWith("/")) {
    return `${protocol}//${host}${serverUrl}`;
  }
  return `${protocol}//${host}/${serverUrl}`;
}

function derivePlyFromFen(fen: string): number {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 6) return 0;
  const fullmove = Number.parseInt(parts[5], 10);
  if (!Number.isFinite(fullmove) || fullmove <= 0) return 0;
  const sideToMove = parts[1] === "b" ? 1 : 0;
  return (fullmove - 1) * 2 + sideToMove;
}

function formatEvaluation(
  evaluation: EngineEvaluation,
  fen: string,
  perspective: "w" | "b"
): { label: string; numeric?: number } {
  const parts = fen.trim().split(/\s+/);
  const sideToMove = parts[1] === "b" ? "b" : "w";
  const perspectiveSign = perspective === "w" ? 1 : -1;
  if (evaluation.type === "mate") {
    const mateFromWhite = sideToMove === "w" ? evaluation.value : -evaluation.value;
    const oriented = mateFromWhite * perspectiveSign;
    const suffix = `#${Math.abs(oriented)}`;
    return { label: oriented >= 0 ? suffix : `-${suffix}` };
  }
  const cpFromWhite = sideToMove === "w" ? evaluation.value : -evaluation.value;
  const oriented = (cpFromWhite / 100) * perspectiveSign;
  const label = `${oriented >= 0 ? "+" : ""}${oriented.toFixed(2)}`;
  return { label, numeric: oriented };
}

function formatBestMove(fen: string, bestMove: string): string {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true }) as Array<{
      from: string;
      to: string;
      san: string;
      promotion?: string;
    }>;
    const match = moves.find((move) => {
      const promotion = move.promotion ? move.promotion : "";
      return `${move.from}${move.to}${promotion}`.toLowerCase() === bestMove.toLowerCase();
    });
    return match?.san ?? bestMove;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Failed to format best move", error);
    }
    return bestMove;
  }
}

export function LiveEvalBadge({
  fen,
  ply,
  enabled = true,
  perspective = "w",
  serverUrl = DEFAULT_SERVER_PATH,
  className,
}: LiveEvalBadgeProps) {
  const [status, setStatus] = useState<LiveEvalStatus>(() => (enabled ? "connecting" : "idle"));
  const [engineInfo, setEngineInfo] = useState<ReadyPayload | null>(null);
  const [latest, setLatest] = useState<LatestEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionToken, setConnectionToken] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<PendingRequest | null>(null);
  const inflightRef = useRef<PendingRequest | null>(null);
  const flushRef = useRef<() => void>(() => undefined);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);

  const effectivePly = useMemo(() => {
    if (typeof ply === "number" && Number.isFinite(ply)) {
      return ply;
    }
    return derivePlyFromFen(fen);
  }, [fen, ply]);

  useEffect(() => {
    if (typeof reconnectTimeoutRef.current === "number") {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    if (!enabled) {
      setStatus("idle");
      setEngineInfo(null);
      setLatest(null);
      setError(null);
      if (wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.close(1000, "Live eval disabled");
      }
      wsRef.current = null;
      queueRef.current = null;
      inflightRef.current = null;
      return;
    }

    setStatus("connecting");
    setError(null);
    const url = buildSocketUrl(serverUrl);
    let closed = false;
    const socket = new WebSocket(url);
    wsRef.current = socket;
    queueRef.current = null;
    inflightRef.current = null;

    const flushQueue = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      if (inflightRef.current || !queueRef.current) {
        return;
      }
      const next = queueRef.current;
      queueRef.current = null;
      inflightRef.current = { ...next, enqueuedAt: performance.now() };
      wsRef.current.send(
        JSON.stringify({
          type: "fen",
          fen: next.fen,
          ply: next.ply,
        })
      );
    };

    flushRef.current = flushQueue;

    socket.onopen = () => {
      if (closed) return;
      flushQueue();
    };

    socket.onmessage = (event) => {
      if (closed) return;
      if (typeof event.data !== "string") return;
      let payload: ServerMessage | null = null;
        try {
          payload = JSON.parse(event.data) as ServerMessage;
        } catch (parseError) {
          if (import.meta.env.DEV) {
            console.warn("live-eval: failed to parse payload", parseError);
          }
          return;
        }

      if (!payload) return;

      if (payload.type === "ready") {
        setEngineInfo(payload);
        setStatus("ready");
        return;
      }

      if (payload.type === "error") {
        setStatus("error");
        setError(payload.message);
        return;
      }

      if (payload.type === "eval") {
        const inflight = inflightRef.current;
        const latency = inflight ? performance.now() - inflight.enqueuedAt : undefined;
        inflightRef.current = null;
        setLatest({ payload, latencyMs: latency });
        flushQueue();
        return;
      }
    };

    socket.onerror = (event) => {
      console.error("live-eval websocket error", event);
      if (!closed) {
        setStatus("error");
        setError("Connexion au serveur d'évaluation perdue");
      }
    };

    socket.onclose = () => {
      if (closed) return;
      closed = true;
      inflightRef.current = null;
      flushRef.current = () => undefined;
      if (enabled) {
        setStatus((previous) => (previous === "error" ? previous : "disconnected"));
        reconnectTimeoutRef.current = window.setTimeout(() => {
          setConnectionToken((value) => value + 1);
        }, 600);
      } else {
        setStatus("idle");
      }
    };

    return () => {
      closed = true;
      flushRef.current = () => undefined;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, "Component unmounted");
      }
      wsRef.current = null;
      queueRef.current = null;
      inflightRef.current = null;
      if (typeof reconnectTimeoutRef.current === "number") {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };
  }, [enabled, serverUrl, connectionToken]);

  useEffect(() => {
    if (!enabled) return;
    if (!fen) return;
    const request: PendingRequest = {
      fen,
      ply: effectivePly,
      enqueuedAt: performance.now(),
    };
    queueRef.current = request;
    flushRef.current();
  }, [fen, effectivePly, enabled]);

  const evaluationSummary = useMemo(() => {
    if (!latest) {
      if (status === "connecting") {
        return "Connexion au cloud";
      }
      if (status === "ready") {
        return engineInfo ? `Profondeur ${engineInfo.depth}` : "Cloud prêt";
      }
      return null;
    }

    const { payload, latencyMs } = latest;
    const evaluation = formatEvaluation(payload.evaluation, payload.fen, perspective);
    const bestMove = payload.bestMove ? formatBestMove(payload.fen, payload.bestMove) : null;
    const parts: string[] = [];
    parts.push(evaluation.label);
    if (bestMove) {
      parts.push(bestMove);
    }
    const latency = latencyMs ?? payload.engineTimeMs;
    if (typeof latency === "number" && Number.isFinite(latency)) {
      parts.push(`${Math.round(latency)} ms`);
    }
    return parts.join(" • ");
  }, [engineInfo, latest, perspective, status]);

  const icon = useMemo(() => {
    if (status === "error") {
      return <AlertTriangle className="w-3 h-3" />;
    }
    if (status === "connecting" || status === "disconnected") {
      return <Loader2 className="w-3 h-3 animate-spin" />;
    }
    return <Activity className="w-3 h-3" />;
  }, [status]);

  const badgeVariant = status === "error" ? "destructive" : "outline";
  const label = (() => {
    if (status === "idle") {
      return "Éval cloud désactivée";
    }
    if (status === "disconnected") {
      return "Reconnexion";
    }
    if (status === "error") {
      return error ?? "Erreur";
    }
    if (evaluationSummary) {
      return evaluationSummary;
    }
    if (status === "connecting") {
      return "Connexion au cloud";
    }
    return "Cloud prêt";
  })();

  return (
    <Badge variant={badgeVariant} className={cn("flex items-center gap-1 text-xs", className)}>
      {status === "idle" ? <WifiOff className="w-3 h-3" /> : icon}
      <span className="font-medium">Eval cloud</span>
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
    </Badge>
  );
}

export default LiveEvalBadge;
