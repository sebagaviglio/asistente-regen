// src/BillingGate.jsx
//
// Envuelve la pantalla de la entrevista y decide qué mostrar según el estado de pagos
// (ver decideGate en billing.js). Con el Worker en modo "off" o "test" no cambia nada
// para nadie; solo en modo "live" manda a elegir plan a quien no tiene acceso.
import { useCallback, useEffect, useState } from 'react';
import { fetchBilling, decideGate } from './billing';
import PlansScreen from './PlansScreen';
import PaymentReturn from './PaymentReturn';

export default function BillingGate({ session, status, children }) {
  const [billing, setBilling] = useState(undefined); // undefined = cargando · null = no se pudo consultar
  const token = session.access_token;

  useEffect(() => {
    let alive = true;
    fetchBilling(token).then((b) => alive && setBilling(b));
    return () => {
      alive = false;
    };
  }, [token]);

  const onBilling = useCallback((b) => setBilling(b), []);

  const screen = decideGate({
    billing,
    pathname: window.location.pathname,
    search: window.location.search,
  });

  if (screen === 'loading') {
    return (
      <div className="ra-app">
        <p className="ra-ficha__empty" style={{ textAlign: 'center', marginTop: 80 }}>
          Cargando…
        </p>
      </div>
    );
  }
  if (screen === 'return') return <PaymentReturn session={session} onBilling={onBilling} />;
  if (screen === 'plans') return <PlansScreen session={session} status={status} billing={billing} />;
  return children;
}
