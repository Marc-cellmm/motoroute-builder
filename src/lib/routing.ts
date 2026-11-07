import { cumulativeKm, decodePolyline, destination, bearing, haversine } from './geo';
import type { DistanceBand, LngLat, PlanRequest } from './types';

const ELEVATION_INTERVAL = 200; // metres
const VALHALLA_URL: string = import.meta.env.VITE_VALHALLA_URL || '/api/valhalla';

export const BAND_RANGE: Record<DistanceBand, [number, number]> = {
  '50_100': [50, 100],
  '100_200': [100, 200],
  '200_400': [200, 400],
  '400_plus': [400, 550],
};

export interface RawRoute {
  coords: LngLat[];
  distanceKm: number;
  durationMin: number;
  unpavedKm: number;
  motorwayKm: number;
  unpavedRanges: [number, number][]; // trams marcats "rough" pel motor, en km
  profileKm?: number[]; // perfil d'elevació que retorna el motor (cada 200 m)
  elevations?: number[];
}

interface ValhallaManeuver {
  begin_shape_index: number;
  end_shape_index: number;
  length: number;
  highway?: boolean;
  rough?: boolean;
}
interface ValhallaTrip {
  legs: { shape: string; maneuvers: ValhallaManeuver[]; elevation?: number[]; elevation_interval?: number; summary?: { length: number } }[];
  summary: { length: number; time: number };
}

/** Opcions del perfil de moto de Valhalla segons modalitat, nivell i preferències. */
export function costingOptions(req: Pick<PlanRequest, 'mode' | 'difficulty' | 'avoidMotorways' | 'avoidTolls'>) {
  const primary = { beginner: 0.6, intermediate: 0.3, expert: 0.1 }[req.difficulty];
  const trails = { beginner: 0.4, intermediate: 0.7, expert: 1.0 }[req.difficulty];
  return {
    motorcycle: {
      use_highways: req.mode === 'trail' ? 0 : req.avoidMotorways ? 0 : 0.5,
      use_tolls: req.avoidTolls ? 0 : 0.5,
      use_primary: req.mode === 'trail' ? 0.2 : primary,
      use_trails: req.mode === 'trail' ? trails : 0,
      use_ferry: 0.2,
    },
  };
}

function parseTrip(trip: ValhallaTrip): RawRoute {
  const coords: LngLat[] = [];
  let unpavedKm = 0;
  let motorwayKm = 0;
  const roughIdx: [number, number][] = [];
  const profileKm: number[] = [];
  const elevations: number[] = [];
  let legStartKm = 0;
  for (const leg of trip.legs) {
    if (leg.elevation?.length) {
      const step = (leg.elevation_interval ?? ELEVATION_INTERVAL) / 1000;
      leg.elevation.forEach((e, i) => {
        profileKm.push(legStartKm + i * step);
        elevations.push(e);
      });
    }
    legStartKm += leg.summary?.length ?? 0;
    const pts = decodePolyline(leg.shape, 6);
    const base = coords.length ? coords.length - 1 : 0;
    // evita duplicar el punt d'unió entre trams
    coords.push(...(coords.length ? pts.slice(1) : pts));
    for (const m of leg.maneuvers) {
      if (m.rough) {
        unpavedKm += m.length;
        roughIdx.push([base + m.begin_shape_index, base + m.end_shape_index]);
      }
      if (m.highway) motorwayKm += m.length;
    }
  }
  const cum = cumulativeKm(coords);
  const unpavedRanges = roughIdx.map(([a, b]) => [cum[Math.min(a, cum.length - 1)], cum[Math.min(b, cum.length - 1)]] as [number, number]);
  return {
    coords,
    distanceKm: trip.summary.length,
    durationMin: trip.summary.time / 60,
    unpavedKm,
    motorwayKm,
    unpavedRanges,
    ...(elevations.length > 1 ? { profileKm, elevations } : {}),
  };
}

