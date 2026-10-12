import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  adminBilling,
  adminFinance,
  adminInvoicePdfUrl,
  adminInvoices,
  type AdminBilling as Data,
  type AdminFinance,
  type AdminInvoice,
} from '../../lib/adminApi'
import { AdminCard, EmptyState, ErrorState, FilterChip, fmtDate, fmtDateTime, fmtINR, PageHeader, PlanPill, StatCard } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

/** Finance (route /admin/finance, and /admin/billing for old links): revenue
 * from invoices, MRR from active subscriptions, plan mix, invoices and
 * failed payments, and month-to-date revenue vs ESTIMATED vendor cost. */
export function AdminBilling() {
  const [d, setD] = useState<Data | null>(null)
  const [fin, setFin] = useState<AdminFinance | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([adminBilling(), adminFinance()])
      .then(([b, f]) => {
        setD(b)
        setFin(f)
      })
      .catch((e: Error) => setError(e.message || "Couldn't load finance."))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!d || !fin) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  const mtd = fin.revenueMtd
  const cost = fin.costVsRevenueMtd

  return (
    <>
      <PageHeader title="Finance" subtitle="Revenue from invoices, subscriptions, payments and estimated vendor cost (India time)." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Revenue MTD (net)"
          value={fmtINR(mtd.netInr)}
          sub={`Captured ${fmtINR(mtd.capturedInr)} · refunds ${fmtINR(mtd.refundsInr)}`}
          icon="currency_rupee"
        />
        <StatCard label="Contracted MRR (active subscriptions)" value={fmtINR(d.mrr)} icon="payments" />
        <StatCard label="Paying accounts" value={d.payingAccounts.toLocaleString('en-IN')} sub="active subscription or paid invoice (35 d)" icon="verified" />
        <StatCard label="ARPA" value={fmtINR(d.arpa)} icon="account_balance" />
      </div>

      <AdminCard className="mt-6 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">This month: revenue vs vendor cost</h3>
          <Link to="/admin/usage" className="text-xs font-semibold text-primary hover:underline">Per account</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Revenue (ex-GST)" value={fmtINR(cost.revenueInr)} />
          <Figure label="Vendor cost (estimated)" value={`~${fmtINR(cost.estCostInr)}`} />
          <Figure label="Margin (estimated)" value={`~${fmtINR(cost.marginInr)}`} danger={cost.marginInr < 0} />
          <Figure label="Minutes" value={cost.minutes.toLocaleString('en-IN', { maximumFractionDigits: 0 })} />
        </div>
        <p className="mt-3 text-xs text-text-muted">
          {fmtDate(cost.from)} to {fmtDate(cost.to)}. Cost is minutes × average per-minute vendor rates, not a bill; see Usage &amp; cost for the rates.
        </p>
      </AdminCard>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Revenue by month</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Month</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Captured</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Top-ups</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Refunds</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...fin.months].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3">{monthLabel(m.month)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtINR(m.capturedInr)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">{fmtINR(m.topupsInr)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">{fmtINR(m.refundsInr)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtINR(m.netInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-3 text-[11px] text-text-muted">Invoice totals including GST. Captured counts the month paid; refunds the month refunded.</p>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Revenue by plan (MRR)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Plan</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Accounts</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-5 py-2.5 text-right font-semibold">MRR</th>
                </tr>
              </thead>
              <tbody>
                {d.byPlan.map((p) => (
                  <tr key={p.plan} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3">
                      <PlanPill plan={p.plan} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.accounts}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">{p.price ? fmtINR(p.price) : 'Free'}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtINR(p.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>

      <AdminCard className="mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 font-display text-base font-semibold">
          <Icon name="error" className="text-[18px] text-destructive" /> Failed payments · last 30 days
        </div>
        {fin.failedPayments30d.length === 0 ? (
          <EmptyState icon="check_circle" message="No failed payments in the last 30 days." />
        ) : (
          <InvoiceTable rows={fin.failedPayments30d} />
        )}
      </AdminCard>

      <Invoices />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UsageList title="Near / over limit (upsell)" icon="trending_up" rows={d.nearLimit} navigate={navigate} empty="No accounts near their limit." />
        <UsageList title="Active free accounts (convert)" icon="upgrade" rows={d.convert} navigate={navigate} empty="No free accounts with heavy usage." />
      </div>
    </>
  )
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function Figure({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`font-display text-xl font-bold tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  )
}

const STATUSES = ['', 'paid', 'failed', 'refunded', 'created']

function Invoices() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<AdminInvoice[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(null)
    setError('')
    adminInvoices(status)
      .then((r) => setRows(r.invoices))
      .catch((e: Error) => setError(e.message || "Couldn't load invoices."))
  }, [status])

  return (
    <AdminCard className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <span className="font-display text-base font-semibold">Invoices</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <FilterChip key={s || 'all'} active={status === s} onClick={() => setStatus(s)}>
              {s || 'All'}
            </FilterChip>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : rows === null ? (
        <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-high" />
      ) : rows.length === 0 ? (
        <EmptyState icon="receipt_long" message="No invoices with this status." />
      ) : (
        <InvoiceTable rows={rows} />
      )}
    </AdminCard>
  )
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-success/10 text-success',
  refunded: 'bg-amber/10 text-amber',
  failed: 'bg-destructive/10 text-destructive',
}

function InvoiceTable({ rows }: { rows: AdminInvoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
            <th className="px-5 py-2.5 font-semibold">Date</th>
            <th className="px-5 py-2.5 font-semibold">Account</th>
            <th className="px-5 py-2.5 font-semibold">What</th>
            <th className="px-5 py-2.5 font-semibold">Invoice no.</th>
            <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
            <th className="px-5 py-2.5 font-semibold">Status</th>
            <th className="px-5 py-2.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => {
            const when = inv.paidAt ?? inv.createdAt
            return (
              <tr key={inv.id} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-5 py-3 text-text-muted" title={fmtDateTime(when)}>{fmtDate(when)}</td>
                <td className="px-5 py-3">
                  <Link to={`/admin/accounts/${inv.accountId}`} className="font-semibold text-primary hover:underline">{inv.accountName}</Link>
                </td>
                <td className="px-5 py-3 capitalize">{inv.kind.replace('_', ' ')}</td>
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{inv.invoiceNumber ?? '-'}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                  ₹{inv.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[inv.status] ?? 'bg-surface-high text-text-muted'}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {(inv.status === 'paid' || inv.status === 'refunded') && (
                    <a href={adminInvoicePdfUrl(inv.accountId, inv.id)} download className="text-xs font-semibold text-primary hover:underline">
                      PDF
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function UsageList({
  title,
  icon,
  rows,
  navigate,
  empty,
}: {
  title: string
  icon: string
  rows: { id: number; name: string; plan: string; used: number; total: number; pct: number }[]
  navigate: (p: string) => void
  empty: string
}) {
  return (
    <AdminCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 font-display text-base font-semibold">
        <Icon name={icon} className="text-[18px] text-primary" /> {title}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="check_circle" message={empty} />
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((r) => (
            <button key={r.id} onClick={() => navigate(`/admin/accounts/${r.id}`)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-high">
              <div>
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-text-muted">
                  <PlanPill plan={r.plan} /> · {Math.round(r.used)} / {Math.round(r.total)} credits
                </div>
              </div>
              <span className={`text-sm font-bold tabular-nums ${r.pct >= 100 ? 'text-destructive' : 'text-amber'}`}>{r.pct}%</span>
            </button>
          ))}
        </div>
      )}
    </AdminCard>
  )
}
