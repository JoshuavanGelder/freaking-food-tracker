-- Freaking Food Tracker — database (Supabase / Postgres)
-- Uitvoeren in Supabase → SQL Editor → New query → plakken → Run. Kan veilig opnieuw (idempotent).
--
-- Ieder ziet en wijzigt alleen zijn eigen rijen (row level security). Vrienden komen later (fase 3):
-- dan komen er een tabel friendships en extra leesregels bij, gestuurd door profiles.share.

-- ---------- hulpfunctie: synced_at = moment van opslaan op de server ----------
create or replace function public.fft_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- ---------- profiel, doelen, voorkeuren, naam ----------
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  name        text not null default '',
  profile     jsonb,
  goals       jsonb,
  prefs       jsonb,                       -- recent, laatste porties
  share       jsonb not null default '{"log": true, "weight": true, "goals": true}'::jsonb,  -- voor fase 3
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),  -- voor fase 3
  updated_ms  bigint not null default 0,  -- tijd van de wijziging op de telefoon
  synced_at   timestamptz not null default clock_timestamp()
);

-- ---------- producten, favorieten, favoriete maaltijden (één document per gebruiker) ----------
create table if not exists public.libraries (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  updated_ms bigint not null default 0,
  synced_at  timestamptz not null default clock_timestamp()
);

-- ---------- logregels ----------
create table if not exists public.entries (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  id         text not null,
  date       date not null,
  meal       text not null check (meal in ('ontbijt', 'lunch', 'diner', 'snacks')),
  food       jsonb,
  grams      real,
  deleted    boolean not null default false,
  updated_ms bigint not null default 0,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists entries_sync on public.entries (user_id, synced_at);
create index if not exists entries_date on public.entries (user_id, date);

-- ---------- gewichten ----------
create table if not exists public.weights (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date       date not null,
  kg         real,
  deleted    boolean not null default false,
  updated_ms bigint not null default 0,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, date)
);
create index if not exists weights_sync on public.weights (user_id, synced_at);

-- ---------- triggers ----------
drop trigger if exists fft_touch on public.profiles;
create trigger fft_touch before insert or update on public.profiles for each row execute function public.fft_touch();
drop trigger if exists fft_touch on public.libraries;
create trigger fft_touch before insert or update on public.libraries for each row execute function public.fft_touch();
drop trigger if exists fft_touch on public.entries;
create trigger fft_touch before insert or update on public.entries for each row execute function public.fft_touch();
drop trigger if exists fft_touch on public.weights;
create trigger fft_touch before insert or update on public.weights for each row execute function public.fft_touch();

-- ---------- row level security: alleen je eigen rijen ----------
alter table public.profiles  enable row level security;
alter table public.libraries enable row level security;
alter table public.entries   enable row level security;
alter table public.weights   enable row level security;

drop policy if exists "eigen rijen" on public.profiles;
create policy "eigen rijen" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "eigen rijen" on public.libraries;
create policy "eigen rijen" on public.libraries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "eigen rijen" on public.entries;
create policy "eigen rijen" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "eigen rijen" on public.weights;
create policy "eigen rijen" on public.weights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Niet-ingelogde bezoekers (alleen de publieke sleutel) mogen niets.
revoke all on public.profiles, public.libraries, public.entries, public.weights from anon;
grant select, insert, update, delete on public.profiles, public.libraries, public.entries, public.weights to authenticated;
