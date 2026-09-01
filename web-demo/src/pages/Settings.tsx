import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  apiUpdateProfileAvatar,
  apiRemoveProfileAvatar,
  apiRequestEmailChange,
  apiProfilePreferences,
  apiDownloadDataExport,
  apiRequestAccountDeletion,
  apiCancelAccountDeletion,
  apiPrivacyRequests,
  apiSignedInDevices,
  apiSignOutDevice,
  apiSignOutOthers,
  apiUpdateProfilePreferences,
  apiUpdateMemberRole,
  apiUpdateProfile,
  hasRole,
  useAuth,
  type PendingInvite,
  type PrivacyRequest,
  type SignedInDevice,
  type TeamMember,
  type UserPreferences,
} from '../lib/auth'
import { fetchAvailabilitySettings, formatDateTime, updateAvailabilitySettings } from '../lib/api'
import type { AvailabilityConfig } from '../lib/types'

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

type Tab = 'general' | 'profile' | 'security' | 'preferences' | 'privacy' | 'team' | 'availability'
type TabGroup = { label: string; tabs: { id: Tab; label: string; description: string; icon: string }[] }

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Workspace',
    tabs: [
      { id: 'general', label: 'Workspace details', description: 'Company name and linked workspace controls', icon: 'business' },
      { id: 'team', label: 'Team & roles', description: 'Invite people and manage access', icon: 'group' },
      { id: 'availability', label: 'Scheduling', description: 'Business hours, timezone and booking rules', icon: 'event_available' },
    ],
  },
  {
    label: 'Account',
    tabs: [
      { id: 'profile', label: 'My profile', description: 'Your name and sign-in email', icon: 'person' },
      { id: 'security', label: 'Sign-in & security', description: 'Password and account protection', icon: 'lock' },
      { id: 'preferences', label: 'Preferences', description: 'Personal timezone, language and alerts', icon: 'tune' },
      { id: 'privacy', label: 'Data & privacy', description: 'Export data or delete your account', icon: 'privacy_tip' },
    ],
  },
]

const TABS = TAB_GROUPS.flatMap((group) => group.tabs)

