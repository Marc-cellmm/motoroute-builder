import { cumulativeKm, pointAtKm } from './geo';
import { elevationProfile } from './elevation';
import { planRoutes } from './routing';
import { elevationStats, scoreRoute, styleMatch } from './scoring';
import { bestDepartures, evaluate, fetchWeather } from './weather';
import { effectiveConsumption, loadStations, planFuelStops, stationsOnRoute } from './fuel';
import type { Motorcycle, PlanRequest, RouteResult, Stage } from './types';

import { ROUTE_COLORS as COLORS } from './theme';
import { t } from '../i18n';
const LABELS = [t("Opció A"), t("Opció B"), t("Opció C"), t("Opció D"), t("Opció E"), t("Opció F")];
const BREAK_FACTOR = 1.1; // parades curtes, fotos, cafè

export async function buildRoutes(req: PlanRequest, progress: (msg: string) => void) {
  progress(t("Calculant rutes amb el perfil de moto…"));
  const { routes, note } = await planRoutes(req);
  const out: RouteResult[] = [];
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    progress(t("Analitzant corbes i desnivell ({0}/{1})…", [i + 1, routes.length]));
    // El motor ja retorna l'elevació; Open-Meteo només com a alternativa.
    const prof = r.elevations && r.profileKm
      ? { km: r.profileKm, elev: r.elevations }
      : await elevationProfile(r.coords, r.distanceKm);
    const stats = elevationStats(prof.elev);
    const scoring = scoreRoute(req.mode, r.coords, prof.km, prof.elev, r.unpavedRanges);
    out.push({
      id: `${Date.now()}-${i}`,
      label: '',
      color: '',
      coords: r.coords,
      elevations: prof.elev,
      profileKm: prof.km,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin * BREAK_FACTOR,
      unpavedKm: r.unpavedKm,
      motorwayKm: r.motorwayKm,
      elevationGain: stats.gain,
      maxAltitude: stats.max,
      maneuvers: r.maneuvers,
      ...scoring,
    });
  }
  // treu les gairebé idèntiques i ordena per afinitat amb els gustos del motorista
  const unique = out.filter((r, i) => !out.slice(0, i).some((o) =>
    Math.abs(o.distanceKm - r.distanceKm) < 1.5 && Math.abs(o.elevationGain - r.elevationGain) < 40 && o.curvatureScore === r.curvatureScore));
  for (const r of unique) r.match = styleMatch(r, req.style);
  unique.sort((a, b) => b.match! - a.match!);
  unique.forEach((r, i) => { r.label = LABELS[i] ?? `${i + 1}`; r.color = COLORS[i % COLORS.length]; });
  return { routes: unique.slice(0, 6), note };
}

/** Divideix en etapes de `kmPerDay` i retorna una funció d'hora estimada de pas. */
export function makeSchedule(route: RouteResult, req: PlanRequest) {
  const departure = new Date(req.departure);
  const days = Math.max(1, req.days);
  const kpd = days > 1 ? Math.max(50, req.kmPerDay || Math.ceil(route.distanceKm / days)) : route.distanceKm;
  const cum = cumulativeKm(route.coords);
  const stages: Stage[] = [];
  for (let i = 0, start = 0; start < route.distanceKm - 1 && i < 30; i++, start += kpd) {
    const end = Math.min(route.distanceKm, start + kpd);
    const date = new Date(departure);
    date.setDate(date.getDate() + i);
    stages.push({ index: i, kmStart: start, kmEnd: end, end: pointAtKm(route.coords, cum, (end / route.distanceKm) * cum.at(-1)!), date });
  }
  const minPerKm = route.durationMin / route.distanceKm;
  const etaAtKm = (km: number) => {
    const st = stages.find((s) => km <= s.kmEnd) ?? stages.at(-1)!;
    return new Date(st.date.getTime() + (km - st.kmStart) * minPerKm * 60000);
  };
  return { stages, etaAtKm };
}

export async function enrichWeather(route: RouteResult, req: PlanRequest) {
  const { etaAtKm, stages } = makeSchedule(route, req);
  const cum = cumulativeKm(route.coords);
  const scale = cum.at(-1)! / route.distanceKm;
  const step = Math.max(15, route.distanceKm / 20); // ≤ 21 punts: no saturar Open-Meteo
  const samples = [];
  for (let km = 0; km <= route.distanceKm; km += step) {
    const idx = route.profileKm.findIndex((k) => k >= km);
    samples.push({
      km,
      coord: pointAtKm(route.coords, cum, km * scale),
      altitude: route.elevations[idx >= 0 ? idx : route.elevations.length - 1] ?? 0,
      eta: etaAtKm(km),
    });
  }
  const lastDay = stages.at(-1)!.date;
  const data = await fetchWeather(samples, new Date(req.departure), lastDay);
  const weather = evaluate(samples, data);
  const best = stages.length === 1 ? bestDepartures(samples, data, route.durationMin) : undefined;
  return { weather, bestDepartures: best, stages };
}

export async function enrichFuel(route: RouteResult, req: PlanRequest, bike: Motorcycle) {
  const all = await loadStations();
  const { etaAtKm } = makeSchedule(route, req);
  const gainPer100 = (route.elevationGain / route.distanceKm) * 100;
  const consumption = effectiveConsumption(bike, req.mode, gainPer100);
  const stations = stationsOnRoute(all, route.coords, bike.fuel, req.mode === 'trail' ? 5 : 2);
  // els km de les estacions són geomètrics; s'escalen a la distància del motor
  const geomTotal = cumulativeKm(route.coords).at(-1)!;
  const k = route.distanceKm / geomTotal;
  const scaled = stations.map((s) => ({ ...s, km: s.km * k }));
  return planFuelStops({
    routeKm: route.distanceKm,
    bike,
    consumption,
    startFraction: req.startFuelFraction,
    stations: scaled,
    etaAtKm,
  });
}
