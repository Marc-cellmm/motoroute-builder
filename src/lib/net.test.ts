import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached, fetchJson, fetchRetry, isAbort, limiter } from './net';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('fetchRetry', () => {
  it('avorta una petició que no respon i ho reintenta', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))));
      }
      return Promise.resolve(ok({ n: calls }));
    });
    const json = await fetchJson<{ n: number }>('x', { timeoutMs: 30, retries: 1 });
    expect(json.n).toBe(2);
  });

  it('reintenta quan el servei respon 429 o 5xx', async () => {
    const statuses = [503, 200];
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: statuses.shift()! })));
    const res = await fetchRetry('x', { retries: 2 });
    expect(res.status).toBe(200);
  });

  it('una cancel·lació des de fora no es reintenta', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))));
    const ctrl = new AbortController();
    const p = fetchRetry('x', { signal: ctrl.signal, retries: 3, timeoutMs: 5000 });
    ctrl.abort();
    await expect(p).rejects.toSatisfy(isAbort);
  });
});

describe('cached', () => {
  it('dos clics alhora fan una sola petició', async () => {
    const c = cached<number>(1000);
    let n = 0;
    const load = () => new Promise<number>((r) => setTimeout(() => r(++n), 10));
    const [a, b] = await Promise.all([c('k', load), c('k', load)]);
    expect([a, b, n]).toEqual([1, 1, 1]);
  });

  it('un error no queda desat', async () => {
    const c = cached<number>(1000);
    await expect(c('k', () => Promise.reject(new Error('x')))).rejects.toThrow();
    await Promise.resolve();
    expect(await c('k', () => Promise.resolve(7))).toBe(7);
  });
});

describe('limiter', () => {
  it('no deixa passar més tasques de les permeses', async () => {
    const run = limiter(1);
    let active = 0;
    let max = 0;
    const task = () => run(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; });
    await Promise.all([task(), task(), task()]);
    expect(max).toBe(1);
  });
});
