import { Children, isValidElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { MarketingLayout } from './MarketingLayout'
import { Seo } from './Seo'
import { ReadingLayout, slugify } from './showcase'

/** Shared shell for long-form legal documents (Privacy, Terms) on the reading
 * template: kit H1, a "last updated" stamp, a contents list built from the
 * sections, a ~70ch text column and a contact card. */
export function LegalLayout({
  eyebrow,
  title,
  updated,
  intro,
  path,
  description,
  contactEmail,
  children,
}: {
  eyebrow: string
  title: string
  updated: string
  intro?: string
  path: string
  description?: string
  contactEmail: string
  children: ReactNode
}) {
  const toc = Children.toArray(children)
    .filter((c): c is React.ReactElement<{ id?: string; title: string }> => isValidElement(c) && c.type === LegalSection)
    .map((c) => ({ id: c.props.id ?? slugify(c.props.title), label: c.props.title }))

  return (
    <MarketingLayout>
      <Seo title={`${title} - Vistrow Voice`} description={description ?? intro ?? `${title} for Vistrow Voice.`} path={path} />
      <ReadingLayout
        crumbs={[{ label: 'Home', to: '/' }, { label: title }]}
        eyebrow={eyebrow}
        title={title}
        lede={intro}
        meta={<span>Last updated {updated}</span>}
        toc={toc}
        mobileLabel="Contents"
        placement="legal_aside"
        asideCard={<ContactCard email={contactEmail} title={title} />}
        after={
          <div className="lg:hidden">
            <ContactCard email={contactEmail} title={title} />
          </div>
        }
      >
        <article className="prose-legal flex flex-col gap-10">{children}</article>
      </ReadingLayout>
    </MarketingLayout>
  )
}

function ContactCard({ email, title }: { email: string; title: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon name="mail" className="text-[20px]" />
      </span>
      <p className="mt-4 font-display text-base font-semibold text-text">Questions about our {title.replace(/^Terms of Service$/, 'terms')}?</p>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">Write to us and a person will reply.</p>
      <a href={`mailto:${email}`} className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 break-all text-sm font-semibold text-primary hover:underline">
        {email}
      </a>
      <Link to="/contact" className="flex min-h-[44px] items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        Contact page <Icon name="arrow_forward" className="text-[16px]" />
      </Link>
    </div>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id ?? slugify(title)} className="scroll-mt-28">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 text-base leading-[1.75] text-text [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:decoration-2 [&_b]:font-semibold [&_b]:text-text [&_li]:leading-relaxed [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
