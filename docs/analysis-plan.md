# Plan d'implémentation pour l'analyse Stockfish

Ce document décrit la feuille de route pour mettre en place l'analyse côté client et côté serveur, en tenant compte du fait que les binaires lourds (comme `stockfish.wasm`) ne peuvent pas être committés dans ce dépôt. Les étapes reprennent les constats du rapport précédent en les adaptant à cette contrainte.

## 1. Distribution du binaire WebAssembly
- **Action** : fournir un script de téléchargement (ex. `scripts/fetch-stockfish-wasm.ts`) ou une étape de build documentée qui récupère la version légère de Stockfish (compilation sans NNUE) depuis une URL officielle.
- **Justification** : le dépôt n'autorise pas le commit de fichiers binaires volumineux. La CI ou les développeurs devront exécuter le script avant de lancer l'application.
- **Livrables** :
  - Script de récupération + vérification de checksum.
  - Mise à jour de la documentation (README ou guide d'installation) pour expliquer comment obtenir `public/engines/stockfish.wasm` localement.

## 2. Wrapper WebAssembly (`src/engine/stockfishClient.ts`)
- Implémenter `initEngine(wasmUrl)` et `analysePosition` pour orchestrer la communication UCI avec le moteur chargé en WASM.
- Gérer les limites `movetimeMs` ou `nodes`, parser les lignes PV et exposer `{ evalCp, pv, bestMove }`.
- Ajouter des garde-fous (file d'attente de requêtes, timeout, nettoyage mémoire) pour éviter les blocages dans le navigateur.

## 3. Service d'analyse côté client (`src/services/analysisClient.ts`)
- Router les parties courtes vers le moteur WASM local.
- Escalader les demandes longues vers la Supabase Edge Function.
- Normaliser la réponse pour l'UI (structure de coups, évals avant/après, PV, tags).

## 4. Supabase Edge Function `analysis`
- `index.ts` : accepter `{ pgn, depth, multiPv }`, orchestrer l'exécution Stockfish natif (via Deno `Command` ou un worker HTTP), et renvoyer les évals par coup.
- `tagger.ts` : appliquer les seuils Elo configurés dans `thresholds.json` pour déterminer `ok`, `inaccuracy`, `mistake`, `blunder`, `brilliant`, `great`.
- Prévoir un mécanisme optionnel de cache ou de streaming pour les analyses complètes.

## 5. Interface utilisateur d'analyse
- `src/features/analysis/GameReviewPanel.tsx` : afficher la timeline avec les badges (✅, 🟡, 🟠, 🔴, 💎, ⭐) et le bouton "Montrer le meilleur coup" qui pousse la ligne PV sur l'échiquier.
- `src/features/analysis/hooks/useGameReview.ts` : centraliser l'état, les appels au service d'analyse et les actions utilisateur.
- S'assurer que les badges reflètent les tags renvoyés par le backend et que la navigation dans la partie reste fluide.

## 6. Schéma de base de données Supabase
- Ajouter une migration créant les tables `games`, `analyses` et `moves` avec les contraintes spécifiées (foreign keys, `CHECK` sur `moves.tag`, timestamps par défaut).
- Mettre à jour les types Supabase générés si nécessaire pour consommer les nouvelles tables depuis le client.

## 7. Tests et critères de performance
- Valider que 95 % des reviews depth 20 terminent en < 10 s (en combinant WASM et serveur).
- Vérifier la cohérence des évaluations (±0.1 pion) entre WASM et serveur.
- Tester la stabilité du tagger sur des parties de référence à Elo fixe.

## Prochaines étapes
1. Commencer par le script d'obtention du binaire et le wrapper WASM pour débloquer l'analyse locale.
2. Mettre en place le service front, puis l'Edge Function + tagger.
3. Terminer par l'UI et les migrations Supabase, suivis d'un cycle de tests finaux.
