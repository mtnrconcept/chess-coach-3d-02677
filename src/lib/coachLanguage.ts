import type { CoachingInsights } from "./chessAnalysis";

export type CoachLanguage = "fr" | "en" | "es";

interface CoachLanguageConfig {
  label: string;
  coachTitle: string;
  disabledMessage: string;
  statuses: {
    analyzing: string;
    expert: string;
    warning: string;
    advantage: string;
    advice: string;
  };
  instantAnalysisPrefix: string;
  defaultComment: string;
  evaluationHeading: string;
  evaluationScale: {
    black: string;
    balanced: string;
    white: string;
  };
  phaseLabels: {
    opening: string;
    middlegame: string;
    endgame: string;
  };
  keyIdeasTitle: string;
  plansTitle: string;
  warningsTitle: string;
  analyzingFooter: string;
  realtimeFooter: string;
  moveWord: {
    singular: string;
    plural: string;
  };
  speech: {
    voicePreferences: string[];
    rate: number;
    pitch: number;
    volume: number;
    language: string;
  };
  opponentPrefix: string;
  enginePrefix: string;
}

const LANGUAGE_CONFIG: Record<CoachLanguage, CoachLanguageConfig> = {
  fr: {
    label: "Français",
    coachTitle: "Coach IA",
    disabledMessage: "Coach désactivé. Activez-le pour recevoir des commentaires en direct.",
    statuses: {
      analyzing: "Analyse",
      expert: "Analyse experte",
      warning: "Attention",
      advantage: "Avantage",
      advice: "Conseil",
    },
    instantAnalysisPrefix: "Analyse instantanée :",
    defaultComment: "Analysez vos coups et ceux de l'adversaire pour progresser...",
    evaluationHeading: "Évaluation",
    evaluationScale: {
      black: "Avantage noir",
      balanced: "Équilibre",
      white: "Avantage blanc",
    },
    phaseLabels: {
      opening: "Ouverture",
      middlegame: "Milieu de jeu",
      endgame: "Finale",
    },
    keyIdeasTitle: "Idées clés",
    plansTitle: "Plans recommandés",
    warningsTitle: "Points de vigilance",
    analyzingFooter: "Analyse experte en cours",
    realtimeFooter: "Analyse en temps réel",
    moveWord: {
      singular: "coup",
      plural: "coups",
    },
    speech: {
      voicePreferences: ["Google français", "Amelie", "Thomas", "fr-FR"],
      rate: 0.94,
      pitch: 1.04,
      volume: 0.9,
      language: "fr-FR",
    },
    opponentPrefix: "Adversaire",
    enginePrefix: "IA",
  },
  en: {
    label: "English",
    coachTitle: "AI Coach",
    disabledMessage: "Coach disabled. Enable it to receive live feedback.",
    statuses: {
      analyzing: "Analysis",
      expert: "Expert insight",
      warning: "Warning",
      advantage: "Advantage",
      advice: "Advice",
    },
    instantAnalysisPrefix: "Instant analysis:",
    defaultComment: "Review your moves and your opponent's to keep improving...",
    evaluationHeading: "Evaluation",
    evaluationScale: {
      black: "Black edge",
      balanced: "Balance",
      white: "White edge",
    },
    phaseLabels: {
      opening: "Opening",
      middlegame: "Middlegame",
      endgame: "Endgame",
    },
    keyIdeasTitle: "Key ideas",
    plansTitle: "Recommended plans",
    warningsTitle: "Watch out",
    analyzingFooter: "Expert analysis in progress",
    realtimeFooter: "Live analysis",
    moveWord: {
      singular: "move",
      plural: "moves",
    },
    speech: {
      voicePreferences: ["Google US English", "Samantha", "Alex", "en-US"],
      rate: 1,
      pitch: 1,
      volume: 0.9,
      language: "en-US",
    },
    opponentPrefix: "Opponent",
    enginePrefix: "AI",
  },
  es: {
    label: "Español",
    coachTitle: "Coach IA",
    disabledMessage: "Coach desactivado. Actívalo para recibir comentarios en directo.",
    statuses: {
      analyzing: "Análisis",
      expert: "Análisis experto",
      warning: "Atención",
      advantage: "Ventaja",
      advice: "Consejo",
    },
    instantAnalysisPrefix: "Análisis instantáneo:",
    defaultComment: "Analiza tus jugadas y las del rival para seguir progresando...",
    evaluationHeading: "Evaluación",
    evaluationScale: {
      black: "Ventaja negra",
      balanced: "Equilibrio",
      white: "Ventaja blanca",
    },
    phaseLabels: {
      opening: "Apertura",
      middlegame: "Medio juego",
      endgame: "Final",
    },
    keyIdeasTitle: "Ideas clave",
    plansTitle: "Planes recomendados",
    warningsTitle: "Puntos de vigilancia",
    analyzingFooter: "Análisis experto en curso",
    realtimeFooter: "Análisis en tiempo real",
    moveWord: {
      singular: "jugada",
      plural: "jugadas",
    },
    speech: {
      voicePreferences: ["Google español", "Monica", "Jorge", "es-ES"],
      rate: 0.98,
      pitch: 1,
      volume: 0.9,
      language: "es-ES",
    },
    opponentPrefix: "Oponente",
    enginePrefix: "IA",
  },
};

