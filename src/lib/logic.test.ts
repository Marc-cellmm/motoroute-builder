import { describe, expect, it } from 'vitest';
import { decodePolyline, destination, haversine, cumulativeKm, projectOnLine } from './geo';
import { classify } from './weather';
import { effectiveConsumption, isOpenAt, planFuelStops, usableRangeKm } from './fuel';
import { analyseCurves, countCurves, scoreRoute } from './scoring';
import type { LngLat, Motorcycle, StationOnRoute } from './types';

const bike: Motorcycle = {
  id: 'b', name: 'INT650', category: 'naked', fuel: 'gasoline_95', tankLiters: 13.7, reserveLiters: 2.9,
  consumptionWmtc: 4.21, carriesPassenger: false, carriesLuggage: false, refuels: [], isDefault: true,
};

describe('geo', () => {
  it('descodifica polilínies (exemple de referència, precisió 5)', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(pts[0]).toEqual([-120.2, 38.5]);
    expect(pts[2][0]).toBeCloseTo(-126.453, 3);
    expect(pts[2][1]).toBeCloseTo(43.252, 3);
  });
  it('destination i haversine són coherents', () => {
    const a: LngLat = [1.5, 41.5];
    const b = destination(a, 45, 30);
    expect(haversine(a, b)).toBeCloseTo(30, 1);
  });
  it('projecta un punt sobre una línia', () => {
    const line: LngLat[] = [[1, 41], [1.2, 41]];
    const { km, offset } = projectOnLine([1.1, 41.01], line, cumulativeKm(line));
    expect(km).toBeCloseTo(haversine([1, 41], [1.1, 41]), 1);
    expect(offset).toBeCloseTo(1.1, 1);
  });
});

describe('autonomia i consum (exemple INT650 del document)', () => {
  it('autonomia útil ≈ 257 km i segura ≈ 218 km', () => {
    const r = usableRangeKm(bike, 4.21);
    expect(Math.round(r)).toBe(257);
    expect(Math.round(r * 0.85)).toBe(218);
  });
  it('el consum real pesa més a mesura que hi ha mesures', () => {
    const withRefuels = { ...bike, refuels: Array.from({ length: 3 }, () => ({ date: '', liters: 10, kmSinceLastFull: 200, fullTank: true })) };
    // real = 5.0; base = (3·4.21 + 3·5)/6 = 4.605
    expect(effectiveConsumption(withRefuels, 'road', 0)).toBeCloseTo(4.6, 1);
    expect(effectiveConsumption(bike, 'trail', 0)).toBeCloseTo(4.63, 2);
  });
});

describe('parades de benzina', () => {
  const st = (km: number, price: number): StationOnRoute => ({
    id: String(km), brand: `B${km}`, address: '', town: '', coord: [0, 0], hours: 'L-D: 24H',
    price95: price, price98: null, km, offsetKm: 0.2, price,
  });
  const eta = () => new Date('2026-11-07T10:00:00');

  it('no recomana parades si el dipòsit arriba', () => {
    const plan = planFuelStops({ routeKm: 150, bike, consumption: 4.21, startFraction: 1, stations: [st(50, 1.5)], etaAtKm: eta });
    expect(plan.stops).toHaveLength(0);
  });
  it('tria la més barata dins el darrer terç de la finestra segura', () => {
    const stations = [st(60, 1.4), st(160, 1.62), st(180, 1.55), st(200, 1.6), st(300, 1.5)];
    const plan = planFuelStops({ routeKm: 400, bike, consumption: 4.21, startFraction: 1, stations, etaAtKm: eta });
    // reach inicial ≈ 218 km → finestra tardana ≈ 144–218 km → la de 1,55 al km 180
    expect(plan.stops[0].km).toBe(180);
    expect(plan.stops.length).toBeGreaterThanOrEqual(1);
  });
  it('avisa de trams desert', () => {
    const plan = planFuelStops({ routeKm: 500, bike, consumption: 4.21, startFraction: 1, stations: [st(10, 1.5), st(400, 1.5)], etaAtKm: eta });
    expect(plan.warnings.some((w) => w.includes('sense benzineres'))).toBe(true);
  });
  it('interpreta horaris del MITECO', () => {
    expect(isOpenAt('L-D: 24H', new Date('2026-11-07T03:00'))).toBe(true);
    expect(isOpenAt('L-D: 07:00-22:00', new Date('2026-11-07T23:00'))).toBe(false);
    expect(isOpenAt('L-V: 08:00-20:00; S: 09:00-14:00', new Date())).toBeNull();
  });
});

