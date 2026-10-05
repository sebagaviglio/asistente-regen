// src/BiomarkerEvolution.jsx
//
// "Mi evolución": evolutivo de biomarcadores del paciente + carga de mediciones.
//
// Criterio de presentación: se muestran valores, fechas y el rango de
// referencia que informó el laboratorio (como banda neutra). La pantalla NO
// etiqueta nada como normal/alterado ni usa colores de "bueno/malo": la
// interpretación es del profesional.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeApi, todayLocalISO } from './api';
import TrendChart from './TrendChart';
import './TrendChart.css';
import './Evolution.css';

const CATEGORY_ORDER = [
  'corporal',
  'signos_vitales',
  'metabolico',
  'lipidico',
  'inflamatorio',
  'micronutrientes',
  'hormonal',
  'composicion',
  'funcional',
  'epigenetico',
];

const CATEGORY_LABELS = {
  corporal: 'Mediciones corporales',
  signos_vitales: 'Signos vitales',
  metabolico: 'Metabólico',
  lipidico: 'Perfil lipídico',
  inflamatorio: 'Inflamación',
  micronutrientes: 'Micronutrientes',
  hormonal: 'Hormonal',
  composicion: 'Composición corporal',
  funcional: 'Función física',
  epigenetico: 'Envejecimiento biológico',
};

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusLabel(r) {
  if (r.verified) return 'Verificada por el equipo';
  if (r.enteredByType === 'patient') return 'Cargada por vos · sin verificar';
  return 'Cargada por el equipo';
}

function rangeText(low, high, unit, decimals) {
  const f = (v) => Number(v).toFixed(decimals);
  if (low !== null && high !== null) return `${f(low)} – ${f(high)} ${unit}`;
  if (low !== null) return `≥ ${f(low)} ${unit}`;
  if (high !== null) return `≤ ${f(high)} ${unit}`;
  return null;
}

