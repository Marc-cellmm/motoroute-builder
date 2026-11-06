import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import App from './App';

async function start() {
  // Al build de demostració, les APIs externes se substitueixen per dades simulades.
  if (import.meta.env.VITE_DEMO === '1') await import('./demo/mockFetch');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void start();
