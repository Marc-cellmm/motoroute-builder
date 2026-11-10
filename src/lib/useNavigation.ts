import { useCallback, useEffect, useRef, useState } from 'react';
import { callValhalla, traceManeuvers } from './routing';
import {
  dueAnnouncement, isOffRoute, locate, locateAnywhere, makeLeg, nextManeuver, phrase, rejoinPoint, type NavLeg,
} from './navigation';
import { simplify } from './geo';
import type { LiveFix } from './recorder';
import type { Maneuver, PlanRequest, RouteResult } from './types';
import { lang, t } from '../i18n';

export type NavStatus = 'preparing' | 'guiding' | 'rerouting' | 'arrived' | 'no-instructions';

export interface NavView {
  status: NavStatus;
  next: { maneuver: Maneuver; distanceKm: number } | null;
  then: Maneuver | null; // la maniobra següent a la propera
  remainingKm: number;
  etaMin: number;
  offRoute: boolean;
  onDetour: boolean;
  detourCoords: [number, number][] | null;
  error: string | null;
}

type Costing = Pick<PlanRequest, 'mode' | 'difficulty' | 'avoidMotorways' | 'avoidTolls'>;

/** Veu en català (o castellà si el telèfon no en té). */
function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const want = lang().speech.toLowerCase();
    const base = want.split('-')[0];
    const v = voices.find((x) => x.lang.toLowerCase().replace('_', '-') === want) ?? voices.find((x) => x.lang.toLowerCase().startsWith(base));
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang().speech;
    u.rate = 1.02;
    synth.cancel(); // l'avís nou substitueix el que quedi pendent
    synth.speak(u);
  } catch {
    /* sense veu disponible */
  }
}

