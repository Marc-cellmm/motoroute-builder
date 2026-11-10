import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';
import { initI18n, savedLang } from './i18n';
import { savedCountry } from './lib/country';
import { applyTextSize, listenInstall } from './lib/prefs';

applyTextSize();
listenInstall();

async function start() {
  // Al build de demostració, les APIs externes se substitueixen per dades simulades.
  if (import.meta.env.VITE_DEMO === '1') await import('./demo/mockFetch');
  await initI18n();
  const root = createRoot(document.getElementById('root')!);
  const liveId = new URLSearchParams(location.search).get('live');

  // Primer cop: idioma i país (qui obre un enllaç de seguiment en directe no ho ha de fer)
  if (!liveId && import.meta.env.VITE_DEMO !== '1' && (!savedLang() || !savedCountry())) {
    const { default: FirstRun } = await import('./components/FirstRun');
    await new Promise<void>((done) => root.render(<StrictMode><FirstRun onDone={done} /></StrictMode>));
  }

  // L'app es carrega després de l'idioma perquè els textos ja surtin traduïts
  const [{ default: App }, { default: LiveViewer }, { default: AccountGate }] = await Promise.all([
    import('./App'),
    import('./components/LiveViewer'),
    import('./components/account/AccountGate'),
  ]);
  root.render(
    <StrictMode>
      {liveId && import.meta.env.VITE_DEMO !== '1' ? <LiveViewer id={liveId} /> : <AccountGate><App /></AccountGate>}
    </StrictMode>,
  );
}
void start();
