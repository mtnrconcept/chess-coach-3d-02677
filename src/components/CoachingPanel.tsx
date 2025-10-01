import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, MessageCircle, Trophy, AlertCircle, Sparkles } from "lucide-react";
import useSpeechSynthesis from "@/hooks/use-speech";
import type { CoachingInsights } from "@/lib/chessAnalysis";
import { getCoachLanguageConfig, type CoachLanguage } from "@/lib/coachLanguage";

interface CoachingPanelProps {
  comment: string;
  analysis?: CoachingInsights | null;
  isAnalyzing?: boolean;
  language: CoachLanguage;
  isEnabled: boolean;
}

export function CoachingPanel({ comment, analysis, isAnalyzing, language, isEnabled }: CoachingPanelProps) {
  const config = getCoachLanguageConfig(language);
  const spokenText = isEnabled ? analysis?.voiceLine ?? comment ?? config.defaultComment : "";

  useSpeechSynthesis(spokenText, {
    voicePreferences: config.speech.voicePreferences,
    rate: config.speech.rate,
    pitch: config.speech.pitch,
    volume: config.speech.volume,
  });

  const getCommentType = () => {
    if (isAnalyzing) {
      return { icon: Brain, color: "text-blue-400", bg: "bg-blue-500/10", label: config.statuses.analyzing };
    }
    if (analysis?.engineAdvice) {
      return { icon: Brain, color: "text-sky-400", bg: "bg-sky-500/10", label: config.statuses.expert };
    }
    if (analysis?.riskWarnings?.length) {
      return { icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-500/10", label: config.statuses.warning };
    }
    if (analysis?.advantage === "white" || analysis?.advantage === "black") {
      return { icon: Trophy, color: "text-emerald-400", bg: "bg-emerald-500/10", label: config.statuses.advantage };
    }
    return { icon: MessageCircle, color: "text-primary", bg: "bg-primary/10", label: config.statuses.advice };
  };

  const { icon: Icon, color, bg, label } = getCommentType();
  const evaluationPercent = analysis ? Math.max(0, Math.min(100, Math.round(50 + analysis.evaluation * 10))) : 50;
  const evaluationLabel = analysis?.evaluationLabel ?? config.evaluationHeading;
  const defaultComment = comment || config.defaultComment;
  const mainMessage = analysis?.comment ?? (isAnalyzing ? config.analyzingFooter : defaultComment);

  const moveCountLabel = (count: number) => `${count} ${count > 1 ? config.moveWord.plural : config.moveWord.singular}`;

  return (
    <Card className={`p-4 gradient-card border-chess ${bg}`}>
      <div className="flex items-start gap-3 mb-3">
        <Icon className={`w-5 h-5 ${color} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">{config.coachTitle}</span>
            <Badge variant="outline" className={`text-xs ${color}`}>
              {label}
            </Badge>
          </div>
          {analysis?.opening && (
            <div className="flex items-start justify-between rounded-md bg-background/60 px-3 py-2 text-xs">
              <div>
                <p className="font-medium">{analysis.opening.name}{analysis.opening.variation ? ` (${analysis.opening.variation})` : ""}</p>
                <p className="text-muted-foreground">
                  {analysis.opening.eco} • {moveCountLabel(analysis.opening.matchedMoves)}
                </p>
              </div>
              <Badge variant="secondary" className="ml-2">
                {config.phaseLabels[analysis.gamePhase]}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="text-sm leading-relaxed">
        {analysis?.engineAdvice && analysis.baseComment !== analysis.comment && (
          <div className="mb-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{config.instantAnalysisPrefix}</span> {analysis.baseComment}
          </div>
        )}
        {mainMessage || config.defaultComment}
      </div>

      {analysis && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>{config.evaluationHeading}</span>
            <span
              className={
                analysis.advantage === "white"
                  ? "text-emerald-400"
                  : analysis.advantage === "black"
                    ? "text-rose-400"
                    : "text-muted-foreground"
              }
            >
              {evaluationLabel} ({analysis.evaluation >= 0 ? "+" : ""}{analysis.evaluation.toFixed(2)})
            </span>
          </div>
          <Progress value={evaluationPercent} className="h-2 mt-2" />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
            <span>{config.evaluationScale.black}</span>
            <span>{config.evaluationScale.balanced}</span>
            <span>{config.evaluationScale.white}</span>
          </div>
        </div>
      )}

      {analysis?.tacticHighlight && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <Sparkles className="h-3 w-3" />
          <span>{analysis.tacticHighlight}</span>
        </div>
      )}

      {analysis?.keyIdeas?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{config.keyIdeasTitle}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {analysis.keyIdeas.map((idea, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span>{idea}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis?.suggestions?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{config.plansTitle}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {analysis.suggestions.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis?.riskWarnings?.length ? (
        <div className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{config.warningsTitle}</span>
          </div>
          <ul className="space-y-1">
            {analysis.riskWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex space-x-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0s" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
        <span>{isAnalyzing ? config.analyzingFooter : config.realtimeFooter}</span>
      </div>
    </Card>
  );
}
