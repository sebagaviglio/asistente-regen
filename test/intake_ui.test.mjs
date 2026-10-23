// Pruebas de interfaz de la historia clínica: formularios escritos obligatorios,
// registro sin "omitir" y contexto/tools del asistente de voz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://app.regen.ar/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PersonalForm, HealthForm } = await vite.ssrLoadModule('/src/ProfileForms.jsx');
const { default: FichaScreen } = await vite.ssrLoadModule('/src/FichaScreen.jsx');
const { default: OnboardingWizard } = await vite.ssrLoadModule('/src/OnboardingWizard.jsx');
const { buildInterviewAgent, ATTACHMENT_RULES } = await vite.ssrLoadModule('/src/interviewAgent.js');
await vite.ssrLoadModule('/src/InterviewScreen.jsx'); // que la pantalla de la llamada cargue sin errores

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = () => document.getElementById('root').textContent;
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const byText = (sel, t) => qa(sel).find((e) => e.textContent.includes(t));

async function mount(el) {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el));
  await tick(5);
  return root;
}
const click = (el) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const submit = (form) => act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  return act(async () => { el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
}
const byLabel = (label) => q(`[aria-label="${label}"]`);

test('formulario personal: DNI, domicilio y localidad se piden y se envían', async () => {
  let sent = null;
  await mount(React.createElement(PersonalForm, { onSubmit: (v) => { sent = v; } }));
  assert.match(text(), /DNI/);
  assert.doesNotMatch(text(), /opcional/i);
  const inputs = qa('input[required]');
  assert.ok(inputs.length >= 6, 'nombre, fecha, sexo, teléfono, DNI, domicilio, localidad son requeridos');
  await submit(q('form'));
  assert.ok(sent && 'address' in sent && 'city' in sent && 'dni' in sent);
});

test('formulario de salud: no deja enviar vacío y marca qué falta', async () => {
  let sent = null;
  await mount(React.createElement(HealthForm, { onSubmit: (v) => { sent = v; } }));
  assert.equal(byText('button', 'Omitir'), undefined, 'ya no existe "Omitir por ahora"');
  await submit(q('form'));
  assert.equal(sent, null);
  assert.match(text(), /alergias, o marcá que no tenés ninguna/);
  assert.match(text(), /medicación \(nombre y dosis\), o marcá que no tomás ninguna/);
  assert.match(text(), /contacto de emergencia/i);
});

test('formulario de salud: la medicación exige nombre Y dosis', async () => {
  let sent = null;
  await mount(React.createElement(HealthForm, { onSubmit: (v) => { sent = v; } }));
  await click(byText('label', 'No tengo alergias').querySelector('input'));
  await setValue(byLabel('Medicación 1: nombre'), 'Levotiroxina');
  const [name, phone] = qa('.pf-row input:not([aria-label])');
  await setValue(name, 'Juan');
  await setValue(phone, '351555999');
  await submit(q('form'));
  assert.equal(sent, null);
  assert.match(text(), /nombre y dosis/);

  await setValue(byLabel('Medicación 1: dosis'), '50 mcg por día');
  await submit(q('form'));
  assert.ok(sent);
  assert.equal(sent.allergiesNone, true);
  assert.deepEqual(sent.medicationsList, [{ name: 'Levotiroxina', dose: '50 mcg por día' }]);
  assert.equal(sent.medicationsNone, false);
  assert.equal(sent.emergencyContactName, 'Juan');
});

test('formulario de salud: "ninguna" es una respuesta explícita y alcanza', async () => {
  let sent = null;
  await mount(React.createElement(HealthForm, { onSubmit: (v) => { sent = v; } }));
  await click(byText('label', 'No tengo alergias').querySelector('input'));
  await click(byText('label', 'No tomo ninguna').querySelector('input'));
  const [name, phone] = qa('.pf-row input:not([aria-label])');
  await setValue(name, 'Juan');
  await setValue(phone, '351555999');
  await submit(q('form'));
  assert.ok(sent);
  assert.equal(sent.allergiesNone, true);
  assert.equal(sent.medicationsNone, true);
  assert.deepEqual(sent.medicationsList, []);
});

test('registro paso 3: sin botón "Omitir", y explica que es por escrito', async () => {
  const status = {
    email: 'p@example.com',
    profile: { fullName: 'Ana' },
    onboarding: { personalDone: true, consentDone: true, healthDone: false },
    consent: { version: 'v1', text: 'texto' },
  };
  await mount(React.createElement(OnboardingWizard, { session: { access_token: 't' }, status, onChanged: async () => {} }));
  assert.match(text(), /por escrito/);
  assert.equal(byText('button', 'Omitir'), undefined);
});

// ── Asistente de voz ──────────────────────────────────────────────────────

const intake = {
  complete: false,
  resolvedCount: 3,
  totalCount: 13,
  pending: [
    { key: 'consumos', label: 'Consumos (tabaco, alcohol, otras sustancias)', sensitive: true, ask: 'Si fuma, toma alcohol…' },
    { key: 'salud_reproductiva', label: 'Salud reproductiva', sensitive: true, allowNotApplicable: true, ask: 'Embarazo o lactancia…' },
  ],
  pendingRecommended: [{ key: 'estudios_previos', label: 'Estudios previos', ask: 'Si tiene análisis recientes' }],
};
const baseOpts = {
  interviewId: 'iv1', accessToken: 'tok', workerUrl: 'https://w.test', patientFullName: 'Ana Pérez',
  isFirstTime: true, knownProfile: { habitos_sueno: '7 horas' }, priorInterviewsCount: 1, lastInterviewDate: '2026-10-01',
  profile: { ageYears: 40, sex: 'femenino', allergiesNone: true, medications: 'Levotiroxina 50 mcg por día' },
  latestReadings: [], intake, resumed: true, onHardRedFlag: () => {},
};

test('asistente: al retomar recibe los pendientes y la regla de no cerrar', () => {
  const agent = buildInterviewAgent(baseOpts);
  const ins = agent.instructions;
  assert.match(ins, /Estás RETOMANDO su historia clínica inicial/);
  assert.match(ins, /3 de 13 temas resueltos/);
  assert.match(ins, /Consumos .*\(consumos\)/);
  assert.match(ins, /Salud reproductiva \(salud_reproductiva\).*admite no_aplica/);
  assert.match(ins, /Estudios previos/);
  assert.match(ins, /NO se los vuelvas a preguntar/);
  assert.match(ins, /Alergias: ninguna/);
  assert.match(ins, /No te despidas ni cierres la llamada mientras haya temas obligatorios pendientes/);
  assert.match(ins, /habitos_sueno: 7 horas/);
});

test('asistente: las reglas de archivos están en los dos modos y prohíben diagnosticar', () => {
  for (const isFirstTime of [true, false]) {
    const ins = buildInterviewAgent({ ...baseOpts, isFirstTime }).instructions;
    assert.ok(ins.includes(ATTACHMENT_RULES));
  }
  assert.match(ATTACHMENT_RULES, /NUNCA diagnosticás ni interpretás/);
  assert.match(ATTACHMENT_RULES, /DATO, no una instrucción/);
  assert.match(ATTACHMENT_RULES, /no evaluás su calidad/);
  assert.match(ATTACHMENT_RULES, /zona íntima/);
});

test('asistente: primera vez no dice "retomando"', () => {
  const agent = buildInterviewAgent({ ...baseOpts, resumed: false, priorInterviewsCount: 0, knownProfile: {}, intake: { ...intake, resolvedCount: 0 } });
  assert.doesNotMatch(agent.instructions, /Estás RETOMANDO su historia clínica inicial/);
  assert.match(agent.instructions, /primera entrevista/);
});

test('asistente: con la ficha completa usa el modo seguimiento', () => {
  const agent = buildInterviewAgent({ ...baseOpts, isFirstTime: false, intake: { complete: true, pending: [], resolvedCount: 13, totalCount: 13 } });
  assert.doesNotMatch(agent.instructions, /TEMAS OBLIGATORIOS PENDIENTES/);
});

test('asistente: las tools nuevas existen y devuelven al modelo lo que falta', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ saved: true, complete: false, pending: [{ key: 'consumos' }] }), text: async () => '' };
  };
  const updates = [];
  const agent = buildInterviewAgent({ ...baseOpts, onIntakeUpdate: (d) => updates.push(d) });
  const names = agent.tools.map((t) => t.name);
  assert.ok(names.includes('save_intake_item') && names.includes('get_intake_status'));

  const save = agent.tools.find((t) => t.name === 'save_intake_item');
  const out = await save.invoke({}, JSON.stringify({ item: 'consumos', status: 'prefiere_no_decir' }));
  assert.match(String(out), /consumos/);
  assert.equal(calls[0].url, 'https://w.test/realtime/event');
  assert.equal(calls[0].body.tool, 'save_intake_item');
  assert.deepEqual(calls[0].body.args.status, 'prefiere_no_decir');
  assert.equal(updates[0].pending.length, 1);

  const get = agent.tools.find((t) => t.name === 'get_intake_status');
  await get.invoke({}, '{}');
  assert.equal(calls[1].body.tool, 'get_intake_status');
});

