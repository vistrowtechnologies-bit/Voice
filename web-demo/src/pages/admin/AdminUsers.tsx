import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminUsers, type AdminUserRow } from '../../lib/adminApi'
import { AdminCard, EmptyState, fmtDate, PageHeader, Pill, SearchInput, timeAgo } from '../../components/AdminUI'

export function AdminUsers() {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      adminUsers({ search, limit: 100 })
        .then((r) => {
          setRows(r.users)
          setTotal(r.total)
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  return (
    <>
      <PageHeader title="Users" subtitle={`Every user across all tenants — ${total.toLocaleString()} total. Search by email to support anyone.`} />
      <AdminCard className="mb-4 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by email or name…" />
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Auth</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => navigate(`/admin/accounts/${u.account_id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-text-muted">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-cyan hover:underline">{u.account_name}</span>
                    {u.account_status === 'suspended' && <span className="ml-2 text-[10px] text-destructive">suspended</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={u.role === 'owner' ? 'primary' : 'neutral'}>{u.role}</Pill>
                  </td>
                  <td className="px-4 py-3 capitalize text-text-muted">{u.auth_provider || 'password'}</td>
                  <td className="px-4 py-3 text-text-muted">{timeAgo(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-text-muted">{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>}
        {!loading && rows.length === 0 && <EmptyState icon="group" message="No users match this search." />}
      </AdminCard>
    </>
  )
}
