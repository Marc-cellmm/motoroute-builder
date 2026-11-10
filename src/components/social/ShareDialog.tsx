import { useState } from 'react';
import JoinForm from './JoinForm';
import { publish, type Me } from '../../lib/social';
import { DIFF_LABEL } from '../RouteCard';
import type { Difficulty, RideMode, RouteResult } from '../../lib/types';
import { t } from '../../i18n';

interface Props {
  route: RouteResult;
  me: Me | null;
  setMe: (m: Me) => void;
  defaultTitle: string;
  defaultMode: RideMode;
  defaultDate?: string | null;
  startName: string | null;
  onClose: () => void;
  onPublished: () => void;
}

export default function ShareDialog(p: Props) {
  const [title, setTitle] = useState(p.defaultTitle.slice(0, 80));
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<RideMode>(p.defaultMode);
  const [difficulty, setDifficulty] = useState<Difficulty>(p.route.difficulty);
  const [date, setDate] = useState(p.defaultDate ?? '');
  const [privacy, setPrivacy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await publish({ route: p.route, title, description, mode, difficulty, riddenOn: date || null, startName: p.startName, privacy });
      setDone(true);
      p.onPublished();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2>{t("Comparteix la ruta")}</h2>
          <button className="btn small ghost" style={{ flex: 'none' }} onClick={p.onClose}>{t("Tanca")}</button>
        </div>
        {done ? (
          <>
            <div className="alert info">{t("Ruta publicada a la comunitat. Ja la pot veure tothom a l'apartat Social.")}</div>
            <button className="btn primary" style={{ width: '100%' }} onClick={p.onClose}>{t("Fet")}</button>
          </>
        ) : !p.me?.username ? (
          <JoinForm onJoined={p.setMe} compact />
        ) : (
          <>
            <div className="hint" style={{ marginBottom: 12 }}>
              {Math.round(p.route.distanceKm)} {t("km ·")}{' '}{p.route.elevationGain} {t("m + · índex de corbes")}{' '}{p.route.curvatureScore} {t("· publicaràs com a")}{' '}<b>@{p.me.username}</b>
            </div>
            <div className="field">
              <label>{t("Títol")}</label>
              <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>{t("Com va anar? (opcional)")}</label>
              <textarea className="input" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={t("Estat de la carretera, on vas parar a dinar, millor època…")} />
            </div>
            <div className="grid2">
              <div className="field">
                <label>{t("Quan la vas fer")}</label>
                <input type="date" className="input" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("Modalitat")}</label>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as RideMode)}>
                  <option value="road">{t("Carretera")}</option>
                  <option value="trail">{t("Trail / Off-road")}</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>{t("Dificultat")}</label>
              <div className="seg">
                {(['beginner', 'intermediate', 'expert'] as Difficulty[]).map((d) => (
                  <button key={d} type="button" className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>{DIFF_LABEL[d]}</button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span><b>{t("Amaga l'inici i el final")}</b> {t("(~400 m a cada extrem) perquè ningú vegi on vius o on aparques.")}</span>
            </label>
            {error && <div className="alert err">{error}</div>}
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || title.trim().length < 3} onClick={submit}>
              {busy ? t("Publicant…") : t("Publica a la comunitat")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
