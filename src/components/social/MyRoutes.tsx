import { useEffect, useState } from 'react';
import JoinForm from './JoinForm';
import SharedRouteCard, { SharedRouteDetail } from './SharedRouteCard';
import { useSocialList } from './useSocialList';
import { Loader } from '../RouteDetail';
import { fmtDuration } from '../RouteCard';
import { deleteRoute, fetchMine, fetchSaved, socialEnabled, type Me, type SharedRoute } from '../../lib/social';
import { downloadText } from '../../lib/gpx';
import { fmtClock } from '../../lib/recorder';
import type { RecordedRoute, SavedRoute } from '../../lib/types';
import Icon from '../Icon';

type Section = 'recorded' | 'planned' | 'saved' | 'mine';

interface Props {
  me: Me | null;
  setMe: (m: Me) => void;
  planned: SavedRoute[];
  onOpenPlanned: (s: SavedRoute) => void;
  onDeletePlanned: (id: string) => void;
  onSharePlanned: (s: SavedRoute) => void;
  onShow: (r: SharedRoute | null) => void;
  onPlan: (r: SharedRoute) => void;
  recorded: RecordedRoute[];
  onShowRecorded: (r: RecordedRoute | null) => void;
  onPlanRecorded: (r: RecordedRoute) => void;
  onShareRecorded: (r: RecordedRoute) => void;
  onDeleteRecorded: (id: string) => void;
}

export default function MyRoutes(p: Props) {
  const [section, setSection] = useState<Section>(p.recorded.length ? 'recorded' : socialEnabled ? 'saved' : 'planned');
  const [shownRec, setShownRec] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<SharedRoute | null>(null);
  const list = useSocialList(() => !!p.me?.username);

  async function refresh() {
    if (section === 'planned' || section === 'recorded' || !p.me?.username) return;
    setLoading(true);
    try {
      await list.load(section === 'saved' ? await fetchSaved() : await fetchMine(p.me.id));
      list.setError(null);
    } catch (e) {
      list.setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void refresh(), [section, p.me?.id, p.me?.username]);

  const openRow = open ? list.rows.find((r) => r.id === open.id) ?? open : null;
  if (openRow) {
    return (
      <SharedRouteDetail
        route={openRow}
        reactions={list.reactions[openRow.id] ?? { liked: false, saved: false }}
        onOpen={() => {}}
        onLike={() => list.react(openRow.id, 'liked')}
        onSave={() => list.react(openRow.id, 'saved')}
        onBack={() => { setOpen(null); p.onShow(null); void refresh(); }}
        onPlan={() => p.onPlan(openRow)}
        isMine={openRow.author_id === p.me?.id}
        onDelete={async () => {
          await deleteRoute(openRow.id);
          setOpen(null);
          p.onShow(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div>
      <h2>Les meves rutes</h2>
      <div className="seg seg-wrap" style={{ margin: '12px 0' }}>
        <button className={section === 'recorded' ? 'on' : ''} onClick={() => setSection('recorded')}>Gravades</button>
        {socialEnabled && <button className={section === 'saved' ? 'on' : ''} onClick={() => setSection('saved')}>Guardades</button>}
        <button className={section === 'planned' ? 'on' : ''} onClick={() => setSection('planned')}>Planificades</button>
        {socialEnabled && <button className={section === 'mine' ? 'on' : ''} onClick={() => setSection('mine')}>Publicades</button>}
      </div>

      {section === 'recorded' && (
        <>
          <p className="hint">Rutes que has gravat amb el GPS del telèfon.</p>
          {!p.recorded.length && <div className="empty"><Icon name="record" size={40} />Encara no has gravat cap ruta. Fes-ho des de l'apartat «Grava».</div>}
          {p.recorded.map((r) => (
            <div key={r.id} className={`box ${shownRec === r.id ? 'box-on' : ''}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h3>{r.title}</h3>
                  <div className="hint">
                    {new Date(r.recordedAt).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                    {r.route.distanceKm.toFixed(1)} km · {fmtClock(r.movingMin * 60000)} · {r.avgKmh} km/h · {r.route.elevationGain} m +
                  </div>
                </div>
                {r.sharedAt && <span className="badge" style={{ flex: 'none' }}><Icon name="social" size={14} />Compartida</span>}
              </div>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                <button className="btn small" onClick={() => { const on = shownRec !== r.id; setShownRec(on ? r.id : null); p.onShowRecorded(on ? r : null); }}>
                  {shownRec === r.id ? 'Amaga' : 'Al mapa'}
                </button>
                <button className="btn small primary" onClick={() => p.onPlanRecorded(r)}>Planifica</button>
                {socialEnabled && !r.sharedAt && <button className="btn small" onClick={() => p.onShareRecorded(r)}>Comparteix</button>}
                <button className="btn small" onClick={() => downloadText(`${r.title.replace(/[^\w-]+/g, '_')}.gpx`, r.gpx)}>GPX</button>
                <button className="btn small ghost" onClick={() => p.onDeleteRecorded(r.id)}>Elimina</button>
              </div>
            </div>
          ))}
        </>
      )}

      {section === 'planned' && (
        <>
          <p className="hint">Rutes que has calculat i desat en aquest navegador.</p>
          {!p.planned.length && <div className="empty"><Icon name="map" size={40} />Encara no has desat cap ruta.</div>}
          {p.planned.map((s) => (
            <div key={s.id} className="box">
              <h3>{s.title}</h3>
              <div className="hint">
                {fmtDuration(s.route.durationMin)} · {s.route.elevationGain} m + · {s.request.mode === 'trail' ? 'Trail' : 'Carretera'} ·
                desada el {new Date(s.savedAt).toLocaleDateString('ca-ES')}
              </div>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn small primary" onClick={() => p.onOpenPlanned(s)}>Obre</button>
                {socialEnabled && <button className="btn small" onClick={() => p.onSharePlanned(s)}>Comparteix</button>}
                <button className="btn small ghost" onClick={() => p.onDeletePlanned(s.id)}>Elimina</button>
              </div>
            </div>
          ))}
        </>
      )}

      {(section === 'saved' || section === 'mine') && (
        <>
          <p className="hint">
            {section === 'saved' ? 'Rutes de la comunitat que has guardat per fer-les.' : 'Rutes que has compartit amb la comunitat.'}
          </p>
          {!p.me?.username && <div style={{ marginTop: 10 }}><JoinForm onJoined={p.setMe} /></div>}
          {list.error && <div className="alert err">{list.error}</div>}
          {loading && <Loader text="Carregant…" />}
          {!loading && p.me?.username && !list.rows.length && !list.error && (
            <div className="empty">
              <Icon name={section === 'saved' ? 'bookmark' : 'upload'} size={40} />
              {section === 'saved' ? 'Encara no has guardat cap ruta. Busca\'n a l\'apartat Social.' : 'Encara no has publicat cap ruta.'}
            </div>
          )}
          {list.rows.map((r) => (
            <SharedRouteCard
              key={r.id}
              route={r}
              reactions={list.reactions[r.id] ?? { liked: false, saved: false }}
              onOpen={() => { setOpen(r); p.onShow(r); }}
              onLike={() => list.react(r.id, 'liked')}
              onSave={() => list.react(r.id, 'saved')}
            />
          ))}
        </>
      )}
    </div>
  );
}
