// src/swr.js
//
// Memoria de datos de la sesión: al volver a una pantalla se muestra al instante lo último que se
// bajó (por usuario) y se actualiza en segundo plano. Evita el «Cargando…» cada vez que se cambia
// de solapa. Vive solo en memoria: al cerrar la app arranca vacía.
const store = new Map();

export const cacheKey = (session, name) => `${session?.user?.id || 'anon'}|${name}`;
export const peek = (key) => store.get(key);
export const put = (key, value) => {
  store.set(key, value);
  return value;
};
export const clearCache = () => store.clear();
