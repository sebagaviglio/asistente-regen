# REGEN · App nativa (iOS y Android) — Fase 2

La app del paciente (esta misma web) ahora puede correr dentro de un contenedor nativo con **Capacitor**.
Hay una sola base de código: lo que cambia en la web llega a la app con `npm run native:sync`.

Esta fase la dejó lista para **probar en equipos reales apuntando a staging**. Todavía no es la versión de las tiendas
(faltan íconos, notificaciones, Apple Health y los links universales: Fase 3).

## Qué hay en el repo

| Cosa | Dónde |
|---|---|
| Proyecto de iOS (Xcode, con Swift Package Manager: no hace falta CocoaPods) | `ios/` |
| Proyecto de Android (Android Studio, Gradle) | `android/` |
| Configuración de Capacitor (identificador `ar.regen.app`, carpeta `dist`) | `capacitor.config.json` |
| Arranque nativo (sesión segura, navegador del sistema, botón atrás) | `src/native.js` |
| Vuelta del login y links que abren la app | `src/deepLinks.js` |
| Permisos en español (micrófono, cámara, fotos) y esquema `ar.regen.app://` | `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml` |

La web común (app.regen.ar) **no descarga nada de esto**: el código nativo es un archivo aparte que solo se pide dentro de la app.

## Qué hace distinto la app (y qué quedó igual)

- **Sesión:** se guarda en el Keychain de iOS / almacenamiento cifrado de Android, no en `localStorage`. En una instalación nueva se borra cualquier sesión vieja (el Keychain de iOS sobrevive a desinstalar).
- **Login con Google (y Apple en iPhone):** se abre el navegador del sistema y vuelve a la app por `ar.regen.app://auth-callback` con flujo PKCE. Email y contraseña no cambian.
- **Mercado Pago:** se abre en el navegador del sistema. Al volver a la app, el estado del plan se vuelve a consultar solo. (Que el link de vuelta **abra** la app directamente es de la Fase 3, con links universales; hasta entonces la persona vuelve tocando la app.)
- **Android:** el botón «atrás» vuelve a la pantalla anterior y, en la primera, sale de la app.
- **Voz, ficha, entrevista, biomarcadores:** son la misma web. Lo que hay que verificar en equipos reales es la voz (ver checklist).

## Lo que necesitás en tu Mac (una sola vez)

1. **Node 22 o más nuevo:** `node -v`. Capacitor 8 lo pide.
2. **Xcode** (App Store, es grande) y abrirlo una vez para aceptar la licencia. Con tu Apple ID gratuito alcanza para probar en tu iPhone.
3. **Android Studio** (developer.android.com/studio) y, al abrirlo la primera vez, dejar que instale el SDK.
4. Un **iPhone** y un **Android** reales (el plan los recomienda; la voz en simuladores no es confiable).

## Paso a paso

### 1. Bajar la rama y completar las variables

```bash
cd asistente-regen
git fetch && git checkout fase2-capacitor
npm install
cp .env.staging.example .env.staging
```

Abrí `.env.staging` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los del Supabase de **staging**
(`VITE_WORKER_URL` y `VITE_APP_ENV` ya vienen bien). Ese archivo no se sube a git.

### 2. Autorizar la vuelta del login en Supabase (staging)

En Supabase de staging → **Authentication → URL Configuration → Redirect URLs**, sumá:

```
ar.regen.app://auth-callback
```

(Si ya sumaste `capacitor://localhost` y `https://localhost` en la Fase 1, esas se mantienen.)

### 3. iPhone

```bash
npm run native:ios
```

Compila la web para staging, la copia al proyecto y abre Xcode. En Xcode:

1. Elegí el proyecto **App** (arriba a la izquierda) → pestaña **Signing & Capabilities** → **Team**: tu Apple ID personal.
   Si pide cambiar el *Bundle Identifier* porque `ar.regen.app` ya está tomado, poné uno temporal como `ar.regen.app.seba`. Es solo para pruebas.
2. Conectá el iPhone, activá **Modo desarrollador** (Ajustes → Privacidad y seguridad) y elegilo como destino arriba.
3. Tocá ▶ **Run**. La primera vez, en el iPhone: Ajustes → General → VPN y administración de dispositivos → confiar en tu Apple ID.

### 4. Android

```bash
npm run native:android
```

