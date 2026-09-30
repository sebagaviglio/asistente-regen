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
