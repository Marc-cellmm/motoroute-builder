import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { t } from '../i18n';

/**
 * Font de posicions GPS. A l'app nativa (iPhone) fa servir el plugin de geolocalització en
 * segon pla, que continua rebent posicions amb la pantalla apagada. A la web, el GPS del
 * navegador (només amb la pantalla encesa).
 */
export const isNativeApp = Capacitor.isNativePlatform();

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  speedMs: number | null;
  time: number;
}

export type LocationError = 'denied' | 'unavailable' | 'timeout';

export interface Watch {
  stop: () => void;
}

/**
 * Comença a rebre posicions. `background` = continuar amb la pantalla apagada (només app nativa).
 */
export async function watchLocation(
  background: boolean,
  onPosition: (p: Position) => void,
  onError: (e: LocationError) => void,
): Promise<Watch> {
  if (isNativeApp) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        // amb backgroundMessage, iOS continua enviant posicions amb la pantalla apagada
        ...(background ? { backgroundMessage: t("Gravant la ruta"), backgroundTitle: 'MotoRoute' } : {}),
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (loc, err) => {
        if (err) {
          onError(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable');
          return;
        }
        if (!loc) return;
        onPosition({
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy,
          altitude: loc.altitude,
          speedMs: loc.speed,
          time: loc.time ?? Date.now(),
        });
      },
    );
    return { stop: () => void BackgroundGeolocation.removeWatcher({ id }) };
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords;
      onPosition({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, altitude: c.altitude, speedMs: c.speed, time: pos.timestamp });
    },
    (err) => onError(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.POSITION_UNAVAILABLE ? 'unavailable' : 'timeout'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  return { stop: () => navigator.geolocation.clearWatch(id) };
}

/** Obre la configuració de l'app (per activar la ubicació «Sempre»). Només app nativa. */
export function openAppSettings() {
  if (isNativeApp) void BackgroundGeolocation.openSettings();
}

/**
 * La posició actual, una sola vegada i ràpid: primer accepta una posició recent (fins a 5 min)
 * o aproximada, i només si no n'hi ha espera el GPS precís. Mai espera més de ~20 s.
 * A l'app nativa fa servir el GPS del sistema (un sol permís, sense el diàleg del navegador).
 */
export function currentPosition(): Promise<[number, number]> {
  if (isNativeApp) {
    return new Promise((resolve, reject) => {
      let id: string | null = null;
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (id) void BackgroundGeolocation.removeWatcher({ id });
        fn();
      };
      const timer = setTimeout(() => finish(() => reject('timeout' as LocationError)), 20000);
      BackgroundGeolocation.addWatcher({ requestPermissions: true, stale: true, distanceFilter: 0 }, (loc, err) => {
        if (err) finish(() => reject((err.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable') as LocationError));
        else if (loc) finish(() => resolve([loc.longitude, loc.latitude]));
      }).then((w) => { id = w; if (done) void BackgroundGeolocation.removeWatcher({ id: w }); })
        .catch(() => finish(() => reject('unavailable' as LocationError)));
    });
  }
  const once = (opts: PositionOptions) =>
    new Promise<[number, number]>((resolve, reject) => {
      if (!navigator.geolocation) return reject('unavailable' as LocationError);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.longitude, p.coords.latitude]),
        (e) => reject((e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable') as LocationError),
        opts,
      );
    });
  return once({ enableHighAccuracy: false, maximumAge: 300000, timeout: 7000 }).catch((e) =>
    e === 'denied' ? Promise.reject(e) : once({ enableHighAccuracy: true, maximumAge: 0, timeout: 13000 }),
  );
}
