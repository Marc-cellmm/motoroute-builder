import { useEffect, useState, type ReactNode } from 'react';
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
import { isNativeApp, openAppSettings } from '../lib/location';
import type { Motorcycle, RecordedRoute, RideMode, RouteResult } from '../lib/types';
import Icon from './Icon';
import { locale, t as tr } from '../i18n';

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
  /** control de seguiment en directe */
  extra?: ReactNode;
}

function Stat({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <div className={`rec-stat ${big ? 'big' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export default function RecordScreen({ rec, bike, me, setMe, onSave, onMarkShared, goToMyRoutes, demo, extra }: Props) {
  const { state, fix, perm, gpsError, wakeLock, elapsedMs } = rec;
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (demo) {
    return (
      <div>
        <h2>{tr("Grava")}</h2>
        <div className="alert info" style={{ marginTop: 12 }}>
          {tr("La gravació amb GPS necessita el permís de localització del telèfon i aquí no està disponible. Prova-ho a la web publicada.")}
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
        <h2>{tr("Grava la ruta")}</h2>
        {state.status !== 'idle' && (
          <span className={`rec-badge ${state.status}`} style={{ flex: 'none' }}>
            {state.status === 'recording' ? <><span className="rec-dot" /> {tr("Gravant")}</> : <><Icon name="pause" size={14} /> {tr("En pausa")}</>}
          </span>
        )}
      </div>

      {state.status === 'idle' && (
        <>
          <p className="hint">{tr("Com Strava: el GPS del telèfon segueix la teva ruta. Quan acabis, la pots desar i compartir a la comunitat.")}</p>
          {perm === 'unsupported' && <div className="alert err">{tr("Aquest navegador no té GPS disponible.")}</div>}
          {perm === 'denied' && isNativeApp && (
            <div className="alert err">
              <b>{tr("Permís de localització denegat.")}</b> {tr("Activa'l a Configuració → MotoRoute → Ubicació →")}{' '}<b>{tr("Sempre")}</b>.
              <button className="btn small" style={{ marginTop: 8 }} onClick={openAppSettings}>{tr("Obre la configuració")}</button>
            </div>
          )}
          {perm === 'denied' && !isNativeApp && (
            <div className="alert err">
              <b>{tr("Permís de localització denegat.")}</b> {tr("Activa'l per a aquest web:")}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li><b>{tr("iPhone:")}</b> {tr("Configuració → Privacitat → Localització → Safari (o el navegador) → «Mentre s'usa l'app». Després recarrega.")}</li>
                <li><b>{tr("Android (Chrome):")}</b> {tr("toca el cadenat a la barra d'adreces → Permisos → Ubicació → Permet.")}</li>
              </ul>
            </div>
          )}
          {(perm === 'prompt' || perm === 'unknown') && !fix && (
            <div className="box">
              <b>{tr("Permís de localització")}</b>
              <p className="hint">
                {isNativeApp
                  ? tr("L'iPhone et preguntarà si permets la ubicació. Tria «Mentre s'usa l'app»; quan comencis a gravar et proposarà «Permet sempre»: accepta-ho per gravar amb la pantalla apagada.")
                  : tr("El telèfon et preguntarà si permets la ubicació. Tria «Permet» (o «Mentre s'usa l'app»).")}
              </p>
              <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={rec.requestPermission}><Icon name="locate" /> {tr("Activa la ubicació")}</button>
            </div>
          )}
          {fix && (
            <div className={`gps-pill ${gpsOk ? 'ok' : ''}`}>
              <span className="gps-dot" />
              {tr("GPS")}{' '}{gpsOk ? tr("a punt") : tr("buscant senyal")} <span className="dim">· ±{Math.round(fix.accuracy)} m</span>
            </div>
          )}
          {gpsError && <div className="alert warn">{gpsError}</div>}
          <button className="rec-start" disabled={perm === 'denied' || perm === 'unsupported'} onClick={rec.start}>
            <Icon name="record" size={26} filled /> {tr("Comença a gravar")}
          </button>
          <div className="box" style={{ marginTop: 14 }}>
            <div className="label">{tr("Abans de sortir")}</div>
            <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {isNativeApp ? (
                <>
                  <li>{tr("Pots apagar la pantalla o guardar el mòbil: l'app continua gravant (veuràs l'indicador blau d'ubicació a dalt).")}</li>
                  <li>{tr("Perquè funcioni amb la pantalla apagada, la ubicació ha d'estar a «Sempre» o «Mentre s'usa l'app» (Configuració → MotoRoute).")}</li>
                </>
              ) : (
                <>
                  <li>{tr("Posa el mòbil al suport amb la pantalla encesa: l'app la manté activa mentre graves.")}</li>
                  <li>{tr("Si bloqueges la pantalla o canvies d'app, el telèfon pot aturar el GPS. En tornar, la gravació continua.")}</li>
                </>
              )}
              <li>{tr("Porta el mòbil carregat o connectat a la moto: el GPS gasta bateria.")}</li>
            </ul>
          </div>
        </>
      )}

      {state.status !== 'idle' && (
        <>
          <div className="rec-grid">
            <Stat big value={state.distanceKm.toFixed(2)} label="km" />
            <Stat big value={fmtClock(elapsedMs)} label="temps" />
            <Stat value={speed != null && state.status === 'recording' ? Math.round(speed).toString() : '—'} label={tr("km/h ara")} />
            <Stat value={avg ? Math.round(avg).toString() : '—'} label={tr("km/h mitjana")} />
            <Stat value={Math.round(state.maxSpeedKmh).toString()} label={tr("km/h màxima")} />
            <Stat value={fix?.alt != null ? `${Math.round(fix.alt)}` : '—'} label={tr("m altitud")} />
          </div>
          <div className="hint" style={{ margin: '8px 0' }}>
            {state.status === 'recording' && (
              <>
                <span className={gpsOk ? 'go-text' : ''}>{gpsOk ? tr("GPS ±{0} m", [Math.round(fix!.accuracy)]) : tr("Buscant senyal GPS…")}</span>
                {' · '}
                {isNativeApp
                  ? tr("pots apagar la pantalla")
                  : wakeLock === 'on' ? tr("pantalla mantinguda encesa") : wakeLock === 'unsupported' ? tr("mantén la pantalla encesa manualment") : tr("pantalla: toca-la si s'enfosqueix")}
              </>
            )}
            {state.status === 'paused' && tr("Gravació en pausa. El GPS està aturat.")}
          </div>
          {gpsError && state.status === 'recording' && <div className="alert warn">{gpsError}</div>}
          {extra}

          {!confirmStop ? (
            <div className="actions">
              {state.status === 'recording'
                ? <button className="btn" onClick={rec.pause}><Icon name="pause" size={16} /> {tr("Pausa")}</button>
                : <button className="btn" onClick={rec.resume}><Icon name="play" size={16} /> {tr("Continua")}</button>}
              <button className="btn primary" onClick={() => setConfirmStop(true)}><Icon name="stop" size={16} /> {tr("Acaba")}</button>
            </div>
          ) : (
            <div className="box" style={{ marginTop: 14 }}>
              <b>{tr("Vols acabar la gravació?")}</b>
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setConfirmStop(false)}>{tr("Encara no")}</button>
                <button className="btn primary" onClick={() => { setConfirmStop(false); rec.finish(); }}>{tr("Sí, acaba")}</button>
              </div>
            </div>
          )}
          {state.status === 'paused' && (
            !confirmDiscard
              ? <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setConfirmDiscard(true)}>{tr("Descarta la gravació")}</button>
              : (
                <div className="alert warn">
                  {tr("Segur? Es perdrà el traçat.")}{' '}
                  <button className="btn small" onClick={() => { setConfirmDiscard(false); rec.discard(); }}>{tr("Sí, descarta")}</button>{' '}
                  <button className="btn small ghost" onClick={() => setConfirmDiscard(false)}>{tr("No")}</button>
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
  const dateLabel = new Date(state.startedAt ?? Date.now()).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

  useEffect(() => {
    if (tooShort) return;
    let cancelled = false;
    (async () => {
      try {
        const name = await reverseGeocode(coords[0]);
        if (cancelled) return;
        setStartName(name);
        setTitle((t) => t || tr("Ruta per {0} · {1}", [name.split(',')[0], dateLabel]));
      } catch {
        setTitle((t) => t || tr("Ruta del {0}", [dateLabel]));
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
      title: title.trim() || tr("Ruta del {0}", [dateLabel]),
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
        <h2>{tr("Gravació massa curta")}</h2>
        <p className="hint">{tr("No s'han registrat prou punts per desar una ruta (cal moure's almenys 200 m amb senyal GPS).")}</p>
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={rec.discard}>{tr("Torna a començar")}</button>
      </div>
    );
  }

  return (
    <div>
      <h2>{tr("Ruta acabada")}</h2>
      <div className="rec-grid" style={{ marginTop: 12 }}>
        <Stat big value={state.distanceKm.toFixed(1)} label="km" />
        <Stat big value={fmtClock(state.movingMs)} label={tr("en moviment")} />
        <Stat value={Math.round(avg).toString()} label={tr("km/h mitjana")} />
        <Stat value={Math.round(state.maxSpeedKmh).toString()} label={tr("km/h màxima")} />
        <Stat value={route ? `${route.elevationGain}` : '…'} label={tr("m desnivell +")} />
        <Stat value={liters != null ? liters.toFixed(1) : '—'} label={liters != null ? tr("litres aprox.") : tr("sense moto")} />
      </div>

      {!route && !error && <Loader text={tr("Calculant desnivell, corbes i dificultat…")} />}
      {error && <div className="alert err">{error}</div>}
      {route && (
        <>
          <div style={{ marginTop: 12 }}><ElevationProfile route={route} /></div>
          <div className="hint" style={{ marginTop: 6 }}>
            {tr("Índex de corbes")}{' '}{route.curvatureScore} {tr("· dificultat estimada")}{' '}<b>{DIFF_LABEL[route.difficulty]}</b>
          </div>
        </>
      )}

      {!saved ? (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <label>{tr("Nom de la ruta")}</label>
            <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>{tr("Per on has anat?")}</label>
            <div className="seg">
              <button className={mode === 'road' ? 'on' : ''} onClick={() => setMode('road')}>{tr("Carretera")}</button>
              <button className={mode === 'trail' ? 'on' : ''} onClick={() => setMode('trail')}>{tr("Trail / Off-road")}</button>
            </div>
          </div>
          <div className="actions">
            <button className="btn" disabled={!route} onClick={() => save(false)}>{tr("Desa")}</button>
            {socialEnabled && <button className="btn primary" disabled={!route} onClick={() => save(true)}>{tr("Desa i comparteix")}</button>}
          </div>
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={rec.discard}>{tr("Descarta")}</button>
        </>
      ) : (
        <>
          <div className="alert ok" style={{ marginTop: 14 }}><Icon name="check" size={16} className="inline-ico" /> {tr("Desada a «Les meves rutes → Gravades».")}</div>
          <div className="actions">
            <button className="btn" onClick={() => downloadText(`${saved.title.replace(/[^\w-]+/g, '_')}.gpx`, saved.gpx)}>{tr("Exporta GPX")}</button>
            {socialEnabled && <button className="btn" onClick={() => setSharing(true)}>{tr("Comparteix")}</button>}
          </div>
          <div className="actions">
            <button className="btn" onClick={goToMyRoutes}>{tr("Les meves rutes")}</button>
            <button className="btn primary" onClick={rec.discard}>{tr("Nova gravació")}</button>
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
