import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase/client";
import type { ChessVariantRow } from "@/lib/variants/compiled";

export function useVariants() {
  return useQuery({
    queryKey: ["chess-variants"],
    queryFn: async (): Promise<ChessVariantRow[]> => {
      const { data, error } = await supabase
        .from("chess_variants")
        .select("id,title,summary,rules,source,difficulty,prompt,rule_id,metadata,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as ChessVariantRow[];
    },
  });
}
