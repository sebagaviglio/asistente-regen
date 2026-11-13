// src/salesLink.js
//
// Link de compra que manda el agente comercial de WhatsApp:
//   https://app.regen.ar/?pack=fundador&lead=<ref>        → Pack Fundador
//   https://app.regen.ar/?plan=diagnostico&lead=<ref>     → Diagnóstico inicial
// Igual que la invitación: se guarda en el dispositivo para que sobreviva al registro y a la
// confirmación del email, y se borra cuando el pago queda confirmado. El `lead` no es un dato
// personal: es una referencia opaca que el Worker usa para vincular la ficha comercial.

const KEY = 'regen_sales_link';
const LEAD_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function parseSalesLink(search) {
  const p = new URLSearchParams(search || '');
  const lead = String(p.get('lead') || '').trim();
  const offer = p.get('pack') === 'fundador' ? 'pack' : p.get('plan') === 'diagnostico' && lead ? 'diagnostico' : null;
  if (!offer) return null;
  return { offer, lead: LEAD_RE.test(lead) ? lead : null };
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
    if (link.offer === 'pack') p.delete('pack');
    else p.delete('plan');
    const qs = p.toString();
    hist.replaceState(null, '', loc.pathname + (qs ? `?${qs}` : '') + loc.hash);
  } catch {
    /* ignorar */
  }
  return link;
}

export function readSalesLink() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const link = JSON.parse(raw);
    if (!['pack', 'diagnostico'].includes(link?.offer)) return null;
    return { offer: link.offer, lead: LEAD_RE.test(link.lead || '') ? link.lead : null };
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

// Clave del plan que el link preselecciona en la pantalla de planes.
export function salesLinkPlanKey(link) {
  if (!link) return null;
  return link.offer === 'pack' ? 'pack_fundador' : 'diagnostico';
}
