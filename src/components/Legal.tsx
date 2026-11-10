import { useState } from 'react';
import Icon from './Icon';

type Section = 'privacy' | 'terms' | 'safety';

/** Privacitat, condicions d'ús i seguretat, en llenguatge planer. */
export default function Legal({ onClose, initial = 'privacy' }: { onClose: () => void; initial?: Section }) {
  const [tab, setTab] = useState<Section>(initial);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal legal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Condicions i privacitat">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h2>Les teves dades</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tanca"><Icon name="x" /></button>
        </div>
        <div className="subtabs">
          <button className={tab === 'privacy' ? 'on' : ''} onClick={() => setTab('privacy')}>Privacitat</button>
          <button className={tab === 'terms' ? 'on' : ''} onClick={() => setTab('terms')}>Condicions</button>
          <button className={tab === 'safety' ? 'on' : ''} onClick={() => setTab('safety')}>Seguretat</button>
        </div>
        {tab === 'privacy' && (
          <div className="legal-body">
            <h3>Què guardem</h3>
            <ul>
              <li><b>Compte:</b> el correu i la contrasenya (xifrada pel servidor d'autenticació).</li>
              <li><b>Perfil públic:</b> nom de motorista, nom, zona, estil, moto, interessos, frase, foto de perfil i fotos de la moto. Ho veu tothom a la comunitat.</li>
              <li><b>Dades privades:</b> any de naixement, experiència, preferències i les teves motos. Només les veus tu.</li>
              <li><b>Rutes publicades:</b> el traçat, la distància i el desnivell. Per defecte s'amaguen uns 400 m a l'inici i al final.</li>
            </ul>
            <h3>Què no guardem</h3>
            <ul>
              <li>La teva ubicació no surt del mòbil mentre graves o navegues, tret que publiquis la ruta o activis el seguiment en directe.</li>
              <li>El seguiment en directe no es desa enlloc: només el veu qui té l'enllaç i s'atura quan acabes.</li>
              <li>No venem dades ni posem publicitat.</li>
            </ul>
            <h3>Els teus drets</h3>
            <p>Pots consultar i corregir les teves dades des de Perfil, i esborrar el compte amb totes les fotos i rutes des de Perfil → Compte → Esborra el compte.</p>
            <p className="hint">Les dades s'allotgen a Supabase. Els mapes són d'OpenStreetMap (OpenFreeMap), la meteo d'Open-Meteo i els preus de la benzina del Ministeri per a la Transició Ecològica.</p>
          </div>
        )}
        {tab === 'terms' && (
          <div className="legal-body">
            <ul>
              <li>Has de tenir <b>18 anys o més</b> per crear un compte.</li>
              <li>Publica només rutes i fotos que siguin teves. No pugis fotos de matrícules ni de persones que no ho hagin acceptat.</li>
              <li>Res d'insults, spam ni contingut il·legal. Els comptes que no ho respectin es poden esborrar.</li>
              <li>L'app és gratuïta i es dona tal com és: rutes, meteo i preus poden tenir errors o estar desactualitzats.</li>
            </ul>
          </div>
        )}
        {tab === 'safety' && (
          <div className="legal-body">
            <ul>
              <li>Mira la carretera, no el mòbil. Configura la ruta abans de sortir i fes servir la veu.</li>
              <li>Respecta sempre els senyals i el Reglament de circulació: manen per sobre de les indicacions de l'app.</li>
              <li>Moltes pistes forestals tenen la circulació motoritzada restringida o prohibida. Abans de fer un tram de trail, comprova la normativa de la zona.</li>
              <li>La meteo és una previsió. A muntanya pot canviar ràpid: porta roba adequada i no t'hi arrisquis.</li>
            </ul>
          </div>
        )}
        <button className="btn primary wide-btn" style={{ marginTop: 14 }} onClick={onClose}>Entesos</button>
      </div>
    </div>
  );
}
