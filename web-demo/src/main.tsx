import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './lib/theme.ts'

// Apply the saved (light by default) theme before React renders its auth gate.
// This eliminates the dark one-frame splash seen while a dashboard session is
// being restored, without changing the public-site visual system.
applyTheme(getStoredTheme(), false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
