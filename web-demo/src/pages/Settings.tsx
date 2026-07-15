import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import {
  apiInviteMember,
  apiRemoveMember,
  apiRevokeInvite,
  apiTeamInvites,
  apiTeamMembers,
  apiUpdateAccount,
  apiUpdateMemberRole,
  apiUpdateProfile,
  hasRole,
  useAuth,
  type PendingInvite,
  type TeamMember,
} from '../lib/auth'
import { createApiKey, deleteApiKey, fetchApiKeys, formatDateTime } from '../lib/api'
import type { ApiKey } from '../lib/types'

function SettingsCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card variant="flat" className="flex flex-col gap-4">
      <div>
        <p className="text-base font-bold">{title}</p>
        <p className="text-xs text-text-muted">{subtitle}</p>
      </div>
      {children}
    </Card>
  )
}

type Tab = 'general' | 'profile' | 'security' | 'team' | 'apiKeys'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'business' },
  { id: 'profile', label: 'Profile', icon: 'person' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'team', label: 'Team', icon: 'group' },
  { id: 'apiKeys', label: 'API Keys', icon: 'key' },
]

export function Settings() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = TABS.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : 'general'
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <DashboardLayout>
      <PageHeader title="Settings" subtitle="Your account and workspace" />

      <section className="flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <Icon name={t.icon} className="text-[16px]" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && <GeneralTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'team' && <TeamTab canManage={hasRole(user, 'admin')} />}
        {tab === 'apiKeys' && <ApiKeysCard canManage={hasRole(user, 'admin')} />}
      </section>
    </DashboardLayout>
  )
}