async function callValhalla(locations: { coord: LngLat; type: 'break' | 'through' }[], req: PlanRequest, alternates = 0) {
  const body = {
    locations: locations.map((l) => ({ lat: l.coord[1], lon: l.coord[0], type: l.type })),
    costing: 'motorcycle',
    costing_options: costingOptions(req),
    directions_options: { units: 'kilometers', language: 'ca-ES' },
    elevation_interval: ELEVATION_INTERVAL, // perfil d'elevació inclòs a la resposta
    ...(alternates ? { alternates } : {}),
  };
  // Amb proxy propi (dev, Vercel) fem POST; contra el servidor públic de Valhalla
  // (GitHub Pages) fem GET amb ?json=, una petició simple que no necessita preflight CORS.
  let res: Response;
  try {
    res = VALHALLA_URL.startsWith('http')
      ? await fetch(`${VALHALLA_URL}?json=${encodeURIComponent(JSON.stringify(body))}`)
      : await fetch(VALHALLA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
  } catch {
    throw new Error('No s\'ha pogut connectar amb el servei de rutes. Comprova la connexió i torna-ho a provar.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.trip) {
    const msg = json?.error || json?.status_message || `error ${res.status}`;
    throw new Error(`El servei de rutes ha fallat: ${msg}`);
  }
  const trips: ValhallaTrip[] = [json.trip, ...((json.alternates ?? []).map((a: { trip: ValhallaTrip }) => a.trip))];
  return trips.map(parseTrip);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bucle triangular des de l'origen: costat s, obertura de 60° centrada en el rumb. */
function loopPoints(origin: LngLat, bearingDeg: number, sideKm: number): LngLat[] {
  return [destination(origin, bearingDeg - 30, sideKm), destination(origin, bearingDeg + 30, sideKm)];
}

/** Genera fins a 3 rutes circulars dins el rang de km. */
async function circularRoutes(req: PlanRequest): Promise<RawRoute[]> {
  const [min, max] = BAND_RANGE[req.band];
  const target = (min + max) / 2;
  const seed = Math.floor(Math.random() * 360);
  const out: RawRoute[] = [];
  for (let i = 0; i < 3; i++) {
    const θ = (seed + i * 120) % 360;
    let side = target / (3 * 1.3); // la carretera fa ~30 % més que la línia recta
    for (let attempt = 0; attempt < 2; attempt++) {
      const [p1, p2] = loopPoints(req.origin!.coord, θ, side);
      try {
        const [route] = await callValhalla(
          [
            { coord: req.origin!.coord, type: 'break' },
            { coord: p1, type: 'through' },
            { coord: p2, type: 'through' },
            { coord: req.origin!.coord, type: 'break' },
          ],
          req,
        );
        const ratio = target / route.distanceKm;
        if (attempt === 0 && (ratio < 0.8 || ratio > 1.25)) {
          side *= ratio; // reescala i torna-ho a provar
          await sleep(400);
          continue;
        }
        out.push(route);
        break;
      } catch {
        // punt al mar o sense vies: prova el següent rumb
        break;
      }
    }
    await sleep(400);
  }
  if (!out.length) throw new Error('No s\'ha pogut generar cap ruta circular des d\'aquest origen.');
  return out;
}

/** A→B: alternatives directes; si queden curtes per al rang, hi afegeix desviaments laterals. */
async function pointToPointRoutes(req: PlanRequest): Promise<{ routes: RawRoute[]; note?: string }> {
  const dest = req.destination!;
  const stops = [
    { coord: req.origin!.coord, type: 'break' as const },
    ...req.vias.map((v) => ({ coord: v.coord, type: 'through' as const })),
    { coord: dest.coord, type: 'break' as const },
  ];
  const direct = await callValhalla(stops, req, req.vias.length ? 0 : 2);
  const [min] = BAND_RANGE[req.band];
  if (direct[0].distanceKm >= min || req.vias.length) return { routes: direct.slice(0, 3) };

  // La ruta directa és més curta que el rang: busca desviaments a banda i banda.
  const a = req.origin!.coord;
  const b = dest.coord;
  const straight = haversine(a, b);
  const targetStraight = (min * 1.15) / 1.3; // longitud recta desitjada
  const offset = Math.sqrt(Math.max(0, (targetStraight / 2) ** 2 - (straight / 2) ** 2));
  const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const brg = bearing(a, b);
  const detours: RawRoute[] = [];
  for (const side of [-90, 90]) {
    const via = destination(mid, brg + side, Math.max(offset, 10));
    try {
      await sleep(400);
      const [r] = await callValhalla(
        [stops[0], { coord: via, type: 'through' }, stops[stops.length - 1]],
        req,
      );
      detours.push(r);
    } catch {
      /* ignora el costat que no té carreteres */
    }
  }
  return {
    routes: [...detours, direct[0]].slice(0, 3),
    note: `La ruta directa fa ${Math.round(direct[0].distanceKm)} km; s'hi han afegit desviaments per acostar-la al rang triat.`,
  };
}

export async function planRoutes(req: PlanRequest): Promise<{ routes: RawRoute[]; note?: string }> {
  if (!req.origin) throw new Error('Tria un punt de sortida.');
  if (req.circular || !req.destination) return { routes: await circularRoutes(req) };
  return pointToPointRoutes(req);
}
