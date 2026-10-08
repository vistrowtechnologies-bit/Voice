import { NavLink } from 'react-router-dom'

export interface RouteTab {
  to: string
  label: string
}

/** A tab strip where every tab is its own page. Used where several screens are one job
 * ("Channels", "Contacts") so the sidebar can show one entry instead of four. */
export function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="flex min-w-0 gap-1 overflow-x-auto border-b border-border px-4 pt-3 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              isActive ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export const CHANNEL_TABS: RouteTab[] = [
  { to: '/dashboard/numbers', label: 'Phone numbers' },
  { to: '/dashboard/inbound', label: 'Inbound routing' },
  { to: '/dashboard/outbound', label: 'Outbound campaigns' },
  { to: '/dashboard/website-widget', label: 'Website widget' },
]

export const CONTACT_TABS: RouteTab[] = [
  { to: '/dashboard/contacts', label: 'Contacts' },
  { to: '/dashboard/appointments', label: 'Appointments' },
]

export const ChannelTabs = () => <RouteTabs tabs={CHANNEL_TABS} label="Channels" />
export const ContactTabs = () => <RouteTabs tabs={CONTACT_TABS} label="Contacts and appointments" />
