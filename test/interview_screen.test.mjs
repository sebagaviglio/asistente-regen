// Pruebas de la pantalla de la entrevista de voz (esfera, subtítulos, estados, chip de plan).
// Corren con:  node --test test/   (necesita jsdom; ver LEEME_PAGOS_APP.md)
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
// jsdom no trae micrófono: la pantalla lista los dispositivos al cargar.
Object.defineProperty(dom.window.navigator, 'mediaDevices', {
  value: { enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} },
  configurable: true,
});
globalThis.localStorage = dom.window.localStorage;

// requestAnimationFrame controlado a mano, para ver cuándo se pide un cuadro y cuándo se cancela.
const rafQueue = new Map();
let rafId = 0;
globalThis.requestAnimationFrame = (fn) => {
  rafId += 1;
  rafQueue.set(rafId, fn);
  return rafId;
};
globalThis.cancelAnimationFrame = (id) => rafQueue.delete(id);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const runFrame = (now = 16) => {
  const [id, fn] = [...rafQueue.entries()][0] || [];
  if (!id) return false;
  rafQueue.delete(id);
  fn(now);
  return true;
};

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { latestCaptions, sameCaptions, clipCaption } = await vite.ssrLoadModule('/src/captions.js');
const { normalizeLevel, rmsFromBytes, combineLevels, createAudioLevels } = await vite.ssrLoadModule('/src/audioLevel.js');
const { drawOrb, RINGS } = await vite.ssrLoadModule('/src/orbDraw.js');
const { default: VoiceOrb } = await vite.ssrLoadModule('/src/VoiceOrb.jsx');
const { default: CaptionBubbles } = await vite.ssrLoadModule('/src/CaptionBubbles.jsx');
const { default: InterviewScreen } = await vite.ssrLoadModule('/src/InterviewScreen.jsx');
const { default: BillingGate } = await vite.ssrLoadModule('/src/BillingGate.jsx');
const { activePlanName } = await vite.ssrLoadModule('/src/billing.js');

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = () => document.getElementById('root').textContent;
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];

async function mount(el) {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el));
  await tick(5);
  return root;
}

function installFetch(handlers) {
  globalThis.fetch = async (url) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    const out = handlers[path] || { status: 200, body: {} };
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
}

// ── Subtítulos: salen de la transcripción en vivo ────────────────────────
const msg = (role, itemId, content) => ({ type: 'message', itemId, role, status: 'completed', content });
const said = (role, id, t) => msg(role, id, [{ type: role === 'assistant' ? 'output_audio' : 'input_audio', transcript: t }]);

test('subtítulos: quedan las últimas 2 intervenciones, con quién habló', () => {
  const h = [said('assistant', 'a1', 'Hola'), said('user', 'u1', 'Quiero dormir mejor'), said('assistant', 'a2', '¿Cuántas horas dormís?')];
  assert.deepEqual(latestCaptions(h), [
    { id: 'u1', who: 'p', text: 'Quiero dormir mejor' },
    { id: 'a2', who: 'a', text: '¿Cuántas horas dormís?' },
  ]);
  assert.equal(latestCaptions(h, 1).length, 1);
});

test('subtítulos: ignora lo que no es una intervención (avisos de archivos, herramientas, mensajes vacíos)', () => {
  const h = [
    msg('user', 'f1', [{ type: 'input_text', text: '[ARCHIVO DEL PACIENTE — una imagen]' }]),
    { type: 'function_call', name: 'save_interview_block' },
    said('assistant', 'a0', '   '),
    msg('assistant', 'a1', [{ type: 'text', text: 'Gracias, lo anoto.' }]),
  ];
  assert.deepEqual(latestCaptions(h), [{ id: 'a1', who: 'a', text: 'Gracias, lo anoto.' }]);
  assert.deepEqual(latestCaptions(undefined), []);
});

