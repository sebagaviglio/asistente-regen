// src/App.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { makeApi } from './api';
import AuthForm from './AuthForm';
import OnboardingWizard from './OnboardingWizard';
import InterviewScreen from './InterviewScreen';
import FichaScreen from './FichaScreen';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = todavía no sabemos
  const [status, setStatus] = useState(undefined); // undefined = cargando · null = error · objeto = estado del registro
  const sessionRef = useRef(null);
  sessionRef.current = session;

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
    setStatus(ok ? data : null);
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    setStatus(undefined);
    if (userId) refreshStatus();
  }, [userId, refreshStatus]);

  if (session === undefined) {
    return null; // evita un parpadeo de login antes de saber si ya hay sesión
  }

  if (!session) {
    return <AuthForm />;
  }

  if (status === undefined) {
    return (
      <div className="ra-app">
        <p className="ra-ficha__empty" style={{ textAlign: 'center', marginTop: 80 }}>
          Cargando…
        </p>
      </div>
    );
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
    return <OnboardingWizard session={session} status={status} onChanged={refreshStatus} />;
  }

  // Ruteo simple sin librería: alcanza para dos pantallas.
  const isFicha = window.location.pathname.startsWith('/mi-ficha');
  return isFicha ? (
    <FichaScreen session={session} status={status} onProfileChanged={refreshStatus} />
  ) : (
    <InterviewScreen session={session} onNeedsOnboarding={refreshStatus} />
  );
}
