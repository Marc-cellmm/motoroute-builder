import { useState } from 'react';
import { resetPassword, signIn, signUp, validEmail, type Account } from '../../lib/account';
import Icon, { Logo } from '../Icon';

type Mode = 'signup' | 'login' | 'forgot';

export default function AuthScreen({ onDone }: { onDone: (a: Account | null) => void }) {
  const [mode, setMode] = useState<Mode>('signup');
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
          setInfo(`T'hem enviat un correu a ${email.trim()}. Obre l'enllaç per confirmar el compte i després entra aquí.`);
          setMode('login');
        } else onDone(r.account);
      } else if (mode === 'login') {
        onDone(await signIn(email, password));
      } else {
        await resetPassword(email);
        setInfo('Si hi ha un compte amb aquest correu, t\'arribarà un enllaç per posar una contrasenya nova.');
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
        <h1 className="auth-title">MotoRoute Builder</h1>
        <p className="auth-sub">Rutes amb corbes, meteo a l'hora de pas, benzina segons la teva moto, navegació i comunitat. Gratis.</p>

        {mode !== 'forgot' && (
          <div className="seg" style={{ margin: '18px 0 16px' }}>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => go('signup')}>Crea el compte</button>
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => go('login')}>Ja tinc compte</button>
          </div>
        )}
        {mode === 'forgot' && <h3 style={{ margin: '18px 0 10px' }}>Recupera la contrasenya</h3>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="auth-email">Correu electrònic</label>
            <input id="auth-email" className="input" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" required />
          </div>
          {mode !== 'forgot' && (
            <div className="field">
              <label htmlFor="auth-pass">Contrasenya</label>
              <div className="row">
                <input id="auth-pass" className="input" type={show ? 'text' : 'password'} value={password} minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Mínim 8 caràcters' : ''} required />
                <button type="button" className="btn ghost" style={{ flex: 'none' }} onClick={() => setShow(!show)} aria-label={show ? 'Amaga la contrasenya' : 'Mostra la contrasenya'}>
                  <Icon name={show ? 'eye-off' : 'eye'} />
                </button>
              </div>
            </div>
          )}
          {error && <div className="alert err">{error}</div>}
          {info && <div className="alert info">{info}</div>}
          <button className="btn primary" style={{ width: '100%' }}
            disabled={busy || !validEmail(email) || (mode !== 'forgot' && password.length < (mode === 'signup' ? 8 : 1))}>
            {busy ? 'Un moment…' : mode === 'signup' ? 'Crea el compte' : mode === 'login' ? 'Entra' : 'Envia l\'enllaç'}
          </button>
        </form>

        {mode === 'login' && <button className="link-btn" onClick={() => go('forgot')}>Has oblidat la contrasenya?</button>}
        {mode === 'forgot' && <button className="link-btn" onClick={() => go('login')}>Torna a entrar</button>}

        <p className="hint" style={{ marginTop: 18 }}>
          Amb el compte tens les rutes, les motos i el perfil a tots els teus dispositius. L'edat i les preferències són privades: a la comunitat només es veu el nom de motorista, la zona, l'estil i la moto.
        </p>
      </div>
    </div>
  );
}
