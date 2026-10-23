import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { IntegrationLogo } from '../IntegrationLogo'
import type { AgentConfig } from '../../lib/types'
import {
  connectMetaPages,
  fetchMetaOptions,
  fetchMetaStatus,
  metaStartUrl,
  openMetaConnectPopup,
  updateMetaPage,
} from '../../lib/metaLeads'
import { META_INPUT, MetaPrimaryButton, MetaSecondaryButton } from './bits'

// Connect Facebook & Instagram Lead Ads in one dialog on the integration page,
// the way ArthaLeads does it: explain, open Facebook's window, then choose the
// Pages and the agent here. Facebook will not load its sign-in inside our
// page, so that one step is a small window over this dialog.

type Step = 'intro' | 'waiting' | 'pick' | 'done'
type Connected = { pages: string[]; forms: number; agent: string }

export function MetaConnectModal({
  agents,
  onClose,
  onFinished,
}: {
  agents: AgentConfig[]
  onClose: () => void
  // openSettings: the admin asked to map forms and ads to agents next.
  onFinished: (openSettings: boolean) => void
}) {
  const [step, setStep] = useState<Step>('intro')
  const [problem, setProblem] = useState('')
  const [pending, setPending] = useState<Array<{ id: string; name: string }>>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [agentId, setAgentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState<Connected | null>(null)
  const popup = useRef<{ stop: () => void; focus: () => void } | null>(null)
  const liveAgents = agents.filter((a) => a.status === 'live')

  useEffect(() => () => popup.current?.stop(), [])

  const loadPending = async () => {
    const status = await fetchMetaStatus()
    const pages = status.ok ? status.status.pendingPages : []
    if (!pages.length) {
      setProblem('Facebook did not share any Page. Continue again and tick the Page that runs your Lead Ads.')
      setStep('intro')
      return
    }
    setPending(pages)
    setChosen(new Set(pages.length === 1 ? [pages[0].id] : []))
    setStep('pick')
  }

  const onResult = (result: string) => {
    popup.current = null
    if (result === 'pick_pages') {
      loadPending().catch(() => {
        setProblem('Signed in, but the Pages could not be loaded. Please try again.')
        setStep('intro')
      })
    } else if (result === 'no_pages') {
      setProblem('That Facebook account shared no Pages. Continue again and tick the Page that runs your Lead Ads.')
      setStep('intro')
    } else {
      setProblem('The Facebook sign-in did not finish. Please try again.')
      setStep('intro')
    }
  }

  const continueWithFacebook = () => {
    setProblem('')
    popup.current?.stop()
    popup.current = openMetaConnectPopup(onResult, () => {
      popup.current = null
      setProblem('The Facebook window was closed before finishing.')
      setStep('intro')
    })
    if (!popup.current) {
      setProblem('Your browser blocked the Facebook window. Allow pop-ups for this site and try again.')
      return
    }
    setStep('waiting')
  }

  const cancel = () => {
    popup.current?.stop()
    popup.current = null
    onClose()
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const connect = async () => {
    setBusy(true)
    setProblem('')
    try {
      const out = await connectMetaPages([...chosen])
      const ok = out.results.filter((r) => r.ok)
      if (!out.ok || !ok.length) {
        setProblem(out.detail || 'That Page is already connected to another Vistrow workspace.')
        return
      }
      if (agentId) await Promise.all(ok.map((r) => updateMetaPage(r.pageId, Number(agentId), '')))
      const options = await fetchMetaOptions().catch(() => null)
      const okIds = new Set(ok.map((r) => r.pageId))
      const notes: string[] = []
      const refused = out.results.length - ok.length
      if (refused) notes.push(`${refused} ${refused === 1 ? 'Page is' : 'Pages are'} already connected to another Vistrow workspace.`)
      if (ok.some((r) => r.subscribed === false)) notes.push('A Page could not be subscribed to new leads; reconnect it from Settings.')
      setProblem(notes.join(' '))
      setConnected({
        pages: ok.map((r) => pending.find((p) => p.id === r.pageId)?.name || r.pageId),
        forms: (options?.forms ?? []).filter((f) => okIds.has(f.pageId)).length,
        agent: liveAgents.find((a) => String(a.id) === agentId)?.name || 'your first live agent with a number',
      })
      setStep('done')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not connect the Pages')
    } finally {
      setBusy(false)
    }
  }

  const stepNumber = step === 'pick' ? 2 : step === 'done' ? 3 : 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Connect Facebook Lead Ads">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <IntegrationLogo integrationKey="facebook" />
          <div>
            <h2 className="text-base font-bold">Facebook &amp; Instagram Lead Ads</h2>
            <p className="text-xs text-text-muted">Connect your Pages in a minute</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <ol className="flex items-center gap-2 text-xs">
            <StepDot n={1} label="Connect" current={stepNumber} />
            <span className="h-px flex-1 bg-border" />
            <StepDot n={2} label="Choose Page" current={stepNumber} />
          </ol>

          {problem && (
            <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <Icon name="error" className="mt-0.5 text-[15px]" />
              {problem}
            </p>
          )}

          {step === 'intro' && (
            <>
              <div className="rounded-xl border border-border bg-surface-high px-4 py-3">
                <p className="text-sm font-semibold">What happens when you click below:</p>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm text-text-muted">
                  <Check>A Facebook window opens over this page</Check>
                  <Check>You choose your business, Page and ad account</Check>
                  <Check>Your Pages and lead forms load here automatically</Check>
                </ul>
              </div>
              <button
                type="button"
                onClick={continueWithFacebook}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 py-3 text-sm font-bold text-white hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
                  <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
                </svg>
                Continue with Facebook
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
              <p className="text-center text-xs text-text-muted">
                No technical setup needed. We never see your Facebook password, and the access never expires.
              </p>
              {problem.startsWith('Your browser blocked') && (
                <a href={metaStartUrl} className="text-center text-xs font-semibold text-primary hover:underline">
                  Continue in this tab instead
                </a>
              )}
            </>
          )}

          {step === 'waiting' && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
              <p className="text-sm font-semibold">Finish in the Facebook window</p>
              <p className="text-xs text-text-muted">Choose your business, Page and ad account, then press Confirm. This dialog moves on by itself.</p>
              <MetaSecondaryButton icon="open_in_new" onClick={() => popup.current?.focus()}>
                Show Facebook window
              </MetaSecondaryButton>
            </div>
          )}

          {step === 'pick' && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Which Pages run your Lead Ads?</p>
                {pending.map((page) => (
                  <label key={page.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm">
                    <input type="checkbox" checked={chosen.has(page.id)} onChange={() => toggle(page.id)} className="h-4 w-4 accent-primary" />
                    <span className="font-semibold">{page.name || page.id}</span>
                  </label>
                ))}
                <p className="text-[11px] text-text-muted">Instagram ads belong to the Facebook Page they are linked to. A Page can belong to one Vistrow workspace only.</p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Which agent calls these leads?</span>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={META_INPUT}>
                  <option value="">First live agent with a number</option>
                  {liveAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-text-muted">You can send a form or an ad to a different agent later in Settings.</span>
              </label>
              <MetaPrimaryButton icon="link" onClick={connect} disabled={busy || chosen.size === 0}>
                {busy ? 'Connecting…' : `Connect ${chosen.size || ''} ${chosen.size === 1 ? 'Page' : 'Pages'}`}
              </MetaPrimaryButton>
            </>
          )}

          {step === 'done' && connected && (
            <div className="flex flex-col items-center gap-2 py-1 text-center">
              <Icon name="check_circle" className="text-[40px] text-green-600" />
              <p className="text-sm font-semibold">{connected.pages.join(', ')} connected</p>
              <p className="text-xs text-text-muted">
                {connected.forms === 1 ? '1 lead form found. ' : `${connected.forms} lead forms found. `}
                New leads are called by {connected.agent} within 60 seconds, inside your calling hours.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          {step === 'done' ? (
            <>
              <MetaSecondaryButton icon="close" onClick={() => onFinished(false)}>
                Close
              </MetaSecondaryButton>
              <MetaPrimaryButton icon="alt_route" onClick={() => onFinished(true)}>
                Map forms and ads to agents
              </MetaPrimaryButton>
            </>
          ) : (
            <MetaSecondaryButton icon="close" onClick={cancel}>
              Cancel
            </MetaSecondaryButton>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDot({ n, label, current }: { n: number; label: string; current: number }) {
  const done = current > n
  const active = current === n
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
          done || active ? 'bg-primary text-white' : 'bg-surface-high text-text-muted'
        }`}
      >
        {done ? <Icon name="check" className="text-[14px]" /> : n}
      </span>
      <span className={active ? 'font-semibold' : 'text-text-muted'}>{label}</span>
    </li>
  )
}

function Check({ children }: { children: string }) {
  return (
    <li className="flex items-center gap-2">
      <Icon name="check_circle" className="text-[16px] text-primary" />
      {children}
    </li>
  )
}
