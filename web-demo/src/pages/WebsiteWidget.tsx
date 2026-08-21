import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import {
  createSite,
  createSitePageRoute,
  deleteSite,
  deleteSitePageRoute,
  fetchAgents,
  fetchSitePageRoutes,
  fetchSites,
  fetchSiteSeenPaths,
  fetchWidgetAvatarCatalog,
  fetchWidgetBackendUrl,
  regenerateSiteKey,
  syncSiteWpPages,
  updateSite,
  wordpressPluginUrl,
} from '../lib/api'
import type { AgentConfig, Site, SitePageRoute, SiteSeenPath, WidgetAvatarOption } from '../lib/types'

// The greeting can contain quotes/ampersands - this is copy-pasted verbatim
// into a customer's own HTML, so it must be a well-formed attribute value,
// not just readable text.
function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Each pre-call field (name/phone/email) is really one three-way choice -
// don't ask at all, ask but let the visitor skip it, or make it mandatory -
// even though it's stored as two independent booleans (ask/require) to
// keep the sites table's columns simple and match how the backend already
// validates each field. This is the only place that couples them into one
// dropdown; everywhere else keeps reading/writing the two flags directly.
type FieldMode = 'off' | 'optional' | 'required'
function fieldModeOf(ask: boolean, require: boolean): FieldMode {
  return !ask ? 'off' : require ? 'required' : 'optional'
}
function fieldModeFlags(mode: FieldMode): { ask: boolean; require: boolean } {
  if (mode === 'off') return { ask: false, require: false }
  if (mode === 'required') return { ask: true, require: true }
  return { ask: true, require: false }
}

function snippetFor(site: Site, backendUrl: string): string {
  const avatarAttr = site.widgetAvatar && site.widgetAvatar !== 'default' ? ` data-avatar="${site.widgetAvatar}"` : ''
  const greetingAttr = site.widgetGreeting ? ` data-greeting="${escapeHtmlAttr(site.widgetGreeting)}"` : ''
  const modeAttr = site.widgetMode === 'chat' ? ` data-mode="chat"` : ''
  const askNameAttr = site.widgetAskName === false ? ` data-ask-name="false"` : ''
  const requireNameAttr = site.widgetAskName && site.widgetRequireName === false ? ` data-require-name="false"` : ''
  const askPhoneAttr = site.widgetAskPhone === false ? ` data-ask-phone="false"` : ''
  const requirePhoneAttr = site.widgetAskPhone && site.widgetRequirePhone === false ? ` data-require-phone="false"` : ''
  const askEmailAttr = site.widgetAskEmail === false ? ` data-ask-email="false"` : ''
  const requireEmailAttr = site.widgetAskEmail && site.widgetRequireEmail === true ? ` data-require-email="true"` : ''
  return `<script src="${backendUrl}/widget.js" data-site-key="${site.siteKey}" data-api-base="${backendUrl}" data-position="${site.widgetPosition}" data-label="${site.widgetLabel}"${avatarAttr}${greetingAttr}${modeAttr}${askNameAttr}${requireNameAttr}${askPhoneAttr}${requirePhoneAttr}${askEmailAttr}${requireEmailAttr}></script>`
}

// Matches the app's other inline <select> controls (e.g. the widget-type
// picker below) rather than a raw checkbox, which read as an unstyled
// browser default next to everything else on this page.
function FieldModeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: FieldMode
  onChange: (mode: FieldMode) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FieldMode)}
        className="rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
      >
        <option value="off">Don't ask</option>
        <option value="optional">Optional</option>
        <option value="required">Required</option>
      </select>
    </label>
  )
}

