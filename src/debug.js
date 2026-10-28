// src/debug.js
//
// Logs de diagnóstico de la llamada de voz. En producción la consola queda limpia;
// para ver qué pasa en una llamada (VAD, respuestas, errores) se activan con
// ?debug en la URL o con localStorage.regen_debug = '1'.

export function isDebugEnabled() {
  try {
    if (new URLSearchParams(window.location.search).has('debug')) return true;
    return window.localStorage?.getItem('regen_debug') === '1';
  } catch {
    return false;
  }
}

export function debugLog(...args) {
  if (isDebugEnabled()) console.log('[REGEN realtime]', ...args);
}
