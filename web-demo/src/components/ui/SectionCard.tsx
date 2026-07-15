import type { ReactNode } from 'react'
import { Card } from './Card'

interface SectionCardProps {
  title: string
  subtitle?: ReactNode
  /** Right-aligned header content — a badge, a range toggle, a count. */
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

// The "card with a header row + divider + list of rows" pattern used
// repeatedly for usage breakdowns (Billing.tsx), the live-calls panel
// (Dashboard.tsx), and similar list-in-a-card sections.
export function SectionCard({ title, subtitle, action, children, footer, className = '' }: SectionCardProps) {
  return (
    <Card variant="default" padding="none" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
      {footer && <div className="border-t border-border px-4 py-3 text-xs text-text-muted sm:px-5">{footer}</div>}
    </Card>
  )
}
