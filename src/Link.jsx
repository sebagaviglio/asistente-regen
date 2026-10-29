// src/Link.jsx
//
// Link interno: se ve y se comporta como un <a>, pero navega sin recargar la página (ver router.js).
// Con Ctrl/Cmd/Shift o el botón del medio deja que el navegador abra la dirección como siempre.
import { navigate } from './router';

export default function Link({ to, onClick, ...rest }) {
  function handleClick(event) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} onClick={handleClick} {...rest} />;
}
