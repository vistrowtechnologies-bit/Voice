import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import arthaAvatar from '../assets/artha-avatar.png'
import { fetchHelpFaqs, sendHelpChatMessage, submitHelpTicket } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HelpChatMessage, HelpFaq } from '../lib/types'
import { Icon } from './Icon'

// Page-specific quick questions backed either by current help documentation
// or a read-only server/help_tools.py function when live account data is
// required. Keyed by route prefix, checked longest-first so
// /dashboard/calls doesn't fall through to the generic /dashboard entry.
type PageHelp = { label: string; questions: string[] }

const GLOBAL_SUGGESTIONS = [
  'How many calls came in today?',
  'Who are my hottest leads right now?',
  'How many credits do I have left?',
  'Which integrations are connected?',
]

const PAGE_SUGGESTIONS: Record<string, PageHelp> = {
  '/dashboard/settings?tab=privacy': {
    label: 'Data & privacy',
    questions: ['How do I download my data?', 'How do I cancel an account deletion request?', 'What happens when I delete my account?'],
  },
  '/dashboard/settings?tab=security': {
    label: 'Sign-in & security',
    questions: ['How do I change my password?', 'How do I sign out another device?', 'Can I use email sign-in with Google sign-in?'],
  },
  '/dashboard/settings?tab=preferences': {
    label: 'Preferences',
    questions: ['Which notification preferences can I change?', 'How do I change my personal timezone?'],
  },
  '/dashboard/settings?tab=team': {
    label: 'Team & roles',
    questions: ['How do I add teammates to my workspace?', 'What can each workspace role do?'],
  },
  '/dashboard/settings?tab=availability': {
    label: 'Scheduling',
    questions: ['Where do I manage appointment availability?', 'How do slot length and booking notice work?'],
  },
  '/dashboard/calls': {
    label: 'All Calls History',
    questions: ['How many calls came in today?', 'How do I check whether a lead reached my CRM?', 'How can I see which landing page produced a call?'],
  },
  '/dashboard/contacts': {
    label: 'Contacts',
    questions: ['How many contacts do I have?', 'How many are qualified?', 'Can I resize the Contacts columns?'],
  },
  '/dashboard/appointments': {
    label: 'Appointments',
    questions: ['Where do I manage appointment availability?', 'How do I reschedule an appointment?'],
  },
  '/dashboard/integrations': {
    label: 'Integrations',
    questions: ['Which integrations are connected?', 'How are qualified leads sent to ArthaLeads?'],
  },
  '/dashboard/website-widget': {
    label: 'Website Widget',
    questions: ['How do page rules work?', 'How can I see which landing page produced a call?'],
  },
  '/dashboard/agents': {
    label: 'Agents',
    questions: ["How do I edit an agent's settings?", 'How do I connect a knowledge base?'],
  },
  '/dashboard/testing': {
    label: 'Testing Lab',
    questions: ['How do I test an agent before going live?', 'What should I include in a test scenario?'],
  },
  '/dashboard/voices': {
    label: 'Voices',
    questions: ['How do I preview a voice?', 'Which languages do agents support?'],
  },
  '/dashboard/knowledge': {
    label: 'Knowledge Base',
    questions: ['Can I ground an agent in my own documents?', 'What does Strict Mode do?'],
  },
  '/dashboard/compliance': {
    label: 'Compliance',
    questions: ['How do I stay compliant with Do-Not-Call rules?'],
  },
  '/dashboard/inbound': {
    label: 'Inbound',
    questions: ['How do I choose which agent answers?', 'How do business hours affect inbound calls?'],
  },
  '/dashboard/outbound': {
    label: 'Outbound',
    questions: ['How do I run an outbound calling campaign?', 'How are DNC and calling windows applied?'],
  },
  '/dashboard/numbers': {
    label: 'Phone Numbers',
    questions: ['How do I connect a phone number?', 'How do I assign a number to an agent?'],
  },
  '/dashboard/settings': {
    label: 'Settings',
    questions: ['Where do I manage appointment availability?', 'How do I add teammates to my workspace?'],
  },
  '/dashboard/billing': {
    label: 'Billing',
    questions: ['How many credits do I have left?'],
  },
  '/dashboard': {
    label: 'Dashboard',
    questions: ['How many calls came in today?', 'Who are my hottest leads right now?'],
  },
}

