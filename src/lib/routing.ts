import { cumulativeKm, decodePolyline, destination, bearing, haversine } from './geo';
import type { DistanceBand, LngLat, Maneuver, PlanRequest } from './types';
import { t, lang } from '../i18n';

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
  maneuvers: Maneuver[];
}

interface ValhallaManeuver {
  type: number;
  instruction: string;
  verbal_pre_transition_instruction?: string;
  begin_shape_index: number;
  end_shape_index: number;
  length: number;
  highway?: boolean;
  rough?: boolean;
  street_names?: string[];
  roundabout_exit_count?: number;
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
      ...(req.mode === 'road' ? { exclude_unpaved: true } : {}),
    },
  };
}

export function parseTrip(trip: ValhallaTrip): RawRoute {
  const coords: LngLat[] = [];
  let unpavedKm = 0;
  let motorwayKm = 0;
  const roughIdx: [number, number][] = [];
  const profileKm: number[] = [];
  const maneuvers: Maneuver[] = [];
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
    leg.maneuvers.forEach((m, i) => {
      // entre trams, l'arribada intermèdia (tipus 4-6) no s'anuncia: no és el final
      const isLegEnd = m.type >= 4 && m.type <= 6 && i === leg.maneuvers.length - 1;
      const isLegStart = m.type >= 1 && m.type <= 3 && i === 0;
      if ((!isLegEnd || leg === trip.legs.at(-1)) && (!isLegStart || leg === trip.legs[0])) {
        maneuvers.push({
          type: m.type,
          instruction: m.instruction,
          verbal: m.verbal_pre_transition_instruction,
          beginIdx: base + m.begin_shape_index,
          lengthKm: m.length,
          streets: m.street_names,
          roundaboutExit: m.roundabout_exit_count,
        });
      }
    });
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
    maneuvers,
    ...(elevations.length > 1 ? { profileKm, elevations } : {}),
  };
}

export type Stop = { coord: LngLat; type: 'break' | 'through'; generated?: boolean };

