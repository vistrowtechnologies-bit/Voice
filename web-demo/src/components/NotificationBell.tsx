import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { fetchNotifications } from '../lib/api'
import type { AppNotification } from '../lib/types'

// The feed itself is derived server-side and never stored, so "I dismissed
// this" has nowhere on the server to live. Keeping it here is a deliberate
// trade: dismissal is per-browser, but the VALUES in a notification can
// never drift from the page they link to - which is the failure mode a
// stored feed invites (Agni's header and dashboard disagree on credits).
const DISMISSED_KEY = 'vistrow.notifications.dismissed'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeDismissed(ids: string[]): void {
  try {
    // Bounded so a long-lived browser cannot grow this without limit; ids
    // are content-derived, so an evicted one simply reappears once.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-200)))
  } catch {
    /* private mode / quota - dismissal just won't persist */
  }
}

const SEVERITY_STYLE: Record<AppNotification['severity'], { dot: string; icon: string }> = {
  critical: { dot: 'bg-destructive', icon: 'error' },
  warning: { dot: 'bg-amber-500', icon: 'warning' },
  info: { dot: 'bg-primary', icon: 'info' },
}

// Long enough that it is never a load concern, short enough that a credit
// warning appears within a working session without a manual refresh.
const POLL_MS = 120_000

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchNotifications()
        .then((n) => {
          if (!cancelled) setItems(n)
        })
        .catch(() => {
          /* the bell is ambient - a failed poll must never surface an error */
        })
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = items.filter((i) => !dismissed.includes(i.id))

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    writeDismissed(next)
  }

  const dismissAll = () => {
    const next = [...dismissed, ...visible.map((i) => i.id)]
    setDismissed(next)
    writeDismissed(next)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={visible.length ? `Notifications (${visible.length} needing attention)` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-primary hover:text-text sm:h-9 sm:w-9"
      >
        <Icon name="notifications" className="text-[18px]" />
        {visible.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {visible.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-28 z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(22rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Attention</p>
            {visible.length > 0 && (
              <button type="button" onClick={dismissAll} className="text-[11px] text-text-muted hover:text-text">
                Dismiss all
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">Nothing needs your attention.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {visible.map((n) => (
                <li key={n.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_STYLE[n.severity].dot}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        navigate(n.to)
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{n.body}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss(n.id)}
                      aria-label={`Dismiss: ${n.title}`}
                      className="shrink-0 text-text-muted hover:text-text"
                    >
                      <Icon name="close" className="text-[15px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
