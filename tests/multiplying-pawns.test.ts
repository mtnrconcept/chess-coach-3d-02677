import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";

import { createChessJsEngineAdapter } from "../src/engine/variantEngineAdapter";
import { createMatch, playMove } from "../src/variant-chess-lobby";

function setupMultiplyingMatch(fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1") {
  const chess = new Chess(fen);
  const adapter = createChessJsEngineAdapter(chess);
  const match = createMatch(adapter.engine, adapter.initialState, "jumping-pawns", false);
  return match;
}

describe("Pions multiplicateurs", () => {
  test("un pas sans capture laisse un clone derrière", () => {
    const match = setupMultiplyingMatch();
    const engine = match.engine;

    const from = { x: 4, y: 6 };
    const to = { x: 4, y: 5 };
    const original = engine.getPieceAt(match.state, from);
    expect(["pawn", "p"]).toContain(original?.type);

    const result = playMove(match, { from, to });
    expect(result.ok).toBe(true);

    const moved = engine.getPieceAt(match.state, to);
    expect(moved?.id).toBe(original?.id);

    const clone = engine.getPieceAt(match.state, from);
    expect(clone).toBeTruthy();
    expect(clone?.id).not.toBe(original?.id);

    expect(match.state.flags.white?.[`${original?.id}_multiplied`]).toBe(true);
    expect(match.state.flags.white?.[`${clone?.id}_multiplied`]).toBe(true);
  });

  test("un pion ou son clone ne se multiplie pas deux fois", () => {
    const match = setupMultiplyingMatch();
    const engine = match.engine;

    const originalFrom = { x: 4, y: 6 };
    const step1 = { x: 4, y: 5 };
    const step2 = { x: 4, y: 4 };

    const firstMove = playMove(match, { from: originalFrom, to: step1 });
    expect(firstMove.ok).toBe(true);

    const clone = engine.getPieceAt(match.state, originalFrom);
    expect(clone).toBeTruthy();
    const cloneId = clone!.id;

    const blackReply1 = playMove(match, { from: { x: 4, y: 0 }, to: { x: 4, y: 1 } });
    expect(blackReply1.ok).toBe(true);

    const secondMove = playMove(match, { from: step1, to: step2 });
    expect(secondMove.ok).toBe(true);
    expect(engine.getPieceAt(match.state, step1)).toBeUndefined();

    const blackReply2 = playMove(match, { from: { x: 4, y: 1 }, to: { x: 4, y: 2 } });
    expect(blackReply2.ok).toBe(true);

    const cloneAdvance = playMove(match, { from: originalFrom, to: step1 });
    expect(cloneAdvance.ok).toBe(true);
    expect(engine.getPieceAt(match.state, originalFrom)).toBeUndefined();
    expect(engine.getPieceAt(match.state, step1)?.id).toBe(cloneId);
    expect(match.state.flags.white?.[`${cloneId}_multiplied`]).toBe(true);
  });

  test("aucune copie n'est créée lors d'une capture diagonale", () => {
    const match = setupMultiplyingMatch("4k3/8/8/5p2/4P3/8/8/4K3 w - - 0 1");
    const engine = match.engine;

    const from = { x: 4, y: 4 };
    const captureSquare = { x: 5, y: 3 };
    const original = engine.getPieceAt(match.state, from);
    expect(["pawn", "p"]).toContain(original?.type);

    const move = playMove(match, { from, to: captureSquare });
    expect(move.ok).toBe(true);

    expect(engine.getPieceAt(match.state, from)).toBeUndefined();
    const landed = engine.getPieceAt(match.state, captureSquare);
    expect(landed?.id).toBe(original?.id);
    expect(match.state.flags.white?.[`${original?.id}_multiplied`]).toBeUndefined();
  });
});
