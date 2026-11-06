// Funció serverless (Vercel) que descarrega els preus de carburant del
// Geoportal de Gasolineras (MITECO) i els serveix amb cache de 30 minuts.
const MITECO_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

export default async function handler(_req, res) {
  try {
    const upstream = await fetch(MITECO_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'MotoRouteBuilder/0.1' },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'El servei del MITECO no respon' });
      return;
    }
    const text = await upstream.text();
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).setHeader('Content-Type', 'application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: 'No s\'ha pogut contactar amb el MITECO', detail: String(err) });
  }
}
