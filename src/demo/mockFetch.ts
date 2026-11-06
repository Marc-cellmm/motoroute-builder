/**
 * MODE DEMO: substitueix `fetch` per respostes simulades amb el mateix format que
 * Valhalla, Open-Meteo, MITECO, Photon i Overpass. Així la mateixa app funciona
 * dins d'una pàgina sense accés a la xarxa. Només s'inclou al build `--mode demo`.
 * Les poblacions són els 947 municipis reals de Catalunya; la resta és simulat.
 */
import townsRaw from './towns.json';

type Town = [string, number, number];
type LL = [number, number];
const TOWNS = townsRaw as Town[];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toRad = (d: number) => (d * Math.PI) / 180;
function hav(a: LL, b: LL) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
/** Pseudoaleatori determinista. */
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- polilínia (precisió 6, format Valhalla)
function encVal(v: number) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}
function encode(coords: LL[]) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  for (const [lng, lat] of coords) {
    const iLat = Math.round(lat * 1e6);
    const iLng = Math.round(lng * 1e6);
    out += encVal(iLat - pLat) + encVal(iLng - pLng);
    pLat = iLat;
    pLng = iLng;
  }
  return out;
}

// ---------- relleu simulat: pla a la costa, Prepirineu i Pirineu al nord
export function terrain(lng: number, lat: number) {
  const north = Math.min(2300, Math.max(0, lat - 41.45) * 1700);
  const inland = Math.max(0, 1 - Math.abs(lng - 0.4 - (lat - 40.5) * 0.9) / 3) * 250;
  const hills = 260 * Math.sin(lng * 9.1) * Math.cos(lat * 11.3) + 140 * Math.sin(lng * 23 + lat * 17);
  return Math.max(2, Math.round(80 + north + inland + hills * Math.min(1, 0.4 + north / 1500)));
}

// ---------- rutes simulades
interface Loc { lat: number; lon: number }
interface Opts { use_highways?: number; use_trails?: number; use_primary?: number }

function legGeometry(a: LL, b: LL, seed: number, opts: Opts, bulgeKm: number): LL[] {
  const dist = hav(a, b);
  const n = Math.max(2, Math.round(dist / 0.05));
  const kx = 111.32 * Math.cos(toRad((a[1] + b[1]) / 2));
  const ky = 110.57;
  const dx = (b[0] - a[0]) * kx;
  const dy = (b[1] - a[1]) * ky;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len; // perpendicular unitària (km)
  const twisty = 1 - (opts.use_primary ?? 0.5); // menys principals = més corbes
  const pts: LL[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = t * dist;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const mountain = Math.min(1.6, 0.6 + Math.max(0, y - 41.6) * 2.2);
    const amp = (0.08 + 0.22 * twisty) * mountain;
    const taper = Math.min(1, t * 8, (1 - t) * 8);
    const off =
      // corbes: període ~0,7 km en carreteres revirades, més obertes en principals
      taper * amp * (Math.sin(d / (0.1 + 0.45 * (1 - twisty)) + seed) * 0.75 + Math.sin(d / 0.37 + seed * 2) * 0.25) +
      bulgeKm * Math.sin(Math.PI * t) +
      taper * 1.4 * Math.sin(d / 7 + seed * 3);
    pts.push([x + (px * off) / kx, y + (py * off) / ky]);
  }
  return pts;
}

function route(locs: Loc[], opts: Opts, seed: number, bulgeKm: number) {
  const coords: LL[] = [];
  for (let i = 1; i < locs.length; i++) {
    const leg = legGeometry([locs[i - 1].lon, locs[i - 1].lat], [locs[i].lon, locs[i].lat], seed + i, opts, bulgeKm);
    coords.push(...(coords.length ? leg.slice(1) : leg));
  }
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += hav(coords[i - 1], coords[i]);
  const trails = opts.use_trails ?? 0;
  const highways = opts.use_highways ?? 0;
  const speed = trails > 0 ? 38 : highways > 0.3 ? 68 : 56;
  const N = coords.length - 1;
  const cut = (f: number) => Math.round(N * f);
  const pieces: [number, number, boolean, boolean][] = trails > 0
    ? [[0, 0.25, false, false], [0.25, 0.25 + 0.25 * trails, false, true], [0.25 + 0.25 * trails, 0.6, false, false], [0.6, 0.6 + 0.15 * trails, false, true], [0.6 + 0.15 * trails, 1, false, false]]
    : highways > 0.3
      ? [[0, 0.3, true, false], [0.3, 1, false, false]]
      : [[0, 1, false, false]];
  const maneuvers = pieces.map(([s, e, hw, rough]) => ({
    begin_shape_index: cut(s),
    end_shape_index: cut(e),
    length: km * (e - s),
    highway: hw,
    rough,
  }));
  return {
    legs: [{ shape: encode(coords), maneuvers }],
    summary: { length: Math.round(km * 1000) / 1000, time: (km / speed) * 3600 },
  };
}

