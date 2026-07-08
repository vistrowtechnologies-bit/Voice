import { useEffect, useState } from 'react'

// Dashboard color scheme. Dark is the product default; the choice persists
// in localStorage and is applied as data-theme on <html>, which index.css's
// :root[data-theme="light"] token overrides pick up. Scoped to the dashboard:
// DashboardLayout applies it on mount and reverts on unmount, so the public
// landing/call pages keep their designed dark look.

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'av-theme'
const EVENT = 'av-theme-change'

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme)
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private browsing — the toggle still works for this visit.
    }
  }
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }))
}

/** Current theme as React state — re-renders subscribers (e.g. the chart
 * colors on the Dashboard) whenever the header toggle flips it. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  return theme
}
