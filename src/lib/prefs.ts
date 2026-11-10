/** Preferències d'aquest dispositiu: mida del text i instal·lació com a app. */
import { isNativeApp } from './location';

const TEXT_KEY = 'mrb.textsize';

export function textLarge(): boolean {
  try {
    return localStorage.getItem(TEXT_KEY) === 'large';
  } catch {
    return false;
  }
}

export function applyTextSize(large = textLarge()) {
  document.documentElement.classList.toggle('text-lg', large);
}

export function setTextLarge(large: boolean) {
  try {
    localStorage.setItem(TEXT_KEY, large ? 'large' : 'normal');
  } catch { /* sense emmagatzematge */ }
  applyTextSize(large);
}

// --- Instal·lar la web com a app (Android, Chrome i Edge d'escriptori) ---
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const onInstallChange = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const canPromptInstall = () => !!deferred;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

export const isStandalone = () =>
  isNativeApp || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Safari de l'iPhone: no té botó d'instal·lar, cal fer-ho des de Compartir. */
export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
