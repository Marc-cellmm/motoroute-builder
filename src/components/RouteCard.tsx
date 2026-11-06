import type { RouteResult } from '../lib/types';

export const DIFF_LABEL = { beginner: 'Principiant', intermediate: 'Intermedi', expert: 'Avançat' } as const;

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`;
};

export default function RouteCard({ route, selected, onClick, userLevel }: {
  route: RouteResult;
  selected: boolean;
  onClick: () => void;
  userLevel?: string;
}) {
  const worstWeather = route.weather?.reduce((m, w) => Math.max(m, w.level), 0);
  const levels = ['beginner', 'intermediate', 'expert'];
  const harder = userLevel && levels.indexOf(route.difficulty) > levels.indexOf(userLevel);
  const hardKm = route.segments.filter((s) => s.difficulty === 'expert').reduce((a, s) => a + s.kmEnd - s.kmStart, 0);
  return (
    <div className={`route-card ${selected ? 'on' : ''}`} style={{ ['--rc' as string]: route.color }} onClick={onClick}>
      <header>
        <h3><span className="dot" />{route.label}</h3>
        <span className={`badge ${route.difficulty}`}>{DIFF_LABEL[route.difficulty]}</span>
      </header>
      <div className="stats">
        <div className="stat"><b>{Math.round(route.distanceKm)} km</b><span>{fmtDuration(route.durationMin)}</span></div>
        <div className="stat"><b>{route.curvatureScore}</b><span>índex de corbes</span></div>
        <div className="stat"><b>{route.elevationGain} m</b><span>desnivell +</span></div>
      </div>
      <div className="badges">
        {route.unpavedKm > 0.5 && <span className="badge">🟫 {Math.round((route.unpavedKm / route.distanceKm) * 100)} % terra</span>}
        {route.motorwayKm > 0.5 && <span className="badge">🛣️ {Math.round(route.motorwayKm)} km autopista</span>}
        <span className="badge">⛰️ màx. {route.maxAltitude} m</span>
        {worstWeather !== undefined && (
          <span className="badge"><span className={`lvl${worstWeather}`}>●</span> {['Meteo sense alertes', 'Meteo: precaució', 'Meteo: alerta', 'Meteo: perill'][worstWeather]}</span>
        )}
        {route.fuel?.cost != null && <span className="badge">⛽ ~{route.fuel.cost.toFixed(0)} €</span>}
      </div>
      {harder && hardKm > 0 && (
        <div className="alert warn" style={{ marginBottom: 0 }}>Inclou {Math.round(hardKm)} km de nivell Avançat.</div>
      )}
    </div>
  );
}
