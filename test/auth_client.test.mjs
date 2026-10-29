// El cliente de login tiene que comportarse igual que el de @supabase/supabase-js:
// misma clave en el navegador (las sesiones abiertas siguen abiertas), mismos pedidos
// para email, Google, alta y salida. Corre con:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-anon';

const dom = new JSDOM('<!doctype html>', { url: 'https://asistente.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'localStorage']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}

const calls = [];
let reply = () => ({});
globalThis.fetch = async (url, init = {}) => {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  calls.push({ url: String(url), method: init.method || 'GET', headers, body: init.body ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify(reply(String(url))), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { supabase } = await vite.ssrLoadModule('/src/supabaseClient.js');
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

const KEY = 'sb-ejemplo-auth-token';
const exp = Math.floor(Date.now() / 1000) + 3600;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp })}.firma`;
const SESSION = { access_token: jwt, refresh_token: 'r1', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', email: 'a@regen.ar' } };
const last = () => calls.at(-1);

test('sesión ya abierta: se lee de la misma clave del navegador', async () => {
  localStorage.setItem(KEY, JSON.stringify(SESSION));
  const { data } = await supabase.auth.getSession();
  assert.equal(data.session?.access_token, jwt);
  assert.equal(data.session?.user.id, 'u1');
});

test('email y contraseña: mismo pedido, mismos encabezados, la sesión queda en la misma clave', async () => {
  await supabase.auth.signOut({ scope: 'local' });
  calls.length = 0;
  reply = () => SESSION;
  const { error } = await supabase.auth.signInWithPassword({ email: 'a@regen.ar', password: 'secreta123' });
  assert.equal(error, null);
  const c = calls.find((x) => x.url.includes('/token'));
  assert.equal(c.url, 'https://ejemplo.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.apikey, 'clave-anon');
  assert.equal(c.headers.authorization, 'Bearer clave-anon');
  assert.deepEqual({ email: c.body.email, password: c.body.password }, { email: 'a@regen.ar', password: 'secreta123' });
  assert.equal(JSON.parse(localStorage.getItem(KEY)).access_token, jwt);
});

test('alta con email: vuelve a este sitio después de confirmar', async () => {
  calls.length = 0;
  reply = () => ({ id: 'u2', email: 'b@regen.ar' });
  await supabase.auth.signUp({ email: 'b@regen.ar', password: 'secreta123', options: { emailRedirectTo: 'https://asistente.regen.ar' } });
  const c = calls.find((x) => x.url.includes('/signup'));
  assert.equal(c.url, 'https://ejemplo.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fasistente.regen.ar');
  assert.equal(c.headers.apikey, 'clave-anon');
});

test('Google: misma dirección de Supabase, flujo implícito (sin code_challenge)', async () => {
  const { data } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://asistente.regen.ar', skipBrowserRedirect: true } });
  assert.equal(data.url, 'https://ejemplo.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fasistente.regen.ar');
});

test('salir: avisa a Supabase con la sesión y borra la clave del navegador', async () => {
  localStorage.setItem(KEY, JSON.stringify(SESSION));
  calls.length = 0;
  reply = () => ({});
  await supabase.auth.signOut();
  const c = calls.find((x) => x.url.includes('/logout'));
  assert.equal(c.url, 'https://ejemplo.supabase.co/auth/v1/logout?scope=global');
  assert.equal(c.headers.authorization, `Bearer ${jwt}`);
  assert.equal(localStorage.getItem(KEY), null);
});