test('subtítulos: una intervención larga muestra su final; sameCaptions evita redibujar sin cambios', () => {
  const long = 'palabra '.repeat(80).trim();
  const clipped = clipCaption(long);
  assert.ok(clipped.startsWith('…') && clipped.length <= 222);
  const a = latestCaptions([said('assistant', 'a1', 'Hola')]);
  assert.equal(sameCaptions(a, latestCaptions([said('assistant', 'a1', 'Hola')])), true);
  assert.equal(sameCaptions(a, latestCaptions([said('assistant', 'a1', 'Hola, Martina')])), false);
});

test('burbujas: etiqueta «Asistente» / «Vos» y estilos distintos; sin subtítulos no ocupa lugar', async () => {
  await mount(React.createElement(CaptionBubbles, { items: [{ id: '1', who: 'a', text: 'Contame' }, { id: '2', who: 'p', text: 'Duermo poco' }] }));
  assert.match(q('.ra-sub--a').textContent, /Asistente.*Contame/);
  assert.match(q('.ra-sub--p').textContent, /Vos.*Duermo poco/);
  await mount(React.createElement(CaptionBubbles, { items: [] }));
  assert.equal(q('.ra-subs'), null);
  await mount(React.createElement(CaptionBubbles, { items: [], reserve: true }));
  assert.ok(q('.ra-subs--reserve'), 'en vivo reserva el lugar para que la pantalla no salte');
});

// ── Nivel de audio real ──────────────────────────────────────────────────
test('nivel: el silencio y el ruido de fondo dan 0; la voz sube y nunca pasa de 1', () => {
  assert.equal(normalizeLevel(0), 0);
  assert.equal(normalizeLevel(0.01), 0);
  assert.ok(normalizeLevel(0.1) > 0.3 && normalizeLevel(0.1) < 1);
  assert.equal(normalizeLevel(0.9), 1);
  assert.equal(rmsFromBytes(new Uint8Array([128, 128, 128, 128])), 0);
  assert.ok(rmsFromBytes(new Uint8Array([255, 0, 255, 0])) > 0.9);
});

test('nivel: asistente hablando = amplitud completa; paciente hablando = media', () => {
  assert.equal(combineLevels({ remote: 0.8, mic: 0 }), 0.8);
  assert.ok(Math.abs(combineLevels({ remote: 0, mic: 0.8 }) - 0.52) < 1e-9);
  assert.equal(combineLevels({ remote: 0.2, mic: 0.9 }), 0.9 * 0.65);
});

test('medidores: AnalyserNode sobre el micrófono y sobre la pista remota del <audio>, sin conectar a la salida', () => {
  const made = { analysers: [], sources: [] };
  let closed = false;
  class FakeCtx {
    constructor() { this.state = 'running'; }
    resume() { return Promise.resolve(); }
    close() { closed = true; return Promise.resolve(); }
    createAnalyser() {
      const a = { fftSize: 0, connectedToOutput: false, fill: 128, getByteTimeDomainData(buf) { buf.forEach((_, i) => { buf[i] = i % 2 ? this.fill : 256 - this.fill; }); } };
      made.analysers.push(a);
      return a;
    }
    createMediaStreamSource(stream) {
      const s = { stream, to: null, connect(n) { this.to = n; }, disconnect() { this.to = null; } };
      made.sources.push(s);
      return s;
    }
  }
  window.AudioContext = FakeCtx;
  const levels = createAudioLevels();
  assert.ok(levels);
  const micStream = { id: 'mic' };
  const remoteStream = { id: 'remote' };
  const audioEl = { srcObject: null };
  levels.watchRemoteElement(audioEl);
  levels.attachMic(micStream);
  assert.deepEqual(levels.read(), { remote: 0, mic: 0 }, 'sin voz, nivel 0');
  assert.equal(made.sources.length, 1, 'todavía no llegó la pista remota');

  audioEl.srcObject = remoteStream; // el SDK la asigna al <audio> cuando llega
  made.analysers[1].fill = 200; // el asistente habla
  const speaking = levels.read();
  assert.equal(made.sources.length, 2, 'ahora sí se engancha a la pista remota');
  assert.ok(speaking.remote > 0.5 && speaking.mic === 0);
  assert.ok(made.analysers.every((a) => !a.connectedToOutput));
  assert.ok(made.sources.every((s) => s.to !== undefined));

  levels.close();
  assert.equal(closed, true);
  delete window.AudioContext;
  assert.equal(createAudioLevels(), null, 'sin Web Audio devuelve null (la pantalla usa un movimiento de respaldo)');
});

