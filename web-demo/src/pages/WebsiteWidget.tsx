import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import {
  createSite,
  deleteSite,
  fetchAgents,
  fetchSites,
  fetchWidgetBackendUrl,
  regenerateSiteKey,
  updateSite,
  wordpressPluginUrl,
} from '../lib/api'
import type { AgentConfig, Site } from '../lib/types'

function snippetFor(site: Site, backendUrl: string): string {
  return `<script src="${backendUrl}/widget.js" data-site-key="${site.siteKey}" data-api-base="${backendUrl}" data-position="${site.widgetPosition}" data-label="${site.widgetLabel}"></script>`
}

export function WebsiteWidget() {
  const [sites, setSites] = useState<Site[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [backendUrl, setBackendUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newPosition, setNewPosition] = useState<Site['widgetPosition']>('bottom-right')
  const [newLabel, setNewLabel] = useState('Talk to us')

  const reloadSites = () => fetchSites().then(setSites).catch(() => setSites([]))

  useEffect(() => {
    reloadSites()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
    fetchWidgetBackendUrl()
      .then((r) => setBackendUrl(r.backendUrl))
      .catch(() => setBackendUrl(null))
      .finally(() => setLoaded(true))
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createSite(newName.trim(), newAgentId ? Number(newAgentId) : null, newDomain.trim(), newPosition, newLabel.trim() || 'Talk to us')
    setNewName('')
    setNewDomain('')
    setNewAgentId('')
    setNewPosition('bottom-right')
    setNewLabel('Talk to us')
    reloadSites()
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Website Widget"
        subtitle="Embed a real-time AI call button on any client's website"
      />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        {loaded && !backendUrl && (
          <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/5 p-4 text-xs text-amber">
            <Icon name="warning" className="text-[16px]" />
            <p>
              This backend has no public URL configured (RAILWAY_PUBLIC_DOMAIN / PUBLIC_BASE_URL) — embed snippets
              below won't work for a real external site until it does. This is expected in local dev.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold">Add a client website</h3>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Site name">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Corp — Homepage"
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
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
            >
              <Icon name="add" className="text-[18px]" />
              Generate embed code
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            Every site gets its own key and its own call history, filterable on the Calls page — the domain field is
            just a label for now, not yet enforced.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">Your sites ({sites.length})</h3>
          </div>
          {sites.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-text-muted">
              No sites yet — add one above to get an embeddable call widget.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {sites.map((site) => (
                <SiteRow
                  key={site.id}
                  site={site}
                  agents={agents}
                  backendUrl={backendUrl}
                  onChange={reloadSites}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="extension" className="text-[20px]" />
            </div>
            <div>
              <p className="font-semibold">WordPress plugin</p>
              <p className="text-xs text-text-muted">
                Install it and paste in the site key above — that's the only thing it needs, no coding required.
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
        </div>
      </section>
    </DashboardLayout>
  )
}

function SiteRow({
  site,
  agents,
  backendUrl,
  onChange,
}: {
  site: Site
  agents: AgentConfig[]
  backendUrl: string | null
  onChange: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [labelDraft, setLabelDraft] = useState(site.widgetLabel)
  useEffect(() => setLabelDraft(site.widgetLabel), [site.widgetLabel])

  const snippet = backendUrl ? snippetFor(site, backendUrl) : null

  const copySnippet = async () => {
    if (!snippet) return
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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

      {snippet && (
        <div className="rounded-lg border border-border bg-surface-high/40 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
              Paste before &lt;/body&gt; on the client's site
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
