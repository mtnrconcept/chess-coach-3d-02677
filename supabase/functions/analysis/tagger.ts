import { Chess } from 'npm:chess.js';
import thresholdsConfig from './thresholds.json' assert { type: 'json' };

export type AnalysisTag =
  | 'ok'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'great';

export interface MultipvLine {
  move: string;
  pv: string[];
  evaluation: number;
  multipv: number;
}

export interface TaggableMove {
  ply: number;
  san: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  evaluationAfterPlayed: number;
  evaluationBest: number;
  multipvLines: MultipvLine[];
}

export interface TaggingOptions {
  playerElo?: number;
}

interface Thresholds {
  ok: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function getThresholds(elo?: number): Thresholds {
  if (!elo) {
    return thresholdsConfig.default as Thresholds;
  }

  for (const bracket of thresholdsConfig.brackets ?? []) {
    if (typeof bracket.maxElo === 'number' && elo <= bracket.maxElo) {
      return bracket.thresholds as Thresholds;
    }
  }

  return thresholdsConfig.default as Thresholds;
}

function classifyDelta(delta: number, thresholds: Thresholds): AnalysisTag {
  const absDelta = Math.abs(delta) / 100;
  if (absDelta < thresholds.ok) return 'ok';
  if (absDelta < thresholds.inaccuracy) return 'inaccuracy';
  if (absDelta < thresholds.mistake) return 'mistake';
  return 'blunder';
}

function evaluateMaterial(fen: string, color: 'w' | 'b'): number {
  const chess = new Chess(fen);
  return chess
    .board()
    .flat()
    .reduce((score, piece) => {
      if (!piece || piece.color !== color) return score;
      return score + (PIECE_VALUES[piece.type] ?? 0);
    }, 0);
}

function findLineForMove(lines: MultipvLine[], move: string): MultipvLine | undefined {
  return lines.find((line) => line.move === move);
}

function detectSacrifice(fenBefore: string, fenAfter: string, color: 'w' | 'b'): boolean {
  const beforeMaterial = evaluateMaterial(fenBefore, color);
  const afterMaterial = evaluateMaterial(fenAfter, color);
  return beforeMaterial - afterMaterial >= 4; // sacrifice of major piece
}

export function tagMove(move: TaggableMove, options: TaggingOptions = {}): AnalysisTag {
  const thresholds = getThresholds(options.playerElo);
  const delta = move.evaluationAfterPlayed - move.evaluationBest;
  const baseTag = classifyDelta(delta, thresholds);

  if (baseTag === 'ok' || baseTag === 'inaccuracy') {
    const playedLine = findLineForMove(move.multipvLines, move.san);
    if (playedLine && playedLine.multipv <= 2) {
      const sacrifice = detectSacrifice(move.fenBefore, move.fenAfter, move.color);
      if (sacrifice && Math.abs(delta) / 100 <= thresholds.ok) {
        const nextBest = move.multipvLines
          .filter((line) => line.multipv !== playedLine.multipv)
          .sort((a, b) => a.multipv - b.multipv)[0];
        if (!nextBest || playedLine.evaluation - nextBest.evaluation > thresholds.ok * 100) {
          return 'brilliant';
        }
      }
    }
  }

  if (baseTag !== 'blunder') {
    const bestLine = move.multipvLines.find((line) => line.multipv === 1);
    const playedLine = findLineForMove(move.multipvLines, move.san);
    if (bestLine && playedLine) {
      const isOnlyMove = move.multipvLines.every((line) =>
        line.multipv === playedLine.multipv || playedLine.evaluation - line.evaluation > thresholds.ok * 100,
      );
      const flipsEvaluation = Math.sign(move.evaluationBest) !== Math.sign(move.evaluationAfterPlayed);
      if ((isOnlyMove || flipsEvaluation) && Math.abs(delta) / 100 <= thresholds.ok) {
        return 'great';
      }
    }
  }

  if (
    baseTag === 'blunder' &&
    Math.sign(move.evaluationBest) !== Math.sign(move.evaluationAfterPlayed)
  ) {
    return 'blunder';
  }

  return baseTag;
}

export function tagMoves(moves: TaggableMove[], options: TaggingOptions = {}): AnalysisTag[] {
  return moves.map((move) => tagMove(move, options));
}
