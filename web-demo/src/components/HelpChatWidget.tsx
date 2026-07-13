import { useEffect, useRef, useState } from 'react'
import arthaAvatar from '../assets/artha-avatar.png'
import { fetchHelpFaqs, sendHelpChatMessage } from '../lib/api'
import type { HelpChatMessage, HelpFaq } from '../lib/types'
import { Icon } from './Icon'

/** Persistent text-only help chatbot, bottom-right on every dashboard page —
 * separate from the voice agent product. Answers are grounded in
 * server/help_content.py via POST /help/chat. */
export function HelpChatWidget() {
  const [open, setOpen] = useState(false)
  const [faqs, setFaqs] = useState<HelpFaq[]>([])
  const [messages, setMessages] = useState<HelpChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

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
      const { reply } = await sendHelpChatMessage(trimmed, history)
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
                <p className="text-xs text-text-muted">Common questions:</p>
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
              placeholder="Ask a question…"
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

      <button
        data-tour="help-chat"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-opacity hover:opacity-90"
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
  )
}
