import test from "node:test";
import assert from "node:assert/strict";
import { parseInvitation, inviteErrorMessage } from "../src/invitation.js";

test("parsea un link de invitación válido", () => {
  assert.deepEqual(parseInvitation("?invitacion=regen-k7m2-qx4p&plan=Core"), { code: "REGEN-K7M2-QX4P", plan: "core" });
  assert.deepEqual(parseInvitation("?plan=elite&invitacion=REGEN-AAAA-2222"), { code: "REGEN-AAAA-2222", plan: "elite" });
});

test("ignora códigos o planes inválidos", () => {
  assert.equal(parseInvitation("?invitacion=hola&plan=core"), null);
  assert.equal(parseInvitation("?invitacion=REGEN-K7M2-QX4P&plan=diagnostico"), null);
  assert.equal(parseInvitation("?invitacion=REGEN-K7M2-QX4P"), null);
  assert.equal(parseInvitation(""), null);
  assert.equal(parseInvitation("?invitacion=<script>&plan=core"), null);
});

test("mensajes de error en castellano", () => {
  assert.match(inviteErrorMessage({ code: "INVITE_USED" }), /ya fue usada/);
  assert.match(inviteErrorMessage({ code: "INVITE_EXPIRED" }), /venció/);
  assert.match(inviteErrorMessage({}), /No pudimos/);
});
