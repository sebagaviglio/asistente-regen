// Prueba de interfaz (solo en el entorno de desarrollo): renderiza las pantallas de verdad en jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://asistente.regen.ar/planes', pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: PlansScreen } = await vite.ssrLoadModule('/src/PlansScreen.jsx');
const { default: PaymentReturn } = await vite.ssrLoadModule('/src/PaymentReturn.jsx');
const { default: BillingGate } = await vite.ssrLoadModule('/src/BillingGate.jsx');

const PLANS = [
  { key: 'diagnostico', name: 'Diagnóstico inicial', kind: 'one_time', showPrice: true, priceArs: 299999, voiceMinutesMonth: null, validationsInitial: 1, validationsRecurring: 0, validationsEveryMonths: 0 },
  { key: 'core', name: 'Core', kind: 'subscription', showPrice: true, priceArs: 59999, voiceMinutesMonth: 20, validationsInitial: 1, validationsRecurring: 1, validationsEveryMonths: 6 },
  { key: 'activo', name: 'Activo', kind: 'subscription', showPrice: true, priceArs: 139999, voiceMinutesMonth: 45, validationsInitial: 1, validationsRecurring: 1, validationsEveryMonths: 3 },
  { key: 'elite', name: 'Elite', kind: 'custom', showPrice: false, priceArs: null },
];

function installFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('https://regen-agente.sebagaviglio.workers.dev', '');
    calls.push({ path, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const h = handlers[path];
    const out = typeof h === 'function' ? h(calls.at(-1)) : h;
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  return calls;
}

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const session = { access_token: 'tok' };
const adult = { profile: { birthDate: '1990-05-10' } };
const text = () => document.getElementById('root').textContent;
const q = (sel) => document.querySelector(sel);
const byText = (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t));

async function mount(el) {
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el));
  await tick(5);
  return root;
}
const click = (el) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });

test('planes: Core y Activo con precio, Elite sin precio y con botón', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null } }));
  const t = text();
  assert.match(t, /\$59\.999/);
  assert.match(t, /\$139\.999/);
  assert.match(t, /\$299\.999/);
  assert.match(t, /20 minutos de voz por mes/);
  assert.match(t, /45 minutos de voz por mes/);
  assert.ok(byText('button', 'Quiero ser Elite'));
  assert.match(t, /Cupos limitados/);
  const elite = q('.bl-card--elite');
  assert.doesNotMatch(elite.textContent, /\$|minutos/);
});

test('pagar exige elegir plan Y aceptar los T&C; después abre el checkout con la versión de T&C', async () => {
  const calls = installFetch({
    '/plans': { status: 200, body: { plans: PLANS } },
    '/checkout': { status: 201, body: { kind: 'subscription', checkoutUrl: 'https://mp.test/pre-1', subscriptionId: 's1' } },
  });
  let redirected = null;
  await mount(React.createElement(PlansScreen, { session, status: adult, redirect: (u) => { redirected = u; }, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null } }));

  const pay = q('.bl-pay .pf-submit');
  assert.equal(pay.disabled, true);

  await click(byText('.bl-card button', 'Elegir')); // Core (la primera tarjeta con "Elegir")
  assert.equal(q('.bl-pay .pf-submit').disabled, true); // falta aceptar T&C
  assert.match(q('.bl-pay .pf-submit').textContent, /Suscribirme por \$59\.999 al mes/);

  await click(q('.bl-pay input[type="checkbox"]'));
  assert.equal(q('.bl-pay .pf-submit').disabled, false);

  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  const checkout = calls.find((c) => c.path === '/checkout');
  assert.deepEqual(checkout.body, { planKey: 'core', termsVersion: '2026-10-v1-borrador' });
  assert.equal(redirected, 'https://mp.test/pre-1');
});

