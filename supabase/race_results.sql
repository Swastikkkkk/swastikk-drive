-- Race results for the finish screen (assets/race-finish.js): every solo race finish, and the best times per race.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
create table if not exists public.race_results (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  track        text    not null,            -- 'f1:mc', 'daily:2026-10-13', 'drawn:<seed>:<length>'
  mode         text    not null,            -- 'gp' | 'story' | 'daily' | 'race'
  laps         int     not null,
  name         text    not null default 'Driver',
  ms           int     not null,            -- race time
  best_lap_ms  int,
  pos          int     not null,
  field        int     not null,
  story_level  int,
  constraint race_results_sane check (
    char_length(track) <= 64 and mode in ('gp','story','daily','race') and laps between 1 and 80
    and char_length(name) between 1 and 24 and ms between 5000 and 10800000
    and (best_lap_ms is null or best_lap_ms between 5000 and ms)
    and pos between 1 and 60 and field between 1 and 60 and pos <= field
    and (story_level is null or story_level between 1 and 50))
);
create index if not exists race_results_board on public.race_results (track, mode, laps, ms);

alter table public.race_results enable row level security;
-- anyone playing can post a finish and read the boards; nobody can edit or delete through the public key
drop policy if exists "race_results read" on public.race_results;
create policy "race_results read" on public.race_results for select to anon, authenticated using (true);
drop policy if exists "race_results insert" on public.race_results;
create policy "race_results insert" on public.race_results for insert to anon, authenticated with check (true);
