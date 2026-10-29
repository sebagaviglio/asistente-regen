// src/LoadingScreen.jsx
// «Cargando…» de pantalla completa, mientras llegan datos o el código de una pantalla.
export default function LoadingScreen() {
  return (
    <div className="ra-app">
      <p className="ra-ficha__empty" style={{ textAlign: 'center', marginTop: 80 }}>
        Cargando…
      </p>
    </div>
  );
}
