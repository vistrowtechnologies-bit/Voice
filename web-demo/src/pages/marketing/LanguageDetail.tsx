import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { ScriptMarquee } from '../../components/BharatBits'
import { VoiceSamplePlayer } from '../../components/VoiceSamplePlayer'
import { pageFigures } from '../../lib/pageFigures'
import arthaAvatar from '../../assets/artha-avatar.webp'
import { INDIAN_LANGUAGE_VOICES, LANGUAGES, SOLUTIONS } from '../../lib/marketingContent'
import { SEO_ORIGIN, seoForPath } from '../../lib/seoPages'
import { VOICE_SAMPLES, type VoiceSample } from '../../lib/voiceSamples'
import {
  ObjectionCards,
  Reveal,
  RiskReducers,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  Timeline,
  TrustBand,
  useStickyRefs,
  type TrustFact,
} from '../../components/showcase'
import { W4_CALL_SUMMARY } from './premiumW4Visuals'

// Give high-intent language landing pages a clear next step into a useful,
// matching example. These are explicitly labelled as representative samples
// on the destination page; they are not presented as customer case studies.
const LANGUAGE_DEMO_CALLS: Record<string, { slug: string; title: string }> = {
  hindi: { slug: 'hindi-real-estate-lead-qualification', title: 'Hindi real-estate lead qualification' },
  marathi: { slug: 'marathi-site-visit-booking', title: 'Marathi site-visit booking' },
  kannada: { slug: 'kannada-inbound-property-enquiry', title: 'Kannada inbound property enquiry' },
  telugu: { slug: 'telugu-website-widget-call', title: 'Telugu website-widget call' },
}

const GUIDE_ICONS = ['translate', 'record_voice_over', 'task_alt']

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