function pageSuggestions(locationKey: string) {
  const prefix = Object.keys(PAGE_SUGGESTIONS)
    .sort((a, b) => b.length - a.length)
    .find((p) => locationKey.startsWith(p))
  return prefix ? PAGE_SUGGESTIONS[prefix] : null
}

function visibleQuestions(page: PageHelp | null) {
  return [...new Set([...(page?.questions || []), ...GLOBAL_SUGGESTIONS])].slice(0, 4)
}

const fileContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.readAsDataURL(file)
  })

const HELP_NAVIGATION = [
  { label: 'All Calls History', to: '/dashboard/calls' },
  { label: 'Contacts', to: '/dashboard/contacts' },
  { label: 'Appointments', to: '/dashboard/appointments' },
  { label: 'Integrations', to: '/dashboard/integrations' },
  { label: 'Website Widget', to: '/dashboard/website-widget' },
  { label: 'Knowledge Base', to: '/dashboard/knowledge' },
  { label: 'Testing Lab', to: '/dashboard/testing' },
  { label: 'Phone Numbers', to: '/dashboard/numbers' },
  { label: 'Compliance', to: '/dashboard/compliance' },
  { label: 'Billing', to: '/dashboard/billing' },
  { label: 'Agents', to: '/dashboard/agents' },
  { label: 'Settings', to: '/dashboard/settings' },
]

function replyNavigation(content: string, currentPath: string) {
  const lower = content.toLowerCase()
  return HELP_NAVIGATION.find((item) => lower.includes(item.label.toLowerCase()) && !currentPath.startsWith(item.to))
}

/** Persistent text-only help chatbot, bottom-right on every dashboard page -
 * separate from the voice agent product. Answers are grounded in
 * server/help_content.py, plus live account data via server/help_tools.py,
 * via POST /help/chat. */
