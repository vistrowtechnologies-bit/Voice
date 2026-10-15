import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { LOCAL_REAL_ESTATE_PAGES } from '../../lib/seoExpansionContent'
import { NotFound } from './NotFound'

export function LocalRealEstate() {
  const { slug } = useParams()
  const page = LOCAL_REAL_ESTATE_PAGES.find((item) => item.slug === slug)
  if (!page) return <NotFound />

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

  return (
    <MarketingLayout>
      <Seo title={page.title} description={page.description} path={`/solutions/real-estate/${page.slug}`} jsonLd={faqJsonLd} />

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1fr_0.85fr] lg:py-20">
        <div>
          <SectionEyebrow>{`${page.state} real estate voice AI`}</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            {page.language} AI calling agent for real estate leads.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">
            Qualify buyers across {page.city} with a voice agent that speaks naturally, captures the right fields, and gives your sales team a clean follow-up record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TalkToArthaButton />
            <Link to="/solutions/real-estate" className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary">
              Real estate solution
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-8">
          <p className="font-display text-5xl font-bold text-primary">{page.native}</p>
          <p className="mt-3 text-sm uppercase tracking-widest text-text-muted">Example call jobs</p>
          <ul className="mt-5 space-y-3">
            {page.examples.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-border bg-surface-high p-4 text-sm font-medium">
                <Icon name="record_voice_over" className="shrink-0 text-[20px] text-cyan" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['Intent', 'Investment, self-use, project question, or site visit.'],
            ['Requirement', 'Budget, location, BHK or plot size, and timeline.'],
            ['Knowledge', 'Project answers stay grounded in approved facts.'],
            ['Handoff', 'CRM-ready lead with transcript, summary, and recording link.'],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-border bg-surface p-6">
              <Icon name="task_alt" className="text-[22px] text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-14 md:px-8 lg:grid-cols-2">
        <div>
          <SectionEyebrow>{`How ${page.state} buyers call`}</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">What property calls sound like here</h2>
          <p className="mt-4 leading-relaxed text-text-muted">{page.market}</p>
          <h3 className="mt-6 font-display text-base font-semibold">What to set up for this market</h3>
          <ul className="mt-3 space-y-3">
            {page.localNotes.map((note) => (
              <li key={note} className="flex gap-2 text-sm leading-relaxed text-text-muted">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[17px] text-cyan" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <SectionEyebrow>{`Sample ${page.language} enquiry`}</SectionEyebrow>
          <ol className="mt-5 space-y-4">
            {page.sample.map((turn, i) => (
              <li key={i} className={turn.speaker === 'Agent' ? 'border-l-2 border-primary pl-4' : 'border-l-2 border-border pl-4'}>
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
                <Link to={`/demo-calls/${page.demoCall}`} className="font-semibold text-primary hover:underline">
                  {page.language} sample call transcript
                </Link>{' '}
                shows the captured lead fields.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <SectionEyebrow>Set it up for your project</SectionEyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold tracking-tight sm:text-3xl">From brochure to live calls</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-base font-semibold">1. Load the project facts</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Upload the brochure, price sheet and FAQs to the{' '}
              <Link to="/product/knowledge-base" className="font-semibold text-primary hover:underline">knowledge base</Link>, and
              keep unit inventory in the{' '}
              <Link to="/help/knowledge-base/live-catalog" className="font-semibold text-primary hover:underline">live catalog</Link>{' '}
              so availability is looked up, not remembered.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-base font-semibold">{`2. Write the ${page.language} opening`}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Set {page.language} as the default language, write a short welcome message, and pick a voice that sounds natural in it.
              The{' '}
              <Link to={`/languages/${page.language.toLowerCase()}`} className="font-semibold text-primary hover:underline">
                {page.language} language guide
              </Link>{' '}
              covers mixed speech and numbers.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-base font-semibold">3. Connect the lead sources</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Route your project number to the agent, add the{' '}
              <Link to="/product/widget" className="font-semibold text-primary hover:underline">website call widget</Link>{' '}
              to listing pages, and post ad-form leads to{' '}
              <Link to="/help/integrations/instant-lead-follow-up" className="font-semibold text-primary hover:underline">instant lead follow-up</Link>{' '}
              so new enquiries get a call back within your calling window.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="font-display text-base font-semibold">4. Book visits and hand over</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Site visits land in the built-in{' '}
              <Link to="/help/appointments/manage-appointments" className="font-semibold text-primary hover:underline">appointments calendar</Link>, and
              each qualified lead goes to your CRM, Slack or Google Sheets through{' '}
              <Link to="/integrations" className="font-semibold text-primary hover:underline">integrations</Link>.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Why local pages matter</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Real estate calls are local before they are technical.</h2>
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
          <p className="mt-4 max-w-3xl text-sm text-text-muted">
            Other markets:{' '}
            {LOCAL_REAL_ESTATE_PAGES.filter((other) => other.slug !== page.slug).map((other, i, list) => (
              <span key={other.slug}>
                <Link to={`/solutions/real-estate/${other.slug}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                  {`${other.language} calls in ${other.state}`}
                </Link>
                {i < list.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
        </div>
      </section>

      <FaqSection items={faqs} />
      <CTABand title={`Test a ${page.language} property call.`} subtitle="Use the live demo, then we can tune the agent for your actual project, script, language, and CRM." />
    </MarketingLayout>
  )
}
