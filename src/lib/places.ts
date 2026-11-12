import type { Accommodation, LngLat, Place } from './types';
import { haversine } from './geo';
import { cached, fetchJson, isAbort, limiter } from './net';
import { savedCountry } from './country';
import { t, lang } from '../i18n';

type PhotonFeature = { geometry: { coordinates: LngLat }; properties: Record<string, string | undefined> };

const PLACE_RANK: Record<string, number> = { city: 0, town: 0, village: 1, municipality: 1, hamlet: 2, suburb: 2, neighbourhood: 3, locality: 3, isolated_dwelling: 4 };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Última posició coneguda: serveix per prioritzar els resultats propers. */
const LAST_KEY = 'mrb.lastpos';
export function rememberPosition(c: LngLat) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(c)); } catch { /* sense emmagatzematge */ }
}
function lastPosition(): LngLat | null {
  try { const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null'); return Array.isArray(v) ? (v as LngLat) : null; } catch { return null; }
}

/** Puntuació: pobles i ciutats primer, després coincidència del nom, el país i la distància. */
function score(f: PhotonFeature, q: string, near: LngLat, country: string | null): number {
  const p = f.properties;
  const name = norm(p.name ?? '');
  let s = 0;
  if (p.osm_key === 'place') s -= 40 - (PLACE_RANK[p.osm_value ?? ''] ?? 4) * 6;
  else if (p.osm_key === 'boundary' && p.osm_value === 'administrative') s -= 25;
  else if (p.type === 'city' || p.type === 'district' || p.type === 'locality') s -= 20;
  if (name === q) s -= 30;
  else if (name.startsWith(q)) s -= 15;
  else if (!name.includes(q)) s += 10;
  if (country && p.countrycode && p.countrycode.toUpperCase() !== country) s += 12;
  s += Math.min(25, haversine(near, f.geometry.coordinates) / 40);
  return s;
}

function label(p: Record<string, string | undefined>): string {
  const town = p.city ?? p.town ?? p.village;
  return [p.name, town && town !== p.name ? town : null, p.state ?? p.country]
    .filter(Boolean)
    .join(', ');
}

const placesCache = cached<Place[]>(10 * 60_000);

/**
 * Cerca de llocs: Photon (OpenStreetMap) i, si no troba res o no respon, Nominatim.
 * Prioritza pobles i ciutats, el país de l'usuari i la seva zona.
 */
export function searchPlaces(q: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const nq = norm(q);
  if (nq.length < 2) return Promise.resolve([]);
  const bias = near ?? lastPosition() ?? [1.6, 41.6];
  const country = savedCountry();
  return placesCache(`${nq}|${bias[0].toFixed(1)},${bias[1].toFixed(1)}`, async () => {
    let list: Place[] = [];
    let photonOk = false;
    try {
      const json = await fetchJson<{ features: PhotonFeature[] }>(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=12&lat=${bias[1]}&lon=${bias[0]}`,
        { timeoutMs: 6000, retries: 1, signal },
      );
      const seen = new Set<string>();
      list = json.features
        .filter((f) => f.properties.name)
        .map((f) => ({ f, s: score(f, nq, bias, country) }))
        .sort((a, b) => a.s - b.s)
        .map(({ f }) => ({ name: label(f.properties), coord: f.geometry.coordinates }))
        .filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
        .slice(0, 6);
      photonOk = true;
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    if (list.length) return list;
    // Segona opció: Nominatim (també OpenStreetMap). Si Photon ha respost i Nominatim no, és «no trobat», no «sense connexió».
    const json = await fetchJson<{ lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }[]>(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=${lang()}` +
        `&q=${encodeURIComponent(q.trim())}`,
      { timeoutMs: 8000, retries: 1, signal },
    ).catch((e) => { if (isAbort(e) || !photonOk) throw e; return []; });
    return json.map((r) => {
      const a = r.address ?? {};
      const town = a.city ?? a.town ?? a.village ?? a.hamlet;
      const name = r.name || town || r.display_name.split(',')[0];
      return { name: [name, town && town !== name ? town : null, a.state ?? a.country].filter(Boolean).join(', '), coord: [+r.lon, +r.lat] as LngLat };
    });
  });
}

const reverseCache = cached<string>(30 * 60_000);

/** Nom d'un punt. Mai es queda esperant: si el servei no respon en uns segons, torna un nom genèric. */
export function reverseGeocode(coord: LngLat, fallback = t("La meva ubicació")): Promise<string> {
  return reverseCache(`${coord[0].toFixed(3)},${coord[1].toFixed(3)}`, async () => {
    const json = await fetchJson<{ features?: PhotonFeature[] }>(
      `https://photon.komoot.io/reverse?lon=${coord[0]}&lat=${coord[1]}&radius=10`,
      { timeoutMs: 5000, retries: 1 },
    );
    const p = json.features?.[0]?.properties;
    if (!p) throw new Error('empty');
    const town = p.city ?? p.town ?? p.village;
    return [p.name, town && town !== p.name ? town : null].filter(Boolean).join(', ');
  }).catch(() => fallback);
}

const KIND_LABEL: Record<string, string> = {
  hotel: t("Hotel"),
  motel: t("Motel"),
  guest_house: t("Casa rural / pensió"),
  hostel: t("Alberg"),
  camp_site: t("Càmping"),
  apartment: t("Apartament"),
  chalet: t("Xalet"),
};

/** Servidors públics d'Overpass: si un està saturat o no respon, es prova el següent. */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
let overpassFirst = 0; // l'últim servidor que ha funcionat
const overpassQueue = limiter(1); // Overpass penalitza les peticions en paral·lel
const accomCache = cached<Accommodation[]>(30 * 60_000);

type OsmElement = { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown = null;
  for (let k = 0; k < OVERPASS.length; k++) {
    const i = (overpassFirst + k) % OVERPASS.length;
    try {
      const json = await fetchJson<{ elements: OsmElement[] }>(OVERPASS[i], {
        init: { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        timeoutMs: 18000,
        retries: 0,
      });
      overpassFirst = i;
      return json.elements;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('overpass');
}

/**
 * Allotjaments d'OpenStreetMap en un radi (Overpass API). Les peticions van en cua, es
 * reaprofiten si ja s'han fet i, si un servidor falla, es prova un altre.
 */
export function searchAccommodation(center: LngLat, radiusKm = 10): Promise<Accommodation[]> {
  const key = `${center[0].toFixed(3)},${center[1].toFixed(3)},${radiusKm}`;
  return accomCache(key, () => overpassQueue(async () => {
    const q = `[out:json][timeout:15];
nw["tourism"~"^(hotel|motel|guest_house|hostel|camp_site|apartment|chalet)$"]["name"](around:${radiusKm * 1000},${center[1]},${center[0]});
out center 60;`;
    let elements: OsmElement[];
    try {
      elements = await overpass(q);
    } catch {
      throw new Error(t("El servei d'allotjaments (Overpass) està saturat; torna-ho a provar."));
    }
    return elements
      .filter((e) => e.tags?.name && (e.lon != null || e.center))
      .map((e) => {
        const coord: LngLat = [e.lon ?? e.center!.lon, e.lat ?? e.center!.lat];
        const stars = parseInt(e.tags!.stars ?? '', 10);
        return {
          id: `${e.type}/${e.id}`,
          name: e.tags!.name,
          kind: KIND_LABEL[e.tags!.tourism] ?? e.tags!.tourism,
          coord,
          stars: Number.isFinite(stars) ? Math.min(5, stars) : null,
          website: e.tags!.website || e.tags!['contact:website'],
          phone: e.tags!.phone || e.tags!['contact:phone'],
          distanceKm: Math.round(haversine(center, coord) * 10) / 10,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }));
}
