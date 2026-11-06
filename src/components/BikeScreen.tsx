import { useState } from 'react';
import { CATEGORY_LABEL, searchCatalog, type BikeModel } from '../lib/bikes';
import { effectiveConsumption, realConsumption, usableRangeKm } from '../lib/fuel';
import { uid } from '../lib/storage';
import type { Motorcycle } from '../lib/types';

interface Props {
  bikes: Motorcycle[];
  setBikes: (b: Motorcycle[]) => void;
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

const fromModel = (m: BikeModel): Motorcycle => ({
  ...blank(),
  name: `${m.make} ${m.model}`,
  modelId: m.id,
  category: m.category,
  fuel: m.fuel,
  tankLiters: m.tankLiters,
  reserveLiters: m.reserveLiters,
  consumptionWmtc: m.consumption,
});

export default function BikeScreen({ bikes, setBikes }: Props) {
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
        <h2>Afegeix la meva moto</h2>
        <p className="hint">Cerca el model: carregarem el dipòsit i el consum perquè puguis revisar-los.</p>
        <div className="field" style={{ marginTop: 14 }}>
          <input className="input" autoFocus placeholder="Marca o model (p. ex. Ténéré, GS, MT-07)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {results.map((m) => (
          <button
            key={m.id}
            className="list-item"
            style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => {
              setDraft(fromModel(m));
              setDraftVerified(m.verified);
              setMode('edit');
            }}
          >
            <div className="main">
              <b>{m.make} {m.model}</b>
              <div className="hint">{CATEGORY_LABEL[m.category]} · {m.years} · {m.tankLiters} l · {m.consumption} l/100 km</div>
            </div>
            <span className="muted">›</span>
          </button>
        ))}
        <div className="actions">
          {bikes.length > 0 && <button className="btn" onClick={() => setMode('list')}>Cancel·la</button>}
          <button className="btn" onClick={() => { setDraft({ ...blank(), name: query }); setDraftVerified(null); setMode('edit'); }}>
            No trobo el meu model
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
        <h2>{bikes.some((b) => b.id === d.id) ? 'Edita la moto' : 'Revisa les dades'}</h2>
        {draftVerified === false && (
          <div className="alert warn">Valors aproximats del catàleg: comprova'ls amb la fitxa tècnica o el manual de la teva moto.</div>
        )}
        {draftVerified === true && <div className="alert info">Dades de la fitxa oficial del fabricant.</div>}
        <div className="field" style={{ marginTop: 10 }}>
          <label>Nom</label>
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="p. ex. La Ténéré" />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Dipòsit (l)</label>
            <input type="number" step="0.1" className="input" value={d.tankLiters} onChange={(e) => set({ tankLiters: +e.target.value })} />
          </div>
          <div className="field">
            <label>Reserva (l)</label>
            <input type="number" step="0.1" className="input" value={d.reserveLiters} onChange={(e) => set({ reserveLiters: +e.target.value })} />
          </div>
          <div className="field">
            <label>Consum (l/100 km)</label>
            <input type="number" step="0.1" className="input" value={d.consumptionWmtc} onChange={(e) => set({ consumptionWmtc: +e.target.value })} />
          </div>
          <div className="field">
            <label>Gasolina</label>
            <select className="input" value={d.fuel} onChange={(e) => set({ fuel: e.target.value as Motorcycle['fuel'] })}>
              <option value="gasoline_95">95</option>
              <option value="gasoline_98">98</option>
            </select>
          </div>
        </div>
        <div className="toggle">
          <span>Normalment amb passatger</span>
          <input type="checkbox" checked={d.carriesPassenger} onChange={(e) => set({ carriesPassenger: e.target.checked })} />
        </div>
        <div className="toggle">
          <span>Normalment amb maletes o top case</span>
          <input type="checkbox" checked={d.carriesLuggage} onChange={(e) => set({ carriesLuggage: e.target.checked })} />
        </div>
        <div className="box" style={{ marginTop: 14 }}>
          <div className="kv">
            <span>Autonomia útil (fins a la reserva)</span><b>{Number.isFinite(range) ? Math.round(range) : '—'} km</b>
            <span>Autonomia segura (marge 15 %)</span><b>{Number.isFinite(range) ? Math.round(range * 0.85) : '—'} km</b>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMode(bikes.length ? 'list' : 'search')}>Cancel·la</button>
          <button
            className="btn primary"
            disabled={!d.name || d.tankLiters <= d.reserveLiters || d.consumptionWmtc <= 0}
            onClick={() => save(d)}
          >
            Desa la moto
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'refuel' && draft) {
    const b = draft;
    return (
      <div>
        <h2>He repostat</h2>
        <p className="hint">Amb dos plens seguits calculem el consum real de la teva {b.name}.</p>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Litres</label>
            <input type="number" step="0.01" className="input" value={refuel.liters} onChange={(e) => setRefuel({ ...refuel, liters: e.target.value })} />
          </div>
          <div className="field">
            <label>Km des de l'últim ple</label>
            <input type="number" className="input" value={refuel.km} onChange={(e) => setRefuel({ ...refuel, km: e.target.value })} />
          </div>
          <div className="field">
            <label>Preu (€/l, opcional)</label>
            <input type="number" step="0.001" className="input" value={refuel.price} onChange={(e) => setRefuel({ ...refuel, price: e.target.value })} />
          </div>
        </div>
        <div className="toggle">
          <span>He omplert el dipòsit</span>
          <input type="checkbox" checked={refuel.full} onChange={(e) => setRefuel({ ...refuel, full: e.target.checked })} />
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMode('list')}>Cancel·la</button>
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
            Desa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>La meva moto</h2>
      <p className="hint">El consum i el dipòsit decideixen on et recomanem repostar a cada ruta.</p>
      <div style={{ height: 14 }} />
      {bikes.map((b) => {
        const real = realConsumption(b);
        const road = effectiveConsumption(b, 'road', 0);
        const trail = effectiveConsumption(b, 'trail', 0);
        return (
          <div key={b.id} className="box">
            <div className="bike-card">
              <span className="ico">🏍️</span>
              <div style={{ flex: 1 }}>
                <h3>{b.name}</h3>
                <div className="hint">{CATEGORY_LABEL[b.category] ?? b.category} · Gasolina {b.fuel === 'gasoline_98' ? '98' : '95'}{b.isDefault ? ' · Per defecte' : ''}</div>
              </div>
            </div>
            <div className="kv" style={{ marginTop: 12 }}>
              <span>Dipòsit / reserva</span><b>{b.tankLiters} l / {b.reserveLiters} l</b>
              <span>Consum de fitxa</span><b>{b.consumptionWmtc} l/100 km</b>
              <span>Consum real</span><b>{real ? `${real.avg.toFixed(2)} l/100 km (${real.n} ${real.n === 1 ? "mesura" : "mesures"})` : 'Encara sense dades'}</b>
              <span>Consum efectiu carretera / trail</span><b>{road} / {trail}</b>
              <span>Autonomia segura (carretera)</span><b>{Math.round(usableRangeKm(b, road) * 0.85)} km</b>
            </div>
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn small primary" onClick={() => { setDraft(b); setMode('refuel'); }}>⛽ He repostat</button>
              <button className="btn small" onClick={() => { setDraft(b); setDraftVerified(null); setMode('edit'); }}>Edita</button>
              {!b.isDefault && <button className="btn small" onClick={() => setDefault(b.id)}>Per defecte</button>}
              <button className="btn small ghost" onClick={() => remove(b.id)}>Elimina</button>
            </div>
          </div>
        );
      })}
      <button className="btn" style={{ width: '100%' }} onClick={() => { setQuery(''); setMode('search'); }}>＋ Afegeix una moto</button>
    </div>
  );
}
