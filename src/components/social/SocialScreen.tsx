import { useEffect, useRef, useState } from 'react';
import JoinForm from './JoinForm';
import ShareDialog from './ShareDialog';
import SharedRouteCard, { SharedRouteDetail } from './SharedRouteCard';
import { useSocialList } from './useSocialList';
import { deleteRoute, fetchFeed, routeFromTrack, socialEnabled, type FeedSort, type Me, type SharedRoute } from '../../lib/social';
import { parseGpx } from '../../lib/gpxImport';
import { reverseGeocode } from '../../lib/places';
import type { LngLat, RideMode, RouteResult, SavedRoute } from '../../lib/types';
import Icon from '../Icon';

interface Props {
  me: Me | null;
  setMe: (m: Me) => void;
  near: LngLat | null;
  localRoutes: SavedRoute[];
  onShow: (route: SharedRoute | null) => void;
  onPlan: (route: SharedRoute) => void;
  onPreviewUpload: (route: RouteResult | null) => void;
}

type Upload = { route: RouteResult; title: string; mode: RideMode; date: string | null; startName: string | null };

export default function SocialScreen(p: Props) {
  const [sort, setSort] = useState<FeedSort>('recent');
  const [mode, setMode] = useState<RideMode | 'all'>('all');
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<SharedRoute | null>(null);
  const [askJoin, setAskJoin] = useState(false);
  const [uploadMenu, setUploadMenu] = useState(false);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useSocialList(() => {
    if (p.me?.username) return true;
    setAskJoin(true);
    return false;
  });

  async function refresh(nextPage = 0) {
    if (!socialEnabled) return;
    setLoading(true);
    try {
      const res = await fetchFeed({ sort, mode, near: p.near, page: nextPage });
      await list.load(res.rows, nextPage > 0);
      setMore(res.more);
      setPage(nextPage);
      list.setError(null);
    } catch (e) {
      list.setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void refresh(0), [sort, mode, p.me?.id]);

  // la ruta oberta es manté sincronitzada amb els recomptes de la llista
  const openRow = open ? list.rows.find((r) => r.id === open.id) ?? open : null;

  async function onGpx(file: File) {
    setImporting(true);
    setUploadError(null);
    try {
      const track = parseGpx(await file.text());
      const guessMode: RideMode = 'road';
      const route = await routeFromTrack(track, guessMode);
      const startName = await reverseGeocode(track.coords[0]);
      setUpload({ route, title: track.name ?? `Ruta per ${startName.split(',')[0]}`, mode: guessMode, date: track.date, startName });
      p.onPreviewUpload(route);
      setUploadMenu(false);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!socialEnabled) {
    return (
      <div>
        <h2>Comunitat</h2>
        <div className="alert info" style={{ marginTop: 12 }}>
          L'apartat Social necessita connexió amb el servidor de la comunitat i aquí no està disponible.
          {import.meta.env.VITE_DEMO === '1' ? ' Prova-ho a la web publicada.' : ' Falta configurar Supabase (vegeu el README).'}
        </div>
      </div>
    );
  }

  if (openRow) {
    return (
      <SharedRouteDetail
        route={openRow}
        reactions={list.reactions[openRow.id] ?? { liked: false, saved: false }}
        onOpen={() => {}}
        onLike={() => list.react(openRow.id, 'liked')}
        onSave={() => list.react(openRow.id, 'saved')}
        onBack={() => { setOpen(null); p.onShow(null); }}
        onPlan={() => p.onPlan(openRow)}
        isMine={openRow.author_id === p.me?.id}
        onDelete={async () => {
          await deleteRoute(openRow.id);
          setOpen(null);
          p.onShow(null);
          void refresh(0);
        }}
      />
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2>Comunitat</h2>
        <button className="btn small primary" style={{ flex: 'none' }} onClick={() => setUploadMenu(!uploadMenu)}><Icon name="plus" size={16} /> Puja una ruta</button>
      </div>
      <p className="hint">Rutes que altres motoristes han fet. Dona-hi m'agrada o guarda-les per fer-les: les trobaràs a «Les meves rutes».</p>

      {p.me?.username && <div className="hint" style={{ marginTop: 4 }}>Ets <b>@{p.me.username}</b></div>}
      {(askJoin || (!p.me?.username && uploadMenu)) && !p.me?.username && (
        <div style={{ marginTop: 12 }}><JoinForm onJoined={(m) => { p.setMe(m); setAskJoin(false); }} /></div>
      )}

      {uploadMenu && p.me?.username && (
        <div className="box" style={{ marginTop: 12 }}>
          <h3>Quina ruta vols compartir?</h3>
          <p className="hint">Puja el GPX del teu GPS, mòbil, Wikiloc, Strava o Calimoto, o tria una ruta que tinguis desada.</p>
          <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} />
          <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={importing} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />{importing ? 'Llegint el GPX…' : 'Puja un fitxer GPX'}
          </button>
          {p.localRoutes.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 14 }}>O una de les teves rutes desades</div>
              {p.localRoutes.slice(0, 8).map((s) => (
                <button key={s.id} className="list-item" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    const route = { ...s.route } as RouteResult;
                    setUpload({ route, title: s.title, mode: s.request.mode, date: null, startName: s.request.origin?.name ?? null });
                    p.onPreviewUpload(route);
                    setUploadMenu(false);
                  }}>
                  <div className="main"><b>{s.title}</b></div><Icon name="chevron-right" className="dim" />
                </button>
              ))}
            </>
          )}
          {uploadError && <div className="alert err">{uploadError}</div>}
        </div>
      )}

      <div className="row" style={{ margin: '14px 0 10px', gap: 8 }}>
        <div className="chips" style={{ flex: 2 }}>
          {([['recent', 'Recents'], ['popular', 'Més populars'], ['near', 'A prop']] as const).map(([id, label]) => (
            <button key={id} className={`chip ${sort === id ? 'on' : ''}`} disabled={id === 'near' && !p.near} onClick={() => setSort(id)}>{label}</button>
          ))}
        </div>
        <select className="input" style={{ flex: 1, minHeight: 40, padding: '6px 10px' }} value={mode} onChange={(e) => setMode(e.target.value as RideMode | 'all')}>
          <option value="all">Totes</option>
          <option value="road">Carretera</option>
          <option value="trail">Trail</option>
        </select>
      </div>
      {sort === 'near' && !p.near && <p className="hint">Tria un punt de sortida a Planificar per veure rutes a prop.</p>}

      {list.error && <div className="alert err">{list.error}</div>}
      {loading && !list.rows.length && (
        <div aria-busy="true" aria-label="Carregant rutes de la comunitat">
          {[0, 1, 2].map((k) => (
            <div key={k} className="route-card skeleton">
              <div className="sk-row"><span className="sk sk-av" /><span className="sk sk-line" style={{ width: '40%' }} /></div>
              <span className="sk sk-line" style={{ width: '70%', height: 18, marginTop: 12 }} />
              <div className="sk-row" style={{ marginTop: 14 }}><span className="sk sk-block" /><span className="sk sk-block" /><span className="sk sk-block" /></div>
            </div>
          ))}
        </div>
      )}
      {!loading && !list.rows.length && !list.error && (
        <div className="empty"><Icon name="bike" size={40} />Encara no hi ha rutes aquí. Sigues el primer a compartir-ne una!</div>
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
      {more && <button className="btn" style={{ width: '100%' }} disabled={loading} onClick={() => refresh(page + 1)}>{loading ? 'Carregant…' : 'Carrega\'n més'}</button>}

      {upload && (
        <ShareDialog
          route={upload.route}
          me={p.me}
          setMe={p.setMe}
          defaultTitle={upload.title}
          defaultMode={upload.mode}
          defaultDate={upload.date}
          startName={upload.startName}
          onClose={() => { setUpload(null); p.onPreviewUpload(null); }}
          onPublished={() => void refresh(0)}
        />
      )}
    </div>
  );
}
