# asistente-regen — app del paciente

App del paciente de REGEN (asistente.regen.ar): registro, entrevista de voz con el
asistente, «Mi ficha» (entrevistas, turnos, evolución, perfil) y planes. React + Vite,
publicada en Vercel desde `main`. Los datos van por el Worker de REGEN (repo
`regen-worker`); Supabase se usa **solo para el login**.

## Comandos

```
npm ci
npm run dev      # necesita .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run check    # lint + todas las pruebas: tiene que pasar antes de abrir un PR
```

GitHub corre `npm run check` en cada PR (`.github/workflows/pruebas.yml`).

## Cómo está armado

- **Worker:** la URL está una sola vez, en `src/api.js` (`WORKER_URL`, `makeApi`). No la copies en otros archivos.
- **Login:** `src/supabaseClient.js` usa solo `@supabase/auth-js`, configurado igual que `createClient()` (misma clave `sb-<proyecto>-auth-token`, flujo implícito). Si lo tocás, `test/auth_client.test.mjs` tiene que seguir pasando: si cambia la clave, se cierran todas las sesiones abiertas.
- **Voz bajo demanda:** el SDK de voz (`@openai/agents-realtime`, `zod`, el agente) vive en `src/realtimeCall.js` y se carga con `import()`. Nunca lo importes de forma estática.
- **Pantallas bajo demanda:** login, registro, ficha, planes y vuelta de pago usan `React.lazy`.
- **CSS:** todo se importa en `src/main.jsx`, en un orden fijo. Si agregás un `.css`, sumalo ahí y no en el componente: así la cascada es la misma en todas las pantallas.
- **Logs de la llamada:** solo con `?debug` o `localStorage.regen_debug = '1'` (`src/debug.js`). En producción, la consola queda limpia.
- **Términos y consentimiento:** `src/termsText.js` tiene que coincidir con `src/terms.js` y `src/consent.js` del Worker.

## Pruebas

- `test/*.test.mjs` corre con `node --test` y renderiza las pantallas con jsdom (vía `vite.ssrLoadModule`), con el Worker simulado.
- `test/bundle_budget.test.mjs` compila y controla la primera carga (JS inicial ≤ 112 KB gzip, el SDK de voz y las pantallas secundarias aparte, todo el CSS en la carga inicial). Si falla, buscá qué import estático arrastró algo pesado.
- Verificación visual contra `main`: ver `.claude/skills/verify/SKILL.md`.

## Textos para el paciente

El asistente y la app nunca diagnostican, no dan dosis ni prometen resultados. Ante
síntomas de alarma se deriva a un profesional, sin nada comercial. Las reglas clínicas
viven en el Worker (`src/policy/`); si un texto de la app toca esos temas, que diga lo mismo.

## Cómo trabajamos (vale para todos los repos de REGEN)

**Idioma.** Todo en castellano rioplatense (vos): respuestas, mensajes de commit, títulos y
descripciones de PR, comentarios del código y textos de la interfaz. Nunca en inglés.

**Con Seba.** Seba es el dueño del producto y no programa a diario. Explicá en lenguaje
llano, sin jerga. Si tiene que correr algo en su compu, pasale **un comando por vez** y
esperá lo que devuelva antes de pasar el siguiente.

**`main` es producción.** Lo que entra a `main` se publica solo, así que:
- Nunca subas directo a `main`. Trabajá en una rama y abrí un PR **sin fusionar**: fusiona Seba.
- No actives la fusión automática.
- Si el PR necesita algo antes de fusionar (una migración, una variable), decilo arriba de todo en la descripción.

**Antes de tocar un archivo, partí de `origin/main` actual.** Hacé `git fetch` y trabajá
sobre lo que está publicado. Nunca reescribas un archivo entero a partir de una copia
vieja (de otro chat, del proyecto de Claude o de memoria): el 13/11/2026 eso borró sin
querer el consentimiento del formulario de regen.ar y el trabajo de octubre. Preferí
cambios puntuales, y antes de abrir el PR mirá el `git diff --stat`: si cambian muchas
más líneas de las que esperabas, frená y revisá.

**Pruebas primero.** Para cada cambio de comportamiento: escribí la prueba, comprobá que
falla con el código actual, hacé el cambio y comprobá que pasa. Si una prueba vieja fija
el comportamiento que querés cambiar a propósito, actualizala y explicalo en el PR.

**Medí antes y después.** Para rendimiento, no alcanza con «debería andar más rápido»:
medí (tamaño de lo que se descarga, tiempos, pedidos al Worker) antes y después.

**Sin cambios visuales no pedidos.** Si el cambio no es visual, demostralo: corré la
verificación (`.claude/skills/verify`) y compará contra `main`. Si es visual, mostrá
capturas.

**Revisá tu propio PR contra `REVIEW.md`** antes de abrirlo.

**Tres intentos.** Si algo sigue fallando después de tres intentos de arreglo, pará: el
enfoque está mal. Contale a Seba qué probaste y qué creés que pasa.

**Datos de salud.** Todo lo que toca pacientes es dato sensible (Ley 25.326). Nada de
datos reales en pruebas, capturas, logs ni PRs: usá datos inventados.

**Commits y PRs.** Mensaje en castellano que diga qué cambia y por qué. El PR explica en
lenguaje llano qué pasaba, qué cambia, cómo se verificó y qué queda pendiente.
