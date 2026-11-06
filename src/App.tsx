import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView, { DEMO } from './components/MapView';
import Wizard, { type PickTarget } from './components/Wizard';
import BikeScreen from './components/BikeScreen';
import RouteCard, { fmtDuration } from './components/RouteCard';
import RouteDetail, { Loader } from './components/RouteDetail';
import { buildRoutes, enrichFuel, enrichWeather, makeSchedule } from './lib/pipeline';
import { reverseGeocode, searchAccommodation } from './lib/places';
import { loadBikes, loadRoutes, saveBikes, saveRoutes, uid } from './lib/storage';
import { downloadText, toGpx } from './lib/gpx';
import type { Accommodation, LngLat, Motorcycle, PlanRequest, RouteResult, SavedRoute } from './lib/types';

type Tab = 'plan' | 'routes' | 'bike';
type View = 'wizard' | 'results' | 'detail';
type Status = Record<string, { weather: string | null; fuel: string | null }>;

function defaultDeparture() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('plan');
  const [view, setView] = useState<View>('wizard');
  const [bikes, setBikesState] = useState<Motorcycle[]>(loadBikes);
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

  const setBikes = (b: Motorcycle[]) => {
    setBikesState(b);
    saveBikes(b);
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
    const r = { ...s.request, departure: defaultDeparture() };
    const route: RouteResult = { ...s.route, id: `${Date.now()}` };
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
          <div className="brand-mark">M</div>
          <h1>MotoRoute Builder</h1>
        </div>
        <div className="panel-body">
          {DEMO && (
            <div className="alert info" style={{ marginTop: 0 }}>
              <b>Mode demostració.</b> Rutes, meteo, benzineres i allotjaments són simulats (els pobles de Catalunya són reals).
              La versió completa amb dades reals es publica a Vercel.
            </div>
          )}
          {tab === 'plan' && view === 'wizard' && (
            <>
              <Wizard
                req={req}
                setReq={setReq}
                bikes={bikes}
                onSubmit={submit}
                picking={picking}
                setPicking={setPicking}
                goToBike={() => setTab('bike')}
                busy={!!progress}
              />
              {progress && <Loader text={progress} />}
              {error && <div className="alert err">{error}</div>}
            </>
          )}

          {tab === 'plan' && view === 'results' && (
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

          {tab === 'plan' && view === 'detail' && selected && planReq && (
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
            />
          )}

          {tab === 'routes' && (
            <>
              <h2>Les meves rutes</h2>
              {!saved.length && (
                <div className="empty"><span className="ico">🗺️</span>Encara no has desat cap ruta.</div>
              )}
              {saved.map((s) => (
                <div key={s.id} className="box">
                  <h3>{s.title}</h3>
                  <div className="hint">
                    {fmtDuration(s.route.durationMin)} · {s.route.elevationGain} m + · {s.request.mode === 'trail' ? 'Trail' : 'Carretera'} ·
                    desada el {new Date(s.savedAt).toLocaleDateString('ca-ES')}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn small primary" onClick={() => openSaved(s)}>Obre</button>
                    <button className="btn small ghost" onClick={() => setSaved(saved.filter((x) => x.id !== s.id))}>Elimina</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'bike' && <BikeScreen bikes={bikes} setBikes={setBikes} />}
        </div>
        <nav className="tabs">
          <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}><span className="ico">🧭</span>Planificar</button>
          <button className={tab === 'routes' ? 'on' : ''} onClick={() => setTab('routes')}><span className="ico">🗂️</span>Les meves rutes</button>
          <button className={tab === 'bike' ? 'on' : ''} onClick={() => setTab('bike')}><span className="ico">🏍️</span>La meva moto</button>
        </nav>
      </aside>
      <main className="map-wrap">
        <MapView
          routes={tab === 'plan' && view !== 'wizard' ? (view === 'detail' && selected ? [selected] : routes) : []}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          origin={req.origin}
          destination={req.circular ? null : req.destination}
          vias={req.circular ? [] : req.vias}
          weather={showExtras && view === 'detail' ? selected!.weather : undefined}
          stations={showExtras && view === 'detail' ? selected!.fuel?.stations : undefined}
          stops={showExtras ? selected!.fuel?.stops : undefined}
          stages={showExtras ? selected!.stages : undefined}
          accommodations={showExtras && view === 'detail' ? accomOnMap : undefined}
          onPick={picking ? onPick : null}
        />
      </main>
    </div>
  );
}
