import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { Reveal } from '../../components/Reveal'
import { LANGUAGES } from '../../lib/marketingContent'

export function LanguagesOverview() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agents in 11 Indian Languages - Vistrow Voice"
        description="Artha answers calls in Hindi, English, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, and Odia - switching mid-call to match whichever language the caller uses."
        path="/languages"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Languages</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Your customer shouldn’t have to switch languages to be understood.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Artha speaks 11 Indian languages, and switches mid-call when the caller does - including
          the everyday mixed speech most people actually use on the phone.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LANGUAGES.map((lang, i) => (
            <Reveal key={lang.slug} delayMs={(i % 3) * 70} className="h-full">
              <Link
                to={`/languages/${lang.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_12px_40px_-16px_rgba(168,85,247,0.45)]"
              >
                <p className="font-display text-3xl font-bold leading-none text-primary">
                  {lang.native}
                </p>
                {/* The greeting is the point of the product - show it, don't
                    just name the language. */}
                <p className="mt-2 text-sm text-text-muted">{lang.greeting}</p>
                <h2 className="mt-4 flex items-center gap-1 font-display text-lg font-semibold">
                  {lang.name}
                  <Icon
                    name="arrow_forward"
                    className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </h2>
                <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">{lang.region}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{lang.blurb}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Why this is hard</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
            Translation isn’t the same as speaking the language.
          </h2>
          <div className="mt-8 grid gap-7 md:grid-cols-3">
            <div>
              <h3 className="font-display text-base font-semibold">Mid-sentence switching</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Real callers mix languages inside a single sentence. Artha follows the switch instead of
                forcing the caller to pick one and stay there.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Grammatical gender</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                In Hindi, Marathi, Gujarati, and Punjabi, verbs agree with the speaker’s gender. Artha
                stays consistent with its own voice for the whole call, not just the first line.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Numbers and names</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Amounts, dates, and Indian names are the first thing a generic voice model gets wrong.
                They’re the details that decide whether a call sounds local or imported.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
