# Procédure de création de règles personnalisées

Cette fiche regroupe une méthode pas-à-pas, un gabarit JSON universel et quatre exemples prêts à l'emploi pour définir n'importe quelle variante dans le moteur (mouvements, actions, effets, zones, etc.).

## 1. Méthode en 8 étapes

1. **Nommer la variante** : nom explicite + courte description.
2. **Choisir la portée** : mouvement, action spéciale, effet temporaire, événement de plateau…
3. **Définir les pièces et mouvements** : vecteurs `[dx, dy]`, `repeat`, `attack`, `leap`, `firstMove`.
4. **Ajouter des actions spéciales (optionnel)** : déclencheur, effet(s), coût/recharge, limites.
5. **Effets et statuts (optionnel)** : statut, durée, modifications de déplacement/interdictions.
6. **Zones et événements (optionnel)** : créer `zones`, écrire les hooks `onEnter`, `afterMove`, etc.
7. **Règles globales** : tour par tour, échec et mat, promotions, égalités, politique de conflit.
8. **Tests** : FEN initiale, script de coups, résultat attendu (`fen`, `illegal`, statut appliqué).

## 2. Template JSON universel

```json
{
  "meta": {
    "name": "{{NOM_VARIANTE}}",
    "base": "chess-base@1.0.0",
    "version": "1.0.0",
    "description": "{{DESCRIPTION_COURTE_ET_CLAIRE}}",
    "priority": 50
  },
  "board": {
    "size": "8x8",
    "zones": [
      {
        "id": "{{zone_id_optional}}",
        "squares": ["{{ex:a4}}", "{{ex:b5}}"]
      }
    ]
  },
  "pieces": [
    {
      "id": "king-white",
      "from": "king",
      "side": "white",
      "moves": [{ "pattern": "king" }],
      "spawn": { "count": 1, "startSquares": ["e1"] }
    },
    {
      "id": "king-black",
      "from": "king",
      "side": "black",
      "moves": [{ "pattern": "king" }],
      "spawn": { "count": 1, "startSquares": ["e8"] }
    },

    {{/* ——— DUPLIQUE pour queen, rook, bishop, knight avec leurs cases d’origine ——— */}}

    {
      "id": "pawn-white",
      "from": "pawn",
      "side": "white",
      "moves": [
        { "vector": [0, 1], "repeat": 1, "attack": false },
        { "vector": [0, 2], "repeat": 1, "attack": false, "firstMove": true }
        {{/* ——— AJOUTE ICI tes mouvements spéciaux (ex. saut diagonal d’attaque) ——— */}}
      ],
      "actions": [
        {
          "id": "{{action_id_optional}}",
          "label": "{{Nom lisible}}",
          "trigger": {
            "type": "manual",
            "phase": "onTurn",
            "conditions": [
              { "type": "hasNotUsedActionThisTurn", "actionId": "{{action_id_optional}}" }
            ]
          },
          "cost": { "type": "cooldown", "turns": {{entier}} },
          "effects": [
            {{/* ——— Liste d’effets atomiques, voir section “effets” ci-dessous ——— */}}
          ]
        }
      ],
      "spawn": { "count": 8, "startSquares": ["a2","b2","c2","d2","e2","f2","g2","h2"] }
    },
    {
      "id": "pawn-black",
      "from": "pawn",
      "side": "black",
      "moves": [
        { "vector": [0, -1], "repeat": 1, "attack": false },
        { "vector": [0, -2], "repeat": 1, "attack": false, "firstMove": true }
        {{/* ——— mouvements spéciaux côté noir (miroir) ——— */}}
      ],
      "actions": [],
      "spawn": { "count": 8, "startSquares": ["a7","b7","c7","d7","e7","f7","g7","h7"] }
    }
  ],

  "effects": [
    {
      "id": "{{statut_ou_effet_id}}",
      "scope": "piece",
      "duration": { "type": "turns", "value": {{entier}} },
      "modifiers": [
        {{/* ex: {"type":"forbidMovePattern","pattern":"bishop"} */}}
      ],
      "cleanup": "auto"
    }
  ],

  "events": [
    {
      "id": "{{event_id_optional}}",
      "hook": "afterMove",
      "conditions": [
        {{/* ex: {"type":"enteredZone","zoneId":"portal-A"} */}}
      ],
      "effects": [
        {{/* ex: {"type":"teleport","toZone":"portal-B","select":"nearestFree"} */}}
      ]
    }
  ],

  "assets": {
    "sprites": [
      { "id": "{{sprite_id}}", "uri": "{{chemin_image_png_svg}}", "attachTo": "{{pieceId|effectId}}" }
    ],
    "sounds": [
      { "id": "{{son_id}}", "uri": "{{chemin_son_wav_mp3}}", "bindTo": "{{event_or_action_id}}" }
    ],
    "animations": [
      { "id": "{{anim_id}}", "type": "particle", "bindTo": "{{effect_or_action}}", "params": { "durationMs": 600 } }
    ]
  },

  "rules": {
    "turnOrder": "whiteThenBlack",
    "checkRules": "classic",
    "promotion": [
      { "piece": "pawn-white", "to": ["queen-white","rook-white-a","rook-white-h","bishop-white-c","bishop-white-f","knight-white-b","knight-white-g"] },
      { "piece": "pawn-black", "to": ["queen-black","rook-black-a","rook-black-h","bishop-black-c","bishop-black-f","knight-black-b","knight-black-g"] }
    ],
    "winConditions": [
      { "type": "checkmate" },
      { "type": "timeout" },
      { "type": "stalemate", "params": { "result": "draw" } }
    ],
    "conflictPolicy": {
      "onDuplicatePieceId": "error",
      "onMoveOverride": "replace",
      "onEffectCollision": "priorityHighWins"
    }
  },

  "tests": [
    {
      "name": "{{Test clair 1}}",
      "fen": "{{FEN_DE_DEPART}}",
      "script": [
        { "move": "{{coup}}", "expect": "{{fen … | illegal | status:{…} }}" }
      ]
    }
  ]
}
```

