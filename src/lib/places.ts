import type { Accommodation, LngLat, Place } from './types';
import { haversine } from './geo';

/** Autocompletat amb Photon (OpenStreetMap), esbiaixat cap a Catalunya. */
export async function searchPlaces(q: string, near?: LngLat): Promise<Place[]> {
  if (q.trim().length < 3) return [];
  const [lon, lat] = near ?? [1.6, 41.6];
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${lat}&lon=${lon}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.features as { geometry: { coordinates: LngLat }; properties: Record<string, string> }[]).map((f) => {
    const p = f.properties;
    const parts = [p.name, p.city && p.city !== p.name ? p.city : null, p.state].filter(Boolean);
    return { name: parts.join(', '), coord: f.geometry.coordinates };
  });
}

export async function reverseGeocode(coord: LngLat): Promise<string> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${coord[0]}&lat=${coord[1]}`);
    const json = await res.json();
    const p = json.features?.[0]?.properties;
    return p ? [p.name, p.city].filter(Boolean).join(', ') : 'La meva ubicació';
  } catch {
    return 'La meva ubicació';
  }
}

const KIND_LABEL: Record<string, string> = {
  hotel: 'Hotel',
  motel: 'Motel',
  guest_house: 'Casa rural / pensió',
  hostel: 'Alberg',
  camp_site: 'Càmping',
  apartment: 'Apartament',
  chalet: 'Xalet',
};

/** Allotjaments d'OpenStreetMap en un radi (Overpass API). */
export async function searchAccommodation(center: LngLat, radiusKm = 10): Promise<Accommodation[]> {
  const q = `[out:json][timeout:25];
(nwr["tourism"~"^(hotel|motel|guest_house|hostel|camp_site|apartment|chalet)$"](around:${radiusKm * 1000},${center[1]},${center[0]}););
out center 60;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error('El servei d\'allotjaments (Overpass) està saturat; torna-ho a provar.');
  const json = await res.json();
  return (json.elements as {
    id: number;
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }[])
    .filter((e) => e.tags?.name)
    .map((e) => {
      const coord: LngLat = [e.lon ?? e.center!.lon, e.lat ?? e.center!.lat];
      const stars = parseInt(e.tags!.stars ?? '', 10);
      return {
        id: `${e.type}/${e.id}`,
        name: e.tags!.name,
        kind: KIND_LABEL[e.tags!.tourism] ?? e.tags!.tourism,
        coord,
        stars: Number.isFinite(stars) ? Math.min(5, stars) : null,
        website: e.tags!.website || e.tags!['contact:website'],
        phone: e.tags!.phone || e.tags!['contact:phone'],
        distanceKm: Math.round(haversine(center, coord) * 10) / 10,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
