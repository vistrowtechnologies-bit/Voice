import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { NAV_GROUPS } from './navGroups'
import { fetchAgents, fetchCalls, fetchContacts, fetchKnowledgeBases } from '../lib/api'

interface Item {
  id: string
  label: string
  hint?: string
  icon: string
  group: string
  to: string
}

// Pages are always available offline; the record groups below are fetched
// lazily the first time the palette opens, so opening it costs nothing on
// every dashboard page load.
function pageItems(): Item[] {
  return NAV_GROUPS.flatMap((g) =>
    g.items.map((i) => ({
      id: `page:${i.to}`,
      label: i.label,
      icon: i.icon,
      group: 'Pages',
      to: i.to,
    })),
  )
}

/** Case-insensitive subsequence match, so "callhist" finds "All Calls
 * History" and "agdet" finds an agent. Returns a score (lower is better) so
 * tighter matches float up, or null when it does not match at all. */
function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const direct = t.indexOf(q)
  // A literal substring always beats a scattered subsequence.
  if (direct !== -1) return direct
  let ti = 0
  let firstHit = -1
  let gaps = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (firstHit === -1) firstHit = found
    gaps += found - ti
    ti = found + 1
  }
  return 1000 + firstHit + gaps
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<Item[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Cmd/Ctrl+K toggles. Deliberately does NOT fire while the user is typing
  // in a field - some browsers and password managers bind the same chord,
  // and stealing it mid-form would lose input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const el = document.activeElement
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable)
        // Still allow closing from inside our own input.
        if (typing && el !== inputRef.current) return
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Reset per-open, and pull the searchable records once.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
    if (records !== null) return
    let cancelled = false
    Promise.all([
      fetchAgents().catch(() => []),
      fetchContacts().catch(() => []),
      fetchCalls({}).catch(() => []),
      fetchKnowledgeBases().catch(() => []),
    ]).then(([agents, contacts, calls, kbs]) => {
      if (cancelled) return
      setRecords([
        ...agents.map((a) => ({
          id: `agent:${a.id}`,
          label: a.name,
          hint: a.status,
          icon: 'smart_toy',
          group: 'Agents',
          to: `/dashboard/agents/${a.id}`,
        })),
        ...contacts.map((c) => ({
          id: `contact:${c.id}`,
          label: c.name || c.phone,
          hint: c.phone,
          icon: 'contacts',
          group: 'Contacts',
          to: `/dashboard/contacts`,
        })),
        // Capped: the palette is for jumping to a known record, not for
        // browsing history - the Calls page already does that better.
        ...calls.slice(0, 100).map((c) => ({
          id: `call:${c.id}`,
          label: c.name || 'Unknown caller',
          hint: `${c.agent} · ${c.channel}`,
          icon: 'history',
          group: 'Calls',
          to: `/dashboard/calls/${c.id}`,
        })),
        ...kbs.map((k) => ({
          id: `kb:${k.id}`,
          label: k.name,
          hint: `${k.sources.length} sources`,
          icon: 'menu_book',
          group: 'Knowledge Base',
          to: `/dashboard/knowledge`,
        })),
      ])
    })
    return () => {
      cancelled = true
    }
  }, [open, records])

  const results = useMemo(() => {
    const all = [...pageItems(), ...(records ?? [])]
    const scored: { item: Item; score: number }[] = []
    for (const item of all) {
      const s = fuzzyScore(`${item.label} ${item.hint ?? ''}`, query.trim())
      if (s !== null) scored.push({ item, score: s })
    }
    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, 40).map((s) => s.item)
  }, [query, records])

  useEffect(() => setActive(0), [query])

  // Keep the highlighted row in view when navigating with the keyboard.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (item: Item) => {
    setOpen(false)
    navigate(item.to)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active])
    }
  }

  let lastGroup = ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Icon name="search" className="text-[18px] text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search pages, agents, contacts, calls…"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">esc</kbd>
        </div>

        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-text-muted">
              {records === null ? 'Loading…' : `No matches for “${query}”`}
            </li>
          ) : (
            results.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null
              lastGroup = item.group
              return (
                <li key={item.id}>
                  {header && (
                    <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                      i === active ? 'bg-surface-high text-text' : 'text-text-muted'
                    }`}
                  >
                    <Icon name={item.icon} className="shrink-0 text-[17px]" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 truncate text-xs text-text-muted">{item.hint}</span>}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
