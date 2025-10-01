create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  description text,
  format text not null default 'swiss',
  status text not null default 'draft',
  is_rated boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  current_round integer not null default 0,
  time_control text not null default '5+0',
  created_by uuid references auth.users (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  constraint tournaments_format_check check (format in ('swiss', 'arena')),
  constraint tournaments_status_check check (status in ('draft', 'ongoing', 'completed', 'archived', 'cancelled'))
);

create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  rating integer,
  provisional_rating boolean not null default false,
  score real not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  streak integer not null default 0,
  last_active_at timestamptz,
  flags jsonb not null default '[]'::jsonb,
  constraint tournament_players_unique unique (tournament_id, player_id)
);

create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round integer not null,
  board integer not null,
  white_id uuid references public.tournament_players (id) on delete set null,
  black_id uuid references public.tournament_players (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  result_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  constraint pairings_result_status_check check (result_status in ('pending', 'reported', 'validated', 'under_review', 'cancelled')),
  constraint pairings_unique_board_per_round unique (tournament_id, round, board)
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  outcome text not null,
  white_score real not null default 0,
  black_score real not null default 0,
  reported_by uuid references auth.users (id) on delete set null,
  reported_at timestamptz not null default now(),
  accuracy jsonb,
  move_times jsonb,
  player_metrics jsonb not null default '{}'::jsonb,
  suspicious_accuracy boolean not null default false,
  suspicious_timing boolean not null default false,
  flagged boolean not null default false,
  notes text,
  rating_diff jsonb,
  constraint results_outcome_check check (outcome in ('white', 'black', 'draw', 'bye', 'double_forfeit')),
  constraint results_unique_pairing unique (pairing_id)
);

create index if not exists idx_tournament_players_tournament on public.tournament_players (tournament_id);
create index if not exists idx_pairings_tournament_round on public.pairings (tournament_id, round);
create index if not exists idx_pairings_white on public.pairings (white_id);
create index if not exists idx_pairings_black on public.pairings (black_id);
create index if not exists idx_results_tournament on public.results (tournament_id);
create index if not exists idx_results_pairing on public.results (pairing_id);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.pairings enable row level security;
alter table public.results enable row level security;

create policy if not exists "tournaments_select" on public.tournaments
  for select using (true);

create policy if not exists "tournaments_insert" on public.tournaments
  for insert with check (true);

create policy if not exists "tournaments_update" on public.tournaments
  for update using (true) with check (true);

create policy if not exists "tournament_players_select" on public.tournament_players
  for select using (true);

create policy if not exists "tournament_players_insert" on public.tournament_players
  for insert with check (true);

create policy if not exists "tournament_players_update" on public.tournament_players
  for update using (true) with check (true);

create policy if not exists "pairings_select" on public.pairings
  for select using (true);

create policy if not exists "pairings_insert" on public.pairings
  for insert with check (true);

create policy if not exists "pairings_update" on public.pairings
  for update using (true) with check (true);

create policy if not exists "results_select" on public.results
  for select using (true);

create policy if not exists "results_insert" on public.results
  for insert with check (true);

create policy if not exists "results_update" on public.results
  for update using (true) with check (true);
