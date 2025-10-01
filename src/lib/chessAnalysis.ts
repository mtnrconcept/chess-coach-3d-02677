import type { Chess, Move } from "chess.js";
import { detectOpeningFromHistory, sanitizeSanMoves, type OpeningMatch } from "./openings";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3.2,
  b: 3.3,
  r: 5.1,
  q: 9.4,
  k: 0,
};

const CENTER = new Set(["d4", "e4", "d5", "e5"]);
const EXTENDED_CENTER = new Set(["c3", "c4", "c5", "c6", "d3", "d6", "e3", "e6", "f3", "f4", "f5", "f6"]);

const PIECE_NAMES: Record<string, string> = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};

const START_SQUARES: Record<'w' | 'b', Record<string, string[]>> = {
  w: {
    n: ["b1", "g1"],
    b: ["c1", "f1"],
  },
  b: {
    n: ["b8", "g8"],
    b: ["c8", "f8"],
  },
};

export type GamePhase = "opening" | "middlegame" | "endgame";

export interface CoachingInsights {
  comment: string;
  voiceLine: string;
  baseComment: string;
  evaluation: number;
  evaluationLabel: string;
  advantage: "white" | "black" | "balanced";
  perspective: 'w' | 'b';
  opening?: OpeningMatch;
  gamePhase: GamePhase;
  tacticHighlight?: string;
  keyIdeas: string[];
  suggestions: string[];
  riskWarnings: string[];
  engineAdvice?: string;
}

interface AnalysisContext {
  chess: Chess;
  move: Move;
  history: Move[];
  perspective: 'w' | 'b';
  isOpponentMove?: boolean;
  labelPrefix?: string;
}

export function analyzePlayerMove({ chess, move, history }: { chess: Chess; move: Move; history: Move[]; }): CoachingInsights {
  return buildInsights({ chess, move, history, perspective: move.color, isOpponentMove: false });
}

export function analyzeAIMove({ chess, move, history }: { chess: Chess; move: Move; history: Move[]; }): CoachingInsights {
  const perspective: 'w' | 'b' = move.color === 'w' ? 'b' : 'w';
  return buildInsights({ chess, move, history, perspective, isOpponentMove: true, labelPrefix: "IA" });
}

export function withEngineAdvice(insights: CoachingInsights, advice: string, prefix?: string): CoachingInsights {
  const finalMessage = prefix ? `${prefix}: ${advice}` : advice;
  return {
    ...insights,
    comment: finalMessage,
    voiceLine: finalMessage,
    engineAdvice: advice,
  };
}

function buildInsights({ chess, move, history, perspective, isOpponentMove, labelPrefix }: AnalysisContext): CoachingInsights {
  const evaluation = evaluatePosition(chess);
  const evaluationLabel = getEvaluationLabel(evaluation);
  const advantage = evaluation > 0.7 ? "white" : evaluation < -0.7 ? "black" : "balanced";
  const perspectiveScore = perspective === 'w' ? evaluation : -evaluation;
  const sanitizedHistory = sanitizeSanMoves(history.map((item) => item.san));
  const opening = detectOpeningFromHistory(sanitizedHistory);
  const gamePhase = determineGamePhase(chess, history);
  const tacticHighlight = detectTactic(move, isOpponentMove ?? false);
  const keyIdeas = buildKeyIdeas(gamePhase, perspectiveScore, perspective, opening);
  const suggestions = buildSuggestions({ chess, move, perspective, perspectiveScore, gamePhase, opening, isOpponentMove: isOpponentMove ?? false, history });
  const riskWarnings = detectRisks({ chess, perspective, perspectiveScore, history, isOpponentMove: isOpponentMove ?? false, gamePhase });

  const moveDescription = isOpponentMove ? describeOpponentMove(move) : describePlayerMove(move);
  const evaluationMessage = createEvaluationMessage(perspectiveScore, perspective, isOpponentMove ?? false);

  const segments: string[] = [];
  if (opening && (opening.matchedMoves >= 2 || sanitizedHistory.length <= opening.moves.length + 2)) {
    segments.push(`Ouverture ${opening.name}${opening.variation ? ` (${opening.variation})` : ""}.`);
  }
  if (moveDescription) {
    segments.push(moveDescription);
  }
  if (tacticHighlight && tacticHighlight !== moveDescription) {
    segments.push(tacticHighlight);
  }
  if (evaluationMessage) {
    segments.push(evaluationMessage);
  }

  const baseComment = segments.join(' ');
  const comment = labelPrefix ? `${labelPrefix}: ${baseComment}` : baseComment;

  return {
    comment,
    voiceLine: comment,
    baseComment,
    evaluation,
    evaluationLabel,
    advantage,
    perspective,
    opening,
    gamePhase,
    tacticHighlight: isOpponentMove && tacticHighlight ? `Adversaire: ${tacticHighlight}` : tacticHighlight,
    keyIdeas,
    suggestions,
    riskWarnings,
  };
}

