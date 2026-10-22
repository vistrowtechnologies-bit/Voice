import { useEffect, useRef, useState } from 'react'
import { preload } from 'react-dom'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Reveal } from './Reveal'
import { SectionEyebrow, TalkToArthaButton } from './MarketingBits'
import { StatTile, type StatTone } from './ui/StatTile'
import { trackMarketingCta } from '../lib/analytics'
import { pageFigures, type PageFigureData } from '../lib/pageFigures'
import type { FeatureRow, GuideSection } from '../lib/marketingContent'

// Building blocks of the /product/* template (ProductDetail.tsx). The look is
// borrowed from the dashboard on purpose: the violet bento hero, StatTile,
// rounded-3xl cards and pulsing live dots, so the site and the product read
// as one thing. Every fact shown here comes from marketingContent.ts, the
// pricing FAQ or the security page; nothing is a made-up number.

// ---------------------------------------------------------------------------
// Per-page data

interface Chip {
  label: string
  icon?: string
  live?: boolean
}

interface Callout {
  title: string
  body: string
  /** Marker position over the laptop mock-up, in % of the image box. */
  x: number
  y: number
}

interface ShowcaseCopy {
  /** Two chips floating over the hero mock-up. */
  chips: [Chip, Chip]
  /** Stat-tile strip under the hero. */
  proof: { label: string; value: string; hint: string; icon: string; tone: StatTone }[]
  /** Three numbered callouts for the second dashboard view. */
  callouts: [Callout, Callout, Callout]
}

const CALLS_CALLOUTS: ShowcaseCopy['callouts'] = [
  { title: 'Filter by channel', body: 'Phone, web and website widget calls sit in one list, one tap apart.', x: 20, y: 31 },
  { title: 'Inbound and outbound together', body: 'Each row shows the direction, the duration and the page a website call came from.', x: 48, y: 42 },
  { title: 'Sentiment and the agent', body: 'See how each call went and which agent took it, then open the transcript.', x: 82, y: 42 },
]

const AGENT_CALLOUTS: ShowcaseCopy['callouts'] = [
  { title: 'Setup checklist', body: 'Persona, voice, knowledge, channel and go live, with a tick as each is done.', x: 52, y: 42 },
  { title: 'Every setting on one page', body: 'Instructions, voice and language, knowledge and tools, conversation and after the call.', x: 38, y: 51 },
  { title: 'Talk to it in the browser', body: 'Talk now runs a test call with the saved agent and your microphone.', x: 83, y: 59 },
]

