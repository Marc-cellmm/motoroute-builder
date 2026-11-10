import { useState } from 'react';
import { setNewPassword } from '../../lib/account';
import { Logo } from '../Icon';
import { t } from '../../i18n';

export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><Logo size={52} /></div>
        <h3 style={{ margin: '12px 0' }}>{t("Posa una contrasenya nova")}</h3>
        <div className="field">
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder={t("Mínim 8 caràcters")} />
        </div>
        {error && <div className="alert err">{error}</div>}
        <button className="btn primary" style={{ width: '100%' }} disabled={busy || password.length < 8}>{busy ? t("Desant…") : t("Desa i entra")}</button>
      </form>
    </div>
  );
}
