import { useEffect, useRef, useState } from 'react'
import { fetchBillingProfile, invoiceDocumentUrl, saveBillingProfile, startTopup, verifyTopupPayment, type BillingProfile } from '../lib/api'
import { loadRazorpayCheckout } from '../lib/razorpay'
import { LIVE_MODEL_MULTIPLIER, TOPUP_MAX_CREDITS, TOPUP_MIN_CREDITS, TOPUP_PACKS } from '../lib/plans'
import type { BillingSummary, TopupResult } from '../lib/types'
import { Icon } from './Icon'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** Whole rupees without the ".00", for the compact pack cards. */
const inrShort = (n: number) => (Number.isInteger(n) ? `₹${n.toLocaleString('en-IN')}` : inr(n))
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Eases a displayed number to its new value (~350 ms) so totals count instead of jumping. */
function useTween(value: number): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    if (start === value || reduceMotion()) { from.current = value; setShown(value); return }
    let frame = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 350)
      const v = start + (value - start) * (1 - (1 - k) ** 3)
      from.current = v
      setShown(v)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return shown
}

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

  // Must match server/calls_db.py's topup_quote: the plan's per-minute rate (overagePerMinute,
  // ₹7/6/5); trial and unknown plans pay the Starter rate. The fallback mirrors
  // agent/plan_policy.py for a summary from a server that predates `plans`.
  const serverPlans = billing.plans || []
  const ratePlan = serverPlans.find((p) => p.plan === billing.plan) || serverPlans.find((p) => p.plan === 'starter')
  const perCredit = ratePlan?.overagePerMinute ?? ({ growth: 6, scale: 5 } as Record<string, number>)[billing.plan] ?? 7
  const pack = TOPUP_PACKS.find((p) => p.key === choice)
  const credits = pack ? pack.credits : custom
  const bonus = pack ? Math.floor((pack.credits * pack.bonusPct) / 100) : 0
  const base = Math.round(credits * perCredit * 100) / 100
  const gst = Math.round(base * 18) / 100
  const customInvalid = !pack && (!Number.isInteger(custom) || custom < TOPUP_MIN_CREDITS || custom > TOPUP_MAX_CREDITS)
  const needsDetails = profile !== null && !profile.legalName
  // A Vistrow Live minute uses LIVE_MODEL_MULTIPLIER standard minutes.
  const liveMinutes = (n: number) => Math.floor(n / LIVE_MODEL_MULTIPLIER.default)
  // Effective price of a minute once the bonus is counted; the lowest is "Best value".
  const effectiveRate = (p: (typeof TOPUP_PACKS)[number]) => (p.credits * perCredit) / (p.credits + Math.floor((p.credits * p.bonusPct) / 100))
  const bestValueKey = TOPUP_PACKS.reduce((best, p) => (effectiveRate(p) < effectiveRate(best) ? p : best)).key
  const STEP = 50
  // −/+ snap to the next multiple of STEP, clamped to the allowed range.
  const stepCustom = (dir: 1 | -1) => setCustom((n) => {
    const base = Number.isFinite(n) ? n : TOPUP_MIN_CREDITS
    const next = dir > 0 ? Math.floor(base / STEP) * STEP + STEP : Math.ceil(base / STEP) * STEP - STEP
    return Math.min(TOPUP_MAX_CREDITS, Math.max(TOPUP_MIN_CREDITS, next))
  })
  const shownTotal = useTween(customInvalid ? 0 : base + gst)
  const shownMinutes = useTween(customInvalid ? 0 : credits + bonus)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

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

  const input = 'w-full rounded-xl border border-border bg-surface-high px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary'
  const planName = ratePlan ? ratePlan.plan.charAt(0).toUpperCase() + ratePlan.plan.slice(1) : 'Starter'

  return (
    <div className="topup-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Buy minutes">
      <div className="topup-panel relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-surface p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true"><div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl" /></div>
        {result ? (
          <div className="relative flex flex-col items-center py-4 text-center">
            <span className="relative grid h-16 w-16 place-items-center">
              <span className="topup-ring absolute inset-0 rounded-full bg-cyan/40" aria-hidden="true" />
              <span className="topup-pop topup-icon grid h-16 w-16 place-items-center rounded-full text-white"><Icon name="check" className="text-[34px]" /></span>
            </span>
            <h2 className="topup-rise mt-4 text-xl font-bold">Minutes added</h2>
            <p className="topup-rise mt-2 max-w-xs text-sm text-text-muted">
              {result.alreadyApplied ? 'This payment was already applied.' : `${(result.credits ?? credits + bonus).toLocaleString('en-IN')} minutes are in your workspace now.`}
            </p>
            <div className="topup-rise mt-4 rounded-2xl border border-border bg-surface-high px-6 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">New balance</p>
              <p className="text-2xl font-bold">{result.creditsRemaining.toLocaleString('en-IN')} <span className="text-sm font-medium text-text-muted">minutes</span></p>
            </div>
            <div className="mt-6 flex w-full gap-2">
              <a href={invoiceDocumentUrl(result.invoiceId, true)} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10">
                <Icon name="receipt_long" className="text-[16px]" /> Invoice
              </a>
              <button onClick={onClose} className="topup-pay flex-1 rounded-xl py-2.5 text-sm font-bold text-white">Done</button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-start gap-3">
              <span className="topup-icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"><Icon name="bolt" className="text-[24px]" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold leading-tight">Buy minutes</h2>
                <p className="mt-0.5 text-xs text-text-muted">Added to your balance the moment payment clears.</p>
              </div>
              <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text disabled:opacity-40">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-primary/12 px-2.5 py-1 text-primary">{inr(perCredit)} / min on {planName}</span>
              <span className="rounded-full bg-surface-high px-2.5 py-1 text-text-muted">Vistrow Live uses {LIVE_MODEL_MULTIPLIER.default} min per min</span>
            </div>

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
                    aria-pressed={selected}
                    className="topup-card relative flex flex-col items-start rounded-xl border border-border bg-surface-high px-3 py-2.5 text-left"
                  >
                    {p.key === bestValueKey && <span className="absolute -top-2 left-3 rounded-full bg-cyan px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-surface">Best value</span>}
                    <span className="flex w-full items-center justify-between gap-1">
                      <span className="text-base font-bold tracking-tight">{p.credits.toLocaleString('en-IN')} <span className="text-[11px] font-medium text-text-muted">min</span></span>
                      {selected
                        ? <span className="topup-pop grid h-4 w-4 place-items-center rounded-full bg-primary text-white"><Icon name="check" className="text-[12px]" /></span>
                        : b > 0 && <span className="rounded-full bg-cyan/15 px-1.5 py-px text-[10px] font-bold text-cyan">+{b}</span>}
                    </span>
                    <span className="mt-1 whitespace-nowrap text-[13px] font-semibold">{inrShort(total)} <span className="text-[10px] font-normal text-text-muted">incl. GST</span></span>
                    <span className="text-[10px] text-text-muted">{b > 0 ? `+${b} free · ${inr(effectiveRate(p))}/min` : `≈ ${liveMinutes(p.credits).toLocaleString('en-IN')} Vistrow Live min`}</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setChoice('custom')}
                aria-pressed={choice === 'custom'}
                className="topup-card col-span-2 flex items-center justify-between rounded-xl border border-border bg-surface-high px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="tune" className="text-[18px] text-primary" />Custom amount</span>
                <span className="text-[11px] text-text-muted">{TOPUP_MIN_CREDITS}–{TOPUP_MAX_CREDITS.toLocaleString('en-IN')} minutes</span>
              </button>
              {choice === 'custom' && (
                <div className="topup-rise col-span-2 rounded-xl border border-border bg-surface-high p-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={TOPUP_MIN_CREDITS}
                      max={TOPUP_MAX_CREDITS}
                      step={STEP}
                      value={Number.isFinite(custom) ? Math.min(Math.max(custom, TOPUP_MIN_CREDITS), TOPUP_MAX_CREDITS) : TOPUP_MIN_CREDITS}
                      onChange={(e) => setCustom(Number(e.target.value))}
                      className="topup-range min-w-0 flex-1"
                      aria-label="Minutes slider"
                    />
                    <div className="topup-stepper flex shrink-0 items-center rounded-xl border border-border bg-surface">
                      <button type="button" onClick={() => stepCustom(-1)} disabled={custom <= TOPUP_MIN_CREDITS} aria-label={`${STEP} fewer minutes`} className="grid h-9 w-8 place-items-center text-lg font-bold leading-none text-text-muted disabled:opacity-30">−</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={TOPUP_MIN_CREDITS}
                        max={TOPUP_MAX_CREDITS}
                        value={custom}
                        onChange={(e) => setCustom(Number(e.target.value))}
                        className="w-16 bg-transparent text-center text-sm font-bold tabular-nums outline-none"
                        aria-label="Minutes"
                      />
                      <button type="button" onClick={() => stepCustom(1)} disabled={custom >= TOPUP_MAX_CREDITS} aria-label={`${STEP} more minutes`} className="grid h-9 w-8 place-items-center text-lg font-bold leading-none text-text-muted disabled:opacity-30">+</button>
                    </div>
                  </div>
                  {customInvalid && <p className="mt-2 text-xs text-destructive">Enter a whole number between {TOPUP_MIN_CREDITS} and {TOPUP_MAX_CREDITS.toLocaleString('en-IN')}.</p>}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface-high">
              <div className="flex items-end justify-between gap-3 border-b border-border px-3 py-2.5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">You get</p>
                  <p className="text-xl font-bold tabular-nums">{Math.round(shownMinutes).toLocaleString('en-IN')} <span className="text-sm font-medium text-text-muted">minutes</span></p>
                </div>
                <p className="pb-1 text-right text-[11px] text-text-muted">≈ {liveMinutes(credits + bonus).toLocaleString('en-IN')} Vistrow Live min</p>
              </div>
              <div className="flex flex-col gap-1 px-3 py-2.5 text-xs">
                <div className="flex justify-between text-text-muted"><span>{credits.toLocaleString('en-IN')} minutes × {inr(perCredit)}</span><span className="tabular-nums">{inr(base)}</span></div>
                {bonus > 0 && <div className="flex justify-between font-semibold text-cyan"><span>Bonus minutes</span><span>+{bonus} free</span></div>}
                <div className="flex justify-between text-text-muted"><span>GST (18%)</span><span className="tabular-nums">{inr(gst)}</span></div>
                <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2 text-text"><span className="text-sm font-bold">Total</span><span className="text-lg font-bold tabular-nums">{inr(shownTotal)}</span></div>
              </div>
            </div>

            {needsDetails && (
              <div className="topup-rise mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="text-xs text-text-muted sm:col-span-2">For your GST invoice (you can change these later under Billing details).</p>
                <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">Company or legal name<input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={input} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">GSTIN (optional)<input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" className={input} /></label>
              </div>
            )}

            {error && <p className="topup-rise mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            <button onClick={() => void pay()} disabled={busy || customInvalid} className="topup-pay mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40">
              {busy
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />Opening secure checkout…</>
                : <><Icon name="lock" className="text-[18px]" />Pay <span className="tabular-nums">{inr(shownTotal)}</span></>}
            </button>
            <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-text-muted"><Icon name="verified_user" className="text-[14px]" />Secure payment by Razorpay · GST invoice included</p>
          </div>
        )}
      </div>
    </div>
  )
}
