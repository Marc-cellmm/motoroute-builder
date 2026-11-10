import { useEffect, useRef, useState } from 'react';
import { reverseGeocode, searchPlaces } from '../lib/places';
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

export default function LocationInput({ label, value, onChange, allowMyLocation, onPickOnMap, picking }: Props) {
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setText(value?.name ?? ''), [value]);

  function onType(t: string) {
    setText(t);
    setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setResults(await searchPlaces(t, value?.coord));
      } catch {
        setResults([]);
      }
    }, 300);
  }

  function myLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coord: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        onChange({ name: await reverseGeocode(coord), coord });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="ac">
        <input
          className="input"
          value={text}
          placeholder={t("Cerca un poble, ciutat o lloc")}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <div className="ac-list">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => {
                  onChange(r);
                  setOpen(false);
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ flex: 'none', gap: 8 }}>
        {allowMyLocation && (
          <button type="button" className="btn small" onClick={myLocation} disabled={locating}>
            <Icon name="locate" size={18} />{locating ? t("Localitzant…") : t("La meva ubicació")}
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
