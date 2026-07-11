import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { apiUpdateAccount, apiUpdateProfile, useAuth } from '../lib/auth'
import { createApiKey, deleteApiKey, fetchApiKeys, formatDateTime } from '../lib/api'
import type { ApiKey } from '../lib/types'

function SettingsCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <p className="text-base font-bold">{title}</p>
        <p className="text-xs text-text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function Settings() {
  const { user, setUser } = useAuth()

  const [companyName, setCompanyName] = useState(user?.accountName || '')
  const [companySaving, setCompanySaving] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [profileName, setProfileName] = useState(user?.name || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const saveCompany = async () => {
    if (!companyName.trim()) return
    setCompanySaving(true)
    setCompanyMsg(null)
    try {
      const { user: updated } = await apiUpdateAccount(companyName.trim())
      setUser(updated)
      setCompanyMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setCompanyMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setCompanySaving(false)
    }
  }

  const saveProfileName = async () => {
    if (!profileName.trim()) return
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const { user: updated } = await apiUpdateProfile({ name: profileName.trim() })
      setUser(updated)
      setProfileMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setProfileSaving(false)
    }
  }

  const savePassword = async () => {
    if (!currentPassword || newPassword.length < 8) return
    setPasswordSaving(true)
    setPasswordMsg(null)
    try {
      const { user: updated } = await apiUpdateProfile({ currentPassword, newPassword })
      setUser(updated)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordMsg({ type: 'ok', text: 'Password updated.' })
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not update password.' })
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Settings" subtitle="Your account and workspace" />

      <section className="flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
        <SettingsCard title="Workspace" subtitle="The company name shown across your dashboard.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={saveCompany}
              disabled={companySaving || !companyName.trim() || companyName.trim() === user?.accountName}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            >
              {companySaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {companyMsg && (
            <p className={`flex items-center gap-1.5 text-xs ${companyMsg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
              <Icon name={companyMsg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
              {companyMsg.text}
            </p>
          )}
        </SettingsCard>

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
                onClick={saveProfileName}
                disabled={profileSaving || !profileName.trim() || profileName.trim() === user?.name}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              >
                {profileSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {profileMsg && (
            <p className={`flex items-center gap-1.5 text-xs ${profileMsg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
              <Icon name={profileMsg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
              {profileMsg.text}
            </p>
          )}
        </SettingsCard>

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
            onClick={savePassword}
            disabled={passwordSaving || !currentPassword || newPassword.length < 8}
            className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            {passwordSaving ? 'Updating…' : 'Update password'}
          </button>
          {passwordMsg && (
            <p className={`flex items-center gap-1.5 text-xs ${passwordMsg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
              <Icon name={passwordMsg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
              {passwordMsg.text}
            </p>
          )}
        </SettingsCard>

        <ApiKeysCard />
      </section>
    </DashboardLayout>
  )
}

function ApiKeysCard() {
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
              <button
                onClick={() => remove(k.id)}
                aria-label={`Revoke ${k.name}`}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-destructive hover:text-destructive"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}
