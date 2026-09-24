import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { HelpArticleBody } from '../components/HelpArticleBody'
import { Icon } from '../components/Icon'
import { AttachmentPicker, CustomerStatusChip, PriorityChip, TicketThread } from '../components/SupportTicketParts'
import {
  fetchHelpTopics,
  fetchSupportTicket,
  fetchSupportTickets,
  rateSupportTicket,
  replySupportTicket,
  searchHelpArticles,
  setSupportTicketStatus,
  submitHelpTicket,
} from '../lib/api'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  SUPPORT_EMAIL,
  customerStatus,
  ticketTime,
  toUploads,
  type CustomerStatus,
} from '../lib/support'
import type { HelpSearchHit, HelpTopic, SupportTicket, TicketPriority } from '../lib/types'
import { useAttachments } from '../lib/useAttachments'

// The in-app help centre, modelled on Google's: search first, your recent
// request, help topics (one per dashboard menu) that open into articles, and
// a way to reach a person. Articles come from server/help_articles.py — the
// same source the help bot answers from.

type Filter = 'all' | CustomerStatus
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'awaiting', label: 'Awaiting your reply' },
  { id: 'solved', label: 'Solved' },
]

const inputCls =
  'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary'
const card = 'overflow-hidden rounded-xl border border-border bg-surface'

function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <Icon name="chevron_right" className="text-[16px]" />}
          {c.to ? <Link to={c.to} className="font-medium hover:text-primary">{c.label}</Link> : <span className="text-text">{c.label}</span>}
        </span>
      ))}
    </nav>
  )
}

