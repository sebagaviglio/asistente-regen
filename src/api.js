// src/api.js
//
// Cliente mínimo del Worker de REGEN. Todos los endpoints nuevos son POST con
// JSON y el access token de Supabase del paciente.

export const WORKER_URL = 'https://regen-agente.sebagaviglio.workers.dev';

export function makeApi(accessToken) {
  async function post(path, body) {
    try {
      const res = await fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body ?? {}),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.' } };
    }
  }
  return { post };
}

// Fecha de hoy (del dispositivo) como YYYY-MM-DD, para los <input type="date">.
export function todayLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ageFromISO(birthDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - by;
  if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) age -= 1;
  return age;
}
