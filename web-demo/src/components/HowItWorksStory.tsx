import { useRef } from 'react'
import { Icon } from './Icon'
import { useScrollProgress } from '../lib/useScrollProgress'
import type { FeatureRow } from '../lib/marketingContent'
import arthaAvatar from '../assets/artha-avatar.webp'

/** "How it works" as a scroll story. On desktop the whole block (product screen plus a compact
 * list of the steps) pins in place for a short stretch of scrolling; scrolling advances the lit
 * step, changes the screen and fills a brass line. Nothing is spaced out, so there are no gaps.
 * On phones each step simply shows its own screen. The screens are illustrative UI with sample
 * data, not live product numbers. */
export function HowItWorksStory({ steps }: { steps: FeatureRow[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  // The block pins centred on screen. 0 when it pins, 1 when the pinned stretch runs out.
  const progress = useScrollProgress(ref, (r, vh) => {
    const bh = blockRef.current?.offsetHeight ?? 0
    return (pinTop(vh) - r.top) / Math.max(1, r.height - bh)
  })
  // The line between two steps fills while moving from one to the next; a step lights up the
  // moment the line reaches it (n steps, n - 1 segments).
  const n = steps.length
  const t = progress * n - 0.5
  const segmentFill = (i: number) => Math.min(1, Math.max(0, t - i))
  const active = Math.min(n - 1, Math.max(0, Math.floor(t)))

  // Clicking a step scrolls to the middle of its stretch of the pinned scroll.
  const goTo = (i: number) => {
    const el = ref.current
    if (!el || !window.matchMedia('(min-width: 1024px)').matches) return
    const r = el.getBoundingClientRect()
    const bh = blockRef.current?.offsetHeight ?? 0
    const travel = r.height - bh
    const top = window.scrollY + r.top - pinTop(window.innerHeight) + travel * ((i + 0.75) / steps.length)
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <div ref={ref} className="relative lg:h-[160vh]">
      <div ref={blockRef} className="grid items-center gap-10 lg:sticky lg:top-[max(7rem,calc(50vh-15rem))] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="hidden lg:block">
          <StoryScreen active={active} />
        </div>
        <ol className="relative">
          {steps.map((step, i) => {
            const state = i === active ? 'active' : i < active ? 'done' : 'next'
            return (
              <li key={step.title} onClick={() => goTo(i)} className="group relative flex gap-6 pb-12 last:pb-0 lg:cursor-pointer lg:pb-10">
                {/* the connector to the next step: grey track, brass fill */}
                {i < n - 1 && (
                  <span aria-hidden="true" className="absolute bottom-0 left-[19px] top-10 w-px bg-border">
                    <span className="absolute inset-x-0 top-0 bg-brass" style={{ height: `${segmentFill(i) * 100}%` }} />
                  </span>
                )}
                {/* The circle stays opaque so the line runs behind it; only the text dims. */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goTo(i) }}
                  aria-label={`Step ${i + 1}: ${step.title}`}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brass bg-surface font-display text-sm font-semibold text-brass transition-colors duration-300 ${
                    state === 'active' ? 'lg:bg-brass lg:text-white' : state === 'next' ? 'lg:border-border lg:text-text-muted lg:group-hover:border-brass lg:group-hover:text-brass' : ''
                  }`}
                >
                  {state === 'active' && <span aria-hidden="true" className="absolute -inset-1.5 hidden animate-ping rounded-full border border-brass/40 motion-reduce:animate-none lg:block" />}
                  {`0${i + 1}`}
                </button>
                <div className={`min-w-0 pt-1.5 transition-opacity duration-300 ${state === 'active' ? '' : 'lg:opacity-45 lg:group-hover:opacity-80'}`}>
                  <h3 className="font-display text-2xl font-semibold">{step.title}</h3>
                  <p className="mt-2 max-w-md text-base leading-relaxed text-text-muted">{step.body}</p>
                  <div className="mt-6 lg:hidden">
                    <StoryScreen active={i} only />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/** Top of the pinned block, matching its lg:top-[max(7rem,calc(50vh-15rem))] class. */
function pinTop(vh: number) {
  return Math.max(112, vh / 2 - 240)
}

/** The pinned screen. `only` renders just one panel (phones); otherwise all three crossfade. */
function StoryScreen({ active, only = false }: { active: number; only?: boolean }) {
  const panels = [<NumberPanel key="n" />, <KnowledgePanel key="k" />, <LivePanel key="l" />]
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_40px_80px_-50px_rgba(60,30,120,0.45)]">
      <div className="flex items-center gap-1.5 border-b border-border px-5 py-3" aria-hidden="true">
        <i className="h-2.5 w-2.5 rounded-full bg-border" /><i className="h-2.5 w-2.5 rounded-full bg-border" /><i className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-3 text-xs font-semibold text-text-muted">Vistrow Voice · dashboard</span>
      </div>
      {only ? (
        <div className="p-6">{panels[active]}</div>
      ) : (
        <div className="relative h-[340px]">
          {panels.map((panel, i) => (
            <div
              key={i}
              aria-hidden={i !== active}
              className={`absolute inset-0 p-6 transition-all duration-500 ${i === active ? 'translate-y-0 opacity-100' : i < active ? '-translate-y-4 opacity-0' : 'translate-y-4 opacity-0'}`}
            >
              {panel}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const label = 'text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted'

function NumberPanel() {
  return (
    <div>
      <p className={label}>Phone numbers</p>
      <div className="mt-4 rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="whitespace-nowrap font-display text-xl font-semibold tracking-tight sm:text-2xl">+91 98765 43210</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
            <Icon name="check_circle" className="text-[14px]" /> Connected
          </span>
        </div>
        <p className="mt-2 text-sm text-text-muted">Inbound calls go to Artha</p>
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border p-4">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 motion-reduce:hidden" />
          <Icon name="call_received" className="text-[18px]" />
        </span>
        <div><p className="text-sm font-semibold">Incoming call</p><p className="text-xs text-text-muted">Answered by Artha · just now</p></div>
      </div>
    </div>
  )
}

function KnowledgePanel() {
  const docs: [string, boolean][] = [['Clinic FAQ.pdf', true], ['Price list.pdf', true], ['Doctor timings.docx', false]]
  return (
    <div>
      <p className={label}>Knowledge base</p>
      <ul className="mt-4 space-y-3">
        {docs.map(([name, done]) => (
          <li key={name} className="flex items-center gap-3 rounded-2xl border border-border p-4">
            <Icon name="description" className="text-[20px] text-primary" />
            <span className="flex-1 text-sm font-semibold">{name}</span>
            {done ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success"><Icon name="check" className="text-[14px]" /> Indexed</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-brass"><Icon name="progress_activity" className="animate-spin text-[14px] motion-reduce:animate-none" /> Indexing</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-text-muted">Artha answers from your own documents.</p>
    </div>
  )
}

function LivePanel() {
  const calls: [string, string, string][] = [['हिंदी', 'Appointment booked', '0:48'], ['मराठी', 'Lead qualified', '1:12'], ['English', 'Question answered', '0:35']]
  return (
    <div>
      <div className="flex items-center gap-4">
        <img src={arthaAvatar} alt="" loading="lazy" decoding="async" className="h-12 w-12 rounded-full object-cover" />
        <div className="flex-1">
          <p className="font-display text-xl font-semibold">Artha</p>
          <p className="text-xs text-text-muted">10 Indian languages plus English</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success motion-reduce:animate-none" /> Live
        </span>
      </div>
      <p className={`${label} mt-6`}>Today’s calls</p>
      <ul className="mt-3 space-y-2">
        {calls.map(([lang, outcome, len]) => (
          <li key={outcome} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
            <span className="w-16 font-semibold">{lang}</span>
            <span className="flex-1 text-text-muted">{outcome}</span>
            <span className="tabular-nums text-text-muted">{len}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
