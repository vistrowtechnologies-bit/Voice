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
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Platform',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', tour: 'nav-dashboard' },
      { to: '/dashboard/agents', label: 'Agents', icon: 'smart_toy', tour: 'nav-agents' },
      { to: '/dashboard/testing', label: 'Testing Lab', icon: 'science' },
      { to: '/dashboard/voices', label: 'Voices', icon: 'graphic_eq', tour: 'nav-voices' },
      { to: '/dashboard/knowledge', label: 'Knowledge Base', icon: 'menu_book', tour: 'nav-knowledge' },
    ],
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/dashboard/inbound', label: 'Inbound', icon: 'phone_callback' },
      { to: '/dashboard/outbound', label: 'Outbound', icon: 'campaign' },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/dashboard/calls', label: 'All Calls History', icon: 'history' },
      { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts' },
      { to: '/dashboard/appointments', label: 'Appointments', icon: 'event' },
      { to: '/dashboard/integrations', label: 'Integrations', icon: 'extension', tour: 'nav-integrations' },
      { to: '/dashboard/website-widget', label: 'Website Widget', icon: 'widgets' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/dashboard/numbers', label: 'Phone Numbers', icon: 'dialpad' },
      { to: '/dashboard/compliance', label: 'Compliance', icon: 'verified_user' },
      { to: '/dashboard/billing', label: 'Billing', icon: 'credit_card' },
      { to: '/dashboard/settings', label: 'Settings', icon: 'settings', tour: 'nav-settings' },
    ],
  },
]
