import { useState } from 'react';
import ElevationProfile from './ElevationProfile';
import { DIFF_LABEL, fmtDuration } from './RouteCard';
import { weatherIcon } from '../lib/weather';
import type { Accommodation, Motorcycle, PlanRequest, RouteResult } from '../lib/types';

interface Props {
  route: RouteResult;
  req: PlanRequest;
  bike: Motorcycle | null;
  status: { weather: string | null; fuel: string | null };
  accommodations: Record<number, Accommodation[] | 'loading' | string>;
  onLoadAccommodation: (stage: number) => void;
  onShowAccommodation: (list: Accommodation[]) => void;
  onBack: () => void;
  onSave: () => void;
  onGpx?: () => void;
  saved: boolean;
}

const time = (d: Date) => d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
const day = (d: Date) => d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const LEVEL_TXT = ['Sense alertes', 'Precaució', 'Alerta', 'Perill'];

export default function RouteDetail(p: Props) {
  const { route, req, bike, status } = p;
  const [tab, setTab] = useState<'summary' | 'weather' | 'fuel' | 'stages'>('summary');
  const [kind, setKind] = useState('');
  const [minStars, setMinStars] = useState(0);
  const multiDay = (route.stages?.length ?? 1) > 1;

  return (
    <div>
      <button className="btn small ghost" onClick={p.onBack}>‹ Alternatives</button>
      <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ color: route.color }}>{route.label}</h2>
          <div className="hint">
            {req.origin?.name.split(',')[0]} → {req.circular ? 'circular' : req.destination?.name.split(',')[0]}
          </div>
        </div>
        <span className={`badge ${route.difficulty}`} style={{ flex: 'none' }}>{DIFF_LABEL[route.difficulty]}</span>
      </div>

      <div className="subtabs">
        {([
          ['summary', 'Resum'],
          ['weather', 'Meteo'],
          ['fuel', 'Benzina'],
          ['stages', multiDay ? 'Etapes i allotjament' : 'Allotjament'],
        ] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div className="stats" style={{ marginBottom: 12 }}>
            <div className="stat"><b>{Math.round(route.distanceKm)} km</b><span>{fmtDuration(route.durationMin)} amb parades</span></div>
            <div className="stat"><b>{route.curvatureScore}</b><span>índex de corbes</span></div>
            <div className="stat"><b>{route.elevationGain} m</b><span>desnivell +</span></div>
          </div>
          <ElevationProfile route={route} />
          <div className="box" style={{ marginTop: 12 }}>
            <div className="label">Dificultat per trams de 5 km</div>
            <div className="diffbar">
              {route.segments.map((s, i) => (
                <div key={i} style={{ flex: s.kmEnd - s.kmStart, background: { beginner: 'var(--good)', intermediate: 'var(--warn)', expert: 'var(--bad)' }[s.difficulty] }} />
              ))}
            </div>
            <div className="kv" style={{ marginTop: 8 }}>
              {(['beginner', 'intermediate', 'expert'] as const).map((d) => (
                <FragmentKV key={d} k={DIFF_LABEL[d]} v={`${Math.round(route.segments.filter((s) => s.difficulty === d).reduce((a, s) => a + s.kmEnd - s.kmStart, 0))} km`} />
              ))}
              <FragmentKV k="Sense asfaltar" v={`${route.unpavedKm.toFixed(1)} km`} />
              <FragmentKV k="Autopista / autovia" v={`${route.motorwayKm.toFixed(1)} km`} />
              <FragmentKV k="Altitud màxima" v={`${route.maxAltitude} m`} />
            </div>
          </div>
          <div className="actions">
            {p.onGpx && <button className="btn" onClick={p.onGpx}>Exporta GPX</button>}
            <button className="btn primary" onClick={p.onSave} disabled={p.saved}>{p.saved ? 'Desada ✓' : 'Desa la ruta'}</button>
          </div>
        </>
      )}

      {tab === 'weather' && (
        <>
          {status.weather === 'loading' && <Loader text="Consultant la previsió a l'hora de pas…" />}
          {status.weather && status.weather !== 'loading' && <div className="alert err">{status.weather}</div>}
          {route.bestDepartures && (
            <div className="box">
              <div className="label">Millors hores de sortida</div>
              {route.bestDepartures.map((b, i) => (
                <div key={i} className="row" style={{ padding: '6px 0' }}>
                  <b style={{ flex: 'none', fontFamily: 'var(--display)', fontSize: 20 }}>{time(b.time)}</b>
                  <span className="muted">{b.note}</span>
                </div>
              ))}
            </div>
          )}
          {route.weather?.map((w, i) => (
            <div key={i} className="list-item">
              <span className="km">km {Math.round(w.km)}</span>
              <div className="main">
                <div><b>{multiDay ? `${day(w.eta)} ` : ''}{time(w.eta)}</b> · {Math.round(w.altitude)} m</div>
                {Number.isFinite(w.tempC) ? (
                  <div className="muted">
                    {weatherIcon(w.weatherCode)} {Math.round(w.tempC)} °C · pluja {w.precipProb ?? 0} % · ratxes {Math.round(w.gustKmh)} km/h
                  </div>
                ) : <div className="muted">{w.reasons[0]}</div>}
                {w.level > 0 && <div className={`lvl${w.level}`}>{LEVEL_TXT[w.level]}: {w.reasons.join(' · ')}</div>}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'fuel' && (
        <>
          {!bike && <div className="alert info">Afegeix La meva moto per calcular on repostar segons el teu dipòsit i consum.</div>}
          {status.fuel === 'loading' && <Loader text="Descarregant preus del MITECO i calculant parades…" />}
          {status.fuel && status.fuel !== 'loading' && <div className="alert err">{status.fuel}</div>}
          {route.fuel && bike && (
            <>
              <div className="box">
                <div className="kv">
                  <FragmentKV k="Moto" v={bike.name} />
                  <FragmentKV k="Consum efectiu en aquesta ruta" v={`${route.fuel.consumption} l/100 km`} />
                  <FragmentKV k="Autonomia segura" v={`${route.fuel.safeRangeKm} km`} />
                  <FragmentKV k="Combustible necessari" v={`${route.fuel.liters} l`} />
                  <FragmentKV k="Cost estimat" v={route.fuel.cost != null ? `${route.fuel.cost.toFixed(2)} €` : '—'} />
                </div>
              </div>
              {route.fuel.warnings.map((w, i) => <div key={i} className="alert warn">{w}</div>)}
              <div className="label" style={{ marginTop: 12 }}>
                {route.fuel.stops.length ? 'Parades recomanades' : 'No cal repostar si surts amb el dipòsit indicat'}
              </div>
              {route.fuel.stops.map((s) => (
                <div key={s.id} className="list-item stop">
                  <span className="km">km {Math.round(s.km)}</span>
                  <div className="main">
                    <b>{s.brand}</b> <span className="muted">· {s.town}</span>
                    <div className="hint" style={{ marginTop: 2 }}>{s.reason}</div>
                    <div className="hint">{s.hours}</div>
                  </div>
                  <span className="price">{s.price?.toFixed(3)}</span>
                </div>
              ))}
              <details style={{ marginTop: 14 }}>
                <summary className="muted">Totes les benzineres del recorregut ({route.fuel.stations.length})</summary>
                {route.fuel.stations.map((s) => (
                  <div key={s.id} className="list-item">
                    <span className="km">km {Math.round(s.km)}</span>
                    <div className="main"><b>{s.brand}</b> <span className="muted">· {s.town} · a {s.offsetKm.toFixed(1)} km</span></div>
                    <span className="price">{s.price?.toFixed(3)}</span>
                  </div>
                ))}
              </details>
            </>
          )}
        </>
      )}

      {tab === 'stages' && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Tots els tipus</option>
              {['Hotel', 'Casa rural / pensió', 'Alberg', 'Càmping', 'Apartament', 'Motel'].map((k) => <option key={k}>{k}</option>)}
            </select>
            <select className="input" value={minStars} onChange={(e) => setMinStars(+e.target.value)}>
              <option value={0}>Qualsevol categoria</option>
              {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{'★'.repeat(s)} o més</option>)}
            </select>
          </div>
          <p className="hint">Allotjaments d'OpenStreetMap a 10 km del final de cada etapa. Els preus i la disponibilitat
            requereixen un acord amb Booking o Expedia (fase 2), i el criteri biker-friendly, confirmacions d'usuaris.</p>
          {(route.stages ?? []).map((s) => {
            const acc = p.accommodations[s.index];
            const list = Array.isArray(acc)
              ? acc.filter((a) => (!kind || a.kind === kind) && (!minStars || (a.stars ?? 0) >= minStars))
              : null;
            return (
              <div key={s.index} className="box">
                <div className="row">
                  <div>
                    <h3>{multiDay ? `Etapa ${s.index + 1}` : 'Final de ruta'} · {day(s.date)}</h3>
                    <div className="hint">km {Math.round(s.kmStart)}–{Math.round(s.kmEnd)} ({Math.round(s.kmEnd - s.kmStart)} km)</div>
                  </div>
                  {!acc && <button className="btn small" style={{ flex: 'none' }} onClick={() => p.onLoadAccommodation(s.index)}>Cerca on dormir</button>}
                </div>
                {acc === 'loading' && <Loader text="Cercant allotjaments…" />}
                {typeof acc === 'string' && acc !== 'loading' && <div className="alert err">{acc}</div>}
                {list && (
                  <>
                    {list.length === 0 && <p className="muted">Cap resultat amb aquests filtres.</p>}
                    {list.slice(0, 12).map((a) => (
                      <div key={a.id} className="list-item" onClick={() => p.onShowAccommodation([a])} style={{ cursor: 'pointer' }}>
                        <span className="km">{a.distanceKm} km</span>
                        <div className="main">
                          <b>{a.name}</b>
                          <div className="muted">{a.kind}{a.stars ? ` · ${'★'.repeat(a.stars)}` : ''}</div>
                          {a.website && <a href={a.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Web</a>}
                          {a.phone && <span className="muted"> · {a.phone}</span>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function FragmentKV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span>{k}</span>
      <b>{v}</b>
    </>
  );
}

export function Loader({ text }: { text: string }) {
  return <div className="loader"><span className="spin" />{text}</div>;
}
