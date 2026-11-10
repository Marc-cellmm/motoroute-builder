import { useRef, useState } from 'react';
import LocationInput from './LocationInput';
import { DEMO } from './MapView';
import type { Difficulty, DistanceBand, Motorcycle, Place, PlanRequest } from '../lib/types';
import Icon from './Icon';

export type PickTarget = 'origin' | 'destination' | null;

interface Props {
  req: PlanRequest;
  setReq: (r: PlanRequest) => void;
  bikes: Motorcycle[];
  onSubmit: (r: PlanRequest) => void;
  picking: PickTarget;
  setPicking: (t: PickTarget) => void;
  goToBike: () => void;
  busy: boolean;
  /** obre un GPX d'una altra app (Calimoto, Kurviger, Garmin, Wikiloc…) com a ruta planificada */
  onImportGpx?: (file: File) => void;
  importError?: string | null;
}

const BANDS: { id: DistanceBand; label: string; sub: string }[] = [
  { id: '50_100', label: '50–100 km', sub: 'Sortida ràpida' },
  { id: '100_200', label: '100–200 km', sub: 'Mig dia' },
  { id: '200_400', label: '200–400 km', sub: 'Jornada completa' },
  { id: '400_plus', label: '400+ km', sub: 'Gran travessa' },
];

const DIFF_HELP: Record<string, Record<Difficulty, string>> = {
  road: {
    beginner: 'Carreteres amples, corbes obertes i pendents suaus.',
    intermediate: 'Secundàries amb corbes enllaçades i ports moderats.',
    expert: 'Carreteres estretes, forquilles i ports amb pendents forts.',
  },
  trail: {
    beginner: 'Asfalt d\'enllaç i pistes amples i compactades.',
    intermediate: 'Pistes de grava i terra amb algun tram trencat.',
    expert: 'Pistes amb pedra solta i pendents tècnics.',
  },
};

