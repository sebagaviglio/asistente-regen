// Presupuesto de carga: compila la app de verdad y controla qué baja el navegador
// en la primera visita. Corre con:  node --test test/bundle_budget.test.mjs
//
// El SDK de voz (@openai/agents-*, zod) pesa más de 1 MB y solo hace falta cuando
// la persona toca el micrófono; las pantallas secundarias se cargan al abrirlas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

// Presupuesto de JS de la primera carga (comprimido con gzip). Antes: 425 KB; sin el
// SDK de voz, 135 KB; con solo el cliente de login de Supabase, ~104 KB.
const INITIAL_JS_BUDGET_KB = 112;

const outDir = mkdtempSync(join(tmpdir(), 'regen-budget-'));
process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'clave-ficticia';
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true, manifest: true } });
const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8'));

// Todo lo que el navegador baja sí o sí al abrir la página: la entrada y sus imports estáticos.
function initialChunks() {
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    (manifest[key].imports || []).forEach(visit);
  };
  visit('index.html');
  return [...seen];
}
const initial = initialChunks();
const initialCode = initial.map((k) => readFileSync(join(outDir, manifest[k].file), 'utf8')).join('\n');

test('primera carga: el JS inicial entra en el presupuesto', () => {
  const kb = gzipSync(initialCode).length / 1024;
  assert.ok(kb <= INITIAL_JS_BUDGET_KB, `JS inicial ${kb.toFixed(1)} KB gzip > ${INITIAL_JS_BUDGET_KB} KB`);
});

test('primera carga: el SDK de voz no viaja hasta que se usa', () => {
  assert.ok(manifest['src/realtimeCall.js']?.isDynamicEntry, 'realtimeCall.js se carga con import()');
  assert.ok(!initial.includes('src/realtimeCall.js'));
  // Textos propios del SDK y de zod que no deberían estar en la carga inicial.
  for (const marker of ['input_audio_buffer.append', 'openai-agents-js', 'ZodError']) {
    assert.ok(!initialCode.includes(marker), `"${marker}" quedó en el JS inicial`);
  }
});

test('primera carga: las pantallas secundarias se cargan al abrirlas', () => {
  for (const screen of ['src/AuthForm.jsx', 'src/OnboardingWizard.jsx', 'src/FichaScreen.jsx', 'src/PlansScreen.jsx', 'src/PaymentReturn.jsx']) {
    assert.ok(manifest[screen]?.isDynamicEntry, `${screen} debería ser un chunk aparte`);
    assert.ok(!initial.includes(screen), `${screen} no debería estar en la carga inicial`);
  }
});

test('Supabase: solo viaja el login (sin base de datos, archivos ni tiempo real)', () => {
  for (const marker of ['rest/v1', 'storage/v1', 'realtime/v1']) {
    assert.ok(!initialCode.includes(marker), `"${marker}" quedó en el JS inicial`);
  }
});

test('estilos: todo el CSS viaja en la carga inicial, así ninguna pantalla diferida cambia la cascada', () => {
  const lazyCss = Object.entries(manifest).filter(([k, v]) => !initial.includes(k) && v.css?.length);
  assert.deepEqual(lazyCss.map(([k]) => k), []);
  assert.equal(manifest['index.html'].css.length, 1);
});

test.after(() => rmSync(outDir, { recursive: true, force: true }));
