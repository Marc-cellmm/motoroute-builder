/**
 * Comptes de MotoRoute: correu + contrasenya (Supabase Auth) i el perfil de motorista.
 * - Perfil públic (taula profiles): nom, zona, estil, moto, des de quan rodes, interessos.
 * - Dades privades (taula rider_settings): any de naixement, experiència, preferències i motos.
 */
import type { Session } from '@supabase/supabase-js';
import { sb, socialEnabled } from './social';
import type { DistanceBand, Motorcycle } from './types';

export type RidingStyle = 'road' | 'trail' | 'both';
export type Experience = 'beginner' | 'intermediate' | 'expert';
export type RideWith = 'solo' | 'passenger' | 'group';

export interface RiderProfile {
  username: string;
  display_name: string | null;
  home_area: string | null;
  riding_style: RidingStyle | null;
  bike_name: string | null;
  riding_since: number | null;
  bio: string | null;
  interests: string[];
  onboarded: boolean;
  avatar_url: string | null;
  /** fotos de la moto (URL públiques); la primera fa de portada del perfil */
  bike_photos: string[];
}

export interface RiderSettings {
  birth_year: number | null;
  experience: Experience | null;
  ride_with: RideWith | null;
  pref_band: DistanceBand | null;
  avoid_motorways: boolean | null;
  avoid_tolls: boolean | null;
  bikes: Motorcycle[] | null;
}

export interface Account {
  id: string;
  email: string | null;
  profile: RiderProfile | null;
  settings: RiderSettings | null;
}

export const INTERESTS: { id: string; label: string; icon: string }[] = [
  { id: 'passes', label: 'Ports de muntanya', icon: 'mountain' },
  { id: 'curves', label: 'Corbes enllaçades', icon: 'curves' },
  { id: 'coast', label: 'Carreteres de costa', icon: 'road' },
  { id: 'gravel', label: 'Pistes i grava', icon: 'dirt' },
  { id: 'food', label: 'Parar a dinar bé', icon: 'clock' },
  { id: 'photo', label: 'Miradors i fotos', icon: 'camera' },
  { id: 'multiday', label: 'Viatges de diversos dies', icon: 'calendar' },
  { id: 'camping', label: 'Acampada', icon: 'bed' },
  { id: 'evening', label: 'Sortides curtes de tarda', icon: 'sun' },
  { id: 'group', label: 'Sortides en grup', icon: 'users' },
  { id: 'villages', label: 'Pobles amb encant', icon: 'pin' },
  { id: 'offroad', label: 'Off-road tècnic', icon: 'flag' },
];

const CACHE = 'mrb.account';
const readCache = (): Account | null => {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || 'null');
  } catch {
    return null;
  }
};
const writeCache = (a: Account | null) => {
  try {
    if (a) localStorage.setItem(CACHE, JSON.stringify(a));
    else localStorage.removeItem(CACHE);
  } catch { /* emmagatzematge ple o bloquejat */ }
};

const isAnon = (s: Session | null) => !!s && ((s.user as { is_anonymous?: boolean }).is_anonymous ?? !s.user.email);

function nice(error: { message?: string; code?: string; status?: number } | null, fallback: string): Error {
  const m = error?.message ?? '';
  const code = error?.code ?? '';
  if (/invalid login credentials/i.test(m) || code === 'invalid_credentials') return new Error('El correu o la contrasenya no són correctes.');
  if (/already registered|already exists/i.test(m) || code === 'user_already_exists' || code === 'email_exists') return new Error('Ja hi ha un compte amb aquest correu. Entra amb la teva contrasenya.');
  if (/email not confirmed/i.test(m) || code === 'email_not_confirmed') return new Error('Has de confirmar el correu abans d\'entrar. Mira la safata d\'entrada (i el correu brossa).');
  if (/password/i.test(m) && /(at least|characters|weak)/i.test(m)) return new Error('La contrasenya és massa feble: posa\'n una de 8 caràcters o més.');
  if (code === 'email_address_invalid' || /invalid.*email/i.test(m)) return new Error('Aquest correu no és vàlid.');
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(m)) return new Error('S\'han enviat massa correus en poca estona. Espera una mica i torna-ho a provar.');
  if (code === 'email_address_not_authorized') return new Error('Ara mateix el servidor no pot enviar correus a aquesta adreça. Avisa l\'administrador de l\'app.');
  if (/signups not allowed|signup.*disabled/i.test(m)) return new Error('Ara mateix no es poden crear comptes nous.');
  if (/fetch|network|failed to fetch/i.test(m)) return new Error('No hi ha connexió. Comprova la cobertura i torna-ho a provar.');
  if (/username|profiles_username_key/i.test(m) || code === '23505') return new Error('Aquest nom de motorista ja està agafat. Prova\'n un altre.');
  return new Error(`${fallback}${m ? ` (${m})` : ''}`);
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const validUsername = (u: string) => /^[A-Za-z0-9_.-]{3,24}$/.test(u.trim());