export const coachLanguageOptions = (Object.keys(LANGUAGE_CONFIG) as CoachLanguage[]).map((key) => ({
  value: key,
  label: LANGUAGE_CONFIG[key].label,
}));

export function getCoachLanguageConfig(language: CoachLanguage): CoachLanguageConfig {
  return LANGUAGE_CONFIG[language];
}

const PIECE_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  pion: { en: "pawn", es: "peón" },
  cavalier: { en: "knight", es: "caballo" },
  fou: { en: "bishop", es: "alfil" },
  tour: { en: "rook", es: "torre" },
  dame: { en: "queen", es: "dama" },
  roi: { en: "king", es: "rey" },
  pièce: { en: "piece", es: "pieza" },
};

const EXACT_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  "Roque du petit côté : votre roi est en sécurité": {
    en: "Kingside castling keeps your king safe",
    es: "Enroque corto: tu rey queda a salvo",
  },
  "Roque long audacieux, surveillez l'aile dame": {
    en: "Bold queenside castling, watch the queenside",
    es: "Enroque largo audaz, vigila el flanco de dama",
  },
  "Échec donné au roi adverse, profitez de l'initiative": {
    en: "Check delivered to the enemy king, press the initiative",
    es: "Jaque al rey rival, aprovecha la iniciativa",
  },
  "L'adversaire roque du petit côté, son roi est à l'abri": {
    en: "Opponent castles short, their king is safer",
    es: "El rival enroca corto, su rey está a salvo",
  },
  "Roque long adverse, ciblez l'aile dame": {
    en: "Opponent castles long, target the queenside",
    es: "Enroque largo rival, apunta al flanco de dama",
  },
  "L'adversaire vous met en échec, trouvez la meilleure parade": {
    en: "Opponent gives check, find the best defence",
    es: "El rival da jaque, busca la mejor defensa",
  },
  "Échec et mat immédiat": {
    en: "Immediate checkmate",
    es: "Jaque mate inmediato",
  },
  "Échec et mat subi": {
    en: "Checkmate suffered",
    es: "Jaque mate sufrido",
  },
  "Échec infligé au roi adverse": {
    en: "Check delivered to the enemy king",
    es: "Jaque al rey contrario",
  },
  "Vous gagnez du matériel en capturant pièce": {
    en: "You gain material by capturing a piece",
    es: "Ganas material capturando una pieza",
  },
  "Vous conservez un net avantage, convertissez-le méthodiquement": {
    en: "You keep a clear edge, convert it methodically",
    es: "Conservas una clara ventaja, conviértela con método",
  },
  "Vous avez un large avantage, transformez-le en attaque directe": {
    en: "You have a large advantage, turn it into a direct attack",
    es: "Tienes gran ventaja, transfórmala en un ataque directo",
  },
  "L'initiative est pour vous, continuez à améliorer vos pièces": {
    en: "The initiative is yours, keep improving your pieces",
    es: "La iniciativa es tuya, sigue mejorando tus piezas",
  },
  "Vous gardez l'initiative, multipliez les menaces": {
    en: "You keep the initiative, multiply the threats",
    es: "Mantienes la iniciativa, multiplica las amenazas",
  },
  "Attention, l'adversaire prend un sérieux avantage": {
    en: "Careful, the opponent is taking a serious advantage",
    es: "Atención, el rival obtiene una ventaja seria",
  },
  "La position est critique, cherchez du contre-jeu immédiat": {
    en: "Critical position, look for immediate counterplay",
    es: "Posición crítica, busca contrajuego inmediato",
  },
  "Position délicate, stabilisez votre défense": {
    en: "Difficult position, stabilise your defence",
    es: "Posición delicada, estabiliza tu defensa",
  },
  "L'adversaire prend l'initiative, solidifiez votre camp": {
    en: "Opponent takes the initiative, solidify your camp",
    es: "El rival toma la iniciativa, refuerza tu posición",
  },
  "La position reste équilibrée, cherchez le plan le plus actif": {
    en: "Position remains balanced, look for the most active plan",
    es: "La posición sigue equilibrada, busca el plan más activo",
  },
  "Position équilibrée, continuez à appliquer vos principes": {
    en: "Balanced position, keep applying your principles",
    es: "Posición equilibrada, sigue aplicando tus principios",
  },
  "Votre roi est en échec, réagissez immédiatement": {
    en: "Your king is in check, respond immediately",
    es: "Tu rey está en jaque, reacciona de inmediato",
  },
  "Votre roi reste au centre, pensez à roquer sans tarder": {
    en: "Your king stays in the centre, castle without delay",
    es: "Tu rey sigue en el centro, enroca sin tardar",
  },
  "Le matériel est défavorable, cherchez des ressources tactiques": {
    en: "Material deficit, look for tactical resources",
    es: "Desventaja material, busca recursos tácticos",
  },
  "Développez vos pièces actives vers le centre": {
    en: "Develop your active pieces toward the centre",
    es: "Desarrolla tus piezas activas hacia el centro",
  },
  "Profitez de l'espace pour coordonner vos pièces lourdes": {
    en: "Use the space advantage to coordinate your heavy pieces",
    es: "Aprovecha el espacio para coordinar tus piezas pesadas",
  },
  "Complétez votre développement avant d'ouvrir le jeu": {
    en: "Complete your development before opening the game",
    es: "Completa tu desarrollo antes de abrir el juego",
  },
  "Cherchez les alignements tactiques : clouages et fourchettes": {
    en: "Look for tactical alignments: pins and forks",
    es: "Busca alineaciones tácticas: clavadas y dobles ataques",
  },
  "Convertissez l'avantage en ouvrant une colonne pour les tours": {
    en: "Convert the advantage by opening a file for the rooks",
    es: "Convierte la ventaja abriendo una columna para las torres",
  },
  "Simplifiez la position et neutralisez l'initiative adverse": {
    en: "Simplify the position and neutralise the opponent's initiative",
    es: "Simplifica la posición y neutraliza la iniciativa rival",
  },
  "Améliorez la position de vos pièces une par une": {
    en: "Improve your pieces one by one",
    es: "Mejora la posición de tus piezas una por una",
  },
  "Activez votre roi : dirigez-le vers le centre": {
    en: "Activate your king: guide it toward the centre",
    es: "Activa tu rey: llévalo hacia el centro",
  },
  "Créez un pion passé ou bloquez celui de l'adversaire": {
    en: "Create a passed pawn or stop the opponent's",
    es: "Crea un peón pasado o bloquea el del rival",
  },
  "Stabilisez la pièce qui vient de capturer pour éviter une contre-attaque": {
    en: "Stabilise the capturing piece to avoid counterplay",
    es: "Estabiliza la pieza que capturó para evitar el contraataque",
  },
  "Connectez vos tours pour préparer le jeu des colonnes": {
    en: "Connect your rooks to prepare file play",
    es: "Conecta tus torres para preparar el juego por columnas",
  },
  "Parer l'échec immédiatement : fuite du roi, blocage ou capture": {
    en: "Parry the check immediately: king move, block or capture",
    es: "Neutraliza el jaque de inmediato: mueve el rey, bloquea o captura",
  },
  "Évaluez les recaptures disponibles pour rétablir le matériel": {
    en: "Evaluate available recaptures to restore material balance",
    es: "Evalúa las recapturas disponibles para igualar el material",
  },
  "Roquez pour mettre votre roi à l'abri": {
    en: "Castle to shelter your king",
    es: "Enroca para resguardar a tu rey",
  },
  "Terminez le développement des pièces mineures avant d'attaquer": {
    en: "Finish minor-piece development before attacking",
    es: "Termina el desarrollo de las piezas menores antes de atacar",
  },
  "Ouvrez les lignes sur l'aile où vous êtes mieux placé": {
    en: "Open lines on the wing where you are better",
    es: "Abre las líneas en el flanco donde estás mejor",
  },
  "Cherchez des échanges favorables pour soulager la pression": {
    en: "Seek favourable exchanges to relieve pressure",
    es: "Busca cambios favorables para aliviar la presión",
  },
  "Coordonnez dame et tours sur une colonne semi-ouverte": {
    en: "Coordinate queen and rooks on a semi-open file",
    es: "Coordina dama y torres en una columna semiabierta",
  },
  "Amenez votre roi vers l'action tout en gardant la sécurité": {
    en: "Bring your king toward the action while staying safe",
    es: "Acerca tu rey a la acción manteniendo la seguridad",
  },
  "Utilisez votre majorité de pions pour créer un pion passé": {
    en: "Use your pawn majority to create a passed pawn",
    es: "Usa tu mayoría de peones para crear un peón pasado",
  },
  "Analysez vos coups et ceux de l'adversaire pour progresser...": {
    en: "Study your moves and the opponent's to keep improving...",
    es: "Analiza tus jugadas y las del rival para seguir progresando...",
  },
  "Analyse en cours...": {
    en: "Analysis in progress...",
    es: "Análisis en curso...",
  },
};

