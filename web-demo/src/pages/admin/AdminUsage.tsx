import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminUsage, type AdminUsage as Data, type AdminUsageRow } from '../../lib/adminApi'
import { AdminCard, EmptyState, ErrorState, fmtINR, PageHeader, PlanPill, StatCard } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

type SortKey = keyof Omit<AdminUsageRow, 'id'>

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; money?: boolean }[] = [
  { key: 'name', label: 'Account' },
  { key: 'plan', label: 'Plan' },
  { key: 'calls', label: 'Calls', numeric: true },
  { key: 'minutes', label: 'Minutes', numeric: true },
  { key: 'credits', label: 'Credits used', numeric: true },
  { key: 'revenueInr', label: 'Revenue', numeric: true, money: true },
  { key: 'estCostInr', label: 'Est. vendor cost', numeric: true, money: true },
  { key: 'marginInr', label: 'Est. margin', numeric: true, money: true },
]

const PRESETS = [7, 30, 90]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 })

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(data: Data, rows: AdminUsageRow[]) {
  const header = ['account_id', 'account', 'plan', 'calls', 'minutes', 'credits', 'test_minutes', 'revenue_inr', 'est_vendor_cost_inr', 'est_margin_inr']
  const line = (r: AdminUsageRow | (Data['totals'] & { id: string; name: string; plan: string })) =>
    [r.id, r.name, r.plan, r.calls, r.minutes, r.credits, r.testMinutes, r.revenueInr, r.estCostInr, r.marginInr].map(csvCell).join(',')
  const body = [header.join(','), ...rows.map(line), line({ ...data.totals, id: '', name: 'TOTAL', plan: '' })].join('\n')
  const url = URL.createObjectURL(new Blob([body + '\n'], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `usage-cost-${data.range.from}-to-${data.range.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AdminUsage() {
  const [from, setFrom] = useState(() => isoDaysAgo(29))
  const [to, setTo] = useState(() => isoDaysAgo(0))
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'estCostInr', desc: true })

  const load = useCallback(() => {
    setError('')
    adminUsage({ from, to })
      .then(setData)
      .catch((e: Error) => setError(e.message || "Couldn't load usage."))
  }, [from, to])

  useEffect(load, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const out = [...data.accounts]
    out.sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.desc ? -c : c
    })
    return out
  }, [data, sort])

  const preset = PRESETS.find((d) => from === isoDaysAgo(d - 1) && to === isoDaysAgo(0))

  return (
    <>
      <PageHeader
        title="Usage & cost"
        subtitle="Per-account usage, revenue and estimated vendor cost (India time)."
        action={
          data && (
            <button
              onClick={() => downloadCsv(data, rows)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold hover:border-primary"
            >
              <Icon name="download" className="text-[16px]" /> CSV
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => {
                setFrom(isoDaysAgo(d - 1))
                setTo(isoDaysAgo(0))
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                preset === d ? 'bg-primary text-bg' : 'bg-transparent text-text-muted hover:text-text'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          From
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm normal-case text-text outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          To
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)}
            className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm normal-case text-text outline-none focus:border-primary" />
        </label>
      </div>

      {error ? (
        <AdminCard>
          <ErrorState message={error} onRetry={load} />
        </AdminCard>
      ) : !data ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Minutes" value={num(data.totals.minutes)} sub={`${num(data.totals.calls)} calls`} icon="call" />
            <StatCard label="Revenue (net, ex-GST)" value={fmtINR(data.totals.revenueInr)} icon="currency_rupee" />
            <StatCard label="Vendor cost (estimated)" value={fmtINR(data.totals.estCostInr)} sub={`incl. ${num(data.totals.testMinutes)} test min`} icon="receipt_long" />
            <StatCard label="Margin (estimated)" value={fmtINR(data.totals.marginInr)} icon="savings" />
          </div>

          <AdminCard className="mt-6 overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState icon="insights" message="No calls or payments in this range." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                      {COLUMNS.map((c) => (
                        <th key={c.key} className={`px-4 py-2.5 font-semibold ${c.numeric ? 'text-right' : ''}`}
                          aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                          <button
                            onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : !!c.numeric }))}
                            className="inline-flex items-center gap-0.5 whitespace-nowrap bg-transparent uppercase hover:text-text"
                          >
                            {c.label}
                            {sort.key === c.key && <Icon name={sort.desc ? 'arrow_downward' : 'arrow_upward'} className="text-[13px]" />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-semibold">
                          <Link to={`/admin/accounts/${r.id}`} className="text-primary hover:underline">{r.name}</Link>
                        </td>
                        <td className="px-4 py-3"><PlanPill plan={r.plan} /></td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(r.calls)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(r.minutes)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(r.credits)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtINR(r.revenueInr)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-muted">~{fmtINR(r.estCostInr)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${r.marginInr < 0 ? 'text-destructive' : ''}`}>
                          ~{fmtINR(r.marginInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface-high/50 font-semibold">
                      <td className="px-4 py-3" colSpan={2}>Total ({rows.length} accounts)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(data.totals.calls)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(data.totals.minutes)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(data.totals.credits)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtINR(data.totals.revenueInr)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">~{fmtINR(data.totals.estCostInr)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${data.totals.marginInr < 0 ? 'text-destructive' : ''}`}>
                        ~{fmtINR(data.totals.marginInr)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </AdminCard>

          <CostRates rates={data.rates} />
        </>
      )}
    </>
  )
}

/** How the estimate is built - the server's VENDOR_COST_RATES table. */
export function CostRates({ rates }: { rates: Data['rates'] }) {
  return (
    <AdminCard className="mt-6 p-5 text-sm">
      <h3 className="mb-2 font-display text-base font-semibold">How vendor cost is estimated</h3>
      <p className="mb-3 text-text-muted">
        Nothing records the real cost of each call yet, so cost = call minutes × an average rate per minute for the engine the
        agent ran on, plus LiveKit on every call and EnableX on phone calls. Test calls are included because the vendors bill
        them. Revenue is paid invoices minus refunds in the range, without GST.
      </p>
      <ul className="flex flex-col gap-1.5">
        {rates.map((r) => (
          <li key={r.key} className="flex flex-wrap justify-between gap-x-4">
            <span>
              {r.label} <span className="text-text-muted">· {r.source}</span>
            </span>
            <span className="tabular-nums font-semibold">₹{r.inrPerMin}/min</span>
          </li>
        ))}
      </ul>
    </AdminCard>
  )
}
