import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine } from './geo';
import type { LngLat } from './types';

export interface TrackPoint {
  lat: number;
  lng: number;
  alt: number | null;
  acc: number;
  t: number; // ms
  seg: number; // tram (cada pausa en comença un de nou)
}

export type RecStatus = 'idle' | 'recording' | 'paused' | 'finished';
export type PermState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface RecState {
  status: RecStatus;
  points: TrackPoint[];
  seg: number;
  startedAt: number | null;
  elapsedMs: number; // temps total gravant (sense pauses)
  resumedAt: number | null; // inici del tram actual
  movingMs: number; // temps en moviment (> 3 km/h), com Strava
  distanceKm: number;
  maxSpeedKmh: number;
}

export interface LiveFix {
  coord: LngLat;
  accuracy: number;
  speedKmh: number | null;
  alt: number | null;
  at: number;
}

const STORE = 'mrb.recording';
const EMPTY: RecState = {
  status: 'idle', points: [], seg: 0, startedAt: null, elapsedMs: 0, resumedAt: null, movingMs: 0, distanceKm: 0, maxSpeedKmh: 0,
};

/** Filtres de qualitat del senyal GPS. */
export const GPS = {
  maxAccuracyM: 40, // descarta posicions poc precises
  minStepKm: 0.008, // ignora moviments < 8 m (soroll quan estàs parat)
  maxSpeedKmh: 300, // descarta salts impossibles
  movingKmh: 3, // per sota d'això compta com a aturat
};

/**
 * Decideix si un punt nou s'afegeix al traçat. Funció pura per poder-la provar.
 * Retorna el nou estat o null si el punt es descarta.
 */
export function addPoint(state: RecState, p: TrackPoint): RecState | null {
  if (p.acc > GPS.maxAccuracyM) return null;
  const prev = state.points.at(-1);
  if (!prev || prev.seg !== p.seg) return { ...state, points: [...state.points, p] };
  const d = haversine([prev.lng, prev.lat], [p.lng, p.lat]);
  const dtH = (p.t - prev.t) / 3600000;
  if (dtH <= 0) return null;
  const speed = d / dtH;
  if (speed > GPS.maxSpeedKmh) return null;
  if (d < GPS.minStepKm && p.t - prev.t < 30000) return null;
  return {
    ...state,
    points: [...state.points, p],
    distanceKm: state.distanceKm + d,
    movingMs: state.movingMs + (speed >= GPS.movingKmh ? p.t - prev.t : 0),
    maxSpeedKmh: Math.max(state.maxSpeedKmh, Math.min(speed, 250)),
  };
}

function load(): RecState {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as RecState;
    // si la pàgina s'ha tancat gravant, es recupera en pausa
    if (s.status === 'recording') {
      return { ...s, status: 'paused', elapsedMs: s.elapsedMs + (s.resumedAt ? Math.max(0, (s.points.at(-1)?.t ?? s.resumedAt) - s.resumedAt) : 0), resumedAt: null };
    }
    return s;
  } catch {
    return EMPTY;
  }
}

function save(s: RecState) {
  try {
    if (s.status === 'idle') localStorage.removeItem(STORE);
    else localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* ple: la gravació continua en memòria */
  }
}

