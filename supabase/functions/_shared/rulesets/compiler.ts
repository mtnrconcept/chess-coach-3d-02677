import { resolveBaseRuleset } from "./base/index.ts";
import type {
  CompiledRuleset,
  CompilationResult,
  RulePatch,
  RuleSpec,
} from "./types.ts";

export class RuleCompilationError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "RuleCompilationError";
  }
}

const DEFAULT_PRIORITY = 50;

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseSegment(segment: string) {
  const match = segment.match(/^([^[]+)(?:\[id=([^]]+)\])?$/);
  if (!match) {
    throw new RuleCompilationError(`Invalid patch path segment: ${segment}`);
  }
  return { key: match[1], selector: match[2] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getArrayItem(
  container: unknown,
  selector: string,
  path: string,
): { array: unknown[]; index: number } {
  if (!Array.isArray(container)) {
    throw new RuleCompilationError(`Path does not target an array: ${path}`);
  }
  const index = container.findIndex((item) => isObject(item) && (item as { id?: string }).id === selector);
  if (index === -1) {
    throw new RuleCompilationError(`Unable to find id=${selector} in path ${path}`);
  }
  return { array: container, index };
}

function resolveParent(target: CompiledRuleset, path: string) {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    throw new RuleCompilationError("Patch path cannot be empty");
  }

  let current: unknown = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (!isObject(current)) {
      throw new RuleCompilationError(`Cannot traverse path ${path}`);
    }
    const { key, selector } = parseSegment(segments[i]);
    if (!(key in current)) {
      (current as Record<string, unknown>)[key] = selector ? [] : {};
    }
    const next = (current as Record<string, unknown>)[key];
    if (selector) {
      const { array, index } = getArrayItem(next, selector, path);
      current = array[index];
    } else {
      current = next;
    }
  }

  const { key, selector } = parseSegment(segments[segments.length - 1]);
  if (!isObject(current)) {
    throw new RuleCompilationError(`Cannot access property ${key} on non-object in path ${path}`);
  }

  return { parent: current as Record<string, unknown>, key, selector };
}

function applyPatch(target: CompiledRuleset, patch: RulePatch) {
  const { parent, key, selector } = resolveParent(target, patch.path);

  switch (patch.op) {
    case "replace": {
      if (selector) {
        const container = parent[key];
        const { array, index } = getArrayItem(container, selector, patch.path);
        array[index] = patch.value;
      } else {
        parent[key] = patch.value as unknown;
      }
      break;
    }
    case "extend": {
      if (selector) {
        throw new RuleCompilationError(
          `Extend operation cannot target a specific array element (${patch.path})`,
          patch.path,
        );
      }

      if (patch.value === undefined) {
        throw new RuleCompilationError(`Extend operation requires a value at ${patch.path}`);
      }

      let container = parent[key];
      if (container === undefined) {
        parent[key] = [];
        container = parent[key];
      }

      if (!Array.isArray(container)) {
        throw new RuleCompilationError(`Target at ${patch.path} is not an array`);
      }

      if (Array.isArray(patch.value)) {
        container.push(...patch.value);
      } else {
        container.push(patch.value);
      }
      break;
    }
    case "remove": {
      if (selector) {
        const container = parent[key];
        const { array, index } = getArrayItem(container, selector, patch.path);
        array.splice(index, 1);
      } else {
        delete parent[key];
      }
      break;
    }
    default:
      throw new RuleCompilationError(`Unsupported patch operation: ${patch.op}`);
  }
}

function applyPatches(target: CompiledRuleset, patches: RulePatch[] = []) {
  const sorted = [...patches].sort(
    (a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY),
  );

  for (const patch of sorted) {
    applyPatch(target, patch);
  }
}

function validateCompiledRuleset(ruleset: CompiledRuleset): string[] {
  const warnings: string[] = [];

  const pieceIds = new Set<string>();
  for (const piece of ruleset.pieces) {
    if (pieceIds.has(piece.id)) {
      throw new RuleCompilationError(`Duplicate piece id detected: ${piece.id}`);
    }
    pieceIds.add(piece.id);
  }

  if (ruleset.rules.checkRules === "classic") {
    const hasKing = ruleset.pieces.some((piece) => piece.id === "king" || piece.from === "king");
    if (!hasKing) {
      throw new RuleCompilationError(
        "Classic check rules require at least one king definition",
      );
    }
  }

  return warnings;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (isObject(value)) {
    const sortedEntries = Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys((value as Record<string, unknown>)[key])]);
    return Object.fromEntries(sortedEntries);
  }

  return value;
}

async function computeRulesetHash(ruleset: CompiledRuleset): Promise<string> {
  const canonical = JSON.stringify(sortObjectKeys(ruleset));
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function compileRuleSpec(spec: RuleSpec): Promise<CompilationResult> {
  const baseId = spec.meta.base || "chess-base@1.0.0";
  const base = resolveBaseRuleset(baseId);
  const compiled = deepClone(base);

  compiled.meta = { ...compiled.meta, ...spec.meta, base: baseId };

  if (spec.patches && spec.patches.length > 0) {
    applyPatches(compiled, spec.patches);
  }

  if (spec.tests) {
    compiled.tests = spec.tests;
  }

  const warnings = validateCompiledRuleset(compiled);
  const hash = await computeRulesetHash(compiled);

  return { compiled, hash, warnings };
}
