// src/invitation.js
//
// Invitación que llega desde el link de la landing (regen.ar/i/<token>):
//   https://app.regen.ar/?invitacion=REGEN-XXXX-XXXX&plan=core|activo|elite
// Se guarda en el dispositivo para que sobreviva al registro / confirmación de email, y se borra cuando
// se canjea o la persona la descarta. El código NO se valida acá: lo valida el Worker.

const KEY = 'regen_invitation';
const PLANS = ['core', 'activo', 'elite'];
const CODE_RE = /^REGEN-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function parseInvitation(search) {
  const p = new URLSearchParams(search || '');
  const code = String(p.get('invitacion') || '').trim().toUpperCase();
  const plan = String(p.get('plan') || '').trim().toLowerCase();
  if (!CODE_RE.test(code) || !PLANS.includes(plan)) return null;
  return { code, plan };
}

export function captureInvitationFromUrl(loc = window.location, hist = window.history) {
  const inv = parseInvitation(loc.search);
  if (!inv) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify(inv));
  } catch {
    /* sin almacenamiento: igual se usa en esta visita */
  }
  try {
    const p = new URLSearchParams(loc.search);
    p.delete('invitacion');
    p.delete('plan');
    const qs = p.toString();
    hist.replaceState(null, '', loc.pathname + (qs ? `?${qs}` : '') + loc.hash);
  } catch {
    /* ignorar */
  }
  return inv;
}

export function readInvitation() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const inv = JSON.parse(raw);
    return CODE_RE.test(inv?.code) && PLANS.includes(inv?.plan) ? inv : null;
  } catch {
    return null;
  }
}

export function clearInvitation() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}

export function inviteErrorMessage(data) {
  switch (data?.code) {
    case 'INVITE_USED': return 'Esta invitación ya fue usada.';
    case 'INVITE_EXPIRED': return 'Esta invitación venció. Escribile al equipo de REGEN para reactivarla.';
    case 'INVITE_TOO_MANY_ATTEMPTS': return 'Probaste demasiados códigos. Esperá un rato y volvé a intentar.';
    case 'MINOR': return 'Por ahora el servicio es solo para mayores de 18 años.';
    default: return data?.error || 'No pudimos activar tu invitación. Probá de nuevo.';
  }
}
