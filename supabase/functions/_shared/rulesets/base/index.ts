import chessBase100 from "./chess-base@1.0.0.json" assert { type: "json" };
import type { CompiledRuleset } from "../types.ts";

const registry: Record<string, CompiledRuleset> = {
  "chess-base@1.0.0": chessBase100 as CompiledRuleset,
  "chess-base@1.2.0": chessBase100 as CompiledRuleset,
};

export function resolveBaseRuleset(baseId: string): CompiledRuleset {
  const key = baseId.trim();
  const base = registry[key];
  if (!base) {
    throw new Error(`Base ruleset not found: ${key}`);
  }

  // structuredClone not available in some bundlers, fallback to JSON.
  if (typeof structuredClone === "function") {
    return structuredClone(base);
  }

  return JSON.parse(JSON.stringify(base)) as CompiledRuleset;
}

export function listAvailableBases(): string[] {
  return Object.keys(registry);
}
