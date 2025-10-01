import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { Chess } from 'npm:chess.js';
import { TextLineStream } from 'https://deno.land/std@0.224.0/streams/text_line_stream.ts';
import { tagMove, type AnalysisTag, type MultipvLine as TaggerMultipvLine } from './tagger.ts';

interface AnalysisRequest {
  pgn: string;
  depth?: number;
  multiPv?: number;
  accuracyForElo?: number;
}

interface EngineEvaluation {
  type: 'cp' | 'mate';
  value: number;
}

interface StockfishLine {
  multipv: number;
  move: string;
  pv: string[];
  evaluation: EngineEvaluation;
}

interface PositionAnalysis {
  bestMove: string;
  evaluation: EngineEvaluation;
  lines: StockfishLine[];
}

interface MovePayload {
  ply: number;
  san: string;
  fen_before: string;
  fen_after: string;
  eval_cp_before: number;
  eval_cp_after: number;
  eval_cp_best: number;
  best_move: string;
  pv: string[];
  delta_cp: number;
  tag: AnalysisTag;
}

interface AnalysisResponse {
  engine: string;
  depth: number;
  accuracy: number;
  summary: Record<string, unknown>;
  moves: MovePayload[];
}

class StockfishProcess {
  private process: Deno.ChildProcess;

  private stdoutQueue: string[] = [];

  private waiters: ((line: string) => void)[] = [];

  private closed = false;

  private writer: WritableStreamDefaultWriter<Uint8Array>;

  private encoder = new TextEncoder();

  constructor(private depth: number, private multiPv: number) {
    const binary = Deno.env.get('STOCKFISH_PATH') ?? './stockfish';
    const command = new Deno.Command(binary, {
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'null',
    });

    this.process = command.spawn();
    this.writer = this.process.stdin.getWriter();
    const reader = this.process.stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());
    this.consume(reader);
  }

  private async consume(stream: ReadableStream<string>) {
    for await (const line of stream) {
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift();
        waiter?.(line);
      } else {
        this.stdoutQueue.push(line);
      }
    }
    this.closed = true;
  }

  private async readLine(): Promise<string> {
    if (this.stdoutQueue.length > 0) {
      return this.stdoutQueue.shift() as string;
    }
    if (this.closed) {
      throw new Error('Stockfish process terminated unexpectedly');
    }
    return new Promise<string>((resolve) => this.waiters.push(resolve));
  }

  private async write(command: string) {
    await this.writer.write(this.encoder.encode(`${command}\n`));
  }

  async initialize() {
    await this.write('uci');
    let line = '';
    do {
      line = await this.readLine();
    } while (!line.includes('uciok'));
    await this.write(`setoption name MultiPV value ${this.multiPv}`);
    await this.write('isready');
    do {
      line = await this.readLine();
    } while (!line.includes('readyok'));
  }

  async analysePosition(fen: string): Promise<PositionAnalysis> {
    await this.write('ucinewgame');
    await this.write(`position fen ${fen}`);
    await this.write(`go depth ${this.depth}`);

    const lines: StockfishLine[] = [];
    let bestMove = '';
    let evaluation: EngineEvaluation = { type: 'cp', value: 0 };

    while (true) {
      const payload = await this.readLine();
      if (payload.startsWith('info') && payload.includes('multipv')) {
        const parsed = parseInfoLine(payload);
        if (parsed) {
          const existingIndex = lines.findIndex((line) => line.multipv === parsed.line.multipv);
          if (existingIndex >= 0) {
            lines[existingIndex] = parsed.line;
          } else {
            lines.push(parsed.line);
          }
          if (parsed.line.multipv === 1) {
            evaluation = parsed.evaluation;
          }
        }
      }
      if (payload.startsWith('bestmove')) {
        const match = payload.match(/bestmove (\S+)/);
        if (match) {
          bestMove = match[1];
        }
        break;
      }
    }

    return {
      bestMove,
      evaluation,
      lines: lines.sort((a, b) => a.multipv - b.multipv),
    };
  }

  async close() {
    try {
      await this.write('quit');
      await this.writer.close();
      await this.process.status;
    } catch (_) {
      // ignore errors on shutdown
    }
  }
}

function parseInfoLine(payload: string):
  | { line: StockfishLine; evaluation: EngineEvaluation }
  | null {
  const multipvMatch = payload.match(/ multipv (\d+)/);
  if (!multipvMatch) return null;
  const multipv = Number.parseInt(multipvMatch[1], 10);
  const evaluation = extractEvaluation(payload);
  if (!evaluation) return null;
  const pvMatch = payload.match(/ pv (.*)$/);
  if (!pvMatch) return null;
  const pv = pvMatch[1].trim().split(/\s+/);
  return {
    evaluation,
    line: {
      multipv,
      move: pv[0],
      pv,
      evaluation,
    },
  };
}

function extractEvaluation(payload: string): EngineEvaluation | null {
  const mateMatch = payload.match(/ mate (-?\d+)/);
  if (mateMatch) {
    return { type: 'mate', value: Number.parseInt(mateMatch[1], 10) };
  }
  const cpMatch = payload.match(/ cp (-?\d+)/);
  if (cpMatch) {
    return { type: 'cp', value: Number.parseInt(cpMatch[1], 10) };
  }
  return null;
}

function convertEvaluationToCentipawns(evaluation: EngineEvaluation, pov: 1 | -1): number {
  if (evaluation.type === 'mate') {
    const mateScore = evaluation.value > 0 ? 100000 : -100000;
    return mateScore * pov;
  }
  return evaluation.value * pov;
}

