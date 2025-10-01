import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { lobbyRooms as variantLobbyRooms } from "@/variant-chess-lobby";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Clock, Users, Sword, Hourglass, PlusCircle, XCircle } from "lucide-react";

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

const LOCAL_LOBBY_STORAGE_KEY = "cc3d-local-chess-lobbies";
const LOCAL_LOBBY_EVENT = "cc3d-local-lobbies-update";

const generateLobbyId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lobby-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isSchemaCacheError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = "message" in error ? String((error as { message?: string }).message || "") : "";
  return message.toLowerCase().includes("schema cache");
};

const readLocalLobbies = (): LobbyRow[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_LOBBY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as LobbyRow[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    console.warn("Impossible de lire les salons locaux", error);
    return [];
  }
};

const persistLocalLobbies = (lobbies: LobbyRow[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_LOBBY_STORAGE_KEY, JSON.stringify(lobbies));
  window.dispatchEvent(new Event(LOCAL_LOBBY_EVENT));
};

const upsertLocalLobby = (lobby: LobbyRow) => {
  const current = readLocalLobbies();
  const updated = [lobby, ...current.filter((item) => item.id !== lobby.id)];
  persistLocalLobbies(updated);
  return lobby;
};

const patchLocalLobby = (id: string, patch: Partial<LobbyRow>) => {
  const current = readLocalLobbies();
  const updated = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
  persistLocalLobbies(updated);
  return updated.find((item) => item.id === id) ?? null;
};

