import { useEffect, useRef } from 'react';
import { Map as MlMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl';
import { bbox } from '../lib/geo';

export const DEMO = import.meta.env.VITE_DEMO === '1';

/**
 * Després d'empaquetar, MapLibre no troba el seu worker al costat del bundle: li indiquem on és.
 * En mode demo (pàgina d'un sol fitxer) el worker s'incrusta i es crea com a blob.
 */
let workerReady: Promise<void> | null = null;
function configureWorker() {
  workerReady ??= (async () => {
    if (DEMO) {
      const src = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?raw')).default;
      setWorkerUrl(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    } else {
      setWorkerUrl((await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default);
    }
  })();
  return workerReady;
}

/** Estil base del mode demo: municipis i costa de Catalunya incrustats, sense tessel·les externes. */
async function demoStyle() {
  const base = (await import('../demo/basemap.json')).default as GeoJSON.FeatureCollection;
  return {
    version: 8 as const,
    sources: { base: { type: 'geojson' as const, data: base } },
    layers: [
      { id: 'sea', type: 'background' as const, paint: { 'background-color': '#b9d0dc' } },
      { id: 'land', type: 'fill' as const, source: 'base', filter: ['has', 'cat'] as never,
        paint: { 'fill-color': ['case', ['==', ['get', 'cat'], 1], '#eef0e4', ['has', 'foreign'], '#e3e4dc', '#dfe3d6'] as never } },
      { id: 'mun', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'mun'] as never,
        paint: { 'line-color': '#cfd5c4', 'line-width': 0.6 } },
      { id: 'prov', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'prov'] as never,
        paint: { 'line-color': '#9aa69a', 'line-width': 1.2, 'line-dasharray': [3, 2] } },
      { id: 'coast', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'coast'] as never,
        paint: { 'line-color': '#7fa3b6', 'line-width': 1.2 } },
    ],
  };
}
import type { Accommodation, LngLat, Place, RouteResult, Stage, StationOnRoute, WeatherSample } from '../lib/types';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const LEVEL_COLOR = ['#3ccf8e', '#f5c542', '#ff9a3c', '#ff4d5e'];

