import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminAccounts, type AdminAccountRow } from '../../lib/adminApi'
import { AdminCard, EmptyState, fmtINR, FilterChip, MiniBar, PageHeader, PlanPill, SearchInput, StatusPill, timeAgo } from '../../components/AdminUI'

const PLANS = ['free', 'starter', 'growth', 'scale']

export function AdminAccounts() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<AdminAccountRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const plan = params.get('plan') || ''
  const status = params.get('status') || ''
  const activity = params.get('activity') || ''

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && next.get(key) !== value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      adminAccounts({ search, plan, status, activity, limit: 100 })
        .then((r) => {
          setRows(r.accounts)
          setTotal(r.total)
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [search, plan, status, activity])

  return (
    <>
      <PageHeader title="Accounts" subtitle={`Manage and support all ${total.toLocaleString()} platform tenants.`} />

      <AdminCard className="mb-4 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search accounts or owner email…" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Plan</span>
          {PLANS.map((p) => (
            <FilterChip key={p} active={plan === p} onClick={() => setParam('plan', p)}>
              {p}
            </FilterChip>
          ))}
          <span className="ml-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</span>
          <FilterChip active={status === 'active'} onClick={() => setParam('status', 'active')}>
            Active
          </FilterChip>
          <FilterChip active={status === 'suspended'} onClick={() => setParam('status', 'suspended')}>
            Suspended
          </FilterChip>
          <span className="ml-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Activity</span>
          <FilterChip active={activity === 'active'} onClick={() => setParam('activity', 'active')}>
            Has calls
          </FilterChip>
          <FilterChip active={activity === 'idle'} onClick={() => setParam('activity', 'idle')}>
            Idle
          </FilterChip>
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Users</th>
                <th className="px-4 py-3 text-right font-semibold">Agents</th>
                <th className="px-4 py-3 font-semibold">Credits</th>
                <th className="px-4 py-3 text-right font-semibold">Calls</th>
                <th className="px-4 py-3 font-semibold">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/admin/accounts/${a.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-high text-[11px] text-primary">
                        {a.name.slice(0, 2).toUpperCase()}
                      </span>
                      {a.name}
                      {a.is_platform_owner ? <span className="text-[10px] text-cyan">★</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{a.owner_email || '—'}</td>
                  <td className="px-4 py-3">
                    <PlanPill plan={a.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.agents}</td>
                  <td className="px-4 py-3">
                    <MiniBar used={a.credits_used} total={a.credits_total} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.calls.toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-muted">{timeAgo(a.last_call)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>}
        {!loading && rows.length === 0 && <EmptyState icon="apartment" message="No accounts match these filters." />}
      </AdminCard>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MiniStat label="Active tenants" value={rows.filter((r) => r.calls > 0).length.toLocaleString()} />
          <MiniStat label="Est. monthly revenue" value={fmtINR(rows.reduce((s, r) => s + r.mrr, 0))} />
          <MiniStat label="Suspended" value={rows.filter((r) => r.status === 'suspended').length.toLocaleString()} />
        </div>
      )}
    </>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="flex items-center justify-between p-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
        <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
      </div>
    </AdminCard>
  )
}
