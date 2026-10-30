// Memoria de datos: la solapa «Mi evolución» abre al instante con lo último que se bajó, por usuario.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';
const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });
const { cacheKey, peek, clearCache } = await vite.ssrLoadModule('/src/swr.js');
const { fetchEvolution } = await vite.ssrLoadModule('/src/evolutionData.js');

const ana = { access_token: 't1', user: { id: 'ana' } };
const beto = { access_token: 't2', user: { id: 'beto' } };

function fakeWorker(handlers) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    calls.push(path);
    const out = handlers[path];
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  return calls;
}

test('fetchEvolution baja catálogo y mediciones juntos y los deja en memoria por usuario', async () => {
  clearCache();
  const calls = fakeWorker({
    '/biomarkers/catalog': { status: 200, body: { types: [{ key: 'peso' }] } },
    '/biomarkers/readings': { status: 200, body: { readings: [{ id: 'r1', typeKey: 'peso' }] } },
  });
  const res = await fetchEvolution(ana);
  assert.deepEqual(calls.sort(), ['/biomarkers/catalog', '/biomarkers/readings']);
  assert.equal(res.readings.length, 1);
  assert.equal(peek(cacheKey(ana, 'evolucion')).types[0].key, 'peso');
  assert.equal(peek(cacheKey(beto, 'evolucion')), undefined, 'otra cuenta no ve lo de Ana');
});

test('si falla el servidor devuelve el error y no pisa lo que ya había en memoria', async () => {
  clearCache();
  fakeWorker({
    '/biomarkers/catalog': { status: 200, body: { types: [] } },
    '/biomarkers/readings': { status: 200, body: { readings: [{ id: 'r1' }] } },
  });
  await fetchEvolution(ana);
  fakeWorker({
    '/biomarkers/catalog': { status: 500, body: { error: 'caído' } },
    '/biomarkers/readings': { status: 500, body: { error: 'caído' } },
  });
  const res = await fetchEvolution(ana);
  assert.equal(res.error, 'caído');
  assert.equal(peek(cacheKey(ana, 'evolucion')).readings.length, 1);
});
