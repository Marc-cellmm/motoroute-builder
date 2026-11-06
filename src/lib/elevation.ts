import { resample } from './geo';
import type { LngLat } from './types';

/** Perfil d'elevació amb l'API d'elevació d'Open-Meteo (màx. 100 punts per crida). */
export async function elevationProfile(coords: LngLat[], totalKm: number) {
  const step = Math.max(0.5, totalKm / 240);
  const { points, km } = resample(coords, step);
  const elev: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const lat = chunk.map((p) => p[1].toFixed(5)).join(',');
    const lng = chunk.map((p) => p[0].toFixed(5)).join(',');
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
      const json = await res.json();
      elev.push(...(json.elevation as number[]));
    } catch {
      elev.push(...chunk.map(() => NaN));
    }
  }
  // omple forats si alguna crida ha fallat
  for (let i = 0; i < elev.length; i++) if (!Number.isFinite(elev[i])) elev[i] = elev[i - 1] ?? 0;
  return { km, points, elev };
}
