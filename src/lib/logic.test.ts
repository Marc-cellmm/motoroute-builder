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