test('Diagnóstico: se puede elegir y paga por separado', async () => {
  const calls = installFetch({
    '/plans': { status: 200, body: { plans: PLANS } },
    '/checkout': { status: 201, body: { kind: 'order', checkoutUrl: 'https://mp.test/pref-1', orderId: 'o1' } },
  });
  let redirected = null;
  await mount(React.createElement(PlansScreen, { session, status: adult, redirect: (u) => { redirected = u; }, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null } }));
  await click(q('.bl-extra .bl-card button'));
  await click(q('.bl-pay input[type="checkbox"]'));
  assert.match(q('.bl-pay .pf-submit').textContent, /Pagar \$299\.999/);
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.equal(calls.find((c) => c.path === '/checkout').body.planKey, 'diagnostico');
  assert.equal(redirected, 'https://mp.test/pref-1');
});

test('Diagnóstico ya pagado: figura "Pagado" y no se puede volver a comprar', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: { status: 'pagada', orderId: 'o1' } } }));
  assert.match(q('.bl-extra').textContent, /Pagado/);
  assert.equal(q('.bl-extra .bl-card button'), null);
});

test('menor de 18: aviso claro y todo deshabilitado', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: { profile: { birthDate: '2015-01-01' } }, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null } }));
  assert.match(text(), /solo para mayores de 18/);
  for (const b of document.querySelectorAll('.bl-card:not(.bl-card--elite) button')) assert.equal(b.disabled, true);
  assert.equal(q('.bl-pay .pf-submit').disabled, true);
  assert.equal(byText('button', 'Quiero ser Elite').disabled, true);
});

test('error del checkout se muestra y se puede reintentar', async () => {
  installFetch({
    '/plans': { status: 200, body: { plans: PLANS } },
    '/checkout': { status: 409, body: { code: 'TERMS_VERSION_MISMATCH', error: 'x' } },
  });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null } }));
  await click(byText('.bl-card button', 'Elegir'));
  await click(q('.bl-pay input[type="checkbox"]'));
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.match(q('.bl-pay').textContent, /Recargá la página/);
  assert.equal(q('.bl-pay .pf-submit').disabled, false);
});

test('en mora con gracia vencida: explica qué hacer y no deja pagar otra suscripción', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: true, paymentsMode: 'live', subscription: { status: 'en_mora', planName: 'Core' }, entitlement: { reason: 'grace_expired' }, diagnostico: null } }));
  assert.match(text(), /pasó el período de gracia/);
  assert.match(text(), /Tu ficha sigue disponible/);
  assert.equal(q('.bl-pay .pf-submit').disabled, true);
});

test('pagos apagados: avisa y no deja pagar', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: false, paymentsMode: 'off' } }));
  assert.match(text(), /todavía no están habilitados/);
  assert.equal(q('.bl-pay .pf-submit').disabled, true);
});

test('no se pudieron cargar los planes: mensaje de error, sin romperse', async () => {
  installFetch({ '/plans': { status: 500, body: {} } });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: null }));
  assert.match(text(), /No pudimos cargar los planes/);
});

test('Elite: el pedido se envía y se muestra la confirmación', async () => {
  const calls = installFetch({
    '/plans': { status: 200, body: { plans: PLANS } },
    '/elite/request': { status: 201, body: { requested: true, alreadyRequested: false } },
  });
  await mount(React.createElement(PlansScreen, { session, status: adult, billing: { paymentsEnabled: true, paymentsMode: 'test' } }));
  await click(byText('button', 'Quiero ser Elite'));
  const ta = q('.bl-elite-form textarea');
  assert.equal(ta.getAttribute('maxlength'), '500');
  await click(byText('button', 'Enviar pedido'));
  await tick(5);
  assert.ok(calls.find((c) => c.path === '/elite/request'));
  assert.match(q('.bl-card--elite').textContent, /Recibimos tu pedido/);
});

// ── Vuelta de Mercado Pago ───────────────────────────────────────────────
function goTo(search) { dom.reconfigure({ url: `https://asistente.regen.ar/${search}` }); }

