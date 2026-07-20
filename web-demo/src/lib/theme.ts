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

let transitionTimer: ReturnType<typeof setTimeout> | undefined

// Briefly tags <html> with a class that index.css uses to transition
// background/text/border colors — so flipping the toggle fades between
// themes instead of snapping instantly. Only active for the switch itself
// (see TRANSITION_MS), so normal hover/focus states stay instant.
const TRANSITION_MS = 320

export function applyTheme(theme: Theme, persist = true) {
  const root = document.documentElement
  // persist=false means a layout is just reapplying the already-stored theme
  // on mount/route-change (DashboardLayout/AdminLayout) — not a real switch,
  // so it shouldn't fade. Only an actual toggle click (persist=true) animates.
  if (persist) {
    root.classList.add('theme-transition')
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS)
  }

  root.setAttribute('data-theme', theme)
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
