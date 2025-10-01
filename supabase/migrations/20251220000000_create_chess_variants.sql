create type if not exists public.variant_source as enum ('builtin', 'generated');

create table if not exists public.chess_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  display_order integer,
  rule_id text,
  title text not null,
  summary text not null,
  rules text not null,
  difficulty text,
  prompt text,
  source public.variant_source not null default 'generated',
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists chess_variants_rule_id_key
  on public.chess_variants (rule_id)
  where rule_id is not null;

create index if not exists chess_variants_display_order_idx
  on public.chess_variants (display_order);

create index if not exists chess_variants_created_at_idx
  on public.chess_variants (created_at);

alter table public.chess_variants enable row level security;

drop policy if exists "Allow read access to chess variants" on public.chess_variants;
create policy "Allow read access to chess variants"
  on public.chess_variants
  for select
  using (true);

drop policy if exists "Allow insert generated variants" on public.chess_variants;
create policy "Allow insert generated variants"
  on public.chess_variants
  for insert
  with check (source = 'generated');

create table if not exists public.chess_variant_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  variant_id uuid not null references public.chess_variants(id) on delete cascade,
  prompt text not null,
  difficulty text,
  rules text not null
);

create index if not exists chess_variant_prompts_variant_id_idx
  on public.chess_variant_prompts (variant_id);

alter table public.chess_variant_prompts enable row level security;

drop policy if exists "Allow read variant prompts" on public.chess_variant_prompts;
create policy "Allow read variant prompts"
  on public.chess_variant_prompts
  for select
  using (true);

drop policy if exists "Allow insert variant prompts" on public.chess_variant_prompts;
create policy "Allow insert variant prompts"
  on public.chess_variant_prompts
  for insert
  with check (true);

