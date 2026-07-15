import type { HTMLAttributes, ReactNode } from 'react'

type CardVariant = 'default' | 'flat' | 'stat'

// Base card shell used everywhere a bordered box was previously hand-typed
// as `rounded-xl border border-border bg-surface p-5`. Three variants cover
// every existing use across the dashboard:
//   - default: data display (charts, lists) — full border weight, gets a
//     thin top accent edge so charts/data panels read as a distinct "kind"
//     of content from list/table cards at a glance.
//   - flat: settings/editor forms — lighter border, no accent edge, since a
//     form doesn't need the same heavy boxed treatment as a data display.
//   - stat: KPI tile shell, consumed by StatTile — hover lift retained from
//     the original MetricCard/StatCard implementations.
const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'rounded-xl border border-t-2 border-t-primary/40 border-border bg-surface',
  flat: 'rounded-xl border border-border/70 bg-surface',
  stat: 'group rounded-xl border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: 'none' | 'sm' | 'md'
  children: ReactNode
}

const PADDING_CLASSES: Record<'none' | 'sm' | 'md', string> = {
  none: '',
  sm: 'p-4',
  md: 'p-4 sm:p-5',
}

export function Card({ variant = 'default', padding = 'md', className = '', children, ...rest }: CardProps) {
  return (
    <div className={`${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${className}`} {...rest}>
      {children}
    </div>
  )
}
