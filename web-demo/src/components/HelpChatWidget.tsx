import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import arthaAvatar from '../assets/artha-avatar.png'
import { fetchHelpFaqs, sendHelpChatMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HelpChatMessage, HelpFaq } from '../lib/types'
import { Icon } from './Icon'

// Page-specific quick questions, each backed by a real server/help_tools.py
// function (dashboard_stats, calls_on_date, hottest_leads, billing_snapshot,
// contacts_stats) — never a question the assistant can't actually answer
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

/** Persistent text-only help chatbot, bottom-right on every dashboard page —
 * separate from the voice agent product. Answers are grounded in
 * server/help_content.py, plus live account data via server/help_tools.py,
 * via POST /help/chat. */
export function HelpChatWidget() {
  const [open, setOpen] = useState(false)
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
      setError("Couldn't reach the help assistant — try again in a moment.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[480px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0">
                <img src={arthaAvatar} alt="Artha" className="h-8 w-8 rounded-full object-cover" />
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-surface bg-green-500" />
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
        {!open && (
          <span
            aria-hidden="true"
            className="glow-pulse pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary blur-xl"
          />
        )}
        <button
          data-tour="help-chat"
          onClick={() => setOpen((v) => !v)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_-4px_rgba(168,85,247,0.8)] transition-all duration-200 hover:scale-105 hover:shadow-[0_0_32px_-2px_rgba(168,85,247,0.95)] active:scale-95"
          aria-label={open ? 'Close help chat' : 'Open help chat'}
        >
          {open ? (
            <Icon name="close" className="text-[22px] text-bg" />
          ) : (
            <>
              <img src={arthaAvatar} alt="Artha" className="h-full w-full rounded-full object-cover" />
              <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-green-500" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
