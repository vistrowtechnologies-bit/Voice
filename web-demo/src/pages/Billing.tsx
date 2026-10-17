import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import { fetchBilling, fetchSubscription, invoiceDocumentUrl, invoicePdfUrl, startCheckout } from '../lib/api'
import { hasRole, useAuth } from '../lib/auth'
import { BillingDetailsCard } from '../components/BillingDetailsCard'
import { CancelSubscriptionModal } from '../components/CancelSubscriptionModal'
import { TopupModal } from '../components/TopupModal'
import { CONTACT_EMAIL } from '../lib/marketingContent'
import { ANNUAL_MONTHS_CHARGED, PLANS, PRICING_FINALIZED, SHARED_PLAN_FEATURES, planHighlights } from '../lib/plans'
import { loadRazorpayCheckout } from '../lib/razorpay'
import type { BillingSummary, Invoice } from '../lib/types'
import { Tooltip } from '../components/ui/Tooltip'

const INVOICE_KIND_LABELS: Record<string, string> = {
  subscription: 'Plan renewal',
  overage: 'Overage + phone numbers',
  topup: 'Minute top-up',
  phone_number: 'Phone number',
}

export function Billing() {
  const { user } = useAuth()
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [razorpayConfigured, setRazorpayConfigured] = useState(false)
  // Annual (minute pricing, 17 Oct): pay 11 months, get the year's minutes at once
  // (agent/plan_policy.py plan_allowance), so it is offered next to monthly.
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [topupOpen, setTopupOpen] = useState(false)
  const [error, setError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const canManage = hasRole(user, 'admin')

  // The header credits pill links here with ?topup=1 to open the modal straight away.
  useEffect(() => {
    if (searchParams.get('topup') !== '1') return
    setTopupOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('topup')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  function refetch() {
    fetchBilling().then(setBilling).catch(() => setBilling(null))
    fetchSubscription()
      .then((r) => {
        setInvoices(r.invoices)
        setRazorpayConfigured(r.razorpayConfigured)
      })
      .catch(() => setRazorpayConfigured(false))
  }

  useEffect(refetch, [])

  const usedPct = billing && billing.creditsTotal > 0 ? Math.max(0, Math.min(100, Math.round((billing.creditsUsed / billing.creditsTotal) * 100))) : 0
  const currentPlanKey = billing?.plan || (user?.plan || 'starter').toLowerCase()
  const currentPlanName = PLANS.find((p) => p.key === currentPlanKey)?.name || 'Starter'
  // The server's plan list (minutes, annual prices, overage); local PLANS keeps names and features.
  const serverPlan = (key: string) => billing?.plans?.find((p) => p.plan === key)
  // An annual subscription is granted the whole year's minutes, so compare with that.
  const currentPlanCredits =
    (billing?.billingCycle === 'annual' ? serverPlan(currentPlanKey)?.annualMinutesPerYear : serverPlan(currentPlanKey)?.monthlyMinutes) ||
    PLANS.find((p) => p.key === currentPlanKey)?.creditsNum ||
    billing?.creditsTotal ||
    1

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
                  <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Remaining minutes</p>
                  <p className="text-2xl font-bold">
                    {billing?.creditsRemaining ?? '-'}
                    <span className="ml-1 text-sm font-normal text-text-muted">of {billing?.creditsTotal ?? '-'} allocated</span>
                  </p>
                </div>
              </div>
              <Tooltip content={!razorpayConfigured ? 'Online payments are unavailable. Contact us for billing assistance.' : undefined}><button
                onClick={() => setTopupOpen(true)}
                disabled={!razorpayConfigured || !PRICING_FINALIZED}
                className="rounded-lg border border-cyan/40 px-3 py-1.5 text-xs font-bold text-cyan hover:bg-cyan/10 disabled:opacity-40"
              >
                + Buy minutes
              </button></Tooltip>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-high">
              <div
                className={`h-full rounded-full ${usedPct > 85 ? 'bg-destructive' : 'bg-cyan'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {billing && billing.creditsTotal !== currentPlanCredits && (
              <p className="mt-3 rounded-lg border border-border p-3 text-xs text-text-muted">
                This workspace has a custom allocation of {billing.creditsTotal.toLocaleString()} minutes, separate from the standard {currentPlanName} allowance of {currentPlanCredits.toLocaleString()} minutes{billing.billingCycle === 'annual' ? ' a year' : ' a month'}. Testing and manually allocated workspaces can differ from paid plans. Your existing balance is unchanged.
              </p>
            )}
            <p className="mt-2 text-xs text-text-muted">
              {billing ? `${billing.minutesUsed} call minutes used this cycle. Standard voices use 1 minute per call minute, premium voices 2, Vistrow Live ${billing.liveMinutesPerMinute ?? 3}.` : 'Loading usage…'}
            </p>
            {billing && billing.overageCredits > 0 && (
              <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
                {billing.overageCredits} minutes over plan this cycle
                {PRICING_FINALIZED
                  ? ` · estimated ₹${billing.overageAmountInr} at ₹${billing.overageRateInr}/min. This estimate is not a payment confirmation or invoice.`
                  : ' · overage pricing is being finalized'}
              </p>
            )}
            {billing && billing.phoneNumberCount > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                {billing.phoneNumberCount} active phone number{billing.phoneNumberCount === 1 ? '' : 's'}
                {' · Telephony is separate from AI minutes. Provider charges and any number rental depend on your setup; contact us to confirm your allocation.'}
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
                ? billing.cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Subscription active'
                : billing?.subscriptionStatus === 'cancelled'
                  ? 'Subscription cancelled'
                  : 'No recurring subscription connected'}
            </p>
            {billing?.subscriptionStatus === 'active' && billing.cancelAtPeriodEnd && (
              <p className="mt-2 rounded-lg bg-amber/10 px-2.5 py-2 text-xs text-text">
                Ends on {billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : 'the end of this period'} and will not renew. You keep full access until then.
                {/* Razorpay has no undo for a scheduled cancellation, so no Resume button: it would fail every time. */}
                {canManage && (
                  <>
                    {' '}To keep the plan after all,{' '}
                    <Link to="/dashboard/support" className="font-semibold text-primary underline-offset-2 hover:underline">contact billing support</Link>
                    {' '}before that date.
                  </>
                )}
              </p>
            )}
            {billing?.subscriptionStatus === 'active' && !billing.cancelAtPeriodEnd && canManage && (
              <button type="button" onClick={() => setCancelOpen(true)} className="mt-3 text-xs font-semibold text-text-muted underline-offset-2 hover:text-destructive hover:underline">
                Cancel subscription
              </button>
            )}
          </Card>
        </div>

        <p className="text-xs text-text-muted">
          Plan minutes used = call minutes × voice multiplier × model multiplier: 1 for standard voices, 2 for premium voices, 3 for Vistrow Live. The full breakdown by day, channel, agent, voice and model is on{' '}
          <Link to="/dashboard/usage" className="font-semibold text-cyan hover:underline">Usage</Link>.
        </p>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Available plans</h2>
            <div className="flex items-center gap-3">
              <div role="radiogroup" aria-label="Billing cycle" className="flex rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold">
                {(['monthly', 'annual'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={cycle === c}
                    onClick={() => setCycle(c)}
                    className={`rounded-md px-3 py-1 ${cycle === c ? 'bg-primary text-white' : 'bg-transparent text-text-muted hover:text-text'}`}
                  >
                    {c === 'monthly' ? 'Monthly' : `Annual · pay ${ANNUAL_MONTHS_CHARGED} months`}
                  </button>
                ))}
              </div>
              <span className="text-xs text-text-muted">INR, GST extra</span>
            </div>
          </div>
          {!PRICING_FINALIZED ? (
            <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber">
              Introductory pricing is being finalized ahead of public beta — upgrades aren't open yet.
            </p>
          ) : (
            !razorpayConfigured && (
              <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber">
                Online payments and self-service plan changes are currently unavailable. Your existing access and minutes are unchanged.{' '}
                <a className="underline" href={`mailto:${CONTACT_EMAIL}?subject=Billing assistance`}>Contact us for activation or billing assistance.</a>
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
              // Prices and minutes come from the server's plan list when it has
              // sent one; the local copy is only the fallback.
              const sp = serverPlan(plan.key)
              const priceInr = cycle === 'annual' ? sp?.annualPrice ?? plan.priceInr * ANNUAL_MONTHS_CHARGED : sp?.monthlyPrice ?? plan.priceInr
              const displayPrice = `₹${priceInr.toLocaleString('en-IN')}`
              const gstInr = priceInr * 0.18
              const minutesLine =
                cycle === 'annual' && sp
                  ? `${sp.annualMinutesPerYear.toLocaleString('en-IN')} minutes a year (${sp.annualMinutesPerMonth.toLocaleString('en-IN')}/month)`
                  : `${(sp?.monthlyMinutes ?? plan.creditsNum).toLocaleString('en-IN')} minutes a month`
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
                    <div className="mt-3 flex flex-col gap-0.5 rounded-lg bg-surface-high px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-cyan">
                        <Icon name="bolt" className="text-[14px]" />
                        {minutesLine}
                      </span>
                      {sp && (
                        <span className="text-text-muted">
                          Then ₹{sp.overagePerMinute}/min · Vistrow Live uses {billing?.liveMinutesPerMinute ?? 3} min per min
                        </span>
                      )}
                    </div>
                    <ul className="mt-3 flex flex-col gap-1.5 text-xs text-text-muted">
                      {planHighlights(plan).map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <Icon name="check" className="text-[14px] text-cyan" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan.lockedFeatures && plan.lockedFeatures.length > 0 && (
                      <div className="mb-4 mt-4 border-t border-border pt-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                          <Icon name="lock" className="text-[13px]" />
                          Premium features
                        </p>
                        <ul className="flex flex-col gap-1.5 text-xs">
                          {plan.lockedFeatures.map((f) => (
                            <li key={f} className="flex items-center justify-between gap-2 text-text-muted/60">
                              <span>{f}</span>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted/60">
                                {['Full API access', 'Premium voice tier'].includes(f) ? 'Scale' : 'Growth+'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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

          <details className="mt-4 rounded-xl border border-border bg-surface p-5">
            <summary className="cursor-pointer font-semibold">Included in every plan</summary>
            <ul className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
              {SHARED_PLAN_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <p className="mt-4 text-xs text-text-muted">Basic inbound phone calls use a configured, supported number. Advanced inbound routing and outbound campaigns require Growth or Scale. Telephony charges are separate.</p>
          </details>

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

        {topupOpen && billing && razorpayConfigured && PRICING_FINALIZED && (
          <TopupModal billing={billing} onClose={() => setTopupOpen(false)} onSuccess={refetch} />
        )}

        <SectionCard title="Payment history" subtitle="Includes payment attempts and billing records. Only records marked Paid confirm a completed payment; pending attempts are not paid invoices.">
          {invoices.length === 0 ? (
            <EmptyState icon="receipt_long" text="No payment activity yet." />
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                  <div>
                    <p>
                      {INVOICE_KIND_LABELS[inv.kind] || inv.kind}
                      {inv.kind === 'topup' && inv.credits ? ` · +${(inv.credits + (inv.bonus_credits || 0)).toLocaleString('en-IN')} minutes` : ''}
                    </p>
                    <p className="text-xs text-text-muted">{new Date(inv.created_at).toLocaleDateString()}{inv.invoice_number ? ` · ${inv.invoice_number}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {(inv.status === 'paid' || inv.status === 'refunded') && canManage && (
                      <>
                        <a href={invoiceDocumentUrl(inv.id, true)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <Icon name="receipt_long" className="text-[15px]" /> Invoice
                        </a>
                        <a href={invoicePdfUrl(inv.id)} download className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <Icon name="download" className="text-[15px]" /> PDF
                        </a>
                      </>
                    )}
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
                            : inv.status === 'refunded'
                              ? 'bg-surface-high text-text-muted'
                              : 'bg-amber/15 text-amber'
                      }`}
                    >
                      {inv.status === 'created' ? 'Payment not completed' : inv.status === 'pending_next_cycle' ? 'Pending billing' : inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {canManage && <BillingDetailsCard />}
      </section>

      {cancelOpen && (
        <CancelSubscriptionModal
          planKey={currentPlanKey}
          planName={currentPlanName}
          endsOn={billing?.currentPeriodEnd ?? null}
          onClose={() => setCancelOpen(false)}
          onDone={refetch}
        />
      )}
    </DashboardLayout>
  )
}
