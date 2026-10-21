import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import arthaAvatar from '../assets/artha-avatar.webp'
import { cancelCopilotAction, confirmCopilotAction, COPILOT_CHANGED_EVENT, fetchHelpFaqs, sendHelpChatMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HelpChatMessage, HelpFaq } from '../lib/types'
import { ExpandGlyph, RichText, SuccessCheck, ThinkingIndicator, TypedText } from './CopilotParts'
import { Icon } from './Icon'
import { Tooltip } from './ui/Tooltip'

// Page-specific quick questions backed either by current help documentation
// or a read-only server/help_tools.py function when live account data is
// required. Keyed by route prefix, checked longest-first so
// /dashboard/calls doesn't fall through to the generic /dashboard entry.
type PageHelp = { label: string; questions: string[] }

const GLOBAL_SUGGESTIONS = [
  'How many calls came in today?',
  'Who are my hottest leads right now?',
  'How many minutes do I have left?',
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
    questions: ['What did my last caller ask for?', 'How many calls came in today?', 'How do I check whether a lead reached my CRM?'],
  },
  '/dashboard/contacts': {
    label: 'Contacts',
    questions: ['What did my last caller ask for?', 'How many contacts do I have?', 'How many are qualified?'],
  },
  '/dashboard/appointments': {
    label: 'Appointments',
    questions: ["What's booked this week?", 'Book a callback', 'Where do I manage appointment availability?'],
  },
  '/dashboard/integrations': {
    label: 'Integrations',
    questions: ['Which integrations are failing?', 'Which integrations are connected?', 'How are qualified leads sent to ArthaLeads?'],
  },
  '/dashboard/website-widget': {
    label: 'Website Widget',
    questions: ['How do page rules work?', 'How can I see which landing page produced a call?'],
  },
  '/dashboard/agents': {
    label: 'Agents',
    questions: ['Which of my agents are live?', 'Pause an agent', "How do I edit an agent's settings?"],
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
    questions: ['Which agent answers each of my numbers?', 'How do I connect a phone number?', 'How do I assign a number to an agent?'],
  },
  '/dashboard/settings': {
    label: 'Settings',
    questions: ['Where do I manage appointment availability?', 'How do I add teammates to my workspace?'],
  },
  '/dashboard/billing': {
    label: 'Billing',
    questions: ['How many minutes do I have left?'],
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
/** Where the launcher sits when a page's sticky action bar
 * (`.vv-action-bar`: Save changes, Create agent) is over its usual corner,
 * or null when it is not (no bar, or the bar ends above it). The bar sits
 * wherever the page's content ends, not always at the screen edge, so it is
 * measured rather than a fixed offset: on 19 Oct the
 * launcher and its "Hi! Need help?" bubble covered Save changes and a click
 * there opened the chat instead of saving. Skipped while the chat is open.
 *
 * From sm up the launcher docks into the bar's right end, centred on it, and
 * the bar gets extra right padding so its buttons move clear (owner, 21 Oct:
 * lifted above the bar it sat on the cards). Phones keep it above the bar. */
const LAUNCHER = 64 // sm:h-16
const LAUNCHER_RIGHT = 24 // sm:right-6
function useActionBarClearance(active: boolean): { bottom: number; docked: boolean } | null {
  const [clearance, setClearance] = useState<{ bottom: number; docked: boolean } | null>(null)
  useEffect(() => {
    let frame = 0
    let padded: HTMLElement | null = null
    const unpad = () => {
      if (padded) padded.style.paddingRight = padded.dataset.vvPad ?? ''
      padded = null
    }
    if (!active) { setClearance(null); return }
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bar = document.querySelector<HTMLElement>('.vv-action-bar')
        const rect = bar?.getBoundingClientRect()
        const visible = bar && rect && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        if (!visible) { unpad(); setClearance(null); return }
        const launcherLeft = window.innerWidth - LAUNCHER_RIGHT - LAUNCHER
        const overlap = rect.right - launcherLeft
        // Where the launcher sits on its own (see the root's classes and the
        // tab-bar rule in index.css). Pages keep empty space at their foot
        // for it, so when the bar ends above that spot nothing has to move
        // (owner, 21 Oct: lifting it put it on the Setup card).
        const wide = window.innerWidth >= 640
        const size = wide ? LAUNCHER : 56
        const natural = window.innerWidth < 1024 && document.documentElement.classList.contains('vv-tabbar') ? 88 : wide ? 24 : 12
        const spotTop = window.innerHeight - natural - size
        const spotBottom = window.innerHeight - natural
        if (overlap <= 0 || rect.bottom <= spotTop || rect.top >= spotBottom) { unpad(); setClearance(null); return }
        if (wide && rect.height >= LAUNCHER - 8) {
          if (padded !== bar) {
            unpad()
            bar.dataset.vvPad = bar.style.paddingRight
            padded = bar
          }
          bar.style.paddingRight = `${overlap + 16}px`
          setClearance({ bottom: Math.round(window.innerHeight - rect.bottom + (rect.height - LAUNCHER) / 2), docked: true })
        } else {
          unpad()
          setClearance({ bottom: Math.round(window.innerHeight - rect.top + 12), docked: false })
        }
      })
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
      unpad()
    }
  }, [active])
  return clearance
}

