/**
 * Seguiment en directe (com el LiveTrack de Garmin o el Beacon de Strava, però gratis):
 * qui grava emet la posició per un canal de Supabase Realtime i qui té l'enllaç la veu
 * al mapa. No es desa res a la base de dades: els missatges són efímers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sb, socialEnabled } from './social';
import { decodePolyline, encodePolyline, simplify } from './geo';
import { PUBLIC_URL } from '../config';
import type { LiveFix, RecState } from './recorder';
import type { LngLat } from './types';
import { t } from '../i18n';

export interface LivePayload {
  c: LngLat | null; // posició actual
  s: number | null; // km/h
  km: number; // distància gravada
  t: number; // hora de la mostra (ms)
  name: string | null;
  trail: string; // traçat recent, polyline precisió 5
  paused?: boolean;
  done?: boolean;
}

const SEND_EVERY_MS = 10_000;
const TRAIL_MAX = 400;

export const liveEnabled = socialEnabled;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function liveUrl(id: string): string {
  const u = new URL(PUBLIC_URL);
  u.searchParams.set('live', id);
  return u.toString();
}

/** Costat de qui grava. */
export function useLiveShare(rec: RecState, fix: LiveFix | null, name: string | null) {
  const [id, setId] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const latest = useRef({ rec, fix, name });
  latest.current = { rec, fix, name };

  const payload = useCallback((extra: Partial<LivePayload> = {}): LivePayload => {
    const { rec: r, fix: f, name: n } = latest.current;
    let coords: LngLat[] = r.points.map((p) => [p.lng, p.lat]);
    if (coords.length > TRAIL_MAX) coords = simplify(coords, 0.03);
    if (coords.length > TRAIL_MAX) coords = coords.slice(-TRAIL_MAX);
    return {
      c: f?.coord ?? coords.at(-1) ?? null,
      s: f?.speedKmh ?? null,
      km: Math.round(r.distanceKm * 10) / 10,
      t: f?.at ?? Date.now(),
      name: n,
      trail: encodePolyline(coords, 5),
      paused: r.status === 'paused',
      ...extra,
    };
  }, []);

  const send = useCallback((extra?: Partial<LivePayload>) => {
    void channel.current?.send({ type: 'broadcast', event: 'pos', payload: payload(extra) });
  }, [payload]);

  const stop = useCallback(() => {
    const ch = channel.current;
    if (!ch) return;
    void ch.send({ type: 'broadcast', event: 'pos', payload: payload({ done: true }) }).finally(() => {
      void sb().removeChannel(ch);
    });
    channel.current = null;
    setId(null);
    setViewers(0);
  }, [payload]);

  const start = useCallback(() => {
    if (channel.current) return;
    setError(null);
    const newChannel = newId();
    const ch = sb().channel(`live-${newChannel}`, { config: { broadcast: { self: false }, presence: { key: 'rider' } } });
    ch.on('broadcast', { event: 'hello' }, () => send())
      .on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState();
        setViewers(Object.keys(st).filter((k) => k !== 'rider').length);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') send();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError(t("No s'ha pogut connectar amb el servidor de seguiment."));
      });
    channel.current = ch;
    setId(newChannel);
  }, [send]);

  // emissió periòdica mentre es grava
  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => send(), SEND_EVERY_MS);
    return () => clearInterval(t);
  }, [id, send]);

  // si la gravació s'acaba o es descarta, el seguiment també
  useEffect(() => {
    if (id && (rec.status === 'finished' || rec.status === 'idle')) stop();
  }, [rec.status, id, stop]);

  useEffect(() => () => { if (channel.current) void sb().removeChannel(channel.current); }, []);

  return { id, url: id ? liveUrl(id) : null, viewers, error, start, stop };
}

export type LiveShare = ReturnType<typeof useLiveShare>;

/** Costat de qui mira. */
export function useLiveFollow(id: string) {
  const [last, setLast] = useState<LivePayload | null>(null);
  const [trail, setTrail] = useState<LngLat[]>([]);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'live' | 'error'>('connecting');

  useEffect(() => {
    if (!/^[\w-]{8,64}$/.test(id)) {
      setStatus('error');
      return;
    }
    const ch = sb().channel(`live-${id}`, { config: { broadcast: { self: false }, presence: { key: newId() } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const p = payload as LivePayload;
      setLast(p);
      try {
        setTrail(p.trail ? decodePolyline(p.trail, 5) : []);
      } catch { /* traçat malmès: es manté l'anterior */ }
      setStatus('live');
    }).subscribe((st) => {
      if (st === 'SUBSCRIBED') {
        setStatus((s) => (s === 'live' ? s : 'waiting'));
        void ch.track({ watching: true });
        void ch.send({ type: 'broadcast', event: 'hello', payload: {} });
      }
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setStatus('error');
    });
    return () => void sb().removeChannel(ch);
  }, [id]);

  return { last, trail, status };
}
