
import type { Tables } from "@/services/supabase/types";

const EDGE_BASE_URL = "/functions/v1/bots";

export interface BotProfilePublic {
  id: string;
  name: string;
  elo_target: number;
  style: Record<string, unknown>;
  book: Record<string, unknown>;
}

export interface BotSessionResponse {
  sessionId: string;
  bot: BotProfilePublic;
}

export type EvaluationType = "cp" | "mate";

export interface EvaluationPayload {
  type: EvaluationType;
  value: number;
}

export interface BotMultipvLine {
  multipv: number;
  move: string;
  pv: string[];
  evaluation: EvaluationPayload;
}

export interface BotMoveAnalysis {
  source: "book" | "engine";
  evaluation: EvaluationPayload | null;
  principalVariation: string[];
  principalVariationSan: string[];
  multipv?: BotMultipvLine[];
  bookLine?: { name?: string; moves?: string[] };
}

export interface BotMoveSuccess {
  sessionId: string | null;
  botId: string;
  fenBefore: string;
  fenAfter: string;
  move: {
    from: string;
    to: string;
    san: string;
    uci: string;
    lan?: string;
    promotion?: string | null;
  };
  analysis: BotMoveAnalysis;
}

export interface BotMoveGameOver {
  status: "game_over";
  reason: string;
  fen: string;
  sessionId?: string | null;
  botId?: string;
}

export interface BotMoveRequest {
  botId: string;
  sessionId?: string | null;
  moves?: string[];
  initialFen?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch (_) {
      // ignore json parsing error
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function createBotSession(botId: string): Promise<BotSessionResponse> {
  const response = await fetch(`${EDGE_BASE_URL}/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botId }),
  });
  return handleResponse<BotSessionResponse>(response);
}

export async function requestBotMove(
  request: BotMoveRequest,
): Promise<BotMoveSuccess | BotMoveGameOver> {
  const response = await fetch(`${EDGE_BASE_URL}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleResponse<BotMoveSuccess | BotMoveGameOver>(response);
}

export type BotProfileRow = Tables<"bot_profiles">;
