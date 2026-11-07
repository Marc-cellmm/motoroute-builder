import { useCallback, useState } from 'react';
import { myReactions, setLike, setSave, type SharedRoute } from '../../lib/social';
import type { Reactions } from './SharedRouteCard';

/** Llista de rutes de la comunitat amb m'agrada i guardats optimistes. */
export function useSocialList(requireMe: () => boolean) {
  const [rows, setRows] = useState<SharedRoute[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reactions>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (list: SharedRoute[], append = false) => {
    setRows((prev) => (append ? [...prev, ...list.filter((r) => !prev.some((p) => p.id === r.id))] : list));
    try {
      const { liked, saved } = await myReactions(list.map((r) => r.id));
      setReactions((prev) => {
        const next = append ? { ...prev } : {};
        list.forEach((r) => (next[r.id] = { liked: liked.has(r.id), saved: saved.has(r.id) }));
        return next;
      });
    } catch {
      /* sense sessió: tot desmarcat */
    }
  }, []);

  async function react(id: string, kind: 'liked' | 'saved') {
    if (!requireMe()) return;
    const cur = reactions[id] ?? { liked: false, saved: false };
    const on = !cur[kind];
    const countKey = kind === 'liked' ? 'likes' : 'saves';
    const apply = (value: boolean, delta: number) => {
      setReactions((r) => ({ ...r, [id]: { ...cur, [kind]: value } }));
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [countKey]: Math.max(0, r[countKey] + delta) } : r)));
    };
    apply(on, on ? 1 : -1);
    try {
      await (kind === 'liked' ? setLike(id, on) : setSave(id, on));
      setError(null);
    } catch (e) {
      apply(!on, on ? -1 : 1); // desfà el canvi optimista
      setError((e as Error).message);
    }
  }

  return { rows, setRows, reactions, load, react, error, setError };
}