function CheckList({ items, tone }: { items: string[]; tone: 'primary' | 'cyan' }) {
  return (
    <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <Icon name="check_circle" className={`mt-0.5 shrink-0 text-[16px] ${tone === 'primary' ? 'text-primary' : 'text-cyan'}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// One template renders all ten language pages, keyed by :slug, composed from
// the premium showcase kit (components/showcase/) like /product/* and
// /solutions/*: split hero with the native-script sample card, the scripted
// sample-call player beside the code-mixing note, who it is for beside a
// call record, the written example in chat bubbles, the violet trust band,
// regional calls, go-live notes as a timeline, objections, then FAQ. These
// pages exist for long-tail search ("AI voice agent in Tamil"), which is why
// each one carries its own FAQPage JSON-LD rather than sharing the overview's.
export function LanguageDetail() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const lang = LANGUAGES.find((l) => l.slug === slug)
  if (!lang) return <Navigate to="/languages" replace />
  const route = `/languages/${lang.slug}`
  // Titles and descriptions live in the SEO registry (seoPages.ts), which
  // <Seo> prefers anyway; reading them here keeps a single source.
  const seoMeta = seoForPath(route) ?? {
    title: `${lang.name} AI Voice Agent for Customer Calls | Vistrow Voice`,
    description: `Handle inbound, outbound, and website customer conversations with a ${lang.name} AI voice agent.`,
  }
  const demoCall = LANGUAGE_DEMO_CALLS[lang.slug]
  const voiceSample = VOICE_SAMPLES[lang.slug]
  const whoHeading = `Built for teams that take calls in ${lang.name}.`
  // The native-script sample card (pageFigures.ts) is the hero visual.
  const heroVisual = pageFigures(route, whoHeading)[0]

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

  // Facts that hold for every language page (languages FAQ, calls history,
  // the voices aside below).
  const trustFacts: TrustFact[] = [
    { icon: 'translate', title: `${lang.name} and English in one call`, body: 'The agent follows the caller when they move between languages, without changing voice.' },
    { icon: 'devices', title: 'Phone and website', body: 'The same agent can answer your number and the call button on your site.' },
    { icon: 'receipt_long', title: 'Every call logged', body: 'A transcript for every call, plus the lead fields captured and the audio if recording is on.' },
    { icon: 'verified_user', title: 'Consent and recording, your call', body: 'Require spoken consent, switch recording on or off and set how long records are kept.' },
  ]

  return (
    <MarketingLayout>
      <Seo
        title={seoMeta.title}
        description={seoMeta.description}
        path={route}
        jsonLd={voiceSample ? [faqJsonLd, audioJsonLd(voiceSample)] : faqJsonLd}
      />

      <SplitHero
        kicker={
          <p
            lang={lang.code}
            aria-hidden="true"
            className="bg-gradient-to-r from-primary via-magenta to-cyan bg-clip-text pb-1 font-display text-4xl font-bold leading-tight text-transparent sm:text-5xl"
          >
            {lang.greeting}
          </p>
        }
        eyebrow={`Languages · ${lang.name}`}
        title={
          <>
            <span className="block">AI voice agents that speak</span>{' '}
            <span className="block bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent">{lang.name}.</span>
          </>
        }
        subhead={lang.intro ?? lang.blurb}
        visual={heroVisual}
        placement="language_hero"
        ctaRef={heroCtaRef}
        trust={
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6 sm:gap-8">
            {stats.map((s) => (
              <div key={s.label}>
                <p
                  lang={s.native ? lang.code : undefined}
                  className={`font-display font-bold ${s.native ? 'text-2xl text-primary' : 'text-base leading-snug text-text sm:text-lg'}`}
                >
                  {s.value}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-text-muted sm:text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        }
      />

      <ScriptMarquee />

      {/* ---------- Sample call player beside the code-mixing note ---------- */}
      {(voiceSample || lang.codeMixing) && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <SplitRow
            className=""
            aside={
              voiceSample ? (
                <div className="relative">
                  <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-primary/20 blur-[90px]" />
                  <VoiceSamplePlayer sample={voiceSample} />
                </div>
              ) : undefined
            }
          >
            <Reveal>
              <SectionEyebrow>Hear a sample call</SectionEyebrow>
              {lang.codeMixing ? (
                <>
                  <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                    {lang.codeMixing.name} is the normal case
                  </h2>
                  <div className="relative mt-6 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-surface to-cyan/[0.06] p-6 sm:p-8">
                    <span aria-hidden="true" className="absolute left-5 top-2 font-display text-6xl leading-none text-primary/30">&ldquo;</span>
                    <p className="relative text-lg leading-relaxed text-text">{lang.codeMixing.body}</p>
                  </div>
                </>
              ) : null}
              <RiskReducers className="mt-6" />
            </Reveal>
          </SplitRow>
        </section>
      )}

      {/* ---------- Who it's for, beside a saved call record ---------- */}
      <div className="bg-surface-high/40">
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <SplitRow figure={W4_CALL_SUMMARY(whoHeading)} className="">
            <Reveal>
              <SectionHead
                eyebrow="Who it’s for"
                title={whoHeading}
                intro={`This page is for teams that need a real ${lang.name} AI voice calling agent that answers live calls at any hour, rather than a translated chatbot or a recorded IVR menu.`}
              />
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Reveal className="h-full">
                <div className="vv-lift h-full rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/[0.12] via-surface to-surface p-6">
                  <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
                    Best-fit call types
                  </h3>
                  <CheckList
                    tone="primary"
                    items={
                      lang.localUseCases ?? [
                        `${lang.name} inbound enquiries from website, phone, and campaigns`,
                        `${lang.name} support, reminders, and follow-up conversations`,
                        `${lang.name} qualification calls logged for your team`,
                      ]
                    }
                  />
                </div>
              </Reveal>
              <Reveal delayMs={70} className="h-full">
                <div className="vv-lift h-full rounded-3xl border border-border bg-surface p-6">
                  <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <span className="h-5 w-1 rounded-full bg-cyan" aria-hidden="true" />
                    What the agent does
                  </h3>
                  <CheckList
                    tone="cyan"
                    items={
                      lang.callBehaviors ?? [
                        `Speaks ${lang.name} naturally and follows English code-switching`,
                        'Collects caller intent, timeline, and next-step preference',
                        'Saves transcript, summary, recording, and CRM-ready call data',
                      ]
                    }
                  />
                </div>
              </Reveal>
            </div>
          </SplitRow>
        </section>
      </div>

      {/* ---------- Written example as chat bubbles, voices beside it ---------- */}
      {lang.sampleExchange && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
            <Reveal>
              <figure>
                <SectionEyebrow>Example conversation</SectionEyebrow>
                <figcaption className="mt-3">
                  <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{lang.sampleExchange.context}, in {lang.name}.</h2>
                  <p className="mt-3 text-sm text-text-muted">
                    A short written sample to show the style of call, with an English gloss under each line. It is not a
                    recording of a customer call.
                  </p>
                </figcaption>
                <ol className="mt-7 space-y-4 rounded-3xl border border-border bg-gradient-to-br from-primary/[0.08] via-surface-high/40 to-transparent p-4 shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)] sm:p-6">
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
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${agent ? 'rounded-br-sm bg-gradient-to-br from-primary to-primary-dark text-white' : 'rounded-bl-sm bg-surface shadow-sm'}`}>
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
            </Reveal>

            <Reveal delayMs={80} className="lg:sticky lg:top-28 lg:mt-24">
              <aside className="bento-hero relative overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                  <Icon3D name="record_voice_over" size={32} plate className="text-[22px]" />
                </span>
                <h2 className="mt-4 font-display text-xl font-bold">Voices that speak {lang.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/85">
                  These Standard voices in the agent picker speak {lang.name} and keep the same voice if the caller
                  moves to English or another Indian language: {INDIAN_LANGUAGE_VOICES.female.join(', ')} (female) and{' '}
                  {INDIAN_LANGUAGE_VOICES.male.join(', ')} (male).
                </p>
              </aside>
            </Reveal>
          </div>
        </section>
      )}

      <TrustBand
        eyebrow={`${lang.name} calls you can check`}
        title="Hear it on a real call before you decide."
        body={`Artha answers in ${lang.name}, works on your number and your website, and leaves a record of every call.`}
        facts={trustFacts}
        placement="language_trust_band"
      />

      {/* ---------- Sample lines: horizontal strip ---------- */}
      {lang.sampleLines && (
        <section className="mx-auto max-w-7xl px-5 pt-14 md:px-8 lg:pt-16">
          <Reveal>
            <SectionHead
              eyebrow="Short sample lines"
              title={`How the agent phrases common moments in ${lang.name}.`}
              intro="Written examples with an English gloss, not recordings. Your own welcome message and prompt set the exact wording."
              className="mb-8"
            />
          </Reveal>
          <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
            {lang.sampleLines.map((line, i) => (
              <div
                key={line.label}
                className={`vv-lift w-[78%] shrink-0 snap-start rounded-3xl border p-6 md:w-auto ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{line.label}</p>
                <p lang={lang.code} className="mt-2 text-base leading-relaxed text-text">{line.native}</p>
                <p className="mt-1 text-sm italic leading-relaxed text-text-muted">{line.gloss}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Regional calls: numbered rows ---------- */}
      {lang.regionalCalls && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <Reveal>
              <SectionEyebrow>{`${lang.region} calls`}</SectionEyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{lang.regionalHeading ?? `Where ${lang.name} calls matter most.`}</h2>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                <Icon name="public" className="text-[16px]" />
                {lang.region}
              </p>
            </Reveal>
            <ul className="grid gap-4">
              {lang.regionalCalls.map((call, i) => (
                <li key={call.title}>
                  <Reveal delayMs={i * 60} className="vv-lift flex gap-4 rounded-3xl border border-border bg-surface p-6">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-sm font-bold text-white">
                      {`0${i + 1}`}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold">{call.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{call.body}</p>
                      <Link
                        to={call.to}
                        className="mt-0 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline sm:mt-3 sm:min-h-0"
                      >
                        {call.link}
                        <Icon name="arrow_forward" className="text-[16px]" />
                      </Link>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- Go-live notes as a timeline ---------- */}
      {lang.guide && (
        <div className="bg-surface-high/40">
          <Timeline
            eyebrow={`${lang.name} call notes`}
            title={`What to get right before you go live in ${lang.name}.`}
            steps={lang.guide.map((note, i) => ({ icon: GUIDE_ICONS[i % GUIDE_ICONS.length], title: note.title, body: note.body }))}
          />
        </div>
      )}

      {/* ---------- Solutions ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead center eyebrow="Where teams use it" title={`${lang.name} calls, handled end to end.`} className="mb-10" />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 sm:max-lg:grid-close-2 lg:grid-close-3">
          {SOLUTIONS.map((s, i) => (
            <Reveal key={s.to} delayMs={(i % 3) * 60} className="h-full">
              <Link
                to={s.to}
                className={`vv-lift group flex h-full gap-4 rounded-3xl border p-6 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon3D name={s.icon ?? 'circle'} className="text-[22px]" />
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
            </Reveal>
          ))}
        </div>
      </section>

      {demoCall && (
        <section className="mx-auto max-w-7xl px-5 pb-6 md:px-8">
          <Reveal>
            <div className="flex flex-col gap-4 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] via-surface to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <SectionEyebrow>See a sample conversation</SectionEyebrow>
                <h2 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
                  Explore a representative {lang.name} AI voice call.
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Read the sample transcript and the structured outcome the team receives.
                </p>
              </div>
              <Link
                to={`/demo-calls/${demoCall.slug}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-surface px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
              >
                {demoCall.title}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          </Reveal>
        </section>
      )}

      <ObjectionCards route={route} placement="language_objections" />

      <FaqSection key={lang.slug} items={faqs} />

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
      <section className="mx-auto max-w-7xl space-y-8 px-5 py-12 md:px-8">
        {lang.related && (
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{`Related to ${lang.name} calls`}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {lang.related.map((r) => (
                <Link
                  key={r.to}
                  to={r.to}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-4 py-1.5 sm:min-h-0 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
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
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-muted sm:min-h-0 transition-colors hover:border-primary hover:text-text"
              >
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
