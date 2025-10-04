import { Chess, type PieceSymbol } from 'npm:chess.js';

export type PatternId =
  | 'hanging-piece'
  | 'material-drop'
  | 'fork-threat'
  | 'pin'
  | 'missed-mate'
  | 'mate-threat';

export type PatternSeverity = 'info' | 'warning' | 'critical';

export interface DetectedPattern {
  id: PatternId;
  severity: PatternSeverity;
  data?: Record<string, unknown>;
}

export interface PatternDetectionContext {
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  evaluationBefore: number;
  evaluationAfter: number;
  delta: number;
  mateInBefore?: number | null;
  mateInAgainst?: number | null;
}

interface VerboseMove {
  color: 'w' | 'b';
  from: string;
  to: string;
  san: string;
  flags: string;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const KNIGHT_OFFSETS: Array<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const ROOK_DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const BISHOP_DIRECTIONS: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function coordsToSquare(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }
  return `${FILES[file]}${rank + 1}`;
}

function squareToCoords(square: string): { file: number; rank: number } {
  const file = FILES.indexOf(square[0] as typeof FILES[number]);
  const rank = Number.parseInt(square[1] ?? '1', 10) - 1;
  return { file, rank };
}

function evaluateMaterial(fen: string, color: 'w' | 'b'): number {
  const board = new Chess(fen);
  let total = 0;
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      try {
        const piece = board.get(square as any);
        if (piece && piece.color === color) {
          total += PIECE_VALUES[piece.type];
        }
      } catch {
        continue;
      }
    }
  }
  return total;
}

function changeTurn(fen: string, color: 'w' | 'b'): string {
  const parts = fen.split(' ');
  if (parts.length >= 2) {
    parts[1] = color;
  }
  return parts.join(' ');
}

function detectMaterialDrop(context: PatternDetectionContext): DetectedPattern | null {
  const before = evaluateMaterial(context.fenBefore, context.color);
  const after = evaluateMaterial(context.fenAfter, context.color);
  const loss = before - after;
  if (loss >= 3) {
    return {
      id: 'material-drop',
      severity: 'critical',
      data: { lost: loss },
    };
  }
  if (loss >= 1.5 && context.delta < -100) {
    return {
      id: 'material-drop',
      severity: 'warning',
      data: { lost: loss },
    };
  }
  return null;
}

function detectHangingPiece(context: PatternDetectionContext): DetectedPattern | null {
  const opponentBoard = new Chess(context.fenAfter);
  const opponentMoves = opponentBoard.moves({ verbose: true }) as VerboseMove[];
  const captureTargets = new Map<string, VerboseMove[]>();

  for (const move of opponentMoves) {
    if (move.flags.includes('c') || move.flags.includes('e')) {
      const existing = captureTargets.get(move.to) ?? [];
      existing.push(move);
      captureTargets.set(move.to, existing);
    }
  }

  if (captureTargets.size === 0) return null;

  const defendersBoard = new Chess(changeTurn(context.fenAfter, context.color));
  const defenderMoves = defendersBoard.moves({ verbose: true }) as VerboseMove[];

  let candidate: {
    square: string;
    move: VerboseMove;
    piece: PieceSymbol;
    value: number;
  } | null = null;

  for (const [square, moves] of captureTargets.entries()) {
    const piece = opponentBoard.get(square as any);
    if (!piece || piece.color !== context.color) continue;
    const defenders = defenderMoves.filter((move) => move.to === square);
    if (defenders.length > 0) continue;
    const value = PIECE_VALUES[piece.type];
    if (value === 0) continue;
    if (!candidate || value > candidate.value) {
      candidate = { square, move: moves[0], piece: piece.type, value };
    }
  }

  if (!candidate) return null;

  return {
    id: 'hanging-piece',
    severity: candidate.value >= 3 ? 'critical' : 'warning',
    data: {
      square: candidate.square,
      piece: candidate.piece,
      attackerFrom: candidate.move.from,
    },
  };
}

