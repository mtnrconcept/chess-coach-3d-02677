import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient as SupabaseJsClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0?dts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Database = {
  public: {
    Tables: {
      tournaments: {
        Row: {
          id: string;
          format: 'swiss' | 'arena';
          status: string;
          is_rated: boolean;
          current_round: number;
        };
      };
      tournament_players: {
        Row: {
          id: string;
          tournament_id: string;
          player_id: string;
          rating: number | null;
          provisional_rating: boolean;
          score: number;
          wins: number;
          draws: number;
          losses: number;
          streak: number;
          last_active_at: string | null;
          flags: Json;
        };
        Update: Partial<{
          rating: number | null;
          score: number;
          wins: number;
          draws: number;
          losses: number;
          streak: number;
          last_active_at: string | null;
          flags: Json;
        }>;
      };
      pairings: {
        Row: {
          id: string;
          tournament_id: string;
          round: number;
          board: number;
          white_id: string | null;
          black_id: string | null;
          result_status: 'pending' | 'reported' | 'validated' | 'under_review' | 'cancelled';
        };
        Insert: {
          tournament_id: string;
          round: number;
          board: number;
          white_id: string | null;
          black_id: string | null;
          metadata?: Json;
        };
      };
      results: {
        Row: {
          id: string;
        };
        Insert: {
          pairing_id: string;
          tournament_id: string;
          outcome: 'white' | 'black' | 'draw' | 'bye' | 'double_forfeit';
          white_score: number;
          black_score: number;
          reported_by: string | null;
          accuracy: Json | null;
          move_times: Json | null;
          player_metrics: Json;
          suspicious_accuracy: boolean;
          suspicious_timing: boolean;
          flagged: boolean;
          notes: string | null;
          rating_diff: Json | null;
        };
      };
    };
  };
};

type SupabaseClient = SupabaseJsClient<Database>;

type GeneratePairingsRequest = {
  tournamentId?: string;
  round?: number;
  system?: 'swiss' | 'arena';
};

type ReportResultRequest = {
  pairingId?: string;
  outcome?: 'white' | 'black' | 'draw' | 'bye' | 'double_forfeit';
  whiteScore?: number;
  blackScore?: number;
  reportedBy?: string;
  accuracy?: { white?: number | null; black?: number | null } | null;
  moveTimes?: { white?: number[] | null; black?: number[] | null } | null;
  notes?: string | null;
};

type EloComputation = {
  rating: number | null;
  opponentRating: number | null;
  score: number;
};

type RatingOutcome = {
  newRating: number | null;
  delta: number | null;
};

function buildSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing Supabase environment configuration');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function sanitizeTimes(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : null))
    .filter((entry): entry is number => entry !== null && entry >= 0 && entry <= 3600);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }
  return Number(sorted[mid].toFixed(2));
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / (values.length - 1);
  return Number(Math.sqrt(variance).toFixed(3));
}

function detectTimingAnomaly(times: number[], accuracy: number | null): boolean {
  if (times.length < 10) return false;
  const fastMoves = times.filter((value) => value <= 1.5).length;
  const ultraFastMoves = times.filter((value) => value <= 0.5).length;
  const spread = standardDeviation(times) ?? 0;
  const avg = average(times) ?? 0;

  if (times.length && fastMoves / times.length >= 0.85 && (accuracy ?? 0) >= 95) {
    return true;
  }

  if (ultraFastMoves >= Math.ceil(times.length * 0.7) && (accuracy ?? 0) >= 90) {
    return true;
  }

  if (avg <= 1.2 && spread <= 0.5 && (accuracy ?? 0) >= 92) {
    return true;
  }

  return false;
}

function computeElo({ rating, opponentRating, score }: EloComputation): RatingOutcome {
  if (rating === null || opponentRating === null) {
    return { newRating: rating, delta: null };
  }
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  const kFactor = rating >= 2400 ? 16 : rating >= 2000 ? 24 : 32;
  const delta = Number((kFactor * (score - expected)).toFixed(2));
  return { newRating: Math.round(rating + delta), delta };
}

