// src/App.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import AuthForm from './AuthForm';
import InterviewScreen from './InterviewScreen';
import FichaScreen from './FichaScreen';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = todavía no sabemos

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return null; // evita un parpadeo de login antes de saber si ya hay sesión
  }

  if (!session) {
    return <AuthForm />;
  }

  // Ruteo simple sin librería: alcanza para dos pantallas.
  const isFicha = window.location.pathname.startsWith('/mi-ficha');
  return isFicha ? <FichaScreen session={session} /> : <InterviewScreen session={session} />;
}