const EVAL_LABEL_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  "Large avantage blanc": { en: "Large white advantage", es: "Amplia ventaja blanca" },
  "Avantage blanc": { en: "White advantage", es: "Ventaja blanca" },
  "Initiative blanche": { en: "White initiative", es: "Iniciativa blanca" },
  "Large avantage noir": { en: "Large black advantage", es: "Amplia ventaja negra" },
  "Avantage noir": { en: "Black advantage", es: "Ventaja negra" },
  "Initiative noire": { en: "Black initiative", es: "Iniciativa negra" },
  "Équilibre": { en: "Balance", es: "Equilibrio" },
};

function translatePieceName(name: string, language: CoachLanguage): string {
  if (language === "fr") return name;
  const lower = name.toLowerCase();
  const translation = PIECE_TRANSLATIONS[lower];
  if (!translation) return name;
  return translation[language];
}

interface PatternTranslation {
  pattern: RegExp;
  translate: (language: CoachLanguage, match: RegExpMatchArray) => string;
}

const PATTERN_TRANSLATIONS: PatternTranslation[] = [
  {
    pattern: /^Ouverture (.+?)(?: \((.+)\))?$/,
    translate: (language, match) => {
      if (language === "fr") {
        return match[0];
      }
      const name = match[1];
      const variation = match[2];
      if (language === "en") {
        return `Opening ${name}${variation ? ` (${variation})` : ""}`;
      }
      return `Apertura ${name}${variation ? ` (${variation})` : ""}`;
    },
  },
  {
    pattern: /^Promotion : votre pion devient une (.+) sur ([a-h][1-8])$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const square = match[2];
      if (language === "en") {
        return `Promotion: your pawn becomes a ${piece} on ${square}`;
      }
      return `Promoción: tu peón se convierte en ${piece} en ${square}`;
    },
  },
  {
    pattern: /^Belle prise : votre (.+) capture (.+) en ([a-h][1-8])$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const captured = translatePieceName(match[2], language);
      const square = match[3];
      if (language === "en") {
        return `Great capture: your ${piece} captures ${captured} on ${square}`;
      }
      return `Gran captura: tu ${piece} captura ${captured} en ${square}`;
    },
  },
  {
    pattern: /^Votre (.+) rejoint la case ([a-h][1-8]) et gagne de l'activité$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const square = match[2];
      if (language === "en") {
        return `Your ${piece} reaches ${square} and gains activity`;
      }
      return `Tu ${piece} llega a ${square} y gana actividad`;
    },
  },
  {
    pattern: /^L'adversaire promeut un pion en (.+) sur ([a-h][1-8])$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const square = match[2];
      if (language === "en") {
        return `Opponent promotes a pawn to ${piece} on ${square}`;
      }
      return `El rival corona un peón en ${piece} en ${square}`;
    },
  },
  {
    pattern: /^Attention : (.+) adverse capture votre (.+) en ([a-h][1-8])$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const captured = translatePieceName(match[2], language);
      const square = match[3];
      if (language === "en") {
        return `Watch out: enemy ${piece} captures your ${captured} on ${square}`;
      }
      return `Atención: el ${piece} rival captura tu ${captured} en ${square}`;
    },
  },
  {
    pattern: /^L'adversaire développe son (.+) vers ([a-h][1-8])$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      const square = match[2];
      if (language === "en") {
        return `Opponent develops their ${piece} toward ${square}`;
      }
      return `El rival desarrolla su ${piece} hacia ${square}`;
    },
  },
  {
    pattern: /^Promotion adverse en (.+)$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      if (language === "en") {
        return `Opponent promotion to ${piece}`;
      }
      return `Promoción rival a ${piece}`;
    },
  },
  {
    pattern: /^Promotion en (.+)$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      if (language === "en") {
        return `Promotion to ${piece}`;
      }
      return `Promoción a ${piece}`;
    },
  },
  {
    pattern: /^Votre (.+) vient de tomber, soyez attentif$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      if (language === "en") {
        return `Your ${piece} just fell, stay alert`;
      }
      return `Tu ${piece} acaba de caer, mantente atento`;
    },
  },
  {
    pattern: /^Vous gagnez du matériel en capturant (.+)$/,
    translate: (language, match) => {
      if (language === "fr") return match[0];
      const piece = translatePieceName(match[1], language);
      if (language === "en") {
        return `You gain material by capturing ${piece}`;
      }
      return `Ganas material capturando ${piece}`;
    },
  },
];

