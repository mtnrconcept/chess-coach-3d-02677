create extension if not exists "pgcrypto";

create table if not exists public.chess_lobbies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  host_name text not null,
  time_control text not null,
  minutes integer not null,
  increment integer not null default 0,
  elo_level text,
  coaching_mode boolean not null default false,
  status text not null default 'open',
  opponent_name text
);

alter table public.chess_lobbies enable row level security;

create policy "Allow anonymous read" on public.chess_lobbies
  for select using (true);

create policy "Allow anonymous insert" on public.chess_lobbies
  for insert with check (true);

create policy "Allow anonymous update" on public.chess_lobbies
  for update using (true) with check (true);

create index if not exists chess_lobbies_status_idx on public.chess_lobbies (status);