const SHOWCASE: Record<string, ShowcaseCopy> = {
  '/product/inbound': {
    chips: [
      { label: 'Live call · Hindi', live: true },
      { label: 'Appointment booked', icon: 'event_available' },
    ],
    proof: [
      { label: 'Pickup', value: '24/7', hint: 'No missed calls, no voicemail', icon: 'schedule', tone: 'primary' },
      { label: 'Languages', value: '130+', hint: 'Follows the caller if they switch', icon: 'translate', tone: 'cyan' },
      { label: 'Transcripts', value: 'Every call', hint: 'With lead fields and CRM status', icon: 'receipt_long', tone: 'success' },
      { label: 'New route', value: 'Live now', hint: 'A route works as soon as you create it', icon: 'route', tone: 'amber' },
    ],
    callouts: CALLS_CALLOUTS,
  },
  '/product/outbound': {
    chips: [
      { label: 'Campaign running', live: true },
      { label: 'Do-Not-Call checked first', icon: 'block' },
    ],
    proof: [
      { label: 'Do-Not-Call', value: 'Checked first', hint: 'Before every dial', icon: 'block', tone: 'primary' },
      { label: 'Calling window', value: 'Enforced', hint: 'Dials outside your hours are blocked', icon: 'schedule', tone: 'cyan' },
      { label: 'Retries', value: 'Your rules', hint: 'Attempts, gaps, busy and voicemail', icon: 'event_repeat', tone: 'success' },
      { label: 'Progress', value: 'Per campaign', hint: 'Connected, pending, no answer, blocked', icon: 'monitoring', tone: 'amber' },
    ],
    callouts: CALLS_CALLOUTS,
  },
  '/product/agents': {
    chips: [
      { label: 'Artha · Live', live: true },
      { label: 'Changes apply next call', icon: 'bolt' },
    ],
    proof: [
      { label: 'Languages', value: '130+', hint: 'Including 10 Indian languages and Hinglish', icon: 'translate', tone: 'primary' },
      { label: 'Builder', value: 'No code', hint: 'Persona, prompt, voice and language', icon: 'edit_note', tone: 'cyan' },
      { label: 'Changes', value: 'Next call', hint: 'Nothing to redeploy', icon: 'bolt', tone: 'success' },
      { label: 'Testing', value: 'Before launch', hint: 'Browser test call or the Testing Lab', icon: 'science', tone: 'amber' },
    ],
    callouts: AGENT_CALLOUTS,
  },
  '/product/widget': {
    chips: [
      { label: 'Browser call · no app', live: true },
      { label: 'Name and phone asked first', icon: 'badge' },
    ],
    proof: [
      { label: 'Install', value: 'One line', hint: 'Script tag or WordPress plugin', icon: 'code', tone: 'primary' },
      { label: 'Visitors', value: 'No app', hint: 'They talk in the browser', icon: 'mic', tone: 'cyan' },
      { label: 'Modes', value: 'Voice or chat', hint: 'Or both, your choice', icon: 'forum', tone: 'success' },
      { label: 'Sites', value: 'Own key', hint: 'And own call history', icon: 'key', tone: 'amber' },
    ],
    callouts: CALLS_CALLOUTS,
  },
  '/product/knowledge-base': {
    chips: [
      { label: 'Strict mode on', live: true },
      { label: 'Answers from your Q&A', icon: 'menu_book' },
    ],
    proof: [
      { label: 'Sources', value: 'Files or site', hint: 'PDF, Word, CSV, text or a website scan', icon: 'upload_file', tone: 'primary' },
      { label: 'Strict mode', value: 'On or off', hint: 'Quotes your approved answers', icon: 'lock', tone: 'cyan' },
      { label: 'Per call', value: '8,000 chars', hint: 'Approved Q&A pairs go first', icon: 'speed', tone: 'success' },
      { label: 'Updates', value: 'Next call', hint: 'No redeploy', icon: 'update', tone: 'amber' },
    ],
    callouts: [
      { title: 'Knowledge is a setup step', body: 'The checklist shows whether answers and documents are attached to the agent.', x: 52, y: 42 },
      { title: 'Knowledge and tools tab', body: 'Choose which knowledge base the agent uses; it applies from the next call.', x: 34, y: 51 },
      { title: 'Ask it a real question', body: 'Talk now runs a browser call so you can hear the answer before callers do.', x: 83, y: 59 },
    ],
  },
  '/product/integrations': {
    chips: [
      { label: 'Call completed', live: true },
      { label: 'Lead delivered', icon: 'send' },
    ],
    proof: [
      { label: 'Webhook', value: 'JSON', hint: 'Posted to any URL', icon: 'webhook', tone: 'primary' },
      { label: 'Destinations', value: 'CRM + Sheets', hint: 'Plus Slack alerts for your team', icon: 'contacts', tone: 'cyan' },
      { label: 'Delivery', value: 'Re-send', hint: 'From the call’s details', icon: 'send', tone: 'success' },
      { label: 'Status', value: 'Per card', hint: 'Last sync and any error', icon: 'verified', tone: 'amber' },
    ],
    callouts: [
      { title: 'The full transcript', body: 'Download it, or let it travel with the lead to your tools.', x: 32, y: 34 },
      { title: 'Summary and next steps', body: 'Why they called, what was agreed and what your team should do next.', x: 72, y: 36 },
      { title: 'Lead stage and channel', body: 'The fields the agent captured are saved with the call and sent on.', x: 68, y: 78 },
    ],
  },
}

