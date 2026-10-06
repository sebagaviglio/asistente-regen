# App del paciente — planes y pago (asistente-regen)

## Qué hay de nuevo
- src/billing.js          lógica pura: qué pantalla mostrar, formatos de precio, textos, errores
- src/termsText.js        T&C (BORRADOR) y su versión; tiene que coincidir con src/terms.js del Worker
- src/PlansScreen.jsx     elegir plan y pagar (Core, Activo, Diagnóstico) + "Quiero ser Elite"
- src/PaymentReturn.jsx   a donde vuelve la persona desde Mercado Pago (confirma contra el Worker)
- src/BillingGate.jsx     decide qué mostrar antes de la entrevista
- src/Billing.css         estilos
- src/App.jsx             (modificado) la entrevista ahora va envuelta en BillingGate. "Mi ficha" no se toca.
- test/billing.test.mjs   18 pruebas de la lógica (node --test)
- test/ui.test.mjs        17 pruebas con las pantallas renderizadas (necesita: npm install --save-dev jsdom)

## Cuándo se bloquea el acceso
- Worker con PAYMENTS_MODE "off" o "test": NO se bloquea a nadie. La pantalla de planes se prueba en /planes.
- Worker en "live": quien no tiene suscripción con acceso ve los planes en vez de la entrevista.
- Si no se puede consultar el estado (Worker viejo, sin red): se deja pasar. El corte real lo hace el servidor (Fase 3).
- "Mi ficha" nunca se bloquea.

## Antes de salir a producción
- Completar los datos entre corchetes de src/termsText.js ([domicilio], [email de contacto], [teléfono o WhatsApp], [N]).
- Que un abogado revise los T&C; al aprobarlos, cambiar la versión en termsText.js Y en el Worker (src/terms.js).
