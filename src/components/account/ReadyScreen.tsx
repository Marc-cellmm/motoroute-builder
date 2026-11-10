import Icon from '../Icon';
import Avatar from '../Avatar';
import type { Account } from '../../lib/account';

export type StartTab = 'plan' | 'record' | 'social' | 'bike' | 'profile';

/** Pantalla que surt just després de crear el perfil: per on començar. */
export default function ReadyScreen({ account, onStart }: { account: Account; onStart: (tab: StartTab) => void }) {
  const p = account.profile;
  const name = p?.display_name || p?.username || '';
  const hasBike = !!account.settings?.bikes?.length;
  const actions: { tab: StartTab; icon: string; title: string; text: string }[] = [
    { tab: 'plan', icon: 'plan', title: 'Planifica la primera ruta', text: p?.riding_style === 'trail' ? 'Pistes i trams d\'enllaç al teu nivell.' : 'Corbes a prop de casa, amb meteo i benzina.' },
    { tab: 'social', icon: 'social', title: 'Explora la comunitat', text: 'Rutes que han fet altres motoristes.' },
    { tab: 'record', icon: 'record', title: 'Grava una sortida', text: 'Com Strava, però per a la moto.' },
    hasBike
      ? { tab: 'profile', icon: 'camera', title: 'Posa fotos de la moto', text: 'La primera serà la portada del perfil.' }
      : { tab: 'bike', icon: 'bike', title: 'Afegeix la moto', text: 'Per saber on has de repostar.' },
  ];
  return (
    <div className="auth-page">
      <div className="auth-card wide ready">
        <div className="ready-head">
          <Avatar url={p?.avatar_url} name={name} size={64} />
          <div>
            <div className="eyebrow go-text">Perfil a punt</div>
            <h2>Benvingut, {name}</h2>
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 16 }}>Per on vols començar? Tot es pot fer després des de la barra inferior.</p>
        <div className="ready-list">
          {actions.map((a, n) => (
            <button key={a.tab} className={`ready-item ${n === 0 ? 'main' : ''}`} onClick={() => onStart(a.tab)}>
              <span className="icon-tile"><Icon name={a.icon} size={22} /></span>
              <span className="ready-text"><b>{a.title}</b><small>{a.text}</small></span>
              <Icon name="chevron-right" className="dim" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
