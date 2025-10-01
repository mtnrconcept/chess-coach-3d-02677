import { Chess } from 'chess.js';
import type {
  AnalysePositionParams,
  AnalysePositionResult,
  EngineHandle,
} from '@/engine/stockfishClient';
import { initEngine } from '@/engine/stockfishClient';
import { detectPatterns, type DetectedPattern } from '@/lib/analysis/patterns';
import { buildCoachMessage, type CoachMessage } from '@/lib/analysis/coachMessages';

export interface AnalyseGameRequest {
  pgn: string;
  depth?: number;
  multiPv?: number;
  accuracyForElo?: number;
  reviewMode?: 'auto' | 'local' | 'edge';
}

export interface MoveAnalysis {
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  evaluationBefore: number;
  evaluationAfter: number;
  bestMove: string;
  principalVariation: string[];
  delta: number;
  tag: AnalysisTag;
  patterns: DetectedPattern[];
  coach: CoachMessage;
}

export type AnalysisTag =
  | 'ok'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'great';

export interface AnalyseGameResponse {
  moves: MoveAnalysis[];
  accuracy: number;
  summary: Record<string, unknown>;
  engine: string;
  depth: number;
}

export interface AnalysisClientOptions {
  wasmUrl?: string;
  edgeFunctionUrl?: string;
  localMoveTimeMs?: number;
  shortGamePlyThreshold?: number;
}

const DEFAULT_OPTIONS: Required<AnalysisClientOptions> = {
  wasmUrl: '/engines/stockfish.wasm',
  edgeFunctionUrl: '/functions/v1/analysis',
  localMoveTimeMs: 120,
  shortGamePlyThreshold: 80,
};

type Thresholds = {
  ok: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
};

const LOCAL_THRESHOLDS: { default: Thresholds; brackets: Array<{ maxElo: number; thresholds: Thresholds }> } = {
  default: { ok: 0.15, inaccuracy: 0.6, mistake: 1.8, blunder: 3.5 },
  brackets: [
    { maxElo: 1200, thresholds: { ok: 0.2, inaccuracy: 0.8, mistake: 2.2, blunder: 4.0 } },
    { maxElo: 1600, thresholds: { ok: 0.18, inaccuracy: 0.7, mistake: 2.0, blunder: 3.8 } },
    { maxElo: 2000, thresholds: { ok: 0.16, inaccuracy: 0.65, mistake: 1.9, blunder: 3.6 } },
  ],
};

type VerboseMove = {
  color: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  promotion?: string;
};

function resolveThresholds(elo?: number): Thresholds {
  if (!elo) return LOCAL_THRESHOLDS.default;
  for (const bracket of LOCAL_THRESHOLDS.brackets) {
    if (elo <= bracket.maxElo) {
      return bracket.thresholds;
    }
  }
  return LOCAL_THRESHOLDS.default;
}

function classifyDelta(deltaPawns: number, thresholds: Thresholds): AnalysisTag {
  const absDelta = Math.abs(deltaPawns);
  if (absDelta < thresholds.ok) return 'ok';
  if (absDelta < thresholds.inaccuracy) return 'inaccuracy';
  if (absDelta < thresholds.mistake) return 'mistake';
  if (absDelta < thresholds.blunder) return 'blunder';
  return 'blunder';
}

function buildBoard(fen: string): Chess {
  const board = new Chess();
  const loaded = board.load(fen);
  if (!loaded) {
    board.reset();
  }
  return board;
}

function findMove(board: Chess, uci: string): VerboseMove | undefined {
  const moves = board.moves({ verbose: true }) as VerboseMove[];
  return moves.find((move) => {
    const promotion = move.promotion ? move.promotion : '';
    return `${move.from}${move.to}${promotion}` === uci;
  });
}

function applyMove(board: Chess, uci: string) {
  const move = findMove(board, uci);
  if (move) {
    board.move({ from: move.from, to: move.to, promotion: move.promotion });
  } else {
    board.move(uci, { sloppy: true });
  }
}

function pvToSanSequence(fen: string, pv: string[]): string[] {
  const board = buildBoard(fen);
  const sequence: string[] = [];
  for (const uci of pv) {
    const move = findMove(board, uci);
    sequence.push(move?.san ?? uci);
    applyMove(board, uci);
  }
  return sequence;
}

export class AnalysisClient {
  private options: Required<AnalysisClientOptions>;

  private enginePromise: Promise<EngineHandle> | null = null;

