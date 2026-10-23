import { Icon3D } from '../Icon3D'
import { Reveal } from '../Reveal'
import { TalkToArthaButton } from '../MarketingBits'
import { BookDemoLink, ItemLink, RiskReducers, SectionHead } from './primitives'
import { TALK_CLASS } from './utils'

export interface Objection {
  icon: string
  q: string
  a: string
  to: string
  link: string
}

// The four questions that stop a buyer. Answers are worded from the pricing
// FAQ, the agents FAQ and the knowledge base copy. No prices on purpose.
export const DEFAULT_OBJECTIONS: Objection[] = [
  {
    icon: 'payments',
    q: 'What does it cost?',
    a: 'Usage is measured in minutes of conversation, and the voice and model you choose change how quickly minutes are used. Telephony is billed separately by the provider you connect.',
    to: '/pricing',
    link: 'How pricing works',
  },
  {
    icon: 'timer',
    q: 'How much setup is it?',
    a: 'No code. Set the persona, prompt, voice and language, test it in the browser, then publish. Later changes apply from the next call.',
    to: '/help/agents/create-and-edit-agent',
    link: 'Create an agent',
  },
  {
    icon: 'swap_calls',
    q: 'Can a person take over?',
    a: 'On phone calls the agent can dial in the colleague you set and stay on until they answer. Website calls take a callback request instead.',
    to: '/help/agents/agent-functions-and-transfer',
    link: 'Functions and transfer',
  },
  {
    icon: 'help',
    q: 'What if it does not know?',
    a: 'With strict mode on, it quotes your approved answers and says it will check with the team when something is not covered, rather than guessing.',
    to: '/product/knowledge-base',
    link: 'Knowledge base',
  },
]

/** Buyer objections answered in plain words, then a "Still deciding?" CTA bar. */
export function ObjectionCards({
  route,
  items = DEFAULT_OBJECTIONS,
  placement = 'product_objections',
  eyebrow = 'Before you decide',
  title = 'The questions buyers ask first.',
}: {
  /** The current page, so a card never links to itself. */
  route: string
  items?: Objection[]
  placement?: string
  eyebrow?: string
  title?: string
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} className="mb-10" />
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((o, i) => (
          <Reveal key={o.q} delayMs={(i % 2) * 70} className="h-full">
            <div className="vv-lift flex h-full gap-5 rounded-3xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon3D name={o.icon} className="text-[22px]" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-display text-lg font-semibold">{o.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{o.a}</p>
                {o.to !== route && <ItemLink to={o.to} label={o.link} />}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] via-surface to-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-display text-xl font-bold">Still deciding? Ask Artha yourself.</p>
            <RiskReducers className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-3">
            <TalkToArthaButton className={TALK_CLASS} />
            <BookDemoLink placement={placement} />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
