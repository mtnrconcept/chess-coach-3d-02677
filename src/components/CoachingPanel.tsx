import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, MessageCircle, Trophy, AlertCircle } from "lucide-react";
import useSpeechSynthesis from "@/hooks/use-speech";

interface CoachingPanelProps {
  comment: string;
}

export function CoachingPanel({ comment }: CoachingPanelProps) {
  useSpeechSynthesis(comment.includes("Analyse en cours") ? "" : comment);
  const getCommentType = (text: string) => {
    if (text.includes("Excellent") || text.includes("Parfait") || text.includes("Bonne")) {
      return { icon: Trophy, color: "text-green-400", bg: "bg-green-500/10", label: "Excellent" };
    }
    if (text.includes("Attention") || text.includes("passif")) {
      return { icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Attention" };
    }
    if (text.includes("IA:")) {
      return { icon: Brain, color: "text-blue-400", bg: "bg-blue-500/10", label: "Analyse IA" };
    }
    return { icon: MessageCircle, color: "text-primary", bg: "bg-primary/10", label: "Conseil" };
  };

  const { icon: Icon, color, bg, label } = getCommentType(comment);

  return (
    <Card className={`p-4 gradient-card border-chess ${bg}`}>
      <div className="flex items-start gap-3 mb-3">
        <Icon className={`w-5 h-5 ${color} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Coach IA</span>
            <Badge variant="outline" className={`text-xs ${color}`}>
              {label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="text-sm leading-relaxed">
        {comment || "Analysez vos coups et ceux de l'adversaire pour progresser..."}
      </div>

      {/* Coaching tips */}
      <div className="mt-4 pt-3 border-t border-border/30">
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-primary" />
            <span>Principes : Développement, Sécurité du roi, Contrôle du centre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-accent" />
            <span>Cherchez les tactiques : Fourchettes, Clouages, Découvertes</span>
          </div>
        </div>
      </div>

      {/* Animated thinking indicator */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex space-x-1">
          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0s' }}></div>
          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
        <span className="text-xs text-muted-foreground">Analyse en temps réel</span>
      </div>
    </Card>
  );
}