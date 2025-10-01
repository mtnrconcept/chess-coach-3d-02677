import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { TextLineStream } from 'https://deno.land/std@0.224.0/streams/text_line_stream.ts';

interface EngineEvaluation {
  type: 'cp' | 'mate';
  value: number;
}

interface EvalResult {
  bestMove: string;
  evaluation: EngineEvaluation;
}

interface WorkerConfig {
  depth: number;
  threads: number;
  hash: number;
  moveTimeMs: number;
}

interface EvalRequest {
  fen: string;
  ply: number;
}

interface EvalMessage {
  type: 'fen';
  fen: string;
  ply?: number;
}

interface ReadyMessage {
  type: 'ready';
  depth: number;
  threads: number;
}

interface EvalResponse {
  type: 'eval';
  ply: number;
  bestMove: string;
  evaluation: EngineEvaluation;
  depth: number;
  engineTimeMs: number;
  fen: string;
}

interface ErrorResponse {
  type: 'error';
  message: string;
}

class StockfishWorker {
  private process: Deno.ChildProcess;

  private stdoutQueue: string[] = [];

  private waiters: Array<(line: string) => void> = [];

  private terminated = false;

  private writer: WritableStreamDefaultWriter<Uint8Array>;

  private readonly encoder = new TextEncoder();

  constructor(private readonly config: WorkerConfig) {
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

  get depth(): number {
    return this.config.depth;
  }

  get threads(): number {
    return this.config.threads;
  }

  private async consume(stream: ReadableStream<string>) {
    try {
      for await (const line of stream) {
        if (this.waiters.length > 0) {
          const waiter = this.waiters.shift();
          waiter?.(line);
        } else {
          this.stdoutQueue.push(line);
        }
      }
    } finally {
      this.terminated = true;
    }
  }

  private async readLine(): Promise<string> {
    if (this.stdoutQueue.length > 0) {
      return this.stdoutQueue.shift() as string;
    }
    if (this.terminated) {
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

    await this.setOption('MultiPV', 1);
    await this.setOption('Threads', Math.max(1, this.config.threads));
    await this.setOption('Hash', Math.max(16, this.config.hash));

    await this.write('isready');
    do {
      line = await this.readLine();
    } while (!line.includes('readyok'));
  }

  async evaluate(fen: string): Promise<EvalResult> {
    await this.write('ucinewgame');
    await this.write(`position fen ${fen}`);

    const goCommand = `go depth ${this.config.depth}`;
    await this.write(goCommand);

    let stopTimer: number | undefined;
    if (this.config.moveTimeMs > 0) {
      stopTimer = setTimeout(() => {
        void this.write('stop');
      }, this.config.moveTimeMs);
    }

    try {
      let bestMove = '';
      let evaluation: EngineEvaluation | null = null;

      while (true) {
        const payload = await this.readLine();
        if (payload.startsWith('info') && payload.includes('score')) {
          const parsed = extractEvaluation(payload);
          if (parsed) {
            evaluation = parsed;
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
        evaluation: evaluation ?? { type: 'cp', value: 0 },
      };
    } finally {
      if (typeof stopTimer === 'number') {
        clearTimeout(stopTimer);
      }
    }
  }

  async dispose() {
    try {
      await this.write('quit');
    } catch (_) {
      // ignore
    }
    try {
      await this.writer.close();
    } catch (_) {
      // ignore
    }
    try {
      await this.process.status;
    } catch (_) {
      // ignore
    }
  }

  isTerminated(): boolean {
    return this.terminated;
  }
}

class StockfishPool {
  private available: StockfishWorker[] = [];

  private waiters: Array<(worker: StockfishWorker) => void> = [];

  private constructor(private readonly config: WorkerConfig, private readonly size: number) {}

  static async create(config: WorkerConfig, size: number): Promise<StockfishPool> {
    const pool = new StockfishPool(config, size);
    await pool.populate();
    return pool;
  }

  private async populate() {
    const workers = await Promise.all(
      Array.from({ length: this.size }, async () => {
        const worker = new StockfishWorker(this.config);
        await worker.initialize();
        return worker;
      }),
    );
    this.available.push(...workers);
  }

  async acquire(): Promise<StockfishWorker> {
    if (this.available.length > 0) {
      return this.available.shift() as StockfishWorker;
    }
    return new Promise<StockfishWorker>((resolve) => this.waiters.push(resolve));
  }

  release(worker: StockfishWorker) {
    if (worker.isTerminated()) {
      void this.spawnReplacement();
      return;
    }

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(worker);
    } else {
      this.available.push(worker);
    }
  }

  private async spawnReplacement() {
    try {
      const worker = new StockfishWorker(this.config);
      await worker.initialize();
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift();
        waiter?.(worker);
      } else {
        this.available.push(worker);
      }
    } catch (error) {
      console.error('Failed to spawn replacement Stockfish worker', error);
    }
  }
}

function extractEvaluation(payload: string): EngineEvaluation | null {
  const mateMatch = payload.match(/score mate (-?\d+)/);
  if (mateMatch) {
    return { type: 'mate', value: Number.parseInt(mateMatch[1], 10) };
  }
  const cpMatch = payload.match(/score cp (-?\d+)/);
  if (cpMatch) {
    return { type: 'cp', value: Number.parseInt(cpMatch[1], 10) };
  }
  return null;
}

function parseMessage(data: unknown): EvalMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as EvalMessage;
    if (parsed && parsed.type === 'fen' && typeof parsed.fen === 'string') {
      const ply = typeof parsed.ply === 'number' && Number.isFinite(parsed.ply) ? parsed.ply : 0;
      return { type: 'fen', fen: parsed.fen, ply };
    }
  } catch (_) {
    return null;
  }
  return null;
}

