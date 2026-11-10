/**
 * Icones pròpies de MotoRoute: traç de 1,75 px sobre una graella de 24 × 24,
 * extrems arrodonits. Hereten el color del text (currentColor).
 */
import type { CSSProperties } from 'react';

const P: Record<string, string> = {
  // Apartats
  plan: 'M6 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 15.5V11a4 4 0 0 1 4-4h5.5M18 8.5V13a4 4 0 0 1-4 4H8.5',
  record: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  social: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.5 3.5 5.2',
  routes: 'M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20V6.5ZM9 4v13.5M15 6.5V20',
  bike: 'M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18.5 16.5l-3-8.5h-2M3.5 11.5h5l1.5-2h4.5l1.5 2.5M9 16.5h5.5l1.5-4.5H8.5ZM5.5 16.5l3-4.5',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6',

  // Accions
  play: 'M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.2-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8Z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l5 5',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  share: 'M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v7.5h14V12',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 16v4h16v-4',
  file: 'M14 3H6.5v18h11V6.5L14 3ZM14 3v3.5h3.5M9 13h6M9 16.5h6',
  folder: 'M3.5 6.5v12h17V8.5h-8.5l-2-2h-6.5Z',
  logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  lock: 'M6 11h12v9.5H6V11ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'eye-off': 'M4 4l16 16M9.9 5.8c.7-.2 1.3-.3 2.1-.3 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M14.1 14.2a3 3 0 0 1-4.3-4.3M6.6 6.8C4 8.5 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1',
  camera: 'M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4V8ZM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z',
  image: 'M3.5 5h17v14h-17V5ZM3.5 16l5-5 4 4 2.5-2.5 5.5 5.5M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.8Z',
  heart: 'M12 20s-8-4.8-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.2 12 20 12 20Z',
  bookmark: 'M6.5 3.5h11v17L12 16.5l-5.5 4v-17Z',
  layers: 'M12 3.5 21 8.5l-9 5-9-5 9-5ZM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.8a7.6 7.6 0 0 1-2.1 1.2L14.7 21h-4l-.3-2.5a7.6 7.6 0 0 1-2.1-1.2l-1.9.8-2-3.4 1.6-1.2a7.7 7.7 0 0 1 0-3L4.4 9.3l2-3.4 1.9.8a7.6 7.6 0 0 1 2.1-1.2L10.7 3h4l.3 2.5a7.6 7.6 0 0 1 2.1 1.2l1.9-.8 2 3.4-1.6 1.2a7.7 7.7 0 0 1 0 3Z',

  // Mapa i ruta
  pin: 'M12 21s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  locate: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 2v3M12 19v3M2 12h3M19 12h3M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  map: 'M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20V6.5ZM9 4v13.5M15 6.5V20',
  road: 'M8.5 3 4 21M15.5 3 20 21M12 4v3M12 10.5v3M12 17v3',
  mountain: 'M2.5 19.5 9 8l3.5 6 2.5-4 6.5 9.5h-19ZM7.3 11l1.7 1.5 1.6-1.2',
  curves: 'M5 20c0-4 4-4 4-8s-4-4-4-8M12 20c0-4 4-4 4-8s-4-4-4-8M19 4v16',
  route: 'M6 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 15.5V11a4 4 0 0 1 4-4h5.5M18 8.5V13a4 4 0 0 1-4 4H8.5',
  loop: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5V7H16',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  fuel: 'M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13.5 5v15.5M3 20.5h12M4.5 10h9M13.5 8l3 2.5V17a1.5 1.5 0 0 0 3 0V8.5L17 6',
  gauge: 'M4 17a8 8 0 1 1 16 0M12 17l4-5M7 13.5l1 .6M12 9v1.2M17 13.5l-1 .6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  calendar: 'M4 6h16v14.5H4V6ZM4 10.5h16M8.5 3.5v4M15.5 3.5v4',
  bed: 'M3 19V6M3 15.5h18V19M21 15.5V12a3 3 0 0 0-3-3h-7v6.5M7 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  elevation: 'M3 19.5h18M3 16l5-6 4 4 3.5-5.5L21 15',
  dirt: 'M3 17.5c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0M6 12.5h.01M10.5 10.5h.01M15 12.5h.01M19 10h.01M8 7.5h.01M13.5 6.5h.01',
  motorway: 'M5 21 9 3M19 21 15 3M12 6v2.5M12 12v2.5M12 18v2.5M3 9h18',
  alert: 'M12 4 21.5 20h-19L12 4ZM12 10v4.5M12 17.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.5h.01',
  live: 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  'volume-off': 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5ZM16 9.5l5 5M21 9.5l-5 5',
  sparkle: 'M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8L12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.5 3.5 5.2',
  passenger: 'M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c.4-3.6 2.3-6 5-6s4.6 2.4 5 6M11 20c.4-3.6 2.3-6 5-6s4.6 2.4 5 6',
  luggage: 'M6 7.5h12v12.5H6V7.5ZM9.5 7.5V4.5h5v3M10 11v6M14 11v6',
  wrench: 'M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2Z',

  // Meteo
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  'cloud-sun': 'M8.5 3.5v1.5M3.5 8.5H5M4.9 4.9 6 6M12.1 4.9 11 6M11.7 9.2a3.5 3.5 0 0 0-6.4 2M7 20h10.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-.8A3.9 3.9 0 0 0 7 20Z',
  cloud: 'M7 19h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 19Z',
  fog: 'M4 9h16M3 13h18M5 17h14M8 21h8',
  rain: 'M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 15ZM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5',
  snow: 'M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 14ZM8 18h.01M12 19.5h.01M16 18h.01M10 21.5h.01M14 21.5h.01',
  storm: 'M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 14ZM12.5 15.5 10.5 19h3l-2 3.5',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8',
  thermometer: 'M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 9v7',

  // Maniobres de navegació
  'turn-right': 'M7 20v-7a4 4 0 0 1 4-4h8M15 5l4 4-4 4',
  'turn-left': 'M17 20v-7a4 4 0 0 0-4-4H5M9 5 5 9l4 4',
  'slight-right': 'M8 20v-6.5a4 4 0 0 1 1.2-2.8L16 4M10.5 4H16v5.5',
  'slight-left': 'M16 20v-6.5a4 4 0 0 0-1.2-2.8L8 4M13.5 4H8v5.5',
  'sharp-right': 'M8 21V9a3 3 0 0 1 5.1-2.1L17 17M17 11.5V17h-5.5',
  'sharp-left': 'M16 21V9a3 3 0 0 0-5.1-2.1L7 17M7 11.5V17h5.5',
  straight: 'M12 20V4M6.5 9.5 12 4l5.5 5.5',
  uturn: 'M8 20V9a4 4 0 0 1 8 0v4.5M12.5 10l3.5 3.5 3.5-3.5',
  roundabout: 'M12 20v-4.5M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM14.5 9.5 19 5M15 5h4v4',
  merge: 'M7 4v4a6 6 0 0 0 6 6h0M17 4v16M10.5 11.5 13 14l-2.5 2.5',
  arrive: 'M5 21V4M5 4h12l-2 4 2 4H5',
  depart: 'M12 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 17V5M7.5 9.5 12 5l4.5 4.5',
};

const FILLED = new Set(['play', 'stop']);

export type IconName = keyof typeof P;

export default function Icon({ name, size = 20, className, style, filled }: { name: IconName | string; size?: number; className?: string; style?: CSSProperties; filled?: boolean }) {
  const d = P[name] ?? P.info;
  const fill = filled ?? FILLED.has(name);
  if (name === 'record') {
    // anella amb punt ple: el botó de gravar de tota la vida
    return (
      <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}>
        <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r={filled ? 5 : 4} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Marca de MotoRoute: un revolt de carretera dins d'un escut vermell. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="MotoRoute" role="img" className="logo">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="var(--accent)" />
      <path d="M17 41c0-8 16-7 16-15.5S17 18 17 11.5C17 8.5 19 7 22 7" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <path d="M17 41c0-8 16-7 16-15.5S17 18 17 11.5C17 8.5 19 7 22 7" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="2.5 3.5" />
    </svg>
  );
}