export function HelpChatWidget() {
  const [open, setOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [faqs, setFaqs] = useState<HelpFaq[]>([])
  const [showFaqs, setShowFaqs] = useState(false)
  const [messages, setMessages] = useState<HelpChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [ratings, setRatings] = useState<Record<number, 'up' | 'down'>>({})
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDetail, setTicketDetail] = useState('')
  const [ticketCategory, setTicketCategory] = useState('technical')
  const [ticketFiles, setTicketFiles] = useState<File[]>([])
  const [ticketSending, setTicketSending] = useState(false)
  const [ticketResult, setTicketResult] = useState('')
  const [ticketError, setTicketError] = useState('')
  const [hydratedStorageKey, setHydratedStorageKey] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const locationKey = `${location.pathname}${location.search}`
  const page = pageSuggestions(locationKey)
  const questions = visibleQuestions(page)
  const firstName = (user?.name || '').split(' ')[0] || 'there'
  const storageKey = `vistrow-help-chat:${user?.accountId ?? 'guest'}:${user?.id ?? 'guest'}`

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      setMessages(stored ? JSON.parse(stored).slice(-12) : [])
    } catch {
      // A blocked or malformed localStorage entry should never break support.
    } finally {
      setHydratedStorageKey(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return
    try {
      if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-12)))
      else localStorage.removeItem(storageKey)
    } catch {
      // Private browsing/storage limits: continue with in-memory chat.
    }
  }, [hydratedStorageKey, messages, storageKey])

  useEffect(() => {
    if (open && faqs.length === 0) {
      fetchHelpFaqs().then(setFaqs).catch(() => setFaqs([]))
    }
  }, [open, faqs.length])

  useEffect(() => {
    const askFromPage = (event: Event) => {
      const question = (event as CustomEvent<{ question?: string }>).detail?.question?.trim()
      setOpen(true)
      if (question) setInput(question)
    }
    window.addEventListener('helpbot:ask', askFromPage)
    return () => window.removeEventListener('helpbot:ask', askFromPage)
  }, [])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (open) {
      setShowHint(false)
      return
    }
    const showTimer = window.setTimeout(() => setShowHint(true), 1200)
    const hideTimer = window.setTimeout(() => setShowHint(false), 7500)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [open])

  const tiltAvatar = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -12
    event.currentTarget.style.setProperty('--help-tilt-x', `${y.toFixed(1)}deg`)
    event.currentTarget.style.setProperty('--help-tilt-y', `${x.toFixed(1)}deg`)
  }

  const resetAvatarTilt = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty('--help-tilt-x', '0deg')
    event.currentTarget.style.setProperty('--help-tilt-y', '0deg')
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setError('')
    setInput('')
    const history = messages
    const next: HelpChatMessage[] = [...history, { role: 'user', content: trimmed }]
    setMessages(next)
    setSending(true)
    try {
      const result = await sendHelpChatMessage(trimmed, history, `${location.pathname}${location.search}`)
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: result.reply,
          suggestTicket: result.suggestTicket,
          comingSoon: result.comingSoon,
        },
      ])
    } catch {
      setError("Couldn't reach the help assistant - try again in a moment.")
    } finally {
      setSending(false)
    }
  }

  const answerFaq = (faq: HelpFaq) => {
    if (sending) return
    setError('')
    setMessages((current) => [
      ...current,
      { role: 'user', content: faq.question },
      { role: 'assistant', content: faq.answer, suggestTicket: false, comingSoon: false },
    ])
  }

  const openTicket = (subject = '') => {
    setTicketSubject(subject || messages.filter((message) => message.role === 'user').at(-1)?.content || '')
    setTicketDetail('')
    setTicketResult('')
    setTicketError('')
    setTicketOpen(true)
  }

  const sendTicket = async () => {
    if (!ticketSubject.trim() || !ticketDetail.trim() || ticketSending) return
    setTicketSending(true)
    setTicketResult('')
    setTicketError('')
    try {
      const attachments = await Promise.all(
        ticketFiles.map(async (file) => ({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          content: await fileContent(file),
        })),
      )
      const result = await submitHelpTicket({
        subject: ticketSubject.trim(),
        detail: ticketDetail.trim(),
        category: ticketCategory,
        currentPage: locationKey,
        attachments,
      })
      setTicketResult(`Ticket ${result.ticketId} created. Our support team will follow up by email.`)
      setTicketFiles([])
    } catch (ticketError) {
      setTicketError(ticketError instanceof Error ? ticketError.message : 'Could not create the ticket. Please try again.')
    } finally {
      setTicketSending(false)
    }
  }

  return (
    // z-60, above the call modal's z-50 overlay: at the same z-index the two
    // tied and DOM order decided, so the modal (rendered after the routes in
    // App.tsx) covered and blurred the help launcher. Help has to stay
    // reachable from on top of a dialog - that is often exactly when someone
    // needs it.
    <div className="fixed bottom-3 right-3 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div className="help-chat-panel-in flex h-[min(640px,calc(100dvh-6rem))] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0">
                <img
                  src={arthaAvatar}
                  alt="Artha"
                  className={`h-8 w-8 rounded-full object-cover ${sending ? 'help-avatar-thinking' : ''}`}
                />
                <span className="pulse-dot absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-surface bg-green-500" />
              </div>
              <div>
                <div className="text-sm font-semibold">Artha - Help Assistant</div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Icon name="bolt" className="text-[13px]" /> Copilot - {page?.label || 'Vistrow Voice'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {location.pathname !== '/dashboard' && (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text"
                  aria-label="Open dashboard"
                  title="Open dashboard"
                >
                  <Icon name="home" className="text-[18px]" />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([])
                    setError('')
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text"
                  aria-label="Back to FAQs"
                  title="Back to FAQs"
                >
                  <Icon name="refresh" className="text-[18px]" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text"
                aria-label="Close help chat"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          </div>

          <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
                  <p className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed text-text">
                    Hi {firstName}!{page ? ` I can see you're on ${page.label}.` : ''} I have page guidance and live
                    account data ready - tap a question below or ask me anything.
                  </p>
                </div>

                {questions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {questions.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs font-medium text-text transition-colors hover:border-primary"
                      >
                        {q}
                        <Icon name="arrow_forward" className="shrink-0 text-[14px] text-primary" />
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowFaqs((v) => !v)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs font-semibold text-text-muted transition-colors hover:text-text"
                >
                  Common questions
                  <Icon name={showFaqs ? 'expand_less' : 'expand_more'} className="text-[16px]" />
                </button>
                {showFaqs && (
                  <div className="flex flex-col gap-2">
                    {faqs.map((faq) => (
                      <button
                        key={faq.question}
                        onClick={() => answerFaq(faq)}
                        className="rounded-lg border border-border bg-surface-high px-3 py-2 text-left text-xs text-text transition-colors hover:border-primary"
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) =>
                  m.role === 'assistant' ? (
                    <div key={i} className="mr-auto flex max-w-[90%] items-start gap-2">
                      <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                      <div>
                        <div className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed text-text">
                          {m.content}
                        </div>
                        {m.comingSoon && (
                          <span className="mt-1.5 inline-flex rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Coming soon
                          </span>
                        )}
                        {replyNavigation(m.content, location.pathname) && (() => {
                          const destination = replyNavigation(m.content, location.pathname)!
                          return (
                            <button type="button" onClick={() => navigate(destination.to)} className="mt-1.5 flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5">
                              Open {destination.label} <Icon name="arrow_forward" className="text-[12px]" />
                            </button>
                          )
                        })()}
                        <div className="mt-1 flex items-center gap-1 text-text-muted">
                          <button
                            type="button"
                            onClick={() => setRatings((current) => ({ ...current, [i]: 'up' }))}
                            className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-high ${ratings[i] === 'up' ? 'text-success' : ''}`}
                            aria-label="Helpful answer"
                            title="Helpful"
                          >
                            <Icon name="thumb_up" className="text-[14px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRatings((current) => ({ ...current, [i]: 'down' }))
                              openTicket(messages[i - 1]?.role === 'user' ? messages[i - 1].content : '')
                            }}
                            className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-high ${ratings[i] === 'down' ? 'text-destructive' : ''}`}
                            aria-label="Unhelpful answer"
                            title="Not helpful - raise a ticket"
                          >
                            <Icon name="thumb_down" className="text-[14px]" />
                          </button>
                          <button type="button" onClick={() => openTicket()} className="ml-1 text-[10px] hover:text-primary">
                            Report
                          </button>
                        </div>
                        {m.suggestTicket && (
                          <button
                            type="button"
                            onClick={() => openTicket(messages[i - 1]?.role === 'user' ? messages[i - 1].content : '')}
                            className="mt-1.5 flex items-center gap-1 rounded-md border border-destructive/35 bg-destructive/5 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                          >
                            <Icon name="confirmation_number" className="text-[12px]" /> Raise a ticket
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-xs leading-relaxed text-bg">
                      {m.content}
                    </div>
                  )
                )}
                {sending && (
                  <div className="mr-auto flex max-w-[85%] items-start gap-2">
                    <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                    <div className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs text-text-muted">
                      Thinking…
                    </div>
                  </div>
                )}
                {!sending && page && (
                  <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Suggested on {page.label}</p>
                    {questions.map((question) => (
                      <button key={question} type="button" onClick={() => send(question)} className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-left text-[11px] text-text hover:border-primary">
                        {question}<Icon name="arrow_forward" className="shrink-0 text-[13px] text-primary" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <p>{error}</p>
                <button type="button" onClick={() => openTicket()} className="mt-2 rounded-md border border-destructive/40 px-2 py-1 font-semibold">
                  Raise a ticket
                </button>
              </div>
            )}
          </div>

          {ticketOpen && (
            <section className="max-h-[330px] shrink-0 overflow-y-auto border-t border-border bg-surface-high/35 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="confirmation_number" className="text-[17px] text-primary" /> Raise a support ticket</h3>
                <button type="button" onClick={() => setTicketOpen(false)} aria-label="Close ticket form" className="text-text-muted hover:text-text"><Icon name="expand_more" className="text-[18px]" /></button>
              </div>
              {ticketResult ? (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">{ticketResult}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} maxLength={160} placeholder="What do you need help with?" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary" />
                  <textarea value={ticketDetail} onChange={(event) => setTicketDetail(event.target.value)} maxLength={5000} placeholder="Describe what happened, what you expected, and any call ID…" className="h-20 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={ticketCategory} onChange={(event) => setTicketCategory(event.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none">
                      <option value="technical">Technical issue</option>
                      <option value="billing">Billing</option>
                      <option value="account">Account</option>
                      <option value="feature">Feature request</option>
                      <option value="general">General question</option>
                    </select>
                    <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted hover:border-primary">
                      <Icon name="attach_file" className="mr-1 align-middle text-[14px]" /> Attach
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const selected = Array.from(event.target.files || []).slice(0, 3)
                          const valid = selected.filter((file) => file.size <= 600 * 1024)
                          setTicketFiles(valid)
                          if (valid.length !== selected.length) setTicketError('Each attachment must be 600 KB or smaller.')
                        }}
                      />
                    </label>
                  </div>
                  {ticketFiles.length > 0 && <p className="truncate text-[10px] text-text-muted">{ticketFiles.map((file) => file.name).join(', ')}</p>}
                  {ticketError && <p className="text-[10px] text-destructive">{ticketError}</p>}
                  <button type="button" onClick={sendTicket} disabled={ticketSending || !ticketSubject.trim() || !ticketDetail.trim()} className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-bg disabled:opacity-50">
                    <Icon name="send" className="text-[14px]" /> {ticketSending ? 'Submitting…' : 'Submit ticket'}
                  </button>
                </div>
              )}
            </section>
          )}

          {!ticketOpen && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your account…"
                className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                aria-label="Send"
              >
                <Icon name="arrow_upward" className="text-[16px]" />
              </button>
            </form>
          )}
        </div>
      )}

      <div className="relative">
        {!open && showHint && (
          <button
            type="button"
            onClick={() => {
              setShowHint(false)
              setOpen(true)
            }}
            className="help-chat-hint absolute bottom-2 right-[calc(100%+0.75rem)] hidden whitespace-nowrap rounded-xl border border-primary/25 bg-surface px-3 py-2 text-xs font-medium text-text shadow-xl transition-colors hover:border-primary/60 hover:bg-surface-high sm:block"
          >
            Hi! Need help?
          </button>
        )}
        {!open && (
          <span
            aria-hidden="true"
            className="glow-pulse pointer-events-none absolute -inset-1 -z-10 rounded-full bg-primary blur-xl"
          />
        )}
        <button
          data-tour="help-chat"
          onClick={() => {
            setShowHint(false)
            setOpen((v) => !v)
          }}
          onPointerMove={tiltAvatar}
          onPointerLeave={resetAvatarTilt}
          className={`help-avatar-button group relative flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_-4px_rgba(168,85,247,0.8)] transition-all duration-200 hover:shadow-[0_0_34px_-2px_rgba(168,85,247,0.95)] active:scale-95 sm:h-16 sm:w-16 ${open ? 'help-avatar-button-open' : ''}`}
          aria-label={open ? 'Close help chat' : 'Open help chat'}
        >
          {open ? (
            <Icon name="close" className="help-close-pop text-[24px] text-bg" />
          ) : (
            <span className="help-avatar-tilt relative block h-full w-full rounded-full">
              <span className="help-avatar-float block h-full w-full rounded-full">
                <img
                  src={arthaAvatar}
                  alt="Artha"
                  className="h-full w-full rounded-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
                />
              </span>
              <span className="pulse-dot absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-green-500 sm:h-3.5 sm:w-3.5" />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
