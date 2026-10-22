import { Icon } from './Icon'

/** Material Symbol names that have a 3D icon in public/media/icons3d/<name>.webp (96x96, transparent). */
export const ICON3D_NAMES: ReadonlySet<string> = new Set([
  'account_balance', 'account_balance_wallet', 'ads_click', 'analytics', 'apartment', 'api', 'article',
  'assignment_ind', 'assignment_return', 'auto_awesome', 'auto_delete', 'badge', 'block', 'bolt', 'build',
  'calendar_month', 'call', 'call_end', 'call_made', 'call_received', 'call_split', 'campaign', 'chat', 'code',
  'compare_arrows', 'confirmation_number', 'contacts', 'credit_card', 'currency_rupee', 'dashboard', 'data_object',
  'description', 'devices', 'dialpad', 'diversity_3', 'edit_note', 'event', 'event_available', 'event_repeat',
  'extension', 'fact_check', 'filter_alt', 'flag', 'forum', 'gavel', 'graphic_eq', 'grid_view', 'group', 'groups',
  'health_and_safety', 'hearing', 'history', 'hub', 'insights', 'inventory', 'inventory_2', 'key', 'language',
  'library_books', 'local_shipping', 'location_city', 'lock', 'mail', 'menu_book', 'monitoring',
  'notifications_active', 'palette', 'password', 'payments', 'person', 'phone_callback', 'phone_missed',
  'psychology', 'public', 'quiz', 'receipt_long', 'record_voice_over', 'rocket_launch', 'route', 'rule', 'schedule',
  'science', 'send', 'shield', 'shopping_bag', 'smart_toy', 'speed', 'stethoscope', 'support', 'support_agent',
  'swap_calls', 'sync', 'sync_alt', 'table_chart', 'task_alt', 'timer', 'translate', 'tune', 'update', 'upload_file',
  'verified', 'verified_user', 'volunteer_activism', 'webhook', 'widgets', 'work', 'workspace_premium',
])

/**
 * A feature-tile icon: the 3D icon when one exists for `name`, otherwise the
 * flat Material Symbol (with `className`, so the tile looks as it did before).
 * `plate` puts the 3D icon on a white rounded plate, for tiles filled with
 * violet where a colourful icon would otherwise get lost; flat fallbacks stay
 * white on the violet fill.
 */
export function Icon3D({ name, size = 36, className = '', plate = false }: { name: string; size?: number; className?: string; plate?: boolean }) {
  if (!ICON3D_NAMES.has(name)) return <Icon name={name} className={className} />
  const img = (
    <img
      src={`/media/icons3d/${name}.webp`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="pointer-events-none shrink-0 select-none"
      style={{ width: size, height: size }}
    />
  )
  if (!plate) return img
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-white shadow-[0_4px_10px_-6px_rgba(76,29,149,0.6)]"
      style={{ width: size + 6, height: size + 6 }}
    >
      {img}
    </span>
  )
}
