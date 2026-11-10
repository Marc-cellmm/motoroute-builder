import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { DEMO } from './components/MapView';
import Wizard, { type PickTarget } from './components/Wizard';
import BikeScreen from './components/BikeScreen';
import Icon, { Logo } from './components/Icon';
import Avatar from './components/Avatar';
import { ROUTE_RED } from './lib/theme';
import RouteCard from './components/RouteCard';
import RouteDetail, { Loader } from './components/RouteDetail';
import { buildRoutes, enrichFuel, enrichWeather, makeSchedule } from './lib/pipeline';
import { reverseGeocode, searchAccommodation } from './lib/places';
import { loadBikes, loadRecordings, loadRoutes, saveBikes, saveRecordings, saveRoutes, uid } from './lib/storage';
import { downloadText, toGpx } from './lib/gpx';
import SocialScreen from './components/social/SocialScreen';
import MyRoutes from './components/social/MyRoutes';
import ShareDialog from './components/social/ShareDialog';
import RecordScreen from './components/RecordScreen';
import NavigationPanel from './components/NavigationPanel';
import { useNavigation } from './lib/useNavigation';
import { liveEnabled, useLiveShare } from './lib/live';
import LiveShareControl from './components/LiveShareControl';
import ProfileScreen from './components/account/ProfileScreen';
import { useAccount } from './components/account/AccountGate';
import { planDefaults, syncBikes } from './lib/account';
import { trackCoords, useRecorder } from './lib/recorder';
import { getMe, routeFromTrack, socialEnabled, toRouteResult, type Me, type SharedRoute } from './lib/social';
import { parseGpx } from './lib/gpxImport';
import { haversine } from './lib/geo';
import type { Accommodation, LngLat, Motorcycle, PlanRequest, RecordedRoute, RideMode, RouteResult, SavedRoute } from './lib/types';

type Tab = 'plan' | 'record' | 'social' | 'routes' | 'bike' | 'profile';
type ShareTarget = { route: RouteResult; title: string; mode: RideMode; startName: string | null; date?: string | null; recordedId?: string };
type View = 'wizard' | 'results' | 'detail';
type Status = Record<string, { weather: string | null; fuel: string | null }>;

function defaultDeparture() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Bona nit' : h < 13 ? 'Bon dia' : h < 20 ? 'Bona tarda' : 'Bona nit';
}

