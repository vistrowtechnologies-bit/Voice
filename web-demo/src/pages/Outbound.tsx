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
const CREATE_STEPS = ['Audience', 'Calling setup', 'Review'] as const

const STATUS_STYLE: Record<string, string> = {
  running: 'border-cyan/30 bg-cyan/10 text-cyan',
  scheduled: 'border-magenta/30 bg-magenta/10 text-magenta',
  draft: 'border-border bg-surface-high text-text-muted',
  paused: 'border-amber/30 bg-amber/10 text-amber',
  completed: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

// Converts a <input type="datetime-local"> value (the operator's own local
// time - the browser has no idea what that offset is unless we ask `Date`
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

function campaignDate(value: string | null) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function parsePastedContacts(value: string) {
  const rows = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [phone, ...rest] = line.split(',')
      return { phone: phone.trim(), name: rest.join(',').trim() }
    })
  const seen = new Set<string>()
  let invalid = 0
  let duplicates = 0
  const valid = rows.filter((row) => {
    const normalized = row.phone.replace(/[\s()-]/g, '')
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      invalid += 1
      return false
    }
    if (seen.has(normalized)) {
      duplicates += 1
      return false
    }
    seen.add(normalized)
    row.phone = normalized
    return true
  })
  return { valid, invalid, duplicates, total: rows.length }
}

