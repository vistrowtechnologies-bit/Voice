import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CUSTOMER_STATUS_LABELS,
  FILE_RETENTION_DAYS,
  MAX_ATTACHMENTS,
  customerStatus,
  formatBytes,
  isInlineImage,
  ticketFileUrl,
  ticketTime,
} from '../lib/support'
import type { SupportTicket, SupportTicketFile, TicketPriority, TicketStatus } from '../lib/types'
import { Icon } from './Icon'
import { useAttachments } from '../lib/useAttachments'

// Shared by the workspace's Help & Support page and the platform team's
// support inbox, so both sides read the same conversation the same way.

const STATUS_STYLE: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'border-amber/40 bg-amber/10 text-amber' },
  in_progress: { label: 'In progress', cls: 'border-primary/40 bg-primary/10 text-primary' },
  resolved: { label: 'Resolved', cls: 'border-success/40 bg-success/10 text-success' },
  closed: { label: 'Closed', cls: 'border-border bg-surface-high text-text-muted' },
}

const chip = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold'

/** The support team's detailed status (admin inbox). */
export function StatusChip({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.open
  return <span className={`${chip} ${s.cls}`}>{s.label}</span>
}

/** What the customer sees: Open / Awaiting your reply / Solved. */
export function CustomerStatusChip({ ticket }: { ticket: Pick<SupportTicket, 'status' | 'lastAuthor'> }) {
  const s = customerStatus(ticket)
  const cls =
    s === 'solved'
      ? 'border-success/40 bg-success/10 text-success'
      : s === 'awaiting'
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'border-amber/40 bg-amber/10 text-amber'
  return (
    <span className={`${chip} ${cls}`}>
      {s === 'awaiting' && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
      {CUSTOMER_STATUS_LABELS[s]}
    </span>
  )
}

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  if (priority === 'normal' || priority === 'low') return null
  const urgent = priority === 'urgent'
  return (
    <span className={`${chip} ${urgent ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber/40 bg-amber/10 text-amber'}`}>
      <Icon name="priority_high" className="text-[13px]" />
      {urgent ? 'Urgent' : 'High'}
    </span>
  )
}

export function AttachmentPicker({ state, compact = false }: { state: ReturnType<typeof useAttachments>; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const previews = useMemo(() => state.files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')), [state.files])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            state.add(Array.from(e.dataTransfer.files))
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-surface-high/50'}`}
        >
          <Icon name="add_photo_alternate" className="text-[24px] text-primary" />
          <span className="text-sm font-semibold">Add screenshots or files</span>
          <span className="text-xs text-text-muted">
            Drop here, click to browse, or paste a screenshot with ⌘V / Ctrl+V · up to {MAX_ATTACHMENTS} files, 5 MB each
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          state.add(Array.from(e.target.files || []))
          e.target.value = ''
        }}
      />
      {compact && (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-text-muted hover:bg-surface-high hover:text-primary">
          <Icon name="attach_file" className="text-[16px]" /> Attach
        </button>
      )}
      {state.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {state.files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative flex items-center gap-2 rounded-lg border border-border bg-surface-high p-1.5 pr-7">
              {previews[i] ? (
                <img src={previews[i]} alt="" className="h-10 w-14 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-surface text-text-muted"><Icon name="description" /></span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="max-w-[160px] truncate text-xs font-medium">{f.name}</span>
                <span className="text-[10px] text-text-muted">{formatBytes(f.size)}</span>
              </span>
              <button type="button" onClick={() => state.remove(i)} aria-label={`Remove ${f.name}`} className="absolute right-1 top-1 rounded p-0.5 text-text-muted hover:text-destructive">
                <Icon name="close" className="text-[14px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  )
}

function FileGallery({ files, ticketId, viewer, onOpenImage }: {
  files: SupportTicketFile[]
  ticketId: number
  viewer: 'customer' | 'support'
  onOpenImage: (url: string, name: string) => void
}) {
  if (!files.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => {
        if (f.purged) {
          return (
            <span key={f.id} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-text-muted">
              <Icon name="auto_delete" className="text-[16px]" />
              <span className="max-w-[180px] truncate">{f.filename}</span>
              <span>· deleted {FILE_RETENTION_DAYS} days after solving</span>
            </span>
          )
        }
        const url = f.downloadable ? ticketFileUrl(viewer, ticketId, f.id) : ''
        if (url && isInlineImage(f.contentType)) {
          return (
            <button key={f.id} type="button" onClick={() => onOpenImage(url, f.filename)} className="group overflow-hidden rounded-lg border border-border bg-surface" title={f.filename}>
              <img src={url} alt={f.filename} loading="lazy" className="h-24 w-36 object-cover transition-transform group-hover:scale-[1.03]" />
            </button>
          )
        }
        const inner = (
          <>
            <Icon name="description" className="text-[18px] text-text-muted" />
            <span className="max-w-[180px] truncate">{f.filename}</span>
            <span className="text-text-muted">{formatBytes(f.size)}</span>
          </>
        )
        return url ? (
          <a key={f.id} href={url} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:border-primary">{inner}</a>
        ) : (
          <span key={f.id} title="Sent to the support inbox by email" className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-text-muted">{inner}</span>
        )
      })}
    </div>
  )
}

/** The whole conversation — the opening description, then every reply, each
 * with its screenshots — and a reply box. `viewer` decides which side's
 * messages sit on the right and which file route serves attachments. */
export function TicketThread({
  ticket,
  viewer,
  onReply,
  onNote,
  replyPlaceholder,
}: {
  ticket: SupportTicket
  viewer: 'customer' | 'support'
  onReply: (body: string, files: File[]) => Promise<void>
  /** Support inbox only: a private note the customer never sees. */
  onNote?: (body: string) => Promise<void>
  replyPlaceholder: string
}) {
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const attachments = useAttachments()
  const solved = ticket.status === 'resolved' || ticket.status === 'closed'
  const hasStoredFiles = [ticket.attachments, ...(ticket.messages ?? []).map((m) => m.attachments ?? [])]
    .flat()
    .some((f) => f.downloadable)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const entries = [
    {
      key: 'opening',
      mine: viewer === 'customer',
      who: viewer === 'customer' ? 'You' : ticket.userEmail || 'Customer',
      body: ticket.detail,
      at: ticket.createdAt,
      support: false,
      files: ticket.attachments,
    },
    ...(ticket.messages ?? []).map((m) => ({
      key: String(m.id),
      mine: m.authorType === viewer || m.authorType === 'note',
      who:
        m.authorType === 'note'
          ? `Internal note · ${m.authorName || 'Support'}`
          : m.authorType === 'support'
            ? 'Vistrow Voice Support'
            : viewer === 'customer'
              ? 'You'
              : m.authorName || 'Customer',
      body: m.body,
      at: m.createdAt,
      support: m.authorType === 'support',
      note: m.authorType === 'note',
      files: m.attachments ?? [],
    })),
  ]

  const send = async () => {
    const body = draft.trim()
    if (!body && !attachments.files.length) return
    setSending(true)
    setError('')
    try {
      if (mode === 'note' && onNote) await onNote(body)
      else await onReply(body, attachments.files)
      setDraft('')
      attachments.clear()
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
            <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${'note' in e && e.note ? 'border-dashed border-amber/50 bg-amber/10' : e.mine ? 'border-primary/30 bg-primary/10' : e.support ? 'border-border bg-surface-high' : 'border-border bg-surface'}`}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
                {'note' in e && e.note && <Icon name="lock" className="text-[14px] text-amber" />}
                {e.support && <Icon name="support_agent" className="text-[14px] text-primary" />}
                {e.who} · {ticketTime(e.at)}
              </p>
              {e.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{e.body}</p>}
              <FileGallery files={e.files} ticketId={ticket.id} viewer={viewer} onOpenImage={(url, name) => setLightbox({ url, name })} />
            </div>
          </li>
        ))}
      </ol>

      {solved && (
        <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <Icon name="task_alt" className="mt-0.5 text-[18px] text-success" />
          <span>
            <strong>{viewer === 'customer' ? 'This request is solved.' : 'This ticket is solved.'}</strong>{' '}
            {viewer === 'customer'
              ? "If something's still wrong, reply below — that reopens it and puts it back in front of our team."
              : 'A customer reply reopens it.'}
            {hasStoredFiles && ` Attachments are deleted ${FILE_RETENTION_DAYS} days after solving unless it's reopened.`}
          </span>
        </div>
      )}

      {onNote && (
        <div className="flex gap-1" role="tablist" aria-label="Reply or note">
          {(['reply', 'note'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${mode === m ? (m === 'note' ? 'bg-amber/15 text-amber' : 'bg-primary/10 text-primary') : 'text-text-muted hover:bg-surface-high'}`}>
              <Icon name={m === 'note' ? 'lock' : 'reply'} className="text-[15px]" />
              {m === 'note' ? 'Internal note' : 'Reply to customer'}
            </button>
          ))}
        </div>
      )}
      <div
        onPaste={mode === 'note' ? undefined : attachments.onPaste}
        className={`flex flex-col gap-2 rounded-xl border p-3 ${mode === 'note' ? 'border-dashed border-amber/50 bg-amber/5' : 'border-border bg-surface'} transition-shadow focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_15%,transparent)]`}
      >
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
          placeholder={
            mode === 'note'
              ? 'Only your team sees this — it is never sent to the customer.'
              : solved && viewer === 'customer'
                ? 'Still need help? Reply to reopen this request…'
                : replyPlaceholder
          }
          className="vv-bare-field w-full resize-y bg-transparent text-sm outline-none placeholder:text-text-muted"
        />
        {mode === 'reply' && <AttachmentPicker state={attachments} compact />}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">
            {error ? <span className="text-destructive">{error}</span> : 'Paste a screenshot with ⌘V · Ctrl/⌘ + Enter to send'}
          </span>
          <button
            onClick={send}
            disabled={sending || (!draft.trim() && !attachments.files.length)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="send" className="text-[16px]" />
            {sending ? 'Sending…' : mode === 'note' ? 'Add note' : solved && viewer === 'customer' ? 'Reply & reopen' : 'Send reply'}
          </button>
        </div>
      </div>

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6">
          <img src={lightbox.url} alt={lightbox.name} className="max-h-full max-w-full rounded-lg shadow-2xl" />
          <button onClick={() => setLightbox(null)} aria-label="Close image" className="absolute right-5 top-5 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}
