import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { LEVEL_COLORS, ROUTE_RED } from '../lib/theme';
import { Map as MlMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl';
import { bbox } from '../lib/geo';
import HourlyForecast from './HourlyForecast';
import { fetchWxGrid, renderWx, WX_RAMP, WX_UNIT, type WxGrid, type WxVar } from '../lib/weatherMap';

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
      { id: 'sea', type: 'background' as const, paint: { 'background-color': '#0c1117' } },
      { id: 'land', type: 'fill' as const, source: 'base', filter: ['has', 'cat'] as never,
        paint: { 'fill-color': ['case', ['==', ['get', 'cat'], 1], '#1b1b1f', ['has', 'foreign'], '#141417', '#17171b'] as never } },
      { id: 'mun', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'mun'] as never,
        paint: { 'line-color': '#26262c', 'line-width': 0.6 } },
      { id: 'prov', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'prov'] as never,
        paint: { 'line-color': '#3a3a42', 'line-width': 1.2, 'line-dasharray': [3, 2] } },
      { id: 'coast', type: 'line' as const, source: 'base', filter: ['==', ['get', 'kind'], 'coast'] as never,
        paint: { 'line-color': '#2b3b4a', 'line-width': 1.2 } },
    ],
  };
}
import type { Accommodation, LngLat, Place, RouteResult, Stage, StationOnRoute, WeatherSample } from '../lib/types';
import { t, locale } from '../i18n';

const STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
} as const;
type MapTheme = keyof typeof STYLES;
const LEVEL_COLOR = LEVEL_COLORS;
const readFlag = (key: string) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};

/** Icones dels marcadors del mapa (mateix traç que la resta de l'app). */
const PIN_PATHS = {
  fuel: 'M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13.5 5v15.5M3 20.5h12M4.5 10h9M13.5 8l3 2.5V17a1.5 1.5 0 0 0 3 0V8.5L17 6',
  bed: 'M3 19V6M3 15.5h18V19M21 15.5V12a3 3 0 0 0-3-3h-7v6.5M7 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  arrow: 'M12 21V4M5.5 10.5 12 4l6.5 6.5',
};

function pinImage(path: string, fill: string | null, stroke: string, size: number) {
  const px = size * 2;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  if (fill) {
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke === '#fff' ? '#fff' : '#08080a';
    ctx.stroke();
  }
  const k = (px * (fill ? 0.56 : 0.9)) / 24;
  ctx.translate((px - 24 * k) / 2, (px - 24 * k) / 2);
  ctx.scale(k, k);
  if (!fill) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(path));
  }
  ctx.lineWidth = fill ? 2 : 2.6;
  ctx.strokeStyle = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(path));
  return { width: px, height: px, data: ctx.getImageData(0, 0, px, px).data };
}

const WX_VARS: { id: WxVar; icon: string; label: string }[] = [
  { id: 'precip', icon: 'rain', label: t("Pluja") },
  { id: 'cloud', icon: 'cloud', label: t("Núvols") },
  { id: 'wind', icon: 'wind', label: t("Vent") },
  { id: 'humidity', icon: 'fog', label: t("Humitat") },
  { id: 'temp', icon: 'thermometer', label: t("Temperatura") },
];

