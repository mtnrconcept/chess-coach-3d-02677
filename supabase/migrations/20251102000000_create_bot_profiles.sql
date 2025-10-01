create table if not exists public.bot_profiles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  elo_target int not null,
  style jsonb not null,
  book jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.bot_profiles (id, name, elo_target, style, book)
values
  (
    'e458fd2b-ada4-47f9-bc34-4bc16e631fbb',
    'Apprenti',
    450,
    '{
      "label": "Débutant",
      "personality": "Joueur prudent qui apprend encore les schémas de base",
      "description": "Idéal pour les premières parties: l''Apprenti commet des imprécisions, développe lentement ses pièces et accepte volontiers les échanges simples.",
      "traits": [
        "Priorité aux coups naturels",
        "Peu de tactiques",
        "Favorise les structures symétriques"
      ],
      "engine": {
        "skillLevel": 1,
        "uciElo": 600,
        "limitStrength": true,
        "multiPv": 2,
        "contempt": -10,
        "randomness": {
          "candidateWeights": [0.6, 0.3, 0.1],
          "maxDeltaCentipawns": 120
        },
        "limits": {
          "moveTimeMs": 350
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Italienne lente",
          "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "d6"],
          "weight": 4
        },
        {
          "name": "Giuoco Pianissimo",
          "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5"],
          "weight": 3
        },
        {
          "name": "Ouverture du pion dame simplifiée",
          "moves": ["d4", "d5", "Nf3", "Nf6", "e3", "e6", "Bd3", "Bd6"],
          "weight": 3
        }
      ]
    }'::jsonb
  ),
  (
    '94cf293e-56af-4dbb-b2db-339fb43b5f51',
    'Capitaine Tactique',
    1100,
    '{
      "label": "Tacticien",
      "personality": "Cherche les fourchettes et tactiques simples, mais peut oublier sa défense",
      "description": "Un adversaire idéal pour progresser: il développe ses pièces rapidement, prépare des attaques sur le roi et peut sacrifier du matériel pour l''initiative.",
      "traits": [
        "Préférence pour les positions ouvertes",
        "Menaces tactiques directes",
        "Parfois impatient en finale"
      ],
      "engine": {
        "skillLevel": 5,
        "uciElo": 1100,
        "limitStrength": true,
        "multiPv": 3,
        "contempt": 0,
        "randomness": {
          "candidateWeights": [0.7, 0.2, 0.1],
          "maxDeltaCentipawns": 80
        },
        "limits": {
          "moveTimeMs": 650
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Sicilienne classique",
          "moves": ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "Nc6"],
          "weight": 5
        },
        {
          "name": "Variante d'avance française",
          "moves": ["e4", "e6", "d4", "d5", "e5", "c5", "c3", "Nc6", "Nf3", "Qb6"],
          "weight": 3
        },
        {
          "name": "Défense Scandinave active",
          "moves": ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "c6"],
          "weight": 2
        }
      ]
    }'::jsonb
  ),
  (
    'bd89f893-a075-4942-9ad2-553b96aaf01e',
    'Architecte de Gambits',
    1550,
    '{
      "label": "Gambits",
      "personality": "Adore sacrifier des pions pour l'activité et attaque sans relâche",
      "description": "Ce profil prend des risques calculés, crée des positions déséquilibrées et punit les défenses passives. Préparez-vous à défendre avec précision!",
      "traits": [
        "Sacrifices de pions thématiques",
        "Initiative permanente",
        "Recherche de déséquilibres"
      ],
      "engine": {
        "skillLevel": 10,
        "uciElo": 1500,
        "limitStrength": true,
        "multiPv": 4,
        "contempt": 5,
        "randomness": {
          "candidateWeights": [0.65, 0.25, 0.1],
          "maxDeltaCentipawns": 60
        },
        "limits": {
          "moveTimeMs": 900
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Gambit roi accepté",
          "moves": ["e4", "e5", "f4", "exf4", "Nf3", "g5", "h4", "g4", "Ne5"],
          "weight": 4
        },
        {
          "name": "Gambit de Budapest",
          "moves": ["d4", "Nf6", "c4", "e5", "dxe5", "Ng4", "Nf3", "Nc6", "Bf4", "Bb4+"],
          "weight": 3
        },
        {
          "name": "Gambit Benko",
          "moves": ["d4", "Nf6", "c4", "c5", "d5", "b5", "cxb5", "a6", "bxa6", "g6", "Nc3", "Bg7"],
          "weight": 3
        }
      ]
    }'::jsonb
  ),
  (
    'bb61eeb3-c0f7-459e-a2cd-d45d72ba2ab6',
    'Attaquant Foudroyant',
    2050,
    '{
      "label": "Agressif",
      "personality": "Toujours en quête de complications, il ouvre les colonnes contre le roi adverse",
      "description": "Un maître des attaques directes: l''Attaquant Foudroyant privilégie les lignes aiguës, sacrifie du matériel pour l''initiative et attaque sur les cases faibles.",
      "traits": [
        "Attaques sur le roi",
        "Pression permanente",
        "Refuse les finales calmes"
      ],
      "engine": {
        "skillLevel": 14,
        "uciElo": 2050,
        "limitStrength": true,
        "multiPv": 4,
        "contempt": 15,
        "randomness": {
          "candidateWeights": [0.75, 0.2, 0.05],
          "maxDeltaCentipawns": 45
        },
        "limits": {
          "moveTimeMs": 1100
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Dragon accéléré",
          "moves": ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "g6", "Nc3", "Bg7", "Be3", "Nf6", "Qd2", "O-O", "O-O-O"],
          "weight": 4
        },
        {
          "name": "Attaque de l'indienne du roi",
          "moves": ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "f3", "O-O", "Be3", "Nc6", "Qd2", "a6", "O-O-O"],
          "weight": 3
        },
        {
          "name": "Gambit Evans",
          "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4", "Bxb4", "c3", "Ba5", "d4", "exd4", "O-O"],
          "weight": 3
        }
      ]
    }'::jsonb
  ),
  (
    'ae5295e1-8615-4e50-b591-b2c5a077d089',
    'Mur de Granit',
    2400,
    '{
      "label": "Solide",
      "personality": "Patient, pragmatique et prêt à jouer les finales longues",
      "description": "Un mur défensif difficile à percer. Il neutralise les attaques, améliore ses pièces méthodiquement et exploite les faiblesses adverses en finale.",
      "traits": [
        "Stratégie positionnelle",
        "Réduit les risques",
        "Convertit les avantages avec précision"
      ],
      "engine": {
        "skillLevel": 17,
        "uciElo": 2400,
        "limitStrength": true,
        "multiPv": 4,
        "contempt": 0,
        "randomness": {
          "candidateWeights": [0.85, 0.1, 0.05],
          "maxDeltaCentipawns": 30
        },
        "limits": {
          "moveTimeMs": 1300
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Espagnole fermée",
          "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"],
          "weight": 5
        },
        {
          "name": "Slav classique",
          "moves": ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4", "Bf5", "e3", "e6", "Bxc4", "Bb4", "O-O"],
          "weight": 3
        },
        {
          "name": "Défense Caro-Kann solide",
          "moves": ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6", "Nf3", "Nd7", "h4", "h6"],
          "weight": 2
        }
      ]
    }'::jsonb
  ),
  (
    'e747b364-5dae-4d65-8efb-101194646da1',
    'Zen Grand Maître',
    2850,
    '{
      "label": "Équilibré",
      "personality": "Calme et clinique, choisit les lignes les plus précises et attend la moindre imprécision",
      "description": "Le bot ultime: il combine prophylaxie, calcul profond et sens stratégique. Ses coups semblent simples mais cachent une compréhension magistrale.",
      "traits": [
        "Calcul profond",
        "Prophylaxie constante",
        "Conversion technique irréprochable"
      ],
      "engine": {
        "skillLevel": 20,
        "limitStrength": false,
        "multiPv": 5,
        "contempt": -5,
        "randomness": {
          "candidateWeights": [0.9, 0.08, 0.02],
          "maxDeltaCentipawns": 18
        },
        "limits": {
          "moveTimeMs": 1800
        }
      }
    }'::jsonb,
    '{
      "lines": [
        {
          "name": "Nimzo-Indienne Rubinstein",
          "moves": ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "e3", "O-O", "Bd3", "d5", "Nf3", "c5", "O-O", "dxc4", "Bxc4"],
          "weight": 4
        },
        {
          "name": "Catalane fermée",
          "moves": ["d4", "Nf6", "c4", "e6", "g3", "d5", "Bg2", "Be7", "Nf3", "O-O", "O-O", "dxc4", "Qc2", "a6", "a4"],
          "weight": 3
        },
        {
          "name": "Début anglais symétrique",
          "moves": ["c4", "c5", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7", "Nf3", "e5", "O-O", "Nge7", "a3"],
          "weight": 3
        }
      ]
    }'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  elo_target = excluded.elo_target,
  style = excluded.style,
  book = excluded.book;