### Effets atomiques courants

- `{"type":"applyStatus","target":"pieceAt","square":"{{ex:g6}}","statusId":"frozen","duration":2}`
- `{"type":"placeMarker","square":"{{ex:e5}}","markerId":"mine","hidden":true}`
- `{"type":"explode","center":"{{ex:e5}}","radius":0,"removePiece":true}`
- `{"type":"teleport","from":"{{ex:a2}}","to":"{{ex:a4}}","onlyIfFree":true}`
- `{"type":"spawnPiece","pieceId":"{{id}}","square":"{{ex:h5}}"}`
- `{"type":"removePiece","square":"{{ex:h5}}"}`
- `{"type":"playSound","soundId":"{{son_id}}"}`
- `{"type":"playAnimation","animationId":"{{anim_id}}","at":"{{ex:e5}}"}`
- `{"type":"setCooldown","actionId":"{{action_id}}","turns":{{entier}}}`

## 3. Exemples complets

Les exemples suivants illustrent des cas d'usage :

### A. Mouvement spécial — « Pions sauteurs en capture diagonale »

```json
{
  "meta": { "name": "Pions sauteurs (capture diagonale)", "base": "chess-base@1.0.0", "version": "1.0.0", "description": "Les pions peuvent sauter d’une case en diagonale pour capturer, même si la case intermédiaire est bloquée.", "priority": 50 },
  "board": { "size": "8x8", "zones": [] },
  "pieces": [
    { "id":"king-white","from":"king","side":"white","moves":[{"pattern":"king"}],"spawn":{"count":1,"startSquares":["e1"]} },
    { "id":"king-black","from":"king","side":"black","moves":[{"pattern":"king"}],"spawn":{"count":1,"startSquares":["e8"]} },

    { "id":"queen-white","from":"queen","side":"white","moves":[{"pattern":"queen"}],"spawn":{"count":1,"startSquares":["d1"]} },
    { "id":"queen-black","from":"queen","side":"black","moves":[{"pattern":"queen"}],"spawn":{"count":1,"startSquares":["d8"]} },

    { "id":"rook-white-a","from":"rook","side":"white","moves":[{"pattern":"rook"}],"spawn":{"count":1,"startSquares":["a1"]} },
    { "id":"rook-white-h","from":"rook","side":"white","moves":[{"pattern":"rook"}],"spawn":{"count":1,"startSquares":["h1"]} },
    { "id":"rook-black-a","from":"rook","side":"black","moves":[{"pattern":"rook"}],"spawn":{"count":1,"startSquares":["a8"]} },
    { "id":"rook-black-h","from":"rook","side":"black","moves":[{"pattern":"rook"}],"spawn":{"count":1,"startSquares":["h8"]} },

    { "id":"bishop-white-c","from":"bishop","side":"white","moves":[{"pattern":"bishop"}],"spawn":{"count":1,"startSquares":["c1"]} },
    { "id":"bishop-white-f","from":"bishop","side":"white","moves":[{"pattern":"bishop"}],"spawn":{"count":1,"startSquares":["f1"]} },
    { "id":"bishop-black-c","from":"bishop","side":"black","moves":[{"pattern":"bishop"}],"spawn":{"count":1,"startSquares":["c8"]} },
    { "id":"bishop-black-f","from":"bishop","side":"black","moves":[{"pattern":"bishop"}],"spawn":{"count":1,"startSquares":["f8"]} },

    { "id":"knight-white-b","from":"knight","side":"white","moves":[{"pattern":"knight"}],"spawn":{"count":1,"startSquares":["b1"]} },
    { "id":"knight-white-g","from":"knight","side":"white","moves":[{"pattern":"knight"}],"spawn":{"count":1,"startSquares":["g1"]} },
    { "id":"knight-black-b","from":"knight","side":"black","moves":[{"pattern":"knight"}],"spawn":{"count":1,"startSquares":["b8"]} },
    { "id":"knight-black-g","from":"knight","side":"black","moves":[{"pattern":"knight"}],"spawn":{"count":1,"startSquares":["g8"]} },

    {
      "id":"pawn-white","from":"pawn","side":"white",
      "moves":[
        { "vector":[0,1], "repeat":1, "attack":false },
        { "vector":[0,2], "repeat":1, "attack":false, "firstMove":true },
        { "vector":[1,1], "repeat":1, "attack":true, "leap":true },
        { "vector":[-1,1], "repeat":1, "attack":true, "leap":true }
      ],
      "spawn":{"count":8,"startSquares":["a2","b2","c2","d2","e2","f2","g2","h2"]}
    },
    {
      "id":"pawn-black","from":"pawn","side":"black",
      "moves":[
        { "vector":[0,-1], "repeat":1, "attack":false },
        { "vector":[0,-2], "repeat":1, "attack":false, "firstMove":true },
        { "vector":[1,-1], "repeat":1, "attack":true, "leap":true },
        { "vector":[-1,-1], "repeat":1, "attack":true, "leap":true }
      ],
      "spawn":{"count":8,"startSquares":["a7","b7","c7","d7","e7","f7","g7","h7"]}
    }
  ],
  "effects": [],
  "rules": {
    "turnOrder":"whiteThenBlack",
    "checkRules":"classic",
    "promotion":[
      { "piece":"pawn-white", "to":["queen-white","rook-white-a","rook-white-h","bishop-white-c","bishop-white-f","knight-white-b","knight-white-g"] },
      { "piece":"pawn-black", "to":["queen-black","rook-black-a","rook-black-h","bishop-black-c","bishop-black-f","knight-black-b","knight-black-g"] }
    ],
    "winConditions":[ { "type":"checkmate" }, { "type":"timeout" }, { "type":"stalemate","params":{"result":"draw"} } ],
    "conflictPolicy": { "onDuplicatePieceId":"error","onMoveOverride":"replace","onEffectCollision":"priorityHighWins" }
  },
  "tests": [
    {
      "name":"Capture en saut diagonal",
      "fen":"rnbqkbnr/pppppppp/6n1/5P2/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "script":[
        { "move":"f5xg6", "expect":"fen rnbqkbnr/pppppppp/6P1/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1" }
      ]
    },
    {
      "name":"Interdit: saut diagonal sans capture",
      "fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "script":[
        { "move":"e2-f3", "expect":"illegal" }
      ]
    }
  ]
}
```

