// src/App.jsx
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { makeApi } from './api';
import InterviewScreen from './InterviewScreen';
import BillingGate from './BillingGate';
import LoadingScreen from './LoadingScreen';

// Pantallas que no se ven en cada visita: su código baja recién cuando hace falta.
const AuthForm = lazy(() => import('./AuthForm'));
const OnboardingWizard = lazy(() => import('./OnboardingWizard'));
const FichaScreen = lazy(() => import('./FichaScreen'));

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = todavía no sabemos
  // Estado del registro de la persona con sesión: undefined = cargando · null = error · objeto = estado.
  // Se guarda junto con el usuario al que pertenece, así al cambiar de cuenta vuelve a «cargando» sin efectos extra.
  const [statusEntry, setStatusEntry] = useState({ userId: null, value: undefined });
  const sessionRef = useRef(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Estado del registro (datos personales, consentimiento vigente, salud básica).
  const refreshStatus = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const { ok, data } = await makeApi(s.access_token).post('/patients/me/profile');
    setStatusEntry({ userId: s.user?.id, value: ok ? data : null });
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) refreshStatus();
  }, [userId, refreshStatus]);

  const status = statusEntry.userId === userId ? statusEntry.value : undefined;

  if (session === undefined) {
    return null; // evita un parpadeo de login antes de saber si ya hay sesión
  }

  if (!session) {
    return (
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    );
  }

  if (status === undefined) {
    return <LoadingScreen />;
  }

  if (status === null) {
    return (
      <div className="ra-app" style={{ alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <p className="ra-hint">No pudimos cargar tu perfil.</p>
        <button type="button" className="ra-redflag__continue" onClick={refreshStatus}>
          Reintentar
        </button>
      </div>
    );
  }

  // Hasta completar el registro (datos personales → consentimiento vigente →
  // salud básica, que se puede omitir), no se muestra el resto de la app.
  const ob = status.onboarding;
  if (!ob.personalDone || !ob.consentDone || !ob.healthDone) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <OnboardingWizard session={session} status={status} onChanged={refreshStatus} />
      </Suspense>
    );
  }

  // Ruteo simple sin librería: alcanza para dos pantallas.
  const isFicha = window.location.pathname.startsWith('/mi-ficha');
  if (isFicha) {
    // La ficha nunca se bloquea: quien no pagó sigue viendo sus datos.
    return (
      <Suspense fallback={<LoadingScreen />}>
        <FichaScreen session={session} status={status} onProfileChanged={refreshStatus} />
      </Suspense>
    );
  }

  // Pagos: planes en /planes, vuelta de Mercado Pago y, solo en modo "live", filtro
  // antes de la entrevista. En los demás modos deja pasar a la entrevista como siempre.
  return (
    <BillingGate session={session} status={status}>
      <InterviewScreen session={session} intake={status.intake ?? null} onNeedsOnboarding={refreshStatus} />
    </BillingGate>
  );
}