test('vuelta: espera la confirmación del Worker y recién ahí dice "activa"', async () => {
  goTo('?pago=suscripcion&ref=s1');
  let n = 0;
  installFetch({
    '/subscriptions/me': () => {
      n += 1;
      return { status: 200, body: { subscription: { id: 's1', status: n < 2 ? 'pendiente' : 'activa' } } };
    },
  });
  await mount(React.createElement(PaymentReturn, { session }));
  assert.match(text(), /Confirmando tu pago/);
  assert.doesNotMatch(text(), /suscripción está activa/);
  await tick(3200);
  assert.match(text(), /Tu suscripción está activa/);
  assert.match(text(), /Empezar mi entrevista/);
});

test('vuelta con error de Mercado Pago (Diagnóstico): mensaje de fallo, sin consultar', async () => {
  goTo('?pago=diagnostico&ref=o1&estado=error');
  const calls = installFetch({});
  await mount(React.createElement(PaymentReturn, { session }));
  assert.match(text(), /No se pudo completar el pago/);
  assert.equal(calls.length, 0);
});

test('vuelta: un ?estado=ok en la URL NO alcanza; solo cuenta lo que confirma el Worker', async () => {
  goTo('?pago=diagnostico&ref=o1&estado=ok');
  installFetch({ '/subscriptions/me': { status: 200, body: { diagnostico: { orderId: 'o1', status: 'pendiente' } } } });
  await mount(React.createElement(PaymentReturn, { session }));
  assert.match(text(), /Confirmando tu pago/);
  assert.doesNotMatch(text(), /Recibimos el pago/);
});


// ── El filtro completo (BillingGate) ─────────────────────────────────────
const Entrevista = () => React.createElement('div', { id: 'entrevista' }, 'PANTALLA ENTREVISTA');
const mountGate = () => mount(React.createElement(BillingGate, { session, status: adult }, React.createElement(Entrevista)));
const me = (mode, allowed, enforced = true) => ({
  status: 200,
  body: { paymentsEnabled: mode !== 'off', paymentsMode: mode, subscription: null, diagnostico: null, entitlement: { enforced, allowed, reason: allowed ? 'active' : 'no_subscription' } },
});

test('filtro: modo "live" y sin acceso → pantalla de planes, no la entrevista', async () => {
  goTo('');
  installFetch({ '/subscriptions/me': me('live', false), '/plans': { status: 200, body: { plans: PLANS } } });
  await mountGate();
  assert.match(text(), /Elegí tu plan/);
  assert.doesNotMatch(text(), /PANTALLA ENTREVISTA/);
});

test('filtro: modo "test" sin suscripción → entra a la entrevista como siempre', async () => {
  goTo('');
  installFetch({ '/subscriptions/me': me('test', false) });
  await mountGate();
  assert.match(text(), /PANTALLA ENTREVISTA/);
});

test('filtro: si el Worker no responde (ruta inexistente o sin red) → entra a la entrevista', async () => {
  goTo('');
  installFetch({ '/subscriptions/me': { status: 404, body: { error: 'x' } } });
  await mountGate();
  assert.match(text(), /PANTALLA ENTREVISTA/);
});

test('filtro: modo "live" con acceso → entrevista', async () => {
  goTo('');
  installFetch({ '/subscriptions/me': me('live', true) });
  await mountGate();
  assert.match(text(), /PANTALLA ENTREVISTA/);
});

test.after(async () => { await vite.close(); setTimeout(() => process.exit(0), 200).unref?.(); });

// ── Cupones ──────────────────────────────────────────────────────────────
const BILLING_OK = { paymentsEnabled: true, paymentsMode: 'test', subscription: null, diagnostico: null };
const typeInto = (input, value) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
const CORE_OFFER = { valid: true, planKey: 'core', percentOff: 20, months: 3, listPriceArs: 59999, finalPriceArs: 47999, free: false };

