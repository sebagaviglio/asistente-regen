// src/PlansScreen.jsx
//
// Elegir plan y pagar. Se muestra:
//   - en /planes (siempre, para poder probarlo), y
//   - como filtro antes de la entrevista, SOLO si el Worker está en modo "live" y la
//     persona no tiene una suscripción con acceso (ver decideGate en billing.js).
//
// El pago ocurre en el sitio de Mercado Pago: la app nunca ve datos de tarjeta.
// Core y Activo muestran precio; Elite no (botón "Quiero ser Elite", cupos limitados).
// Texto de los planes: describe lo que incluyen, sin prometer resultados.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { makeApi, ageFromISO } from './api';
import { fetchPlans, planView, checkoutErrorMessage, validateCoupon, couponView } from './billing';
import { TERMS_VERSION, TERMS_SECTIONS } from './termsText';
import './App.css';
import './Billing.css';

const OPEN_STATUSES = ['activa', 'en_mora', 'pausada', 'cortesia'];

// Aviso según el estado de la suscripción de la persona.
function subscriptionNotice(sub, entitlement) {
  if (!sub) return null;
  if (sub.status === 'activa' || sub.status === 'cortesia') {
    return { tone: 'ok', text: `Ya tenés el plan ${sub.planName} activo.` };
  }
  if (sub.status === 'en_mora') {
    const expired = entitlement && entitlement.reason === 'grace_expired';
    return {
      tone: 'warn',
      text: expired
        ? 'No pudimos cobrar tu suscripción y pasó el período de gracia, por eso las llamadas están suspendidas. Revisá tu medio de pago en Mercado Pago (sección Suscripciones): cuando se regularice, se reactiva sola. Tu ficha sigue disponible.'
        : 'No pudimos cobrar tu suscripción. Mercado Pago lo va a reintentar solo. Mientras tanto seguís usando el servicio unos días.',
    };
  }
  if (sub.status === 'pausada') {
    return { tone: 'warn', text: 'Tu suscripción está pausada. Podés reactivarla desde Mercado Pago (sección Suscripciones).' };
  }
  if (sub.status === 'cancelada' || sub.status === 'vencida') {
    return { tone: 'info', text: 'Tu suscripción terminó. Podés elegir un plan para volver. Tu ficha sigue disponible.' };
  }
  return null;
}