// Trust facts that hold on every product page. Sources: the inbound
// "Consent and recording" control, the security page, the languages FAQ and
// the "Is every call recorded and transcribed?" FAQ.
const TRUST = [
  { icon: 'verified_user', title: 'Consent and recording, your call', body: 'Require spoken consent, switch recording on or off and set how long records are kept.' },
  { icon: 'translate', title: '130+ languages', body: 'Hindi, Hinglish and 9 other Indian languages included. The agent follows the caller.' },
  { icon: 'devices', title: 'Phone and website', body: 'The same agent can answer your number and the call button on your site.' },
  { icon: 'receipt_long', title: 'Every call logged', body: 'A transcript for every call, plus the lead fields captured and the audio if recording is on.' },
]

// The four questions that stop a buyer. Answers are worded from the pricing
// FAQ, the agents FAQ and the knowledge base copy. No prices on purpose.
const OBJECTIONS = [
  {
    icon: 'payments',
    q: 'What does it cost?',
    a: 'Usage is measured in minutes of conversation, and the voice and model you choose change how quickly minutes are used. Telephony is billed separately by the provider you connect.',
    to: '/pricing',
    link: 'How pricing works',
  },
  {
    icon: 'timer',
    q: 'How much setup is it?',
    a: 'No code. Set the persona, prompt, voice and language, test it in the browser, then publish. Later changes apply from the next call.',
    to: '/help/agents/create-and-edit-agent',
    link: 'Create an agent',
  },
  {
    icon: 'swap_calls',
    q: 'Can a person take over?',
    a: 'On phone calls the agent can dial in the colleague you set and stay on until they answer. Website calls take a callback request instead.',
    to: '/help/agents/agent-functions-and-transfer',
    link: 'Functions and transfer',
  },
  {
    icon: 'help',
    q: 'What if it does not know?',
    a: 'With strict mode on, it quotes your approved answers and says it will check with the team when something is not covered, rather than guessing.',
    to: '/product/knowledge-base',
    link: 'Knowledge base',
  },
]

// Owner rule: no vendor names on the site. One telephony mention in the
// shared copy is mapped out here until the source text changes.
export function withoutVendorNames(text: string): string {
  return text.replace(/\s*\(EnableX today\)/g, '')
}

// ---------------------------------------------------------------------------
// Small pieces

const BOOK_DEMO_CLASS =
  'inline-flex items-center justify-center rounded-full border border-border bg-surface/70 px-6 py-3 text-sm font-bold text-text backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const TALK_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

function BookDemoLink({ placement, className = BOOK_DEMO_CLASS }: { placement: string; className?: string }) {
  return (
    <Link to="/contact" onClick={() => trackMarketingCta('book_demo', placement)} className={className}>
      Book a demo
    </Link>
  )
}

/** "No signup needed · 5 free calls · 130+ languages", the CTA band's own wording. */
function RiskReducers({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted ${className}`}>
      {['No signup needed', '5 free calls', '130+ languages'].map((item) => (
        <li key={item} className="flex items-center gap-1.5">
          <Icon name="check_circle" className="text-[16px] text-success" />
          {item}
        </li>
      ))}
    </ul>
  )
}

function LiveDot({ className = 'bg-success' }: { className?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${className}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${className}`} />
    </span>
  )
}

// Fixed heights (not random) so the server render and hydration agree.
const WAVE = [40, 75, 55, 95, 60, 80, 45, 70, 35, 85, 50, 65]