interface Props {
  routes: RouteResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin: Place | null;
  destination: Place | null;
  vias: Place[];
  weather?: WeatherSample[];
  stations?: StationOnRoute[];
  stops?: StationOnRoute[];
  stages?: Stage[];
  accommodations?: Accommodation[];
  onPick?: ((c: LngLat) => void) | null;
  liveTrack?: LngLat[]; // traçat que s'està gravant
  position?: LngLat | null; // posició actual del GPS
  follow?: boolean;
}

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const pt = (c: LngLat, props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: c },
  properties: props,
});

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    let cancelled = false;
    let m: MlMap | null = null;
    (async () => {
    await configureWorker();
    const style = DEMO ? await demoStyle() : STYLE;
    if (cancelled) return;
    m = new MlMap({
      container: el.current!,
      style,
      center: [1.6, 41.7],
      zoom: 7,
      attributionControl: DEMO ? false : { compact: true },
    });
    map.current = m;
    init(m);
    })();
    return () => {
      cancelled = true;
      ready.current = false;
      m?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function init(m: MlMap) {
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      const add = (id: string) => m.addSource(id, { type: 'geojson', data: fc([]) });
      ['routes', 'weather', 'stations', 'stops', 'stages', 'accom', 'places', 'live', 'me'].forEach(add);

      m.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111', 'line-width': ['case', ['get', 'selected'], 9, 5], 'line-opacity': ['case', ['get', 'selected'], 0.6, 0.25] } });
      m.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['get', 'selected'], 2, 1] },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5.5, 3], 'line-opacity': ['case', ['get', 'selected'], 1, 0.55] } });
      m.addLayer({ id: 'stations', type: 'circle', source: 'stations',
        paint: { 'circle-radius': 4.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#333', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'accom', type: 'circle', source: 'accom',
        paint: { 'circle-radius': 6, 'circle-color': '#b46cff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'weather', type: 'circle', source: 'weather', filter: ['>=', ['get', 'level'], 1],
        paint: { 'circle-radius': ['+', 6, ['*', 2, ['get', 'level']]], 'circle-color': ['get', 'color'], 'circle-opacity': 0.85, 'circle-stroke-color': '#111', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'stops', type: 'circle', source: 'stops',
        paint: { 'circle-radius': 10, 'circle-color': '#ff6b2c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
      if (!DEMO) m.addLayer({ id: 'stops-label', type: 'symbol', source: 'stops',
        layout: { 'text-field': '€', 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' } });
      m.addLayer({ id: 'stages', type: 'circle', source: 'stages',
        paint: { 'circle-radius': 11, 'circle-color': '#121417', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      if (!DEMO) m.addLayer({ id: 'stages-label', type: 'symbol', source: 'stages',
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' } });
      m.addLayer({ id: 'live-casing', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111', 'line-width': 8, 'line-opacity': 0.5 } });
      m.addLayer({ id: 'live', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff6b2c', 'line-width': 5 } });
      m.addLayer({ id: 'me-halo', type: 'circle', source: 'me',
        paint: { 'circle-radius': 16, 'circle-color': '#3fb6ff', 'circle-opacity': 0.25 } });
      m.addLayer({ id: 'me', type: 'circle', source: 'me',
        paint: { 'circle-radius': 8, 'circle-color': '#3fb6ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      m.addLayer({ id: 'places', type: 'circle', source: 'places',
        paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });

      const popup = (layer: string, html: (props: Record<string, string>) => string) => {
        m.on('click', layer, (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          new Popup({ closeButton: false, offset: 10 })
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as LngLat)
            .setHTML(html(f.properties as Record<string, string>))
            .addTo(m);
        });
        m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
      };
      popup('stations', (x) => `<b>${esc(x.brand)}</b><br>${esc(x.town)}<br>${x.price} €/l · km ${x.km}`);
      popup('stops', (x) => `<b>Parada recomanada · ${esc(x.brand)}</b><br>${x.price} €/l · km ${x.km}`);
      popup('weather', (x) => `<b>km ${x.km} · ${x.eta}</b><br>${esc(x.reasons)}`);
      popup('accom', (x) => `<b>${esc(x.name)}</b><br>${esc(x.kind)}${x.stars ? ' · ' + '★'.repeat(+x.stars) : ''}`);
      m.on('click', 'routes-line', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(id);
      });
      m.on('click', (e: MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ['stations', 'stops', 'weather', 'accom', 'routes-line'] });
        if (!hits.length && latest.current.onPick) latest.current.onPick([e.lngLat.lng, e.lngLat.lat]);
      });
      ready.current = true;
      sync();
      fit();
    });
  }

  function setData(id: string, data: GeoJSON.FeatureCollection) {
    (map.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  function sync() {
    if (!ready.current || !map.current) return;
    const q = latest.current;
    setData('routes', fc(q.routes.map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.coords },
      properties: { id: r.id, color: r.color, selected: r.id === q.selectedId },
    }))));
    setData('weather', fc((q.weather ?? []).map((w) => pt(w.coord, {
      level: w.level,
      color: LEVEL_COLOR[w.level],
      km: Math.round(w.km),
      eta: w.eta.toLocaleString('ca-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      reasons: w.reasons.join(' · '),
    }))));
    setData('stations', fc((q.stations ?? []).map((s) => pt(s.coord, { brand: s.brand, town: s.town, price: s.price?.toFixed(3), km: Math.round(s.km) }))));
    setData('stops', fc((q.stops ?? []).map((s) => pt(s.coord, { brand: s.brand, price: s.price?.toFixed(3), km: Math.round(s.km) }))));
    setData('stages', fc((q.stages ?? []).length > 1 ? q.stages!.slice(0, -1).map((s) => pt(s.end, { label: String(s.index + 1) })) : []));
    setData('accom', fc((q.accommodations ?? []).map((a) => pt(a.coord, { name: a.name, kind: a.kind, stars: a.stars ?? '' }))));
    const places: GeoJSON.Feature[] = [];
    if (q.origin) places.push(pt(q.origin.coord, { color: '#3ccf8e' }));
    if (q.destination) places.push(pt(q.destination.coord, { color: '#ff4d5e' }));
    q.vias.forEach((v) => places.push(pt(v.coord, { color: '#3fb6ff' })));
    setData('places', fc(places));
    const live = q.liveTrack ?? [];
    setData('live', fc(live.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: live }, properties: {} }] : []));
    setData('me', fc(q.position ? [pt(q.position)] : []));
  }

  useEffect(sync, [p.routes, p.selectedId, p.weather, p.stations, p.stops, p.stages, p.accommodations, p.origin, p.destination, p.vias, p.liveTrack, p.position]);

  // en gravar, el mapa segueix la posició
  const centered = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !p.position || !p.follow) return;
    if (!centered.current) {
      m.jumpTo({ center: p.position, zoom: Math.max(m.getZoom(), 14) });
      centered.current = true;
    } else {
      m.easeTo({ center: p.position, duration: 800 });
    }
  }, [p.position, p.follow]);
  useEffect(() => {
    if (!p.follow) centered.current = false;
  }, [p.follow]);

  // Encaixa la vista a les rutes o als punts triats
  function fit() {
    const m = map.current;
    if (!m) return;
    const q = latest.current;
    const coords: LngLat[] = q.routes.length
      ? q.routes.flatMap((r) => r.coords)
      : [q.origin?.coord, q.destination?.coord].filter(Boolean) as LngLat[];
    if (!coords.length) return;
    if (coords.length === 1) {
      m.easeTo({ center: coords[0], zoom: 10 });
      return;
    }
    const [a, b, c, d] = bbox(coords);
    m.fitBounds([[a, b], [c, d]] as LngLatBoundsLike, { padding: 50, duration: 600 });
  }
  useEffect(fit, [p.routes, p.origin, p.destination]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = p.onPick ? 'crosshair' : '';
  }, [p.onPick]);

  return <div ref={el} className="map" />;
}