  constructor(options?: AnalysisClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async analyseGame(request: AnalyseGameRequest): Promise<AnalyseGameResponse> {
    const mode = this.resolveMode(request);
    if (mode === 'local') {
      return this.analyseGameLocally(request);
    }
    return this.analyseGameViaEdge(request);
  }

  private resolveMode(request: AnalyseGameRequest): 'local' | 'edge' {
    if (request.reviewMode && request.reviewMode !== 'auto') {
      return request.reviewMode;
    }
    const chess = new Chess();
    chess.load_pgn(request.pgn);
    const plyCount = chess.history({ verbose: true }).length;
    return plyCount <= this.options.shortGamePlyThreshold ? 'local' : 'edge';
  }

  private async getEngine(): Promise<EngineHandle> {
    if (!this.enginePromise) {
      this.enginePromise = initEngine(this.options.wasmUrl);
    }
    return this.enginePromise;
  }

  private async analyseGameLocally(request: AnalyseGameRequest): Promise<AnalyseGameResponse> {
    const chess = new Chess();
    if (!chess.load_pgn(request.pgn)) {
      throw new Error('Invalid PGN provided for analysis');
    }
    const engine = await this.getEngine();
    const verboseMoves = chess.history({ verbose: true }) as VerboseMove[];
    const headers = chess.header();
    const initialFen = headers.SetUp === '1' && headers.FEN ? (headers.FEN as string) : undefined;
    const analysisBoard = new Chess();
    if (initialFen) {
      analysisBoard.load(initialFen);
    } else {
      analysisBoard.reset();
    }

    const analyses: MoveAnalysis[] = [];
    let ply = 1;
    for (const move of verboseMoves) {
      const beforeFen = analysisBoard.fen();
      const povSign = move.color === 'w' ? 1 : -1;

      const baseAnalysis = await this.analysePosition(engine, {
        fen: beforeFen,
        movetimeMs: this.options.localMoveTimeMs,
        multiPv: request.multiPv ?? 3,
      });

      analysisBoard.move({ from: move.from, to: move.to, promotion: move.promotion });
      const afterFen = analysisBoard.fen();

      const followupAnalysis = await this.analysePosition(engine, {
        fen: afterFen,
        movetimeMs: this.options.localMoveTimeMs,
        multiPv: request.multiPv ?? 1,
      });

      const evaluationBefore = this.evaluationToCentipawns(baseAnalysis.evaluation, povSign);
      const evaluationAfter = this.evaluationToCentipawns(followupAnalysis.evaluation, povSign);
      const bestLine = baseAnalysis.lines.find((line) => line.multipv === 1) ?? baseAnalysis.lines[0];
      const principalVariation = bestLine ? pvToSanSequence(beforeFen, bestLine.pv) : [];
      let bestMove = baseAnalysis.bestMove;
      if (bestLine) {
        bestMove = principalVariation[0] ?? findMove(buildBoard(beforeFen), bestLine.pv[0])?.san ?? bestLine.pv[0];
      } else if (bestMove) {
        bestMove = findMove(buildBoard(beforeFen), bestMove)?.san ?? bestMove;
      }
      const delta = evaluationAfter - evaluationBefore;
      const followupBestLine =
        followupAnalysis.lines.find((line) => line.multipv === 1) ?? followupAnalysis.lines[0];
      const mateInBefore =
        bestLine && bestLine.evaluation.type === 'mate' && bestLine.evaluation.value > 0
          ? bestLine.evaluation.value
          : null;
      const mateInAgainst =
        followupBestLine && followupBestLine.evaluation.type === 'mate' && followupBestLine.evaluation.value > 0
          ? followupBestLine.evaluation.value
          : null;
      const patterns = detectPatterns({
        color: move.color,
        fenBefore: beforeFen,
        fenAfter: afterFen,
        evaluationBefore,
        evaluationAfter,
        delta,
        mateInBefore,
        mateInAgainst,
      });
      const tag = classifyDelta(delta / 100, resolveThresholds(request.accuracyForElo));
      const coach = buildCoachMessage({ tag, delta, san: move.san, bestMove, patterns });

      analyses.push({
        ply,
        san: move.san,
        fenBefore: beforeFen,
        fenAfter: afterFen,
        evaluationBefore,
        evaluationAfter,
        bestMove,
        principalVariation,
        delta,
        tag,
        patterns,
        coach,
      });
      ply += 1;
    }

    return {
      moves: analyses,
      accuracy: this.estimateAccuracy(analyses),
      summary: {},
      engine: 'stockfish-wasm',
      depth: 0,
    };
  }

  private async analyseGameViaEdge(request: AnalyseGameRequest): Promise<AnalyseGameResponse> {
    const response = await fetch(this.options.edgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Edge analysis failed with status ${response.status}`);
    }

    const payload = await response.json();
    const moves = (payload.moves ?? []) as Array<{
      ply: number;
      san: string;
      fen_before: string;
      fen_after: string;
      eval_cp_before: number;
      eval_cp_after: number;
      best_move: string;
      pv: string[];
      delta_cp: number;
      tag: AnalysisTag;
      patterns?: DetectedPattern[];
    }>;

    return {
      moves: moves.map((move) => ({
        ply: move.ply,
        san: move.san,
        fenBefore: move.fen_before,
        fenAfter: move.fen_after,
        evaluationBefore: move.eval_cp_before,
        evaluationAfter: move.eval_cp_after,
        bestMove: move.best_move,
        principalVariation: move.pv,
        delta: move.delta_cp,
        tag: move.tag,
        patterns: move.patterns ?? [],
        coach: buildCoachMessage({
          tag: move.tag,
          delta: move.delta_cp,
          san: move.san,
          bestMove: move.best_move,
          patterns: move.patterns ?? [],
        }),
      })),
      accuracy: payload.accuracy ?? 0,
      summary: payload.summary ?? {},
      engine: payload.engine ?? 'stockfish16',
      depth: payload.depth ?? request.depth ?? 0,
    };
  }

  private async analysePosition(
    engine: EngineHandle,
    params: AnalysePositionParams,
  ): Promise<AnalysePositionResult> {
    return engine.analysePosition(params);
  }

  private evaluationToCentipawns(evaluation: AnalysePositionResult['evaluation'], povSign: number): number {
    if (evaluation.type === 'mate') {
      const mateScore = evaluation.value > 0 ? 100000 : -100000;
      return mateScore * povSign;
    }
    return evaluation.value * povSign;
  }

  private estimateAccuracy(moves: MoveAnalysis[]): number {
    if (moves.length === 0) return 100;
    const penalties = moves
      .map((move) => Math.min(1, Math.abs(move.delta) / 300))
      .reduce((acc, penalty) => acc + penalty, 0);
    const accuracy = Math.max(0, 100 - (penalties / moves.length) * 100);
    return Number(accuracy.toFixed(2));
  }
}

export const analysisClient = new AnalysisClient();
