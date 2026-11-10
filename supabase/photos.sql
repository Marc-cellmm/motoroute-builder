-- MotoRoute Builder · fotos de perfil i de la moto
-- Executa'l després d'accounts.sql. Es pot tornar a executar.

-- 1) Columnes noves al perfil públic
alter table public.profiles
  add column if not exists avatar_url  text check (char_length(avatar_url) <= 500),
  add column if not exists bike_photos text[] not null default '{}'
    check (coalesce(array_length(bike_photos, 1), 0) <= 6);

-- 2) Espai de fotos: bucket públic «media», màx. 3 MB per foto, només imatges
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Cadascú només pot pujar, canviar o esborrar fitxers dins la seva carpeta (<id d'usuari>/...)
-- i només amb un compte amb correu (no anònim). Llegir-les és públic (bucket públic).
drop policy if exists media_insert_own on storage.objects;
create policy media_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
-- (esborrar un fitxer també necessita poder-lo «veure»: només els de la pròpia carpeta)
drop policy if exists media_select_own on storage.objects;
create policy media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_update_own on storage.objects;
create policy media_update_own on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_delete_own on storage.objects;
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Feed amb la foto de l'autor (columna nova al final de la vista)
create or replace view public.shared_routes_feed as
select
  r.id, r.author_id, p.username, r.title, r.description, r.mode, r.difficulty, r.ridden_on,
  r.start_name, r.start_lat, r.start_lng, r.distance_km, r.duration_min, r.elevation_gain,
  r.max_altitude, r.curvature_score, r.unpaved_km, r.polyline, r.elevations, r.created_at,
  (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
  (select count(*) from public.route_saves s where s.route_id = r.id)::int as saves,
  p.bike_name as author_bike,
  p.home_area as author_area,
  p.avatar_url as author_avatar
from public.shared_routes r
join public.profiles p on p.id = r.author_id;
grant select on public.shared_routes_feed to anon, authenticated;
