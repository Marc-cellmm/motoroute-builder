import { useEffect, useState } from 'react';
import MapView from './MapView';
import { useLiveFollow } from '../lib/live';

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `fa ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `fa ${m} min` : `fa ${Math.round(m / 60)} h`;
};

/** Pàgina pública per seguir una sortida en directe (?live=<id>). */
export default function LiveViewer({ id }: { id: string }) {
  const { last, trail, status } = useLiveFollow(id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const stale = last && !last.done && now - last.t > 60_000;
  const who = last?.name ? `@${last.name}` : 'El motorista';

  return (
    <div className="app">
      <aside className="panel">
        <div className="brand">
          <div className="brand-mark">M</div>
          <h1>MotoRoute · en directe</h1>
        </div>
        <div className="panel-body">
          {status === 'error' && <div className="alert err">No s'ha pogut obrir el seguiment. Comprova l'enllaç.</div>}
          {(status === 'connecting' || status === 'waiting') && (
            <div className="alert info">Esperant la ubicació… El telèfon de qui grava envia la posició cada 10 segons.</div>
          )}
          {last && (
            <>
              <div className="live-head" style={{ marginBottom: 10 }}>
                {!last.done && !stale && <span className="live-dot" />}
                <b>{who}</b>
                <span className="hint">
                  {last.done ? ' · ha acabat la sortida' : last.paused ? ' · en pausa' : stale ? ` · sense senyal (${ago(now - last.t)})` : ` · actualitzat ${ago(now - last.t)}`}
                </span>
              </div>
              <div className="rec-grid">
                <div className="rec-stat big"><b>{last.km.toFixed(1)}</b><span>km fets</span></div>
                <div className="rec-stat big"><b>{last.s != null && !last.paused && !last.done ? Math.round(last.s) : '—'}</b><span>km/h</span></div>
              </div>
            </>
          )}
          <p className="hint" style={{ marginTop: 14 }}>
            Planifica les teves rutes amb corbes, meteo i benzina a{' '}
            <a href={location.pathname}>MotoRoute Builder</a>.
          </p>
        </div>
      </aside>
      <main className="map-wrap">
        <MapView
          routes={[]}
          selectedId={null}
          onSelect={() => {}}
          origin={null}
          destination={null}
          vias={[]}
          liveTrack={trail}
          position={last?.c ?? null}
          follow={!last?.done}
        />
      </main>
    </div>
  );
}