/** "Describe your issue": live article results, then the assistant or a request. */
function HelpSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<HelpSearchHit[] | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (q.trim().length < 3) {
      setHits(null)
      return
    }
    timer.current = window.setTimeout(() => {
      searchHelpArticles(q).then(setHits).catch(() => setHits([]))
    }, 250)
    return () => window.clearTimeout(timer.current)
  }, [q])

  return (
    <div className="relative">
      <label className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-3.5 shadow-sm focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_15%,transparent)]">
        <Icon name="search" className="text-[22px] text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Describe your issue"
          aria-label="Describe your issue"
          className="vv-bare-field w-full bg-transparent text-base outline-none placeholder:text-text-muted"
        />
      </label>
      {hits && (
        <div className={`${card} absolute inset-x-0 top-full z-10 mt-2 shadow-xl`}>
          {hits.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-muted">No article matches that yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {hits.map((h) => (
                <li key={h.slug}>
                  <Link to={`/dashboard/support?article=${h.slug}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-high/60">
                    <Icon name="article" className="mt-0.5 text-[20px] text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{h.title}</span>
                      <span className="block text-xs text-text-muted">{h.topicTitle} · {h.summary}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-high/40 px-5 py-3 text-sm">
            <span className="text-text-muted">Not what you need?</span>
            <button onClick={() => window.dispatchEvent(new CustomEvent('helpbot:ask', { detail: { question: q } }))} className="flex items-center gap-1 font-semibold text-primary hover:underline">
              <Icon name="forum" className="text-[16px]" /> Ask the assistant
            </button>
            <Link to={`/dashboard/support?new=1&subject=${encodeURIComponent(q)}`} className="flex items-center gap-1 font-semibold text-primary hover:underline">
              <Icon name="confirmation_number" className="text-[16px]" /> Submit a request
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function StillNeedHelp({ subject = '' }: { subject?: string }) {
  return (
    <div className={`${card} flex flex-col gap-3 p-5`}>
      <h3 className="text-base font-semibold">Still need help?</h3>
      <p className="text-sm text-text-muted">Tell us what's happening — add a screenshot and we'll take it from there.</p>
      <Link to={`/dashboard/support?new=1${subject ? `&subject=${encodeURIComponent(subject)}` : ''}`} className="flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-bg hover:opacity-90">
        <Icon name="add" className="text-[17px]" /> Submit a request
      </Link>
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm font-semibold text-primary hover:underline">{SUPPORT_EMAIL}</a>
    </div>
  )
}

function Home({ topics, tickets, openTopic }: { topics: HelpTopic[] | null; tickets: SupportTicket[] | null; openTopic: string | null }) {
  const [expanded, setExpanded] = useState<string | null>(openTopic)
  useEffect(() => setExpanded(openTopic), [openTopic])
  const recent = useMemo(
    () => [...(tickets ?? [])].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0],
    [tickets],
  )
  const openCount = (tickets ?? []).filter((t) => customerStatus(t) !== 'solved').length

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section className="flex flex-col items-center gap-4 pt-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">How can we help?</h2>
        <div className="w-full max-w-2xl text-left"><HelpSearch /></div>
      </section>

      {recent && (
        <section className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Recent request</h2>
              <p className="text-sm text-text-muted">
                {customerStatus(recent) === 'awaiting' ? 'We replied — have a look.' : customerStatus(recent) === 'solved' ? 'This one is solved.' : "We're working on this for you."}
              </p>
            </div>
            <Link to="/dashboard/support?view=requests" className="text-sm font-semibold text-primary hover:underline">
              All requests{openCount ? ` (${openCount} open)` : ''}
            </Link>
          </div>
          <Link to={`/dashboard/support?ticket=${recent.id}`} className={`${card} flex items-center gap-4 px-5 py-4 hover:border-primary/50`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon name="confirmation_number" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{recent.subject}</span>
              <span className="block text-xs text-text-muted">Request {recent.ref}</span>
            </span>
            <span className="flex flex-col items-end gap-1 text-right">
              <CustomerStatusChip ticket={recent} />
              <span className="text-xs text-text-muted">Updated {ticketTime(recent.updatedAt)}</span>
            </span>
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Browse help topics</h2>
        {topics === null ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className={card}>
            {topics.map((t, i) => {
              const isOpen = expanded === t.slug
              return (
                <div key={t.slug} className={i ? 'border-t border-border' : ''}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : t.slug)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-high/50"
                  >
                    <Icon name={t.icon} className="text-[20px] text-primary" />
                    <span className="flex-1 font-medium">{t.title}</span>
                    <span className="text-xs text-text-muted">{t.articles.length} article{t.articles.length === 1 ? '' : 's'}</span>
                    <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="text-[22px] text-primary" />
                  </button>
                  {isOpen && (
                    <ul className="bg-primary/5 pb-2">
                      {t.articles.map((a) => (
                        <li key={a.slug}>
                          <Link to={`/dashboard/support?article=${a.slug}`} className="flex flex-col px-14 py-2.5 hover:bg-primary/10">
                            <span className="text-sm font-medium">{a.title}</span>
                            <span className="text-xs text-text-muted">{a.summary}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Contact us">
        <Link to="/dashboard/support?new=1" className={`${card} flex flex-col gap-1.5 p-5 hover:border-primary/50`}>
          <Icon name="confirmation_number" className="text-[22px] text-primary" />
          <span className="font-semibold">Submit a request</span>
          <span className="text-xs text-text-muted">Describe the problem and attach screenshots. Replies reach you here and by email.</span>
        </Link>
        <Link to="/dashboard/support?view=requests" className={`${card} flex flex-col gap-1.5 p-5 hover:border-primary/50`}>
          <Icon name="inbox" className="text-[22px] text-primary" />
          <span className="font-semibold">Your requests</span>
          <span className="text-xs text-text-muted">Follow the status of everything your team has raised.</span>
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className={`${card} flex flex-col gap-1.5 p-5 hover:border-primary/50`}>
          <Icon name="mail" className="text-[22px] text-primary" />
          <span className="font-semibold">Email us</span>
          <span className="text-xs text-primary">{SUPPORT_EMAIL}</span>
        </a>
      </section>
    </div>
  )
}

function ArticleView({ slug, topics }: { slug: string; topics: HelpTopic[] | null }) {
  if (!topics) return <p className="text-sm text-text-muted">Loading…</p>
  const topic = topics.find((t) => t.articles.some((a) => a.slug === slug))
  const article = topic?.articles.find((a) => a.slug === slug)
  if (!topic || !article) {
    return (
      <div className="flex flex-col gap-3">
        <Crumbs items={[{ label: 'Help Center', to: '/dashboard/support' }, { label: 'Not found' }]} />
        <p className="text-sm text-text-muted">That article doesn't exist. Try searching the help centre.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Crumbs items={[{ label: 'Help Center', to: '/dashboard/support' }, { label: topic.title, to: `/dashboard/support?topic=${topic.slug}` }, { label: article.title }]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <article className={`${card} px-6 py-7 sm:px-10 sm:py-9`}>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{article.title}</h1>
          <p className="mb-5 mt-2 text-sm text-text-muted">{article.summary}</p>
          <HelpArticleBody body={article.body} />
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5 text-sm">
            <Link to={topic.route} className="flex items-center gap-1 font-semibold text-primary hover:underline">
              Open {topic.title} <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </article>
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="px-1 text-base font-semibold">{topic.title}</h2>
            <ul className="flex flex-col">
              {topic.articles.map((a) => (
                <li key={a.slug}>
                  <Link
                    to={`/dashboard/support?article=${a.slug}`}
                    aria-current={a.slug === slug ? 'page' : undefined}
                    className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm ${a.slug === slug ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-surface-high'}`}
                  >
                    <Icon name="article" className="mt-0.5 text-[18px] text-primary" />
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <StillNeedHelp subject={`${topic.title}: `} />
        </aside>
      </div>
    </div>
  )
}

function NewRequest({ onCreated, onCancel, initialSubject, fromPage }: { onCreated: (id: number) => void; onCancel: () => void; initialSubject: string; fromPage: string }) {
  const [category, setCategory] = useState('technical')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [subject, setSubject] = useState(initialSubject)
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
        currentPage: fromPage || '/dashboard/support',
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
      <Crumbs items={[{ label: 'Help Center', to: '/dashboard/support' }, { label: 'Submit a request' }]} />
      <form onSubmit={submit} onPaste={attachments.onPaste} className={card}>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Submit a request</h2>
          <p className="mt-1 text-sm text-text-muted">
            Tell us what you did, what you expected, and what happened instead. A screenshot — or the call's time
            and number — lets us fix it much faster.
            {fromPage && <> We'll include the page you came from ({fromPage}).</>}
          </p>
        </div>
        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
              What is it about?
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
              How urgent?
              <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputCls}>
                {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
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

/** Zendesk-style satisfaction check once a request is solved. */
function RateRequest({ ticket, onRated }: { ticket: SupportTicket; onRated: (t: SupportTicket) => void }) {
  const [choice, setChoice] = useState<'good' | 'bad' | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  if (ticket.rating) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-high/50 px-4 py-3 text-sm text-text-muted">
        <Icon name={ticket.rating === 'good' ? 'thumb_up' : 'thumb_down'} className="text-[18px] text-primary" />
        Thanks for your feedback{ticket.ratingComment ? ` — "${ticket.ratingComment}"` : '.'}
      </p>
    )
  }
  const submit = async () => {
    if (!choice) return
    setSaving(true)
    try {
      onRated(await rateSupportTicket(ticket.id, choice, comment))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4">
      <p className="text-sm font-semibold">How did we do on this request?</p>
      <div className="flex gap-2">
        {(['good', 'bad'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setChoice(r)}
            aria-pressed={choice === r}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${choice === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:border-primary/50'}`}
          >
            <Icon name={r === 'good' ? 'thumb_up' : 'thumb_down'} className="text-[17px]" /> {r === 'good' ? 'Good' : 'Not good'}
          </button>
        ))}
      </div>
      {choice && (
        <>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000} placeholder={choice === 'good' ? 'Anything we did especially well? (optional)' : 'What should we have done better? (optional)'} className={`${inputCls} resize-y`} />
          <button onClick={submit} disabled={saving} className="w-fit rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40">
            {saving ? 'Sending…' : 'Send feedback'}
          </button>
        </>
      )}
    </div>
  )
}

function RequestDetail({ id, onChanged }: { id: number; onChanged: (t: SupportTicket) => void }) {
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
  const crumbs = [{ label: 'Help Center', to: '/dashboard/support' }, { label: 'Your requests', to: '/dashboard/support?view=requests' }]

  if (missing) return <div className="flex flex-col gap-3"><Crumbs items={[...crumbs, { label: 'Not found' }]} /><p className="text-sm text-text-muted">This request doesn't exist or isn't in your workspace.</p></div>
  if (!ticket) return <p className="text-sm text-text-muted">Loading…</p>
  const solved = customerStatus(ticket) === 'solved'

  return (
    <div className="flex flex-col gap-3">
      <Crumbs items={[...crumbs, { label: ticket.ref }]} />
      <section className={card}>
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
        <div className="flex flex-col gap-4 bg-bg/40 p-5">
          {solved && <RateRequest ticket={ticket} onRated={apply} />}
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

function Requests({ tickets, loadError }: { tickets: SupportTicket[] | null; loadError: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Crumbs items={[{ label: 'Help Center', to: '/dashboard/support' }, { label: 'Your requests' }]} />
        <Link to="/dashboard/support?new=1" className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-bg hover:opacity-90">
          <Icon name="add" className="text-[17px]" /> New request
        </Link>
      </div>
      <section className={card}>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter requests">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${filter === f.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-high'}`}>
                {f.label}
                <span className="tabular-nums opacity-70">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-high px-2.5 py-1.5">
            <Icon name="search" className="text-[16px] text-text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requests" aria-label="Search requests" className="vv-bare-field w-44 bg-transparent text-sm outline-none placeholder:text-text-muted" />
          </label>
        </div>
        {loadError ? (
          <p className="p-5 text-sm text-destructive">{loadError}</p>
        ) : tickets === null ? (
          <p className="p-5 text-sm text-text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Icon name="inbox" className="text-[30px] text-text-muted" />
            <p className="text-sm text-text-muted">{tickets.length === 0 ? "You haven't submitted any requests yet." : 'No requests match this filter.'}</p>
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
                  <tr key={t.id} className="hover:bg-surface-high/60">
                    <td className="max-w-[320px] px-4 py-3">
                      <Link to={`/dashboard/support?ticket=${t.id}`} className="block truncate font-medium hover:text-primary">{t.subject}</Link>
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

export function Support() {
  const [params, setParams] = useSearchParams()
  const selectedId = Number(params.get('ticket')) || null
  const article = params.get('article')
  const view = params.get('view')
  const composing = params.get('new') === '1'
  const [topics, setTopics] = useState<HelpTopic[] | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadTickets = useCallback(() => {
    fetchSupportTickets()
      .then((rows) => {
        setTickets(rows)
        setLoadError('')
      })
      .catch(() => setLoadError('Could not load your requests. Refresh to try again.'))
  }, [])
  useEffect(loadTickets, [loadTickets])
  useEffect(() => {
    fetchHelpTopics().then((d) => setTopics(d.topics)).catch(() => setTopics([]))
  }, [])
  useEffect(() => window.scrollTo({ top: 0 }), [selectedId, article, view, composing])

  let body
  if (composing) {
    body = (
      <NewRequest
        initialSubject={params.get('subject') ?? ''}
        fromPage={params.get('page') ?? ''}
        onCancel={() => setParams({})}
        onCreated={(id) => {
          loadTickets()
          setParams({ ticket: String(id) })
        }}
      />
    )
  } else if (selectedId) {
    body = <RequestDetail id={selectedId} onChanged={(t) => setTickets((rows) => (rows ?? []).map((r) => (r.id === t.id ? { ...r, ...t } : r)))} />
  } else if (article) {
    body = <ArticleView slug={article} topics={topics} />
  } else if (view === 'requests') {
    body = <Requests tickets={tickets} loadError={loadError} />
  } else {
    body = <Home topics={topics} tickets={tickets} openTopic={params.get('topic')} />
  }

  return (
    <DashboardLayout>
      <PageHeader title="Help & Support" subtitle="Find an answer, submit a request, or follow the ones you've raised." />
      <div className="p-4 sm:p-6">{body}</div>
    </DashboardLayout>
  )
}
