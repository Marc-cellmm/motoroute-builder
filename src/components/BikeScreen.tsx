import { useState } from 'react';
import { bikeFromModel, CATEGORY_LABEL, searchCatalog, type BikeModel } from '../lib/bikes';
import { effectiveConsumption, realConsumption, usableRangeKm } from '../lib/fuel';
import { uid } from '../lib/storage';
import Icon from './Icon';
import type { Motorcycle } from '../lib/types';
import { t } from '../i18n';

interface Props {
  bikes: Motorcycle[];
  setBikes: (b: Motorcycle[]) => void;
  /** foto de portada del perfil: es mostra a la moto principal */
  coverUrl?: string | null;
}

const blank = (): Motorcycle => ({
  id: uid(),
  name: '',
  category: 'naked',
  fuel: 'gasoline_95',
  tankLiters: 15,
  reserveLiters: 3,
  consumptionWmtc: 4.5,
  carriesPassenger: false,
  carriesLuggage: false,
  refuels: [],
  isDefault: false,
});

const fromModel = (m: BikeModel): Motorcycle => bikeFromModel(m, uid());

export default function BikeScreen({ bikes, setBikes, coverUrl }: Props) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'search' | 'edit' | 'refuel'>(bikes.length ? 'list' : 'search');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Motorcycle | null>(null);
  const [draftVerified, setDraftVerified] = useState<boolean | null>(null);
  const [refuel, setRefuel] = useState({ liters: '', km: '', full: true, price: '' });

  const save = (b: Motorcycle) => {
    const exists = bikes.some((x) => x.id === b.id);
    let next = exists ? bikes.map((x) => (x.id === b.id ? b : x)) : [...bikes, b];
    if (!next.some((x) => x.isDefault)) next = next.map((x, i) => ({ ...x, isDefault: i === 0 }));
    setBikes(next);
    setMode('list');
    setDraft(null);
  };

  const setDefault = (id: string) => setBikes(bikes.map((b) => ({ ...b, isDefault: b.id === id })));
  const remove = (id: string) => setBikes(bikes.filter((b) => b.id !== id));

  if (mode === 'search') {
    const results = searchCatalog(query);
    return (
      <div>
        <h2>{t("Afegeix la meva moto")}</h2>
        <p className="hint">{t("Cerca el model: carregarem el dipòsit i el consum perquè puguis revisar-los.")}</p>
        <div className="field search-field" style={{ marginTop: 14 }}>
          <Icon name="search" className="dim" />
          <input className="input" autoFocus placeholder={t("Marca o model (p. ex. Ténéré, GS, MT-07)")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {results.map((m) => (
          <button
            key={m.id}
            className="pick-row"
            onClick={() => {
              setDraft(fromModel(m));
              setDraftVerified(m.verified);
              setMode('edit');
            }}
          >
            <div className="main">
              <b>{m.make} {m.model}</b>
              <div className="hint">{CATEGORY_LABEL[m.category]} · {m.years} · {m.tankLiters} l · {m.consumption} {t("l/100 km")}</div>
            </div>
            <Icon name="chevron-right" className="dim" />
          </button>
        ))}
        <div className="actions">
          {bikes.length > 0 && <button className="btn" onClick={() => setMode('list')}>{t("Cancel·la")}</button>}
          <button className="btn" onClick={() => { setDraft({ ...blank(), name: query }); setDraftVerified(null); setMode('edit'); }}>
            {t("No trobo el meu model")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'edit' && draft) {
    const d = draft;
    const set = (patch: Partial<Motorcycle>) => setDraft({ ...d, ...patch });
    const range = usableRangeKm(d, d.consumptionWmtc);
    return (
      <div>
        <h2>{bikes.some((b) => b.id === d.id) ? t("Edita la moto") : t("Revisa les dades")}</h2>
        {draftVerified === false && (
          <div className="alert warn">{t("Valors aproximats del catàleg: comprova'ls amb la fitxa tècnica o el manual de la teva moto.")}</div>
        )}
        {draftVerified === true && <div className="alert info">{t("Dades de la fitxa oficial del fabricant.")}</div>}
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t("Nom")}</label>
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("p. ex. La Ténéré")} />
        </div>
        <div className="grid2">
          <div className="field">
            <label>{t("Dipòsit (l)")}</label>
            <input type="number" step="0.1" className="input" value={d.tankLiters} onChange={(e) => set({ tankLiters: +e.target.value })} />
          </div>
          <div className="field">
            <label>{t("Reserva (l)")}</label>
            <input type="number" step="0.1" className="input" value={d.reserveLiters} onChange={(e) => set({ reserveLiters: +e.target.value })} />
          </div>
          <div className="field">
            <label>{t("Consum (l/100 km)")}</label>
            <input type="number" step="0.1" className="input" value={d.consumptionWmtc} onChange={(e) => set({ consumptionWmtc: +e.target.value })} />
          </div>
          <div className="field">
            <label>{t("Gasolina")}</label>
            <select className="input" value={d.fuel} onChange={(e) => set({ fuel: e.target.value as Motorcycle['fuel'] })}>
              <option value="gasoline_95">95</option>
              <option value="gasoline_98">98</option>
            </select>
          </div>
        </div>
        <div className="toggle">
          <span>{t("Normalment amb passatger")}</span>
          <input type="checkbox" checked={d.carriesPassenger} onChange={(e) => set({ carriesPassenger: e.target.checked })} />
        </div>
        <div className="toggle">
          <span>{t("Normalment amb maletes o top case")}</span>
          <input type="checkbox" checked={d.carriesLuggage} onChange={(e) => set({ carriesLuggage: e.target.checked })} />
        </div>
        <div className="spec-grid" style={{ marginTop: 14 }}>
          <div><span>{t("Autonomia fins a la reserva")}</span><b>{Number.isFinite(range) ? Math.round(range) : '—'} <small>{t("km")}</small></b></div>
          <div><span>{t("Autonomia segura (−15 %)")}</span><b>{Number.isFinite(range) ? Math.round(range * 0.85) : '—'} <small>{t("km")}</small></b></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMode(bikes.length ? 'list' : 'search')}>{t("Cancel·la")}</button>
          <button
            className="btn primary"
            disabled={!d.name || d.tankLiters <= d.reserveLiters || d.consumptionWmtc <= 0}
            onClick={() => save(d)}
          >
            {t("Desa la moto")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'refuel' && draft) {
    const b = draft;
    return (
      <div>
        <h2>{t("He repostat")}</h2>
        <p className="hint">{t("Amb dos plens seguits calculem el consum real de la teva")}{' '}{b.name}.</p>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>{t("Litres")}</label>
            <input type="number" step="0.01" className="input" value={refuel.liters} onChange={(e) => setRefuel({ ...refuel, liters: e.target.value })} />
          </div>
          <div className="field">
            <label>{t("Km des de l'últim ple")}</label>
            <input type="number" className="input" value={refuel.km} onChange={(e) => setRefuel({ ...refuel, km: e.target.value })} />
          </div>
          <div className="field">
            <label>{t("Preu (€/l, opcional)")}</label>
            <input type="number" step="0.001" className="input" value={refuel.price} onChange={(e) => setRefuel({ ...refuel, price: e.target.value })} />
          </div>
        </div>
        <div className="toggle">
          <span>{t("He omplert el dipòsit")}</span>
          <input type="checkbox" checked={refuel.full} onChange={(e) => setRefuel({ ...refuel, full: e.target.checked })} />
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMode('list')}>{t("Cancel·la")}</button>
          <button
            className="btn primary"
            disabled={!(+refuel.liters > 0)}
            onClick={() => {
              save({
                ...b,
                refuels: [
                  ...b.refuels,
                  {
                    date: new Date().toISOString(),
                    liters: +refuel.liters,
                    kmSinceLastFull: +refuel.km > 0 ? +refuel.km : null,
                    fullTank: refuel.full,
                    pricePerLiter: +refuel.price > 0 ? +refuel.price : undefined,
                  },
                ],
              });
              setRefuel({ liters: '', km: '', full: true, price: '' });
            }}
          >
            {t("Desa")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t("La meva moto")}</h2>
          <p className="hint">{t("El dipòsit i el consum decideixen on et recomanem repostar a cada ruta.")}</p>
        </div>
      </div>
      {bikes.map((b) => {
        const real = realConsumption(b);
        const road = effectiveConsumption(b, 'road', 0);
        const trail = effectiveConsumption(b, 'trail', 0);
        const safe = Math.round(usableRangeKm(b, road) * 0.85);
        const cover = b.isDefault ? coverUrl : null;
        return (
          <article key={b.id} className={`garage ${b.isDefault ? 'main' : ''}`}>
            {cover && <div className="garage-cover" style={{ backgroundImage: `url(${cover})` }} />}
            <header className="garage-head">
              <span className="icon-tile"><Icon name="bike" size={22} /></span>
              <div className="garage-title">
                <h3>{b.name}</h3>
                <div className="hint">{CATEGORY_LABEL[b.category] ?? b.category} {t("· Gasolina")}{' '}{b.fuel === 'gasoline_98' ? '98' : '95'}</div>
              </div>
              {b.isDefault && <span className="pill">{t("Principal")}</span>}
            </header>
            <div className="garage-range">
              <div>
                <span className="eyebrow">{t("Autonomia segura")}</span>
                <div className="metric go-text">{Number.isFinite(safe) ? safe : '—'}<small>{t("km")}</small></div>
              </div>
              <Icon name="gauge" size={34} className="go-text" />
            </div>
            <div className="spec-grid">
              <div><span>{t("Dipòsit")}</span><b>{b.tankLiters} l</b></div>
              <div><span>{t("Reserva")}</span><b>{b.reserveLiters} l</b></div>
              <div><span>{t("Consum de fitxa")}</span><b>{b.consumptionWmtc} <small>l/100</small></b></div>
              <div><span>{t("Consum real")}</span><b>{real ? <>{real.avg.toFixed(2)} <small>l/100</small></> : <small>{t("Sense dades")}</small>}</b></div>
            </div>
            <p className="hint">{t("Consum efectiu:")}{' '}{road} {t("l/100 en carretera ·")}{' '}{trail} {t("l/100 en pista")}{real ? ` · ${real.n} ${real.n === 1 ? 'mesura' : 'mesures'}` : ''}</p>
            <div className="garage-actions">
              <button className="btn primary" onClick={() => { setDraft(b); setMode('refuel'); }}><Icon name="fuel" /> {t("He repostat")}</button>
              <button className="btn" onClick={() => { setDraft(b); setDraftVerified(null); setMode('edit'); }}><Icon name="edit" /> {t("Edita")}</button>
            </div>
            <div className="garage-more">
              {!b.isDefault && <button className="link-btn" onClick={() => setDefault(b.id)}>{t("Fes-la principal")}</button>}
              {confirmRemove === b.id ? (
                <span className="confirm">
                  {t("Segur?")}
                  <button className="link-btn danger" onClick={() => { remove(b.id); setConfirmRemove(null); }}>{t("Sí, elimina-la")}</button>
                  <button className="link-btn" onClick={() => setConfirmRemove(null)}>{t("No")}</button>
                </span>
              ) : (
                <button className="link-btn muted-link" onClick={() => setConfirmRemove(b.id)}><Icon name="trash" size={16} /> {t("Elimina")}</button>
              )}
            </div>
          </article>
        );
      })}
      <button className="btn ghost wide-btn" onClick={() => { setQuery(''); setMode('search'); }}><Icon name="plus" /> {t("Afegeix una moto")}</button>
    </div>
  );
}
