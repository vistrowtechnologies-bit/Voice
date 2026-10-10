import type { Integration } from '../lib/types'

// Small pieces shared by the Integrations list and each integration's page.

const isSheetsOauth = (i: Integration) => i.key === 'sheets' && i.config.mode === 'oauth'

/** The DB stores UTC as "YYYY-MM-DD HH:MM:SS" with no zone; browsers read
 * that as local time, so mark it as UTC before formatting. */
export function utcTime(value: string): string {
  return /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
}

/** One line for the list card: what this connection points at. */
export function integrationSummary(i: Integration): string {
  if (isSheetsOauth(i)) return i.config.google_email || 'Google Sheets'
  if (i.key === 'slack') return i.config.channel || 'Slack'
  if (i.key === 'facebook') return i.config.pageName || 'Facebook Page'
  if (i.key === 'zoho_crm') return i.config.api_domain ? i.config.api_domain.replace(/^https?:\/\//, '') : 'Zoho CRM'
  if (i.key === 'arthaleads') return 'Connection key saved'
  return i.config.url ? hostOf(i.config.url) : 'Connected'
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 40)
  }
}



export function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        connected ? 'border-cyan/30 bg-cyan/10 text-cyan' : 'border-border text-text-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-cyan' : 'bg-muted'}`} />
      {connected ? 'Connected' : 'Not Connected'}
    </span>
  )
}
