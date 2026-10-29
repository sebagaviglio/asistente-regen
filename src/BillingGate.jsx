// src/BillingGate.jsx
//
// Envuelve la pantalla de la entrevista y decide qué mostrar según el estado de pagos
// (ver decideGate en billing.js). Con el Worker en modo "off" o "test" no cambia nada
// para nadie; solo en modo "live" manda a elegir plan a quien no tiene acceso.
import { cloneElement, isValidElement, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { fetchBilling, decideGate, activePlanName } from './billing';
import { readInvitation } from './invitation';
import LoadingScreen from './LoadingScreen';
import { useLocation } from './router';

// Planes y vuelta de Mercado Pago no se ven en cada visita: se cargan al abrirlas.
const PlansScreen = lazy(() => import('./PlansScreen'));
const PaymentReturn = lazy(() => import('./PaymentReturn'));

export default function BillingGate({ session, status, children }) {
  const [billing, setBilling] = useState(undefined); // undefined = cargando · null = no se pudo consultar
  const token = session.access_token;
  const { pathname, search } = useLocation();

  useEffect(() => {
    let alive = true;
    fetchBilling(token).then((b) => alive && setBilling(b));
    return () => {
      alive = false;
    };
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
