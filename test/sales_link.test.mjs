// Link de compra del agente de WhatsApp y lógica del Pack Fundador (sin React ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSalesLink, salesLinkPlanKey } from '../src/salesLink.js';
import { isPaymentConfirmed, packStep2, planView, checkoutErrorMessage, formatDateAR } from '../src/billing.js';

test('link del Pack y del Diagnóstico; el lead es opcional en el Pack y se valida', () => {
  assert.deepEqual(parseSalesLink('?pack=fundador&lead=abcdEFGH1234'), { offer: 'pack', lead: 'abcdEFGH1234' });
  assert.deepEqual(parseSalesLink('?pack=fundador'), { offer: 'pack', lead: null });
  assert.deepEqual(parseSalesLink('?pack=fundador&lead=<script>'), { offer: 'pack', lead: null });
  assert.deepEqual(parseSalesLink('?plan=diagnostico&lead=abcdEFGH1234'), { offer: 'diagnostico', lead: 'abcdEFGH1234' });
  assert.equal(parseSalesLink('?plan=diagnostico'), null); // sin lead no es un link de venta
  assert.equal(parseSalesLink('?invitacion=REGEN-AAAA-BBBB&plan=core'), null);
  assert.equal(salesLinkPlanKey({ offer: 'pack' }), 'pack_fundador');
  assert.equal(salesLinkPlanKey({ offer: 'diagnostico' }), 'diagnostico');
});

test('Pack confirmado solo con la orden pagada; paso 2 pendiente hasta autorizar Activo', () => {
  const billing = { pack: { orderId: 'o1', status: 'pagada', activoPaso2: 'pendiente', mesIncluidoHasta: '2026-12-15 13:00:00' } };
  assert.equal(isPaymentConfirmed(billing, 'pack', 'o1'), true);
  assert.equal(isPaymentConfirmed({ pack: { orderId: 'o1', status: 'pendiente' } }, 'pack', 'o1'), false);
  assert.deepEqual(packStep2(billing), { until: '2026-12-15 13:00:00' });
  assert.equal(packStep2({ pack: { status: 'pagada', activoPaso2: 'listo' } }), null);
  assert.equal(formatDateAR('2026-12-15 13:00:00'), '15/12/2026');
});

test('el Pack describe lo que incluye, sin prometer resultados', () => {
  const v = planView({ key: 'pack_fundador', name: 'Pack Fundador', kind: 'one_time', showPrice: true, priceArs: 379999 });
  assert.equal(v.price, '$379.999');
  assert.match(v.items.join(' '), /Primer mes de Activo/);
  assert.doesNotMatch(v.items.join(' '), /garantiz|cura|rejuvenec|revert|alarg|adelgaz/i);
  assert.match(checkoutErrorMessage({ code: 'PACK_CLOSED' }), /cupos/);
});
