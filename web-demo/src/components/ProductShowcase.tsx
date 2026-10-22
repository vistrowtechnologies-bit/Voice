import { pageFigures } from '../lib/pageFigures'
import type { FeatureRow, GuideSection } from '../lib/marketingContent'
import {
  AGENT_CALLOUTS,
  Bento,
  CALL_DETAIL_CALLOUTS,
  CALLS_CALLOUTS,
  DashboardCallouts,
  FeatureRows,
  ObjectionCards,
  ProofStrip as KitProofStrip,
  SplitHero,
  StickyCta,
  Timeline,
  TrustBand as KitTrustBand,
  withoutVendorNames,
  type Callout,
  type HeroChip,
  type ProofTile,
} from './showcase'

// The /product/* template (ProductDetail.tsx), composed from the showcase
// design kit in components/showcase/. This file holds the per-page data the
// kit needs: hero chips, proof tiles and dashboard callouts. Every fact shown
// comes from marketingContent.ts, the pricing FAQ or the security page;
// nothing is a made-up number.

export { WorksWithRow, useStickyRefs, withoutVendorNames } from './showcase'

// ---------------------------------------------------------------------------
// Per-page data

interface ShowcaseCopy {
  /** Two chips floating over the hero mock-up. */
  chips: [HeroChip, HeroChip]
  /** Stat-tile strip under the hero. */
  proof: ProofTile[]
  /** Three numbered callouts for the second dashboard view. */
  callouts: Callout[]
}

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
    callouts: CALL_DETAIL_CALLOUTS,
  },
}

// ---------------------------------------------------------------------------
// Sections, each a thin wrapper that feeds the kit this page's data.

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
  return (
    <SplitHero
      eyebrow={eyebrow}
      title={title}
      subhead={subhead}
      visual={pageFigures(route, 'showcase-hero')[0]}
      chips={SHOWCASE[route]?.chips}
      placement="product_hero"
      ctaRef={ctaRef}
    />
  )
}

export function ProofStrip({ route }: { route: string }) {
  const copy = SHOWCASE[route]
  return copy ? <KitProofStrip tiles={copy.proof} /> : null
}

/** The page's four features as a dashboard-style bento with one product visual. */
export function FeatureBento({ route, features }: { route: string; features: FeatureRow[] }) {
  const visual = [...pageFigures(route, 'hero'), ...pageFigures(route, 'showcase-feature')][0]
  return <Bento visual={visual} items={features} />
}

export function TrustBand() {
  return <KitTrustBand placement="product_trust_band" />
}

/** "How it works" as a numbered timeline. */
export function StepTimeline({ route, section }: { route: string; section: GuideSection }) {
  return (
    <Timeline
      eyebrow={section.eyebrow}
      title={section.title}
      intro={section.intro}
      steps={section.items.map((step) => ({ ...step, body: withoutVendorNames(step.body) }))}
      note={section.note}
      figures={pageFigures(route, section.title)}
    />
  )
}

/** A guide section: text beside its product visual, or a card grid. */
export function GuideBlock({ route, section, flip }: { route: string; section: GuideSection; flip: boolean }) {
  return (
    <FeatureRows
      eyebrow={section.eyebrow}
      title={section.title}
      intro={section.intro}
      items={section.items.map((item) => ({ ...item, body: withoutVendorNames(item.body) }))}
      note={section.note}
      figures={pageFigures(route, section.title)}
      flip={flip}
    />
  )
}

/** The second dashboard view with three numbered callouts. */
export function DashboardTour({ route }: { route: string }) {
  const view = pageFigures(route, 'showcase-dashboard')[0]
  const copy = SHOWCASE[route]
  if (!view || !copy) return null
  return <DashboardCallouts view={view} callouts={copy.callouts} />
}

/** Four buyer objections, answered in plain words, then the CTA again. */
export function Objections({ route }: { route: string }) {
  return <ObjectionCards route={route} placement="product_objections" />
}

export { StickyCta as MobileStickyCta }
