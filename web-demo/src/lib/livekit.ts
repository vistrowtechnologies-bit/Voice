export interface TokenResponse {
  token: string
  url: string
}

export async function fetchLiveKitToken(identity: string, room: string): Promise<TokenResponse> {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, room }),
  })
  if (!res.ok) {
    throw new Error(`token request failed with status ${res.status}`)
  }
  return res.json()
}

export function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
