import { TextLineStream } from 'https://deno.land/std@0.224.0/streams/text_line_stream.ts';
import { Chess } from 'npm:chess.js';
import {
  type BookLine,
  type BotMoveSelection,
  type BotProfileConfig,
  type EngineConfig,
  type EngineEvaluation,
  type EngineRandomnessConfig,
  type MultipvLine,
  type OpeningBook,
  type SelectedBookMove,
} from './types.ts';

const DEFAULT_LIMITS = Object.freeze({ moveTimeMs: 1000 });
const DEFAULT_MULTIPV = 3;

class StockfishProcess {
  private process: Deno.ChildProcess;

  private stdoutQueue: string[] = [];

  private waiters: Array<(line: string) => void> = [];

  private closed = false;

  private writer: WritableStreamDefaultWriter<Uint8Array>;

  private readonly encoder = new TextEncoder();

  constructor(private readonly engine: EngineConfig) {
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
    void this.consume(reader);
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

  private async setOption(name: string, value: string | number | boolean) {
    const formatted = typeof value === 'boolean' ? (value ? 'true' : 'false') : `${value}`;
    await this.write(`setoption name ${name} value ${formatted}`);
  }

  async initialize() {
    await this.write('uci');
    let line = '';
    do {
      line = await this.readLine();
    } while (!line.includes('uciok'));

    const multiPv = this.engine.multiPv ?? DEFAULT_MULTIPV;
    await this.setOption('MultiPV', Math.max(1, multiPv));

    if (typeof this.engine.skillLevel === 'number') {
      await this.setOption('Skill Level', this.engine.skillLevel);
    }
    if (typeof this.engine.uciElo === 'number') {
      await this.setOption('UCI_Elo', this.engine.uciElo);
    }
    if (typeof this.engine.limitStrength === 'boolean') {
      await this.setOption('UCI_LimitStrength', this.engine.limitStrength);
    }
    if (typeof this.engine.contempt === 'number') {
      await this.setOption('Contempt', this.engine.contempt);
    }
    if (typeof this.engine.threads === 'number') {
      await this.setOption('Threads', this.engine.threads);
    }
    if (typeof this.engine.hash === 'number') {
      await this.setOption('Hash', this.engine.hash);
    }

    await this.write('isready');
    do {
      line = await this.readLine();
    } while (!line.includes('readyok'));
  }

  async analysePosition(fen: string): Promise<MultipvLine[]> {
    await this.write('ucinewgame');
    await this.write(`position fen ${fen}`);

    const limits = this.engine.limits ?? DEFAULT_LIMITS;
    if ('nodes' in limits && limits.nodes) {
      await this.write(`go nodes ${limits.nodes}`);
    } else if ('moveTimeMs' in limits && limits.moveTimeMs) {
      await this.write(`go movetime ${limits.moveTimeMs}`);
    } else if ('depth' in limits && limits.depth) {
      await this.write(`go depth ${limits.depth}`);
    } else {
      await this.write(`go movetime ${DEFAULT_LIMITS.moveTimeMs}`);
    }

    const lines = new Map<number, MultipvLine>();

    while (true) {
      const payload = await this.readLine();
      if (payload.startsWith('info') && payload.includes('multipv')) {
        const parsed = parseInfoLine(payload);
        if (parsed) {
          lines.set(parsed.multipv, parsed);
        }
      }
      if (payload.startsWith('bestmove')) {
        const match = payload.match(/bestmove (\S+)/);
        if (match && !lines.has(1)) {
          lines.set(1, {
            multipv: 1,
            move: match[1],
            pv: [match[1]],
            evaluation: { type: 'cp', value: 0 },
          });
        }
        break;
      }
    }

    return Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv);
  }

  async dispose() {
    try {
      await this.write('quit');
    } catch (_) {
      // ignore errors when quitting
    }
    try {
      await this.writer.close();
    } catch (_) {
      // ignore close errors
    }
    try {
      this.process.kill('SIGTERM');
    } catch (_) {
      // ignore if already closed
    }
  }
}

