import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { cumulativeKm, decodePolyline, encodePolyline, haversine, resample, simplify, trimEnds } from './geo';
import { elevationProfile } from './elevation';
import { elevationStats, scoreRoute } from './scoring';
import type { ParsedTrack } from './gpxImport';
import type { Difficulty, LngLat, RideMode, RouteResult } from './types';

const DEMO = import.meta.env.VITE_DEMO === '1';
export const socialEnabled = !DEMO && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mrb.auth' },
  });
  return client;
}

export interface Me {
  id: string;
  username: string | null;
}

export interface SharedRoute {
  id: string;
  author_id: string;
  username: string;
  title: string;
  description: string | null;
  mode: RideMode;
  difficulty: Difficulty;
  ridden_on: string | null;
  start_name: string | null;
  start_lat: number;
  start_lng: number;
  distance_km: number;
  duration_min: number | null;
  elevation_gain: number | null;
  max_altitude: number | null;
  curvature_score: number | null;
  unpaved_km: number;
  polyline: string;
  elevations: number[] | null;
  created_at: string;
  likes: number;
  saves: number;
  author_bike?: string | null;
  author_area?: string | null;
  author_avatar?: string | null;
}

export type FeedSort = 'recent' | 'popular' | 'near';
const PAGE = 20;

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  const msg = error?.message ?? '';
  if (/anonymous sign-ins are disabled/i.test(msg)) {
    throw new Error('Cal activar «Allow anonymous sign-ins» a Supabase (Authentication → Sign In / Providers).');
  }
  if (/fetch|network/i.test(msg)) throw new Error('No hi ha connexió amb la comunitat. Torna-ho a provar.');
  throw new Error(`${fallback}${msg ? ` (${msg})` : ''}`);
}

export async function getMe(): Promise<Me | null> {
  const { data } = await sb().auth.getSession();
  const session = data.session;
  if (!session) return null;
  const { data: profile } = await sb().from('profiles').select('username').eq('id', session.user.id).maybeSingle();
  return { id: session.user.id, username: profile?.username ?? null };
}

/** Entra amb sessió anònima (sense email) i crea el perfil amb el nom triat. */
export async function join(username: string): Promise<Me> {
  const name = username.trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) {
    throw new Error('El nom ha de tenir de 3 a 24 caràcters: lletres, números, punt, guió o guió baix.');
  }
  let session = (await sb().auth.getSession()).data.session;
  if (!session) {
    const { data, error } = await sb().auth.signInAnonymously();
    if (error || !data.session) fail(error, 'No s\'ha pogut entrar a la comunitat');
    session = data.session;
  }
  const { error } = await sb().from('profiles').upsert({ id: session.user.id, username: name });
  if (error) {
    if (error.code === '23505') throw new Error('Aquest nom ja està agafat. Prova\'n un altre.');
    fail(error, 'No s\'ha pogut desar el perfil');
  }
  return { id: session.user.id, username: name };
}

export async function fetchFeed(opts: { sort: FeedSort; mode: RideMode | 'all'; near?: LngLat | null; page: number }) {
  let q = sb().from('shared_routes_feed').select('*');
  if (opts.mode !== 'all') q = q.eq('mode', opts.mode);
  if (opts.sort === 'near' && opts.near) {
    const [lng, lat] = opts.near;
    q = q.gte('start_lat', lat - 0.9).lte('start_lat', lat + 0.9).gte('start_lng', lng - 1.2).lte('start_lng', lng + 1.2);
  }
  q = opts.sort === 'popular'
    ? q.order('likes', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false });
  const { data, error } = await q.range(opts.page * PAGE, opts.page * PAGE + PAGE - 1);
  if (error) fail(error, 'No s\'han pogut carregar les rutes');
  let rows = (data ?? []) as SharedRoute[];
  if (opts.sort === 'near' && opts.near) {
    const p = opts.near;
    rows = rows.sort((a, b) => haversine(p, [a.start_lng, a.start_lat]) - haversine(p, [b.start_lng, b.start_lat]));
  }
  return { rows, more: (data ?? []).length === PAGE };
}

export async function myReactions(ids: string[]): Promise<{ liked: Set<string>; saved: Set<string> }> {
  const me = (await sb().auth.getSession()).data.session?.user.id;
  if (!me || !ids.length) return { liked: new Set(), saved: new Set() };
  const [l, s] = await Promise.all([
    sb().from('route_likes').select('route_id').eq('user_id', me).in('route_id', ids),
    sb().from('route_saves').select('route_id').eq('user_id', me).in('route_id', ids),
  ]);
  return {
    liked: new Set((l.data ?? []).map((r) => r.route_id as string)),
    saved: new Set((s.data ?? []).map((r) => r.route_id as string)),
  };
}

async function toggle(table: 'route_likes' | 'route_saves', routeId: string, on: boolean) {
  const me = (await sb().auth.getSession()).data.session?.user.id;
  if (!me) throw new Error('Entra a la comunitat primer.');
  const { error } = on
    ? await sb().from(table).upsert({ route_id: routeId, user_id: me })
    : await sb().from(table).delete().eq('route_id', routeId).eq('user_id', me);
  if (error) fail(error, 'No s\'ha pogut desar el canvi');
}
export const setLike = (id: string, on: boolean) => toggle('route_likes', id, on);
export const setSave = (id: string, on: boolean) => toggle('route_saves', id, on);

