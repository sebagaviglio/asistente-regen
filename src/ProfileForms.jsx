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
    address: initial.address || '',
    city: initial.city || '',
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
      <Field label="DNI" hint="Solo números, sin puntos." error={errors.dni}>
        <input className="pf-input" inputMode="numeric" value={v.dni} onChange={set('dni')} required />
      </Field>
      <Field label="Domicilio" hint="Calle y número." error={errors.address}>
        <input className="pf-input" value={v.address} onChange={set('address')} autoComplete="street-address" required />
      </Field>
      <Field label="Localidad" error={errors.city}>
        <input className="pf-input" value={v.city} onChange={set('city')} autoComplete="address-level2" required />
      </Field>
      {formError && <p className="pf-error">{formError}</p>}
      <button type="submit" className="pf-submit" disabled={busy}>
        {busy ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}

const emptyMed = () => ({ name: '', dose: '' });

export function HealthForm({
  initial = {},
  showMeasurements = false,
  onSubmit,
  submitLabel = 'Guardar',
  busy,
  errors = {},
  formError,
}) {
  const initialMeds = Array.isArray(initial.medicationsList) ? initial.medicationsList : [];
  const [v, setV] = useState({
    heightCm: '',
    weightKg: '',
    bloodType: initial.bloodType || '',
    allergies: initial.allergies || '',
    allergiesNone: !!initial.allergiesNone,
    medicalConditions: initial.medicalConditions || '',
    medicationsNone: !!initial.medicationsNone,
    medicationsList: initialMeds.length ? initialMeds.map((m) => ({ ...m })) : [emptyMed()],
    emergencyContactName: initial.emergencyContactName || '',
    emergencyContactPhone: initial.emergencyContactPhone || '',
  });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setMed = (i, k) => (e) =>
    setV((p) => ({ ...p, medicationsList: p.medicationsList.map((m, j) => (j === i ? { ...m, [k]: e.target.value } : m)) }));
  const addMed = () => setV((p) => ({ ...p, medicationsList: [...p.medicationsList, emptyMed()] }));
  const removeMed = (i) =>
    setV((p) => {
      const next = p.medicationsList.filter((_, j) => j !== i);
      return { ...p, medicationsList: next.length ? next : [emptyMed()] };
    });

  // Validación mínima en el cliente (el servidor vuelve a validar todo).
  const [localErrors, setLocalErrors] = useState({});
  function submit(e) {
    e.preventDefault();
    const err = {};
    if (!v.allergiesNone && !v.allergies.trim()) err.allergies = 'Contanos tus alergias, o marcá que no tenés ninguna.';
    const meds = v.medicationsList.filter((m) => m.name.trim() || m.dose.trim());
    if (!v.medicationsNone) {
      if (!meds.length) err.medications = 'Cargá tu medicación (nombre y dosis), o marcá que no tomás ninguna.';
      else if (meds.some((m) => !m.name.trim() || !m.dose.trim()))
        err.medications = 'Cada medicación necesita nombre y dosis.';
    }
    if (!v.emergencyContactName.trim()) err.emergencyContactName = 'Ingresá un contacto de emergencia.';
    if (!v.emergencyContactPhone.trim()) err.emergencyContactPhone = 'Ingresá su teléfono.';
    setLocalErrors(err);
    if (Object.keys(err).length) return;
    onSubmit({
      heightCm: v.heightCm,
      weightKg: v.weightKg,
      bloodType: v.bloodType,
      medicalConditions: v.medicalConditions,
      allergiesNone: v.allergiesNone,
      allergies: v.allergiesNone ? '' : v.allergies,
      medicationsNone: v.medicationsNone,
      medicationsList: v.medicationsNone ? [] : meds.map((m) => ({ name: m.name.trim(), dose: m.dose.trim() })),
      emergencyContactName: v.emergencyContactName,
      emergencyContactPhone: v.emergencyContactPhone,
    });
  }
  const err = { ...localErrors, ...errors };

  return (
    <form className="pf-form" onSubmit={submit}>
      {showMeasurements && (
        <div className="pf-row">
          <Field label="Altura (cm) · opcional" error={err.heightCm}>
            <input className="pf-input" type="number" inputMode="decimal" step="0.1" min="50" max="250" value={v.heightCm} onChange={set('heightCm')} />
          </Field>
          <Field label="Peso (kg) · opcional" error={err.weightKg}>
            <input className="pf-input" type="number" inputMode="decimal" step="0.1" min="2" max="400" value={v.weightKg} onChange={set('weightKg')} />
          </Field>
        </div>
      )}
      <Field label="Grupo sanguíneo · opcional" error={err.bloodType}>
        <select className="pf-input" value={v.bloodType} onChange={set('bloodType')}>
          <option value="">No lo sé</option>
          {BLOOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="pf-group">
        <legend className="pf-field__label">Alergias y reacciones</legend>
        <label className="ob-check">
          <input
            type="checkbox"
            checked={v.allergiesNone}
            onChange={(e) => setV((p) => ({ ...p, allergiesNone: e.target.checked }))}
          />
          <span>No tengo alergias conocidas</span>
        </label>
        {!v.allergiesNone && (
          <Field label="" hint="Medicamentos, alimentos, otros." error={err.allergies}>
            <textarea className="pf-input" rows={2} value={v.allergies} onChange={set('allergies')} aria-label="Alergias y reacciones" />
          </Field>
        )}
      </fieldset>

      <Field label="Condiciones médicas · opcional" hint="Diagnósticos o enfermedades que te hayan informado. Lo vemos con más detalle en la entrevista.">
        <textarea className="pf-input" rows={2} value={v.medicalConditions} onChange={set('medicalConditions')} />
      </Field>

      <fieldset className="pf-group">
        <legend className="pf-field__label">Medicación actual</legend>
        <label className="ob-check">
          <input
            type="checkbox"
            checked={v.medicationsNone}
            onChange={(e) => setV((p) => ({ ...p, medicationsNone: e.target.checked }))}
          />
          <span>No tomo ninguna medicación</span>
        </label>
        {!v.medicationsNone && (
          <>
            <p className="pf-field__hint">Escribila tal como figura en la caja. Incluí suplementos si los tomás.</p>
            {v.medicationsList.map((m, i) => (
              <div className="pf-row pf-med" key={i}>
                <input
                  className="pf-input"
                  placeholder="Nombre (ej.: Levotiroxina)"
                  aria-label={`Medicación ${i + 1}: nombre`}
                  value={m.name}
                  onChange={setMed(i, 'name')}
                />
                <input
                  className="pf-input"
                  placeholder="Dosis (ej.: 50 mcg por día)"
                  aria-label={`Medicación ${i + 1}: dosis`}
                  value={m.dose}
                  onChange={setMed(i, 'dose')}
                />
                {v.medicationsList.length > 1 && (
                  <button type="button" className="pf-skip" onClick={() => removeMed(i)} aria-label={`Quitar medicación ${i + 1}`}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
            {err.medications && <span className="pf-field__error">{err.medications}</span>}
            <button type="button" className="pf-skip" onClick={addMed}>
              + Agregar otra
            </button>
          </>
        )}
      </fieldset>

      <div className="pf-row">
        <Field label="Contacto de emergencia" error={err.emergencyContactName}>
          <input className="pf-input" value={v.emergencyContactName} onChange={set('emergencyContactName')} required />
        </Field>
        <Field label="Teléfono del contacto" error={err.emergencyContactPhone}>
          <input className="pf-input" type="tel" value={v.emergencyContactPhone} onChange={set('emergencyContactPhone')} required />
        </Field>
      </div>
      {formError && <p className="pf-error">{formError}</p>}
      <div className="pf-actions">
        <button type="submit" className="pf-submit" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
