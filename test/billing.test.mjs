// Pruebas de la lógica de planes y pagos de la app (sin React ni red).
// Correr con:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideGate, isPaymentConfirmed, formatArs, validationsText, planView, checkoutErrorMessage, couponView } from '../src/billing.js';
import { TERMS_VERSION, TERMS_SECTIONS } from '../src/termsText.js';

const live = (allowed, extra = {}) => ({
  paymentsMode: 'live',
  entitlement: { enforced: true, allowed, reason: allowed ? 'active' : 'no_subscription' },
  subscription: null,
  ...extra,
});

// ── Qué pantalla se muestra ──────────────────────────────────────────────
test('mientras carga el estado, se muestra "cargando"', () => {
  assert.equal(decideGate({ billing: undefined, pathname: '/' }), 'loading');
});

test('"Mi ficha" nunca se bloquea, ni cargando ni sin acceso', () => {
  assert.equal(decideGate({ billing: undefined, pathname: '/mi-ficha' }), 'children');
  assert.equal(decideGate({ billing: live(false), pathname: '/mi-ficha' }), 'children');
});

test('sin acceso y en modo "live": manda a elegir plan', () => {
  assert.equal(decideGate({ billing: live(false), pathname: '/' }), 'plans');
});

test('con acceso en modo "live": entra a la entrevista', () => {
  assert.equal(decideGate({ billing: live(true), pathname: '/' }), 'children');
});

test('en modo "test" y "off" NADIE queda bloqueado, aunque no tenga suscripción', () => {
  for (const mode of ['test', 'off']) {
    const billing = { paymentsMode: mode, entitlement: { enforced: mode !== 'off', allowed: false } };
    assert.equal(decideGate({ billing, pathname: '/' }), 'children', mode);
  }
});

test('si no se pudo consultar el estado (Worker viejo o sin red), deja pasar', () => {
  assert.equal(decideGate({ billing: null, pathname: '/' }), 'children');
});

test('/planes siempre muestra los planes, también en modo "test"', () => {
  assert.equal(decideGate({ billing: { paymentsMode: 'test' }, pathname: '/planes' }), 'plans');
  assert.equal(decideGate({ billing: null, pathname: '/planes' }), 'plans');
});

test('al volver de Mercado Pago se muestra la confirmación, aunque el estado no se haya podido leer', () => {
  assert.equal(decideGate({ billing: live(false), pathname: '/', search: '?pago=suscripcion&ref=abc' }), 'return');
  assert.equal(decideGate({ billing: null, pathname: '/', search: '?pago=diagnostico&ref=abc&estado=ok' }), 'return');
});

test('un parámetro ?pago= vacío no dispara la pantalla de confirmación', () => {
  assert.equal(decideGate({ billing: live(true), pathname: '/', search: '?pago=' }), 'children');
});

// ── Confirmación del pago: solo cuenta lo que dice el Worker ─────────────
test('suscripción confirmada solo si está activa y es la que se pagó', () => {
  const b = (status, id = 's1') => ({ subscription: { id, status } });
  assert.equal(isPaymentConfirmed(b('activa'), 'suscripcion', 's1'), true);
  assert.equal(isPaymentConfirmed(b('pendiente'), 'suscripcion', 's1'), false);
  assert.equal(isPaymentConfirmed(b('activa', 'otra'), 'suscripcion', 's1'), false);
  assert.equal(isPaymentConfirmed(null, 'suscripcion', 's1'), false);
});

test('Diagnóstico confirmado solo si la orden está pagada', () => {
  const b = (status, orderId = 'o1') => ({ diagnostico: { orderId, status } });
  assert.equal(isPaymentConfirmed(b('pagada'), 'diagnostico', 'o1'), true);
  assert.equal(isPaymentConfirmed(b('pendiente'), 'diagnostico', 'o1'), false);
  assert.equal(isPaymentConfirmed(b('pagada', 'o2'), 'diagnostico', 'o1'), false);
  assert.equal(isPaymentConfirmed(b('pagada'), 'otra-cosa', 'o1'), false);
});

// ── Formatos y textos ────────────────────────────────────────────────────
test('precios en pesos argentinos', () => {
  assert.equal(formatArs(59999), '$59.999');
  assert.equal(formatArs(139999), '$139.999');
  assert.equal(formatArs(299999), '$299.999');
  assert.equal(formatArs(null), '');
});

test('texto de validaciones médicas', () => {
  assert.equal(
    validationsText({ validationsInitial: 1, validationsRecurring: 1, validationsEveryMonths: 6 }),
    'Validación médica de tu ficha: 1 al ingresar y 1 cada 6 meses'
  );
  assert.equal(
    validationsText({ validationsInitial: 1, validationsRecurring: 1, validationsEveryMonths: 3 }),
    'Validación médica de tu ficha: 1 al ingresar y 1 cada trimestre'
  );
  assert.equal(validationsText({ validationsInitial: 0, validationsRecurring: 0, validationsEveryMonths: 0 }), null);
});

