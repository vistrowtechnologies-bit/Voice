import { Icon } from '../Icon'
import type { MetaLeadEvent, MetaStatus, MetaUnavailable } from '../../lib/metaLeads'
import { MetaPanel, MetaPrimaryButton, MetaTile, metaTimeAgo } from './bits'

// Health tiles and the onboarding checklist for Facebook & Instagram Lead
// Ads. Every state is read from the server, never assumed; the one step we
// cannot see from Meta (Leads Access) is shown as "last lead received".

export function MetaHealth({ status, leads }: { status: MetaStatus | null; leads: MetaLeadEvent[] | null }) {
  const pages = status?.pages.filter((p) => p.status === 'active') ?? []
  const waiting = leads ? leads.filter((l) => l.status === 'received').length : null
  const lastLead = pages.map((p) => p.last_lead_at).filter(Boolean).sort().at(-1) ?? null
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetaTile icon="flag" label="Pages" value={status ? String(pages.length) : '-'} />
      <MetaTile icon="group_add" label="Leads · recent" value={leads ? String(leads.length) : '-'} />
      <MetaTile icon="hourglass_top" label="Waiting to be called" value={waiting === null ? '-' : String(waiting)} alert={Boolean(waiting && waiting > 10)} />
      <MetaTile icon="schedule" label="Last lead" value={lastLead ? metaTimeAgo(lastLead) : 'None yet'} />
    </div>
  )
}

export function MetaUnavailableNote({ reason }: { reason: MetaUnavailable }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-high/40 p-3 text-xs text-text-muted">
      <Icon name="info" className="text-[15px]" />
      <span>
        {reason === 'token_storage'
          ? 'Facebook & Instagram Lead Ads cannot be connected on this server yet: token encryption is not configured. An administrator needs to set it up first.'
          : 'Facebook & Instagram Lead Ads is not available on this server yet.'}
      </span>
    </p>
  )
}

type StepState = 'done' | 'todo' | 'attention'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done')
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Icon name="check" className="text-[14px]" />
      </span>
    )
  if (state === 'attention')
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <Icon name="priority_high" className="text-[14px]" />
      </span>
    )
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold text-text-muted" />
}

