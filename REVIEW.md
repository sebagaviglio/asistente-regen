# Cómo revisar un PR en asistente-regen (app del paciente)

## Qué es «Importante» acá
Algo que cierre las sesiones abiertas, rompa el login, el pago o la llamada de voz, muestre
datos de un paciente a quien no corresponde, o cambie lo que se ve sin que el PR lo diga.
Estilo y nombres son, como mucho, detalle.

## Revisar siempre
- **Sin cambios visuales no pedidos:** si el PR no es visual, trae la verificación contra `main` (`.claude/skills/verify`) con las pantallas idénticas, o explica cada diferencia.
- **Login:** `src/supabaseClient.js` mantiene la clave `sb-<proyecto>-auth-token` y el flujo implícito, y `test/auth_client.test.mjs` sigue pasando.
- **Worker:** los pedidos usan `src/api.js`. Nada de URLs del Worker copiadas en los componentes.
- **Carga:** `test/bundle_budget.test.mjs` sigue pasando. Nada pesado importado de forma estática (el SDK de voz va solo en `src/realtimeCall.js`, que se carga con `import()`).
- **CSS nuevo:** importado en `src/main.jsx`, no en el componente.
- **Datos de pacientes:** no se guardan en `localStorage` ni se mandan a servicios de terceros, y no aparecen en logs.
- **Pruebas:** el cambio de comportamiento trae una prueba que falla sin el cambio.

## Para no hacer ruido
- Como mucho, cinco comentarios de detalle.
- No revisar `package-lock.json` ni archivos generados.
- Cada afirmación sobre el comportamiento lleva archivo y línea.
