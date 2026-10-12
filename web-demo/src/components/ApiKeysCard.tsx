import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { UpgradeRequiredModal } from './UpgradeRequiredModal'
import { createApiKey, deleteApiKey, fetchApiKeys, fetchWidgetBackendUrl, formatDateTime } from '../lib/api'
import type { ApiKey, ApiKeyScope } from '../lib/types'

// Mirrors server/token_api.py _API_KEY_SCOPE_WRITES and _API_KEY_BLOCKED_PATHS.
const SCOPES: { id: ApiKeyScope; label: string; description: string }[] = [
  { id: 'read', label: 'Read', description: 'View calls, agents, contacts, campaigns and appointments.' },
  { id: 'calls', label: 'Calls', description: 'Start calls, run campaigns, add contacts and book appointments.' },
  { id: 'agents', label: 'Agents', description: 'Create and change agents and knowledge bases.' },
  { id: 'full', label: 'Full', description: 'Everything above. Keys can never touch billing, team, account settings or other keys.' },
]

const inputCls = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'
const quietBtn = 'rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50'

/** Settings → Developer → API keys: create keys with permissions, see where
 * each one is used, and revoke them. The full secret is shown once. */
export function ApiKeysCard({ canManage, plan }: { canManage: boolean; plan: string }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read', 'calls'])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState<string | null>(null)
  // The full secret is returned exactly once, on creation; it is kept in
  // memory only until dismissed and can never be fetched again.
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [backendUrl, setBackendUrl] = useState<string | null>(null)

  const load = () => fetchApiKeys().then(setKeys).catch(() => setKeys([]))
  useEffect(() => {
    void load()
    fetchWidgetBackendUrl().then((r) => setBackendUrl(r.backendUrl)).catch(() => setBackendUrl(null))
  }, [])

  const toggle = (scope: ApiKeyScope) =>
    setScopes((current) => {
      if (scope === 'full') return current.includes('full') ? ['read', 'calls'] : ['full']
      const next = current.includes(scope) ? current.filter((s) => s !== scope) : [...current.filter((s) => s !== 'full'), scope]
      return next.length ? next : ['read']
    })

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const created = await createApiKey(name.trim() || 'API key', scopes)
      setFreshKey(created.key)
      setName('')
      setScopes(['read', 'calls'])
      setCopied(false)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the key.'
      if (msg.toLowerCase().includes('upgrade')) setUpgrade(msg)
      else setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops working immediately.`)) return
    setRevoking(key.id)
    try {
      await deleteApiKey(key.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the key.')
    } finally {
      setRevoking(null)
    }
  }

  const base = backendUrl || 'https://<your-api-host>'
  const scaleOnly = plan !== 'scale'

  return (
    <div className="flex flex-col gap-4">
      {upgrade && <UpgradeRequiredModal message={upgrade} onClose={() => setUpgrade(null)} />}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Icon name="key" className="text-[18px] text-primary" />
            API keys
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            Let your own systems use Vistrow Voice. Each key gets only the permissions you tick, and a key can never change
            billing, your team, account settings or other keys.
          </p>
        </div>

        {freshKey && (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Icon name="key" className="text-[15px] text-primary" />
              Copy this key now. It won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-bg px-3 py-2 font-mono text-xs text-cyan">{freshKey}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(freshKey); setCopied(true) }}
                className={quietBtn}
              >
                <span className="flex items-center gap-1"><Icon name={copied ? 'check' : 'content_copy'} className="text-[14px]" />{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button type="button" onClick={() => setFreshKey(null)} aria-label="Dismiss" className="bg-transparent text-text-muted hover:text-text">
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          </div>
        )}

        {!canManage ? (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <Icon name="info" className="text-[15px]" />
            Only admins and the owner can create or revoke API keys.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-high/30 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">New key</p>
            {scaleOnly && (
              <p className="flex items-center gap-1.5 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-text">
                <Icon name="info" className="text-[15px] text-amber" />
                API access is part of the Scale plan.
              </p>
            )}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="What will use this key? e.g. CRM sync, Zapier, our website"
              aria-label="Key name"
              className={inputCls}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCOPES.map((s) => {
                const on = scopes.includes(s.id)
                const impliedByFull = s.id !== 'full' && scopes.includes('full')
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${on || impliedByFull ? 'border-primary/60 bg-primary/5' : 'border-border bg-surface hover:border-primary/40'}`}
                  >
                    <input
                      type="checkbox"
                      checked={on || impliedByFull}
                      disabled={impliedByFull}
                      onChange={() => toggle(s.id)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">{s.label}</span>
                      <span className="text-xs text-text-muted">{s.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
            >
              <Icon name="add" className="text-[18px]" />
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
            <Icon name="error" className="text-[15px]" />
            {error}
          </p>
        )}

        {keys === null ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-text-muted">No API keys yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{k.name}</p>
                  <p className="font-mono text-[11px] text-text-muted">
                    {k.prefix}•••••• · created {formatDateTime(k.createdAt)}
                    {k.lastUsedAt ? ` · last used ${formatDateTime(k.lastUsedAt)}` : ' · never used'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded-full bg-surface-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                      {s}
                    </span>
                  ))}
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void revoke(k)}
                    disabled={revoking === k.id}
                    aria-label={`Revoke ${k.name}`}
                    className={`${quietBtn} hover:border-destructive hover:text-destructive`}
                  >
                    {revoking === k.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-bold">How to use a key</h3>
        <p className="text-xs text-text-muted">
          Send it in the <code className="rounded bg-surface-high px-1 py-0.5 font-mono">X-Api-Key</code> header. The key acts for this
          workspace with the permissions you gave it.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-text">
{`curl ${base}/agents \\
  -H "X-Api-Key: vv_your_key_here"

curl ${base}/contacts \\
  -H "X-Api-Key: vv_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Asha Verma", "phone": "+919800000001"}'`}
        </pre>
        <p className="text-xs text-text-muted">
          A request outside the key's permissions is refused with a 403 and a message saying which permission it needs.
        </p>
      </section>
    </div>
  )
}
