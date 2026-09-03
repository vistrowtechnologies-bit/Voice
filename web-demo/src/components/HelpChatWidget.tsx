import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation } from 'react-router-dom'
import arthaAvatar from '../assets/artha-avatar.png'
import { fetchHelpFaqs, sendHelpChatMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HelpChatMessage, HelpFaq } from '../lib/types'
import { Icon } from './Icon'

// Page-specific quick questions, each backed by a real server/help_tools.py
// function (dashboard_stats, calls_on_date, hottest_leads, billing_snapshot,
// contacts_stats) - never a question the assistant can't actually answer
// with real data. Keyed by route prefix, checked longest-first so
// /dashboard/calls doesn't fall through to the generic /dashboard entry.
const PAGE_SUGGESTIONS: Record<string, { label: string; questions: string[] }> = {
  '/dashboard/calls': {
    label: 'All Calls History',
    questions: ['How many calls came in today?', 'Show me my most recent qualified leads'],
  },
  '/dashboard/contacts': {
    label: 'Contacts',
    questions: ['How many contacts do I have?', 'How many are qualified?'],
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

function pageSuggestions(pathname: string) {
  const prefix = Object.keys(PAGE_SUGGESTIONS)
    .sort((a, b) => b.length - a.length)
    .find((p) => pathname.startsWith(p))
  return prefix ? PAGE_SUGGESTIONS[prefix] : null
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
  const threadRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const location = useLocation()
  const page = pageSuggestions(location.pathname)
  const firstName = (user?.name || '').split(' ')[0] || 'there'

  useEffect(() => {
    if (open && faqs.length === 0) {
      fetchHelpFaqs().then(setFaqs).catch(() => setFaqs([]))
    }
  }, [open, faqs.length])

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
      const { reply } = await sendHelpChatMessage(trimmed, history, location.pathname)
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch {
      setError("Couldn't reach the help assistant - try again in a moment.")
    } finally {
      setSending(false)
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
        <div className="help-chat-panel-in flex h-[min(520px,calc(100dvh-6rem))] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:w-[380px]">
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
                <div className="text-sm font-semibold">Artha</div>
                <div className="text-[11px] text-text-muted">Help Assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
                <p className="text-xs leading-relaxed text-text-muted">
                  Hi {firstName}!{page ? ` I can see you're on ${page.label}.` : ''} Ask me anything about your
                  account, or tap a question below.
                </p>

                {page && page.questions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {page.questions.map((q) => (
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
                        onClick={() => send(faq.question)}
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
                    <div key={i} className="mr-auto flex max-w-[85%] items-start gap-2">
                      <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                      <div className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed text-text">
                        {m.content}
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
              </div>
            )}
            {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}
          </div>

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
