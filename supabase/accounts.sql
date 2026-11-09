-- MotoRoute Builder · comptes amb correu i perfil de motorista
-- Executa aquest fitxer DESPRÉS de schema.sql: SQL Editor → New query → enganxa → Run.
-- Es pot tornar a executar sense perdre dades.

-- 1) Perfil públic: el que veu la comunitat
alter table public.profiles
  add column if not exists display_name text check (char_length(display_name) <= 40),
  add column if not exists home_area    text check (char_length(home_area) <= 80),
  add column if not exists riding_style text check (riding_style in ('road', 'trail', 'both')),
  add column if not exists bike_name    text check (char_length(bike_name) <= 60),
  add column if not exists riding_since smallint check (riding_since between 1950 and 2100),
  add column if not exists bio          text check (char_length(bio) <= 300),
  add column if not exists interests    text[] check (coalesce(array_length(interests, 1), 0) <= 12),
  add column if not exists onboarded    boolean not null default false;

-- 2) Dades privades: només les veu i les canvia el mateix usuari
create table if not exists public.rider_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  birth_year       smallint check (birth_year between 1920 and 2020),
  experience       text check (experience in ('beginner', 'intermediate', 'expert')),
  ride_with        text check (ride_with in ('solo', 'passenger', 'group')),
  pref_band        text check (pref_band in ('50_100', '100_200', '200_400', '400_plus')),
  avoid_motorways  boolean,
  avoid_tolls      boolean,
  bikes            jsonb check (pg_column_size(bikes) < 200000),
  updated_at       timestamptz not null default now()
);
alter table public.rider_settings enable row level security;
drop policy if exists settings_own on public.rider_settings;
create policy settings_own on public.rider_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) Feed amb la moto i la zona de l'autor (columnes noves al final de la vista)
create or replace view public.shared_routes_feed as
select
  r.id, r.author_id, p.username, r.title, r.description, r.mode, r.difficulty, r.ridden_on,
  r.start_name, r.start_lat, r.start_lng, r.distance_km, r.duration_min, r.elevation_gain,
  r.max_altitude, r.curvature_score, r.unpaved_km, r.polyline, r.elevations, r.created_at,
  (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
  (select count(*) from public.route_saves s where s.route_id = r.id)::int as saves,
  p.bike_name as author_bike,
  p.home_area as author_area
from public.shared_routes r
join public.profiles p on p.id = r.author_id;
grant select on public.shared_routes_feed to anon, authenticated;

-- 4) Passar les dades d'un usuari anònim antic (nom, rutes, m'agrada, guardats) al compte nou.
--    El client demana un testimoni mentre encara és anònim i el canvia un cop ha creat el compte:
--    només qui tenia la sessió anònima pot reclamar-ne les dades.
create table if not exists public.account_claims (
  token      uuid primary key default gen_random_uuid(),
  anon_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.account_claims enable row level security; -- sense polítiques: només via funcions

create or replace function public.start_claim() returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false then
    raise exception 'Només per a sessions anònimes';
  end if;
  delete from account_claims where anon_id = auth.uid();
  insert into account_claims (anon_id) values (auth.uid()) returning token into t;
  return t;
end $$;

create or replace function public.finish_claim(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  old_id uuid;
  old_name text;
  me uuid := auth.uid();
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Cal un compte amb correu';
  end if;
  delete from account_claims where token = p_token and created_at > now() - interval '1 hour'
    returning anon_id into old_id;
  if old_id is null or old_id = me then return null; end if;
  select username into old_name from profiles where id = old_id;
  if old_name is null then return null; end if;

  if not exists (select 1 from profiles where id = me) then
    update profiles set username = left('old_' || replace(old_id::text, '-', ''), 24) where id = old_id;
    insert into profiles (id, username) values (me, old_name);
  end if;
  update shared_routes set author_id = me where author_id = old_id;
  insert into route_likes (route_id, user_id, created_at)
    select route_id, me, created_at from route_likes where user_id = old_id on conflict do nothing;
  insert into route_saves (route_id, user_id, created_at)
    select route_id, me, created_at from route_saves where user_id = old_id on conflict do nothing;
  delete from profiles where id = old_id;
  delete from auth.users where id = old_id;
  return (select username from profiles where id = me);
end $$;

-- 5) Esborrar el compte des de l'app (ho exigeix l'App Store): s'emporta perfil, rutes i reaccions
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No has entrat'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.start_claim() from public, anon;
revoke all on function public.finish_claim(uuid) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.start_claim() to authenticated;
grant execute on function public.finish_claim(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