describe('meteo', () => {
  const base = { gust: 10, prob: 0, mm: 0, code: 0, temp: 18, apparent: 18, freezing: 3000, altitude: 500 };
  it('sense alertes amb bon temps', () => expect(classify(base).level).toBe(0));
  it('ratxes de 75 km/h → taronja', () => expect(classify({ ...base, gust: 75 }).level).toBe(2));
  it('cota de congelació propera → risc de gel', () => expect(classify({ ...base, freezing: 600, altitude: 1800 }).level).toBe(2));
  it('tempesta amb calamarsa → vermell', () => expect(classify({ ...base, code: 96 }).level).toBe(3));
});

describe('corbes i dificultat', () => {
  // línia recta de 20 km vs zig-zag de forquilles
  const straight: LngLat[] = Array.from({ length: 200 }, (_, i) => [1 + i * 0.0012, 41]);
  const zigzag: LngLat[] = [];
  for (let i = 0; i < 400; i++) {
    const t = i * 0.4;
    zigzag.push([1 + i * 0.0006, 41 + Math.sin(t) * 0.002]);
  }
  it('una recta no té corbes', () => {
    expect(countCurves(analyseCurves(straight)).length).toBe(0);
  });
  it('un traçat revirat puntua més corbes que una recta', () => {
    const flat = (c: LngLat[]) => {
      const km = cumulativeKm(c);
      return scoreRoute('road', c, km, km.map(() => 300), []);
    };
    expect(flat(zigzag).curvatureScore).toBeGreaterThan(flat(straight).curvatureScore);
  });
  it('trams sense asfaltar es marquen com a terra', () => {
    const km = cumulativeKm(straight);
    const s = scoreRoute('trail', straight, km, km.map(() => 300), [[0, 8]]);
    expect(s.segments[0].surface).toBe('unpaved');
    expect(s.segments.at(-1)!.surface).toBe('paved');
  });
});

import { addPoint, type RecState } from './recorder';

describe('gravador GPS', () => {
  const base: RecState = { status: 'recording', points: [], seg: 0, startedAt: 0, elapsedMs: 0, resumedAt: 0, movingMs: 0, distanceKm: 0, maxSpeedKmh: 0 };
  const p = (lat: number, t: number, acc = 5, seg = 0) => ({ lat, lng: 1.5, alt: null, acc, t, seg });

  it('suma distància i temps en moviment', () => {
    let s = addPoint(base, p(41, 0))!;
    s = addPoint(s, p(41.001, 10000))!; // ~111 m en 10 s = 40 km/h
    expect(s.distanceKm).toBeCloseTo(0.111, 2);
    expect(s.movingMs).toBe(10000);
    expect(Math.round(s.maxSpeedKmh)).toBe(40);
  });
  it('descarta posicions imprecises, soroll i salts impossibles', () => {
    const s = addPoint(base, p(41, 0))!;
    expect(addPoint(s, p(41.001, 10000, 80))).toBeNull(); // precisió de 80 m
    expect(addPoint(s, p(41.00002, 2000))).toBeNull(); // 2 m: soroll
    expect(addPoint(s, p(41.1, 1000))).toBeNull(); // 11 km en 1 s
  });
  it('no uneix trams separats per una pausa', () => {
    let s = addPoint(base, p(41, 0))!;
    s = addPoint(s, p(41.5, 600000, 5, 1))!; // nou tram després de pausa
    expect(s.distanceKm).toBe(0);
    expect(s.points).toHaveLength(2);
  });
  it('quan està parat no compta temps en moviment', () => {
    let s = addPoint(base, p(41, 0))!;
    s = addPoint(s, p(41.0001, 60000))!; // 11 m en 1 min: 0,7 km/h
    expect(s.movingMs).toBe(0);
  });
});

import { dueAnnouncement, isOffRoute, locate, locateAnywhere, makeLeg, nextManeuver, rejoinPoint } from './navigation';

