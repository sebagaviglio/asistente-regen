# asistente-regen

App del paciente de REGEN (asistente.regen.ar): registro, entrevista de voz con el
asistente, «Mi ficha médica» y planes. React + Vite, publicada en Vercel desde `main`.
Habla con el Worker de REGEN (`src/api.js` tiene la URL) y con Supabase solo para el login.

## Cómo correrla

```
npm ci
# creá un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

## Antes de subir un cambio

```
npm run check   # lint + todas las pruebas
```

- `test/*.test.mjs` usa `node --test` y renderiza las pantallas de verdad con jsdom.
- `test/bundle_budget.test.mjs` compila la app y controla la primera carga:
  - JS inicial ≤ 112 KB gzip;
  - el SDK de voz (`src/realtimeCall.js`) y las pantallas secundarias se cargan recién al usarlas;
  - todo el CSS va en la carga inicial, para que la cascada sea la misma en todas las pantallas.
  - de Supabase viaja solo el cliente de login (`@supabase/auth-js`).
- `test/auth_client.test.mjs` cuida que el login se comporte igual que con `@supabase/supabase-js`:
  misma clave en el navegador (las sesiones abiertas no se cierran) y mismos pedidos para email,
  Google, alta y salida.

  Si un cambio lo rompe, mirá qué import estático arrastró algo pesado a la carga inicial.

## Rendimiento: cómo está armado

- **Voz bajo demanda.** `@openai/agents-realtime`, `zod` y el agente pesan ~1 MB. Están en
  `src/realtimeCall.js`, que se baja en un momento libre con la pantalla de la entrevista ya
  pintada, y se espera (en paralelo con la sesión) al tocar el micrófono.
- **Pantallas bajo demanda.** Login, registro, ficha, planes y vuelta de Mercado Pago usan
  `React.lazy`. Mientras llega su código se ve el mismo «Cargando…» de siempre.
- **CSS.** Se importa todo en `src/main.jsx`, en un orden fijo. Si agregás un archivo `.css`,
  sumalo ahí.
- **Esfera.** Un solo `requestAnimationFrame`, que se frena con la pestaña oculta o fuera de
  pantalla; el halo se crea una vez por canvas.

## Diagnóstico de una llamada

Los eventos crudos de la sesión de voz (VAD, respuestas, configuración aplicada) no se
muestran en la consola de producción. Para verlos, abrí la app con `?debug` o ejecutá en la
consola `localStorage.regen_debug = '1'`. Los errores se registran siempre.
