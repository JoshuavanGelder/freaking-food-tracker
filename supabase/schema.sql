-- Freaking Food Tracker — database (Supabase / Postgres)
-- Uitvoeren in Supabase → SQL Editor → New query → plakken → Run. Kan veilig opnieuw (idempotent).
--
-- Ieder ziet en wijzigt alleen zijn eigen rijen (row level security). Vrienden komen later (fase 3):
-- dan komen er een tabel friendships en extra leesregels bij, gestuurd door profiles.share.

-- ---------- hulpfunctie: synced_at = moment van opslaan op de server ----------
create or replace function public.fft_touch() returns trigger
language plpgsql set search_path = '' as $$
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

-- =====================================================================================================
-- Fase 3: vrienden
-- Vriendschap = twee rijen (A→B en B→A), aangemaakt met add_friend(code). Vrienden lezen elkaars gegevens
-- alleen via de functies hieronder (security definer), en alleen wat de ander deelt (profiles.share).
-- share-sleutels (ontbreekt = aan): totals (kcal/macro's per dag), log (wat je at), weight, goals (doelen + dagdoel).
-- =====================================================================================================

alter table public.profiles add column if not exists target jsonb;  -- dagdoel {kcal,e,k,v,fiber}, door de app berekend
alter table public.profiles alter column share set default '{"totals": true, "log": true, "weight": true, "goals": true}'::jsonb;

create table if not exists public.friendships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
drop policy if exists "eigen vriendschappen" on public.friendships;
create policy "eigen vriendschappen" on public.friendships for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.friendships from anon;
grant select on public.friendships to authenticated;

-- hulpfuncties (alleen intern)
create or replace function public.fft_shares(p uuid, k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (pr.share ->> k)::boolean from public.profiles pr where pr.user_id = p), true)
$$;
create or replace function public.fft_is_friend(f uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships fr where fr.user_id = (select auth.uid()) and fr.friend_id = f)
$$;
revoke all on function public.fft_shares(uuid, text) from public, anon, authenticated;
revoke all on function public.fft_is_friend(uuid) from public, anon, authenticated;

