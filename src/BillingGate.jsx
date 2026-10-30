// src/BillingGate.jsx
//
// Envuelve la pantalla de la entrevista y decide qué mostrar según el estado de pagos
// (ver decideGate en billing.js). Con el Worker en modo "off" o "test" no cambia nada
// para nadie; solo en modo "live" manda a elegir plan a quien no tiene acceso.
import { cloneElement, isValidElement, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { fetchBilling, decideGate, activePlanName } from './billing';
import { readInvitation } from './invitation';
import LoadingScreen from './LoadingScreen';
import { cacheKey, peek, put } from './swr';
import { useLocation } from './router';

// Planes y vuelta de Mercado Pago no se ven en cada visita: se cargan al abrirlas.
const PlansScreen = lazy(() => import('./PlansScreen'));
const PaymentReturn = lazy(() => import('./PaymentReturn'));

export default function BillingGate({ session, status, children }) {
  // undefined = cargando · null = no se pudo consultar. Se arranca con lo último que se supo (se vuelve a consultar enseguida).
  const [billing, setBilling] = useState(() => peek(cacheKey(session, 'billing')));
  const token = session.access_token;
  const { pathname, search } = useLocation();

  useEffect(() => {
    let alive = true;
    const load = () => fetchBilling(token).then((b) => alive && setBilling(b ? put(cacheKey(session, 'billing'), b) : b));
    load();
    // En la app, al volver del pago en el navegador del sistema se vuelve a consultar el estado.
    window.addEventListener('regen:app-resume', load);
    return () => {
      alive = false;
      window.removeEventListener('regen:app-resume', load);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onBilling = useCallback((b) => setBilling(b), []);

  const screen = decideGate({ billing, pathname, search });

  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'return') return withFallback(<PaymentReturn session={session} onBilling={onBilling} />);
  // Quien llega con una invitación ve primero sus planes, aunque los pagos todavía no bloqueen a nadie.
  const invitation = readInvitation();
  if (screen === 'plans' || (invitation && billing)) {
    return withFallback(<PlansScreen session={session} status={status} billing={billing} invitation={invitation} />);
  }
  // La entrevista muestra el plan activo en un chip: se lo pasamos sin tocar nada más.
  const planName = activePlanName(billing);
  return planName && isValidElement(children) ? cloneElement(children, { planName }) : children;
}

function withFallback(screen) {
  return <Suspense fallback={<LoadingScreen />}>{screen}</Suspense>;
}
