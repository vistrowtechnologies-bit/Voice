import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { NAV_GROUPS } from './navGroups'
import { fetchAgents, fetchAppointments, fetchCalls, fetchContacts, fetchKnowledgeBases } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  ALT_LABEL,
  CHORD_WINDOW_MS,
  CREATE_CHORDS,
  GO_CHORDS,
  MOD_LABEL,
  OPEN_EVENT,
  chordTarget,
  groupInOrder,
  hasMod,
  isTypingTarget,
  loadRecents,
  openCommandMenu,
  pushRecent,
  rankItems,
} from '../lib/commandMenu'
import type { MenuItem } from '../lib/commandMenu'
import { applyTheme, useTheme } from '../lib/theme'

interface Item extends MenuItem {
  run: () => void
}

// What a shortcut chip shows for a "G then D" chord.
const chord = (first: string, second: string) => [first.toUpperCase(), second.toUpperCase()]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-surface-high px-1.5 font-sans text-[11px] font-semibold leading-none text-text-muted">
      {children}
    </kbd>
  )
}

function Shortcut({ keys }: { keys: string[] }) {
  const isChord = keys.length === 2 && keys[0].length === 1 && keys[1].length === 1
  return (
    <span className="flex shrink-0 items-center gap-1 [@media(hover:none)]:hidden" aria-hidden="true">
      {keys.map((k, i) => (
        <Fragment key={`${k}${i}`}>
          {isChord && i === 1 && <span className="text-[10px] text-text-muted/70">then</span>}
          <Kbd>{k}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

/** The header search field, styled like an input: icon, "Search", and the
 * shortcut for this machine on the right (⌘K on Mac, Ctrl K on Windows).
 * Clicking it opens the menu. On phones it shrinks to an icon button. */
export function CommandMenuButton() {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label="Search and commands"
      aria-haspopup="dialog"
      className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-muted shadow-sm transition-colors hover:border-primary hover:text-text sm:h-9 md:w-56 md:justify-start md:px-3 lg:w-72 xl:w-80"
    >
      <Icon name="search" className="text-[19px]" />
      <span className="hidden flex-1 text-left md:inline">Search</span>
      <span className="hidden items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold leading-none md:flex [@media(hover:none)]:md:hidden" aria-hidden="true">
        {MOD_LABEL === '⌘' ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  )
}

type Mode = 'search' | 'shortcuts'

export function CommandPalette() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const theme = useTheme()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<Record<string, Item[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [recents, setRecents] = useState<string[]>(() => loadRecents())
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const pending = useRef<{ key: string; at: number } | null>(null)
  const heldTimer = useRef<number | undefined>(undefined)
  const queryRef = useRef('')
  queryRef.current = query

  const close = useCallback(() => setOpen(false), [])
  const goTo = useCallback((to: string) => navigate(to), [navigate])

  const show = useCallback((m: Mode = 'search') => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMode(m)
    setOpen(true)
  }, [])

  // Things you can do, not just places you can go.
  const actions = useMemo<Item[]>(() => {
    const list: Item[] = [
      { id: 'act:new-agent', label: 'New agent', description: 'Create a voice agent', keywords: 'create add', icon: 'smart_toy', group: 'Actions', shortcut: chord('c', 'a'), run: () => goTo(CREATE_CHORDS.a.to) },
      { id: 'act:new-contact', label: 'New contact', description: 'Add a person to your contacts', keywords: 'create add lead', icon: 'person_add', group: 'Actions', shortcut: chord('c', 'c'), run: () => goTo(CREATE_CHORDS.c.to) },
      { id: 'act:import', label: 'Import contacts', description: 'Upload a CSV or Excel sheet', keywords: 'upload csv xlsx excel bulk', icon: 'upload_file', group: 'Actions', shortcut: chord('c', 'i'), run: () => goTo(CREATE_CHORDS.i.to) },
      { id: 'act:new-appt', label: 'New appointment', description: 'Book a time on the calendar', keywords: 'create schedule booking', icon: 'event_available', group: 'Actions', shortcut: chord('c', 'p'), run: () => goTo(CREATE_CHORDS.p.to) },
      { id: 'act:theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', description: 'Change how the dashboard looks', keywords: 'theme appearance dark light', icon: theme === 'dark' ? 'light_mode' : 'dark_mode', group: 'Actions', run: () => applyTheme(theme === 'dark' ? 'light' : 'dark') },
      { id: 'act:shortcuts', label: 'Keyboard shortcuts', description: 'See every shortcut', keywords: 'keys hotkeys help cheat sheet', icon: 'keyboard', group: 'Actions', shortcut: ['?'], run: () => setMode('shortcuts') },
      { id: 'act:help', label: 'Help & Support', description: 'Guides, answers and contact', keywords: 'docs support', icon: 'support_agent', group: 'Actions', shortcut: chord('g', 'u'), run: () => goTo('/dashboard/support') },
    ]
    if (user?.isPlatformOwner && !user?.impersonating) {
      list.push({ id: 'act:admin', label: 'Admin panel', description: 'Platform owner tools', keywords: 'owner', icon: 'shield_person', group: 'Actions', run: () => goTo('/admin') })
    }
    list.push({
      id: 'act:logout',
      label: 'Sign out',
      description: 'End this session',
      keywords: 'logout log out exit',
      icon: 'logout',
      group: 'Actions',
      run: () => { void logout().then(() => navigate('/login', { replace: true })) },
    })
    return list
  }, [theme, user, goTo, logout, navigate])

  const pages = useMemo<Item[]>(() => {
    const byRoute = new Map(Object.entries(GO_CHORDS).map(([k, v]) => [v.to, k]))
    return NAV_GROUPS.flatMap((g) =>
      g.items.map((i) => {
        const k = byRoute.get(i.to)
        return {
          id: `page:${i.to}`,
          label: i.label,
          description: g.title,
          icon: i.icon,
          group: 'Pages',
          shortcut: k ? chord('g', k) : undefined,
          run: () => goTo(i.to),
        }
      }),
    )
  }, [goTo])

  // Records are fetched each time the menu opens (fresh after you add one).
  // Each group lands as soon as its own request returns, and the previous
  // list stays on screen meanwhile, so one slow endpoint never holds up the rest.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const land = <T,>(group: string, load: Promise<T[]>, toItem: (row: T) => Omit<Item, 'group'>) =>
      load
        .catch(() => [] as T[])
        .then((rows) => {
          if (cancelled) return
          setRecords((prev) => ({ ...prev, [group]: rows.map((r) => ({ ...toItem(r), group })) }))
        })
    void Promise.all([
      land('Agents', fetchAgents(), (a) => ({ id: `agent:${a.id}`, label: a.name, description: `Agent · ${a.status}`, icon: 'smart_toy', run: () => goTo(`/dashboard/agents/${a.id}`) })),
      land('Contacts', fetchContacts(), (c) => ({ id: `contact:${c.id}`, label: c.name || c.phone, description: c.name ? `Contact · ${c.phone}` : 'Contact', keywords: `${c.phone} ${c.email ?? ''} ${c.company ?? ''}`, icon: 'contacts', run: () => goTo(`/dashboard/contacts/${c.id}`) })),
      // Capped: this is for jumping to a known record; the Calls page browses.
      land('Calls', fetchCalls({}).then((l) => l.slice(0, 100)), (c) => ({ id: `call:${c.id}`, label: c.name || 'Unknown caller', description: `Call · ${c.agent} · ${c.channel}`, keywords: String(c.id), icon: 'history', run: () => goTo(`/dashboard/calls/${c.id}`) })),
      land('Appointments', fetchAppointments().then((l) => l.slice(0, 100)), (a) => ({ id: `appt:${a.id}`, label: a.name || 'Appointment', description: `Appointment · ${a.date} ${a.time}`, keywords: `${a.phone} ${a.purpose}`, icon: 'event', run: () => goTo(`/dashboard/appointments?date=${a.date}&id=${a.id}`) })),
      land('Knowledge Base', fetchKnowledgeBases(), (k) => ({ id: `kb:${k.id}`, label: k.name, description: `Knowledge base · ${k.sources.length} sources`, icon: 'menu_book', run: () => goTo('/dashboard/knowledge') })),
    ]).then(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [open, goTo])

  // Open/close, the shortcuts, and the G/C chords. Capture phase, so a chord's
  // second key never also reaches a page's own single-letter shortcut (the
  // Appointments page uses D, W, M, L, T and N).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const k = e.key.toLowerCase()
      // ⌘K / Ctrl+K from anywhere, either key on every OS.
      if (hasMod(e) && !e.altKey && !e.shiftKey && k === 'k') {
        e.preventDefault()
        e.stopPropagation()
        if (open) close(); else show('search')
        return
      }
      // Menu open with an empty search box: G or C waits for a second key, so
      // the chord chips shown in the list work here too. Anything that is not
      // a chord is typed into the box as usual, nothing is lost.
      if (open) {
        if (mode !== 'search' || queryRef.current !== '' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
        const held = pending.current
        const printable = e.key.length === 1
        if (held && Date.now() - held.at <= CHORD_WINDOW_MS) {
          pending.current = null
          window.clearTimeout(heldTimer.current)
          const hit = printable ? chordTarget(held.key, k) : null
          if (hit) {
            e.preventDefault()
            e.stopPropagation()
            close()
            navigate(hit.to)
          } else if (printable) {
            e.preventDefault()
            setQuery(held.key + e.key)
          } else {
            setQuery(held.key)
          }
          return
        }
        if (printable && (k === 'g' || k === 'c')) {
          e.preventDefault()
          pending.current = { key: k, at: Date.now() }
          window.clearTimeout(heldTimer.current)
          heldTimer.current = window.setTimeout(() => {
            if (pending.current?.key === k) { pending.current = null; setQuery(k) }
          }, CHORD_WINDOW_MS)
        }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) { pending.current = null; return }

      if (e.key === '?') {
        e.preventDefault()
        show('shortcuts')
        return
      }
      const first = pending.current
      if (first && Date.now() - first.at <= CHORD_WINDOW_MS) {
        pending.current = null
        const hit = chordTarget(first.key, k)
        if (hit) {
          e.preventDefault()
          e.stopPropagation()
          navigate(hit.to)
        }
        return
      }
      pending.current = k === 'g' || k === 'c' ? { key: k, at: Date.now() } : null
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, mode, close, show, navigate])

  useEffect(() => {
    const onOpen = () => show('search')
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [show])

  // Fresh state each time it opens; hand focus back when it closes.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setRecents(loadRecents())
      return
    }
    returnFocus.current?.focus?.()
  }, [open])
  useEffect(() => { if (open && mode === 'search') inputRef.current?.focus() }, [open, mode])

  const everything = useMemo(() => [...actions, ...pages, ...Object.values(records).flat()], [actions, pages, records])

  const rows = useMemo<Item[]>(() => {
    if (query.trim()) return rankItems(everything, query)
    const byId = new Map(everything.map((i) => [i.id, i]))
    const recent = recents
      .map((id) => byId.get(id))
      .filter((i): i is Item => !!i)
      .map((i) => ({ ...i, group: 'Recent' }))
    return [...recent, ...actions, ...pages]
  }, [query, everything, recents, actions, pages])

  const groups = useMemo(() => groupInOrder(rows), [rows])
  // Keyboard order must equal screen order, so index across the grouped list.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (item: Item) => {
    if (item.id !== 'act:logout') setRecents(pushRecent(item.id))
    // Actions that change this menu (shortcuts view) keep it open; the rest close it.
    const stays = item.id === 'act:shortcuts'
    if (!stays) close()
    item.run()
  }

  const onInputKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      choose(flat[active])
    } else if (e.key === 'Tab') {
      e.preventDefault() // focus stays in the search box; arrows move the selection
    }
  }

  const panel =
    mode === 'shortcuts' ? (
      <ShortcutsSheet onBack={() => setMode('search')} onClose={close} />
    ) : (
      <>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Icon name="search" className="text-[20px] text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search or run a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Search or run a command"
            autoComplete="off"
            spellCheck={false}
            className="vv-bare-field min-w-0 flex-1 bg-transparent py-4 text-base outline-none placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted hover:bg-surface-high hover:text-text md:hidden"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
          <span className="hidden items-center gap-1 md:flex [@media(hover:none)]:md:hidden">
            <Kbd>{MOD_LABEL}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>

        <ul id={listId} ref={listRef} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {flat.length === 0 ? (
            <li role="presentation" className="flex flex-col items-center gap-1 px-3 py-10 text-center">
              <Icon name="search_off" className="text-[28px] text-text-muted" />
              <p className="text-sm font-semibold">{loaded ? `No results for “${query}”` : 'Searching…'}</p>
              <p className="text-xs text-text-muted">Try an agent, contact or page name, or a command like “new contact”.</p>
            </li>
          ) : (
            groups.map((g, gi) => (
              <Fragment key={g.group}>
                {gi > 0 && <li role="presentation" aria-hidden="true" className="mx-2 my-1.5 border-t border-border" />}
                <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{g.group}</li>
                {g.items.map((item) => {
                  const i = flat.indexOf(item)
                  const on = i === active
                  return (
                    <li
                      key={`${g.group}:${item.id}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={on}
                      data-index={i}
                      onMouseMove={() => { if (!on) setActive(i) }}
                      onClick={() => choose(item)}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${on ? 'bg-surface-high' : ''}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted">
                        <Icon name={item.icon} className="text-[19px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">{item.label}</span>
                        {item.description && <span className="block truncate text-xs text-text-muted">{item.description}</span>}
                      </span>
                      {item.shortcut && <Shortcut keys={item.shortcut} />}
                    </li>
                  )
                })}
              </Fragment>
            ))
          )}
        </ul>

        <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-text-muted md:flex [@media(hover:none)]:md:hidden">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
          <button type="button" onClick={() => setMode('shortcuts')} className="ml-auto bg-transparent text-xs font-semibold text-text-muted hover:text-text">
            All shortcuts <Kbd>?</Kbd>
          </button>
        </div>
      </>
    )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-3 pt-[8vh] backdrop-blur-[2px] sm:p-4 sm:pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
      role="presentation"
    >
      <div
        className="flex max-h-[80dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
      >
        {panel}
      </div>
    </div>
  )
}

function ShortcutsSheet({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const goRows = Object.entries(GO_CHORDS).map(([k, v]) => ({ label: v.label, keys: chord('g', k) }))
  const newRows = Object.entries(CREATE_CHORDS).map(([k, v]) => ({ label: v.label, keys: chord('c', k) }))
  const sections: { title: string; rows: { label: string; keys: string[] }[] }[] = [
    {
      title: 'General',
      rows: [
        { label: 'Open the command menu', keys: [MOD_LABEL, 'K'] },
        { label: 'Show this list', keys: ['?'] },
        { label: 'Hide or show the sidebar', keys: [MOD_LABEL, 'B'] },
        { label: 'Close any panel', keys: ['Esc'] },
      ],
    },
    { title: 'Go to a page (press G, then…)', rows: goRows },
    { title: 'Create (press C, then…)', rows: newRows },
    {
      title: 'Calendar page',
      rows: [
        { label: 'Day, week, month, list', keys: ['D', 'W', 'M', 'L'] },
        { label: 'Today', keys: ['T'] },
        { label: 'New appointment', keys: ['N'] },
        { label: 'Previous or next', keys: [`←`, `→`] },
        { label: 'Search', keys: ['/'] },
      ],
    },
  ]
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); onBack() }
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button type="button" onClick={onBack} aria-label="Back to search" className="flex h-9 w-9 items-center justify-center rounded-lg bg-transparent text-text-muted hover:bg-surface-high hover:text-text">
          <Icon name="arrow_back" className="text-[20px]" />
        </button>
        <h2 className="flex-1 text-base font-semibold">Keyboard shortcuts</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg bg-transparent text-text-muted hover:bg-surface-high hover:text-text">
          <Icon name="close" className="text-[20px]" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <p className="mb-3 text-xs text-text-muted">
          On this computer the shortcut key is <strong className="text-text">{MOD_LABEL}</strong>
          {MOD_LABEL === '⌘' ? ` (Command). ${ALT_LABEL} is Option.` : ' (Control).'} Keys inside a chord are pressed one after the other, not together.
        </p>
        {sections.map((s) => (
          <section key={s.title} className="mb-4">
            <h3 className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{s.title}</h3>
            <ul className="divide-y divide-border">
              {s.rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.keys.map((k, i) => (
                      <Fragment key={`${k}${i}`}>
                        {s.title.includes('then') && i === 1 && <span className="text-[10px] text-text-muted/70">then</span>}
                        <Kbd>{k}</Kbd>
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
