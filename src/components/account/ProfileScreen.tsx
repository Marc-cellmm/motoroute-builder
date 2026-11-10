import { useEffect, useState } from 'react';
import Onboarding from './Onboarding';
import { useAccount } from './AccountGate';
import Avatar from '../Avatar';
import Icon from '../Icon';
import { age, deleteAccount, INTERESTS, loadAccount, resetPassword, saveMedia } from '../../lib/account';
import { deletePhoto, MAX_BIKE_PHOTOS, uploadPhoto } from '../../lib/media';
import { fetchMine } from '../../lib/social';

const STYLE = { road: 'Carretera', trail: 'Muntanya i pistes', both: 'Carretera i muntanya' } as const;
const STYLE_ICON = { road: 'road', trail: 'mountain', both: 'route' } as const;
const EXP = { beginner: 'Començant', intermediate: 'Mitjana', expert: 'Molta' } as const;
const WITH = { solo: 'Sol', passenger: 'Amb passatger', group: 'En grup' } as const;
const BAND = { '50_100': '50–100 km', '100_200': '100–200 km', '200_400': '200–400 km', '400_plus': 'Més de 400 km' } as const;

export default function ProfileScreen({ onProfileSaved }: { onProfileSaved?: () => void }) {
  const { account, setAccount, logout } = useAccount();
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState<'avatar' | 'bike' | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (account) fetchMine(account.id).then((r) => setPublished(r.length)).catch(() => setPublished(null));
  }, [account]);

  if (!account) return <p className="hint">Sense compte (mode demostració).</p>;
  const p = account.profile;
  const s = account.settings;
  const photos = p?.bike_photos ?? [];

  if (editing) {
    return (
      <Onboarding account={account} onCancel={() => setEditing(false)}
        onDone={(a) => { setAccount(a); setEditing(false); onProfileSaved?.(); }} />
    );
  }

  async function refresh() {
    const a = await loadAccount();
    if (a) setAccount(a);
  }

  async function changeAvatar(f: File | undefined) {
    if (!f || !account) return;
    setBusy('avatar');
    setErr(null);
    try {
      const old = p?.avatar_url;
      const url = await uploadPhoto(account.id, 'avatar', f);
      await saveMedia(account.id, { avatar_url: url });
      void deletePhoto(old);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addBikePhotos(files: FileList | null) {
    if (!files?.length || !account) return;
    setBusy('bike');
    setErr(null);
    try {
      const room = MAX_BIKE_PHOTOS - photos.length;
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, room)) urls.push(await uploadPhoto(account.id, 'bike', f));
      await saveMedia(account.id, { bike_photos: [...photos, ...urls] });
      if (files.length > room) setMsg(`Com a màxim ${MAX_BIKE_PHOTOS} fotos: n'hem pujat ${urls.length}.`);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function makeCover(i: number) {
    if (!account) return;
    const next = [photos[i], ...photos.filter((_, j) => j !== i)];
    await saveMedia(account.id, { bike_photos: next }).catch((e) => setErr((e as Error).message));
    setViewer(0);
    await refresh();
  }

  async function removePhoto(i: number) {
    if (!account) return;
    const url = photos[i];
    await saveMedia(account.id, { bike_photos: photos.filter((_, j) => j !== i) }).catch((e) => setErr((e as Error).message));
    void deletePhoto(url);
    setViewer(null);
    await refresh();
  }

  const yrs = age(s?.birth_year ?? null);
  const riding = p?.riding_since ? new Date().getFullYear() - p.riding_since : null;
  const name = p?.display_name || p?.username || '';

  return (
    <div className="profile-page">
      <div className="profile-cover" style={photos[0] ? { backgroundImage: `url(${photos[0]})` } : undefined}>
        {!photos[0] && (
          <label className="cover-empty">
            <Icon name="image" size={22} />
            <span>Afegeix una foto de la teva moto</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { void addBikePhotos(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div className="profile-id">
        <label className="profile-avatar" aria-label="Canvia la foto de perfil">
          <Avatar url={p?.avatar_url} name={name} size={92} />
          <span className="avatar-pick-cam">{busy === 'avatar' ? <span className="spin" /> : <Icon name="camera" size={16} />}</span>
          <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { void changeAvatar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="profile-names">
          <h2>{name}</h2>
          <div className="hint">@{p?.username}{p?.home_area ? <> · <Icon name="pin" size={14} /> {p.home_area}</> : null}</div>
        </div>
      </div>
      {p?.bio && <p className="profile-bio">{p.bio}</p>}

      {err && <div className="alert err">{err}</div>}
      {msg && <div className="alert info">{msg}</div>}

      <div className="stat-row">
        <div><b>{published ?? '—'}</b><span>Rutes publicades</span></div>
        <div><b>{riding ?? '—'}</b><span>{riding === 1 ? 'Any en moto' : 'Anys en moto'}</span></div>
        <div><b>{s?.bikes?.length ?? 0}</b><span>{s?.bikes?.length === 1 ? 'Moto' : 'Motos'}</span></div>
      </div>

      <section className="section">
        <div className="section-head">
          <h3>Fotos de la moto</h3>
          <span className="hint">{photos.length}/{MAX_BIKE_PHOTOS}</span>
        </div>
        <div className="gallery">
          {photos.map((url, i) => (
            <button key={url} className="gallery-item" onClick={() => setViewer(i)} aria-label={`Foto ${i + 1}`}>
              <img src={url} alt="" loading="lazy" />
              {i === 0 && <span className="gallery-tag">Portada</span>}
            </button>
          ))}
          {photos.length < MAX_BIKE_PHOTOS && (
            <label className="gallery-add">
              {busy === 'bike' ? <span className="spin" /> : <Icon name="plus" size={22} />}
              <span>{busy === 'bike' ? 'Pujant…' : 'Afegeix'}</span>
              <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { void addBikePhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h3>Com rodes</h3></div>
        <div className="detail-list">
          <div><Icon name={p?.riding_style ? STYLE_ICON[p.riding_style] : 'route'} /><span>Estil</span><b>{p?.riding_style ? STYLE[p.riding_style] : '—'}</b></div>
          <div><Icon name="bike" /><span>Moto</span><b>{p?.bike_name ?? '—'}</b></div>
          <div><Icon name="gauge" /><span>Experiència</span><b>{s?.experience ? EXP[s.experience] : '—'}</b></div>
          <div><Icon name={s?.ride_with === 'group' ? 'users' : s?.ride_with === 'passenger' ? 'passenger' : 'profile'} /><span>Normalment</span><b>{s?.ride_with ? WITH[s.ride_with] : '—'}</b></div>
          <div><Icon name="route" /><span>Sortides</span><b>{s?.pref_band ? BAND[s.pref_band] : '—'}</b></div>
          <div><Icon name="lock" /><span>Edat</span><b>{yrs != null ? `${yrs} anys` : '—'} <small>privat</small></b></div>
        </div>
        {!!p?.interests.length && (
          <div className="chips" style={{ marginTop: 12 }}>
            {p.interests.map((id) => {
              const it = INTERESTS.find((i) => i.id === id);
              return <span key={id} className="chip static"><Icon name={it?.icon ?? 'star'} size={16} />{it?.label ?? id}</span>;
            })}
          </div>
        )}
        <button className="btn wide-btn" style={{ marginTop: 14 }} onClick={() => setEditing(true)}><Icon name="edit" /> Edita el perfil</button>
      </section>

      <section className="section">
        <div className="section-head"><h3>Compte</h3></div>
        <div className="detail-list">
          <div><Icon name="profile" /><span>Correu</span><b className="truncate">{account.email}</b></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={async () => {
            setErr(null);
            try {
              await resetPassword(account.email ?? '');
              setMsg('T\'hem enviat un enllaç per canviar la contrasenya.');
            } catch (e) { setErr((e as Error).message); }
          }}><Icon name="lock" /> Contrasenya</button>
          <button className="btn" onClick={() => void logout()}><Icon name="logout" /> Surt</button>
        </div>
        {!askDelete ? (
          <button className="link-btn danger" onClick={() => setAskDelete(true)}>Esborra el compte</button>
        ) : (
          <div className="alert warn" style={{ marginTop: 14 }}>
            S'esborraran el perfil, les fotos, les rutes publicades, els m'agrada i els guardats. No es pot desfer.
            Escriu <b>ESBORRA</b> per confirmar.
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
              <button className="btn danger-btn" style={{ flex: 'none' }} disabled={confirmDelete !== 'ESBORRA'} onClick={async () => {
                try {
                  await Promise.all([deletePhoto(p?.avatar_url), ...photos.map((u) => deletePhoto(u))]);
                  await deleteAccount();
                  location.reload();
                } catch (e) { setErr((e as Error).message); }
              }}>Esborra</button>
            </div>
            <button className="link-btn" onClick={() => { setAskDelete(false); setConfirmDelete(''); }}>Cancel·la</button>
          </div>
        )}
      </section>

      {viewer != null && photos[viewer] && (
        <div className="lightbox" onClick={() => setViewer(null)}>
          <img src={photos[viewer]} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button className="btn" disabled={viewer === 0} onClick={() => setViewer(viewer - 1)} aria-label="Anterior"><Icon name="chevron-left" /></button>
            {viewer !== 0 && <button className="btn" onClick={() => void makeCover(viewer)}><Icon name="image" /> Portada</button>}
            <button className="btn" onClick={() => void removePhoto(viewer)}><Icon name="trash" /> Esborra</button>
            <button className="btn" disabled={viewer === photos.length - 1} onClick={() => setViewer(viewer + 1)} aria-label="Següent"><Icon name="chevron-right" /></button>
          </div>
          <button className="lightbox-close" onClick={() => setViewer(null)} aria-label="Tanca"><Icon name="x" size={24} /></button>
        </div>
      )}
    </div>
  );
}