function Waveform({ bar = 'bg-gradient-to-t from-primary to-magenta', className = 'h-4' }: { bar?: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex items-center gap-[3px] ${className}`}>
      {WAVE.map((h, i) => (
        <span
          key={i}
          className={`vv-wave-bar w-[3px] rounded-full ${bar}`}
          style={{ height: `${h}%`, animationDelay: `${(i % 6) * 110}ms` }}
        />
      ))}
    </span>
  )
}

/** Keyframes the template needs that index.css does not have. */
function ShowcaseStyles() {
  return (
    <style>{`
@keyframes vv-wave { 0%, 100% { transform: scaleY(0.45); } 50% { transform: scaleY(1); } }
@keyframes vv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@media (prefers-reduced-motion: no-preference) {
  .vv-wave-bar { animation: vv-wave 1.4s ease-in-out infinite; transform-origin: center; }
  .vv-float { animation: vv-float 6s ease-in-out infinite; }
}
.vv-lift { transition: transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2), box-shadow 260ms ease, border-color 260ms ease; }
.vv-lift:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); box-shadow: 0 24px 44px -28px color-mix(in srgb, var(--color-primary) 70%, transparent); }
@media (prefers-reduced-motion: reduce) { .vv-lift:hover { transform: none; } }
`}</style>
  )
}

function srcSetFor(figure: PageFigureData): string | undefined {
  if (figure.width <= 800) return undefined
  return `${figure.src.replace(/\.webp$/, '-800.webp')} 800w, ${figure.src} ${figure.width}w`
}

/** A product image with no caption box: hero, bento and tour visuals. */
function Shot({ figure, sizes, className = '', eager = false }: { figure: PageFigureData; sizes: string; className?: string; eager?: boolean }) {
  return (
    <img
      src={figure.src}
      srcSet={srcSetFor(figure)}
      sizes={sizes}
      alt={figure.alt}
      width={figure.width}
      height={figure.height}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding={eager ? 'sync' : 'async'}
      className={`h-auto w-full ${className}`}
    />
  )
}

/** A product image in a framed card with its caption (section visuals). */
function FigureCard({ figure, sizes, className = '' }: { figure: PageFigureData; sizes: string; className?: string }) {
  const portrait = figure.height > figure.width
  return (
    <figure className={`overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-40px_rgba(76,29,149,0.55)] ${className}`}>
      <div className={`bg-[#f4f1fb] ${portrait ? 'px-6 pt-6 sm:px-10 sm:pt-8' : 'p-3 sm:p-4'}`}>
        <Shot figure={figure} sizes={sizes} className={portrait ? 'mx-auto max-w-[420px]' : 'rounded-xl'} />
      </div>
      <figcaption className="border-t border-border px-5 py-3 text-xs leading-relaxed text-text-muted">{figure.caption}</figcaption>
    </figure>
  )
}

function SectionHead({ eyebrow, title, intro, className = '' }: { eyebrow: string; title: string; intro?: string; className?: string }) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {intro && <p className="mt-3 text-text-muted">{intro}</p>}
    </div>
  )
}

function ItemLink({ to, label }: { to?: string; label?: string }) {
  if (!to || !label) return null
  return (
    <Link
      to={to}
      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline"
    >
      {label}
      <Icon name="arrow_forward" className="text-[16px]" />
    </Link>
  )
}

function SectionNote({ note }: { note?: string }) {
  if (!note) return null
  return (
    <p className="mt-6 flex gap-3 rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-5 text-sm leading-relaxed text-text">
      <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-cyan" />
      <span>{note}</span>
    </p>
  )
}

const stripStepNumber = (title: string) => title.replace(/^\d+\.\s*/, '')

// ---------------------------------------------------------------------------
// Sections

