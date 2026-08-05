import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import {
  createSite,
  deleteSite,
  fetchAgents,
  fetchSites,
  fetchWidgetAvatarCatalog,
  fetchWidgetBackendUrl,
  regenerateSiteKey,
  updateSite,
  wordpressPluginUrl,
} from '../lib/api'
import type { AgentConfig, Site, WidgetAvatarOption } from '../lib/types'

// The greeting can contain quotes/ampersands - this is copy-pasted verbatim
// into a customer's own HTML, so it must be a well-formed attribute value,
// not just readable text.
function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function snippetFor(site: Site, backendUrl: string): string {
  const avatarAttr = site.widgetAvatar && site.widgetAvatar !== 'default' ? ` data-avatar="${site.widgetAvatar}"` : ''
  const greetingAttr = site.widgetGreeting ? ` data-greeting="${escapeHtmlAttr(site.widgetGreeting)}"` : ''
  return `<script src="${backendUrl}/widget.js" data-site-key="${site.siteKey}" data-api-base="${backendUrl}" data-position="${site.widgetPosition}" data-label="${site.widgetLabel}"${avatarAttr}${greetingAttr}></script>`
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
            <div className="divide-y divide-border">
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
  const [installMode, setInstallMode] = useState<'wordpress' | 'manual'>('wordpress')
  const [avatarSaved, setAvatarSaved] = useState(false)
  useEffect(() => setLabelDraft(site.widgetLabel), [site.widgetLabel])
  useEffect(() => setGreetingDraft(site.widgetGreeting), [site.widgetGreeting])

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
      ...partial,
    }).then(onChange)

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="widgets" className="text-[18px] text-cyan" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{site.name}</p>
          {site.allowedDomain && <p className="text-[11px] text-text-muted">{site.allowedDomain}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={site.agentId ?? ''}
            onChange={(e) => patchSite({ agentId: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs"
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
            className="rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs"
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
          onBlur={() => labelDraft.trim() && labelDraft !== site.widgetLabel && patchSite({ widgetLabel: labelDraft.trim() })}
          className="rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-text-muted">Greeting bubble</span>
        <input
          value={greetingDraft}
          onChange={(e) => setGreetingDraft(e.target.value.slice(0, 140))}
          onBlur={() => greetingDraft !== site.widgetGreeting && patchSite({ widgetGreeting: greetingDraft.trim() })}
          placeholder="Hi! I'm Artha - ask me anything, no forms."
          className="w-full max-w-md rounded-lg border border-border bg-surface-high px-2 py-1 text-xs outline-none focus:border-primary"
        />
      </div>

      {avatarCatalog.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-text-muted">Avatar color</span>
          <AvatarPicker
            catalog={avatarCatalog}
            backendUrl={backendUrl}
            value={site.widgetAvatar}
            onChange={(key) => {
              patchSite({ widgetAvatar: key }).then(() => {
                setAvatarSaved(true)
                setTimeout(() => setAvatarSaved(false), 1500)
              })
            }}
          />
          {avatarSaved && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-green-500">
              <Icon name="check" className="text-[13px]" />
              Saved - live on WordPress sites within a minute
            </span>
          )}
        </div>
      )}

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
