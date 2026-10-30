import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tipografías de la marca, dentro de la app (no se bajan de internet: sin demora al abrir y también andan sin conexión).
import '@fontsource/dm-sans/latin-300.css'
import '@fontsource/dm-sans/latin-300-italic.css'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/bodoni-moda/latin-400.css'
import '@fontsource/cormorant/latin-400-italic.css'
import './index.css'
// Todo el CSS va en la carga inicial (≈5 KB gzip), en este orden: así la cascada
// es la misma para todas las pantallas, aunque su JS se cargue recién al abrirlas.
// Varias pantallas comparten clases (pf-*, ra-*) definidas en más de un archivo.
import './AuthForm.css'
import './App.css'
import './Onboarding.css'
import './Interview.css'
import './InterviewThread.css'
import './TrendChart.css'
import './Evolution.css'
import './FichaScreen.css'
import './Billing.css'
import App from './App.jsx'
import { captureInvitationFromUrl } from './invitation.js'
import { IS_PRODUCTION } from './config.js'

captureInvitationFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {!IS_PRODUCTION && (
      <div className="ra-env-banner" role="status">
        Entorno de prueba · no cargues datos reales
      </div>
    )}
    <App />
  </StrictMode>,
)
