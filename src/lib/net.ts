/**
 * Peticions a serveis externs sense que l'app es quedi penjada:
 * - temps màxim per petició (si el servei no respon, s'avorta),
 * - reintents amb espera quan el servei està saturat (429) o falla (5xx, xarxa),
 * - cancel·lació quan l'usuari ja ha demanat una altra cosa,
 * - memòria cau i peticions compartides (dos clics = una sola petició),
 * - cua per als serveis que no admeten peticions en paral·lel.
 */

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

export interface FetchOpts {
  init?: RequestInit;
  /** temps màxim de cada intent, en ms */
  timeoutMs?: number;
  /** reintents després del primer intent */
  retries?: number;
  /** senyal per cancel·lar des de fora (p. ex. una cerca nova) */
  signal?: AbortSignal;
}

export const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

/** Un sol intent amb temps màxim. Un temps esgotat es tradueix en error «timeout», no en cancel·lació. */
async function attempt(url: string, init: RequestInit | undefined, timeoutMs: number, outer?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener('abort', onOuter, { once: true });
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (timedOut) throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

/** fetch amb temps màxim i reintents. Retorna la resposta (encara que no sigui 2xx si no es pot reintentar). */
export async function fetchRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { init, timeoutMs = 15000, retries = 2, signal } = opts;
  for (let i = 0; ; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await attempt(url, init, timeoutMs, signal);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || i >= retries) return res;
      await wait(res.status === 429 ? 2500 * (i + 1) : 800 * (i + 1), signal);
    } catch (e) {
      if (isAbort(e) || i >= retries) throw e;
      await wait(800 * (i + 1), signal);
    }
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchRetry(url, opts);
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

/**
 * Memòria cau amb peticions compartides: si ja hi ha una petició en curs per la mateixa clau,
 * es reaprofita. Els errors no es guarden (el pròxim intent torna a provar-ho).
 */
export function cached<T>(ttlMs: number, max = 60) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load();
    store.set(key, { at: Date.now(), value });
    value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
    if (store.size > max) store.delete(store.keys().next().value!);
    return value;
  };
}

/** Cua: com a molt `n` tasques alhora; la resta esperen el seu torn. */
export function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task().then(resolve, reject).finally(() => { active--; next(); });
      });
      next();
    });
}
