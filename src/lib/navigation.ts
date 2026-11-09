import { cumulativeKm, haversine } from './geo';
import type { LngLat, Maneuver } from './types';

/**
 * Lògica de navegació pas a pas (sense UI), per poder-la provar:
 * - situa la posició sobre la ruta (buscant només a prop d'on eres, per no saltar de tram
 *   en rutes circulars que passen dues vegades pel mateix lloc),
 * - calcula la propera maniobra i quan s'ha d'anunciar,
 * - detecta quan surts de la ruta i on tornar-hi: un punt més endavant de la ruta, mai un
 *   punt de pas que ja has deixat enrere (la fallada de Calimoto).
 */

export interface NavLeg {
  coords: LngLat[];
  cum: number[]; // km acumulats
  maneuvers: (Maneuver & { km: number })[];
  totalKm: number;
}

export function makeLeg(coords: LngLat[], maneuvers: Maneuver[]): NavLeg {
  const cum = cumulativeKm(coords);
  return {
    coords,
    cum,
    totalKm: cum.at(-1) ?? 0,
    maneuvers: maneuvers.map((m) => ({ ...m, km: cum[Math.min(m.beginIdx, cum.length - 1)] ?? 0 })),
  };
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Projecta p sobre el tram [i-1, i]; retorna km i distància perpendicular (km). */
function projectSegment(p: LngLat, leg: NavLeg, i: number) {
  const kx = 111.32 * Math.cos(toRad(p[1]));
  const ky = 110.574;
  const a = leg.coords[i - 1];
  const b = leg.coords[i];
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const off = Math.hypot(ax + t * dx, ay + t * dy);
  return { km: leg.cum[i - 1] + t * (leg.cum[i] - leg.cum[i - 1]), offset: off };
}

/**
 * Situa la posició a la ruta. Busca entre `fromKm - back` i `fromKm + ahead` per no
 * confondre's quan la ruta passa dues vegades a prop del mateix punt.
 */
export function locate(p: LngLat, leg: NavLeg, fromKm: number, back = 0.3, ahead = 5): { km: number; offset: number } {
  let best = { km: fromKm, offset: Infinity };
  for (let i = 1; i < leg.coords.length; i++) {
    if (leg.cum[i] < fromKm - back) continue;
    if (leg.cum[i - 1] > fromKm + ahead) break;
    const r = projectSegment(p, leg, i);
    if (r.offset < best.offset) best = r;
  }
  return best;
}

/** Cerca global (en començar o si el GPS ha saltat molt). */
export function locateAnywhere(p: LngLat, leg: NavLeg) {
  return locate(p, leg, 0, 0, Infinity);
}

export function nextManeuver(leg: NavLeg, km: number) {
  const idx = leg.maneuvers.findIndex((m) => m.km > km + 0.005);
  if (idx < 0) return null;
  return { index: idx, maneuver: leg.maneuvers[idx], distanceKm: leg.maneuvers[idx].km - km };
}

/** Distàncies (km) a les quals s'anuncia una maniobra per veu, segons la velocitat. */
export function announceThresholds(speedKmh: number): number[] {
  return speedKmh > 70 ? [2, 0.6, 0.2, 0.04] : [1, 0.3, 0.12, 0.03];
}

/**
 * Quin avís toca ara. Retorna el llindar (km) que s'acaba de creuar, o null. Marca a `said`
 * tots els llindars creuats perquè no es repeteixin. Si la maniobra és massa a prop de
 * l'anterior, només es diu l'avís final ("Ara, gireu…").
 */
export function dueAnnouncement(distanceKm: number, speedKmh: number, said: Set<number>, gapFromPrevKm: number): number | null {
  const th = announceThresholds(speedKmh);
  const hit = th.filter((t) => distanceKm <= t && !said.has(t));
  if (!hit.length) return null;
  const t = Math.min(...hit);
  hit.forEach((x) => said.add(x));
  const final = t === th.at(-1);
  if (!final && gapFromPrevKm < t * 0.8) return null;
  return t;
}

/** Text de l'avís: "D'aquí a 500 metres, gireu a la dreta…" */
export function phrase(m: Maneuver, distanceKm: number, final: boolean): string {
  const text = (m.verbal || m.instruction).replace(/\.$/, '');
  const arrive = m.type >= 4 && m.type <= 6;
  if (final) return arrive ? 'Has arribat al final de la ruta' : `Ara, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  const dist = distanceKm >= 0.95 ? `${Math.round(distanceKm)} quilòmetre${Math.round(distanceKm) === 1 ? '' : 's'}` : `${Math.round((distanceKm * 1000) / 50) * 50} metres`;
  if (arrive) return `D'aquí a ${dist} arribaràs al final de la ruta`;
  return `D'aquí a ${dist}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Fora de ruta: més de 50 m durant 3 posicions seguides, o més de 150 m d'una vegada. */
export function isOffRoute(offsets: number[]): boolean {
  const last = offsets.slice(-3);
  if (last.at(-1)! > 0.15) return true;
  return last.length === 3 && last.every((o) => o > 0.05);
}

/**
 * Punt on tornar a la ruta: el punt de la ruta més proper que quedi com a mínim 1 km
 * per davant de l'últim km conegut (mai enrere), dins els 15 km següents.
 */
export function rejoinPoint(p: LngLat, leg: NavLeg, lastKm: number): { km: number; coord: LngLat } {
  let best = { km: Math.min(leg.totalKm, lastKm + 1), d: Infinity, idx: leg.coords.length - 1 };
  for (let i = 0; i < leg.coords.length; i++) {
    const k = leg.cum[i];
    if (k < lastKm + 1) continue;
    if (k > lastKm + 15) break;
    // penalitza una mica la distància per davant: preferim reincorporar-nos aviat
    const d = haversine(p, leg.coords[i]) + (k - lastKm) * 0.15;
    if (d < best.d) best = { km: k, d, idx: i };
  }
  return { km: best.km, coord: leg.coords[best.idx] };
}

/** Icona simple per tipus de maniobra de Valhalla. */
export function maneuverIcon(type: number): string {
  if ([4, 5, 6].includes(type)) return '🏁';
  if ([9, 10, 11].includes(type)) return '↱';
  if ([14, 15, 16].includes(type)) return '↰';
  if ([12, 13].includes(type)) return '⤴';
  if ([26, 27].includes(type)) return '⟳';
  if ([18, 20, 23].includes(type)) return '↗';
  if ([19, 21, 24].includes(type)) return '↖';
  return '↑';
}
