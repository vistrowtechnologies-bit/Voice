import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { SectionEyebrow } from './MarketingBits'
import { Reveal } from './Reveal'

export interface FaqEntry {
  q: string
  a: string
}

/** The FAQ block every marketing page ends with.
 *
 *  It used to be copy-pasted into eight pages: a max-w-3xl column, centered
 *  heading, and a stack of separate bordered cards. On anything wider than a
 *  laptop that reads as a narrow ribbon stranded in whitespace, with the
 *  boxes repeating the same rounded outline eight times down the page.
 *
 *  Two changes fix it. The heading moves into a left rail that sticks while
 *  the questions scroll, so the section uses the full width and has somewhere
 *  to put a route out (most people who scroll to the FAQ and don't find their
 *  question want a human). And the questions become one bordered container
 *  with dividers rather than eight floating cards — same information, a
 *  quarter of the visual noise.
 */
export function FaqSection({
  items,
  eyebrow = 'FAQ',
  title = 'Questions, answered.',
  intro = 'The things people ask us most. If yours isn’t here, talk to us — a person replies.',
  contactHref = '/contact',
  contactLabel = 'Ask us directly',
  /** Which item starts open. The first one being open on load shows the
   *  section is interactive; a wall of closed rows reads as a list of links. */
  defaultOpen = 0,
}: {
  items: FaqEntry[]
  eyebrow?: string
  title?: string
  intro?: string
  contactHref?: string
  contactLabel?: string
  defaultOpen?: number | null
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen)
  const baseId = useId()

  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <Reveal>
          <div className="lg:sticky lg:top-24">
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 max-w-sm text-text-muted">{intro}</p>
            <Link
              to={contactHref}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              {contactLabel}
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </Reveal>

        <Reveal delayMs={70}>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {items.map((item, i) => {
              const isOpen = open === i
              return (
                <div key={item.q}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      aria-controls={`${baseId}-panel-${i}`}
                      id={`${baseId}-button-${i}`}
                      className="flex w-full items-center justify-between gap-6 px-5 py-4 text-left transition-colors hover:bg-surface-high/60 sm:px-6 sm:py-5"
                    >
                      <span
                        className={`font-semibold transition-colors ${
                          isOpen ? 'text-primary' : 'text-text'
                        }`}
                      >
                        {item.q}
                      </span>
                      {/* The chevron sits in its own circle so the tap target
                          reads as a control at a glance, and shrink-0 keeps a
                          long question from squeezing it out of the row. */}
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isOpen
                            ? 'rotate-180 border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-text-muted'
                        }`}
                      >
                        <Icon name="expand_more" className="text-[18px]" />
                      </span>
                    </button>
                  </h3>
                  {/* grid-rows 0fr -> 1fr animates to the content's real
                      height without measuring it in JS. The inner element
                      needs overflow-hidden or the text escapes the collapsed
                      row while the transition is running. */}
                  <div
                    id={`${baseId}-panel-${i}`}
                    role="region"
                    aria-labelledby={`${baseId}-button-${i}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-text-muted sm:px-6">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