export default function Lobby() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hostName, setHostName] = useState("");
  const [selectedTime, setSelectedTime] = useState(timeControls[2].id);
  const [selectedElo, setSelectedElo] = useState(eloLevels[1].id);
  const [coachingMode, setCoachingMode] = useState(false);
  const [useLocalData, setUseLocalData] = useState(false);
  const [schemaErrorMessage, setSchemaErrorMessage] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<(typeof variantLobbyRooms)[number] | null>(null);

  const syncLocalLobbies = useCallback(() => {
    queryClient.setQueryData(["chess-lobbies", true], readLocalLobbies());
  }, [queryClient]);

  const invalidateLobbyQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "chess-lobbies",
    });
  }, [queryClient]);

  const selectedTimeConfig = useMemo(
    () => timeControls.find((control) => control.id === selectedTime) ?? timeControls[0],
    [selectedTime]
  );
  const selectedEloConfig = useMemo(
    () => eloLevels.find((level) => level.id === selectedElo) ?? eloLevels[0],
    [selectedElo]
  );

  const lobbyQuery = useQuery({
    queryKey: ["chess-lobbies", useLocalData],
    queryFn: async () => {
      if (useLocalData) {
        return readLocalLobbies();
      }

      const { data, error } = await supabase
        .from("chess_lobbies")
        .select("*")
        .in("status", ["open", "matched"])
        .order("created_at", { ascending: false });

      if (error) {
        if (isSchemaCacheError(error)) {
          if (!useLocalData) {
            setUseLocalData(true);
            setSchemaErrorMessage(error.message);
            toast.warning(
              "Connexion Supabase indisponible. Les salons sont désormais enregistrés uniquement sur cet appareil."
            );
          }
          return readLocalLobbies();
        }
        throw error;
      }

      setSchemaErrorMessage(null);

      return (data as LobbyRow[]) ?? [];
    },
  });

  useEffect(() => {
    if (useLocalData) {
      if (typeof window === "undefined") {
        return;
      }

      const handleStorage = (event: StorageEvent) => {
        if (event.key === LOCAL_LOBBY_STORAGE_KEY) {
          syncLocalLobbies();
        }
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(LOCAL_LOBBY_EVENT, syncLocalLobbies);

      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(LOCAL_LOBBY_EVENT, syncLocalLobbies);
      };
    }

    const channel = supabase
      .channel("chess-lobby-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chess_lobbies" },
        () => {
          invalidateLobbyQueries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateLobbyQueries, syncLocalLobbies, useLocalData]);

  const createLobbyMutation = useMutation({
    mutationFn: async (): Promise<{ lobby: LobbyRow; usedLocal: boolean }> => {
      if (!hostName.trim()) {
        throw new Error("Veuillez renseigner votre pseudonyme.");
      }

      const basePayload = {
        host_name: hostName.trim(),
        time_control: selectedTimeConfig.id,
        minutes: selectedTimeConfig.minutes,
        increment: selectedTimeConfig.increment,
        elo_level: selectedEloConfig.label,
        coaching_mode: coachingMode,
      };

      if (useLocalData) {
        const newLobby: LobbyRow = {
          id: generateLobbyId(),
          created_at: new Date().toISOString(),
          opponent_name: null,
          status: "open",
          ...basePayload,
        };
        upsertLocalLobby(newLobby);
        return { lobby: newLobby, usedLocal: true };
      }

      const { data, error } = await supabase
        .from("chess_lobbies")
        .insert(basePayload)
        .select()
        .single<LobbyRow>();

      if (error || !data) {
        if (error && isSchemaCacheError(error)) {
          setUseLocalData(true);
          setSchemaErrorMessage(error.message);
          toast.warning(
            "Impossible de joindre la base Supabase. Un mode local est activé pour ce salon."
          );
          const newLobby: LobbyRow = {
            id: generateLobbyId(),
            created_at: new Date().toISOString(),
            opponent_name: null,
            status: "open",
            ...basePayload,
          };
          upsertLocalLobby(newLobby);
          return { lobby: newLobby, usedLocal: true };
        }

        throw error ?? new Error("Création du salon impossible.");
      }

      return { lobby: data, usedLocal: false };
    },
    onSuccess: (result) => {
      toast.success("Salon créé ! Les autres joueurs peuvent vous rejoindre.");
      setHostName("");
      if (result.usedLocal || useLocalData) {
        syncLocalLobbies();
      } else {
        invalidateLobbyQueries();
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

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      toast.error("Veuillez renseigner un pseudonyme valide.");
      return;
    }

    const timeConfig = timeControls.find((control) => control.id === lobby.time_control);
    const timeLabel = timeConfig?.label ?? lobby.time_control;

    let updatedLobby: LobbyRow | null = null;
    let switchedToLocal = false;

    if (useLocalData) {
      updatedLobby = patchLocalLobby(lobby.id, { status: "matched", opponent_name: trimmedName });
      if (!updatedLobby) {
        toast.error("Impossible de rejoindre le salon local.");
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("chess_lobbies")
        .update({ status: "matched", opponent_name: trimmedName })
        .eq("id", lobby.id)
        .select()
        .single<LobbyRow>();

      if (error || !data) {
        if (error && isSchemaCacheError(error)) {
          setUseLocalData(true);
          setSchemaErrorMessage(error.message);
          toast.warning(
            "Connexion Supabase indisponible. Bascule vers un salon stocké localement."
          );
          updatedLobby = patchLocalLobby(lobby.id, { status: "matched", opponent_name: trimmedName });
          switchedToLocal = true;
        } else {
          toast.error("Impossible de rejoindre le salon.");
          return;
        }
      } else {
        updatedLobby = data;
      }
    }

    if (!updatedLobby) {
      toast.error("Le salon n'a pas pu être mis à jour.");
      return;
    }

    if (useLocalData || switchedToLocal) {
      syncLocalLobbies();
    } else {
      invalidateLobbyQueries();
    }

    toast.success("Salon rejoint ! Préparation de la partie...");

    const levelLabel = updatedLobby.elo_level ?? "Libre";

    navigate("/game", {
      state: {
        timeControl: {
          name: timeLabel,
          time: updatedLobby.time_control,
          minutes: updatedLobby.minutes,
          increment: updatedLobby.increment,
          description: "Partie depuis le lobby",
        },
        eloLevel: { name: levelLabel, elo: levelLabel, color: "bg-blue-500" },
        coachingMode: updatedLobby.coaching_mode,
        lobbyId: updatedLobby.id,
        hostName: updatedLobby.host_name,
        opponentName: trimmedName,
      },
    });
  };

  const closeLobby = async (lobby: LobbyRow) => {
    const confirmClose = window.confirm("Voulez-vous fermer ce salon ?");
    if (!confirmClose) {
      return;
    }

    let switchedToLocal = false;

    if (useLocalData) {
      patchLocalLobby(lobby.id, { status: "closed" });
      syncLocalLobbies();
    } else {
      const { error } = await supabase
        .from("chess_lobbies")
        .update({ status: "closed" })
        .eq("id", lobby.id);

      if (error) {
        if (isSchemaCacheError(error)) {
          setUseLocalData(true);
          setSchemaErrorMessage(error.message);
          toast.warning(
            "Connexion Supabase indisponible. Fermeture appliquée en local uniquement."
          );
          switchedToLocal = true;
          patchLocalLobby(lobby.id, { status: "closed" });
        } else {
          toast.error("Impossible de fermer le salon.");
          return;
        }
      } else {
        invalidateLobbyQueries();
      }
    }

    if (useLocalData || switchedToLocal) {
      syncLocalLobbies();
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

              {schemaErrorMessage && (
                <Alert className="mb-4 border-dashed border-chess-gold/40 bg-background/60">
                  <AlertTitle className="flex items-center gap-2 text-chess-gold">
                    Mode local activé
                  </AlertTitle>
                  <AlertDescription className="text-sm text-muted-foreground">
                    Les salons sont enregistrés uniquement sur cet appareil car Supabase a renvoyé :
                    <span className="block font-medium text-foreground mt-1">{schemaErrorMessage}</span>
                    Vous pouvez continuer à tester l'interface, mais les autres joueurs ne verront pas ces salons.
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
              ) : lobbyQuery.data.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground bg-background/40 rounded-lg border border-border">
                  Aucun salon disponible pour le moment. Créez le vôtre pour inviter d'autres joueurs !
                </div>
              ) : (
                <div className="space-y-4">
                  {lobbyQuery.data.map((lobby) => (
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
                  {variantLobbyRooms.length} salons
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Découvrez les 30 variantes disponibles : chaque salon applique une règle spéciale qui transforme votre
                façon de jouer. Sélectionnez simplement une salle pour lancer une partie avec cette variante.
              </p>
              <ScrollArea className="h-[420px] pr-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {variantLobbyRooms.map((room) => {
                    const isSelected = selectedVariant?.id === room.id;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setSelectedVariant(room)}
                        className={cn(
                          "text-left p-4 rounded-xl border bg-background/60 transition-all hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-gold focus-visible:ring-offset-2",
                          isSelected
                            ? "border-chess-gold shadow-lg shadow-chess-gold/20"
                            : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg font-semibold text-chess-gold">{room.title}</h3>
                          {isSelected && <Badge variant="secondary">Sélectionné</Badge>}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{room.description}</p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="rounded-lg border border-dashed border-border bg-background/60 p-4">
                {selectedVariant ? (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-chess-gold">Variante sélectionnée</p>
                    <h3 className="text-lg font-semibold text-foreground">{selectedVariant.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedVariant.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Lancer la partie avec cette règle personnalisée sera possible une fois votre moteur de variantes intégré.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Cliquez sur une variante pour la surligner, mémoriser sa description et préparer votre prochaine partie.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