export function MetaChecklist({
  status,
  leads,
  canManage,
  onConnect,
  onOpenSettings,
}: {
  status: MetaStatus
  leads: MetaLeadEvent[] | null
  canManage: boolean
  onConnect: () => void
  onOpenSettings: () => void
}) {
  const pages = status.pages.filter((p) => p.status === 'active')
  const subscribedAll = pages.length > 0 && pages.every((p) => Boolean(p.subscription_ok))
  const lastLead = pages.map((p) => p.last_lead_at).filter(Boolean).sort().at(-1) ?? null
  const testSeen = Boolean(leads?.some((l) => l.status === 'test'))
  const callPlaced = Boolean(leads?.some((l) => l.dialed_at || l.status === 'queued'))

  const steps: Array<{ title: string; state: StepState; detail: string; action?: { label: string; onClick: () => void } }> = [
    {
      title: 'Connected with Facebook',
      state: status.connected ? 'done' : status.status === 'needs_reconnect' ? 'attention' : 'todo',
      detail: status.connected
        ? `Signed in as ${status.fbUserName || 'a Facebook user'}${status.tokenExpiresAt ? `. Access renews automatically; reconnect by ${status.tokenExpiresAt.slice(0, 10)} if asked.` : '.'}`
        : status.status === 'needs_reconnect'
          ? status.lastError || 'Facebook access was removed or expired.'
          : 'Sign in with the Facebook account that manages your Pages.',
      action: canManage && !status.connected ? { label: status.status === 'needs_reconnect' ? 'Reconnect' : 'Connect with Facebook', onClick: onConnect } : undefined,
    },
    {
      title: 'Pages subscribed to new leads',
      state: subscribedAll ? 'done' : pages.length ? 'attention' : status.pendingPages.length ? 'attention' : 'todo',
      detail: subscribedAll
        ? `${pages.length} ${pages.length === 1 ? 'Page' : 'Pages'}: ${pages.map((p) => p.page_name || p.page_id).join(', ')}`
        : pages.length
          ? 'One or more Pages could not be subscribed. Open Settings and reconnect that Page.'
          : status.pendingPages.length
            ? 'Choose which Pages to connect on the Settings tab.'
            : 'Connect first, then pick the Pages that run your Lead Ads.',
      action: canManage && !subscribedAll && (pages.length || status.pendingPages.length) ? { label: 'Open Settings', onClick: onOpenSettings } : undefined,
    },
    {
      title: 'Leads Access assigned to Vistrow Voice',
      state: lastLead ? 'done' : subscribedAll ? 'attention' : 'todo',
      detail: lastLead
        ? `Last lead received ${metaTimeAgo(lastLead)}.`
        : 'Meta only sends leads to apps you assign. In Meta Business Suite open Business Settings → Integrations → Leads Access, pick the Page, open the CRM tab and assign "Vistrow Voice". Last lead received: never.',
    },
    {
      title: 'Test lead received',
      state: testSeen ? 'done' : 'todo',
      detail: testSeen
        ? 'A test lead from Meta arrived and was recorded (test leads are never dialled).'
        : "Send one from Meta's Lead Ads Testing Tool (works once the app is approved by Meta). It shows on the Leads tab as a test.",
    },
    {
      title: 'First call placed',
      state: callPlaced ? 'done' : 'todo',
      detail: callPlaced
        ? 'A real lead was queued and called by your agent.'
        : 'Once a real lead arrives, your agent calls within 60 seconds inside your calling hours.',
    },
  ]

  return (
    <MetaPanel title="Set-up checklist" icon="checklist" subtitle="Each step is checked against Facebook and your leads, not assumed.">
      <ol className="flex flex-col gap-3 text-xs">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-3">
            <StepIcon state={step.state} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{step.title}</p>
              <p className="text-text-muted">{step.detail}</p>
              {step.action && (
                <button type="button" onClick={step.action.onClick} className="mt-1 text-[11px] font-semibold text-primary hover:underline">
                  {step.action.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </MetaPanel>
  )
}

export function MetaReconnectBanner({ status, canManage, onConnect }: { status: MetaStatus; canManage: boolean; onConnect: () => void }) {
  if (status.status !== 'needs_reconnect') return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-2">
        <Icon name="error" className="text-[16px] text-destructive" />
        <div>
          <p className="font-semibold text-destructive">Facebook access stopped: {status.lastError || 'the connection needs to be renewed'}</p>
          <p className="mt-0.5 text-text-muted">New leads are not being received. Reconnect with the Facebook account that manages your Pages.</p>
        </div>
      </div>
      {canManage && (
        <MetaPrimaryButton icon="refresh" onClick={onConnect}>
          Reconnect
        </MetaPrimaryButton>
      )}
    </div>
  )
}

export function MetaWhatHappens() {
  return (
    <ol className="flex flex-col gap-3 text-xs">
      {[
        ['Someone submits your Lead Ads form', 'On Facebook or Instagram. Meta tells us within seconds.'],
        ['Every answer is saved to Contacts', 'Name, phone, email and each question on the form, plus the ad, ad set, campaign and form it came from.'],
        ['The right agent calls within 60 seconds', 'Chosen by your lead rules: an ad rule beats a form rule beats the Page default. Inside your calling hours, when a line is free.'],
        ['The agent knows what they asked for', 'The form answers and the ad they saw are in its notes before it dials.'],
        ['Your rules still apply', 'Do-not-call list and calling hours are checked before every call. Leads older than 24 hours are kept but not called.'],
      ].map(([title, hint], i) => (
        <li key={title} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{i + 1}</span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-text-muted">{hint}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
