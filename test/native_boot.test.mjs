// Arranque dentro de la app de iOS/Android: sesión en almacenamiento seguro, navegador del sistema,
// botón atrás, vuelta al primer plano y links profundos. Capacitor y sus plugins son de mentira.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'localStorage', 'CustomEvent', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
// Lo que inyecta Capacitor en la vista web antes de cargar la página.
globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };

const cap = (globalThis.__cap = { calls: [], listeners: {}, secure: new Map(), cleared: 0, launchUrl: null });
const FAKES = {
  '@capacitor/app': `
    export const App = {
      addListener(ev, fn) { globalThis.__cap.listeners[ev] = fn; return Promise.resolve({ remove() {} }); },
      getLaunchUrl: async () => (globalThis.__cap.launchUrl ? { url: globalThis.__cap.launchUrl } : undefined),
      exitApp() { globalThis.__cap.calls.push(['exitApp']); },
    };`,
  '@capacitor/browser': `
    export const Browser = {
      open: async (o) => { globalThis.__cap.calls.push(['open', o.url]); },
      close: async () => { globalThis.__cap.calls.push(['close']); },
    };`,
  '@capacitor/status-bar': `
    export const Style = { Light: 'LIGHT', Dark: 'DARK' };
    export const StatusBar = {
      setStyle: async (o) => { globalThis.__cap.calls.push(['style', o.style]); },
      setBackgroundColor: async (o) => { globalThis.__cap.calls.push(['bg', o.color]); },
    };`,
  '@aparajita/capacitor-secure-storage': `
    export const KeychainAccess = { afterFirstUnlockThisDeviceOnly: 3 };
    export const SecureStorage = {
      setDefaultKeychainAccess: async (a) => { globalThis.__cap.calls.push(['access', a]); },
      getItem: async (k) => globalThis.__cap.secure.get(k) ?? null,
      setItem: async (k, v) => { globalThis.__cap.secure.set(k, v); },
      removeItem: async (k) => { globalThis.__cap.secure.delete(k); },
      clear: async () => { globalThis.__cap.cleared += 1; globalThis.__cap.secure.clear(); },
    };`,
};
// Los plugins se reemplazan por archivos de mentira (alias): así el @capacitor/core real, que en Node
// pisaría window.Capacitor, no llega a cargarse.
const fakeDir = mkdtempSync(join(tmpdir(), 'regen-fakes-'));
const alias = Object.fromEntries(
  Object.entries(FAKES).map(([name, code]) => {
    const file = join(fakeDir, `${name.replace(/[^a-z]/gi, '_')}.mjs`);
    writeFileSync(file, code);
    return [name, file];
  })
);

const { createServer } = await import('vite');
const servers = [];
async function loadPlatform() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', resolve: { alias } });
  servers.push(vite);
  const platform = await vite.ssrLoadModule('/src/platform.js');
  await platform.whenNativeReady();
  await new Promise((r) => setTimeout(r, 20)); // listeners y link de arranque
  return platform;
}
test.after(async () => { for (const s of servers) await s.close(); rmSync(fakeDir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 200).unref?.(); });

const calls = (name) => cap.calls.filter(([n]) => n === name);
const once = (event) => new Promise((resolve) => window.addEventListener(event, (e) => resolve(e), { once: true }));

// Instalación nueva: había una sesión vieja en el Keychain (iOS lo conserva al desinstalar).
cap.secure.set('sb-viejo-auth-token', '{"cuenta":"de otra persona"}');
cap.launchUrl = 'https://app.regen.ar/mi-ficha';
const platform = await loadPlatform();

test('dentro de la app se reconoce la plataforma', () => {
  assert.equal(platform.isNativeApp(), true);
  assert.equal(platform.nativePlatform(), 'ios');
});

test('primera vez: se borra cualquier sesión vieja del Keychain y se marca la instalación', () => {
  assert.equal(cap.cleared, 1);
  assert.equal(cap.secure.has('sb-viejo-auth-token'), false);
  assert.equal(localStorage.getItem('regen_installed'), '1');
  assert.deepEqual(calls('access'), [['access', 3]]); // solo después del primer desbloqueo, sin migrar a otro equipo
});

test('la sesión se guarda en el almacenamiento seguro y no en localStorage', async () => {
  await platform.authStorage.setItem('sb-nuevo-auth-token', '{"access_token":"t"}');
  assert.equal(cap.secure.get('sb-nuevo-auth-token'), '{"access_token":"t"}');
  assert.equal(localStorage.getItem('sb-nuevo-auth-token'), null);
  assert.equal(await platform.authStorage.getItem('sb-nuevo-auth-token'), '{"access_token":"t"}');
  await platform.authStorage.removeItem('sb-nuevo-auth-token');
  assert.equal(await platform.authStorage.getItem('sb-nuevo-auth-token'), null);
});

test('pagos y login: se abren en el navegador del sistema', () => {
  platform.openExternal('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1');
  assert.deepEqual(calls('open'), [['open', 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1']]);
});

test('barra de estado: íconos oscuros sobre el fondo claro de REGEN', () => {
  assert.deepEqual(calls('style'), [['style', 'LIGHT']]);
});

test('Android: el botón atrás vuelve a la pantalla anterior y, en la primera, sale de la app', () => {
  let backs = 0;
  const original = window.history.back;
  window.history.back = () => { backs += 1; };
  cap.listeners.backButton({ canGoBack: true });
  assert.equal(backs, 1);
  assert.equal(calls('exitApp').length, 0);
  cap.listeners.backButton({ canGoBack: false });
  assert.equal(calls('exitApp').length, 1);
  window.history.back = original;
});

test('al volver al primer plano se avisa a las pantallas (para refrescar el estado de un pago)', async () => {
  const seen = once('regen:app-resume');
  cap.listeners.appStateChange({ isActive: false });
  cap.listeners.appStateChange({ isActive: true });
  await seen; // solo llega con isActive: true
});

test('app abierta desde un link de REGEN: va a esa pantalla', () => {
  assert.equal(window.location.pathname, '/mi-ficha');
});

test('vuelta del login con error: cierra el navegador y avisa en el formulario', async () => {
  const seen = once('regen:auth-error');
  cap.calls.length = 0;
  cap.listeners.appUrlOpen({ url: 'ar.regen.app://auth-callback?error=access_denied&error_description=Cancelado' });
  const e = await seen;
  assert.equal(e.detail, 'Cancelado');
  assert.equal(calls('close').length, 1);
});

test('segunda apertura de la app: la sesión guardada NO se borra', async () => {
  cap.secure.set('sb-vigente-auth-token', '{"access_token":"vigente"}');
  const cleared = cap.cleared;
  const again = await loadPlatform(); // la marca de instalación ya está en localStorage
  assert.equal(cap.cleared, cleared);
  assert.equal(await again.authStorage.getItem('sb-vigente-auth-token'), '{"access_token":"vigente"}');
});
