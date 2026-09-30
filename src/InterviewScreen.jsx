// src/InterviewScreen.jsx
import { useCallback, useRef, useState } from 'react';
import { RealtimeSession } from '@openai/agents-realtime';
import { VoiceBeam } from 'voice-glow';
import { supabase } from './supabaseClient';
import { buildInterviewAgent } from './interviewAgent';
import './App.css';

const WORKER_URL = 'https://regen-agente.sebagaviglio.workers.dev';

const REDFLAG_REPLIES = {
  salud_mental:
    'Lamento que estés pasando por esto y me importa lo que estás sintiendo. Esto excede lo que puedo acompañar desde acá, y lo más importante ahora es que hables con alguien preparado para ayudarte. En Argentina podés llamar a Salud Mental Responde al 0800-999-0091, en cualquier momento. Si sentís que estás en riesgo inmediato, llamá al 107 o al 911. No estás solo en esto.',
  emergencia:
    'Por lo que describís, esto puede ser una urgencia y no es algo que deba resolverse por chat. Llamá ya al 107 (SAME) o al 911, o pedile a alguien cerca que te acompañe a una guardia. Tu seguridad es lo primero.',
};

const CONSENT_TEXT =
  'Para preparar tu primera consulta necesitamos registrar información sobre tu salud (motivo de consulta, antecedentes, hábitos). Es un dato sensible protegido por la Ley 25.326: se usa exclusivamente para tu atención en REGEN, con acceso restringido al equipo profesional, y podés pedir que se elimine cuando quieras.';

