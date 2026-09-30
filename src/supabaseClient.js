// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falla rápido y claro en desarrollo si falta el .env, en vez de un
  // error críptico de supabase-js más adelante.
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — revisá el archivo .env en la raíz del proyecto.'
  );
}

export const supabase = createClient(url, anonKey);
