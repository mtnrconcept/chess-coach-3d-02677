export type EvaluationType = 'cp' | 'mate';

export interface EngineEvaluation {
  type: EvaluationType;
  value: number;
}

export interface EngineRandomnessConfig {
  candidateWeights: number[];
  maxDeltaCentipawns: number;
}

export interface EngineLimitsConfig {
  moveTimeMs?: number;
  nodes?: number;
  depth?: number;
}

export interface EngineConfig {
  skillLevel?: number;
  uciElo?: number;
  limitStrength?: boolean;
  multiPv?: number;
  contempt?: number;
  threads?: number;
  hash?: number;
  randomness?: EngineRandomnessConfig;
  limits?: EngineLimitsConfig;
}

export interface BookLine {
  name?: string;
  moves: string[];
  weight?: number;
}

export interface OpeningBook {
  lines: BookLine[];
}

export interface SelectedBookMove {
  move: string;
  line?: BookLine;
}

export interface BotStyle {
  label: string;
  personality: string;
  description: string;
  traits: string[];
  engine?: EngineConfig;
}

export interface BotProfileConfig {
  id: string;
  name: string;
  elo_target: number;
  style: BotStyle;
  book: OpeningBook;
}

export interface MultipvLine {
  multipv: number;
  move: string;
  pv: string[];
  evaluation: EngineEvaluation;
}

export interface BotMoveSelection {
  lines: MultipvLine[];
  chosen: MultipvLine;
}
