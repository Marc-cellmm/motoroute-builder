import { useState } from 'react';
import { join, type Me } from '../../lib/social';
import { t } from '../../i18n';

export default function JoinForm({ onJoined, compact }: { onJoined: (me: Me) => void; compact?: boolean }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onJoined(await join(name));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? '' : 'box'}>
      {!compact && <h3>{t("Entra a la comunitat")}</h3>}
      <p className="hint">{t("Tria un nom de motorista per a la comunitat.")}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("p. ex. marc_trail")} maxLength={24} autoComplete="nickname" />
        <button className="btn primary" style={{ flex: 'none' }} disabled={busy || name.trim().length < 3}>{busy ? t("Entrant…") : t("Entra")}</button>
      </div>
      {error && <div className="alert err">{error}</div>}
    </form>
  );
}
