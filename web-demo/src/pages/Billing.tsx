import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { fetchBilling } from '../lib/api'
import { BRAND } from '../lib/brand'
import { PLANS } from '../lib/plans'
import type { BillingSummary } from '../lib/types'

export function Billing() {
  const [billing, setBilling] = useState<BillingSummary | null>(null)

  useEffect(() => {
    fetchBilling().then(setBilling).catch(() => setBilling(null))
  }, [])

  const usedPct = billing ? Math.min(100, Math.round((billing.creditsUsed / billing.creditsTotal) * 100)) : 0

  return (
    <DashboardLayout>
      <PageHeader title="Billing" subtitle="Manage your subscription and usage" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20 text-cyan">
                <Icon name="toll" className="text-[20px]" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Credits</p>
                <p className="text-2xl font-bold">
                  {billing?.creditsRemaining ?? '—'}
                  <span className="ml-1 text-sm font-normal text-text-muted">/ {billing?.creditsTotal ?? '—'} available</span>
                </p>
              </div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-high">
              <div
                className={`h-full rounded-full ${usedPct > 85 ? 'bg-destructive' : 'bg-cyan'}`}
                style={{ width: `${Math.max(2, usedPct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {billing ? `${billing.minutesUsed} call minutes used this cycle (1 credit ≈ 1 minute)` : 'Loading usage…'}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Current plan</p>
            <p className="mt-1 text-xl font-bold">Starter</p>
            <p className="mt-1 text-xs text-text-muted">Billed monthly · next renewal on the 1st</p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-cyan">
              <Icon name="check_circle" className="text-[14px]" />
              All usage tracked from real call minutes
            </p>
          </div>
        </div>

        {billing && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Usage by call type</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                Phone calls burn more credits/min than browser or widget calls — they carry a telephony cost the
                others don't.
              </p>
            </div>
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
                  <div key={type} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Icon name={icon} className="text-[16px] text-text-muted" />
                      <span>{label}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                        {rate} credit/min
                      </span>
                    </div>
                    <span className="text-text-muted">
                      {minutes} min · {Math.round(minutes * rate * 10) / 10} credits
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {billing && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Usage by voice tier</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                ElevenLabs voices burn more credits/min than Sarvam — they're pricier per minute to run, but sound
                more expressive and react live to caller emotion.
              </p>
            </div>
            <div className="divide-y divide-border">
              {(
                [
                  ['economy', 'Economy (Sarvam bulbul:v2)', 'savings'],
                  ['standard', 'Standard (Sarvam bulbul:v3)', 'graphic_eq'],
                  ['premium', 'Premium (ElevenLabs)', 'auto_awesome'],
                ] as const
              ).map(([tier, label, icon]) => {
                const minutes = billing.minutesByVoiceTier[tier] ?? 0
                const rate = billing.voiceTierRates[tier] ?? 1
                return (
                  <div key={tier} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Icon name={icon} className="text-[16px] text-text-muted" />
                      <span>{label}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                        {rate}x credits
                      </span>
                    </div>
                    <span className="text-text-muted">
                      {minutes} min · {Math.round(minutes * rate * 10) / 10} credits
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Available plans</h2>
            <span className="rounded-full border border-border px-3 py-1 text-[11px] text-text-muted">Region · India</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-xl border bg-surface p-5 ${
                  plan.tag === 'Recommended' ? 'border-cyan/50' : plan.tag === 'Most Popular' ? 'border-amber/50' : 'border-border'
                }`}
              >
                {plan.tag && (
                  <span
                    className={`mb-2 self-start rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                      plan.tag === 'Recommended' ? 'bg-cyan/15 text-cyan' : 'bg-amber/15 text-amber'
                    }`}
                  >
                    {plan.tag}
                  </span>
                )}
                <h3 className="text-lg font-bold uppercase tracking-wide">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold">
                  {plan.price}
                  <span className="text-xs font-normal text-text-muted"> /month + GST</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-cyan">
                  <Icon name="bolt" className="text-[14px]" />
                  {plan.credits}
                </p>
                <ul className="mb-4 mt-3 flex flex-col gap-1.5 text-xs text-text-muted">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Icon name="check" className="text-[14px] text-cyan" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.name === 'Starter' ? (
                  <button
                    disabled
                    className="mt-auto rounded-lg border border-cyan/40 py-2 text-sm font-bold text-cyan opacity-90"
                  >
                    Current plan
                  </button>
                ) : (
                  <a
                    href={`mailto:sales@vistrow.ai?subject=${encodeURIComponent(
                      `Upgrade to ${plan.name} plan`,
                    )}&body=${encodeURIComponent(
                      `Hi, we'd like to upgrade our ${BRAND.name} subscription to the ${plan.name} plan (${plan.price}/month).`,
                    )}`}
                    className="mt-auto rounded-lg bg-primary py-2 text-center text-sm font-bold text-bg hover:opacity-90"
                  >
                    Upgrade to {plan.name}
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-text-muted">
            Plans shown are indicative — online checkout isn't wired up yet. Credits and usage above are
            computed from real call minutes in the call log.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">Invoices</h3>
          </div>
          <p className="px-5 py-8 text-center text-sm text-text-muted">No invoices yet.</p>
        </div>
      </section>
    </DashboardLayout>
  )
}