export function Outbound() {
  const { user } = useAuth()
  const canManage = hasRole(user, 'member')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [filter, setFilter] = useState('All')
  const [showNew, setShowNew] = useState(false)
  const [createStep, setCreateStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'largest'>('newest')
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

  // Live "N contacts match" preview as the operator picks a segment/tag -
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

  const filtered = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase()
    const rows = campaigns.filter(
      (campaign) =>
        (filter === 'All' || campaign.status === filter.toLowerCase()) &&
        (!query ||
          campaign.name.toLowerCase().includes(query) ||
          campaign.from_number.toLowerCase().includes(query) ||
          (agents.find((agent) => agent.id === campaign.agent_id)?.name ?? '').toLowerCase().includes(query)),
    )
    return [...rows].sort((a, b) => {
      if (sort === 'largest') return b.stats.total - a.stats.total
      const comparison = a.created_at.localeCompare(b.created_at)
      return sort === 'oldest' ? comparison : -comparison
    })
  }, [agents, campaignSearch, campaigns, filter, sort])

  const totals = useMemo(() => {
    const t = { contacts: 0, attempts: 0, answered: 0, blocked: 0, running: 0 }
    for (const c of campaigns) {
      t.contacts += c.stats.total
      t.attempts += c.stats.done + c.stats.no_answer + c.stats.failed
      t.answered += c.stats.done
      t.blocked += c.stats.blocked
      if (c.status === 'running') t.running += 1
    }
    return t
  }, [campaigns])

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((item) => [
          item,
          item === 'All' ? campaigns.length : campaigns.filter((campaign) => campaign.status === item.toLowerCase()).length,
        ]),
      ),
    [campaigns],
  )

  const pastedPreview = useMemo(() => parsePastedContacts(form.paste), [form.paste])
  const selectedNumber = numbers.find((number) => number.number === form.fromNumber)
  const effectiveAgentId = form.agentId || selectedNumber?.agentId || ''
  const effectiveAgent = agents.find((agent) => agent.id === effectiveAgentId)
  const audienceCount = form.source === 'tag' ? segmentCount ?? 0 : pastedPreview.valid.length
  const audienceReady = Boolean(form.name.trim()) && audienceCount > 0
  const setupReady = Boolean(form.fromNumber && effectiveAgentId && effectiveAgent?.status === 'live')

  const handleCreate = async (launchNow = false) => {
    setError(null)
    if (!form.name.trim()) {
      setError('Give the campaign a name.')
      return
    }
    if (!form.fromNumber) {
      setError('Pick a number to call from.')
      return
    }
    if (!effectiveAgentId || effectiveAgent?.status !== 'live') {
      setError('Choose a live calling agent, or assign one to the selected number.')
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      fromNumber: form.fromNumber,
      agentId: effectiveAgentId,
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
      payload.contacts = pastedPreview.valid
    }
    setCreating(true)
    try {
      const created = await createCampaign(payload)
      if (created?.stats?.total === 0) {
        setError('Campaign created, but no contacts matched - add contacts or check the tag before launching.')
      }
      if (launchNow && created?.id && !form.scheduledDate && created.stats.total > 0) {
        await updateCampaignStatus(created.id, 'running')
      }
      setShowNew(false)
      setCreateStep(0)
      setForm(blank)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the campaign.')
    } finally {
      setCreating(false)
    }
  }

  const toggleExpand = (c: Campaign) => {
    if (expanded === c.id) {
      setExpanded(null)
      setDetail(null)
    } else {
      setExpanded(c.id)
      setDetail(null)
      fetchCampaign(c.id)
        .then(setDetail)
        .catch(() => setError(`Could not load details for ${c.name}.`))
    }
  }

  const setStatus = (c: Campaign, status: string) =>
    updateCampaignStatus(c.id, status)
      .then(reload)
      .catch(() => setError(`Could not ${status === 'running' ? 'start' : status} ${c.name}.`))

  return (
    <DashboardLayout>
      <PageHeader title="Outbound Campaigns" subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}>
        {canManage && (
          <button
            onClick={() => {
              setShowNew((value) => !value)
              setCreateStep(0)
              setError(null)
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              showNew
                ? 'border border-border bg-surface text-text hover:border-primary'
                : 'bg-primary text-bg hover:opacity-90'
            }`}
          >
            <Icon name={showNew ? 'close' : 'add'} className="text-[18px]" />
            {showNew ? 'Close' : 'New Campaign'}
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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Total contacts" value={totals.contacts} />
          <StatCard label="Dial attempts" value={totals.attempts} tone="text-cyan" />
          <StatCard label="Answered" value={totals.answered} tone="text-success" />
          <StatCard label="Blocked (DNC/window)" value={totals.blocked} tone="text-amber" />
          <StatCard label="Running now" value={totals.running} tone="text-cyan" />
        </div>

        {!showNew && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border p-0.5">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === item ? 'bg-primary text-bg' : 'text-text-muted hover:bg-surface-high hover:text-text'
                  }`}
                >
                  {item}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${filter === item ? 'bg-bg/20' : 'bg-surface-high'}`}>
                    {filterCounts[item]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-text-muted" />
                <input
                  value={campaignSearch}
                  onChange={(event) => setCampaignSearch(event.target.value)}
                  placeholder="Search campaigns"
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-xs outline-none transition-colors placeholder:text-text-muted focus:border-primary"
                />
              </label>
              <select
                aria-label="Sort campaigns"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-muted outline-none hover:border-primary focus:border-primary"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="largest">Largest audience</option>
              </select>
            </div>
          </div>
        )}

        {error && !showNew && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="rounded p-1 hover:bg-destructive/10">
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        )}

        {showNew && canManage && (
          <div className="flex flex-col gap-5 rounded-xl border border-primary/40 bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-text">Create outbound campaign</h2>
                <p className="mt-0.5 text-xs text-text-muted">Build the audience, confirm the calling setup, then save or launch.</p>
              </div>
              <ol className="flex items-center gap-1" aria-label="Campaign creation progress">
                {CREATE_STEPS.map((step, index) => (
                  <li key={step} className="flex items-center">
                    <button
                      onClick={() => index < createStep && setCreateStep(index)}
                      disabled={index > createStep}
                      aria-current={index === createStep ? 'step' : undefined}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                        index === createStep
                          ? 'bg-primary/15 text-primary'
                          : index < createStep
                            ? 'text-success hover:bg-success/10'
                            : 'cursor-default text-text-muted opacity-60'
                      }`}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        index <= createStep ? 'border-primary/40' : 'border-border'
                      }`}>
                        {index < createStep ? <Icon name="check" className="text-[13px]" /> : index + 1}
                      </span>
                      <span className="hidden sm:inline">{step}</span>
                    </button>
                    {index < CREATE_STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-border sm:w-5" />}
                  </li>
                ))}
              </ol>
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-amber bg-amber/5 px-3 py-2 text-sm text-text">
                <Icon name="warning" className="text-[16px] text-amber" />
                {error}
              </div>
            )}

            {createStep === 0 && (
              <div className="flex flex-col gap-4">
                <label className="flex max-w-xl flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Campaign name</span>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="For example: September lead follow-up"
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-primary"
                  />
                </label>

                <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:p-4">
                  <div className="flex gap-1 self-start rounded-lg border border-border bg-surface-high p-0.5">
                    {(['tag', 'paste'] as const).map((source) => (
                      <button
                        key={source}
                        onClick={() => setForm({ ...form, source })}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          form.source === source ? 'bg-primary text-bg' : 'text-text-muted hover:bg-surface hover:text-text'
                        }`}
                      >
                        {source === 'tag' ? 'Use saved contacts' : 'Paste phone numbers'}
                      </button>
                    ))}
                  </div>
                  {form.source === 'tag' ? (
                    <>
                      <div className="flex flex-wrap gap-1 self-start rounded-lg border border-border bg-surface-high p-0.5">
                        {SEGMENTS.map((segment) => (
                          <button
                            key={segment.value}
                            onClick={() => setForm({ ...form, segment: segment.value })}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                              form.segment === segment.value ? 'bg-primary text-bg' : 'text-text-muted hover:bg-surface hover:text-text'
                            }`}
                          >
                            {segment.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={form.contactTag}
                        onChange={(event) => setForm({ ...form, contactTag: event.target.value })}
                        placeholder="Narrow further by tag (optional)"
                        className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-primary"
                      />
                      <p className={`text-xs font-semibold ${segmentCount ? 'text-success' : 'text-text-muted'}`}>
                        {segmentCount === null ? 'Checking audience…' : `${segmentCount} contact${segmentCount === 1 ? '' : 's'} match this audience`}
                      </p>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={form.paste}
                        onChange={(event) => setForm({ ...form, paste: event.target.value })}
                        rows={6}
                        placeholder={'One contact per line in international format:\n+919876543210, Rahul\n+919812345678, Priya'}
                        className="rounded-lg border border-border bg-surface-high px-3 py-2.5 font-mono text-sm outline-none transition-colors placeholder:font-sans placeholder:text-text-muted focus:border-primary"
                      />
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="font-semibold text-success">{pastedPreview.valid.length} ready</span>
                        {pastedPreview.invalid > 0 && <span className="font-semibold text-destructive">{pastedPreview.invalid} invalid</span>}
                        {pastedPreview.duplicates > 0 && <span className="font-semibold text-amber">{pastedPreview.duplicates} duplicate</span>}
                        <span className="text-text-muted">Use +country code; names are optional.</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {createStep === 1 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Call from</span>
                  <select
                    value={form.fromNumber}
                    onChange={(event) => setForm({ ...form, fromNumber: event.target.value })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Select an active number</option>
                    {numbers.filter((number) => number.status === 'active').map((number) => (
                      <option key={number.id} value={number.number}>
                        {number.number} {number.label ? `· ${number.label}` : ''}
                      </option>
                    ))}
                  </select>
                  {numbers.filter((number) => number.status === 'active').length === 0 && (
                    <Link to="/dashboard/numbers" className="text-xs font-semibold text-cyan hover:underline">Configure an active phone number</Link>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Calling agent</span>
                  <select
                    value={form.agentId}
                    onChange={(event) => setForm({ ...form, agentId: event.target.value ? Number(event.target.value) : '' })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Use the number's assigned agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id} disabled={agent.status !== 'live'}>
                        {agent.name}{agent.status !== 'live' ? ' · paused' : ''}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs ${effectiveAgent?.status === 'live' ? 'text-success' : 'text-text-muted'}`}>
                    {effectiveAgent?.status === 'live'
                      ? `${effectiveAgent.name} is live and ready`
                      : form.fromNumber
                        ? 'Select a live agent before continuing.'
                        : 'Choose the calling number first.'}
                  </p>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Max attempts per contact</span>
                  <input
                    type="number"
                    min={1}
                    value={form.maxAttempts}
                    onChange={(event) => setForm({ ...form, maxAttempts: Math.max(1, Number(event.target.value) || 1) })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-text-muted">Includes the first dial.</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Retry after (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    disabled={form.maxAttempts === 1}
                    value={form.retryMinutes}
                    onChange={(event) => setForm({ ...form, retryMinutes: Math.max(1, Number(event.target.value) || 1) })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-primary"
                  />
                  <span className="text-[11px] text-text-muted">Available when more than one attempt is allowed.</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Concurrent calls</span>
                  <input
                    type="number"
                    min={1}
                    value={form.concurrency}
                    onChange={(event) => setForm({ ...form, concurrency: Math.max(1, Number(event.target.value) || 1) })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-text-muted">Actual throughput follows workspace and provider capacity.</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-text-muted">Start time (optional)</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledDate}
                    onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-text-muted">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                </label>
              </div>
            )}

            {createStep === 2 && (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="divide-y divide-border rounded-lg border border-border">
                  <ReviewRow label="Campaign" value={form.name} />
                  <ReviewRow label="Audience" value={`${audienceCount} contact${audienceCount === 1 ? '' : 's'} · ${form.source === 'tag' ? 'saved contacts' : 'pasted list'}`} />
                  <ReviewRow label="Call from" value={form.fromNumber} />
                  <ReviewRow label="Calling agent" value={effectiveAgent?.name ?? 'Not selected'} />
                  <ReviewRow label="Dial policy" value={`${form.maxAttempts} attempt${form.maxAttempts === 1 ? '' : 's'}${form.maxAttempts > 1 ? ` · retry after ${form.retryMinutes} min` : ''} · ${form.concurrency} concurrent`} />
                  <ReviewRow label="Start" value={form.scheduledDate ? new Date(form.scheduledDate).toLocaleString() : 'Save as draft or launch now'} />
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-cyan/30 bg-cyan/5 p-4 text-xs text-text-muted">
                  <div className="flex items-center gap-2 font-bold text-cyan">
                    <Icon name="verified_user" className="text-[17px]" />
                    Compliance check enabled
                  </div>
                  <p>Every contact is checked against your DNC list and permitted calling window before dialing.</p>
                  <p>Blocked contacts remain visible in campaign results and are not dialed.</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <button
                onClick={() => {
                  if (createStep === 0) {
                    setShowNew(false)
                    setError(null)
                  } else {
                    setCreateStep((step) => step - 1)
                    setError(null)
                  }
                }}
                disabled={creating}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
              >
                {createStep === 0 ? 'Cancel' : 'Back'}
              </button>
              {createStep < 2 ? (
                <button
                  onClick={() => {
                    setError(null)
                    setCreateStep((step) => step + 1)
                  }}
                  disabled={createStep === 0 ? !audienceReady : !setupReady}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {createStep === 0 ? 'Continue to setup' : 'Review campaign'}
                  <Icon name="arrow_forward" className="text-[16px]" />
                </button>
              ) : form.scheduledDate ? (
                <button
                  onClick={() => handleCreate(false)}
                  disabled={creating}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Scheduling…' : 'Schedule campaign'}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCreate(false)}
                    disabled={creating}
                    className="rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    {creating ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    onClick={() => handleCreate(true)}
                    disabled={creating}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Icon name="play_arrow" className="text-[16px]" />
                    {creating ? 'Launching…' : 'Launch now'}
                  </button>
                </div>
              )}
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
              {(campaignSearch || filter !== 'All') && (
                <button
                  onClick={() => {
                    setCampaignSearch('')
                    setFilter('All')
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:border-primary hover:text-text"
                >
                  Clear filters
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => {
                    setShowNew(true)
                    setCreateStep(0)
                  }}
                  className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
                >
                  Create campaign
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
                      <button
                        onClick={() => toggleExpand(c)}
                        aria-expanded={expanded === c.id}
                        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                          <Icon name="campaign" className="text-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <p className="truncate text-[11px] text-text-muted">
                            {c.from_number || 'no number'} ·{' '}
                            {agents.find((a) => a.id === c.agent_id)?.name ?? "number's default"} · {s.total} contacts
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-text-muted">
                            {c.status === 'scheduled' && c.scheduled_date
                              ? `Starts ${campaignDate(c.scheduled_date)}`
                              : c.completed_at
                                ? `Completed ${campaignDate(c.completed_at)}`
                                : c.started_at
                                  ? `Started ${campaignDate(c.started_at)}`
                                  : `Created ${campaignDate(c.created_at)}`}
                          </p>
                        </div>
                        <Icon
                          name="expand_more"
                          className={`text-[19px] text-text-muted transition-transform group-hover:text-primary ${expanded === c.id ? 'rotate-180' : ''}`}
                        />
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
                              onClick={() => {
                                if (window.confirm(`Cancel “${c.name}”? Pending contacts will not be called.`)) {
                                  setStatus(c, 'cancelled')
                                }
                              }}
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
                        <div
                          className={`h-full transition-all ${c.status === 'completed' ? 'bg-success' : c.status === 'running' ? 'bg-cyan' : 'bg-primary'}`}
                          style={{ width: `${pct(finished, s.total)}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-text-muted">
                        {finished}/{s.total}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                      <span><b className="text-success">{s.done}</b> answered</span>
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
                                  {ct.last_attempt_at && (
                                    <p className="mt-0.5 text-[10px] text-text-muted">Last attempt {campaignDate(ct.last_attempt_at)}</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-3 text-xs">
                                  {ct.attempts > 0 && <span className="text-text-muted">{ct.attempts} try{ct.attempts === 1 ? '' : 's'}</span>}
                                  {ct.outcome && <span className="max-w-32 truncate capitalize text-text-muted">{ct.outcome.replaceAll('_', ' ')}</span>}
                                  {ct.call_id && (
                                    <Link
                                      to={`/dashboard/calls/${ct.call_id}`}
                                      className="rounded-md border border-border px-2 py-1 font-semibold text-cyan hover:border-cyan"
                                    >
                                      View call
                                    </Link>
                                  )}
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
      <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  )
}