insert into public.chess_variants (rule_id, display_order, title, summary, rules, source, metadata)
values
  ('knight-tornado', 1, 'Cavalier Tornade', 'Après une capture par un cavalier, il peut rejouer un second saut immédiatement.', 'Après une capture par un cavalier, il peut rejouer un second saut immédiatement.', 'builtin', jsonb_build_object('builtin', true)),
  ('queen-teleport', 2, 'Reine Éclaire', 'Une fois par partie, la reine peut se téléporter sur n’importe quelle case libre.', 'Une fois par partie, la reine peut se téléporter sur n’importe quelle case libre.', 'builtin', jsonb_build_object('builtin', true)),
  ('pawn-kamikaze', 3, 'Pion Kamikaze', 'Quand un pion atteint la 5e rangée, il peut exploser et éliminer toutes les pièces autour (3×3) en se sacrifiant.', 'Quand un pion atteint la 5e rangée, il peut exploser et éliminer toutes les pièces autour (3×3) en se sacrifiant.', 'builtin', jsonb_build_object('builtin', true)),
  ('rook-cannon', 4, 'Tour Canon', 'La tour peut, au lieu de bouger, tirer en ligne droite et éliminer une pièce adverse sur sa ligne/colonne.', 'La tour peut, au lieu de bouger, tirer en ligne droite et éliminer une pièce adverse sur sa ligne/colonne.', 'builtin', jsonb_build_object('builtin', true)),
  ('bishop-chameleon', 5, 'Fou Caméléon', 'Une fois par partie, un fou peut sauter d’1 case orthogonale pour changer de couleur de diagonale.', 'Une fois par partie, un fou peut sauter d’1 case orthogonale pour changer de couleur de diagonale.', 'builtin', jsonb_build_object('builtin', true)),
  ('angry-king', 6, 'Roi en Colère', 'Si votre roi a été mis en échec 3 fois de suite, il peut bouger comme une reine pendant 1 tour.', 'Si votre roi a été mis en échec 3 fois de suite, il peut bouger comme une reine pendant 1 tour.', 'builtin', jsonb_build_object('builtin', true)),
  ('pawn-fusion', 7, 'Pions Fusion', 'Deux pions alliés adjacents peuvent fusionner en une super-pièce qui se déplace comme une tour ou un fou.', 'Deux pions alliés adjacents peuvent fusionner en une super-pièce qui se déplace comme une tour ou un fou.', 'builtin', jsonb_build_object('builtin', true)),
  ('airdrop', 8, 'Invasion Aérienne', 'Tous les 10 coups, parachuter une pièce capturée dans son propre camp (case vide).', 'Tous les 10 coups, parachuter une pièce capturée dans son propre camp (case vide).', 'builtin', jsonb_build_object('builtin', true)),
  ('acrobatic-knight', 9, 'Cavalier Acrobatique', 'Le cavalier peut sauter par-dessus 2 pièces consécutives (portée inchangée, simple permission).', 'Le cavalier peut sauter par-dessus 2 pièces consécutives (portée inchangée, simple permission).', 'builtin', jsonb_build_object('builtin', true)),
  ('rook-catapult', 10, 'Tour Catapulte', 'Une tour peut catapulter un pion ami devant elle de 2 cases.', 'Une tour peut catapulter un pion ami devant elle de 2 cases.', 'builtin', jsonb_build_object('builtin', true)),
  ('ghost-bishop', 11, 'Fou Fantôme', 'Une fois capturé, un fou peut revenir au tour suivant sur une case libre de sa couleur de case d’origine.', 'Une fois capturé, un fou peut revenir au tour suivant sur une case libre de sa couleur de case d’origine.', 'builtin', jsonb_build_object('builtin', true)),
  ('elastic-pawn', 12, 'Pion Élastique', 'Une fois par partie, un pion peut reculer d’une case.', 'Une fois par partie, un pion peut reculer d’une case.', 'builtin', jsonb_build_object('builtin', true)),
  ('queen-berserk', 13, 'Reine Berserk', 'Si la reine capture 2 tours de suite, elle doit continuer à capturer tant que possible.', 'Si la reine capture 2 tours de suite, elle doit continuer à capturer tant que possible.', 'builtin', jsonb_build_object('builtin', true)),
  ('king-shield', 14, 'Roi Bouclier', 'Si le roi finit adjacent à un pion ami, ce pion ne peut pas être capturé pendant 1 tour.', 'Si le roi finit adjacent à un pion ami, ce pion ne peut pas être capturé pendant 1 tour.', 'builtin', jsonb_build_object('builtin', true)),
  ('double-knight', 15, 'Double Cavalier', 'Deux cavaliers adjacents peuvent sauter ensemble (même motif).', 'Deux cavaliers adjacents peuvent sauter ensemble (même motif).', 'builtin', jsonb_build_object('builtin', true)),
  ('rook-magnet', 16, 'Tour Aimant', 'Au début de votre tour, vos tours attirent d’une case vers elles les ennemis alignés.', 'Au début de votre tour, vos tours attirent d’une case vers elles les ennemis alignés.', 'builtin', jsonb_build_object('builtin', true)),
  ('bishop-healer', 17, 'Fou Guérisseur', 'Un fou peut, au lieu de jouer, ramener un pion ou un cavalier allié capturé sur une case adjacente libre.', 'Un fou peut, au lieu de jouer, ramener un pion ou un cavalier allié capturé sur une case adjacente libre.', 'builtin', jsonb_build_object('builtin', true)),
  ('pawn-shuriken', 18, 'Pion Shuriken', 'Un pion peut éliminer une pièce diagonale adjacente sans bouger (attaque à distance courte).', 'Un pion peut éliminer une pièce diagonale adjacente sans bouger (attaque à distance courte).', 'builtin', jsonb_build_object('builtin', true)),
  ('queen-split', 19, 'Reine Divisée', 'Une fois par partie, la reine peut se séparer en deux tours, ou deux fous, sur cases adjacentes libres.', 'Une fois par partie, la reine peut se séparer en deux tours, ou deux fous, sur cases adjacentes libres.', 'builtin', jsonb_build_object('builtin', true)),
  ('rook-fortress', 20, 'Tour Forteresse', 'Deux tours alliées côte à côte ne peuvent pas être capturées tant qu’elles restent adjacentes.', 'Deux tours alliées côte à côte ne peuvent pas être capturées tant qu’elles restent adjacentes.', 'builtin', jsonb_build_object('builtin', true)),
  ('dragon-knight', 21, 'Cavalier Dragon', 'Un cavalier peut éliminer une pièce ennemie adjacente sans bouger (souffle de feu).', 'Un cavalier peut éliminer une pièce ennemie adjacente sans bouger (souffle de feu).', 'builtin', jsonb_build_object('builtin', true)),
  ('pawn-swap', 22, 'Pion Téléporté', 'Quand un pion atteint la 4e rangée, il peut échanger sa place avec un autre pion allié.', 'Quand un pion atteint la 4e rangée, il peut échanger sa place avec un autre pion allié.', 'builtin', jsonb_build_object('builtin', true)),
  ('siren-queen', 23, 'Reine Sirène', 'Les pièces ennemies dans un rayon de 2 cases autour de la reine ne peuvent pas bouger pendant 1 tour.', 'Les pièces ennemies dans un rayon de 2 cases autour de la reine ne peuvent pas bouger pendant 1 tour.', 'builtin', jsonb_build_object('builtin', true)),
  ('rook-heli', 24, 'Tour Hélicoptère', 'Une fois par partie, une tour peut se déplacer d’une case en diagonale.', 'Une fois par partie, une tour peut se déplacer d’une case en diagonale.', 'builtin', jsonb_build_object('builtin', true)),
  ('mutant-pawn', 25, 'Pion Mutant', 'Quand un pion atteint la 6e rangée, il peut devenir un cavalier pendant 3 tours.', 'Quand un pion atteint la 6e rangée, il peut devenir un cavalier pendant 3 tours.', 'builtin', jsonb_build_object('builtin', true)),
  ('hypno-bishop', 26, 'Fou Hypnotiseur', 'Une fois au contact, un fou peut forcer une pièce ennemie adjacente à effectuer un déplacement légal choisi.', 'Une fois au contact, un fou peut forcer une pièce ennemie adjacente à effectuer un déplacement légal choisi.', 'builtin', jsonb_build_object('builtin', true)),
  ('escape-king', 27, 'Roi Évasion', 'Si le roi est entouré par 3 ennemis, il peut sauter comme un cavalier pour s’échapper.', 'Si le roi est entouré par 3 ennemis, il peut sauter comme un cavalier pour s’échapper.', 'builtin', jsonb_build_object('builtin', true)),
  ('hidden-bomb', 28, 'Bombe Cachée', 'Au début, chaque joueur choisit un pion-bombe. Quand il est capturé, il explose (3×3).', 'Au début, chaque joueur choisit un pion-bombe. Quand il est capturé, il explose (3×3).', 'builtin', jsonb_build_object('builtin', true)),
  ('surprise-promo', 29, 'Promotion Surprise', 'Un pion peut se promouvoir en une pièce ennemie encore en jeu.', 'Un pion peut se promouvoir en une pièce ennemie encore en jeu.', 'builtin', jsonb_build_object('builtin', true)),
  ('mission-win', 30, 'Victoire de Mission', 'Amenez un pion dans les 2 dernières rangées adverses pour gagner immédiatement.', 'Amenez un pion dans les 2 dernières rangées adverses pour gagner immédiatement.', 'builtin', jsonb_build_object('builtin', true))
on conflict (rule_id) do update
  set display_order = excluded.display_order,
      title = excluded.title,
      summary = excluded.summary,
      rules = excluded.rules,
      source = 'builtin',
      metadata = jsonb_build_object('builtin', true);
