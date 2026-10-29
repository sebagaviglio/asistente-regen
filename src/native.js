// src/native.js
//
// Arranque de la app de iOS/Android (Capacitor). Se descarga como un archivo aparte y solo lo pide
// platform.js cuando la página corre dentro de la app: la web no lo carga nunca.
//
// Qué conecta con el teléfono:
//  - Sesión de Supabase en el Keychain (iOS) / almacenamiento cifrado (Android), no en localStorage.
//  - Pagos y login por el navegador del sistema.
//  - Vuelta a la app por link profundo (login) y botón «atrás» de Android.
//  - Aviso a la pantalla cuando la app vuelve al primer plano (por ejemplo, después de pagar).
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { setAuthStorageBackend, setExternalOpener, nativePlatform } from './platform.js';
import { handleDeepLink } from './deepLinks.js';
import { navigate } from './router.js';

const INSTALL_FLAG = 'regen_installed';

async function enableSecureSession() {
  // Disponible aunque el teléfono se reinicie y esté bloqueado (necesario para renovar la sesión en segundo plano),
  // y sin viajar a otro equipo en una restauración de copia de seguridad.
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly);

  // El Keychain de iOS sobrevive a desinstalar la app; localStorage no. Si falta la marca, es una instalación
  // nueva: se borra cualquier sesión vieja para que no reaparezca la cuenta de otra persona.
  let firstRun = true;
  try {
    firstRun = !window.localStorage.getItem(INSTALL_FLAG);
  } catch {
    /* sin localStorage: se trata como primera vez */
  }
  if (firstRun) {
    await SecureStorage.clear();
    try {
      window.localStorage.setItem(INSTALL_FLAG, '1');
    } catch {
      /* ignorar */
    }
  }

  setAuthStorageBackend({
    getItem: (key) => SecureStorage.getItem(key),
    setItem: (key, value) => SecureStorage.setItem(key, value),
    removeItem: (key) => SecureStorage.removeItem(key),
  });
}

// Dependencias reales de los links profundos (el cliente de login se carga recién cuando hace falta).
const deepLinkDeps = {
  exchangeCode: async (code) => {
    const { supabase } = await import('./supabaseClient.js');
    return supabase.auth.exchangeCodeForSession(code);
  },
  closeBrowser: () => Browser.close(),
  navigate: (path) => navigate(path),
  onAuthError: (message) => window.dispatchEvent(new CustomEvent('regen:auth-error', { detail: message })),
};

export async function initNative() {
  try {
    await enableSecureSession();
  } catch (err) {
    // Sin almacenamiento seguro la app sigue andando con el de siempre (localStorage).
    console.error('Almacenamiento seguro no disponible:', err);
  }

  // Pago de Mercado Pago y login: navegador del sistema, no la vista de la app.
  setExternalOpener((url) => Browser.open({ url }));

  App.addListener('appUrlOpen', ({ url }) => {
    handleDeepLink(url, deepLinkDeps).catch((err) => console.error('Link profundo:', err));
  });
  App.getLaunchUrl()
    .then((launch) => launch?.url && handleDeepLink(launch.url, deepLinkDeps))
    .catch((err) => console.error('Link de arranque:', err));

  // Android: el botón atrás vuelve a la pantalla anterior y, en la primera, sale de la app.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });

  // Al volver al primer plano (después de pagar en el navegador, por ejemplo) las pantallas pueden refrescarse.
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('regen:app-resume'));
  });

  // Fondo claro de la app: íconos oscuros en la barra de estado.
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  if (nativePlatform() === 'android') StatusBar.setBackgroundColor({ color: '#F4EFE5' }).catch(() => {});
}
