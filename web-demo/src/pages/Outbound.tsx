import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import {
  createCampaign,
  fetchAgents,
  fetchCampaign,
  fetchCampaignSegmentCount,
  fetchCampaigns,
  fetchPhoneNumbers,
  updateCampaignStatus,
} from '../lib/api'

const SEGMENTS = [
  { value: '', label: 'All' },
  { value: 'fresh', label: 'Fresh Leads' },
  { value: 'followup', label: 'Need Follow-up' },
  { value: 'failed_retry', label: 'Failed - Retry' },
] as const
import type { AgentConfig, Campaign, CampaignContact, PhoneNumber } from '../lib/types'
import { hasRole, useAuth } from '../lib/auth'

const FILTERS = ['All', 'Running', 'Scheduled', 'Draft', 'Paused', 'Completed']

const STATUS_STYLE: Record<string, string> = {
  running: 'border-cyan/30 bg-cyan/10 text-cyan',
  scheduled: 'border-magenta/30 bg-magenta/10 text-magenta',
  draft: 'border-border bg-surface-high text-text-muted',
  paused: 'border-amber/30 bg-amber/10 text-amber',
  completed: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

// Converts a <input type="datetime-local"> value (the operator's own local
// time — the browser has no idea what that offset is unless we ask `Date`
// to interpret it) into the UTC "YYYY-MM-DD HH:MM:SS" string
// promote_due_scheduled_campaigns compares against server-side.
function toUtcSql(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString().slice(0, 19).replace('T', ' ')
}

const CONTACT_STATUS_STYLE: Record<string, string> = {
  pending: 'text-text-muted',
  calling: 'text-cyan',
  done: 'text-success',
  no_answer: 'text-amber',
  failed: 'text-destructive',
  blocked: 'text-destructive',
}

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

export function Outbound() {
  const { user } = useAuth()
  const canManage = hasRole(user, 'member')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [filter, setFilter] = useState('All')
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [detail, setDetail] = useState<Campaign | null>(null)
  const [error, setError] = useState<string | null>(null)

  const blank = {
    name: '',
    fromNumber: '',
    agentId: '' as number | '',
    source: 'tag' as 'tag' | 'paste',
    contactTag: '',
    paste: '',
    maxAttempts: 1,
    retryMinutes: 60,
    concurrency: 1,
    scheduledDate: '', // datetime-local string, empty = launch on demand
    segment: '' as string, // '' | 'fresh' | 'followup' | 'failed_retry'
  }
  const [form, setForm] = useState(blank)
  const [segmentCount, setSegmentCount] = useState<number | null>(null)

  // Live "N contacts match" preview as the operator picks a segment/tag —
  // mirrors what create_campaign will actually load into the queue.
  useEffect(() => {
    if (form.source !== 'tag' || !showNew) return
    let cancelled = false
    fetchCampaignSegmentCount(form.segment, form.contactTag)
      .then((r) => !cancelled && setSegmentCount(r.count))
      .catch(() => !cancelled && setSegmentCount(null))
    return () => {
      cancelled = true
    }
  }, [form.source, form.segment, form.contactTag, showNew])

  const reload = () => fetchCampaigns().then(setCampaigns).catch(() => setCampaigns([]))

  useEffect(() => {
    reload()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
  }, [])

  // Poll while any campaign is running so progress bars move live.
  const anyRunning = campaigns.some((c) => c.status === 'running')
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => {
      reload()
      if (expanded) fetchCampaign(expanded).then(setDetail).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [anyRunning, expanded])

  const filtered = useMemo(
    () => (filter === 'All' ? campaigns : campaigns.filter((c) => c.status === filter.toLowerCase())),
    [campaigns, filter],
  )

  const totals = useMemo(() => {
    const t = { contacts: 0, done: 0, blocked: 0, running: 0 }
    for (const c of campaigns) {
      t.contacts += c.stats.total
      t.done += c.stats.done
      t.blocked += c.stats.blocked
      if (c.status === 'running') t.running += 1
    }
    return t
  }, [campaigns])

  const handleCreate = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError('Give the campaign a name.')
      return
    }
    if (!form.fromNumber) {
      setError('Pick a number to call from.')
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      fromNumber: form.fromNumber,
      agentId: form.agentId || null,
      maxAttempts: form.maxAttempts,
      retryMinutes: form.retryMinutes,
      concurrency: form.concurrency,
    }
    if (form.scheduledDate) {
      payload.scheduledDate = toUtcSql(form.scheduledDate)
    }
    if (form.source === 'tag') {
      payload.contactTag = form.contactTag
      if (form.segment) payload.segment = form.segment
    } else {
      payload.contacts = form.paste
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [phone, ...rest] = line.split(',')
          return { phone: phone.trim(), name: rest.join(',').trim() }
        })
    }
    try {
      const created = await createCampaign(payload)
      if (created?.stats?.total === 0) {
        setError('Campaign created, but no contacts matched — add contacts or check the tag before launching.')
      }
      setShowNew(false)
      setForm(blank)
      reload()
    } catch {
      setError('Could not create the campaign.')
    }
  }

  const toggleExpand = (c: Campaign) => {
    if (expanded === c.id) {
      setExpanded(null)
      setDetail(null)
    } else {
      setExpanded(c.id)
      setDetail(null)
      fetchCampaign(c.id).then(setDetail).catch(() => {})
    }
  }

  const setStatus = (c: Campaign, status: string) => updateCampaignStatus(c.id, status).then(reload)

  return (
    <DashboardLayout>
      <PageHeader title="Outbound Campaigns" subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}>
        {canManage && (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="add" className="text-[18px]" />
            New Campaign
          </button>
        )}
      </PageHeader>

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-cyan/30 bg-cyan/5 px-4 py-3 text-xs text-cyan">
          <Icon name="verified_user" className="mr-1.5 align-[-3px] text-[15px]" />
          Every dial is scrubbed against your{' '}
          <Link to="/dashboard/compliance" className="font-semibold underline">
            Do-Not-Call list
          </Link>{' '}
          and calling window before it goes out.
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Contacts queued" value={totals.contacts} />
          <StatCard label="Calls placed" value={totals.done} tone="text-success" />
          <StatCard label="Blocked (DNC/window)" value={totals.blocked} tone="text-amber" />
          <StatCard label="Running now" value={totals.running} tone="text-cyan" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  filter === f ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {showNew && canManage && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-surface p-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-amber bg-surface-high px-3 py-2 text-sm text-text">
                <Icon name="warning" className="text-[16px] text-amber" />
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Campaign name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Q3 lead follow-up"
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Call from</span>
                <select
                  value={form.fromNumber}
                  onChange={(e) => setForm({ ...form, fromNumber: e.target.value })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
                >
                  <option value="">Select a number</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.number}>
                      {n.number} {n.label ? `· ${n.label}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Agent (answers the call)</span>
                <select
                  value={form.agentId}
                  onChange={(e) => setForm({ ...form, agentId: e.target.value ? Number(e.target.value) : '' })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
                >
                  <option value="">Number's default agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-high p-3">
              <div className="flex gap-1 self-start rounded-lg border border-border p-0.5">
                {(['tag', 'paste'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, source: s })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      form.source === s ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {s === 'tag' ? 'From contacts' : 'Paste numbers'}
                  </button>
                ))}
              </div>
              {form.source === 'tag' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1 self-start rounded-lg border border-border bg-surface p-0.5">
                    {SEGMENTS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setForm({ ...form, segment: s.value })}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                          form.segment === s.value ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={form.contactTag}
                    onChange={(e) => setForm({ ...form, contactTag: e.target.value })}
                    placeholder="Narrow further by tag (optional)"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-xs text-text-muted">
                    {segmentCount === null ? 'Checking…' : `${segmentCount} contact${segmentCount === 1 ? '' : 's'} match`}
                  </p>
                </div>
              ) : (
                <textarea
                  value={form.paste}
                  onChange={(e) => setForm({ ...form, paste: e.target.value })}
                  rows={4}
                  placeholder="One per line: phone, name&#10;+919876543210, Rahul&#10;+919812345678, Priya"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Max attempts per contact</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxAttempts}
                  onChange={(e) => setForm({ ...form, maxAttempts: Math.max(1, Number(e.target.value) || 1) })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Retry after (minutes)</span>
                <input
                  type="number"
                  min={1}
                  value={form.retryMinutes}
                  onChange={(e) => setForm({ ...form, retryMinutes: Math.max(1, Number(e.target.value) || 1) })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Concurrent calls</span>
                <input
                  type="number"
                  min={1}
                  value={form.concurrency}
                  onChange={(e) => setForm({ ...form, concurrency: Math.max(1, Number(e.target.value) || 1) })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Schedule for later (optional)</span>
                <input
                  type="datetime-local"
                  value={form.scheduledDate}
                  onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
              >
                Create campaign
              </button>
              <button
                onClick={() => {
                  setShowNew(false)
                  setError(null)
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <Card padding="none">
          {filtered.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-high">
                <Icon name="campaign" className="text-[26px]" />
              </div>
              <p className="text-sm font-bold">No campaigns here</p>
              {canManage && (
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
                >
                  Create your first campaign
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => {
                const s = c.stats
                const finished = s.done + s.no_answer + s.failed + s.blocked
                return (
                  <div key={c.id} className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => toggleExpand(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                          <Icon name="campaign" className="text-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <p className="truncate text-[11px] text-text-muted">
                            {c.from_number || 'no number'} ·{' '}
                            {agents.find((a) => a.id === c.agent_id)?.name ?? "number's default"} · {s.total} contacts
                            {c.status === 'scheduled' && c.scheduled_date && (
                              <> · starts {new Date(c.scheduled_date.replace(' ', 'T') + 'Z').toLocaleString()}</>
                            )}
                          </p>
                        </div>
                      </button>
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[c.status] || ''}`}>
                        {c.status}
                      </span>
                      {canManage && (
                        <div className="flex gap-1.5">
                          {(c.status === 'draft' || c.status === 'paused') && (
                            <button
                              onClick={() => setStatus(c, 'running')}
                              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg hover:opacity-90"
                            >
                              <Icon name="play_arrow" className="text-[15px]" />
                              {c.status === 'draft' ? 'Launch' : 'Resume'}
                            </button>
                          )}
                          {c.status === 'running' && (
                            <button
                              onClick={() => setStatus(c, 'paused')}
                              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
                            >
                              <Icon name="pause" className="text-[15px]" />
                              Pause
                            </button>
                          )}
                          {c.status !== 'completed' && c.status !== 'cancelled' && (
                            <button
                              onClick={() => setStatus(c, 'cancelled')}
                              aria-label="Cancel campaign"
                              className="flex items-center rounded-lg border border-border px-2 py-1.5 text-xs text-text-muted hover:border-destructive hover:text-destructive"
                            >
                              <Icon name="stop" className="text-[15px]" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-high">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct(finished, s.total)}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-text-muted">
                        {finished}/{s.total}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                      <span><b className="text-success">{s.done}</b> placed</span>
                      <span><b className="text-cyan">{s.calling}</b> calling</span>
                      <span><b className="text-text-muted">{s.pending}</b> pending</span>
                      <span><b className="text-amber">{s.no_answer}</b> no-answer</span>
                      <span><b className="text-destructive">{s.failed}</b> failed</span>
                      <span><b className="text-destructive">{s.blocked}</b> blocked</span>
                    </div>

                    {expanded === c.id && (
                      <div className="mt-1 rounded-lg border border-border bg-surface-high">
                        {!detail ? (
                          <div className="flex justify-center py-6">
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </div>
                        ) : (
                          <div className="max-h-72 divide-y divide-border overflow-y-auto">
                            {(detail.contacts || []).map((ct: CampaignContact) => (
                              <div key={ct.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{ct.name || ct.phone}</p>
                                  {ct.name && <p className="truncate text-xs text-text-muted">{ct.phone}</p>}
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                  {ct.attempts > 0 && <span className="text-text-muted">{ct.attempts} try{ct.attempts === 1 ? '' : 's'}</span>}
                                  <span className={`font-semibold capitalize ${CONTACT_STATUS_STYLE[ct.status] || ''}`}>
                                    {ct.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {(detail.contacts || []).length === 0 && (
                              <EmptyState text="No contacts in this campaign." compact />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </section>
    </DashboardLayout>
  )
}

function StatCard({ label, value, tone = 'text-text' }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card padding="sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </Card>
  )
}