type VerboseMove = {
  color: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  promotion?: string;
};

function findMove(chess: Chess, uciMove: string): VerboseMove | undefined {
  const candidates = chess.moves({ verbose: true }) as VerboseMove[];
  return candidates.find((move) => {
    const promotion = move.promotion ? move.promotion : '';
    return `${move.from}${move.to}${promotion}` === uciMove;
  });
}

function uciToSan(chess: Chess, uciMove: string): string | undefined {
  return findMove(chess, uciMove)?.san;
}

function applyMove(chess: Chess, uciMove: string) {
  const move = findMove(chess, uciMove);
  if (move) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  } else {
    chess.move(uciMove, { sloppy: true });
  }
}

function buildChess(fen: string): Chess {
  const instance = new Chess();
  instance.load(fen);
  return instance;
}

function pvToSanSequence(fen: string, pv: string[]): string[] {
  const board = buildChess(fen);
  const sequence: string[] = [];
  for (const uci of pv) {
    const san = uciToSan(board, uci) ?? uci;
    sequence.push(san);
    applyMove(board, uci);
  }
  return sequence;
}

async function runAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
  const depth = request.depth ?? 20;
  const multiPv = request.multiPv ?? 3;
  const chess = new Chess();
  if (!chess.load_pgn(request.pgn)) {
    throw new Error('Invalid PGN payload');
  }

  const engine = new StockfishProcess(depth, multiPv);
  await engine.initialize();

  const movesVerbose = chess.history({ verbose: true }) as VerboseMove[];
  const headers = chess.header();
  const initialFen = headers.SetUp === '1' && headers.FEN ? (headers.FEN as string) : undefined;
  const analysisBoard = new Chess();
  if (initialFen) {
    analysisBoard.load(initialFen);
  } else {
    analysisBoard.reset();
  }

  const analyses: MovePayload[] = [];
  let ply = 1;

  for (const move of movesVerbose) {
    const beforeFen = analysisBoard.fen();
    const color = move.color as 'w' | 'b';
    const pov: 1 | -1 = color === 'w' ? 1 : -1;

    const beforeAnalysis = await engine.analysePosition(beforeFen);
    const bestLine = beforeAnalysis.lines[0];
    const evaluationBest = convertEvaluationToCentipawns(beforeAnalysis.evaluation, pov);

    const multipvLines: TaggerMultipvLine[] = beforeAnalysis.lines.map((line) => {
      const san = uciToSan(analysisBoard, line.pv[0]);
      return {
        multipv: line.multipv,
        move: san ?? line.pv[0],
        pv: line.pv,
        evaluation: convertEvaluationToCentipawns(line.evaluation, pov),
      };
    });

    analysisBoard.move({ from: move.from, to: move.to, promotion: move.promotion });
    const afterFen = analysisBoard.fen();

    const afterAnalysis = await engine.analysePosition(afterFen);
    const evaluationAfter = convertEvaluationToCentipawns(afterAnalysis.evaluation, pov);
    const afterBestLine = afterAnalysis.lines[0];

    if (!multipvLines.some((line) => line.move === move.san)) {
      const actualPv = [
        move.san,
        ...(afterBestLine ? pvToSanSequence(afterFen, afterBestLine.pv) : []),
      ];
      multipvLines.push({
        multipv: Number.MAX_SAFE_INTEGER,
        move: move.san,
        pv: actualPv,
        evaluation: evaluationAfter,
      });
    }

    const bestMoveUci = bestLine ? bestLine.pv[0] : beforeAnalysis.bestMove;
    const bestMoveSan = bestMoveUci
      ? ((): string => {
          const board = buildChess(beforeFen);
          return uciToSan(board, bestMoveUci) ?? bestMoveUci;
        })()
      : '';
    const pvSan = bestLine ? pvToSanSequence(beforeFen, bestLine.pv) : [];

    const delta = evaluationAfter - evaluationBest;
    const tag = tagMove(
      {
        ply,
        san: move.san,
        color,
        fenBefore: beforeFen,
        fenAfter: afterFen,
        evaluationAfterPlayed: evaluationAfter,
        evaluationBest,
        multipvLines,
      },
      { playerElo: request.accuracyForElo },
    );

    analyses.push({
      ply,
      san: move.san,
      fen_before: beforeFen,
      fen_after: afterFen,
      eval_cp_before: evaluationBest,
      eval_cp_after: evaluationAfter,
      eval_cp_best: evaluationBest,
      best_move: bestMoveSan ?? beforeAnalysis.bestMove,
      pv: pvSan,
      delta_cp: delta,
      tag,
    });

    ply += 1;
  }

  await engine.close();

  const accuracy = calculateAccuracy(analyses);

  return {
    engine: 'stockfish16',
    depth,
    accuracy,
    summary: buildSummary(analyses),
    moves: analyses,
  };
}

function calculateAccuracy(moves: MovePayload[]): number {
  if (moves.length === 0) return 100;
  const penalties = moves
    .map((move) => Math.min(1, Math.abs(move.delta_cp) / 300))
    .reduce((acc, cur) => acc + cur, 0);
  const accuracy = Math.max(0, 100 - (penalties / moves.length) * 100);
  return Number(accuracy.toFixed(2));
}

function buildSummary(moves: MovePayload[]): Record<string, unknown> {
  const buckets: Record<AnalysisTag, number> = {
    ok: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    brilliant: 0,
    great: 0,
  };
  for (const move of moves) {
    buckets[move.tag] += 1;
  }
  return {
    counts: buckets,
  };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const body = (await req.json()) as AnalysisRequest;
    const result = await runAnalysis(body);
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
