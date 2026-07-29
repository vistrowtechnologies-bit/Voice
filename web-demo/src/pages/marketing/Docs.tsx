import { Icon } from '../../components/Icon'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'

// Replaces the old "Docs — coming soon" stub. A dead docs link reads as an
// unfinished *product*, not just unfinished marketing, so this is
// deliberately a real, complete single-page guide rather than a shell for
// a docs site that doesn't exist yet. Every step here describes something
// the dashboard can actually do today.

interface Step {
  n: string
  title: string
  body: string
}

const QUICKSTART: Step[] = [
  {
    n: '01',
    title: 'Create your agent',
    body: 'Dashboard → Agents → New Agent. Give it a name, pick a voice and a default language, and write the persona — who it is, what business it represents, and what it should try to achieve on a call.',
  },
  {
    n: '02',
    title: 'Add your knowledge',
    body: 'Dashboard → Knowledge Base. Upload PDFs or documents and they’re extracted into clean question–answer pairs the agent retrieves from. Turn on strict mode if the agent should only ever answer from this material.',
  },
  {
    n: '03',
    title: 'Test it in the browser',
    body: 'Hit the mic button on the agent card to talk to it immediately — same prompt, same voice, same knowledge base it will use on real calls. No phone number needed.',
  },
  {
    n: '04',
    title: 'Connect a channel',
    body: 'Point a phone number at the agent under Phone Numbers, or install the website widget under Website Widget for browser calls. One agent can serve all channels at once.',
  },
  {
    n: '05',
    title: 'Send the results somewhere',
    body: 'Dashboard → Integrations. Connect a CRM, Slack, WhatsApp, Sheets, or any webhook so qualified leads and transcripts land where your team already works.',
  },
]

const CONCEPTS: { term: string; def: string }[] = [
  {
    term: 'Agent',
    def: 'One configured personality: persona, prompt, voice, language, knowledge base, and tools. An agent is what actually takes a call. You can run several — one per brand, location, or campaign.',
  },
  {
    term: 'Credit',
    def: 'Roughly one minute of conversation. Phone calls draw at a higher rate than browser calls, since they carry telecom cost. Every channel spends from the same monthly pool.',
  },
  {
    term: 'Knowledge base',
    def: 'The uploaded material your agent retrieves answers from. In strict mode the agent refuses to answer anything not grounded in it, rather than guessing.',
  },
  {
    term: 'Channel',
    def: 'How the call reaches the agent: inbound phone, outbound campaign, or a browser call from your website widget. Billing and analytics break down per channel.',
  },
  {
    term: 'Campaign',
    def: 'A list of contacts the agent dials through automatically — reminders, follow-ups, collections. Supports {{variables}} for per-contact personalisation and scheduled start times.',
  },
  {
    term: 'Compliance gate',
    def: 'Every outbound dial is checked against your Do-Not-Call registry and calling window before it leaves the platform. A blocked dial is logged, never placed.',
  },
]

const HOWTO: { icon: string; title: string; body: string }[] = [
  {
    icon: 'dialpad',
    title: 'Use your existing phone number',
    body: 'Add the number under Phone Numbers and route it to an agent. You keep the number your customers already know — no porting, no new line to advertise.',
  },
  {
    icon: 'code',
    title: 'Install the website widget',
    body: 'Copy the one-line script tag from Website Widget and paste it before your closing </body> tag. On WordPress, install the plugin and paste your site key instead.',
  },
  {
    icon: 'event',
    title: 'Let the agent book appointments',
    body: 'Set your availability under Settings → Availability. The agent then checks real free slots during the call and books directly — no double-booking, no callback needed.',
  },
  {
    icon: 'webhook',
    title: 'Receive leads over webhook',
    body: 'Add your endpoint under Integrations. On every completed call you receive JSON with contact details, captured fields, sentiment, duration, channel, and the full transcript.',
  },
  {
    icon: 'key',
    title: 'Use the API',
    body: 'Generate a key under Settings → API Keys. Keys are shown once and stored hashed — copy it immediately, and revoke it from the same screen if it’s ever exposed.',
  },
  {
    icon: 'swap_calls',
    title: 'Hand off to a human',
    body: 'Set a transfer number on the agent. When a caller needs a person, the agent hands off with context instead of dead-ending the call.',
  },
]

export function Docs() {
  return (
    <MarketingLayout>
      <Seo
        title="Docs & Help — Vistrow Voice"
        description="Set up a Vistrow Voice AI agent: create an agent, add a knowledge base, connect a phone number or website widget, book appointments, and push leads to your CRM."
        path="/resources/docs"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 md:px-8 lg:py-20">
        <SectionEyebrow>Docs &amp; help</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          From zero to a live agent.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-text-muted">
          Everything you need to get an agent answering real calls. Most teams are live in under an
          hour, without writing any code.
        </p>
      </section>

      {/* Quickstart */}
      <section className="mx-auto max-w-3xl px-5 pb-14 md:px-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Quickstart</h2>
        <div className="mt-6 flex flex-col gap-3">
          {QUICKSTART.map((step) => (
            <div key={step.n} className="flex gap-5 rounded-2xl border border-border bg-surface p-6">
              <span className="font-display text-2xl font-bold text-border">{step.n}</span>
              <div>
                <h3 className="font-display text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Concepts */}
      <section className="mx-auto max-w-3xl px-5 pb-14 md:px-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Core concepts</h2>
        <dl className="mt-6 flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {CONCEPTS.map((c) => (
            <div key={c.term} className="grid gap-2 p-6 sm:grid-cols-[140px_1fr] sm:gap-6">
              <dt className="font-display text-sm font-semibold text-text">{c.term}</dt>
              <dd className="text-sm leading-relaxed text-text-muted">{c.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* How-to */}
      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold tracking-tight">Common tasks</h2>
        </div>
        <div className="mx-auto mt-6 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOWTO.map((h) => (
            <div key={h.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={h.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-base font-semibold">{h.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Help */}
      <section className="mx-auto max-w-3xl px-5 pb-20 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 text-center sm:p-10">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high text-cyan">
            <Icon name="support_agent" className="text-[24px]" />
          </span>
          <h2 className="mt-5 font-display text-xl font-bold">Still stuck?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
            There’s a help assistant inside the dashboard that knows your actual workspace — your
            agents, your call history, your settings — so it can answer specifics this page can’t.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <NavLink
              to="/login"
              className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Open the dashboard
            </NavLink>
            <NavLink
              to="/contact"
              className="rounded-full border border-border px-6 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Talk to us
            </NavLink>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
