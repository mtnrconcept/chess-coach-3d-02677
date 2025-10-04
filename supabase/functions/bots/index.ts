import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { Chess } from 'npm:chess.js';
import type { Move as ChessJsMove } from 'npm:chess.js';
import { BOT_PROFILES, getProfileById } from './profiles.ts';
import {
  analyseWithEngine,
  applyUciMove,
  pvToSanSequence,
  selectBookMove,
} from './play.ts';
import type { BotProfileConfig, MultipvLine, SelectedBookMove } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewSessionRequest {
  botId?: string;
}

interface BotMoveRequest {
  botId?: string;
  sessionId?: string;
  moves?: string[];
  initialFen?: string;
}

interface MovePayload {
  from: string;
  to: string;
  san: string;
  uci: string;
  lan?: string;
  promotion?: string | null;
}

interface MoveAnalysisPayload {
  source: 'book' | 'engine';
  evaluation: { type: 'cp' | 'mate'; value: number } | null;
  principalVariation: string[];
  principalVariationSan: string[];
  multipv?: MultipvLine[];
  bookLine?: { name?: string; moves?: string[] };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeProfile(profile: BotProfileConfig) {
  const { style, book, ...rest } = profile;
  const { engine, ...publicStyle } = style;
  return { ...rest, style: publicStyle, book };
}

function buildMovePayload(move: ChessJsMove): MovePayload {
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    uci,
    lan: move.lan,
    promotion: move.promotion ?? null,
  };
}

function validateHistory(moves: string[] = [], initialFen?: string) {
  const board = new Chess();
  if (initialFen) {
    try {
      board.load(initialFen);
    } catch {
      throw new Error('Invalid initial FEN provided');
    }
  }

  for (const san of moves) {
    try {
      board.move(san);
    } catch {
      throw new Error(`Invalid SAN move in history: ${san}`);
    }
  }

  return board;
}

function buildBookAnalysis(selected: SelectedBookMove | null): MoveAnalysisPayload {
  return {
    source: 'book',
    evaluation: null,
    principalVariation: [],
    principalVariationSan: [],
    bookLine: selected?.line ? { name: selected.line.name, moves: selected.line.moves } : undefined,
  };
}

function buildEngineAnalysis(
  fen: string,
  chosen: MultipvLine,
  lines: MultipvLine[],
): MoveAnalysisPayload {
  return {
    source: 'engine',
    evaluation: chosen.evaluation,
    principalVariation: chosen.pv,
    principalVariationSan: pvToSanSequence(fen, chosen.pv),
    multipv: lines,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { pathname } = new URL(req.url);

  try {
    if (req.method === 'GET' && pathname.endsWith('/profiles')) {
      return jsonResponse(200, { bots: BOT_PROFILES.map(sanitizeProfile) });
    }

    if (req.method === 'POST' && pathname.endsWith('/new')) {
      const payload: NewSessionRequest = await req.json().catch(() => ({}));
      const botId = payload.botId ?? BOT_PROFILES[0]?.id;
      if (!botId) {
        return jsonResponse(400, { error: 'no_bot_available' });
      }
      const profile = getProfileById(botId);
      if (!profile) {
        return jsonResponse(404, { error: 'bot_not_found' });
      }

      return jsonResponse(200, {
        sessionId: crypto.randomUUID(),
        bot: sanitizeProfile(profile),
      });
    }

    if (req.method === 'POST' && pathname.endsWith('/move')) {
      const payload: BotMoveRequest = await req.json().catch(() => ({}));
      if (!payload.botId) {
        return jsonResponse(400, { error: 'missing_bot_id' });
      }
      const profile = getProfileById(payload.botId);
      if (!profile) {
        return jsonResponse(404, { error: 'bot_not_found' });
      }

      const history = Array.isArray(payload.moves)
        ? payload.moves.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const board = validateHistory(history, payload.initialFen);
      const fenBefore = board.fen();

      if (board.isGameOver()) {
        return jsonResponse(200, {
          status: 'game_over',
          reason: board.isCheckmate() ? 'checkmate' : board.isDraw() ? 'draw' : 'finished',
          fen: fenBefore,
        });
      }

      const bookMove = selectBookMove(profile.book, history);
      if (bookMove) {
        const bookBoard = new Chess();
        bookBoard.load(fenBefore);
        try {
          const bookMoveResult = bookBoard.move(bookMove.move);
          return jsonResponse(200, {
            sessionId: payload.sessionId ?? null,
            botId: profile.id,
            fenBefore,
            fenAfter: bookBoard.fen(),
            move: buildMovePayload(bookMoveResult),
            analysis: buildBookAnalysis(bookMove),
          });
        } catch {
          console.warn(`Book move ${bookMove.move} invalid for ${fenBefore}, fallback to engine.`);
        }
      }

      const { lines, chosen } = await analyseWithEngine(profile, fenBefore);
      const { board: afterBoard, move } = applyUciMove(fenBefore, chosen.move);
      const analysis = buildEngineAnalysis(fenBefore, chosen, lines);

      return jsonResponse(200, {
        sessionId: payload.sessionId ?? null,
        botId: profile.id,
        fenBefore,
        fenAfter: afterBoard.fen(),
        move: buildMovePayload(move),
        analysis,
      });
    }

    return jsonResponse(404, { error: 'not_found' });
  } catch (error) {
    console.error('bots function error', error);
    return jsonResponse(500, {
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'unexpected',
    });
  }
});
