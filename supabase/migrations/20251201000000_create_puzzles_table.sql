create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  fen text not null,
  best_line jsonb not null,
  theme text[] not null default '{}',
  source text not null default 'own_game',
  created_at timestamptz not null default now()
);

alter table public.puzzles
  add constraint puzzles_source_check
  check (source in ('own_game', 'imported'));

create unique index if not exists puzzles_fen_unique on public.puzzles (fen);
create index if not exists puzzles_created_at_idx on public.puzzles (created_at);
