/**
 * Meteo sobre el mapa: una graella de previsió d'Open-Meteo per a la zona visible,
 * interpolada en una imatge de colors. Sense claus ni tessel·les de tercers.
 */
export type WxVar = 'precip' | 'cloud' | 'wind' | 'humidity' | 'temp';

export interface WxGrid {
  west: number; east: number; south: number; north: number;
  cols: number; rows: number;
  lons: number[]; // per columna
  lats: number[]; // per fila, de nord a sud, uniformes en Mercator
  hours: number[]; // segons Unix
  /** valors[variable][hora][fila * cols + columna] */
  values: Record<WxVar | 'windDir', number[][]>;
}

export const WX_UNIT: Record<WxVar, string> = { precip: 'mm/h', cloud: '%', wind: 'km/h', humidity: '%', temp: '°C' };

type Stop = [number, [number, number, number, number]]; // valor → r, g, b, alfa
export const WX_RAMP: Record<WxVar, Stop[]> = {
  precip: [[0, [90, 170, 255, 0]], [0.1, [90, 170, 255, 0.35]], [1, [40, 110, 255, 0.6]], [4, [130, 70, 255, 0.72]], [10, [255, 60, 200, 0.8]]],
  cloud: [[0, [235, 238, 245, 0]], [20, [235, 238, 245, 0.08]], [60, [225, 228, 236, 0.45]], [100, [210, 214, 224, 0.78]]],
  wind: [[0, [46, 232, 143, 0]], [10, [46, 232, 143, 0.3]], [30, [245, 181, 46, 0.55]], [50, [255, 138, 61, 0.68]], [80, [255, 59, 59, 0.8]]],
  humidity: [[0, [214, 170, 110, 0.45]], [40, [214, 190, 140, 0.25]], [65, [90, 200, 200, 0.4]], [100, [40, 110, 255, 0.68]]],
  temp: [[-10, [150, 90, 255, 0.6]], [0, [70, 130, 255, 0.55]], [10, [70, 210, 230, 0.5]], [18, [46, 232, 143, 0.5]], [25, [245, 200, 46, 0.55]], [32, [255, 138, 61, 0.62]], [40, [255, 59, 59, 0.72]]],
};

export function rampColor(v: WxVar, x: number): [number, number, number, number] {
  const stops = WX_RAMP[v];
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (x - a) / (b - a);
      return [0, 1, 2, 3].map((k) => ca[k] + (cb[k] - ca[k]) * f) as [number, number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

export async function fetchWxGrid(west: number, south: number, east: number, north: number, cols = 9, rows = 7): Promise<WxGrid> {
  south = Math.max(-80, south);
  north = Math.min(80, north);
  const lons = Array.from({ length: cols }, (_, c) => west + ((east - west) * c) / (cols - 1));
  const yN = mercY(north);
  const yS = mercY(south);
  const lats = Array.from({ length: rows }, (_, r) => invMercY(yN + ((yS - yN) * r) / (rows - 1)));
  const la: string[] = [];
  const lo: string[] = [];
  for (const lat of lats) for (const lon of lons) { la.push(lat.toFixed(3)); lo.push((((lon + 540) % 360) - 180).toFixed(3)); }
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}` +
    '&hourly=precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m' +
    '&timeformat=unixtime&timezone=GMT&forecast_days=3&wind_speed_unit=kmh',
  );
  if (!res.ok) throw new Error('weather');
  const json = await res.json();
  const list: { hourly: Record<string, number[]> }[] = Array.isArray(json) ? json : [json];
  const time = list[0].hourly.time;
  const now = Date.now() / 1000;
  let start = time.findIndex((ts) => ts + 3600 > now);
  if (start < 0) start = 0;
  const end = Math.min(time.length, start + 48);
  const pick = (key: string) => {
    const out: number[][] = [];
    for (let h = start; h < end; h++) out.push(list.map((l) => l.hourly[key]?.[h] ?? 0));
    return out;
  };
  return {
    west, east, south, north, cols, rows, lons, lats,
    hours: time.slice(start, end),
    values: {
      precip: pick('precipitation'), cloud: pick('cloud_cover'), wind: pick('wind_speed_10m'),
      windDir: pick('wind_direction_10m'), humidity: pick('relative_humidity_2m'), temp: pick('temperature_2m'),
    },
  };
}

/** Interpola la graella (bilineal) i la pinta amb l'escala de colors. Retorna píxels RGBA. */
export function renderWx(grid: WxGrid, v: WxVar, hour: number, width = 144, height = 112): Uint8ClampedArray {
  const vals = grid.values[v][Math.min(hour, grid.hours.length - 1)];
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const gy = (y / (height - 1)) * (grid.rows - 1);
    const r0 = Math.min(grid.rows - 2, Math.floor(gy));
    const fy = gy - r0;
    for (let x = 0; x < width; x++) {
      const gx = (x / (width - 1)) * (grid.cols - 1);
      const c0 = Math.min(grid.cols - 2, Math.floor(gx));
      const fx = gx - c0;
      const i = r0 * grid.cols + c0;
      const val =
        vals[i] * (1 - fx) * (1 - fy) + vals[i + 1] * fx * (1 - fy) +
        vals[i + grid.cols] * (1 - fx) * fy + vals[i + grid.cols + 1] * fx * fy;
      const [r, g, b, a] = rampColor(v, val);
      const o = (y * width + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}
