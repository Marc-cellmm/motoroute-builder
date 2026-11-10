import { useRef, useState, type ReactNode } from 'react';
import Icon, { Logo } from '../Icon';

interface Slide {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  art: ReactNode;
}

/* Il·lustracions fetes amb la mateixa interfície de l'app: res d'infantil, sembla el producte real. */
const ArtPlan = (
  <div className="w-art">
    <svg className="w-route" viewBox="0 0 300 150" aria-hidden="true">
      <path d="M20 120 C 70 120, 60 40, 120 50 S 170 120, 210 95 S 260 30, 282 40" fill="none" stroke="#000" strokeWidth="11" strokeLinecap="round" opacity=".6" />
      <path d="M20 120 C 70 120, 60 40, 120 50 S 170 120, 210 95 S 260 30, 282 40" fill="none" stroke="var(--accent-hi)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="20" cy="120" r="7" fill="var(--go)" stroke="#fff" strokeWidth="2.5" />
      <circle cx="282" cy="40" r="7" fill="var(--accent-hi)" stroke="#fff" strokeWidth="2.5" />
    </svg>
    <div className="w-chips">
      <span className="w-chip on"><Icon name="curves" size={14} />Corbes 82</span>
      <span className="w-chip"><Icon name="mountain" size={14} />Trail</span>
      <span className="w-chip"><Icon name="route" size={14} />186 km</span>
    </div>
  </div>
);

const ArtWeather = (
  <div className="w-art w-tiles">
    <div className="w-tile">
      <Icon name="cloud-sun" size={26} />
      <b>17°</b>
      <span>Port del Cantó · 11:40</span>
    </div>
    <div className="w-tile go">
      <Icon name="fuel" size={26} />
      <b>1,52 €</b>
      <span>Reposta al km 142</span>
    </div>
    <div className="w-tile wide">
      <span className="w-bar"><i style={{ width: '64%' }} /></span>
      <span>Autonomia segura <b className="go-text">214 km</b></span>
    </div>
  </div>
);

const ArtNav = (
  <div className="w-art">
    <div className="w-nav">
      <Icon name="turn-right" size={46} />
      <div>
        <b>300 m</b>
        <span>Gira a la dreta cap a la C-26</span>
      </div>
    </div>
    <div className="w-nav-stats">
      <div><b>74</b><span>km/h</span></div>
      <div><b>48 km</b><span>queden</span></div>
      <div><span className="w-rec" />Gravant</div>
    </div>
  </div>
);

const ArtSocial = (
  <div className="w-art">
    <div className="w-post">
      <div className="w-post-head">
        <span className="w-av">J</span>
        <div><b>@jordi_gs</b><span>Ports del Pirineu · 312 km</span></div>
      </div>
      <svg viewBox="0 0 260 60" aria-hidden="true"><path d="M5 50 C 50 50, 60 10, 110 18 S 170 52, 205 40 S 240 8, 255 12" fill="none" stroke="var(--accent-hi)" strokeWidth="4" strokeLinecap="round" /></svg>
      <div className="w-post-actions">
        <span className="on"><Icon name="heart" size={16} filled />128</span>
        <span><Icon name="bookmark" size={16} />Guardada</span>
      </div>
    </div>
  </div>
);

const ArtSafety = (
  <div className="w-art">
    <div className="w-live">
      <span className="w-live-ring"><span /></span>
      <div>
        <b>En directe</b>
        <span>2 persones et segueixen</span>
      </div>
    </div>
    <div className="w-chips">
      <span className="w-chip"><Icon name="bed" size={14} />Etapes amb allotjament</span>
      <span className="w-chip"><Icon name="lock" size={14} />Inici i final amagats</span>
    </div>
  </div>
);

