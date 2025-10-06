import type { CompiledRuleset, RuleSpec } from "./types";
import { computeCompiledRulesetHash } from "./hash";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export const difficultyLevels: Array<{ value: DifficultyLevel; label: string }> = [
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
];

export const difficultyLabelMap: Record<DifficultyLevel, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

export const isDifficultyLevel = (value: string): value is DifficultyLevel =>
  difficultyLevels.some((option) => option.value === value);

export const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export const buildDefaultVariantName = (promptValue: string, level: DifficultyLevel) => {
  const trimmed = promptValue.trim();
  if (trimmed.length === 0) {
    return `Variante personnalisée (${difficultyLabelMap[level]})`;
  }
  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  const sanitized = firstLine.length > 0 ? firstLine : trimmed;
  return sanitized.length > 60 ? `${sanitized.slice(0, 57)}…` : sanitized;
};

export const buildSummary = (promptValue: string, rulesValue: string, spec?: RuleSpec | null) => {
  if (spec?.meta.description) {
    return spec.meta.description.length > 240
      ? `${spec.meta.description.slice(0, 237)}…`
      : spec.meta.description;
  }
  const trimmedPrompt = promptValue.trim();
  if (trimmedPrompt.length > 0) {
    return trimmedPrompt.length > 240 ? `${trimmedPrompt.slice(0, 237)}…` : trimmedPrompt;
  }
  const firstLine = rulesValue
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Variante personnalisée générée avec l’outil IA.";
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
};

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```") || trimmed.length < 3) {
    return trimmed;
  }
  const fencePattern = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)```$/;
  const match = trimmed.match(fencePattern);
  if (match) {
    return match[1].trim();
  }
  const firstBreak = trimmed.indexOf("\n");
  const closingIndex = trimmed.lastIndexOf("```");
  if (firstBreak !== -1 && closingIndex > firstBreak) {
    return trimmed.slice(firstBreak + 1, closingIndex).trim();
  }
  return trimmed;
};

export const sanitisePluginSource = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const stripped = stripCodeFences(value);
  const normalised = stripped.replace(/\r\n?/g, "\n");
  const cleaned = normalised.trim();
  return cleaned.length > 0 ? cleaned : null;
};

export async function ensureCompiledHash(
  ruleset: CompiledRuleset | null,
  maybeHash?: string | null,
): Promise<{ ruleset: CompiledRuleset | null; hash: string | null }> {
  if (!ruleset) {
    return { ruleset: null, hash: null };
  }
  if (typeof maybeHash === "string" && maybeHash.length > 0) {
    return { ruleset, hash: maybeHash };
  }
  const hash = await computeCompiledRulesetHash(ruleset);
  return { ruleset, hash };
}