### B. Action spéciale — « Fou pose une mine invisible »

```json
{
  "meta": { "name":"Fou mineur", "base":"chess-base@1.0.0", "version":"1.0.0", "description":"Chaque fou peut poser une mine invisible sur sa case. La mine explose après 2 tours si une pièce finit son déplacement dessus.", "priority":50 },
  "board": { "size":"8x8", "zones":[] },
  "pieces": [
    {{/* … rois, reines, tours, cavaliers, pions identiques au standard … */}},
    {
      "id":"bishop-white-c","from":"bishop","side":"white","moves":[{"pattern":"bishop"}],
      "actions":[
        {
          "id":"place-mine",
          "label":"Poser une mine",
          "trigger":{ "type":"manual","phase":"onTurn","conditions":[ { "type":"squareEmptyOfMarker","markerId":"mine" } ] },
          "cost":{ "type":"cooldown","turns":3 },
          "effects":[
            { "type":"placeMarker","square":"current","markerId":"mine","hidden":true,"data":{"delay":2} },
            { "type":"playSound","soundId":"mine-armed" }
          ]
        }
      ],
      "spawn":{"count":1,"startSquares":["c1"]}
    },
    {
      "id":"bishop-white-f","from":"bishop","side":"white","moves":[{"pattern":"bishop"}],
      "actions":[ { "id":"place-mine","label":"Poser une mine","trigger":{"type":"manual","phase":"onTurn"}, "cost":{"type":"cooldown","turns":3}, "effects":[ { "type":"placeMarker","square":"current","markerId":"mine","hidden":true,"data":{"delay":2} } ] } ],
      "spawn":{"count":1,"startSquares":["f1"]}
    },
    {
      "id":"bishop-black-c","from":"bishop","side":"black","moves":[{"pattern":"bishop"}],
      "actions":[ { "id":"place-mine","label":"Poser une mine","trigger":{"type":"manual","phase":"onTurn"}, "cost":{"type":"cooldown","turns":3}, "effects":[ { "type":"placeMarker","square":"current","markerId":"mine","hidden":true,"data":{"delay":2} } ] } ],
      "spawn":{"count":1,"startSquares":["c8"]}
    },
    {
      "id":"bishop-black-f","from":"bishop","side":"black","moves":[{"pattern":"bishop"}],
      "actions":[ { "id":"place-mine","label":"Poser une mine","trigger":{"type":"manual","phase":"onTurn"}, "cost":{"type":"cooldown","turns":3}, "effects":[ { "type":"placeMarker","square":"current","markerId":"mine","hidden":true,"data":{"delay":2} } ] } ],
      "spawn":{"count":1,"startSquares":["f8"]}
    }
  ],
  "events":[
    {
      "id":"mine-tick",
      "hook":"onTurnStart",
      "effects":[ { "type":"decrementMarkerData","markerId":"mine","key":"delay" } ]
    },
    {
      "id":"mine-trigger",
      "hook":"afterMove",
      "conditions":[ { "type":"landedOnMarker","markerId":"mine" }, { "type":"markerDataEquals","markerId":"mine","key":"delay","value":0 } ],
      "effects":[
        { "type":"explode","center":"movedTo","radius":0,"removePiece":true },
        { "type":"removeMarker","markerId":"mine" },
        { "type":"playAnimation","animationId":"explosion","at":"movedTo" },
        { "type":"playSound","soundId":"boom" }
      ]
    }
  ],
  "assets": {
    "sprites":[ { "id":"mine-icon","uri":"sprites/mine.png","attachTo":"marker:mine" } ],
    "sounds":[ { "id":"mine-armed","uri":"sounds/arm.mp3" }, { "id":"boom","uri":"sounds/boom.mp3" } ],
    "animations":[ { "id":"explosion","type":"particle","params":{"durationMs":800} } ]
  },
  "rules": { "turnOrder":"whiteThenBlack", "checkRules":"classic", "promotion":[], "winConditions":[{"type":"checkmate"}], "conflictPolicy":{"onDuplicatePieceId":"error","onMoveOverride":"replace","onEffectCollision":"priorityHighWins"} },
  "tests":[
    { "name":"Armer mine", "fen":"8/8/8/4B3/8/8/8/4k3 w - - 0 1", "script":[ { "move":"Be6-e4", "expect":"fen 8/8/8/8/4B3/8/8/4k3 b - - 0 1" } ] }
  ]
}
```