describe('navegació', () => {
  // ruta en L: 2 km cap a l'est i 2 km cap al nord, amb un gir a l'esquerra al km 2
  const coords: [number, number][] = [];
  for (let i = 0; i <= 40; i++) coords.push([1.5 + (i * 0.05) / (111.32 * Math.cos((41 * Math.PI) / 180)), 41]);
  const corner = coords.at(-1)!;
  for (let i = 1; i <= 40; i++) coords.push([corner[0], 41 + (i * 0.05) / 110.574]);
  const leg = makeLeg(coords, [
    { type: 1, instruction: 'Sortiu cap a l\'est.', beginIdx: 0, lengthKm: 2 },
    { type: 15, instruction: 'Gireu a l\'esquerra.', beginIdx: 40, lengthKm: 2 },
    { type: 4, instruction: 'Heu arribat.', beginIdx: 80, lengthKm: 0 },
  ]);

  it('situa la posició i troba la propera maniobra', () => {
    const p = locateAnywhere([coords[20][0], 41.0002], leg); // ~22 m al nord del km 1
    expect(p.km).toBeCloseTo(1, 1);
    expect(p.offset).toBeLessThan(0.03);
    const n = nextManeuver(leg, p.km)!;
    expect(n.maneuver.type).toBe(15);
    expect(n.distanceKm).toBeCloseTo(1, 1);
  });
  it('anuncia cada llindar una sola vegada', () => {
    const said = new Set<number>();
    expect(dueAnnouncement(1.2, 50, said, 2)).toBeNull();
    expect(dueAnnouncement(0.95, 50, said, 2)).toBe(1);
    expect(dueAnnouncement(0.9, 50, said, 2)).toBeNull();
    expect(dueAnnouncement(0.25, 50, said, 2)).toBe(0.3);
    expect(dueAnnouncement(0.02, 50, said, 2)).toBe(0.03);
  });
  it('detecta quan surts de la ruta', () => {
    expect(isOffRoute([0.01, 0.02, 0.03])).toBe(false);
    expect(isOffRoute([0.06, 0.07, 0.08])).toBe(true);
    expect(isOffRoute([0.01, 0.2])).toBe(true);
  });
  it('torna a la ruta per davant, mai a un punt ja passat', () => {
    // t'has desviat cap al sud al km 1,5
    const r = rejoinPoint([coords[30][0], 40.995], leg, 1.5);
    expect(r.km).toBeGreaterThanOrEqual(2.5);
  });
  it('no salta a una altra part de la ruta si passa a prop', () => {
    const p = locate([coords[10][0], 41], leg, 0.5);
    expect(p.km).toBeCloseTo(0.5, 1);
  });
});

describe('zona de privacitat', () => {
  it('retalla ~400 m a cada extrem', async () => {
    const { trimEnds, cumulativeKm, haversine } = await import('./geo');
    const line: [number, number][] = Array.from({ length: 101 }, (_, i) => [2 + i * 0.0006, 41.5]); // ~5 km
    const t = trimEnds(line, 0.4);
    expect(haversine(line[0], t.coords[0])).toBeGreaterThanOrEqual(0.4);
    expect(haversine(line[100], t.coords.at(-1)!)).toBeGreaterThanOrEqual(0.4);
    expect(haversine(line[0], t.coords[0])).toBeLessThan(0.5);
    const total = cumulativeKm(line).at(-1)!;
    expect(cumulativeKm(t.coords).at(-1)!).toBeGreaterThan(total - 1.1);
  });
  it('no retalla rutes massa curtes', async () => {
    const { trimEnds } = await import('./geo');
    const line: [number, number][] = Array.from({ length: 10 }, (_, i) => [2 + i * 0.0006, 41.5]);
    expect(trimEnds(line).coords).toBe(line);
  });
});

describe('perfil de motorista', () => {
  it('posa els valors per defecte del Planificar segons el perfil', async () => {
    const { planDefaults } = await import('./account');
    const base = { id: 'u', email: 'a@b.cat', profile: null, settings: null };
    expect(planDefaults(null)).toEqual({});
    const d = planDefaults({
      ...base,
      profile: { username: 'x_y', display_name: null, home_area: null, riding_style: 'trail', bike_name: null, riding_since: null, bio: null, interests: [], onboarded: true, avatar_url: null, bike_photos: [], country: null },
      settings: { birth_year: 1990, experience: 'beginner', ride_with: null, pref_band: '50_100', avoid_motorways: false, avoid_tolls: false, bikes: null },
    });
    expect(d).toEqual({ mode: 'trail', difficulty: 'beginner', band: '50_100', avoidMotorways: true, avoidTolls: false });
  });
});
