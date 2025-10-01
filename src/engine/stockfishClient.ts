const DEFAULT_WASM_PATH = '/engines/stockfish.wasm';

export interface AnalysePositionParams {
  fen: string;
  movetimeMs?: number;
  nodes?: number;
  multiPv?: number;
}

export interface PrincipalVariationLine {
  multipv: number;
  bestMove: string;
  pv: string[];
  evaluation: EngineEvaluation;
}

export interface EngineEvaluation {
  type: 'cp' | 'mate';
  value: number;
}

export interface AnalysePositionResult {
  bestMove: string;
  evaluation: EngineEvaluation;
  lines: PrincipalVariationLine[];
}

export interface EngineHandle {
  analysePosition(params: AnalysePositionParams): Promise<AnalysePositionResult>;
  quit(): void;
}

const ENGINE_READY_MARKER = 'uciok';

type StockfishFactory = (options?: Record<string, unknown>) => StockfishInstance | Promise<StockfishInstance>;

type StockfishInstance = EventTarget & {
  postMessage(message: string): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<string>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<string>) => void,
    options?: boolean | EventListenerOptions,
  ): void;
};

async function ensureStockfishFactory(wasmUrl: string): Promise<StockfishFactory> {
  const scriptUrl = wasmUrl.replace(/\.wasm$/, '.js');
  const globalHandle = globalThis as unknown as { Stockfish?: StockfishFactory };
  if (typeof globalHandle.Stockfish === 'function') {
    return globalHandle.Stockfish;
  }

  await import(/* @vite-ignore */ scriptUrl);
  if (typeof globalHandle.Stockfish !== 'function') {
    throw new Error('Failed to load Stockfish factory script');
  }

  return globalHandle.Stockfish as StockfishFactory;
}

async function createEngineInstance(wasmUrl: string): Promise<StockfishInstance> {
  const stockfishFactory = await ensureStockfishFactory(wasmUrl);
  const wasmBinary = await fetch(wasmUrl).then((res) => res.arrayBuffer());
  const instance = await Promise.resolve(stockfishFactory({ wasmBinary }));
  if (!instance || typeof instance.postMessage !== 'function') {
    throw new Error('Unexpected Stockfish WASM interface.');
  }
  return instance;
}

function parseEvaluation(payload: string): EngineEvaluation | null {
  const mateMatch = payload.match(/mate (-?\d+)/);
  if (mateMatch) {
    return { type: 'mate', value: Number.parseInt(mateMatch[1], 10) };
  }
  const cpMatch = payload.match(/cp (-?\d+)/);
  if (cpMatch) {
    return { type: 'cp', value: Number.parseInt(cpMatch[1], 10) };
  }
  return null;
}

function parsePv(payload: string): string[] {
  const pvMatch = payload.match(/ pv (.*)$/);
  if (!pvMatch) return [];
  return pvMatch[1].trim().split(/\s+/);
}

export async function initEngine(wasmUrl: string = DEFAULT_WASM_PATH): Promise<EngineHandle> {
  const engine = await createEngineInstance(wasmUrl);
  const listeners: ((message: string) => void)[] = [];
  const waitForReady = new Promise<void>((resolve) => {
    const handler = (event: MessageEvent<string>) => {
      const text = event.data;
      if (typeof text === 'string' && text.includes(ENGINE_READY_MARKER)) {
        engine.removeEventListener('message', handler);
        resolve();
      }
    };
    engine.addEventListener('message', handler);
  });

  engine.addEventListener('message', (event: MessageEvent<string>) => {
    const text = event.data;
    if (typeof text !== 'string') return;
    listeners.forEach((listener) => listener(text));
  });

  engine.postMessage('uci');
  await waitForReady;

  const sendCommand = (command: string) => {
    engine.postMessage(command);
  };

  const onMessage = (listener: (payload: string) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  };

  const analysePositionInternal = async ({
    fen,
    movetimeMs,
    nodes,
    multiPv = 1,
  }: AnalysePositionParams): Promise<AnalysePositionResult> => {
    const resultLines: PrincipalVariationLine[] = [];
    let bestMove = '';
    let finalEvaluation: EngineEvaluation = { type: 'cp', value: 0 };

    const collectLine = (payload: string) => {
      const multipvMatch = payload.match(/ multipv (\d+)/);
      if (!multipvMatch) return;
      const multipv = Number.parseInt(multipvMatch[1], 10);
      const evaluation = parseEvaluation(payload);
      if (!evaluation) return;
      const pv = parsePv(payload);
      const moveMatch = payload.match(/ pv (\w+)/);
      const move = moveMatch ? moveMatch[1] : pv[0];
      const existingIndex = resultLines.findIndex((line) => line.multipv === multipv);
      const line: PrincipalVariationLine = {
        multipv,
        bestMove: move ?? '',
        pv,
        evaluation,
      };
      if (existingIndex >= 0) {
        resultLines[existingIndex] = line;
      } else {
        resultLines.push(line);
      }
    };

    const infoListener = (payload: string) => {
      if (!payload.startsWith('info')) return;
      collectLine(payload);
    };

    const removeInfoListener = onMessage(infoListener);

    let removeBestMoveListener: (() => void) | null = null;
    const analysisCompleted = new Promise<void>((resolve) => {
      const handler = (payload: string) => {
        if (!payload.startsWith('bestmove')) return;
        const moveMatch = payload.match(/bestmove (\S+)/);
        if (moveMatch) {
          bestMove = moveMatch[1];
        }
        if (resultLines.length > 0) {
          const bestLine = resultLines.reduce((acc, line) =>
            line.multipv < acc.multipv ? line : acc,
          resultLines[0]);
          finalEvaluation = bestLine.evaluation;
        }
        resolve();
      };
      removeBestMoveListener = onMessage(handler);
    });

    sendCommand('ucinewgame');
    sendCommand(`setoption name MultiPV value ${multiPv}`);
    sendCommand(`position fen ${fen}`);
    if (movetimeMs) {
      sendCommand(`go movetime ${movetimeMs}`);
    } else if (nodes) {
      sendCommand(`go nodes ${nodes}`);
    } else {
      sendCommand('go depth 15');
    }

    await analysisCompleted;
    removeInfoListener();
    if (removeBestMoveListener) {
      removeBestMoveListener();
    }

    return {
      bestMove,
      evaluation: finalEvaluation,
      lines: resultLines.sort((a, b) => a.multipv - b.multipv),
    };
  };

  return {
    analysePosition: analysePositionInternal,
    quit() {
      sendCommand('quit');
    },
  };
}
