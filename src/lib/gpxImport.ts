import { cumulativeKm } from './geo';
import type { LngLat } from './types';

export interface ParsedTrack {
  name: string | null;
  coords: LngLat[];
  elevations: number[] | null; // alineat amb coords
  date: string | null; // AAAA-MM-DD de la primera marca de temps
  durationMin: number | null;
  distanceKm: number;
}

/** Llegeix un GPX (traces de GPS, Wikiloc, Strava, Calimoto…): pistes i, si no n'hi ha, rutes. */
export function parseGpx(text: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El fitxer no és un GPX vàlid.');
  let pts = [...doc.getElementsByTagName('trkpt')];
  if (!pts.length) pts = [...doc.getElementsByTagName('rtept')];
  if (pts.length < 2) throw new Error('El GPX no conté cap traçat.');

  const coords: LngLat[] = [];
  const ele: number[] = [];
  const times: number[] = [];
  for (const p of pts) {
    const lat = parseFloat(p.getAttribute('lat') ?? '');
    const lon = parseFloat(p.getAttribute('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coords.push([lon, lat]);
    const e = parseFloat(p.getElementsByTagName('ele')[0]?.textContent ?? '');
    ele.push(Number.isFinite(e) ? e : NaN);
    const t = Date.parse(p.getElementsByTagName('time')[0]?.textContent ?? '');
    if (Number.isFinite(t)) times.push(t);
  }
  const hasEle = ele.filter(Number.isFinite).length > coords.length * 0.8;
  const name =
    doc.querySelector('trk > name')?.textContent?.trim() ||
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    null;
  const distanceKm = cumulativeKm(coords).at(-1) ?? 0;
  return {
    name,
    coords,
    elevations: hasEle ? ele.map((e, i) => (Number.isFinite(e) ? e : ele[i - 1] ?? 0)) : null,
    date: times.length ? new Date(times[0]).toISOString().slice(0, 10) : null,
    durationMin: times.length > 1 ? Math.round((times.at(-1)! - times[0]) / 60000) : null,
    distanceKm,
  };
}
