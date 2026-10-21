import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

// Small pieces that make the help chat feel like a working copilot: replies
// that type themselves in, readable lists, a visible "what I'm doing" line
// while it works, and a check that draws itself when an action lands.

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** **bold** inside a line, as text nodes (never HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/** The model often writes "Live agents: - A - B - C" on one line; give it
 * back its list shape. Only when a colon introduces two or more dashes. */
function splitInlineList(line: string): string[] {
  const colon = line.indexOf(': - ')
  if (colon < 0 || line.split(' - ').length < 3) return [line]
  const lead = line.slice(0, colon + 1)
  const items = line.slice(colon + 2).split(/\s+-\s+/).map((s) => s.replace(/^-\s*/, '').trim()).filter(Boolean)
  return [lead, ...items.map((item) => `- ${item}`)]
}

/** Paragraphs, bullet and numbered lists, and bold from plain model text. */
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n').flatMap(splitInlineList)
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>)
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="my-1 list-decimal space-y-0.5 pl-4">{items}</ol>
      ) : (
        <ul key={blocks.length} className="my-1 list-disc space-y-0.5 pl-4 marker:text-primary">{items}</ul>
      ),
    )
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    const bullet = /^[-•*]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet || numbered)![1])
      continue
    }
    flush()
    if (line) blocks.push(<p key={blocks.length} className="[&+p]:mt-1.5">{inline(line)}</p>)
  }
  flush()
  return <>{blocks}</>
}

/** Reveals a reply a few words at a time (whole reply within ~1.4 s), with a
 * caret. Click to show it all at once. Instant for reduced-motion users. */
export function TypedText({ text, animate, onDone }: { text: string; animate: boolean; onDone?: () => void }) {
  const words = useRef(text.split(/(\s+)/))
  const [shown, setShown] = useState(animate && !prefersReducedMotion() ? 0 : words.current.length)
  const done = shown >= words.current.length
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (done) {
      doneRef.current?.()
      return
    }
    const step = Math.max(2, Math.ceil(words.current.length / 60))
    const timer = window.setTimeout(() => setShown((n) => Math.min(words.current.length, n + step)), 22)
    return () => window.clearTimeout(timer)
  }, [shown, done])

  return (
    <div
      onClick={() => setShown(words.current.length)}
      className={done ? '' : 'cursor-pointer'}
      title={done ? undefined : 'Click to show the whole answer'}
    >
      <RichText text={words.current.slice(0, shown).join('')} />
      {!done && <span className="help-caret" aria-hidden="true" />}
    </div>
  )
}

const TOPICS: Array<[RegExp, string]> = [
  [/agent/i, 'Checking your agents'],
  [/integrat|sheet|zoho|slack|webhook|crm/i, 'Checking your integrations'],
  [/credit|billing|plan|invoice|top.?up/i, 'Checking minutes and billing'],
  [/appointment|book|callback|calendar|week/i, 'Looking at your calendar'],
  [/number|phone/i, 'Looking at your phone numbers'],
  [/call|caller|lead|contact|ask/i, 'Reading your calls'],
]

/** "What I'm doing" while a reply is on its way. The middle step follows the
 * question; the real steps arrive with the answer. */
export function ThinkingIndicator({ question }: { question: string }) {
  const topic = TOPICS.find(([re]) => re.test(question))?.[1]
  const phrases = ['Reading your workspace', ...(topic ? [topic] : []), 'Writing the answer']
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (index >= phrases.length - 1) return
    const timer = window.setTimeout(() => setIndex((i) => i + 1), 1500)
    return () => window.clearTimeout(timer)
  }, [index, phrases.length])
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-high px-3 py-2 text-xs text-text-muted" role="status" aria-live="polite">
      <span className="flex items-center gap-0.5 text-primary" aria-hidden="true">
        <span className="help-dot" />
        <span className="help-dot" style={{ animationDelay: '140ms' }} />
        <span className="help-dot" style={{ animationDelay: '280ms' }} />
      </span>
      <span key={index} className="help-status-in">{phrases[index]}…</span>
    </div>
  )
}

/** A check that draws itself inside a ring. */
export function SuccessCheck() {
  return (
    <span className="help-check-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="help-check-path" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

/** Expand / collapse glyph (not in the icon font subset). */
export function ExpandGlyph({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {expanded ? (
        <path d="M14 10l6-6M20 9V4h-5M10 14l-6 6M4 15v5h5" />
      ) : (
        <path d="M15 4h5v5M20 4l-6 6M9 20H4v-5M4 20l6-6" />
      )}
    </svg>
  )
}
