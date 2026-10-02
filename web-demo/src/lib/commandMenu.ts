// Pure logic for the command menu: which OS we are on, how a shortcut is
// written there, how results are ranked, and the "G then D" key chords.
// No React or DOM state here so it can be tested on its own.

interface NavigatorLike {
  userAgentData?: { platform?: string }
  platform?: string
  userAgent?: string
  maxTouchPoints?: number
}

/** True on Mac, iPhone and iPad (where ⌘ is the shortcut key); false on
 * Windows, Linux, ChromeOS and Android (Ctrl). Prefers the modern
 * userAgentData, falls back to navigator.platform, then the user agent.
 * iPadOS 13+ reports itself as "MacIntel", which is fine: it also uses ⌘. */
export function detectMac(nav: NavigatorLike | null = typeof navigator === 'undefined' ? null : navigator): boolean {
  if (!nav) return false
  const raw = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(raw)
}

export const isMac = detectMac()

/** The shortcut key as it is written on this machine: "⌘" or "Ctrl". */
export const MOD_LABEL = isMac ? '⌘' : 'Ctrl'
export const ALT_LABEL = isMac ? '⌥' : 'Alt'

/** Either ⌘ or Ctrl counts, on every OS. A Mac user on an external Windows
 * keyboard, or a wrong platform guess, still gets a working shortcut. */
export function hasMod(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey
}

/** Case-insensitive match; a literal substring beats a scattered subsequence
 * ("callhist" still finds "All Calls History"). Lower score is better; null
 * means no match. A match at the start of a word gets a small bonus. */
export function fuzzyScore(text: string, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct !== -1) {
    const atWordStart = direct === 0 || /[\s\-_/·(]/.test(t[direct - 1])
    return atWordStart ? direct : direct + 5
  }
  let ti = 0
  let first = -1
  let gaps = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (first === -1) first = found
    gaps += found - ti
    ti = found + 1
  }
  return 1000 + first + gaps
}

export interface MenuItem {
  id: string
  label: string
  /** Second line under the title. */
  description?: string
  /** Extra words that should match but are not shown ("dark", "logout"). */
  keywords?: string
  icon: string
  group: string
  /** Chips on the right, e.g. ['G', 'D'] or ['Ctrl', 'K']. */
  shortcut?: string[]
}

/** Rank items for a query. Empty query keeps the given order (groups stay
 * together); a typed query sorts by score, label matches before description
 * matches, and stays stable for ties. */
export function rankItems<T extends MenuItem>(items: T[], query: string, limit = 40): T[] {
  const q = query.trim()
  if (!q) return items.slice(0, limit)
  const scored: { item: T; score: number; order: number }[] = []
  items.forEach((item, order) => {
    const byLabel = fuzzyScore(item.label, q)
    // Titles may match loosely; descriptions and hidden keywords only on a
    // real substring, or a short query matches almost every row.
    const rest = `${item.description ?? ''} ${item.keywords ?? ''}`.toLowerCase()
    const at = rest.indexOf(q.toLowerCase())
    const score = byLabel !== null ? byLabel : at !== -1 ? 500 + at : null
    if (score !== null) scored.push({ item, score, order })
  })
  scored.sort((a, b) => a.score - b.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.item)
}

/** Keep items together by group, in the order each group first appears. */
export function groupInOrder<T extends { group: string }>(items: T[]): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = []
  for (const item of items) {
    let g = out.find((x) => x.group === item.group)
    if (!g) out.push((g = { group: item.group, items: [] }))
    g.items.push(item)
  }
  return out
}

/** "G then letter" jumps to a page, like Gmail and Linear. Plain letters work
 * the same on Mac and Windows (no modifier), and avoid browser-reserved
 * combos such as Ctrl+N and Ctrl+T on Windows. */
export const GO_CHORDS: Record<string, { to: string; label: string }> = {
  d: { to: '/dashboard', label: 'Dashboard' },
  a: { to: '/dashboard/agents', label: 'Agents' },
  t: { to: '/dashboard/testing', label: 'Testing Lab' },
  v: { to: '/dashboard/voices', label: 'Voices' },
  k: { to: '/dashboard/knowledge', label: 'Knowledge Base' },
  i: { to: '/dashboard/inbound', label: 'Inbound' },
  o: { to: '/dashboard/outbound', label: 'Outbound' },
  h: { to: '/dashboard/calls', label: 'All Calls History' },
  c: { to: '/dashboard/contacts', label: 'Contacts' },
  p: { to: '/dashboard/appointments', label: 'Appointments' },
  x: { to: '/dashboard/integrations', label: 'Integrations' },
  w: { to: '/dashboard/website-widget', label: 'Website Widget' },
  n: { to: '/dashboard/numbers', label: 'Phone Numbers' },
  m: { to: '/dashboard/compliance', label: 'Compliance' },
  b: { to: '/dashboard/billing', label: 'Billing' },
  s: { to: '/dashboard/settings', label: 'Settings' },
  u: { to: '/dashboard/support', label: 'Help & Support' },
}

/** "C then letter" starts something new. */
export const CREATE_CHORDS: Record<string, { to: string; label: string }> = {
  a: { to: '/dashboard/agents?new=1', label: 'New agent' },
  c: { to: '/dashboard/contacts?add=1', label: 'New contact' },
  i: { to: '/dashboard/contacts?import=1', label: 'Import contacts' },
  p: { to: '/dashboard/appointments?new=1', label: 'New appointment' },
}

/** How long after the first key the second one still counts. */
export const CHORD_WINDOW_MS = 1200

export function chordTarget(first: string, second: string): { to: string; label: string } | null {
  const k = second.toLowerCase()
  if (first === 'g') return GO_CHORDS[k] ?? null
  if (first === 'c') return CREATE_CHORDS[k] ?? null
  return null
}

/** Is the user typing in a field, where plain letters must be left alone? */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const RECENT_KEY = 'vv.cmdmenu.recent'
const RECENT_MAX = 5

export function loadRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function pushRecent(id: string): string[] {
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage can be unavailable */
  }
  return next
}

/** The header button and the keyboard shortcut both open the menu through this
 * event, so neither needs a reference to the other. */
export const OPEN_EVENT = 'vv-open-command-menu'
export function openCommandMenu(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}
