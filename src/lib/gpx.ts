import type { RouteResult } from './types';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function toGpx(route: RouteResult, title: string): string {
  const pts = route.coords.map(([lng, lat]) => `<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join('\n');
  const stops = (route.fuel?.stops ?? [])
    .map((s) => `<wpt lat="${s.coord[1]}" lon="${s.coord[0]}"><name>${esc(`Benzina: ${s.brand}`)}</name></wpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoRoute Builder" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(title)}</name></metadata>
${stops}
<trk><name>${esc(title)}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>`;
}

export function downloadText(filename: string, text: string, mime = 'application/gpx+xml') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