async function hasRepeatedHighAccuracy(
  supabase: SupabaseClient,
  tournamentId: string,
  tournamentPlayerId: string,
  currentAccuracy: number | null,
): Promise<boolean> {
  if (currentAccuracy === null || currentAccuracy < 97) {
    return false;
  }

  const { data, error } = await supabase
    .from('results')
    .select('accuracy, pairing:pairings(white_id, black_id)')
    .eq('tournament_id', tournamentId)
    .order('reported_at', { ascending: false })
    .limit(12);

  if (error) {
    throw error;
  }

  let highAccuracyCount = 1; // include current game
  for (const row of data ?? []) {
    const pairing = row.pairing as { white_id: string | null; black_id: string | null } | null;
    if (!pairing) continue;
    const accuracy = (row.accuracy as { white?: number | null; black?: number | null }) ?? {};
    if (pairing.white_id === tournamentPlayerId && typeof accuracy.white === 'number' && accuracy.white >= 97) {
      highAccuracyCount += 1;
    } else if (
      pairing.black_id === tournamentPlayerId &&
      typeof accuracy.black === 'number' &&
      accuracy.black >= 97
    ) {
      highAccuracyCount += 1;
    }

    if (highAccuracyCount >= 3) {
      return true;
    }
  }

  return false;
}

function scoreFromOutcome(outcome: ReportResultRequest['outcome']): { white: number; black: number } {
  switch (outcome) {
    case 'white':
      return { white: 1, black: 0 };
    case 'black':
      return { white: 0, black: 1 };
    case 'draw':
      return { white: 0.5, black: 0.5 };
    case 'bye':
      return { white: 1, black: 0 };
    case 'double_forfeit':
      return { white: 0, black: 0 };
    default:
      return { white: 0, black: 0 };
  }
}

function updateStreak(current: number, outcome: ReportResultRequest['outcome'], color: 'white' | 'black'): number {
  if (outcome === 'draw') {
    return 0;
  }
  const didWin = (outcome === 'white' && color === 'white') || (outcome === 'black' && color === 'black') || (outcome === 'bye' && color === 'white');
  return didWin ? Math.max(1, current + 1) : 0;
}

function buildPlayerMetrics(times: number[], accuracy: number | null) {
  return {
    moves: times.length || null,
    average: average(times),
    median: median(times),
    accuracy,
  };
}

async function handleGeneratePairings(req: Request, supabase: SupabaseClient) {
  const payload: GeneratePairingsRequest = await req.json().catch(() => ({}));
  if (!payload.tournamentId) {
    return jsonResponse(400, { error: 'missing_tournament_id' });
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, format, current_round, status')
    .eq('id', payload.tournamentId)
    .maybeSingle();

  if (tournamentError) {
    console.error('Failed to load tournament', tournamentError);
    return jsonResponse(500, { error: 'tournament_lookup_failed' });
  }

  if (!tournament) {
    return jsonResponse(404, { error: 'tournament_not_found' });
  }

  const pairingRound = payload.round ?? (tournament.current_round ?? 0) + 1;
  const system: 'swiss' | 'arena' = payload.system ?? tournament.format ?? 'swiss';

  const { data: existingPairings, error: existingError } = await supabase
    .from('pairings')
    .select('id')
    .eq('tournament_id', tournament.id)
    .eq('round', pairingRound);

  if (existingError) {
    console.error('Failed to read existing pairings', existingError);
    return jsonResponse(500, { error: 'pairing_lookup_failed' });
  }

  if (existingPairings && existingPairings.length > 0) {
    return jsonResponse(409, { error: 'round_already_paired' });
  }

  const { data: players, error: playersError } = await supabase
    .from('tournament_players')
    .select('id, score, rating, wins, draws, losses, streak, last_active_at')
    .eq('tournament_id', tournament.id);

  if (playersError) {
    console.error('Failed to load tournament players', playersError);
    return jsonResponse(500, { error: 'players_lookup_failed' });
  }

  const sortedPlayers = [...(players ?? [])];
  if (system === 'swiss') {
    sortedPlayers.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      return ratingB - ratingA;
    });
  } else {
    sortedPlayers.sort((a, b) => {
      const lastA = a.last_active_at ? Date.parse(a.last_active_at) : 0;
      const lastB = b.last_active_at ? Date.parse(b.last_active_at) : 0;
      if (lastA !== lastB) return lastA - lastB;
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      return ratingB - ratingA;
    });
  }

  const pairingsToInsert: Database['public']['Tables']['pairings']['Insert'][] = [];
  let boardNumber = 1;
  const queue = [...sortedPlayers];

  while (queue.length >= 2) {
    const white = queue.shift()!;
    const black = queue.shift()!;
    pairingsToInsert.push({
      tournament_id: tournament.id,
      round: pairingRound,
      board: boardNumber,
      white_id: white.id,
      black_id: black.id,
      metadata: { system },
    });
    boardNumber += 1;
  }

  if (queue.length === 1) {
    const byePlayer = queue.shift()!;
    pairingsToInsert.push({
      tournament_id: tournament.id,
      round: pairingRound,
      board: boardNumber,
      white_id: byePlayer.id,
      black_id: null,
      metadata: { system, bye: true },
    });
  }

  if (pairingsToInsert.length === 0) {
    return jsonResponse(400, { error: 'not_enough_players' });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('pairings')
    .insert(pairingsToInsert)
    .select('id, white_id, black_id, board, round');

  if (insertError) {
    console.error('Failed to insert pairings', insertError);
    return jsonResponse(500, { error: 'pairing_creation_failed' });
  }

  await supabase
    .from('tournaments')
    .update({ current_round: Math.max(tournament.current_round ?? 0, pairingRound), status: 'ongoing' })
    .eq('id', tournament.id);

  return jsonResponse(200, {
    round: pairingRound,
    system,
    pairings: inserted ?? [],
  });
}