export function WebsiteWidget() {
  const [sites, setSites] = useState<Site[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [backendUrl, setBackendUrl] = useState<string | null>(null)
  const [avatarCatalog, setAvatarCatalog] = useState<WidgetAvatarOption[]>([])
  const [loaded, setLoaded] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newPosition, setNewPosition] = useState<Site['widgetPosition']>('bottom-right')
  const [newLabel, setNewLabel] = useState('Talk to us')
  const [newAvatar, setNewAvatar] = useState('default')
  const [newGreeting, setNewGreeting] = useState('')

  const reloadSites = () => fetchSites().then(setSites).catch(() => setSites([]))

  useEffect(() => {
    reloadSites()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
    fetchWidgetAvatarCatalog()
      .then((r) => setAvatarCatalog(r.avatars))
      .catch(() => setAvatarCatalog([]))
    fetchWidgetBackendUrl()
      .then((r) => setBackendUrl(r.backendUrl))
      .catch(() => setBackendUrl(null))
      .finally(() => setLoaded(true))
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createSite(
      newName.trim(),
      newAgentId ? Number(newAgentId) : null,
      newDomain.trim(),
      newPosition,
      newLabel.trim() || 'Talk to us',
      newAvatar,
      newGreeting.trim(),
    )
    setNewName('')
    setNewDomain('')
    setNewAgentId('')
    setNewPosition('bottom-right')
    setNewLabel('Talk to us')
    setNewAvatar('default')
    setNewGreeting('')
    reloadSites()
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Website Widget"
        subtitle="Embed a real-time AI call button on your website"
      />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        {loaded && !backendUrl && (
          <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/5 p-4 text-xs text-amber">
            <Icon name="warning" className="text-[16px]" />
            <p>
              This backend has no public URL configured (RAILWAY_PUBLIC_DOMAIN / PUBLIC_BASE_URL) - embed snippets
              below won't work for a real external site until it does. This is expected in local dev.
            </p>
          </div>
        )}

        <Card>
          <h3 className="mb-3 text-sm font-semibold">Add your website</h3>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Site name">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Corp - Homepage"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Agent">
              <select
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    → {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Domain (optional)">
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="acmecorp.com"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Corner">
              <select
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value as Site['widgetPosition'])}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </Field>
            <Field label="Button label">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Talk to us"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Greeting bubble (optional)">
              <input
                value={newGreeting}
                onChange={(e) => setNewGreeting(e.target.value.slice(0, 140))}
                placeholder="Hi! I'm Artha - ask me anything, no forms."
                className="w-full min-w-[240px] rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
            >
              <Icon name="add" className="text-[18px]" />
              Add website
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            Every website gets its own key and its own call history, filterable on the Calls page - pick an avatar
            color and other options after adding it below.
          </p>
        </Card>

        <SectionCard title={`Your sites (${sites.length})`}>
          {sites.length === 0 ? (
            <EmptyState icon="widgets" text="No sites yet - add one above to get an embeddable call widget." />
          ) : (
            <div className="flex flex-col gap-3 bg-surface-high/40 p-3 sm:p-4">
              {sites.map((site) => (
                <SiteRow
                  key={site.id}
                  site={site}
                  agents={agents}
                  backendUrl={backendUrl}
                  avatarCatalog={avatarCatalog}
                  onChange={reloadSites}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="extension" className="text-[20px]" />
            </div>
            <div>
              <p className="font-semibold">WordPress plugin</p>
              <p className="text-xs text-text-muted">
                Install it and paste in the site key above - that's the only thing it needs, no coding required.
              </p>
            </div>
            <a
              href={wordpressPluginUrl}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-cyan/40 px-3 py-2 text-xs font-bold text-cyan hover:bg-cyan/10"
            >
              <Icon name="download" className="text-[15px]" />
              Download plugin
            </a>
          </div>
        </Card>
      </section>
    </DashboardLayout>
  )
}

function SiteRow({
  site,
  agents,
  backendUrl,
  avatarCatalog,
  onChange,
}: {
  site: Site
  agents: AgentConfig[]
  backendUrl: string | null
  avatarCatalog: WidgetAvatarOption[]
  onChange: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [labelDraft, setLabelDraft] = useState(site.widgetLabel)
  const [greetingDraft, setGreetingDraft] = useState(site.widgetGreeting)
  const [avatarDraft, setAvatarDraft] = useState(site.widgetAvatar)
  const [modeDraft, setModeDraft] = useState<Site['widgetMode']>(site.widgetMode)
  const [nameModeDraft, setNameModeDraft] = useState<FieldMode>(fieldModeOf(site.widgetAskName, site.widgetRequireName))
  const [phoneModeDraft, setPhoneModeDraft] = useState<FieldMode>(fieldModeOf(site.widgetAskPhone, site.widgetRequirePhone))
  const [emailModeDraft, setEmailModeDraft] = useState<FieldMode>(fieldModeOf(site.widgetAskEmail, site.widgetRequireEmail))
  const [installMode, setInstallMode] = useState<'wordpress' | 'manual'>('wordpress')
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => setLabelDraft(site.widgetLabel), [site.widgetLabel])
  useEffect(() => setGreetingDraft(site.widgetGreeting), [site.widgetGreeting])
  useEffect(() => setAvatarDraft(site.widgetAvatar), [site.widgetAvatar])
  useEffect(() => setModeDraft(site.widgetMode), [site.widgetMode])
  useEffect(
    () => setNameModeDraft(fieldModeOf(site.widgetAskName, site.widgetRequireName)),
    [site.widgetAskName, site.widgetRequireName],
  )
  useEffect(
    () => setPhoneModeDraft(fieldModeOf(site.widgetAskPhone, site.widgetRequirePhone)),
    [site.widgetAskPhone, site.widgetRequirePhone],
  )
  useEffect(
    () => setEmailModeDraft(fieldModeOf(site.widgetAskEmail, site.widgetRequireEmail)),
    [site.widgetAskEmail, site.widgetRequireEmail],
  )

  const isDirty =
    labelDraft.trim() !== site.widgetLabel ||
    greetingDraft.trim() !== site.widgetGreeting ||
    avatarDraft !== site.widgetAvatar ||
    modeDraft !== site.widgetMode ||
    nameModeDraft !== fieldModeOf(site.widgetAskName, site.widgetRequireName) ||
    phoneModeDraft !== fieldModeOf(site.widgetAskPhone, site.widgetRequirePhone) ||
    emailModeDraft !== fieldModeOf(site.widgetAskEmail, site.widgetRequireEmail)

  const snippet = backendUrl ? snippetFor(site, backendUrl) : null

  const copySnippet = async () => {
    if (!snippet) return
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const copyKey = async () => {
    await navigator.clipboard.writeText(site.siteKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 1500)
  }

  // Always sends every field the backend's UPDATE statement writes, so a
  // single-field change (e.g. just the corner) can't silently reset the
  // others back to their defaults.
  const patchSite = (partial: Partial<Site>) =>
    updateSite(site.id, {
      name: site.name,
      allowedDomain: site.allowedDomain,
      agentId: site.agentId,
      status: site.status,
      widgetPosition: site.widgetPosition,
      widgetLabel: site.widgetLabel,
      widgetAvatar: site.widgetAvatar,
      widgetGreeting: site.widgetGreeting,
      widgetMode: site.widgetMode,
      widgetAskName: site.widgetAskName,
      widgetRequireName: site.widgetRequireName,
      widgetAskPhone: site.widgetAskPhone,
      widgetRequirePhone: site.widgetRequirePhone,
      widgetAskEmail: site.widgetAskEmail,
      widgetRequireEmail: site.widgetRequireEmail,
      ...partial,
    }).then(onChange)

  const saveChanges = () => {
    setSaving(true)
    setSaveError(false)
    const nameFlags = fieldModeFlags(nameModeDraft)
    const phoneFlags = fieldModeFlags(phoneModeDraft)
    const emailFlags = fieldModeFlags(emailModeDraft)
    patchSite({
      widgetLabel: labelDraft.trim(),
      widgetGreeting: greetingDraft.trim(),
      widgetAvatar: avatarDraft,
      widgetMode: modeDraft,
      widgetAskName: nameFlags.ask,
      widgetRequireName: nameFlags.require,
      widgetAskPhone: phoneFlags.ask,
      widgetRequirePhone: phoneFlags.require,
      widgetAskEmail: emailFlags.ask,
      widgetRequireEmail: emailFlags.require,
    })
      .then(() => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      })
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false))
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? `Collapse ${site.name}` : `Expand ${site.name}`}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left"
        >
          <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-[20px] text-text-muted" />
          <Icon name="widgets" className="text-[18px] text-cyan" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{site.name}</span>
            {site.allowedDomain && <span className="block text-[11px] text-text-muted">{site.allowedDomain}</span>}
          </span>
        </button>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          <select
            value={site.agentId ?? ''}
            onChange={(e) => patchSite({ agentId: e.target.value ? Number(e.target.value) : null })}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs sm:flex-none"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                → {a.name}
              </option>
            ))}
          </select>
          <select
            value={site.widgetPosition}
            onChange={(e) => patchSite({ widgetPosition: e.target.value as Site['widgetPosition'] })}
            aria-label="Widget corner"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs sm:flex-none"
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
          <button
            onClick={() =>
              confirm(`Regenerate the key for ${site.name}? The old key stops working immediately.`) &&
              regenerateSiteKey(site.id).then(onChange)
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-text-muted hover:bg-surface-high"
          >
            <Icon name="refresh" className="text-[15px]" />
            Regenerate key
          </button>
          <button
            onClick={() => confirm(`Delete ${site.name}? Its widget will stop working immediately.`) && deleteSite(site.id).then(onChange)}
            aria-label={`Delete ${site.name}`}
            className="text-text-muted hover:text-destructive"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </div>
      </div>

      {expanded && (
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted">Site key</span>
        <span className="font-mono">{showKey ? site.siteKey : `${site.siteKey.slice(0, 12)}${'•'.repeat(16)}`}</span>
        <button onClick={() => setShowKey((v) => !v)} className="text-text-muted hover:text-text">
          <Icon name={showKey ? 'visibility_off' : 'visibility'} className="text-[15px]" />
        </button>
        <button onClick={copyKey} className="text-text-muted hover:text-text" aria-label="Copy site key">
          <Icon name={keyCopied ? 'check' : 'content_copy'} className="text-[15px]" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted">Button label</span>
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          className="rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-text-muted">Greeting bubble</span>
        <input
          value={greetingDraft}
          onChange={(e) => setGreetingDraft(e.target.value.slice(0, 140))}
          placeholder="Hi! I'm Artha - ask me anything, no forms."
          className="w-full max-w-md rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-text-muted">Widget type</span>
        <select
          value={modeDraft === 'chat' ? 'chat' : 'voice'}
          onChange={(e) => setModeDraft(e.target.value as Site['widgetMode'])}
          className="rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
        >
          <option value="voice">Voice call (speaks, can also type)</option>
          <option value="chat">Chat only (text, no voice)</option>
        </select>
        <span className="text-[11px] text-text-muted">
          {modeDraft === 'chat' ? 'Visitors type, no voice call' : 'Visitors can speak or type'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="shrink-0 text-text-muted">Before starting, ask for</span>
        <FieldModeSelect label="Name" value={nameModeDraft} onChange={setNameModeDraft} />
        <FieldModeSelect label="Phone number" value={phoneModeDraft} onChange={setPhoneModeDraft} />
        <FieldModeSelect label="Email" value={emailModeDraft} onChange={setEmailModeDraft} />
        {nameModeDraft === 'off' && phoneModeDraft === 'off' && emailModeDraft === 'off' && (
          <span className="text-[11px] text-text-muted">No form - starts immediately on tap</span>
        )}
      </div>

      {avatarCatalog.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-text-muted">Avatar color</span>
          <AvatarPicker catalog={avatarCatalog} backendUrl={backendUrl} value={avatarDraft} onChange={setAvatarDraft} />
        </div>
      )}

      <PageRoutes site={site} agents={agents} avatarCatalog={avatarCatalog} backendUrl={backendUrl} />

      <div className="flex items-center gap-3">
        <button
          onClick={saveChanges}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-bg disabled:cursor-default disabled:opacity-40"
        >
          <Icon name={saving ? 'progress_activity' : 'save'} className={`text-[15px] ${saving ? 'animate-spin' : ''}`} />
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-500">
            <Icon name="check" className="text-[13px]" />
            Saved - live on WordPress sites within a minute
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
            <Icon name="error" className="text-[13px]" />
            Couldn't save - please try again
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-high/40 p-3">
        <div className="mb-2 flex gap-1 rounded-lg bg-surface p-1 text-xs">
          <button
            onClick={() => setInstallMode('wordpress')}
            className={`flex-1 rounded-md py-1.5 font-bold ${
              installMode === 'wordpress' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
            }`}
          >
            WordPress
          </button>
          <button
            onClick={() => setInstallMode('manual')}
            className={`flex-1 rounded-md py-1.5 font-bold ${
              installMode === 'manual' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
            }`}
          >
            Any other website
          </button>
        </div>

        {installMode === 'wordpress' ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted">
              Install the plugin, paste the site key above into its settings page, and save. It adds the
              widget to the site automatically - nothing to paste into your code.
            </p>
            <a
              href={wordpressPluginUrl}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-cyan/40 px-3 py-1.5 text-xs font-bold text-cyan hover:bg-cyan/10"
            >
              <Icon name="download" className="text-[14px]" />
              Download plugin
            </a>
          </div>
        ) : (
          snippet && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  Paste before &lt;/body&gt; on your site
                </span>
                <button
                  onClick={copySnippet}
                  className="flex items-center gap-1 text-[11px] font-bold text-cyan hover:opacity-80"
                >
                  <Icon name={copied ? 'check' : 'content_copy'} className="text-[14px]" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block overflow-x-auto whitespace-pre text-[11px] text-text">{snippet}</code>
            </div>
          )
        )}
      </div>
      </div>
      )}
    </div>
  )
}

