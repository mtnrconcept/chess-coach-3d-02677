import { Chess } from "chess.js";
import { isKingInCheck } from "@/lib/chessAnalysis";
import type {
  Board,
  Color,
  EngineApi,
  GameState,
  Move,
  Piece,
  PieceType,
  Pos,
  Square,
} from "@/variant-chess-lobby";

type CastlingRight = "K" | "Q" | "k" | "q";

export interface ExtendedGameState extends GameState {
  fenInfo: {
    castling: string;
    enPassant: string;
    halfmoveClock: number;
    fullmoveNumber: number;
  };
}

export interface ChessJsEngineAdapter {
  engine: EngineApi;
  initialState: ExtendedGameState;
  stateToFen: (state: ExtendedGameState) => string;
  syncChessFromState: (state: ExtendedGameState) => void;
  getLastMoveResult: () => ReturnType<Chess["move"]> | null;
  clearLastMoveResult: () => void;
}

const pieceTypeToFen: Record<PieceType, string> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
};

const promotionMap: Record<PieceType, string> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  king: "k",
  pawn: "p",
};

const STARTING_ROOK_POSITIONS: Record<Color, { kingSide: Pos; queenSide: Pos }> = {
  white: { kingSide: { x: 7, y: 7 }, queenSide: { x: 0, y: 7 } },
  black: { kingSide: { x: 7, y: 0 }, queenSide: { x: 0, y: 0 } },
};

const KING_START: Record<Color, Pos> = {
  white: { x: 4, y: 7 },
  black: { x: 4, y: 0 },
};

function deepCloneState(state: ExtendedGameState): ExtendedGameState {
  return JSON.parse(JSON.stringify(state));
}

function resolveFenChar(piece: Piece): string {
  const mapped = pieceTypeToFen[piece.type as PieceType];
  if (mapped) {
    return mapped;
  }

  if (typeof piece.type === "string" && piece.type.length > 0) {
    return piece.type.charAt(0).toLowerCase();
  }

  throw new Error(`Unsupported piece type: ${String(piece.type)}`);
}

export function algebraicToPos(square: string): Pos {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  return { x: file, y: 8 - rank };
}

export function posToAlgebraic(pos: Pos): string {
  return String.fromCharCode(97 + pos.x) + (8 - pos.y).toString();
}

function createEmptyBoard(): Board {
  const board: Square[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: Square[] = [];
    for (let x = 0; x < 8; x++) {
      row.push({ pos: { x, y } });
    }
    board.push(row);
  }
  return board;
}

export function createInitialStateFromChess(chess: Chess): ExtendedGameState {
  const board = createEmptyBoard();
  const idCounters: Record<Color, Record<PieceType, number>> = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };

  const chessBoard = chess.board();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const square = chessBoard[y][x];
      if (!square) continue;
      const color: Color = square.color === "w" ? "white" : "black";
      const type = square.type as PieceType;
      idCounters[color][type]++;
      board[y][x].piece = {
        id: `${color[0]}-${type}-${idCounters[color][type]}`,
        type,
        color,
      };
    }
  }

  const [boardFen, turn, castling, enPassant, halfmove, fullmove] = chess
    .fen()
    .split(" ") as [string, string, string, string, string, string];

  return {
    board,
    turn: turn === "w" ? "white" : "black",
    moveNumber: Number(fullmove) - 1,
    history: [],
    flags: {
      white: {},
      black: {},
    },
    graveyard: {
      white: [],
      black: [],
    },
    fenInfo: {
      castling: castling === "-" ? "" : castling,
      enPassant,
      halfmoveClock: Number(halfmove),
      fullmoveNumber: Number(fullmove),
    },
  };
}

function boardToFen(board: Board): string {
  const ranks: string[] = [];
  for (let y = 0; y < 8; y++) {
    let empty = 0;
    let rankStr = "";
    for (let x = 0; x < 8; x++) {
      const piece = board[y][x].piece;
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        rankStr += empty.toString();
        empty = 0;
      }
      const fenChar = resolveFenChar(piece);
      rankStr += piece.color === "white" ? fenChar.toUpperCase() : fenChar;
    }
    if (empty > 0) {
      rankStr += empty.toString();
    }
    ranks.push(rankStr);
  }
  return ranks.join("/");
}

function removeCastlingRight(state: ExtendedGameState, right: CastlingRight) {
  if (!state.fenInfo.castling.includes(right)) return;
  state.fenInfo.castling = state.fenInfo.castling.replace(right, "");
}