export function HelpChatWidget() {
  const [open, setOpen] = useState(false)
  const barClearance = useActionBarClearance(!open)
  const [showHint, setShowHint] = useState(false)
  const [faqs, setFaqs] = useState<HelpFaq[]>([])
  const [showFaqs, setShowFaqs] = useState(false)
  const [messages, setMessages] = useState<HelpChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [ratings, setRatings] = useState<Record<number, 'up' | 'down'>>({})
  // Per assistant message index: the state of its confirmation card.
  const [actions, setActions] = useState<Record<number, { busy?: 'confirm' | 'cancel'; done?: 'confirm' | 'cancel'; error?: string }>>({})
  const decidingRef = useRef(new Set<number>())
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [expanded, setExpanded] = useState(false)
  // The newest assistant reply types itself in; its cards and chips appear
  // once it has finished, so the answer arrives in order.
  const [typingIndex, setTypingIndex] = useState<number | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState('')
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const locationKey = `${location.pathname}${location.search}`
  const page = pageSuggestions(locationKey)
  const questions = visibleQuestions(page)
  const firstName = (user?.name || '').split(' ')[0] || 'there'
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
  }, [messages, sending, typingIndex])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setShowHint(false)
        setOpen((v) => !v)
      } else if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80)
    // The website voice widget's launcher and toast sit in the same corner
    // and cover the copilot's input on phones; hide it while we're open.
    if (open) document.documentElement.dataset.copilotOpen = '1'
    else delete document.documentElement.dataset.copilotOpen
    return () => { delete document.documentElement.dataset.copilotOpen }
  }, [open])

  // Grow the input with its text, up to about four lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [input])

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
    setPendingQuestion(trimmed)
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
          article: result.article,
          pendingAction: result.pendingAction ?? null,
          upgrade: result.upgrade ?? false,
          steps: result.steps ?? [],
        },
      ])
      setTypingIndex(next.length)
    } catch {
      setError("Couldn't reach the help assistant - try again in a moment.")
    } finally {
      setSending(false)
    }
  }

  // Confirm/Cancel on a proposed action. Nothing changes until the server
  // confirms; a failure (expired, already decided, daily limit) closes the
  // card with the server's reason.
  const decideAction = async (index: number, token: string, decision: 'confirm' | 'cancel') => {
    // A ref, not state: two clicks before React re-renders must not both send.
    if (decidingRef.current.has(index) || actions[index]?.done) return
    decidingRef.current.add(index)
    setActions((current) => ({ ...current, [index]: { busy: decision } }))
    try {
      const result = await (decision === 'confirm' ? confirmCopilotAction(token) : cancelCopilotAction(token))
      setActions((current) => ({ ...current, [index]: { done: decision } }))
      if (decision === 'confirm') window.dispatchEvent(new CustomEvent(COPILOT_CHANGED_EVENT))
      setMessages((current) => {
        setTypingIndex(current.length)
        return [...current, { role: 'assistant', content: result.message, suggestTicket: false, comingSoon: false }]
      })
    } catch (err) {
      setActions((current) => ({
        ...current,
        [index]: { done: decision, error: err instanceof Error ? err.message : 'That action could not be completed.' },
      }))
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

  const closeChat = () => {
    setOpen(false)
    setMessages([])
    setActions({}); decidingRef.current.clear()
    setTypingIndex(null)
    setInput('')
    setError('')
    setShowFaqs(false)
  }

  // One request form for the whole product: the bubble used to carry its own
  // (600 KB files, no priority, no link to the request afterwards). It now
  // hands off to Help & Support's form with the question and this page.
  const openTicket = (subject = '') => {
    const question = subject || messages.filter((message) => message.role === 'user').at(-1)?.content || ''
    const params = new URLSearchParams({ new: '1', subject: question.slice(0, 160), page: locationKey })
    closeChat()
    navigate(`/dashboard/support?${params.toString()}`)
  }

  return (
    // z-60, above the call modal's z-50 overlay: at the same z-index the two
    // tied and DOM order decided, so the modal (rendered after the routes in
    // App.tsx) covered and blurred the help launcher. Help has to stay
    // reachable from on top of a dialog - that is often exactly when someone
    // needs it.
    <div className="vv-help-root fixed bottom-3 right-3 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6" style={barClearance ? { bottom: barClearance.bottom } : undefined}>
      {open && (
        <div
          className={`vv-help-panel help-chat-panel-in help-panel-size flex w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl ${
            expanded ? 'h-[min(820px,calc(100dvh-6rem))] sm:w-[min(720px,calc(100vw-3rem))]' : 'h-[min(640px,calc(100dvh-6rem))] sm:w-[420px]'
          }`}
        >
          <div className="relative flex items-center justify-between border-b border-border px-4 py-3">
            {sending && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden="true">
                <span className="help-progress-bar block h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
              </span>
            )}
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
                <div className="text-sm font-semibold">Artha Copilot</div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Icon name="bolt" className="text-[13px]" />
                  {sending ? 'Working on it…' : `Reads your live workspace · ${page?.label || 'Vistrow Voice'}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content={expanded ? 'Smaller' : 'Larger'}><button
                onClick={() => setExpanded((v) => !v)}
                className="hidden h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text sm:flex"
                aria-label={expanded ? 'Make the copilot smaller' : 'Make the copilot larger'}
              >
                <ExpandGlyph expanded={expanded} />
              </button></Tooltip>
              {location.pathname !== '/dashboard' && (
                <Tooltip content="Open dashboard"><button
                  onClick={() => navigate('/dashboard')}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text"
                  aria-label="Open dashboard"
                >
                  <Icon name="home" className="text-[18px]" />
                </button></Tooltip>
              )}
              {messages.length > 0 && (
                <Tooltip content="Back to FAQs"><button
                  onClick={() => {
                    setMessages([])
                    setActions({}); decidingRef.current.clear()
                    setError('')
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text"
                  aria-label="Back to FAQs"
                >
                  <Icon name="refresh" className="text-[18px]" />
                </button></Tooltip>
              )}
              <button
                onClick={closeChat}
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
                <div className="help-msg-in flex items-start gap-2">
                  <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
                  <p className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed text-text">
                    Hi {firstName}!{page ? ` I can see you're on ${page.label}.` : ''} I can look things up in your
                    live workspace and, on Growth plans, make changes for you after you confirm. Try one of these:
                  </p>
                </div>

                {questions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {questions.map((q, qi) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        style={{ animationDelay: `${120 + qi * 70}ms` }}
                        className="help-msg-in group flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs font-medium text-text transition-all hover:-translate-y-px hover:border-primary hover:shadow-sm"
                      >
                        {q}
                        <Icon name="arrow_forward" className="shrink-0 text-[14px] text-primary" />
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowFaqs((v) => !v)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-transparent px-3 py-2 text-left text-xs font-semibold text-text-muted transition-colors hover:text-text"
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
                    <div key={i} className="help-msg-in mr-auto flex max-w-[90%] items-start gap-2">
                      <img src={arthaAvatar} alt="Artha" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0">
                        {!!m.steps?.length && (
                          <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="What the copilot checked">
                            {m.steps.map((step, si) => (
                              <li
                                key={step}
                                style={{ animationDelay: `${si * 90}ms` }}
                                className="help-step-in flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
                              >
                                <Icon name="check" className="text-[11px]" /> {step}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="rounded-xl border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed text-text">
                          {i === typingIndex ? (
                            <TypedText text={m.content} animate onDone={() => setTypingIndex((t) => (t === i ? null : t))} />
                          ) : (
                            <RichText text={m.content} />
                          )}
                        </div>
                        {i !== typingIndex && (<>
                        {m.article && (
                          <button type="button" onClick={() => navigate(`/dashboard/support?article=${m.article!.slug}`)} className="mt-1.5 flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5">
                            <Icon name="article" className="text-[12px]" /> Read: {m.article.title}
                          </button>
                        )}
                        {m.pendingAction && (() => {
                          const action = m.pendingAction
                          const state = actions[i] || {}
                          return (
                            <div className={`mt-1.5 rounded-lg border p-2.5 ${state.done && !state.error ? 'border-border bg-surface' : 'help-card-pop border-primary/40 bg-primary/5'}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                {state.done === 'confirm' && !state.error ? 'Done' : state.done === 'cancel' && !state.error ? 'Cancelled' : 'Needs your confirmation'}
                              </p>
                              <p className="mt-1 flex items-start gap-1.5 text-[11px] font-semibold text-text">
                                {state.done === 'confirm' && !state.error ? (
                                  <SuccessCheck />
                                ) : (
                                  <Icon name="bolt" className="mt-px shrink-0 text-[13px] text-primary" />
                                )}
                                <span className={state.done === 'cancel' && !state.error ? 'text-text-muted line-through' : ''}>{action.label}</span>
                              </p>
                              {state.error ? (
                                <p className="mt-1.5 text-[11px] text-destructive">{state.error}</p>
                              ) : state.done ? null : (
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!!state.busy}
                                    onClick={() => decideAction(i, action.token, 'confirm')}
                                    className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-bg hover:opacity-90 disabled:opacity-50"
                                  >
                                    {state.busy === 'confirm' ? 'Applying…' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!!state.busy}
                                    onClick={() => decideAction(i, action.token, 'cancel')}
                                    className="rounded-md border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-text-muted hover:text-text disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        {m.upgrade && (
                          <button
                            type="button"
                            onClick={() => navigate('/dashboard/settings?tab=billing')}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
                          >
                            <Icon name="workspace_premium" className="text-[12px]" /> Available on Growth
                          </button>
                        )}
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
                          <Tooltip content="Helpful"><button
                            type="button"
                            onClick={() => setRatings((current) => ({ ...current, [i]: 'up' }))}
                            className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-high ${ratings[i] === 'up' ? 'text-success' : ''}`}
                            aria-label="Helpful answer"
                          >
                            <Icon name="thumb_up" className="text-[14px]" />
                          </button></Tooltip>
                          <Tooltip content="Not helpful - submit a request"><button
                            type="button"
                            onClick={() => {
                              setRatings((current) => ({ ...current, [i]: 'down' }))
                              openTicket(messages[i - 1]?.role === 'user' ? messages[i - 1].content : '')
                            }}
                            className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-high ${ratings[i] === 'down' ? 'text-destructive' : ''}`}
                            aria-label="Unhelpful answer"
                          >
                            <Icon name="thumb_down" className="text-[14px]" />
                          </button></Tooltip>
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
                            <Icon name="confirmation_number" className="text-[12px]" /> Submit a request
                          </button>
                        )}
                        </>)}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="help-msg-in ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl bg-primary px-3 py-2 text-xs leading-relaxed text-bg">
                      {m.content}
                    </div>
                  )
                )}
                {sending && (
                  <div className="help-msg-in mr-auto flex max-w-[85%] items-start gap-2">
                    <img src={arthaAvatar} alt="Artha" className="help-avatar-thinking mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                    <ThinkingIndicator question={pendingQuestion} />
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <p>{error}</p>
                <button type="button" onClick={() => openTicket()} className="mt-2 rounded-md border border-destructive/40 px-2 py-1 font-semibold">
                  Submit a request
                </button>
              </div>
            )}
          </div>

          {(
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                placeholder="Ask or tell the copilot what to do…"
                aria-label="Message the copilot"
                className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-surface-high px-3 py-2 text-xs leading-relaxed outline-none transition-colors focus:border-primary"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-bg transition-all hover:opacity-90 active:scale-90 disabled:opacity-50"
                aria-label="Send"
              >
                <Icon name="arrow_upward" className="text-[16px]" />
              </button>
            </form>
          )}
        </div>
      )}

      <div className="vv-help-launcher relative">
        {!open && showHint && !barClearance?.docked && (
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
            if (open) closeChat()
            else setOpen(true)
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
