import type { RouteResult } from '../lib/types';

import { DIFF_COLORS as DIFF, LEVEL_COLORS as LEVEL, ROUTE_RED } from '../lib/theme';
import { t } from '../i18n';

export default function ElevationProfile({ route }: { route: RouteResult }) {
  const W = 400;
  const H = 150;
  const top = 10;
  const plotH = 96;
  const km = route.profileKm;
  const el = route.elevations;
  if (km.length < 2) return null;
  const maxKm = km.at(-1)!;
  const minE = Math.min(...el);
  const maxE = Math.max(...el, minE + 50);
  const x = (k: number) => (k / maxKm) * W;
  const y = (e: number) => top + plotH - ((e - minE) / (maxE - minE)) * plotH;
  const line = el.map((e, i) => `${i ? 'L' : 'M'}${x(km[i]).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const area = `${line}L${W},${top + plotH}L0,${top + plotH}Z`;
  const scale = route.distanceKm / maxKm; // km del motor vs km geomètrics
  const weather = route.weather ?? [];

  return (
    <div>
      <svg className="profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t("Perfil d'elevació")}>
        <path d={area} fill={route.color} fillOpacity="0.18" />
        <path d={line} fill="none" stroke={route.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {/* franja de dificultat per trams */}
        {route.segments.map((s, i) => (
          <rect key={i} x={x(s.kmStart / scale)} y={top + plotH + 6} width={Math.max(0.5, x((s.kmEnd - s.kmStart) / scale))} height="8" fill={DIFF[s.difficulty]} />
        ))}
        {/* franja meteo a l'hora de pas */}
        {weather.map((w, i) => {
          const next = weather[i + 1]?.km ?? route.distanceKm;
          return <rect key={i} x={x(w.km / scale)} y={top + plotH + 18} width={Math.max(0.5, x((next - w.km) / scale))} height="8" fill={LEVEL[w.level]} />;
        })}
        {(route.fuel?.stops ?? []).map((s, i) => (
          <line key={i} x1={x(s.km / scale)} x2={x(s.km / scale)} y1={top} y2={top + plotH} stroke={ROUTE_RED} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="row muted" style={{ fontSize: 12, justifyContent: 'space-between' }}>
        <span>{Math.round(minE)}–{Math.round(maxE)} m</span>
        <span>{t("Franges: dificultat · meteo")}{route.fuel?.stops.length ? t(" · línies: benzina") : ''}</span>
        <span>{Math.round(route.distanceKm)} {t("km")}</span>
      </div>
    </div>
  );
}
