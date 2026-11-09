import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import App from './App';
import LiveViewer from './components/LiveViewer';
import AccountGate from './components/account/AccountGate';

async function start() {
  // Al build de demostració, les APIs externes se substitueixen per dades simulades.
  if (import.meta.env.VITE_DEMO === '1') await import('./demo/mockFetch');
  const liveId = new URLSearchParams(location.search).get('live');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {liveId && import.meta.env.VITE_DEMO !== '1' ? <LiveViewer id={liveId} /> : <AccountGate><App /></AccountGate>}
    </StrictMode>,
  );
}
void start();
