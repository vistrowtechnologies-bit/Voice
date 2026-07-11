import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminCalls, adminCallDetail, type AdminCallRow, type AdminCallDetail } from '../../lib/adminApi'
import { AdminCard, EmptyState, fmtDuration, FilterChip, PageHeader, Pill, SearchInput, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

const CHANNELS = ['browser', 'phone', 'widget']

export function AdminCalls() {
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('')
  const [days, setDays] = useState(0)
  const [rows, setRows] = useState<AdminCallRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      adminCalls({ search, channel, days, limit: 100 })
        .then((r) => {
          setRows(r.calls)
          setTotal(r.total)
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [search, channel, days])

  return (
    <>
      <PageHeader title="All Calls" subtitle={`Every call across the platform — ${total.toLocaleString()} total. Click any call to read the transcript.`} />
      <AdminCard className="mb-4 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by lead, phone, or room…" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Channel</span>
          {CHANNELS.map((c) => (
            <FilterChip key={c} active={channel === c} onClick={() => setChannel(channel === c ? '' : c)}>
              {c}
            </FilterChip>
          ))}
          <span className="ml-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Range</span>
          <FilterChip active={days === 7} onClick={() => setDays(days === 7 ? 0 : 7)}>
            7d
          </FilterChip>
          <FilterChip active={days === 30} onClick={() => setDays(days === 30 ? 0 : 30)}>
            30d
          </FilterChip>
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 text-right font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Outcome</th>
                <th className="px-4 py-3 text-right font-semibold">Credits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/admin/calls/${c.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high"
                >
                  <td className="px-4 py-3 text-text-muted">{timeAgo(c.started_at)}</td>
                  <td className="px-4 py-3 font-semibold">{c.account_name || '—'}</td>
                  <td className="px-4 py-3 capitalize">{c.call_type}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtDuration(c.duration_seconds)}</td>
                  <td className="px-4 py-3">
                    {c.qualified ? <Pill tone="active">Qualified</Pill> : <Pill tone="neutral">No lead</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.credits.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>}
        {!loading && rows.length === 0 && <EmptyState icon="call" message="No calls match these filters." />}
      </AdminCard>
    </>
  )
}

export function AdminCallDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState<AdminCallDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    adminCallDetail(Number(id)).then(setC).catch(() => setError(true))
  }, [id])

  if (error) return <EmptyState icon="error" message="Call not found." />
  if (!c) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-xs text-text-muted hover:text-text">
        <Icon name="chevron_left" className="text-[16px]" /> Back
      </button>
      <PageHeader
        title={c.account_name || 'Call'}
        subtitle={`${c.call_type} call · ${fmtDuration(c.duration_seconds)} · ${timeAgo(c.started_at)}`}
        action={
          c.account_id ? (
            <button onClick={() => navigate(`/admin/accounts/${c.account_id}`)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-primary">
              Open account
            </button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard className="p-5 lg:col-span-2">
          <h3 className="mb-3 font-display text-base font-semibold">Transcript</h3>
          {c.transcript.length === 0 ? (
            <EmptyState icon="chat" message="No transcript recorded for this call." />
          ) : (
            <div className="flex flex-col gap-3">
              {c.transcript.map((t, i) => {
                const isAgent = t.role === 'assistant' || t.role === 'agent'
                return (
                  <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${isAgent ? 'bg-surface-high' : 'ml-auto bg-primary/15'}`}>
                    <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{isAgent ? 'Agent' : 'Caller'}</div>
                    {t.text || t.content || ''}
                  </div>
                )
              })}
            </div>
          )}
        </AdminCard>

        <AdminCard className="p-5">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Captured lead</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <Field label="Name" value={c.lead_name} />
            <Field label="Phone" value={c.lead_phone} />
            <Field label="Company" value={c.lead_company} />
            <Field label="Use case" value={c.lead_use_case} />
            <Field label="Team size" value={c.lead_team_size} />
            <Field label="Language" value={c.reply_language} />
            <Field label="Credits" value={String(c.credits)} />
            <Field label="Room" value={c.room_name} mono />
          </dl>
        </AdminCard>
      </div>
    </>
  )
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value || '—'}</dd>
    </div>
  )
}