export function Settings() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = TABS.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : 'general'
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (TABS.some((item) => item.id === requestedTab)) setTab(requestedTab as Tab)
  }, [requestedTab])

  const chooseTab = (next: Tab) => {
    setTab(next)
    setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true })
  }

  return (
    <DashboardLayout>
      <PageHeader title="Settings" subtitle="Manage your account, team, security, and workspace controls." />

      <section className="grid w-full min-w-0 max-w-6xl gap-5 overflow-hidden p-4 sm:p-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-surface p-2 lg:self-start">
          <div className="border-b border-border px-2 pb-3 pt-1">
            <p className="text-sm font-bold">Settings centre</p>
            <p className="mt-0.5 text-xs text-text-muted">Everything for your workspace and account.</p>
          </div>
          <div className="flex w-full min-w-0 gap-1 overflow-x-auto py-2 lg:flex-col lg:overflow-visible">
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="shrink-0 lg:mt-2">
                <p className="hidden px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted lg:block">{group.label}</p>
                <div className="flex gap-1 lg:flex-col">
                  {group.tabs.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => chooseTab(item.id)}
                      className={`flex min-w-max items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors lg:min-w-0 ${
                        tab === item.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-high hover:text-text'
                      }`}
                    >
                      <Icon name={item.icon} className="shrink-0 text-[18px]" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="hidden truncate text-[11px] text-text-muted lg:block">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {tab === 'general' && <GeneralTab />}
          {tab === 'profile' && <ProfileTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'privacy' && <DataPrivacyTab />}
          {tab === 'team' && <TeamTab canManage={hasRole(user, 'admin')} />}
          {tab === 'availability' && <AvailabilityTab canManage={hasRole(user, 'admin')} />}
        </div>
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
    <div className="flex flex-col gap-4">
      <SettingsCard title="Workspace details" subtitle="The company name shown across your dashboard, agents, and shared workspace.">
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

      <SettingsCard title="Related workspace controls" subtitle="These are kept with the feature they configure, so your team can find them where they work.">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { to: '/dashboard/integrations', icon: 'extension', label: 'Integrations', description: 'Connect Slack, CRM, WhatsApp and more.' },
            { to: '/dashboard/billing', icon: 'credit_card', label: 'Billing & credits', description: 'Plan, credits, invoices and usage.' },
            { to: '/dashboard/numbers', icon: 'dialpad', label: 'Phone numbers', description: 'Assign and manage calling numbers.' },
            { to: '/dashboard/website-widget', icon: 'widgets', label: 'Website widget', description: 'Control the embed and visitor experience.' },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
              <Icon name={item.icon} className="mt-0.5 text-[18px] text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="block text-xs text-text-muted">{item.description}</span>
              </span>
              <Icon name="arrow_forward" className="mt-1 text-[16px] text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

function ProfileTab() {
  const { user, setUser } = useAuth()
  const [profileName, setProfileName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!profileName.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const { user: updated } = await apiUpdateProfile({ name: profileName.trim(), phone: phone.trim() })
      setUser(updated)
      setMsg({ type: 'ok', text: 'Profile saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const removeAvatar = async () => {
    if (!window.confirm('Remove your profile photo?')) return
    setRemovingPhoto(true)
    setMsg(null)
    try {
      const { user: updated } = await apiRemoveProfileAvatar()
      setUser(updated)
      setMsg({ type: 'ok', text: 'Profile photo removed.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not remove your photo.' })
    } finally {
      setRemovingPhoto(false)
    }
  }

  const uploadAvatar = async (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Use a JPG, PNG, or WebP image under 2 MB.' })
      return
    }
    setUploading(true)
    setMsg(null)
    try {
      const { user: updated } = await apiUpdateProfileAvatar(file)
      setUser(updated)
      setMsg({ type: 'ok', text: 'Profile photo updated.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not update your photo.' })
    } finally {
      setUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const requestEmailChange = async () => {
    if (!newEmail.trim()) return
    setEmailBusy(true)
    setMsg(null)
    try {
      await apiRequestEmailChange(newEmail.trim())
      setMsg({ type: 'ok', text: `We sent a confirmation link to ${newEmail.trim()}.` })
      setNewEmail('')
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not request the email change.' })
    } finally {
      setEmailBusy(false)
    }
  }

  const profileChanged = profileName.trim() !== user?.name || phone.trim() !== (user?.phone || '')

  return <div className="flex flex-col gap-4">
    <SettingsCard title="Profile overview" subtitle="How you appear to teammates in this workspace.">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-high/30 p-4 sm:flex-row sm:items-center">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="Your profile" className="h-20 w-20 shrink-0 rounded-full border-2 border-primary/30 object-cover" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
            {(user?.name || '?').trim().slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{user?.name}</p>
          <p className="truncate text-sm text-text-muted">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{user?.role}</span>
            <span className="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">{user?.accountName}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading || removingPhoto} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50">
            {uploading ? 'Uploading…' : user?.avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
          {user?.avatarUrl && <button type="button" onClick={removeAvatar} disabled={uploading || removingPhoto} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-50">{removingPhoto ? 'Removing…' : 'Remove'}</button>}
        </div>
      </div>
      <p className="text-[11px] text-text-muted">JPG, PNG, or WebP · maximum 2 MB. Your photo is private to your authenticated workspace.</p>
    </SettingsCard>

    <SettingsCard title="Personal details" subtitle="Keep the contact details associated with your own login up to date.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Full name
          <input autoComplete="name" value={profileName} onChange={(e) => setProfileName(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
          <span className="flex items-baseline gap-1">Phone number <span className="font-normal">(optional)</span></span>
          <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 202 555 0123" className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-primary" />
        </label>
      </div>
      <p className="text-[11px] text-text-muted">For international numbers, include the country calling code. This is your account contact number, not an AI calling number.</p>
      <button onClick={save} disabled={saving || !profileName.trim() || !profileChanged} className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40">{saving ? 'Saving…' : 'Save profile'}</button>
    </SettingsCard>

    <SettingsCard title="Sign-in email" subtitle="This address identifies your account and receives security messages.">
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Current email
        <input value={user?.email || ''} disabled className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text-muted outline-none" />
      </label>
      {user?.passwordSet === false ? (
        <p className="flex items-start gap-2 rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-xs text-text-muted"><Icon name="info" className="mt-0.5 shrink-0 text-[16px] text-cyan" /><span>Create a password in <Link to="/dashboard/settings?tab=security" className="font-bold text-primary hover:underline">Sign-in &amp; security</Link> before changing an OAuth sign-in email.</span></p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@company.com" aria-label="New sign-in email" className="min-w-0 flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
          <button onClick={requestEmailChange} disabled={emailBusy || !newEmail.trim()} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary disabled:opacity-40">{emailBusy ? 'Sending…' : 'Send verification'}</button>
        </div>
      )}
      <p className="text-[11px] text-text-muted">The address changes only after you open the verification link sent to the new inbox.</p>
    </SettingsCard>

    {msg && <p role="status" className={`flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}><Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />{msg.text}</p>}
  </div>
}

function SecurityTab() {
  const { user, setUser } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [devices, setDevices] = useState<SignedInDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [endingSessions, setEndingSessions] = useState(false)
  const [endingDevice, setEndingDevice] = useState<string | null>(null)

  const hasPassword = user?.passwordSet !== false
  const loadDevices = async () => {
    try {
      const result = await apiSignedInDevices()
      setDevices(result.devices)
    } catch {
      setDevices([])
    } finally {
      setDevicesLoading(false)
    }
  }
  useEffect(() => { void loadDevices() }, [])
  const save = async () => {
    if ((hasPassword && !currentPassword) || newPassword.length < 8) return
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

  const signOutOthers = async () => {
    setEndingSessions(true)
    try {
      const { user: updated } = await apiSignOutOthers()
      setUser(updated)
      await loadDevices()
      setMsg({ type: 'ok', text: 'Other devices were logged out.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not log out other devices.' })
    } finally { setEndingSessions(false) }
  }

  const signOutDevice = async (device: SignedInDevice) => {
    setEndingDevice(device.id)
    setMsg(null)
    try {
      const result = await apiSignOutDevice(device.id)
      if (result.signedOutCurrent) {
        window.location.assign('/login')
        return
      }
      await loadDevices()
      setMsg({ type: 'ok', text: `${device.browser} on ${device.operatingSystem} was logged out.` })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not log out this device.' })
    } finally {
      setEndingDevice(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <p role="status" className={`flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          <Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
          {msg.text}
        </p>
      )}
      <SettingsCard
        title={hasPassword ? 'Password' : 'Create a password'}
        subtitle={hasPassword ? 'Change the password used to sign in.' : `You currently sign in with ${user?.authProvider || 'your connected account'}. Create a password to also sign in with email.`}
      >
      {!hasPassword && (
        <p className="flex items-start gap-2 rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-xs text-text-muted">
          <Icon name="info" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
          Your existing Google, Slack, or GitHub sign-in will continue to work. This simply adds email-and-password sign-in as another option.
        </p>
      )}
      {hasPassword && <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Current password</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>}
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
        disabled={saving || (hasPassword && !currentPassword) || newPassword.length < 8}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Create password'}
      </button>
      </SettingsCard>

      <SettingsCard title="Forgot your password?" subtitle="We’ll send a secure reset link to your sign-in email. You can use it even while you are signed in.">
        <a
          href="/forgot-password"
          className="self-start rounded-lg border border-border px-4 py-2 text-sm font-bold text-text transition-colors hover:border-primary hover:text-primary"
        >
          Send reset link
        </a>
      </SettingsCard>

      <SettingsCard title="Active sign-in methods" subtitle="You can continue using the sign-in method shown here. Creating a password adds email sign-in; it does not remove OAuth access.">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="verified_user" className="text-[17px] text-success" /> {hasPassword ? 'Email and password' : 'Email and password not set'}</span>
          <span className="text-xs text-text-muted">{hasPassword ? 'Available' : 'Optional'}</span>
        </div>
        {user?.authProvider && user.authProvider !== 'password' && (
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="login" className="text-[17px] text-primary" /> {user.authProvider[0].toUpperCase() + user.authProvider.slice(1)}</span>
            <span className="text-xs text-success">Available</span>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Your devices" subtitle="Browsers and devices currently signed in to your account.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">If you don’t recognize a device, log it out and change your password.</p>
          {devices.some((device) => !device.current) && (
            <button onClick={signOutOthers} disabled={endingSessions} className="shrink-0 self-start rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-destructive hover:text-destructive disabled:opacity-40">
              {endingSessions ? 'Logging out…' : 'Log out all other devices'}
            </button>
          )}
        </div>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          {devicesLoading ? (
            <p className="px-4 py-4 text-xs text-text-muted">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="px-4 py-4 text-xs text-text-muted">No signed-in devices found.</p>
          ) : devices.map((device) => (
            <div key={device.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={device.deviceType === 'mobile' ? 'smartphone' : device.deviceType === 'tablet' ? 'tablet_mac' : 'computer'} className="text-[21px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{device.browser} on {device.operatingSystem}</p>
                  {device.current && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success">Current device</span>}
                </div>
                <p className="text-[11px] text-text-muted">Last active {formatDateTime(device.lastActiveAt)}{device.provider ? ` · ${device.provider}` : ''}</p>
              </div>
              {!device.current && (
                <button onClick={() => signOutDevice(device)} disabled={endingDevice === device.id || endingSessions} className="self-start rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-destructive hover:text-destructive disabled:opacity-40 sm:self-auto">
                  {endingDevice === device.id ? 'Logging out…' : 'Log out'}
                </button>
              )}
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

function PreferencesTab() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { apiProfilePreferences().then(setPrefs).catch(() => setPrefs(null)) }, [])
  const save = async (next: NonNullable<typeof prefs>) => {
    const previous = prefs
    setPrefs(next); setSaving(true); setMessage(null)
    try {
      const updated = await apiUpdateProfilePreferences(next)
      setPrefs(updated)
      window.localStorage.setItem('vv-timezone', updated.timezone || 'UTC')
      setMessage('Preferences saved.')
    }
    catch (err) {
      setPrefs(previous)
      setMessage(err instanceof Error ? err.message : 'Could not save preferences.')
    }
    finally { setSaving(false) }
  }
  if (!prefs) return <SettingsCard title="Preferences" subtitle="Personal dashboard settings."><p className="text-xs text-text-muted">Loading…</p></SettingsCard>
  const Toggle = ({ field, label, description }: { field: 'notify_leads' | 'notify_calls' | 'notify_billing' | 'notify_product'; label: string; description: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-text-muted">{description}</span></span>
      <input type="checkbox" checked={prefs[field]} disabled={saving} onChange={(e) => save({ ...prefs, [field]: e.target.checked })} className="h-4 w-4 accent-primary disabled:opacity-50" />
    </label>
  )
  return <div className="flex flex-col gap-4">
    <SettingsCard title="Personal preferences" subtitle="These settings affect your own dashboard experience, not your team’s shared booking schedule.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Communication language<select value={prefs.language} onChange={(e) => save({ ...prefs, language: e.target.value as 'en' | 'hi' })} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-primary"><option value="en">English</option><option value="hi">Hindi</option></select><span className="font-normal text-[11px]">Used for account emails where a translation is available.</span></label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Your timezone<TimezoneSelect value={prefs.timezone} onChange={(timezone) => save({ ...prefs, timezone })} /></label>
      </div>
      {saving && <p className="text-xs text-text-muted">Saving…</p>}
    </SettingsCard>
    <SettingsCard title="Notifications" subtitle="Choose the operational emails you receive personally.">
      <div className="flex flex-col gap-2"><Toggle field="notify_leads" label="Qualified leads" description="New lead and follow-up alerts." /><Toggle field="notify_calls" label="Call issues" description="Important failed-call and delivery alerts." /><Toggle field="notify_billing" label="Billing" description="Credit, invoice, and plan notices." /><Toggle field="notify_product" label="Product updates" description="Occasional Vistrow Voice release updates." /></div>
    </SettingsCard>
    {message && <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted">{message}</p>}
  </div>
}

function DataPrivacyTab() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'export' | 'delete' | 'cancel' | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [confirmPhrase, setConfirmPhrase] = useState('')

  const load = () => apiPrivacyRequests().then((data) => setRequests(data.requests)).catch(() => setRequests([])).finally(() => setLoading(false))
  useEffect(() => { void load() }, [])

  const latestDeletion = requests.find((item) => item.request_type === 'deletion')
  const activeDeletion = latestDeletion && ['pending', 'in_progress'].includes(latestDeletion.status) ? latestDeletion : null
  const latestExport = requests.find((item) => item.request_type === 'export')

  const download = async () => {
    setAction('export'); setMessage(null)
    try {
      await apiDownloadDataExport()
      setMessage({ type: 'ok', text: 'Your data export was downloaded.' })
      await load()
    } catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not prepare your export.' }) }
    finally { setAction(null) }
  }

  const submitDeletion = async () => {
    if (!user || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase() || confirmPhrase !== 'DELETE') return
    setAction('delete'); setMessage(null)
    try {
      await apiRequestAccountDeletion(confirmEmail, confirmPhrase)
      setDeleteOpen(false); setConfirmEmail(''); setConfirmPhrase('')
      setMessage({ type: 'ok', text: 'Deletion request submitted. No data has been removed yet; we sent a receipt to your sign-in email.' })
      await load()
    } catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not submit the deletion request.' }) }
    finally { setAction(null) }
  }

  const cancelDeletion = async () => {
    if (!activeDeletion) return
    setAction('cancel'); setMessage(null)
    try {
      await apiCancelAccountDeletion(activeDeletion.id)
      setMessage({ type: 'ok', text: 'Your account deletion request was cancelled.' })
      await load()
    } catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not cancel the deletion request.' }) }
    finally { setAction(null) }
  }

  if (loading) return <SettingsCard title="Data & privacy" subtitle="Manage your personal data and account lifecycle."><div className="h-32 animate-pulse rounded-lg bg-surface-high" /></SettingsCard>

  return <div className="flex flex-col gap-4">
    <SettingsCard title="Download your data" subtitle="Get a portable copy of the information connected to your workspace.">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-high/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><Icon name="download" className="mt-0.5 text-[20px] text-primary" /><div><p className="text-sm font-bold">JSON data export</p><p className="text-xs text-text-muted">{hasRole(user, 'admin') ? 'Includes your profile and authorized workspace data: agents, calls, contacts, appointments, knowledge metadata, integration status, and billing usage.' : 'Includes your profile, personal preferences, and security activity. Shared customer and workspace data remains available only to workspace administrators.'}</p>{latestExport && <p className="mt-1 text-[11px] text-text-muted">Last downloaded {formatDateTime(latestExport.created_at)}</p>}</div></div>
        <button onClick={download} disabled={action !== null} className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary disabled:opacity-40">{action === 'export' ? 'Preparing…' : 'Download my data'}</button>
      </div>
      <p className="text-[11px] text-text-muted">Passwords, API keys, access tokens, and stored integration credentials are never included.</p>
    </SettingsCard>

    <SettingsCard title="Delete my account" subtitle="Request permanent removal of your account and the data in scope.">
      {activeDeletion ? (
        <div className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="flex items-center gap-2 text-sm font-bold"><Icon name="schedule" className="text-[18px] text-amber" />Deletion request {activeDeletion.status === 'in_progress' ? 'in progress' : 'pending'}</p><p className="mt-1 text-xs text-text-muted">Submitted {formatDateTime(activeDeletion.created_at)}. No data has been deleted yet.</p></div>
            {activeDeletion.status === 'pending' && <button onClick={cancelDeletion} disabled={action !== null} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40">{action === 'cancel' ? 'Cancelling…' : 'Cancel request'}</button>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl"><p className="text-sm font-bold text-destructive">This action is permanent after verification</p><p className="mt-1 text-xs text-text-muted">{user?.role === 'owner' ? 'Because you own this workspace, our privacy team will verify workspace ownership, active subscriptions, and which shared customer records must be retained or removed before processing.' : 'Your personal profile and workspace access will be reviewed for deletion without removing data that belongs to other workspace members.'}</p></div>
          <button onClick={() => { setMessage(null); setDeleteOpen(true) }} className="shrink-0 rounded-lg border border-destructive/60 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10">Request deletion</button>
        </div>
      )}
      <p className="text-[11px] text-text-muted">You can cancel a pending request here. Once processing begins, contact support@vistroevoice.com and reference the receipt sent to your email.</p>
    </SettingsCard>

    {message && <p role="status" className={`rounded-lg border border-border bg-surface px-3 py-2 text-xs ${message.type === 'ok' ? 'text-success' : 'text-destructive'}`}>{message.text}</p>}

    {deleteOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && action !== 'delete') setDeleteOpen(false) }}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="delete-account-title" className="text-lg font-bold">Request account deletion</h2><p className="mt-1 text-sm text-text-muted">No data is deleted immediately. We verify the request and email you before processing.</p></div><button type="button" aria-label="Close deletion dialog" onClick={() => setDeleteOpen(false)} disabled={action === 'delete'} className="rounded-lg p-1 text-text-muted hover:bg-surface-high hover:text-text"><Icon name="close" className="text-[20px]" /></button></div>
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Enter your sign-in email
            <input type="email" autoComplete="off" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={user?.email} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-destructive" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">Type <span className="font-mono text-text">DELETE</span> to confirm
            <input value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-destructive" />
          </label>
          {message?.type === 'error' && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{message.text}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDeleteOpen(false)} disabled={action === 'delete'} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={submitDeletion} disabled={action !== null || confirmEmail.trim().toLowerCase() !== user?.email.toLowerCase() || confirmPhrase !== 'DELETE'} className="rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{action === 'delete' ? 'Submitting…' : 'Submit deletion request'}</button></div>
        </div>
      </div>
    </div>}
  </div>
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
        text: res.emailSent ? `Invite sent to ${email.trim()}.` : `Email isn't configured - share this link: ${res.inviteLink}`,
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

const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'Mon', label: 'Monday' },
  { key: 'Tue', label: 'Tuesday' },
  { key: 'Wed', label: 'Wednesday' },
  { key: 'Thu', label: 'Thursday' },
  { key: 'Fri', label: 'Friday' },
  { key: 'Sat', label: 'Saturday' },
  { key: 'Sun', label: 'Sunday' },
]

// Fallback for browsers without Intl.supportedValuesOf('timeZone') (Safari <
// 17, older WebViews) - covers every major region so the picker still works,
// just with a shorter list.
const TIMEZONE_FALLBACK = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Mexico_City',
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland',
]

function allTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    if (supported) return supported('timeZone')
  } catch {
    // fall through to the fallback list below
  }
  return TIMEZONE_FALLBACK
}

/** Searchable timezone picker - a button showing the current value that
 * opens a filterable dropdown of every IANA zone, instead of a plain text
 * input where a typo silently produces an invalid timezone. */
function TimezoneSelect({ value, onChange, disabled }: { value: string; onChange: (tz: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const zones = useMemo(allTimezones, [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return zones
    return zones.filter((z) => z.toLowerCase().includes(q))
  }, [zones, query])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-[180px] items-center justify-between gap-2 rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      >
        {value || 'Select timezone'}
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[16px] text-text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-surface shadow-lg">
          <div className="relative border-b border-border p-2">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search time zones..."
              className="w-full rounded-md border border-border bg-surface-high py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-text-muted">No matching time zones.</p>
            ) : (
              filtered.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => {
                    onChange(z)
                    setQuery('')
                    setOpen(false)
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-high ${
                    z === value ? 'font-semibold text-primary' : ''
                  }`}
                >
                  {z}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AvailabilityTab({ canManage }: { canManage: boolean }) {
  const [cfg, setCfg] = useState<AvailabilityConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [blackoutInput, setBlackoutInput] = useState('')

  useEffect(() => {
    fetchAvailabilitySettings().then(setCfg).catch(() => setCfg(null))
  }, [])

  if (!cfg) return <SettingsCard title="Availability" subtitle="Business hours the AI agent books appointments against.">
    <p className="text-xs text-text-muted">Loading…</p>
  </SettingsCard>

  const save = async (next: AvailabilityConfig) => {
    setCfg(next)
    setSaving(true)
    setMsg(null)
    try {
      const saved = await updateAvailabilitySettings(next)
      setCfg(saved)
      setMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: string, open: boolean) => {
    const hours = { ...cfg.hours, [day]: open ? { open: '10:00', close: '19:00' } : null }
    save({ ...cfg, hours })
  }

  const setDayTime = (day: string, field: 'open' | 'close', value: string) => {
    const current = cfg.hours[day]
    if (!current) return
    save({ ...cfg, hours: { ...cfg.hours, [day]: { ...current, [field]: value } } })
  }

  const addBlackout = () => {
    if (!blackoutInput || cfg.blackout_dates.includes(blackoutInput)) return
    save({ ...cfg, blackout_dates: [...cfg.blackout_dates, blackoutInput] })
    setBlackoutInput('')
  }

  const removeBlackout = (date: string) => {
    save({ ...cfg, blackout_dates: cfg.blackout_dates.filter((d) => d !== date) })
  }

  return (
    <SettingsCard
      title="Availability"
      subtitle="Business hours, slot length, and timezone your AI agent checks and books appointments against - one set for your whole account."
    >
      {!canManage && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Icon name="info" className="text-[15px]" />
          Only Admins and the Owner can change availability.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {WEEKDAYS.map(({ key, label }) => {
          const hours = cfg.hours[key]
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={!!hours}
                  disabled={!canManage}
                  onChange={(e) => toggleDay(key, e.target.checked)}
                />
                {label}
              </label>
              {hours ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <input
                    type="time"
                    value={hours.open}
                    disabled={!canManage}
                    onChange={(e) => setDayTime(key, 'open', e.target.value)}
                    className="rounded-lg border border-border bg-surface-high px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={hours.close}
                    disabled={!canManage}
                    onChange={(e) => setDayTime(key, 'close', e.target.value)}
                    className="rounded-lg border border-border bg-surface-high px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
              ) : (
                <span className="text-sm text-text-muted">Closed</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Slot length
          <select
            value={cfg.slot_minutes}
            disabled={!canManage}
            onChange={(e) => save({ ...cfg, slot_minutes: Number(e.target.value) })}
            className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Timezone
          <TimezoneSelect
            value={cfg.timezone}
            disabled={!canManage}
            onChange={(tz) => save({ ...cfg, timezone: tz })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Blackout dates</p>
        {canManage && (
          <div className="flex gap-2">
            <input
              type="date"
              value={blackoutInput}
              onChange={(e) => setBlackoutInput(e.target.value)}
              className="rounded-lg border border-border bg-surface-high px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={addBlackout}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold hover:border-primary"
            >
              Add
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {cfg.blackout_dates.length === 0 && <span className="text-xs text-text-muted">None</span>}
          {cfg.blackout_dates.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
              {d}
              {canManage && (
                <button onClick={() => removeBlackout(d)} aria-label={`Remove ${d}`} className="text-text-muted hover:text-destructive">
                  <Icon name="close" className="text-[13px]" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {saving && <p className="text-xs text-text-muted">Saving…</p>}
      {msg && (
        <p className={`flex items-center gap-1.5 text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          <Icon name={msg.type === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
          {msg.text}
        </p>
      )}
    </SettingsCard>
  )
}
