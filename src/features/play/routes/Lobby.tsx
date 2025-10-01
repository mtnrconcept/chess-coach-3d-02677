import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase/client";
import type { Tables } from "@/services/supabase/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { lobbyRooms as embeddedLobbyRooms, getRuleById } from "@/variant-chess-lobby";
import { toast } from "sonner";
import { Clock, Users, Sword, Hourglass, PlusCircle, XCircle, AlertTriangle } from "lucide-react";

const LOCAL_LOBBIES_KEY = "chess-coach-local-lobbies";

const readStoredLobbies = (): LobbyRow[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_LOBBIES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as LobbyRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to parse local lobby storage", error);
    return [];
  }
};

const timeControls = [
  { id: "1+0", label: "Bullet 1+0", minutes: 1, increment: 0 },
  { id: "2+1", label: "Bullet 2+1", minutes: 2, increment: 1 },
  { id: "3+0", label: "Blitz 3+0", minutes: 3, increment: 0 },
  { id: "5+0", label: "Blitz 5+0", minutes: 5, increment: 0 },
  { id: "10+0", label: "Rapid 10+0", minutes: 10, increment: 0 },
  { id: "15+10", label: "Rapid 15+10", minutes: 15, increment: 10 },
  { id: "30+0", label: "Classique 30+0", minutes: 30, increment: 0 },
];

const eloLevels = [
  { id: "beginner", label: "Débutant (800-1200)" },
  { id: "intermediate", label: "Amateur (1200-1600)" },
  { id: "advanced", label: "Confirmé (1600-2000)" },
  { id: "expert", label: "Expert (2000-2400)" },
  { id: "master", label: "Maître (2400+)" },
];

type LobbyRow = {
  id: string;
  host_name: string;
  time_control: string;
  minutes: number;
  increment: number;
  elo_level: string | null;
  coaching_mode: boolean;
  status: string;
  opponent_name: string | null;
  created_at: string;
};

type VariantRow = Tables<'chess_variants'>;

type VariantLobbyEntry = {
  id: string;
  title: string;
  ruleId: string | null;
  description: string;
  rules: string;
  source: VariantRow['source'];
  difficulty: string | null;
  prompt: string | null;
  createdAt: string | null;
  displayOrder: number | null;
};