function translateSegment(segment: string, language: CoachLanguage): string {
  if (language === "fr" || !segment) return segment;

  const trimmed = segment.trim();
  if (!trimmed) return trimmed;

  const trailingPunctuation = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : "";
  const core = trailingPunctuation ? trimmed.slice(0, -1) : trimmed;

  if (core.startsWith("Adversaire: ")) {
    const inner = core.slice("Adversaire: ".length).trim();
    const translatedInner = translateSegment(inner, language);
    const prefix = LANGUAGE_CONFIG[language].opponentPrefix;
    const result = `${prefix}: ${translatedInner}`;
    return trailingPunctuation ? `${result}${trailingPunctuation}` : result;
  }

  if (core.startsWith("IA: ")) {
    const inner = core.slice("IA: ".length).trim();
    const translatedInner = translateSegment(inner, language);
    const prefix = LANGUAGE_CONFIG[language].enginePrefix;
    const result = `${prefix}: ${translatedInner}`;
    return trailingPunctuation ? `${result}${trailingPunctuation}` : result;
  }

  const exact = EXACT_TRANSLATIONS[core];
  if (exact) {
    const translated = exact[language];
    return trailingPunctuation ? `${translated}${trailingPunctuation}` : translated;
  }

  for (const { pattern, translate } of PATTERN_TRANSLATIONS) {
    const match = core.match(pattern);
    if (match) {
      const translated = translate(language, match);
      return trailingPunctuation ? `${translated}${trailingPunctuation}` : translated;
    }
  }

  return trailingPunctuation ? `${core}${trailingPunctuation}` : core;
}

