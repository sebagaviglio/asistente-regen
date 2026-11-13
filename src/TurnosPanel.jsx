// src/TurnosPanel.jsx
//
// "Mis turnos" (Mi ficha → Turnos): pedir, ver, reprogramar y cancelar turnos con los
// profesionales de REGEN.
//
// Flujo para pedir un turno: tipo → profesional → día y hora → confirmar.
//  - Si el plan lo cubre, queda confirmado al instante (llega email, y WhatsApp si lo acepta).
//  - Si no, se reserva 15 minutos y se paga con Mercado Pago; al volver, esperamos el aviso
//    del pago y el turno aparece confirmado.
// Los horarios que se ofrecen salen del Google Calendar del profesional (solo los libres).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeApi } from './api';

const money = (n) => `$${Number(n).toLocaleString('es-AR')}`;
const STATUS_LABEL = {
  confirmado: 'Confirmado',
  pendiente_pago: 'Falta el pago',
  atendido: 'Realizado',
  ausente: 'No asististe',
  cancelado: 'Cancelado',
  vencido: 'Reserva vencida',
};

function coverageText(t, paymentsEnabled) {
  if (t.coverage === 'plan') return 'Incluido en tu plan';
  if (t.coverage === 'pago' && paymentsEnabled) return `${money(t.priceArs)} · se paga al reservar`;
  return 'Coordinalo con el equipo';
}