function legendGradient(v: WxVar) {
  const stops = WX_RAMP[v];
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  return `linear-gradient(to right, ${stops.map(([x, [r, g, b, a]]) => `rgba(${r},${g},${b},${Math.max(a, 0.12)}) ${Math.round(((x - min) / (max - min)) * 100)}%`).join(', ')})`;
}
const readTheme = (): MapTheme => {
  try {
    return localStorage.getItem('mrb.mapstyle') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

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
  const latestTheme = useRef<MapTheme>('dark');
  const [theme, setTheme] = useState<MapTheme>(readTheme);
  const [relief, setRelief] = useState(() => readFlag('mrb.relief'));
  const reliefRef = useRef(relief);
  reliefRef.current = relief;
  const [wxVar, setWxVar] = useState<WxVar | null>(null);
  const [wxGrid, setWxGrid] = useState<WxGrid | null>(null);
  const [wxHour, setWxHour] = useState(0);
  const [wxBusy, setWxBusy] = useState(false);
  const [wxError, setWxError] = useState(false);
  const [wxPlay, setWxPlay] = useState(false);
  const [hourlyAt, setHourlyAt] = useState<LngLat | null>(null);
  const [styleRev, setStyleRev] = useState(0);
  latestTheme.current = theme;

  useEffect(() => {
    let cancelled = false;
    let m: MlMap | null = null;
    (async () => {
    await configureWorker();
    const style = DEMO ? await demoStyle() : STYLES[theme];
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
      addLayers(m);
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
      popup('stops', (x) => t("<b>Parada recomanada · {0}</b><br>{1} €/l · km {2}", [esc(x.brand), x.price, x.km]));
      popup('weather', (x) => `<b>km ${x.km} · ${x.eta}</b><br>${esc(x.reasons)}`);
      popup('accom', (x) => `<b>${esc(x.name)}</b><br>${esc(x.kind)}${x.stars ? ' · ' + x.stars + '★' : ''}`);
      m.on('click', 'routes-line', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(id);
      });
      m.on('click', (e: MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ['stations', 'stops', 'weather', 'accom', 'routes-line'] });
        if (!hits.length && latest.current.onPick) latest.current.onPick([e.lngLat.lng, e.lngLat.lat]);
      });
      ready.current = true;
      setStyleRev((n) => n + 1);
      sync();
      fit();
    });
  }

  /** Relleu: ombrejat del terreny amb el model d'elevació obert de Mapzen/AWS. */
  function applyRelief(m: MlMap) {
    const on = reliefRef.current && !DEMO;
    if (!on) {
      if (m.getLayer('relief')) m.removeLayer('relief');
      return;
    }
    if (!m.getSource('dem')) {
      m.addSource('dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14,
        attribution: 'Mapzen · AWS Terrain Tiles',
      });
    }
    if (m.getLayer('relief')) return;
    const dark = !m.getStyle().name?.toLowerCase().includes('liberty') && latestTheme.current === 'dark';
    const firstSymbol = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m.addLayer({
      id: 'relief', type: 'hillshade', source: 'dem',
      paint: {
        'hillshade-exaggeration': dark ? 0.75 : 0.5,
        'hillshade-shadow-color': dark ? '#000000' : '#473b24',
        'hillshade-highlight-color': dark ? '#8a8f9c' : '#ffffff',
        'hillshade-accent-color': dark ? '#1a1d24' : '#5a4a2f',
      },
    }, firstSymbol);
  }

  /** Fonts i capes pròpies: es tornen a afegir cada cop que canvia l'estil del mapa. */
  function addLayers(m: MlMap) {
      const img = (id: string, data: ReturnType<typeof pinImage>) => { if (!m.hasImage(id)) m.addImage(id, data, { pixelRatio: 2 }); };
      img('pin-fuel', pinImage(PIN_PATHS.fuel, '#f4f4f5', '#08080a', 26));
      img('pin-stop', pinImage(PIN_PATHS.fuel, ROUTE_RED, '#fff', 34));
      img('pin-bed', pinImage(PIN_PATHS.bed, '#8b5cf6', '#fff', 30));
      img('wx-arrow', pinImage(PIN_PATHS.arrow, null, '#fff', 18));
      applyRelief(m);
      const add = (id: string) => m.addSource(id, { type: 'geojson', data: fc([]) });
      ['routes', 'weather', 'stations', 'stops', 'stages', 'accom', 'places', 'live', 'me'].forEach(add);

      m.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000', 'line-width': ['case', ['get', 'selected'], 10, 5], 'line-opacity': ['case', ['get', 'selected'], 0.7, 0.35] } });
      m.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['get', 'selected'], 2, 1] },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5.5, 3], 'line-opacity': ['case', ['get', 'selected'], 1, 0.55] } });
      m.addLayer({ id: 'stations', type: 'symbol', source: 'stations',
        layout: { 'icon-image': 'pin-fuel', 'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.78, 11, 1], 'icon-allow-overlap': false, 'icon-padding': 0 } });
      m.addLayer({ id: 'accom', type: 'symbol', source: 'accom',
        layout: { 'icon-image': 'pin-bed', 'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 10, 1.05], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      m.addLayer({ id: 'weather', type: 'circle', source: 'weather', filter: ['>=', ['get', 'level'], 1],
        paint: { 'circle-radius': ['+', 6, ['*', 2, ['get', 'level']]], 'circle-color': ['get', 'color'], 'circle-opacity': 0.85, 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'stops', type: 'symbol', source: 'stops',
        layout: { 'icon-image': 'pin-stop', 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      m.addLayer({ id: 'stages', type: 'circle', source: 'stages',
        paint: { 'circle-radius': 11, 'circle-color': '#08080a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      if (!DEMO) m.addLayer({ id: 'stages-label', type: 'symbol', source: 'stages',
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#fff' } });
      m.addLayer({ id: 'live-casing', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000', 'line-width': 9, 'line-opacity': 0.6 } });
      m.addLayer({ id: 'live', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_RED, 'line-width': 5 } });
      m.addLayer({ id: 'me-halo', type: 'circle', source: 'me',
        paint: { 'circle-radius': 16, 'circle-color': '#4da3ff', 'circle-opacity': 0.25 } });
      m.addLayer({ id: 'me', type: 'circle', source: 'me',
        paint: { 'circle-radius': 8, 'circle-color': '#4da3ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      m.addLayer({ id: 'places', type: 'circle', source: 'places',
        paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
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
      eta: w.eta.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      reasons: w.reasons.join(' · '),
    }))));
    setData('stations', fc((q.stations ?? []).map((s) => pt(s.coord, { brand: s.brand, town: s.town, price: s.price?.toFixed(3), km: Math.round(s.km) }))));
    setData('stops', fc((q.stops ?? []).map((s) => pt(s.coord, { brand: s.brand, price: s.price?.toFixed(3), km: Math.round(s.km) }))));
    setData('stages', fc((q.stages ?? []).length > 1 ? q.stages!.slice(0, -1).map((s) => pt(s.end, { label: String(s.index + 1) })) : []));
    setData('accom', fc((q.accommodations ?? []).map((a) => pt(a.coord, { name: a.name, kind: a.kind, stars: a.stars ?? '' }))));
    const places: GeoJSON.Feature[] = [];
    if (q.origin) places.push(pt(q.origin.coord, { color: '#2ee88f' }));
    if (q.destination) places.push(pt(q.destination.coord, { color: ROUTE_RED }));
    q.vias.forEach((v) => places.push(pt(v.coord, { color: '#4da3ff' })));
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

  function switchTheme() {
    const next: MapTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('mrb.mapstyle', next); } catch { /* sense emmagatzematge */ }
    const m = map.current;
    if (!m) return;
    ready.current = false;
    m.setStyle(STYLES[next]);
    latestTheme.current = next;
    m.once('style.load', () => {
      addLayers(m);
      ready.current = true;
      setStyleRev((n) => n + 1);
      sync();
    });
  }

  function toggleRelief() {
    const next = !relief;
    setRelief(next);
    reliefRef.current = next;
    try { localStorage.setItem('mrb.relief', next ? '1' : '0'); } catch { /* sense emmagatzematge */ }
    if (map.current && ready.current) applyRelief(map.current);
  }

  // ---------- Meteo al mapa ----------
  const wxWanted = useRef<WxVar | null>(null);
  wxWanted.current = wxVar;
  const wxGridRef = useRef<WxGrid | null>(null);
  wxGridRef.current = wxGrid;

  async function loadWx() {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    const padX = (b.getEast() - b.getWest()) * 0.2;
    const padY = (b.getNorth() - b.getSouth()) * 0.2;
    setWxBusy(true);
    setWxError(false);
    try {
      const grid = await fetchWxGrid(b.getWest() - padX, b.getSouth() - padY, b.getEast() + padX, b.getNorth() + padY);
      if (wxWanted.current) { setWxGrid(grid); setWxHour((h) => Math.min(h, grid.hours.length - 1)); }
    } catch {
      setWxError(true);
    } finally {
      setWxBusy(false);
    }
  }

  /** La graella encara cobreix el que es veu (i no s'ha fet massa zoom)? */
  function wxCovers() {
    const m = map.current;
    const g = wxGridRef.current;
    if (!m || !g) return false;
    const b = m.getBounds();
    const inside = b.getWest() >= g.west && b.getEast() <= g.east && b.getSouth() >= g.south && b.getNorth() <= g.north;
    return inside && (b.getEast() - b.getWest()) > (g.east - g.west) * 0.3;
  }

  useEffect(() => {
    const m = map.current;
    if (!wxVar || !m) return;
    if (!wxCovers()) void loadWx();
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (wxWanted.current && !wxCovers()) void loadWx(); }, 700);
    };
    m.on('moveend', onMove);
    return () => { clearTimeout(timer); m.off('moveend', onMove); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wxVar, styleRev]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    if (!wxVar || !wxGrid) {
      for (const id of ['wx', 'wx-val']) if (m.getLayer(id)) m.removeLayer(id);
      for (const id of ['wx', 'wx-pts']) if (m.getSource(id)) m.removeSource(id);
      return;
    }
    const w = 144;
    const h = 112;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.putImageData(new ImageData(renderWx(wxGrid, wxVar, wxHour, w, h) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    const url = c.toDataURL('image/png');
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [wxGrid.west, wxGrid.north], [wxGrid.east, wxGrid.north], [wxGrid.east, wxGrid.south], [wxGrid.west, wxGrid.south],
    ];
    const src = m.getSource('wx') as { updateImage?: (o: { url: string; coordinates: typeof coordinates }) => void } | undefined;
    if (src?.updateImage) src.updateImage({ url, coordinates });
    else {
      m.addSource('wx', { type: 'image', url, coordinates });
      m.addLayer({ id: 'wx', type: 'raster', source: 'wx', paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, m.getLayer('routes-casing') ? 'routes-casing' : undefined);
    }
    const hour = Math.min(wxHour, wxGrid.hours.length - 1);
    const vals = wxGrid.values[wxVar][hour];
    const dirs = wxGrid.values.windDir[hour];
    const pts = fc(vals.map((v, i) => {
      const hide = (wxVar === 'precip' && v < 0.1) || (wxVar === 'cloud' && v < 5);
      return pt([wxGrid.lons[i % wxGrid.cols], wxGrid.lats[Math.floor(i / wxGrid.cols)]], {
        label: hide ? '' : wxVar === 'precip' ? v.toFixed(1) : String(Math.round(v)),
        ...(wxVar === 'wind' ? { rot: (dirs[i] + 180) % 360 } : {}),
      });
    }));
    const ptsSrc = m.getSource('wx-pts') as GeoJSONSource | undefined;
    if (ptsSrc) ptsSrc.setData(pts);
    else {
      m.addSource('wx-pts', { type: 'geojson', data: pts });
      m.addLayer({ id: 'wx-val', type: 'symbol', source: 'wx-pts',
        layout: {
          'text-field': ['get', 'label'], 'text-size': 11.5, 'text-font': ['Noto Sans Bold'],
          'icon-image': ['case', ['has', 'rot'], 'wx-arrow', ''], 'icon-rotate': ['coalesce', ['get', 'rot'], 0], 'icon-rotation-alignment': 'map',
          'text-offset': ['case', ['has', 'rot'], ['literal', [0, 1.3]], ['literal', [0, 0]]], 'text-optional': true,
        },
        paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } });
    }
  }, [wxVar, wxGrid, wxHour, styleRev]);

  useEffect(() => {
    if (!wxPlay || !wxGrid) return;
    const id = setInterval(() => setWxHour((h) => (h + 1) % wxGrid.hours.length), 650);
    return () => clearInterval(id);
  }, [wxPlay, wxGrid]);

  function toggleWx() {
    if (wxVar) { setWxVar(null); setWxPlay(false); }
    else setWxVar('precip');
  }
  // amb la meteo oberta, el mapa guanya alçada al mòbil
  useEffect(() => {
    document.body.classList.toggle('wx-open', !!wxVar);
    return () => document.body.classList.remove('wx-open');
  }, [wxVar]);
  const wxTime = wxGrid ? new Date(wxGrid.hours[Math.min(wxHour, wxGrid.hours.length - 1)] * 1000) : null;
  const wxRamp = wxVar ? WX_RAMP[wxVar] : null;

  return (
    <>
      <div ref={el} className="map" />
      {!DEMO && (
        <button className="map-style-btn" onClick={switchTheme} aria-label={theme === 'dark' ? t("Mapa clar") : t("Mapa fosc")} title={theme === 'dark' ? t("Mapa clar") : t("Mapa fosc")}>
          <Icon name="layers" size={18} />
        </button>
      )}
      {!DEMO && (
        <>
          <button className={`map-style-btn second ${relief ? 'on' : ''}`} onClick={toggleRelief} aria-pressed={relief} aria-label={t("Relleu")} title={t("Relleu")}>
            <Icon name="mountain" size={18} />
          </button>
          <button className={`map-style-btn third ${wxVar ? 'on' : ''}`} onClick={toggleWx} aria-pressed={!!wxVar} aria-label={t("Meteo al mapa")} title={t("Meteo al mapa")}>
            <Icon name="cloud" size={18} />
          </button>
        </>
      )}
      {wxVar && wxRamp && (
        <div className="wx-bar">
          <div className="wx-vars">
            {WX_VARS.map((v) => (
              <button key={v.id} className={wxVar === v.id ? 'on' : ''} onClick={() => setWxVar(v.id)}>
                <Icon name={v.icon} size={16} /><span>{v.label}</span>
              </button>
            ))}
          </div>
          {wxError && <div className="wx-msg">{t("No s'ha pogut obtenir la previsió meteorològica")}</div>}
          {wxGrid && wxTime && (
            <>
              <div className="wx-time">
                <button onClick={() => setWxPlay(!wxPlay)} aria-label={wxPlay ? t("Pausa") : t("Reprodueix")}><Icon name={wxPlay ? 'pause' : 'play'} size={16} /></button>
                <input type="range" min={0} max={wxGrid.hours.length - 1} value={Math.min(wxHour, wxGrid.hours.length - 1)}
                  onChange={(e) => { setWxPlay(false); setWxHour(+e.target.value); }} aria-label={t("Hora de la previsió")} />
                <b>{wxTime.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</b>
              </div>
              <div className="wx-legend">
                <span>{wxRamp[0][0]}</span>
                <i style={{ background: legendGradient(wxVar) }} />
                <span>{wxRamp[wxRamp.length - 1][0]}{wxVar === 'precip' || wxVar === 'wind' ? '+' : ''} {WX_UNIT[wxVar]}</span>
              </div>
            </>
          )}
          {wxBusy && !wxGrid && <div className="wx-msg">{t("Carregant…")}</div>}
          <button className="wx-hourly" onClick={() => { const c = map.current?.getCenter(); if (c) { setWxPlay(false); setHourlyAt([c.lng, c.lat]); } }}>
            <Icon name="clock" size={15} /> {t("Previsió per hores")} <Icon name="chevron-right" size={15} className="flip" />
          </button>
        </div>
      )}
      {hourlyAt && <HourlyForecast coord={hourlyAt} initial={wxVar ?? undefined} onClose={() => setHourlyAt(null)} />}
    </>
  );
}
