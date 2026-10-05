// src/InterviewScreen.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents-realtime';
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

function buildTranscriptText(history) {
  return history
    .filter((item) => item.type === 'message')
    .map((item) => {
      const speaker = item.role === 'assistant' ? 'Asistente' : 'Paciente';
      const text = (item.content || [])
        .map((c) => {
          if (c.type === 'text') return c.text;
          if (c.type === 'output_audio' || c.type === 'input_audio') return c.transcript || '';
          return '';
        })
        .filter(Boolean)
        .join(' ');
      return text ? `${speaker}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
}

export default function InterviewScreen({ session: authSession, onNeedsOnboarding }) {
  const realtimeSessionRef = useRef(null);
  const interviewIdRef = useRef(null);
  const historyRef = useRef([]);
  const micStreamRef = useRef(null);
  const [micWarning, setMicWarning] = useState(null);
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(
    () => localStorage.getItem('regen_mic_device_id') || ''
  );

  const refreshMicDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter((d) => d.kind === 'audioinput'));
    } catch {
      setMicDevices([]);
    }
  }, []);

  useEffect(() => {
    refreshMicDevices();
    // Los labels suelen quedar vacíos hasta que el navegador otorgó permiso
    // de mic al menos una vez — una vez que eso pasa, 'devicechange' (o un
    // refresh manual) ya los trae completos.
    navigator.mediaDevices.addEventListener?.('devicechange', refreshMicDevices);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refreshMicDevices);
  }, [refreshMicDevices]);

  function handleMicDeviceChange(e) {
    const id = e.target.value;
    setSelectedMicId(id);
    localStorage.setItem('regen_mic_device_id', id);
  }

  // 'idle' | 'connecting' | 'live' | 'redflag' | 'ended'
  // (el registro y el consentimiento ya no pasan por acá: los resuelve el
  // asistente de registro de App.jsx antes de mostrar esta pantalla)
  const [phase, setPhase] = useState('idle');
  const [redFlagCategory, setRedFlagCategory] = useState(null);
  // null = todavía no sabemos; evita mostrar el título equivocado un instante
  const [hasHistory, setHasHistory] = useState(null);

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

  useEffect(() => {
    authedFetch('/patients/me/interviews')
      .then((res) => res.json())
      .then((data) => setHasHistory((data.interviews || []).length > 0))
      .catch(() => setHasHistory(false)); // ante la duda, mostramos el modo "primera vez" (más conservador)
  }, [authedFetch]);

  const handleHardRedFlag = useCallback(
    (category, endInterview) => {
      realtimeSessionRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setRedFlagCategory({ category, endInterview });
      setPhase('redflag');

      const utterance = new SpeechSynthesisUtterance(REDFLAG_REPLIES[category]);
      utterance.lang = 'es-AR';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      if (endInterview && interviewIdRef.current) {
        const rawText = buildTranscriptText(historyRef.current);
        authedFetch('/realtime/end', { interviewId: interviewIdRef.current }).catch(() => {});
        if (rawText) {
          authedFetch('/realtime/save-transcript', { interviewId: interviewIdRef.current, rawText }).catch(() => {});
        }
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
        isFirstTime: sessionData.isFirstTime,
        knownProfile: sessionData.knownProfile,
        priorInterviewsCount: sessionData.priorInterviewsCount,
        lastInterviewDate: sessionData.lastInterviewDate,
        profile: sessionData.profile,
        latestReadings: sessionData.latestReadings,
        onHardRedFlag: handleHardRedFlag,
      });
      // Pedimos el micrófono NOSOTROS (en vez de dejar que el SDK lo pida
      // con sus valores por defecto), para: (a) activar cancelación de eco
      // y supresión de ruido explícitas, y (b) poder detectar si el
      // dispositivo es Bluetooth y avisar — los auriculares Bluetooth
      // (AirPods incluidos) bajan de calidad al usar el micrófono
      // simultáneamente con el audio (protocolo HFP), algo que ninguna
      // configuración de nuestro lado puede evitar, solo avisar.
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;
      refreshMicDevices(); // ahora que hay permiso, trae los labels reales para la próxima vez

      const micLabel = micStream.getAudioTracks()[0]?.label || '';
      console.log('[REGEN realtime] micLabel:', JSON.stringify(micLabel));
      if (/airpods|bluetooth|wireless|hands-free|hfp/i.test(micLabel)) {
        setMicWarning('La conexión por Bluetooth puede bajar un poco la calidad de la llamada.');
      } else {
        setMicWarning(null);
      }

      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      const transport = new OpenAIRealtimeWebRTC({ mediaStream: micStream, audioElement });

      // La config de audio va ACÁ, en el constructor — no mandada después
      // con sendEvent. Con WebRTC, connect() espera la confirmación
      // (session.updated) de esta config ANTES de dejar fluir audio, así
      // que no hay ventana donde el audio use la config vieja por defecto.
      // - semantic_vad + eagerness 'low': espera más confianza antes de
      //   decidir que el paciente "terminó de hablar" — reduce los cortes
      //   por ruido ambiente o voces de fondo que no son el paciente.
      // - noiseReduction near_field: filtra ruido antes del VAD, pensado
      //   para auriculares/mic cercano.
      const rtSession = new RealtimeSession(agent, {
        transport,
        model: sessionData.model,
        config: {
          audio: {
            input: {
              turnDetection: { type: 'semantic_vad', eagerness: 'low' },
              noiseReduction: { type: 'near_field' },
            },
          },
        },
      });

      // Diagnóstico: loguea cada evento crudo de la sesión en la consola
      // del navegador, para poder VER técnicamente qué pasa en una llamada
      // (cuántas veces se detecta "empezó a hablar"/"dejó de hablar", y si
      // el modelo se corta) en vez de solo juzgarlo de oído.
      rtSession.on('transport_event', (event) => {
        if (event.type === 'session.updated') {
          // Expandido a texto completo a propósito: así se puede ver el
          // valor real de turn_detection.type y confirmar si semantic_vad
          // quedó aplicado de verdad, sin depender de expandir el objeto
          // colapsado de la consola.
          console.log(
            '[REGEN realtime] session.updated — turn_detection:',
            JSON.stringify(event.session?.audio?.input?.turn_detection, null, 2),
            '— noise_reduction:',
            JSON.stringify(event.session?.audio?.input?.noise_reduction, null, 2)
          );
        }
        if (
          [
            'input_audio_buffer.speech_started',
            'input_audio_buffer.speech_stopped',
            'response.created',
            'response.done',
            'response.cancelled',
            'error',
          ].includes(event.type)
        ) {
          console.log('[REGEN realtime]', event.type, event);
        }
      });

      rtSession.on('history_updated', (history) => {
        historyRef.current = history;
      });

      await rtSession.connect({ apiKey: sessionData.clientSecret });
      realtimeSessionRef.current = rtSession;

      // Sin esto, el modelo espera a que el paciente hable primero (por el
      // turn_detection con VAD) — pero nuestras instrucciones le piden que
      // SE PRESENTE primero. Disparamos la respuesta inicial a mano.
      rtSession.transport.sendEvent({ type: 'response.create' });

      setPhase('live');
    },
    [accessToken, handleHardRedFlag, selectedMicId, refreshMicDevices]
  );

  const startCall = useCallback(async () => {
    setPhase('connecting');
    try {
      const res = await authedFetch('/realtime/session');
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'NO_PATIENT' || data.code === 'CONSENT_REQUIRED') {
          // Falta completar el registro o aceptar la versión vigente del
          // consentimiento: App.jsx vuelve a consultar el estado y muestra
          // el asistente de registro en el paso que corresponda.
          setPhase('idle');
          onNeedsOnboarding?.();
          return;
        }
        alert(data.error || 'No pudimos iniciar la entrevista.');
        setPhase('idle');
        return;
      }

      await connectRealtime(data);
    } catch (err) {
      console.error(err);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      alert('No pudimos conectar la llamada. Probá de nuevo.');
      setPhase('idle');
    }
  }, [authedFetch, connectRealtime, onNeedsOnboarding]);

  const endCall = useCallback(() => {
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (interviewIdRef.current) {
      const rawText = buildTranscriptText(historyRef.current);
      authedFetch('/realtime/end', { interviewId: interviewIdRef.current }).catch(() => {});
      if (rawText) {
        authedFetch('/realtime/save-transcript', { interviewId: interviewIdRef.current, rawText }).catch(() => {});
      }
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
          <span className="ra-brand__eyebrow">
            {hasHistory ? 'Tu asistente REGEN' : 'Asistente de bienestar'}
          </span>
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
            <p className="ra-tagline">
              {hasHistory ? 'Hablá con tu asistente REGEN' : 'Entrevista de primera consulta'}
            </p>
            <p className="ra-hint">
              {hasHistory
                ? 'Tocá el micrófono para seguir la conversación — ya conoce tu historial.'
                : 'Tocá el micrófono y contame sobre vos — esto prepara tu primera consulta presencial.'}
            </p>
            {micWarning && <p className="ra-hint ra-hint--warning">{micWarning}</p>}
            {phase === 'idle' && micDevices.length > 1 && (
              <label className="ra-mic-select">
                <span>Micrófono</span>
                <select value={selectedMicId} onChange={handleMicDeviceChange}>
                  <option value="">Por defecto del sistema</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Micrófono (${d.deviceId.slice(0, 6)}…)`}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