export async function callValhalla(locations: Stop[], req: Pick<PlanRequest, 'mode' | 'difficulty' | 'avoidMotorways' | 'avoidTolls'>, alternates = 0) {
  // En mode Carretera, els punts que genera l'app (bucles, desviaments) només s'enganxen a
  // carreteres terciàries o millors: si no, un punt al costat d'una pista obliga a passar-hi.
  const roadOnly = { min_road_class: 'tertiary' };
  const body = {
    locations: locations.map((l) => ({
      lat: l.coord[1],
      lon: l.coord[0],
      type: l.type,
      ...(req.mode === 'road' && l.generated ? { search_filter: roadOnly } : {}),
    })),
    costing: 'motorcycle',
    costing_options: costingOptions(req),
    directions_options: { units: 'kilometers', language: lang().valhalla },
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
    throw new Error(t("No s'ha pogut connectar amb el servei de rutes. Comprova la connexió i torna-ho a provar."));
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.trip) {
    const msg = json?.error || json?.status_message || `error ${res.status}`;
    throw new Error(t("El servei de rutes ha fallat: {0}", [msg]));
  }
  const trips: ValhallaTrip[] = [json.trip, ...((json.alternates ?? []).map((a: { trip: ValhallaTrip }) => a.trip))];
  return trips.map(parseTrip);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bucle triangular des de l'origen: costat s, obertura de 60° centrada en el rumb. */
function loopPoints(origin: LngLat, bearingDeg: number, sideKm: number): LngLat[] {
  return [destination(origin, bearingDeg - 30, sideKm), destination(origin, bearingDeg + 30, sideKm)];
}

/** Genera fins a 6 rutes circulars dins el rang de km, obertes en rumbs diferents. */
async function circularRoutes(req: PlanRequest): Promise<RawRoute[]> {
  const [min, max] = BAND_RANGE[req.band];
  const target = (min + max) / 2;
  const seed = Math.floor(Math.random() * 360);
  const out: RawRoute[] = [];
  const count = req.heading != null ? 4 : 6;
  for (let i = 0; i < count; i++) {
    // amb rumb preferit, les voltes s'obren cap a aquella banda
    const θ = req.heading != null ? (req.heading + [0, -35, 35, 70][i] + 360) % 360 : (seed + i * 60) % 360;
    let side = target / (3 * 1.3); // la carretera fa ~30 % més que la línia recta
    for (let attempt = 0; attempt < 2; attempt++) {
      const [p1, p2] = loopPoints(req.origin!.coord, θ, side);
      try {
        const [route] = await callValhalla(
          [
            { coord: req.origin!.coord, type: 'break' },
            { coord: p1, type: 'through', generated: true },
            { coord: p2, type: 'through', generated: true },
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
    await sleep(300);
  }
  if (!out.length) throw new Error(t("No s'ha pogut generar cap ruta circular des d'aquest origen."));
  return out;
}

/** A→B: alternatives directes; si queden curtes per al rang, hi afegeix desviaments laterals. */
async function pointToPointRoutes(req: PlanRequest): Promise<{ routes: RawRoute[]; note?: string }> {
  const dest = req.destination!;
  const stops: Stop[] = [
    { coord: req.origin!.coord, type: 'break' },
    ...req.vias.map((v) => ({ coord: v.coord, type: 'through' as const })),
    { coord: dest.coord, type: 'break' },
  ];
  const direct = await callValhalla(stops, req, req.vias.length ? 0 : 2);
  const [min] = BAND_RANGE[req.band];
  if (req.vias.length) return { routes: direct.slice(0, 3) };
  const longEnough = direct[0].distanceKm >= min;

  // La ruta directa és més curta que el rang: busca desviaments a banda i banda.
  const a = req.origin!.coord;
  const b = dest.coord;
  const straight = haversine(a, b);
  // si la directa ja entra al rang, els desviaments són variants una mica més llargues
  const targetStraight = longEnough ? straight * 1.25 : (min * 1.15) / 1.3; // longitud recta desitjada
  const offset = Math.sqrt(Math.max(0, (targetStraight / 2) ** 2 - (straight / 2) ** 2));
  const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const brg = bearing(a, b);
  const detours: RawRoute[] = [];
  for (const side of [-90, 90]) {
    const via = destination(mid, brg + side, Math.max(offset, Math.min(25, straight * 0.3), 8));
    try {
      await sleep(400);
      const [r] = await callValhalla(
        [stops[0], { coord: via, type: 'through', generated: true }, stops[stops.length - 1]],
        req,
      );
      detours.push(r);
    } catch {
      /* ignora el costat que no té carreteres */
    }
  }
  if (longEnough) return { routes: [...direct.slice(0, 3), ...detours] };
  return {
    routes: [...detours, ...direct].slice(0, 5),
    note: t("La ruta directa fa {0} km; s'hi han afegit desviaments per acostar-la al rang triat.", [Math.round(direct[0].distanceKm)]),
  };
}

export async function planRoutes(req: PlanRequest): Promise<{ routes: RawRoute[]; note?: string }> {
  if (!req.origin) throw new Error(t("Tria un punt de sortida."));
  if (req.circular || !req.destination) return { routes: await circularRoutes(req) };
  return pointToPointRoutes(req);
}

/**
 * Instruccions de navegació per a un traçat que no ve del motor (GPX, ruta gravada o de la
 * comunitat): Valhalla l'ajusta a la xarxa viària i en retorna les maniobres.
 */
export async function traceManeuvers(coords: LngLat[]): Promise<{ coords: LngLat[]; maneuvers: Maneuver[] }> {
  const body = {
    shape: coords.map(([lon, lat]) => ({ lat, lon })),
    costing: 'motorcycle',
    shape_match: 'map_snap',
    directions_options: { units: 'kilometers', language: lang().valhalla },
  };
  const url = VALHALLA_URL.startsWith('http') ? VALHALLA_URL.replace(/\/route$/, '/trace_route') : '/api/valhalla-trace';
  // text/plain: petició simple, sense preflight CORS
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.trip) throw new Error(t("No s'han pogut preparar les instruccions de navegació per a aquesta ruta."));
  const r = parseTrip(json.trip as ValhallaTrip);
  return { coords: r.coords, maneuvers: r.maneuvers };
}