### C. Effet temporaire — « La dame gèle une pièce pendant 1 tour »

```json
{
  "meta": { "name":"Dame de glace", "base":"chess-base@1.0.0", "version":"1.0.0", "description":"Une fois par tour, la dame peut geler une pièce adverse adjacente pendant 1 tour (elle ne peut pas se déplacer au tour suivant).", "priority":50 },
  "board": { "size":"8x8", "zones":[] },
  "pieces": [
    {{/* … set standard … */}},
    {
      "id":"queen-white","from":"queen","side":"white","moves":[{"pattern":"queen"}],
      "actions":[
        {
          "id":"freeze",
          "label":"Geler la pièce",
          "trigger":{ "type":"manual","phase":"onTurn" },
          "cost":{ "type":"cooldown","turns":1 },
          "effects":[
            { "type":"applyStatus","target":"adjacentEnemy","range":1,"statusId":"frozen","duration":1 },
            { "type":"playAnimation","animationId":"freeze-burst","at":"target" }
          ]
        }
      ],
      "spawn":{"count":1,"startSquares":["d1"]}
    },
    {
      "id":"queen-black","from":"queen","side":"black","moves":[{"pattern":"queen"}],
      "actions":[ { "id":"freeze","label":"Geler la pièce","trigger":{"type":"manual","phase":"onTurn"}, "cost":{"type":"cooldown","turns":1}, "effects":[ { "type":"applyStatus","target":"adjacentEnemy","range":1,"statusId":"frozen","duration":1 } ] } ],
      "spawn":{"count":1,"startSquares":["d8"]}
    }
  ],
  "effects":[
    {
      "id":"frozen",
      "scope":"piece",
      "duration":{"type":"turns","value":1},
      "modifiers":[ { "type":"forbidAnyMove", "reason":"frozen" } ],
      "cleanup":"auto"
    }
  ],
  "assets": {
    "animations":[ { "id":"freeze-burst","type":"particle","params":{"durationMs":500} } ]
  },
  "rules": { "turnOrder":"whiteThenBlack","checkRules":"classic","promotion":[], "winConditions":[{"type":"checkmate"}], "conflictPolicy":{"onDuplicatePieceId":"error","onMoveOverride":"replace","onEffectCollision":"priorityHighWins"} },
  "tests":[
    {
      "name":"Gel d’une pièce adjacente",
      "fen":"8/8/8/8/3Q4/3p4/8/3k4 w - - 0 1",
      "script":[
        { "move":"[action] freeze d4-d5", "expect":"status:{ target:'d5', has:'frozen' }" },
        { "move":"d5-d4", "expect":"illegal" }
      ]
    }
  ]
}
```