function GeneralTab() {
  const { user, setUser } = useAuth()
  const [companyName, setCompanyName] = useState(user?.accountName || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const save = async () => {
    if (!companyName.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const { user: updated } = await apiUpdateAccount(companyName.trim())
      setUser(updated)
      setMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title="Workspace" subtitle="The company name shown across your dashboard.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={save}
          disabled={saving || !companyName.trim() || companyName.trim() === user?.accountName}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg && (
        <p className={`flex items-center gap-1.5 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          <Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
          {msg.text}
        </p>
      )}
    </SettingsCard>
  )
}

function ProfileTab() {
  const { user, setUser } = useAuth()
  const [profileName, setProfileName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const save = async () => {
    if (!profileName.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const { user: updated } = await apiUpdateProfile({ name: profileName.trim() })
      setUser(updated)
      setMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title="Your profile" subtitle="Name and email on this account.">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Email</span>
        <input
          value={user?.email || ''}
          disabled
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text-muted outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Name</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={save}
            disabled={saving || !profileName.trim() || profileName.trim() === user?.name}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`flex items-center gap-1.5 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          <Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
          {msg.text}
        </p>
      )}
    </SettingsCard>
  )
}

function SecurityTab() {
  const { setUser } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const save = async () => {
    if (!currentPassword || newPassword.length < 8) return
    setSaving(true)
    setMsg(null)
    try {
      const { user: updated } = await apiUpdateProfile({ currentPassword, newPassword })
      setUser(updated)
      setCurrentPassword('')
      setNewPassword('')
      setMsg({ type: 'ok', text: 'Password updated.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not update password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title="Password" subtitle="Change the password used to sign in.">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Current password</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">New password</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <button
        onClick={save}
        disabled={saving || !currentPassword || newPassword.length < 8}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? 'Updating…' : 'Update password'}
      </button>
      {msg && (
        <p className={`flex items-center gap-1.5 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          <Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
          {msg.text}
        </p>
      )}
    </SettingsCard>
  )
}

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }
const INVITABLE_ROLES = ['admin', 'member', 'viewer'] as const

function RolePill({ role }: { role: string }) {
  const tone =
    role === 'owner'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : role === 'admin'
        ? 'border-cyan/40 bg-cyan/10 text-cyan'
        : 'border-border bg-surface-high text-text-muted'
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{ROLE_LABELS[role] || role}</span>
}

function TeamTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      apiTeamMembers().catch(() => []),
      canManage ? apiTeamInvites().catch(() => []) : Promise.resolve([]),
    ])
      .then(([m, i]) => {
        setMembers(m)
        setInvites(i)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeRole = async (id: number, role: string) => {
    await apiUpdateMemberRole(id, role).catch(() => {})
    load()
  }

  const remove = async (id: number, name: string) => {
    if (!confirm(`Remove ${name} from this workspace?`)) return
    await apiRemoveMember(id).catch(() => {})
    load()
  }

  const revoke = async (id: number) => {
    await apiRevokeInvite(id).catch(() => {})
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Team members" subtitle="Everyone with access to this workspace.">
        {canManage && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {showInvite ? 'Cancel' : '+ Invite member'}
          </button>
        )}
        {showInvite && <InviteForm onSent={() => { setShowInvite(false); load() }} />}

        {loading ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  <p className="truncate text-[11px] text-text-muted">
                    {m.email} · {m.auth_provider || 'password'}
                    {m.last_login_at ? ` · last login ${formatDateTime(m.last_login_at)}` : ' · never logged in'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      {INVITABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RolePill role={m.role} />
                  )}
                  {canManage && m.role !== 'owner' && m.id !== user?.id && (
                    <button
                      onClick={() => remove(m.id, m.name)}
                      aria-label={`Remove ${m.name}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-text-muted hover:border-destructive hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {canManage && invites.length > 0 && (
        <SettingsCard title="Pending invites" subtitle="Sent but not yet accepted.">
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{inv.name}</p>
                  <p className="truncate text-[11px] text-text-muted">{inv.email} · invited {formatDateTime(inv.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RolePill role={inv.role} />
                  <button
                    onClick={() => revoke(inv.id)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-text-muted hover:border-destructive hover:text-destructive"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}
    </div>
  )
}

function InviteForm({ onSent }: { onSent: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const send = async () => {
    if (!email.trim() || !name.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await apiInviteMember({ email: email.trim(), name: name.trim(), role })
      setResult({
        ok: true,
        text: res.emailSent ? `Invite sent to ${email.trim()}.` : `Email isn't configured — share this link: ${res.inviteLink}`,
      })
      setEmail('')
      setName('')
      setRole('member')
      setTimeout(onSent, res.emailSent ? 800 : 4000)
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Could not send invite.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-high/50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          type="email"
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={send}
        disabled={sending || !email.trim() || !name.trim()}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {sending ? 'Sending…' : 'Send invite'}
      </button>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-success' : 'text-destructive'}`}>{result.text}</p>
      )}
    </div>
  )
}

function ApiKeysCard({ canManage }: { canManage: boolean }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The full secret is returned exactly once, on creation — we hold it in
  // memory only until the operator dismisses it; it's never fetchable again.
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = () =>
    fetchApiKeys()
      .then(setKeys)
      .catch(() => setKeys([]))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const created = await createApiKey(name.trim() || 'API key')
      setFreshKey(created.key)
      setName('')
      setCopied(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key.')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    await deleteApiKey(id).catch(() => {})
    load()
  }

  return (
    <SettingsCard
      title="API keys"
      subtitle="Programmatic access to the Vistrow Voice API. Send the key as the X-Api-Key header."
    >
      {!canManage && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Icon name="info" className="text-[15px]" />
          Only Admins and the Owner can create or revoke API keys.
        </p>
      )}

      {freshKey && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-text">
            <Icon name="key" className="text-[15px] text-primary" />
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-bg px-3 py-2 font-mono text-xs text-cyan">{freshKey}</code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(freshKey)
                setCopied(true)
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setFreshKey(null)}
              aria-label="Dismiss"
              className="text-text-muted hover:text-text"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Production server)"
            className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={create}
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            {creating ? 'Creating…' : '+ New key'}
          </button>
        </div>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <Icon name="error" className="text-[15px]" />
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-text-muted">No API keys yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{k.name}</p>
                <p className="font-mono text-[11px] text-text-muted">
                  {k.prefix}••••••  · created {formatDateTime(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${formatDateTime(k.lastUsedAt)}` : ' · never used'}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => remove(k.id)}
                  aria-label={`Revoke ${k.name}`}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-destructive hover:text-destructive"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}