function valhalla(body: { locations: Loc[]; costing_options?: { motorcycle?: Opts }; alternates?: number }) {
  const opts = body.costing_options?.motorcycle ?? {};
  const s = body.locations.reduce((acc, l) => acc + l.lat * 7 + l.lon * 13, 0);
  const trip = route(body.locations, opts, s, 0);
  const alternates = Array.from({ length: Math.min(2, body.alternates ?? 0) }, (_, i) => ({
    trip: route(body.locations, opts, s + 5 + i * 3, (i === 0 ? 1 : -1) * Math.max(4, trip.summary.length * 0.07)),
  }));
  return { trip, alternates };
}

// ---------- meteo simulada
function forecast(url: URL) {
  const lats = url.searchParams.get('latitude')!.split(',').map(Number);
  const lngs = url.searchParams.get('longitude')!.split(',').map(Number);
  const elevs = (url.searchParams.get('elevation') ?? '').split(',').map(Number);
  const day0 = Math.floor(Date.now() / 86400000) * 86400;
  const hours = Array.from({ length: 16 * 24 }, (_, h) => day0 + h * 3600);
  const one = (i: number) => {
    const alt = Number.isFinite(elevs[i]) ? elevs[i] : terrain(lngs[i], lats[i]);
    const H = hours.map((t) => {
      const hourUtc = new Date(t * 1000).getUTCHours();
      const day = Math.floor((t - day0) / 86400);
      const diurnal = Math.sin(((hourUtc - 8) / 24) * 2 * Math.PI);
      const temp = 15 - alt * 0.0065 + 5 * diurnal - (day === 4 ? 6 : 0);
      // tempestes de tarda a la muntanya els dies 1 i 3
      const storm = (day === 1 || day === 3) && hourUtc >= 12 && hourUtc <= 16 && alt > 900;
      const gust = 18 + alt / 55 + 8 * rand(i * 31 + day) + (day === 2 && alt > 1200 ? 35 : 0);
      return {
        temp,
        prob: storm ? 75 : Math.round(8 + 15 * rand(i + day * 7)),
        mm: storm ? (alt > 1500 ? 3.2 : 1.4) : 0,
        code: storm ? (alt > 1500 ? 95 : 61) : diurnal > 0.3 ? 1 : 2,
        gust,
        freezing: day === 4 ? 1100 : 2600,
      };
    });
    return {
      hourly: {
        time: hours,
        temperature_2m: H.map((x) => Math.round(x.temp * 10) / 10),
        apparent_temperature: H.map((x) => Math.round((x.temp - 1) * 10) / 10),
        precipitation_probability: H.map((x) => x.prob),
        precipitation: H.map((x) => x.mm),
        wind_gusts_10m: H.map((x) => Math.round(x.gust)),
        weather_code: H.map((x) => x.code),
        freezing_level_height: H.map((x) => x.freezing),
      },
      daily: { sunset: Array.from({ length: 16 }, (_, d) => day0 + d * 86400 + 16 * 3600 + 25 * 60) },
    };
  };
  return lats.length > 1 ? lats.map((_, i) => one(i)) : one(0);
}

// ---------- benzineres simulades als municipis reals
const BRANDS = ['REPSOL', 'CEPSA', 'BP', 'GALP', 'PLENOIL', 'BALLENOIL', 'PETRONOR', 'ESCLATOIL', 'BONAREA', 'SHELL'];
let stationsCache: Record<string, string>[] | null = null;
function stations() {
  if (stationsCache) return stationsCache;
  const fmt = (n: number) => n.toFixed(3).replace('.', ',');
  stationsCache = TOWNS.flatMap(([name, lng, lat], i) => {
    const alt = terrain(lng, lat);
    if (rand(i) > (alt > 1200 ? 0.25 : alt > 800 ? 0.45 : 0.7)) return [];
    const p95 = 1.42 + rand(i * 3) * 0.2;
    const h = rand(i * 5);
    return [{
      IDEESS: String(10000 + i),
      'Rótulo': BRANDS[Math.floor(rand(i * 7) * BRANDS.length)],
      'Dirección': `Carretera ${['C', 'N', 'B', 'GI', 'L', 'T'][i % 6]}-${10 + (i % 90)}, km ${Math.round(rand(i * 11) * 60)}`,
      Municipio: name,
      Latitud: fmt(lat + (rand(i * 13) - 0.5) * 0.006),
      'Longitud (WGS84)': fmt(lng + (rand(i * 17) - 0.5) * 0.008),
      Horario: h < 0.4 ? 'L-D: 24H' : h < 0.85 ? 'L-D: 07:00-22:00' : 'L-V: 08:00-20:00; S: 09:00-14:00',
      'Precio Gasolina 95 E5': fmt(p95),
      'Precio Gasolina 98 E5': fmt(p95 + 0.12 + rand(i * 19) * 0.05),
    }];
  });
  return stationsCache;
}

