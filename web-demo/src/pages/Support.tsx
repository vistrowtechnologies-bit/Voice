import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { PriorityChip, StatusChip, TicketThread } from '../components/SupportTicketParts'
import { CATEGORY_LABELS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, PRIORITY_LABELS, SUPPORT_EMAIL, fileContent, ticketTime } from '../lib/support'
import {
  fetchSupportTicket,
  fetchSupportTickets,
  replySupportTicket,
  setSupportTicketStatus,
  submitHelpTicket,
} from '../lib/api'
import type { SupportTicket, TicketPriority } from '../lib/types'

type Filter = 'active' | 'resolved' | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]

const inputCls =
  'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'

function NewTicketForm({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [category, setCategory] = useState('technical')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [subject, setSubject] = useState('')
  const [detail, setDetail] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !detail.trim()) return
    setSending(true)
    setError('')
    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          content: await fileContent(file),
        })),
      )
      const result = await submitHelpTicket({
        subject: subject.trim(),
        detail: detail.trim(),
        category,
        priority,
        currentPage: '/dashboard/support',
        attachments,
      })
      onCreated(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the ticket. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Raise a ticket</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          The more specific, the faster we can fix it: what you did, what you expected, what happened instead,
          and a call time or number if it's about a call.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          What is it about?
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} font-normal text-text`}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          How urgent?
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={`${inputCls} font-normal text-text`}>
            {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
        Subject
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={160}
          required
          placeholder="e.g. Transfer to my team never connects"
          className={`${inputCls} font-normal text-text`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
        Describe the issue
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={5000}
          required
          rows={7}
          placeholder="Steps, what you expected, what happened, and when."
          className={`${inputCls} resize-y font-normal text-text`}
        />
      </label>
      <div className="flex flex-col gap-1">
        <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary">
          <Icon name="attach_file" className="text-[16px]" />
          Attach screenshots or files
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS)
              const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)
              setFiles(ok)
              setError(ok.length !== picked.length ? 'Each file must be 600 KB or smaller.' : '')
            }}
          />
        </label>
        <span className="text-[11px] text-text-muted">
          {files.length ? files.map((f) => f.name).join(', ') : `Up to ${MAX_ATTACHMENTS} files, 600 KB each.`}
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-high">
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending || !subject.trim() || !detail.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Submit ticket'}
        </button>
      </div>
    </form>
  )
}

export function Support() {
  const [params, setParams] = useSearchParams()
  const selectedId = Number(params.get('ticket')) || null
  const composing = params.get('new') === '1'
  const [filter, setFilter] = useState<Filter>('active')
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [loadError, setLoadError] = useState('')
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')

  const loadList = useCallback(() => {
    fetchSupportTickets()
      .then((rows) => {
        setTickets(rows)
        setLoadError('')
      })
      .catch(() => setLoadError('Could not load your tickets. Refresh to try again.'))
  }, [])

  useEffect(loadList, [loadList])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    fetchSupportTicket(selectedId)
      .then(setSelected)
      .catch(() => setSelected(null))
  }, [selectedId])

  const visible = useMemo(() => {
    const rows = tickets ?? []
    if (filter === 'active') return rows.filter((t) => t.status === 'open' || t.status === 'in_progress')
    if (filter === 'resolved') return rows.filter((t) => t.status === 'resolved' || t.status === 'closed')
    return rows
  }, [tickets, filter])

  const open = (id: number) => setParams({ ticket: String(id) })
  const compose = () => setParams({ new: '1' })
  const close = () => setParams({})

  const applyUpdate = (t: SupportTicket) => {
    setSelected(t)
    setTickets((rows) => (rows ?? []).map((r) => (r.id === t.id ? { ...r, ...t } : r)))
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked: the address is on screen and the mailto link works.
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Help & Support" subtitle="Raise a ticket, follow its progress, or email the team directly." />
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <section className="grid gap-3 md:grid-cols-3" aria-label="Ways to get help">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="mail" className="text-[19px] text-primary" /> Email us</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="break-all text-sm font-semibold text-primary hover:underline">{SUPPORT_EMAIL}</a>
            <p className="text-xs text-text-muted">Include your workspace name. A ticket keeps the whole conversation in one place.</p>
            <button onClick={copyEmail} className="mt-auto flex w-fit items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary">
              <Icon name={copied ? 'check' : 'content_copy'} className="text-[15px]" /> {copied ? 'Copied' : 'Copy address'}
            </button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="confirmation_number" className="text-[19px] text-primary" /> Raise a ticket</span>
            <p className="text-xs text-text-muted">Report a problem or ask a question. You'll get a ticket number by email and every reply here and in your inbox.</p>
            <button onClick={compose} className="mt-auto flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-bg hover:opacity-90">
              <Icon name="add" className="text-[17px]" /> New ticket
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

        {notice && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
            <Icon name="check_circle" className="text-[18px] text-success" /> {notice}
          </p>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <div className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <h2 className="text-sm font-semibold">Your tickets</h2>
              <div className="flex gap-1" role="tablist" aria-label="Filter tickets">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${filter === f.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-high'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {loadError ? (
              <p className="p-4 text-sm text-destructive">{loadError}</p>
            ) : tickets === null ? (
              <p className="p-4 text-sm text-text-muted">Loading…</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Icon name="inbox" className="text-[28px] text-text-muted" />
                <p className="text-sm text-text-muted">
                  {filter === 'active' ? 'No open tickets.' : filter === 'resolved' ? 'Nothing resolved yet.' : 'No tickets yet.'}
                </p>
                <button onClick={compose} className="text-sm font-semibold text-primary hover:underline">Raise a ticket</button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => open(t.id)}
                      aria-current={selectedId === t.id || undefined}
                      className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors ${selectedId === t.id ? 'bg-surface-high' : 'hover:bg-surface-high/60'}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-text-muted">{t.ref}</span>
                        <StatusChip status={t.status} />
                        <PriorityChip priority={t.priority} />
                        {t.lastAuthor === 'support' && t.status === 'in_progress' && (
                          <span className="ml-auto text-[11px] font-semibold text-primary">Support replied</span>
                        )}
                      </span>
                      <span className="truncate text-sm font-medium">{t.subject}</span>
                      <span className="text-[11px] text-text-muted">
                        {CATEGORY_LABELS[t.category] ?? t.category} · updated {ticketTime(t.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
            {composing ? (
              <NewTicketForm
                onCancel={close}
                onCreated={(id) => {
                  setNotice(`Ticket VV-${id} is with our team. A confirmation is on its way to your email.`)
                  loadList()
                  open(id)
                }}
              />
            ) : selected ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className="font-mono">{selected.ref}</span>
                      <StatusChip status={selected.status} />
                      <PriorityChip priority={selected.priority} />
                      <span>{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">{selected.subject}</h2>
                    <p className="text-xs text-text-muted">Opened {ticketTime(selected.createdAt)}{selected.userEmail ? ` by ${selected.userEmail}` : ''}</p>
                  </div>
                  {selected.status === 'resolved' || selected.status === 'closed' ? (
                    <button
                      onClick={() => setSupportTicketStatus(selected.id, 'open').then(applyUpdate)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-muted hover:border-primary hover:text-primary"
                    >
                      <Icon name="replay" className="text-[16px]" /> Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => setSupportTicketStatus(selected.id, 'resolved').then(applyUpdate)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-muted hover:border-success hover:text-success"
                    >
                      <Icon name="task_alt" className="text-[16px]" /> Mark resolved
                    </button>
                  )}
                </div>
                <TicketThread
                  ticket={selected}
                  viewer="customer"
                  replyPlaceholder="Add details, answer a question, or say what changed…"
                  onReply={async (body) => applyUpdate(await replySupportTicket(selected.id, body))}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                <Icon name="forum" className="text-[30px] text-text-muted" />
                <p className="text-sm text-text-muted">Pick a ticket to see the conversation, or raise a new one.</p>
                <button onClick={compose} className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-bg hover:opacity-90">New ticket</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}
