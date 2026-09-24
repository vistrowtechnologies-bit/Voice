import { useState } from 'react'
import { ticketTime } from '../lib/support'
import type { SupportTicket, TicketPriority, TicketStatus } from '../lib/types'
import { Icon } from './Icon'

// Shared by the workspace's Help & Support page and the platform team's
// support inbox, so both sides read the same conversation the same way.

const STATUS_STYLE: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'border-amber/40 bg-amber/10 text-amber' },
  in_progress: { label: 'In progress', cls: 'border-primary/40 bg-primary/10 text-primary' },
  resolved: { label: 'Resolved', cls: 'border-success/40 bg-success/10 text-success' },
  closed: { label: 'Closed', cls: 'border-border bg-surface-high text-text-muted' },
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.open
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
}

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  if (priority === 'normal' || priority === 'low') return null
  const urgent = priority === 'urgent'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${urgent ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber/40 bg-amber/10 text-amber'}`}>
      <Icon name="priority_high" className="text-[13px]" />
      {urgent ? 'Urgent' : 'High'}
    </span>
  )
}

/** The whole conversation — the opening description, then every reply — with
 * a reply box. `viewer` decides which side's messages sit on the right. */
export function TicketThread({
  ticket,
  viewer,
  onReply,
  replyPlaceholder,
}: {
  ticket: SupportTicket
  viewer: 'customer' | 'support'
  onReply: (body: string) => Promise<void>
  replyPlaceholder: string
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const entries = [
    {
      key: 'opening',
      mine: viewer === 'customer',
      who: viewer === 'customer' ? 'You' : ticket.userEmail || 'Customer',
      body: ticket.detail,
      at: ticket.createdAt,
      support: false,
    },
    ...(ticket.messages ?? []).map((m) => ({
      key: String(m.id),
      mine: m.authorType === viewer,
      who: m.authorType === 'support' ? 'Vistrow Voice Support' : m.authorName || 'Customer',
      body: m.body,
      at: m.createdAt,
      support: m.authorType === 'support',
    })),
  ]

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setError('')
    try {
      await onReply(body)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {entries.map((e) => (
          <li key={e.key} className={`flex ${e.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${e.mine ? 'border-primary/30 bg-primary/10' : e.support ? 'border-border bg-surface-high' : 'border-border bg-surface'}`}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
                {e.support && <Icon name="support_agent" className="text-[14px] text-primary" />}
                {e.who} · {ticketTime(e.at)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{e.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {ticket.attachments.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Icon name="attach_file" className="text-[15px]" />
          {ticket.attachments.map((a) => a.filename).join(', ')}
          <span>— sent to the support inbox with the ticket</span>
        </p>
      )}
      {ticket.status === 'closed' && viewer === 'customer' ? (
        <p className="rounded-lg border border-border bg-surface-high px-3 py-2 text-xs text-text-muted">
          This ticket is closed. Replying reopens it.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
        <label htmlFor={`reply-${ticket.id}`} className="sr-only">Reply</label>
        <textarea
          id={`reply-${ticket.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
          }}
          rows={3}
          maxLength={5000}
          placeholder={replyPlaceholder}
          className="w-full resize-y bg-transparent text-sm outline-none placeholder:text-text-muted"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">{error ? <span className="text-destructive">{error}</span> : 'Ctrl/⌘ + Enter to send'}</span>
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="send" className="text-[16px]" />
            {sending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  )
}
