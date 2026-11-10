import type { ReactNode } from 'react';
import { maneuverIcon } from '../lib/navigation';
import { fmtClock } from '../lib/recorder';
import type { NavView } from '../lib/useNavigation';
import type { LiveFix, RecState } from '../lib/recorder';
import Icon from './Icon';
import { t, locale } from '../i18n';

interface Props {
  title: string;
  view: NavView;
  fix: LiveFix | null;
  rec: RecState;
  elapsedMs: number;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  onRepeat: () => void;
  onStop: () => void;
  extra?: ReactNode;
}

const fmtDist = (km: number) => (km >= 10 ? `${Math.round(km)} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`);

export default function NavigationPanel({ title, view, fix, rec, elapsedMs, voiceOn, setVoiceOn, onRepeat, onStop, extra }: Props) {
  const eta = new Date(Date.now() + view.etaMin * 60000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const speed = fix?.speedKmh != null ? Math.round(fix.speedKmh) : null;

  return (
    <div className="nav">
      {view.status === 'preparing' && <div className="nav-card"><div className="nav-text">{t("Preparant les instruccions…")}</div></div>}
      {view.status === 'arrived' && (
        <div className="nav-card arrived">
          <div className="nav-icon"><Icon name="arrive" size={44} /></div>
          <div className="nav-text">{t("Has arribat al final de la ruta")}</div>
        </div>
      )}
      {(view.status === 'guiding' || view.status === 'rerouting' || view.status === 'no-instructions') && (
        <button className={`nav-card ${view.offRoute || view.status === 'rerouting' ? 'warn' : 'go'}`} onClick={onRepeat} aria-label={t("Repeteix la instrucció")}>
          {view.status === 'rerouting' ? (
            <>
              <div className="nav-icon">⟲</div>
              <div><div className="nav-dist">{t("Recalculant")}</div><div className="nav-text">{t("Busquem com tornar a la ruta per davant")}</div></div>
            </>
          ) : view.next ? (
            <>
              <div className="nav-icon"><Icon name={maneuverIcon(view.next.maneuver.type)} size={52} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="nav-dist">{fmtDist(view.next.distanceKm)}</div>
                <div className="nav-text">{view.next.maneuver.instruction}</div>
              </div>
            </>
          ) : (
            <div className="nav-text">{t("Segueix la línia de la ruta")}</div>
          )}
        </button>
      )}
      {view.then && view.status === 'guiding' && (
        <div className="nav-then">{t("Després:")}{' '}<Icon name={maneuverIcon(view.then.type)} size={16} className="inline-ico" /> {view.then.instruction}</div>
      )}
      {view.onDetour && <div className="alert info" style={{ margin: '8px 0 0' }}>{t("Desviament per tornar a la ruta. No tornarem als punts que ja has passat.")}</div>}
      {view.error && <div className="alert warn" style={{ margin: '8px 0 0' }}>{view.error}</div>}

      <div className="nav-stats">
        <div><b>{speed ?? '—'}</b><span>{t("km/h")}</span></div>
        <div><b>{fmtDist(view.remainingKm)}</b><span>{t("queden")}</span></div>
        <div><b>{view.status === 'arrived' ? '—' : eta}</b><span>{t("arribada")}</span></div>
        <div><b>{rec.distanceKm.toFixed(1)}</b><span>{t("km fets ·")}{' '}{fmtClock(elapsedMs)}</span></div>
      </div>

      <div className="nav-foot">
        <span><span className="rec-dot" /> {title} {t("· gravant")}</span>
        <span className="hint">{t("Mira la carretera: t'avisem amb la veu")}</span>
      </div>
      <div className="actions" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => setVoiceOn(!voiceOn)}>{voiceOn ? <><Icon name="volume" /> {t("Veu activada")}</> : <><Icon name="volume-off" /> {t("Veu silenciada")}</>}</button>
        <button className="btn primary" onClick={onStop}><Icon name="stop" size={16} /> {t("Acaba")}</button>
      </div>
      <div style={{ marginTop: 10 }}>{extra}</div>
    </div>
  );
}