async function handleReportResult(req: Request, supabase: SupabaseClient) {
  const payload: ReportResultRequest = await req.json().catch(() => ({}));
  if (!payload.pairingId || !payload.outcome) {
    return jsonResponse(400, { error: 'invalid_payload' });
  }

  const { data: pairing, error: pairingError } = await supabase
    .from('pairings')
    .select('id, tournament_id, white_id, black_id, result_status, round')
    .eq('id', payload.pairingId)
    .maybeSingle();

  if (pairingError) {
    console.error('Failed to load pairing', pairingError);
    return jsonResponse(500, { error: 'pairing_lookup_failed' });
  }

  if (!pairing) {
    return jsonResponse(404, { error: 'pairing_not_found' });
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, is_rated')
    .eq('id', pairing.tournament_id)
    .maybeSingle();

  if (tournamentError) {
    console.error('Failed to load tournament for result', tournamentError);
    return jsonResponse(500, { error: 'tournament_lookup_failed' });
  }

  if (!tournament) {
    return jsonResponse(404, { error: 'tournament_not_found' });
  }

  const whitePlayer = pairing.white_id
    ? await supabase
        .from('tournament_players')
        .select('id, player_id, rating, score, wins, draws, losses, streak, flags')
        .eq('id', pairing.white_id)
        .maybeSingle()
    : { data: null, error: null };

  const blackPlayer = pairing.black_id
    ? await supabase
        .from('tournament_players')
        .select('id, player_id, rating, score, wins, draws, losses, streak, flags')
        .eq('id', pairing.black_id)
        .maybeSingle()
    : { data: null, error: null };

  if (whitePlayer.error || blackPlayer.error) {
    console.error('Failed to load players for result', whitePlayer.error ?? blackPlayer.error);
    return jsonResponse(500, { error: 'player_lookup_failed' });
  }

  const scores = scoreFromOutcome(payload.outcome);
  const whiteScore = sanitizeNumber(payload.whiteScore) ?? scores.white;
  const blackScore = sanitizeNumber(payload.blackScore) ?? scores.black;

  const sanitizedAccuracy = {
    white: sanitizeNumber(payload.accuracy?.white ?? null),
    black: sanitizeNumber(payload.accuracy?.black ?? null),
  };

  const whiteTimes = sanitizeTimes(payload.moveTimes?.white ?? []);
  const blackTimes = sanitizeTimes(payload.moveTimes?.black ?? []);

  const suspiciousAccuracyWhite = pairing.white_id
    ? await hasRepeatedHighAccuracy(supabase, pairing.tournament_id, pairing.white_id, sanitizedAccuracy.white)
    : false;
  const suspiciousAccuracyBlack = pairing.black_id
    ? await hasRepeatedHighAccuracy(supabase, pairing.tournament_id, pairing.black_id, sanitizedAccuracy.black)
    : false;

  const suspiciousTimingWhite = detectTimingAnomaly(whiteTimes, sanitizedAccuracy.white);
  const suspiciousTimingBlack = detectTimingAnomaly(blackTimes, sanitizedAccuracy.black);

  const flaggedPlayers: Array<{ tournamentPlayerId: string; playerId: string | null; reasons: string[] }> = [];

  if (pairing.white_id && (suspiciousAccuracyWhite || suspiciousTimingWhite)) {
    flaggedPlayers.push({
      tournamentPlayerId: pairing.white_id,
      playerId: whitePlayer.data?.player_id ?? null,
      reasons: [
        ...(suspiciousAccuracyWhite ? ['accuracy'] : []),
        ...(suspiciousTimingWhite ? ['timing'] : []),
      ],
    });
  }

  if (pairing.black_id && (suspiciousAccuracyBlack || suspiciousTimingBlack)) {
    flaggedPlayers.push({
      tournamentPlayerId: pairing.black_id,
      playerId: blackPlayer.data?.player_id ?? null,
      reasons: [
        ...(suspiciousAccuracyBlack ? ['accuracy'] : []),
        ...(suspiciousTimingBlack ? ['timing'] : []),
      ],
    });
  }

  const playerMetrics = {
    white: pairing.white_id
      ? {
          tournament_player_id: pairing.white_id,
          player_id: whitePlayer.data?.player_id ?? null,
          ...buildPlayerMetrics(whiteTimes, sanitizedAccuracy.white),
          suspicious: {
            accuracy: suspiciousAccuracyWhite,
            timing: suspiciousTimingWhite,
          },
        }
      : null,
    black: pairing.black_id
      ? {
          tournament_player_id: pairing.black_id,
          player_id: blackPlayer.data?.player_id ?? null,
          ...buildPlayerMetrics(blackTimes, sanitizedAccuracy.black),
          suspicious: {
            accuracy: suspiciousAccuracyBlack,
            timing: suspiciousTimingBlack,
          },
        }
      : null,
  };

  const ratingDiff: Record<string, number | null> = {};

  let whiteRatingUpdate: RatingOutcome = { newRating: whitePlayer.data?.rating ?? null, delta: null };
  let blackRatingUpdate: RatingOutcome = { newRating: blackPlayer.data?.rating ?? null, delta: null };

  if (tournament.is_rated && pairing.white_id && pairing.black_id) {
    whiteRatingUpdate = computeElo({
      rating: whitePlayer.data?.rating ?? null,
      opponentRating: blackPlayer.data?.rating ?? null,
      score: whiteScore,
    });

    blackRatingUpdate = computeElo({
      rating: blackPlayer.data?.rating ?? null,
      opponentRating: whitePlayer.data?.rating ?? null,
      score: blackScore,
    });

    ratingDiff.white = whiteRatingUpdate.delta;
    ratingDiff.black = blackRatingUpdate.delta;
  }

  const { data: resultRows, error: resultError } = await supabase
    .from('results')
    .insert({
      pairing_id: pairing.id,
      tournament_id: pairing.tournament_id,
      outcome: payload.outcome,
      white_score: whiteScore,
      black_score: blackScore,
      reported_by: payload.reportedBy ?? null,
      accuracy: {
        white: sanitizedAccuracy.white,
        black: sanitizedAccuracy.black,
      },
      move_times: {
        white: whiteTimes,
        black: blackTimes,
      },
      player_metrics: playerMetrics,
      suspicious_accuracy: suspiciousAccuracyWhite || suspiciousAccuracyBlack,
      suspicious_timing: suspiciousTimingWhite || suspiciousTimingBlack,
      flagged: flaggedPlayers.length > 0,
      notes: payload.notes ?? null,
      rating_diff: Object.keys(ratingDiff).length ? ratingDiff : null,
    })
    .select('id')
    .maybeSingle();

  if (resultError) {
    console.error('Failed to insert result', resultError);
    return jsonResponse(500, { error: 'result_creation_failed' });
  }

  const resultId = resultRows?.id ?? null;

  const whiteUpdate: Database['public']['Tables']['tournament_players']['Update'] = {};
  if (whitePlayer.data) {
    whiteUpdate.score = Number((whitePlayer.data.score + whiteScore).toFixed(2));
    whiteUpdate.wins = whitePlayer.data.wins + (payload.outcome === 'white' || payload.outcome === 'bye' ? 1 : 0);
    whiteUpdate.draws = whitePlayer.data.draws + (payload.outcome === 'draw' ? 1 : 0);
    whiteUpdate.losses = whitePlayer.data.losses + (payload.outcome === 'black' ? 1 : 0);
    whiteUpdate.streak = updateStreak(whitePlayer.data.streak, payload.outcome, 'white');
    whiteUpdate.last_active_at = new Date().toISOString();
    if (whiteRatingUpdate.newRating !== null && tournament.is_rated) {
      whiteUpdate.rating = whiteRatingUpdate.newRating;
    }
    if (flaggedPlayers.some((entry) => entry.tournamentPlayerId === pairing.white_id) && resultId) {
      const existingFlags = Array.isArray(whitePlayer.data.flags) ? [...(whitePlayer.data.flags as Json[])] : [];
      existingFlags.push({
        type: 'fair_play',
        pairing_id: pairing.id,
        result_id: resultId,
        created_at: new Date().toISOString(),
        reasons: flaggedPlayers.find((entry) => entry.tournamentPlayerId === pairing.white_id)?.reasons ?? [],
      });
      whiteUpdate.flags = existingFlags;
    }
  }

  const blackUpdate: Database['public']['Tables']['tournament_players']['Update'] = {};
  if (blackPlayer.data) {
    blackUpdate.score = Number((blackPlayer.data.score + blackScore).toFixed(2));
    blackUpdate.wins = blackPlayer.data.wins + (payload.outcome === 'black' ? 1 : 0);
    blackUpdate.draws = blackPlayer.data.draws + (payload.outcome === 'draw' ? 1 : 0);
    blackUpdate.losses = blackPlayer.data.losses + (payload.outcome === 'white' || payload.outcome === 'bye' ? 1 : 0);
    blackUpdate.streak = updateStreak(blackPlayer.data.streak, payload.outcome, 'black');
    blackUpdate.last_active_at = new Date().toISOString();
    if (blackRatingUpdate.newRating !== null && tournament.is_rated) {
      blackUpdate.rating = blackRatingUpdate.newRating;
    }
    if (flaggedPlayers.some((entry) => entry.tournamentPlayerId === pairing.black_id) && resultId) {
      const existingFlags = Array.isArray(blackPlayer.data.flags) ? [...(blackPlayer.data.flags as Json[])] : [];
      existingFlags.push({
        type: 'fair_play',
        pairing_id: pairing.id,
        result_id: resultId,
        created_at: new Date().toISOString(),
        reasons: flaggedPlayers.find((entry) => entry.tournamentPlayerId === pairing.black_id)?.reasons ?? [],
      });
      blackUpdate.flags = existingFlags;
    }
  }

  if (pairing.white_id && Object.keys(whiteUpdate).length > 0) {
    await supabase.from('tournament_players').update(whiteUpdate).eq('id', pairing.white_id);
  }

  if (pairing.black_id && Object.keys(blackUpdate).length > 0) {
    await supabase.from('tournament_players').update(blackUpdate).eq('id', pairing.black_id);
  }

  await supabase
    .from('pairings')
    .update({
      result_status: flaggedPlayers.length > 0 ? 'under_review' : 'validated',
      completed_at: new Date().toISOString(),
    })
    .eq('id', pairing.id);

  return jsonResponse(200, {
    resultId,
    flagged: flaggedPlayers,
    ratingDiff,
    suspicious: {
      accuracy: suspiciousAccuracyWhite || suspiciousAccuracyBlack,
      timing: suspiciousTimingWhite || suspiciousTimingBlack,
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  let supabase: SupabaseClient;
  try {
    supabase = buildSupabaseClient();
  } catch (error) {
    console.error('Failed to instantiate Supabase client', error);
    return jsonResponse(500, { error: 'configuration_error' });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.toLowerCase();

  try {
    if (pathname.endsWith('/generate')) {
      return await handleGeneratePairings(req, supabase);
    }

    if (pathname.endsWith('/report')) {
      return await handleReportResult(req, supabase);
    }

    return jsonResponse(404, { error: 'route_not_found' });
  } catch (error) {
    console.error('Unhandled error in pairings service', error);
    return jsonResponse(500, { error: 'unexpected_error' });
  }
});
