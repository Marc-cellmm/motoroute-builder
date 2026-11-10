import { useMemo, useState } from 'react';
import { INTERESTS, saveProfile, validUsername, loadAccount, type Account, type Experience, type RideWith, type RiderProfile, type RiderSettings, type RidingStyle } from '../../lib/account';
import { bikeFromModel, CATEGORY_LABEL, searchCatalog } from '../../lib/bikes';
import { loadBikes, saveBikes, uid } from '../../lib/storage';
import { uploadPhoto } from '../../lib/media';
import Icon from '../Icon';
import Avatar from '../Avatar';
import type { DistanceBand, Motorcycle } from '../../lib/types';
import { countryName, lang, t } from '../../i18n';
import { ALL_COUNTRIES, guessCountry, savedCountry, setCountry } from '../../lib/country';

interface Props {
  account: Account;
  onDone: (a: Account) => void;
  onLogout?: () => void;
  onCancel?: () => void; // mode edició (des del Perfil)
}

const THIS_YEAR = new Date().getFullYear();
const MIN_AGE = 18; // l'app és per a majors d'edat
const BIRTH_YEARS = Array.from({ length: THIS_YEAR - MIN_AGE - 1930 + 1 }, (_, i) => THIS_YEAR - MIN_AGE - i);
const SINCE_YEARS = Array.from({ length: THIS_YEAR - 1960 + 1 }, (_, i) => THIS_YEAR - i);

const BANDS: { id: DistanceBand; label: string }[] = [
  { id: '50_100', label: t("50–100 km") },
  { id: '100_200', label: t("100–200 km") },
  { id: '200_400', label: t("200–400 km") },
  { id: '400_plus', label: t("400+ km") },
];

