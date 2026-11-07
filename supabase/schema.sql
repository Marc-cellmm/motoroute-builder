-- MotoRoute Builder · apartat Social
-- Executa aquest fitxer sencer a Supabase: SQL Editor → New query → enganxa → Run.
-- Es pot tornar a executar sense perdre dades.

-- Perfil públic de cada motorista (l'usuari entra amb sessió anònima i tria un nom)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique
              check (char_length(username) between 3 and 24 and username ~ '^[A-Za-z0-9_.-]+$'),
  created_at  timestamptz not null default now()
);

-- Rutes publicades a la comunitat
create table if not exists public.shared_routes (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title            text not null check (char_length(title) between 3 and 80),
  description      text check (char_length(description) <= 1000),
  mode             text not null check (mode in ('road', 'trail')),
  difficulty       text not null check (difficulty in ('beginner', 'intermediate', 'expert')),
  ridden_on        date,
  start_name       text check (char_length(start_name) <= 120),
  start_lat        double precision not null,
  start_lng        double precision not null,
  distance_km      numeric(6,1) not null check (distance_km > 0 and distance_km < 5000),
  duration_min     integer,
  elevation_gain   integer,
  max_altitude     integer,
  curvature_score  smallint,
  unpaved_km       numeric(6,1) not null default 0,
  polyline         text not null check (char_length(polyline) <= 200000), -- polilínia codificada (precisió 5)
  elevations       smallint[],                                             -- perfil reduït (≤ 200 valors)
  created_at       timestamptz not null default now()
);
create index if not exists shared_routes_created_idx on public.shared_routes (created_at desc);
create index if not exists shared_routes_start_idx on public.shared_routes (start_lat, start_lng);
create index if not exists shared_routes_author_idx on public.shared_routes (author_id);

create table if not exists public.route_likes (
  route_id    uuid not null references public.shared_routes(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);

create table if not exists public.route_saves (
  route_id    uuid not null references public.shared_routes(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);
create index if not exists route_saves_user_idx on public.route_saves (user_id, created_at desc);

-- Seguretat per files: tothom pot llegir rutes i perfils; cadascú només escriu el que és seu.
-- Qui ha donat m'agrada o ha guardat què és privat: només ho veu el mateix usuari.
alter table public.profiles      enable row level security;
alter table public.shared_routes enable row level security;
alter table public.route_likes   enable row level security;
alter table public.route_saves   enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists routes_read on public.shared_routes;
drop policy if exists routes_insert on public.shared_routes;
drop policy if exists routes_update on public.shared_routes;
drop policy if exists routes_delete on public.shared_routes;
create policy routes_read   on public.shared_routes for select using (true);
create policy routes_insert on public.shared_routes for insert to authenticated with check (author_id = auth.uid());
create policy routes_update on public.shared_routes for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy routes_delete on public.shared_routes for delete to authenticated using (author_id = auth.uid());

drop policy if exists likes_own on public.route_likes;
create policy likes_own on public.route_likes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists saves_own on public.route_saves;
create policy saves_own on public.route_saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Feed: dades públiques de la ruta + autor + recomptes. La vista s'executa amb els permisos
-- del seu propietari per poder comptar m'agrada i guardats sense exposar qui els ha fet.
create or replace view public.shared_routes_feed as
select
  r.id, r.author_id, p.username, r.title, r.description, r.mode, r.difficulty, r.ridden_on,
  r.start_name, r.start_lat, r.start_lng, r.distance_km, r.duration_min, r.elevation_gain,
  r.max_altitude, r.curvature_score, r.unpaved_km, r.polyline, r.elevations, r.created_at,
  (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
  (select count(*) from public.route_saves s where s.route_id = r.id)::int as saves
from public.shared_routes r
join public.profiles p on p.id = r.author_id;

grant select on public.shared_routes_feed to anon, authenticated;
