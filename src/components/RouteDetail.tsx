import { useState } from 'react';
import ElevationProfile from './ElevationProfile';
import { DIFF_LABEL, fmtDuration } from './RouteCard';
import { weatherIcon } from '../lib/weather';
import type { Accommodation, Motorcycle, PlanRequest, RouteResult } from '../lib/types';
import Icon from './Icon';
import { t, locale } from '../i18n';

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
  onShare?: () => void;
  onNavigate?: () => void;
  saved: boolean;
}

const time = (d: Date) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const day = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
const LEVEL_TXT = [t("Sense alertes"), t("Precaució"), t("Alerta"), t("Perill")];

export default function RouteDetail(p: Props) {
  const { route, req, bike, status } = p;
  const [tab, setTab] = useState<'summary' | 'weather' | 'fuel' | 'stages'>('summary');
  const [kind, setKind] = useState('');
  const [minStars, setMinStars] = useState(0);
  const multiDay = (route.stages?.length ?? 1) > 1;

  return (
    <div>
      <button className="btn small ghost" onClick={p.onBack}><Icon name="chevron-left" size={16} /> {t("Alternatives")}</button>
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
          ['summary', t("Resum")],
          ['weather', t("Meteo")],
          ['fuel', t("Benzina")],
          ['stages', multiDay ? t("Etapes i allotjament") : t("Allotjament")],
        ] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          {p.onNavigate && (
            <button className="btn primary nav-go" onClick={p.onNavigate}><Icon name="play" size={18} /> {t("Navega aquesta ruta")}</button>
          )}
          <div className="stats" style={{ marginBottom: 12 }}>
            <div className="stat"><b>{Math.round(route.distanceKm)} {t("km")}</b><span>{fmtDuration(route.durationMin)} {t("amb parades")}</span></div>
            <div className="stat"><b>{route.curvatureScore}</b><span>{t("índex de corbes")}</span></div>
            <div className="stat"><b>{route.elevationGain} m</b><span>{t("desnivell +")}</span></div>
          </div>
          <ElevationProfile route={route} />
          <div className="box" style={{ marginTop: 12 }}>
            <div className="label">{t("Dificultat per trams de 5 km")}</div>
            <div className="diffbar">
              {route.segments.map((s, i) => (
                <div key={i} style={{ flex: s.kmEnd - s.kmStart, background: { beginner: 'var(--good)', intermediate: 'var(--warn)', expert: 'var(--bad)' }[s.difficulty] }} />
              ))}
            </div>
            <div className="kv" style={{ marginTop: 8 }}>
              {(['beginner', 'intermediate', 'expert'] as const).map((d) => (
                <FragmentKV key={d} k={DIFF_LABEL[d]} v={`${Math.round(route.segments.filter((s) => s.difficulty === d).reduce((a, s) => a + s.kmEnd - s.kmStart, 0))} km`} />
              ))}
              <FragmentKV k={t("Sense asfaltar")} v={`${route.unpavedKm.toFixed(1)} km`} />
              <FragmentKV k={t("Autopista / autovia")} v={`${route.motorwayKm.toFixed(1)} km`} />
              <FragmentKV k={t("Altitud màxima")} v={`${route.maxAltitude} m`} />
            </div>
          </div>
          <div className="actions">
            {p.onGpx && <button className="btn" onClick={p.onGpx}>{t("Exporta GPX")}</button>}
            <button className="btn primary" onClick={p.onSave} disabled={p.saved}>{p.saved ? <><Icon name="check" /> {t("Desada")}</> : <><Icon name="bookmark" /> {t("Desa la ruta")}</>}</button>
          </div>
          {p.onShare && (
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={p.onShare}><Icon name="social" /> {t("Comparteix a la comunitat")}</button>
          )}
        </>
      )}

      {tab === 'weather' && (
        <>
          {status.weather === 'loading' && <Loader text={t("Consultant la previsió a l'hora de pas…")} />}
          {status.weather && status.weather !== 'loading' && <div className="alert err">{status.weather}</div>}
          {route.bestDepartures && (
            <div className="box">
              <div className="label">{t("Millors hores de sortida")}</div>
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
              <span className="km">{t("km")}{' '}{Math.round(w.km)}</span>
              <div className="main">
                <div><b>{multiDay ? `${day(w.eta)} ` : ''}{time(w.eta)}</b> · {Math.round(w.altitude)} m</div>
                {Number.isFinite(w.tempC) ? (
                  <div className="muted">
                    <Icon name={weatherIcon(w.weatherCode)} size={16} className="inline-ico" /> {Math.round(w.tempC)} {t("°C · pluja")}{' '}{w.precipProb ?? 0} {t("% · ratxes")}{' '}{Math.round(w.gustKmh)} {t("km/h")}
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
          {!bike && <div className="alert info">{t("Afegeix La meva moto per calcular on repostar segons el teu dipòsit i consum.")}</div>}
          {status.fuel === 'loading' && <Loader text={t("Descarregant preus del MITECO i calculant parades…")} />}
          {status.fuel && status.fuel !== 'loading' && <div className="alert err">{status.fuel}</div>}
          {route.fuel && bike && (
            <>
              <div className="box">
                <div className="kv">
                  <FragmentKV k={t("Moto")} v={bike.name} />
                  <FragmentKV k={t("Consum efectiu en aquesta ruta")} v={`${route.fuel.consumption} l/100 km`} />
                  <FragmentKV k={t("Autonomia segura")} v={`${route.fuel.safeRangeKm} km`} />
                  <FragmentKV k={t("Combustible necessari")} v={`${route.fuel.liters} l`} />
                  <FragmentKV k={t("Cost estimat")} v={route.fuel.cost != null ? `${route.fuel.cost.toFixed(2)} €` : '—'} />
                </div>
              </div>
              {route.fuel.warnings.map((w, i) => <div key={i} className="alert warn">{w}</div>)}
              <div className="label" style={{ marginTop: 12 }}>
                {route.fuel.stops.length ? t("Parades recomanades") : t("No cal repostar si surts amb el dipòsit indicat")}
              </div>
              {route.fuel.stops.map((s) => (
                <div key={s.id} className="list-item stop">
                  <span className="km">{t("km")}{' '}{Math.round(s.km)}</span>
                  <div className="main">
                    <b>{s.brand}</b> <span className="muted">· {s.town}</span>
                    <div className="hint" style={{ marginTop: 2 }}>{s.reason}</div>
                    <div className="hint">{s.hours}</div>
                  </div>
                  <span className="price">{s.price?.toFixed(3)}</span>
                </div>
              ))}
              <details style={{ marginTop: 14 }}>
                <summary className="muted">{t("Totes les benzineres del recorregut (")}{route.fuel.stations.length})</summary>
                {route.fuel.stations.map((s) => (
                  <div key={s.id} className="list-item">
                    <span className="km">{t("km")}{' '}{Math.round(s.km)}</span>
                    <div className="main"><b>{s.brand}</b> <span className="muted">· {s.town} · a {s.offsetKm.toFixed(1)} {t("km")}</span></div>
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
              <option value="">{t("Tots els tipus")}</option>
              {[t("Hotel"), t("Casa rural / pensió"), t("Alberg"), t("Càmping"), t("Apartament"), t("Motel")].map((k) => <option key={k}>{k}</option>)}
            </select>
            <select className="input" value={minStars} onChange={(e) => setMinStars(+e.target.value)}>
              <option value={0}>{t("Qualsevol categoria")}</option>
              {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s}★ {t("o més")}</option>)}
            </select>
          </div>
          <p className="hint">{t("Allotjaments d'OpenStreetMap a 10 km del final de cada etapa. Els preus i la disponibilitat requereixen un acord amb Booking o Expedia (fase 2), i el criteri biker-friendly, confirmacions d'usuaris.")}</p>
          {(route.stages ?? []).map((s) => {
            const acc = p.accommodations[s.index];
            const list = Array.isArray(acc)
              ? acc.filter((a) => (!kind || a.kind === kind) && (!minStars || (a.stars ?? 0) >= minStars))
              : null;
            return (
              <div key={s.index} className="box">
                <div className="row">
                  <div>
                    <h3>{multiDay ? t("Etapa {0}", [s.index + 1]) : t("Final de ruta")} · {day(s.date)}</h3>
                    <div className="hint">{t("km")}{' '}{Math.round(s.kmStart)}–{Math.round(s.kmEnd)} ({Math.round(s.kmEnd - s.kmStart)} {t("km)")}</div>
                  </div>
                  {(!acc || (typeof acc === 'string' && acc !== 'loading')) && (
                    <button className="btn small" style={{ flex: 'none' }} onClick={() => p.onLoadAccommodation(s.index)}>
                      {acc ? t("Torna-ho a provar") : t("Cerca on dormir")}
                    </button>
                  )}
                </div>
                {acc === 'loading' && <Loader text={t("Cercant allotjaments…")} />}
                {typeof acc === 'string' && acc !== 'loading' && <div className="alert err">{acc}</div>}
                {list && (
                  <>
                    {list.length === 0 && <p className="muted">{t("Cap resultat amb aquests filtres.")}</p>}
                    {list.slice(0, 12).map((a) => (
                      <div key={a.id} className="list-item" onClick={() => p.onShowAccommodation([a])} style={{ cursor: 'pointer' }}>
                        <span className="km">{a.distanceKm} {t("km")}</span>
                        <div className="main">
                          <b>{a.name}</b>
                          <div className="muted">{a.kind}{a.stars ? ` · ${a.stars}★` : ''}</div>
                          {a.website && <a href={a.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{t("Web")}</a>}
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
