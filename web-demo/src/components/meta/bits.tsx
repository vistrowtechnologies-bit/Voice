import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { Card } from '../ui/Card'
import { formatRelativeTime } from '../../lib/api'
import { utcTime } from '../IntegrationBits'
import { META_STATUS_LABEL } from '../../lib/metaLeads'

// The same shapes IntegrationDetail.tsx uses for every other integration,
// so the Meta sections sit in the page without a visible seam.

export const META_INPUT =
  'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60'

export function MetaPanel({
  title,
  icon,
  subtitle,
  action,
  children,
}: {
  title: string
  icon: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card variant="flat" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon name={icon} className="mt-0.5 text-[18px] text-primary" />
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

export function MetaPrimaryButton({ icon, onClick, disabled, children }: { icon: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={icon} className="text-[15px]" />
      {children}
    </button>
  )
}

export function MetaSecondaryButton({ icon, onClick, disabled, children }: { icon: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-text hover:border-primary disabled:opacity-50"
    >
      <Icon name={icon} className="text-[15px]" />
      {children}
    </button>
  )
}

export function MetaTile({ icon, label, value, alert = false }: { icon: string; label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}`}>
        <Icon name={icon} className="text-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
        <p className={`truncate text-base font-bold ${alert ? 'text-destructive' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

/** "3 min ago" for the server's UTC "YYYY-MM-DD HH:MM:SS" stamps. */
export function metaTimeAgo(value: string | null | undefined): string {
  return value ? formatRelativeTime(utcTime(value)) : 'never'
}

const CHIP: Record<string, string> = {
  queued: 'bg-success/10 text-success',
  test: 'bg-primary/10 text-primary',
  received: 'bg-surface-high text-text-muted',
  fetched: 'bg-surface-high text-text-muted',
  skipped: 'bg-surface-high text-text-muted',
  stale: 'bg-surface-high text-text-muted',
  failed: 'bg-destructive/10 text-destructive',
}

export function MetaStatusChip({ status }: { status: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[status] ?? CHIP.received}`}>
      {META_STATUS_LABEL[status] ?? status}
    </span>
  )
}
