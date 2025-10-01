import { useEffect, useMemo, useState } from "react";
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
import { lobbyRooms as variantLobbyRooms } from "@/variant-chess-lobby";
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

export default function Lobby() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hostName, setHostName] = useState("");
  const [selectedTime, setSelectedTime] = useState(timeControls[2].id);
  const [selectedElo, setSelectedElo] = useState(eloLevels[1].id);
  const [coachingMode, setCoachingMode] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'ai' | 'local'>('ai');

  const selectedTimeConfig = useMemo(
    () => timeControls.find((control) => control.id === selectedTime) ?? timeControls[0],
    [selectedTime]
  );
  const selectedEloConfig = useMemo(
    () => eloLevels.find((level) => level.id === selectedElo) ?? eloLevels[0],
    [selectedElo]
  );

  const lobbyQuery = useQuery({
    queryKey: ["chess-lobbies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chess_lobbies")
        .select("*")
        .in("status", ["open", "matched"])
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data as LobbyRow[];
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["chess-lobbies"] });
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

    const { error } = await supabase
      .from("chess_lobbies")
      .update({ status: "matched", opponent_name: playerName.trim() })
      .eq("id", lobby.id);

    if (error) {
      toast.error("Impossible de rejoindre le salon.");
      return;
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

    const { error } = await supabase
      .from("chess_lobbies")
      .update({ status: "closed" })
      .eq("id", lobby.id);

    if (error) {
      toast.error("Impossible de fermer le salon.");
      return;
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
                  {variantLobbyRooms?.length || 0} salons
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Découvrez les 30 variantes disponibles : chaque salon applique une règle spéciale qui transforme votre
                façon de jouer. Sélectionnez une variante pour lancer une partie.
              </p>
              
              {selectedVariant && (
                <div className="flex items-center gap-3 p-4 bg-chess-gold/10 border border-chess-gold/30 rounded-lg">
                  <Badge variant="default" className="bg-chess-gold text-background">
                    {variantLobbyRooms?.find(r => r.id === selectedVariant)?.title}
                  </Badge>
                  <Button 
                    className="ml-auto hover-lift" 
                    variant="chess"
                    onClick={() => {
                      const variant = variantLobbyRooms?.find(r => r.id === selectedVariant);
                      if (!variant) return;
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
                          variant: variant,
                        },
                      });
                    }}
                  >
                    Lancer la partie
                  </Button>
                </div>
              )}

              <ScrollArea className="max-h-[420px] pr-4">
                {!variantLobbyRooms || variantLobbyRooms.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground bg-background/40 rounded-lg border border-border">
                    Chargement des variantes...
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {variantLobbyRooms.map((room) => (
                      <div
                        key={room.id}
                        onClick={() => setSelectedVariant(room.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedVariant === room.id
                            ? 'border-chess-gold bg-chess-gold/20 ring-2 ring-chess-gold/50'
                            : 'border-border bg-background/60 hover:bg-background/80 hover:border-chess-gold/50'
                        }`}
                      >
                        <h3 className={`text-lg font-semibold ${
                          selectedVariant === room.id ? 'text-chess-gold' : 'text-chess-gold/80'
                        }`}>
                          {room.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{room.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
