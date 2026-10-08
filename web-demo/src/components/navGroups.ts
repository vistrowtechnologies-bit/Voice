// The dashboard's route map, in one place so the sidebar and the command
// palette can never drift apart. Adding a page here puts it in BOTH - which
// is the point: Agni's own Appointments page is reachable from its command
// search but missing from its sidebar, and a route that exists in only one
// of the two is a route users cannot reliably find.
export interface NavItem {
  to: string
  label: string
  icon: string
  /** Anchor id for the product tour, where one targets this item. */
  tour?: string
  /** Route prefixes that also count as "this item" for highlighting: a sidebar entry that
   * opens one page of a tabbed set stays lit on all of its tabs. */
  match?: string[]
}

/** Whether the sidebar entry should be lit for this path. */
export function navItemActive(item: NavItem, pathname: string): boolean {
  return (item.match ?? [item.to]).some((prefix) =>
    prefix === '/dashboard' ? pathname === prefix : pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export interface NavGroup {
  title: string
  items: NavItem[]
  /** Render these as visible main-menu links instead of an accordion. */
  standalone?: boolean
  /** Show a quiet label above a set of main-menu links. */
  showHeading?: boolean
  /** Rendered pinned at the bottom of the sidebar instead of in the
   * scrolling list; still searchable from the command palette. */
  pinned?: boolean
  /** Reachable from the command palette and keyboard shortcuts, but not drawn in the sidebar. */
  paletteOnly?: boolean
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Dashboard',
    standalone: true,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', tour: 'nav-dashboard' },
    ],
  },
  {
    title: 'BUILD',
    standalone: true,
    showHeading: true,
    items: [
      { to: '/dashboard/agents', label: 'Agents', icon: 'smart_toy', tour: 'nav-agents' },
      { to: '/dashboard/knowledge', label: 'Knowledge Base', icon: 'menu_book', tour: 'nav-knowledge' },
    ],
  },
  {
    title: 'DEPLOY',
    standalone: true,
    showHeading: true,
    items: [
      {
        to: '/dashboard/channels',
        label: 'Channels',
        icon: 'dialpad',
        match: ['/dashboard/channels', '/dashboard/numbers', '/dashboard/inbound', '/dashboard/outbound', '/dashboard/website-widget'],
      },
    ],
  },
  {
    title: 'MONITOR',
    standalone: true,
    showHeading: true,
    items: [
      { to: '/dashboard/calls', label: 'Calls', icon: 'history' },
      { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts', match: ['/dashboard/contacts', '/dashboard/appointments'] },
    ],
  },
  {
    title: 'Settings',
    standalone: true,
    items: [
      {
        to: '/dashboard/settings',
        label: 'Settings',
        icon: 'settings',
        tour: 'nav-settings',
        match: ['/dashboard/settings', '/dashboard/billing', '/dashboard/integrations', '/dashboard/compliance'],
      },
    ],
  },
  {
    title: 'SUPPORT',
    standalone: true,
    showHeading: true,
    items: [{ to: '/dashboard/support', label: 'Help & Support', icon: 'support_agent' }],
  },
  {
    // Still one search or keyboard shortcut away, but no longer competing for sidebar space:
    // these live inside Agents, Channels, Contacts and Settings now.
    title: 'More pages',
    standalone: true,
    paletteOnly: true,
    items: [
      { to: '/dashboard/voices', label: 'Voices', icon: 'graphic_eq' },
      { to: '/dashboard/testing', label: 'Testing Lab', icon: 'science' },
      { to: '/dashboard/numbers', label: 'Phone Numbers', icon: 'dialpad' },
      { to: '/dashboard/inbound', label: 'Inbound routing', icon: 'phone_callback' },
      { to: '/dashboard/outbound', label: 'Outbound campaigns', icon: 'campaign' },
      { to: '/dashboard/website-widget', label: 'Website widget', icon: 'widgets' },
      { to: '/dashboard/appointments', label: 'Appointments', icon: 'event' },
      { to: '/dashboard/integrations', label: 'Integrations', icon: 'extension' },
      { to: '/dashboard/compliance', label: 'Compliance', icon: 'verified_user' },
      { to: '/dashboard/billing', label: 'Billing', icon: 'credit_card' },
    ],
  },
]
