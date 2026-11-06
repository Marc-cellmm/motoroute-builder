import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` / `npm run build`: app real amb dades en directe.
// `npm run build:demo`: una sola pàgina HTML amb dades simulades (per obrir-la sense servidor).
export default defineConfig(({ mode }) => ({
  base: './', // rutes relatives: funciona a l'arrel o en una subcarpeta (GitHub Pages)
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  build: mode === 'demo' ? { outDir: 'dist-demo', chunkSizeWarningLimit: 5000 } : { chunkSizeWarningLimit: 2000 },
  server: {
    proxy: {
      // En desenvolupament, Vite fa de proxy cap als serveis que no permeten CORS
      // des del navegador. En producció (Vercel) ho fan les funcions de /api.
      '/api/valhalla': {
        target: 'https://valhalla1.openstreetmap.de',
        changeOrigin: true,
        rewrite: () => '/route',
      },
      '/api/fuel': {
        target: 'https://sedeaplicaciones.minetur.gob.es',
        changeOrigin: true,
        rewrite: () => '/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/',
        headers: { Accept: 'application/json' },
      },
    },
  },
}));
