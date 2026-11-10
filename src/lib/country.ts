/** País de l'usuari (codi ISO de dues lletres). Es tria a la primera pantalla i va al perfil. */
const KEY = 'mrb.country';

export const SUGGESTED = ['ES', 'AD', 'FR', 'PT', 'IT', 'DE', 'GB', 'NL', 'BE', 'CH', 'AT', 'MA', 'RO', 'PL', 'UA', 'RU', 'CN', 'US', 'MX', 'AR', 'CO', 'BR'];

export const ALL_COUNTRIES = ('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW').split(' ');

export function savedCountry(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCountry(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch { /* sense emmagatzematge */ }
}

/** Endevina el país pel sistema (idioma regional o zona horària). */
export function guessCountry(): string {
  for (const l of navigator.languages ?? [navigator.language]) {
    const r = l.split('-')[1];
    if (r && /^[A-Z]{2}$/i.test(r)) return r.toUpperCase();
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const byTz: Record<string, string> = {
    'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Andorra': 'AD', 'Europe/Paris': 'FR', 'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT',
    'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Africa/Casablanca': 'MA',
    'Europe/Bucharest': 'RO', 'Europe/Moscow': 'RU', 'Asia/Shanghai': 'CN', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Warsaw': 'PL',
  };
  return byTz[tz] ?? 'ES';
}
