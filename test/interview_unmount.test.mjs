// La llamada de voz no puede quedar viva si la persona sale de la pantalla (ahora que navegar
// no recarga la página): se corta la sesión, se suelta el micrófono y se cierra la entrevista.
// El SDK de voz se reemplaza por uno de mentira; no hace falta micrófono ni red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://asistente.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.localStorage = dom.window.localStorage;
globalThis.alert = () => {};

// Micrófono de mentira: cuenta cuántas pistas se soltaron.
const stats = { stopped: 0, getUserMediaCalls: 0 };
let releaseMic = () => {};
const makeStream = () => {
  const track = { stop() { stats.stopped += 1; }, label: 'Micrófono de prueba' };
  return { getTracks: () => [track], getAudioTracks: () => [track] };
};
Object.defineProperty(dom.window.navigator, 'mediaDevices', {
  value: {
    enumerateDevices: async () => [],
    addEventListener() {},
    removeEventListener() {},
    getUserMedia: () => {
      stats.getUserMediaCalls += 1;
      return new Promise((resolve) => { releaseMic = () => resolve(makeStream()); });
    },
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
dom.window.speechSynthesis = { cancel() {}, speak() {} };

globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// SDK de voz de mentira: se registra en globalThis.__rt para que la prueba lo mire.
globalThis.__rt = { sessions: [], connectGate: Promise.resolve() };
const fakeRealtime = `
export class RealtimeSession {
  constructor() { this.closed = false; this.transport = { sendEvent() {} }; globalThis.__rt.sessions.push(this); }
  on() {}
  async connect() { await globalThis.__rt.connectGate; }
  close() { this.closed = true; }
}
export class OpenAIRealtimeWebRTC {}
export function buildInterviewAgent() { return {}; }
`;
const stubRealtime = {
  name: 'stub-realtime-call',
  enforce: 'pre',
  resolveId(id) { return /realtimeCall(\.js)?$/.test(id) ? '\0stub-realtime-call' : null; },
  load(id) { return id === '\0stub-realtime-call' ? fakeRealtime : null; },
};

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', plugins: [stubRealtime] });
test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: InterviewScreen } = await vite.ssrLoadModule('/src/InterviewScreen.jsx');

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

let calls;
function installFetch() {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : null });
    const body =
      path === '/realtime/session' ? { interviewId: 'int-1', model: 'gpt-realtime', intake: { pending: [] } }
      : path === '/patients/me/interviews' ? { interviews: [] }
      : {};
    return { ok: true, status: 200, json: async () => body };
  };
}

async function startCall() {
  installFetch();
  stats.stopped = 0;
  stats.getUserMediaCalls = 0;
  globalThis.__rt.sessions.length = 0;
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(InterviewScreen, { session: { access_token: 't' }, onNeedsOnboarding() {} })));
  await tick(5);
  await act(async () => document.querySelector('.ra-voicebar__mic').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  return root;
}

test('al salir de la pantalla con la llamada en curso: se corta, se suelta el micrófono y se cierra la entrevista', async () => {
  globalThis.__rt.connectGate = Promise.resolve();
  const root = await startCall();
  await tick(20);
  await act(async () => releaseMic());
  await tick(20);
  assert.equal(globalThis.__rt.sessions.length, 1, 'la llamada se conectó');
  assert.equal(globalThis.__rt.sessions[0].closed, false);

  await act(async () => root.unmount());
  await tick(10);
  assert.equal(globalThis.__rt.sessions[0].closed, true, 'la sesión de voz se cerró');
  assert.ok(stats.stopped >= 1, 'el micrófono se soltó');
  assert.ok(calls.some((c) => c.path === '/realtime/end' && c.body?.interviewId === 'int-1'), 'la entrevista se cerró en el servidor');
});

test('si sale mientras acepta el permiso del micrófono: no queda ninguna llamada ni el micrófono abierto', async () => {
  const root = await startCall();
  await tick(20);
  assert.equal(stats.getUserMediaCalls, 1);
  await act(async () => root.unmount()); // sale antes de que el permiso se resuelva
  await act(async () => releaseMic());
  await tick(20);
  assert.equal(globalThis.__rt.sessions.length, 0, 'no se creó la sesión de voz');
  assert.ok(stats.stopped >= 1, 'el micrófono recién concedido se soltó');
});

test('si sale mientras se conecta la sesión de voz: se cierra apenas conecta', async () => {
  let openGate;
  globalThis.__rt.connectGate = new Promise((r) => { openGate = r; });
  const root = await startCall();
  await tick(20);
  await act(async () => releaseMic());
  await tick(20);
  assert.equal(globalThis.__rt.sessions.length, 1, 'la conexión está en curso');
  await act(async () => root.unmount());
  await act(async () => openGate());
  await tick(20);
  assert.equal(globalThis.__rt.sessions[0].closed, true, 'la sesión tardía se cerró sola');
  assert.ok(stats.stopped >= 1, 'el micrófono se soltó');
  globalThis.__rt.connectGate = Promise.resolve();
});

test('sin llamada en curso, salir de la pantalla no cierra ninguna entrevista', async () => {
  installFetch();
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(InterviewScreen, { session: { access_token: 't' }, onNeedsOnboarding() {} })));
  await tick(5);
  await act(async () => root.unmount());
  await tick(5);
  assert.equal(calls.some((c) => c.path === '/realtime/end'), false);
});
