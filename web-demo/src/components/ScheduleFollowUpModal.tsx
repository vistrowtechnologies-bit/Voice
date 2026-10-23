import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { createFollowUp, fetchAgents } from '../lib/api'
import { formatWhen } from '../lib/followUps'
import type { AgentConfig, FollowUp } from '../lib/types'

// Schedule a follow-up call by hand (owner, 22 Oct 2026: phase 1). It goes in
// the same queue the AI's own follow-ups use: the agent's "Follow-up calls"
// campaign, dialled inside the calling window from the agent's number.

const KINDS: { key: 'callback' | 'nurture'; label: string; hint: string }[] = [
  { key: 'callback', label: 'Call them back', hint: 'The AI says it is calling back as agreed.' },
  { key: 'nurture', label: 'Check in on their interest', hint: 'The AI follows up on the earlier conversation. Skipped if they call us or book first.' },
]

/** A datetime-local value for a Date, in local time. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Tomorrow at 11:00, local time: the same hour the AI uses for a nurture call. */
function defaultWhen(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return toLocalInput(d)
}

export function ScheduleFollowUpModal({ source, onClose, onScheduled }: {
  /** Scheduling from a call: its person, number and agent are used. */
  source?: { callId: number; name: string; phone: string; agentId?: number | null }
  onClose: () => void
  onScheduled: (item: FollowUp, replaced: boolean) => void
}) {
  const [agents, setAgents] = useState<AgentConfig[] | null>(null)
  const [agentId, setAgentId] = useState<number | ''>(source?.agentId ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<'callback' | 'nurture'>('callback')
  const [when, setWhen] = useState(defaultWhen)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAgents()
      .then((list) => {
        setAgents(list)
        setAgentId((current) => (current !== '' ? current : list[0]?.id ?? ''))
      })
      .catch(() => setAgents([]))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // The help launcher would sit on the dialog's buttons (index.css hides it).
    document.documentElement.classList.add('vv-sheet-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('vv-sheet-open')
    }
  }, [onClose])

  const submit = async () => {
    setError('')
    if (!when) return setError('Pick a date and time')
    if (!source && !phone.trim()) return setError('Enter their phone number')
    if (agentId === '') return setError('Pick the agent who should call')
    setSaving(true)
    try {
      const out = await createFollowUp({
        source_call_id: source?.callId,
        agent_id: agentId,
        phone: source ? undefined : phone.trim(),
        name: source ? undefined : name.trim(),
        kind,
        at: new Date(when).toISOString(),
        note: note.trim() || undefined,
      })
      onScheduled(out.item, out.replaced)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule it. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Schedule a follow-up call" onClick={onClose}>
      <div className="vv-sheet-up flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Schedule a follow-up</h2>
            <p className="mt-0.5 text-xs text-text-muted">The AI places this call on its own at the time you pick, inside your calling hours.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-muted hover:text-text">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {source ? (
          <div className="rounded-xl bg-surface-high/50 px-3 py-2 text-sm">
            <span className="font-semibold">{source.name || 'Caller'}</span>
            {source.phone && <span className="text-text-muted"> · {source.phone}</span>}
            <span className="text-text-muted"> · from call #{source.callId}</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" className={field} />
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          Agent who calls
          <select value={agentId} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : '')} className={field} disabled={!agents}>
            {!agents && <option value="">Loading…</option>}
            {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold text-text-muted">What the call is for</legend>
          {KINDS.map((k) => (
            <label key={k.key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${kind === k.key ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <input type="radio" name="follow-up-kind" checked={kind === k.key} onChange={() => setKind(k.key)} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-xs text-text-muted">{k.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          When
          <input type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} className={field} />
          {when && <span className="font-medium">{formatWhen(new Date(when).toISOString())}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          Note for the AI <span className="font-normal">(optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={3} placeholder="e.g. Ask if the home-loan approval came through" className={`${field} resize-none`} />
          <span className="self-end font-normal">{note.length}/300</span>
        </label>

        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-high">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
