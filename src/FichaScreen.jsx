// src/FichaScreen.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import InterviewThread from './InterviewThread';
import BiomarkerEvolution from './BiomarkerEvolution';
import ProfilePanel from './ProfilePanel';
import './FichaScreen.css';
import './Evolution.css';

const WORKER_URL = 'https://regen-agente.sebagaviglio.workers.dev';

const STATUS_LABELS = {
  borrador: 'Incompleta · se retoma',
  pendiente_validacion: 'Pendiente de revisión',
  validada: 'Revisada por el equipo',
};

const BLOCK_LABELS = {
  motivo_consulta: 'Motivo de consulta',
  antecedentes: 'Antecedentes',
  medicacion_actual: 'Medicación actual',
  habitos_ejercicio: 'Ejercicio',
  habitos_nutricion: 'Nutrición',
  habitos_sueno: 'Sueño',
  habitos_estres: 'Estrés',
  habitos_vinculos: 'Vínculos',
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function FichaScreen({ session, status, onProfileChanged }) {
  const [tab, setTab] = useState('entrevistas'); // 'entrevistas' | 'evolucion' | 'perfil'
  const [interviews, setInterviews] = useState(null); // null = cargando
  const [selected, setSelected] = useState(null); // detalle abierto
  const [loadingDetail, setLoadingDetail] = useState(false);

  const accessToken = session.access_token;

  useEffect(() => {
    fetch(`${WORKER_URL}/patients/me/interviews`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => setInterviews(data.interviews || []))
      .catch(() => setInterviews([]));
  }, [accessToken]);

  async function openDetail(interviewId) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${WORKER_URL}/patients/me/interview-detail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ interviewId }),
      });
      const data = await res.json();
      setSelected(data);
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="ra-app">
      <header className="ra-topbar">
        <div className="ra-brand">
          <span className="ra-brand__eyebrow">Asistente de bienestar</span>
          <span className="ra-brand__word">Regen</span>
        </div>
        <div className="ra-topbar__right">
          <a className="ra-ficha-link" href="/">
            Volver a la entrevista
          </a>
          <button type="button" className="ra-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <main className="ra-ficha">
        <div className="ra-tabs" role="tablist">
          {[
            ['entrevistas', 'Mis entrevistas'],
            ['evolucion', 'Mi evolución'],
            ['perfil', 'Mi perfil'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`ra-tab ${tab === key ? 'is-active' : ''}`}
              onClick={() => {
                setTab(key);
                setSelected(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'evolucion' && <BiomarkerEvolution session={session} />}
        {tab === 'perfil' && <ProfilePanel session={session} status={status} onChanged={onProfileChanged} />}

        {tab === 'entrevistas' && (selected ? (
          <InterviewDetail data={selected} onBack={() => setSelected(null)} session={session} />
        ) : (
          <>
            <p className="ra-tagline">Mi ficha médica</p>
            <p className="ra-hint">Tus entrevistas de primera consulta con REGEN.</p>

            {status?.intake && !status.intake.complete && (
              <div className="ra-ficha__banner" role="status">
                <p>
                  <strong>
                    Te {status.intake.pendingCount === 1 ? 'falta 1 dato' : `faltan ${status.intake.pendingCount} datos`}
                  </strong>{' '}
                  para completar tu historia clínica. Tu ficha se envía al equipo cuando esté completa.
                </p>
                <ul className="ra-pending">
                  {[...status.intake.missingWritten, ...status.intake.pending].map((p) => (
                    <li key={p.key}>{p.label}</li>
                  ))}
                </ul>
                <a className="ra-ficha-link" href="/">
                  Seguir completándola
                </a>
              </div>
            )}

            {interviews === null && <p className="ra-ficha__empty">Cargando…</p>}
            {interviews && interviews.length === 0 && (
              <p className="ra-ficha__empty">Todavía no hiciste ninguna entrevista.</p>
            )}

            <ul className="ra-ficha__list">
              {interviews?.map((iv) => (
                <li key={iv.id}>
                  <button type="button" className="ra-ficha__item" onClick={() => openDetail(iv.id)}>
                    <span className="ra-ficha__item-date">{formatDate(iv.started_at)}</span>
                    <span className="ra-ficha__item-status" data-status={iv.status}>
                      {STATUS_LABELS[iv.status] || iv.status}
                    </span>
                    <span className="ra-ficha__item-preview">
                      {iv.session_reason
                        ? iv.session_reason.slice(0, 120)
                        : iv.has_summary
                          ? 'Entrevista sin motivo específico'
                          : 'Preparando el resumen de esta entrevista…'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ))}

        {loadingDetail && <p className="ra-ficha__empty">Cargando…</p>}
      </main>
    </div>
  );
}

// Lo conversado en ESTA entrevista (lo genera el Worker desde la transcripción de la sesión).
function SessionSummaryBlock({ summary }) {
  if (!summary) {
    return (
      <div className="ra-ficha-detail__block ra-ficha-detail__summary">
        <h3>Resumen de esta entrevista</h3>
        <p>Estamos preparando el resumen. Volvé a abrir esta entrevista en unos minutos.</p>
      </div>
    );
  }
  return (
    <div className="ra-ficha-detail__block ra-ficha-detail__summary">
      <h3>Resumen de esta entrevista</h3>
      {summary.reason && <p className="ra-ficha-detail__summary-reason">{summary.reason}</p>}
      {summary.resumen?.length > 0 && (
        <ul>
          {summary.resumen.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {summary.novedades?.length > 0 && (
        <>
          <h4>Novedades desde la entrevista anterior</h4>
          <ul>
            {summary.novedades.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {summary.pedido && (
        <>
          <h4>Lo que le pediste a REGEN</h4>
          <p>{summary.pedido}</p>
        </>
      )}
    </div>
  );
}

function InterviewDetail({ data, onBack, session }) {
  const { interview, redFlags, files, summary } = data;
  if (!interview) return <p className="ra-ficha__empty">No pudimos cargar esta entrevista.</p>;

  return (
    <div className="ra-ficha-detail">
      <button type="button" className="ra-ficha-detail__back" onClick={onBack}>
        ← Volver a la lista
      </button>

      <p className="ra-tagline">{formatDate(interview.started_at)}</p>
      <span className="ra-ficha__item-status" data-status={interview.status}>
        {STATUS_LABELS[interview.status] || interview.status}
      </span>

      {redFlags?.length > 0 && (
        <div className="ra-ficha-detail__flags">
          {redFlags.map((f, i) => (
            <p key={i} className="ra-ficha-detail__flag">
              Se detectó una señal de <strong>{f.category.replace('_', ' ')}</strong> durante esta entrevista
              {f.derived_to ? ` y se derivó a: ${f.derived_to}.` : '.'}
            </p>
          ))}
        </div>
      )}

      <SessionSummaryBlock summary={summary} />

      <details className="ra-ficha-detail__record">
        <summary>Mi ficha acumulada hasta esta entrevista</summary>
        <p className="ra-ficha-detail__record-note">
          Son los datos que fuiste completando con el tiempo, no lo conversado solo en esta entrevista.
        </p>
        <div className="ra-ficha-detail__blocks">
          {Object.entries(BLOCK_LABELS).map(([key, label]) =>
            interview[key] ? (
              <div key={key} className="ra-ficha-detail__block">
                <h3>{label}</h3>
                <p>{interview[key]}</p>
              </div>
            ) : null
          )}
        </div>
      </details>

      {files?.length > 0 && <FilesList files={files} accessToken={session.access_token} />}

      {interview.validation_notes && (
        <div className="ra-ficha-detail__block ra-ficha-detail__block--validation">
          <h3>Notas del equipo REGEN</h3>
          <p>{interview.validation_notes}</p>
        </div>
      )}

      <InterviewThread interviewId={interview.id} accessToken={session.access_token} currentSenderType="patient" />
    </div>
  );
}

const KIND_LABELS = { imagen: 'Imagen', documento: 'Documento' };

// Los archivos que el paciente mostró durante la llamada. Se abren con su sesión
// (el Worker verifica que sean suyos), no con un link público.
function FilesList({ files, accessToken }) {
  const [error, setError] = useState(null);

  async function open(file) {
    setError(null);
    try {
      const res = await fetch(`${WORKER_URL}/interview/file?key=${encodeURIComponent(file.r2Key)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('no se pudo abrir');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      setError('No pudimos abrir el archivo. Probá de nuevo.');
    }
  }

  return (
    <div className="ra-ficha-detail__block ra-ficha-files">
      <h3>Archivos que mostraste</h3>
      <ul className="ra-ficha-files__list">
        {files.map((f) => (
          <li key={f.id}>
            <div>
              <strong>{f.fileName}</strong>{' '}
              <span className="ra-ficha-files__kind">{KIND_LABELS[f.kind] || f.kind}</span>
              {f.analyzed && f.description ? <p>{f.description}</p> : <p>Lo va a revisar el equipo.</p>}
            </div>
            <button type="button" onClick={() => open(f)}>
              Ver
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="pf-error">{error}</p>}
    </div>
  );
}
