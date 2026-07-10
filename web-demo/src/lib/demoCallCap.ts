// Free-call cap for the public marketing-site demo (/demo, /call) — a
// lightweight, client-side deterrent against unlimited anonymous LiveKit
// usage, not a security boundary. Tracked per-browser via localStorage.

const STORAGE_KEY = 'vistrow_demo_calls_used'
export const DEMO_CALL_CAP = 5

function readUsed(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

export function getRemainingDemoCalls(): number {
  return Math.max(0, DEMO_CALL_CAP - readUsed())
}

export function hasDemoCallsRemaining(): boolean {
  return getRemainingDemoCalls() > 0
}

export function recordDemoCall(): void {
  localStorage.setItem(STORAGE_KEY, String(readUsed() + 1))
}