const poolPromise = StockfishPool.create(
  {
    depth: Number.parseInt(Deno.env.get('LIVE_EVAL_DEPTH') ?? '18', 10),
    threads: Number.parseInt(Deno.env.get('LIVE_EVAL_THREADS') ?? '2', 10),
    hash: Number.parseInt(Deno.env.get('LIVE_EVAL_HASH') ?? '64', 10),
    moveTimeMs: Number.parseInt(Deno.env.get('LIVE_EVAL_TIME_MS') ?? '450', 10),
  },
  Number.parseInt(Deno.env.get('LIVE_EVAL_POOL_SIZE') ?? '3', 10),
);

serve(async (req) => {
  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 400 });
  }

  const pool = await poolPromise;
  const { socket, response } = Deno.upgradeWebSocket(req);

  handleSocket(socket, pool);

  return response;
});

function handleSocket(socket: WebSocket, pool: StockfishPool) {
  let worker: StockfishWorker | null = null;
  let closed = false;
  let processing = false;
  let queued: EvalRequest | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (worker) {
      pool.release(worker);
      worker = null;
    }
  };

  const flushQueue = async () => {
    if (processing || !worker || !queued) {
      return;
    }
    const request = queued;
    queued = null;
    processing = true;
    const startedAt = performance.now();

    try {
      const result = await worker.evaluate(request.fen);
      const elapsed = performance.now() - startedAt;
      const payload: EvalResponse = {
        type: 'eval',
        ply: request.ply,
        bestMove: result.bestMove,
        evaluation: result.evaluation,
        depth: worker.depth,
        engineTimeMs: Math.round(elapsed),
        fen: request.fen,
      };
      socket.send(JSON.stringify(payload));
    } catch (error) {
      console.error('live-eval worker error', error);
      const message: ErrorResponse = {
        type: 'error',
        message: 'Engine failure',
      };
      try {
        socket.send(JSON.stringify(message));
      } catch (_) {
        // ignore send errors
      }
      cleanup();
      socket.close(1011, 'Engine failure');
      return;
    } finally {
      processing = false;
    }

    if (queued && !closed) {
      void flushQueue();
    }
  };

  socket.onopen = () => {
    void (async () => {
      try {
        worker = await pool.acquire();
        if (closed) {
          if (worker) {
            pool.release(worker);
            worker = null;
          }
          return;
        }
        const ready: ReadyMessage = {
          type: 'ready',
          depth: worker.depth,
          threads: worker.threads,
        };
        socket.send(JSON.stringify(ready));
        if (queued) {
          void flushQueue();
        }
      } catch (error) {
        console.error('Failed to acquire Stockfish worker', error);
        const message: ErrorResponse = {
          type: 'error',
          message: 'Engine unavailable',
        };
        try {
          socket.send(JSON.stringify(message));
        } catch (_) {
          // ignore
        }
        socket.close(1013, 'Engine unavailable');
      }
    })();
  };

  socket.onmessage = (event) => {
    if (closed) return;
    const message = parseMessage(event.data);
    if (!message) return;
    queued = { fen: message.fen, ply: message.ply ?? 0 };
    if (!processing && worker) {
      void flushQueue();
    }
  };

  socket.onerror = () => {
    cleanup();
  };

  socket.onclose = () => {
    cleanup();
  };
}
