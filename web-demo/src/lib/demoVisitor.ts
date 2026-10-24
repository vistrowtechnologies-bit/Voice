// Who is calling from the homepage live demo (owner 24 Oct): name, phone and
// consent to be contacted, asked once before the first call. The server
// requires them on the demo path (token_api._demo_visitor_gate) and saves the
// visitor as a contact; this browser remembers them so later calls start
// straight away.

export interface DemoVisitor {
  name: string
  /** E.164, e.g. +919820134567 */
  phone: string
}

const STORAGE_KEY = 'vistrow_demo_visitor'
// In memory too, so the form is not asked twice on one page view where
// localStorage is blocked.
let current: DemoVisitor | null = null

export function readDemoVisitor(): DemoVisitor | null {
  if (current) return current
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    if (parsed && typeof parsed.name === 'string' && typeof parsed.phone === 'string') current = parsed
  } catch {
    // blocked or corrupt storage: ask again
  }
  return current
}

export function saveDemoVisitor(visitor: DemoVisitor): void {
  current = visitor
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visitor))
  } catch {
    // storage blocked: in-memory for this page view
  }
}

export function clearDemoVisitor(): void {
  current = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing stored
  }
}

/** The body fields the demo token routes expect. */
export function demoVisitorFields(): { name: string; phone: string; contactConsent: boolean } | Record<string, never> {
  const visitor = readDemoVisitor()
  return visitor ? { name: visitor.name, phone: visitor.phone, contactConsent: true } : {}
}

/** Same junk filter as the server (token_api._looks_like_real_phone), so a
 * typo is caught before a round trip. */
export function looksLikeRealPhone(phone: string): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return false
  const digits = phone.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (new Set(local).size <= 3) return false
  return !'01234567890123456789'.includes(local) && !'98765432109876543210'.includes(local)
}
