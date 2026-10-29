// src/deepLinks.js
//
// Links que abren la app desde afuera: la vuelta del login con Google/Apple por el navegador del
// sistema (ar.regen.app://auth-callback?code=…) y los links universales de app.regen.ar
// (invitaciones, vuelta de pago). Sin dependencias de Capacitor, para poder probarlo en Node.
import { NATIVE_AUTH_REDIRECT, APP_HOSTS } from './config.js';
import { captureInvitationFromUrl } from './invitation.js';

const AUTH_URL = new URL(NATIVE_AUTH_REDIRECT);

/** Qué es el link: { type: 'auth', code, error } · { type: 'route', path } · null si no es de la app. */
export function parseDeepLink(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return null;
  }

  if (u.protocol === AUTH_URL.protocol && u.host === AUTH_URL.host) {
    // Con el flujo PKCE el código vuelve en la query; un error de Google/Apple, en la query o en el fragmento.
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
    const error = u.searchParams.get('error_description') || u.searchParams.get('error') || hash.get('error_description') || hash.get('error') || null;
    return { type: 'auth', code: u.searchParams.get('code'), error };
  }

  if ((u.protocol === 'https:' || u.protocol === 'http:') && APP_HOSTS.includes(u.hostname)) {
    return { type: 'route', path: u.pathname + u.search };
  }
  return null;
}

/**
 * Hace lo que corresponde con un link. Las dependencias entran por parámetro (en la app real las pone native.js).
 *  - exchangeCode(code): canjea el código del login por la sesión.
 *  - closeBrowser(): cierra el navegador del sistema que quedó abierto.
 *  - navigate(path): lleva la pantalla a una ruta de la app.
 *  - onAuthError(message): avisa en el formulario de ingreso que el login falló.
 */
export async function handleDeepLink(raw, { exchangeCode, closeBrowser, navigate, onAuthError }) {
  const link = parseDeepLink(raw);
  if (!link) return 'ignored';

  if (link.type === 'auth') {
    await Promise.resolve(closeBrowser?.()).catch(() => {});
    if (link.error || !link.code) {
      onAuthError?.(link.error || 'No pudimos completar el ingreso. Probá de nuevo.');
      return 'auth-error';
    }
    const { error } = (await exchangeCode(link.code)) || {};
    if (error) {
      onAuthError?.(error.message || 'No pudimos completar el ingreso. Probá de nuevo.');
      return 'auth-error';
    }
    return 'auth-ok';
  }

  // Ruta de la app: si trae una invitación se guarda como siempre y se saca de la dirección.
  const [pathname, query = ''] = link.path.split('?');
  let cleaned = link.path;
  captureInvitationFromUrl(
    { search: query ? `?${query}` : '', pathname, hash: '' },
    { replaceState: (_state, _title, url) => { cleaned = url; } }
  );
  navigate(cleaned);
  return 'route';
}
