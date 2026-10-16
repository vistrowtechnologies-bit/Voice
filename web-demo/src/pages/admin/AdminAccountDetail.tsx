import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  adminAccountDetail,
  adminImpersonate,
  rememberSupportReturn,
  adminResetPassword,
  adminSetCredits,
  adminSetNotes,
  adminSetPlan,
  adminSetStatus,
  PLAN_LABELS,
  type AdminAccountDetail as Detail,
  type HealthLevel,
  adminInvoicePdfUrl,
  adminUsage,
  type AdminUsageRow,
} from '../../lib/adminApi'
import { AdminCard, EmptyState, errMsg, ErrorState, fmtDate, fmtDateTime, fmtDuration, InternalPill, Pill, PlanPill, ROW_FOCUS, rowLinkProps, StatusPill, timeAgo, useDialog } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

type Tab = 'signup' | 'health' | 'users' | 'agents' | 'calls' | 'knowledge' | 'numbers' | 'integrations' | 'billing' | 'copilot' | 'notes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'signup', label: 'Signup & onboarding' },
  { id: 'health', label: 'Health' },
  { id: 'users', label: 'Users' },
  { id: 'agents', label: 'Agents' },
  { id: 'calls', label: 'Calls' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'billing', label: 'Billing' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'notes', label: 'Notes & Audit' },
]

