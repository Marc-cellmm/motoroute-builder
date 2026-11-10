/**
 * Traduccions de MotoRoute.
 * El text original (en català) és la clau: t('Comença a gravar').
 * Cada idioma és un JSON { hash del text original: traducció }; si falta una traducció, surt el català.
 * Per canviar d'idioma es desa la tria i es recarrega l'app (és un canvi que es fa poques vegades).
 */

export interface Lang {
  code: string;
  name: string; // nom en el propi idioma
  english: string;
  locale: string; // per a dates i números
  valhalla: string; // idioma de les instruccions de navegació
  speech: string; // veu
  rtl?: boolean;
}

export const LANGS: Lang[] = [
  { code: 'es', name: 'Español', english: 'Spanish', locale: 'es-ES', valhalla: 'es-ES', speech: 'es-ES' },
  { code: 'ca', name: 'Català', english: 'Catalan', locale: 'ca-ES', valhalla: 'ca-ES', speech: 'ca-ES' },
  { code: 'en', name: 'English', english: 'English', locale: 'en-GB', valhalla: 'en-US', speech: 'en-GB' },
  { code: 'fr', name: 'Français', english: 'French', locale: 'fr-FR', valhalla: 'fr-FR', speech: 'fr-FR' },
  { code: 'de', name: 'Deutsch', english: 'German', locale: 'de-DE', valhalla: 'de-DE', speech: 'de-DE' },
  { code: 'it', name: 'Italiano', english: 'Italian', locale: 'it-IT', valhalla: 'it-IT', speech: 'it-IT' },
  { code: 'pt', name: 'Português', english: 'Portuguese', locale: 'pt-PT', valhalla: 'pt-PT', speech: 'pt-PT' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', locale: 'nl-NL', valhalla: 'nl-NL', speech: 'nl-NL' },
  { code: 'ro', name: 'Română', english: 'Romanian', locale: 'ro-RO', valhalla: 'ro-RO', speech: 'ro-RO' },
  { code: 'ru', name: 'Русский', english: 'Russian', locale: 'ru-RU', valhalla: 'ru-RU', speech: 'ru-RU' },
  { code: 'ary', name: 'الدارجة المغربية', english: 'Moroccan Arabic', locale: 'ar-MA', valhalla: 'fr-FR', speech: 'ar-MA', rtl: true },
  { code: 'zh', name: '中文（简体）', english: 'Chinese', locale: 'zh-CN', valhalla: 'en-US', speech: 'zh-CN' },
];

const KEY = 'mrb.lang';
let dict: Record<string, string> = {};
let current: Lang = LANGS[1];

/** Hash curt del text original (FNV-1a de 32 bits en base 36). El mateix càlcul fa scripts/i18n-extract.mjs. */
export function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Tradueix un text. Variables: t('Hola, {name}', { name }) o t('{0} km', [n]). */
export function t(src: string, vars?: Record<string, unknown> | unknown[]): string {
  let out = dict[hashKey(src)] ?? src;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => {
    const v = Array.isArray(vars) ? vars[Number(k)] : (vars as Record<string, unknown>)[k];
    return v == null ? m : String(v);
  });
  return out;
}

export const lang = () => current;
export const locale = () => current.locale;

export function savedLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Idioma del sistema, si el tenim. */
export function deviceLang(): string {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'es'];
  for (const l of list) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'ar') return 'ary';
    if (LANGS.some((x) => x.code === base)) return base;
  }
  return 'es';
}

const loaders = import.meta.glob('./locales/*.json', { import: 'default' }) as Record<string, () => Promise<Record<string, string>>>;

/** Carrega l'idioma desat (o el del sistema) abans de pintar l'app. */
export async function initI18n(code = savedLang() ?? deviceLang()) {
  current = LANGS.find((l) => l.code === code) ?? LANGS[0];
  const load = loaders[`./locales/${current.code}.json`];
  dict = load ? await load().catch(() => ({})) : {};
  document.documentElement.lang = current.code === 'ary' ? 'ar-MA' : current.code;
  document.documentElement.dir = current.rtl ? 'rtl' : 'ltr';
}

export function setLang(code: string, reload = true) {
  try {
    localStorage.setItem(KEY, code);
  } catch { /* sense emmagatzematge */ }
  if (reload) location.reload();
}

/** Nom d'un país en l'idioma actual (Intl.DisplayNames ja ve traduït pel sistema). */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([current.locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
