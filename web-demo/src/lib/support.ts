import { formatDateTime } from './api'
import type { TicketPriority } from './types'

// Help & Support constants and helpers, shared by the workspace's support
// page and the platform team's inbox (components live in SupportTicketParts).

export const SUPPORT_EMAIL = 'support@vistrowvoice.com'
export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 600 * 1024

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

