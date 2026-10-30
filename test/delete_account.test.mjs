// "Eliminar mi cuenta": explica qué pasa, pide escribir ELIMINAR y recién ahí llama al Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://asistente.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: DeleteAccount } = await vite.ssrLoadModule('/src/DeleteAccount.jsx');
const { supabase } = await vite.ssrLoadModule('/src/supabaseClient.js');

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = (sel) => document.querySelector(sel);
const text = () => document.getElementById('root').textContent;
const click = (el) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const type = (el, value) => act(async () => {
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const submit = (form) => act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });

let calls, signOuts;
function setup(out) {
  calls = [];
  signOuts = [];
  supabase.auth.signOut = async (opts) => { signOuts.push(opts); };
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ path: String(url).replace('https://regen-agente.sebagaviglio.workers.dev', ''), body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
}
async function mount() {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(DeleteAccount, { session: { access_token: 'tok' } })));
  await tick(5);
  return root;
}

test('al principio solo hay un botón: no se llama a nada', async () => {
  setup({ status: 200, body: { ok: true } });
  await mount();
  assert.match(text(), /Quiero eliminar mi cuenta/);
  assert.equal(calls.length, 0);
});

test('el segundo paso explica qué se borra y qué se conserva por ley', async () => {
  setup({ status: 200, body: { ok: true } });
  await mount();
  await click(q('.pf-skip'));
  assert.match(text(), /no se te va a cobrar más/);
  assert.match(text(), /historia clínica/);
  assert.match(text(), /Ley 26\.529/);
  assert.equal(q('.pf-submit').disabled, true, 'sin escribir la palabra no se puede confirmar');
});

test('escribiendo ELIMINAR se confirma: llama al Worker y cierra la sesión de este equipo', async () => {
  setup({ status: 200, body: { ok: true } });
  await mount();
  await click(q('.pf-skip'));
  await type(q('.pf-input'), 'eliminar');
  assert.equal(q('.pf-submit').disabled, false);
  await submit(q('form'));
  await tick(5);
  assert.deepEqual(calls.map((c) => c.path), ['/patients/me/delete-account']);
  assert.equal(calls[0].body.confirm, 'eliminar');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.deepEqual(signOuts, [{ scope: 'local' }]);
});

test('si el servidor falla: muestra el motivo, no cierra la sesión y se puede reintentar', async () => {
  setup({ status: 502, body: { error: 'No pudimos cancelar tu suscripción en Mercado Pago, así que todavía no se dio de baja la cuenta.' } });
  await mount();
  await click(q('.pf-skip'));
  await type(q('.pf-input'), 'ELIMINAR');
  await submit(q('form'));
  await tick(5);
  assert.match(q('.pf-error').textContent, /Mercado Pago/);
  assert.equal(signOuts.length, 0);
  assert.equal(q('.pf-submit').disabled, false);
});

test('cancelar vuelve al botón inicial sin llamar a nada', async () => {
  setup({ status: 200, body: { ok: true } });
  await mount();
  await click(q('.pf-skip'));
  await click([...document.querySelectorAll('.pf-skip')].find((b) => b.textContent === 'Cancelar'));
  assert.match(text(), /Quiero eliminar mi cuenta/);
  assert.equal(calls.length, 0);
});
