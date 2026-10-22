import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import type { AgentConfig, PhoneNumber } from '../../lib/types'
import {
  connectMetaPages,
  createMetaRule,
  deleteMetaRule,
  fetchMetaOptions,
  fetchMetaRules,
  updateMetaPage,
  type MetaOptions,
  type MetaPage,
  type MetaRule,
  type MetaStatus,
} from '../../lib/metaLeads'
import { META_INPUT, MetaPanel, MetaPrimaryButton, MetaSecondaryButton, metaTimeAgo } from './bits'

type Notice = { tone: 'ok' | 'error'; text: string } | null

// Settings tab for Facebook & Instagram Lead Ads: which Pages to connect, the
// default agent and number per Page, and the lead rules (ad > form > Page).

export function MetaSettings({
  status,
  canManage,
  agents,
  numbers,
  onChanged,
  onNotice,
}: {
  status: MetaStatus
  canManage: boolean
  agents: AgentConfig[]
  numbers: PhoneNumber[]
  onChanged: () => void
  onNotice: (n: Notice) => void
}) {
  const pages = status.pages.filter((p) => p.status === 'active')
  return (
    <div className="flex flex-col gap-4">
      {status.pendingPages.length > 0 && (
        <PagePicker pending={status.pendingPages} canManage={canManage} onChanged={onChanged} onNotice={onNotice} />
      )}
      {!status.connected && status.pendingPages.length === 0 && (
        <MetaPanel title="Not connected" icon="link_off">
          <p className="text-xs text-text-muted">Connect with Facebook using the button at the top of this page, then choose your Pages here.</p>
        </MetaPanel>
      )}
      {pages.length > 0 && (
        <MetaPanel
          title="Connected Pages"
          icon="flag"
          subtitle="The default agent calls every lead from a Page unless a rule below says otherwise. The number is the caller ID."
        >
          <div className="flex flex-col gap-2">
            {pages.map((page) => (
              <PageRow key={page.page_id} page={page} agents={agents} numbers={numbers} canManage={canManage} onChanged={onChanged} onNotice={onNotice} />
            ))}
          </div>
        </MetaPanel>
      )}
      {(pages.length > 0 || status.connected) && (
        <LeadRules pages={pages} agents={agents} numbers={numbers} canManage={canManage} onNotice={onNotice} />
      )}
    </div>
  )
}

