-- MotoRoute Builder · país del motorista (per a la comunitat internacional). Es pot tornar a executar.
alter table public.profiles
  add column if not exists country text check (country ~ '^[A-Z]{2}$');

create or replace view public.shared_routes_feed as
select
  r.id, r.author_id, p.username, r.title, r.description, r.mode, r.difficulty, r.ridden_on,
  r.start_name, r.start_lat, r.start_lng, r.distance_km, r.duration_min, r.elevation_gain,
  r.max_altitude, r.curvature_score, r.unpaved_km, r.polyline, r.elevations, r.created_at,
  (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
  (select count(*) from public.route_saves s where s.route_id = r.id)::int as saves,
  p.bike_name as author_bike,
  p.home_area as author_area,
  p.avatar_url as author_avatar,
  p.country as author_country
from public.shared_routes r
join public.profiles p on p.id = r.author_id;
grant select on public.shared_routes_feed to anon, authenticated;