### D. Événement de plateau — « Portails A ⇄ B »

```json
{
  "meta": { "name":"Portails jumeaux", "base":"chess-base@1.0.0", "version":"1.0.0", "description":"Deux portails relient A et B. Entrer sur un portail te téléporte vers l’autre, si la case d’arrivée est libre.", "priority":50 },
  "board": {
    "size":"8x8",
    "zones":[
      { "id":"portal-A","squares":["b4"] },
      { "id":"portal-B","squares":["g5"] }
    ]
  },
  "pieces":[ {{/* … set standard … */}} ],
  "events":[
    {
      "id":"teleport-A-to-B",
      "hook":"afterMove",
      "conditions":[ { "type":"enteredZone","zoneId":"portal-A" } ],
      "effects":[ { "type":"teleport","toZone":"portal-B","select":"sameIndex","onlyIfFree":true } ]
    },
    {
      "id":"teleport-B-to-A",
      "hook":"afterMove",
      "conditions":[ { "type":"enteredZone","zoneId":"portal-B" } ],
      "effects":[ { "type":"teleport","toZone":"portal-A","select":"sameIndex","onlyIfFree":true } ]
    }
  ],
  "assets": {
    "sprites":[
      { "id":"portal-A-sprite","uri":"sprites/portalA.png","attachTo":"zone:portal-A" },
      { "id":"portal-B-sprite","uri":"sprites/portalB.png","attachTo":"zone:portal-B" }
    ],
    "sounds":[ { "id":"warp","uri":"sounds/warp.mp3" } ]
  },
  "rules": { "turnOrder":"whiteThenBlack","checkRules":"classic","promotion":[], "winConditions":[{"type":"checkmate"}], "conflictPolicy":{"onDuplicatePieceId":"error","onMoveOverride":"replace","onEffectCollision":"priorityHighWins"} },
  "tests":[
    {
      "name":"Téléportation",
      "fen":"8/8/8/6P1/1P6/8/8/4k3 w - - 0 1",
      "script":[
        { "move":"b4-b5", "expect":"fen 8/8/8/6P1/8/8/8/4k3 b - - 0 1" },
        { "move":"g5-g4", "expect":"fen 8/8/8/8/1P6/8/8/4k3 w - - 0 2" }
      ]
    }
  ]
}
```

## 4. Check-list rapide

- Vecteurs toujours en tableaux d'entiers.
- `spawn.count` = nombre de `startSquares`.
- Pions miroir (vecteurs opposés pour les deux camps).
- Actions : `id`, `trigger`, `cost`, `effects` listés.
- Effets : déclarer le statut une seule fois dans `"effects"`.
- Événements : `hook`, `conditions`, `effects`.
- Assets : ids stables (sons, sprites, animations).
- Tests : chaque coup → résultat attendu (`fen`, `illegal`, `status:{…}`).

## 5. Astuces

- **Mouvement inédit** : ajouter une entrée dans `moves` avec `vector`, `attack`, `leap`, `repeat`, etc.
- **Pouvoir activable** : créer une `action` avec `cooldown` + effets.
- **Effet durable** : utiliser un `status` dans `effects` + durée.
- **Piège / zone** : combiner `marker` ou `zone` + `events` (`afterMove`, `onTurnStart`, …).
- **Retour visuel/son** : lier `playAnimation` / `playSound` au moment clé.

