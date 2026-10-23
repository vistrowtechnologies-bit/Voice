// Click-to-WhatsApp leads (server/whatsapp_leads.py). A workspace connects its
// own WhatsApp number through Meta's Embedded Signup: Meta's SDK opens a popup
// on our page, and when the business finishes it we get a short-lived code
// plus the WABA and phone number IDs, which the server checks and links.
// Kept out of api.ts so the page ships independently.

function unauthorized() {
  window.dispatchEvent(new Event('vv-unauthorized'))
}

export interface WhatsAppNumber {
  phone_number_id: string
  waba_id: string
  display_phone: string
  status: string
  connected_via: string
  linked_at: string
}

export interface WhatsAppStatus {
  available: boolean
  appId: string
  configId: string
  graphVersion: string
  numbers: WhatsAppNumber[]
}

export interface WhatsAppLead {
  phone_number_id: string
  message_id: string
  from_phone: string
  profile_name: string
  ad_id: string
  ad_headline: string
  status: string
  reason: string
  route_agent_id: number | null
  received_at: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) unauthorized()
  if (!res.ok) {
    const detail = await res.json().then((j) => (typeof j?.detail === 'string' ? j.detail : null)).catch(() => null)
    throw new Error(detail || `${method} ${path} failed (${res.status})`)
  }
  return res.json()
}

/** null = this server has no WhatsApp routes yet. */
export async function fetchWhatsAppStatus(): Promise<WhatsAppStatus | null> {
  try {
    return await request<WhatsAppStatus>('GET', '/integrations/whatsapp')
  } catch {
    return null
  }
}

export const fetchWhatsAppLeads = (limit = 50) =>
  request<{ items: WhatsAppLead[] }>('GET', `/integrations/whatsapp/leads?limit=${limit}`).then((r) => r.items)

export const disconnectWhatsAppNumber = (phoneNumberId: string) =>
  request<{ ok: boolean }>('DELETE', `/integrations/whatsapp/numbers/${encodeURIComponent(phoneNumberId)}`)

export interface ConnectedNumber {
  phoneNumberId: string
  displayPhone: string
  verifiedName: string
  registered: boolean
}

// ------------------------------------------------------------ Meta SDK

interface FacebookSdk {
  init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void
  login: (cb: (res: { authResponse?: { code?: string } | null }) => void, opts: Record<string, unknown>) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null

function loadSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version })
      resolve(window.FB!)
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('Could not load Facebook’s sign-in. Check that nothing is blocking facebook.net and try again.'))
    }
    document.body.appendChild(script)
  })
  return sdkPromise
}

type SignupSession = { wabaId: string; phoneNumberId: string; businessId: string }

/**
 * Open Embedded Signup and, when the business finishes, hand the code and IDs
 * to the server. Resolves null when the person closes the popup.
 * Meta sends the IDs as a postMessage from facebook.com and the code through
 * the login callback; either can arrive first, so we wait for both.
 */
export async function connectWhatsAppNumber(status: WhatsAppStatus): Promise<ConnectedNumber | null> {
  const FB = await loadSdk(status.appId, status.graphVersion)
  return new Promise<ConnectedNumber | null>((resolve, reject) => {
    let session: SignupSession | null = null
    let code: string | null = null
    let settled = false

    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      fn()
    }
    const maybeFinish = () => {
      if (!session || !code) return
      const { wabaId, phoneNumberId, businessId } = session
      const body = { code, wabaId, phoneNumberId, businessId }
      done(() => request<ConnectedNumber>('POST', '/integrations/whatsapp/connect', body).then(resolve, reject))
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return
      let data: { type?: string; event?: string; data?: Record<string, string> }
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (data.event?.startsWith('FINISH') && data.data?.waba_id && data.data?.phone_number_id) {
        session = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id, businessId: data.data.business_id || '' }
        maybeFinish()
      } else if (data.event === 'CANCEL') {
        done(() => resolve(null))
      } else if (data.event === 'ERROR') {
        done(() => reject(new Error(data.data?.error_message || 'WhatsApp signup reported an error')))
      }
    }
    window.addEventListener('message', onMessage)

    FB.login(
      (res) => {
        code = res.authResponse?.code ?? null
        if (!code) {
          done(() => resolve(null))
          return
        }
        maybeFinish()
        // The popup closed with a code but no finish event: the person left
        // before picking a number.
        window.setTimeout(() => {
          if (!session) done(() => reject(new Error('Signup closed before a WhatsApp number was chosen.')))
        }, 4000)
      },
      {
        config_id: status.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: '3' },
      },
    )
  })
}
