// src/billing.js
//
// Lógica de planes y pagos del lado de la app. Todo lo que decide "qué pantalla
// se muestra" y "cómo se formatea un precio" vive acá, sin React, para poder
// probarlo (ver test/billing.test.mjs).

import { makeApi, WORKER_URL } from './api.js';

// ── Llamadas al Worker ───────────────────────────────────────────────────
export async function fetchPlans() {
  try {
    const res = await fetch(`${WORKER_URL}/plans`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.plans) ? data.plans : null;
  } catch {
    return null;
  }
}

// null = no se pudo consultar (por ejemplo, el Worker todavía no tiene la ruta).
export async function fetchBilling(accessToken) {
  const { ok, data } = await makeApi(accessToken).post('/subscriptions/me');
  return ok && data ? data : null;
}

// Cupón: cuánto queda el precio de ese plan con ese código. No reserva nada.
// Devuelve { ok: true, offer } o { ok: false, message, code }.
export async function validateCoupon(accessToken, planKey, code) {
  const { ok, data } = await makeApi(accessToken).post('/coupons/validate', { planKey, code });
  if (ok && data?.valid) return { ok: true, offer: data };
  return { ok: false, message: data?.error || 'No pudimos verificar el cupón. Probá de nuevo.', code: data?.code || null };
}

// ── Formatos ─────────────────────────────────────────────────────────────
export function formatArs(amount) {
  if (typeof amount !== 'number') return '';
  return `$${new Intl.NumberFormat('es-AR', { useGrouping: 'always' }).format(amount)}`;
}

function everyMonthsText(n) {
  if (n === 1) return 'cada mes';
  if (n === 3) return 'cada trimestre';
  if (n === 6) return 'cada 6 meses';
  return `cada ${n} meses`;
}

// "1 al ingresar y 1 cada 6 meses". Describe lo que incluye; no promete resultados.
export function validationsText(plan) {
  const { validationsInitial: first = 0, validationsRecurring: more = 0, validationsEveryMonths: every = 0 } = plan;
  if (!first && !more) return null;
  const parts = [];
  if (first) parts.push(`${first} al ingresar`);
  if (more && every) parts.push(`${more} ${everyMonthsText(every)}`);
  return `Validación médica de tu ficha: ${parts.join(' y ')}`;
}

// Lo que incluye cada plan (según la planilla de precios de REGEN). Los topes salen del Worker.
const PLAN_COPY = {
  diagnostico: {
    title: 'Diagnóstico inicial',
    note: 'Pago único',
    items: ['Análisis de biomarcadores con extracción a domicilio', 'Lectura de resultados con un médico'],
  },
  core: {
    title: 'Core',
    note: 'por mes',
    items: ['Seguimiento con un coach humano', 'Asistente de REGEN entre consultas'],
  },
  activo: {
    title: 'Activo',
    note: 'por mes',
    items: ['Todo lo de Core', 'Panel de análisis semestral con extracción a domicilio'],
  },
  elite: {
    title: 'Elite',
    note: 'Cupos limitados',
    items: [
      'Médico de longevidad dedicado',
      'Coordinación de estudios en cualquier ciudad',
      'Protocolo anual',
      'Acceso directo al equipo',
    ],
  },
};

export function planView(plan) {
  const copy = PLAN_COPY[plan.key] || { title: plan.name, note: '', items: [] };
  const items = [...copy.items];
  if (plan.showPrice && plan.voiceMinutesMonth) items.push(`${plan.voiceMinutesMonth} minutos de voz por mes`);
  if (plan.showPrice) {
    const v = validationsText(plan);
    if (v) items.push(v);
  }
  return { key: plan.key, title: copy.title, note: copy.note, items, price: plan.showPrice ? formatArs(plan.priceArs) : null };
}