export default function TurnosPanel({ session, redirect = (url) => window.location.assign(url) }) {
  const api = useMemo(() => makeApi(session.access_token), [session.access_token]);
  const [mine, setMine] = useState(null);
  const [options, setOptions] = useState(null);
  const [mode, setMode] = useState('list'); // 'list' | 'new' | { reschedule: appt } | { done: result }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [returning, setReturning] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get('pago') === 'turno' ? { id: q.get('ref'), estado: q.get('estado') } : null;
  });

  const loadMine = useCallback(
    () => api.post('/appointments/mine').then(({ ok, data }) => {
      if (ok) setMine(data);
      else setMine((m) => m || { upcoming: [], past: [] });
      return ok ? data : null;
    }),
    [api]
  );

  useEffect(() => {
    loadMine();
    api.post('/appointments/options').then(({ ok, data }) => ok && setOptions(data));
  }, [api, loadMine]);

  // Vuelta de Mercado Pago: el aviso del pago puede tardar unos segundos en llegar.
  const polls = useRef(0);
  useEffect(() => {
    if (!returning) return;
    window.history.replaceState(null, '', '/mi-ficha?tab=turnos');
    if (returning.estado === 'error') return;
    let timer;
    const check = async () => {
      const d = await loadMine();
      const appt = d?.upcoming.find((a) => a.id === returning.id) || d?.past.find((a) => a.id === returning.id);
      if (appt?.status === 'confirmado' || polls.current >= 10) {
        setReturning(null);
        if (appt?.status === 'confirmado') setNotice('¡Pago recibido! Tu turno está confirmado. Te mandamos los detalles por email.');
        return;
      }
      polls.current += 1;
      timer = setTimeout(check, 3000);
    };
    check();
    return () => clearTimeout(timer);
  }, [returning, loadMine]);

  async function cancel(a) {
    if (!window.confirm(`¿Cancelar tu turno del ${a.dateLabel} a las ${a.timeLabel}?`)) return;
    setError(null);
    const { ok, data } = await api.post('/appointments/cancel', { id: a.id });
    if (!ok) return setError(data?.error || 'No pudimos cancelar el turno.');
    setNotice(a.coveredBy === 'plan' ? 'Turno cancelado. La validación de tu plan vuelve a estar disponible.' : 'Turno cancelado.');
    loadMine();
    api.post('/appointments/options').then(({ ok: o, data: d }) => o && setOptions(d));
  }

  async function pay(a) {
    const { ok, data } = await api.post('/appointments/pay', { id: a.id });
    if (!ok || !data.checkoutUrl) {
      setError(data?.error || 'La reserva venció. Elegí un horario de nuevo.');
      return loadMine();
    }
    redirect(data.checkoutUrl);
  }

  if (mode === 'new' || mode?.reschedule) {
    return (
      <BookingFlow
        api={api}
        options={options}
        reschedule={mode.reschedule || null}
        onCancel={() => setMode('list')}
        onDone={(result) => {
          loadMine();
          api.post('/appointments/options').then(({ ok, data }) => ok && setOptions(data));
          if (result.checkoutUrl) {
            redirect(result.checkoutUrl); // se va al sitio de Mercado Pago
            return;
          }
          setMode({ done: result });
        }}
      />
    );
  }

  if (mode?.done) {
    const a = mode.done.appointment;
    return (
      <div className="tu-card tu-done">
        <p className="ra-tagline">{mode.done.rescheduled ? 'Turno reprogramado' : 'Turno confirmado'}</p>
        <p className="tu-big">{a.dateLabel} · {a.timeLabel} hs</p>
        <p className="ra-hint">{a.type.name} con {a.staff.name}. {a.modality === 'virtual' ? 'Es por videollamada: el link también te llega por email.' : a.location ? `Es en ${a.location}.` : 'Es presencial.'}</p>
        <div className="tu-actions">
          {a.meetUrl && <a className="tu-btn" href={a.meetUrl} target="_blank" rel="noreferrer">Link de la videollamada</a>}
          {mode.done.calendarUrl && <a className="tu-btn tu-btn--ghost" href={mode.done.calendarUrl} target="_blank" rel="noreferrer">Agregar a Google Calendar</a>}
        </div>
        <button type="button" className="pf-submit" onClick={() => setMode('list')}>Ver mis turnos</button>
      </div>
    );
  }

  const v = options?.validations;
  return (
    <>
      <p className="ra-tagline">Mis turnos</p>
      <p className="ra-hint">Encuentros con tu profesional de REGEN, por videollamada o presenciales.</p>
      {v && v.allowed > 0 && (
        <p className="tu-pill">Validaciones de tu plan disponibles: <b>{v.left}</b> de {v.allowed}</p>
      )}
      {returning && returning.estado !== 'error' && <p className="tu-notice">Estamos confirmando tu pago con Mercado Pago…</p>}
      {returning?.estado === 'error' && <p className="tu-error">El pago no se completó. Si todavía estás dentro de los 15 minutos, podés reintentarlo.</p>}
      {notice && <p className="tu-notice">{notice}</p>}
      {error && <p className="tu-error">{error}</p>}

      {options && options.professionals.length === 0 ? (
        <p className="ra-hint">Todavía no hay agenda disponible para pedir turnos online. Escribinos y lo coordinamos.</p>
      ) : (
        <button type="button" className="pf-submit tu-new" disabled={!options} onClick={() => { setNotice(null); setError(null); setMode('new'); }}>
          Pedir un turno
        </button>
      )}

      {mine === null ? (
        <p className="ra-hint">Cargando…</p>
      ) : (
        <>
          {mine.upcoming.length === 0 && <p className="ra-hint">No tenés turnos próximos.</p>}
          {mine.upcoming.map((a) => (
            <article key={a.id} className={`tu-card ${a.status === 'pendiente_pago' ? 'tu-card--wait' : ''}`}>
              <div className="tu-card__top">
                <p className="tu-big">{a.dateLabel} · {a.timeLabel} hs</p>
                <span className={`tu-chip tu-chip--${a.status}`}>{STATUS_LABEL[a.status]}</span>
              </div>
              <p className="ra-hint">{a.type.name} · {a.staff.name} · {a.modality === 'virtual' ? 'Videollamada' : a.location || 'Presencial'}</p>
              <div className="tu-actions">
                {a.status === 'pendiente_pago' && <button type="button" className="tu-btn" onClick={() => pay(a)}>Completar el pago</button>}
                {a.meetUrl && <a className="tu-btn" href={a.meetUrl} target="_blank" rel="noreferrer">Unirme a la videollamada</a>}
                {a.calendarUrl && <a className="tu-btn tu-btn--ghost" href={a.calendarUrl} target="_blank" rel="noreferrer">Agregar al calendario</a>}
                {a.canChange && <button type="button" className="tu-btn tu-btn--ghost" onClick={() => setMode({ reschedule: a })}>Reprogramar</button>}
                {a.canCancel && <button type="button" className="tu-btn tu-btn--ghost tu-danger" onClick={() => cancel(a)}>{a.status === 'pendiente_pago' ? 'Liberar' : 'Cancelar'}</button>}
              </div>
              {a.status === 'confirmado' && !a.canChange && (
                <p className="tu-small">Faltan menos de {options?.policy?.changeLimitHours ?? 24} h: para cambiarlo, escribinos.</p>
              )}
              {a.status === 'confirmado' && a.canChange && a.coveredBy === 'pago' && (
                <p className="tu-small">Este turno ya está pago: si no podés ir, reprogramalo.</p>
              )}
            </article>
          ))}
          {mine.past.length > 0 && (
            <details className="tu-past">
              <summary>Turnos anteriores ({mine.past.length})</summary>
              {mine.past.map((a) => (
                <p key={a.id} className="ra-hint">{a.dateLabel} · {a.timeLabel} — {a.type.name} con {a.staff.name} · {STATUS_LABEL[a.status]}</p>
              ))}
            </details>
          )}
        </>
      )}
    </>
  );
}