export function translateCoachingText(text: string, language: CoachLanguage): string {
  if (language === "fr" || !text) return text;
  const segments = text.match(/[^.?!]+[.?!]?/g);
  if (!segments) {
    return translateSegment(text, language);
  }
  return segments.map((segment) => translateSegment(segment, language)).join(" ").trim();
}

export function translateCoachingInsights(insights: CoachingInsights, language: CoachLanguage): CoachingInsights {
  if (language === "fr") return insights;

  const translated: CoachingInsights = {
    ...insights,
    comment: translateCoachingText(insights.comment, language),
    voiceLine: translateCoachingText(insights.voiceLine, language),
    baseComment: translateCoachingText(insights.baseComment, language),
    evaluationLabel: EVAL_LABEL_TRANSLATIONS[insights.evaluationLabel]?.[language] ?? insights.evaluationLabel,
    tacticHighlight: insights.tacticHighlight ? translateCoachingText(insights.tacticHighlight, language) : undefined,
    keyIdeas: insights.keyIdeas.map((idea) => translateCoachingText(idea, language)),
    suggestions: insights.suggestions.map((tip) => translateCoachingText(tip, language)),
    riskWarnings: insights.riskWarnings.map((warning) => translateCoachingText(warning, language)),
    engineAdvice: insights.engineAdvice ? translateCoachingText(insights.engineAdvice, language) : undefined,
  };

  return translated;
}

export function getCoachDisabledMessage(language: CoachLanguage): string {
  return LANGUAGE_CONFIG[language].disabledMessage;
}