export function AdminAccountDetail() {
  const { id } = useParams()
  const accountId = Number(id)
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Selected tab lives in ?tab= so reload and back/forward keep it.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'signup'
  const setTab = (t: Tab) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === 'signup') next.delete('tab')
      else next.set('tab', t)
      return next
    })
  const [modal, setModal] = useState<null | 'credits' | 'plan' | 'status' | 'reset'>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState(false)

  const load = useCallback(() => {
    setError(null)
    return adminAccountDetail(accountId)
      .then(setD)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'))
  }, [accountId])
  useEffect(() => {
    void load()
  }, [load])

  if (error) return <ErrorState message={`Couldn't load this account: ${error}`} onRetry={() => void load()} />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  const a = d.account
  const suspended = a.status === 'suspended'

  const impersonate = async () => {
    setActionError(null)
    setImpersonating(true)
    try {
      rememberSupportReturn(`/admin/accounts/${accountId}`)
      await adminImpersonate(accountId)
      await refresh()
      navigate('/dashboard')
    } catch (e) {
      setActionError(`Couldn't start the support session: ${e instanceof Error ? e.message : 'request failed'}`)
    } finally {
      setImpersonating(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/admin/accounts')} className="mb-1 flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <Icon name="chevron_left" className="text-[16px]" /> Accounts
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{a.name}</h1>
            <PlanPill plan={a.effective_plan ?? a.plan} />
            <StatusPill status={a.status} />
            {a.internal ? <InternalPill /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={impersonate}
            disabled={impersonating}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="visibility" className="text-[16px]" /> {impersonating ? 'Opening…' : 'View as'}
          </button>
          <ActionBtn onClick={() => setModal('credits')}>Adjust credits</ActionBtn>
          <ActionBtn onClick={() => setModal('plan')}>Change plan</ActionBtn>
          <ActionBtn onClick={() => setModal('reset')}>Reset password</ActionBtn>
          <button
            onClick={() => setModal('status')}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              suspended ? 'border-success/40 text-success hover:bg-success/10' : 'border-destructive/40 text-destructive hover:bg-destructive/10'
            }`}
          >
            {suspended ? 'Reactivate' : 'Suspend'}
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <Icon name="check_circle" className="text-[16px]" /> {banner}
        </div>
      )}
      {actionError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Icon name="error" className="text-[16px]" /> {actionError}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MetaCard label="Account owner" value={d.owner?.email || '-'} />
        <MetaCard
          label="Signed up"
          value={`${fmtDate(a.created_at)}${a.onboarded_at ? '' : ' · onboarding not finished'}`}
        />
        <MetaCard label="Capacity" value={`${d.users.length} users · ${d.agents.length} agents`} />
        <AdminCard className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Credit utilization</div>
          <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
            <span className="tabular-nums">{Math.round(d.billing.creditsUsed)} used</span>
            <span className="tabular-nums">
              {Math.round(d.billing.creditsUsed)}/{Math.round(d.billing.creditsTotal)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-high">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (d.billing.creditsUsed / (d.billing.creditsTotal || 1)) * 100)}%` }}
            />
          </div>
        </AdminCard>
      </div>

      <div className="mt-6 flex gap-5 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'signup' && <SignupTab d={d} />}
        {tab === 'health' && <HealthTab d={d} />}
        {tab === 'users' && <UsersTab d={d} />}
        {tab === 'agents' && <AgentsTab d={d} />}
        {tab === 'calls' && <CallsTab d={d} navigate={navigate} />}
        {tab === 'knowledge' && <KnowledgeTab d={d} />}
        {tab === 'numbers' && <NumbersTab d={d} />}
        {tab === 'integrations' && <IntegrationsTab d={d} />}
        {tab === 'billing' && <BillingTab d={d} />}
        {tab === 'copilot' && <CopilotTab d={d} />}
        {tab === 'notes' && <NotesTab d={d} onSaved={load} />}
      </div>

      {modal === 'credits' && (
        <ReasonModal
          title="Adjust credits"
          field={{ label: 'New credit total', type: 'number', initial: String(Math.round(d.billing.creditsTotal)) }}
          helperText={`Currently ${Math.round(d.billing.creditsUsed).toLocaleString()} used of ${Math.round(d.billing.creditsTotal).toLocaleString()} - the field above is the new total, not an amount to add. Use a quick-add button below, or type total = used + however many credits you want remaining.`}
          presets={[100, 500, 1000, 5000]}
          validate={(val) => {
            const t = val.trim()
            if (!/^\d+$/.test(t)) return { error: 'Enter a whole number of credits (0 or more).' }
            const used = Math.round(d.billing.creditsUsed)
            if (Number(t) < used)
              return { warning: `This total is below the ${used.toLocaleString()} credits already used - the account will have no credits left.` }
            return {}
          }}
          confirmLabel="Update credits"
          onClose={() => setModal(null)}
          onConfirm={async (val, reason) => {
            const updated = await adminSetCredits(accountId, Number(val.trim()), reason)
            setD(updated)
            setModal(null)
            setBanner(`Credits set to ${Number(val).toLocaleString()}.`)
          }}
        />
      )}
      {modal === 'plan' && (
        <ReasonModal
          title="Change plan"
          field={{ label: 'Plan', type: 'select', options: Object.keys(PLAN_LABELS), initial: a.plan }}
          confirmLabel="Change plan"
          onClose={() => setModal(null)}
          onConfirm={async (val, reason) => {
            const updated = await adminSetPlan(accountId, val, reason)
            setD(updated)
            setModal(null)
            setBanner(`Plan changed to ${PLAN_LABELS[val] || val}.`)
          }}
        />
      )}
      {modal === 'status' && (
        <ReasonModal
          title={suspended ? 'Reactivate account' : 'Suspend account'}
          danger={!suspended}
          confirmLabel={suspended ? 'Reactivate' : 'Suspend'}
          onClose={() => setModal(null)}
          onConfirm={async (_v, reason) => {
            const updated = await adminSetStatus(accountId, suspended ? 'active' : 'suspended', reason)
            setD(updated)
            setModal(null)
            setBanner(suspended ? 'Account reactivated.' : 'Account suspended.')
          }}
        />
      )}
      {modal === 'reset' && (
        <ResetModal
          accountId={accountId}
          ownerEmail={d.owner?.email || ''}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null)
            setBanner(msg)
          }}
        />
      )}
    </>
  )
}

function ActionBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary">
      {children}
    </button>
  )
}

