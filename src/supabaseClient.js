// src/supabaseClient.js
//
// Solo el cliente de login de Supabase (@supabase/auth-js). La app no usa la base,
// los archivos ni el tiempo real de Supabase (eso pasa por el Worker), así que no
// cargamos @supabase/supabase-js entero: son ~25 KB menos en cada visita.
//
// Se configura igual que lo hace createClient() de supabase-js, para que todo siga
// como antes: misma clave en el navegador (sb-<proyecto>-auth-token, así las sesiones
// abiertas no se cierran), mismos encabezados, flujo implícito, refresco automático
// del token y lectura de la sesión que vuelve en la URL después de Google.
// test/auth_client.test.mjs lo verifica.
import { AuthClient } from '@supabase/auth-js';
import { authStorage } from './platform.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — revisá el archivo .env en la raíz del proyecto.'
  );
}

const base = new URL(url.trim().endsWith('/') ? url.trim() : `${url.trim()}/`);

const auth = new AuthClient({
  url: new URL('auth/v1', base).href,
  headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  autoRefreshToken: true,
  persistSession: true,
  storage: authStorage, // localStorage en la web; almacenamiento seguro del sistema en la app (platform.js)
  detectSessionInUrl: true,
  flowType: 'implicit',
});

// Misma forma que antes (supabase.auth.…): el resto de la app no cambia.
export const supabase = { auth };
