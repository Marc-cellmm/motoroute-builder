import { useState } from 'react';
import type { LiveShare } from '../lib/live';
import Icon from './Icon';
import { t } from '../i18n';

/** Botó per compartir la ubicació en directe mentre grava o navega. */
export default function LiveShareControl({ live }: { live: LiveShare }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (!live.url) return;
    const text = t("Segueix la meva sortida en moto en directe");
    try {
      if (navigator.share) {
        await navigator.share({ title: t("MotoRoute · en directe"), text, url: live.url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(live.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("Copia aquest enllaç:"), live.url);
    }
  }

  if (!live.id) {
    return (
      <button className="btn ghost live-btn" onClick={() => { live.start(); }}>
        <Icon name="live" /> {t("Comparteix la ubicació en directe")}
      </button>
    );
  }
  return (
    <div className="live-box">
      <div className="live-head">
        <span className="live-dot" /> <b>{t("En directe")}</b>
        <span className="hint">· {live.viewers ? `${live.viewers} ${live.viewers === 1 ? t("persona et segueix") : t("persones et segueixen")}` : t("ningú mirant encara")}</span>
      </div>
      {live.error && <div className="alert warn">{live.error}</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn" onClick={share}>{copied ? <><Icon name="check" /> {t("Enllaç copiat")}</> : <><Icon name="share" /> {t("Envia l'enllaç")}</>}</button>
        <button className="btn ghost" onClick={live.stop}>{t("Deixa de compartir")}</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>{t("Qui tingui l'enllaç veu on ets fins que acabis la gravació. No es desa enlloc.")}</div>
    </div>
  );
}