export async function fetchSaved(): Promise<SharedRoute[]> {
  const me = (await sb().auth.getSession()).data.session?.user.id;
  if (!me) return [];
  const { data: saves, error } = await sb()
    .from('route_saves').select('route_id').eq('user_id', me).order('created_at', { ascending: false }).limit(200);
  if (error) fail(error, 'No s\'han pogut carregar les rutes guardades');
  const ids = (saves ?? []).map((s) => s.route_id as string);
  if (!ids.length) return [];
  const { data, error: e2 } = await sb().from('shared_routes_feed').select('*').in('id', ids);
  if (e2) fail(e2, 'No s\'han pogut carregar les rutes guardades');
  const byId = new Map((data as SharedRoute[]).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as SharedRoute[];
}

export async function fetchMine(meId: string): Promise<SharedRoute[]> {
  const { data, error } = await sb()
    .from('shared_routes_feed').select('*').eq('author_id', meId).order('created_at', { ascending: false });
  if (error) fail(error, 'No s\'han pogut carregar les teves rutes');
  return (data ?? []) as SharedRoute[];
}

export async function deleteRoute(id: string) {
  const { error } = await sb().from('shared_routes').delete().eq('id', id);
  if (error) fail(error, 'No s\'ha pogut eliminar la ruta');
}

function downsample(values: number[], n = 200): number[] {
  if (values.length <= n) return values.map((v) => Math.round(v));
  return Array.from({ length: n }, (_, i) => Math.round(values[Math.round((i * (values.length - 1)) / (n - 1))]));
}

export interface PublishInput {
  route: RouteResult;
  title: string;
  description: string;
  mode: RideMode;
  difficulty: Difficulty;
  riddenOn: string | null;
  startName: string | null;
  /** amaga els primers i últims ~400 m (inici i final del traçat) */
  privacy?: boolean;
}

export async function publish(p: PublishInput): Promise<string> {
  const r = p.route;
  let full = r.coords;
  let elevations = r.elevations;
  if (p.privacy) {
    const t = trimEnds(r.coords, 0.4);
    full = t.coords;
    // l'elevació va mostrejada sobre el traçat: retalla la mateixa proporció
    if (elevations.length > 2 && t.coords !== r.coords) {
      const n = r.coords.length - 1;
      const a = Math.floor((t.from / n) * (elevations.length - 1));
      const b = Math.ceil((t.to / n) * (elevations.length - 1));
      elevations = elevations.slice(a, b + 1);
    }
  }
  const coords = simplify(full, 0.012);
  const row = {
    title: p.title.trim(),
    description: p.description.trim() || null,
    mode: p.mode,
    difficulty: p.difficulty,
    ridden_on: p.riddenOn || null,
    start_name: p.startName,
    start_lat: full[0][1],
    start_lng: full[0][0],
    distance_km: Math.round(r.distanceKm * 10) / 10,
    duration_min: Math.round(r.durationMin) || null,
    elevation_gain: r.elevationGain,
    max_altitude: r.maxAltitude,
    curvature_score: r.curvatureScore,
    unpaved_km: Math.round(r.unpavedKm * 10) / 10,
    polyline: encodePolyline(coords, 5),
    elevations: downsample(elevations),
  };
  const { data, error } = await sb().from('shared_routes').insert(row).select('id').single();
  if (error) fail(error, 'No s\'ha pogut publicar la ruta');
  return data.id as string;
}

import { ROUTE_RED as COLOR } from './theme';

/** Converteix una ruta de la comunitat en una RouteResult per veure-la i planificar-la. */
export function toRouteResult(s: SharedRoute): RouteResult {
  const coords = decodePolyline(s.polyline, 5);
  const total = cumulativeKm(coords).at(-1) ?? s.distance_km;
  const elev = s.elevations?.length ? s.elevations : coords.map(() => 0);
  const profileKm = elev.map((_, i) => (i * total) / Math.max(1, elev.length - 1));
  const scoring = scoreRoute(s.mode, coords, profileKm, elev, []);
  return {
    id: `shared-${s.id}`,
    label: s.title,
    color: COLOR,
    coords,
    elevations: elev,
    profileKm,
    distanceKm: Number(s.distance_km),
    durationMin: s.duration_min ?? (Number(s.distance_km) / 45) * 60,
    unpavedKm: Number(s.unpaved_km),
    motorwayKm: 0,
    elevationGain: s.elevation_gain ?? 0,
    maxAltitude: s.max_altitude ?? Math.max(...elev),
    curvatureScore: s.curvature_score ?? scoring.curvatureScore,
    segments: scoring.segments,
    difficulty: s.difficulty,
    difficultyScore: scoring.difficultyScore,
  };
}

/** Converteix un GPX importat en una RouteResult (elevació del GPX o, si no en té, d'Open-Meteo). */
export async function routeFromTrack(t: ParsedTrack, mode: RideMode): Promise<RouteResult> {
  let profileKm: number[];
  let elev: number[];
  if (t.elevations) {
    const step = Math.max(0.2, t.distanceKm / 400);
    const cum = cumulativeKm(t.coords);
    const { km } = resample(t.coords, step);
    let j = 0;
    elev = km.map((k) => {
      while (j < cum.length - 1 && cum[j + 1] < k) j++;
      return t.elevations![j];
    });
    profileKm = km;
  } else {
    const prof = await elevationProfile(t.coords, t.distanceKm);
    profileKm = prof.km;
    elev = prof.elev;
  }
  const stats = elevationStats(elev);
  const scoring = scoreRoute(mode, t.coords, profileKm, elev, []);
  return {
    id: `gpx-${Date.now()}`,
    label: t.name ?? 'Ruta importada',
    color: COLOR,
    coords: t.coords,
    elevations: elev,
    profileKm,
    distanceKm: t.distanceKm,
    durationMin: t.durationMin ?? (t.distanceKm / 45) * 60,
    unpavedKm: 0,
    motorwayKm: 0,
    elevationGain: stats.gain,
    maxAltitude: stats.max,
    ...scoring,
  };
}
