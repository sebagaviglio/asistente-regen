// src/PaymentReturn.jsx
//
// A donde vuelve la persona desde Mercado Pago:
//   /?pago=suscripcion&ref=<id>
//   /?pago=diagnostico&ref=<id>&estado=ok|error|pendiente
//
// El aviso de Mercado Pago llega al Worker unos segundos después de la vuelta, así que
// se consulta el estado cada 3 segundos (hasta 1 minuto) antes de dar el pago por hecho.
// Nunca se confía en el parámetro de la URL: solo en lo que confirma el Worker.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { fetchBilling, isPaymentConfirmed } from './billing';
import './App.css';
import './Onboarding.css';

const INTERVAL_MS = 3000;
const MAX_TRIES = 20;

export default function PaymentReturn({ session, onBilling }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const kind = params.get('pago'); // 'suscripcion' | 'diagnostico'
  const ref = params.get('ref');
  const failedAtMp = kind === 'diagnostico' && params.get('estado') === 'error';

  const [phase, setPhase] = useState(failedAtMp ? 'failed' : 'checking'); // checking | ok | waiting | failed
  const [attempt, setAttempt] = useState(0);
  const token = session.access_token;

  useEffect(() => {
    if (failedAtMp) return undefined;
    let alive = true;
    let tries = 0;
    let timer;
    const tick = async () => {
      const billing = await fetchBilling(token);
      if (!alive) return;
      if (isPaymentConfirmed(billing, kind, ref)) {
        onBilling?.(billing);
        setPhase('ok');
        return;
      }
      tries += 1;
      if (tries >= MAX_TRIES) {
        setPhase('waiting');
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt, failedAtMp, kind, ref, token, onBilling]);

  const isSub = kind === 'suscripcion';

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
        <div className="ob-card" role="status" aria-live="polite">
          {phase === 'checking' && (
            <>
              <h1 className="ob-title">Confirmando tu pago…</h1>
              <p className="ob-lead">Esto tarda unos segundos. No cierres esta página.</p>
            </>
          )}

          {phase === 'ok' && (
            <>
              <h1 className="ob-title">{isSub ? '¡Listo! Tu suscripción está activa.' : 'Recibimos el pago de tu Diagnóstico inicial.'}</h1>
              <p className="ob-lead">
                {isSub
                  ? 'Ya podés empezar tu entrevista con el asistente. Te vamos a enviar el comprobante por email.'
                  : 'Te vamos a enviar el comprobante por email. Ahora podés elegir tu plan para seguir.'}
              </p>
              <button type="button" className="pf-submit" onClick={() => window.location.assign(isSub ? '/' : '/planes')}>
                {isSub ? 'Empezar mi entrevista' : 'Ver planes'}
              </button>
            </>
          )}

          {phase === 'waiting' && (
            <>
              <h1 className="ob-title">Todavía no vemos confirmado tu pago</h1>
              <p className="ob-lead">
                Si ya pagaste, puede demorar unos minutos en acreditarse: te avisamos por email. Si cancelaste el pago, podés volver a
                intentarlo.
              </p>
              <div className="pf-actions">
                <button type="button" className="pf-skip" onClick={() => window.location.assign('/planes')}>
                  Volver a los planes
                </button>
                <button
                  type="button"
                  className="pf-submit"
                  onClick={() => {
                    setPhase('checking');
                    setAttempt((n) => n + 1);
                  }}
                >
                  Revisar de nuevo
                </button>
              </div>
            </>
          )}

          {phase === 'failed' && (
            <>
              <h1 className="ob-title">No se pudo completar el pago</h1>
              <p className="ob-lead">Podés intentarlo de nuevo cuando quieras.</p>
              <button type="button" className="pf-submit" onClick={() => window.location.assign('/planes')}>
                Volver a los planes
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
