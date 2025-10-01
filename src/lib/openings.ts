export interface OpeningDefinition {
  eco: string;
  name: string;
  variation?: string;
  moves: string[];
  ideas: string[];
}

export interface OpeningMatch extends OpeningDefinition {
  matchedMoves: number;
}

export const OPENING_BOOK: OpeningDefinition[] = [
  {
    eco: "C60",
    name: "Partie espagnole",
    variation: "Défense Morphy",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    ideas: [
      "Mettre la pression sur le cavalier c6 pour détériorer la structure noire",
      "Préparer le roque et renforcer le contrôle du centre"
    ]
  },
  {
    eco: "B90",
    name: "Défense sicilienne",
    variation: "Najdorf",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    ideas: [
      "Empêcher les pièces blanches de s'installer sur b5",
      "Préparer ...e5 ou ...e6 pour contester le centre"
    ]
  },
  {
    eco: "C00",
    name: "Défense française",
    variation: "Classique",
    moves: ["e4", "e6", "d4", "d5"],
    ideas: [
      "Avancer le pion d pour maintenir le centre",
      "Surveiller la poussée ...c5 qui casse la chaîne de pions"
    ]
  },
  {
    eco: "B12",
    name: "Défense carokann",
    variation: "Classique",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4"],
    ideas: [
      "Développer rapidement le fou de cases blanches",
      "Jouer c4 ou Nf3 pour maintenir la pression centrale"
    ]
  },
  {
    eco: "A40",
    name: "Ouverture Zukertort",
    variation: "Moderne",
    moves: ["d4", "Nf6", "Nf3", "e6", "g3"],
    ideas: [
      "Fianchetter le fou de cases blanches pour contrôler la diagonale longue",
      "Préparer c4 pour exercer une pression sur le centre"
    ]
  },
  {
    eco: "D30",
    name: "Gambit dame",
    variation: "Classique",
    moves: ["d4", "d5", "c4"],
    ideas: [
      "Laisser un pion en b et c pour ouvrir les lignes",
      "Développer le fou de cases blanches vers g5"
    ]
  },
  {
    eco: "E60",
    name: "Défense indienne du roi",
    variation: "Classique",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"],
    ideas: [
      "Préparer ...e5 ou ...c5 pour frapper le centre",
      "Attaquer le roi blanc via f5 et g4"
    ]
  },
  {
    eco: "C50",
    name: "Partie italienne",
    variation: "Giuoco Piano",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
    ideas: [
      "Surveiller la poussée d4 pour ouvrir le centre",
      "Coordonner les cavaliers vers g5 et d5"
    ]
  },
  {
    eco: "B01",
    name: "Défense scandinave",
    variation: "Classique",
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3"],
    ideas: [
      "Gagner un tempo en attaquant la dame noire",
      "Développer rapidement les pièces mineures"
    ]
  },
  {
    eco: "A80",
    name: "Défense hollandaise",
    variation: "Classique",
    moves: ["d4", "f5", "g3", "Nf6", "Bg2", "e6"],
    ideas: [
      "Fianchetter le fou pour contrôler la diagonale",
      "Préparer e4 pour ouvrir la colonne f"
    ]
  },
  {
    eco: "C41",
    name: "Défense philidor",
    variation: "Classique",
    moves: ["e4", "e5", "Nf3", "d6"],
    ideas: [
      "Préparer d4 pour gagner de l'espace",
      "Appuyer e5 avec Nc6 ou Nd7"
    ]
  },
  {
    eco: "B33",
    name: "Sicilienne",
    variation: "Sveshnikov",
    moves: ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "e5"],
    ideas: [
      "Prendre de l'espace au centre avec ...e5",
      "Anticiper Nd5 et préparer ...Be6"
    ]
  },
  {
    eco: "C65",
    name: "Espagnole",
    variation: "Berlin",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
    ideas: [
      "Simplifier rapidement la position",
      "Contrer la pression blanche sur e5"
    ]
  },
  {
    eco: "D90",
    name: "Gambit dame refusé",
    variation: "Tartakover",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "h6", "Bh4", "O-O", "Nf3", "b6"],
    ideas: [
      "Solidifier la structure centrale",
      "Préparer ...c5 pour l'égalisation"
    ]
  },
  {
    eco: "A07",
    name: "Ouverture Bird",
    variation: "Classique",
    moves: ["f4", "d5", "Nf3", "g6"],
    ideas: [
      "Contrôler e5 avec le pion f",
      "Préparer e4 pour construire un duo de pions"
    ]
  }
];

const SAN_CLEANUP = /[+#?!]/g;

export function detectOpeningFromHistory(history: string[]): OpeningMatch | undefined {
  if (!history.length) return undefined;

  let bestMatch: OpeningMatch | undefined;

  for (const opening of OPENING_BOOK) {
    if (history.length < opening.moves.length) {
      const partial = opening.moves.slice(0, history.length);
      if (partial.every((move, index) => move === history[index])) {
        if (!bestMatch || partial.length > bestMatch.matchedMoves) {
          bestMatch = { ...opening, matchedMoves: partial.length };
        }
      }
      continue;
    }

    const matches = opening.moves.every((move, index) => move === history[index]);
    if (matches) {
      if (!bestMatch || opening.moves.length > bestMatch.matchedMoves) {
        bestMatch = { ...opening, matchedMoves: opening.moves.length };
      }
    }
  }

  return bestMatch;
}

export function sanitizeSanMoves(moves: string[]): string[] {
  return moves.map((san) => san.replace(SAN_CLEANUP, ""));
}
