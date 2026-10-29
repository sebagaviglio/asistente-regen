// Ruteo propio (router.js + Link), almacenamiento de sesión intercambiable y configuración por entorno.
// Corre con:  node --test test/router_platform.test.mjs   (o  npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://asistente.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useLocation, navigate } = await vite.ssrLoadModule('/src/router.js');
const { default: Link } = await vite.ssrLoadModule('/src/Link.jsx');
const platform = await vite.ssrLoadModule('/src/platform.js');

const here = () => dom.window.location.pathname + dom.window.location.search;
const text = () => document.getElementById('root').textContent;

let renders = 0;
function Probe() {
  const { pathname, search } = useLocation();
  renders += 1;
  return React.createElement('p', null, `${pathname}|${search}`);
}

async function mount(el) {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el));
  return root;
}

// ── Ruteo ────────────────────────────────────────────────────────────────
test('router: lee la dirección actual y se actualiza al navegar, sin recargar', async () => {
  dom.window.history.replaceState(null, '', '/');
  const root = await mount(React.createElement(Probe));
  assert.equal(text(), '/|');
  await act(async () => navigate('/planes'));
  assert.equal(text(), '/planes|');
  assert.equal(here(), '/planes');
  await act(async () => navigate('/?pago=suscripcion&ref=s1'));
  assert.equal(text(), '/|?pago=suscripcion&ref=s1');
  await act(async () => root.unmount());
});

test('router: navigate con replace no suma una entrada al historial', async () => {
  dom.window.history.replaceState(null, '', '/');
  const before = dom.window.history.length;
  const root = await mount(React.createElement(Probe));
  await act(async () => navigate('/mi-ficha', { replace: true }));
  assert.equal(here(), '/mi-ficha');
  assert.equal(dom.window.history.length, before);
  await act(async () => root.unmount());
});

test('router: navegar a la misma dirección igual vuelve a evaluar las pantallas', async () => {
  dom.window.history.replaceState(null, '', '/');
  const root = await mount(React.createElement(Probe));
  const before = renders;
  await act(async () => navigate('/'));
  assert.ok(renders > before, 'se volvió a renderizar');
  await act(async () => root.unmount());
});

test('router: el botón atrás (popstate) actualiza la pantalla', async () => {
  dom.window.history.replaceState(null, '', '/');
  const root = await mount(React.createElement(Probe));
  await act(async () => navigate('/planes'));
  await act(async () => {
    dom.window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.equal(text(), '/|');
  await act(async () => root.unmount());
});

test('router: un cambio hecho por fuera (replaceState de la invitación) se ve en el próximo render', async () => {
  dom.window.history.replaceState(null, '', '/?invitacion=REGEN-AAAA-BBBB&plan=core');
  const root = await mount(React.createElement(Probe));
  assert.match(text(), /invitacion=/);
  dom.window.history.replaceState(null, '', '/');
  await act(async () => navigate('/', { replace: true }));
  assert.equal(text(), '/|');
  await act(async () => root.unmount());
});

test('Link: un toque navega adentro de la app; con Ctrl o el botón del medio se deja al navegador', async () => {
  dom.window.history.replaceState(null, '', '/');
  const root = await mount(React.createElement('div', null, React.createElement(Link, { to: '/mi-ficha', className: 'x' }, 'Mi ficha'), React.createElement(Probe)));
  const a = document.querySelector('a.x');
  assert.equal(a.getAttribute('href'), '/mi-ficha');

  const click = (init) => act(async () => { a.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })); });
  await click({ ctrlKey: true });
  assert.equal(here(), '/', 'Ctrl+clic no navega adentro');
  await click({ button: 1 });
  assert.equal(here(), '/', 'botón del medio no navega adentro');
  await click({});
  assert.equal(here(), '/mi-ficha');
  assert.match(text(), /\/mi-ficha\|/);
  await act(async () => root.unmount());
});

// ── Almacenamiento de la sesión ──────────────────────────────────────────
test('almacenamiento: por defecto usa localStorage (la misma clave de siempre)', async () => {
  dom.window.localStorage.clear();
  globalThis.window = dom.window;
  await platform.authStorage.setItem('sb-x-auth-token', '{"a":1}');
  assert.equal(dom.window.localStorage.getItem('sb-x-auth-token'), '{"a":1}');
  assert.equal(await platform.authStorage.getItem('sb-x-auth-token'), '{"a":1}');
  await platform.authStorage.removeItem('sb-x-auth-token');
  assert.equal(await platform.authStorage.getItem('sb-x-auth-token'), null);
});

test('almacenamiento: una sesión borrada del almacenamiento (otra pestaña) no resucita desde la memoria', async () => {
  dom.window.localStorage.clear();
  await platform.authStorage.setItem('k', 'v');
  dom.window.localStorage.removeItem('k'); // otra pestaña cerró sesión
  assert.equal(await platform.authStorage.getItem('k'), null);
});

test('almacenamiento: si localStorage falla, la sesión vive en memoria y no se rompe nada', async () => {
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); }, removeItem() { throw new Error('bloqueado'); } };
  platform.setAuthStorageBackend(broken);
  await platform.authStorage.setItem('k2', 'v2');
  assert.equal(await platform.authStorage.getItem('k2'), 'v2');
  await platform.authStorage.removeItem('k2');
  assert.equal(await platform.authStorage.getItem('k2'), null);
  platform.setAuthStorageBackend(null);
});

test('almacenamiento: la app nativa puede enchufar un almacenamiento asíncrono propio', async () => {
  const store = new Map();
  platform.setAuthStorageBackend({
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => { store.set(k, v); },
    removeItem: async (k) => { store.delete(k); },
  });
  await platform.authStorage.setItem('k3', 'seguro');
  assert.equal(store.get('k3'), 'seguro');
  assert.equal(await platform.authStorage.getItem('k3'), 'seguro');
  platform.setAuthStorageBackend(null);
});

test('openExternal: la app nativa registra cómo abrir una dirección fuera de la app', () => {
  const opened = [];
  platform.setExternalOpener((url) => opened.push(url));
  platform.openExternal('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1');
  assert.deepEqual(opened, ['https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1']);
  platform.setExternalOpener(null);
});

// ── Configuración por entorno ────────────────────────────────────────────
test('config: sin variables apunta a producción; con variables usa las del entorno y recorta la barra final', async () => {
  const keys = ['VITE_WORKER_URL', 'VITE_APP_ENV'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const load = async (env) => {
    for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
    try { return await server.ssrLoadModule('/src/config.js'); } finally { await server.close(); }
  };
  try {
    const prod = await load({});
    assert.equal(prod.WORKER_URL, 'https://regen-agente.sebagaviglio.workers.dev');
    assert.equal(prod.APP_ENV, 'production');
    assert.equal(prod.IS_PRODUCTION, true);

    const stg = await load({ VITE_WORKER_URL: ' https://regen-agente-staging.example.workers.dev/ ', VITE_APP_ENV: 'Staging' });
    assert.equal(stg.WORKER_URL, 'https://regen-agente-staging.example.workers.dev');
    assert.equal(stg.APP_ENV, 'staging');
    assert.equal(stg.IS_PRODUCTION, false);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
