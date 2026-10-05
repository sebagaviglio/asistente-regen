// src/ProfileForms.jsx
//
// Formularios de perfil, compartidos por el asistente de registro y por
// "Mi perfil". Los campos siguen las secciones "Detalles de salud" y
// "Ficha médica" de Apple Health.
import { useState } from 'react';
import { ageFromISO, todayLocalISO } from './api';

const SEX_OPTIONS = [
  ['femenino', 'Femenino'],
  ['masculino', 'Masculino'],
  ['otro', 'Otro'],
  ['no_informa', 'Prefiero no decirlo'],
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function Field({ label, hint, error, children }) {
  return (
    <label className="pf-field">
      <span className="pf-field__label">{label}</span>
      {children}
      {hint && !error && <span className="pf-field__hint">{hint}</span>}
      {error && <span className="pf-field__error">{error}</span>}
    </label>
  );
}

export function PersonalForm({ initial = {}, email, onSubmit, submitLabel = 'Continuar', busy, errors = {}, formError }) {
  const [v, setV] = useState({
    fullName: initial.fullName || '',
    birthDate: initial.birthDate || '',
    sex: initial.sex || '',
    phone: initial.phone || '',
    dni: initial.dni || '',
  });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const age = ageFromISO(v.birthDate);

  return (
    <form
      className="pf-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {email && (
        <Field label="Email" hint="Es el email de tu cuenta.">
          <input className="pf-input" type="email" value={email} readOnly disabled />
        </Field>
      )}
      <Field label="Nombre y apellido" error={errors.fullName}>
        <input className="pf-input" value={v.fullName} onChange={set('fullName')} autoComplete="name" required />
      </Field>
      <div className="pf-row">
        <Field label="Fecha de nacimiento" error={errors.birthDate}>
          <input
            className="pf-input"
            type="date"
            value={v.birthDate}
            onChange={set('birthDate')}
            max={todayLocalISO()}
            autoComplete="bday"
            required
          />
        </Field>
        <Field label="Sexo biológico" error={errors.sex}>
          <select className="pf-input" value={v.sex} onChange={set('sex')} required>
            <option value="" disabled>
              Elegí una opción
            </option>
            {SEX_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {age !== null && age < 18 && age >= 0 && (
        <p className="pf-notice">
          Si sos menor de 18 años, te pedimos que completes esto junto a un adulto responsable. El equipo de REGEN va a
          acompañar tu caso con especial cuidado.
        </p>
      )}
      <Field label="Teléfono" hint="Con código de área. Ej.: +54 351 555 1234" error={errors.phone}>
        <input className="pf-input" type="tel" value={v.phone} onChange={set('phone')} autoComplete="tel" required />
      </Field>
      <Field label="DNI (opcional)" error={errors.dni}>
        <input className="pf-input" inputMode="numeric" value={v.dni} onChange={set('dni')} />
      </Field>
      {formError && <p className="pf-error">{formError}</p>}
      <button type="submit" className="pf-submit" disabled={busy}>
        {busy ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}

export function HealthForm({
  initial = {},
  showMeasurements = false,
  onSubmit,
  onSkip,
  submitLabel = 'Guardar',
  busy,
  errors = {},
  formError,
}) {
  const [v, setV] = useState({
    heightCm: '',
    weightKg: '',
    bloodType: initial.bloodType || '',
    allergies: initial.allergies || '',
    medicalConditions: initial.medicalConditions || '',
    medications: initial.medications || '',
    emergencyContactName: initial.emergencyContactName || '',
    emergencyContactPhone: initial.emergencyContactPhone || '',
  });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="pf-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {showMeasurements && (
        <div className="pf-row">
          <Field label="Altura (cm)" error={errors.heightCm}>
            <input className="pf-input" type="number" inputMode="decimal" step="0.1" min="50" max="250" value={v.heightCm} onChange={set('heightCm')} />
          </Field>
          <Field label="Peso (kg)" error={errors.weightKg}>
            <input className="pf-input" type="number" inputMode="decimal" step="0.1" min="2" max="400" value={v.weightKg} onChange={set('weightKg')} />
          </Field>
        </div>
      )}
      <Field label="Grupo sanguíneo" error={errors.bloodType}>
        <select className="pf-input" value={v.bloodType} onChange={set('bloodType')}>
          <option value="">No lo sé</option>
          {BLOOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Alergias y reacciones" hint="Medicamentos, alimentos, otros.">
        <textarea className="pf-input" rows={2} value={v.allergies} onChange={set('allergies')} />
      </Field>
      <Field label="Condiciones médicas" hint="Diagnósticos o enfermedades que te hayan informado.">
        <textarea className="pf-input" rows={2} value={v.medicalConditions} onChange={set('medicalConditions')} />
      </Field>
      <Field label="Medicación actual" hint="Incluí suplementos si los tomás.">
        <textarea className="pf-input" rows={2} value={v.medications} onChange={set('medications')} />
      </Field>
      <div className="pf-row">
        <Field label="Contacto de emergencia" error={errors.emergencyContactName}>
          <input className="pf-input" value={v.emergencyContactName} onChange={set('emergencyContactName')} />
        </Field>
        <Field label="Teléfono del contacto" error={errors.emergencyContactPhone}>
          <input className="pf-input" type="tel" value={v.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
        </Field>
      </div>
      {formError && <p className="pf-error">{formError}</p>}
      <div className="pf-actions">
        {onSkip && (
          <button type="button" className="pf-skip" onClick={onSkip} disabled={busy}>
            Omitir por ahora
          </button>
        )}
        <button type="submit" className="pf-submit" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
