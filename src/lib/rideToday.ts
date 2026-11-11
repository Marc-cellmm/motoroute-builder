import type { LngLat } from './types';
import { destination } from './geo';

/**
 * «On rodo avui?»: mira la previsió en vuit direccions al voltant del punt de sortida
 * i diu cap on fa millor dia per sortir amb la moto.
 */
export interface HourWx {
  temp: number;
  rainProb: number; // %
  precip: number; // mm
  gust: number; // km/h
  code: number; // codi WMO
}

export interface WindowScore {
  score: number; // 0–100, com més alt millor
  level: 0 | 1 | 2 | 3;
  tMin: number;
  tMax: number;
  rain: number; // probabilitat màxima de pluja (%)
  gust: number; // ratxa màxima (km/h)
  code: number; // el pitjor codi de temps de la finestra
}

export interface RideSpot extends WindowScore {
  bearing: number;
  coord: LngLat;
  km: number;
  name: string | null;
}

export interface RideToday {
  day: Date; // inici de la finestra consultada
  tomorrow: boolean;
  here: WindowScore;
  spots: RideSpot[]; // de millor a pitjor
}

const severity = (code: number) => (code >= 95 ? 4 : code >= 71 && code <= 77 || code === 85 || code === 86 ? 3 : code >= 51 ? 2 : code >= 45 ? 1 : 0);

/** Puntua unes hores de previsió pensant en una moto: pluja, vent, fred, calor, neu i tempesta. */
export function scoreWindow(hours: HourWx[]): WindowScore {
  if (!hours.length) return { score: 0, level: 3, tMin: 0, tMax: 0, rain: 0, gust: 0, code: -1 };
  const temps = hours.map((h) => h.temp);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const tAvg = temps.reduce((a, b) => a + b, 0) / temps.length;
  const rain = Math.max(...hours.map((h) => h.rainProb));
  const rainAvg = hours.reduce((a, h) => a + h.rainProb, 0) / hours.length;
  const precip = hours.reduce((a, h) => a + h.precip, 0);
  const gust = Math.max(...hours.map((h) => h.gust));
  const code = hours.reduce((worst, h) => (severity(h.code) > severity(worst) ? h.code : worst), hours[0].code);
  let penalty = rainAvg * 0.35 + rain * 0.25 + Math.min(40, precip * 8);
  penalty += Math.max(0, gust - 40) * 1.2;
  penalty += Math.max(0, 8 - tAvg) * 4 + Math.max(0, 3 - tMin) * 5;
  penalty += Math.max(0, tMax - 33) * 4;
  if (severity(code) === 4) penalty += 40;
  if (severity(code) === 3) penalty += 50;
  const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)));
  const level = score >= 75 ? 0 : score >= 50 ? 1 : score >= 25 ? 2 : 3;
  return { score, level, tMin: Math.round(tMin), tMax: Math.round(tMax), rain: Math.round(rain), gust: Math.round(gust), code };
}

/** Finestra de sortida: avui de 9 a 19 h (o des d'ara); a partir de les 17 h, demà. */
export function rideWindow(now: Date): { from: Date; to: Date; tomorrow: boolean } {
  const from = new Date(now);
  const tomorrow = now.getHours() >= 17;
  if (tomorrow) from.setDate(from.getDate() + 1);
  from.setHours(tomorrow ? 9 : Math.max(9, now.getHours()), 0, 0, 0);
  const to = new Date(from);
  to.setHours(19, 0, 0, 0);
  return { from, to, tomorrow };
}

interface OmHourly {
  time: number[];
  temperature_2m: number[];
  precipitation_probability: (number | null)[];
  precipitation: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
}

function windowHours(h: OmHourly, from: Date, to: Date): HourWx[] {
  const a = from.getTime() / 1000;
  const b = to.getTime() / 1000;
  const out: HourWx[] = [];
  h.time.forEach((ts, i) => {
    if (ts >= a && ts <= b) {
      out.push({ temp: h.temperature_2m[i], rainProb: h.precipitation_probability[i] ?? 0, precip: h.precipitation[i] ?? 0, gust: h.wind_gusts_10m[i] ?? 0, code: h.weather_code[i] });
    }
  });
  return out;
}

async function placeName(coord: LngLat): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${coord[0]}&lat=${coord[1]}&radius=15`);
    if (!res.ok) return null;
    const p = (await res.json()).features?.[0]?.properties;
    return p?.city || p?.name || p?.county || null;
  } catch {
    return null;
  }
}

export async function rideToday(origin: LngLat, radiusKm: number, now = new Date()): Promise<RideToday> {
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const points: LngLat[] = [origin, ...bearings.map((b) => destination(origin, b, radiusKm))];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${points.map((p) => p[1].toFixed(3)).join(',')}` +
    `&longitude=${points.map((p) => p[0].toFixed(3)).join(',')}` +
    '&hourly=temperature_2m,precipitation_probability,precipitation,wind_gusts_10m,weather_code' +
    '&timeformat=unixtime&timezone=GMT&forecast_days=3&wind_speed_unit=kmh';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather');
  const json = await res.json();
  const list: { hourly: OmHourly }[] = Array.isArray(json) ? json : [json];
  const win = rideWindow(now);
  const scores = list.map((l) => scoreWindow(windowHours(l.hourly, win.from, win.to)));
  const spots: RideSpot[] = bearings
    .map((b, i) => ({ ...scores[i + 1], bearing: b, coord: points[i + 1], km: Math.round(radiusKm), name: null as string | null }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const names = await Promise.all(spots.map((s) => placeName(s.coord)));
  spots.forEach((s, i) => { s.name = names[i]; });
  return { day: win.from, tomorrow: win.tomorrow, here: scores[0], spots };
}
