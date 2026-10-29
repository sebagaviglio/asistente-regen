// src/platform.js
//
// Dos puntos de contacto con el dispositivo que hoy resuelve el navegador y que la app
// nativa (Capacitor, Fase 2) reemplaza sin tocar el resto del código:
//
//  - authStorage: dónde se guarda la sesión de Supabase. En la web es localStorage (la misma
//    clave de siempre, así las sesiones abiertas siguen abiertas). En iOS y Android conviene
//    el almacenamiento seguro del sistema: la app llama a setAuthStorageBackend() ANTES de
//    cargar supabaseClient.js (el cliente de login lee la sesión apenas se crea).
//  - openExternal: abre una dirección fuera de la app (el pago de Mercado Pago, por ejemplo).
//    En la web navega la misma pestaña; en la app se abre en el navegador del sistema.

// Respaldo si el navegador no deja usar localStorage (modo privado, almacenamiento lleno):
// la sesión dura mientras la página esté abierta, igual que hacía el cliente de login.
const memory = new Map();

const localBackend = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

let backend = localBackend;

/**
 * Cambia dónde se guarda la sesión. El objeto puede ser síncrono o asíncrono:
 * { getItem(key), setItem(key, value), removeItem(key) }.
 */
export function setAuthStorageBackend(next) {
  backend = next || localBackend;
}

// Forma que espera el cliente de login (ver SupportedStorage de @supabase/auth-js).
// La memoria solo entra cuando el almacenamiento falla: si no, mandaría el almacenamiento
// (por ejemplo, una sesión cerrada desde otra pestaña no puede «resucitar» desde acá).
export const authStorage = {
  async getItem(key) {
    try {
      return (await backend.getItem(key)) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    try {
      await backend.setItem(key, value);
      memory.delete(key);
    } catch {
      memory.set(key, value);
    }
  },
  async removeItem(key) {
    memory.delete(key);
    try {
      await backend.removeItem(key);
    } catch {
      /* ya no está en memoria */
    }
  },
};

let externalOpener = (url) => window.location.assign(url);

/** La app nativa registra acá cómo abrir una dirección en el navegador del sistema. */
export function setExternalOpener(fn) {
  externalOpener = fn || ((url) => window.location.assign(url));
}

export function openExternal(url) {
  return externalOpener(url);
}
