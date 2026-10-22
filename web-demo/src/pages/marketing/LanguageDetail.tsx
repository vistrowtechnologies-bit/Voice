import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { ScriptMarquee } from '../../components/BharatBits'
import { VoiceSamplePlayer } from '../../components/VoiceSamplePlayer'
import { PageFigures } from '../../components/PageFigure'
import { pageFigures } from '../../lib/pageFigures'
import arthaAvatar from '../../assets/artha-avatar.webp'
import { trackMarketingCta } from '../../lib/analytics'
import { INDIAN_LANGUAGE_VOICES, LANGUAGES, SOLUTIONS } from '../../lib/marketingContent'
import { SEO_ORIGIN, seoForPath } from '../../lib/seoPages'
import { VOICE_SAMPLES, type VoiceSample } from '../../lib/voiceSamples'

// Give high-intent language landing pages a clear next step into a useful,
// matching example. These are explicitly labelled as representative samples
// on the destination page; they are not presented as customer case studies.
const LANGUAGE_DEMO_CALLS: Record<string, { slug: string; title: string }> = {
  hindi: { slug: 'hindi-real-estate-lead-qualification', title: 'Hindi real-estate lead qualification' },
  marathi: { slug: 'marathi-site-visit-booking', title: 'Marathi site-visit booking' },
  kannada: { slug: 'kannada-inbound-property-enquiry', title: 'Kannada inbound property enquiry' },
  telugu: { slug: 'telugu-website-widget-call', title: 'Telugu website-widget call' },
}

function audioJsonLd(sample: VoiceSample) {
  return {
    '@context': 'https://schema.org',
    '@type': 'AudioObject',
    name: `Sample call: a caller switches from ${sample.from} to ${sample.to}`,
    description: `Scripted two-speaker phone call voiced by Vistrow Voice voices. The caller starts in ${sample.from} and switches to ${sample.to}, and the AI agent follows. Not a real customer call.`,
    contentUrl: `${SEO_ORIGIN}${sample.src}`,
    encodingFormat: 'audio/mp4',
    duration: `PT${sample.seconds}S`,
    inLanguage: sample.languages,
    transcript: sample.turns.map((t) => `${t.speaker === 'Agent' ? 'AI agent' : 'Caller'}: ${t.native}`).join('\n'),
  }
}

