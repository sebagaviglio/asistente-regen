// src/ProfilePanel.jsx
//
// "Mi perfil": edición de los datos personales y de salud básica. Altura y
// peso NO se editan acá: son mediciones y se cargan en "Mi evolución", así
// queda el historial.
import { useState } from 'react';
import { makeApi } from './api';
import { PersonalForm, HealthForm } from './ProfileForms';
import './Onboarding.css';
import './Evolution.css';

export default function ProfilePanel({ session, status, onChanged }) {
  const api = makeApi(session.access_token);
  const profile = status?.profile || {};
  const [state, setState] = useState({ personal: {}, health: {} });

  function patch(section, values) {
    setState((s) => ({ ...s, [section]: { ...s[section], ...values } }));
  }

  async function save(section, payload) {
    patch(section, { busy: true, errors: {}, formError: null, saved: false });
    const { ok, data } = await api.post('/patients/me/profile/save', payload);
    if (!ok) {
      patch(section, {
        busy: false,
        errors: data?.fields || {},
        formError: data?.fields ? null : data?.error || 'No pudimos guardar tus datos.',
      });
      return;
    }
    patch(section, { busy: false, saved: true });
    onChanged?.();
  }

  const p = state.personal;
  const h = state.health;

  return (
    <div className="ev-profile">
      <p className="ra-tagline" style={{ textAlign: 'center' }}>
        Mi perfil
      </p>

      <section className="ev-profile__box">
        <h3>Datos personales</h3>
        <PersonalForm
          initial={profile}
          email={status?.email}
          onSubmit={(v) => save('personal', { step: 'personal', ...v })}
          submitLabel="Guardar datos personales"
          busy={p.busy}
          errors={p.errors}
          formError={p.formError}
        />
        {p.saved && <p className="ev-saved">Guardado ✓</p>}
      </section>

      <section className="ev-profile__box">
        <h3>Salud básica</h3>
        <p className="pf-field__hint">
          Para actualizar tu peso, tu altura u otras mediciones, usá “Mi evolución”: así se guarda el historial.
        </p>
        <HealthForm
          initial={profile}
          onSubmit={(v) =>
            save('health', {
              step: 'health',
              bloodType: v.bloodType,
              allergies: v.allergies,
              medicalConditions: v.medicalConditions,
              medications: v.medications,
              emergencyContactName: v.emergencyContactName,
              emergencyContactPhone: v.emergencyContactPhone,
            })
          }
          submitLabel="Guardar salud básica"
          busy={h.busy}
          errors={h.errors}
          formError={h.formError}
        />
        {h.saved && <p className="ev-saved">Guardado ✓</p>}
      </section>
    </div>
  );
}
