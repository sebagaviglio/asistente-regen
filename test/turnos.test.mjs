// Prueba de interfaz de Mi ficha → Turnos: pedir un turno, pagar uno fuera del plan, reprogramar y cancelar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://app.regen.ar/mi-ficha?tab=turnos', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: TurnosPanel } = await vite.ssrLoadModule('/src/TurnosPanel.jsx');

test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = () => document.getElementById('root').textContent;
const qa = (sel) => [...document.querySelectorAll(sel)];
const btn = (t) => qa('button').find((b) => b.textContent.trim().startsWith(t));
const click = (el) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
let root;
async function mount(props = {}) {
  root?.unmount();
  document.getElementById('root').innerHTML = '';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(TurnosPanel, { session: { access_token: 't' }, ...props })));
  await tick(10);
}

const OPTIONS = {
  types: [
    { id: 'tv', name: 'Validación por videollamada', modality: 'virtual', durationMin: 30, coverage: 'plan', priceArs: null, description: 'Revisamos tu plan.' },
    { id: 'tp', name: 'Consulta presencial', modality: 'presencial', durationMin: 45, coverage: 'pago', priceArs: 45000 },
  ],
  professionals: [{ id: 'doc', name: 'Dra. Sol', assigned: true }, { id: 'doc2', name: 'Dr. Luna', assigned: false }],
  validations: { allowed: 1, used: 0, left: 1 },
  paymentsEnabled: true,
  hasPhone: true,
  policy: { minNoticeHours: 12, changeLimitHours: 24, holdMinutes: 15 },
};
const DAYS = [{ date: '2026-12-01', label: 'martes 1 de diciembre', times: [{ startsAt: '2026-12-01T13:00:00.000Z', label: '10:00' }, { startsAt: '2026-12-01T13:30:00.000Z', label: '10:30' }] }];
const APPT = {
  id: 'a1', status: 'confirmado', dateLabel: 'martes 1 de diciembre', timeLabel: '10:00', modality: 'virtual', meetUrl: 'https://meet.google.com/x',
  type: { id: 'tv', name: 'Validación por videollamada' }, staff: { id: 'doc', name: 'Dra. Sol' }, coveredBy: 'plan',
  calendarUrl: 'https://calendar.google.com/calendar/render?x', canChange: true, canCancel: true,
};

function installFetch({ mine = { upcoming: [], past: [] }, book } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    const body = opts.body ? JSON.parse(opts.body) : {};
    calls.push({ path, body });
    const ok = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (path === '/appointments/options') return ok(OPTIONS);
    if (path === '/appointments/mine') return ok(typeof mine === 'function' ? mine() : mine);
    if (path === '/appointments/slots') return ok({ days: DAYS });
    if (path === '/appointments/book') return ok(book(body), 201);
    if (path === '/appointments/reschedule') return ok({ appointment: { ...APPT, timeLabel: '10:30' }, calendarUrl: 'https://calendar.google.com/x' });
    if (path === '/appointments/cancel') return ok({ appointment: { ...APPT, status: 'cancelado' } });
    return ok({ error: 'no' }, 404);
  };
  return calls;
}

test('pedir turno cubierto por el plan: tipo → profesional → horario → confirmado', async () => {
  const calls = installFetch({ book: () => ({ appointment: APPT, calendarUrl: APPT.calendarUrl }) });
  await mount();
  assert.match(text(), /Validaciones de tu plan disponibles: 1 de 1/);
  await click(btn('Pedir un turno'));
  assert.match(text(), /Incluido en tu plan/);
  assert.match(text(), /\$45\.000 · se paga al reservar/);
  await click(btn('Validación por videollamada'));
  assert.match(text(), /Tu profesional/);
  await click(btn('Dra. Sol'));
  await tick(10);
  await click(qa('.tu-time').find((b) => b.textContent === '10:30'));
  assert.match(text(), /recordatorios por WhatsApp/);
  await click(btn('Confirmar turno'));
  await tick(10);
  const book = calls.find((c) => c.path === '/appointments/book');
  assert.deepEqual(book.body, { typeId: 'tv', staffId: 'doc', startsAt: '2026-12-01T13:30:00.000Z', notifyWhatsapp: true });
  assert.match(text(), /Turno confirmado/);
  assert.ok(qa('a').some((a) => a.textContent === 'Agregar a Google Calendar'));
});

test('turno fuera del plan: lleva a Mercado Pago', async () => {
  installFetch({ book: () => ({ appointment: { ...APPT, status: 'pendiente_pago' }, checkoutUrl: 'https://mp.test/pagar' }) });
  let went = null;
  await mount({ redirect: (u) => { went = u; } });
  await click(btn('Pedir un turno'));
  await click(btn('Consulta presencial'));
  await click(btn('Dr. Luna'));
  await tick(10);
  await click(qa('.tu-time')[0]);
  assert.match(text(), /15 minutos mientras pagás \$45\.000/);
  await click(btn('Ir a pagar $45.000'));
  await tick(10);
  assert.equal(went, 'https://mp.test/pagar');
});

test('mis turnos: reprogramar y cancelar', async () => {
  let upcoming = [APPT];
  const calls = installFetch({ mine: () => ({ upcoming, past: [] }) });
  await mount();
  assert.match(text(), /Martes|martes 1 de diciembre · 10:00 hs/);
  assert.ok(qa('a').some((a) => a.href === 'https://meet.google.com/x'));

  await click(btn('Reprogramar'));
  await tick(10);
  await click(qa('.tu-time').find((b) => b.textContent === '10:30'));
  await click(btn('Confirmar el cambio'));
  await tick(10);
  assert.equal(calls.find((c) => c.path === '/appointments/reschedule').body.id, 'a1');
  assert.match(text(), /Turno reprogramado/);
  await click(btn('Ver mis turnos'));

  dom.window.confirm = () => true;
  upcoming = [];
  await click(btn('Cancelar'));
  await tick(10);
  assert.match(text(), /La validación de tu plan vuelve a estar disponible/);
  assert.match(text(), /No tenés turnos próximos/);
});
