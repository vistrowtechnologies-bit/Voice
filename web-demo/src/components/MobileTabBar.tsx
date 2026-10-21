import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { NAV_GROUPS, navItemActive, type NavItem } from './navGroups'
import { BrowserTestModal } from './AgentTestCall'
import { StorageWarning } from './StorageWarning'
import { Icon } from './Icon'
import { fetchAgents } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { AgentConfig } from '../lib/types'

// Phone and tablet navigation (owner, 21 Oct 2026): an app-style bottom tab
// bar with the pages people open most, a centre button that starts a test
// call, and "More" for every other page. Hidden from lg up, where the slim
// sidebar rail takes over.

const TABS: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/dashboard/agents', label: 'Agents', icon: 'smart_toy' },
  { to: '/dashboard/calls', label: 'Calls', icon: 'history' },
]
const IN_TABS = new Set(['/dashboard', '/dashboard/agents', '/dashboard/calls'])

/** The sidebar's groups minus what the tab bar already holds. Groups left with
 * one page (Settings, Help) are gathered under one "Account" heading. */
function moreGroups(): { title: string; items: NavItem[] }[] {
  const groups: { title: string; items: NavItem[] }[] = []
  const account: NavItem[] = []
  for (const group of NAV_GROUPS) {
    if (group.paletteOnly || group.pinned) continue
    const items = group.items.filter((item) => !IN_TABS.has(item.to))
    if (items.length === 1) account.push(items[0])
    else if (items.length > 1) groups.push({ title: group.title, items })
  }
  if (account.length) groups.push({ title: 'Account', items: account })
  return groups
}

export function MobileTabBar({ moreOpen, onMoreOpenChange }: { moreOpen: boolean; onMoreOpenChange: (open: boolean) => void }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [testPicker, setTestPicker] = useState<AgentConfig[] | null>(null)
  const [testAgent, setTestAgent] = useState<AgentConfig | null>(null)
  const [loadingTest, setLoadingTest] = useState(false)
  const sheetOpen = moreOpen || testPicker !== null

  // index.css lifts the help launcher and sticky save bars above the tab bar.
  useEffect(() => {
    document.documentElement.classList.add('vv-tabbar')
    return () => document.documentElement.classList.remove('vv-tabbar')
  }, [])

  // A sheet never outlives the page it was opened on.
  useEffect(() => {
    onMoreOpenChange(false)
    setTestPicker(null)
  }, [pathname, onMoreOpenChange])

  useEffect(() => {
    if (!sheetOpen) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onMoreOpenChange(false); setTestPicker(null) }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // The help launcher floats above everything; it would sit on the sheet.
    document.documentElement.classList.add('vv-sheet-open')
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.classList.remove('vv-sheet-open')
      window.removeEventListener('keydown', close)
    }
  }, [sheetOpen, onMoreOpenChange])

  const startTest = () => {
    if (loadingTest) return
    onMoreOpenChange(false)
    setLoadingTest(true)
    fetchAgents()
      .then((agents) => {
        const live = agents.filter((agent) => agent.status === 'live')
        // One live agent: call it straight away. Otherwise let the user pick.
        if (live.length === 1) setTestAgent(live[0])
        else setTestPicker(live)
      })
      .catch(() => setTestPicker([]))
      .finally(() => setLoadingTest(false))
  }

  const closeSheets = () => { onMoreOpenChange(false); setTestPicker(null) }
  const moreActive = moreOpen || !TABS.some((tab) => navItemActive(tab, pathname))
  const tabCls = (active: boolean) =>
    `flex h-full flex-col items-center justify-center gap-0.5 bg-transparent text-[10.5px] font-semibold transition-colors ${active ? 'text-primary' : 'text-text-muted'}`
  const dot = (active: boolean) => <span className={`h-1 w-1 rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`} />

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close" onClick={closeSheets} className="vv-sheet-fade absolute inset-0 h-full w-full bg-black/45" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={moreOpen ? 'All pages' : 'Test an agent'}
            className="vv-sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] border-t border-border bg-surface px-5 pt-3 shadow-2xl"
            style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            {moreOpen ? (
              <>
                <p className="font-display text-base font-bold">All pages</p>
                {moreGroups().map((group) => (
                  <section key={group.title} className="mt-4">
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-text-muted">{group.title}</p>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                      {group.items.map((item) => {
                        const active = navItemActive(item, pathname)
                        return (
                          <NavLink key={item.to} to={item.to} className="flex flex-col items-center gap-1.5 bg-transparent text-center text-[11px] font-semibold leading-tight text-text">
                            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${active ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                              <Icon name={item.icon} className="text-[22px]" />
                            </span>
                            {item.label}
                          </NavLink>
                        )
                      })}
                    </div>
                  </section>
                ))}
                {user?.isPlatformOwner && !user?.impersonating && (
                  <Link to="/admin" className="mt-5 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
                    <Icon name="shield_person" className="text-[19px]" /> Admin panel
                  </Link>
                )}
                <div className="mt-4"><StorageWarning compact /></div>
              </>
            ) : (
              <>
                <p className="font-display text-base font-bold">Test an agent</p>
                <p className="mt-0.5 text-xs text-text-muted">Talk to it in your browser, like a caller would.</p>
                {testPicker && testPicker.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {testPicker.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => { setTestPicker(null); setTestAgent(agent) }}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-bg px-3 py-2.5 text-left"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#c026d3] text-xs font-extrabold text-white">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{agent.name}</span>
                        <Icon name="call" className="text-[19px] text-primary" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-border bg-bg p-4 text-sm text-text-muted">
                    No live agent yet. Turn an agent on, then test it here.
                    <Link to="/dashboard/agents" className="mt-2 block font-semibold text-primary">Go to Agents</Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <nav
        aria-label="Main navigation"
        className="fixed left-1/2 z-40 grid h-16 w-[calc(100%-1.25rem)] max-w-md -translate-x-1/2 grid-cols-5 items-center rounded-[24px] border border-border bg-surface/90 shadow-[0_14px_30px_-18px_rgb(0_0_0/0.45)] backdrop-blur-xl lg:hidden"
        style={{ bottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        {TABS.slice(0, 2).map((tab) => {
          const active = !moreOpen && navItemActive(tab, pathname)
          return (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/dashboard'} className={tabCls(active)}>
              <Icon name={tab.icon} className="text-[23px]" />
              {tab.label}
              {dot(active)}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={startTest}
          aria-label="Test an agent"
          className="mx-auto -mt-7 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#7c3aed] to-[#c026d3] text-white shadow-[0_14px_26px_-10px_#7c3aed] transition-transform active:scale-95"
        >
          <Icon name={loadingTest ? 'progress_activity' : 'call'} className={`text-[26px] ${loadingTest ? 'animate-spin' : ''}`} />
        </button>
        {(() => {
          const tab = TABS[2]
          const active = !moreOpen && navItemActive(tab, pathname)
          return (
            <NavLink to={tab.to} className={tabCls(active)}>
              <Icon name={tab.icon} className="text-[23px]" />
              {tab.label}
              {dot(active)}
            </NavLink>
          )
        })()}
        <button type="button" onClick={() => { setTestPicker(null); onMoreOpenChange(!moreOpen) }} aria-expanded={moreOpen} className={tabCls(moreActive)}>
          <Icon name="apps" className="text-[23px]" />
          More
          {dot(moreActive)}
        </button>
      </nav>

      {testAgent && <BrowserTestModal agent={testAgent} onClose={() => setTestAgent(null)} />}
    </>
  )
}