function handleCastlingRightsOnSet(
  state: ExtendedGameState,
  pos: Pos,
  piece?: Piece,
) {
  const { x, y } = pos;
  const posKey = `${x},${y}`;
  switch (posKey) {
    case "4,7":
      // White king start
      if (!piece || piece.type !== "king" || piece.color !== "white") {
        removeCastlingRight(state, "K");
        removeCastlingRight(state, "Q");
      }
      break;
    case "0,7":
      if (!piece || piece.color !== "white" || piece.type !== "rook") {
        removeCastlingRight(state, "Q");
      }
      break;
    case "7,7":
      if (!piece || piece.color !== "white" || piece.type !== "rook") {
        removeCastlingRight(state, "K");
      }
      break;
    case "4,0":
      if (!piece || piece.type !== "king" || piece.color !== "black") {
        removeCastlingRight(state, "k");
        removeCastlingRight(state, "q");
      }
      break;
    case "0,0":
      if (!piece || piece.color !== "black" || piece.type !== "rook") {
        removeCastlingRight(state, "q");
      }
      break;
    case "7,0":
      if (!piece || piece.color !== "black" || piece.type !== "rook") {
        removeCastlingRight(state, "k");
      }
      break;
    default:
      break;
  }
}

export function createChessJsEngineAdapter(chess: Chess): ChessJsEngineAdapter {
  let lastMoveResult: ReturnType<Chess["move"]> | null = null;
  let needsSync = false;

  const initialState = createInitialStateFromChess(chess);

  function stateToFen(state: ExtendedGameState): string {
    const boardFen = boardToFen(state.board);
    const turn = state.turn === "white" ? "w" : "b";
    const castling = state.fenInfo.castling.length > 0 ? state.fenInfo.castling : "-";
    const enPassant = state.fenInfo.enPassant || "-";
    const halfmove = state.fenInfo.halfmoveClock ?? 0;
    const fullmove = state.fenInfo.fullmoveNumber ?? 1;
    return `${boardFen} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  }

  function syncChessFromState(state: ExtendedGameState) {
    const fen = stateToFen(state);
    chess.load(fen);
    const [, turn, castling, enPassant, halfmove, fullmove] = chess
      .fen()
      .split(" ") as [string, string, string, string, string, string];
    state.turn = turn === "w" ? "white" : "black";
    state.fenInfo.castling = castling === "-" ? "" : castling;
    state.fenInfo.enPassant = enPassant;
    state.fenInfo.halfmoveClock = Number(halfmove);
    state.fenInfo.fullmoveNumber = Number(fullmove);
    needsSync = false;
  }

  const engine: EngineApi = {
    isInCheck(state, color) {
      const fen = stateToFen(state as ExtendedGameState);
      const temp = new Chess(fen);
      const fenParts = fen.split(" ");
      fenParts[1] = color === "white" ? "w" : "b";
      temp.load(fenParts.join(" "));
      return isKingInCheck(temp);
    },
    isLegalStandardMove(state, move) {
      if (needsSync) {
        syncChessFromState(state as ExtendedGameState);
      }
      const from = posToAlgebraic(move.from);
      const to = posToAlgebraic(move.to);
      const promotion = move.promotion ? promotionMap[move.promotion] : undefined;
      try {
        const attempted = chess.move({ from, to, promotion });
        if (!attempted) return false;
        chess.undo();
        return true;
      } catch {
        return false;
      }
    },
    applyStandardMove(state, move, options) {
      const extended = state as ExtendedGameState;
      const simulate = options?.simulate ?? false;

      let chessInstance = chess;

      if (simulate) {
        const fen = stateToFen(extended);
        chessInstance = new Chess(fen);
      } else {
        lastMoveResult = null;
        if (needsSync) {
          syncChessFromState(extended);
        }
      }

      const fromSquare = posToAlgebraic(move.from);
      const toSquare = posToAlgebraic(move.to);
      const promotion = move.promotion ? promotionMap[move.promotion] : undefined;
      
      const board = extended.board;
      const movingSquare = board[move.from.y][move.from.x];
      const targetSquare = board[move.to.y][move.to.x];
      const movingPiece = movingSquare.piece;
      
      if (!movingPiece) {
        throw new Error("No piece found at source square");
      }
      
      let result: ReturnType<Chess["move"]>;
      let capturedPiece: Piece | undefined;
      
      try {
        result = chessInstance.move({ from: fromSquare, to: toSquare, promotion });
        if (!result) {
          throw new Error("Illegal move attempted in adapter");
        }

        if (!simulate) {
          lastMoveResult = result;
        }

        if (result.flags.includes("e")) {
          const dir = movingPiece.color === "white" ? 1 : -1;
          const capturePos = { x: move.to.x, y: move.to.y + dir };
          capturedPiece = board[capturePos.y][capturePos.x].piece;
          board[capturePos.y][capturePos.x].piece = undefined;
        } else if (targetSquare.piece) {
          capturedPiece = targetSquare.piece;
        }

        if (capturedPiece) {
          extended.graveyard[capturedPiece.color].push({ ...capturedPiece });
        }

        movingSquare.piece = undefined;

        if (result.promotion) {
          movingPiece.type = (result.promotion === result.promotion.toLowerCase()
            ? (Object.entries(pieceTypeToFen).find(([, v]) => v === result.promotion)?.[0] as PieceType)
            : "queen") ?? "queen";
          movingPiece.tags = {};
        } else if (move.promotion) {
          movingPiece.type = move.promotion;
          movingPiece.tags = {};
        }
      } catch (error) {
        throw new Error("Illegal move attempted in adapter");
      }

      targetSquare.piece = movingPiece;

      if (result.flags.includes("k") || result.flags.includes("q")) {
        const color = movingPiece.color;
        const rookFrom = result.flags.includes("k")
          ? STARTING_ROOK_POSITIONS[color].kingSide
          : STARTING_ROOK_POSITIONS[color].queenSide;
        const rookTo = result.flags.includes("k")
          ? { x: move.to.x - 1, y: move.to.y }
          : { x: move.to.x + 1, y: move.to.y };
        const rookPiece = board[rookFrom.y][rookFrom.x].piece;
        if (rookPiece) {
          board[rookFrom.y][rookFrom.x].piece = undefined;
          board[rookTo.y][rookTo.x].piece = rookPiece;
        }
      }

      const moveForHistory: Move = {
        from: { ...move.from },
        to: { ...move.to },
        promotion: move.promotion,
        meta: { san: result.san, special: move.meta?.special },
      };

      extended.history.push({
        move: moveForHistory,
        movedPiece: { ...movingPiece },
        capturedPiece: capturedPiece ? { ...capturedPiece } : undefined,
      });

      const [boardFen, turn, castling, enPassant, halfmove, fullmove] = chessInstance
        .fen()
        .split(" ") as [string, string, string, string, string, string];
      extended.turn = turn === "w" ? "white" : "black";
      extended.fenInfo.castling = castling === "-" ? "" : castling;
      extended.fenInfo.enPassant = enPassant;
      extended.fenInfo.halfmoveClock = Number(halfmove);
      extended.fenInfo.fullmoveNumber = Number(fullmove);

      return extended;
    },
    cloneState(state) {
      return deepCloneState(state as ExtendedGameState);
    },
    getPieceAt(state, pos) {
      if (!engine.inBounds(pos)) return undefined;
      return (state as ExtendedGameState).board[pos.y][pos.x].piece;
    },
    setPieceAt(state, pos, piece) {
      if (!engine.inBounds(pos)) return;
      const extended = state as ExtendedGameState;
      extended.board[pos.y][pos.x].piece = piece ? { ...piece } : undefined;
      handleCastlingRightsOnSet(extended, pos, piece ? { ...piece } : undefined);
      extended.fenInfo.enPassant = "-";
      extended.fenInfo.halfmoveClock = 0;
      needsSync = true;
    },
    findKing(state, color) {
      const board = (state as ExtendedGameState).board;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = board[y][x].piece;
          if (piece && piece.type === "king" && piece.color === color) {
            return { x, y };
          }
        }
      }
      throw new Error("King not found");
    },
    allPieces(state) {
      const board = (state as ExtendedGameState).board;
      const pieces: { piece: Piece; pos: Pos }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = board[y][x].piece;
          if (piece) pieces.push({ piece: { ...piece }, pos: { x, y } });
        }
      }
      return pieces;
    },
    inBounds(pos) {
      return pos.x >= 0 && pos.x < 8 && pos.y >= 0 && pos.y < 8;
    },
  };

  return {
    engine,
    initialState,
    stateToFen,
    syncChessFromState,
    getLastMoveResult: () => lastMoveResult,
    clearLastMoveResult: () => {
      lastMoveResult = null;
    },
  };
}
