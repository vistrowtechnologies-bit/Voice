import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminBilling, type AdminBilling as Data } from '../../lib/adminApi'
import { AdminCard, EmptyState, fmtINR, PageHeader, PlanPill, StatCard } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminBilling() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    adminBilling().then(setD).catch(() => setError(true))
  }, [])

  if (error) return <EmptyState icon="error" message="Couldn't load billing." />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  return (
    <>
      <PageHeader title="Billing" subtitle="Revenue oversight, plan mix, and upsell signals." />
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
        <Icon name="info" className="text-[16px]" />
        Revenue is estimated from plan pricing — connect a payment processor for real billing.
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="MRR" value={fmtINR(d.mrr)} icon="payments" />
        <StatCard label="Paying accounts" value={d.payingAccounts} icon="verified" />
        <StatCard label="ARPA" value={fmtINR(d.arpa)} icon="account_balance" />
        <StatCard label="Near limit" value={d.nearLimit.length} sub="≥80% credits used" icon="warning" />
      </div>

      <AdminCard className="mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Revenue by plan</div>
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UsageList title="Near / over limit (upsell)" icon="trending_up" rows={d.nearLimit} navigate={navigate} empty="No accounts near their limit." />
        <UsageList title="Active free accounts (convert)" icon="upgrade" rows={d.convert} navigate={navigate} empty="No free accounts with heavy usage." />
      </div>
    </>
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
