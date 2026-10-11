import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { adminCalls, adminCallDetail, type AdminCallRow, type AdminCallDetail } from '../../lib/adminApi'
import { AdminCard, EmptyState, ErrorState, fmtDateTime, fmtDuration, FilterChip, PageHeader, Pill, SearchInput, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

const CHANNELS = ['browser', 'phone', 'widget']

function latencySummary(values?: number[]): string | null {
  if (!values?.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const percentile = (p: number) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * p))]
  return `p50 ${(percentile(0.5) / 1000).toFixed(2)}s · p95 ${(percentile(0.95) / 1000).toFixed(2)}s`
}

// Time-window chips map onto the backend's `hours` (1..720, overrides days)
// and `days` params; the URL carries the same names so overview alerts can
// deep-link (e.g. /admin/calls?outcome=failed&hours=1).
const WINDOWS: { id: string; label: string; hours?: number; days?: number }[] = [
  { id: '1h', label: '1 h', hours: 1 },
  { id: '24h', label: '24 h', hours: 24 },
  { id: '7d', label: '7 d', days: 7 },
  { id: '30d', label: '30 d', days: 30 },
  { id: '', label: 'All' },
]

export function AdminCalls() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [rows, setRows] = useState<AdminCallRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()

  const channel = params.get('channel') || ''
  const outcome = params.get('outcome') === 'failed' ? 'failed' : ''
  const hours = Number(params.get('hours')) || 0
  const days = hours ? 0 : Number(params.get('days')) || 0
  const accountId = Number(params.get('account_id')) || 0
  const windowId = WINDOWS.find((w) => (w.hours && w.hours === hours) || (w.days && w.days === days))?.id ?? (hours || days ? 'custom' : '')

  const update = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, String(v))
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const setWindow = (id: string) => {
    const w = WINDOWS.find((x) => x.id === id)
    update({ hours: w?.hours, days: w?.days })
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      if (search !== (params.get('q') || '')) update({ q: search })
      adminCalls({ search, channel, days, hours, outcome, account_id: accountId || undefined, limit: 100 })
        .then((r) => {
          setRows(r.calls)
          setTotal(r.total)
        })
        .catch((e: unknown) => {
          setRows([])
          setError(e instanceof Error ? e.message : 'Request failed')
        })
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
    // `update`/`params` are read for the search->URL sync only; refetch is driven by the filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, channel, days, hours, outcome, accountId, attempt])

  const accountLabel = rows.find((r) => r.account_id === accountId)?.account_name || `#${accountId}`

  return (
    <>
      <PageHeader title="All Calls" subtitle={`Every call across the platform - ${total.toLocaleString('en-IN')} matching. Click any call to read the transcript.`} />
      <AdminCard className="mb-4 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by lead, phone, or room…" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Outcome</span>
          <FilterChip active={!outcome} onClick={() => update({ outcome: '' })}>
            All
          </FilterChip>
          <FilterChip active={outcome === 'failed'} onClick={() => update({ outcome: 'failed' })}>
            Failed
          </FilterChip>
          <span className="ml-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Window</span>
          {WINDOWS.map((w) => (
            <FilterChip key={w.id || 'all'} active={windowId === w.id} onClick={() => setWindow(w.id)}>
              {w.label}
            </FilterChip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Channel</span>
          {CHANNELS.map((c) => (
            <FilterChip key={c} active={channel === c} onClick={() => update({ channel: channel === c ? '' : c })}>
              {c}
            </FilterChip>
          ))}
          {accountId > 0 && (
            <>
              <span className="ml-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Account</span>
              <button
                onClick={() => update({ account_id: '' })}
                aria-label="Clear account filter"
                className="flex items-center gap-1 rounded-full border border-primary bg-primary/15 px-3 py-1 text-xs font-semibold text-primary"
              >
                {accountLabel}
                <Icon name="close" className="text-[14px]" />
              </button>
            </>
          )}
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden">
        {error ? (
          <ErrorState message={`Couldn't load calls: ${error}`} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Channel</th>
                    <th className="px-4 py-3 text-right font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Outcome</th>
                    <th className="px-4 py-3 font-semibold">Failure</th>
                    <th className="px-4 py-3 text-right font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const failure = c.failureReason || c.disconnectReason
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/admin/calls/${c.id}`)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                          <span title={fmtDateTime(c.startedAtIso || c.started_at)}>{timeAgo(c.startedAtIso || c.started_at)}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{c.account_name || '-'}</td>
                        <td className="px-4 py-3 capitalize">{c.call_type}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-3">
                          {c.qualified ? <Pill tone="active">Qualified</Pill> : <Pill tone="neutral">No lead</Pill>}
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          {failure ? (
                            <span
                              title={failure}
                              className={`block truncate font-mono text-xs ${c.failureReason ? 'text-destructive' : 'text-text-muted'}`}
                            >
                              {failure}
                            </span>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.credits.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {loading && <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>}
            {!loading && rows.length === 0 && <EmptyState icon="call" message="No calls match these filters." />}
          </>
        )}
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
            <button onClick={() => navigate(`/admin/accounts/${c.account_id}`)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold hover:border-primary">
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
            <Field label="Feedback" value={c.feedback === 'helpful' ? '👍 Helpful' : c.feedback === 'not_helpful' ? '👎 Needs review' : null} />
            <Field label="Feedback note" value={c.feedback_comment} />
            <Field label="Connection" value={c.connect_latency_ms == null ? null : `${(c.connect_latency_ms / 1000).toFixed(1)}s`} />
            <Field label="Agent joined" value={c.agent_join_latency_ms == null ? null : `${(c.agent_join_latency_ms / 1000).toFixed(1)}s`} />
            <Field label="First response" value={c.first_response_latency_ms == null ? null : `${(c.first_response_latency_ms / 1000).toFixed(1)}s`} />
            <Field label="Turn endpointing" value={latencySummary(c.latency_metrics?.eouMs)} />
            <Field label="STT finalization" value={latencySummary(c.latency_metrics?.transcriptionMs)} />
            <Field label="LLM first token" value={latencySummary(c.latency_metrics?.llmTtftMs)} />
            <Field label="TTS first audio" value={latencySummary(c.latency_metrics?.ttsTtfbMs)} />
            <Field label="Providers" value={c.latency_metrics?.providers?.join(', ') || null} />
            <Field label="Model" value={c.model} mono />
            <Field label="Voice" value={c.voice} mono />
            <Field label="Failure reason" value={c.failure_reason} />
            <Field label="Disconnect reason" value={c.disconnect_reason} mono />
            <Field label="Credits" value={String(c.credits)} />
            <Field label="Room" value={c.room_name} mono />
          </dl>

          {/* Owner-only: tenants never see this (see calls_db._call_dict).
              Tool names are our internal implementation and most of the
              latency here is our own infrastructure, which makes it our
              problem to fix rather than a customer's to worry about. */}
          {c.tool_calls?.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                Tool calls
              </p>
              <ul className="flex flex-col gap-1">
                {c.tool_calls.map((tool, i) => (
                  <li key={`${tool.name}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={tool.ok ? 'text-success' : 'text-destructive'}>
                        {tool.ok ? '✓' : '✕'}
                      </span>
                      <span className="truncate font-mono text-xs">{tool.name}</span>
                    </span>
                    {typeof tool.ms === 'number' && (
                      <span
                        className={`shrink-0 text-xs ${tool.ms >= 1500 ? 'text-amber-500' : 'text-text-muted'}`}
                      >
                        {tool.ms >= 1000 ? `${(tool.ms / 1000).toFixed(1)}s` : `${tool.ms}ms`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AdminCard>
      </div>
    </>
  )
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value || '-'}</dd>
    </div>
  )
}
