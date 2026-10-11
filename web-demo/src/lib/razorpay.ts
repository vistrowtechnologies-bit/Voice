// Razorpay's Checkout.js attaches itself to window - loaded on demand (only
// once) rather than globally, so a user who never touches Billing never
// pulls in a third-party script. Shared by the plan checkout (Billing.tsx)
// and the credit top-up modal.
let razorpayScriptPromise: Promise<void> | null = null
export function loadRazorpayCheckout(): Promise<void> {
  if (razorpayScriptPromise) return razorpayScriptPromise
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay checkout'))
    document.body.appendChild(script)
  })
  return razorpayScriptPromise
}

export interface RazorpayCheckoutOptions {
  key: string
  subscription_id?: string
  order_id?: string
  name: string
  description: string
  image?: string
  prefill?: { name?: string; email?: string }
  theme?: { color: string }
  handler: (response: { razorpay_payment_id: string; razorpay_order_id?: string; razorpay_signature?: string }) => void
  modal?: { ondismiss?: () => void }
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => { open: () => void }
  }
}
