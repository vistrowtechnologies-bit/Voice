import { demoVisitorFields } from './demoVisitor'

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
  testContext?: { runId: string; scenarioId?: number; scenarioKey?: string },
  /** Isolated provider A/B lane. The server accepts only the named public
   * Sarvam lab profile; normal demo and tenant calls remain unchanged. */
  pipelineProfile?: 'sarvam-livekit',
  /** DPDP notice acceptance from the demo orb's consent dialog. The server
   * stamps its own receipt time next to acceptedAt as the call's evidence. */
  consent?: { version: string; acceptedAt: string },
): Promise<TokenResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch('/api/token', {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity,
        room,
        agentId,
        consentVersion: consent?.version,
        consentAcceptedAt: consent?.acceptedAt,
        demoSlug,
        language,
        testRunId: testContext?.runId,
        testScenarioId: testContext?.scenarioId,
        testScenarioKey: testContext?.scenarioKey,
        pipelineProfile,
        // The homepage demo's name/phone/consent form; the server requires it
        // only on that path (no agent, no slug).
        ...(agentId === undefined && !demoSlug ? demoVisitorFields() : {}),
      }),
    })
    if (!res.ok) {
      // 400/429 from the demo gate carry a sentence meant for the visitor.
      const detail = await res
        .json()
        .then((j) => (typeof j?.detail === 'string' ? j.detail : ''))
        .catch(() => '')
      throw new TokenError(detail || `token request failed with status ${res.status}`, res.status)
    }
    const data = await res.json()
    if (typeof data?.token !== 'string' || !data.token || typeof data?.url !== 'string' || !data.url) {
      throw new Error('The connection could not be prepared. Please try again.')
    }
    return data
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The connection took too long. Please try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export class TokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
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
