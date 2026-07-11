// Free-call cap for the public marketing-site demo (/demo, /call) — a
// lightweight, client-side deterrent against unlimited anonymous LiveKit
// usage, not a security boundary. Tracked per-browser via localStorage, on a
// rolling 24h window so a visitor who exhausts their calls can come back the
// next day rather than being capped forever on that browser.

const STORAGE_KEY = 'vistrow_demo_calls_used'
export const DEMO_CALL_CAP = 5
const WINDOW_MS = 24 * 60 * 60 * 1000

interface CallWindow {
  count: number
  windowStart: number
}

function readWindow(): CallWindow {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed === 'object' &&
        Number.isFinite(parsed.count) &&
        Number.isFinite(parsed.windowStart)
      ) {
        if (Date.now() - parsed.windowStart < WINDOW_MS) return parsed
      }
    } catch {
      // Pre-existing plain-number format (before the 24h window was added) —
      // fall through to a fresh window rather than stranding old visitors.
    }
  }
  return { count: 0, windowStart: Date.now() }
}

function writeWindow(w: CallWindow): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
}

export function getRemainingDemoCalls(): number {
  return Math.max(0, DEMO_CALL_CAP - readWindow().count)
}

export function hasDemoCallsRemaining(): boolean {
  return getRemainingDemoCalls() > 0
}

/** Milliseconds until the cap resets, or 0 if calls are already available. */
export function getDemoCallResetMs(): number {
  if (hasDemoCallsRemaining()) return 0
  return Math.max(0, readWindow().windowStart + WINDOW_MS - Date.now())
}

export function recordDemoCall(): void {
  const w = readWindow()
  writeWindow({ count: w.count + 1, windowStart: w.count === 0 ? Date.now() : w.windowStart })
}
