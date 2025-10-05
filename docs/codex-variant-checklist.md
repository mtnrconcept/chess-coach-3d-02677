# Codex Variant Generation Checklist

This checklist documents the required pipeline to ensure every generated chess variant rule is valid, playable, and error-free.

## ✅ Standard Pipeline

1. **Analyze the prompt → determine the rule type.**
   - Common categories: promotion restrictions/extensions, movement powers, limited-use special actions, special squares, victory conditions, setup modifications.
   - If the prompt implies "once per game/piece", plan for a usage counter (see effects below).
2. **Choose the base JSON template.**
   - Always start from a complete skeleton (see templates) containing:
     - `meta` (name, id, base, version, description)
     - `board`
     - `pieces` (all standard pieces, coherent spawn)
     - `effects` (empty by default)
     - `rules` (`turnOrder`, `checkRules`, `promotion`, `winConditions`, `conflictPolicy`)
     - `tests` (at least 2)
3. **Implement the prompt logic.**
   - Promotion: modify only `rules.promotion`. Never add a `promotions` block in the pawn definition.
   - Movement/effects: add an object to `effects` (see templates).
   - "Once" actions: add `params.usage: "oncePerPiece"` or the engine's equivalent and track effect state.
4. **Respect the schema (engine key names).**
   - Move generation hook: prefer `on: "onGenerateMoves"`. Fallback accepted by some engines: `when: "canMove"`.
   - Target pieces: `applyTo: ["pawn"]` (or other). Use arrays.
   - Logic: `logic: "<engineHookName>"` (e.g., `allowPawnLeapOverFrontIfBlocked`).
5. **Ensure setup coherence.**
   - `spawn.count` must equal the number of `startSquares`.
   - Standard totals: king 2, queen 2, rook 4, bishop 4, knight 4, pawn 16.
6. **Keep base rules present.**
   - `turnOrder: "whiteThenBlack"`
   - `checkRules: "classic"`
   - `winConditions` must include at minimum checkmate, stalemate (draw), timeout.
7. **Minimum tests.**
   - Smoke test: 2 legal moves from the start position.
   - Rule test: script demonstrating the effect (promotion restriction, allowed leap, frozen piece, etc.).
   - Optional: expected failure test (e.g., disallowed promotion returns `INVALID_PROMOTION`).
8. **JSON output.**
   - UTF-8, straight quotes only, no comments, no backticks, no extraneous text.
   - Provide two versions: pretty and minified (minified avoids invisible characters).
9. **Automatic validation.**
   - Validate JSON parsing.
   - Validate schema (required keys and types).
   - Validate coherence (counts, start squares, unique ids).
   - Run tests (at least smoke and rule tests).
   - If an unknown hook is used, switch to the fallback name (`onGenerateMoves` ⇆ `canMove`) and rerun tests.
10. **Clear error messages on failure.**
    - `JSON_PARSE_ERROR: contenu hors-JSON détecté (backticks ou texte avant/après l’accolade).`
    - `SCHEMA_ERROR: spawn.count ≠ nombre de startSquares pour <pieceId>.`
    - `HOOK_ERROR: logique '<logic>' inconnue du moteur.`
    - `TEST_FAILED: <testName> → <errorMessage>.`

## 🧩 Template 1 — Classic Variant (standard base)

Use this template for every variant, then modify only `effects` and/or `rules.promotion` according to the prompt.

```json
{
  "meta": {
    "name": "<nom lisible>",
    "id": "<kebab-case-unique>",
    "base": "chess-base@1.0.0",
    "version": "1.0.0",
    "description": "<description brève et claire>"
  },
  "board": { "size": "8x8", "zones": [] },
  "pieces": [
    { "id": "king", "from": "king", "side": "both", "moves": [{ "pattern": "king" }],   "spawn": { "count": 2, "startSquares": ["e1","e8"] } },
    { "id": "queen","from": "queen","side": "both","moves": [{ "pattern": "queen" }], "spawn": { "count": 2, "startSquares": ["d1","d8"] } },
    { "id": "rook", "from": "rook", "side": "both", "moves": [{ "pattern": "rook" }],  "spawn": { "count": 4, "startSquares": ["a1","h1","a8","h8"] } },
    { "id": "bishop","from":"bishop","side":"both","moves":[{"pattern":"bishop"}],     "spawn": { "count": 4, "startSquares": ["c1","f1","c8","f8"] } },
    { "id": "knight","from":"knight","side":"both","moves":[{"pattern":"knight"}],     "spawn": { "count": 4, "startSquares": ["b1","g1","b8","g8"] } },
    { "id": "pawn", "from": "pawn", "side": "both", "moves": [{ "pattern": "pawn" }],  "spawn": { "count": 16, "startSquares": ["a2","b2","c2","d2","e2","f2","g2","h2","a7","b7","c7","d7","e7","f7","g7","h7"] } }
  ],
  "effects": [],
  "rules": {
    "turnOrder": "whiteThenBlack",
    "checkRules": "classic",
    "promotion": [{ "piece": "pawn", "to": ["queen","rook","bishop","knight"] }],
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
    { "name": "Smoke", "fen": "startpos", "script": [{ "move": "e2-e4" }, { "move": "b8-c6" }] }
  ]
}
```

