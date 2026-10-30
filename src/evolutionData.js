// src/evolutionData.js
// Catálogo y mediciones de «Mi evolución», en paralelo. Se guardan en memoria (swr.js) para que la solapa abra al instante.
import { makeApi } from './api';
import { cacheKey, put } from './swr';

export async function fetchEvolution(session) {
  const api = makeApi(session.access_token);
  const [cat, rd] = await Promise.all([api.post('/biomarkers/catalog'), api.post('/biomarkers/readings')]);
  if (!cat.ok || !rd.ok) return { error: rd.data?.error || cat.data?.error || 'No pudimos cargar tus mediciones.' };
  return put(cacheKey(session, 'evolucion'), { types: cat.data.types, readings: rd.data.readings });
}
