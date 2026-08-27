export interface TokenResponse {
  token: string
  url: string
}

export async function fetchLiveKitToken(
  identity: string,
  room: string,
  agentId?: number,
  /** Published industry-demo slug (e.g. 'healthcare'). The server resolves
   * it to an agent itself and ignores agentId when it's set — the public
   * endpoint never accepts a raw agent id from the page. */
  demoSlug?: string,
  /** BCP-47 code the demo should OPEN in ("fr-FR"). Server-validated against
   * the voice catalog, and only honoured for demo agents. */
  language?: string,
): Promise<TokenResponse> {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, room, agentId, demoSlug, language }),
  })
  if (!res.ok) {
    throw new Error(`token request failed with status ${res.status}`)
  }
  return res.json()
}

export function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// Public, unauthenticated like fetchLiveKitToken above — the marketing
// site's own "Tap to talk" orb has no logged-in session, same reasoning
// as the embeddable widget's /widget/feedback call it mirrors server-side.
export async function submitDemoFeedback(
  roomName: string,
  rating: 'helpful' | 'not_helpful',
  comment?: string,
): Promise<void> {
  const res = await fetch('/api/demo/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, rating, comment }),
  })
  if (!res.ok) {
    throw new Error(`feedback request failed with status ${res.status}`)
  }
}
