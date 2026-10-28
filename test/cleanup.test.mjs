// Pruebas de limpieza y rendimiento: pedidos duplicados, trabajo por cuadro de la
// esfera, logs de diagnóstico y manejo de errores de red.
// Corren con:  node --test test/cleanup.test.mjs
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
Object.defineProperty(dom.window.navigator, 'mediaDevices', {
  value: { enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} },
  configurable: true,
});
globalThis.localStorage = dom.window.localStorage;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { drawOrb } = await vite.ssrLoadModule('/src/orbDraw.js');
const { transcriptText } = await vite.ssrLoadModule('/src/captions.js');
const { debugLog, isDebugEnabled } = await vite.ssrLoadModule('/src/debug.js');
const { default: InterviewScreen } = await vite.ssrLoadModule('/src/InterviewScreen.jsx');
const { default: FichaScreen } = await vite.ssrLoadModule('/src/FichaScreen.jsx');

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = () => document.getElementById('root').textContent;
const qa = (sel) => [...document.querySelectorAll(sel)];

async function mount(el) {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el));
  await tick(5);
  return root;
}

function recordFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    calls.push(path);
    const h = handlers[path];
    if (h instanceof Error) throw h;
    const out = h || { status: 200, body: {} };
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  return calls;
}

test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

// ── Pedidos al Worker ────────────────────────────────────────────────────
test('entrevista: con el estado que ya trajo App no vuelve a pedir el perfil al abrir', async () => {
  const calls = recordFetch({ '/patients/me/interviews': { status: 200, body: { interviews: [{ id: 'x' }] } } });
  const intake = { complete: false, pendingCount: 2, pending: [{ key: 'a', label: 'Sueño' }, { key: 'b', label: 'Estrés' }] };
  await mount(React.createElement(InterviewScreen, { session: { access_token: 't' }, intake, onNeedsOnboarding() {} }));
  assert.equal(calls.filter((p) => p === '/patients/me/profile').length, 0, 'el perfil ya lo pidió App.jsx');
  assert.match(text(), /Completemos tu historia clínica/);
  assert.match(text(), /Te faltan 2 datos/);
  assert.deepEqual(qa('.ra-pending li').map((e) => e.textContent), ['Sueño', 'Estrés']);
});

test('Mi ficha: si falla la red al abrir una entrevista, avisa en vez de quedar colgada', async () => {
  recordFetch({
    '/patients/me/interviews': { status: 200, body: { interviews: [{ id: 'iv1', status: 'borrador', started_at: '2026-10-20 10:00:00' }] } },
    '/patients/me/interview-detail': new Error('sin red'),
  });
  const failures = [];
  const onRejection = (e) => failures.push(e);
  process.on('unhandledRejection', onRejection);
  await mount(React.createElement(FichaScreen, { session: { access_token: 'tok' }, status: { intake: { complete: true } }, onProfileChanged() {} }));
  await act(async () => document.querySelector('.ra-ficha__item').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  await tick(10);
  process.off('unhandledRejection', onRejection);
  assert.equal(failures.length, 0, 'sin promesas rechazadas sin manejar');
  assert.match(text(), /No pudimos cargar esta entrevista/);
  assert.doesNotMatch(text(), /Cargando…/);
});

// ── Esfera: menos trabajo por cuadro, mismo dibujo ───────────────────────
test('esfera: el degradado del halo se crea una sola vez por canvas, no en cada cuadro', () => {
  let gradients = 0;
  const fills = [];
  const ctx = {
    clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fillText() {}, setTransform() {},
    fill() { fills.push(this.fillStyle); },
    createRadialGradient() { gradients += 1; return { id: gradients, addColorStop() {} }; },
  };
  for (let i = 0; i < 60; i += 1) drawOrb(ctx, i / 60, 0.5);
  assert.equal(gradients, 1);
  // Dos rellenos por cuadro: el halo y el círculo lino del centro.
  assert.equal(fills[0], fills[2], 'cada cuadro pinta el halo con el mismo degradado');
  assert.equal(fills[1], 'rgba(244,239,229,.9)');
});

// ── Transcripción guardada ───────────────────────────────────────────────
test('transcripción: «Asistente:»/«Paciente:» por intervención, sin avisos internos ni mensajes vacíos', () => {
  const said = (role, t) => ({ type: 'message', role, content: [{ type: role === 'assistant' ? 'output_audio' : 'input_audio', transcript: t }] });
  const history = [
    said('assistant', 'Hola, ¿cómo estás?'),
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[ARCHIVO DEL PACIENTE]' }] },
    { type: 'function_call', name: 'save_interview_block' },
    said('user', 'Bien.\nDuermo poco.'),
  ];
  assert.equal(transcriptText(history), 'Asistente: Hola, ¿cómo estás?\n\nPaciente: Bien.\nDuermo poco.');
  assert.equal(transcriptText([]), '');
});

// ── Logs de diagnóstico ──────────────────────────────────────────────────
test('diagnóstico: los logs de la llamada solo salen con ?debug o localStorage regen_debug=1', () => {
  const logged = [];
  const orig = console.log;
  console.log = (...a) => logged.push(a);
  try {
    localStorage.removeItem('regen_debug');
    assert.equal(isDebugEnabled(), false);
    debugLog('evento', { x: 1 });
    assert.equal(logged.length, 0, 'en producción la consola queda limpia');

    localStorage.setItem('regen_debug', '1');
    assert.equal(isDebugEnabled(), true);
    debugLog('evento', { x: 1 });
    assert.deepEqual(logged[0], ['[REGEN realtime]', 'evento', { x: 1 }]);
    localStorage.removeItem('regen_debug');

    dom.reconfigure({ url: 'https://asistente.regen.ar/?debug' });
    assert.equal(isDebugEnabled(), true);
    dom.reconfigure({ url: 'https://asistente.regen.ar/' });
  } finally {
    console.log = orig;
  }
});

test('Mi ficha: si el Worker no manda la lista de datos escritos, la pantalla igual se muestra', async () => {
  recordFetch({ '/patients/me/interviews': { status: 200, body: { interviews: [] } } });
  const status = { intake: { complete: false, pendingCount: 1, pending: [{ key: 'a', label: 'Sueño' }] } };
  await mount(React.createElement(FichaScreen, { session: { access_token: 'tok' }, status, onProfileChanged() {} }));
  assert.match(text(), /Te falta 1 dato/);
  assert.deepEqual(qa('.ra-pending li').map((e) => e.textContent), ['Sueño']);
});
