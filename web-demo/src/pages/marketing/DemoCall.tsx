import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import arthaAvatar from '../../assets/artha-avatar.webp'
import { DEMO_CALLS } from '../../lib/seoExpansionContent'
import {
  BOOK_DEMO_CLASS,
  BookDemoLink,
  FeatureList,
  LiveDot,
  ObjectionCards,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TALK_CLASS,
  Timeline,
  TrustBand,
  Waveform,
  useStickyRefs,
} from '../../components/showcase'
import { NotFound } from './NotFound'
import { W4_AGENT_LANGUAGE, W4_CALL_SUMMARY } from './premiumW4Visuals'

const faqJsonLd = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
})

const STEP_ICONS = ['call', 'forum', 'menu_book', 'task_alt']
const CONFIGURE_ICONS = ['library_books', 'record_voice_over', 'tune', 'hub']
const OUTPUT_HEADING = 'What the team receives after the call.'
const CONFIGURE_HEADING = 'Setting up a call like this.'

// Premium layout (showcase kit): split hero with the transcript sample as the
// product visual, the call brief as tiles, the caller's experience as a
// timeline, the violet trust band, the CRM-ready output beside a saved call
// summary, the setup beside the agent page, related pages, objections, FAQ.
export function DemoCall() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const call = DEMO_CALLS.find((item) => item.slug === slug)
  if (!call) return <NotFound />
  const route = `/demo-calls/${call.slug}`

  const transcriptCard = (
    <div className="relative mx-auto w-full max-w-[600px] lg:ml-auto">
      <div className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[0_40px_80px_-48px_rgba(76,29,149,0.7)]">
        <div className="bento-hero flex items-center gap-3 px-5 py-4">
          <img src={arthaAvatar} alt="" aria-hidden="true" decoding="async" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/40" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-white">Artha</p>
            <p className="truncate text-xs text-white/80">{call.language}</p>
          </div>
          <Waveform bar="bg-white/70" className="h-6" />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionEyebrow>Transcript sample</SectionEyebrow>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-high px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
              <LiveDot />
              Sample call
            </span>
          </div>
          <p className="mt-2 text-xs text-text-muted">A representative script written for this page. It is not a recording of a real customer.</p>
          <div className="mt-5 space-y-3">
            {call.transcript.map((turn, index) => (
              <div key={`${turn.speaker}-${index}`} className={`flex ${turn.speaker === 'Caller' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    turn.speaker === 'Caller' ? 'rounded-br-sm bg-gradient-to-br from-primary to-primary-dark text-white' : 'rounded-bl-sm border border-border bg-surface-high text-text'
                  }`}
                >
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${turn.speaker === 'Caller' ? 'text-white/75' : 'text-text-muted'}`}>{turn.speaker}</p>
                  <p className="mt-0.5 text-sm leading-relaxed">{turn.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="vv-float absolute -bottom-4 left-4 flex items-center gap-2 rounded-2xl border border-border bg-surface/95 px-3.5 py-2 text-xs font-bold text-text shadow-lg backdrop-blur sm:left-[-4%] sm:text-sm">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
          <Icon name="task_alt" className="text-[16px]" />
        </span>
        Saved with a summary and lead fields
      </span>
    </div>
  )

  const outputCard = (
    <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionEyebrow>CRM-ready output</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">{OUTPUT_HEADING}</h2>
        </div>
        <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-bold text-cyan">Example only</span>
      </div>
      <div className="mt-7 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-high">
        {call.fields.map((field) => (
          <div key={field.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr] sm:items-center">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{field.label}</p>
            <p className="font-semibold sm:text-right">{field.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 flex gap-2 text-sm leading-relaxed text-text-muted">
        <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-primary" />
        Public demo pages use representative scripts. Real recordings should only be published with consent.
      </p>
    </div>
  )

  return (
    <MarketingLayout>
      <Seo title={`${call.title} | Vistrow Voice`} description={call.description} path={route} jsonLd={faqJsonLd(call.faqs)} />

      <SplitHero
        eyebrow="Demo call"
        title={call.title}
        subhead={call.description}
        media={transcriptCard}
        ctaRef={heroCtaRef}
        actions={
          <>
            <TalkToArthaButton className={TALK_CLASS} />
            <BookDemoLink placement="demo_call_hero" />
            <Link to="/solutions/real-estate" className={BOOK_DEMO_CLASS}>
              See real estate workflow
            </Link>
          </>
        }
      />

      {/* Call brief: the scenario, language and outcome at a glance. */}
      <section className="mx-auto max-w-7xl px-5 md:px-8" aria-label="Call brief">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
          <Reveal className="h-full">
            <div className="bento-hero relative h-full overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
              <span className="text-xs font-bold uppercase tracking-widest text-white/75">Call brief</span>
              <h2 className="mt-3 font-display text-2xl font-bold">{call.scenario}</h2>
            </div>
          </Reveal>
          <Reveal delayMs={60} className="h-full">
            <div className="vv-lift flex h-full gap-4 rounded-3xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon3D name="translate" className="text-[22px]" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Language</p>
                <p className="mt-1 font-semibold">{call.language}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delayMs={120} className="h-full">
            <div className="vv-lift flex h-full gap-4 rounded-3xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
                <Icon3D name="task_alt" className="text-[22px]" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Outcome</p>
                <p className="mt-1 font-semibold">{call.outcome}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Timeline
        eyebrow="What the caller experiences"
        title="The call, step by step."
        intro={call.whyItMatters}
        steps={call.callerExperience.map((step, i) => ({ icon: STEP_ICONS[i % STEP_ICONS.length], title: step.title, body: step.body }))}
      />

      <TrustBand placement="demo_call_trust_band" />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={W4_CALL_SUMMARY(OUTPUT_HEADING)} className="">
          <Reveal>{outputCard}</Reveal>
        </SplitRow>
      </section>

      <div className="bg-surface-high/40">
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <SplitRow figure={W4_AGENT_LANGUAGE(CONFIGURE_HEADING)} flip className="">
            <Reveal>
              <SectionHead
                eyebrow="What you configure"
                title={CONFIGURE_HEADING}
                intro="These are the dashboard settings behind the sample. Your own agent uses your project facts, hours and rules."
              />
            </Reveal>
            <FeatureList items={call.configure.map((item, i) => ({ ...item, icon: CONFIGURE_ICONS[i % CONFIGURE_ICONS.length] }))} />
          </SplitRow>
        </section>
      </div>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead eyebrow="Go deeper" title="Related pages for this scenario." className="mb-8" />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {call.related.map((item, i) => (
            <Reveal key={item.to} delayMs={(i % 2) * 60} className="h-full">
              <Link
                to={item.to}
                className={`vv-lift group flex h-full items-center justify-between gap-3 rounded-3xl border p-6 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <span>
                  <span className="block font-semibold text-text">{item.label}</span>
                  <span className="mt-1 block text-sm text-text-muted">{item.body}</span>
                </span>
                <Icon name="arrow_forward" className="shrink-0 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <ObjectionCards route={route} placement="demo_call_objections" />

      <FaqSection key={call.slug} items={call.faqs} />
      <div ref={endRef} />
      <CTABand title="Want this with your own call script?" subtitle="Send us your industry, language, lead fields, and CRM destination, and we’ll configure a live test flow." />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
