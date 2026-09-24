import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { AttachmentPicker, CustomerStatusChip, PriorityChip, TicketThread } from '../components/SupportTicketParts'
import { useAttachments } from '../lib/useAttachments'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  SUPPORT_EMAIL,
  customerStatus,
  ticketTime,
  toUploads,
  type CustomerStatus,
} from '../lib/support'
import {
  fetchSupportTicket,
  fetchSupportTickets,
  replySupportTicket,
  setSupportTicketStatus,
  submitHelpTicket,
} from '../lib/api'
import type { SupportTicket, TicketPriority } from '../lib/types'

type Filter = 'all' | CustomerStatus
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'awaiting', label: 'Awaiting your reply' },
  { id: 'solved', label: 'Solved' },
]

const inputCls =
  'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary'

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-fit items-center gap-1 text-sm font-semibold text-text-muted hover:text-primary">
      <Icon name="arrow_back" className="text-[18px]" /> All requests
    </button>
  )
}

function NewRequest({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [category, setCategory] = useState('technical')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [subject, setSubject] = useState('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const attachments = useAttachments()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !detail.trim()) return
    setSending(true)
    setError('')
    try {
      const result = await submitHelpTicket({
        subject: subject.trim(),
        detail: detail.trim(),
        category,
        priority,
        currentPage: '/dashboard/support',
        attachments: await toUploads(attachments.files),
      })
      onCreated(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
    <BackLink onClick={onCancel} />
    <form onSubmit={submit} onPaste={attachments.onPaste} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold">Submit a request</h2>
        <p className="mt-1 text-sm text-text-muted">
          Tell us what you did, what you expected, and what happened instead. A screenshot of the problem — or the
          call's time and number — lets us fix it much faster.
        </p>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
          What is it about?
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
          How urgent?
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputCls}>
            {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} required placeholder="e.g. Transfer to my team never connects" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
        Description
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={5000} required rows={8} placeholder="Steps, what you expected, what happened, and when." className={`${inputCls} resize-y`} />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Screenshots or files</span>
        <AttachmentPicker state={attachments} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-high/40 px-5 py-3">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-high">Cancel</button>
        <button type="submit" disabled={sending || !subject.trim() || !detail.trim()} className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40">
          {sending ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
    </div>
  )
}

function RequestDetail({ id, onBack, onChanged }: { id: number; onBack: () => void; onChanged: (t: SupportTicket) => void }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setTicket(null)
    fetchSupportTicket(id).then(setTicket).catch(() => setMissing(true))
  }, [id])

  const apply = (t: SupportTicket) => {
    setTicket(t)
    onChanged(t)
  }

  if (missing) return <div className="flex flex-col gap-4"><BackLink onClick={onBack} /><p className="text-sm text-text-muted">This request doesn't exist or isn't in your workspace.</p></div>
  if (!ticket) return <p className="text-sm text-text-muted">Loading…</p>
  const solved = customerStatus(ticket) === 'solved'

  return (
    <div className="flex flex-col gap-3">
      <BackLink onClick={onBack} />
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="font-mono">{ticket.ref}</span>
            <CustomerStatusChip ticket={ticket} />
            <PriorityChip priority={ticket.priority} />
            <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
          </p>
          <h2 className="mt-1.5 text-xl font-semibold">{ticket.subject}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Opened {ticketTime(ticket.createdAt)}{ticket.userEmail ? ` by ${ticket.userEmail}` : ''} · updated {ticketTime(ticket.updatedAt)}
          </p>
        </div>
        {!solved && (
          <button onClick={() => setSupportTicketStatus(ticket.id, 'resolved').then(apply)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-muted hover:border-success hover:text-success">
            <Icon name="task_alt" className="text-[16px]" /> Mark as solved
          </button>
        )}
      </div>
      <div className="bg-bg/40 p-5">
        <TicketThread
          ticket={ticket}
          viewer="customer"
          replyPlaceholder="Add details, answer a question, or say what changed…"
          onReply={async (body, files) => apply(await replySupportTicket(ticket.id, body, await toUploads(files)))}
        />
      </div>
      </section>
    </div>
  )
}

export function Support() {
  const [params, setParams] = useSearchParams()
  const selectedId = Number(params.get('ticket')) || null
  const composing = params.get('new') === '1'
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    fetchSupportTickets()
      .then((rows) => {
        setTickets(rows)
        setLoadError('')
      })
      .catch(() => setLoadError('Could not load your requests. Refresh to try again.'))
  }, [])
  useEffect(load, [load])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, open: 0, awaiting: 0, solved: 0 }
    for (const t of tickets ?? []) {
      c.all++
      c[customerStatus(t)]++
    }
    return c
  }, [tickets])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (tickets ?? []).filter(
      (t) => (filter === 'all' || customerStatus(t) === filter) && (!q || t.subject.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q)),
    )
  }, [tickets, filter, query])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked: the address is on screen and the mailto link works.
    }
  }

  let body
  if (composing) {
    body = <NewRequest onCancel={() => setParams({})} onCreated={(id) => { load(); setParams({ ticket: String(id) }) }} />
  } else if (selectedId) {
    body = (
      <RequestDetail
        id={selectedId}
        onBack={() => setParams({})}
        onChanged={(t) => setTickets((rows) => (rows ?? []).map((r) => (r.id === t.id ? { ...r, ...t } : r)))}
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <section className="grid gap-3 md:grid-cols-3" aria-label="Ways to get help">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="confirmation_number" className="text-[19px] text-primary" /> Submit a request</span>
            <p className="text-xs text-text-muted">Report a problem or ask a question — attach screenshots. Every reply reaches you here and by email.</p>
            <button onClick={() => setParams({ new: '1' })} className="mt-auto flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-bg hover:opacity-90">
              <Icon name="add" className="text-[17px]" /> New request
            </button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="mail" className="text-[19px] text-primary" /> Email us</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="break-all text-sm font-semibold text-primary hover:underline">{SUPPORT_EMAIL}</a>
            <button onClick={copyEmail} className="mt-auto flex w-fit items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary">
              <Icon name={copied ? 'check' : 'content_copy'} className="text-[15px]" /> {copied ? 'Copied' : 'Copy address'}
            </button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="menu_book" className="text-[19px] text-primary" /> Guides</span>
            <p className="text-xs text-text-muted">Step-by-step help for agents, phone numbers, campaigns and integrations.</p>
            <a href="https://docs.vistrowvoice.com" target="_blank" rel="noreferrer" className="mt-auto flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Open the docs <Icon name="open_in_new" className="text-[15px]" />
            </a>
          </div>
        </section>

        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">Your requests</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter requests">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${filter === f.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-high'}`}
                  >
                    {f.label}
                    <span className="tabular-nums opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-high px-2.5 py-1.5">
                <Icon name="search" className="text-[16px] text-text-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requests" aria-label="Search requests" className="vv-bare-field w-40 bg-transparent text-sm outline-none placeholder:text-text-muted" />
              </label>
            </div>
          </div>
          {loadError ? (
            <p className="p-5 text-sm text-destructive">{loadError}</p>
          ) : tickets === null ? (
            <p className="p-5 text-sm text-text-muted">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Icon name="inbox" className="text-[30px] text-text-muted" />
              <p className="text-sm text-text-muted">
                {tickets.length === 0 ? "You haven't submitted any requests yet." : 'No requests match this filter.'}
              </p>
              {tickets.length === 0 && <button onClick={() => setParams({ new: '1' })} className="text-sm font-semibold text-primary hover:underline">Submit a request</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Subject</th>
                    <th className="px-4 py-2.5 font-semibold">ID</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Created</th>
                    <th className="px-4 py-2.5 font-semibold">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((t) => (
                    <tr key={t.id} onClick={() => setParams({ ticket: String(t.id) })} className="cursor-pointer hover:bg-surface-high/60">
                      <td className="max-w-[320px] px-4 py-3">
                        <button onClick={(e) => { e.stopPropagation(); setParams({ ticket: String(t.id) }) }} className="block truncate text-left font-medium hover:text-primary">
                          {t.subject}
                        </button>
                        <span className="text-[11px] text-text-muted">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{t.ref}</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5"><CustomerStatusChip ticket={t} /><PriorityChip priority={t.priority} /></span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">{ticketTime(t.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">{ticketTime(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <PageHeader title="Help & Support" subtitle="Submit a request, follow its progress, or email the team directly." />
      <div className="p-4 sm:p-6">{body}</div>
    </DashboardLayout>
  )
}
