import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { LOCAL_REAL_ESTATE_PAGES } from '../../lib/seoExpansionContent'
import { pageFigures } from '../../lib/pageFigures'
import {
  BOOK_DEMO_CLASS,
  IconTile,
  Reveal,
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

const LINK = 'font-semibold text-primary hover:underline'

export function LocalRealEstate() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const page = LOCAL_REAL_ESTATE_PAGES.find((item) => item.slug === slug)
  if (!page) return <NotFound />
  const route = `/solutions/real-estate/${page.slug}`

  const faqs = [
    {
      q: `Can Vistrow Voice qualify ${page.language} real estate leads?`,
      a: `Yes. The agent can ask buyer intent, budget, preferred location, configuration or plot size, purchase timeline, and next-step preference in ${page.language} or mixed language.`,
    },
    {
      q: 'Can the call be pushed to CRM?',
      a: 'Yes. Vistrow Voice prepares caller details, source page, transcript, summary, captured fields, outcome, and recording link for CRM or webhook delivery.',
    },
    {
      q: 'Will the agent invent prices or availability?',
      a: 'It should not. Project facts should come from the approved knowledge base, and uncertain inventory or pricing should be routed to your sales team.',
    },
  ]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const callFields = [
    { icon: 'flag', title: 'Intent', body: 'Investment, self-use, project question, or site visit.' },
    { icon: 'payments', title: 'Requirement', body: 'Budget, location, BHK or plot size, and timeline.' },
    { icon: 'menu_book', title: 'Knowledge', body: 'Project answers stay grounded in approved facts.' },
    { icon: 'hub', title: 'Handoff', body: 'CRM-ready lead with transcript, summary, and recording link.' },
  ]

  const setupSteps = [
    {
      icon: 'menu_book',
      title: '1. Load the project facts',
      body: (
        <>
          Upload the brochure, price sheet and FAQs to the{' '}
          <Link to="/product/knowledge-base" className={LINK}>knowledge base</Link>, and
          keep unit inventory in the{' '}
          <Link to="/help/knowledge-base/live-catalog" className={LINK}>live catalog</Link>{' '}
          so availability is looked up, not remembered.
        </>
      ),
    },
    {
      icon: 'record_voice_over',
      title: `2. Write the ${page.language} opening`,
      body: (
        <>
          Set {page.language} as the default language, write a short welcome message, and pick a voice that sounds natural in it.
          The{' '}
          <Link to={`/languages/${page.language.toLowerCase()}`} className={LINK}>
            {page.language} language guide
          </Link>{' '}
          covers mixed speech and numbers.
        </>
      ),
    },
    {
      icon: 'call_split',
      title: '3. Connect the lead sources',
      body: (
        <>
          Route your project number to the agent, add the{' '}
          <Link to="/product/widget" className={LINK}>website call widget</Link>{' '}
          to listing pages, and post ad-form leads to{' '}
          <Link to="/help/integrations/instant-lead-follow-up" className={LINK}>instant lead follow-up</Link>{' '}
          so new enquiries get a call back within your calling window.
        </>
      ),
    },
    {
      icon: 'event_available',
      title: '4. Book visits and hand over',
      body: (
        <>
          Site visits land in the built-in{' '}
          <Link to="/help/appointments/manage-appointments" className={LINK}>appointments calendar</Link>, and
          each qualified lead goes to your CRM, Slack or Google Sheets through{' '}
          <Link to="/integrations" className={LINK}>integrations</Link>.
        </>
      ),
    },
  ]

  return (
    <MarketingLayout>
      <Seo title={page.title} description={page.description} path={route} jsonLd={faqJsonLd} />

      <SplitHero
        eyebrow={`${page.state} real estate voice AI`}
        title={`${page.language} AI calling agent for real estate leads.`}
        subhead={`Qualify buyers across ${page.city} with a voice agent that speaks naturally, captures the right fields, and gives your sales team a clean follow-up record.`}
        visual={pageFigures(route, 'showcase-hero')[0]}
        actions={
          <>
            <TalkToArthaButton className={TALK_CLASS} />
            <Link to="/solutions/real-estate" className={BOOK_DEMO_CLASS}>
              Real estate solution
            </Link>
          </>
        }
        ctaRef={heroCtaRef}
      />

      {/* The market's own script leads a bento of what every call captures. */}
      <section className="mx-auto max-w-7xl px-5 pb-14 pt-4 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Reveal className="h-full sm:col-span-2 lg:col-span-4 lg:row-span-2">
            <div className="bento-hero relative flex h-full flex-col overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
              <p lang={page.langCode} className="font-display text-5xl font-bold text-white">{page.native}</p>
              <p className="mt-3 text-sm uppercase tracking-widest text-white/75">Example call jobs</p>
              <ul className="mt-5 space-y-3">
                {page.examples.map((item) => (
                  <li key={item} className="flex gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm font-medium text-white backdrop-blur-sm">
                    <Icon name="record_voice_over" className="shrink-0 text-[20px] text-white" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Waveform bar="bg-white/70" className="h-10" />
              </div>
            </div>
          </Reveal>
          {callFields.map((field, i) => (
            <Reveal key={field.title} delayMs={60 + i * 60} className="h-full lg:col-span-4">
              <article className="vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-6">
                <IconTile name={field.icon} />
                <h2 className="mt-5 font-display text-lg font-semibold">{field.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{field.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 md:px-8">
        <SplitRow
          className="pb-14"
          aside={
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)] sm:p-8">
              <SectionEyebrow>{`Sample ${page.language} enquiry`}</SectionEyebrow>
              <ol className="mt-5 space-y-4">
                {page.sample.map((turn, i) => (
                  <li
                    key={i}
                    className={`rounded-2xl border p-4 ${turn.speaker === 'Agent' ? 'border-primary/25 bg-primary/[0.06] sm:ml-6' : 'border-border bg-surface-high/60 sm:mr-6'}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{turn.speaker === 'Agent' ? 'Agent' : 'Caller'}</p>
                    <p lang={page.langCode} className="mt-1.5 text-base leading-relaxed text-text">{turn.native}</p>
                    <p className="mt-1 text-sm italic leading-relaxed text-text-muted">{turn.gloss}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs leading-relaxed text-text-muted">
                Written sample to show the flow, not a recording of a real call. The project details are fictional.
                {page.demoCall && (
                  <>
                    {' '}A longer{' '}
                    <Link to={`/demo-calls/${page.demoCall}`} className={LINK}>
                      {page.language} sample call transcript
                    </Link>{' '}
                    shows the captured lead fields.
                  </>
                )}
              </p>
            </div>
          }
        >
          <Reveal>
            <SectionEyebrow>{`How ${page.state} buyers call`}</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">What property calls sound like here</h2>
            <p className="mt-4 leading-relaxed text-text-muted">{page.market}</p>
          </Reveal>
          <h3 className="mt-8 font-display text-base font-semibold">What to set up for this market</h3>
          <ul className="mt-2">
            {page.localNotes.map((note, i) => (
              <li key={note} className="border-t border-border py-4 first:border-t-0">
                <Reveal delayMs={(i % 3) * 60} className="flex gap-3 text-sm leading-relaxed text-text-muted">
                  <Icon name="check_circle" className="mt-0.5 shrink-0 text-[18px] text-cyan" />
                  <span>{note}</span>
                </Reveal>
              </li>
            ))}
          </ul>
        </SplitRow>
      </section>

      <TrustBand placement="local_real_estate_trust_band" />

      <Timeline eyebrow="Set it up for your project" title="From brochure to live calls" steps={setupSteps} />

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-8 sm:p-10">
            <SectionEyebrow>Why local pages matter</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">Real estate calls are local before they are technical.</h2>
            <p className="mt-4 max-w-3xl text-text-muted">
              Buyers mention landmarks, budgets, languages, mixed speech, and project names. A useful agent must handle that context and still leave a structured record for the sales team.
            </p>
            <p className="mt-4 max-w-3xl text-sm text-text-muted">
              Language details and a sample conversation are on the{' '}
              <Link to={`/languages/${page.language.toLowerCase()}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                {page.language} AI voice calling agent
              </Link>{' '}
              page. For calling new leads back, see{' '}
              <Link to="/ai-telecaller" className="font-semibold text-primary underline-offset-4 hover:underline">
                how an AI telecaller works
              </Link>
              .
            </p>
            <p className="mt-6 text-xs font-bold uppercase tracking-widest text-text-muted">Other markets</p>
            <ul className="mt-3 flex flex-wrap gap-2.5">
              {LOCAL_REAL_ESTATE_PAGES.filter((other) => other.slug !== page.slug).map((other) => (
                <li key={other.slug}>
                  <Link
                    to={`/solutions/real-estate/${other.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary"
                  >
                    {`${other.language} calls in ${other.state}`}
                    <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <FaqSection items={faqs} />
      <div ref={endRef} />
      <CTABand title={`Test a ${page.language} property call.`} subtitle="Use the live demo, then we can tune the agent for your actual project, script, language, and CRM." />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