Abre Android Studio. Esperá a que termine el «Gradle sync», conectá el Android con **depuración USB** activada
(Ajustes → Opciones de desarrollador) y tocá ▶ **Run**. Es la primera vez que este proyecto se compila: si Gradle falla, pegame el mensaje.

### 5. Cada vez que cambie la web

```bash
npm run native:sync        # compila para staging y copia a ios/ y android/
```

y volvés a tocar ▶ Run. Para apuntar a producción (no todavía): `npm run native:sync:production`.

## Gate de voz (fin de la semana 4)

El plan fija un control antes de seguir con las funciones nativas: **si la voz no anda bien en los dos equipos, se resuelve antes de avanzar**.
Probalo en el iPhone y en el Android y anotá cada resultado (✅ / ⚠️ con qué pasó / ❌).

| # | Prueba | iPhone | Android |
|---|---|---|---|
| 1 | Primera vez: aparece el permiso de micrófono con el texto en español y, al aceptarlo, la llamada arranca | | |
| 2 | Entrevista completa de ~5 minutos: se escucha bien, no se corta, los subtítulos acompañan | | |
| 3 | Hablar por el **parlante** del teléfono: no hay eco ni el asistente se escucha a sí mismo | | |
| 4 | Con **auriculares con cable o Bluetooth** (AirPods incluidos) | | |
| 5 | **Bloquear la pantalla** en plena llamada: ¿sigue o se corta? (anotá cuánto tarda) | | |
| 6 | Pasar a **otra app** y volver a los 30 segundos | | |
| 7 | **Llamada telefónica entrante** durante la entrevista: ¿se pausa?, ¿se puede retomar la entrevista después? | | |
| 8 | Cambiar de **Wi-Fi a datos móviles** a mitad de llamada | | |
| 9 | Cortar la entrevista a mitad y volver a entrar: retoma donde quedó | | |
| 10 | Adjuntar una **foto con la cámara** y una desde la galería (en la entrevista y en la ficha) | | |
| 11 | Login con **email y contraseña**, cerrar la app del todo y reabrirla: la sesión sigue | | |
| 12 | Login con **Google**: abre el navegador, vuelve a la app y entra | | |
| 13 | Entrar a **Planes**, tocar pagar: abre Mercado Pago en el navegador; al volver a la app se actualiza el estado | | |
| 14 | Android: botón **atrás** recorre las pantallas y sale desde la primera | | |
| 15 | Se ve bien con el notch / la barra de gestos (nada tapado arriba ni abajo) y el teclado no tapa los campos | | |

Pasá la tabla completa (aunque falten celdas) y decidimos qué se ajusta. Las pruebas 5 y 7 son las que más seguido fallan en WebRTC
dentro de una app, así que son las más importantes.

## Lo que quedó fuera a propósito (próximas fases)

- **Ícono y pantalla de inicio de REGEN:** hoy aparecen los de Capacitor (Fase 3, desde el brandbook).
- **Sign in with Apple:** el botón ya aparece en el iPhone, pero **no va a andar** hasta tener la cuenta de Apple Developer de organización y configurar Apple como proveedor en Supabase (depende de la Fase 0).
- **Venta de planes en iPhone:** el plan propone lanzar iOS sin vender planes dentro de la app. Eso todavía no está aplicado: es parte de la decisión de pagos y de las fichas de tienda. Para pruebas internas no importa.
- **Links universales** (`regen.ar/i/…` y vuelta de pago que abren la app), **notificaciones push**, **Apple Health / Health Connect**, **borrado de cuenta**: Fase 3.
- **Confirmación de email al registrarse desde la app:** el link del mail se abre en el navegador; después la persona vuelve a la app e ingresa. (Hoy la confirmación está desactivada en Supabase, así que no se nota.)
- **Compilación en la nube** (Codemagic o GitHub Actions): Fase 4.

## Si algo falla

- **Pantalla en blanco al abrir:** casi siempre falta `.env.staging` (sin Supabase la web no arranca). Revisá el archivo y corré `npm run native:sync` otra vez.
- **«Faltan VITE_SUPABASE_URL…»:** lo mismo.
- **El login con Google no vuelve a la app:** revisá que `ar.regen.app://auth-callback` esté en Redirect URLs de Supabase (paso 2).
- **Otra cosa:** pegame el mensaje tal cual (de la Terminal, de Xcode o de Android Studio).