function PagePicker({
  pending,
  canManage,
  onChanged,
  onNotice,
}: {
  pending: Array<{ id: string; name: string }>
  canManage: boolean
  onChanged: () => void
  onNotice: (n: Notice) => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(pending.length === 1 ? [pending[0].id] : []))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const connect = async () => {
    setBusy(true)
    onNotice(null)
    try {
      const out = await connectMetaPages([...chosen])
      const refused = out.results.filter((r) => !r.ok)
      const unsubscribed = out.results.filter((r) => r.ok && r.subscribed === false)
      if (!out.ok) {
        onNotice({ tone: 'error', text: out.detail || 'That Facebook Page is already connected to another Vistrow workspace.' })
      } else if (refused.length || unsubscribed.length) {
        onNotice({
          tone: 'error',
          text: [
            refused.length ? `${refused.length} ${refused.length === 1 ? 'Page is' : 'Pages are'} already connected to another Vistrow workspace.` : '',
            unsubscribed.length ? `${unsubscribed.length} ${unsubscribed.length === 1 ? 'Page' : 'Pages'} could not be subscribed to new leads; reconnect and try again.` : '',
          ]
            .filter(Boolean)
            .join(' '),
        })
      } else {
        onNotice({ tone: 'ok', text: `${out.results.length} ${out.results.length === 1 ? 'Page' : 'Pages'} connected and subscribed to new leads.` })
      }
      onChanged()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not connect the Pages' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <MetaPanel title="Choose your Pages" icon="flag" subtitle="Pick the Pages that run your Lead Ads. Instagram ads belong to the Facebook Page they are linked to.">
      <div className="flex flex-col gap-2">
        {pending.map((page) => (
          <label key={page.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
            <input type="checkbox" checked={chosen.has(page.id)} disabled={!canManage} onChange={() => toggle(page.id)} className="h-4 w-4 accent-primary" />
            <span className="font-semibold">{page.name || page.id}</span>
            <span className="ml-auto font-mono text-[10px] text-text-muted">{page.id}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <MetaPrimaryButton icon="link" onClick={connect} disabled={!canManage || busy || chosen.size === 0}>
          {busy ? 'Connecting…' : `Connect ${chosen.size || ''} ${chosen.size === 1 ? 'Page' : 'Pages'}`}
        </MetaPrimaryButton>
        <span className="text-[11px] text-text-muted">A Page can belong to one Vistrow workspace only.</span>
      </div>
    </MetaPanel>
  )
}

function PageRow({
  page,
  agents,
  numbers,
  canManage,
  onChanged,
  onNotice,
}: {
  page: MetaPage
  agents: AgentConfig[]
  numbers: PhoneNumber[]
  canManage: boolean
  onChanged: () => void
  onNotice: (n: Notice) => void
}) {
  const [agentId, setAgentId] = useState(page.default_agent_id ? String(page.default_agent_id) : '')
  const [fromNumber, setFromNumber] = useState(page.default_from_number || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setAgentId(page.default_agent_id ? String(page.default_agent_id) : '')
    setFromNumber(page.default_from_number || '')
  }, [page.default_agent_id, page.default_from_number])
  const dirty = agentId !== (page.default_agent_id ? String(page.default_agent_id) : '') || fromNumber !== (page.default_from_number || '')
  const save = async () => {
    setSaving(true)
    try {
      await updateMetaPage(page.page_id, agentId ? Number(agentId) : null, fromNumber)
      onNotice({ tone: 'ok', text: `Saved the default for ${page.page_name || page.page_id}.` })
      onChanged()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }
  const liveAgents = agents.filter((a) => a.status === 'live')
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs md:flex-row md:items-center">
      <div className="min-w-0 md:w-56">
        <p className="truncate font-semibold">{page.page_name || page.page_id}</p>
        <p className="text-[11px] text-text-muted">
          {page.subscription_ok ? 'Subscribed to new leads' : 'Not subscribed'} · last lead {metaTimeAgo(page.last_lead_at)}
        </p>
      </div>
      <select value={agentId} disabled={!canManage} onChange={(e) => setAgentId(e.target.value)} className={`${META_INPUT} md:flex-1`} aria-label={`Default agent for ${page.page_name || page.page_id}`}>
        <option value="">First live agent with a number</option>
        {liveAgents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select value={fromNumber} disabled={!canManage} onChange={(e) => setFromNumber(e.target.value)} className={`${META_INPUT} md:w-48`} aria-label={`Caller number for ${page.page_name || page.page_id}`}>
        <option value="">Agent's own number</option>
        {numbers
          .filter((n) => n.status === 'active')
          .map((n) => (
            <option key={n.number} value={n.number}>
              {n.number}
              {n.label ? ` · ${n.label}` : ''}
            </option>
          ))}
      </select>
      <MetaSecondaryButton icon="save" onClick={save} disabled={!canManage || !dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </MetaSecondaryButton>
    </div>
  )
}

function LeadRules({
  pages,
  agents,
  numbers,
  canManage,
  onNotice,
}: {
  pages: MetaPage[]
  agents: AgentConfig[]
  numbers: PhoneNumber[]
  canManage: boolean
  onNotice: (n: Notice) => void
}) {
  const [rules, setRules] = useState<MetaRule[] | null | undefined>(undefined)
  const [options, setOptions] = useState<MetaOptions | null | undefined>(undefined)
  const [pageId, setPageId] = useState(pages[0]?.page_id ?? '')
  const [kind, setKind] = useState<'ad' | 'form'>('form')
  const [value, setValue] = useState('')
  const [agentId, setAgentId] = useState('')
  const [fromNumber, setFromNumber] = useState('')
  const [adding, setAdding] = useState(false)

  const reload = () => fetchMetaRules().then(setRules).catch(() => setRules(null))
  useEffect(() => {
    reload()
    fetchMetaOptions().then(setOptions).catch(() => setOptions(null))
  }, [])
  useEffect(() => {
    if (!pageId && pages[0]) setPageId(pages[0].page_id)
  }, [pages, pageId])

  if (rules === null || options === null) {
    return (
      <MetaPanel title="Lead rules" icon="signpost" subtitle="Send each form or ad to its own agent.">
        <p className="text-xs text-text-muted">Rules are not available yet. Every lead goes to the Page's default agent above.</p>
      </MetaPanel>
    )
  }

  const formsFor = (p: string) => (options?.forms ?? []).filter((f) => f.pageId === p)
  const adsFor = (p: string) => (options?.ads ?? []).filter((a) => a.pageId === p)
  const choices = kind === 'form' ? formsFor(pageId).map((f) => ({ id: f.formId, label: f.label || f.formName || f.formId })) : adsFor(pageId).map((a) => ({ id: a.adId, label: `${a.adName || a.adId}${a.campaignName ? ` · ${a.campaignName}` : ''}` }))
  const liveAgents = (options?.agents ?? agents.map((a) => ({ id: a.id, name: a.name, status: a.status }))).filter((a) => a.status === 'live')
  const activeNumbers = options?.numbers ?? numbers.filter((n) => n.status === 'active').map((n) => ({ number: n.number, agentId: n.agentId }))
  const pageName = (p: string) => pages.find((x) => x.page_id === p)?.page_name || p
  const ruleTarget = (r: MetaRule) => {
    if (r.label) return r.label
    if (r.matchKind === 'form') return formsFor(r.pageId).find((f) => f.formId === r.matchValue)?.formName || `Form ${r.matchValue}`
    return adsFor(r.pageId).find((a) => a.adId === r.matchValue)?.adName || `Ad ${r.matchValue}`
  }
  const agentName = (id: number) => agents.find((a) => a.id === id)?.name ?? liveAgents.find((a) => a.id === id)?.name ?? 'Unassigned'

  const add = async () => {
    if (!pageId || !value || !agentId) return
    setAdding(true)
    try {
      const chosen = choices.find((c) => c.id === value)
      await createMetaRule({ pageId, matchKind: kind, matchValue: value, agentId: Number(agentId), fromNumber, label: chosen?.label ?? '' })
      setValue('')
      setAgentId('')
      setFromNumber('')
      await reload()
      onNotice({ tone: 'ok', text: 'Rule added.' })
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add the rule' })
    } finally {
      setAdding(false)
    }
  }
  const remove = async (id: number) => {
    try {
      await deleteMetaRule(id)
      await reload()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not remove the rule' })
    }
  }

  return (
    <MetaPanel
      title="Lead rules"
      icon="signpost"
      subtitle="Send each form or ad to its own agent. An ad rule beats a form rule beats the Page default."
    >
      {rules === undefined ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-[11px] text-text-muted">No rules yet. Every lead goes to its Page's default agent.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs">
              <Icon name={rule.matchKind === 'ad' ? 'campaign' : 'list_alt'} className="text-[14px] text-text-muted" />
              <span className="text-text-muted">{pageName(rule.pageId)}</span>
              <Icon name="chevron_right" className="text-[13px] text-text-muted" />
              <span className="rounded bg-surface-high px-1.5 py-0.5 text-[11px]">
                {rule.matchKind === 'ad' ? 'Ad' : 'Form'}: {ruleTarget(rule)}
              </span>
              <Icon name="arrow_forward" className="text-[13px] text-text-muted" />
              <span className="font-semibold">{agentName(rule.agentId)}</span>
              {rule.fromNumber && <span className="font-mono text-[11px] text-text-muted">{rule.fromNumber}</span>}
              {canManage && (
                <button type="button" onClick={() => remove(rule.id)} aria-label="Remove rule" className="ml-auto text-text-muted hover:text-destructive">
                  <Icon name="close" className="text-[15px]" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-[11px] font-semibold text-text-muted">Add a rule</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select value={pageId} onChange={(e) => { setPageId(e.target.value); setValue('') }} className={META_INPUT} aria-label="Page">
              {pages.map((p) => (
                <option key={p.page_id} value={p.page_id}>
                  {p.page_name || p.page_id}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(e) => { setKind(e.target.value as 'ad' | 'form'); setValue('') }} className={META_INPUT} aria-label="Match on">
              <option value="form">A form</option>
              <option value="ad">An ad</option>
            </select>
            <select value={value} onChange={(e) => setValue(e.target.value)} className={META_INPUT} aria-label={kind === 'ad' ? 'Ad' : 'Form'}>
              <option value="">{choices.length ? `Choose ${kind === 'ad' ? 'an ad' : 'a form'}` : `No ${kind === 'ad' ? 'ads' : 'forms'} seen yet`}</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={META_INPUT} aria-label="Agent">
              <option value="">Choose an agent</option>
              {liveAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} className={META_INPUT} aria-label="Caller number">
              <option value="">Agent's own number</option>
              {activeNumbers.map((n) => (
                <option key={n.number} value={n.number}>
                  {n.number}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <MetaSecondaryButton icon="add" onClick={add} disabled={adding || !pageId || !value || !agentId}>
              {adding ? 'Adding…' : 'Add rule'}
            </MetaSecondaryButton>
            <span className="text-[11px] text-text-muted">Forms and ads appear here once a lead from them has arrived.</span>
          </div>
        </div>
      )}
    </MetaPanel>
  )
}
