// src/router.js
//
// Ruteo mínimo sobre la History API, sin librería (alcanza para las pocas pantallas de la app).
// Lo usan App, BillingGate y las pantallas de pagos en lugar de leer window.location suelto:
//
//  - Un solo lugar por donde entra una dirección, venga del navegador, de un botón o, en la app
//    nativa, de un link profundo (regen.ar/i/…, la vuelta de Mercado Pago): basta con llamar a navigate().
//  - Navegar no recarga la página, así que la sesión y el estado de la app se conservan.
//
// navigate() siempre avisa, aunque la dirección sea la misma: las pantallas vuelven a evaluar su
// estado (por ejemplo, una invitación que se acaba de borrar), como pasaba con la recarga completa.
import { useSyncExternalStore } from 'react';

const listeners = new Set();
const SERVER_LOCATION = { pathname: '/', search: '' };
let current = null;

function read() {
  return { pathname: window.location.pathname, search: window.location.search };
}

// Mismo objeto mientras la dirección no cambie (lo pide useSyncExternalStore). También detecta
// cambios hechos por fuera del router, como el replaceState que limpia la invitación al arrancar.
function snapshot() {
  const now = read();
  if (!current || current.pathname !== now.pathname || current.search !== now.search) current = now;
  return current;
}

function emit() {
  current = read();
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

/** { pathname, search } de la dirección actual; el componente se actualiza al navegar. */
export function useLocation() {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_LOCATION);
}

/** Va a una ruta de la app ('/planes', '/?pago=suscripcion&ref=…') sin recargar la página. */
export function navigate(to, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  emit();
}