// ── Pedir o reprogramar ──────────────────────────────────────────────────
function BookingFlow({ api, options, reschedule, onCancel, onDone }) {
  const [typeId, setTypeId] = useState(reschedule ? reschedule.type.id : null);
  const [staffId, setStaffId] = useState(reschedule ? reschedule.staff.id : null);
  const [slotsRes, setSlotsRes] = useState({ key: null, days: null, error: null });
  const [pick, setPick] = useState({ key: null, day: null, slot: null });
  const [whatsapp, setWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const types = options?.types || [];
  const pros = options?.professionals || [];
  const type = types.find((t) => t.id === typeId) || (reschedule ? { id: reschedule.type.id, name: reschedule.type.name } : null);
  const bookable = (t) => t.coverage === 'plan' || (t.coverage === 'pago' && options?.paymentsEnabled);
  const key = reschedule ? `r:${reschedule.id}` : typeId && staffId ? `${typeId}|${staffId}` : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    api.post('/appointments/slots', reschedule ? { rescheduleId: reschedule.id } : { typeId, staffId }).then(({ ok, data }) => {
      if (alive) setSlotsRes({ key, days: ok ? data.days : [], error: ok ? null : data?.error || 'No pudimos cargar los horarios.' });
    });
    return () => { alive = false; };
  }, [api, key, typeId, staffId, reschedule]);

  const days = slotsRes.key === key ? slotsRes.days : null;
  const day = pick.key === key && pick.day ? pick.day : days?.[0]?.date || null;
  const slot = pick.key === key ? pick.slot : null;
  const dayInfo = days?.find((d) => d.date === day);
  const slotLabel = dayInfo?.times.find((t) => t.startsAt === slot)?.label;

  async function confirm() {
    setBusy(true);
    setError(null);
    const { ok, data } = reschedule
      ? await api.post('/appointments/reschedule', { id: reschedule.id, startsAt: slot })
      : await api.post('/appointments/book', { typeId, staffId, startsAt: slot, notifyWhatsapp: options?.hasPhone && whatsapp });
    setBusy(false);
    if (!ok) {
      setError(data?.error || 'No pudimos reservar el turno.');
      if (data?.code === 'SLOT_TAKEN') setPick({ key, day, slot: null });
      return;
    }
    onDone({ ...data, rescheduled: !!reschedule });
  }

  const step = reschedule ? 3 : !typeId ? 1 : !staffId ? 2 : 3;

  return (
    <div className="tu-flow">
      <div className="tu-flow__head">
        <p className="ra-tagline">{reschedule ? 'Reprogramar turno' : 'Pedir un turno'}</p>
        <button type="button" className="ra-ficha-link tu-link" onClick={onCancel}>Volver</button>
      </div>
      {error && <p className="tu-error">{error}</p>}

      {!reschedule && (
        <section className="tu-step">
          <p className="tu-step__title">1. ¿Qué turno necesitás?</p>
          <div className="tu-options">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tu-option ${typeId === t.id ? 'is-active' : ''}`}
                disabled={!bookable(t)}
                onClick={() => { setTypeId(t.id); setError(null); }}
              >
                <b>{t.name}</b>
                <span>{t.modality === 'virtual' ? 'Videollamada' : 'Presencial'} · {t.durationMin} min</span>
                <span className="tu-cover">{coverageText(t, options?.paymentsEnabled)}</span>
                {t.description && <span className="tu-desc">{t.description}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!reschedule && step >= 2 && (
        <section className="tu-step">
          <p className="tu-step__title">2. ¿Con quién?</p>
          <div className="tu-options tu-options--row">
            {pros.map((p) => (
              <button key={p.id} type="button" className={`tu-option ${staffId === p.id ? 'is-active' : ''}`} onClick={() => setStaffId(p.id)}>
                <b>{p.name}</b>
                {p.assigned && <span className="tu-cover">Tu profesional</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {step >= 3 && (
        <section className="tu-step">
          <p className="tu-step__title">{reschedule ? `Nuevo horario con ${reschedule.staff.name}` : '3. Elegí día y hora'}</p>
          {days === null ? (
            <p className="ra-hint">Buscando horarios libres…</p>
          ) : slotsRes.error ? (
            <p className="tu-error">{slotsRes.error}</p>
          ) : days.length === 0 ? (
            <p className="ra-hint">No hay horarios libres en los próximos 30 días. Probá con otro profesional o escribinos.</p>
          ) : (
            <>
              <div className="tu-days">
                {days.map((d) => (
                  <button key={d.date} type="button" className={`tu-day ${d.date === day ? 'is-active' : ''}`} onClick={() => setPick({ key, day: d.date, slot: null })}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="tu-times">
                {dayInfo?.times.map((t) => (
                  <button key={t.startsAt} type="button" className={`tu-time ${slot === t.startsAt ? 'is-active' : ''}`} onClick={() => setPick({ key, day, slot: t.startsAt })}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="tu-small">Horarios de Córdoba (Argentina).</p>
            </>
          )}
        </section>
      )}

      {slot && (
        <section className="tu-card tu-confirm">
          <p className="tu-big">{dayInfo?.label} · {slotLabel} hs</p>
          <p className="ra-hint">{type?.name}{reschedule ? '' : ` con ${pros.find((p) => p.id === staffId)?.name}`}</p>
          {!reschedule && options?.hasPhone && (
            <label className="tu-check">
              <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
              Quiero recibir la confirmación y los recordatorios por WhatsApp
            </label>
          )}
          {!reschedule && !options?.hasPhone && <p className="tu-small">Si cargás tu celular en «Mi perfil», también te avisamos por WhatsApp.</p>}
          {!reschedule && type?.coverage === 'pago' && (
            <p className="tu-small">Lo guardamos 15 minutos mientras pagás {money(type.priceArs)} con Mercado Pago. Un turno pago se puede reprogramar hasta 24 h antes.</p>
          )}
          <button type="button" className="pf-submit" disabled={busy} onClick={confirm}>
            {busy ? 'Reservando…' : reschedule ? 'Confirmar el cambio' : type?.coverage === 'pago' ? `Ir a pagar ${money(type.priceArs)}` : 'Confirmar turno'}
          </button>
        </section>
      )}
    </div>
  );
}
