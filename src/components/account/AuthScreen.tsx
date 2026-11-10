import { useState } from 'react';
import { resetPassword, signIn, signUp, validEmail, type Account } from '../../lib/account';
import Icon, { Logo } from '../Icon';
import Legal from '../Legal';
import { t } from '../../i18n';

type Mode = 'signup' | 'login' | 'forgot';

export default function AuthScreen({ onDone, initialMode = 'signup', onShowIntro }: { onDone: (a: Account | null) => void; initialMode?: 'signup' | 'login'; onShowIntro?: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [legal, setLegal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signup') {
        const r = await signUp(email, password);
        if (r.needsConfirm) {
          setInfo(t("T'hem enviat un correu a {0}. Obre l'enllaç per confirmar el compte i després entra aquí.", [email.trim()]));
          setMode('login');
        } else onDone(r.account);
      } else if (mode === 'login') {
        onDone(await signIn(email, password));
      } else {
        await resetPassword(email);
        setInfo(t("Si hi ha un compte amb aquest correu, t'arribarà un enllaç per posar una contrasenya nova."));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><Logo size={60} /></div>
        <h1 className="auth-title">{t("MotoRoute Builder")}</h1>
        <p className="auth-sub">{t("Rutes amb corbes, meteo a l'hora de pas, benzina segons la teva moto, navegació i comunitat. Gratis.")}</p>

        {mode !== 'forgot' && (
          <div className="seg" style={{ margin: '18px 0 16px' }}>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => go('signup')}>{t("Crea el compte")}</button>
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => go('login')}>{t("Ja tinc compte")}</button>
          </div>
        )}
        {mode === 'forgot' && <h3 style={{ margin: '18px 0 10px' }}>{t("Recupera la contrasenya")}</h3>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="auth-email">{t("Correu electrònic")}</label>
            <input id="auth-email" className="input" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" required />
          </div>
          {mode !== 'forgot' && (
            <div className="field">
              <label htmlFor="auth-pass">{t("Contrasenya")}</label>
              <div className="row">
                <input id="auth-pass" className="input" type={show ? 'text' : 'password'} value={password} minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? t("Mínim 8 caràcters") : ''} required />
                <button type="button" className="btn ghost" style={{ flex: 'none' }} onClick={() => setShow(!show)} aria-label={show ? t("Amaga la contrasenya") : t("Mostra la contrasenya")}>
                  <Icon name={show ? 'eye-off' : 'eye'} />
                </button>
              </div>
            </div>
          )}
          {error && <div className="alert err">{error}</div>}
          {info && <div className="alert info">{info}</div>}
          <button className="btn primary" style={{ width: '100%' }}
            disabled={busy || !validEmail(email) || (mode !== 'forgot' && password.length < (mode === 'signup' ? 8 : 1))}>
            {busy ? t("Un moment…") : mode === 'signup' ? t("Crea el compte") : mode === 'login' ? t("Entra") : t("Envia l'enllaç")}
          </button>
        </form>

        {mode === 'login' && <button className="link-btn" onClick={() => go('forgot')}>{t("Has oblidat la contrasenya?")}</button>}
        {mode === 'forgot' && <button className="link-btn" onClick={() => go('login')}>{t("Torna a entrar")}</button>}

        <div className="auth-perks">
          <div><Icon name="routes" size={18} /><span>{t("Rutes i motos a tots els teus dispositius")}</span></div>
          <div><Icon name="lock" size={18} /><span>{t("L'edat i les preferències són privades")}</span></div>
          <div><Icon name="check" size={18} /><span>{t("Gratis, sense anuncis ni subscripcions")}</span></div>
        </div>
        {mode === 'signup' && (
          <p className="hint legal-line">
            {t("En crear el compte confirmes que tens 18 anys o més i acceptes les")}{' '}
            <button type="button" className="inline-link" onClick={() => setLegal(true)}>{t("condicions i la política de privacitat")}</button>.
          </p>
        )}
        {onShowIntro && <button className="link-btn muted-link" style={{ width: '100%', justifyContent: 'center' }} onClick={onShowIntro}>{t("Torna a veure què pots fer amb l'app")}</button>}
      </div>
      {legal && <Legal onClose={() => setLegal(false)} />}
    </div>
  );
}
