import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { Reveal } from '../../components/Reveal'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { DEMO_GLOBAL_LOCALES, LANGUAGES } from '../../lib/marketingContent'

// Customer agents support exactly the 11 languages in LANGUAGES (Hindi, English
// + 9 Indian languages; see lib/agentOptions.ts LANGUAGES). The larger Gemini
// language lists are owner-only and must not be claimed here.
const LANGUAGE_SETUP = [
  {
    title: 'Set a default language',
    body: 'Each agent has a default language: the one it greets callers in. A Pune developer might open in Marathi, a Chennai clinic in Tamil, a national helpline in Hindi or English. The welcome message is written in that language too.',
  },
  {
    title: 'The caller can switch',
    body: 'If a caller answers in another of the eleven languages, or mixes English words into Hindi, Kannada or Telugu, the agent replies in the language the caller is using rather than asking them to switch back.',
  },
  {
    title: 'Pick a voice that suits the language',
    body: 'Voices are added from the Voices page and previewed before you use them. Some voices are tuned to sound native in a particular language while still speaking all eleven, so a Tamil line can use a voice that sounds local.',
  },
  {
    title: 'Numbers, dates and names',
    body: 'Prices, dates, phone numbers and Indian names are where generic voice systems sound foreign. Test them in your own language in the Testing Lab before going live, and add the spellings that matter to your knowledge base.',
  },
  {
    title: 'Same records in every language',
    body: 'Whatever language the call ran in, it is saved with a recording, a transcript and a summary in Calls history, and the lead details go to your CRM, Slack, Google Sheets or a webhook in the same format.',
  },
  {
    title: 'Phone and website',
    body: 'All eleven languages work on phone calls (inbound and outbound) and on browser calls from the website widget.',
  },
]


export function LanguagesOverview() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agents in Hindi, English + 9 Indian Languages | Vistrow Voice"
        description="AI voice agents that speak Hindi, English, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia, and switch language mid-call."
        path="/languages"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Languages</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Your customer shouldn’t have to switch languages to be understood.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Artha speaks 10 Indian languages plus English, and switches mid-call when the caller does - including
          the everyday mixed speech most people actually use on the phone. Every customer agent supports
          all eleven languages on phone calls and website calls.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm text-text-muted">
          Each Indian language has its own page with a sample conversation and regional notes, for example{' '}
          <Link to="/languages/kannada" className="font-semibold text-primary hover:underline">
            Kannada for Bengaluru and Karnataka
          </Link>{' '}
          and{' '}
          <Link to="/languages/telugu" className="font-semibold text-primary hover:underline">
            Telugu for Hyderabad, Telangana and Andhra Pradesh
          </Link>
          .
        </p>
      </section>

      <TryALanguage />

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
        <SectionEyebrow>How language works on an agent</SectionEyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-2xl font-bold sm:text-3xl">
          One agent, one default language, and it follows the caller.
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {LANGUAGE_SETUP.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-text-muted">
          Where to go next: the{' '}
          <Link to="/product/agents" className="font-semibold text-primary hover:underline">
            voice agent builder
          </Link>{' '}
          is where the default language and voice are set; the{' '}
          <Link to="/help/voices/choose-voices" className="font-semibold text-primary hover:underline">
            guide to choosing voices
          </Link>{' '}
          explains the voice tiers; and the sample transcripts show real flows, such as a{' '}
          <Link to="/demo-calls/marathi-site-visit-booking" className="font-semibold text-primary hover:underline">
            Marathi site-visit booking
          </Link>{' '}
          and a{' '}
          <Link to="/demo-calls/telugu-website-widget-call" className="font-semibold text-primary hover:underline">
            Telugu website widget call
          </Link>
          . If you are replacing a keypad menu, the{' '}
          <Link to="/ai-ivr" className="font-semibold text-primary hover:underline">
            AI IVR page
          </Link>{' '}
          covers how a multilingual agent answers your existing number.
        </p>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-text-muted">
          The live demo above can also open in some languages outside this list. Those run on voices we are
          still testing and are not available on customer agents yet.
        </p>
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
  // rather than one long dropdown.
  const nativeOptions = useMemo(
    () => LANGUAGES.map((l) => ({ code: l.code, label: l.name, native: l.native })),
    [],
  )
  const globalOptions = useMemo(
    () =>
      DEMO_GLOBAL_LOCALES.map((l) => ({
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
      <div className="grid items-center gap-8 rounded-3xl border border-border bg-surface p-6 sm:p-10 lg:grid-cols-2 lg:gap-12">
        <div>
          <SectionEyebrow>Try it</SectionEyebrow>
          <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
            Pick a language. Then actually talk to it.
          </h2>
          <p className="mt-3 text-text-muted">
            Choose a language below and start the call. Switch language mid-call too: just say so, and
            Artha follows you.
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
            <optgroup label="Other languages (demo only, in testing)">
              {globalOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                  {o.native && o.native !== o.label ? ` — ${o.native}` : ''}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-3 text-xs text-text-muted">
            Customer agents support Hindi, English and 9 more Indian languages; the other languages in this demo are in testing.
          </p>
          <p className="mt-5 max-w-sm rounded-xl border border-border bg-bg px-4 py-3 text-sm leading-relaxed text-text-muted">
            Selected: <span className="font-semibold text-text">{selected?.label ?? 'Hindi'}</span>. Ask Artha
            anything, or switch language halfway and watch her keep up.
          </p>
        </div>

        <div className="lg:pl-4">
          <DemoOrbCard
            language={code}
            badgeLabel={selected ? `${selected.label} demo` : 'Live demo'}
          />
        </div>
      </div>
    </section>
  )
}
