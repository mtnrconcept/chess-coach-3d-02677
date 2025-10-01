import type { Tables } from "@/services/supabase/types";

const EDGE_BASE_URL = "/functions/v1/pairings";

export type TournamentRow = Tables<"tournaments">;
export type TournamentPlayerRow = Tables<"tournament_players">;
export type PairingRow = Tables<"pairings">;
export type ResultRow = Tables<"results">;

export interface GeneratePairingsResponse {
  round: number;
  system: "swiss" | "arena";
  pairings: Array<Pick<PairingRow, "id" | "white_id" | "black_id" | "board" | "round">>;
}

export interface GeneratePairingsPayload {
  tournamentId: string;
  round?: number;
  system?: "swiss" | "arena";
}

export interface ReportResultPayload {
  pairingId: string;
  outcome: ResultRow["outcome"];
  whiteScore?: number;
  blackScore?: number;
  reportedBy?: string;
  accuracy?: { white?: number | null; black?: number | null } | null;
  moveTimes?: { white?: number[] | null; black?: number[] | null } | null;
  notes?: string | null;
}

export interface ReportResultResponse {
  resultId: string | null;
  flagged: Array<{
    tournamentPlayerId: string;
    playerId: string | null;
    reasons: string[];
  }>;
  ratingDiff: Record<string, number | null>;
  suspicious: {
    accuracy: boolean;
    timing: boolean;
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch (error) {
      console.error("Failed to parse pairings error response", error);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function generatePairings(
  payload: GeneratePairingsPayload,
): Promise<GeneratePairingsResponse> {
  const response = await fetch(`${EDGE_BASE_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<GeneratePairingsResponse>(response);
}

export async function reportPairingResult(
  payload: ReportResultPayload,
): Promise<ReportResultResponse> {
  const response = await fetch(`${EDGE_BASE_URL}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ReportResultResponse>(response);
}
