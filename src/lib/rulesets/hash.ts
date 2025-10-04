import type { CompiledRuleset } from "./types";

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObjectKeys(item)] as const);

    return Object.fromEntries(entries);
  }

  return value;
}

export async function computeCompiledRulesetHash(ruleset: CompiledRuleset): Promise<string> {
  const canonical = JSON.stringify(sortObjectKeys(ruleset));
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