/** Carrega el compte de la sessió actual. Sense connexió, torna l'últim compte desat. */
export async function loadAccount(): Promise<Account | null> {
  if (!socialEnabled) return null;
  const { data } = await sb().auth.getSession();
  const s = data.session;
  if (!s || isAnon(s)) return null;
  try {
    const BASE = 'username,display_name,home_area,riding_style,bike_name,riding_since,bio,interests,onboarded';
    const profileQuery = async () => {
      const r = await sb().from('profiles').select(`${BASE},avatar_url,bike_photos`).eq('id', s.user.id).maybeSingle();
      // servidor encara sense les columnes de fotos: carrega el perfil igualment
      if (r.error && /avatar_url|bike_photos|column/i.test(r.error.message)) return sb().from('profiles').select(BASE).eq('id', s.user.id).maybeSingle();
      return r;
    };
    const [p, st] = await Promise.all([
      profileQuery(),
      sb().from('rider_settings').select('birth_year,experience,ride_with,pref_band,avoid_motorways,avoid_tolls,bikes').eq('user_id', s.user.id).maybeSingle(),
    ]);
    if (p.error && !/fetch|network/i.test(p.error.message)) throw nice(p.error, 'No s\'ha pogut carregar el perfil');
    if (p.error) throw p.error;
    const acc: Account = {
      id: s.user.id,
      email: s.user.email ?? null,
      profile: p.data ? { avatar_url: null, ...(p.data as Partial<RiderProfile>), interests: ((p.data as { interests?: string[] | null }).interests) ?? [], bike_photos: ((p.data as { bike_photos?: string[] | null }).bike_photos) ?? [] } as RiderProfile : null,
      settings: (st.data as RiderSettings | null) ?? null,
    };
    writeCache(acc);
    return acc;
  } catch (e) {
    const cached = readCache();
    if (cached && cached.id === s.user.id) return cached; // sense cobertura: l'app segueix funcionant
    throw e;
  }
}

/** Crea el compte. Si hi havia una sessió anònima antiga amb nom, se'n porta les rutes i el nom. */
export async function signUp(email: string, password: string): Promise<{ account: Account | null; needsConfirm: boolean }> {
  if (!validEmail(email)) throw new Error('Escriu un correu vàlid.');
  if (password.length < 8) throw new Error('La contrasenya ha de tenir 8 caràcters o més.');
  const before = (await sb().auth.getSession()).data.session;
  let claim: string | null = null;
  if (before && isAnon(before)) {
    const { data } = await sb().rpc('start_claim');
    claim = (data as string | null) ?? null;
  }
  const { data, error } = await sb().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw nice(error, 'No s\'ha pogut crear el compte');
  // amb la confirmació per correu activada, Supabase no torna sessió fins que es confirma
  if (!data.session) return { account: null, needsConfirm: true };
  if (claim) await sb().rpc('finish_claim', { p_token: claim }).then(() => {}, () => {});
  return { account: await loadAccount(), needsConfirm: false };
}

export async function signIn(email: string, password: string): Promise<Account | null> {
  if (!validEmail(email)) throw new Error('Escriu un correu vàlid.');
  const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw nice(error, 'No s\'ha pogut entrar');
  return loadAccount();
}

export async function resetPassword(email: string) {
  if (!validEmail(email)) throw new Error('Escriu el correu del teu compte.');
  const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw nice(error, 'No s\'ha pogut enviar el correu');
}

export async function setNewPassword(password: string) {
  if (password.length < 8) throw new Error('La contrasenya ha de tenir 8 caràcters o més.');
  const { error } = await sb().auth.updateUser({ password });
  if (error) throw nice(error, 'No s\'ha pogut canviar la contrasenya');
}

export async function signOut() {
  writeCache(null);
  await sb().auth.signOut();
}

export async function saveProfile(id: string, profile: RiderProfile, settings: RiderSettings) {
  const { error } = await sb().from('profiles').upsert({ id, ...profile, username: profile.username.trim() });
  if (error) throw nice(error, 'No s\'ha pogut desar el perfil');
  const { error: e2 } = await sb().from('rider_settings').upsert({ user_id: id, ...settings, updated_at: new Date().toISOString() });
  if (e2) throw nice(e2, 'No s\'han pogut desar les preferències');
}

/** Desa les motos al compte per tenir-les a tots els dispositius (sense bloquejar l'app). */
export async function syncBikes(id: string, bikes: Motorcycle[]) {
  const main = bikes.find((b) => b.isDefault) ?? bikes[0] ?? null;
  await Promise.all([
    sb().from('rider_settings').upsert({ user_id: id, bikes, updated_at: new Date().toISOString() }),
    sb().from('profiles').update({ bike_name: main?.name ?? null }).eq('id', id),
  ]);
}

/** Valors per defecte del Planificar segons el perfil. */
export function planDefaults(a: Account | null) {
  const p = a?.profile;
  const s = a?.settings;
  const out: { mode?: 'road' | 'trail'; difficulty?: Experience; band?: DistanceBand; avoidMotorways?: boolean; avoidTolls?: boolean } = {};
  if (p?.riding_style) out.mode = p.riding_style === 'trail' ? 'trail' : 'road';
  if (s?.experience) out.difficulty = s.experience;
  if (s?.pref_band) out.band = s.pref_band;
  if (s?.avoid_motorways != null) out.avoidMotorways = s.avoid_motorways;
  if (s?.avoid_tolls != null) out.avoidTolls = s.avoid_tolls;
  if (out.mode === 'trail') out.avoidMotorways = true;
  return out;
}

export async function deleteAccount() {
  const { error } = await sb().rpc('delete_my_account');
  if (error) throw nice(error, 'No s\'ha pogut esborrar el compte');
  writeCache(null);
  await sb().auth.signOut().catch(() => {});
}

export function onAuthChange(cb: (event: string) => void) {
  const { data } = sb().auth.onAuthStateChange((event) => cb(event));
  return () => data.subscription.unsubscribe();
}

export function age(birthYear: number | null): number | null {
  return birthYear ? new Date().getFullYear() - birthYear : null;
}

/** Desa només la foto de perfil i les fotos de la moto. */
export async function saveMedia(id: string, patch: { avatar_url?: string | null; bike_photos?: string[] }) {
  const { error } = await sb().from('profiles').update(patch).eq('id', id);
  if (error) throw nice(error, 'No s\'ha pogut desar la foto');
}
