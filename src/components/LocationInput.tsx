import { useEffect, useRef, useState } from 'react';
import { rememberPosition, reverseGeocode, searchPlaces } from '../lib/places';
import { currentPosition, type LocationError } from '../lib/location';
import { isAbort } from '../lib/net';
import type { Place } from '../lib/types';
import Icon from './Icon';
import { t } from '../i18n';

interface Props {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  allowMyLocation?: boolean;
  onPickOnMap?: () => void;
  picking?: boolean;
}

type Search = 'idle' | 'loading' | 'done' | 'error';

export default function LocationInput({ label, value, onChange, allowMyLocation, onPickOnMap, picking }: Props) {
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [search, setSearch] = useState<Search>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ctrl = useRef<AbortController | null>(null);
  const pending = useRef<Promise<Place[]> | null>(null);
  const dirty = useRef(false); // l'usuari ha escrit i encara no ha triat
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => setText(value?.name ?? ''), [value]);
  useEffect(() => () => { window.clearTimeout(timer.current); ctrl.current?.abort(); }, []);

  /** Cerca el text. Si n'hi havia una altra en curs, la cancel·la: només compta l'última. */
  function run(q: string): Promise<Place[]> {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setSearch('loading');
    const p = searchPlaces(q, valueRef.current?.coord, c.signal)
      .then((list) => {
        if (ctrl.current === c) { setResults(list); setActive(0); setSearch('done'); }
        return list;
      })
      .catch((e) => {
        if (!isAbort(e) && ctrl.current === c) { setResults([]); setSearch('error'); }
        return [] as Place[];
      });
    pending.current = p;
    return p;
  }

  function onType(q: string) {
    dirty.current = true;
    setText(q);
    setOpen(true);
    setLocError(null);
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      ctrl.current?.abort();
      pending.current = null;
      setResults([]);
      setSearch('idle');
      if (!q.trim() && value) onChange(null);
      return;
    }
    setSearch('loading');
    timer.current = window.setTimeout(() => void run(q), 250);
  }

  function choose(p: Place) {
    dirty.current = false;
    window.clearTimeout(timer.current);
    ctrl.current?.abort();
    pending.current = null;
    setText(p.name);
    setOpen(false);
    onChange(p);
  }

  /** En sortir del camp o prémer Retorn sense triar, agafa el primer resultat. */
  async function commit() {
    const q = text.trim();
    if (!dirty.current || q.length < 2 || q === valueRef.current?.name) return;
    window.clearTimeout(timer.current);
    const list = search === 'done' && results.length ? results : await (pending.current ?? run(q));
    if (!dirty.current) return; // mentrestant ha triat de la llista
    if (list[0]) choose(list[Math.min(active, list.length - 1)] ?? list[0]);
    else if (valueRef.current) { dirty.current = false; setText(valueRef.current.name); } // no trobat: es manté el lloc d'abans
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); void commit(); (e.target as HTMLInputElement).blur(); }
    else if (e.key === 'Escape') setOpen(false);
  }

  async function myLocation() {
    setLocating(true);
    setLocError(null);
    try {
      const coord = await currentPosition();
      rememberPosition(coord);
      // El punt queda posat de seguida; el nom del poble arriba quan pot.
      const place = { name: t("La meva ubicació"), coord };
      onChange(place);
      const name = await reverseGeocode(coord);
      if (valueRef.current?.coord === coord) onChange({ name, coord });
    } catch (e) {
      setLocError((e as LocationError) === 'denied' ? t("Permís de localització denegat.") : t("No s'ha pogut obtenir la teva ubicació. Prova-ho a l'aire lliure o escriu el poble."));
    } finally {
      setLocating(false);
    }
  }

  const q = text.trim();
  const showList = open && q.length >= 2 && q !== value?.name;

  return (
    <div className="field">
      <label>{label}</label>
      <div className="ac">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            className="input"
            value={text}
            placeholder={t("Cerca un poble, ciutat o lloc")}
            onChange={(e) => onType(e.target.value)}
            onFocus={(e) => { setOpen(true); e.target.select(); }}
            onBlur={() => setTimeout(() => { setOpen(false); void commit(); }, 150)}
            onKeyDown={onKey}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-autocomplete="list"
          />
          {search === 'loading' && q.length >= 2 && <span className="spin ac-spin" aria-hidden="true" />}
        </div>
        {showList && (
          <div className="ac-list" role="listbox">
            {results.map((r, i) => (
              <button
                key={`${r.name}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); choose(r); }}
              >
                <Icon name="pin" size={16} /> <span>{r.name}</span>
              </button>
            ))}
            {search === 'loading' && !results.length && <div className="ac-msg">{t("Carregant…")}</div>}
            {search === 'done' && !results.length && <div className="ac-msg">{t("No s'ha trobat cap lloc amb aquest nom. Revisa'n l'ortografia o tria'l al mapa.")}</div>}
            {search === 'error' && <div className="ac-msg">{t("No hi ha connexió. Comprova la cobertura i torna-ho a provar.")}</div>}
          </div>
        )}
      </div>
      {locError && <div className="alert warn" style={{ margin: '4px 0 0' }}>{locError}</div>}
      <div className="row" style={{ flex: 'none', gap: 8 }}>
        {allowMyLocation && (
          <button type="button" className="btn small" onClick={myLocation} disabled={locating}>
            {locating ? <span className="spin" aria-hidden="true" /> : <Icon name="locate" size={18} />}
            {locating ? t("Localitzant…") : t("La meva ubicació")}
          </button>
        )}
        {onPickOnMap && (
          <button type="button" className={`btn small ${picking ? 'primary' : ''}`} onClick={onPickOnMap}>
            <Icon name="map" size={18} />{picking ? t("Toca el mapa…") : t("Tria al mapa")}
          </button>
        )}
      </div>
    </div>
  );
}