export default function Wizard({ req, setReq, bikes, onSubmit, picking, setPicking, goToBike, busy, onImportGpx, importError }: Props) {
  const gpxRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [addingVia, setAddingVia] = useState(false);
  const set = (patch: Partial<PlanRequest>) => setReq({ ...req, ...patch });
  const circular = req.circular;
  const canNext = [true, !!req.origin && (circular || !!req.destination), true, true][step];

  const setVia = (i: number, p: Place | null) => {
    const vias = [...req.vias];
    if (p) vias[i] = p;
    else vias.splice(i, 1);
    set({ vias });
  };

  return (
    <div>
      <div className="stepper">{[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <h2>Modalitat i moto</h2>
          <p className="hint">Tria per on vols rodar i amb quina moto.</p>
          {onImportGpx && (
            <>
              <button className="btn ghost import-gpx" disabled={busy} onClick={() => gpxRef.current?.click()}>
                <Icon name="upload" /> Ja tens la ruta? Obre un GPX <small>(Calimoto, Kurviger, Garmin, Wikiloc…)</small>
              </button>
              <input ref={gpxRef} type="file" accept=".gpx,application/gpx+xml" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportGpx(f); e.target.value = ''; }} />
              {importError && <div className="alert err">{importError}</div>}
            </>
          )}
          <div className="cards2" style={{ marginTop: 14 }}>
            <button className={`choice ${req.mode === 'road' ? 'on' : ''}`} onClick={() => set({ mode: 'road' })}>
              <span className="icon-tile"><Icon name="road" size={22} /></span>
              <b>Carretera</b>
              <small>100 % asfalt, prioritza secundàries amb corbes</small>
            </button>
            <button className={`choice ${req.mode === 'trail' ? 'on' : ''}`} onClick={() => set({ mode: 'trail', avoidMotorways: true })}>
              <span className="icon-tile"><Icon name="mountain" size={22} /></span>
              <b>Trail / Off-road</b>
              <small>Asfalt d'enllaç + pistes transitables</small>
            </button>
          </div>
          {req.mode === 'trail' && (
            <div className="alert warn">
              Circula només per pistes autoritzades. El motor respecta les restriccions d'accés d'OpenStreetMap,
              però pot haver-hi tancaments locals (per exemple, risc d'incendi) que no hi constin.
            </div>
          )}
          <div className="field">
            <label>La meva moto</label>
            {bikes.length ? (
              <select className="input" value={req.bikeId ?? ''} onChange={(e) => set({ bikeId: e.target.value || null })}>
                {bikes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="">Sense moto (no es calcularan parades de benzina)</option>
              </select>
            ) : (
              <button className="btn" onClick={goToBike}><Icon name="plus" size={16} /> Afegeix la meva moto per calcular la benzina</button>
            )}
          </div>
          {req.bikeId && (
            <div className="field">
              <label>Amb quant dipòsit surts?</label>
              <div className="chips">
                {[1, 0.75, 0.5, 0.25].map((f) => (
                  <button key={f} className={`chip ${req.startFuelFraction === f ? 'on' : ''}`} onClick={() => set({ startFuelFraction: f })}>
                    {f === 1 ? 'Ple' : f === 0.75 ? '3/4' : f === 0.5 ? '1/2' : '1/4'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <h2>Origen i destinació</h2>
          <div style={{ height: 12 }} />
          <LocationInput
            label="Sortida"
            value={req.origin}
            onChange={(origin) => set({ origin })}
            allowMyLocation={!DEMO}
            onPickOnMap={() => setPicking(picking === 'origin' ? null : 'origin')}
            picking={picking === 'origin'}
          />
          <div className="toggle">
            <div>
              <b>Ruta circular</b>
              <div className="hint">Sortida i arribada al mateix punt</div>
            </div>
            <input type="checkbox" checked={circular} onChange={(e) => set({ circular: e.target.checked, vias: [] })} />
          </div>
          <div style={{ height: 12 }} />
          {!circular && (
            <>
              <LocationInput
                label="Destinació"
                value={req.destination}
                onChange={(destination) => set({ destination })}
                onPickOnMap={() => setPicking(picking === 'destination' ? null : 'destination')}
                picking={picking === 'destination'}
              />
              {req.vias.map((v, i) => (
                <div key={i}>
                  <LocationInput label={`Punt de pas ${i + 1}`} value={v} onChange={(p) => setVia(i, p)} />
                  <button className="btn small ghost" onClick={() => setVia(i, null)}>Treu el punt de pas</button>
                </div>
              ))}
              {addingVia && (
                <LocationInput
                  label={`Punt de pas ${req.vias.length + 1}`}
                  value={null}
                  onChange={(p) => {
                    if (p) set({ vias: [...req.vias, p] });
                    setAddingVia(false);
                  }}
                />
              )}
              {req.vias.length < 3 && !addingVia && (
                <button className="btn small" onClick={() => setAddingVia(true)}><Icon name="plus" size={16} /> Afegeix punt de pas</button>
              )}
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h2>Distància i dificultat</h2>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Quilometratge</label>
            <div className="chips">
              {BANDS.map((b) => (
                <button key={b.id} className={`chip ${req.band === b.id ? 'on' : ''}`} onClick={() => set({ band: b.id })}>
                  {b.label}
                  <small>{b.sub}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Nivell</label>
            <div className="seg">
              {(['beginner', 'intermediate', 'expert'] as Difficulty[]).map((d) => (
                <button key={d} className={req.difficulty === d ? 'on' : ''} onClick={() => set({ difficulty: d })}>
                  {d === 'beginner' ? 'Principiant' : d === 'intermediate' ? 'Intermedi' : 'Avançat'}
                </button>
              ))}
            </div>
            <p className="hint">{DIFF_HELP[req.mode][req.difficulty]}</p>
          </div>
          {req.mode === 'road' && (
            <div className="toggle">
              <span>Evitar autopistes i autovies</span>
              <input type="checkbox" checked={req.avoidMotorways} onChange={(e) => set({ avoidMotorways: e.target.checked })} />
            </div>
          )}
          <div className="toggle">
            <span>Evitar peatges</span>
            <input type="checkbox" checked={req.avoidTolls} onChange={(e) => set({ avoidTolls: e.target.checked })} />
          </div>
          {req.origin && (
            <button
              className="btn"
              style={{ width: '100%', marginTop: 16 }}
              disabled={busy}
              onClick={() => onSubmit({ ...req, circular: true, vias: [] })}
            >
              <Icon name="sparkle" /> Suggereix-me rutes circulars des de {req.origin.name.split(',')[0]}
            </button>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h2>Dates i etapes</h2>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Sortida</label>
            <input type="datetime-local" className="input" value={req.departure} onChange={(e) => set({ departure: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Dies</label>
              <select className="input" value={req.days} onChange={(e) => set({ days: +e.target.value })}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d === 1 ? '1 dia' : `${d} dies`}</option>)}
              </select>
            </div>
            {req.days > 1 && (
              <div className="field">
                <label>Màxim km per dia</label>
                <input type="number" min={50} step={10} className="input" value={req.kmPerDay} onChange={(e) => set({ kmPerDay: +e.target.value })} />
              </div>
            )}
          </div>
          <p className="hint">La meteo es consulta a l'hora estimada de pas per cada tram (previsió fins a 16 dies).</p>
        </>
      )}

      <div className="actions">
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Enrere</button>}
        {step < 3 ? (
          <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Següent</button>
        ) : (
          <button className="btn primary" disabled={busy || !req.origin} onClick={() => onSubmit(req)}>Calcula les rutes</button>
        )}
      </div>
    </div>
  );
}