const PROFILE_LABELS: [string, string][] = [
  ['role', 'Role'],
  ['roleOther', 'Role (other)'],
  ['industry', 'Industry'],
  ['industryOther', 'Industry (other)'],
  ['companySize', 'Company size'],
  ['website', 'Website'],
  ['useCases', 'Wants to'],
  ['useCaseOther', 'Other use'],
  ['channels', 'Channels'],
  ['languages', 'Languages'],
  ['callVolume', 'Calls per month'],
  ['currentSolution', 'Handles calls today with'],
  ['timeline', 'Go-live timeline'],
  ['completedAt', 'Onboarding finished'],
]

const ATTRIBUTION_LABELS: [string, string][] = [
  ['utm_source', 'Source (utm_source)'],
  ['utm_medium', 'Medium (utm_medium)'],
  ['utm_campaign', 'Campaign'],
  ['utm_term', 'Keyword (utm_term)'],
  ['utm_content', 'Ad (utm_content)'],
  ['gclid', 'Google Ads click ID'],
  ['fbclid', 'Meta click ID'],
  ['msclkid', 'Microsoft Ads click ID'],
  ['referrer', 'Came from site'],
  ['landing_page', 'First page visited'],
  ['first_seen_at', 'First visit'],
]

function FactList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border/60">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-4 px-4 py-2.5 text-sm">
          <dt className="w-28 shrink-0 text-text-muted sm:w-48">{k}</dt>
          <dd className="min-w-0 break-words font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Who signed up, how they found us and what they said they need. */
function SignupTab({ d }: { d: Detail }) {
  const a = d.account
  const profile = a.onboarding_profile ?? {}
  const attribution = a.signup_attribution ?? {}
  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')
  const DATE_KEYS = new Set(['completedAt', 'first_seen_at'])
  const value = (k: string, v: string | string[] | undefined) => (DATE_KEYS.has(k) && typeof v === 'string' ? fmtDateTime(v) : show(v))
  const contact: [string, string][] = [
    ['Owner', `${d.owner?.name || '-'} · ${d.owner?.email || '-'}`],
    ['Phone', d.owner?.phone || '-'],
    ['Signed up with', d.owner?.auth_provider || 'password'],
    ['How they heard about us', a.referral_source || '-'],
    ['Onboarding', a.onboarded_at ? `Finished ${fmtDateTime(a.onboarded_at)}` : 'Not finished'],
  ]
  const profileRows = PROFILE_LABELS.filter(([k]) => show(profile[k])).map(([k, label]) => [label, value(k, profile[k])] as [string, string])
  const attributionRows = ATTRIBUTION_LABELS.filter(([k]) => attribution[k]).map(([k, label]) => [label, value(k, attribution[k])] as [string, string])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminCard className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-bold">Contact & signup</div>
        <FactList rows={contact} />
        <div className="border-y border-border px-4 py-3 text-sm font-bold">Where they came from</div>
        {attributionRows.length ? (
          <FactList rows={attributionRows} />
        ) : (
          <p className="px-4 py-3 text-sm text-text-muted">No ad or referral data (direct visit, or signed up before tracking).</p>
        )}
      </AdminCard>
      <AdminCard className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-bold">Onboarding answers</div>
        {profileRows.length ? (
          <FactList rows={profileRows} />
        ) : (
          <p className="px-4 py-3 text-sm text-text-muted">No answers yet (onboarded before the questions existed, or not finished).</p>
        )}
      </AdminCard>
      <OnboardingAgentCard d={d} />
    </div>
  )
}

const LANGUAGE_NAMES: Record<string, string> = {
  'hi-IN': 'Hindi', 'en-IN': 'English', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam', 'gu-IN': 'Gujarati', 'bn-IN': 'Bengali', 'pa-IN': 'Punjabi', 'od-IN': 'Odia',
}

/** Which onboarding answer became which setting on the starter agent, and
 *  whether the customer has changed that setting since. */