// One site key (one embed, one WordPress install) still serving several
// landing pages under the same domain - a builder site with a dozen
// project-specific /project-name/ pages is the case this exists for. Each
// rule matches when the visitor's current URL path contains the pattern;
// unmatched pages keep using the site's own default agent above, so this
// is purely additive and never required.
function PageRoutes({
  site,
  agents,
  avatarCatalog,
  backendUrl,
}: {
  site: Site
  agents: AgentConfig[]
  avatarCatalog: WidgetAvatarOption[]
  backendUrl: string | null
}) {
  const [routes, setRoutes] = useState<SitePageRoute[]>([])
  const [seenPaths, setSeenPaths] = useState<SiteSeenPath[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [newPattern, setNewPattern] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newGreeting, setNewGreeting] = useState('')
  const [newAvatar, setNewAvatar] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const reload = () => fetchSitePageRoutes(site.id).then(setRoutes).catch(() => setRoutes([]))
  const reloadSeenPaths = () => fetchSiteSeenPaths(site.id).then(setSeenPaths).catch(() => setSeenPaths([]))

  useEffect(() => {
    if (expanded && !loaded) {
      Promise.all([reload(), reloadSeenPaths()]).finally(() => setLoaded(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const datalistId = `site-${site.id}-seen-paths`
  const unruledPaths = seenPaths.filter((p) => !routes.some((r) => p.path.includes(r.pathPattern)))

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncSiteWpPages(site.id)
      setSyncResult(`Found ${result.count} page${result.count === 1 ? '' : 's'}`)
      await reloadSeenPaths()
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : "Couldn't sync pages")
    } finally {
      setSyncing(false)
    }
  }

  const handleAdd = async () => {
    if (!newPattern.trim()) return
    setAdding(true)
    setAddError(false)
    try {
      await createSitePageRoute(site.id, newPattern.trim(), newAgentId ? Number(newAgentId) : null, newGreeting.trim(), newAvatar)
      setNewPattern('')
      setNewAgentId('')
      setNewGreeting('')
      setNewAvatar('')
      await reload()
    } catch {
      setAddError(true)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = (routeId: number) => {
    deleteSitePageRoute(site.id, routeId).then(reload)
  }

  return (
    <div className="rounded-lg border border-border bg-surface-high/40 p-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-text">
          <Icon name="signpost" className="text-[15px] text-cyan" />
          Page rules {routes.length > 0 && `(${routes.length})`}
        </span>
        <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-[18px] text-text-muted" />
      </button>
      {!expanded && (
        <p className="mt-1 text-[11px] text-text-muted">
          Same install, different agent per landing page - e.g. one project's URL gets its own agent and knowledge base.
        </p>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || !site.allowedDomain}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-text-muted hover:bg-surface disabled:cursor-default disabled:opacity-40"
              title={site.allowedDomain ? undefined : 'Set this site\'s domain above first'}
            >
              <Icon name={syncing ? 'progress_activity' : 'sync'} className={`text-[14px] ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Fetching pages…' : 'Fetch pages from this domain'}
            </button>
            {syncResult && <span className="text-[11px] text-text-muted">{syncResult}</span>}
          </div>

          {loaded && routes.length === 0 && (
            <p className="text-[11px] text-text-muted">
              No rules yet - every page on this site uses the default agent above.
            </p>
          )}
          {routes.map((route) => (
            <div key={route.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs">
              <Icon name="link" className="text-[14px] text-text-muted" />
              <code className="rounded bg-surface-high px-1.5 py-0.5 text-[11px]">{route.pathPattern}</code>
              <Icon name="arrow_forward" className="text-[13px] text-text-muted" />
              <span className="font-semibold">
                {agents.find((a) => a.id === route.agentId)?.name ?? 'Unassigned'}
              </span>
              {route.avatarOverride && backendUrl && (
                <img
                  src={`${backendUrl}/widget-avatars/${route.avatarOverride}.png`}
                  alt=""
                  title="Custom avatar for this page"
                  className="h-5 w-5 rounded-full border border-border object-cover"
                />
              )}
              {route.greetingOverride && (
                <span className="text-[11px] text-text-muted">"{route.greetingOverride}"</span>
              )}
              <button
                onClick={() => handleDelete(route.id)}
                aria-label={`Delete rule for ${route.pathPattern}`}
                className="ml-auto text-text-muted hover:text-destructive"
              >
                <Icon name="delete" className="text-[15px]" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <span className="w-full text-[10px] text-text-muted">
              "Add rule" below saves this rule right away - it's separate from the "Save changes" button
              at the bottom of the panel, which only saves the site's main settings.
            </span>
            <Field label="URL contains">
              <input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                list={datalistId}
                placeholder="/shapoorji-pallonji-plot-khopoli/"
                className="w-full min-w-[220px] rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
              <datalist id={datalistId}>
                {unruledPaths.map((p) => (
                  <option key={p.path} value={p.path} label={p.title || p.path} />
                ))}
              </datalist>
              {loaded && seenPaths.length === 0 && (
                <span className="mt-1 block text-[10px] text-text-muted">
                  No pages known yet - use "Fetch pages from this domain" above, or URLs show up here on their own
                  once a visitor opens a page with the widget installed.
                </span>
              )}
            </Field>
            <Field label="Agent">
              <select
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                className="rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs"
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    → {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Greeting override (optional)">
              <input
                value={newGreeting}
                onChange={(e) => setNewGreeting(e.target.value.slice(0, 140))}
                placeholder="Ask me about Khopoli plots!"
                className="w-full min-w-[200px] rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
            </Field>
            {avatarCatalog.length > 0 && (
              <Field label="Avatar override (optional)">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewAvatar('')}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                      newAvatar === '' ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text'
                    }`}
                  >
                    Site default
                  </button>
                  <AvatarPicker catalog={avatarCatalog} backendUrl={backendUrl} value={newAvatar} onChange={setNewAvatar} />
                </div>
              </Field>
            )}
            <button
              onClick={handleAdd}
              disabled={!newPattern.trim() || adding}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg disabled:opacity-40"
            >
              <Icon name="add" className="text-[15px]" />
              Add rule
            </button>
          </div>
          {addError && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
              <Icon name="error" className="text-[13px]" />
              Couldn't add that rule - please try again
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}

// Swatch grid for the curated avatar catalog (widget_avatars.py) - not a
// free-form upload, so this is just picking a key, previewed against the
// real served image so what you click is exactly what shows on the site.
function AvatarPicker({
  catalog,
  backendUrl,
  value,
  onChange,
}: {
  catalog: WidgetAvatarOption[]
  backendUrl: string | null
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {catalog.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={value === opt.key}
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 transition-colors ${
            value === opt.key ? 'border-primary' : 'border-transparent hover:border-border'
          }`}
        >
          {backendUrl ? (
            <img src={`${backendUrl}/widget-avatars/${opt.key}.png`} alt={opt.label} className="h-full w-full object-cover" />
          ) : (
            <span className="h-full w-full bg-surface-high" />
          )}
        </button>
      ))}
    </div>
  )
}
