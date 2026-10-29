// Links que abren la app: vuelta del login por el navegador del sistema y links de app.regen.ar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html>', { url: 'https://asistente.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'localStorage']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });
const { parseDeepLink, handleDeepLink } = await vite.ssrLoadModule('/src/deepLinks.js');

test('login: el código que vuelve por ar.regen.app://auth-callback se reconoce', () => {
  assert.deepEqual(parseDeepLink('ar.regen.app://auth-callback?code=abc123'), { type: 'auth', code: 'abc123', error: null });
});

test('login: un error de Google o Apple (en la query o en el fragmento) se reconoce', () => {
  assert.equal(parseDeepLink('ar.regen.app://auth-callback?error=access_denied&error_description=Acceso+denegado').error, 'Acceso denegado');
  assert.equal(parseDeepLink('ar.regen.app://auth-callback#error=access_denied&error_description=Cancelado').error, 'Cancelado');
  assert.equal(parseDeepLink('ar.regen.app://auth-callback?error=access_denied').error, 'access_denied');
});

test('links de la web: solo las direcciones de REGEN se abren dentro de la app', () => {
  assert.deepEqual(parseDeepLink('https://app.regen.ar/planes?x=1'), { type: 'route', path: '/planes?x=1' });
  assert.deepEqual(parseDeepLink('https://asistente.regen.ar/mi-ficha'), { type: 'route', path: '/mi-ficha' });
  assert.equal(parseDeepLink('https://sitio-malicioso.com/planes'), null);
  assert.equal(parseDeepLink('https://app.regen.ar.evil.com/planes'), null);
});

test('lo que no es de la app se ignora, sin romper', async () => {
  for (const raw of ['ar.regen.app://otra-cosa?code=1', 'otra.app://auth-callback?code=1', 'no es una url', '', null, undefined]) {
    assert.equal(parseDeepLink(raw), null, String(raw));
  }
  assert.equal(await handleDeepLink('https://evil.com/x', {}), 'ignored');
});

function deps(over = {}) {
  const log = [];
  return {
    log,
    exchangeCode: async (code) => { log.push(['exchange', code]); return { error: null }; },
    closeBrowser: () => { log.push(['close']); },
    navigate: (path) => { log.push(['navigate', path]); },
    onAuthError: (m) => { log.push(['error', m]); },
    ...over,
  };
}

test('vuelta del login: cierra el navegador y canjea el código por la sesión', async () => {
  const d = deps();
  assert.equal(await handleDeepLink('ar.regen.app://auth-callback?code=abc123', d), 'auth-ok');
  assert.deepEqual(d.log, [['close'], ['exchange', 'abc123']]);
});

test('vuelta del login con error o sin código: avisa y no intenta canjear nada', async () => {
  const d = deps();
  assert.equal(await handleDeepLink('ar.regen.app://auth-callback?error=access_denied&error_description=Cancelado', d), 'auth-error');
  assert.deepEqual(d.log, [['close'], ['error', 'Cancelado']]);

  const d2 = deps();
  assert.equal(await handleDeepLink('ar.regen.app://auth-callback', d2), 'auth-error');
  assert.equal(d2.log.some(([k]) => k === 'exchange'), false);
  assert.match(d2.log.at(-1)[1], /No pudimos completar el ingreso/);
});

test('vuelta del login: si el canje falla se avisa; si el navegador no se deja cerrar, igual sigue', async () => {
  const d = deps({ exchangeCode: async () => ({ error: { message: 'código vencido' } }), closeBrowser: () => Promise.reject(new Error('nada que cerrar')) });
  assert.equal(await handleDeepLink('ar.regen.app://auth-callback?code=viejo', d), 'auth-error');
  assert.deepEqual(d.log, [['error', 'código vencido']]);
});

test('link de la web: lleva a la ruta; una invitación se guarda y se saca de la dirección', async () => {
  localStorage.clear();
  const d = deps();
  assert.equal(await handleDeepLink('https://app.regen.ar/mi-ficha', d), 'route');
  assert.deepEqual(d.log, [['navigate', '/mi-ficha']]);

  const d2 = deps();
  await handleDeepLink('https://app.regen.ar/?invitacion=REGEN-AAAA-BBBB&plan=core&utm=x', d2);
  assert.deepEqual(JSON.parse(localStorage.getItem('regen_invitation')), { code: 'REGEN-AAAA-BBBB', plan: 'core' });
  assert.deepEqual(d2.log, [['navigate', '/?utm=x']]);
});