export default function App() {
  const { account, startTab } = useAccount();
  const [tab, setTabState] = useState<Tab>(() => (startTab as Tab | null) ?? 'plan');
  const [view, setView] = useState<View>('wizard');
  // motos: les d'aquest dispositiu; si no n'hi ha, les del compte (un mòbil nou, per exemple)
  const [bikes, setBikesState] = useState<Motorcycle[]>(() => {
    const local = loadBikes();
    if (!local.length && account?.settings?.bikes?.length) {
      saveBikes(account.settings.bikes);
      return account.settings.bikes;
    }
    return local;
  });
  const [saved, setSavedState] = useState<SavedRoute[]>(loadRoutes);
  const [req, setReq] = useState<PlanRequest>(() => ({
    mode: 'road',
    difficulty: 'intermediate',
    origin: null,
    circular: true,
    destination: null,
    vias: [],
    band: '100_200',
    avoidMotorways: true,
    avoidTolls: true,
    bikeId: loadBikes().find((b) => b.isDefault)?.id ?? null,
    startFuelFraction: 1,
    departure: defaultDeparture(),
    days: 1,
    kmPerDay: 250,
    ...planDefaults(account),
  }));
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({});
  const [picking, setPicking] = useState<PickTarget>(null);
  const [accom, setAccom] = useState<Record<number, Accommodation[] | 'loading' | string>>({});
  const [accomOnMap, setAccomOnMap] = useState<Accommodation[]>([]);
  const [planReq, setPlanReq] = useState<PlanRequest | null>(null); // petició de les rutes actuals
  const [me, setMe] = useState<Me | null>(null);
  const [socialRoute, setSocialRoute] = useState<RouteResult | null>(null); // ruta de la comunitat al mapa
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [recordings, setRecordingsState] = useState<RecordedRoute[]>(loadRecordings);
  const rec = useRecorder(); // viu a l'App perquè la gravació continuï en canviar d'apartat
  const setRecordings = (r: RecordedRoute[]) => {
    setRecordingsState(r);
    saveRecordings(r);
  };
  const markShared = (id: string) =>
    setRecordingsState((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, sharedAt: new Date().toISOString() } : r));
      saveRecordings(next);
      return next;
    });
  const defaultBike = bikes.find((b) => b.isDefault) ?? bikes[0] ?? null;
  const liveTrack = useMemo(() => trackCoords(rec.state.points), [rec.state.points]);

  // Navegació pas a pas: grava la sortida automàticament i guia amb veu.
  const [navRoute, setNavRoute] = useState<RouteResult | null>(null);
  const [navTitle, setNavTitle] = useState('');
  const [navVoice, setNavVoice] = useState(true);
  const navStartedRec = useRef(false);
  const navCosting = planReq ?? req;
  const nav = useNavigation(navRoute, rec.fix, navCosting, navVoice);
  const live = useLiveShare(rec.state, rec.fix, me?.username ?? null);
  const liveControl = liveEnabled && !DEMO && (rec.state.status === 'recording' || rec.state.status === 'paused')
    ? <LiveShareControl live={live} />
    : null;

  function startNavigation(route: RouteResult, title: string) {
    // a l'iPhone la veu només s'activa si el primer avís surt d'un toc de l'usuari
    try {
      const u = new SpeechSynthesisUtterance('Comencem la ruta.');
      u.lang = 'ca-ES';
      window.speechSynthesis?.speak(u);
    } catch { /* sense veu */ }
    setNavTitle(title);
    setNavRoute(route);
    if (rec.state.status === 'idle' || rec.state.status === 'finished') {
      if (rec.state.status === 'finished') rec.discard();
      rec.start();
      navStartedRec.current = true;
    } else {
      navStartedRec.current = false;
    }
  }

  function stopNavigation() {
    window.speechSynthesis?.cancel();
    setNavRoute(null);
    if (navStartedRec.current && (rec.state.status === 'recording' || rec.state.status === 'paused')) {
      rec.finish();
      setTab('record'); // resum de la sortida: desar, compartir…
    }
    navStartedRec.current = false;
  }

  const navMapRoutes = useMemo(() => {
    if (!navRoute) return [];
    const mainRoute = { ...navRoute, id: 'nav-main', coords: nav.mainCoords ?? navRoute.coords, color: ROUTE_RED };
    const list: RouteResult[] = [mainRoute];
    if (nav.view.detourCoords) list.push({ ...navRoute, id: 'nav-detour', coords: nav.view.detourCoords, color: '#4da3ff' });
    return list;
  }, [navRoute, nav.mainCoords, nav.view.detourCoords]);

  /** Torna a fer una ruta gravada: s'obre a Planificar amb meteo i benzina. */
  function openRecorded(r: RecordedRoute) {
    const route = { ...r.route, id: `${Date.now()}` } as RouteResult;
    const first = route.coords[0];
    const last = route.coords.at(-1)!;
    const circular = haversine(first, last) < 2;
    openRoute(route, {
      ...req,
      mode: r.mode,
      difficulty: route.difficulty,
      origin: { name: r.startName ?? 'Sortida', coord: first },
      circular,
      destination: circular ? null : { name: 'Arribada', coord: last },
      vias: [],
      departure: defaultDeparture(),
      days: 1,
    });
  }

  useEffect(() => {
    if (account?.profile) setMe({ id: account.id, username: account.profile.username });
    else if (socialEnabled) getMe().then(setMe).catch(() => setMe(null));
  }, [account]);

  // després d'editar el perfil: motos i preferències noves al Planificar
  function onProfileSaved() {
    const b = loadBikes();
    setBikesState(b);
    setReq((r) => ({ ...r, ...planDefaults(account), bikeId: b.find((x) => x.isDefault)?.id ?? r.bikeId }));
  }
  useEffect(() => {
    if (account) setReq((r) => ({ ...r, ...planDefaults(account) }));
  }, [account]);

  const setTab = (t: Tab) => {
    setTabState(t);
    setSocialRoute(null); // cada apartat comença amb el mapa net
  };

  const setBikes = (b: Motorcycle[]) => {
    setBikesState(b);
    saveBikes(b);
    if (account) void syncBikes(account.id, b).catch(() => {});
    if (!req.bikeId || !b.some((x) => x.id === req.bikeId)) setReq((r) => ({ ...r, bikeId: b.find((x) => x.isDefault)?.id ?? null }));
  };
  const setSaved = (s: SavedRoute[]) => {
    setSavedState(s);
    saveRoutes(s);
  };

  const selected = routes.find((r) => r.id === selectedId) ?? null;
  const bike = useMemo(() => bikes.find((b) => b.id === planReq?.bikeId) ?? null, [bikes, planReq]);

  const patchRoute = (id: string, patch: Partial<RouteResult>) =>
    setRoutes((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchStatus = (id: string, patch: Partial<Status[string]>) =>
    setStatus((s) => ({ ...s, [id]: { ...(s[id] ?? { weather: null, fuel: null }), ...patch } }));

  /** Enriqueix cada ruta amb meteo i benzina en segon pla. */
  const enrich = useCallback(async (list: RouteResult[], r: PlanRequest, b: Motorcycle | null) => {
    for (const route of list) {
      patchStatus(route.id, { weather: 'loading', fuel: b ? 'loading' : null });
      patchRoute(route.id, { stages: makeSchedule(route, r).stages });
    }
    for (const route of list) {
      try {
        const w = await enrichWeather(route, r);
        patchRoute(route.id, { weather: w.weather, bestDepartures: w.bestDepartures, stages: w.stages });
        patchStatus(route.id, { weather: null });
      } catch (e) {
        patchStatus(route.id, { weather: (e as Error).message });
      }
      if (b) {
        try {
          const fuel = await enrichFuel(route, r, b);
          patchRoute(route.id, { fuel });
          patchStatus(route.id, { fuel: null });
        } catch (e) {
          patchStatus(route.id, { fuel: (e as Error).message });
        }
      }
    }
  }, []);

  async function submit(r: PlanRequest) {
    setReq(r);
    setError(null);
    setNote(null);
    setPicking(null);
    setAccom({});
    setAccomOnMap([]);
    setProgress('Preparant…');
    try {
      const { routes: list, note } = await buildRoutes(r, setProgress);
      setRoutes(list);
      setSelectedId(list[0]?.id ?? null);
      setPlanReq(r);
      setNote(note ?? null);
      setView('results');
      setProgress(null);
      void enrich(list, r, bikes.find((b) => b.id === r.bikeId) ?? null);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  }

  async function onPick(c: LngLat) {
    const target = picking;
    setPicking(null);
    const place = { name: await reverseGeocode(c), coord: c };
    if (target === 'origin') setReq((r) => ({ ...r, origin: place }));
    if (target === 'destination') setReq((r) => ({ ...r, destination: place }));
  }

  async function loadAccommodation(stage: number) {
    const st = selected?.stages?.find((s) => s.index === stage);
    if (!st) return;
    setAccom((a) => ({ ...a, [stage]: 'loading' }));
    try {
      const list = await searchAccommodation(st.end, 10);
      setAccom((a) => ({ ...a, [stage]: list }));
      setAccomOnMap(list);
    } catch (e) {
      setAccom((a) => ({ ...a, [stage]: (e as Error).message }));
    }
  }

  function saveCurrent() {
    if (!selected || !planReq) return;
    const rest = { ...selected, weather: undefined, fuel: undefined, stages: undefined, bestDepartures: undefined };
    const title = `${planReq.origin?.name.split(',')[0]} ${planReq.circular ? '· circular' : '→ ' + planReq.destination?.name.split(',')[0]} · ${Math.round(selected.distanceKm)} km`;
    setSaved([{ id: uid(), title, savedAt: new Date().toISOString(), request: planReq, route: rest }, ...saved]);
  }

  function openSaved(s: SavedRoute) {
    openRoute({ ...s.route, id: `${Date.now()}` } as RouteResult, { ...s.request, departure: defaultDeparture() });
  }

  /** Obre una ruta de la comunitat a Planificar, amb meteo i benzina per a la propera sortida. */
  function openShared(s: SharedRoute) {
    const route = toRouteResult(s);
    const first = route.coords[0];
    const last = route.coords.at(-1)!;
    const circular = haversine(first, last) < 2;
    openRoute({ ...route, id: `${Date.now()}` }, {
      ...req,
      mode: s.mode,
      difficulty: s.difficulty,
      origin: { name: s.start_name ?? 'Sortida', coord: first },
      circular,
      destination: circular ? null : { name: 'Arribada', coord: last },
      vias: [],
      departure: defaultDeparture(),
      days: 1,
    });
  }

  const [importError, setImportError] = useState<string | null>(null);
  async function importGpxToPlan(file: File) {
    setImportError(null);
    setProgress('Llegint el GPX…');
    try {
      const track = parseGpx(await file.text());
      const route = await routeFromTrack(track, req.mode);
      const first = track.coords[0];
      const last = track.coords[track.coords.length - 1];
      const closed = haversine(first, last) < 1;
      setProgress('Buscant on comença…');
      const [startName, endName] = await Promise.all([
        reverseGeocode(first).catch(() => 'Inici'),
        closed ? Promise.resolve('') : reverseGeocode(last).catch(() => 'Final'),
      ]);
      route.label = track.name ?? route.label;
      const r: PlanRequest = {
        ...req,
        origin: { name: startName, coord: first },
        destination: closed ? null : { name: endName, coord: last },
        circular: closed,
        vias: [],
      };
      openRoute(route, r);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  function openRoute(route: RouteResult, r: PlanRequest) {
    setSocialRoute(null);
    setReq(r);
    setPlanReq(r);
    setRoutes([route]);
    setSelectedId(route.id);
    setAccom({});
    setAccomOnMap([]);
    setTab('plan');
    setView('detail');
    void enrich([route], r, bikes.find((b) => b.id === r.bikeId) ?? null);
  }

  // Si la moto canvia de dades, recalcula la benzina de les rutes actuals
  useEffect(() => {
    if (!planReq || !routes.length || !bike) return;
    routes.forEach((route) => {
      patchStatus(route.id, { fuel: 'loading' });
      enrichFuel(route, planReq, bike)
        .then((fuel) => {
          patchRoute(route.id, { fuel });
          patchStatus(route.id, { fuel: null });
        })
        .catch((e) => patchStatus(route.id, { fuel: (e as Error).message }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bike]);

  const isSaved = !!selected && saved.some((s) => s.route.coords.length === selected.coords.length && s.route.distanceKm === selected.distanceKm);
  const showExtras = tab === 'plan' && view !== 'wizard' && selected;

  return (
    <div className="app">
      <aside className="panel">
        <div className="brand">
          <Logo size={34} />
          <h1>MotoRoute<span>Builder</span></h1>
          {account?.profile && (
            <button className="brand-avatar" onClick={() => setTab('profile')} aria-label="El meu perfil">
              <Avatar url={account.profile.avatar_url} name={account.profile.display_name || account.profile.username} size={34} />
            </button>
          )}
        </div>
        <div className="panel-body">
          {navRoute && (
            <NavigationPanel
              title={navTitle}
              view={nav.view}
              fix={rec.fix}
              rec={rec.state}
              elapsedMs={rec.elapsedMs}
              voiceOn={navVoice}
              setVoiceOn={setNavVoice}
              onRepeat={nav.repeat}
              onStop={stopNavigation}
              extra={liveControl}
            />
          )}
          {!navRoute && DEMO && (
            <div className="alert info" style={{ marginTop: 0 }}>
              <b>Mode demostració.</b> Rutes, meteo, benzineres i allotjaments són simulats (els pobles de Catalunya són reals).
              La versió completa amb dades reals es publica a Vercel.
            </div>
          )}
          {!navRoute && tab === 'plan' && view === 'wizard' && (
            <>
              {account?.profile && (
                <div className="greeting">
                  <span>{greeting()}, <b>{account.profile.display_name || account.profile.username}</b></span>
                  <span className="hint">On anem avui?</span>
                </div>
              )}
              <Wizard
                req={req}
                setReq={setReq}
                bikes={bikes}
                onSubmit={submit}
                picking={picking}
                setPicking={setPicking}
                goToBike={() => setTab('bike')}
                busy={!!progress}
                onImportGpx={importGpxToPlan}
                importError={importError}
              />
              {progress && <Loader text={progress} />}
              {error && <div className="alert err">{error}</div>}
            </>
          )}

          {!navRoute && tab === 'plan' && view === 'results' && (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <h2>Alternatives</h2>
                <button className="btn small" style={{ flex: 'none' }} onClick={() => setView('wizard')}>Edita</button>
              </div>
              {note && <div className="alert info">{note}</div>}
              {routes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  selected={r.id === selectedId}
                  userLevel={planReq?.difficulty}
                  onClick={() => (r.id === selectedId ? setView('detail') : setSelectedId(r.id))}
                />
              ))}
              <button className="btn primary" style={{ width: '100%' }} disabled={!selected} onClick={() => setView('detail')}>
                Veure el detall de {selected?.label}
              </button>
              <p className="hint">Toca una ruta per seleccionar-la; toca-la de nou per obrir-ne el detall.</p>
            </>
          )}

          {!navRoute && tab === 'plan' && view === 'detail' && selected && planReq && (
            <RouteDetail
              route={selected}
              req={planReq}
              bike={bike}
              status={status[selected.id] ?? { weather: null, fuel: null }}
              accommodations={accom}
              onLoadAccommodation={loadAccommodation}
              onShowAccommodation={setAccomOnMap}
              onBack={() => setView(routes.length > 1 ? 'results' : 'wizard')}
              onSave={saveCurrent}
              onGpx={DEMO ? undefined : () => downloadText(`motoroute-${Math.round(selected.distanceKm)}km.gpx`, toGpx(selected, 'MotoRoute'))}
              saved={isSaved}
              onNavigate={DEMO ? undefined : () => startNavigation(selected, selected.label)}
              onShare={socialEnabled ? () => setShareTarget({
                route: selected,
                title: `${planReq.origin?.name.split(',')[0] ?? 'Ruta'}${planReq.circular ? ' · circular' : ' → ' + (planReq.destination?.name.split(',')[0] ?? '')}`,
                mode: planReq.mode,
                startName: planReq.origin?.name ?? null,
              }) : undefined}
            />
          )}

          {!navRoute && tab === 'record' && (
            <RecordScreen
              rec={rec}
              bike={defaultBike}
              me={me}
              setMe={setMe}
              onSave={(r) => setRecordings([r, ...recordings])}
              onMarkShared={markShared}
              goToMyRoutes={() => setTab('routes')}
              demo={DEMO}
              extra={liveControl}
            />
          )}

          {!navRoute && tab === 'social' && (
            <SocialScreen
              me={me}
              setMe={setMe}
              near={req.origin?.coord ?? null}
              localRoutes={saved}
              onShow={(r) => setSocialRoute(r ? toRouteResult(r) : null)}
              onPreviewUpload={setSocialRoute}
              onPlan={openShared}
            />
          )}

          {!navRoute && tab === 'routes' && (
            <MyRoutes
              me={me}
              setMe={setMe}
              planned={saved}
              onOpenPlanned={openSaved}
              onDeletePlanned={(id) => setSaved(saved.filter((x) => x.id !== id))}
              onSharePlanned={(s) => setShareTarget({ route: { ...s.route } as RouteResult, title: s.title, mode: s.request.mode, startName: s.request.origin?.name ?? null })}
              onShow={(r) => setSocialRoute(r ? toRouteResult(r) : null)}
              onPlan={openShared}
              recorded={recordings}
              onShowRecorded={(r) => setSocialRoute(r ? ({ ...r.route, id: `rec-${r.id}`, color: ROUTE_RED } as RouteResult) : null)}
              onPlanRecorded={openRecorded}
              onShareRecorded={(r) => setShareTarget({ route: r.route as RouteResult, title: r.title, mode: r.mode, startName: r.startName, date: r.recordedAt.slice(0, 10), recordedId: r.id })}
              onDeleteRecorded={(id) => { setRecordings(recordings.filter((x) => x.id !== id)); setSocialRoute(null); }}
            />
          )}

          {!navRoute && tab === 'bike' && <BikeScreen bikes={bikes} setBikes={setBikes} coverUrl={account?.profile?.bike_photos?.[0] ?? null} />}
          {!navRoute && tab === 'profile' && <ProfileScreen onProfileSaved={onProfileSaved} />}
        </div>
        <nav className="tabs" style={navRoute ? { display: 'none' } : undefined}>
          <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}><Icon name="plan" size={22} />Planificar</button>
          <button className={`${tab === 'record' ? 'on' : ''} ${rec.state.status === 'recording' ? 'rec-live' : ''}`} onClick={() => setTab('record')}>
            <Icon name="record" size={22} filled={rec.state.status === 'recording'} />Grava
          </button>
          <button className={tab === 'social' ? 'on' : ''} onClick={() => setTab('social')}><Icon name="social" size={22} />Social</button>
          <button className={tab === 'routes' ? 'on' : ''} onClick={() => setTab('routes')}><Icon name="routes" size={22} />Rutes</button>
          <button className={tab === 'bike' ? 'on' : ''} onClick={() => setTab('bike')}><Icon name="bike" size={22} />Moto</button>
          {account && <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}><Icon name="profile" size={22} />Perfil</button>}
        </nav>
        {shareTarget && (
          <ShareDialog
            route={shareTarget.route}
            me={me}
            setMe={setMe}
            defaultTitle={shareTarget.title}
            defaultMode={shareTarget.mode}
            defaultDate={shareTarget.date}
            startName={shareTarget.startName}
            onClose={() => setShareTarget(null)}
            onPublished={() => shareTarget.recordedId && markShared(shareTarget.recordedId)}
          />
        )}
      </aside>
      <main className="map-wrap">
        <MapView
          routes={navRoute ? navMapRoutes : tab === 'plan' && view !== 'wizard'
            ? (view === 'detail' && selected ? [selected] : routes)
            : (tab === 'social' || tab === 'routes') && socialRoute ? [socialRoute] : []}
          selectedId={navRoute ? 'nav-main' : (tab === 'social' || tab === 'routes') && socialRoute ? socialRoute.id : selectedId}
          onSelect={(id) => setSelectedId(id)}
          origin={tab === 'plan' ? req.origin : null}
          destination={req.circular ? null : req.destination}
          vias={req.circular ? [] : req.vias}
          weather={showExtras && view === 'detail' ? selected!.weather : undefined}
          stations={showExtras && view === 'detail' ? selected!.fuel?.stations : undefined}
          stops={showExtras ? selected!.fuel?.stops : undefined}
          stages={showExtras ? selected!.stages : undefined}
          accommodations={showExtras && view === 'detail' ? accomOnMap : undefined}
          onPick={picking ? onPick : null}
          liveTrack={tab === 'record' || navRoute ? liveTrack : undefined}
          position={tab === 'record' || navRoute ? rec.fix?.coord ?? null : null}
          follow={!!navRoute || (tab === 'record' && rec.state.status !== 'finished')}
        />
      </main>
    </div>
  );
}