// ---------- allotjaments simulats
function overpass(body: string) {
  const q = decodeURIComponent(body.replace(/^data=/, ''));
  const m = q.match(/around:(\d+),([\d.-]+),([\d.-]+)/);
  if (!m) return { elements: [] };
  const radius = +m[1] / 1000;
  const c: LL = [+m[3], +m[2]];
  const near = TOWNS.map((t) => ({ t, d: hav(c, [t[1], t[2]]) })).filter((x) => x.d <= radius).sort((a, b) => a.d - b.d).slice(0, 8);
  const kinds = ['hotel', 'guest_house', 'camp_site', 'hostel', 'hotel', 'guest_house', 'apartment', 'hotel'];
  const label: Record<string, string> = { hotel: 'Hotel', guest_house: 'Casa rural', camp_site: 'Càmping', hostel: 'Alberg', apartment: 'Apartaments' };
  const elements = near.flatMap(({ t }, i) => {
    const n = 1 + Math.floor(rand(t[1] * 100 + i) * 2);
    return Array.from({ length: n }, (_, j) => {
      const kind = kinds[(i + j * 3) % kinds.length];
      const seed = t[1] * 1000 + t[2] + j;
      const stars = kind === 'hotel' ? String(2 + Math.floor(rand(seed) * 3)) : undefined;
      return {
        type: 'node',
        id: Math.round(seed * 1000),
        lat: t[2] + (rand(seed * 3) - 0.5) * 0.01,
        lon: t[1] + (rand(seed * 5) - 0.5) * 0.01,
        tags: {
          tourism: kind,
          name: `${label[kind]} ${j ? ['Can Puig', 'El Molí', 'La Font', 'Mas Vell'][Math.floor(rand(seed * 7) * 4)] : t[0]}`,
          ...(stars ? { stars } : {}),
        },
      };
    });
  });
  return { elements };
}

// ---------- cerca de llocs
function photonSearch(q: string, lat: number, lon: number) {
  const nq = norm(q);
  const hits = TOWNS.filter((t) => norm(t[0]).includes(nq))
    .sort((a, b) => (norm(a[0]).startsWith(nq) ? 0 : 1) - (norm(b[0]).startsWith(nq) ? 0 : 1) || hav([lon, lat], [a[1], a[2]]) - hav([lon, lat], [b[1], b[2]]))
    .slice(0, 6);
  return { features: hits.map((t) => ({ geometry: { coordinates: [t[1], t[2]] }, properties: { name: t[0], state: 'Catalunya' } })) };
}
function photonReverse(lat: number, lon: number) {
  const best = TOWNS.reduce((b, t) => (hav([lon, lat], [t[1], t[2]]) < hav([lon, lat], [b[1], b[2]]) ? t : b));
  return { features: [{ properties: { name: best[0] } }] };
}

// ---------- intercepció
const json = (data: unknown, delay = 250) =>
  new Promise<Response>((res) =>
    setTimeout(() => res(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })), delay),
  );

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.href);
  const body = typeof init?.body === 'string' ? init.body : '';
  if (url.pathname.endsWith('/api/valhalla')) return json(valhalla(JSON.parse(body)), 450);
  if (url.pathname.endsWith('/api/fuel')) return json({ ListaEESSPrecio: stations(), ResultadoConsulta: 'OK' }, 700);
  if (url.hostname === 'api.open-meteo.com' && url.pathname.includes('elevation')) {
    const lats = url.searchParams.get('latitude')!.split(',').map(Number);
    const lngs = url.searchParams.get('longitude')!.split(',').map(Number);
    return json({ elevation: lats.map((la, i) => terrain(lngs[i], la)) }, 150);
  }
  if (url.hostname === 'api.open-meteo.com') return json(forecast(url), 500);
  if (url.hostname === 'photon.komoot.io' && url.pathname.startsWith('/reverse')) {
    return json(photonReverse(+url.searchParams.get('lat')!, +url.searchParams.get('lon')!), 100);
  }
  if (url.hostname === 'photon.komoot.io') {
    return json(photonSearch(url.searchParams.get('q') ?? '', +(url.searchParams.get('lat') ?? 41.6), +(url.searchParams.get('lon') ?? 1.6)), 120);
  }
  if (url.hostname === 'overpass-api.de') return json(overpass(body), 600);
  return realFetch(input, init);
};
