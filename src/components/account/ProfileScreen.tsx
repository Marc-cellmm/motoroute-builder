import { useEffect, useState } from 'react';
import Onboarding from './Onboarding';
import { useAccount } from './AccountGate';
import { age, deleteAccount, INTERESTS, resetPassword } from '../../lib/account';
import { fetchMine } from '../../lib/social';

const STYLE = { road: '🛣️ Carretera', trail: '⛰️ Muntanya i pistes', both: '🔀 Carretera i muntanya' } as const;
const EXP = { beginner: 'Començant', intermediate: 'Experiència mitjana', expert: 'Molta experiència' } as const;
const WITH = { solo: 'Sol', passenger: 'Amb passatger', group: 'En grup' } as const;
const BAND = { '50_100': '50–100 km', '100_200': '100–200 km', '200_400': '200–400 km', '400_plus': '400+ km' } as const;

export default function ProfileScreen({ onProfileSaved }: { onProfileSaved?: () => void }) {
  const { account, setAccount, logout } = useAccount();
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (account) fetchMine(account.id).then((r) => setPublished(r.length)).catch(() => setPublished(null));
  }, [account]);

  if (!account) return <p className="hint">Sense compte (mode demostració).</p>;
  const p = account.profile;
  const s = account.settings;

  if (editing) {
    return (
      <Onboarding account={account} onCancel={() => setEditing(false)}
        onDone={(a) => { setAccount(a); setEditing(false); onProfileSaved?.(); }} />
    );
  }

  const yrs = age(s?.birth_year ?? null);
  const riding = p?.riding_since ? new Date().getFullYear() - p.riding_since : null;

  return (
    <div>
      <div className="profile-head">
        <div className="avatar">{(p?.display_name || p?.username || '?').charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ lineHeight: 1.1 }}>{p?.display_name || `@${p?.username}`}</h2>
          {p?.display_name && <div className="hint">@{p.username}</div>}
          {p?.home_area && <div className="hint">📍 {p.home_area}</div>}
        </div>
      </div>
      {p?.bio && <p style={{ margin: '12px 0' }}>{p.bio}</p>}

      <div className="profile-stats">
        <div><b>{published ?? '—'}</b><span>rutes publicades</span></div>
        <div><b>{riding != null ? riding : '—'}</b><span>{riding === 1 ? 'any en moto' : 'anys en moto'}</span></div>
        <div><b>{s?.bikes?.length ?? 0}</b><span>{s?.bikes?.length === 1 ? 'moto' : 'motos'}</span></div>
      </div>

      <div className="box">
        <div className="kv"><span>Estil</span><b>{p?.riding_style ? STYLE[p.riding_style] : '—'}</b></div>
        <div className="kv"><span>Moto</span><b>{p?.bike_name ?? '—'}</b></div>
        <div className="kv"><span>Experiència</span><b>{s?.experience ? EXP[s.experience] : '—'}</b></div>
        <div className="kv"><span>Vas</span><b>{s?.ride_with ? WITH[s.ride_with] : '—'}</b></div>
        <div className="kv"><span>Sortides habituals</span><b>{s?.pref_band ? BAND[s.pref_band] : '—'}</b></div>
        <div className="kv"><span>Edat</span><b>{yrs != null ? `${yrs} anys` : '—'} <small>· privat</small></b></div>
      </div>
      {!!p?.interests.length && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {p.interests.map((id) => <span key={id} className="chip on">{INTERESTS.find((i) => i.id === id)?.label ?? id}</span>)}
        </div>
      )}

      <button className="btn primary" style={{ width: '100%' }} onClick={() => setEditing(true)}>Edita el perfil</button>

      <h3 style={{ margin: '22px 0 8px' }}>Compte</h3>
      <div className="hint" style={{ marginBottom: 10 }}>{account.email}</div>
      {msg && <div className="alert info">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn" onClick={async () => {
          setErr(null);
          try {
            await resetPassword(account.email ?? '');
            setMsg('T\'hem enviat un enllaç per canviar la contrasenya.');
          } catch (e) { setErr((e as Error).message); }
        }}>Canvia la contrasenya</button>
        <button className="btn" onClick={() => void logout()}>Surt</button>
      </div>
      {!askDelete ? (
        <button className="link-btn danger" onClick={() => setAskDelete(true)}>Esborra el compte</button>
      ) : (
        <div className="alert warn" style={{ marginTop: 14 }}>
          S'esborraran el perfil, les rutes publicades, els m'agrada i els guardats. No es pot desfer.
          Escriu <b>ESBORRA</b> per confirmar.
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
            <button className="btn" style={{ flex: 'none' }} disabled={confirmDelete !== 'ESBORRA'} onClick={async () => {
              try { await deleteAccount(); location.reload(); } catch (e) { setErr((e as Error).message); }
            }}>Esborra</button>
          </div>
          <button className="link-btn" onClick={() => { setAskDelete(false); setConfirmDelete(''); }}>Cancel·la</button>
        </div>
      )}
    </div>
  );
}
