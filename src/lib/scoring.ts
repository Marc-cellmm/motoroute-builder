import { bearing, cumulativeKm, resample } from './geo';
import type { Difficulty, LngLat, RideMode, RideStyle, Segment } from './types';

const LEVELS: Difficulty[] = ['beginner', 'intermediate', 'expert'];

export interface CurvePoint {
  km: number;
  turnDeg: number; // canvi de rumb absolut respecte al punt anterior
  radius: number; // radi estimat (m)
}

/** Analitza la geometria: canvis de rumb i radis cada 100 m. */
export function analyseCurves(coords: LngLat[], stepKm = 0.1): CurvePoint[] {
  const { points, km } = resample(coords, stepKm);
  const out: CurvePoint[] = [];
  let prev = points.length > 1 ? bearing(points[0], points[1]) : 0;
  for (let i = 1; i < points.length - 1; i++) {
    const h = bearing(points[i], points[i + 1]);
    let d = Math.abs(h - prev);
    if (d > 180) d = 360 - d;
    prev = h;
    const rad = (d * Math.PI) / 180;
    out.push({ km: km[i], turnDeg: d, radius: rad > 0.01 ? (stepKm * 1000) / rad : Infinity });
  }
  return out;
}

/** Compta corbes: canvi de rumb acumulat > 30° en ≤ 300 m. */
export function countCurves(points: CurvePoint[], windowKm = 0.3, thresholdDeg = 30): number[] {
  const curveKms: number[] = [];
  let acc = 0;
  let startKm = points[0]?.km ?? 0;
  for (const p of points) {
    if (p.km - startKm > windowKm) {
      acc = 0;
      startKm = p.km;
    }
    acc += p.turnDeg;
    if (acc >= thresholdDeg) {
      curveKms.push(p.km);
      acc = 0;
      startKm = p.km;
    }
  }
  return curveKms;
}

/** Pendent màxim (%) dins [kmStart, kmEnd] a partir del perfil. */
function maxGrade(profileKm: number[], elev: number[], kmStart: number, kmEnd: number): number {
  let max = 0;
  for (let i = 1; i < profileKm.length; i++) {
    if (profileKm[i] < kmStart || profileKm[i - 1] > kmEnd) continue;
    const dKm = profileKm[i] - profileKm[i - 1];
    if (dKm < 0.2) continue;
    const g = (Math.abs(elev[i] - elev[i - 1]) / (dKm * 1000)) * 100;
    if (g > max) max = g;
  }
  return max;
}

export function segmentDifficulty(mode: RideMode, s: Omit<Segment, 'difficulty'>): Difficulty {
  if (s.surface === 'unpaved') {
    if (s.maxGrade > 18) return 'expert';
    if (s.maxGrade > 10) return 'intermediate';
    return mode === 'trail' ? 'beginner' : 'intermediate';
  }
  let pts = 0;
  if (s.minRadius < 25) pts += 2;
  else if (s.minRadius < 50) pts += 1;
  if (s.curvesPerKm > 6) pts += 2;
  else if (s.curvesPerKm > 3) pts += 1;
  if (s.maxGrade > 12) pts += 2;
  else if (s.maxGrade > 8) pts += 1;
  return pts >= 4 ? 'expert' : pts >= 2 ? 'intermediate' : 'beginner';
}

/**
 * Com de tancades són les corbes (0-100). Amb mostres cada 100 m: un gir de 8-25° és una corba
 * oberta i ràpida (radi > 230 m), de 25-60° mitjana, i més de 60° una corba ratonera o forquilla.
 */
export function curveTightness(points: CurvePoint[]): number {
  let curves = 0;
  let weight = 0;
  for (const p of points) {
    if (p.turnDeg < 8) continue;
    curves++;
    weight += p.turnDeg >= 60 ? 1 : p.turnDeg >= 25 ? 0.5 : 0;
  }
  return curves ? Math.round((weight / curves) * 100) : 0;
}

export const DEFAULT_STYLE: RideStyle = { curves: 'any', climb: 'any', mood: 'any' };

