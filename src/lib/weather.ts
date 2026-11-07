import type { LngLat, WeatherSample } from './types';

interface Sample {
  km: number;
  coord: LngLat;
  altitude: number;
  eta: Date;
}

interface Hourly {
  time: number[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: (number | null)[];
  precipitation: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
  freezing_level_height?: (number | null)[];
}

export interface WeatherData {
  hourly: Hourly[]; // un per mostra
  sunset: number | null; // unix (s) del dia de sortida, a l'origen
}

const VARS =
  'temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_gusts_10m,weather_code,freezing_level_height';

/** Una sola crida multipunt a Open-Meteo amb tota la previsió horària. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch amb reintents si Open-Meteo respon 429 (massa peticions). */
async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 || attempt >= 3) return res;
    await sleep(4000 * (attempt + 1));
  }
}

export async function fetchWeather(samples: Sample[], departure: Date, lastDay: Date = departure): Promise<WeatherData> {
  const lat = samples.map((s) => s.coord[1].toFixed(4)).join(',');
  const lng = samples.map((s) => s.coord[0].toFixed(4)).join(',');
  const elev = samples.map((s) => Math.round(s.altitude)).join(',');
  // només els dies necessaris: menys càrrega per a Open-Meteo
  const days = Math.min(16, Math.max(1, Math.ceil((lastDay.getTime() - Date.now()) / 86400000) + 2));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&elevation=${elev}` +
    `&hourly=${VARS}&daily=sunset&timeformat=unixtime&timezone=GMT&forecast_days=${days}&wind_speed_unit=kmh`;
  const res = await fetchRetry(url);
  if (res.status === 429) throw new Error('El servei de meteo està saturat; torna-ho a provar d\'aquí a un minut.');
  if (!res.ok) throw new Error('No s\'ha pogut obtenir la previsió meteorològica');
  const json = await res.json();
  const list = Array.isArray(json) ? json : [json];
  const daily = list[0]?.daily;
  let sunset: number | null = null;
  if (daily?.sunset) {
    const depDay = Math.floor(departure.getTime() / 86400000);
    const idx = (daily.sunset as number[]).findIndex((t) => Math.floor(t / 86400) === depDay);
    sunset = idx >= 0 ? daily.sunset[idx] : null;
  }
  return { hourly: list.map((l: { hourly: Hourly }) => l.hourly), sunset };
}

function hourIndex(h: Hourly, t: Date): number {
  const ts = t.getTime() / 1000;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    const d = Math.abs(h.time[i] - ts);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= 5400 ? best : -1; // fora de l'horitzó de previsió
}

/** Regles d'alerta per a moto (vegeu la secció 6.2 del document de disseny). */
export function classify(v: {
  gust: number;
  prob: number;
  mm: number;
  code: number;
  temp: number;
  apparent: number;
  freezing: number | null;
  altitude: number;
}): { level: 0 | 1 | 2 | 3; reasons: string[] } {
  let level = 0;
  const reasons: string[] = [];
  const bump = (l: number, why: string) => {
    if (l > level) level = l;
    reasons.push(why);
  };
  if (v.gust >= 90) bump(3, `Ratxes de ${Math.round(v.gust)} km/h`);
  else if (v.gust >= 70) bump(2, `Ratxes de ${Math.round(v.gust)} km/h`);
  else if (v.gust >= 50) bump(1, `Ratxes de ${Math.round(v.gust)} km/h`);

  if (v.mm >= 5) bump(3, `Pluja forta (${v.mm.toFixed(1)} mm/h)`);
  else if (v.prob >= 70 && v.mm >= 1) bump(2, `Pluja probable (${v.prob} %)`);
  else if (v.prob >= 40) bump(1, `Risc de pluja (${v.prob} %)`);

  if ([96, 99].includes(v.code)) bump(3, 'Tempesta amb calamarsa');
  else if (v.code === 95) bump(2, 'Tempesta');

  if ([71, 73, 75, 77, 85, 86].includes(v.code)) bump(3, 'Neu');
  else if (v.freezing !== null && v.freezing < v.altitude + 200) bump(2, 'Cota de congelació propera: risc de gel');
  else if (v.temp <= 3) bump(1, `Temperatura baixa (${Math.round(v.temp)} °C): risc de gel`);

  if (v.apparent >= 40) bump(3, `Calor extrema (${Math.round(v.apparent)} °C)`);
  else if (v.apparent >= 36) bump(2, `Molta calor (${Math.round(v.apparent)} °C)`);
  else if (v.apparent >= 32) bump(1, `Calor (${Math.round(v.apparent)} °C)`);

  return { level: level as 0 | 1 | 2 | 3, reasons };
}

export function evaluate(samples: Sample[], data: WeatherData, shiftMs = 0): WeatherSample[] {
  return samples.map((s, i) => {
    const h = data.hourly[i];
    const eta = new Date(s.eta.getTime() + shiftMs);
    const idx = h ? hourIndex(h, eta) : -1;
    if (idx < 0) {
      return {
        km: s.km, coord: s.coord, eta, altitude: s.altitude, tempC: NaN, precipProb: NaN, precipMm: NaN,
        gustKmh: NaN, weatherCode: -1, freezingLevel: null, level: 0, reasons: ['Fora de l\'horitzó de previsió'],
      };
    }
    const v = {
      gust: h.wind_gusts_10m[idx] ?? 0,
      prob: h.precipitation_probability[idx] ?? 0,
      mm: h.precipitation[idx] ?? 0,
      code: h.weather_code[idx] ?? 0,
      temp: h.temperature_2m[idx],
      apparent: h.apparent_temperature[idx] ?? h.temperature_2m[idx],
      freezing: h.freezing_level_height?.[idx] ?? null,
      altitude: s.altitude,
    };
    const { level, reasons } = classify(v);
    return {
      km: s.km, coord: s.coord, eta, altitude: s.altitude, tempC: v.temp, precipProb: v.prob, precipMm: v.mm,
      gustKmh: v.gust, weatherCode: v.code, freezingLevel: v.freezing, level, reasons,
    };
  });
}

const WEIGHT = [0, 1, 4, 12];

/**
 * Prova sortides cada 30 min entre les 06:00 i les 12:00 del dia de sortida i
 * retorna les tres amb menys exposició a mal temps (i sense arribar de nit).
 */
export function bestDepartures(samples: Sample[], data: WeatherData, durationMin: number) {
  const base = samples[0].eta;
  const day = new Date(base);
  day.setHours(6, 0, 0, 0);
  const options: { time: Date; penalty: number; note: string }[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = new Date(day.getTime() + k * 30 * 60000);
    const shift = t.getTime() - base.getTime();
    const evals = evaluate(samples, data, shift);
    const stepMin = durationMin / Math.max(1, samples.length - 1);
    let penalty = evals.reduce((acc, e) => acc + WEIGHT[e.level] * stepMin, 0);
    const arrival = t.getTime() + durationMin * 60000;
    let note = '';
    if (data.sunset) {
      const late = (arrival / 1000 - data.sunset) / 60; // minuts després de la posta
      if (late > 0) {
        penalty += late * 2;
        note = 'arribada de nit';
      } else {
        note = `arribes ${Math.round(-late / 60 * 10) / 10} h abans de la posta`;
      }
    }
    const worst = evals.reduce((m, e) => Math.max(m, e.level), 0);
    if (worst === 0 && !note.includes('nit')) note = `sense alertes · ${note}`;
    options.push({ time: t, penalty: Math.round(penalty), note });
  }
  return options.sort((a, b) => a.penalty - b.penalty).slice(0, 3);
}

export function weatherIcon(code: number): string {
  if (code < 0) return '·';
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '❄️';
  return '⛈️';
}
