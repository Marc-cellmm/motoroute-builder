import { useEffect, useState } from 'react';
import Onboarding from './Onboarding';
import { useAccount } from './AccountGate';
import Avatar from '../Avatar';
import Icon from '../Icon';
import { age, deleteAccount, INTERESTS, loadAccount, resetPassword, saveMedia } from '../../lib/account';
import { deletePhoto, MAX_BIKE_PHOTOS, uploadPhoto } from '../../lib/media';
import { fetchMine } from '../../lib/social';
import { loadRecordings } from '../../lib/storage';
import { canPromptInstall, isIosBrowser, isStandalone, onInstallChange, promptInstall, setTextLarge, textLarge } from '../../lib/prefs';
import Legal from '../Legal';
import { LANGS, countryName, lang, locale, setLang, t } from '../../i18n';

const STYLE = { road: t("Carretera"), trail: t("Muntanya i pistes"), both: t("Carretera i muntanya") } as const;
const STYLE_ICON = { road: 'road', trail: 'mountain', both: 'route' } as const;
const EXP = { beginner: t("Començant"), intermediate: t("Mitjana"), expert: t("Molta") } as const;
const WITH = { solo: t("Sol"), passenger: t("Amb passatger"), group: t("En grup") } as const;
const BAND = { '50_100': t("50–100 km"), '100_200': t("100–200 km"), '200_400': t("200–400 km"), '400_plus': t("Més de 400 km") } as const;

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
  const [bigText, setBigText] = useState(textLarge);
  const [installable, setInstallable] = useState(canPromptInstall);
  const [legal, setLegal] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => onInstallChange(() => setInstallable(canPromptInstall())), []);

  useEffect(() => {
    if (account) fetchMine(account.id).then((r) => setPublished(r.length)).catch(() => setPublished(null));
  }, [account]);

  if (!account) return <p className="hint">{t("Sense compte (mode demostració).")}</p>;
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
      if (files.length > room) setMsg(t("Com a màxim {0} fotos: n'hem pujat {1}.", [MAX_BIKE_PHOTOS, urls.length]));
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

  const recs = loadRecordings();
  const totalKm = recs.reduce((a, r) => a + (r.route.distanceKm || 0), 0);
  const movingH = recs.reduce((a, r) => a + (r.movingMin || 0), 0) / 60;
  const topSpeed = recs.reduce((a, r) => Math.max(a, r.maxKmh || 0), 0);
  const topAlt = recs.reduce((a, r) => Math.max(a, r.route.maxAltitude || 0), 0);
  const monthKm = recs.filter((r) => new Date(r.recordedAt).getMonth() === new Date().getMonth() && new Date(r.recordedAt).getFullYear() === new Date().getFullYear())
    .reduce((a, r) => a + (r.route.distanceKm || 0), 0);
  const fmt = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 0 });

  const yrs = age(s?.birth_year ?? null);
  const riding = p?.riding_since ? new Date().getFullYear() - p.riding_since : null;
  const name = p?.display_name || p?.username || '';

  return (
    <div className="profile-page">
      <div className="profile-cover" style={photos[0] ? { backgroundImage: `url(${photos[0]})` } : undefined}>
        {!photos[0] && (
          <label className="cover-empty">
            <Icon name="image" size={22} />
            <span>{t("Afegeix una foto de la teva moto")}</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { void addBikePhotos(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div className="profile-id">
        <label className="profile-avatar" aria-label={t("Canvia la foto de perfil")}>
          <Avatar url={p?.avatar_url} name={name} size={92} />
          <span className="avatar-pick-cam">{busy === 'avatar' ? <span className="spin" /> : <Icon name="camera" size={16} />}</span>
          <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { void changeAvatar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="profile-names">
          <h2>{name}</h2>
          <div className="hint">@{p?.username}{p?.home_area || p?.country ? <> · <Icon name="pin" size={14} /> {[p?.home_area, countryName(p?.country)].filter(Boolean).join(', ')}</> : null}</div>
        </div>
      </div>
      {p?.bio && <p className="profile-bio">{p.bio}</p>}

      {err && <div className="alert err">{err}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="stat-row">
        <div><b>{published ?? '—'}</b><span>{t("Rutes publicades")}</span></div>
        <div><b>{riding ?? '—'}</b><span>{riding === 1 ? t("Any en moto") : t("Anys en moto")}</span></div>
        <div><b>{s?.bikes?.length ?? 0}</b><span>{s?.bikes?.length === 1 ? t("Moto") : t("Motos")}</span></div>
      </div>

      <section className="section">
        <div className="section-head">
          <h3>{t("Les teves sortides")}</h3>
          <span className="hint">{t("gravades en aquest dispositiu")}</span>
        </div>
        {recs.length ? (
          <div className="ride-stats">
            <div className="ride-hero">
              <span className="eyebrow">{t("Quilòmetres gravats")}</span>
              <div className="metric go-text">{fmt(totalKm)}<small>{t("km")}</small></div>
              <span className="hint">{fmt(monthKm)} {t("km aquest mes")}</span>
            </div>
            <div className="spec-grid">
              <div><span>{t("Sortides")}</span><b>{recs.length}</b></div>
              <div><span>{t("En moviment")}</span><b>{movingH < 10 ? movingH.toFixed(1) : fmt(movingH)} <small>h</small></b></div>
              <div><span>{t("Velocitat màxima")}</span><b>{fmt(topSpeed)} <small>{t("km/h")}</small></b></div>
              <div><span>{t("Punt més alt")}</span><b>{fmt(topAlt)} <small>m</small></b></div>
            </div>
          </div>
        ) : (
          <div className="box empty-inline"><Icon name="record" size={22} className="dim" /><span>{t("Grava la primera sortida i aquí veuràs els quilòmetres, les hores i el punt més alt.")}</span></div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>{t("Fotos de la moto")}</h3>
          <span className="hint">{photos.length}/{MAX_BIKE_PHOTOS}</span>
        </div>
        <div className="gallery">
          {photos.map((url, i) => (
            <button key={url} className="gallery-item" onClick={() => setViewer(i)} aria-label={t("Foto {0}", [i + 1])}>
              <img src={url} alt="" loading="lazy" />
              {i === 0 && <span className="gallery-tag">{t("Portada")}</span>}
            </button>
          ))}
          {photos.length < MAX_BIKE_PHOTOS && (
            <label className="gallery-add">
              {busy === 'bike' ? <span className="spin" /> : <Icon name="plus" size={22} />}
              <span>{busy === 'bike' ? t("Pujant…") : t("Afegeix")}</span>
              <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { void addBikePhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h3>{t("Com rodes")}</h3></div>
        <div className="detail-list">
          <div><Icon name={p?.riding_style ? STYLE_ICON[p.riding_style] : 'route'} /><span>{t("Estil")}</span><b>{p?.riding_style ? STYLE[p.riding_style] : '—'}</b></div>
          <div><Icon name="bike" /><span>{t("Moto")}</span><b>{p?.bike_name ?? '—'}</b></div>
          <div><Icon name="gauge" /><span>{t("Experiència")}</span><b>{s?.experience ? EXP[s.experience] : '—'}</b></div>
          <div><Icon name={s?.ride_with === 'group' ? 'users' : s?.ride_with === 'passenger' ? 'passenger' : 'profile'} /><span>{t("Normalment")}</span><b>{s?.ride_with ? WITH[s.ride_with] : '—'}</b></div>
          <div><Icon name="route" /><span>{t("Sortides")}</span><b>{s?.pref_band ? BAND[s.pref_band] : '—'}</b></div>
          <div><Icon name="lock" /><span>{t("Edat")}</span><b>{yrs != null ? `${yrs} anys` : '—'} <small>{t("privat")}</small></b></div>
        </div>
        {!!p?.interests.length && (
          <div className="chips" style={{ marginTop: 12 }}>
            {p.interests.map((id) => {
              const it = INTERESTS.find((i) => i.id === id);
              return <span key={id} className="chip static"><Icon name={it?.icon ?? 'star'} size={16} />{it?.label ?? id}</span>;
            })}
          </div>
        )}
        <button className="btn wide-btn" style={{ marginTop: 14 }} onClick={() => setEditing(true)}><Icon name="edit" /> {t("Edita el perfil")}</button>
      </section>

      <section className="section">
        <div className="section-head"><h3>{t("Aplicació")}</h3></div>
        <div className="detail-list">
          <label className="pref-row">
            <Icon name="eye" /><span>{t("Text més gran")}</span>
            <input type="checkbox" className="switch" checked={bigText} onChange={(e) => { setBigText(e.target.checked); setTextLarge(e.target.checked); }} />
          </label>
          {!isStandalone() && (installable || isIosBrowser()) && (
            <button className="pref-row" onClick={async () => { if (installable) await promptInstall(); else setIosHelp(!iosHelp); }}>
              <Icon name="download" /><span>{t("Instal·la l'app al mòbil")}</span><Icon name="chevron-right" className="dim" />
            </button>
          )}
          <button className="pref-row" onClick={() => setLangOpen(true)}>
            <Icon name="info" /><span>{t("Idioma")}</span><b className="pref-value">{lang().name}</b>
          </button>
          <button className="pref-row" onClick={() => setLegal(true)}>
            <Icon name="lock" /><span>{t("Privacitat, condicions i seguretat")}</span><Icon name="chevron-right" className="dim" />
          </button>
        </div>
        {iosHelp && (
          <div className="alert info">{t("A Safari, toca")}{' '}<b>{t("Compartir")}</b> <Icon name="share" size={14} className="inline-ico" /> {t("i després")}{' '}<b>{t("Afegeix a la pantalla d'inici")}</b>{t(". S'obrirà com una app, a pantalla completa.")}</div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h3>{t("Compte")}</h3></div>
        <div className="detail-list">
          <div><Icon name="profile" /><span>{t("Correu")}</span><b className="truncate">{account.email}</b></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={async () => {
            setErr(null);
            try {
              await resetPassword(account.email ?? '');
              setMsg(t("T'hem enviat un enllaç per canviar la contrasenya."));
            } catch (e) { setErr((e as Error).message); }
          }}><Icon name="lock" /> {t("Contrasenya")}</button>
          <button className="btn" onClick={() => void logout()}><Icon name="logout" /> {t("Surt")}</button>
        </div>
        {!askDelete ? (
          <button className="link-btn danger" onClick={() => setAskDelete(true)}>{t("Esborra el compte")}</button>
        ) : (
          <div className="alert warn" style={{ marginTop: 14 }}>
            {t("S'esborraran el perfil, les fotos, les rutes publicades, els m'agrada i els guardats. No es pot desfer. Escriu")}{' '}<b>{t("ESBORRA")}</b> {t("per confirmar.")}
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
              <button className="btn danger-btn" style={{ flex: 'none' }} disabled={confirmDelete.trim().toUpperCase() !== t("ESBORRA").toUpperCase()} onClick={async () => {
                try {
                  await Promise.all([deletePhoto(p?.avatar_url), ...photos.map((u) => deletePhoto(u))]);
                  await deleteAccount();
                  location.reload();
                } catch (e) { setErr((e as Error).message); }
              }}>{t("Esborra")}</button>
            </div>
            <button className="link-btn" onClick={() => { setAskDelete(false); setConfirmDelete(''); }}>{t("Cancel·la")}</button>
          </div>
        )}
      </section>

      {legal && <Legal onClose={() => setLegal(false)} />}
      {langOpen && (
        <div className="modal-bg" onClick={() => setLangOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Idioma")}>
            <div className="page-head" style={{ marginBottom: 12 }}>
              <h2>{t("Idioma")}</h2>
              <button className="icon-btn" onClick={() => setLangOpen(false)} aria-label={t("Tanca")}><Icon name="x" /></button>
            </div>
            <div className="lang-grid">
              {LANGS.map((l) => (
                <button key={l.code} className={`lang-item ${lang().code === l.code ? 'on' : ''}`} dir={l.rtl ? 'rtl' : 'ltr'}
                  onClick={() => (l.code === lang().code ? setLangOpen(false) : setLang(l.code))}>
                  <b>{l.name}</b><small>{l.english}</small>
                  {lang().code === l.code && <span className="lang-check"><Icon name="check" size={16} /></span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {viewer != null && photos[viewer] && (
        <div className="lightbox" onClick={() => setViewer(null)}>
          <img src={photos[viewer]} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button className="btn" disabled={viewer === 0} onClick={() => setViewer(viewer - 1)} aria-label={t("Anterior")}><Icon name="chevron-left" /></button>
            {viewer !== 0 && <button className="btn" onClick={() => void makeCover(viewer)}><Icon name="image" /> {t("Portada")}</button>}
            <button className="btn" onClick={() => void removePhoto(viewer)}><Icon name="trash" /> {t("Esborra")}</button>
            <button className="btn" disabled={viewer === photos.length - 1} onClick={() => setViewer(viewer + 1)} aria-label={t("Següent")}><Icon name="chevron-right" /></button>
          </div>
          <button className="lightbox-close" onClick={() => setViewer(null)} aria-label={t("Tanca")}><Icon name="x" size={24} /></button>
        </div>
      )}
    </div>
  );
}
