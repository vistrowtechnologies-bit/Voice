import { Card } from './Card'
import { Icon } from '../Icon'

// Canonical KPI/metric tile, replacing the near-duplicate MetricCard
// (Dashboard.tsx) and StatCard (CallsHistory.tsx) implementations that had
// converged on the same shape independently.
export type StatTone = 'primary' | 'cyan' | 'magenta' | 'amber' | 'success' | 'muted' | 'destructive'

const TONE_STYLES: Record<StatTone, { chip: string; text: string; border: string }> = {
  primary: { chip: 'bg-primary/15 text-primary', text: 'text-primary', border: 'hover:border-primary/50' },
  cyan: { chip: 'bg-cyan/15 text-cyan', text: 'text-cyan', border: 'hover:border-cyan/50' },
  magenta: { chip: 'bg-magenta/15 text-magenta', text: 'text-magenta', border: 'hover:border-magenta/50' },
  amber: { chip: 'bg-amber/15 text-amber', text: 'text-amber', border: 'hover:border-amber/50' },
  success: { chip: 'bg-success/15 text-success', text: 'text-success', border: 'hover:border-success/50' },
  muted: { chip: 'bg-muted/15 text-text-muted', text: 'text-text-muted', border: 'hover:border-muted/50' },
  destructive: { chip: 'bg-destructive/15 text-destructive', text: 'text-destructive', border: 'hover:border-destructive/50' },
}

interface StatTileProps {
  label: string
  value: string
  hint?: string
  icon?: string
  pulse?: boolean
  tone?: StatTone
  /** Compact drops the hint line and tightens padding — used for slim secondary strips. */
  compact?: boolean
}

export function StatTile({ label, value, hint, icon, pulse, tone = 'cyan', compact = false }: StatTileProps) {
  const t = TONE_STYLES[tone]
  return (
    <Card variant="stat" padding={compact ? 'sm' : 'md'} className={t.border}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
          <p className={`mt-1 font-bold ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
          {pulse ? (
            <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-current" />
          ) : (
            icon && <Icon name={icon} className="text-[18px]" />
          )}
        </div>
      </div>
      {!compact && hint && <p className={`mt-2 text-xs ${t.text}`}>{hint}</p>}
    </Card>
  )
}
