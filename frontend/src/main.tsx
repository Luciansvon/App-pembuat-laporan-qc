import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './pages/QcApp'
import './styles.css'
import './workspace.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable while the local server is online.
    })
  })
}

