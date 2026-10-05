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
  borrador: 'En curso',
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
                      {iv.motivo_consulta ? iv.motivo_consulta.slice(0, 80) : 'Sin motivo registrado todavía'}
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

function InterviewDetail({ data, onBack, session }) {
  const { interview, redFlags } = data;
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
