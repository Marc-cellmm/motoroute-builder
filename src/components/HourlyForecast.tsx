import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { WX_UNIT, type WxVar } from '../lib/weatherMap';
import type { LngLat } from '../lib/types';
import { cached, fetchRetry } from '../lib/net';
import { reverseGeocode } from '../lib/places';
import { t, locale } from '../i18n';

interface Hour {
  ts: number;
  temp: number;
  rainProb: number;
  precip: number;
  cloud: number;
  wind: number;
  gust: number;
  dir: number;
  humidity: number;
  code: number;
  day: boolean;
}

const VARS: { id: WxVar; icon: string; label: string; color: string }[] = [
  { id: 'temp', icon: 'thermometer', label: t("Temperatura"), color: '#f5b52e' },
  { id: 'precip', icon: 'rain', label: t("Pluja"), color: '#4da3ff' },
  { id: 'cloud', icon: 'cloud', label: t("Núvols"), color: '#c9ced9' },
  { id: 'wind', icon: 'wind', label: t("Vent"), color: '#2ee88f' },
  { id: 'humidity', icon: 'drop', label: t("Humitat"), color: '#5ac8c8' },
];

/** Símbol del temps com en una app del temps: de dia, de nit, núvols, pluja, neu, tempesta. */
export function skyIcon(code: number, day: boolean): string {
  if (code <= 1) return day ? 'sun' : 'moon';
  if (code === 2) return day ? 'cloud-sun' : 'cloud';
  if (code === 3) return 'cloud';
  if (code <= 48) return 'fog';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 77 || code === 85 || code === 86) return 'snow';
  return 'storm';
}

const COL = 54; // amplada de cada hora
const CHART_H = 96;

const forecastCache = cached<Hour[]>(15 * 60_000, 20);

/** Previsió per hores d'un punt (memòria cau de 15 min per zona de ~5 km). */
function loadHours(coord: LngLat): Promise<Hour[]> {
  const key = `${coord[0].toFixed(2)},${coord[1].toFixed(2)}`;
  return forecastCache(key, async () => {
    const res = await fetchRetry(
      `https://api.open-meteo.com/v1/forecast?latitude=${coord[1].toFixed(4)}&longitude=${coord[0].toFixed(4)}` +
      '&hourly=temperature_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,weather_code,is_day' +
      '&timeformat=unixtime&timezone=GMT&forecast_days=3&wind_speed_unit=kmh',
      { timeoutMs: 12000, retries: 3 },
    );
    if (!res.ok) throw new Error('weather');
    const h = (await res.json()).hourly as Record<string, number[]>;
    const now = Date.now() / 1000;
    let start = h.time.findIndex((ts) => ts + 3600 > now);
    if (start < 0) start = 0;
    const hours: Hour[] = [];
    for (let i = start; i < Math.min(h.time.length, start + 48); i++) {
      hours.push({
        ts: h.time[i], temp: h.temperature_2m[i], rainProb: h.precipitation_probability?.[i] ?? 0, precip: h.precipitation[i] ?? 0,
        cloud: h.cloud_cover[i] ?? 0, wind: h.wind_speed_10m[i] ?? 0, gust: h.wind_gusts_10m?.[i] ?? 0, dir: h.wind_direction_10m[i] ?? 0,
        humidity: h.relative_humidity_2m[i] ?? 0, code: h.weather_code[i] ?? 0, day: (h.is_day?.[i] ?? 1) === 1,
      });
    }
    return hours;
  });
}

const valueOf = (h: Hour, v: WxVar) => (v === 'temp' ? h.temp : v === 'precip' ? h.precip : v === 'cloud' ? h.cloud : v === 'wind' ? h.wind : h.humidity);
const fmt = (x: number, v: WxVar) => (v === 'precip' ? (x < 0.05 ? '0' : x.toFixed(1)) : String(Math.round(x)));

