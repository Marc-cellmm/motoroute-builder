import ElevationProfile from '../ElevationProfile';
import { DIFF_LABEL, fmtDuration } from '../RouteCard';
import { toRouteResult, type SharedRoute } from '../../lib/social';
import Icon from '../Icon';
import Avatar from '../Avatar';

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
        <Icon name="heart" filled={reactions.liked} size={18} /> <span>{route.likes}</span>
      </button>
      <button className={`react ${reactions.saved ? 'on save' : ''}`} onClick={onSave} aria-pressed={reactions.saved}>
        <Icon name="bookmark" filled={reactions.saved} size={18} /> <span>{reactions.saved ? 'Guardada' : 'Guarda-la'}</span>
      </button>
    </div>
  );
}

export default function SharedRouteCard(p: CardProps) {
  const r = p.route;
  return (
    <div className={`route-card ${p.selected ? 'on' : ''}`} style={{ ['--rc' as string]: 'var(--accent)' }} onClick={p.onOpen}>
      <div className="author-row">
        <Avatar url={r.author_avatar} name={r.username} size={30} />
        <div className="author-row-text">
          <b>@{r.username}</b>
          <span>{ago(r.created_at)}{r.start_name ? ` · ${r.start_name.split(',')[0]}` : ''}</span>
        </div>
      </div>
      <header>
        <div style={{ minWidth: 0 }}>
          <h3 className="truncate">{r.title}</h3>
        </div>
        <span className={`badge ${r.difficulty}`} style={{ flex: 'none' }}>{DIFF_LABEL[r.difficulty]}</span>
      </header>
      <div className="stats">
        <div className="stat"><b>{Math.round(r.distance_km)} km</b><span>{r.duration_min ? fmtDuration(r.duration_min) : '—'}</span></div>
        <div className="stat"><b>{r.curvature_score ?? '—'}</b><span>índex de corbes</span></div>
        <div className="stat"><b>{r.elevation_gain ?? '—'} m</b><span>desnivell +</span></div>
      </div>
      <div className="badges">
        <span className="badge">{r.mode === 'trail' ? <><Icon name="mountain" size={14} />Trail</> : <><Icon name="road" size={14} />Carretera</>}</span>
        {Number(r.unpaved_km) > 0.5 && <span className="badge"><Icon name="dirt" size={14} />{Math.round((r.unpaved_km / r.distance_km) * 100)} % terra</span>}
        {r.saves > 0 && <span className="badge"><Icon name="bookmark" size={14} />{r.saves}</span>}
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
      <button className="btn small ghost" onClick={p.onBack}><Icon name="chevron-left" size={16} /> Tornar</button>
      <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2>{r.title}</h2>
          <div className="hint">
            <Avatar url={r.author_avatar} name={r.username} size={22} /> @{r.username}{r.ridden_on ? ` · feta el ${new Date(r.ridden_on).toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </div>
          {(r.author_bike || r.author_area) && (
            <div className="author-meta">{r.author_bike && <span><Icon name="bike" size={14} />{r.author_bike}</span>}{r.author_area && <span><Icon name="pin" size={14} />{r.author_area}</span>}</div>
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
