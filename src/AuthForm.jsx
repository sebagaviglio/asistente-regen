// src/AuthForm.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import './AuthForm.css';

// Supabase devuelve los mensajes de error en inglés (vienen tal cual de su
// API); traducimos los casos más comunes que un paciente puede encontrarse.
const ERROR_TRANSLATIONS = [
  [/already registered/i, 'Ese email ya tiene una cuenta. Probá ingresar en vez de crear una cuenta.'],
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
  [/unable to validate email address/i, 'El formato del email no es válido.'],
  [/user not found/i, 'No encontramos una cuenta con ese email.'],
  [/email not confirmed/i, 'Todavía no confirmaste tu email. Revisá tu casilla de entrada.'],
  [/rate limit/i, 'Demasiados intentos. Esperá un minuto y volvé a probar.'],
];

function translateAuthError(message) {
  const match = ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
}

export default function AuthForm() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signupNotice, setSignupNotice] = useState(false);

  async function handleOAuth(provider) {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider });
    if (authError) setError(translateAuthError(authError.message));
    // Si no hay error, el navegador redirige a Google/Facebook — no hay más que hacer acá.
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const action =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error: authError, data } = await action;
    setLoading(false);

    if (authError) {
      setError(translateAuthError(authError.message));
      return;
    }

    if (mode === 'signup' && !data.session) {
      // Confirm email está activado en Supabase: no hay sesión hasta que
      // confirme el mail. (Hoy lo tenemos desactivado para pruebas, pero
      // dejamos este caso contemplado para cuando lo reactivemos.)
      setSignupNotice(true);
    }
  }

  return (
    <div className="ra-auth">
      <div className="ra-auth__card">
        <span className="ra-brand__eyebrow">Asistente de bienestar</span>
        <span className="ra-brand__word">Regen</span>

        <p className="ra-auth__lead">
          {mode === 'login' ? 'Ingresá para empezar tu entrevista.' : 'Creá tu cuenta para empezar.'}
        </p>

        {!signupNotice && (
          <div className="ra-auth__oauth">
            <button type="button" className="ra-auth__oauth-btn" onClick={() => handleOAuth('google')}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.5-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 2.9l6-6C34.6 5.1 29.6 3 24 3 16 3 9 7.4 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.9 14.2-5l-6.6-5.4C29.6 36.2 26.9 37 24 37c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9 40.6 16 45 24 45z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.6 5.4C41.3 36 44 30.6 44 24c0-1.4-.1-2.5-.4-3.5z" />
              </svg>
              Continuar con Google
            </button>
            <button type="button" className="ra-auth__oauth-btn" onClick={() => handleOAuth('facebook')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
                <path d="M24 12.07C24 5.4 18.6 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.25h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z" />
              </svg>
              Continuar con Facebook
            </button>
          </div>
        )}

        {!signupNotice && <div className="ra-auth__divider">o con email</div>}

        {signupNotice ? (
          <p className="ra-auth__notice">
            Te mandamos un email para confirmar tu cuenta. Una vez confirmado, volvé acá e ingresá.
          </p>
        ) : (
          <form className="ra-auth__form" onSubmit={handleSubmit}>
            <label className="ra-auth__field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="ra-auth__field">
              <span>Contraseña</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && <p className="ra-auth__error">{error}</p>}

            <button type="submit" className="ra-auth__submit" disabled={loading}>
              {loading ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <button
          type="button"
          className="ra-auth__switch"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setSignupNotice(false);
          }}
        >
          {mode === 'login' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Ingresá'}
        </button>
      </div>
    </div>
  );
}
