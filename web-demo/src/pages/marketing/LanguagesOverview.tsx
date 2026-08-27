import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { Reveal } from '../../components/Reveal'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { GLOBAL_LANGUAGES, LANGUAGES } from '../../lib/marketingContent'

export function LanguagesOverview() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agents in 10 Indian Languages + 76 More | Vistrow Voice"
        description="Artha answers in Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, Odia and English - plus French, German, Spanish, Japanese, Arabic and 70 more. Pick a language and try it live."
        path="/languages"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Languages</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Your customer shouldn’t have to switch languages to be understood.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Artha speaks 10 Indian languages plus English, and switches mid-call when the caller does - including
          the everyday mixed speech most people actually use on the phone. On the global voices, that same
          agent also handles {GLOBAL_LANGUAGES.length} more, from French to Japanese.
        </p>
      </section>

      <TryALanguage />

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
        <SectionEyebrow>Global languages</SectionEyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-2xl font-bold sm:text-3xl">
          And {GLOBAL_LANGUAGES.length} more, on the same agent.
        </h2>
        <p className="mt-3 max-w-2xl text-text-muted">
          The Indian languages above are the ones we build for. These come with the global voices — the
          same agent, the same call, no separate setup. Pick any of them in the demo above.
        </p>
        {/* Chips, not cards: there are too many to give each one a tile, and
            unlike the Indian languages these do not each have a page behind
            them. The endonym leads because that is what a speaker scans for. */}
        <ul className="mt-8 flex flex-wrap gap-2">
          {GLOBAL_LANGUAGES.map((l) => (
            <li
              key={l.code}
              className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm"
              title={`${l.name} · ${l.code}${l.ga ? '' : ' · preview'}`}
            >
              <span className="font-medium">{l.native || l.name}</span>
              {l.native && l.native !== l.name ? (
                <span className="ml-1.5 text-text-muted">{l.name}</span>
              ) : null}
            </li>
          ))}
        </ul>
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

/** Pick a language, then phone the demo and hear it answer in that language.
 *  The picker feeds DemoOrbCard's `language`, which rides the room metadata
 *  to the agent so it OPENS in that language — a visitor who picks Japanese
 *  should not have to first be greeted in Hindi and then correct it. */
function TryALanguage() {
  // The native 10 first (that is the product's centre of gravity), then
  // everything the global voices add, grouped so the list is navigable
  // rather than one 86-item dropdown.
  const nativeOptions = useMemo(
    () => LANGUAGES.map((l) => ({ code: l.code, label: l.name, native: l.native })),
    [],
  )
  const globalOptions = useMemo(
    () =>
      GLOBAL_LANGUAGES.map((l) => ({
        code: l.code,
        label: l.name,
        native: l.native || l.name,
      })),
    [],
  )
  const [code, setCode] = useState('hi-IN')
  const selected =
    nativeOptions.find((o) => o.code === code) ?? globalOptions.find((o) => o.code === code)

  return (
    <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
      <div className="grid items-center gap-8 rounded-3xl border border-border bg-surface p-6 sm:p-10 lg:grid-cols-2">
        <div>
          <SectionEyebrow>Try it</SectionEyebrow>
          <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
            Pick a language. Then actually talk to it.
          </h2>
          <p className="mt-3 text-text-muted">
            Choose any language below and start the call — Artha will open in it, not default to Hindi
            and wait to be corrected. Switch language mid-call too: just say so, and it follows you.
          </p>

          <label
            htmlFor="demo-language"
            className="mt-6 block text-xs font-semibold uppercase tracking-wider text-text-muted"
          >
            Demo language
          </label>
          <select
            id="demo-language"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 w-full max-w-sm rounded-xl border border-border bg-bg px-4 py-3 text-base font-medium outline-none transition-colors focus:border-primary"
          >
            <optgroup label="Indian languages">
              {nativeOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} — {o.native}
                </option>
              ))}
            </optgroup>
            <optgroup label="Global languages">
              {globalOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                  {o.native && o.native !== o.label ? ` — ${o.native}` : ''}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-3 text-xs text-text-muted">
            {nativeOptions.length + globalOptions.length} languages available on this demo.
          </p>
        </div>

        <div className="lg:pl-4">
          <DemoOrbCard
            language={code}
            badgeLabel={selected ? `${selected.label} demo` : 'Live demo'}
          />
          <p className="mx-auto mt-3 max-w-[420px] text-center text-xs text-text-muted">
            Artha will greet you in{' '}
            <span className="font-semibold text-text">{selected?.label ?? 'Hindi'}</span>. Ask it
            anything — or switch language halfway and watch it keep up.
          </p>
        </div>
      </div>
    </section>
  )
}