// ── Cupones ──────────────────────────────────────────────────────────────
// Texto claro de lo que cambia con el cupón. `kind`: 'one_time' (Diagnóstico) | 'subscription'.
export function couponView(offer, kind) {
  if (!offer) return null;
  const { percentOff, months, listPriceArs, finalPriceArs, free } = offer;
  const list = formatArs(listPriceArs);
  const final = formatArs(finalPriceArs);

  if (kind === 'one_time') {
    return free
      ? { headline: 'Cupón aplicado: tu Diagnóstico inicial queda sin costo.', detail: 'No hace falta pagar nada.', payLabel: 'Activar sin costo', free: true }
      : { headline: `Cupón aplicado: ${percentOff}% de descuento.`, detail: `Pagás ${final} en lugar de ${list}.`, payLabel: `Pagar ${final}`, free: false };
  }

  const n = months || 1;
  if (free) {
    return {
      headline: 'Cupón aplicado: acceso sin costo.',
      detail: `${n === 1 ? 'Tenés 1 mes' : `Tenés ${n} meses`} de acceso sin costo. No hace falta cargar ningún medio de pago.`,
      payLabel: 'Activar sin costo',
      free: true,
    };
  }
  return {
    headline: `Cupón aplicado: ${percentOff}% de descuento.`,
    detail:
      n === 1
        ? `Pagás ${final} el primer mes y después ${list} por mes.`
        : `Pagás ${final} por mes durante ${n} meses y después ${list} por mes.`,
    payLabel: `Suscribirme por ${final} al mes`,
    free: false,
  };
}

// ── Mensajes de error del checkout ───────────────────────────────────────
const CHECKOUT_ERRORS = {
  MINOR: 'Por ahora la suscripción es solo para mayores de 18 años.',
  PROFILE_INCOMPLETE: 'Completá tu fecha de nacimiento en “Mi perfil” antes de contratar.',
  CONSENT_REQUIRED: 'Necesitamos tu consentimiento antes de contratar.',
  TERMS_VERSION_MISMATCH: 'Los Términos y Condiciones cambiaron. Recargá la página para leer la versión actual.',
  ALREADY_SUBSCRIBED: 'Ya tenés una suscripción. Si hay un problema con el cobro, revisá tu medio de pago en Mercado Pago.',
  PAYMENTS_OFF: 'Los pagos todavía no están habilitados.',
  USE_ELITE_REQUEST: 'El plan Elite se solicita con el botón “Quiero ser Elite”.',
};
export function checkoutErrorMessage(data) {
  return CHECKOUT_ERRORS[data?.code] || data?.error || 'No pudimos abrir el pago. Probá de nuevo en unos minutos.';
}

// ── Qué pantalla se muestra ──────────────────────────────────────────────
// Reglas (decididas con Seba):
//  - Al volver de Mercado Pago (?pago=...) se muestra la pantalla de confirmación.
//  - /planes siempre muestra los planes (así se prueba en modo "test").
//  - El acceso se BLOQUEA solo con el Worker en modo "live" y una suscripción sin acceso.
//    En "off" y en "test" nadie queda afuera.
//  - Si no se pudo consultar el estado (billing === null) se deja pasar: el corte real lo
//    hace el servidor (Fase 3); esta pantalla es para guiar, no para proteger.
//  - "Mi ficha" nunca se bloquea: quien no pagó sigue viendo su ficha.
export function decideGate({ billing, pathname = '/', search = '' }) {
  if (pathname.startsWith('/mi-ficha')) return 'children';
  if (billing === undefined) return 'loading';
  if (new URLSearchParams(search).get('pago')) return 'return';
  if (pathname.startsWith('/planes')) return 'plans';
  if (billing === null) return 'children';
  const e = billing.entitlement;
  if (billing.paymentsMode === 'live' && e && e.enforced && !e.allowed) return 'plans';
  return 'children';
}

// ¿Terminó el pago que estamos esperando? kind: 'suscripcion' | 'diagnostico'.
export function isPaymentConfirmed(billing, kind, ref) {
  if (!billing) return false;
  if (kind === 'suscripcion') {
    const s = billing.subscription;
    // 'cortesia' es lo que queda con un cupón de acceso sin costo.
    return !!s && (s.status === 'activa' || s.status === 'cortesia') && (!ref || s.id === ref);
  }
  if (kind === 'diagnostico') {
    const d = billing.diagnostico;
    return !!d && d.status === 'pagada' && (!ref || d.orderId === ref);
  }
  return false;
}
