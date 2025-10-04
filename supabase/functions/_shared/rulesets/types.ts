export type MovePattern =
  | { pattern: "rook" | "bishop" | "queen" | "knight" | "king" | "pawn"; repeat?: number }
  | { action: "carry"; who: "pawn" | "any"; range: number; constraints?: string[] }
  | { action: "dash"; max: number; requires?: string[] }
  | {
      type: "move" | "capture";
      vectorsWhite: Array<[number, number]>;
      vectorsBlack: Array<[number, number]>;
      maxSteps?: number;
      requires?: string[];
    };

export interface PieceSpec {
  id: string;
  from?: "rook" | "bishop" | "queen" | "knight" | "king" | "pawn";
  side?: "white" | "black" | "both";
  moves: MovePattern[];
  spawn?: { promotesFrom?: string | null; count?: number; startSquares?: string[] };
  attributes?: Record<string, unknown>;
}

export interface EffectSpec {
  id: string;
  trigger: "onMove" | "onCapture" | "onHit" | "onTurnStart" | "onTurnEnd";
  target: "self" | "allyPiece" | "enemyPiece" | "square" | "any";
  durationTurns?: number;
  mod: Record<string, unknown>;
  conditions?: string[];
  priority?: number;
}

export interface RulesCore {
  turnOrder: "whiteThenBlack" | "simultaneous";
  checkRules: "classic" | "disabled" | "altX";
  promotion: Array<{ piece: string; to: string[] }>;
  winConditions: Array<{ type: "checkmate" | "timeout" | "stalemate" | "captureAll" | "custom"; params?: unknown }>;
  conflictPolicy: {
    onDuplicatePieceId: "error" | "rename";
    onMoveOverride: "replace" | "extend";
    onEffectCollision: "priorityHighWins" | "stack" | "error";
  };
}

export interface RuleTestStep {
  move?: string;
  by?: string;
  assert?: string;
  square?: string;
  piece?: string;
  side?: string;
  value?: unknown;
  illegal?: string;
  negate?: boolean;
}

export interface RuleTest {
  name: string;
  fen: string;
  script: RuleTestStep[];
}

export interface CompiledRuleset {
  meta: { name: string; base: string; version: string; description?: string; priority?: number };
  board: { size: "8x8" | "10x10"; zones: unknown[] };
  pieces: PieceSpec[];
  effects: EffectSpec[];
  rules: RulesCore;
  tests?: RuleTest[];
}

export type PatchOperation = "extend" | "replace" | "remove";

export interface RulePatch {
  op: PatchOperation;
  path: string;
  value?: unknown;
  priority?: number;
}

export interface RuleSpec {
  meta: {
    name: string;
    base: string;
    version: string;
    description?: string;
    priority?: number;
  };
  patches?: RulePatch[];
  tests?: RuleTest[];
}

export interface CompilationResult {
  compiled: CompiledRuleset;
  hash: string;
  warnings: string[];
}
