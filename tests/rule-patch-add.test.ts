import { describe, expect, test } from "bun:test";

import { compileRuleSpec, RuleCompilationError } from "../supabase/functions/_shared/rulesets/compiler.ts";
import type { RuleSpec } from "../supabase/functions/_shared/rulesets/types.ts";

function makeMeta(name: string): RuleSpec["meta"] {
  return {
    name,
    base: "chess-base@1.0.0",
    version: "1.0.0",
  };
}

describe("Rule patch add operation", () => {
  test("appends entries to array targets", async () => {
    const spec: RuleSpec = {
      meta: makeMeta("Add operation - pieces"),
      patches: [
        {
          op: "add",
          path: "pieces",
          value: {
            id: "archer",
            from: "rook",
            moves: [{ pattern: "rook" }],
          },
        },
      ],
    };

    const result = await compileRuleSpec(spec);
    const added = result.compiled.pieces.find((piece) => piece.id === "archer");
    expect(added).toBeTruthy();
    expect(added?.from).toBe("rook");
  });

  test("merges object fields when target already exists", async () => {
    const spec: RuleSpec = {
      meta: makeMeta("Add operation - merge"),
      patches: [
        {
          op: "add",
          path: "rules.conflictPolicy",
          value: { customPolicy: "enabled" },
        },
      ],
    };

    const result = await compileRuleSpec(spec);
    expect(result.compiled.rules.conflictPolicy.customPolicy).toBe("enabled");
    expect(result.compiled.rules.conflictPolicy.onDuplicatePieceId).toBe("error");
  });

  test("prevents inserting duplicates when targeting an id selector", async () => {
    const spec: RuleSpec = {
      meta: makeMeta("Add operation - duplicate"),
      patches: [
        {
          op: "add",
          path: "pieces[id=rook]",
          value: {
            id: "rook",
            from: "rook",
            moves: [{ pattern: "rook" }],
          },
        },
      ],
    };

    await expect(compileRuleSpec(spec)).rejects.toThrow(RuleCompilationError);
  });
});