export default function InterviewScreen({ session: authSession }) {
  const realtimeSessionRef = useRef(null);
  const interviewIdRef = useRef(null);

  // 'idle' | 'need-name' | 'need-consent' | 'connecting' | 'live' | 'redflag' | 'ended'
  const [phase, setPhase] = useState('idle');
  const [redFlagCategory, setRedFlagCategory] = useState(null);
  const [fullName, setFullName] = useState('');
  const [onboardError, setOnboardError] = useState(null);
  const [onboardLoading, setOnboardLoading] = useState(false);

  const accessToken = authSession.access_token;

  const authedFetch = useCallback(
    (path, body) =>
      fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    [accessToken]
  );

  const handleHardRedFlag = useCallback(
    (category, endInterview) => {
      realtimeSessionRef.current?.close();
      setRedFlagCategory({ category, endInterview });
      setPhase('redflag');

      const utterance = new SpeechSynthesisUtterance(REDFLAG_REPLIES[category]);
      utterance.lang = 'es-AR';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      if (endInterview && interviewIdRef.current) {
        authedFetch('/realtime/end', { interviewId: interviewIdRef.current }).catch(() => {});
      }
    },
    [authedFetch]
  );

  const connectRealtime = useCallback(
    async (sessionData) => {
      interviewIdRef.current = sessionData.interviewId;
      const agent = buildInterviewAgent({
        interviewId: sessionData.interviewId,
        accessToken,
        workerUrl: WORKER_URL,
        patientFullName: sessionData.patientFullName,
        priorInterviews: sessionData.priorInterviews,
        onHardRedFlag: handleHardRedFlag,
      });
      const rtSession = new RealtimeSession(agent, { model: sessionData.model });
      await rtSession.connect({ apiKey: sessionData.clientSecret });
      realtimeSessionRef.current = rtSession;

      // Sin esto, el modelo espera a que el paciente hable primero (por el
      // turn_detection con VAD) — pero nuestras instrucciones le piden que
      // SE PRESENTE primero. Disparamos la respuesta inicial a mano.
      rtSession.transport.sendEvent({ type: 'response.create' });

      setPhase('live');
    },
    [accessToken, handleHardRedFlag]
  );

  const startCall = useCallback(async () => {
    setPhase('connecting');
    try {
      const res = await authedFetch('/realtime/session');
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'NO_PATIENT') {
          setPhase('need-name');
          return;
        }
        if (data.code === 'CONSENT_REQUIRED') {
          setPhase('need-consent');
          return;
        }
        alert(data.error || 'No pudimos iniciar la entrevista.');
        setPhase('idle');
        return;
      }

      await connectRealtime(data);
    } catch (err) {
      console.error(err);
      alert('No pudimos conectar la llamada. Probá de nuevo.');
      setPhase('idle');
    }
  }, [authedFetch, connectRealtime]);

  const submitName = useCallback(
    async (e) => {
      e.preventDefault();
      setOnboardError(null);
      setOnboardLoading(true);
      try {
        const res = await authedFetch('/patients/register', { fullName });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setOnboardError(data.error || 'No pudimos guardar tu nombre.');
          return;
        }
        await startCall(); // reintenta — ahora debería pasar a need-consent
      } finally {
        setOnboardLoading(false);
      }
    },
    [authedFetch, fullName, startCall]
  );

  const submitConsent = useCallback(async () => {
    setOnboardError(null);
    setOnboardLoading(true);
    try {
      const res = await authedFetch('/consent', { granted: true });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOnboardError(data.error || 'No pudimos guardar tu consentimiento.');
        return;
      }
      await startCall(); // reintenta — ahora debería conectar
    } finally {
      setOnboardLoading(false);
    }
  }, [authedFetch, startCall]);

  const endCall = useCallback(() => {
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    if (interviewIdRef.current) {
      authedFetch('/realtime/end', { interviewId: interviewIdRef.current }).catch(() => {});
    }
    setPhase('ended');
  }, [authedFetch]);

  const isLive = phase === 'live';
  const isConnecting = phase === 'connecting';

  function handleMicTap() {
    if (phase === 'idle' || phase === 'ended') {
      interviewIdRef.current = null;
      setRedFlagCategory(null);
      startCall();
    } else if (isLive) {
      endCall();
    }
  }

  let statusText = 'Tocá para empezar a hablar';
  if (isConnecting) statusText = 'Conectando…';
  if (isLive) statusText = 'Escuchándote…';
  if (phase === 'ended') statusText = 'Entrevista finalizada — tocá para empezar de nuevo';

  return (
    <div className="ra-app">
      <header className="ra-topbar">
        <div className="ra-brand">
          <span className="ra-brand__eyebrow">Asistente de bienestar</span>
          <span className="ra-brand__word">Regen</span>
        </div>
        <div className="ra-topbar__right">
          <a className="ra-ficha-link" href="/mi-ficha">
            Mi ficha médica
          </a>
          <button type="button" className="ra-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <main className="ra-stage">
        {phase === 'need-name' && (
          <form className="ra-onboard" onSubmit={submitName}>
            <p className="ra-tagline">Antes de arrancar</p>
            <p className="ra-hint">¿Cómo te llamás?</p>
            <input
              className="ra-onboard__input"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre y apellido"
            />
            {onboardError && <p className="ra-auth__error">{onboardError}</p>}
            <button type="submit" className="ra-redflag__continue" disabled={onboardLoading}>
              {onboardLoading ? 'Un momento…' : 'Continuar'}
            </button>
          </form>
        )}

        {phase === 'need-consent' && (
          <div className="ra-onboard">
            <p className="ra-tagline">Antes de arrancar</p>
            <p className="ra-redflag__text">{CONSENT_TEXT}</p>
            {onboardError && <p className="ra-auth__error">{onboardError}</p>}
            <button
              type="button"
              className="ra-redflag__continue"
              onClick={submitConsent}
              disabled={onboardLoading}
            >
              {onboardLoading ? 'Un momento…' : 'Acepto, continuar'}
            </button>
          </div>
        )}

        {phase === 'redflag' && (
          <div className="ra-redflag">
            <p className="ra-redflag__text">{REDFLAG_REPLIES[redFlagCategory?.category]}</p>
            {!redFlagCategory?.endInterview && (
              <button type="button" className="ra-redflag__continue" onClick={handleMicTap}>
                Continuar la entrevista
              </button>
            )}
          </div>
        )}

        {(phase === 'idle' || phase === 'connecting' || phase === 'live' || phase === 'ended') && (
          <>
            <p className="ra-tagline">Entrevista de primera consulta</p>
            <p className="ra-hint">
              Tocá el micrófono y contame sobre vos — esto prepara tu primera consulta presencial.
            </p>
          </>
        )}
      </main>

      {(phase === 'idle' || phase === 'connecting' || phase === 'live' || phase === 'ended') && (
        <div className="ra-dock">
          <VoiceBeam
            processing={isConnecting || isLive}
            type="default"
            colorVariant="forest"
            theme="light"
          >
            <div className={`ra-voicebar ${isLive ? 'is-live' : ''}`}>
              <span className="ra-voicebar__status">{statusText}</span>
              <button
                type="button"
                className="ra-voicebar__mic"
                onClick={handleMicTap}
                disabled={isConnecting}
                aria-label={isLive ? 'Terminar' : 'Empezar a hablar'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            </div>
          </VoiceBeam>
        </div>
      )}
    </div>
  );
}
