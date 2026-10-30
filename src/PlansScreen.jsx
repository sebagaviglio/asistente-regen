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
//
// App de iPhone: los planes Core y Activo solo se muestran (sin botón de compra ni links de pago), porque
// Apple puede considerarlos contenido digital. Siguen funcionando la invitación con acceso sin costo y el
// Diagnóstico inicial, que se cobra con Mercado Pago como servicio físico y clínico. Web y Android: sin cambios.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { makeApi, ageFromISO } from './api';
import { fetchPlans, planView, checkoutErrorMessage, validateCoupon, couponView } from './billing';
import { TERMS_VERSION, TERMS_SECTIONS } from './termsText';
import { clearInvitation, inviteErrorMessage } from './invitation';
import Link from './Link';
import { navigate } from './router';
import { nativePlatform, openExternal } from './platform';
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

function PlanCard({ item, selected, onSelect, blocked, paid, selectable = true }) {
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
      {!paid && selectable && (
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

// Invitación Elite: el código crea un pedido prioritario; el equipo contacta a la persona.
function EliteInvitation({ invitation, api, disabled, onDone }) {
  const [phase, setPhase] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(null);

  async function redeem() {
    setPhase('sending');
    setError(null);
    const { ok, data } = await api.post('/invitations/redeem-elite', { code: invitation.code });
    if (!ok) {
      setPhase('idle');
      setError(inviteErrorMessage(data));
      return;
    }
    clearInvitation();
    setPhase('sent');
  }

  return (
    <section className="bl-card bl-card--elite" aria-label="Invitación Elite">
      <header className="bl-card__head">
        <h2 className="bl-card__title">Tu invitación a REGEN Elite</h2>
      </header>
      {phase !== 'sent' ? (
        <>
          <p className="ob-lead">Activala y un integrante del equipo de REGEN se pone en contacto con vos con prioridad.</p>
          {error && <p className="pf-error">{error}</p>}
          <div className="pf-actions">
            <button type="button" className="pf-skip" onClick={onDone} disabled={phase === 'sending'}>
              Ahora no
            </button>
            <button type="button" className="pf-submit" onClick={redeem} disabled={disabled || phase === 'sending'}>
              {phase === 'sending' ? 'Activando…' : 'Activar mi invitación'}
            </button>
          </div>
        </>
      ) : (
        <p className="pf-notice">Recibimos tu invitación. Un integrante del equipo de REGEN te va a contactar.</p>
      )}
    </section>
  );
}

export default function PlansScreen({ session, status, billing, invitation = null, redirect = openExternal, iosStore = nativePlatform() === 'ios' }) {
  const api = useMemo(() => makeApi(session.access_token), [session.access_token]);
  // Invitación Core/Activo: arranca con el plan elegido y el código cargado.
  const invPlan = invitation && invitation.plan !== 'elite' ? invitation.plan : null;
  const invCode = invPlan ? invitation.code : null;
  const [plans, setPlans] = useState(undefined); // undefined = cargando · null = error
  const [selected, setSelected] = useState(invPlan);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Cupón: se verifica contra el Worker para mostrar el precio; recién se "gasta" al pagar.
  const [couponOpen, setCouponOpen] = useState(!!invPlan);
  const [couponInput, setCouponInput] = useState(invCode || '');
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

  // Con los planes cargados, aplica el código de la invitación.
  useEffect(() => {
    if (!invPlan || !Array.isArray(plans)) return undefined;
    let alive = true;
    validateCoupon(session.access_token, invPlan, invCode).then((res) => {
      if (!alive) return;
      if (res.ok) setCoupon({ code: invCode, offer: res.offer });
      else setCouponError(res.message);
    });
    return () => {
      alive = false;
    };
    // Una sola vez, cuando cargan los planes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, invPlan, invCode]);

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
    if (!selected || !accepted || storeBlocked) return;
    setBusy(true);
    setError(null);
    const body = { planKey: selected, termsVersion: TERMS_VERSION };
    if (coupon) body.couponCode = coupon.code;
    const { ok, data } = await api.post('/checkout', body);
    if (ok && data?.free) {
      // Cupón de acceso sin costo: no hay pago. Se vuelve por la pantalla de confirmación.
      const kind = data.kind === 'order' ? 'diagnostico' : 'suscripcion';
      clearInvitation();
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
  // En la app de iPhone una suscripción solo se activa si no hay que pagar nada (invitación o cupón sin costo).
  const storeBlocked = iosStore && selectedKind === 'subscription' && !(offerView && offerView.free);

  const blocked = isMinor || paymentsOff || hasOpenSub;
  const payLabel = !selectedView
    ? 'Elegí un plan'
    : storeBlocked
      ? 'Este plan no se contrata desde la app'
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
          <Link className="ra-ficha-link" to="/mi-ficha">
            Mi ficha médica
          </Link>
          <button type="button" className="ra-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <main className="bl-main">
        <h1 className="ob-title">Elegí tu plan</h1>
        <p className="ob-lead">Cada plan describe lo que incluye. Los precios son finales, con impuestos incluidos.</p>

        {iosStore && (
          <p className="bl-notice bl-notice--info">
            Acá ves lo que incluye cada plan. Si ya tenés un plan activo o una invitación de REGEN, ingresá con tu cuenta.
          </p>
        )}
        {notice && <p className={`bl-notice bl-notice--${notice.tone}`}>{notice.text}</p>}
        {isMinor && (
          <p className="bl-notice bl-notice--warn">
            Por ahora la suscripción es solo para mayores de 18 años. Tu ficha médica sigue disponible.
          </p>
        )}
        {paymentsOff && <p className="bl-notice bl-notice--info">Los pagos todavía no están habilitados.</p>}

        {invitation && invitation.plan === 'elite' && (
          <EliteInvitation
            invitation={invitation}
            api={api}
            disabled={isMinor}
            onDone={() => {
              clearInvitation();
              navigate('/');
            }}
          />
        )}
        {invPlan && <p className="bl-notice bl-notice--ok">Tenés una invitación a REGEN {invPlan === 'core' ? 'Core' : 'Activo'}. Revisá el plan y confirmá para activarla.</p>}

        {plans === undefined && <p className="ra-hint">Cargando planes…</p>}
        {plans === null && <p className="pf-error">No pudimos cargar los planes. Probá de nuevo en unos minutos.</p>}

        {plans && (
          <>
            <section className="bl-grid" aria-label="Planes">
              {subscriptionPlans.map((item) => (
                <PlanCard
                  key={item.plan.key}
                  item={item}
                  selected={selected}
                  onSelect={setSelected}
                  blocked={blocked}
                  paid={false}
                  selectable={!iosStore || invPlan === item.plan.key}
                />
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
              <button type="button" className="pf-submit" disabled={!selected || !accepted || busy || blocked || storeBlocked} onClick={pay}>
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
