import { useRef } from 'react'
import { Icon } from './Icon'
import { useScrollProgress } from '../lib/useScrollProgress'
import type { FeatureRow } from '../lib/marketingContent'
import arthaAvatar from '../assets/artha-avatar.webp'

/** "How it works" as a scroll story: on desktop one product screen stays pinned while the
 * steps scroll past; the screen changes per step and a brass line fills down the steps.
 * On phones each step simply shows its own screen. The screens are illustrative UI with
 * sample data, not live product numbers. */
export function HowItWorksStory({ steps }: { steps: FeatureRow[] }) {
  const ref = useRef<HTMLDivElement>(null)
  // 0 when the steps' top reaches the middle of the screen, 1 when their bottom does
  const progress = useScrollProgress(ref, (r, vh) => (vh * 0.5 - r.top) / r.height)
  const active = Math.min(steps.length - 1, Math.floor(progress * steps.length))

  return (
    <div ref={ref} className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <StoryScreen active={active} />
        </div>
      </div>
      <ol className="relative">
        <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-6 w-px bg-border" />
        <span aria-hidden="true" className="absolute left-[19px] top-6 w-px bg-brass transition-[height] duration-150" style={{ height: `calc(${progress} * (100% - 3rem))` }} />
        {steps.map((step, i) => (
          <li key={step.title} className={`relative flex gap-6 pb-14 last:pb-0 lg:min-h-[48vh] lg:pb-0 ${i === active ? '' : 'lg:opacity-40'} transition-opacity duration-300`}>
            <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-bg font-display text-sm font-semibold transition-colors duration-300 ${i <= active ? 'border-brass text-brass' : 'border-border text-text-muted'}`}>
              {`0${i + 1}`}
            </span>
            <div className="min-w-0 pt-1.5">
              <h3 className="font-display text-2xl font-semibold">{step.title}</h3>
              <p className="mt-2 max-w-md text-base leading-relaxed text-text-muted">{step.body}</p>
              <div className="mt-6 lg:hidden">
                <StoryScreen active={i} only />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
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
