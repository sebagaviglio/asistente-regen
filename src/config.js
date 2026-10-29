// src/config.js
//
// Configuración por entorno. Se define al compilar (variables VITE_* del archivo .env,
// .env.staging o las que cargue Vercel); sin variables, la app apunta a producción.
//
//   VITE_WORKER_URL   dirección del Worker (backend). Producción por defecto.
//   VITE_APP_ENV      'production' (por defecto) o 'staging'. Fuera de producción la app muestra
//                     una cinta de «entorno de prueba» para que nadie la confunda con la real.
//
// Las claves de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) se leen en supabaseClient.js.

const PRODUCTION_WORKER_URL = 'https://regen-agente.sebagaviglio.workers.dev';

// Sin Vite (las pruebas de lógica pura corren directo en Node) no hay import.meta.env: valen los valores por defecto.
const env = import.meta.env || {};

export const WORKER_URL = String(env.VITE_WORKER_URL || PRODUCTION_WORKER_URL)
  .trim()
  .replace(/\/+$/, '');

export const APP_ENV = String(env.VITE_APP_ENV || 'production').trim().toLowerCase();

export const IS_PRODUCTION = APP_ENV === 'production';
