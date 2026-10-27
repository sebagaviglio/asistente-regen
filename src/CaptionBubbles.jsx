// src/CaptionBubbles.jsx
//
// Las últimas intervenciones de la llamada en burbujas: el asistente en fondo
// papel con borde, la persona en salvia oscuro. Se actualiza con la transcripción
// en vivo; no hay textos fijos.

export default function CaptionBubbles({ items = [], reserve = false }) {
  if (!items.length && !reserve) return null;
  return (
    <div className={`ra-subs ${reserve ? 'ra-subs--reserve' : ''}`} role="log" aria-live="polite" aria-label="Subtítulos de la conversación">
      {items.map((c) => (
        <div key={c.id} className={`ra-sub ra-sub--${c.who}`}>
          <small>{c.who === 'a' ? 'Asistente' : 'Vos'}</small>
          {c.text}
        </div>
      ))}
    </div>
  );
}