export default function BiomarkerEvolution({ session }) {
  const api = useMemo(() => makeApi(session.access_token), [session.access_token]);
  const [types, setTypes] = useState([]);
  const [readings, setReadings] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    const [cat, rd] = await Promise.all([api.post('/biomarkers/catalog'), api.post('/biomarkers/readings')]);
    if (!cat.ok || !rd.ok) {
      setError(rd.data?.error || cat.data?.error || 'No pudimos cargar tus mediciones.');
      setReadings((prev) => prev || []);
      return;
    }
    setTypes(cat.data.types);
    setReadings(rd.data.readings);
    setError(null);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const byType = {};
    for (const r of readings || []) (byType[r.typeKey] ||= []).push(r);
    const byCat = {};
    for (const t of types) {
      if (!byType[t.key]) continue;
      (byCat[t.category] ||= []).push({ type: t, items: byType[t.key] });
    }
    return byCat;
  }, [readings, types]);

  async function remove(r) {
    if (!window.confirm('¿Borrar esta medición?')) return;
    const { ok, data } = await api.post('/biomarkers/readings/delete', { readingId: r.id });
    if (!ok) {
      setError(data?.error || 'No pudimos borrar la medición.');
      return;
    }
    load();
  }

  const hasAny = readings && readings.length > 0;

  return (
    <div className="ev-wrap">
      <p className="ra-tagline">Mi evolución</p>
      <p className="ra-hint">Tus mediciones y análisis a lo largo del tiempo.</p>
      <p className="ev-disclaimer">
        Los rangos de referencia los informa cada laboratorio y son orientativos. Esta pantalla no interpreta resultados:
        la lectura la hace tu profesional.
      </p>

      {error && <p className="ev-error">{error}</p>}

      {!showAdd && (
        <button type="button" className="ev-add-btn" onClick={() => setShowAdd(true)} disabled={!types.length}>
          + Agregar medición
        </button>
      )}
      {showAdd && (
        <AddReadingPanel
          types={types}
          api={api}
          onCancel={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {readings === null && <p className="ra-ficha__empty">Cargando…</p>}
      {readings && !hasAny && !error && (
        <p className="ra-ficha__empty">Todavía no hay mediciones. Cargá la primera con el botón de arriba.</p>
      )}

      {CATEGORY_ORDER.filter((c) => grouped[c]).map((cat) => (
        <section key={cat} className="ev-cat">
          <h3 className="ev-cat__title">{CATEGORY_LABELS[cat]}</h3>
          {grouped[cat].map(({ type, items }) => {
            const latest = items[items.length - 1];
            const useOwn = latest.refLow !== null || latest.refHigh !== null;
            const refLow = useOwn ? latest.refLow : type.defaultRefLow;
            const refHigh = useOwn ? latest.refHigh : type.defaultRefHigh;
            const rText = rangeText(refLow, refHigh, type.unit, type.decimals);
            return (
              <article key={type.key} className="ev-card">
                <div className="ev-card__top">
                  <h4 className="ev-card__name">{type.label}</h4>
                  <div className="ev-card__value">
                    {Number(latest.value).toFixed(type.decimals)} <span>{type.unit}</span>
                  </div>
                </div>
                <p className="ev-card__meta">
                  Última medición: {fmtDate(latest.measuredAt)} · {statusLabel(latest)}
                </p>
                <TrendChart
                  points={items.map((r) => ({ date: r.measuredAt, value: r.value, verified: r.verified }))}
                  unit={type.unit}
                  decimals={type.decimals}
                  refLow={refLow}
                  refHigh={refHigh}
                  label={type.label}
                />
                <p className="ev-legend">● verificada por el equipo &nbsp; ○ cargada por vos, sin verificar</p>
                {rText && (
                  <p className="ev-range">
                    Rango de referencia {useOwn ? 'del último análisis' : 'orientativo'}: {rText}
                  </p>
                )}
                <button type="button" className="ev-toggle" onClick={() => setOpen((o) => ({ ...o, [type.key]: !o[type.key] }))}>
                  {open[type.key] ? 'Ocultar mediciones' : `Ver mediciones (${items.length})`}
                </button>
                {open[type.key] && (
                  <ul className="ev-list">
                    {[...items].reverse().map((r) => (
                      <li key={r.id} className="ev-list__item">
                        <div>
                          <strong>
                            {Number(r.value).toFixed(type.decimals)} {type.unit}
                          </strong>{' '}
                          · {fmtDate(r.measuredAt)}
                          <div className="ev-list__sub">
                            {statusLabel(r)}
                            {rangeText(r.refLow, r.refHigh, type.unit, type.decimals) &&
                              ` · Ref.: ${rangeText(r.refLow, r.refHigh, type.unit, type.decimals)}`}
                            {r.notes && ` · ${r.notes}`}
                          </div>
                        </div>
                        {r.enteredByType === 'patient' && !r.verified && (
                          <button type="button" className="ev-del" onClick={() => remove(r)} aria-label="Borrar medición">
                            Borrar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function AddReadingPanel({ types, api, onCancel, onDone }) {
  const [typeKey, setTypeKey] = useState('body_mass');
  const [value, setValue] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [date, setDate] = useState(todayLocalISO());
  const [refLow, setRefLow] = useState('');
  const [refHigh, setRefHigh] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const type = types.find((t) => t.key === typeKey);
  const isBP = typeKey === 'blood_pressure_systolic';
  const cats = CATEGORY_ORDER.filter((c) => types.some((t) => t.category === c));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const readings = [{ typeKey, value, measuredAt: date, refLow, refHigh, notes }];
    if (isBP) {
      readings.push({ typeKey: 'blood_pressure_diastolic', value: diastolic, measuredAt: date, notes });
    }
    const { ok, data } = await api.post('/biomarkers/readings/add', { readings });
    setBusy(false);
    if (!ok) {
      setError(data?.problems ? data.problems.map((p) => p.error).join(' ') : data?.error || 'No pudimos guardar la medición.');
      return;
    }
    onDone();
  }

  return (
    <form className="ev-panel pf-form" onSubmit={submit}>
      <label className="pf-field">
        <span className="pf-field__label">¿Qué querés cargar?</span>
        <select className="pf-input" value={typeKey} onChange={(e) => setTypeKey(e.target.value)}>
          {cats.map((c) => (
            <optgroup key={c} label={CATEGORY_LABELS[c]}>
              {types
                .filter((t) => t.category === c && t.key !== 'blood_pressure_diastolic')
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key === 'blood_pressure_systolic' ? 'Presión arterial' : t.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="pf-row">
        <label className="pf-field">
          <span className="pf-field__label">
            {isBP ? 'Sistólica' : 'Valor'} {type ? `(${type.unit})` : ''}
          </span>
          <input className="pf-input" type="number" inputMode="decimal" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        {isBP && (
          <label className="pf-field">
            <span className="pf-field__label">Diastólica (mmHg)</span>
            <input className="pf-input" type="number" inputMode="decimal" step="any" min="0" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} required />
          </label>
        )}
        <label className="pf-field">
          <span className="pf-field__label">Fecha de la medición</span>
          <input className="pf-input" type="date" value={date} max={todayLocalISO()} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      <details className="ev-details">
        <summary>Rango de referencia y notas (opcional)</summary>
        <div className="pf-row">
          <label className="pf-field">
            <span className="pf-field__label">Referencia mínima</span>
            <input className="pf-input" type="number" inputMode="decimal" step="any" value={refLow} onChange={(e) => setRefLow(e.target.value)} />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Referencia máxima</span>
            <input className="pf-input" type="number" inputMode="decimal" step="any" value={refHigh} onChange={(e) => setRefHigh(e.target.value)} />
          </label>
        </div>
        <p className="pf-field__hint">Es el rango que figura en el informe de tu laboratorio, si lo tenés.</p>
        <label className="pf-field">
          <span className="pf-field__label">Notas</span>
          <input className="pf-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: Laboratorio Central, en ayunas" maxLength={500} />
        </label>
      </details>

      {error && <p className="pf-error">{error}</p>}
      <div className="pf-actions">
        <button type="button" className="pf-skip" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="pf-submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar medición'}
        </button>
      </div>
    </form>
  );
}