function EliteCard({ view, api, disabled }) {
  const [phase, setPhase] = useState('idle'); // idle | open | sending | sent
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  async function send() {
    setPhase('sending');
    setError(null);
    const { ok, data } = await api.post('/elite/request', { message: message.trim() || undefined });
    if (!ok) {
      setPhase('open');
      setError(data?.code === 'MINOR' ? 'Por ahora el servicio es solo para mayores de 18 años.' : data?.error || 'No pudimos enviar tu pedido. Probá de nuevo.');
      return;
    }
    setPhase('sent');
  }

  return (
    <article className="bl-card bl-card--elite">
      <header className="bl-card__head">
        <h2 className="bl-card__title">{view.title}</h2>
        <span className="bl-badge">{view.note}</span>
      </header>
      <ul className="bl-list">
        {view.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>

      {phase === 'idle' && (
        <button type="button" className="bl-btn bl-btn--ghost" disabled={disabled} onClick={() => setPhase('open')}>
          Quiero ser Elite
        </button>
      )}
      {(phase === 'open' || phase === 'sending') && (
        <div className="bl-elite-form">
          <label className="pf-field">
            <span className="pf-field__label">¿Algo que quieras contarnos? (opcional)</span>
            <textarea
              className="pf-input"
              rows={3}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <span className="pf-field__hint">Por favor, no escribas acá datos de salud. Un integrante del equipo te va a contactar.</span>
          </label>
          {error && <p className="pf-error">{error}</p>}
          <div className="pf-actions">
            <button type="button" className="pf-skip" onClick={() => setPhase('idle')} disabled={phase === 'sending'}>
              Cancelar
            </button>
            <button type="button" className="pf-submit" onClick={send} disabled={phase === 'sending'}>
              {phase === 'sending' ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </div>
        </div>
      )}
      {phase === 'sent' && <p className="pf-notice">Recibimos tu pedido. Un integrante del equipo de REGEN te va a contactar.</p>}
    </article>
  );
}

function PlanCard({ item, selected, onSelect, blocked, paid }) {
  const { plan, view } = item;
  const isSel = selected === plan.key;
  return (
    <article className={`bl-card ${isSel ? 'is-selected' : ''}`}>
      <header className="bl-card__head">
        <h2 className="bl-card__title">{view.title}</h2>
        {paid && <span className="bl-badge bl-badge--ok">Pagado ✓</span>}
      </header>
      <p className="bl-price">
        {view.price}
        <span className="bl-price__note"> {view.note}</span>
      </p>
      <ul className="bl-list">
        {view.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      {!paid && (
        <button
          type="button"
          className={`bl-btn ${isSel ? 'bl-btn--on' : ''}`}
          disabled={blocked}
          aria-pressed={isSel}
          onClick={() => onSelect(isSel ? null : plan.key)}
        >
          {isSel ? 'Elegido ✓' : 'Elegir'}
        </button>
      )}
    </article>
  );
}

export default function PlansScreen({ session, status, billing, redirect = (url) => window.location.assign(url) }) {
  const api = useMemo(() => makeApi(session.access_token), [session.access_token]);
  const [plans, setPlans] = useState(undefined); // undefined = cargando · null = error
  const [selected, setSelected] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Cupón: se verifica contra el Worker para mostrar el precio; recién se "gasta" al pagar.
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { code, offer }
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchPlans().then((p) => alive && setPlans(p));
    return () => {
      alive = false;
    };
  }, []);

  const age = ageFromISO(status?.profile?.birthDate);
  const isMinor = age !== null && age < 18;
  const paymentsOff = billing?.paymentsEnabled === false;
  const sub = billing?.subscription || null;
  const hasOpenSub = !!sub && OPEN_STATUSES.includes(sub.status);
  const diagnosticoPaid = billing?.diagnostico?.status === 'pagada';
  const notice = subscriptionNotice(sub, billing?.entitlement);

  const views = (plans || []).map((p) => ({ plan: p, view: planView(p) }));
  const find = (key) => views.find((v) => v.plan.key === key);
  const subscriptionPlans = ['core', 'activo'].map(find).filter(Boolean);
  const elite = find('elite');
  const diagnostico = find('diagnostico');
  const selectedView = selected ? find(selected) : null;

  const selectedKind = selectedView ? selectedView.plan.kind : null;

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    if (!selected) {
      setCouponError('Elegí primero un plan para aplicar el cupón.');
      return;
    }
    setCouponBusy(true);
    setCouponError(null);
    const res = await validateCoupon(session.access_token, selected, code);
    setCouponBusy(false);
    if (!res.ok) {
      setCouponError(res.message);
      return;
    }
    setCoupon({ code, offer: res.offer });
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput('');
    setCouponError(null);
  }

  // Si la persona cambia de plan, el cupón se vuelve a verificar para el plan nuevo.
  const couponCode = coupon ? coupon.code : null;
  useEffect(() => {
    if (!couponCode || !selected) return undefined;
    let alive = true;
    validateCoupon(session.access_token, selected, couponCode).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setCoupon({ code: couponCode, offer: res.offer });
        setCouponError(null);
      } else {
        setCoupon(null);
        setCouponError(res.message);
      }
    });
    return () => {
      alive = false;
    };
    // Solo al cambiar de plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function pay() {
    if (!selected || !accepted) return;
    setBusy(true);
    setError(null);
    const body = { planKey: selected, termsVersion: TERMS_VERSION };
    if (coupon) body.couponCode = coupon.code;
    const { ok, data } = await api.post('/checkout', body);
    if (ok && data?.free) {
      // Cupón de acceso sin costo: no hay pago. Se vuelve por la pantalla de confirmación.
      const kind = data.kind === 'order' ? 'diagnostico' : 'suscripcion';
      redirect(`/?pago=${kind}&ref=${data.orderId || data.subscriptionId}`);
      return;
    }
    if (ok && data?.checkoutUrl) {
      redirect(data.checkoutUrl); // se va al sitio de Mercado Pago
      return;
    }
    setBusy(false);
    setError(checkoutErrorMessage(data));
    if (typeof data?.code === 'string' && data.code.startsWith('COUPON_')) setCoupon(null); // el cupón ya no sirve
  }

  const offerView = coupon && selectedKind ? couponView(coupon.offer, selectedKind) : null;

  const blocked = isMinor || paymentsOff || hasOpenSub;
  const payLabel = !selectedView
    ? 'Elegí un plan'
    : offerView
      ? offerView.payLabel
      : selected === 'diagnostico'
        ? `Pagar ${selectedView.view.price}`
        : `Suscribirme por ${selectedView.view.price} al mes`;

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

      <main className="bl-main">
        <h1 className="ob-title">Elegí tu plan</h1>
        <p className="ob-lead">Cada plan describe lo que incluye. Los precios son finales, con impuestos incluidos.</p>

        {notice && <p className={`bl-notice bl-notice--${notice.tone}`}>{notice.text}</p>}
        {isMinor && (
          <p className="bl-notice bl-notice--warn">
            Por ahora la suscripción es solo para mayores de 18 años. Tu ficha médica sigue disponible.
          </p>
        )}
        {paymentsOff && <p className="bl-notice bl-notice--info">Los pagos todavía no están habilitados.</p>}

        {plans === undefined && <p className="ra-hint">Cargando planes…</p>}
        {plans === null && <p className="pf-error">No pudimos cargar los planes. Probá de nuevo en unos minutos.</p>}

        {plans && (
          <>
            <section className="bl-grid" aria-label="Planes">
              {subscriptionPlans.map((item) => (
                <PlanCard key={item.plan.key} item={item} selected={selected} onSelect={setSelected} blocked={blocked} paid={false} />
              ))}
              {elite && <EliteCard view={elite.view} api={api} disabled={isMinor} />}
            </section>

            {diagnostico && (
              <section className="bl-extra" aria-label="Diagnóstico inicial">
                <p className="bl-extra__lead">
                  ¿No tenés análisis recientes? El Diagnóstico inicial no es obligatorio, pero te permite empezar con tus resultados
                  al día.
                </p>
                <PlanCard item={diagnostico} selected={selected} onSelect={setSelected} blocked={blocked} paid={diagnosticoPaid} />
              </section>
            )}

            <section className="bl-pay">
              <details className="bl-terms">
                <summary>Leer los Términos y Condiciones</summary>
                {TERMS_SECTIONS.map((s) => (
                  <div key={s.title}>
                    <h3>{s.title}</h3>
                    {s.paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                ))}
              </details>
              <div className="bl-coupon">
                {!couponOpen && !coupon && (
                  <button type="button" className="bl-link" disabled={blocked} onClick={() => setCouponOpen(true)}>
                    ¿Tenés un cupón?
                  </button>
                )}
                {couponOpen && !coupon && (
                  <div className="bl-coupon__row">
                    <input
                      className="pf-input bl-coupon__input"
                      aria-label="Código del cupón"
                      placeholder="REGEN-XXXX-XXXX"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      value={couponInput}
                      disabled={blocked || couponBusy}
                      onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyCoupon();
                        }
                      }}
                    />
                    <button type="button" className="bl-btn bl-coupon__apply" disabled={blocked || couponBusy || !couponInput.trim()} onClick={applyCoupon}>
                      {couponBusy ? 'Verificando…' : 'Aplicar'}
                    </button>
                  </div>
                )}
                {couponError && <p className="pf-error" role="alert">{couponError}</p>}
                {coupon && offerView && (
                  <div className="bl-coupon__ok" role="status">
                    <strong>{offerView.headline}</strong>
                    <span>{offerView.detail}</span>
                    <button type="button" className="bl-link" onClick={removeCoupon}>
                      Quitar cupón
                    </button>
                  </div>
                )}
              </div>
              <label className="ob-check">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={blocked} />
                <span>Leí y acepto los Términos y Condiciones.</span>
              </label>
              {error && <p className="pf-error">{error}</p>}
              <button type="button" className="pf-submit" disabled={!selected || !accepted || busy || blocked} onClick={pay}>
                {busy ? 'Abriendo Mercado Pago…' : payLabel}
              </button>
              <p className="bl-fine">
                Vas a pagar en el sitio de Mercado Pago. REGEN no recibe ni guarda los datos de tu tarjeta.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
