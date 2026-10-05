// src/OnboardingWizard.jsx
//
// Asistente de registro en 3 pasos, que se muestra antes de entrar a la app
// hasta que el paciente lo completa:
//   1) Datos personales (obligatorios)
//   2) Consentimiento (texto y versión los sirve el backend)
//   3) Salud básica (opcional, se puede omitir)
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { makeApi } from './api';
import { PersonalForm, HealthForm } from './ProfileForms';
import './App.css';
import './Onboarding.css';

const STEP_LABELS = ['Datos personales', 'Consentimiento', 'Salud básica'];

export default function OnboardingWizard({ session, status, onChanged }) {
  const api = makeApi(session.access_token);
  const ob = status.onboarding;
  const step = !ob.personalDone ? 1 : !ob.consentDone ? 2 : 3;

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [accepted, setAccepted] = useState(false);

  async function save(payload) {
    setBusy(true);
    setErrors({});
    setFormError(null);
    const { ok, data } = await api.post('/patients/me/profile/save', payload);
    setBusy(false);
    if (!ok) {
      setErrors(data?.fields || {});
      setFormError(data?.fields ? null : data?.error || 'No pudimos guardar tus datos.');
      return;
    }
    await onChanged();
  }

  async function acceptConsent() {
    setBusy(true);
    setFormError(null);
    const { ok, data } = await api.post('/consent', {
      granted: true,
      consentTextVersion: status.consent.version,
    });
    setBusy(false);
    if (!ok) {
      setFormError(data?.error || 'No pudimos registrar tu consentimiento.');
      if (data?.code === 'CONSENT_VERSION_MISMATCH') await onChanged(); // trae el texto actual
      return;
    }
    await onChanged();
  }

  return (
    <div className="ra-app">
      <header className="ra-topbar">
        <div className="ra-brand">
          <span className="ra-brand__eyebrow">Asistente de bienestar</span>
          <span className="ra-brand__word">Regen</span>
        </div>
        <div className="ra-topbar__right">
          <button type="button" className="ra-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <main className="ob-main">
        <ol className="ob-steps" aria-label="Progreso del registro">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={`ob-step ${step === i + 1 ? 'is-current' : ''} ${step > i + 1 ? 'is-done' : ''}`}>
              <span className="ob-step__dot">{step > i + 1 ? '✓' : i + 1}</span>
              <span className="ob-step__label">{label}</span>
            </li>
          ))}
        </ol>

        <div className="ob-card">
          {step === 1 && (
            <>
              <h1 className="ob-title">Bienvenido/a a REGEN</h1>
              <p className="ob-lead">Para armar tu ficha, contanos quién sos. Lo usamos solo para tu atención.</p>
              <PersonalForm
                initial={status.profile || {}}
                email={status.email}
                onSubmit={(v) => save({ step: 'personal', ...v })}
                submitLabel="Continuar"
                busy={busy}
                errors={errors}
                formError={formError}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="ob-title">Tu consentimiento</h1>
              <p className="ob-lead">Antes de seguir, leé cómo vamos a tratar tus datos.</p>
              <p className="ob-consent">{status.consent.text}</p>
              <label className="ob-check">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>Leí y acepto el tratamiento de mis datos personales y de salud.</span>
              </label>
              {formError && <p className="pf-error">{formError}</p>}
              <button type="button" className="pf-submit" disabled={!accepted || busy} onClick={acceptConsent}>
                {busy ? 'Guardando…' : 'Acepto y continuar'}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="ob-title">Tu salud, en breve</h1>
              <p className="ob-lead">
                Estos datos son opcionales: nos ayudan a conocerte mejor y a empezar tu seguimiento. Podés completarlos
                ahora o más tarde desde “Mi perfil”.
              </p>
              <HealthForm
                initial={status.profile || {}}
                showMeasurements
                onSubmit={(v) =>
                  save({
                    step: 'health',
                    heightCm: v.heightCm,
                    weightKg: v.weightKg,
                    bloodType: v.bloodType,
                    allergies: v.allergies,
                    medicalConditions: v.medicalConditions,
                    medications: v.medications,
                    emergencyContactName: v.emergencyContactName,
                    emergencyContactPhone: v.emergencyContactPhone,
                  })
                }
                onSkip={() => save({ step: 'health', skip: true })}
                submitLabel="Guardar y empezar"
                busy={busy}
                errors={errors}
                formError={formError}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
