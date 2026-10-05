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
      { to: '/dashboard/testing', label: 'Testing Lab', icon: 'science' },
      { to: '/dashboard/voices', label: 'Voices', icon: 'graphic_eq', tour: 'nav-voices' },
      { to: '/dashboard/knowledge', label: 'Knowledge Base', icon: 'menu_book', tour: 'nav-knowledge' },
    ],
  },
  {
    title: 'CHANNELS',
    standalone: true,
    showHeading: true,
    items: [
      { to: '/dashboard/inbound', label: 'Inbound', icon: 'phone_callback' },
      { to: '/dashboard/outbound', label: 'Outbound', icon: 'campaign' },
      { to: '/dashboard/website-widget', label: 'Website Widget', icon: 'widgets' },
      { to: '/dashboard/numbers', label: 'Phone Numbers', icon: 'dialpad' },
    ],
  },
  {
    title: 'ENGAGEMENT',
    standalone: true,
    showHeading: true,
    items: [
      { to: '/dashboard/calls', label: 'All Calls History', icon: 'history' },
      { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts' },
      { to: '/dashboard/appointments', label: 'Appointments', icon: 'event' },
    ],
  },
  {
    title: 'Workspace tools',
    items: [
      { to: '/dashboard/integrations', label: 'Integrations', icon: 'extension', tour: 'nav-integrations' },
      { to: '/dashboard/compliance', label: 'Compliance', icon: 'verified_user' },
      { to: '/dashboard/billing', label: 'Billing', icon: 'credit_card' },
      { to: '/dashboard/settings', label: 'Settings', icon: 'settings', tour: 'nav-settings' },
    ],
  },
  {
    title: 'SUPPORT',
    standalone: true,
    showHeading: true,
    items: [{ to: '/dashboard/support', label: 'Help & Support', icon: 'support_agent' }],
  },
]