function evaluatePosition(chess: Chess): number {
  const board = chess.board();
  let score = 0;

  board.forEach((row, rankIndex) => {
    row.forEach((piece, fileIndex) => {
      if (!piece) return;
      const value = PIECE_VALUES[piece.type] ?? 0;
      const sign = piece.color === 'w' ? 1 : -1;
      score += value * sign;

      const square = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;
      if (CENTER.has(square)) {
        score += 0.12 * sign;
      } else if (EXTENDED_CENTER.has(square)) {
        score += 0.05 * sign;
      }

      const startSquares = START_SQUARES[piece.color]?.[piece.type];
      if (startSquares && !startSquares.includes(square)) {
        score += 0.04 * sign;
      }
    });
  });

  return Math.round(score * 100) / 100;
}

function determineGamePhase(chess: Chess, history: Move[]): GamePhase {
  const piecesLeft = chess.board().flat().filter(Boolean).length;
  if (piecesLeft <= 10 || history.length >= 40) return "endgame";
  if (history.length > 20 || piecesLeft <= 20) return "middlegame";
  return "opening";
}

function buildKeyIdeas(gamePhase: GamePhase, perspectiveScore: number, perspective: 'w' | 'b', opening?: OpeningMatch): string[] {
  const ideas = new Set<string>();

  if (opening) {
    opening.ideas.slice(0, 2).forEach((idea) => ideas.add(idea));
  }

  if (gamePhase === "opening") {
    ideas.add("Développez vos pièces actives vers le centre");
    if (perspectiveScore >= 0.5) {
      ideas.add("Profitez de l'espace pour coordonner vos pièces lourdes");
    } else {
      ideas.add("Complétez votre développement avant d'ouvrir le jeu");
    }
  } else if (gamePhase === "middlegame") {
    ideas.add("Cherchez les alignements tactiques : clouages et fourchettes");
    if (perspectiveScore >= 0.7) {
      ideas.add("Convertissez l'avantage en ouvrant une colonne pour les tours");
    } else if (perspectiveScore <= -0.7) {
      ideas.add("Simplifiez la position et neutralisez l'initiative adverse");
    } else {
      ideas.add("Améliorez la position de vos pièces une par une");
    }
  } else {
    ideas.add("Activez votre roi : dirigez-le vers le centre");
    ideas.add("Créez un pion passé ou bloquez celui de l'adversaire");
  }

  return Array.from(ideas).slice(0, 3);
}

interface SuggestionContext {
  chess: Chess;
  move: Move;
  perspective: 'w' | 'b';
  perspectiveScore: number;
  gamePhase: GamePhase;
  opening?: OpeningMatch;
  isOpponentMove: boolean;
  history: Move[];
}

function buildSuggestions({ chess, move, perspective, perspectiveScore, gamePhase, opening, isOpponentMove, history }: SuggestionContext): string[] {
  const suggestions = new Set<string>();

  if (!isOpponentMove) {
    if (move.captured) {
      suggestions.add("Stabilisez la pièce qui vient de capturer pour éviter une contre-attaque");
    }
    if (move.san === "O-O" || move.san === "O-O-O") {
      suggestions.add("Connectez vos tours pour préparer le jeu des colonnes");
    }
  } else {
    if (chess.in_check()) {
      suggestions.add("Parer l'échec immédiatement : fuite du roi, blocage ou capture");
    }
    if (move.captured) {
      suggestions.add("Évaluez les recaptures disponibles pour rétablir le matériel");
    }
  }

  if (gamePhase === "opening") {
    if (!hasCastled(history, perspective)) {
      suggestions.add("Roquez pour mettre votre roi à l'abri");
    }
    suggestions.add("Terminez le développement des pièces mineures avant d'attaquer");
  } else if (gamePhase === "middlegame") {
    if (perspectiveScore >= 0.8) {
      suggestions.add("Ouvrez les lignes sur l'aile où vous êtes mieux placé");
    } else if (perspectiveScore <= -0.8) {
      suggestions.add("Cherchez des échanges favorables pour soulager la pression");
    } else {
      suggestions.add("Coordonnez dame et tours sur une colonne semi-ouverte");
    }
  } else {
    suggestions.add("Amenez votre roi vers l'action tout en gardant la sécurité");
    if (perspectiveScore >= 0.8) {
      suggestions.add("Utilisez votre majorité de pions pour créer un pion passé");
    }
  }

  if (opening && opening.ideas.length) {
    suggestions.add(opening.ideas[0]);
  }

  return Array.from(suggestions).slice(0, 3);
}

interface RiskContext {
  chess: Chess;
  perspective: 'w' | 'b';
  perspectiveScore: number;
  history: Move[];
  isOpponentMove: boolean;
  gamePhase: GamePhase;
}

