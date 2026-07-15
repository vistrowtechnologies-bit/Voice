import { Icon } from '../Icon'

interface EmptyStateProps {
  icon?: string
  text: string
  compact?: boolean
}

// Consolidates the many ad hoc "No calls yet" / "No invoices yet." one-off
// strings scattered across pages into one consistent icon+message shape.
export function EmptyState({ icon = 'inbox', text, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center text-text-muted ${
        compact ? 'py-6' : 'py-10'
      }`}
    >
      <Icon name={icon} className="text-[22px] text-muted" />
      <p className="max-w-xs text-xs">{text}</p>
    </div>
  )
}
