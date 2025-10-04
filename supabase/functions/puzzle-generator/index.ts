import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0?dts';

type PatternSeverity = 'info' | 'warning' | 'critical';

type PatternId =
  | 'hanging-piece'
  | 'material-drop'
  | 'fork-threat'
  | 'pin'
  | 'missed-mate'
  | 'mate-threat';

interface MovePattern {
  id: PatternId | string;
  severity?: PatternSeverity;
}

interface MoveRow {
  id: string;
  fen_before: string;
  pv: unknown;
  best_move: string | null;
  patterns: unknown;
  tag: string;
  san: string;
  created_at: string;
}

type PuzzleInsert = {
  fen: string;
  best_line: string[];
  theme: string[];
  source: string;
};

type Database = {
  public: {
    Tables: {
      moves: {
        Row: MoveRow;
        Insert: never;
        Update: never;
      };
      puzzles: {
        Row: {
          id: string;
          fen: string;
          best_line: unknown;
          theme: string[];
          source: string;
          created_at: string;
        };
        Insert: PuzzleInsert & { id?: string; created_at?: string };
        Update: Partial<PuzzleInsert> & { id?: string; created_at?: string };
      };
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const PATTERN_THEME_MAP: Record<PatternId, string> = {
  'fork-threat': 'fork',
  'pin': 'pin',
  'hanging-piece': 'hangingPiece',
  'material-drop': 'winMaterial',
  'missed-mate': 'mateAttack',
  'mate-threat': 'mateThreat',
};

const RELEVANT_PATTERN_IDS: Set<PatternId> = new Set(Object.keys(PATTERN_THEME_MAP) as PatternId[]);

function sanitizeSan(move: string): string {
  return move.replace(/[+#?!]/g, '').replace(/\s+/g, '').trim();
}

function parseBestLine(raw: unknown, fallback: string | null): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
      }
    } catch {
      // raw string that is not JSON – treat as single move
      if (raw.trim().length > 0) {
        return [raw.trim()];
      }
    }
  }

  if (fallback && fallback.trim().length > 0) {
    return [fallback.trim()];
  }

  return [];
}

function extractPatterns(raw: unknown): MovePattern[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const id = 'id' in entry ? (entry.id as string) : undefined;
        const severity = 'severity' in entry ? (entry.severity as PatternSeverity) : undefined;
        if (!id) return null;
        return { id, severity } as MovePattern;
      })
      .filter((entry): entry is MovePattern => entry !== null);
  }
  return [];
}

function detectMateTheme(line: string[]): string | null {
  const mateIndex = line.findIndex((move) => move.includes('#'));
  if (mateIndex === -1) return null;
  const playerMovesToMate = Math.floor(mateIndex / 2) + 1;
  return `mateIn${playerMovesToMate}`;
}

function deriveThemes(line: string[], patterns: MovePattern[]): string[] {
  const themes = new Set<string>();
  const mateTheme = detectMateTheme(line);
  if (mateTheme) {
    themes.add(mateTheme);
  }

  for (const pattern of patterns) {
    if (!RELEVANT_PATTERN_IDS.has(pattern.id as PatternId)) continue;
    const mapped = PATTERN_THEME_MAP[pattern.id as PatternId];
    if (mapped) {
      themes.add(mapped);
    }
  }

  return Array.from(themes);
}

function hasTacticalPattern(patterns: MovePattern[]): boolean {
  return patterns.some(
    (pattern) =>
      RELEVANT_PATTERN_IDS.has(pattern.id as PatternId) &&
      (pattern.severity === 'critical' || pattern.severity === 'warning'),
  );
}

function buildSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment configuration');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${supabaseServiceRoleKey}` } },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get('PUZZLE_GENERATOR_SECRET');
    const authHeader = req.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const supabase = buildSupabaseClient();

    const { data: movesData, error } = await supabase
      .from('moves')
      .select('id, fen_before, pv, best_move, patterns, tag, san, created_at')
      .in('tag', ['mistake', 'blunder'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Failed to fetch candidate moves', error);
      throw error;
    }

    type MoveRow = {
      id: string;
      fen_before: string;
      pv: string[];
      best_move: string;
      patterns: unknown;
      tag: string;
      san: string;
      created_at: string;
    };

    const moves = (movesData as unknown as MoveRow[]) ?? [];
    const candidates = moves.filter((move) => typeof move.fen_before === 'string' && move.fen_before.length > 0);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ processed: 0, inserted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const puzzles: PuzzleInsert[] = [];
    const seenFens = new Set<string>();

    for (const move of candidates) {
      const patterns = extractPatterns(move.patterns);
      const bestLine = parseBestLine(move.pv, move.best_move);
      if (bestLine.length === 0) {
        continue;
      }

      const sanitizedSolution = bestLine.map(sanitizeSan);
      const sanitizedPlayed = sanitizeSan(move.san);

      if (!sanitizedSolution[0] || sanitizedSolution[0] === sanitizedPlayed) {
        continue;
      }

      const mateTheme = detectMateTheme(bestLine);
      const hasPattern = hasTacticalPattern(patterns);
      if (!hasPattern && !mateTheme) {
        continue;
      }

      const themes = deriveThemes(bestLine, patterns);
      if (themes.length === 0) {
        continue;
      }

      if (seenFens.has(move.fen_before)) {
        continue;
      }

      seenFens.add(move.fen_before);
      puzzles.push({
        fen: move.fen_before,
        best_line: bestLine,
        theme: themes,
        source: 'own_game',
      });

      if (puzzles.length >= 25) {
        break;
      }
    }

    if (puzzles.length === 0) {
      return new Response(JSON.stringify({ processed: candidates.length, inserted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingData, error: existingError } = await supabase
      .from('puzzles')
      .select('fen')
      .in('fen', puzzles.map((puzzle) => puzzle.fen));

    if (existingError) {
      console.error('Failed to fetch existing puzzles', existingError);
      throw existingError;
    }

    type ExistingPuzzleRow = { fen: string };
    const existing = (existingData as unknown as ExistingPuzzleRow[]) ?? [];
    const existingFens = new Set(existing.map((entry) => entry.fen));
    const toInsert = puzzles.filter((puzzle) => !existingFens.has(puzzle.fen));

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({ processed: candidates.length, inserted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: insertError } = await supabase.from('puzzles').insert(toInsert);
    if (insertError) {
      console.error('Failed to insert puzzles', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ processed: candidates.length, inserted: toInsert.length }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('Puzzle generator error', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
