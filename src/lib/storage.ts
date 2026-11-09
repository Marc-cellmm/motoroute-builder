import type { Motorcycle, RecordedRoute, SavedRoute } from './types';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* emmagatzematge ple o no disponible */
  }
}

export const loadBikes = () => read<Motorcycle[]>('mrb.bikes', []);
export const saveBikes = (b: Motorcycle[]) => write('mrb.bikes', b);
export const loadRoutes = () => read<SavedRoute[]>('mrb.routes', []);
export const saveRoutes = (r: SavedRoute[]) => write('mrb.routes', r);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const loadRecordings = () => read<RecordedRoute[]>('mrb.recordings', []);
export const saveRecordings = (r: RecordedRoute[]) => write('mrb.recordings', r);
