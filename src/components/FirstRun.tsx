import { useMemo, useState } from 'react';
import { LANGS, countryName, deviceLang, initI18n, lang, setLang, t } from '../i18n';
import { ALL_COUNTRIES, SUGGESTED, guessCountry, setCountry } from '../lib/country';
import Icon, { Logo } from './Icon';

/** Primer cop que s'obre l'app: idioma i país. */
export default function FirstRun({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'lang' | 'country'>('lang');
  const [code, setCode] = useState(lang().code || deviceLang());
  const [, force] = useState(0);
  const [country, setCountryState] = useState(guessCountry());
  const [q, setQ] = useState('');

  async function pickLang(c: string) {
    setCode(c);
    await initI18n(c); // canvia l'idioma a l'instant, sense recarregar
    force((n) => n + 1);
  }

  const countries = useMemo(() => {
    const coll = new Intl.Collator(lang().locale);
    const named = ALL_COUNTRIES.map((c) => ({ c, n: countryName(c) }));
    const query = q.trim().toLowerCase();
    if (query) return named.filter((x) => x.n.toLowerCase().includes(query) || x.c.toLowerCase() === query).sort((a, b) => coll.compare(a.n, b.n));
    const top = SUGGESTED.map((c) => named.find((x) => x.c === c)!).filter(Boolean);
    const rest = named.filter((x) => !SUGGESTED.includes(x.c)).sort((a, b) => coll.compare(a.n, b.n));
    return [...top, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, code]);

  return (
    <div className="auth-page">
      <div className="auth-card first-run">
        <div className="first-head">
          <Logo size={44} />
          <div>
            <div className="eyebrow"><bdi dir="ltr">{step === 'lang' ? '1 / 2' : '2 / 2'}</bdi></div>
            <h2>{step === 'lang' ? t('Tria l\'idioma') : t('D\'on ets?')}</h2>
          </div>
        </div>

        {step === 'lang' && (
          <>
            <p className="hint" style={{ margin: '4px 0 14px' }}>{t('Pots canviar-lo quan vulguis des del perfil.')}</p>
            <div className="lang-grid" role="radiogroup" aria-label={t('Idioma')}>
              {LANGS.map((l) => (
                <button key={l.code} role="radio" aria-checked={code === l.code} className={`lang-item ${code === l.code ? 'on' : ''}`}
                  onClick={() => void pickLang(l.code)} dir={l.rtl ? 'rtl' : 'ltr'} lang={l.code === 'ary' ? 'ar' : l.code}>
                  <b>{l.name}</b>
                  <small>{l.english}</small>
                  {code === l.code && <span className="lang-check"><Icon name="check" size={16} /></span>}
                </button>
              ))}
            </div>
            <button className="btn primary wide-btn" style={{ marginTop: 16 }} onClick={() => { setLang(code, false); setStep('country'); }}>
              {t('Continua')} <Icon name="arrow-right" size={18} />
            </button>
          </>
        )}

        {step === 'country' && (
          <>
            <p className="hint" style={{ margin: '4px 0 12px' }}>{t('Sortirà al teu perfil i ens ajuda a proposar-te rutes a prop.')}</p>
            <div className="field search-field">
              <Icon name="search" className="dim" />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Cerca el país')} aria-label={t('Cerca el país')} />
            </div>
            <div className="country-list" role="radiogroup" aria-label={t('País')}>
              {countries.map(({ c, n }, i) => (
                <button key={c} role="radio" aria-checked={country === c} className={`country-item ${country === c ? 'on' : ''} ${!q && i === SUGGESTED.length ? 'sep' : ''}`}
                  onClick={() => setCountryState(c)}>
                  <span className="cc">{c}</span>
                  <span className="cn">{n}</span>
                  {country === c && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setStep('lang')}><Icon name="chevron-left" size={18} /></button>
              <button className="btn primary" style={{ flex: 3 }} onClick={() => { setCountry(country); onDone(); }}>
                {t('Continua')} <Icon name="arrow-right" size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