/** Previsió hora a hora d'un punt: símbols, valors i gràfica, com una app del temps. */
export default function HourlyForecast({ coord, initial, onClose }: { coord: LngLat; initial?: WxVar; onClose: () => void }) {
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [v, setV] = useState<WxVar>(initial ?? 'temp');
  const scroller = useRef<HTMLDivElement>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    // La previsió es mostra tan bon punt arriba; el nom del lloc va a part i no la fa esperar.
    loadHours(coord).then((h) => { if (alive) setHours(h); }).catch(() => { if (alive) setError(true); });
    reverseGeocode(coord, '').then((n) => { if (alive && n) setPlace(n.split(',')[0]); });
    return () => { alive = false; };
  }, [coord, attempt]);

  const meta = VARS.find((x) => x.id === v)!;
  const chart = useMemo(() => {
    if (!hours?.length) return null;
    const vals = hours.map((h) => valueOf(h, v));
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (v === 'precip') { min = 0; max = Math.max(1, max); }
    else if (v === 'cloud' || v === 'humidity') { min = 0; max = 100; }
    else if (v === 'wind') { min = 0; max = Math.max(20, max); }
    else { min -= 1; max += 1; }
    const y = (x: number) => 20 + (1 - (x - min) / (max - min || 1)) * (CHART_H - 28);
    const pts = vals.map((x, i) => [i * COL + COL / 2, y(x)] as const);
    return { vals, pts, base: CHART_H - 8 };
  }, [hours, v]);

  const now = hours?.[0];
  const dayLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wxf" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Previsió per hores")}>
        <div className="page-head" style={{ marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2>{t("Previsió per hores")}</h2>
            <p className="hint" style={{ margin: 0 }}>{place ?? t("Centre del mapa")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("Tanca")}><Icon name="x" /></button>
        </div>
        {error && !hours && (
          <div className="alert err">
            {t("No s'ha pogut obtenir la previsió meteorològica")}
            <div style={{ marginTop: 8 }}><button className="btn small" onClick={() => setAttempt((n) => n + 1)}>{t("Torna-ho a provar")}</button></div>
          </div>
        )}
        {!hours && !error && <div className="skeleton" style={{ height: 260 }} aria-busy="true" />}
        {hours && now && chart && (
          <>
            <div className="wxf-now">
              <span className="wxf-sky"><Icon name={skyIcon(now.code, now.day)} size={44} /></span>
              <div className="wxf-temp">{Math.round(now.temp)}°<small>{t("Ara")}</small></div>
              <ul>
                <li><Icon name="rain" size={15} />{now.rainProb} % · {fmt(now.precip, 'precip')} mm</li>
                <li><Icon name="wind" size={15} />{Math.round(now.wind)} km/h <span className="wxf-dir" style={{ transform: `rotate(${(now.dir + 180) % 360}deg)` }}><Icon name="straight" size={13} /></span></li>
                <li><Icon name="cloud" size={15} />{Math.round(now.cloud)} %</li>
                <li><Icon name="drop" size={15} />{Math.round(now.humidity)} %</li>
              </ul>
            </div>
            <div className="wx-vars wxf-vars">
              {VARS.map((x) => (
                <button key={x.id} className={v === x.id ? 'on' : ''} onClick={() => setV(x.id)}>
                  <Icon name={x.icon} size={16} /><span>{x.label}</span>
                </button>
              ))}
            </div>
            <div className="wxf-scroll" ref={scroller} dir="ltr">
              <div style={{ width: hours.length * COL }}>
                <svg width={hours.length * COL} height={CHART_H} role="img" aria-label={`${meta.label} (${WX_UNIT[v]})`}>
                  {hours.map((h, i) => new Date(h.ts * 1000).getHours() === 0 && i > 0 && (
                    <line key={h.ts} x1={i * COL} x2={i * COL} y1={0} y2={CHART_H} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
                  ))}
                  {v === 'precip'
                    ? chart.pts.map(([x, y], i) => chart.vals[i] >= 0.05 && (
                      <rect key={i} x={x - 11} y={y} width={22} height={Math.max(2, chart.base - y)} rx={4} fill={meta.color} opacity={0.85} />
                    ))
                    : (
                      <>
                        <path d={`M${chart.pts[0][0]},${chart.base} ${chart.pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${chart.pts[chart.pts.length - 1][0]},${chart.base} Z`} fill={meta.color} opacity={0.14} />
                        <polyline points={chart.pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={meta.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                        {chart.pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#101012" stroke={meta.color} strokeWidth={2} />)}
                      </>
                    )}
                  {chart.pts.map(([x, y], i) => (
                    <text key={i} x={x} y={Math.max(11, y - 8)} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#f4f4f5">
                      {fmt(chart.vals[i], v)}{v === 'temp' ? '°' : ''}
                    </text>
                  ))}
                </svg>
                <div className="wxf-hours">
                  {hours.map((h, i) => {
                    const d = new Date(h.ts * 1000);
                    return (
                      <div key={h.ts} className={`wxf-hour ${d.getHours() === 0 && i > 0 ? 'newday' : ''}`} style={{ width: COL }}>
                        <b>{i === 0 ? t("Ara") : d.getHours() === 0 ? dayLabel(h.ts) : `${d.getHours().toString().padStart(2, '0')}h`}</b>
                        <span className={`wxf-ico ${skyIcon(h.code, h.day)}`}><Icon name={skyIcon(h.code, h.day)} size={22} /></span>
                        <span>{Math.round(h.temp)}°</span>
                        <small className={h.rainProb >= 30 ? 'wet' : ''}>{h.rainProb} %</small>
                        <span className="wxf-dir" style={{ transform: `rotate(${(h.dir + 180) % 360}deg)` }}><Icon name="straight" size={13} /></span>
                        <small>{Math.round(h.wind)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="hint wxf-key">
              <Icon name="thermometer" size={13} /> °C · <Icon name="rain" size={13} /> % · <Icon name="wind" size={13} /> km/h · {meta.label}: {WX_UNIT[v]}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
