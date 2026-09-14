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

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Why local pages matter</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Real estate calls are local before they are technical.</h2>
          <p className="mt-4 max-w-3xl text-text-muted">
            Buyers mention landmarks, budgets, languages, mixed speech, and project names. A useful agent must handle that context and still leave a structured record for the sales team.
          </p>
        </div>
      </section>

      <FaqSection items={faqs} />
      <CTABand title={`Test a ${page.language} property call.`} subtitle="Use the live demo, then we can tune the agent for your actual project, script, language, and CRM." />
    </MarketingLayout>
  )
}
