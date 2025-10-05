import { useVariants } from "./useVariants";
import { VariantCard } from "./VariantCard";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { hasCompiled, getCompiled, type ChessVariantRow } from "@/lib/variants/compiled";

export default function LobbyVariants() {
  const { data, isLoading, error } = useVariants();
  const navigate = useNavigate();

  const onLaunch = (opts: { variant: ChessVariantRow; compiled?: ReturnType<typeof getCompiled> }) => {
    try {
      const automated = hasCompiled(opts.variant);
      if (automated && opts.compiled?.ruleset) {
        // 1) stocker le ruleset en mémoire locale (ou créer une partie en DB avec ce blob)
        const key = `compiled-ruleset:${opts.variant.id}`;
        localStorage.setItem(key, JSON.stringify(opts.compiled.ruleset));

        // 2) router avec un flag pour que l’écran de jeu le charge
        navigate(`/game?variant=${encodeURIComponent(opts.variant.id)}&compiled=1`);
      } else {
        navigate(`/game?variant=${encodeURIComponent(opts.variant.id)}`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Impossible de lancer la variante.");
    }
  };

  if (isLoading) return <div className="p-6">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur de chargement</div>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {(data ?? []).map((v) => (
        <VariantCard key={v.id} variant={v} onLaunch={onLaunch} />
      ))}
    </div>
  );
}