export function useNavigation(route: RouteResult | null, fix: LiveFix | null, costing: Costing, voiceOn: boolean) {
  const [main, setMain] = useState<NavLeg | null>(null);
  const [detour, setDetour] = useState<{ leg: NavLeg; rejoinKm: number } | null>(null);
  const [view, setView] = useState<NavView>({
    status: 'preparing', next: null, then: null, remainingKm: 0, etaMin: 0, offRoute: false, onDetour: false, detourCoords: null, error: null,
  });
  const km = useRef(-1); // km actual a la ruta principal (-1 = encara no situat)
  const detourKm = useRef(0);
  const offsets = useRef<number[]>([]);
  const said = useRef(new Map<string, Set<number>>());
  const reroutingAt = useRef(0);
  const arrived = useRef(false);
  const voice = useRef(voiceOn);
  voice.current = voiceOn;

  // Prepara la ruta: si no té instruccions (GPX, gravada, comunitat), les demana al motor.
  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    km.current = -1;
    arrived.current = false;
    said.current = new Map();
    setDetour(null);
    (async () => {
      if (route.maneuvers?.length) {
        setMain(makeLeg(route.coords, route.maneuvers));
        setView((v) => ({ ...v, status: 'guiding', error: null }));
        return;
      }
      setView((v) => ({ ...v, status: 'preparing' }));
      try {
        const t = await traceManeuvers(simplify(route.coords, 0.01));
        if (!cancelled) {
          setMain(makeLeg(t.coords, t.maneuvers));
          setView((v) => ({ ...v, status: 'guiding', error: null }));
        }
      } catch (e) {
        if (!cancelled) {
          setMain(makeLeg(route.coords, []));
          setView((v) => ({ ...v, status: 'no-instructions', error: (e as Error).message }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [route]);

  const reroute = useCallback(async (from: [number, number], lastKm: number) => {
    if (!main || Date.now() - reroutingAt.current < 15000) return;
    reroutingAt.current = Date.now();
    setView((v) => ({ ...v, status: 'rerouting' }));
    if (voice.current) speak(t("Recalculant per tornar a la ruta."));
    const target = rejoinPoint(from, main, lastKm);
    try {
      const [r] = await callValhalla([{ coord: from, type: 'break' }, { coord: target.coord, type: 'break' }], costing);
      setDetour({ leg: makeLeg(r.coords, r.maneuvers), rejoinKm: target.km });
      detourKm.current = 0;
      offsets.current = [];
      setView((v) => ({ ...v, status: 'guiding' }));
    } catch {
      setView((v) => ({ ...v, status: 'guiding', error: t("Sense connexió per recalcular: torna a la línia del mapa.") }));
    }
  }, [main, costing]);

  // Cada posició nova: situar, anunciar, detectar desviaments.
  useEffect(() => {
    if (!main || !fix || arrived.current) return;
    const p = fix.coord;
    const speed = fix.speedKmh ?? 40;

    // 1) en un desviament per tornar a la ruta
    if (detour) {
      const d = locate(p, detour.leg, detourKm.current, 0.3, 5);
      detourKm.current = d.km;
      const onMain = locate(p, main, detour.rejoinKm, 0.5, 1);
      if (detour.leg.totalKm - d.km < 0.04 || (onMain.offset < 0.03 && onMain.km >= detour.rejoinKm - 0.3)) {
        km.current = Math.max(detour.rejoinKm, onMain.km);
        setDetour(null);
        offsets.current = [];
        if (voice.current) speak(t("Has tornat a la ruta."));
        return;
      }
      offsets.current = [...offsets.current.slice(-4), d.offset];
      if (isOffRoute(offsets.current)) void reroute(p, Math.max(km.current, 0));
      publish(detour.leg, d.km, 'detour', true);
      return;
    }

    // 2) a la ruta principal
    const loc = km.current < 0 || offsets.current.at(-1)! > 0.5 ? locateAnywhere(p, main) : locate(p, main, km.current);
    if (km.current < 0 && loc.offset > 0.3) {
      // lluny de l'inici: guia fins al punt més proper de la ruta (per davant de l'inici)
      km.current = Math.max(0, loc.km) - 1.01;
      void reroute(p, km.current);
      km.current = Math.max(0, loc.km);
      return;
    }
    if (loc.offset < 0.05) km.current = Math.max(km.current, loc.km); // mai enrere per soroll
    offsets.current = [...offsets.current.slice(-4), loc.offset];
    const off = isOffRoute(offsets.current);
    if (off) void reroute(p, km.current);

    if (main.totalKm - km.current < 0.04 && loc.offset < 0.06) {
      arrived.current = true;
      if (voice.current) speak(t("Has arribat al final de la ruta."));
      setView((v) => ({ ...v, status: 'arrived', next: null, then: null, remainingKm: 0 }));
      return;
    }
    publish(main, km.current, 'main', false, off);

    function publish(leg: NavLeg, at: number, legId: string, onDetour: boolean, offRoute = false) {
      const n = nextManeuver(leg, at);
      if (n && voice.current) {
        const key = `${legId}-${n.index}`;
        const set = said.current.get(key) ?? new Set<number>();
        said.current.set(key, set);
        const prevKm = n.index > 0 ? leg.maneuvers[n.index - 1].km : 0;
        const t = dueAnnouncement(n.distanceKm, speed, set, n.maneuver.km - prevKm);
        if (t !== null) speak(phrase(n.maneuver, n.distanceKm, t <= 0.05));
      }
      const remaining = onDetour && detour
        ? leg.totalKm - at + (main!.totalKm - detour.rejoinKm)
        : leg.totalKm - at;
      setView({
        status: 'guiding',
        next: n ? { maneuver: n.maneuver, distanceKm: n.distanceKm } : null,
        then: n ? leg.maneuvers[n.index + 1] ?? null : null,
        remainingKm: Math.max(0, remaining),
        etaMin: (Math.max(0, remaining) / Math.max(30, Math.min(speed || 0, 90) || 45)) * 60,
        offRoute,
        onDetour,
        detourCoords: onDetour && detour ? detour.leg.coords : null,
        error: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, main, detour]);

  /** Repeteix en veu la propera instrucció (botó de l'usuari). */
  const repeat = useCallback(() => {
    if (view.next) speak(phrase(view.next.maneuver, view.next.distanceKm, view.next.distanceKm < 0.05));
  }, [view.next]);

  return { view, repeat, mainCoords: main?.coords ?? null };
}
