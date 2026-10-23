import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { INTEGRATIONS_PAGE, INTEGRATION_DIRECTORY } from '../../lib/marketingContent'
import {
  FeatureRows,
  ObjectionCards,
  Reveal,
  SectionHead,
  Shot,
  SplitHero,
  StickyCta,
  Timeline,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'
import { INTEGRATIONS_CALLS, INTEGRATIONS_HERO, INTEGRATIONS_SUMMARY } from './premium-w5/visuals'

// Visuals beside the guide sections, by section title.
const SECTION_FIGURES: Record<string, typeof INTEGRATIONS_SUMMARY[]> = {
  'Five connections you can set up today.': [INTEGRATIONS_SUMMARY],
}

// The named counterpart to /product/integrations: that page sells the
// capability, this one answers "is MY tool on the list?" - the actual
// question a buyer has. Entries marked viaWebhook are honestly labelled
// rather than dressed up as native connectors.
//
// Premium template (showcase kit): split hero with a finished call, the Slack
// app beside a calls view, the directory grid, the setup steps as a timeline,
// guide sections beside their visuals, the violet trust band, webhook and API
// cards, objections, FAQ and the CTA band.
export function IntegrationsDirectory() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const slackInstallUrl =
    'https://slack.com/oauth/v2/authorize?client_id=11837090508608.11806860695974&scope=incoming-webhook&user_scope='
  const [howItWorks, ...guideSections] = INTEGRATIONS_PAGE.guideSections

  return (
    <MarketingLayout>
      <Seo
        title="Integrations - Vistrow Voice"
        description="Connect Vistrow Voice to your CRM, Slack, Google Sheets, Zapier, n8n, Make, or any endpoint that accepts a webhook. Every qualified lead and transcript, delivered automatically."
        path="/integrations"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: INTEGRATIONS_PAGE.faqs.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />

      <SplitHero
        eyebrow="Integrations"
        title="Every lead, in the tools you already use."
        subhead={
          <>
            The moment a call qualifies a lead, Vistrow Voice pushes it - with the full transcript and
            outcome - wherever your team works.
          </>
        }
        visual={INTEGRATIONS_HERO}
        chips={[
          { label: 'Call completed', live: true },
          { label: 'Lead delivered', icon: 'send' },
        ]}
        placement="integrations_hero"
        ctaRef={heroCtaRef}
      />

      <section className="mx-auto max-w-7xl px-5 pb-10 pt-6 md:px-8">
        <Reveal className="mb-10">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="bento-hero relative overflow-hidden rounded-3xl p-6 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)] sm:p-8 lg:col-span-7">
              <span className="text-xs font-bold uppercase tracking-widest text-white/75">Native Slack app</span>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Send qualified Vistrow Voice leads into Slack.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85">
                Connect once, choose a channel, and every qualified lead lands in Slack with the
                caller details, source, language, agent, outcome, summary, and transcript context
                your team needs for fast follow-up.
              </p>
              <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-white/75">
                  How to install
                </p>
                <ol className="mt-3 space-y-2 text-sm leading-relaxed text-white/85">
                  <li>1. In Vistrow Voice, open Dashboard → Integrations.</li>
                  <li>2. Click Connect Slack and pick the workspace/channel.</li>
                  <li>3. Use Test Slack to confirm your lead alert lands.</li>
                </ol>
                <a
                  href={slackInstallUrl}
                  className="mt-5 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#4c1d95] transition-transform hover:-translate-y-0.5"
                  rel="noreferrer"
                >
                  Add to Slack
                  <Icon name="arrow_forward" className="ml-1 text-[16px]" />
                </a>
              </div>
            </div>
            <figure className="relative flex flex-col overflow-hidden rounded-3xl border border-border bg-[#f4f1fb] lg:col-span-5">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-[90px]" />
              <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
                <Shot
                  figure={INTEGRATIONS_CALLS}
                  sizes="(min-width: 1280px) 480px, (min-width: 1024px) 38vw, calc(100vw - 40px)"
                  className="rounded-xl shadow-[0_20px_40px_-24px_rgba(76,29,149,0.6)]"
                />
              </div>
              <figcaption className="relative border-t border-[#e4def2] bg-white/70 px-5 py-3 text-xs leading-relaxed text-[#5d5776]">
                {INTEGRATIONS_CALLS.caption}
              </figcaption>
            </figure>
          </div>
        </Reveal>

        {/* One grid for every entry, with the category on the card. Grouping them under
            separate headings left one or two cards per row and a large empty area to
            their right. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATION_DIRECTORY.map((entry, i) => (
            <Reveal key={entry.name} delayMs={(i % 3) * 70} className="h-full">
              <div className="vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{entry.category}</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold">{entry.name}</h3>
                  <span
                    className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      entry.viaWebhook
                        ? 'border-border text-text-muted'
                        : 'border-success/30 bg-success/15 text-success'
                    }`}
                  >
                    {entry.viaWebhook ? 'Via webhook' : 'Native'}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-text-muted">{entry.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {howItWorks && (
        <Timeline
          eyebrow={howItWorks.eyebrow}
          title={howItWorks.title}
          intro={howItWorks.intro}
          steps={howItWorks.items}
          note={howItWorks.note}
        />
      )}

      {guideSections.slice(0, 1).map((section) => (
        <FeatureRows
          key={section.title}
          eyebrow={section.eyebrow}
          title={section.title}
          intro={section.intro}
          items={section.items}
          note={section.note}
          figures={SECTION_FIGURES[section.title]}
        />
      ))}

      <TrustBand placement="integrations_trust_band" />

      {guideSections.slice(1).map((section) => (
        <FeatureRows
          key={section.title}
          eyebrow={section.eyebrow}
          title={section.title}
          intro={section.intro}
          items={section.items}
          note={section.note}
          figures={SECTION_FIGURES[section.title]}
        />
      ))}

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-4 md:px-8">
        <Reveal>
          <SectionHead eyebrow="Beyond the list" title="Your own endpoint, or the API." className="mb-8" />
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal className="h-full">
            <div className="vv-lift h-full rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface p-7 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-magenta text-white">
                <Icon3D name="webhook" size={32} plate className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-xl font-bold">Don’t see your tool?</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                Anything that accepts an inbound HTTP request works. Point the lead webhook at your
                endpoint and you’ll receive a structured JSON payload on every completed call - contact
                details, captured fields, sentiment, duration, channel, and the full transcript.
              </p>
            </div>
          </Reveal>
          <Reveal delayMs={70} className="h-full">
            <div className="vv-lift h-full rounded-3xl border border-border bg-surface p-7 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon3D name="api" className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-xl font-bold">Or build on the API</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                For two-way sync and custom workflows, the API exposes agents, calls, contacts, and
                analytics directly - so you can pull data on your own schedule instead of only
                receiving pushes.
              </p>
              <NavLink
                to="https://docs.vistrowvoice.com/api-reference/introduction"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Read the docs
                <Icon name="arrow_forward" className="text-[16px]" />
              </NavLink>
            </div>
          </Reveal>
        </div>
      </section>

      <ObjectionCards route="/integrations" placement="integrations_objections" />

      <FaqSection items={INTEGRATIONS_PAGE.faqs} />

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