test('Elite no muestra precio ni topes; Core muestra precio y topes del Worker', () => {
  const elite = planView({ key: 'elite', name: 'Elite', kind: 'custom', showPrice: false, priceArs: null });
  assert.equal(elite.price, null);
  assert.ok(elite.items.every((i) => !/minutos|\$/.test(i)));
  assert.equal(elite.note, 'Cupos limitados');

  const core = planView({
    key: 'core', name: 'Core', kind: 'subscription', showPrice: true, priceArs: 59999,
    voiceMinutesMonth: 20, validationsInitial: 1, validationsRecurring: 1, validationsEveryMonths: 6,
  });
  assert.equal(core.price, '$59.999');
  assert.ok(core.items.includes('20 minutos de voz por mes'));
});

test('mensajes de error del pago', () => {
  assert.match(checkoutErrorMessage({ code: 'MINOR' }), /mayores de 18/);
  assert.match(checkoutErrorMessage({ code: 'TERMS_VERSION_MISMATCH' }), /Recargá/);
  assert.match(checkoutErrorMessage({ code: 'MP_ERROR', error: 'No pudimos abrir el pago.' }), /No pudimos abrir el pago/);
  assert.match(checkoutErrorMessage(null), /No pudimos abrir el pago/);
});

test('los textos de planes no prometen resultados', () => {
  const all = ['core', 'activo', 'elite', 'diagnostico']
    .map((key) => planView({ key, name: key, kind: 'x', showPrice: key !== 'elite', priceArs: 1 }).items.join(' '))
    .join(' ');
  assert.doesNotMatch(all, /garantiz|cura|rejuvenec|revert|alarg|adelgaz/i);
});

// ── Términos y Condiciones ───────────────────────────────────────────────
test('versión de T&C igual a la del Worker', async () => {
  const { readFileSync } = await import('node:fs');
  // Si este archivo no está (la app y el Worker viven en repositorios separados), solo se avisa.
  const candidates = ['../../regent-agente/worker/src/terms.js', '../regen-worker/src/terms.js'];
  for (const rel of candidates) {
    try {
      const txt = readFileSync(new URL(rel, import.meta.url), 'utf8');
      assert.match(txt, new RegExp(`TERMS_VERSION = "${TERMS_VERSION}"`));
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  console.warn('(aviso) no se encontró src/terms.js del Worker para comparar la versión de T&C');
});

test('los T&C tienen sus 6 secciones y todos los párrafos numerados', () => {
  assert.equal(TERMS_SECTIONS.length, 6);
  for (const s of TERMS_SECTIONS) {
    assert.ok(s.paragraphs.length > 0);
    for (const p of s.paragraphs) assert.match(p, /^\d+\.\d+\./);
  }
});

// ── Cupones ──────────────────────────────────────────────────────────────
test('cupón de suscripción con descuento: dice cuánto y por cuánto tiempo', () => {
  const offer = { percentOff: 20, months: 3, listPriceArs: 59999, finalPriceArs: 47999, free: false };
  const v = couponView(offer, 'subscription');
  assert.equal(v.headline, 'Cupón aplicado: 20% de descuento.');
  assert.equal(v.detail, 'Pagás $47.999 por mes durante 3 meses y después $59.999 por mes.');
  assert.equal(v.payLabel, 'Suscribirme por $47.999 al mes');
  assert.equal(v.free, false);
  assert.match(couponView({ ...offer, months: 1 }, 'subscription').detail, /el primer mes y después \$59\.999 por mes/);
});

test('cupón del Diagnóstico: un solo pago, sin meses', () => {
  const v = couponView({ percentOff: 50, months: null, listPriceArs: 299999, finalPriceArs: 150000, free: false }, 'one_time');
  assert.equal(v.detail, 'Pagás $150.000 en lugar de $299.999.');
  assert.equal(v.payLabel, 'Pagar $150.000');
});

test('cupón gratis: no se paga nada y se explica', () => {
  const sub = couponView({ percentOff: 100, months: 2, listPriceArs: 59999, finalPriceArs: 0, free: true }, 'subscription');
  assert.equal(sub.free, true);
  assert.match(sub.detail, /2 meses de acceso sin costo/);
  assert.match(sub.detail, /No hace falta cargar ningún medio de pago/);
  assert.equal(sub.payLabel, 'Activar sin costo');
  assert.match(couponView({ percentOff: 100, months: 1, listPriceArs: 59999, finalPriceArs: 0, free: true }, 'subscription').detail, /1 mes de acceso/);
  assert.match(couponView({ percentOff: 100, months: null, listPriceArs: 299999, finalPriceArs: 0, free: true }, 'one_time').headline, /sin costo/);
  assert.equal(couponView(null, 'subscription'), null);
});

test('una suscripción de cortesía (cupón gratis) cuenta como confirmada', () => {
  assert.equal(isPaymentConfirmed({ subscription: { id: 's1', status: 'cortesia' } }, 'suscripcion', 's1'), true);
  assert.equal(isPaymentConfirmed({ subscription: { id: 's2', status: 'cortesia' } }, 'suscripcion', 's1'), false);
});
