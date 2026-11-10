import { useState } from 'react';
import Icon from './Icon';
import { t } from '../i18n';

type Section = 'privacy' | 'terms' | 'safety';

/** Privacitat, condicions d'ús i seguretat, en llenguatge planer. */
export default function Legal({ onClose, initial = 'privacy' }: { onClose: () => void; initial?: Section }) {
  const [tab, setTab] = useState<Section>(initial);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal legal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Condicions i privacitat")}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h2>{t("Les teves dades")}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t("Tanca")}><Icon name="x" /></button>
        </div>
        <div className="subtabs">
          <button className={tab === 'privacy' ? 'on' : ''} onClick={() => setTab('privacy')}>{t("Privacitat")}</button>
          <button className={tab === 'terms' ? 'on' : ''} onClick={() => setTab('terms')}>{t("Condicions")}</button>
          <button className={tab === 'safety' ? 'on' : ''} onClick={() => setTab('safety')}>{t("Seguretat")}</button>
        </div>
        {tab === 'privacy' && (
          <div className="legal-body">
            <h3>{t("Què guardem")}</h3>
            <ul>
              <li><b>{t("Compte:")}</b> {t("el correu i la contrasenya (xifrada pel servidor d'autenticació).")}</li>
              <li><b>{t("Perfil públic:")}</b> {t("nom de motorista, nom, zona, estil, moto, interessos, frase, foto de perfil i fotos de la moto. Ho veu tothom a la comunitat.")}</li>
              <li><b>{t("Dades privades:")}</b> {t("any de naixement, experiència, preferències i les teves motos. Només les veus tu.")}</li>
              <li><b>{t("Rutes publicades:")}</b> {t("el traçat, la distància i el desnivell. Per defecte s'amaguen uns 400 m a l'inici i al final.")}</li>
            </ul>
            <h3>{t("Què no guardem")}</h3>
            <ul>
              <li>{t("La teva ubicació no surt del mòbil mentre graves o navegues, tret que publiquis la ruta o activis el seguiment en directe.")}</li>
              <li>{t("El seguiment en directe no es desa enlloc: només el veu qui té l'enllaç i s'atura quan acabes.")}</li>
              <li>{t("No venem dades ni posem publicitat.")}</li>
            </ul>
            <h3>{t("Els teus drets")}</h3>
            <p>{t("Pots consultar i corregir les teves dades des de Perfil, i esborrar el compte amb totes les fotos i rutes des de Perfil → Compte → Esborra el compte.")}</p>
            <p className="hint">{t("Les dades s'allotgen a Supabase. Els mapes són d'OpenStreetMap (OpenFreeMap), la meteo d'Open-Meteo i els preus de la benzina del Ministeri per a la Transició Ecològica.")}</p>
          </div>
        )}
        {tab === 'terms' && (
          <div className="legal-body">
            <ul>
              <li>{t("Has de tenir")}{' '}<b>{t("18 anys o més")}</b> {t("per crear un compte.")}</li>
              <li>{t("Publica només rutes i fotos que siguin teves. No pugis fotos de matrícules ni de persones que no ho hagin acceptat.")}</li>
              <li>{t("Res d'insults, spam ni contingut il·legal. Els comptes que no ho respectin es poden esborrar.")}</li>
              <li>{t("L'app és gratuïta i es dona tal com és: rutes, meteo i preus poden tenir errors o estar desactualitzats.")}</li>
            </ul>
          </div>
        )}
        {tab === 'safety' && (
          <div className="legal-body">
            <ul>
              <li>{t("Mira la carretera, no el mòbil. Configura la ruta abans de sortir i fes servir la veu.")}</li>
              <li>{t("Respecta sempre els senyals i el Reglament de circulació: manen per sobre de les indicacions de l'app.")}</li>
              <li>{t("Moltes pistes forestals tenen la circulació motoritzada restringida o prohibida. Abans de fer un tram de trail, comprova la normativa de la zona.")}</li>
              <li>{t("La meteo és una previsió. A muntanya pot canviar ràpid: porta roba adequada i no t'hi arrisquis.")}</li>
            </ul>
          </div>
        )}
        <button className="btn primary wide-btn" style={{ marginTop: 14 }} onClick={onClose}>{t("Entesos")}</button>
      </div>
    </div>
  );
}
