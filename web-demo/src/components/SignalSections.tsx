import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Reveal } from './Reveal'
import { ScrollTypedCall } from './ScrollTypedCall'
import { IndiaMap } from './IndiaMap'
import { TalkToArthaButton } from './MarketingBits'
import { trackMarketingCta } from '../lib/analytics'
import { GLOBAL_GREETINGS, HOME_FEATURES, LANGUAGES } from '../lib/marketingContent'

export function SignalEyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-magenta">
      <span className="h-1.5 w-1.5 rounded-full signal-grad-bg" aria-hidden="true" />
      {children}
    </span>
  )
}

const PROOFS: [string, string, string][] = [
  ['hearing', 'Interrupt her — she stops and listens', 'Talk over Artha and she stops at once, then answers what you actually asked.'],
  ['calendar_month', 'Books straight into your calendar', 'She offers a slot, confirms it, and the appointment lands in your calendar.'],
  ['send', 'Sends the lead to your CRM and WhatsApp', 'Every call ends with a summary and the lead pushed to Zoho CRM, Google Sheets or WhatsApp.'],
]

/** "Hear the difference": the Hinglish call types itself out, with three proofs beside it. */
export function LiveCallShowcase() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <SignalEyebrow>Hear the difference</SignalEyebrow>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            She switches language mid-sentence. <span className="text-text-muted">Just like your customers.</span>
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <ScrollTypedCall />
        <div className="grid gap-4">
          {PROOFS.map(([icon, title, body], i) => (
            <Reveal key={title} delayMs={i * 80}>
              <div className="signal-glass signal-tile flex gap-4 rounded-2xl p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon name={icon} className="text-[22px]" /></span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const POINTS: [string, string, string][] = [
  ['हिं+EN', 'Hinglish is the default, not a fallback', 'Real callers start a sentence in Hindi and finish it in English. Artha follows the switch mid-sentence instead of forcing the caller to pick one language and stay in it.'],
  ['ने / नी', 'Gender agreement throughout the call', 'Hindi, Marathi, Gujarati, and Punjabi verbs agree with the speaker’s gender. Most models get the first line right and drift after that. Artha stays consistent, every turn.'],
  ['बकवास', 'It knows “bakwas” means trouble', 'Frustration in an Indian call rarely arrives in textbook English. Artha reads the cues people actually use - bekaar, faltu, bakwas - and softens its tone before the caller escalates.'],
]

/** "Built for Bharat" as a bento: the map tile, three point tiles, a waveform tile, the languages strip. */
export function BharatBento() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <div className="mb-12 max-w-3xl">
          <SignalEyebrow>Built for Bharat</SignalEyebrow>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Global voice AI treats India as an edge case. <span className="signal-grad-text">We started here.</span>
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Reveal className="md:row-span-2">
          <div className="signal-glass signal-tile h-full rounded-3xl p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-muted">Ten Indian languages, one voice</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Spoken the way each city speaks</h3>
            <IndiaMap className="mt-4 max-w-[360px]" />
          </div>
        </Reveal>
        {POINTS.map(([glyph, title, body], i) => (
          <Reveal key={title} delayMs={i * 70}>
            <div className="signal-glass signal-tile h-full rounded-3xl p-6">
              <span className="signal-grad-text font-display text-3xl font-bold">{glyph}</span>
              <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
            </div>
          </Reveal>
        ))}
        <Reveal delayMs={210}>
          <div className="signal-glass signal-tile h-full rounded-3xl p-6">
            <div aria-hidden="true" className="flex h-9 items-end gap-1">
              {[40, 70, 100, 55, 85, 30, 65, 95, 45, 75, 35, 60].map((h, i) => (
                <span key={i} className="w-1.5 rounded-full signal-grad-bg motion-safe:animate-[pulse_1.8s_ease-in-out_infinite]" style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
            <h3 className="mt-4 font-display text-xl font-semibold">A voice that reacts, not just replies</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">Artha reads frustration, confusion, or excitement in your caller’s voice and shifts its own pace and warmth to match - live, mid-call, not a flat text-to-speech read.</p>
          </div>
        </Reveal>
        <Reveal delayMs={280} className="md:col-span-2 lg:col-span-3">
          <div className="signal-glass signal-tile rounded-3xl p-6 md:flex md:items-center md:justify-between md:gap-8">
            <div className="md:max-w-sm">
              <h3 className="font-display text-xl font-semibold">Ten Indian languages plus 88 more, one agent</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">From Punjabi in the north to Malayalam in the south, one agent covers them all - no separate deployment, no per-language rebuild.</p>
              <Link to="/languages" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">See every language <Icon name="arrow_forward" className="text-[16px]" /></Link>
            </div>
            <ul aria-hidden="true" className="mt-5 flex flex-wrap gap-2 md:mt-0 md:max-w-md md:justify-end">
              {LANGUAGES.map((l) => <li key={l.slug} className="rounded-full border border-border bg-surface/60 px-3 py-1.5 font-display text-sm">{l.greeting}</li>)}
              {GLOBAL_GREETINGS.map((g) => <li key={g.name} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 font-display text-sm text-text-muted">{g.greeting}</li>)}
              <li className="rounded-full signal-grad-bg px-3 py-1.5 font-display text-sm font-semibold text-white">+88 more</li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/** The platform as a bento of six tiles; the widget tile carries a waveform. */
export function PlatformBento() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <div className="mb-12 max-w-3xl">
          <SignalEyebrow>The platform</SignalEyebrow>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">One platform for every voice conversation.</h2>
        </div>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {HOME_FEATURES.map((f, i) => (
          <Reveal key={f.to} delayMs={i * 60}>
            <Link to={f.to} className="signal-glass signal-tile group flex h-full flex-col rounded-3xl p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110"><Icon name={f.icon ?? 'circle'} className="text-[22px]" /></span>
              <h3 className="mt-5 flex items-center gap-1 font-display text-xl font-semibold">
                {f.label}
                <Icon name="arrow_forward" className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.desc}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/** The closing band: the big gradient line with the orb's glow behind it. */
export function SignalClose() {
  return (
    <section className="relative isolate overflow-hidden px-5 py-24 text-center md:px-8 lg:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30 blur-[140px]" />
      <Reveal>
        <SignalEyebrow>Get started</SignalEyebrow>
        <h2 className="mx-auto mt-4 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          Put an AI agent <span className="signal-grad-text">on every call.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base text-text-muted sm:text-lg">Try Artha live in your browser, or book a walkthrough with our team.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/contact" onClick={() => trackMarketingCta('book_demo', 'home_bottom')} className="signal-grad-bg rounded-full px-8 py-3.5 text-sm font-bold text-white shadow-[0_20px_60px_-20px_rgba(168,85,247,0.8)] transition-opacity hover:opacity-90">Book a demo</Link>
          <TalkToArthaButton />
        </div>
      </Reveal>
    </section>
  )
}
