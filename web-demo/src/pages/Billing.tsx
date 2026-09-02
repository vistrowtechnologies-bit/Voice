import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import { fetchBilling, fetchSubscription, startCheckout, startTopup, verifyTopupPayment } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CONTACT_EMAIL } from '../lib/marketingContent'
import { ANNUAL_MONTHS_CHARGED, PLANS, PRICING_FINALIZED } from '../lib/plans'
import type { BillingSummary, Invoice } from '../lib/types'

// Razorpay's Checkout.js attaches itself to window - loaded on demand (only
// once) rather than globally, so a user who never touches Billing never
// pulls in a third-party script.
let razorpayScriptPromise: Promise<void> | null = null
function loadRazorpayCheckout(): Promise<void> {
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

interface RazorpayCheckoutOptions {
  key: string
  subscription_id?: string
  order_id?: string
  name: string
  description: string
  image?: string
  theme?: { color: string }
  handler: (response: { razorpay_payment_id: string; razorpay_order_id?: string; razorpay_signature?: string }) => void
  modal?: { ondismiss?: () => void }
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => { open: () => void }
  }
}

const INVOICE_KIND_LABELS: Record<string, string> = {
  subscription: 'Plan renewal',
  overage: 'Overage + phone numbers',
  topup: 'Credit top-up',
  phone_number: 'Phone number',
}