function parseInfoLine(payload: string): MultipvLine | null {
  const multipvMatch = payload.match(/ multipv (\d+)/);
  if (!multipvMatch) return null;
  const multipv = Number.parseInt(multipvMatch[1], 10);

  const evaluation = extractEvaluation(payload);
  if (!evaluation) return null;

  const pvMatch = payload.match(/ pv (.*)$/);
  if (!pvMatch) return null;
  const pv = pvMatch[1].trim().split(/\s+/);
  if (pv.length === 0) return null;

  return {
    multipv,
    move: pv[0],
    pv,
    evaluation,
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

function evaluationToCentipawns(evaluation: EngineEvaluation): number {
  if (evaluation.type === 'mate') {
    return evaluation.value > 0 ? 100000 : -100000;
  }
  return evaluation.value;
}

function chooseCandidate(lines: MultipvLine[], randomness?: EngineRandomnessConfig): MultipvLine {
  if (!randomness || !randomness.candidateWeights?.length) {
    return lines[0];
  }
  if (lines.length === 0) {
    throw new Error('Stockfish did not return candidate moves');
  }

  const topScore = evaluationToCentipawns(lines[0].evaluation);
  if (!Number.isFinite(topScore) || Math.abs(topScore) >= 90000) {
    return lines[0];
  }

  const eligible: Array<{ line: MultipvLine; weight: number }> = [];

  randomness.candidateWeights.forEach((weight, index) => {
    if (weight <= 0) return;
    const line = lines[index];
    if (!line) return;
    const delta = Math.abs(evaluationToCentipawns(line.evaluation) - topScore);
    if (delta <= randomness.maxDeltaCentipawns) {
      eligible.push({ line, weight });
    }
  });

  if (eligible.length === 0) {
    return lines[0];
  }

  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.line;
    }
  }
  return eligible[eligible.length - 1].line;
}

export function selectBookMove(book: OpeningBook | undefined, history: string[]): SelectedBookMove | null {
  if (!book?.lines?.length) {
    return null;
  }

  const candidates: Array<{ move: string; weight: number; line: BookLine }> = [];

  for (const line of book.lines) {
    const moves = line.moves ?? [];
    if (moves.length <= history.length) {
      continue;
    }
    let matches = true;
    for (let ply = 0; ply < history.length; ply++) {
      if (moves[ply]?.toLowerCase() !== history[ply]?.toLowerCase()) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const nextMove = moves[history.length];
    if (!nextMove) continue;
    const weight = line.weight ?? 1;
    candidates.push({ move: nextMove, weight, line });
  }

  if (candidates.length === 0) {
    return null;
  }

  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { move: entry.move, line: entry.line };
    }
  }
  const last = candidates[candidates.length - 1];
  return { move: last.move, line: last.line };
}

export async function analyseWithEngine(profile: BotProfileConfig, fen: string): Promise<BotMoveSelection> {
  const engineConfig: EngineConfig = profile.style.engine ?? {};
  const process = new StockfishProcess(engineConfig);
  try {
    await process.initialize();
    const lines = await process.analysePosition(fen);
    if (!lines.length) {
      throw new Error('Engine produced no candidate lines');
    }
    const chosen = chooseCandidate(lines, engineConfig.randomness);
    return { lines, chosen };
  } finally {
    await process.dispose();
  }
}

export function applyUciMove(fen: string, uci: string) {
  const board = new Chess();
  board.load(fen);
  try {
    const move = board.move(uci);
    return { board, move };
  } catch {
    throw new Error(`Failed to apply move ${uci} to position ${fen}`);
  }
}

export function pvToSanSequence(fen: string, pv: string[]): string[] {
  const board = new Chess();
  board.load(fen);
  const sequence: string[] = [];
  for (const uci of pv) {
    try {
      const move = board.move(uci);
      sequence.push(move?.san ?? uci);
    } catch {
      sequence.push(uci);
    }
  }
  return sequence;
}
