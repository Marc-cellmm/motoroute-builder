// Funció serverless (Vercel) que reenvia les peticions de ruta al servidor
// públic de Valhalla (FOSSGIS). Per a ús intensiu, munta el teu propi Valhalla
// i canvia VALHALLA_URL.
const VALHALLA_URL = process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de/route';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Només POST' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const upstream = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'MotoRouteBuilder/0.1' },
      body,
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: 'No s\'ha pogut contactar amb Valhalla', detail: String(err) });
  }
}
