// src/DeleteAccount.jsx
//
// "Eliminar mi cuenta" dentro de Mi perfil (Apple y Google exigen poder hacerlo desde la app).
// Dos pasos: se explica qué pasa y recién después se pide escribir ELIMINAR.
// El Worker cancela el cobro de Mercado Pago, cierra el acceso y vacía los datos de contacto;
// la historia clínica se conserva por ley (Ley 26.529).
import { useState } from 'react';
import { makeApi } from './api';
import { supabase } from './supabaseClient';

export const CONFIRM_WORD = 'ELIMINAR';

export default function DeleteAccount({ session }) {
  const [step, setStep] = useState('idle'); // idle | confirm
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await makeApi(session.access_token).post('/patients/me/delete-account', { confirm: word.trim() });
    if (!ok) {
      setBusy(false);
      setError(data?.error || 'No pudimos eliminar tu cuenta. Probá de nuevo.');
      return;
    }
    // El usuario ya no existe en el servidor: se limpia la sesión de este equipo.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* el acceso ya está cerrado en el servidor */
    }
  }

  if (step === 'idle') {
    return (
      <section className="ev-profile__box" data-testid="delete-account">
        <h3>Eliminar mi cuenta</h3>
        <p className="pf-field__hint">Si ya no querés usar REGEN, podés dar de baja tu cuenta desde acá.</p>
        <button type="button" className="pf-skip" onClick={() => setStep('confirm')}>
          Quiero eliminar mi cuenta
        </button>
      </section>
    );
  }

  return (
    <section className="ev-profile__box" data-testid="delete-account">
      <h3>Eliminar mi cuenta</h3>
      <form className="pf-form" onSubmit={submit}>
        <p className="pf-field__hint">Esto es lo que va a pasar:</p>
        <ul className="pf-field__hint" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Se cancela tu suscripción y no se te va a cobrar más.</li>
          <li>Ya no vas a poder ingresar con esta cuenta.</li>
          <li>Borramos tu email, teléfono, domicilio y contacto de emergencia.</li>
          <li>
            Tu historia clínica (entrevistas, mediciones y estudios) la conservamos durante 10 años, como exige la ley
            (Ley 26.529). Solo la ve el equipo de salud de REGEN.
          </li>
        </ul>
        <p className="pf-field__hint">Esto no se puede deshacer.</p>
        <label className="pf-field">
          <span className="pf-field__label">Para confirmar, escribí {CONFIRM_WORD}</span>
          <input
            className="pf-input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error && <p className="pf-error">{error}</p>}
        <button type="submit" className="pf-submit" disabled={busy || word.trim().toUpperCase() !== CONFIRM_WORD}>
          {busy ? 'Eliminando…' : 'Eliminar mi cuenta definitivamente'}
        </button>
        <button type="button" className="pf-skip" disabled={busy} onClick={() => { setStep('idle'); setWord(''); setError(null); }}>
          Cancelar
        </button>
      </form>
    </section>
  );
}