function detectForkThreat(context: PatternDetectionContext): DetectedPattern | null {
  const board = new Chess(context.fenAfter);
  const opponent = context.color === 'w' ? 'b' : 'w';
  const threats: Array<{ attacker: string; targets: Array<{ square: string; piece: PieceSymbol; value: number }> }> = [];

  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const piece = board.get(square as any);
      if (!piece || piece.color !== opponent || piece.type !== 'n') continue;
      const { file: knightFile, rank: knightRank } = squareToCoords(square);
      const targets: Array<{ square: string; piece: PieceSymbol; value: number }> = [];
      for (const [df, dr] of KNIGHT_OFFSETS) {
        const targetSquare = coordsToSquare(knightFile + df, knightRank + dr);
        if (!targetSquare) continue;
        const targetPiece = board.get(targetSquare as any);
        if (!targetPiece || targetPiece.color !== context.color) continue;
        const value = PIECE_VALUES[targetPiece.type];
        if (value < 3 && targetPiece.type !== 'k') continue;
        targets.push({ square: targetSquare, piece: targetPiece.type, value });
      }
      if (targets.length >= 2) {
        threats.push({ attacker: square, targets });
      }
    }
  }

  if (threats.length === 0) return null;

  const mostSevere = threats.reduce((best, current) => {
    const bestValue = best.targets.reduce((sum, target) => sum + target.value, 0);
    const currentValue = current.targets.reduce((sum, target) => sum + target.value, 0);
    return currentValue > bestValue ? current : best;
  });

  const severity = mostSevere.targets.some((target) => target.piece === 'q' || target.piece === 'k' || target.value >= 5)
    ? 'critical'
    : 'warning';

  return {
    id: 'fork-threat',
    severity,
    data: {
      attacker: mostSevere.attacker,
      targets: mostSevere.targets.map((target) => ({ square: target.square, piece: target.piece })),
    },
  };
}

function detectPinnedPieces(context: PatternDetectionContext): DetectedPattern | null {
  const board = new Chess(context.fenAfter);
  let kingSquare: string | null = null;
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const piece = board.get(square as any);
      if (piece && piece.color === context.color && piece.type === 'k') {
        kingSquare = square;
      }
    }
  }
  if (!kingSquare) return null;

  const pinned: Array<{ square: string; piece: PieceSymbol; attacker: string }> = [];
  const { file: kingFile, rank: kingRank } = squareToCoords(kingSquare);

  const scanDirections = (
    directions: Array<[number, number]>,
    attackerTypes: PieceSymbol[],
  ) => {
    for (const [df, dr] of directions) {
      let step = 1;
      let candidate: { square: string; piece: PieceSymbol } | null = null;
      while (true) {
        const target = coordsToSquare(kingFile + df * step, kingRank + dr * step);
        if (!target) break;
        const occupant = board.get(target as any);
        if (!occupant) {
          step += 1;
          continue;
        }
        if (occupant.color === context.color) {
          if (candidate) break;
          if (occupant.type === 'k') break;
          candidate = { square: target, piece: occupant.type };
          step += 1;
          continue;
        }
        if (candidate && attackerTypes.includes(occupant.type)) {
          pinned.push({ square: candidate.square, piece: candidate.piece, attacker: target });
        }
        break;
      }
    }
  };

  scanDirections(ROOK_DIRECTIONS, ['r', 'q']);
  scanDirections(BISHOP_DIRECTIONS, ['b', 'q']);

  if (pinned.length === 0) return null;

  const mostValuable = pinned.reduce((best, current) =>
    PIECE_VALUES[current.piece] > PIECE_VALUES[best.piece] ? current : best,
  pinned[0]);

  return {
    id: 'pin',
    severity: PIECE_VALUES[mostValuable.piece] >= 5 ? 'critical' : 'warning',
    data: {
      square: mostValuable.square,
      piece: mostValuable.piece,
      attacker: mostValuable.attacker,
    },
  };
}

function detectMissedMate(context: PatternDetectionContext): DetectedPattern | null {
  if (!context.mateInBefore || context.mateInBefore <= 0) {
    return null;
  }
  if (Math.abs(context.evaluationAfter) >= 90000) {
    return null;
  }
  return {
    id: 'missed-mate',
    severity: context.mateInBefore <= 2 ? 'critical' : 'warning',
    data: { mateIn: context.mateInBefore },
  };
}

function detectMateThreat(context: PatternDetectionContext): DetectedPattern | null {
  if (!context.mateInAgainst || context.mateInAgainst <= 0) {
    return null;
  }
  return {
    id: 'mate-threat',
    severity: context.mateInAgainst <= 3 ? 'critical' : 'warning',
    data: { mateIn: context.mateInAgainst },
  };
}

export function detectPatterns(context: PatternDetectionContext): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const material = detectMaterialDrop(context);
  if (material) patterns.push(material);
  const hanging = detectHangingPiece(context);
  if (hanging) patterns.push(hanging);
  const fork = detectForkThreat(context);
  if (fork) patterns.push(fork);
  const pin = detectPinnedPieces(context);
  if (pin) patterns.push(pin);
  const missedMate = detectMissedMate(context);
  if (missedMate) patterns.push(missedMate);
  const mateThreat = detectMateThreat(context);
  if (mateThreat) patterns.push(mateThreat);
  return patterns;
}
