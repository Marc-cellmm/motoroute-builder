import { useEffect, useState } from 'react';
import ShareDialog from './social/ShareDialog';
import ElevationProfile from './ElevationProfile';
import { Loader } from './RouteDetail';
import { DIFF_LABEL } from './RouteCard';
import { fmtClock, recordedGpx, trackCoords, useRecorder } from '../lib/recorder';
import { routeFromTrack, socialEnabled, type Me } from '../lib/social';
import { haversine, simplify } from '../lib/geo';
import { reverseGeocode } from '../lib/places';
import { effectiveConsumption } from '../lib/fuel';
import { downloadText } from '../lib/gpx';
import { uid } from '../lib/storage';
import type { Motorcycle, RecordedRoute, RideMode, RouteResult } from '../lib/types';

type Recorder = ReturnType<typeof useRecorder>;

interface Props {
  rec: Recorder;
  bike: Motorcycle | null;
  me: Me | null;
  setMe: (m: Me) => void;
  onSave: (r: RecordedRoute) => void;
  onMarkShared: (id: string) => void;
  goToMyRoutes: () => void;
  demo: boolean;
}

function Stat({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <div className={`rec-stat ${big ? 'big' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export default function RecordScreen({ rec, bike, me, setMe, onSave, onMarkShared, goToMyRoutes, demo }: Props) {
  const { state, fix, perm, gpsError, wakeLock, elapsedMs } = rec;
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (demo) {
    return (
      <div>
        <h2>Grava</h2>
        <div className="alert info" style={{ marginTop: 12 }}>
          La gravació amb GPS necessita el permís de localització del telèfon i aquí no està disponible. Prova-ho a la web publicada.
        </div>
      </div>
    );
  }

  if (state.status === 'finished') {
    return <Summary rec={rec} bike={bike} me={me} setMe={setMe} onSave={onSave} onMarkShared={onMarkShared} goToMyRoutes={goToMyRoutes} />;
  }

  // velocitat del GPS; si el telèfon no la dona, es calcula amb els dos últims punts
  const [a, b] = state.points.slice(-2);
  const derived = a && b && a.seg === b.seg && Date.now() - b.t < 15000 && b.t > a.t
    ? (haversine([a.lng, a.lat], [b.lng, b.lat]) / ((b.t - a.t) / 3600000))
    : null;
  const speed = fix?.speedKmh ?? derived;
  const avg = state.movingMs > 60000 ? state.distanceKm / (state.movingMs / 3600000) : null;
  const gpsOk = fix && Date.now() - fix.at < 15000 && fix.accuracy <= 40;

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <h2>Grava la ruta</h2>
        {state.status !== 'idle' && (
          <span className={`rec-badge ${state.status}`} style={{ flex: 'none' }}>
            {state.status === 'recording' ? '● Gravant' : 'Ⅱ En pausa'}
          </span>
        )}
      </div>

      {state.status === 'idle' && (
        <>
          <p className="hint">Com Strava: el GPS del telèfon segueix la teva ruta. Quan acabis, la pots desar i compartir a la comunitat.</p>
          {perm === 'unsupported' && <div className="alert err">Aquest navegador no té GPS disponible.</div>}
          {perm === 'denied' && (
            <div className="alert err">
              <b>Permís de localització denegat.</b> Activa'l per a aquest web:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li><b>iPhone:</b> Configuració → Privacitat → Localització → Safari (o el navegador) → «Mentre s'usa l'app». Després recarrega.</li>
                <li><b>Android (Chrome):</b> toca el cadenat a la barra d'adreces → Permisos → Ubicació → Permet.</li>
              </ul>
            </div>
          )}
          {(perm === 'prompt' || perm === 'unknown') && !fix && (
            <div className="box">
              <b>Permís de localització</b>
              <p className="hint">El telèfon et preguntarà si permets la ubicació. Tria «Permet» (o «Mentre s'usa l'app»).</p>
              <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={rec.requestPermission}>📍 Activa la ubicació</button>
            </div>
          )}
          {fix && (
            <div className="alert info">
              GPS {gpsOk ? 'a punt' : 'buscant senyal'} · precisió ±{Math.round(fix.accuracy)} m
            </div>
          )}
          {gpsError && <div className="alert warn">{gpsError}</div>}
          <button className="rec-start" disabled={perm === 'denied' || perm === 'unsupported'} onClick={rec.start}>
            <span>●</span> Comença a gravar
          </button>
          <div className="box" style={{ marginTop: 14 }}>
            <div className="label">Abans de sortir</div>
            <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>Posa el mòbil al suport amb la pantalla encesa: l'app la manté activa mentre graves.</li>
              <li>Si bloqueges la pantalla o canvies d'app, el telèfon pot aturar el GPS. En tornar, la gravació continua.</li>
              <li>Porta el mòbil carregat o connectat a la moto.</li>
            </ul>
          </div>
        </>
      )}

      {state.status !== 'idle' && (
        <>
          <div className="rec-grid">
            <Stat big value={state.distanceKm.toFixed(2)} label="km" />
            <Stat big value={fmtClock(elapsedMs)} label="temps" />
            <Stat value={speed != null && state.status === 'recording' ? Math.round(speed).toString() : '—'} label="km/h ara" />
            <Stat value={avg ? Math.round(avg).toString() : '—'} label="km/h mitjana" />
            <Stat value={Math.round(state.maxSpeedKmh).toString()} label="km/h màxima" />
            <Stat value={fix?.alt != null ? `${Math.round(fix.alt)}` : '—'} label="m altitud" />
          </div>
          <div className="hint" style={{ margin: '8px 0' }}>
            {state.status === 'recording' && (
              <>
                {gpsOk ? `GPS ±${Math.round(fix!.accuracy)} m` : 'Buscant senyal GPS…'}
                {' · '}
                {wakeLock === 'on' ? 'pantalla mantinguda encesa' : wakeLock === 'unsupported' ? 'mantén la pantalla encesa manualment' : 'pantalla: toca-la si s\'enfosqueix'}
              </>
            )}
            {state.status === 'paused' && 'Gravació en pausa. El GPS està aturat.'}
          </div>
          {gpsError && state.status === 'recording' && <div className="alert warn">{gpsError}</div>}

          {!confirmStop ? (
            <div className="actions">
              {state.status === 'recording'
                ? <button className="btn" onClick={rec.pause}>Ⅱ Pausa</button>
                : <button className="btn" onClick={rec.resume}>▶ Continua</button>}
              <button className="btn primary" onClick={() => setConfirmStop(true)}>■ Acaba</button>
            </div>
          ) : (
            <div className="box" style={{ marginTop: 14 }}>
              <b>Vols acabar la gravació?</b>
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setConfirmStop(false)}>Encara no</button>
                <button className="btn primary" onClick={() => { setConfirmStop(false); rec.finish(); }}>Sí, acaba</button>
              </div>
            </div>
          )}
          {state.status === 'paused' && (
            !confirmDiscard
              ? <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setConfirmDiscard(true)}>Descarta la gravació</button>
              : (
                <div className="alert warn">
                  Segur? Es perdrà el traçat.{' '}
                  <button className="btn small" onClick={() => { setConfirmDiscard(false); rec.discard(); }}>Sí, descarta</button>{' '}
                  <button className="btn small ghost" onClick={() => setConfirmDiscard(false)}>No</button>
                </div>
              )
          )}
        </>
      )}
    </div>
  );
}

function Summary({ rec, bike, me, setMe, onSave, onMarkShared, goToMyRoutes }: Omit<Props, 'demo'>) {
  const { state } = rec;
  const [mode, setMode] = useState<RideMode>('road');
  const [title, setTitle] = useState('');
  const [startName, setStartName] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RecordedRoute | null>(null);
  const [sharing, setSharing] = useState(false);

  const coords = trackCoords(state.points);
  const tooShort = coords.length < 2 || state.distanceKm < 0.2;
  const dateLabel = new Date(state.startedAt ?? Date.now()).toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' });

  useEffect(() => {
    if (tooShort) return;
    let cancelled = false;
    (async () => {
      try {
        const name = await reverseGeocode(coords[0]);
        if (cancelled) return;
        setStartName(name);
        setTitle((t) => t || `Ruta per ${name.split(',')[0]} · ${dateLabel}`);
      } catch {
        setTitle((t) => t || `Ruta del ${dateLabel}`);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // calcula desnivell, corbes i dificultat del traçat (es refà si canvia la modalitat)
  useEffect(() => {
    if (tooShort) return;
    let cancelled = false;
    setRoute(null);
    routeFromTrack({
      name: null,
      coords: simplify(coords, 0.004),
      elevations: null,
      date: null,
      durationMin: state.movingMs / 60000,
      distanceKm: state.distanceKm,
    }, mode)
      .then((r) => !cancelled && setRoute({ ...r, distanceKm: state.distanceKm, durationMin: state.movingMs / 60000 || r.durationMin }))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const movingMin = state.movingMs / 60000;
  const avg = movingMin > 0 ? state.distanceKm / (movingMin / 60) : 0;
  const liters = bike ? (state.distanceKm * effectiveConsumption(bike, mode, route ? (route.elevationGain / Math.max(1, state.distanceKm)) * 100 : 0)) / 100 : null;

  function build(): RecordedRoute | null {
    if (!route) return null;
    const { weather: _w, fuel: _f, stages: _s, bestDepartures: _b, ...plain } = route;
    void _w; void _f; void _s; void _b;
    return {
      id: uid(),
      title: title.trim() || `Ruta del ${dateLabel}`,
      recordedAt: new Date(state.startedAt ?? Date.now()).toISOString(),
      mode,
      startName,
      movingMin: Math.round(movingMin),
      elapsedMin: Math.round(state.elapsedMs / 60000),
      avgKmh: Math.round(avg * 10) / 10,
      maxKmh: Math.round(state.maxSpeedKmh),
      route: { ...plain, label: title.trim() || plain.label },
      gpx: recordedGpx(state.points, title || 'MotoRoute'),
    };
  }

  function save(thenShare: boolean) {
    const r = saved ?? build();
    if (!r) return;
    if (!saved) {
      onSave(r);
      setSaved(r);
    }
    if (thenShare) setSharing(true);
  }

  if (tooShort) {
    return (
      <div>
        <h2>Gravació massa curta</h2>
        <p className="hint">No s'han registrat prou punts per desar una ruta (cal moure's almenys 200 m amb senyal GPS).</p>
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={rec.discard}>Torna a començar</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Ruta acabada 🏁</h2>
      <div className="rec-grid" style={{ marginTop: 12 }}>
        <Stat big value={state.distanceKm.toFixed(1)} label="km" />
        <Stat big value={fmtClock(state.movingMs)} label="en moviment" />
        <Stat value={Math.round(avg).toString()} label="km/h mitjana" />
        <Stat value={Math.round(state.maxSpeedKmh).toString()} label="km/h màxima" />
        <Stat value={route ? `${route.elevationGain}` : '…'} label="m desnivell +" />
        <Stat value={liters != null ? liters.toFixed(1) : '—'} label={liters != null ? 'litres aprox.' : 'sense moto'} />
      </div>

      {!route && !error && <Loader text="Calculant desnivell, corbes i dificultat…" />}
      {error && <div className="alert err">{error}</div>}
      {route && (
        <>
          <div style={{ marginTop: 12 }}><ElevationProfile route={route} /></div>
          <div className="hint" style={{ marginTop: 6 }}>
            Índex de corbes {route.curvatureScore} · dificultat estimada <b>{DIFF_LABEL[route.difficulty]}</b>
          </div>
        </>
      )}

      {!saved ? (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Nom de la ruta</label>
            <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Per on has anat?</label>
            <div className="seg">
              <button className={mode === 'road' ? 'on' : ''} onClick={() => setMode('road')}>Carretera</button>
              <button className={mode === 'trail' ? 'on' : ''} onClick={() => setMode('trail')}>Trail / Off-road</button>
            </div>
          </div>
          <div className="actions">
            <button className="btn" disabled={!route} onClick={() => save(false)}>Desa</button>
            {socialEnabled && <button className="btn primary" disabled={!route} onClick={() => save(true)}>Desa i comparteix</button>}
          </div>
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={rec.discard}>Descarta</button>
        </>
      ) : (
        <>
          <div className="alert info" style={{ marginTop: 14 }}>Desada a «Les meves rutes → Gravades».</div>
          <div className="actions">
            <button className="btn" onClick={() => downloadText(`${saved.title.replace(/[^\w-]+/g, '_')}.gpx`, saved.gpx)}>Exporta GPX</button>
            {socialEnabled && <button className="btn" onClick={() => setSharing(true)}>Comparteix</button>}
          </div>
          <div className="actions">
            <button className="btn" onClick={goToMyRoutes}>Les meves rutes</button>
            <button className="btn primary" onClick={rec.discard}>Nova gravació</button>
          </div>
        </>
      )}

      {sharing && route && saved && (
        <ShareDialog
          route={route}
          me={me}
          setMe={setMe}
          defaultTitle={saved.title}
          defaultMode={mode}
          defaultDate={saved.recordedAt.slice(0, 10)}
          startName={startName}
          onClose={() => setSharing(false)}
          onPublished={() => onMarkShared(saved.id)}
        />
      )}
    </div>
  );
}