const SLIDES: Slide[] = [
  {
    eyebrow: 'Planifica',
    title: 'Rutes pensades per a la moto',
    text: 'Tria carretera o trail, el nivell i els quilòmetres. Te\'n proposem diverses, ordenades per corbes i desnivell.',
    points: ['Circulars o d\'un punt a un altre', 'Evita autopistes i peatges', 'Obre els GPX d\'altres apps'],
    art: ArtPlan,
  },
  {
    eyebrow: 'Prepara la sortida',
    title: 'Meteo i benzina a l\'hora que hi passaràs',
    text: 'La previsió de cada tram a l\'hora que hi arribaràs, i on repostar segons el dipòsit i el consum de la teva moto.',
    points: ['Avisos de pluja, vent i fred', 'Preus reals de les benzineres', 'Millor hora per sortir'],
    art: ArtWeather,
  },
  {
    eyebrow: 'Roda',
    title: 'Navega amb veu i grava la sortida',
    text: 'Indicacions en català que s\'avancen si vas ràpid. Si et surts de la ruta, et retorna per davant, mai enrere.',
    points: ['Grava amb la pantalla apagada (iPhone)', 'Velocitat, temps i desnivell', 'Exporta a GPX'],
    art: ArtNav,
  },
  {
    eyebrow: 'Comunitat',
    title: 'Descobreix les rutes d\'altres motoristes',
    text: 'Publica les teves sortides, dona m\'agrada i guarda les que vulguis fer. Amb el teu perfil, la teva moto i les teves fotos.',
    points: ['Rutes a prop teu', 'Les més populars', 'Guarda-les per fer-les'],
    art: ArtSocial,
  },
  {
    eyebrow: 'Tranquil·litat',
    title: 'Que a casa sàpiguen per on vas',
    text: 'Comparteix la ubicació en directe amb un enllaç. Ningú ha d\'instal·lar res, i s\'atura sol quan acabes.',
    points: ['Etapes de diversos dies', 'Privacitat en publicar', 'Gratis, sense subscripcions'],
    art: ArtSafety,
  },
];

export default function Welcome({ onDone }: { onDone: (mode: 'signup' | 'login') => void }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)));

  return (
    <div className="welcome"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}>
      <header className="welcome-top">
        <Logo size={30} />
        <span className="welcome-brand">MotoRoute</span>
        {!last && <button className="link-btn muted-link" style={{ marginLeft: 'auto', margin: '0 0 0 auto' }} onClick={() => go(SLIDES.length - 1)}>Salta</button>}
      </header>

      <div className="welcome-stage" key={i}>
        {s.art}
      </div>

      <div className="welcome-copy" key={`c${i}`}>
        <div className="eyebrow accent">{String(i + 1).padStart(2, '0')} · {s.eyebrow}</div>
        <h1>{s.title}</h1>
        <p>{s.text}</p>
        <ul>
          {s.points.map((p) => <li key={p}><Icon name="check" size={16} />{p}</li>)}
        </ul>
      </div>

      <footer className="welcome-foot">
        <div className="dots" role="tablist" aria-label="Diapositives">
          {SLIDES.map((_, n) => (
            <button key={n} className={n === i ? 'on' : ''} onClick={() => go(n)} aria-label={`Diapositiva ${n + 1}`} aria-selected={n === i} role="tab" />
          ))}
        </div>
        {last ? (
          <div className="welcome-cta">
            <button className="btn primary wide-btn" onClick={() => onDone('signup')}>Crea el compte gratis</button>
            <button className="btn ghost wide-btn" onClick={() => onDone('login')}>Ja tinc compte</button>
          </div>
        ) : (
          <div className="welcome-cta row-cta">
            {i > 0 && <button className="btn ghost" onClick={() => go(i - 1)} aria-label="Anterior"><Icon name="chevron-left" /></button>}
            <button className="btn primary" style={{ flex: 1 }} onClick={() => go(i + 1)}>Següent <Icon name="arrow-right" size={18} /></button>
          </div>
        )}
      </footer>
    </div>
  );
}