// ── Esfera ───────────────────────────────────────────────────────────────
function recordingCtx() {
  const log = { strokes: [], arcs: [], text: null, lineWidths: [] };
  const ctx = {
    lineWidth: 0, strokeStyle: '', fillStyle: '', font: '',
    clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, fill() {},
    stroke() { log.strokes.push({ style: this.strokeStyle, width: this.lineWidth }); },
    arc(x, y, r) { log.arcs.push(r); },
    fillText(t) { log.text = { t, font: this.font, color: this.fillStyle }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setTransform() {},
  };
  return { ctx, log };
}

test('esfera: tres anillos con los colores y grosores de la marca, círculo lino y «R» en Bodoni Moda', () => {
  const { ctx, log } = recordingCtx();
  drawOrb(ctx, 1, 0);
  assert.equal(log.strokes.length, 3);
  assert.deepEqual(log.strokes.map((s) => s.style), RINGS.map((r) => r[1]));
  assert.deepEqual(log.strokes.map((s) => s.width), [5.2, 4, 3.2]);
  assert.ok(['rgba(94,114,88,.9)', 'rgba(120,143,118,.7)', 'rgba(185,200,174,.9)'].every((c) => log.strokes.some((s) => s.style === c)));
  assert.equal(log.text.t, 'R');
  assert.match(log.text.font, /Bodoni Moda/);
  assert.equal(log.text.color, '#5E7258');
  assert.equal(log.arcs.at(-1), 64, 'círculo central de radio 64 en reposo');
});

test('esfera: con más volumen el círculo central crece (64 + A·16)', () => {
  const rest = recordingCtx();
  const loud = recordingCtx();
  drawOrb(rest.ctx, 1, 0);
  drawOrb(loud.ctx, 1, 1);
  assert.equal(rest.log.arcs.at(-1), 64);
  assert.equal(loud.log.arcs.at(-1), 80);
});

test('esfera: usa un solo requestAnimationFrame, se frena con la pestaña oculta y al salir de la pantalla', async () => {
  const { ctx } = recordingCtx();
  const proto = dom.window.HTMLCanvasElement.prototype;
  proto.getContext = () => ctx;
  rafQueue.clear();
  let level = 0;
  const root = await mount(React.createElement(VoiceOrb, { readLevel: () => level, active: true }));
  assert.ok(q('canvas.ra-orb'));
  assert.equal(q('canvas.ra-orb').getAttribute('aria-hidden'), 'true');
  assert.equal(rafQueue.size, 1, 'un solo cuadro pendiente');
  runFrame();
  assert.equal(rafQueue.size, 1, 'sigue con un solo pedido por vez');

  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(rafQueue.size, 0, 'pestaña oculta: se detiene');
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(rafQueue.size, 1, 'vuelve a animar al volver');

  await act(async () => root.unmount());
  assert.equal(rafQueue.size, 0, 'al salir de la pantalla no queda nada corriendo');
  delete proto.getContext;
});

// ── Pantalla completa ────────────────────────────────────────────────────
const interviewHandlers = (interviews) => ({
  '/patients/me/interviews': { status: 200, body: { interviews } },
  '/patients/me/profile': { status: 200, body: { intake: null } },
});

test('pantalla: primera vez → título, ayuda, esfera, estado «Tocá para empezar a hablar» y botón de micrófono', async () => {
  installFetch(interviewHandlers([]));
  await mount(React.createElement(InterviewScreen, { session: { access_token: 't' }, onNeedsOnboarding() {} }));
  assert.match(text(), /Asistente de bienestar/);
  assert.match(text(), /Entrevista de primera consulta/);
  assert.match(text(), /esto prepara tu primera consulta presencial/);
  assert.match(q('.ra-voicebar__status').textContent, /Tocá para empezar a hablar/);
  assert.ok(q('canvas.ra-orb'), 'la esfera reemplaza al VoiceBeam');
  assert.equal(q('.ra-voicebar.is-live'), null);
  assert.equal(q('.ra-subs'), null, 'sin llamada no hay subtítulos');
  assert.equal(q('.ra-plan-chip'), null, 'sin plan no hay chip');
  assert.ok(q('.ra-voicebar__mic'));
  assert.match(text(), /Mi ficha médica/);
  assert.match(text(), /Salir/);
});

test('pantalla: quien ya habló antes ve «Tu asistente REGEN» y «Hablá con tu asistente REGEN»', async () => {
  installFetch(interviewHandlers([{ id: 'x' }]));
  await mount(React.createElement(InterviewScreen, { session: { access_token: 't' }, onNeedsOnboarding() {} }));
  assert.match(text(), /Tu asistente REGEN/);
  assert.match(text(), /Hablá con tu asistente REGEN/);
});

test('pantalla: historia incompleta → «Completemos tu historia clínica» y temas pendientes', async () => {
  installFetch({
    '/patients/me/interviews': { status: 200, body: { interviews: [{ id: 'x' }] } },
    '/patients/me/profile': { status: 200, body: { intake: { complete: false, pendingCount: 2, pending: [{ key: 'a', label: 'Sueño' }, { key: 'b', label: 'Estrés' }] } } },
  });
  await mount(React.createElement(InterviewScreen, { session: { access_token: 't' }, onNeedsOnboarding() {} }));
  assert.match(text(), /Completemos tu historia clínica/);
  assert.match(text(), /Te faltan 2 datos/);
  assert.deepEqual(qa('.ra-pending li').map((e) => e.textContent), ['Sueño', 'Estrés']);
});

test('chip de plan: aparece a la derecha del encabezado solo con plan activo', async () => {
  installFetch(interviewHandlers([]));
  await mount(React.createElement(InterviewScreen, { session: { access_token: 't' }, planName: 'Activo', onNeedsOnboarding() {} }));
  assert.equal(q('.ra-topbar__right .ra-plan-chip').textContent, 'Plan Activo');
});

test('activePlanName: solo suscripciones vigentes (activa o cortesía)', () => {
  assert.equal(activePlanName({ subscription: { status: 'activa', planName: 'Activo' } }), 'Activo');
  assert.equal(activePlanName({ subscription: { status: 'cortesia', planName: 'Core' } }), 'Core');
  assert.equal(activePlanName({ subscription: { status: 'en_mora', planName: 'Core' } }), null);
  assert.equal(activePlanName({ subscription: { status: 'cancelada', planName: 'Core' } }), null);
  assert.equal(activePlanName({ subscription: null }), null);
  assert.equal(activePlanName(null), null);
});

test('filtro de pagos: le pasa el nombre del plan a la entrevista, y sin plan no cambia nada', async () => {
  const Probe = (props) => React.createElement('div', { id: 'probe' }, `plan=${props.planName ?? 'ninguno'}`);
  const session = { access_token: 't' };
  const gate = () => mount(React.createElement(BillingGate, { session, status: { profile: { birthDate: '1990-05-10' } } }, React.createElement(Probe)));
  const me = (subscription) => ({ status: 200, body: { paymentsEnabled: true, paymentsMode: 'test', subscription, diagnostico: null, entitlement: { enforced: false, allowed: true } } });

  installFetch({ '/subscriptions/me': me({ id: 's1', status: 'activa', planName: 'Activo' }) });
  await gate();
  assert.equal(q('#probe').textContent, 'plan=Activo');

  installFetch({ '/subscriptions/me': me(null) });
  await gate();
  assert.equal(q('#probe').textContent, 'plan=ninguno');
});

test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });
