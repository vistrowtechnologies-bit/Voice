import { useEffect, useState } from 'react'
import { fetchBillingProfile, invoiceDocumentUrl, saveBillingProfile, startTopup, verifyTopupPayment, type BillingProfile } from '../lib/api'
import { loadRazorpayCheckout } from '../lib/razorpay'
import { LIVE_MODEL_MULTIPLIER, PLANS, TOPUP_MAX_CREDITS, TOPUP_MIN_CREDITS, TOPUP_PACKS } from '../lib/plans'
import type { BillingSummary, TopupResult } from '../lib/types'
import { Icon } from './Icon'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Buy extra minutes (1 credit = 1 standard minute): a pack (with bonus) or a custom
 * amount, priced at the plan's own per-minute rate + GST, paid through Razorpay Checkout, verified server-side, then the
 * new balance and the invoice link. Billing details are asked for inline the first time. */
export function TopupModal({ billing, onClose, onSuccess }: { billing: BillingSummary; onClose: () => void; onSuccess: () => void }) {
  const [choice, setChoice] = useState<string>('500')
  const [custom, setCustom] = useState(TOPUP_MIN_CREDITS)
  const [profile, setProfile] = useState<BillingProfile | null>(null)
  const [legalName, setLegalName] = useState('')
  const [gstin, setGstin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TopupResult | null>(null)

  useEffect(() => { fetchBillingProfile().then(setProfile).catch(() => setProfile(null)) }, [])

  // Must match server/calls_db.py's topup_quote: the plan's price over the PLAN's fixed
  // credit count, rounded to the paisa, not this account's possibly-overridden creditsTotal.
  const plan = PLANS.find((p) => p.key === billing.plan) || PLANS[0]
  const perCredit = Math.round((billing.planPriceInr / plan.creditsNum) * 100) / 100
  const pack = TOPUP_PACKS.find((p) => p.key === choice)
  const credits = pack ? pack.credits : custom
  const bonus = pack ? Math.floor((pack.credits * pack.bonusPct) / 100) : 0
  const base = Math.round(credits * perCredit * 100) / 100
  const gst = Math.round(base * 18) / 100
  const customInvalid = !pack && (!Number.isInteger(custom) || custom < TOPUP_MIN_CREDITS || custom > TOPUP_MAX_CREDITS)
  const needsDetails = profile !== null && !profile.legalName
  // A Vistrow Live minute uses LIVE_MODEL_MULTIPLIER standard minutes.
  const liveMinutes = (n: number) => Math.floor(n / LIVE_MODEL_MULTIPLIER.default)

  async function pay() {
    setError('')
    setBusy(true)
    try {
      if (needsDetails && legalName.trim()) {
        setProfile(await saveBillingProfile({ ...profile!, legalName: legalName.trim(), gstin: gstin.trim() }))
      }
      await loadRazorpayCheckout()
      const session = await startTopup(pack ? { pack: pack.key } : { credits: custom })
      const razorpay = new window.Razorpay({
        key: session.razorpayKeyId,
        order_id: session.orderId,
        name: 'Vistrow Voice',
        description: `${session.credits} minutes${session.bonusCredits ? ` + ${session.bonusCredits} bonus` : ''}`,
        image: 'https://app.vistrowvoice.com/apple-touch-icon.png',
        prefill: session.prefill,
        theme: { color: '#a855f7' },
        handler: async (response) => {
          try {
            if (!response.razorpay_order_id || !response.razorpay_signature) throw new Error('Payment response was incomplete')
            const verified = await verifyTopupPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature)
            setResult(verified)
            window.dispatchEvent(new CustomEvent('vv:billing-changed'))
            onSuccess()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment went through but could not be confirmed. Your minutes will be added shortly.')
          } finally {
            setBusy(false)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      razorpay.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start top-up')
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Buy minutes">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="check_circle" className="text-[22px] text-cyan" />Minutes added</h2>
            <p className="mt-2 text-sm text-text-muted">
              {result.alreadyApplied ? 'This payment was already applied.' : `${result.credits ?? credits + bonus} minutes are in your workspace now.`}{' '}
              Balance: <b className="text-text">{result.creditsRemaining.toLocaleString('en-IN')} minutes</b>.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <a href={invoiceDocumentUrl(result.invoiceId, true)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10">
                <Icon name="receipt_long" className="text-[16px]" /> Invoice
              </a>
              <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Done</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">Buy minutes</h2>
            <p className="mt-1 text-xs text-text-muted">{inr(perCredit)} per minute on your plan · a Vistrow Live minute uses {LIVE_MODEL_MULTIPLIER.default}. Minutes apply right away.</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {TOPUP_PACKS.map((p) => {
                const b = Math.floor((p.credits * p.bonusPct) / 100)
                const total = Math.round(p.credits * perCredit * 118) / 100
                const selected = choice === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setChoice(p.key)}
                    className={`relative flex flex-col items-start rounded-xl border bg-surface-high p-3 text-left ${selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60'}`}
                  >
                    {b > 0 && <span className="absolute right-2 top-2 rounded-full bg-cyan/15 px-2 py-0.5 text-[10px] font-bold text-cyan">+{b} bonus</span>}
                    <span className="text-lg font-bold">{p.credits.toLocaleString('en-IN')}</span>
                    <span className="text-[11px] text-text-muted">minutes</span>
                    <span className="mt-2 text-sm font-semibold">{inr(total)} <span className="text-[10px] font-normal text-text-muted">incl. GST</span></span>
                    <span className="text-[10px] text-text-muted">≈ {liveMinutes(p.credits + b).toLocaleString('en-IN')} Vistrow Live min</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setChoice('custom')}
                className={`col-span-2 flex items-center justify-between rounded-xl border bg-surface-high px-3 py-2 text-left ${choice === 'custom' ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60'}`}
              >
                <span className="text-sm font-semibold">Custom amount</span>
                <span className="text-[11px] text-text-muted">{TOPUP_MIN_CREDITS}–{TOPUP_MAX_CREDITS.toLocaleString('en-IN')} minutes</span>
              </button>
              {choice === 'custom' && (
                <div className="col-span-2">
                  <input
                    type="number"
                    min={TOPUP_MIN_CREDITS}
                    max={TOPUP_MAX_CREDITS}
                    step={10}
                    value={custom}
                    onChange={(e) => setCustom(Number(e.target.value))}
                    className={input}
                    aria-label="Minutes"
                  />
                  {customInvalid && <p className="mt-1 text-xs text-destructive">Enter a whole number between {TOPUP_MIN_CREDITS} and {TOPUP_MAX_CREDITS.toLocaleString('en-IN')}.</p>}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-xs">
              <div className="flex justify-between text-text-muted"><span>{credits.toLocaleString('en-IN')} minutes × {inr(perCredit)}</span><span>{inr(base)}</span></div>
              {bonus > 0 && <div className="flex justify-between text-cyan"><span>Bonus minutes</span><span>+{bonus} free</span></div>}
              <div className="flex justify-between text-text-muted"><span>GST (18%)</span><span>{inr(gst)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-bold text-text"><span>Total</span><span>{inr(base + gst)}</span></div>
            </div>

            {needsDetails && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="text-xs text-text-muted sm:col-span-2">For your GST invoice (you can change these later under Billing details).</p>
                <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">Company or legal name<input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={input} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">GSTIN (optional)<input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" className={input} /></label>
              </div>
            )}

            {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-border bg-surface py-2 text-sm font-bold text-text-muted disabled:opacity-60">Cancel</button>
              <button onClick={() => void pay()} disabled={busy || customInvalid} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white disabled:opacity-40">
                {busy ? 'Opening…' : `Pay ${inr(base + gst)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