export function ShowcaseHero({
  route,
  eyebrow,
  title,
  subhead,
  ctaRef,
}: {
  route: string
  eyebrow: string
  title: string
  subhead: string
  ctaRef?: React.Ref<HTMLDivElement>
}) {
  const hero = pageFigures(route, 'showcase-hero')[0]
  const copy = SHOWCASE[route]
  const sizes = '(min-width: 1400px) 760px, (min-width: 1024px) 56vw, calc(100vw - 40px)'
  // Ask for the LCP image from the document head instead of waiting for the
  // body parse to reach it.
  if (hero) {
    preload(hero.src, { as: 'image', fetchPriority: 'high', imageSrcSet: srcSetFor(hero), imageSizes: sizes })
  }

  return (
    <section className="relative overflow-hidden">
      <ShowcaseStyles />
      {/* Soft violet glow like the dashboard's hero card, kept behind the art. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 top-0 h-[520px] w-[620px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[18%] top-[45%] h-[300px] w-[380px] rounded-full bg-magenta/15 blur-[110px]" />
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-8 md:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:pb-14 lg:pt-12">
        <div className="max-w-xl">
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">{subhead}</p>
          <div ref={ctaRef} className="mt-8 flex flex-wrap gap-3">
            <TalkToArthaButton className={TALK_CLASS} />
            <BookDemoLink placement="product_hero" />
          </div>
          <RiskReducers className="mt-5" />
        </div>

        {hero && (
          // From lg the laptop bleeds past the column into the page gutter so
          // the dashboard reads at a useful size next to the headline.
          <div className="relative min-[1400px]:w-[110%]">
            <Shot figure={hero} sizes={sizes} eager className="relative" />
            {copy && (
              <>
                <span className="vv-float absolute left-0 top-[10%] flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3.5 py-2 text-xs font-bold text-text shadow-lg backdrop-blur sm:left-[-2%] sm:text-sm">
                  <LiveDot />
                  {copy.chips[0].label}
                  <Waveform />
                </span>
                <span
                  className="vv-float absolute bottom-[14%] right-0 flex items-center gap-2 rounded-2xl border border-border bg-surface/90 px-3.5 py-2 text-xs font-bold text-text shadow-lg backdrop-blur sm:right-[-1%] sm:text-sm"
                  style={{ animationDelay: '1.4s' }}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
                    <Icon name={copy.chips[1].icon ?? 'check_circle'} className="text-[16px]" />
                  </span>
                  {copy.chips[1].label}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export function ProofStrip({ route }: { route: string }) {
  const copy = SHOWCASE[route]
  if (!copy) return null
  return (
    <section className="mx-auto max-w-7xl px-5 md:px-8" aria-label="At a glance">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {copy.proof.map((tile, i) => (
          <Reveal key={tile.label} delayMs={i * 60} className="h-full [&>div]:h-full">
            <StatTile label={tile.label} value={tile.value} hint={tile.hint} icon={tile.icon} tone={tile.tone} />
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/** The page's four features as a dashboard-style bento with one product visual. */
export function FeatureBento({ route, features }: { route: string; features: FeatureRow[] }) {
  const visual = [...pageFigures(route, 'hero'), ...pageFigures(route, 'showcase-feature')][0]
  const portrait = visual ? visual.height > visual.width : false
  // Three shapes on a 12-column grid. Portrait art: a tall 4-column cell
  // beside 2x2 cards. Very wide strips (a dashboard panel): full width on
  // top, four cards below. Anything else: a 7-column stage plus a stack.
  const wide = visual ? visual.width / visual.height > 2.2 : false
  const layout = portrait
    ? { visual: 'lg:col-span-4 lg:row-span-2', lead: 'lg:col-span-4', rest: ['lg:col-span-4'] }
    : wide
      ? { visual: 'lg:col-span-12', lead: 'lg:col-span-3', rest: ['lg:col-span-3'] }
      : { visual: 'lg:col-span-7 lg:row-span-2', lead: 'lg:col-span-5', rest: ['lg:col-span-5', 'lg:col-span-6'] }
  const [lead, ...rest] = features

  const card = (f: FeatureRow, extra = '') => (
    <div key={f.title} className={`vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-6 ${extra}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon name={f.icon} className="text-[22px]" />
      </span>
      <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.body}</p>
    </div>
  )

  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {visual && (
          <Reveal className={`h-full sm:col-span-2 ${layout.visual}`}>
            <figure className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-[#f4f1fb]">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-[90px]" />
              <div className={`relative flex flex-1 items-center justify-center ${portrait ? 'px-4 pt-4' : 'p-4 sm:p-6'}`}>
                <Shot
                  figure={visual}
                  sizes={
                    portrait
                      ? '(min-width: 1024px) 380px, calc(100vw - 40px)'
                      : wide
                        ? '(min-width: 1280px) 1170px, calc(100vw - 88px)'
                        : '(min-width: 1280px) 700px, (min-width: 1024px) 56vw, calc(100vw - 40px)'
                  }
                  className={portrait ? 'max-w-[400px]' : 'rounded-xl shadow-[0_20px_40px_-24px_rgba(76,29,149,0.6)]'}
                />
              </div>
              <figcaption className="relative border-t border-[#e4def2] bg-white/70 px-5 py-3 text-xs leading-relaxed text-[#5d5776]">
                {visual.caption}
              </figcaption>
            </figure>
          </Reveal>
        )}

        {lead && (
          <Reveal delayMs={60} className={`h-full ${layout.lead}`}>
            {/* The lead feature borrows the dashboard's violet hero tile. */}
            <div className="bento-hero relative flex h-full flex-col overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                <Icon name={lead.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-bold">{lead.title}</h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-white/85">{lead.body}</p>
              <div className="mt-auto pt-8">
                <Waveform bar="bg-white/70" className="h-10" />
              </div>
            </div>
          </Reveal>
        )}

        {rest.map((f, i) => (
          <Reveal
            key={f.title}
            delayMs={120 + i * 60}
            className={`h-full ${layout.rest[Math.min(i, layout.rest.length - 1)]}`}
          >
            {card(f)}
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/** Full-width violet band: the trust facts plus a CTA, mid-page. */
export function TrustBand() {
  return (
    <section className="px-5 md:px-8">
      <div className="bento-hero relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan/25 blur-[100px]" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/75">Built to be trusted on a call</span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">
              Hear it on a real call before you decide.
            </h2>
            <p className="mt-3 max-w-md text-white/80">
              Artha answers in your language, works on your number and your website, and leaves a record of every call.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <TalkToArthaButton className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4c1d95] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" />
              <BookDemoLink
                placement="product_trust_band"
                className="inline-flex items-center justify-center rounded-full border border-white/35 bg-white/10 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TRUST.map((t, i) => (
              <Reveal key={t.title} delayMs={i * 70} className="h-full">
                <div className="h-full rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                  <Icon name={t.icon} className="text-[22px] text-white" />
                  <h3 className="mt-3 font-display text-base font-semibold text-white">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/80">{t.body}</p>
                </div>
              </Reveal>
            ))}
            <Link
              to="/security"
              className="inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-4 hover:underline sm:col-span-2"
            >
              How call data is handled
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/** "How it works" as a numbered timeline: horizontal on desktop, vertical on phones. */
export function StepTimeline({ route, section }: { route: string; section: GuideSection }) {
  const steps = section.items
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-20">
      <Reveal>
        <SectionHead eyebrow={section.eyebrow} title={section.title} intro={section.intro} />
      </Reveal>
      <div className="relative mt-12">
        {/* Connecting line: vertical on phones, horizontal from lg. */}
        <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-0.5 bg-gradient-to-b from-primary via-magenta to-cyan lg:hidden" />
        <span aria-hidden="true" className="absolute left-6 right-6 top-[23px] hidden h-0.5 bg-gradient-to-r from-primary via-magenta to-cyan lg:block" />
        <ol className={`relative grid gap-8 ${steps.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} lg:gap-6`}>
          {steps.map((step, i) => (
            <li key={step.title} className="relative pl-16 lg:pl-0">
              <Reveal delayMs={i * 90}>
                <span className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.9)] ring-4 ring-bg lg:relative">
                  {i + 1}
                </span>
                <div className="lg:mt-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                    <Icon name={step.icon} className="text-[14px] text-primary" />
                    Step {i + 1}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    <span className="sr-only">{i + 1}. </span>
                    {stripStepNumber(step.title)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{withoutVendorNames(step.body)}</p>
                  <ItemLink to={step.to} label={step.link} />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
      <SectionNote note={section.note} />
      {pageFigures(route, section.title).map((figure) => (
        <Reveal key={figure.src} className="mx-auto mt-12 max-w-4xl">
          <FigureCard figure={figure} sizes="(min-width: 936px) 896px, calc(100vw - 40px)" />
        </Reveal>
      ))}
    </section>
  )
}

/** A guide section: text and a product visual side by side when the page has
 * one for it, otherwise a varied card grid with one highlighted card. */
export function GuideBlock({ route, section, flip }: { route: string; section: GuideSection; flip: boolean }) {
  const [visual, ...more] = pageFigures(route, section.title)

  if (visual) {
    const portrait = visual.height > visual.width
    return (
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <div className={`grid items-start gap-10 lg:gap-14 ${portrait ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]' : 'lg:grid-cols-2'}`}>
          <div className={flip ? 'lg:order-2' : ''}>
            <Reveal>
              <SectionHead eyebrow={section.eyebrow} title={section.title} intro={section.intro} />
            </Reveal>
            <ul className={`mt-8 grid gap-x-8 ${portrait ? 'sm:grid-cols-2' : ''}`}>
              {section.items.map((item, i) => (
                <li key={item.title} className="border-t border-border py-5">
                  <Reveal delayMs={(i % 3) * 60} className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Icon name={item.icon} className="text-[20px]" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-semibold">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{withoutVendorNames(item.body)}</p>
                      <ItemLink to={item.to} label={item.link} />
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
          <Reveal className={`lg:sticky lg:top-28 ${flip ? 'lg:order-1' : ''}`}>
            <FigureCard
              figure={visual}
              sizes={portrait ? '(min-width: 1024px) 420px, calc(100vw - 40px)' : '(min-width: 1280px) 600px, (min-width: 1024px) 46vw, calc(100vw - 40px)'}
            />
          </Reveal>
        </div>
        <SectionNote note={section.note} />
        {more.map((figure) => (
          <Reveal key={figure.src} className="mx-auto mt-10 max-w-4xl">
            <FigureCard figure={figure} sizes="(min-width: 936px) 896px, calc(100vw - 40px)" />
          </Reveal>
        ))}
      </section>
    )
  }

  const cols = section.items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <Reveal>
        <SectionHead eyebrow={section.eyebrow} title={section.title} intro={section.intro} className="mb-10" />
      </Reveal>
      <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
        {section.items.map((item, i) => (
          <Reveal key={item.title} delayMs={(i % 3) * 70} className="h-full">
            <div
              className={`vv-lift relative flex h-full flex-col overflow-hidden rounded-3xl border p-6 ${
                i === 0
                  ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface'
                  : 'border-border bg-surface'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  i === 0 ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
                }`}
              >
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{withoutVendorNames(item.body)}</p>
              {item.to && item.link && (
                <div className="mt-auto">
                  <ItemLink to={item.to} label={item.link} />
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
      <SectionNote note={section.note} />
      {more.map((figure) => (
        <Reveal key={figure.src} className="mx-auto mt-10 max-w-4xl">
          <FigureCard figure={figure} sizes="(min-width: 936px) 896px, calc(100vw - 40px)" />
        </Reveal>
      ))}
    </section>
  )
}

/** The second dashboard view with three numbered callouts. */
export function DashboardTour({ route }: { route: string }) {
  const view = pageFigures(route, 'showcase-dashboard')[0]
  const copy = SHOWCASE[route]
  if (!view || !copy) return null
  return (
    <section className="relative overflow-hidden py-14 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/12 blur-[130px]" />
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <SectionHead
            eyebrow="See it in the dashboard"
            title="The same screens your team will use."
            intro="These are views of the real Vistrow Voice dashboard, with sample data."
          />
        </Reveal>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)]">
          <Reveal className="relative">
            <Shot figure={view} sizes="(min-width: 1280px) 800px, (min-width: 1024px) 62vw, calc(100vw - 40px)" />
            {copy.callouts.map((c, i) => (
              <span
                key={c.title}
                aria-hidden="true"
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-primary to-magenta text-xs font-bold text-white shadow-[0_0_0_4px_rgba(255,255,255,0.9),0_8px_20px_-6px_rgba(124,58,237,0.9)] sm:h-8 sm:w-8 sm:text-sm"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
              >
                <span className="absolute inset-0 rounded-full bg-primary/50 motion-safe:animate-ping" />
                <span className="relative">{i + 1}</span>
              </span>
            ))}
          </Reveal>
          <ol className="grid gap-4">
            {copy.callouts.map((c, i) => (
              <li key={c.title}>
                <Reveal delayMs={i * 80} className="vv-lift flex gap-4 rounded-3xl border border-border bg-surface p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-magenta text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{c.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/** Four buyer objections, answered in plain words, then the CTA again. */
export function Objections({ route }: { route: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <Reveal>
        <SectionHead eyebrow="Before you decide" title="The questions buyers ask first." className="mb-10" />
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2">
        {OBJECTIONS.map((o, i) => (
          <Reveal key={o.q} delayMs={(i % 2) * 70} className="h-full">
            <div className="vv-lift flex h-full gap-5 rounded-3xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon name={o.icon} className="text-[22px]" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-display text-lg font-semibold">{o.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{o.a}</p>
                {o.to !== route && <ItemLink to={o.to} label={o.link} />}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] via-surface to-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-display text-xl font-bold">Still deciding? Ask Artha yourself.</p>
            <RiskReducers className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-3">
            <TalkToArthaButton className={TALK_CLASS} />
            <BookDemoLink placement="product_objections" />
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export function WorksWithRow({ tools }: { tools: string[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-surface/60 px-6 py-7 sm:flex-row sm:justify-between">
        <SectionEyebrow>Works with</SectionEyebrow>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {tools.map((tool) => (
            <span key={tool} className="rounded-full border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-text-muted">
              {tool}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Phones only: a bottom bar with the primary CTA once the hero buttons have
 * scrolled away, hidden again when the closing CTA band comes into view.
 * Leaves the bottom-right corner free for the site's own call widget. */
export function MobileStickyCta({ heroCtaRef, endRef }: { heroCtaRef: React.RefObject<HTMLDivElement | null>; endRef: React.RefObject<HTMLDivElement | null> }) {
  const [pastHero, setPastHero] = useState(false)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observers: IntersectionObserver[] = []
    if (heroCtaRef.current) {
      const o = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0))
      o.observe(heroCtaRef.current)
      observers.push(o)
    }
    if (endRef.current) {
      const o = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting || e.boundingClientRect.top < 0))
      o.observe(endRef.current)
      observers.push(o)
    }
    return () => observers.forEach((o) => o.disconnect())
  }, [heroCtaRef, endRef])

  const shown = pastHero && !atEnd
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 py-3 pl-4 pr-[92px] backdrop-blur-xl transition-[transform,visibility] duration-300 lg:hidden ${
        shown ? 'visible translate-y-0' : 'invisible translate-y-full'
      }`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Primary CTA only: the sticky site header already carries "Book a demo". */}
      <TalkToArthaButton className="flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(147,51,234,0.8)]" />
    </div>
  )
}

/** Wrapper so ProductDetail can hand refs to the hero and the end sentinel. */
export function useStickyRefs() {
  const heroCtaRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  return { heroCtaRef, endRef }
}
