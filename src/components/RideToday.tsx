import { useState } from 'react';
import Icon from './Icon';
import { BAND_RANGE } from '../lib/routing';
import { reverseGeocode } from '../lib/places';
import { rideToday, type RideSpot, type RideToday as Result } from '../lib/rideToday';
import { weatherIcon } from '../lib/weather';
import type { Place, PlanRequest } from '../lib/types';
import { t, locale } from '../i18n';

interface Props {
  req: PlanRequest;
  setReq: (r: PlanRequest) => void;
  onGo: (r: PlanRequest) => void;
  busy: boolean;
  canLocate: boolean;
}

const LEVEL_TXT = [t("Sense alertes"), t("Precaució"), t("Alerta"), t("Perill")];
const wxIcon = (code: number) => {
  const n = weatherIcon(code);
  return n === 'cloud-sun' ? 'cloud' : n === '·' ? 'cloud' : n;
};

function locate(): Promise<Place | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coord: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        resolve({ name: await reverseGeocode(coord), coord });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** «On rodo avui?»: cap on fa millor dia per sortir, amb una ruta circular cap allà. */
export default function RideToday({ req, setReq, onGo, busy, canLocate }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function look() {
    setState('loading');
    setError(null);
    try {
      const from = req.origin ?? (canLocate ? await locate() : null);
      if (!from) {
        setError(t("Tria el punt de sortida."));
        setState('idle');
        return;
      }
      if (!req.origin) setReq({ ...req, origin: from });
      const [min, max] = BAND_RANGE[req.band];
      const radius = Math.max(25, Math.min(120, (min + max) / 2 / 3.5));
      setOrigin(from);
      setResult(await rideToday(from.coord, radius));
      setState('done');
    } catch {
      setError(t("No s'ha pogut obtenir la previsió meteorològica"));
      setState('idle');
    }
  }

  function go(s: RideSpot) {
    if (!origin || !result) return;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const d = result.day;
    const departure = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    onGo({ ...req, origin, circular: true, destination: null, vias: [], days: 1, departure, heading: s.bearing });
  }

  const best = result?.spots[0];
  const allBad = !!best && best.level >= 2;

  return (
    <section className="ride-today">
      <div className="ride-today-head">
        <span className="icon-tile go"><Icon name="sun" size={20} /></span>
        <div>
          <b>{t("On rodo avui?")}</b>
          {state !== 'done' && <p className="hint">{t("Mirem el temps al teu voltant i et diem cap on fa millor dia per sortir.")}</p>}
          {state === 'done' && result && (
            <p className="hint">
              {result.tomorrow ? t("Demà") : t("Avui")} · {result.day.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' })}
              {origin ? ` · ${origin.name.split(',')[0]}` : ''}
            </p>
          )}
        </div>
        {state !== 'loading' && (
          <button className="btn small" style={{ flex: 'none' }} disabled={busy} onClick={look}>
            {state === 'done' ? <Icon name="loop" size={16} /> : t("Mira-ho")}
          </button>
        )}
      </div>
      {state === 'loading' && <div className="skeleton" style={{ height: 96, marginTop: 12 }} aria-busy="true" />}
      {error && <div className="alert err">{error}</div>}
      {state === 'done' && result && best && (
        <>
          {allBad
            ? <div className="alert warn">{t("Fa mal temps a tot arreu. Potser millor un altre dia.")}</div>
            : best.name && <p className="ride-best">{t("El millor temps és cap a {0}.", [best.name])}</p>}
          <ul className="ride-spots">
            {result.spots.map((s) => (
              <li key={s.bearing}>
                <span className="ride-arrow" style={{ transform: `rotate(${s.bearing}deg)` }}><Icon name="straight" size={18} /></span>
                <div className="ride-info">
                  <b><Icon name={wxIcon(s.code)} size={16} /> <span>{s.name ?? t("a {0} km", [s.km])}</span></b>
                  <small>
                    {t("{0}–{1} °C · pluja {2} % · ratxes {3} km/h", [s.tMin, s.tMax, s.rain, s.gust])}{s.name ? ` · ${s.km} km` : ''}
                  </small>
                  <small className={`lvl${s.level}`}>{LEVEL_TXT[s.level]}</small>
                </div>
                <button className={`btn small ${s === best && !allBad ? 'primary' : ''}`} style={{ flex: 'none' }} disabled={busy} onClick={() => go(s)}>
                  {t("Ruta cap aquí")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
