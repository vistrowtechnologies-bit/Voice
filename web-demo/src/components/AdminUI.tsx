// Shared building blocks for the super-admin screens - the "Mission Control"
// component vocabulary (stat cards, pills, tables, cards) rendered in the app's
// own design tokens (violet primary, surface/border) rather than a separate
// palette, so it stays consistent with the tenant dashboard.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

export function AdminCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>
}

export function StatCard({
  label,
  value,
  sub,
  delta,
  icon,
  live,
}: {
  label: string
  value: ReactNode
  sub?: string
  delta?: { text: string; positive?: boolean }
  icon?: string
  live?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        {live ? (
          <span className="h-2 w-2 rounded-full bg-success pulse-dot" />
        ) : delta ? (
          <span className={`text-xs font-bold ${delta.positive ? 'text-success' : 'text-text-muted'}`}>{delta.text}</span>
        ) : icon ? (
          <Icon name={icon} className="text-[18px] text-primary" />
        ) : null}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  )
}

const PILL_STYLES: Record<string, string> = {
  active: 'border-success/40 bg-success/10 text-success',
  suspended: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-amber/40 bg-amber/10 text-amber',
  neutral: 'border-border bg-surface-high text-text-muted',
  primary: 'border-primary/40 bg-primary/10 text-primary',
}

export function Pill({ tone = 'neutral', children }: { tone?: keyof typeof PILL_STYLES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PILL_STYLES[tone]}`}>
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <Pill tone={active ? 'active' : 'suspended'}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-destructive'}`} />
      {status}
    </Pill>
  )
}

export function PlanPill({ plan }: { plan: string }) {
  return <Pill tone={plan === 'free' ? 'neutral' : 'primary'}>{plan || 'free'}</Pill>
}

/** Horizontal usage/credit bar. */
export function MiniBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const danger = pct >= 90
  const warn = pct >= 80
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-high">
        <div
          className={`h-full rounded-full ${danger ? 'bg-destructive' : warn ? 'bg-amber' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-text-muted">
        {Math.round(used)}/{Math.round(total)}
      </span>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface-high py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
      />
    </div>
  )
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-transparent text-text-muted hover:border-primary/50'
      }`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon name={icon} className="text-[32px] text-text-muted" />
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  )
}

export function TimeRange({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  const opts = [
    { d: 1, label: 'Today' },
    { d: 7, label: '7d' },
    { d: 30, label: '30d' },
    { d: 90, label: '90d' },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
      {opts.map((o) => (
        <button
          key={o.d}
          onClick={() => onChange(o.d)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.d ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Run `load` now and every `intervalMs`, pausing while the tab is hidden and
 * refreshing immediately when it becomes visible again. `load` must be stable
 * (useCallback) or the timer restarts on every render. */
export function useVisiblePoll(load: () => void, intervalMs: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer === null) timer = setInterval(load, intervalMs)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        load()
        start()
      }
    }
    load()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load, intervalMs])
}

/** Inline load-failure state with a Retry button - distinct from "no results". */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon name="error" className="text-[32px] text-destructive" />
      <p className="max-w-md text-sm text-destructive">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:border-primary">
          Retry
        </button>
      )}
    </div>
  )
}

/** Backend message from a thrown admin API error (adminApi surfaces `detail`). */
export function errMsg(e: unknown, fallback = 'Request failed'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** Focus ring for a clickable table row reached by keyboard. */
export const ROW_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

/** Props that make a clickable <tr> keyboard-reachable: Tab to it, Enter/Space opens. */
export function rowLinkProps(open: () => void) {
  return {
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}

/** Modal plumbing for hand-rolled dialogs: Esc closes, focus moves inside on
 * open (first input, else first focusable) and returns to the opener on close.
 * Spread the returned ref onto the dialog container. */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = ref.current
    const target =
      el?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ??
      el?.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    target?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])
  return ref
}

/** Absolute local time for a `title` tooltip next to a relative "2m ago". */
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts.replace(' ', 'T') + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Relative "2m ago" / "3d ago" from an ISO/pg timestamp string. */
export function timeAgo(ts: string | null): string {
  if (!ts) return '-'
  const then = new Date(ts.replace(' ', 'T') + (ts.includes('Z') || ts.includes('+') ? '' : 'Z')).getTime()
  const diff = Date.now() - then
  if (Number.isNaN(diff)) return ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(then).toLocaleDateString()
}

export function fmtDate(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts.replace(' ', 'T') + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds || 0)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtINR(n: number): string {
  return (n < 0 ? '-₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN')
}

/** Dependency-free area chart from a numeric series. */
export function AreaChart({ data, height = 160 }: { data: number[]; height?: number }) {
  if (data.length === 0) return <EmptyState icon="show_chart" message="No data in this range yet." />
  const w = 600
  const max = Math.max(...data, 1)
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => [i * step, height - (v / max) * (height - 12) - 6])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="adminArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#adminArea)" />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const BAR_COLORS: Record<string, string> = {
  browser: 'var(--color-primary)',
  phone: 'var(--color-cyan)',
  widget: 'var(--color-amber)',
}

/** Labeled horizontal bars (e.g. calls by channel). */
export function BarList({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="capitalize text-text-muted">{it.label}</span>
            <span className="font-semibold tabular-nums">{it.value.toLocaleString()}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-high">
            <div
              className="h-full rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color || BAR_COLORS[it.label.toLowerCase()] || 'var(--color-primary)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
