import type { DetectedPattern, PatternId, PatternSeverity } from '@/lib/analysis/patterns';

export type CoachLanguage = 'fr' | 'en';

export type CoachTone = 'positive' | 'info' | 'warning' | 'critical';

export interface CoachMessage {
  fr: string;
  en: string;
  tone: CoachTone;
  patterns: DetectedPattern[];
}

export type AnalysisTag =
  | 'ok'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'great';

export interface CoachMessageContext {
  tag: AnalysisTag;
  delta: number;
  san: string;
  bestMove: string;
  patterns: DetectedPattern[];
}

const PIECE_NAMES: Record<CoachLanguage, Record<string, string>> = {
  fr: {
    p: 'pion',
    n: 'cavalier',
    b: 'fou',
    r: 'tour',
    q: 'dame',
    k: 'roi',
  },
  en: {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  },
};

const SQUARE_WORD: Record<CoachLanguage, string> = {
  fr: 'case',
  en: 'square',
};

function severityToTone(severity: PatternSeverity): CoachTone {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

function describeSquare(square: unknown, language: CoachLanguage): string {
  return typeof square === 'string' ? `${SQUARE_WORD[language]} ${square}` : SQUARE_WORD[language];
}

function pieceLabel(piece: unknown, language: CoachLanguage): string {
  if (typeof piece !== 'string') return language === 'fr' ? 'pièce' : 'piece';
  const lower = piece.toLowerCase();
  return PIECE_NAMES[language][lower] ?? (language === 'fr' ? 'pièce' : 'piece');
}

function listTargets(targets: unknown, language: CoachLanguage): string {
  if (!Array.isArray(targets) || targets.length === 0) {
    return language === 'fr' ? 'plusieurs pièces' : 'multiple pieces';
  }
  const formatted = targets
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const square = typeof (entry as { square?: unknown }).square === 'string'
        ? (entry as { square: string }).square
        : null;
      const piece = (entry as { piece?: unknown }).piece;
      if (!square) return null;
      const label = pieceLabel(piece, language);
      return language === 'fr' ? `${label} en ${square}` : `${square} ${label}`;
    })
    .filter((item): item is string => Boolean(item));
  if (formatted.length === 0) {
    return language === 'fr' ? 'plusieurs pièces' : 'multiple pieces';
  }
  if (formatted.length === 1) return formatted[0];
  const last = formatted.pop() as string;
  const joiner = language === 'fr' ? ' et ' : ' and ';
  return `${formatted.join(language === 'fr' ? ', ' : ', ')}${joiner}${last}`;
}

function describePattern(pattern: DetectedPattern, language: CoachLanguage): string {
  const data = pattern.data ?? {};
  switch (pattern.id) {
    case 'hanging-piece': {
      const square = describeSquare((data as { square?: unknown }).square, language);
      const piece = pieceLabel((data as { piece?: unknown }).piece, language);
      return language === 'fr'
        ? `Ta ${piece} sur ${square} n'est pas défendue : protège-la vite.`
        : `Your ${piece} on that ${square} is hanging—defend it immediately.`;
    }
    case 'material-drop': {
      const lost = typeof (data as { lost?: unknown }).lost === 'number'
        ? Number.parseFloat((data as { lost: number }).lost.toFixed(1))
        : null;
      const valueText = lost ? (language === 'fr' ? `${lost} points` : `${lost} points`) : language === 'fr' ? 'du matériel' : 'material';
      return language === 'fr'
        ? `Ce coup perd ${valueText}. Cherche une défense plus solide.`
        : `This move drops ${valueText}. Find a safer defence next time.`;
    }
    case 'fork-threat': {
      const attacker = typeof (data as { attacker?: unknown }).attacker === 'string'
        ? (data as { attacker: string }).attacker
        : null;
      const targets = listTargets((data as { targets?: unknown }).targets, language);
      return language === 'fr'
        ? `Un cavalier adverse depuis ${attacker ?? 'une case'} attaque ${targets}.` 
          + ' Parer la fourchette en un coup.'
        : `An opponent knight from ${attacker ?? 'a square'} is forking ${targets}. Block or move away now.`;
    }
    case 'pin': {
      const square = describeSquare((data as { square?: unknown }).square, language);
      const attacker = typeof (data as { attacker?: unknown }).attacker === 'string'
        ? (data as { attacker: string }).attacker
        : null;
      return language === 'fr'
        ? `Ta pièce sur ${square} est clouée par ${attacker ?? "la pièce adverse"}. Bouge une autre pièce pour la libérer.`
        : `Your piece on ${square} is pinned by ${attacker ?? 'the opposing piece'}. Free it with support.`;
    }
    case 'missed-mate': {
      const mateIn = typeof (data as { mateIn?: unknown }).mateIn === 'number'
        ? (data as { mateIn: number }).mateIn
        : null;
      return language === 'fr'
        ? `Il y avait un mat forcé en ${mateIn ?? '?'} coups. Cherche le schéma gagnant.`
        : `There was a forced mate in ${mateIn ?? '?'} moves. Try to spot that winning pattern.`;
    }
    case 'mate-threat': {
      const mateIn = typeof (data as { mateIn?: unknown }).mateIn === 'number'
        ? (data as { mateIn: number }).mateIn
        : null;
      return language === 'fr'
        ? `Après ce coup, l'adversaire peut mater en ${mateIn ?? '?'} coups. Crée une défense immédiate.`
        : `After this move the opponent can mate in ${mateIn ?? '?'} moves. Find an urgent defence.`;
    }
    default:
      return language === 'fr'
        ? "Ce coup laisse un motif tactique dangereux."
        : 'This move allows a tactical threat.';
  }
}