export function useRecorder() {
  const [state, setState] = useState<RecState>(load);
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [perm, setPerm] = useState<PermState>('unknown');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [wakeLock, setWakeLock] = useState<'on' | 'off' | 'unsupported'>('off');
  const [now, setNow] = useState(Date.now());
  const watchId = useRef<number | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // estat del permís de localització
  useEffect(() => {
    if (!('geolocation' in navigator)) return setPerm('unsupported');
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        setPerm(p.state as PermState);
        p.onchange = () => setPerm(p.state as PermState);
      })
      .catch(() => setPerm('prompt'));
  }, []);

  // desa la gravació (per recuperar-la si es tanca la pàgina): de seguida en canviar d'estat,
  // i com a molt cada 10 s mentre arriben punts, per no saturar el telèfon
  const lastSave = useRef(0);
  const lastStatus = useRef(state.status);
  useEffect(() => {
    if (state.status !== lastStatus.current || Date.now() - lastSave.current > 10000) {
      save(state);
      lastSave.current = Date.now();
      lastStatus.current = state.status;
    }
  }, [state]);

  // rellotge per al temps en directe
  useEffect(() => {
    if (state.status !== 'recording') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return setWakeLock('unsupported');
    try {
      lock.current = await navigator.wakeLock.request('screen');
      setWakeLock('on');
      lock.current.addEventListener('release', () => setWakeLock('off'));
    } catch {
      setWakeLock('off');
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    lock.current?.release().catch(() => {});
    lock.current = null;
  }, []);

  // la pantalla es pot tornar a apagar en canviar d'app: es recupera en tornar
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && stateRef.current.status === 'recording') void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [acquireWakeLock]);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const startWatch = useCallback(() => {
    stopWatch();
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPerm('granted');
        setGpsError(null);
        const c = pos.coords;
        const live: LiveFix = {
          coord: [c.longitude, c.latitude],
          accuracy: c.accuracy,
          speedKmh: c.speed != null && c.speed >= 0 ? c.speed * 3.6 : null,
          alt: c.altitude,
          at: pos.timestamp,
        };
        setFix(live);
        setState((s) => {
          if (s.status !== 'recording') return s;
          const next = addPoint(s, { lat: c.latitude, lng: c.longitude, alt: c.altitude, acc: c.accuracy, t: pos.timestamp, seg: s.seg });
          return next ?? s;
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPerm('denied');
          setGpsError('Sense permís de localització.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError('Buscant senyal GPS… Surt a l\'exterior si pots.');
        } else {
          setGpsError('El GPS triga a respondre. Continuem intentant-ho.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [stopWatch]);

  /** Demana el permís (el navegador mostra el diàleg del telèfon) i comença a seguir la posició. */
  const requestPermission = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    startWatch();
  }, [startWatch]);

  const start = useCallback(() => {
    const t = Date.now();
    setState({ ...EMPTY, status: 'recording', startedAt: t, resumedAt: t });
    startWatch();
    void acquireWakeLock();
  }, [startWatch, acquireWakeLock]);

  const pause = useCallback(() => {
    setState((s) => ({ ...s, status: 'paused', elapsedMs: s.elapsedMs + (s.resumedAt ? Date.now() - s.resumedAt : 0), resumedAt: null }));
    releaseWakeLock();
  }, [releaseWakeLock]);

  const resume = useCallback(() => {
    setState((s) => ({ ...s, status: 'recording', seg: s.seg + 1, resumedAt: Date.now() }));
    startWatch();
    void acquireWakeLock();
  }, [startWatch, acquireWakeLock]);

  const finish = useCallback(() => {
    setState((s) => ({
      ...s,
      status: 'finished',
      elapsedMs: s.elapsedMs + (s.status === 'recording' && s.resumedAt ? Date.now() - s.resumedAt : 0),
      resumedAt: null,
    }));
    stopWatch();
    releaseWakeLock();
  }, [stopWatch, releaseWakeLock]);

  const discard = useCallback(() => {
    stopWatch();
    releaseWakeLock();
    setState(EMPTY);
    setFix(null);
  }, [stopWatch, releaseWakeLock]);

  // si es recupera una gravació en pausa no es torna a activar el GPS fins que l'usuari continua
  useEffect(() => () => { stopWatch(); releaseWakeLock(); }, [stopWatch, releaseWakeLock]);

  const elapsedMs = state.elapsedMs + (state.status === 'recording' && state.resumedAt ? now - state.resumedAt : 0);
  return { state, fix, perm, gpsError, wakeLock, elapsedMs, requestPermission, start, pause, resume, finish, discard };
}

export function trackCoords(points: TrackPoint[]): LngLat[] {
  return points.map((p) => [p.lng, p.lat]);
}

export function recordedGpx(points: TrackPoint[], title: string): string {
  const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const segs = new Map<number, TrackPoint[]>();
  points.forEach((p) => segs.set(p.seg, [...(segs.get(p.seg) ?? []), p]));
  const body = [...segs.values()]
    .map((seg) =>
      `<trkseg>\n${seg
        .map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time></trkpt>`)
        .join('\n')}\n</trkseg>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoRoute Builder" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(title)}</name></metadata>
<trk><name>${esc(title)}</name>
${body}
</trk>
</gpx>`;
}

export const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