function OnboardingAgentCard({ d }: { d: Detail }) {
  const info = d.onboardingAgent
  const profile = d.account.onboarding_profile ?? {}
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '-')
  const header = <div className="border-b border-border px-4 py-3 text-sm font-bold">First agent, set up from onboarding</div>
  if (!info || info.deleted) {
    return (
      <AdminCard className="overflow-hidden lg:col-span-2">
        {header}
        <p className="px-4 py-3 text-sm text-text-muted">
          {info?.deleted
            ? 'Onboarding set up a starter agent, but the customer has since deleted it.'
            : 'Not set up: onboarded before this existed, onboarding not finished, or the starter agent was already customised.'}
        </p>
      </AdminCard>
    )
  }
  const state = (changed: boolean) =>
    changed ? <Pill tone="warning">Changed by customer</Pill> : <Pill tone="active">As set up</Pill>
  const rows: { answer: string; from: string; setting: string; value: string; changed: boolean }[] = [
    {
      answer: 'Company, industry, goals',
      from: [d.account.name, list(profile.industry === 'Other' ? profile.industryOther : profile.industry), list(profile.useCases)].join(' · '),
      setting: 'Instructions',
      value: 'Role, goals, call flow, details to collect, tone, never-do rules',
      changed: info.changed.instructions,
    },
    {
      answer: 'Caller languages',
      from: list(profile.languages),
      setting: 'Language',
      value: LANGUAGE_NAMES[info.language] ?? info.language,
      changed: info.changed.language,
    },
    {
      answer: 'Company, language',
      from: d.account.name,
      setting: 'Welcome line',
      value: info.welcomeMessage || 'Default greeting (outbound only, or a language without a reviewed line)',
      changed: info.changed.welcome,
    },
    {
      answer: 'Industry, goals',
      from: [list(profile.industry), list(profile.useCases)].join(' · '),
      setting: 'After-call notes',
      value: info.postCallFields.join(', ') || '-',
      changed: info.changed.fields,
    },
  ]
  return (
    <AdminCard className="overflow-hidden lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-sm font-bold">First agent, set up from onboarding</span>
        <span className="text-xs text-text-muted">
          {info.name} · #{info.id} · {info.status}
          {info.updatedAt ? ` · last saved ${fmtDateTime(info.updatedAt)}` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5 font-semibold">Onboarding answer</th>
              <th className="px-4 py-2.5 font-semibold">Agent setting</th>
              <th className="px-4 py-2.5 font-semibold">Set to</th>
              <th className="px-4 py-2.5 font-semibold">Now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.setting} className="border-b border-border/60 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.answer}</div>
                  <div className="text-xs text-text-muted">{r.from}</div>
                </td>
                <td className="px-4 py-3 font-semibold">{r.setting}</td>
                <td className="max-w-md px-4 py-3 text-text-muted">{r.value}</td>
                <td className="whitespace-nowrap px-4 py-3">{state(r.changed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </AdminCard>
  )
}

function TabTable({ head, children, empty }: { head: string[]; children: React.ReactNode; empty: boolean }) {
  if (empty) return <EmptyState icon="inbox" message="Nothing here yet." />
  return (
    <AdminCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </AdminCard>
  )
}

const LEVEL_STYLE: Record<HealthLevel, { icon: string; text: string; tone: 'active' | 'warning' | 'suspended'; word: string }> = {
  ok: { icon: 'check_circle', text: 'text-success', tone: 'active', word: 'Healthy' },
  warn: { icon: 'warning', text: 'text-amber', tone: 'warning', word: 'Needs attention' },
  critical: { icon: 'error', text: 'text-destructive', tone: 'suspended', word: 'Blocked' },
}

function HealthTab({ d }: { d: Detail }) {
  const h = d.health
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AdminCard className="overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-base font-semibold">Can this workspace take calls?</h3>
          <Pill tone={LEVEL_STYLE[h.overall].tone}>{LEVEL_STYLE[h.overall].word}</Pill>
        </div>
        <ul className="divide-y divide-border/60">
          {h.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-5 py-3">
              <Icon name={LEVEL_STYLE[c.level].icon} className={`mt-0.5 text-[18px] ${LEVEL_STYLE[c.level].text}`} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="text-xs text-text-muted">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </AdminCard>
      <div className="flex flex-col gap-4">
        <AdminCard className="grid grid-cols-2 gap-4 p-5 text-sm">
          <Stat label="Calls, 7 days" value={String(h.calls7d)} />
          <Stat label="Didn't connect" value={String(h.failed7d)} />
          <Stat label="Last call" value={h.lastCallAt ? timeAgo(h.lastCallAt) : 'Never'} />
          <Stat label="Last login" value={h.lastLoginAt ? timeAgo(h.lastLoginAt) : 'Never'} />
          <Stat label="Open tickets" value={String(h.openTickets)} />
          <Stat label="Country" value={h.country} />
        </AdminCard>
        {h.failureReasons.length > 0 && (
          <AdminCard className="p-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Why calls didn't connect</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {h.failureReasons.map((r) => (
                <li key={r.reason} className="flex justify-between gap-3">
                  <span className="truncate font-mono text-xs">{r.reason}</span>
                  <span className="tabular-nums text-text-muted">{r.count}</span>
                </li>
              ))}
            </ul>
          </AdminCard>
        )}
      </div>
      {h.errors.length > 0 && (
        <AdminCard className="overflow-hidden lg:col-span-3">
          <h3 className="border-b border-border px-5 py-3 font-display text-base font-semibold">Errors in the last 7 days</h3>
          <ul className="divide-y divide-border/60">
            {h.errors.map((e, i) => (
              <li key={i} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <Pill tone={e.level === 'error' ? 'suspended' : 'warning'}>{e.level}</Pill>
                  <span>{e.source}</span>
                  <span>{timeAgo(e.created_at)}</span>
                </div>
                <div className="mt-1 break-words text-sm">{e.message}</div>
                {e.context && <div className="mt-0.5 break-words font-mono text-[11px] text-text-muted">{e.context}</div>}
              </li>
            ))}
          </ul>
        </AdminCard>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function UsersTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['User', 'Role', 'Auth', 'Last login', 'Joined']} empty={d.users.length === 0}>
      {d.users.map((u) => (
        <tr key={u.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3">
            <div className="font-semibold">{u.name}</div>
            <div className="text-xs text-text-muted">{u.email}</div>
          </td>
          <td className="px-4 py-3">
            <Pill tone={u.role === 'owner' ? 'primary' : 'neutral'}>{u.role}</Pill>
          </td>
          <td className="px-4 py-3 capitalize text-text-muted">{u.auth_provider || 'password'}</td>
          <td className="px-4 py-3 text-text-muted">{timeAgo(u.last_login_at)}</td>
          <td className="px-4 py-3 text-text-muted">{fmtDate(u.created_at)}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function AgentsTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Agent', 'Status', 'Voice', 'Model', 'Updated']} empty={d.agents.length === 0}>
      {d.agents.map((a) => (
        <tr key={a.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{a.name}</td>
          <td className="px-4 py-3">
            <Pill tone={a.status === 'live' ? 'active' : 'neutral'}>{a.status}</Pill>
          </td>
          <td className="px-4 py-3 capitalize text-text-muted">{a.voice}</td>
          <td className="px-4 py-3 text-text-muted">{a.model}</td>
          <td className="px-4 py-3 text-text-muted">{timeAgo(a.updated_at)}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function CallsTab({ d, navigate }: { d: Detail; navigate: (p: string) => void }) {
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link
          to={`/admin/calls?account_id=${d.account.id}`}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Calls: filter, failures and full history <Icon name="chevron_right" className="text-[16px]" />
        </Link>
      </div>
      <TabTable head={['Time', 'Channel', 'Duration', 'Lead', 'Language']} empty={d.calls.length === 0}>
        {d.calls.map((c) => (
          <tr key={c.id} {...rowLinkProps(() => navigate(`/admin/calls/${c.id}`))} className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high ${ROW_FOCUS}`}>
            <td className="px-4 py-3 text-text-muted" title={fmtDateTime(c.started_at)}>{timeAgo(c.started_at)}</td>
            <td className="px-4 py-3 capitalize">{c.call_type}</td>
            <td className="px-4 py-3 tabular-nums">{fmtDuration(c.duration_seconds)}</td>
            <td className="px-4 py-3">{c.lead_name || <span className="text-text-muted">-</span>}</td>
            <td className="px-4 py-3 text-text-muted">{c.reply_language || '-'}</td>
          </tr>
        ))}
      </TabTable>
    </>
  )
}

function KnowledgeTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Knowledge base', 'Sources', 'Strict mode']} empty={d.knowledgeBases.length === 0}>
      {d.knowledgeBases.map((k) => (
        <tr key={k.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{k.name}</td>
          <td className="px-4 py-3 tabular-nums text-text-muted">{k.sources}</td>
          <td className="px-4 py-3">{k.strict ? <Pill tone="primary">On</Pill> : <Pill tone="neutral">Off</Pill>}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function NumbersTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Number', 'Label', 'Status']} empty={d.numbers.length === 0}>
      {d.numbers.map((n) => (
        <tr key={n.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-mono">{n.number}</td>
          <td className="px-4 py-3 text-text-muted">{n.label || '-'}</td>
          <td className="px-4 py-3">
            <Pill tone={n.status === 'active' ? 'active' : 'neutral'}>{n.status}</Pill>
          </td>
        </tr>
      ))}
    </TabTable>
  )
}

const COPILOT_TONE = { confirmed: 'active', failed: 'suspended', proposed: 'primary', cancelled: 'neutral', expired: 'neutral' } as const

/** What the help copilot proposed or changed in this workspace (last 10). */
function CopilotTab({ d }: { d: Detail }) {
  const rows = d.copilotActions ?? []
  return (
    <TabTable head={['Action', 'By', 'When', 'Status']} empty={rows.length === 0}>
      {rows.map((a) => (
        <tr key={a.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3">
            <div className="font-semibold">{a.label}</div>
            {a.result && <div className="text-xs text-text-muted">{a.result}</div>}
          </td>
          <td className="px-4 py-3 text-text-muted">{a.userName || '-'}</td>
          <td className="px-4 py-3 text-text-muted">{fmtDateTime(a.createdAt)}</td>
          <td className="px-4 py-3">
            <Pill tone={COPILOT_TONE[a.status] ?? 'neutral'}>{a.status}</Pill>
          </td>
        </tr>
      ))}
    </TabTable>
  )
}

function IntegrationsTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Integration', 'Category', 'Status']} empty={d.integrations.length === 0}>
      {d.integrations.map((it) => (
        <tr key={it.key} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{it.name}</td>
          <td className="px-4 py-3 capitalize text-text-muted">{it.category}</td>
          <td className="px-4 py-3">
            <Pill tone={it.status === 'connected' ? 'active' : 'neutral'}>{it.status}</Pill>
          </td>
        </tr>
      ))}
    </TabTable>
  )
}

function NotesTab({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const [notes, setNotes] = useState(d.account.notes || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AdminCard className="p-5 lg:col-span-2">
        <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
          <Icon name="edit_note" className="text-[18px] text-primary" /> Internal notes
        </h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Administrative notes about this account - only visible to platform admins."
          className="min-h-[140px] w-full resize-y rounded-lg border border-border bg-surface-high p-3 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          {saveError && (
            <p role="alert" className="text-xs text-destructive">
              Couldn't save the note: {saveError}
            </p>
          )}
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setSaveError(null)
              try {
                await adminSetNotes(d.account.id, notes)
                onSaved()
              } catch (e) {
                setSaveError(errMsg(e))
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </AdminCard>
      <AdminCard className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Audit stream</h3>
        {d.audit.length === 0 ? (
          <p className="text-sm text-text-muted">No admin actions on this account yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {d.audit.map((e, i) => (
              <div key={i} className="border-l-2 border-primary/40 pl-3">
                <div className="text-sm">
                  <span className="font-semibold capitalize">{e.action.replace(/_/g, ' ')}</span> - {e.detail}
                </div>
                <div className="text-[11px] text-text-muted">
                  {e.actor_email} · {timeAgo(e.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  )
}

// -------------------------------------------------------------- modals

const MIN_REASON = 5

function ReasonModal({
  title,
  field,
  confirmLabel,
  danger,
  helperText,
  presets,
  validate,
  onClose,
  onConfirm,
}: {
  title: string
  field?: { label: string; type: 'number' | 'select'; initial: string; options?: string[] }
  confirmLabel: string
  danger?: boolean
  // Context shown under the field - e.g. current usage, so an admin setting
  // an absolute total doesn't have to go look that number up elsewhere.
  helperText?: string
  // Quick "add N" buttons for numeric fields - the field itself is always an
  // absolute total (that's what the backend takes), so a preset just fills
  // in field's current numeric value + the preset amount rather than
  // requiring the admin to do that math themselves.
  presets?: number[]
  // Field check run as the admin types: `error` blocks confirm, `warning` only informs.
  validate?: (value: string) => { error?: string; warning?: string }
  onClose: () => void
  onConfirm: (value: string, reason: string) => Promise<void>
}) {
  const [value, setValue] = useState(field?.initial || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Mirrors the backend rule (trimmed length >= 5); the server still enforces it.
  const reasonOk = reason.trim().length >= MIN_REASON
  const check = validate ? validate(value) : {}
  const dialogRef = useDialog(onClose)
  const titleId = useId()

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
      <AdminCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {field && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">{field.label}</span>
              {field.type === 'select' ? (
                <select value={value} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm capitalize outline-none focus:border-primary">
                  {field.options!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
              )}
              {check.error && <span className="text-xs text-destructive">{check.error}</span>}
              {!check.error && check.warning && <span className="text-xs text-amber">{check.warning}</span>}
              {helperText && <span className="text-[11px] text-text-muted">{helperText}</span>}
              {presets && presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setValue(String((Number(field?.initial) || 0) + amount))}
                      className="rounded-full border border-border bg-transparent px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-primary hover:text-primary"
                    >
                      +{amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              )}
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Reason (logged to the audit trail)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you making this change?" className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              disabled={busy || !reasonOk || !!check.error}
              onClick={async () => {
                setBusy(true)
                setErr('')
                try {
                  await onConfirm(value, reason.trim())
                } catch (e) {
                  setErr(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
                } finally {
                  setBusy(false)
                }
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${danger ? 'bg-destructive' : 'bg-primary'}`}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
          {!reasonOk && (
            <p className="text-[11px] text-text-muted">A reason of at least {MIN_REASON} characters is required - every action is audit-logged.</p>
          )}
        </div>
      </AdminCard>
      </div>
    </div>
  )
}

function ResetModal({ accountId, ownerEmail, onClose, onDone }: { accountId: number; ownerEmail: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const [err, setErr] = useState('')
  const dialogRef = useDialog(onClose)
  const titleId = useId()

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      const res = await adminResetPassword(accountId)
      setLink(res.resetLink)
      setEmailSent(res.emailSent)
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
      <AdminCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="font-display text-lg font-semibold">Reset owner password</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {!link ? (
          <>
            <p className="text-sm text-text-muted">
              Generate a password-reset link for <span className="font-semibold text-text">{ownerEmail}</span>. This is logged to the audit trail.
            </p>
            {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
                Cancel
              </button>
              <button disabled={busy} onClick={run} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg disabled:opacity-50">
                {busy ? 'Generating…' : 'Generate link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm">
              {emailSent ? 'Reset email sent. You can also copy the link:' : 'Email is not configured - copy this link and send it to the user:'}
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-high p-2">
              <input readOnly value={link} className="flex-1 bg-transparent text-xs outline-none" />
              <button onClick={() => navigator.clipboard.writeText(link)} className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-bg">
                Copy
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => onDone('Password reset link generated.')} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg">
                Done
              </button>
            </div>
          </>
        )}
      </AdminCard>
      </div>
    </div>
  )
}


const KIND_LABELS: Record<string, string> = {
  subscription: 'Subscription',
  topup: 'Credit top-up',
  overage: 'Overage',
  phone_number: 'Phone number',
}

/** Last 30 days from /admin/usage: the same row the Usage & cost page shows. */
function UsageCost({ accountId }: { accountId: number }) {
  const [row, setRow] = useState<AdminUsageRow | null | undefined>(undefined)
  const [error, setError] = useState(false)
  useEffect(() => {
    adminUsage({ days: 30, accountId })
      .then((u) => setRow(u.accounts[0] ?? null))
      .catch(() => setError(true))
  }, [accountId])
  const n = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1 })
  const inr = (v: number) => (v < 0 ? '-₹' : '₹') + Math.abs(Math.round(v)).toLocaleString('en-IN')
  const cells: [string, string, boolean?][] = row
    ? [
        ['Calls', n(row.calls)],
        ['Minutes', n(row.minutes)],
        ['Credits used', n(row.credits)],
        ['Revenue (ex-GST)', inr(row.revenueInr)],
        ['Est. vendor cost', '~' + inr(row.estCostInr)],
        ['Est. margin', '~' + inr(row.marginInr), row.marginInr < 0],
      ]
    : []
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Usage & cost · last 30 days</h3>
        <Link to="/admin/usage" className="text-xs font-semibold text-primary hover:underline">All accounts</Link>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Couldn't load usage.</p>
      ) : row === undefined ? (
        <div className="h-12 animate-pulse rounded-lg bg-surface-high" />
      ) : row === null ? (
        <p className="text-sm text-text-muted">No calls or payments in the last 30 days.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cells.map(([label, value, negative]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
              <div className={`font-display text-lg font-bold tabular-nums ${negative ? 'text-destructive' : ''}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-text-muted">Vendor cost is an estimate from average per-minute rates (see Usage & cost).</p>
    </div>
  )
}

/** The tenant's invoices and top-ups (last 10), with the same PDF the tenant downloads. */
function BillingTab({ d }: { d: Detail }) {
  const rows = d.invoices ?? []
  return (
    <>
    <UsageCost accountId={d.account.id} />
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Invoices & top-ups</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No payments or payment attempts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-text-muted">
                <th className="py-2 pr-3 font-bold">Date</th>
                <th className="py-2 pr-3 font-bold">What</th>
                <th className="py-2 pr-3 font-bold">Invoice no.</th>
                <th className="py-2 pr-3 text-right font-bold">Amount</th>
                <th className="py-2 pr-3 font-bold">Status</th>
                <th className="py-2 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-text-muted">{new Date((inv.paid_at ?? inv.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('en-IN')}</td>
                  <td className="py-2 pr-3">
                    {KIND_LABELS[inv.kind] ?? inv.kind}
                    {inv.kind === 'topup' && inv.credits ? ` · +${(inv.credits + (inv.bonus_credits ?? 0)).toLocaleString('en-IN')} credits` : ''}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono">{inv.invoice_number ?? '-'}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">₹{Number(inv.amount_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      inv.status === 'paid' ? 'bg-success/10 text-success' : inv.status === 'refunded' ? 'bg-amber/10 text-amber' : inv.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-surface-high text-text-muted'
                    }`}>{inv.status}</span>
                  </td>
                  <td className="py-2 text-right">
                    {(inv.status === 'paid' || inv.status === 'refunded') && (
                      <a href={adminInvoicePdfUrl(d.account.id, inv.id)} download className="text-xs font-semibold text-primary hover:underline">PDF</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  )
}
