import { bbox, cumulativeKm, projectOnLine, resample } from './geo';
import type { FuelKind, FuelPlan, FuelStation, LngLat, Motorcycle, RideMode, StationOnRoute } from './types';

let cache: { at: number; stations: FuelStation[] } | null = null;

const num = (s: string | undefined) => {
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Origen dels preus: el proxy /api/fuel (dev i Vercel) o, a GitHub Pages, el fitxer
 * data/fuel.json que el workflow regenera cada 30 minuts a partir del MITECO.
 */
const FUEL_URL: string = import.meta.env.VITE_FUEL_URL || '/api/fuel';

/** Descarrega totes les estacions d'Espanya (MITECO). Cache de 30 min. */
export async function loadStations(): Promise<FuelStation[]> {
  if (cache && Date.now() - cache.at < 30 * 60000) return cache.stations;
  const res = await fetch(FUEL_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('El servei de preus del MITECO no respon ara mateix');
  const json = await res.json();
  const stations: FuelStation[] = (json.ListaEESSPrecio as Record<string, string>[])
    .map((e) => ({
      id: e['IDEESS'],
      brand: e['Rótulo'] || 'Benzinera',
      address: e['Dirección'] || '',
      town: e['Municipio'] || '',
      coord: [num(e['Longitud (WGS84)']) ?? NaN, num(e['Latitud']) ?? NaN] as LngLat,
      hours: e['Horario'] || '',
      price95: num(e['Precio Gasolina 95 E5']),
      price98: num(e['Precio Gasolina 98 E5']),
    }))
    .filter((s) => Number.isFinite(s.coord[0]) && Number.isFinite(s.coord[1]));
  cache = { at: Date.now(), stations };
  return stations;
}

/** Comprova l'horari més habitual del MITECO ("L-D: 07:00-22:00", "L-D: 24H"). null = no se sap. */
export function isOpenAt(hours: string, when: Date): boolean | null {
  if (/24H/i.test(hours)) return true;
  const m = hours.match(/L-D:\s*(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (!m) return null;
  const mins = when.getHours() * 60 + when.getMinutes();
  const open = +m[1] * 60 + +m[2];
  const close = +m[3] * 60 + +m[4];
  return close > open ? mins >= open && mins <= close : mins >= open || mins <= close;
}

/** Consum efectiu (l/100 km): fitxa + repostatges reals, corregit segons la ruta (secció 8.2). */
export function effectiveConsumption(bike: Motorcycle, mode: RideMode, gainPer100km: number) {
  const real = realConsumption(bike);
  const k = 3;
  const base = real ? (k * bike.consumptionWmtc + real.n * real.avg) / (k + real.n) : bike.consumptionWmtc;
  let c = base;
  if (mode === 'trail') c *= 1.1;
  if (bike.carriesPassenger) c *= 1.08;
  if (bike.carriesLuggage) c *= 1.05;
  c *= 1 + 0.005 * (gainPer100km / 100);
  return Math.round(c * 100) / 100;
}

/** Mitjana de consum real entre plens complets, descartant valors absurds. */
export function realConsumption(bike: Motorcycle): { avg: number; n: number } | null {
  const vals = bike.refuels
    .filter((r) => r.fullTank && r.kmSinceLastFull && r.kmSinceLastFull > 20)
    .map((r) => (r.liters / r.kmSinceLastFull!) * 100)
    .filter((v) => v > bike.consumptionWmtc * 0.5 && v < bike.consumptionWmtc * 2);
  if (!vals.length) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
}

export function usableRangeKm(bike: Motorcycle, consumption: number) {
  return ((bike.tankLiters - bike.reserveLiters) / consumption) * 100;
}

export function stationsOnRoute(
  all: FuelStation[],
  coords: LngLat[],
  fuel: FuelKind,
  corridorKm: number,
): StationOnRoute[] {
  const { points } = resample(coords, 0.5);
  const cum = cumulativeKm(points);
  const pad = corridorKm / 100 + 0.02;
  const [minX, minY, maxX, maxY] = bbox(points);
  return all
    .filter((s) => s.coord[0] > minX - pad && s.coord[0] < maxX + pad && s.coord[1] > minY - pad && s.coord[1] < maxY + pad)
    .map((s) => {
      const { km, offset } = projectOnLine(s.coord, points, cum);
      return { ...s, km, offsetKm: offset, price: fuel === 'gasoline_98' ? s.price98 : s.price95 };
    })
    .filter((s) => s.offsetKm <= corridorKm && s.price !== null)
    .sort((a, b) => a.km - b.km);
}

/**
 * Tria on repostar: abans d'entrar en reserva (amb marge del 15 %), la més barata
 * dins el darrer terç de la finestra segura i oberta a l'hora de pas.
 */
export function planFuelStops(params: {
  routeKm: number;
  bike: Motorcycle;
  consumption: number;
  startFraction: number;
  stations: StationOnRoute[];
  etaAtKm: (km: number) => Date;
}): FuelPlan {
  const { routeKm, bike, consumption, startFraction, stations, etaAtKm } = params;
  const safeRange = usableRangeKm(bike, consumption) * 0.85;
  const startUsable = Math.max(0, bike.tankLiters * startFraction - bike.reserveLiters);
  let reach = ((startUsable / consumption) * 100) * 0.85;
  const usable = stations.filter((s) => isOpenAt(s.hours, etaAtKm(s.km)) !== false);
  const stops: FuelPlan['stops'] = [];
  const warnings: string[] = [];
  let lastKm = 0;

  if (reach <= 0) warnings.push('Surts amb el dipòsit en reserva: reposta abans de començar.');

  while (reach < routeKm) {
    const window = usable.filter((s) => s.km > lastKm + 1 && s.km + s.offsetKm * 2 <= reach);
    if (!window.length) {
      warnings.push(
        `No hi ha benzineres obertes entre el km ${Math.round(lastKm)} i el ${Math.round(reach)}: ` +
          (lastKm === 0 ? 'surt amb el dipòsit ple.' : 'omple el dipòsit a la parada anterior.'),
      );
      break;
    }
    const minKm = lastKm + (reach - lastKm) * 0.66;
    const late = window.filter((s) => s.km >= minKm);
    const pool = late.length ? late : window;
    const best = pool.reduce((a, b) => ((b.price ?? 99) < (a.price ?? 99) ? b : a));
    const cheaper = pool.length > 1 ? `la més barata de les ${pool.length} opcions de la finestra segura` : 'l\'única opció segura';
    stops.push({
      ...best,
      reason: `Entraries en reserva cap al km ${Math.round(lastKm + (reach - lastKm) / 0.85)}. És ${cheaper}.`,
    });
    lastKm = best.km;
    reach = best.km + safeRange;
  }

  // Trams desert: buits entre benzineres més llargs que l'autonomia segura
  const pts = [0, ...stations.map((s) => s.km), routeKm];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i] - pts[i - 1] > safeRange) {
      warnings.push(
        `Tram de ${Math.round(pts[i] - pts[i - 1])} km sense benzineres (km ${Math.round(pts[i - 1])}–${Math.round(pts[i])}).`,
      );
    }
  }

  const liters = (routeKm * consumption) / 100;
  const prices = (stops.length ? stops : stations).map((s) => s.price!).filter(Boolean).sort((a, b) => a - b);
  const ref = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  return {
    stations,
    stops,
    warnings: [...new Set(warnings)],
    liters: Math.round(liters * 10) / 10,
    cost: ref ? Math.round(liters * ref * 100) / 100 : null,
    safeRangeKm: Math.round(safeRange),
    consumption,
  };
}
