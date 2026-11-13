// src/salesLink.js
//
// Link de suscripción que manda el agente comercial de WhatsApp:
//   https://app.regen.ar/?plan=activo&lead=<ref>    (o plan=core)
// Igual que la invitación: se guarda en el dispositivo para que sobreviva al registro y a la
// confirmación del email, y se borra cuando la suscripción queda confirmada. El `lead` no es un
// dato personal: es una referencia opaca que el Worker usa para vincular la ficha comercial.

const KEY = 'regen_sales_link';
const LEAD_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PLANS = ['core', 'activo'];

export function parseSalesLink(search) {
  const p = new URLSearchParams(search || '');
  if (p.get('invitacion')) return null; // es una invitación, no un link de venta
  const plan = p.get('plan');
  const lead = String(p.get('lead') || '').trim();
  if (!PLANS.includes(plan) || !LEAD_RE.test(lead)) return null;
  return { plan, lead };
}

export function captureSalesLinkFromUrl(loc = window.location, hist = window.history) {
  const link = parseSalesLink(loc.search);
  if (!link) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    /* sin almacenamiento: igual se usa en esta visita */
  }
  try {
    const p = new URLSearchParams(loc.search);
    p.delete('lead');
    p.delete('plan');
    const qs = p.toString();
    hist.replaceState(null, '', loc.pathname + (qs ? `?${qs}` : '') + loc.hash);
  } catch {
    /* ignorar */
  }
  return link;
}

export function readSalesLink() {
  try {
    const link = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!link || !PLANS.includes(link.plan) || !LEAD_RE.test(link.lead || '')) return null;
    return { plan: link.plan, lead: link.lead };
  } catch {
    return null;
  }
}

export function clearSalesLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}