export default function Onboarding({ account, onDone, onLogout, onCancel }: Props) {
  const editing = !!onCancel;
  const p0 = account.profile;
  const s0 = account.settings;
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(p0?.username ?? '');
  const [displayName, setDisplayName] = useState(p0?.display_name ?? '');
  const [birthYear, setBirthYear] = useState<number | ''>(s0?.birth_year ?? '');
  const [homeArea, setHomeArea] = useState(p0?.home_area ?? '');
  const [country, setCountryCode] = useState<string>(p0?.country ?? savedCountry() ?? guessCountry());
  const countryOptions = useMemo(() => {
    const coll = new Intl.Collator(lang().locale);
    return ALL_COUNTRIES.map((c) => ({ c, n: countryName(c) })).sort((a, b) => coll.compare(a.n, b.n));
  }, []);
  const [style, setStyle] = useState<RidingStyle | null>(p0?.riding_style ?? null);
  const [experience, setExperience] = useState<Experience | null>(s0?.experience ?? null);
  const [since, setSince] = useState<number | ''>(p0?.riding_since ?? '');
  const [rideWith, setRideWith] = useState<RideWith | null>(s0?.ride_with ?? null);
  const startBikes = useMemo<Motorcycle[]>(() => (s0?.bikes?.length ? s0.bikes : loadBikes()), [s0]);
  const [bikes, setBikes] = useState<Motorcycle[]>(startBikes);
  const [bikeQuery, setBikeQuery] = useState('');
  const [band, setBand] = useState<DistanceBand | null>(s0?.pref_band ?? null);
  const [avoidMotorways, setAvoidMotorways] = useState(s0?.avoid_motorways ?? true);
  const [avoidTolls, setAvoidTolls] = useState(s0?.avoid_tolls ?? true);
  const [interests, setInterests] = useState<string[]>(p0?.interests ?? []);
  const [bio, setBio] = useState(p0?.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(p0?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultBike = bikes.find((b) => b.isDefault) ?? bikes[0] ?? null;
  const results = useMemo(() => searchCatalog(bikeQuery).slice(0, bikeQuery ? 30 : 12), [bikeQuery]);

  const steps = [t("Qui ets"), t("Com rodes"), t("La teva moto"), t("Què t'agrada")];
  const valid = [
    validUsername(username) && birthYear !== '',
    !!style && !!experience,
    true,
    true,
  ];

  function pickModel(id: string) {
    const m = searchCatalog('').find((x) => x.id === id);
    if (!m) return;
    const existing = bikes.find((b) => b.modelId === m.id);
    const list = existing ? bikes : [...bikes, bikeFromModel(m, uid())];
    const chosenId = existing?.id ?? list[list.length - 1].id;
    setBikes(list.map((b) => ({ ...b, isDefault: b.id === chosenId })));
    setBikeQuery('');
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const profile: RiderProfile = {
        username: username.trim(),
        display_name: displayName.trim() || null,
        home_area: homeArea.trim() || null,
        country: country || null,
        riding_style: style,
        bike_name: defaultBike?.name ?? null,
        riding_since: since === '' ? null : since,
        bio: bio.trim() || null,
        interests,
        onboarded: true,
        avatar_url: avatar,
        bike_photos: p0?.bike_photos ?? [],
      };
      const settings: RiderSettings = {
        birth_year: birthYear === '' ? null : birthYear,
        experience,
        ride_with: rideWith,
        pref_band: band,
        avoid_motorways: avoidMotorways,
        avoid_tolls: avoidTolls,
        bikes,
      };
      await saveProfile(account.id, profile, settings);
      saveBikes(bikes);
      onDone((await loadAccount()) ?? { ...account, profile, settings });
    } catch (e) {
      setError((e as Error).message);
      if (/nom de motorista/.test((e as Error).message)) setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function pickAvatar(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      setAvatar(await uploadPhoto(account.id, 'avatar', f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const toggleInterest = (id: string) => setInterests((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <div className="onboarding">
      {!editing && (
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="hint">{account.email}</span>
          {onLogout && <button className="link-btn" style={{ flex: 'none', margin: 0 }} onClick={onLogout}>{t("Surt")}</button>}
        </div>
      )}
      <div className="stepper">{steps.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      <div className="eyebrow">{editing ? t("Edita el perfil") : t("Pas {0} de {1}", [step + 1, steps.length])}</div>
      <h2>{steps[step]}</h2>

      {step === 0 && (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>{editing ? t("Canvia el que vulguis.") : t("Benvingut! Configura el teu perfil en 1 minut. Tot es pot canviar després.")}</p>
          <label className="avatar-pick">
            <Avatar url={avatar} name={displayName || username} size={76} />
            <span className="avatar-pick-cam">{uploading ? <span className="spin" /> : <Icon name="camera" size={18} />}</span>
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { void pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
            <span className="avatar-pick-text"><b>{t("Foto de perfil")}</b><small>{t("Opcional · la veuran a la comunitat")}</small></span>
          </label>
          <div className="field">
            <label htmlFor="ob-user">{t("Nom de motorista *")}</label>
            <input id="ob-user" className="input" value={username} maxLength={24} autoComplete="nickname" placeholder={t("p. ex. marc_trail")}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, '_'))} />
            {username && !validUsername(username) && <span className="hint">{t("De 3 a 24 caràcters: lletres, números, punt, guió o guió baix.")}</span>}
          </div>
          <div className="field">
            <label htmlFor="ob-name">{t("Nom (opcional)")}</label>
            <input id="ob-name" className="input" value={displayName} maxLength={40} autoComplete="given-name" onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="ob-birth">{t("Any de naixement *")}</label>
              <select id="ob-birth" className="input" value={birthYear} onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{t("Tria…")}</option>
                {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {birthYear !== '' && <span className="hint">{THIS_YEAR - birthYear} {t("anys · només ho veus tu")}</span>}
            </div>
            <div className="field">
              <label htmlFor="ob-country">{t("País")}</label>
              <select id="ob-country" className="input" value={country} onChange={(e) => { setCountryCode(e.target.value); setCountry(e.target.value); }}>
                {countryOptions.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ob-area">{t("D'on ets")}</label>
            <input id="ob-area" className="input" value={homeArea} maxLength={80} placeholder={t("Poble o comarca")} autoComplete="address-level2"
              onChange={(e) => setHomeArea(e.target.value)} />
          </div>
          <p className="hint">{t("Posa la comarca si no vols concretar el poble: es mostra al teu perfil públic.")}</p>
        </>
      )}

      {step === 1 && (
        <>
          <div className="label" style={{ margin: '12px 0 8px' }}>{t("Què t'agrada més? *")}</div>
          <div className="cards3">
            <button type="button" className={`choice ${style === 'road' ? 'on' : ''}`} onClick={() => setStyle('road')}>
              <span className="icon-tile"><Icon name="road" size={22} /></span><b>{t("Carretera")}</b><small>{t("Corbes i asfalt")}</small>
            </button>
            <button type="button" className={`choice ${style === 'trail' ? 'on' : ''}`} onClick={() => setStyle('trail')}>
              <span className="icon-tile"><Icon name="mountain" size={22} /></span><b>{t("Muntanya")}</b><small>{t("Pistes i trail")}</small>
            </button>
            <button type="button" className={`choice ${style === 'both' ? 'on' : ''}`} onClick={() => setStyle('both')}>
              <span className="icon-tile"><Icon name="route" size={22} /></span><b>{t("Les dues")}</b><small>{t("Segons el dia")}</small>
            </button>
          </div>
          <div className="field">
            <label>{t("Experiència *")}</label>
            <div className="seg">
              {([['beginner', t("Començo")], ['intermediate', t("Mitjana")], ['expert', t("Molta")]] as [Experience, string][]).map(([v, l]) => (
                <button key={v} type="button" className={experience === v ? 'on' : ''} onClick={() => setExperience(v)}>{l}</button>
              ))}
            </div>
            <span className="hint">{t("Serveix per proposar-te rutes de la dificultat adequada.")}</span>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="ob-since">{t("Vas en moto des de")}</label>
              <select id="ob-since" className="input" value={since} onChange={(e) => setSince(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {SINCE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ob-with">{t("Normalment vas…")}</label>
              <select id="ob-with" className="input" value={rideWith ?? ''} onChange={(e) => setRideWith((e.target.value || null) as RideWith | null)}>
                <option value="">—</option>
                <option value="solo">{t("Sol")}</option>
                <option value="passenger">{t("Amb passatger")}</option>
                <option value="group">{t("En grup")}</option>
              </select>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="hint" style={{ margin: '4px 0 12px' }}>{t("Amb el consum i el dipòsit de la teva moto calculem on repostar. Ho pots afinar a l'apartat Moto.")}</p>
          {defaultBike && (
            <div className="box chosen-bike">
              <span className="icon-tile"><Icon name="bike" size={22} /></span>
              <div><b>{defaultBike.name}</b><div className="hint">{defaultBike.tankLiters} l · {defaultBike.consumptionWmtc} {t("l/100 km")}</div></div>
              <span className="ok"><Icon name="check" size={22} /></span>
            </div>
          )}
          {bikes.length > 1 && (
            <div className="chips" style={{ marginBottom: 12 }}>
              {bikes.map((b) => (
                <button key={b.id} type="button" className={`chip ${b.id === defaultBike?.id ? 'on' : ''}`}
                  onClick={() => setBikes(bikes.map((x) => ({ ...x, isDefault: x.id === b.id })))}>{b.name}</button>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="ob-bike">{defaultBike ? t("Una altra moto") : t("Busca la teva moto")}</label>
            <input id="ob-bike" className="input" value={bikeQuery} placeholder={t("Marca o model, p. ex. Ténéré")} onChange={(e) => setBikeQuery(e.target.value)} />
          </div>
          <div className="bike-pick">
            {results.map((m) => (
              <button key={m.id} type="button" className="bike-row" onClick={() => pickModel(m.id)}>
                <b>{m.make} {m.model}</b>
                <small>{CATEGORY_LABEL[m.category] ?? m.category} · {m.years} · {m.tankLiters} l</small>
                <Icon name="plus" className="dim" />
              </button>
            ))}
            {!results.length && <p className="hint">{t("No la tenim al catàleg. Continua i afegeix-la a mà a l'apartat Moto.")}</p>}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="label" style={{ margin: '10px 0 8px' }}>{t("Sortides que fas normalment")}</div>
          <div className="chips" style={{ marginBottom: 14 }}>
            {BANDS.map((b) => (
              <button key={b.id} type="button" className={`chip ${band === b.id ? 'on' : ''}`} onClick={() => setBand(b.id)}>{b.label}</button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={avoidMotorways} onChange={(e) => setAvoidMotorways(e.target.checked)} /><span>{t("Evita autopistes i autovies")}</span></label>
          <label className="check"><input type="checkbox" checked={avoidTolls} onChange={(e) => setAvoidTolls(e.target.checked)} /><span>{t("Evita peatges")}</span></label>
          <div className="label" style={{ margin: '6px 0 8px' }}>{t("Què t'agrada trobar a la ruta?")}</div>
          <div className="chips" style={{ marginBottom: 14 }}>
            {INTERESTS.map((i) => (
              <button key={i.id} type="button" className={`chip ${interests.includes(i.id) ? 'on' : ''}`} onClick={() => toggleInterest(i.id)}><Icon name={i.icon} size={16} />{i.label}</button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="ob-bio">{t("Una frase sobre tu (opcional)")}</label>
            <textarea id="ob-bio" className="input" rows={2} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder={t("p. ex. Sortides de diumenge pel Montseny i algun viatge llarg a l'estiu")} />
          </div>
        </>
      )}

      {error && <div className="alert err">{error}</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        {step > 0
          ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t("Enrere")}</button>
          : editing ? <button type="button" className="btn" onClick={onCancel}>{t("Cancel·la")}</button> : null}
        {step < steps.length - 1
          ? <button type="button" className="btn primary" disabled={!valid[step]} onClick={() => { setError(null); setStep(step + 1); }}>
              {step === 2 && !defaultBike ? t("Ara no, continua") : t("Continua")}
            </button>
          : <button type="button" className="btn primary" disabled={busy || !valid[0] || !valid[1]} onClick={finish}>
              {busy ? t("Desant…") : editing ? t("Desa els canvis") : t("Comença a rodar")}
            </button>}
      </div>
    </div>
  );
}
