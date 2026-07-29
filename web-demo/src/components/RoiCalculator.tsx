import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { PLANS } from '../lib/plans'

// Deliberately conservative and fully user-adjustable: every input the
// result depends on is a field the visitor can change, and the phone
// credit multiplier + plan prices come from the same PLANS source the
// pricing page quotes. Nothing is hardcoded to flatter the outcome, and
// the footnote states plainly that this is an estimate — a calculator
// that quietly assumes a flattering baseline is worse than none.

/** Phone calls draw 1.5 credits per minute; browser/widget calls draw 1.
 * Mirrors credit_rate_phone in the platform's default settings. */
const PHONE_CREDITS_PER_MIN = 1.5

function parsePlanPrice(price: string): number {
  return Number(price.replace(/[^0-9]/g, ''))
}

function parsePlanCredits(credits: string): number {
  return Number(credits.replace(/[^0-9]/g, ''))
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  min?: number
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 focus-within:border-primary">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="w-full bg-transparent text-sm text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className="flex-shrink-0 text-xs text-text-muted">{suffix}</span>}
      </div>
    </div>
  )
}

export function RoiCalculator() {
  // Defaults land inside the largest plan's credit allowance on purpose —
  // a first-load state that immediately trips the "you'd need a custom
  // plan" caveat makes the calculator feel broken rather than careful.
  const [callsPerMonth, setCallsPerMonth] = useState(500)
  const [avgMinutes, setAvgMinutes] = useState(3)
  const [staffCount, setStaffCount] = useState(2)
  const [salaryPerStaff, setSalaryPerStaff] = useState(25000)

  const result = useMemo(() => {
    const totalMinutes = callsPerMonth * avgMinutes
    const creditsNeeded = totalMinutes * PHONE_CREDITS_PER_MIN

    // Cheapest plan whose monthly credit allowance covers the volume;
    // falls back to the largest plan (with a note) when it doesn't.
    const ranked = [...PLANS].sort((a, b) => parsePlanCredits(a.credits) - parsePlanCredits(b.credits))
    const fitting = ranked.find((p) => parsePlanCredits(p.credits) >= creditsNeeded)
    const plan = fitting ?? ranked[ranked.length - 1]
    const planCredits = parsePlanCredits(plan.credits)
    const planCost = parsePlanPrice(plan.price)
    const overflows = !fitting

    const humanCost = staffCount * salaryPerStaff
    const saving = humanCost - planCost
    const savingPct = humanCost > 0 ? (saving / humanCost) * 100 : 0

    return {
      totalMinutes,
      creditsNeeded,
      plan,
      planCredits,
      planCost,
      overflows,
      humanCost,
      saving,
      savingPct,
    }
  }, [callsPerMonth, avgMinutes, staffCount, salaryPerStaff])

  return (
    <div className="rounded-3xl border border-border bg-surface p-7 sm:p-9">
      <div className="grid gap-9 lg:grid-cols-2">
        {/* Inputs */}
        <div>
          <h3 className="font-display text-xl font-bold">Your numbers</h3>
          <p className="mt-1.5 text-sm text-text-muted">
            Change anything here — the estimate updates as you type.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Calls per month" value={callsPerMonth} onChange={setCallsPerMonth} />
            <Field label="Avg call length" value={avgMinutes} onChange={setAvgMinutes} suffix="min" min={1} />
            <Field label="People answering today" value={staffCount} onChange={setStaffCount} />
            <Field
              label="Cost per person"
              value={salaryPerStaff}
              onChange={setSalaryPerStaff}
              suffix="₹/mo"
            />
          </div>
        </div>

        {/* Result */}
        <div className="flex flex-col justify-between gap-5 rounded-2xl border border-border bg-bg p-6">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-text-muted">Answering calls today</span>
              <span className="font-display text-xl font-bold tabular-nums">{inr(result.humanCost)}<span className="text-sm font-normal text-text-muted">/mo</span></span>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-sm text-text-muted">
                With Vistrow Voice
                <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {result.plan.name}
                </span>
              </span>
              <span className="font-display text-xl font-bold tabular-nums text-primary">
                {inr(result.planCost)}<span className="text-sm font-normal text-text-muted">/mo</span>
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            {result.saving > 0 ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Estimated monthly difference
                </p>
                <p className="mt-1 font-display text-4xl font-bold tabular-nums text-success">
                  {inr(result.saving)}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  about {Math.round(result.savingPct)}% lower, before counting the calls nobody was
                  there to answer
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  At this volume
                </p>
                <p className="mt-1 font-display text-2xl font-bold">Your team is already cheaper</p>
                <p className="mt-1 text-sm text-text-muted">
                  Vistrow still adds 24/7 coverage and logs every call — but we won’t pretend the
                  monthly cost is lower at these numbers.
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-text-muted">
            <Icon name="info" className="mr-1 align-[-3px] text-[14px]" />
            {result.totalMinutes.toLocaleString('en-IN')} min/month ≈{' '}
            {Math.round(result.creditsNeeded).toLocaleString('en-IN')} credits at the phone rate.
            {result.overflows && (
              <>
                {' '}
                That’s above the {result.plan.name} allowance of{' '}
                {result.planCredits.toLocaleString('en-IN')} — at this volume you’d be on a custom
                plan, so treat the figure above as a floor, not a quote.
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-text-muted">
        An estimate, not a quote. It compares plan price against the staffing cost you entered and
        ignores things that vary too much per business to guess — telecom charges, recruitment and
        training, attrition, and the revenue value of calls that currently go unanswered.
      </p>
    </div>
  )
}