function detectRisks({ chess, perspective, perspectiveScore, history, isOpponentMove, gamePhase }: RiskContext): string[] {
  const warnings: string[] = [];

  if (isOpponentMove && chess.in_check()) {
    warnings.push("Votre roi est en échec, réagissez immédiatement");
  }

  if (!hasCastled(history, perspective) && gamePhase === "opening" && history.length >= 8) {
    warnings.push("Votre roi reste au centre, pensez à roquer sans tarder");
  }

  if (perspectiveScore <= -1.5) {
    warnings.push("Le matériel est défavorable, cherchez des ressources tactiques");
  }

  return warnings.slice(0, 2);
}

function getEvaluationLabel(evaluation: number): string {
  if (evaluation > 1.5) return "Large avantage blanc";
  if (evaluation > 0.8) return "Avantage blanc";
  if (evaluation > 0.3) return "Initiative blanche";
  if (evaluation < -1.5) return "Large avantage noir";
  if (evaluation < -0.8) return "Avantage noir";
  if (evaluation < -0.3) return "Initiative noire";
  return "Équilibre";
}

function createEvaluationMessage(score: number, perspective: 'w' | 'b', isOpponentMove: boolean): string {
  const advantageText = perspective === 'w' ? "vous" : "vous"; // uniform phrasing
  if (score > 1.5) {
    return isOpponentMove
      ? "Vous conservez un net avantage, convertissez-le méthodiquement"
      : "Vous avez un large avantage, transformez-le en attaque directe";
  }
  if (score > 0.7) {
    return isOpponentMove
      ? "L'initiative est pour vous, continuez à améliorer vos pièces"
      : "Vous gardez l'initiative, multipliez les menaces";
  }
  if (score < -1.5) {
    return isOpponentMove
      ? "Attention, l'adversaire prend un sérieux avantage"
      : "La position est critique, cherchez du contre-jeu immédiat";
  }
  if (score < -0.7) {
    return isOpponentMove
      ? "Position délicate, stabilisez votre défense"
      : "L'adversaire prend l'initiative, solidifiez votre camp";
  }
  return isOpponentMove
    ? "La position reste équilibrée, cherchez le plan le plus actif"
    : "Position équilibrée, continuez à appliquer vos principes";
}

function describePlayerMove(move: Move): string {
  if (move.san === "O-O") return "Roque du petit côté : votre roi est en sécurité";
  if (move.san === "O-O-O") return "Roque long audacieux, surveillez l'aile dame";
  if (move.promotion) {
    const promoted = PIECE_NAMES[move.promotion] ?? "pièce";
    return `Promotion : votre pion devient une ${promoted} sur ${move.to}`;
  }
  if (move.captured) {
    const capturedName = PIECE_NAMES[move.captured] ?? "pièce";
    const pieceName = PIECE_NAMES[move.piece] ?? "pièce";
    return `Belle prise : votre ${pieceName} capture ${capturedName} en ${move.to}`;
  }
  if (move.san.includes("+")) {
    return "Échec donné au roi adverse, profitez de l'initiative";
  }
  const pieceName = PIECE_NAMES[move.piece] ?? "pièce";
  return `Votre ${pieceName} rejoint la case ${move.to} et gagne de l'activité`;
}

function describeOpponentMove(move: Move): string {
  if (move.san === "O-O") return "L'adversaire roque du petit côté, son roi est à l'abri";
  if (move.san === "O-O-O") return "Roque long adverse, ciblez l'aile dame";
  if (move.promotion) {
    const promoted = PIECE_NAMES[move.promotion] ?? "pièce";
    return `L'adversaire promeut un pion en ${promoted} sur ${move.to}`;
  }
  if (move.captured) {
    const capturedName = PIECE_NAMES[move.captured] ?? "pièce";
    const pieceName = PIECE_NAMES[move.piece] ?? "pièce";
    return `Attention : ${pieceName} adverse capture votre ${capturedName} en ${move.to}`;
  }
  if (move.san.includes("+")) {
    return "L'adversaire vous met en échec, trouvez la meilleure parade";
  }
  const pieceName = PIECE_NAMES[move.piece] ?? "pièce";
  return `L'adversaire développe son ${pieceName} vers ${move.to}`;
}

function detectTactic(move: Move, isOpponentMove: boolean): string | undefined {
  if (move.san.includes("#")) {
    return isOpponentMove ? "Échec et mat subi" : "Échec et mat immédiat";
  }
  if (move.san.includes("+")) {
    return isOpponentMove ? "L'adversaire vous met en échec" : "Échec infligé au roi adverse";
  }
  if (move.promotion) {
    const promoted = PIECE_NAMES[move.promotion] ?? "pièce";
    return isOpponentMove ? `Promotion adverse en ${promoted}` : `Promotion en ${promoted}`;
  }
  if (move.captured) {
    const capturedName = PIECE_NAMES[move.captured] ?? "pièce";
    return isOpponentMove
      ? `Votre ${capturedName} vient de tomber, soyez attentif`
      : `Vous gagnez du matériel en capturant ${capturedName}`;
  }
  return undefined;
}

function hasCastled(history: Move[], color: 'w' | 'b'): boolean {
  return history.some((item) => item.color === color && (item.san === "O-O" || item.san === "O-O-O"));
}