-- vriend toevoegen met zijn code
create or replace function public.add_friend(code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  other uuid;
  other_name text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select pr.user_id, pr.name into other, other_name
    from public.profiles pr where pr.invite_code = lower(regexp_replace(code, '[^a-zA-Z0-9]', '', 'g'));
  if other is null then raise exception 'code_not_found'; end if;
  if other = me then raise exception 'own_code'; end if;
  insert into public.friendships (user_id, friend_id) values (me, other), (other, me) on conflict do nothing;
  return json_build_object('id', other, 'name', other_name);
end $$;

create or replace function public.remove_friend(friend uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friendships
   where (user_id = (select auth.uid()) and friend_id = friend)
      or (user_id = friend and friend_id = (select auth.uid()))
$$;

-- jouw vrienden, met wat ze delen
create or replace function public.friends()
returns table (id uuid, name text, share jsonb, target jsonb, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.user_id, pr.name, coalesce(pr.share, '{}'::jsonb),
         case when public.fft_shares(pr.user_id, 'goals') then pr.target end,
         fr.created_at
    from public.friendships fr
    join public.profiles pr on pr.user_id = fr.friend_id
   where fr.user_id = (select auth.uid())
   order by fr.created_at
$$;

-- dagtotalen van een vriend
create or replace function public.friend_days(friend uuid, d_from date, d_to date)
returns table (date date, kcal double precision, e double precision, k double precision, v double precision, fiber double precision, items integer)
language sql stable security definer set search_path = '' as $$
  select en.date,
         sum(coalesce((en.food -> 'per' ->> 'kcal')::double precision, 0) * en.grams / 100),
         sum(coalesce((en.food -> 'per' ->> 'e')::double precision, 0) * en.grams / 100),
         sum(coalesce((en.food -> 'per' ->> 'k')::double precision, 0) * en.grams / 100),
         sum(coalesce((en.food -> 'per' ->> 'v')::double precision, 0) * en.grams / 100),
         sum(coalesce((en.food -> 'per' ->> 'fiber')::double precision, 0) * en.grams / 100),
         count(*)::integer
    from public.entries en
   where en.user_id = friend and not en.deleted and en.date between d_from and d_to
     and public.fft_is_friend(friend)
     and (public.fft_shares(friend, 'totals') or public.fft_shares(friend, 'log'))
   group by en.date
   order by en.date
$$;

-- wat een vriend op een dag at
create or replace function public.friend_entries(friend uuid, d date)
returns table (meal text, name text, brand text, grams double precision, unit text, kcal double precision, e double precision, k double precision, v double precision)
language sql stable security definer set search_path = '' as $$
  select en.meal, en.food ->> 'name', en.food ->> 'brand', en.grams, coalesce(en.food ->> 'unit', 'g'),
         coalesce((en.food -> 'per' ->> 'kcal')::double precision, 0) * en.grams / 100,
         coalesce((en.food -> 'per' ->> 'e')::double precision, 0) * en.grams / 100,
         coalesce((en.food -> 'per' ->> 'k')::double precision, 0) * en.grams / 100,
         coalesce((en.food -> 'per' ->> 'v')::double precision, 0) * en.grams / 100
    from public.entries en
   where en.user_id = friend and not en.deleted and en.date = d
     and public.fft_is_friend(friend) and public.fft_shares(friend, 'log')
   order by array_position(array['ontbijt', 'lunch', 'diner', 'snacks'], en.meal), en.synced_at
$$;

-- gewichten van een vriend
create or replace function public.friend_weights(friend uuid, d_from date)
returns table (date date, kg double precision)
language sql stable security definer set search_path = '' as $$
  select w.date, w.kg
    from public.weights w
   where w.user_id = friend and not w.deleted and w.kg is not null and w.date >= d_from
     and public.fft_is_friend(friend) and public.fft_shares(friend, 'weight')
   order by w.date
$$;

revoke all on function public.add_friend(text), public.remove_friend(uuid), public.friends(),
  public.friend_days(uuid, date, date), public.friend_entries(uuid, date), public.friend_weights(uuid, date) from public, anon;
grant execute on function public.add_friend(text), public.remove_friend(uuid), public.friends(),
  public.friend_days(uuid, date, date), public.friend_entries(uuid, date), public.friend_weights(uuid, date) to authenticated;

-- =====================================================================================================
-- Favorieten van vrienden: producten en favoriete maaltijden die een vriend deelt.
-- Nieuwe share-sleutel `favorites`; anders dan de andere staat die standaard UIT (ontbreekt = uit),
-- zodat bestaande vrienden niet ineens favorieten zien die je daar nooit voor hebt vrijgegeven.
-- =====================================================================================================

create or replace function public.friend_favorites(friend uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  lib jsonb;
begin
  if not public.fft_is_friend(friend)
     or not coalesce((select (pr.share ->> 'favorites')::boolean from public.profiles pr where pr.user_id = friend), false) then
    return json_build_object('foods', '[]'::json, 'meals', '[]'::json);
  end if;
  select l.data into lib from public.libraries l where l.user_id = friend;
  return json_build_object(
    'foods', coalesce((
      select json_agg(lib -> 'foods' -> fid)
        from jsonb_array_elements_text(coalesce(lib -> 'favorites', '[]'::jsonb)) as fid
       where (lib -> 'foods') ? fid
    ), '[]'::json),
    'meals', coalesce(lib -> 'favMeals', '[]'::jsonb)::json
  );
end $$;

revoke all on function public.friend_favorites(uuid) from public, anon;
grant execute on function public.friend_favorites(uuid) to authenticated;

-- =====================================================================================================
-- Fotoherkenning: daglimiet per gebruiker. De Edge Function `food-photo` roept use_photo() aan met de
-- sessie van de gebruiker; dat telt de foto en geeft het aantal van vandaag (Nederlandse tijd) terug.
-- Werkt alleen met een geldige login, dus dit is meteen de logincontrole van de functie.
-- =====================================================================================================

create table if not exists public.photo_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.photo_usage enable row level security;
drop policy if exists "eigen fotogebruik lezen" on public.photo_usage;
create policy "eigen fotogebruik lezen" on public.photo_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.photo_usage from anon;
grant select on public.photo_usage to authenticated;

create or replace function public.use_photo() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.photo_usage (user_id, day, count)
  values (auth.uid(), (now() at time zone 'Europe/Amsterdam')::date, 1)
  on conflict (user_id, day) do update set count = public.photo_usage.count + 1
  returning count into n;
  return n;
end $$;

revoke all on function public.use_photo() from public, anon;
grant execute on function public.use_photo() to authenticated;