## 🔧 Template 2 — Restrict Promotion (e.g., “pawn → rook only”)

Replace only `rules.promotion`. Do not add anything to `pieces.pawn`.

```json
"rules": {
  "turnOrder": "whiteThenBlack",
  "checkRules": "classic",
  "promotion": [
    { "piece": "pawn", "to": ["rook"] }
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
}
```

Add tests:
- Promotion allowed → `promotion: "rook"`
- Promotion forbidden → `promotion: "queen"` + `error: "INVALID_PROMOTION"`

## 🛠️ Template 3 — Movement Effect (hook) + fallback

Use `on: "onGenerateMoves"` first. If the engine does not recognize it, automatically fallback to `when: "canMove"`.

```json
"effects": [
  {
    "id": "<id-effet-unique>",
    "applyTo": ["pawn"],
    "on": "onGenerateMoves",
    "logic": "<nomDeLaFonctionCôtéMoteur>",
    "params": {
      "requireEmptyLanding": true,
      "captureOnLanding": false,
      "usage": "unlimited"
    }
  }
]
```

Fallback when hook error occurs:

```json
"effects": [
  {
    "id": "<id-effet-unique>",
    "applyTo": ["pawn"],
    "when": "canMove",
    "logic": "<nomDeLaFonctionCôtéMoteur>",
    "params": {
      "requireEmptyLanding": true,
      "captureOnLanding": false,
      "usage": "unlimited"
    }
  }
]
```

For a "once per pawn" power:
- Add `params.usage: "oncePerPiece"` (or the engine-specific field).
- Track the usage state within the effect.

## 🧪 Test Template (always include)

- Smoke: 2 simple legal moves from `startpos`.
- Rule test: a minimal FEN and script triggering the rule.
- Failure test (if relevant): attempt the forbidden action and expect an error code.

Example (restricted promotion):

```json
{
  "tests": [
    { "name": "Smoke", "fen": "startpos", "script": [{ "move": "e2-e4" }, { "move": "b8-c6" }] },
    { "name": "Autorisé", "fen": "8/P7/8/8/8/8/8/8 w - - 0 1", "script": [{ "move": "a7a8", "promotion": "rook" }] },
    { "name": "Interdit", "fen": "8/P7/8/8/8/8/8/8 w - - 0 1", "script": [{ "move": "a7a8", "promotion": "queen", "error": "INVALID_PROMOTION" }] }
  ]
}
```

## 🛡️ Must-Have Bug Guards (Do / Don’t)

**Do**
- Always produce two outputs: pretty and minified.
- UTF-8, straight quotes only.
- Ensure `spawn.count` = number of `startSquares`.
- Use unique kebab-case IDs (e.g., `les-pions-...`).
- Avoid duplicating rules (promotion: only the global section).
- Provide descriptive error messages when a test fails.

**Don’t**
- No backticks ``` or out-of-JSON text.
- No typographic quotes or non-breaking spaces.
- No promotions defined inside `pieces.pawn`.
- No duplicate IDs (pieces, effects, tests).
- Do not modify `checkRules` or win conditions unless requested by the prompt.

## 🧭 Auto-Corrections to Attempt Before Failing

1. If `on: "onGenerateMoves"` is unknown → replace with `when: "canMove"`.
2. If `spawn.count` ≠ `startSquares.length` → adjust count to match.
3. If both `pieces[].promotions` and `rules.promotion` exist → remove the per-piece version.
4. Automatically strip backticks, `//` or `/* */` comments, invisible characters.
5. Validate that `pieces[].side ∈ {"both", "white", "black"}` and each `moves[].pattern` is recognized.

## 📝 Success Message Format

On success, return:
- `✅ Variante générée et validée (JSON + tests passés).`
- `variant_pretty.json`
- `variant_min.json`
- Explicit test results (success/failure).

