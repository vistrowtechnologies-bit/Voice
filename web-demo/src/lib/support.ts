import { formatDateTime } from './api'
import type { SupportTicket, TicketPriority } from './types'

// Help & Support constants and helpers, shared by the workspace's support
// page and the platform team's inbox (components live in SupportTicketParts).

export const SUPPORT_EMAIL = 'support@vistrowvoice.com'
export const MAX_ATTACHMENTS = 3
/** Stored screenshots/files are deleted this long after a ticket is solved
 * (server: support_files.FILE_RETENTION_DAYS). */
export const FILE_RETENTION_DAYS = 14
// Matches the server's _TICKET_FILE_MAX_BYTES: room for a retina screenshot.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const CATEGORY_LABELS: Record<string, string> = {
  technical: 'Technical issue',
  billing: 'Billing & credits',
  account: 'Account & access',
  feature: 'Feature request',
  general: 'Something else',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High — work is affected',
  urgent: 'Urgent — calls are down',
}

/** Tickets store UTC as "YYYY-MM-DD HH:MM:SS" with no zone; without the Z a
 * browser reads it as local time and an Indian user sees it 5½h early. */
export function ticketTime(utcText: string | null | undefined): string {
  if (!utcText) return ''
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(utcText) ? utcText : `${utcText.replace(' ', 'T')}Z`
  return formatDateTime(iso)
}

export const fileContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.readAsDataURL(file)
  })


/** The three statuses a customer sees (Zendesk's model): support is working
 * on it, support is waiting on you, or it's done. The support team keeps the
 * finer in-progress/resolved/closed split in its own inbox. */
export type CustomerStatus = 'open' | 'awaiting' | 'solved'

export function customerStatus(t: Pick<SupportTicket, 'status' | 'lastAuthor'>): CustomerStatus {
  if (t.status === 'resolved' || t.status === 'closed') return 'solved'
  if (t.lastAuthor === 'support') return 'awaiting'
  return 'open'
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  open: 'Open',
  awaiting: 'Awaiting your reply',
  solved: 'Solved',
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export const isInlineImage = (contentType: string) =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)

/** Where a stored attachment is served from — the workspace route, or the
 * platform team's route in the admin inbox. */
export const ticketFileUrl = (viewer: 'customer' | 'support', ticketId: number, fileId: string) =>
  viewer === 'support'
    ? `/api/admin/support/tickets/${ticketId}/files/${fileId}`
    : `/api/help/tickets/${ticketId}/files/${fileId}`

export async function toUploads(files: File[]) {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name || 'screenshot.png',
      contentType: file.type || 'application/octet-stream',
      content: await fileContent(file),
    })),
  )
}

/** Which help-centre topic explains each dashboard page (server/help_articles.py
 * TOPICS[*].route → slug; test_help_articles.py keeps the two in step). */
export const HELP_TOPIC_BY_ROUTE: Record<string, string> = {
  '/dashboard': 'getting-started',
  '/dashboard/agents': 'agents',
  '/dashboard/testing': 'testing-lab',
  '/dashboard/voices': 'voices',
  '/dashboard/knowledge': 'knowledge-base',
  '/dashboard/inbound': 'inbound',
  '/dashboard/outbound': 'outbound',
  '/dashboard/calls': 'calls',
  '/dashboard/contacts': 'contacts',
  '/dashboard/appointments': 'appointments',
  '/dashboard/integrations': 'integrations',
  '/dashboard/website-widget': 'website-widget',
  '/dashboard/numbers': 'phone-numbers',
  '/dashboard/compliance': 'compliance',
  '/dashboard/billing': 'billing',
  '/dashboard/settings': 'settings',
}

/** The topic for the current page, matching the longest route prefix. */
export function helpTopicFor(pathname: string): string | null {
  const match = Object.keys(HELP_TOPIC_BY_ROUTE)
    .filter((route) => pathname === route || (route !== '/dashboard' && pathname.startsWith(`${route}/`)))
    .sort((a, b) => b.length - a.length)[0]
  return match ? HELP_TOPIC_BY_ROUTE[match] : null
}