export function Billing() {
  const { user } = useAuth()
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [razorpayConfigured, setRazorpayConfigured] = useState(true)
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [topupOpen, setTopupOpen] = useState(false)
  const [topupCredits, setTopupCredits] = useState(100)
  const [topupBusy, setTopupBusy] = useState(false)
  const [error, setError] = useState('')

  function refetch() {
    fetchBilling().then(setBilling).catch(() => setBilling(null))
    fetchSubscription()
      .then((r) => {
        setInvoices(r.invoices)
        setRazorpayConfigured(r.razorpayConfigured)
      })
      .catch(() => {})
  }

  useEffect(refetch, [])

  const usedPct = billing ? Math.min(100, Math.round((billing.creditsUsed / billing.creditsTotal) * 100)) : 0
  const currentPlanKey = billing?.plan || (user?.plan || 'starter').toLowerCase()
  const currentPlanName = PLANS.find((p) => p.key === currentPlanKey)?.name || 'Starter'
  // Must match server/token_api.py's billing_topup exactly: plan price over
  // the PLAN's fixed credit count (calls_db.PLAN_PRICING), not this
  // account's possibly-overridden creditsTotal setting - those two can
  // differ (e.g. a manually-adjusted trial account), and this is a real
  // price quote, not just a usage-page estimate.
  const currentPlanCredits = PLANS.find((p) => p.key === currentPlanKey)?.creditsNum || billing?.creditsTotal || 1
  const perCreditRate = billing ? billing.planPriceInr / currentPlanCredits : 0

  async function handleUpgrade(planKey: 'starter' | 'growth' | 'scale', planName: string) {
    setError('')
    setBusyPlan(planKey)
    try {
      await loadRazorpayCheckout()
      const session = await startCheckout(planKey, cycle)
      const razorpay = new window.Razorpay({
        key: session.razorpayKeyId,
        subscription_id: session.subscriptionId,
        name: 'Vistrow Voice',
        description: `${planName} plan · ${cycle === 'annual' ? 'annual' : 'monthly'} billing`,
        image: 'https://app.vistrowvoice.com/apple-touch-icon.png',
        theme: { color: '#a855f7' },
        handler: () => {
          // The subscription.activated/charged webhook is what actually
          // flips status to "active" - this refetch just gives immediate
          // visual feedback that payment went through.
          refetch()
        },
        modal: { ondismiss: () => setBusyPlan(null) },
      })
      razorpay.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout')
    } finally {
      setBusyPlan(null)
    }
  }

  async function handleTopup() {
    setError('')
    setTopupBusy(true)
    try {
      await loadRazorpayCheckout()
      const session = await startTopup(topupCredits)
      const razorpay = new window.Razorpay({
        key: session.razorpayKeyId,
        order_id: session.orderId,
        name: 'Vistrow Voice',
        description: `${session.credits} extra credits`,
        image: 'https://app.vistrowvoice.com/apple-touch-icon.png',
        theme: { color: '#a855f7' },
        handler: async (response) => {
          if (response.razorpay_order_id && response.razorpay_signature) {
            await verifyTopupPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature)
            refetch()
          }
        },
        modal: { ondismiss: () => setTopupBusy(false) },
      })
      razorpay.open()
      setTopupOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start top-up')
    } finally {
      setTopupBusy(false)
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Billing" subtitle="Manage your subscription and usage" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20 text-cyan">
                  <Icon name="toll" className="text-[20px]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Credits this cycle</p>
                  <p className="text-2xl font-bold">
                    {billing?.creditsRemaining ?? '-'}
                    <span className="ml-1 text-sm font-normal text-text-muted">/ {billing?.creditsTotal ?? '-'} available</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTopupOpen(true)}
                disabled={!razorpayConfigured || !PRICING_FINALIZED}
                title={!PRICING_FINALIZED ? 'Top-ups open once introductory pricing is finalized' : undefined}
                className="rounded-lg border border-cyan/40 px-3 py-1.5 text-xs font-bold text-cyan hover:bg-cyan/10 disabled:opacity-40"
              >
                + Buy credits
              </button>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-high">
              <div
                className={`h-full rounded-full ${usedPct > 85 ? 'bg-destructive' : 'bg-cyan'}`}
                style={{ width: `${Math.max(2, usedPct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {billing ? `${billing.minutesUsed} call minutes used this cycle. Final credits include call type, voice tier, and model tier.` : 'Loading usage…'}
            </p>
            {billing && billing.overageCredits > 0 && (
              <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
                {billing.overageCredits} credits over plan this cycle
                {PRICING_FINALIZED
                  ? ` · ~₹${billing.overageAmountInr} will be added to your next invoice (${billing.overageRateInr}/credit overage rate)`
                  : ' · overage pricing is being finalized'}
              </p>
            )}
            {billing && billing.phoneNumberCount > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                {billing.phoneNumberCount} active phone number{billing.phoneNumberCount === 1 ? '' : 's'}
                {PRICING_FINALIZED ? ` · ₹${billing.phoneNumberFeesInr}/mo` : ''}
              </p>
            )}
          </Card>

          <Card variant="flat">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Current plan</p>
            <p className="mt-1 text-xl font-bold">{currentPlanName}</p>
            <p className="mt-1 text-xs text-text-muted">
              {billing?.subscriptionStatus === 'active' ? `Billed ${billing.billingCycle}` : 'Workspace plan allocation'}
              {billing?.currentPeriodEnd ? ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}` : ''}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <Icon
                name={billing?.subscriptionStatus === 'active' ? 'check_circle' : 'info'}
                className={`text-[14px] ${billing?.subscriptionStatus === 'active' ? 'text-cyan' : 'text-text-muted'}`}
              />
              {billing?.subscriptionStatus === 'active'
                ? 'Subscription active'
                : billing?.subscriptionStatus === 'cancelled'
                  ? 'Subscription cancelled'
                  : 'No recurring subscription connected'}
            </p>
          </Card>
        </div>

        {billing && (
          <SectionCard
            title="Usage by call type"
            subtitle="Credits = call minutes × channel rate × voice multiplier × model multiplier. The figures below are base units before the two multipliers."
          >
            <div className="divide-y divide-border">
              {(
                [
                  ['browser', 'Dashboard browser calls', 'call'],
                  ['widget', 'Website widget calls', 'public'],
                  ['phone', 'Real phone calls', 'call'],
                ] as const
              ).map(([type, label, icon]) => {
                const minutes = billing.minutesByType[type] ?? 0
                const rate = billing.creditRates[type] ?? 1
                return (
                  <div key={type} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <Icon name={icon} className="text-[16px] text-text-muted" />
                      <span>{label}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                        {rate} base credit/min
                      </span>
                    </div>
                    <span className="text-text-muted">
                      {minutes} min · {Math.round(minutes * rate * 10) / 10} base units
                    </span>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}

        {billing && (
          <SectionCard
            title="Usage by voice tier"
            subtitle="Voice multipliers are one part of the final credit formula. Channel and model rates still apply."
          >
            <div className="divide-y divide-border">
              {(
                [
                  ['economy', 'Economy', 'savings'],
                  ['standard', 'Standard', 'graphic_eq'],
                  ['premium', 'Premium', 'auto_awesome'],
                ] as const
              ).map(([tier, label, icon]) => {
                const minutes = billing.minutesByVoiceTier[tier] ?? 0
                const rate = billing.voiceTierRates[tier] ?? 1
                return (
                  <div key={tier} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <Icon name={icon} className="text-[16px] text-text-muted" />
                      <span>{label}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                        {rate}x credits
                      </span>
                    </div>
                    <span className="text-text-muted">
                      {minutes} min · {rate}× voice multiplier
                    </span>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}

        {billing && (
          <SectionCard
            title="Model multipliers"
            subtitle="The selected AI model applies this multiplier after the channel and voice rates. Each call detail shows the exact final credits per minute."
          >
            <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
              {(
                [
                  ['standard', 'Standard'],
                  ['premium', 'Premium'],
                  ['premium_plus', 'Premium Plus'],
                ] as const
              ).map(([tier, label]) => (
                <div key={tier} className="rounded-lg border border-border bg-surface-high/30 px-4 py-3">
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className="mt-1 text-lg font-bold">{billing.modelTierRates?.[tier] ?? 1}×</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Available plans</h2>
            <div className="flex items-center gap-3">
              {PRICING_FINALIZED && (
                <div className="flex items-center rounded-full border border-border p-0.5 text-xs font-bold">
                  <button
                    onClick={() => setCycle('monthly')}
                    className={`rounded-full px-3 py-1 ${cycle === 'monthly' ? 'bg-primary text-bg' : 'text-text-muted'}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setCycle('annual')}
                    className={`rounded-full px-3 py-1 ${cycle === 'annual' ? 'bg-primary text-bg' : 'text-text-muted'}`}
                  >
                    Annual · save {Math.round((1 - ANNUAL_MONTHS_CHARGED / 12) * 100)}%
                  </button>
                </div>
              )}
              <span className="rounded-full border border-border px-3 py-1 text-[11px] text-text-muted">Region · India</span>
            </div>
          </div>
          {!PRICING_FINALIZED ? (
            <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber">
              Introductory pricing is being finalized ahead of public beta — upgrades aren't open yet.
            </p>
          ) : (
            !razorpayConfigured && (
              <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber">
                Online checkout isn't configured on this server yet — plans below are informational until Razorpay
                keys are added.
              </p>
            )
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => {
              // Confirmed real bug: requiring subscriptionStatus === 'active'
              // meant an account whose plan was set without a Razorpay
              // subscription behind it yet (e.g. assigned by an admin - see
              // the "No recurring subscription connected" note above) saw
              // "Upgrade to Scale" on the Scale card while already on Scale.
              // Matching the plan key is the only thing a buyer should need
              // to see "Current plan" here.
              const isCurrent = plan.key === currentPlanKey
              // PLANS is authored low-to-high (Starter/Growth/Scale), so
              // index doubles as tier rank - confirmed real bug: every
              // non-current card said "Upgrade to X" even for a tier BELOW
              // the current plan (e.g. "Upgrade to Growth" while on Scale),
              // which is actually a downgrade.
              const currentRank = PLANS.findIndex((p) => p.key === currentPlanKey)
              const isDowngrade = PLANS.findIndex((p) => p.key === plan.key) < currentRank
              const displayPrice =
                cycle === 'annual' ? `₹${(plan.priceInr * ANNUAL_MONTHS_CHARGED).toLocaleString('en-IN')}` : plan.price
              const gstInr = plan.priceInr * (cycle === 'annual' ? ANNUAL_MONTHS_CHARGED : 1) * 0.18
              return (
                <div
                  key={plan.name}
                  className={`flex flex-col overflow-hidden rounded-xl border bg-surface ${
                    plan.tag === 'Recommended' ? 'border-cyan/50' : plan.tag === 'Most Popular' ? 'border-amber/50' : 'border-border'
                  }`}
                >
                  {plan.tag ? (
                    <div
                      className={`flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                        plan.tag === 'Recommended' ? 'bg-cyan/15 text-cyan' : 'bg-amber/15 text-amber'
                      }`}
                    >
                      <Icon name="auto_awesome" className="text-[13px]" />
                      {plan.tag}
                    </div>
                  ) : (
                    <div className="h-[30px]" />
                  )}
                  <div className="flex flex-1 flex-col p-5 pt-4">
                    <h3 className="text-lg font-bold uppercase tracking-wide">{plan.name}</h3>
                    <p className="mt-1 text-xs text-text-muted">{plan.description}</p>
                    {PRICING_FINALIZED ? (
                      <>
                        <p className="mt-3 text-2xl font-bold">
                          {displayPrice}
                          <span className="text-xs font-normal text-text-muted"> {cycle === 'annual' ? '/year' : '/month'}</span>
                        </p>
                        <p className="text-xs text-text-muted">
                          + ₹{gstInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} GST (18%)
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-lg font-bold text-text-muted">Pricing coming soon</p>
                    )}
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-surface-high px-3 py-2 text-xs font-semibold text-cyan">
                      <Icon name="bolt" className="text-[14px]" />
                      {plan.credits}
                    </div>
                    <ul className="mb-4 mt-3 flex flex-col gap-1.5 text-xs text-text-muted">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <Icon name="check" className="text-[14px] text-cyan" />
                        {f}
                      </li>
                    ))}
                    {plan.lockedFeatures?.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-text-muted/50">
                        <Icon name="lock" className="text-[14px]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                    {isCurrent ? (
                      <button
                        disabled
                        className="mt-auto rounded-lg border border-cyan/40 py-2 text-sm font-bold text-cyan opacity-90"
                      >
                        Current plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(plan.key, plan.name)}
                        disabled={!razorpayConfigured || !PRICING_FINALIZED || busyPlan === plan.key}
                        className="mt-auto rounded-lg bg-primary py-2 text-center text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
                      >
                        {busyPlan === plan.key
                          ? 'Opening checkout…'
                          : !PRICING_FINALIZED
                            ? 'Coming soon'
                            : `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${plan.name}`}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon name="workspace_premium" className="text-[20px]" />
              </div>
              <div>
                <p className="text-sm font-bold">Need more than Scale?</p>
                <p className="text-xs text-text-muted">
                  Higher concurrency, custom integrations, and a dedicated rollout plan for large deployments.
                </p>
              </div>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Vistrow Voice Enterprise`}
              className="shrink-0 rounded-lg border border-primary/40 px-4 py-2 text-center text-sm font-bold text-primary hover:bg-primary/10"
            >
              Contact sales
            </a>
          </div>
        </div>

        {topupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTopupOpen(false)}>
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 text-sm font-bold">Buy extra credits</h3>
              <label className="mb-1 block text-xs text-text-muted">Credits</label>
              <input
                type="number"
                min={10}
                step={10}
                value={topupCredits}
                onChange={(e) => setTopupCredits(Math.max(10, Number(e.target.value)))}
                className="mb-4 w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              />
              <p className="mb-2 text-xs text-text-muted">
                Billed at your plan's own rate ({perCreditRate.toFixed(2)}/credit) — credits apply to this billing
                cycle immediately once payment confirms.
              </p>
              {(() => {
                const base = topupCredits * perCreditRate
                const gst = base * 0.18
                return (
                  <div className="mb-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-xs">
                    <div className="flex justify-between text-text-muted">
                      <span>Subtotal</span>
                      <span>₹{base.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>GST (18%)</span>
                      <span>₹{gst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-bold text-text">
                      <span>Total</span>
                      <span>₹{(base + gst).toFixed(2)}</span>
                    </div>
                  </div>
                )
              })()}
              <div className="flex gap-2">
                <button
                  onClick={() => setTopupOpen(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-bold text-text-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTopup}
                  disabled={topupBusy}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-bg disabled:opacity-40"
                >
                  {topupBusy ? 'Opening…' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        <SectionCard title="Invoices">
          {invoices.length === 0 ? (
            <EmptyState icon="receipt_long" text="No invoices yet." />
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                  <div>
                    <p>{INVOICE_KIND_LABELS[inv.kind] || inv.kind}</p>
                    <p className="text-xs text-text-muted">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {PRICING_FINALIZED && (
                      <span className="text-text-muted">
                        ₹{inv.amount_inr}
                        {inv.gst_inr > 0 && (
                          <span className="text-[10px] text-text-muted/70"> (incl. ₹{inv.gst_inr} GST)</span>
                        )}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        inv.status === 'paid'
                          ? 'bg-cyan/15 text-cyan'
                          : inv.status === 'failed'
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-amber/15 text-amber'
                      }`}
                    >
                      {inv.status === 'pending_next_cycle' ? 'next invoice' : inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </DashboardLayout>
  )
}
