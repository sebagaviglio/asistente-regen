// Link de suscripción del agente de WhatsApp (sin React ni red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSalesLink } from '../src/salesLink.js';

test('link a Core o Activo con lead válido; cualquier otra cosa no es un link de venta', () => {
  assert.deepEqual(parseSalesLink('?plan=activo&lead=abcdEFGH1234'), { plan: 'activo', lead: 'abcdEFGH1234' });
  assert.deepEqual(parseSalesLink('?plan=core&lead=abcdEFGH1234'), { plan: 'core', lead: 'abcdEFGH1234' });
  assert.equal(parseSalesLink('?plan=activo'), null); // sin lead
  assert.equal(parseSalesLink('?plan=activo&lead=<script>'), null);
  assert.equal(parseSalesLink('?plan=elite&lead=abcdEFGH1234'), null);
  assert.equal(parseSalesLink('?plan=diagnostico&lead=abcdEFGH1234'), null);
  assert.equal(parseSalesLink('?pack=fundador&lead=abcdEFGH1234'), null);
  assert.equal(parseSalesLink('?invitacion=REGEN-AAAA-BBBB&plan=core&lead=abcdEFGH1234'), null);
});
