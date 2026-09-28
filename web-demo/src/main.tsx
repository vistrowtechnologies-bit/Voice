import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './lib/theme.ts'

// Apply the saved (light by default) theme before React renders its auth gate.
// This eliminates the dark one-frame splash seen while a dashboard session is
// being restored, without changing the public-site visual system.
applyTheme(getStoredTheme(), false)

// Vercel Web Analytics gets the full page URL, and some of ours carry secrets:
// ?token= on /reset-password and /confirm-email-change, ?email= on
// /verify-email, and the invite token in /invite/:token. Keep only utm_*
// campaign tags, hide the invite token, and skip /admin (same as Clarity).
function scrubAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url)
  if (url.pathname.startsWith('/admin')) return null
  if (url.pathname.startsWith('/invite/')) url.pathname = '/invite/[token]'
  for (const key of [...url.searchParams.keys()]) {
    if (!key.startsWith('utm_')) url.searchParams.delete(key)
  }
  url.hash = ''
  return { ...event, url: url.toString() }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    <Analytics beforeSend={scrubAnalyticsUrl} />
  </StrictMode>,
)
