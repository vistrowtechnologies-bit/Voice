import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { dismissNotifications, fetchNotifications } from '../lib/api'
import { PREFS_CHANGED_EVENT, playChime, showDesktopAlert } from '../lib/alerts'
import { apiProfilePreferences } from '../lib/auth'
import type { UserPreferences } from '../lib/auth'
import type { AppNotification } from '../lib/types'

const SEVERITY_STYLE: Record<AppNotification['severity'], { dot: string; icon: string }> = {
  critical: { dot: 'bg-destructive', icon: 'error' },
  warning: { dot: 'bg-amber-500', icon: 'warning' },
  info: { dot: 'bg-primary', icon: 'info' },
}

// A call or booking should show up while someone is watching the dashboard, so poll every
// 30s while the tab is visible (hidden tabs skip the request) and refetch the moment the
// person comes back to the tab.
const POLL_MS = 30_000

function ago(iso: string | null): string {
  if (!iso) return ''
  // Server timestamps are UTC; some carry no zone suffix.
  const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.round(hrs / 24)} d ago`
}

const KIND_ICON: Record<string, string> = { call: 'call', appointment: 'event' }

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  // Read on the server per person; this only bridges the gap until the next refresh.
  const [dismissed, setDismissed] = useState<string[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const prefsRef = useRef<Pick<UserPreferences, 'desktop_popups' | 'notify_sound'> | null>(null)
  // Ids already announced. null until the first load so opening the dashboard never chimes
  // for things that were already waiting.
  const announced = useRef<Set<string> | null>(null)

  useEffect(() => {
    const loadPrefs = () =>
      apiProfilePreferences()
        .then((p) => {
          prefsRef.current = p
        })
        .catch(() => {})
    loadPrefs()
    window.addEventListener(PREFS_CHANGED_EVENT, loadPrefs)
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, loadPrefs)
  }, [])

  useEffect(() => {
    let cancelled = false
    const announce = (fresh: AppNotification[]) => {
      const seen = announced.current
      announced.current = new Set(fresh.map((n) => n.id))
      if (!seen) return
      const added = fresh.filter((n) => !seen.has(n.id))
      if (!added.length) return
      const prefs = prefsRef.current
      if (prefs?.notify_sound) playChime()
      // A pop-up is for when you are looking at something else; in the foreground the bell is enough.
      if (prefs?.desktop_popups && document.visibilityState === 'hidden') {
        const first = added[0]
        showDesktopAlert(
          added.length > 1 ? `${added.length} new notifications` : first.title,
          added.length > 1 ? added.map((n) => n.title).slice(0, 3).join('\n') : first.body,
          first.id,
          () => navigate(first.to),
        )
      }
    }
    const load = () =>
      fetchNotifications()
        .then((n) => {
          if (cancelled) return
          announce(n)
          setItems(n)
        })
        .catch(() => {
          /* the bell is ambient - a failed poll must never surface an error */
        })
    const loadIfVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    load()
    const t = setInterval(loadIfVisible, POLL_MS)
    document.addEventListener('visibilitychange', loadIfVisible)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', loadIfVisible)
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

  const markRead = (ids: string[]) => {
    setDismissed((d) => [...d, ...ids])
    dismissNotifications(ids).catch(() => {
      // Saving failed: show them again rather than pretend they were read.
      setDismissed((d) => d.filter((x) => !ids.includes(x)))
    })
  }
  const dismiss = (id: string) => markRead([id])
  const dismissAll = () => markRead(visible.map((i) => i.id))

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={visible.length ? `Notifications (${visible.length} needing attention)` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-high hover:text-text sm:h-9 sm:w-9"
      >
        <Icon name="notifications" className="text-[22px]" />
        {visible.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {visible.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-28 z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(24rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Notifications</p>
            {visible.length > 0 && (
              <button type="button" onClick={dismissAll} className="text-[11px] text-text-muted hover:text-text">
                Mark all read
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">You're all caught up. New calls, bookings and alerts show up here.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {visible.map((n) => (
                <li key={n.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    {n.kind ? (
                      <Icon name={KIND_ICON[n.kind]} className="mt-0.5 shrink-0 text-[17px] text-primary" />
                    ) : (
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_STYLE[n.severity].dot}`} />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        // Opening it is reading it; land on the exact call, booking or setting.
                        setOpen(false)
                        markRead([n.id])
                        navigate(n.to)
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{n.body}</p>
                      {n.at && <p className="mt-0.5 text-[11px] text-text-muted/80">{ago(n.at)}</p>}
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