// One template renders all ten language pages, keyed by :slug - same
// approach as ProductDetail/SolutionDetail. These exist for long-tail
// search ("AI voice agent in Tamil"), which is why each one carries its
// own FAQPage JSON-LD rather than sharing the overview's.
//
// Layout varies section to section on purpose (hero with the sample-call
// player, tinted bands, chat bubbles, a pull quote, a numbered timeline,
// light icon tiles) so the page doesn't read as one column of identical
// boxes. All copy, headings and links are the same as the card layout had.
export function LanguageDetail() {
  const { slug } = useParams()
  const lang = LANGUAGES.find((l) => l.slug === slug)
  if (!lang) return <Navigate to="/languages" replace />
  // Titles and descriptions live in the SEO registry (seoPages.ts), which
  // <Seo> prefers anyway; reading them here keeps a single source.
  const seoMeta = seoForPath(`/languages/${lang.slug}`) ?? {
    title: `${lang.name} AI Voice Agent for Customer Calls | Vistrow Voice`,
    description: `Handle inbound, outbound, and website customer conversations with a ${lang.name} AI voice agent.`,
  }
  const demoCall = LANGUAGE_DEMO_CALLS[lang.slug]
  const voiceSample = VOICE_SAMPLES[lang.slug]

  const faqs = [
    ...(lang.seoFaq ? [lang.seoFaq] : []),
    ...(lang.extraFaqs ?? []),
    {
      q: `Can the AI agent handle a full call in ${lang.name}?`,
      a: `Yes - Artha answers, qualifies, and books entirely in ${lang.name}, including numbers, dates, and Indian names. It isn't a translation layer bolted onto an English agent.`,
    },
    {
      q: `What if the caller mixes ${lang.name} and English?`,
      a: `That's the normal case, and Artha follows it. It switches mid-call to match whichever language the caller lands on, rather than forcing them to stay in one.`,
    },
    {
      q: `Can I use ${lang.name} for outbound campaigns too?`,
      a: `Yes - reminder, follow-up, and collection campaigns all run in ${lang.name}, personalised per contact, with every call recorded and logged.`,
    },
    {
      q: `Do I need a separate agent for each language?`,
      a: `No. One agent handles the switch on its own. Many teams still build separate agents per region when the script itself differs, not because the language forces it.`,
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

  const stats = [
    { value: lang.native, label: 'Native script, natively spoken', native: true },
    { value: lang.region, label: 'Where your callers are' },
    { value: '24/7', label: 'Answers outside office hours too' },
  ]

  return (
    <MarketingLayout>
      <Seo
        title={seoMeta.title}
        description={seoMeta.description}
        path={`/languages/${lang.slug}`}
        jsonLd={voiceSample ? [faqJsonLd, audioJsonLd(voiceSample)] : faqJsonLd}
      />

      {/* ---------- Hero ----------
          The sample-call player is the interactive element here (the live
          demo widget is homepage-only). On phones it sits right after the
          CTA, before the stats; on desktop it spans the right column. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-primary/[0.10] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-8 px-5 py-12 md:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-x-12 lg:py-16">
          <div className="lg:col-start-1 lg:row-start-1">
            <SectionEyebrow>{`Languages · ${lang.name}`}</SectionEyebrow>
            <p
              lang={lang.code}
              aria-hidden="true"
              className="mt-4 bg-gradient-to-r from-primary via-magenta to-cyan bg-clip-text pb-1 font-display text-5xl font-bold leading-tight text-transparent sm:text-6xl"
            >
              {lang.greeting}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              <span className="block">AI voice agents that speak</span>{' '}
              <span className="block bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent">{lang.name}.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-muted">{lang.intro ?? lang.blurb}</p>
            <div className="mt-7">
              <Link
                to="/contact"
                onClick={() => trackMarketingCta('book_demo', 'language_hero')}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-7 py-3.5 text-sm font-bold text-white shadow-[0_14px_36px_-12px_rgba(168,85,247,0.7)] transition-transform hover:-translate-y-0.5"
              >
                Book a demo
                <Icon name="arrow_forward" className="text-[18px]" />
              </Link>
            </div>
          </div>

          {voiceSample && (
            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              <VoiceSamplePlayer sample={voiceSample} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 border-t border-border pt-5 sm:gap-8 lg:col-start-1 lg:row-start-2 lg:self-start">
            {stats.map((s) => (
              <div key={s.label}>
                <p
                  lang={s.native ? lang.code : undefined}
                  className={`font-display font-bold ${s.native ? 'text-2xl text-primary' : 'text-lg leading-snug text-text sm:text-xl'}`}
                >
                  {s.value}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ScriptMarquee />

      {/* ---------- Who it's for: tinted band, no cards ---------- */}
      <div className="bg-surface-high/40">
        {pageFigures(`/languages/${lang.slug}`, `Built for teams that take calls in ${lang.name}.`).length > 0 && (
          <section className="mx-auto max-w-7xl px-5 pt-16 md:px-8 lg:pt-20">
            <PageFigures route={`/languages/${lang.slug}`} after={`Built for teams that take calls in ${lang.name}.`} className="" />
          </section>
        )}
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-20">
          <div>
            <SectionEyebrow>Who it&rsquo;s for</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Built for teams that take calls in {lang.name}.
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-text-muted">
              This page is for teams that need a real {lang.name} AI voice calling agent that answers live calls at
              any hour, rather than a translated chatbot or a recorded IVR menu.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
                Best-fit call types
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-muted">
                {(lang.localUseCases ?? [
                  `${lang.name} inbound enquiries from website, phone, and campaigns`,
                  `${lang.name} support, reminders, and follow-up conversations`,
                  `${lang.name} qualification calls logged for your team`,
                ]).map((item) => (
                  <li key={item} className="flex gap-2">
                    <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="h-5 w-1 rounded-full bg-cyan" aria-hidden="true" />
                What the agent does
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-muted">
                {(lang.callBehaviors ?? [
                  `Speaks ${lang.name} naturally and follows English code-switching`,
                  'Collects caller intent, timeline, and next-step preference',
                  'Saves transcript, summary, recording, and CRM-ready call data',
                ]).map((item) => (
                  <li key={item} className="flex gap-2">
                    <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Written example as chat bubbles ---------- */}
      {lang.sampleExchange && (
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
            <figure>
              <SectionEyebrow>Example conversation</SectionEyebrow>
              <figcaption className="mt-3">
                <h2 className="font-display text-3xl font-bold tracking-tight">{lang.sampleExchange.context}, in {lang.name}.</h2>
                <p className="mt-2 text-sm text-text-muted">
                  A short written sample to show the style of call, with an English gloss under each line. It is not a
                  recording of a customer call.
                </p>
              </figcaption>
              <ol className="mt-7 space-y-4 rounded-3xl bg-gradient-to-br from-primary/[0.08] via-surface-high/40 to-transparent p-4 sm:p-6">
                {lang.sampleExchange.turns.map((turn, i) => {
                  const agent = turn.speaker === 'Agent'
                  return (
                    <li key={i} className={`flex items-end gap-2.5 ${agent ? 'flex-row-reverse' : ''}`}>
                      {agent ? (
                        <img src={arthaAvatar} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-primary/25" />
                      ) : (
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-high text-text-muted">
                          <Icon name="person" className="text-[18px]" />
                        </span>
                      )}
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${agent ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm bg-surface shadow-sm'}`}>
                        <p className={`text-[11px] font-bold uppercase tracking-widest ${agent ? 'text-white/75' : 'text-text-muted'}`}>
                          {agent ? 'AI agent' : 'Caller'}
                        </p>
                        <p lang={lang.code} className={`mt-1 text-base leading-relaxed ${agent ? 'text-white' : 'text-text'}`}>{turn.native}</p>
                        <p className={`mt-1 text-sm italic leading-relaxed ${agent ? 'text-white/80' : 'text-text-muted'}`}>{turn.gloss}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-5 flex gap-2 text-sm leading-relaxed text-text-muted">
                <Icon name="task_alt" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
                <span>{lang.sampleExchange.outcome}</span>
              </p>
            </figure>

            <aside className="rounded-3xl border border-border bg-surface p-7 lg:mt-24">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="record_voice_over" className="text-[22px]" />
              </span>
              <h2 className="mt-4 font-display text-lg font-semibold">Voices that speak {lang.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                These Standard voices in the agent picker speak {lang.name} and keep the same voice if the caller
                moves to English or another Indian language: {INDIAN_LANGUAGE_VOICES.female.join(', ')} (female) and{' '}
                {INDIAN_LANGUAGE_VOICES.male.join(', ')} (male).
              </p>
            </aside>
          </div>
        </section>
      )}

      {/* ---------- Code-mixing as a pull quote band ---------- */}
      {lang.codeMixing && (
        <div className="bg-gradient-to-br from-primary/[0.14] via-surface-high/50 to-cyan/[0.08]">
          <section className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8 lg:py-20">
            <span aria-hidden="true" className="font-display text-6xl leading-none text-primary/40">&ldquo;</span>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{lang.codeMixing.name} is the normal case</h2>
            <p className="mt-5 text-lg leading-relaxed text-text sm:text-xl">{lang.codeMixing.body}</p>
          </section>
        </div>
      )}

      {/* ---------- Sample lines: horizontal strip ---------- */}
      {lang.sampleLines && (
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="mb-8 max-w-2xl">
            <SectionEyebrow>Short sample lines</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">How the agent phrases common moments in {lang.name}.</h2>
            <p className="mt-3 text-sm text-text-muted">
              Written examples with an English gloss, not recordings. Your own welcome message and prompt set the exact
              wording.
            </p>
          </div>
          <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
            {lang.sampleLines.map((line) => (
              <div key={line.label} className="w-[78%] shrink-0 snap-start rounded-2xl bg-surface-high/60 p-6 md:w-auto">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{line.label}</p>
                <p lang={lang.code} className="mt-2 text-base leading-relaxed text-text">{line.native}</p>
                <p className="mt-1 text-sm italic leading-relaxed text-text-muted">{line.gloss}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Regional calls: icon rows ---------- */}
      {lang.regionalCalls && (
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div>
              <SectionEyebrow>{`${lang.region} calls`}</SectionEyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{lang.regionalHeading ?? `Where ${lang.name} calls matter most.`}</h2>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                <Icon name="public" className="text-[16px]" />
                {lang.region}
              </p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {lang.regionalCalls.map((call, i) => (
                <li key={call.title} className="flex gap-4 py-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-cyan/15 font-display text-sm font-bold text-primary">
                    {`0${i + 1}`}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{call.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{call.body}</p>
                    <Link
                      to={call.to}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {call.link}
                      <Icon name="arrow_forward" className="text-[16px]" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- Go-live notes: numbered timeline on a tinted band ---------- */}
      {lang.guide && (
        <div className="bg-surface-high/40">
          <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 lg:py-20">
            <div className="mb-10 max-w-2xl">
              <SectionEyebrow>{`${lang.name} call notes`}</SectionEyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
                What to get right before you go live in {lang.name}.
              </h2>
            </div>
            <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-primary/40 via-cyan/40 to-transparent md:block"
            />
            <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
              {lang.guide.map((note, i) => (
                <li key={note.title} className="relative flex gap-4 md:block">
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.8)]">
                    {i + 1}
                  </span>
                  <div className="md:mt-5">
                    <h3 className="font-display text-lg font-semibold">{note.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">{note.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            </div>
          </section>
        </div>
      )}

      {/* ---------- Solutions: light icon tiles ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>Where teams use it</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
            {lang.name} calls, handled end to end.
          </h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex gap-4 rounded-2xl p-5 transition-colors hover:bg-surface-high/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-cyan/15 text-primary">
                <Icon name={s.icon ?? 'circle'} className="text-[22px]" />
              </span>
              <div>
                <h3 className="flex items-center gap-1 font-display text-lg font-semibold">
                  {s.label}
                  <Icon
                    name="arrow_forward"
                    className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {demoCall && (
        <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <SectionEyebrow>See a sample conversation</SectionEyebrow>
              <h2 className="mt-2 font-display text-xl font-bold tracking-tight">
                Explore a representative {lang.name} AI voice call.
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Read the sample transcript and the structured outcome the team receives.
              </p>
            </div>
            <Link
              to={`/demo-calls/${demoCall.slug}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/30 px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              {demoCall.title}
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </section>
      )}

      <FaqSection items={faqs} />

      {lang.guides && lang.guides.length > 0 && (
        <section className="mx-auto max-w-7xl space-y-3 px-5 pt-12 md:px-8">
          {lang.guides.map((sentence) => (
            <p key={sentence} className="max-w-3xl text-base leading-relaxed text-text-muted">
              {sentence.split(/(\[[^\]]+\]\(\/[^)\s]+\))/g).map((part, index) => {
                const link = /^\[([^\]]+)\]\((\/[^)\s]+)\)$/.exec(part)
                return link ? (
                  <Link key={index} to={link[2]} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {link[1]}
                  </Link>
                ) : (
                  part
                )
              })}
            </p>
          ))}
        </section>
      )}

      {/* ---------- Related and other languages: chip rows ---------- */}
      <section className="mx-auto max-w-7xl space-y-8 px-5 pb-12 md:px-8">
        {lang.related && (
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{`Related to ${lang.name} calls`}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {lang.related.map((r) => (
                <Link
                  key={r.to}
                  to={r.to}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  {r.label}
                  <Icon name="arrow_forward" className="text-[14px]" />
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Also available in</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {LANGUAGES.filter((l) => l.slug !== lang.slug).map((l) => (
              <Link
                key={l.slug}
                to={`/languages/${l.slug}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
              >
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