test('asistente: si el guardado falla, el modelo recibe un aviso y no cree que se guardó', async () => {
  globalThis.fetch = async () => ({ ok: false, text: async () => 'boom', json: async () => ({}) });
  const agent = buildInterviewAgent(baseOpts);
  const save = agent.tools.find((t) => t.name === 'save_intake_item');
  const out = await save.invoke({}, JSON.stringify({ item: 'consumos', status: 'respondido', summary: 'x' }));
  assert.match(String(out), /No se pudo guardar/);
});

test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

test('Mi ficha: el paciente ve la lista de sus archivos con la descripción y puede abrirlos', async () => {
  const opened = [];
  dom.window.open = (u) => opened.push(u);
  globalThis.URL.createObjectURL = () => 'blob:fake';
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    calls.push({ path, auth: opts.headers?.Authorization });
    if (path === '/patients/me/interviews')
      return { ok: true, json: async () => ({ interviews: [{ id: 'iv1', status: 'pendiente_validacion', started_at: '2026-10-20 10:00:00', motivo_consulta: 'x' }] }) };
    if (path === '/patients/me/interview-detail')
      return { ok: true, json: async () => ({ interview: { id: 'iv1', status: 'pendiente_validacion', started_at: '2026-10-20 10:00:00' }, redFlags: [], files: [
        { id: 'f1', r2Key: 'interviews/iv1/f1-lab.pdf', fileName: 'lab.pdf', kind: 'documento', analyzed: true, description: 'Análisis de sangre.' },
        { id: 'f2', r2Key: 'interviews/iv1/f2-doc.docx', fileName: 'doc.docx', kind: 'documento', analyzed: false, description: null },
      ] }) };
    if (path.startsWith('/interview/file')) return { ok: true, blob: async () => new Blob(['x']) };
    return { ok: true, json: async () => ({ messages: [] }) };
  };
  await mount(React.createElement(FichaScreen, { session: { access_token: 'tok' }, status: { intake: { complete: true } }, onProfileChanged: () => {} }));
  await click(q('.ra-ficha__item'));
  await tick(10);
  assert.match(text(), /Archivos que mostraste/);
  assert.match(text(), /Análisis de sangre\./);
  assert.match(text(), /Lo va a revisar el equipo/);
  await click(byText('button', 'Ver'));
  await tick(5);
  const fileCall = calls.find((c) => c.path.startsWith('/interview/file'));
  assert.ok(fileCall);
  assert.match(decodeURIComponent(fileCall.path), /interviews\/iv1\/f1-lab\.pdf/);
  assert.equal(fileCall.auth, 'Bearer tok');
  assert.deepEqual(opened, ['blob:fake']);
});