async function mountPlans(handlers, extra = {}) {
  const calls = installFetch({ '/plans': { status: 200, body: { plans: PLANS } }, ...handlers });
  let redirected = null;
  await mount(React.createElement(PlansScreen, { session, status: adult, redirect: (u) => { redirected = u; }, billing: BILLING_OK, ...extra }));
  return { calls, redirected: () => redirected };
}
async function applyCode(code) {
  await click(byText('button', '¿Tenés un cupón?'));
  await typeInto(q('.bl-coupon__input'), code);
  await click(byText('.bl-coupon button', 'Aplicar'));
  await tick(5);
}

test('cupón: sin plan elegido pide elegir uno primero y no consulta nada', async () => {
  const { calls } = await mountPlans({});
  await applyCode('REGEN-AAAA-BBBB');
  assert.match(text(), /Elegí primero un plan/);
  assert.equal(calls.find((c) => c.path === '/coupons/validate'), undefined);
});

test('cupón: muestra el precio con descuento y paga con el código', async () => {
  const { calls, redirected } = await mountPlans({
    '/coupons/validate': { status: 200, body: CORE_OFFER },
    '/checkout': { status: 201, body: { kind: 'subscription', checkoutUrl: 'https://mp.test/pre-9', subscriptionId: 's9' } },
  });
  await click(byText('.bl-card button', 'Elegir'));
  await applyCode('regen-aaaa-bbbb');

  assert.deepEqual(calls.find((c) => c.path === '/coupons/validate').body, { planKey: 'core', code: 'regen-aaaa-bbbb' });
  assert.match(q('.bl-coupon__ok').textContent, /20% de descuento/);
  assert.match(q('.bl-coupon__ok').textContent, /Pagás \$47\.999 por mes durante 3 meses y después \$59\.999 por mes/);
  assert.match(q('.bl-pay .pf-submit').textContent, /Suscribirme por \$47\.999 al mes/);

  await click(q('.bl-pay input[type="checkbox"]'));
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.deepEqual(calls.find((c) => c.path === '/checkout').body, { planKey: 'core', termsVersion: '2026-10-v1-borrador', couponCode: 'regen-aaaa-bbbb' });
  assert.equal(redirected(), 'https://mp.test/pre-9');
});

test('cupón inválido: muestra el motivo y se puede probar otro', async () => {
  await mountPlans({ '/coupons/validate': { status: 409, body: { valid: false, code: 'COUPON_USED', error: 'Este cupón ya fue usado.' } } });
  await click(byText('.bl-card button', 'Elegir'));
  await applyCode('REGEN-USAD-OOOO');
  assert.match(q('.bl-coupon .pf-error').textContent, /ya fue usado/);
  assert.equal(q('.bl-coupon__ok'), null);
  assert.ok(q('.bl-coupon__input')); // el campo sigue ahí para probar otro
  assert.match(q('.bl-pay .pf-submit').textContent, /Suscribirme por \$59\.999 al mes/); // precio completo
});

test('cupón: se puede quitar y el precio vuelve al completo', async () => {
  const { calls } = await mountPlans({
    '/coupons/validate': { status: 200, body: CORE_OFFER },
    '/checkout': { status: 201, body: { kind: 'subscription', checkoutUrl: 'https://mp.test/x', subscriptionId: 's1' } },
  });
  await click(byText('.bl-card button', 'Elegir'));
  await applyCode('REGEN-AAAA-BBBB');
  await click(byText('.bl-coupon button', 'Quitar cupón'));
  assert.equal(q('.bl-coupon__ok'), null);
  assert.match(q('.bl-pay .pf-submit').textContent, /Suscribirme por \$59\.999 al mes/);
  await click(q('.bl-pay input[type="checkbox"]'));
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.equal('couponCode' in calls.find((c) => c.path === '/checkout').body, false);
});