/** Afinitat (0-100) d'una ruta amb els gustos del motorista. */
export function styleMatch(
  r: { curvatureScore: number; curveTightness?: number; difficultyScore: number; elevationGain: number; distanceKm: number },
  style: RideStyle = DEFAULT_STYLE,
): number {
  const tight = r.curveTightness ?? 40;
  const climb = Math.min(100, (r.elevationGain / Math.max(1, r.distanceKm)) * 4); // 25 m/km = port de muntanya
  const parts: number[] = [r.curvatureScore]; // a tothom li agraden les corbes
  if (style.curves === 'open') parts.push(100 - tight, 100 - tight);
  if (style.curves === 'tight') parts.push(tight, tight);
  if (style.climb === 'flat') parts.push(100 - climb);
  if (style.climb === 'passes') parts.push(climb);
  if (style.mood === 'calm') parts.push(100 - Math.min(100, r.difficultyScore));
  if (style.mood === 'keen') parts.push(Math.min(100, r.difficultyScore));
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export interface Scoring {
  segments: Segment[];
  curvatureScore: number;
  curveTightness: number;
  difficulty: Difficulty;
  difficultyScore: number;
}

/**
 * Segmenta la ruta en trams de 5 km i la puntua. El nivell de la ruta és el
 * percentil 90 ponderat per longitud: un pas tècnic curt ja compta.
 */
export function scoreRoute(
  mode: RideMode,
  coords: LngLat[],
  profileKm: number[],
  elev: number[],
  unpavedRanges: [number, number][],
): Scoring {
  const total = cumulativeKm(coords).at(-1) ?? 0;
  const curvePts = analyseCurves(coords);
  const curves = countCurves(curvePts);
  const segLen = 5;
  const segments: Segment[] = [];
  for (let start = 0; start < total; start += segLen) {
    const end = Math.min(total, start + segLen);
    const len = end - start;
    if (len < 0.5) break;
    const inSeg = curvePts.filter((p) => p.km >= start && p.km < end);
    // radi mínim: percentil 10 dels radis (evita soroll de la geometria)
    const radii = inSeg.map((p) => p.radius).filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
    const minRadius = radii.length ? radii[Math.floor(radii.length * 0.1)] : Infinity;
    const unpavedLen = unpavedRanges.reduce(
      (acc, [a, b]) => acc + Math.max(0, Math.min(b, end) - Math.max(a, start)),
      0,
    );
    const base = {
      kmStart: start,
      kmEnd: end,
      surface: (unpavedLen / len > 0.4 ? 'unpaved' : 'paved') as Segment['surface'],
      curvesPerKm: curves.filter((k) => k >= start && k < end).length / len,
      minRadius,
      maxGrade: maxGrade(profileKm, elev, start, end),
    };
    segments.push({ ...base, difficulty: segmentDifficulty(mode, base) });
  }
  const avgCurves = curves.length / Math.max(total, 1);
  const curvatureScore = Math.min(100, Math.round((avgCurves / 6) * 100));

  const weighted = segments
    .map((s) => ({ lvl: LEVELS.indexOf(s.difficulty), len: s.kmEnd - s.kmStart }))
    .sort((a, b) => a.lvl - b.lvl);
  let acc = 0;
  let p90 = 0;
  for (const w of weighted) {
    acc += w.len;
    if (acc >= total * 0.9) {
      p90 = w.lvl;
      break;
    }
  }
  const difficultyScore = Math.round(
    (segments.reduce((s, x) => s + LEVELS.indexOf(x.difficulty) * (x.kmEnd - x.kmStart), 0) / Math.max(total, 1)) * 50,
  );
  return { segments, curvatureScore, curveTightness: curveTightness(curvePts), difficulty: LEVELS[p90], difficultyScore };
}

export function elevationStats(elev: number[]): { gain: number; max: number } {
  let gain = 0;
  let max = -Infinity;
  // suavitza amb mitjana mòbil de 3 per no comptar soroll del DEM
  const smooth = elev.map((_, i) => {
    const a = elev[Math.max(0, i - 1)];
    const b = elev[i];
    const c = elev[Math.min(elev.length - 1, i + 1)];
    return (a + b + c) / 3;
  });
  for (let i = 1; i < smooth.length; i++) {
    const d = smooth[i] - smooth[i - 1];
    if (d > 0) gain += d;
    if (elev[i] > max) max = elev[i];
  }
  return { gain: Math.round(gain), max: Math.round(Math.max(max, elev[0] ?? 0)) };
}
