// Helpers pour reconnaître et extraire un ruleset compilé stocké en metadata

export type CompiledRuleset = {
  meta: Record<string, unknown>;
  board: Record<string, unknown>;
  pieces: unknown[];
  rules: Record<string, unknown>;
  effects?: unknown[];
  tests?: unknown[];
};

export type ChessVariantRow = {
  id: string;
  title: string;
  summary: string | null;
  rules: string | null; // texte libre, pour les variantes descriptives
  source: string; // enum('generated','catalog','ia',…) — on ne s’y fie plus
  difficulty: string | null;
  prompt: string | null;
  rule_id: string | null;
  metadata: any; // JSONB côté Supabase
  created_at?: string;
  updated_at?: string;
};

export function hasCompiled(variant: ChessVariantRow): boolean {
  const m = variant?.metadata;
  return Boolean(m && m.compiled && m.compiled.ruleset && m.compiled.hash);
}

export function getCompiled(
  variant: ChessVariantRow,
): { hash: string; ruleset: CompiledRuleset } | null {
  const m = variant?.metadata;
  if (!m?.compiled?.ruleset || !m?.compiled?.hash) return null;
  return { hash: String(m.compiled.hash), ruleset: m.compiled.ruleset as CompiledRuleset };
}

export function getSlug(variant: ChessVariantRow): string {
  return (variant?.metadata?.slug as string) || (variant?.rule_id as string) || variant.id;
}