test('cupón: al cambiar de plan se vuelve a verificar y, si no aplica, se saca con el motivo', async () => {
  let n = 0;
  await mountPlans({
    '/coupons/validate': () => (++n === 1
      ? { status: 200, body: CORE_OFFER }
      : { status: 400, body: { valid: false, code: 'COUPON_WRONG_PLAN', error: 'Este cupón no se puede usar en este plan.' } }),
  });
  await click(byText('.bl-card button', 'Elegir'));        // Core
  await applyCode('REGEN-AAAA-BBBB');
  assert.ok(q('.bl-coupon__ok'));
  await click(q('.bl-extra .bl-card button'));              // cambia a Diagnóstico
  await tick(5);
  assert.equal(q('.bl-coupon__ok'), null);
  assert.match(q('.bl-coupon .pf-error').textContent, /no se puede usar en este plan/);
  assert.match(q('.bl-pay .pf-submit').textContent, /Pagar \$299\.999/);
});

test('cupón en el Diagnóstico: muestra el monto con descuento', async () => {
  await mountPlans({
    '/coupons/validate': { status: 200, body: { valid: true, planKey: 'diagnostico', percentOff: 50, months: null, listPriceArs: 299999, finalPriceArs: 150000, free: false } },
  });
  await click(q('.bl-extra .bl-card button'));
  await applyCode('REGEN-AAAA-BBBB');
  assert.match(q('.bl-coupon__ok').textContent, /Pagás \$150\.000 en lugar de \$299\.999/);
  assert.match(q('.bl-pay .pf-submit').textContent, /Pagar \$150\.000/);
});

test('cupón gratis: no se va a Mercado Pago; vuelve por la pantalla de confirmación', async () => {
  const { calls, redirected } = await mountPlans({
    '/coupons/validate': { status: 200, body: { valid: true, planKey: 'core', percentOff: 100, months: 2, listPriceArs: 59999, finalPriceArs: 0, free: true } },
    '/checkout': { status: 201, body: { kind: 'subscription', subscriptionId: 'sFree', free: true, accessMonths: 2 } },
  });
  await click(byText('.bl-card button', 'Elegir'));
  await applyCode('REGEN-FREE-0000');
  assert.match(q('.bl-coupon__ok').textContent, /acceso sin costo/);
  assert.match(q('.bl-coupon__ok').textContent, /Tenés 2 meses de acceso sin costo/);
  assert.match(q('.bl-pay .pf-submit').textContent, /Activar sin costo/);

  await click(q('.bl-pay input[type="checkbox"]'));
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.equal(calls.find((c) => c.path === '/checkout').body.couponCode, 'REGEN-FREE-0000');
  assert.equal(redirected(), '/?pago=suscripcion&ref=sFree');
});

test('cupón: si el checkout lo rechaza (alguien lo usó antes), se saca y se explica', async () => {
  await mountPlans({
    '/coupons/validate': { status: 200, body: CORE_OFFER },
    '/checkout': { status: 409, body: { code: 'COUPON_USED', error: 'Este cupón ya fue usado.' } },
  });
  await click(byText('.bl-card button', 'Elegir'));
  await applyCode('REGEN-AAAA-BBBB');
  await click(q('.bl-pay input[type="checkbox"]'));
  await click(q('.bl-pay .pf-submit'));
  await tick(5);
  assert.match(q('.bl-pay .pf-error').textContent, /ya fue usado/);
  assert.equal(q('.bl-coupon__ok'), null);
  assert.match(q('.bl-pay .pf-submit').textContent, /Suscribirme por \$59\.999 al mes/);
});

test('cupón: con pagos bloqueados (menor de 18) el campo no se puede usar', async () => {
  installFetch({ '/plans': { status: 200, body: { plans: PLANS } } });
  await mount(React.createElement(PlansScreen, { session, status: { profile: { birthDate: '2015-01-01' } }, billing: BILLING_OK }));
  assert.equal(byText('button', '¿Tenés un cupón?').disabled, true);
});

test('vuelta de un cupón gratis: una suscripción de cortesía cuenta como confirmada', async () => {
  goTo('?pago=suscripcion&ref=sFree');
  installFetch({ '/subscriptions/me': { status: 200, body: { subscription: { id: 'sFree', status: 'cortesia' } } } });
  await mount(React.createElement(PaymentReturn, { session }));
  await tick(5);
  assert.match(text(), /Tu suscripción está activa/);
});
