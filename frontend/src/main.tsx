import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './pages/QcApp'
import './styles.css'
import './workspace.css'
import './redesign.css'
import './copilot.css'
import { isAndroidApp } from './services/android'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext && !isAndroidApp()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable while the local server is online.
    })
  })
}

if (isAndroidApp() && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => {})
}

