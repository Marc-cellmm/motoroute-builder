import { useState } from 'react';
import { join, type Me } from '../../lib/social';

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
      {!compact && <h3>Entra a la comunitat</h3>}
      <p className="hint">Tria un nom de motorista. No cal email ni contrasenya: el compte queda guardat en aquest navegador.</p>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ex. marc_trail" maxLength={24} autoComplete="nickname" />
        <button className="btn primary" style={{ flex: 'none' }} disabled={busy || name.trim().length < 3}>{busy ? 'Entrant…' : 'Entra'}</button>
      </div>
      {error && <div className="alert err">{error}</div>}
    </form>
  );
}
