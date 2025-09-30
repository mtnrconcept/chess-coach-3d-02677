import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, Brain, Trophy } from "lucide-react";

const timeControls = [
  { name: "Bullet", time: "1+0", minutes: 1, icon: Zap, description: "Ultra rapide" },
  { name: "Bullet", time: "2+1", minutes: 2, icon: Zap, description: "Très rapide" },
  { name: "Blitz", time: "3+0", minutes: 3, icon: Clock, description: "Rapide" },
  { name: "Blitz", time: "5+0", minutes: 5, icon: Clock, description: "Classique" },
  { name: "Rapid", time: "10+0", minutes: 10, icon: Brain, description: "Réflexion" },
  { name: "Rapid", time: "15+10", minutes: 15, icon: Brain, description: "Confortable" },
  { name: "Rapid", time: "30+0", minutes: 30, icon: Trophy, description: "Professionnel" },
  { name: "Classical", time: "60+0", minutes: 60, icon: Trophy, description: "Tournoi" },
];

const eloLevels = [
  { name: "Débutant", elo: "800-1200", color: "bg-green-500", difficulty: "easy" },
  { name: "Amateur", elo: "1200-1600", color: "bg-blue-500", difficulty: "medium" },
  { name: "Confirmé", elo: "1600-2000", color: "bg-purple-500", difficulty: "hard" },
  { name: "Expert", elo: "2000-2400", color: "bg-orange-500", difficulty: "expert" },
  { name: "Maître", elo: "2400+", color: "bg-red-500", difficulty: "master" },
];

export default function ChessHome() {
  const navigate = useNavigate();
  const [selectedTime, setSelectedTime] = useState(timeControls[3]);
  const [selectedElo, setSelectedElo] = useState(eloLevels[1]);
  const [isCoachingMode, setIsCoachingMode] = useState(false);

  const handleStartGame = () => {
    // Only pass serializable data to navigate state to avoid History pushState errors
    const { name, time, minutes, description } = selectedTime;

    navigate("/game", {
      state: {
        timeControl: { name, time, minutes, description },
        // Spread to ensure we're passing a plain serializable object
        eloLevel: { ...selectedElo },
        coachingMode: isCoachingMode
      }
    });
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-board opacity-90" />
      
      {/* Animated chess pieces background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 text-6xl text-chess-gold opacity-20 animate-pulse-gold">♛</div>
        <div className="absolute top-40 right-32 text-5xl text-chess-silver opacity-15 animate-pulse-gold" style={{ animationDelay: '0.5s' }}>♞</div>
        <div className="absolute bottom-32 left-32 text-7xl text-chess-gold opacity-10 animate-pulse-gold" style={{ animationDelay: '1s' }}>♜</div>
        <div className="absolute bottom-20 right-20 text-6xl text-chess-silver opacity-20 animate-pulse-gold" style={{ animationDelay: '1.5s' }}>♝</div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="text-6xl font-bold mb-4 gradient-chess bg-clip-text text-transparent">
            Échecs 3D Royaux
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Maîtrisez l'art des échecs dans un environnement 3D immersif avec intelligence artificielle avancée
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8">
          {/* Mode de jeu */}
          <Card className="p-8 gradient-card border-chess glow-effect animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-2xl font-bold mb-6 text-chess-gold flex items-center gap-3">
              <Clock className="w-7 h-7" />
              Contrôle du Temps
            </h2>
            
            <div className="grid grid-cols-2 gap-3 mb-8">
              {timeControls.map((control, index) => {
                const Icon = control.icon;
                return (
                  <div
                    key={index}
                    onClick={() => setSelectedTime(control)}
                    className={`p-4 rounded-lg cursor-pointer transition-all hover-lift ${
                      selectedTime === control
                        ? 'bg-primary/20 border-primary border-2 animate-board-glow'
                        : 'bg-secondary/50 border border-border hover:bg-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm">{control.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{control.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Mode coaching */}
            <div className="border-t border-border pt-6">
              <div
                onClick={() => setIsCoachingMode(!isCoachingMode)}
                className={`p-4 rounded-lg cursor-pointer transition-all hover-lift ${
                  isCoachingMode
                    ? 'bg-accent/20 border-accent border-2 animate-board-glow'
                    : 'bg-secondary/50 border border-border hover:bg-secondary'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Brain className="w-5 h-5 text-accent" />
                  <span className="font-semibold">Mode Coaching</span>
                  <Badge variant={isCoachingMode ? "default" : "secondary"}>
                    {isCoachingMode ? "Activé" : "Désactivé"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  L'IA commente chaque coup : ouvertures, tactiques, erreurs
                </p>
              </div>
            </div>
          </Card>

          {/* Niveau de difficulté */}
          <Card className="p-8 gradient-card border-chess glow-effect animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <h2 className="text-2xl font-bold mb-6 text-chess-gold flex items-center gap-3">
              <Trophy className="w-7 h-7" />
              Niveau ELO
            </h2>
            
            <div className="space-y-3">
              {eloLevels.map((level, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedElo(level)}
                  className={`p-4 rounded-lg cursor-pointer transition-all hover-lift ${
                    selectedElo === level
                      ? 'bg-primary/20 border-primary border-2 animate-board-glow'
                      : 'bg-secondary/50 border border-border hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${level.color}`} />
                      <span className="font-semibold">{level.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {level.elo}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {isCoachingMode && (
              <div className="mt-6 p-4 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-sm text-accent font-medium mb-2">Mode Coaching Actif</p>
                <p className="text-xs text-muted-foreground">
                  L'ordinateur sera réglé au niveau Maître pour des analyses précises
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Bouton de démarrage */}
        <div className="text-center mt-12 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          <Button
            onClick={handleStartGame}
            variant="chess"
            size="xl"
            className="hover-lift glow-effect"
          >
            <Trophy className="w-6 h-6 mr-3" />
            Commencer la Partie
          </Button>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Partie : {selectedTime.time} • 
            Niveau : {isCoachingMode ? "Maître (Coaching)" : selectedElo.name} • 
            Mode : {isCoachingMode ? "Coaching" : "Standard"}
          </div>
        </div>
      </div>
    </div>
  );
}