export default function Lobby() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hostName, setHostName] = useState("");
  const [selectedTime, setSelectedTime] = useState(timeControls[2].id);
  const [selectedElo, setSelectedElo] = useState(eloLevels[1].id);
  const [coachingMode, setCoachingMode] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'ai' | 'local'>('ai');
  const [localLobbies, setLocalLobbies] = useState<LobbyRow[]>(() => readStoredLobbies());
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [isVariantFallback, setIsVariantFallback] = useState(false);
  const [variantFallbackReason, setVariantFallbackReason] = useState<string | null>(null);

  const selectedTimeConfig = useMemo(
    () => timeControls.find((control) => control.id === selectedTime) ?? timeControls[0],
    [selectedTime]
  );
  const selectedEloConfig = useMemo(
    () => eloLevels.find((level) => level.id === selectedElo) ?? eloLevels[0],
    [selectedElo]
  );
  const variantQuery = useQuery<VariantRow[], Error>({
    queryKey: ["chess-variants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chess_variants")
        .select("*")
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as VariantRow[];
    },
  });

  const remoteVariants = useMemo<VariantLobbyEntry[]>(() => {
    if (!variantQuery.data) {
      return [];
    }

    return variantQuery.data.map((row) => ({
      id: row.id,
      title: row.title,
      ruleId: row.rule_id,
      description: row.summary,
      rules: row.rules,
      source: row.source,
      difficulty: row.difficulty ?? null,
      prompt: row.prompt ?? null,
      createdAt: row.created_at,
      displayOrder: row.display_order ?? null,
    }));
  }, [variantQuery.data]);

  const embeddedVariants = useMemo<VariantLobbyEntry[]>(
    () =>
      embeddedLobbyRooms.map((room, index) => ({
        id: room.ruleId,
        title: room.title,
        ruleId: room.ruleId,
        description: room.description,
        rules: room.description,
        source: 'builtin',
        difficulty: null,
        prompt: null,
        createdAt: null,
        displayOrder: index + 1,
      })),
    []
  );

  const variantRooms = remoteVariants.length > 0 ? remoteVariants : embeddedVariants;

  const selectedVariantData = useMemo(
    () => variantRooms.find((room) => room.id === selectedVariant) ?? null,
    [selectedVariant, variantRooms]
  );

  const selectedVariantRule = useMemo(
    () => (selectedVariantData?.ruleId ? getRuleById(selectedVariantData.ruleId) : null),
    [selectedVariantData?.ruleId]
  );

  const isVariantAutomated = Boolean(selectedVariantRule);
  const variantCount = variantRooms.length;
  const isGeneratedVariant = selectedVariantData?.source === 'generated';
  const isVariantRuleMissing = Boolean(selectedVariantData) && !selectedVariantData.ruleId;

  const isVariantLoading = variantQuery.isLoading && remoteVariants.length === 0;

  useEffect(() => {
    if (variantQuery.isError) {
      setIsVariantFallback(true);
      setVariantFallbackReason(
        variantQuery.error instanceof Error
          ? variantQuery.error.message
          : "Service des variantes indisponible."
      );
      return;
    }

    if (variantQuery.isSuccess) {
      if (remoteVariants.length > 0) {
        setIsVariantFallback(false);
        setVariantFallbackReason(null);
      } else {
        setIsVariantFallback(true);
        setVariantFallbackReason(
          "Aucune variante n'a encore été enregistrée dans la base. La liste embarquée est utilisée."
        );
      }
    }
  }, [variantQuery.isError, variantQuery.isSuccess, variantQuery.error, remoteVariants]);

  useEffect(() => {
    if (variantRooms.length === 0) {
      setSelectedVariant(null);
      return;
    }

    setSelectedVariant((previous) => {
      if (previous && variantRooms.some((room) => room.id === previous)) {
        return previous;
      }
      return variantRooms[0]?.id ?? null;
    });
  }, [variantRooms]);

  const persistLocalLobbies = useCallback((next: LobbyRow[]) => {
    setLocalLobbies(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_LOBBIES_KEY, JSON.stringify(next));
    }
  }, []);

  const applyLocalLobbyUpdate = useCallback(
    (updater: LobbyRow[] | ((prev: LobbyRow[]) => LobbyRow[])) => {
      setLocalLobbies((prev) => {
        const next = typeof updater === "function" ? (updater as (value: LobbyRow[]) => LobbyRow[])(prev) : updater;

        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_LOBBIES_KEY, JSON.stringify(next));
        }

        queryClient.setQueryData(["chess-lobbies"], next);
        return next;
      });
    },
    [queryClient],
  );

  const lobbyQuery = useQuery({
    queryKey: ["chess-lobbies"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("chess_lobbies")
          .select("*")
          .in("status", ["open", "matched"])
          .order("created_at", { ascending: false });

        if (error) {
          throw error;
        }

        const typed = (data ?? []) as LobbyRow[];
        persistLocalLobbies(typed);
        setIsFallback(false);
        setFallbackReason(null);
        return typed;
      } catch (error) {
        const stored = readStoredLobbies();
        setIsFallback(true);
        setFallbackReason(error instanceof Error ? error.message : "Service de lobby indisponible.");
        setLocalLobbies(stored);
        queryClient.setQueryData(["chess-lobbies"], stored);
        return stored;
      }
    },
  });

  const lobbyList = lobbyQuery.data ?? localLobbies;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_LOBBIES_KEY) {
        const updated = readStoredLobbies();
        setLocalLobbies(updated);
        queryClient.setQueryData(["chess-lobbies"], updated);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel("chess-lobby-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chess_lobbies" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chess-lobbies"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createLobbyMutation = useMutation({
    mutationFn: async () => {
      if (!hostName.trim()) {
        throw new Error("Veuillez renseigner votre pseudonyme.");
      }

      if (isFallback) {
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`;
        const newLobby: LobbyRow = {
          id,
          host_name: hostName.trim(),
          time_control: selectedTimeConfig.id,
          minutes: selectedTimeConfig.minutes,
          increment: selectedTimeConfig.increment,
          elo_level: selectedEloConfig.label,
          coaching_mode: coachingMode,
          status: "open",
          opponent_name: null,
          created_at: new Date().toISOString(),
        };

        applyLocalLobbyUpdate((prev) => [newLobby, ...prev]);
        return;
      }

      const { error } = await supabase.from("chess_lobbies").insert({
        host_name: hostName.trim(),
        time_control: selectedTimeConfig.id,
        minutes: selectedTimeConfig.minutes,
        increment: selectedTimeConfig.increment,
        elo_level: selectedEloConfig.label,
        coaching_mode: coachingMode,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Salon créé ! Les autres joueurs peuvent vous rejoindre.");
      setHostName("");
      if (!isFallback) {
        queryClient.invalidateQueries({ queryKey: ["chess-lobbies"] });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const joinLobby = async (lobby: LobbyRow) => {
    const playerName = window.prompt("Entrez votre pseudonyme pour rejoindre ce salon :");
    if (!playerName) {
      return;
    }

    const timeConfig = timeControls.find((control) => control.id === lobby.time_control);
    const timeLabel = timeConfig?.label ?? lobby.time_control;

    if (isFallback) {
      applyLocalLobbyUpdate((prev) =>
        prev.map((entry) =>
          entry.id === lobby.id
            ? { ...entry, status: "matched", opponent_name: playerName.trim() }
            : entry,
        ),
      );
    } else {
      const { error } = await supabase
        .from("chess_lobbies")
        .update({ status: "matched", opponent_name: playerName.trim() })
        .eq("id", lobby.id);

      if (error) {
        toast.error("Impossible de rejoindre le salon.");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["chess-lobbies"] });
    }

    toast.success("Salon rejoint ! Préparation de la partie...");

    const levelLabel = lobby.elo_level ?? "Libre";

    navigate("/game", {
      state: {
        timeControl: {
          name: timeLabel,
          time: lobby.time_control,
          minutes: lobby.minutes,
          increment: lobby.increment,
          description: "Partie depuis le lobby",
        },
        eloLevel: { name: levelLabel, elo: levelLabel, color: "bg-blue-500" },
        coachingMode: lobby.coaching_mode,
        lobbyId: lobby.id,
        hostName: lobby.host_name,
        opponentName: playerName.trim(),
      },
    });
  };

  const closeLobby = async (lobby: LobbyRow) => {
    const confirmClose = window.confirm("Voulez-vous fermer ce salon ?");
    if (!confirmClose) {
      return;
    }

    if (isFallback) {
      applyLocalLobbyUpdate((prev) => prev.filter((entry) => entry.id !== lobby.id));
    } else {
      const { error } = await supabase
        .from("chess_lobbies")
        .update({ status: "closed" })
        .eq("id", lobby.id);

      if (error) {
        toast.error("Impossible de fermer le salon.");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["chess-lobbies"] });
    }

    toast.success("Salon fermé.");
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-board opacity-90" />
      <div className="relative z-10 container mx-auto px-6 py-12 space-y-10">
        <div className="flex items-center justify-between flex-col lg:flex-row gap-6">
          <div className="space-y-2">
            <Badge variant="outline" className="uppercase tracking-widest text-chess-gold">
              Lobby multijoueur
            </Badge>
            <h1 className="text-4xl lg:text-5xl font-bold gradient-chess bg-clip-text text-transparent">
              Rejoignez un salon d'échecs 3D
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Créez un salon pour inviter un ami ou rejoignez une partie existante. Lorsque le salon est rempli, la partie se
              lance automatiquement contre notre IA ou votre adversaire selon vos préférences.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")} className="hover-lift">
            Retour à l'accueil
          </Button>
        </div>

        <div className="grid lg:grid-cols-[420px,1fr] gap-8">
          <Card className="p-6 gradient-card border-chess space-y-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-chess-gold flex items-center gap-2">
                <PlusCircle className="w-5 h-5" />
                Créer un salon
              </h2>
              <p className="text-sm text-muted-foreground">
                Configurez le rythme de jeu et attendez que votre ami vous rejoigne.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="host-name">Votre pseudonyme</Label>
                <Input
                  id="host-name"
                  placeholder="Capablanca42"
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Cadence</Label>
                <Select value={selectedTime} onValueChange={setSelectedTime}>
                  <SelectTrigger className="bg-background/80">
                    <SelectValue placeholder="Choisissez une cadence" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeControls.map((control) => (
                      <SelectItem key={control.id} value={control.id}>
                        {control.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Niveau souhaité</Label>
                <Select value={selectedElo} onValueChange={setSelectedElo}>
                  <SelectTrigger className="bg-background/80">
                    <SelectValue placeholder="Sélectionnez un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    {eloLevels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-background/60">
                <div>
                  <p className="font-medium">Mode coaching</p>
                  <p className="text-xs text-muted-foreground">
                    Activez pour obtenir des conseils IA pendant la partie.
                  </p>
                </div>
                <Switch checked={coachingMode} onCheckedChange={setCoachingMode} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-background/60">
                <div>
                  <p className="font-medium">Type de partie</p>
                  <p className="text-xs text-muted-foreground">
                    {gameMode === 'ai' ? 'Jouer contre l\'IA' : 'Partie locale (2 joueurs)'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={gameMode === 'ai' ? 'default' : 'outline'}
                    onClick={() => setGameMode('ai')}
                  >
                    vs IA
                  </Button>
                  <Button
                    size="sm"
                    variant={gameMode === 'local' ? 'default' : 'outline'}
                    onClick={() => setGameMode('local')}
                  >
                    Local
                  </Button>
                </div>
              </div>
            </div>

            <Button
              className="w-full hover-lift"
              variant="chess"
              disabled={createLobbyMutation.isPending}
              onClick={() => createLobbyMutation.mutate()}
            >
              {createLobbyMutation.isPending ? "Création..." : "Ouvrir le salon"}
            </Button>
          </Card>

          <div className="space-y-8">
            <Card className="p-6 gradient-card border-chess">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-chess-gold" />
                  <h2 className="text-2xl font-semibold text-chess-gold">Salons disponibles</h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => lobbyQuery.refetch()} className="hover-lift">
                  Rafraîchir
                </Button>
              </div>

              {isFallback && (
                <Alert className="mb-6 border-chess-gold/50 bg-chess-gold/10 text-foreground">
                  <AlertTriangle className="h-5 w-5 text-chess-gold" />
                  <AlertTitle className="text-sm font-semibold text-chess-gold">Mode local activé</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                    La connexion au lobby en ligne est indisponible. Vos salons sont enregistrés dans le stockage local et
                    synchronisés entre les onglets ouverts de ce navigateur.
                    {fallbackReason && (
                      <span className="mt-2 block text-[11px] text-muted-foreground/80">
                        Détail&nbsp;: {fallbackReason}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {lobbyQuery.isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((skeleton) => (
                    <Skeleton key={skeleton} className="h-24 w-full bg-background/50" />
                  ))}
                </div>
              ) : lobbyQuery.isError ? (
                <div className="p-6 text-center text-muted-foreground">
                  Impossible de charger les salons. Veuillez réessayer plus tard.
                </div>
              ) : lobbyList.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground bg-background/40 rounded-lg border border-border">
                  Aucun salon disponible pour le moment. Créez le vôtre pour inviter d'autres joueurs !
                </div>
              ) : (
                <div className="space-y-4">
                  {lobbyList.map((lobby) => (
                    <div
                      key={lobby.id}
                      className="p-5 rounded-xl border border-border bg-background/60 hover:bg-background/80 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {new Intl.DateTimeFormat("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(lobby.created_at))}
                          </div>
                          <h3 className="text-xl font-semibold text-chess-gold">
                            {lobby.host_name} cherche un adversaire
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Hourglass className="w-3 h-3" />
                              {lobby.time_control}
                            </Badge>
                            {lobby.elo_level && <Badge variant="secondary">{lobby.elo_level}</Badge>}
                            {lobby.coaching_mode && (
                              <Badge variant="default" className="bg-accent text-background">
                                Coaching IA
                              </Badge>
                            )}
                            {lobby.status === "matched" && lobby.opponent_name && (
                              <Badge variant="default" className="bg-primary text-background">
                                {lobby.opponent_name} a rejoint
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {lobby.status === "open" && (
                            <Button className="hover-lift" onClick={() => joinLobby(lobby)}>
                              <Sword className="w-4 h-4 mr-2" />
                              Rejoindre
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className="hover-lift"
                            onClick={() => closeLobby(lobby)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Fermer
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6 gradient-card border-chess space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sword className="w-6 h-6 text-chess-gold" />
                  <h2 className="text-2xl font-semibold text-chess-gold">Variantes du lobby</h2>
                </div>
                <Badge variant="outline" className="text-xs uppercase tracking-widest text-chess-gold">
                  {variantCount} salons
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Explorez les variantes disponibles : celles du catalogue embarqué et celles générées via l’outil IA.
                Sélectionnez une variante pour lancer une partie adaptée à votre style.
              </p>

              {isVariantFallback && (
                <Alert className="border-chess-gold/40 bg-chess-gold/10 text-foreground">
                  <AlertTriangle className="h-5 w-5 text-chess-gold" />
                  <AlertTitle className="text-sm font-semibold text-chess-gold">
                    Liste de variantes embarquée
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                    {variantFallbackReason ?? "La connexion au service distant est indisponible. Les variantes intégrées sont affichées par défaut."}
                  </AlertDescription>
                </Alert>
              )}

              {isVariantLoading ? (
                <div className="p-10 text-center text-muted-foreground bg-background/40 rounded-lg border border-border">
                  Chargement des variantes...
                </div>
              ) : variantRooms.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground bg-background/40 rounded-lg border border-border">
                  Aucune variante n’est disponible pour le moment. Générez-en une depuis l’outil ou réessayez plus tard.
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-[280px,1fr]">
                  <ScrollArea className="max-h-[420px] rounded-xl border border-border bg-background/40">
                    <div className="p-2 space-y-2">
                      {variantRooms.map((room) => {
                        const isSelected = selectedVariant === room.id;
                        const createdLabel = room.createdAt
                          ? new Intl.DateTimeFormat("fr-FR", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(room.createdAt))
                          : null;
                        return (
                          <button
                            type="button"
                            key={room.id}
                            onClick={() => setSelectedVariant(room.id)}
                            className={`w-full text-left rounded-lg px-4 py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-gold/70 ${
                              isSelected
                                ? 'bg-chess-gold/20 border border-chess-gold/60 shadow-lg shadow-chess-gold/20'
                                : 'bg-background/60 border border-transparent hover:border-chess-gold/40 hover:bg-background/80'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-semibold ${isSelected ? 'text-chess-gold' : 'text-chess-gold/80'}`}>
                                {room.title}
                              </span>
                              <div className="flex items-center gap-2">
                                {room.source === 'generated' && (
                                  <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                                    IA
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="inline-flex items-center rounded-full border border-chess-gold/50 bg-chess-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-chess-gold">
                                    Sélectionné
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                              {room.description}
                            </p>
                            {createdLabel && (
                              <p className="mt-2 text-[10px] text-muted-foreground/80">Ajoutée le {createdLabel}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="relative overflow-hidden rounded-xl border border-chess-gold/40 bg-gradient-to-br from-chess-gold/15 via-background/30 to-background/60 p-6 shadow-inner">
                    {selectedVariantData ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Badge variant="default" className="bg-chess-gold text-background shadow-md shadow-chess-gold/40">
                            {selectedVariantData.title}
                          </Badge>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {selectedVariantData.description}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-chess-gold/40 bg-background/70 px-3 py-1 font-semibold uppercase tracking-wide text-chess-gold">
                            Source&nbsp;: {isGeneratedVariant ? 'IA' : 'Catalogue' }
                          </span>
                          <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-medium">
                            {selectedVariantData.ruleId
                              ? `Règle : ${selectedVariantData.ruleId}`
                              : 'Automatisation : manuelle'}
                          </span>
                          {selectedVariantData.difficulty && (
                            <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-medium">
                              Difficulté&nbsp;: {selectedVariantData.difficulty}
                            </span>
                          )}
                          <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-medium">
                            Cadence&nbsp;: {selectedTimeConfig.label}
                          </span>
                          <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-medium">
                            Mode&nbsp;: {gameMode === 'ai' ? 'vs IA' : 'Local'}
                          </span>
                        </div>
                        {(!isVariantAutomated || isVariantRuleMissing) && (
                          <Alert className="border-amber-300/60 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                            <AlertTriangle className="h-5 w-5" />
                            <AlertTitle className="text-sm font-semibold">Variante descriptive</AlertTitle>
                            <AlertDescription className="text-xs leading-relaxed">
                              Cette variante ne possède pas encore de règles automatisées. La partie démarrera avec les règles
                              classiques : suivez les instructions du texte généré pour pimenter la partie.
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {selectedVariantData.rules}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            className="hover-lift"
                            variant="chess"
                            onClick={() => {
                              navigate("/game", {
                                state: {
                                  timeControl: {
                                    name: selectedTimeConfig.label,
                                    time: selectedTimeConfig.id,
                                    minutes: selectedTimeConfig.minutes,
                                    increment: selectedTimeConfig.increment,
                                    description: "Partie avec variante",
                                  },
                                  eloLevel: { name: selectedEloConfig.label, elo: selectedEloConfig.label, color: "bg-blue-500" },
                                  coachingMode: false,
                                  gameMode: gameMode,
                                  variant: selectedVariantData,
                                },
                              });
                            }}
                            disabled={!selectedVariantData}
                          >
                            {isVariantAutomated ? 'Lancer cette variante' : 'Lancer (règles classiques)'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                        Sélectionnez une variante dans la liste pour afficher les détails.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
