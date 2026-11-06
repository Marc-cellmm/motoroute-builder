import type { LngLat } from './types';

const R = 6371.0088; // radi terrestre en km
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distància en km entre dos punts [lng, lat]. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumb inicial en graus (0-360) de a cap a b. */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punt de destinació a partir d'un origen, un rumb i una distància (km). */
export function destination(from: LngLat, bearingDeg: number, distKm: number): LngLat {
  const δ = distKm / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(from[1]);
  const λ1 = toRad(from[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toDeg(λ2), toDeg(φ2)];
}

/** Descodifica una polilínia de Valhalla (precisió 6) a [lng, lat]. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const coords: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

/** Km acumulats per a cada vèrtex. */
export function cumulativeKm(coords: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

/** Punt interpolat al km indicat. */
export function pointAtKm(coords: LngLat[], cum: number[], km: number): LngLat {
  if (km <= 0) return coords[0];
  const last = cum[cum.length - 1];
  if (km >= last) return coords[coords.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < km) lo = mid;
    else hi = mid;
  }
  const t = (km - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [coords[lo][0] + t * (coords[hi][0] - coords[lo][0]), coords[lo][1] + t * (coords[hi][1] - coords[lo][1])];
}

/** Remostreja el traçat cada `stepKm`. */
export function resample(coords: LngLat[], stepKm: number): { points: LngLat[]; km: number[] } {
  const cum = cumulativeKm(coords);
  const total = cum[cum.length - 1];
  const points: LngLat[] = [];
  const km: number[] = [];
  for (let d = 0; d <= total; d += stepKm) {
    points.push(pointAtKm(coords, cum, d));
    km.push(d);
  }
  if (km[km.length - 1] < total) {
    points.push(coords[coords.length - 1]);
    km.push(total);
  }
  return { points, km };
}

/**
 * Projecta un punt sobre la polilínia: retorna el km al llarg del traçat i la
 * distància perpendicular (km). Fa servir una projecció equirectangular local,
 * prou precisa per a corredors de pocs km.
 */
export function projectOnLine(p: LngLat, coords: LngLat[], cum: number[]): { km: number; offset: number } {
  const kx = 111.32 * Math.cos(toRad(p[1]));
  const ky = 110.574;
  let best = { km: 0, offset: Infinity };
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1][0] - p[0]) * kx;
    const ay = (coords[i - 1][1] - p[1]) * ky;
    const bx = (coords[i][0] - p[0]) * kx;
    const by = (coords[i][1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best.offset) best = { km: cum[i - 1] + t * (cum[i] - cum[i - 1]), offset: d };
  }
  return best;
}

export function bbox(coords: LngLat[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