function pickPrimaryPattern(patterns: DetectedPattern[]): DetectedPattern | null {
  if (patterns.length === 0) return null;
  return patterns.reduce((best, current) => {
    const order = { critical: 3, warning: 2, info: 1 } as const;
    return order[current.severity] > order[best.severity] ? current : best;
  });
}

const FALLBACK_MESSAGES: Record<AnalysisTag, { fr: string; en: string; tone: CoachTone }> = {
  ok: {
    fr: 'Coup solide : tu restes dans le plan.',
    en: 'Solid move—keep following the plan.',
    tone: 'positive',
  },
  inaccuracy: {
    fr: 'Ce coup est jouable mais laisse mieux ailleurs.',
    en: 'Playable move, but there was a cleaner option.',
    tone: 'info',
  },
  mistake: {
    fr: "Imprécision : revois la menace adverse et cherche mieux.",
    en: 'Inaccuracy—recheck the opponent threat and aim for better.',
    tone: 'warning',
  },
  blunder: {
    fr: 'Gaffe importante : la position se dégrade fortement.',
    en: 'Big blunder—the position worsens a lot.',
    tone: 'critical',
  },
  brilliant: {
    fr: 'Excellent coup ! Tes pièces travaillent ensemble.',
    en: 'Brilliant move! Your pieces work perfectly together.',
    tone: 'positive',
  },
  great: {
    fr: 'Très bon coup trouvé : tu tiens la position.',
    en: 'Great move: you held the position together.',
    tone: 'positive',
  },
};

function enrichWithBestMove(text: string, language: CoachLanguage, bestMove: string): string {
  if (!bestMove) return text;
  const addition = language === 'fr'
    ? ` Idée suggérée par le moteur : ${bestMove}.`
    : ` Engine suggestion: ${bestMove}.`;
  return `${text}${addition}`;
}

export function buildCoachMessage(context: CoachMessageContext): CoachMessage {
  const primary = pickPrimaryPattern(context.patterns);
  if (primary) {
    const tone = severityToTone(primary.severity);
    const fr = describePattern(primary, 'fr');
    const en = describePattern(primary, 'en');
    return { fr, en, tone, patterns: context.patterns };
  }

  const fallback = FALLBACK_MESSAGES[context.tag];
  const frBase = fallback.fr;
  const enBase = fallback.en;
  const fr = context.tag === 'mistake' || context.tag === 'blunder' || context.tag === 'inaccuracy'
    ? enrichWithBestMove(frBase, 'fr', context.bestMove)
    : frBase;
  const en = context.tag === 'mistake' || context.tag === 'blunder' || context.tag === 'inaccuracy'
    ? enrichWithBestMove(enBase, 'en', context.bestMove)
    : enBase;
  return { fr, en, tone: fallback.tone, patterns: context.patterns };
}
