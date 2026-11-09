import ElevationProfile from '../ElevationProfile';
import { DIFF_LABEL, fmtDuration } from '../RouteCard';
import { toRouteResult, type SharedRoute } from '../../lib/social';

export interface Reactions {
  liked: boolean;
  saved: boolean;
}

interface CardProps {
  route: SharedRoute;
  reactions: Reactions;
  onOpen: () => void;
  onLike: () => void;
  onSave: () => void;
  selected?: boolean;
}

const ago = (iso: string) => {
  const d = (Date.now() - Date.parse(iso)) / 86400000;
  if (d < 1) return 'avui';
  if (d < 2) return 'ahir';
  if (d < 30) return `fa ${Math.floor(d)} dies`;
  return new Date(iso).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function ReactionBar({ route, reactions, onLike, onSave }: Omit<CardProps, 'onOpen'>) {
  return (
    <div className="reactions" onClick={(e) => e.stopPropagation()}>
      <button className={`react ${reactions.liked ? 'on like' : ''}`} onClick={onLike} aria-pressed={reactions.liked}>
        {reactions.liked ? '❤️' : '🤍'} <span>{route.likes}</span>
      </button>
      <button className={`react ${reactions.saved ? 'on save' : ''}`} onClick={onSave} aria-pressed={reactions.saved}>
        🔖 <span>{reactions.saved ? 'Guardada' : 'Guarda-la'}</span>
      </button>
    </div>
  );
}

export default function SharedRouteCard(p: CardProps) {
  const r = p.route;
  return (
    <div className={`route-card ${p.selected ? 'on' : ''}`} style={{ ['--rc' as string]: '#ff6b2c' }} onClick={p.onOpen}>
      <header>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</h3>
          <div className="hint">@{r.username} · {ago(r.created_at)}{r.start_name ? ` · ${r.start_name.split(',')[0]}` : ''}</div>
        </div>
        <span className={`badge ${r.difficulty}`} style={{ flex: 'none' }}>{DIFF_LABEL[r.difficulty]}</span>
      </header>
      <div className="stats">
        <div className="stat"><b>{Math.round(r.distance_km)} km</b><span>{r.duration_min ? fmtDuration(r.duration_min) : '—'}</span></div>
        <div className="stat"><b>{r.curvature_score ?? '—'}</b><span>índex de corbes</span></div>
        <div className="stat"><b>{r.elevation_gain ?? '—'} m</b><span>desnivell +</span></div>
      </div>
      <div className="badges">
        <span className="badge">{r.mode === 'trail' ? '⛰️ Trail' : '🛣️ Carretera'}</span>
        {Number(r.unpaved_km) > 0.5 && <span className="badge">🟫 {Math.round((r.unpaved_km / r.distance_km) * 100)} % terra</span>}
        {r.saves > 0 && <span className="badge">🔖 {r.saves}</span>}
      </div>
      <ReactionBar route={r} reactions={p.reactions} onLike={p.onLike} onSave={p.onSave} />
    </div>
  );
}

export function SharedRouteDetail(p: CardProps & { onBack: () => void; onPlan: () => void; isMine: boolean; onDelete: () => void }) {
  const r = p.route;
  const rr = toRouteResult(r);
  return (
    <div>
      <button className="btn small ghost" onClick={p.onBack}>‹ Tornar</button>
      <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2>{r.title}</h2>
          <div className="hint">
            @{r.username}{r.ridden_on ? ` · feta el ${new Date(r.ridden_on).toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </div>
          {(r.author_bike || r.author_area) && (
            <div className="author-meta">{[r.author_bike && `🏍️ ${r.author_bike}`, r.author_area && `📍 ${r.author_area}`].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <span className={`badge ${r.difficulty}`} style={{ flex: 'none' }}>{DIFF_LABEL[r.difficulty]}</span>
      </div>
      <div className="stats" style={{ margin: '14px 0' }}>
        <div className="stat"><b>{Math.round(r.distance_km)} km</b><span>{r.duration_min ? fmtDuration(r.duration_min) : '—'}</span></div>
        <div className="stat"><b>{r.curvature_score ?? '—'}</b><span>índex de corbes</span></div>
        <div className="stat"><b>{r.elevation_gain ?? '—'} m</b><span>desnivell +</span></div>
      </div>
      {r.description && <p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>}
      {r.elevations?.length ? <ElevationProfile route={rr} /> : null}
      <div className="kv" style={{ marginTop: 10 }}>
        <span>Sortida</span><b>{r.start_name ?? '—'}</b>
        <span>Modalitat</span><b>{r.mode === 'trail' ? 'Trail / Off-road' : 'Carretera'}</b>
        <span>Altitud màxima</span><b>{r.max_altitude ?? '—'} m</b>
        <span>Sense asfaltar</span><b>{Number(r.unpaved_km).toFixed(1)} km</b>
      </div>
      <ReactionBar route={r} reactions={p.reactions} onLike={p.onLike} onSave={p.onSave} />
      <div className="actions">
        <button className="btn primary" onClick={p.onPlan}>Planifica-la: meteo i benzina</button>
      </div>
      {p.isMine && (
        <button className="btn small ghost" style={{ marginTop: 10 }} onClick={p.onDelete}>Elimina la meva publicació</button>
      )}
    </div>
  );
}
