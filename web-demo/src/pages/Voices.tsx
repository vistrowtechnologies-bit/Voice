import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { VoicePreviewButton } from '../components/VoicePreviewButton'
import { addVoice, fetchVoiceCatalog, removeVoice } from '../lib/api'
import type { VoiceCatalog, VoiceEntry, VoiceTier } from '../lib/types'

const PREVIEW_LANGS = [
  { code: 'hi', label: 'Hindi' },
  { code: 'en', label: 'English' },
] as const

const GENDER_ICON: Record<string, string> = { male: 'man', female: 'woman', neutral: 'graphic_eq' }

// Generated per-voice avatars — a colored initial "persona" circle (same idea
// as Slack/Linear default avatars) so each voice reads as a distinct
// character at a glance instead of every card in a tier sharing one identical
// icon. Color is a deterministic hash of the voice's own value, not its tier,
// so avatars stay visually varied across a tier group; tier is still legible
// from the pill/border. Palette is the app's existing accent tokens only —
// no new colors introduced.
const AVATAR_PALETTE = [
  'bg-primary/20 text-primary',
  'bg-cyan/20 text-cyan',
  'bg-magenta/20 text-magenta',
  'bg-amber/20 text-amber',
  'bg-success/20 text-success',
] as const

function avatarClass(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase()
}

function TierGroup({
  entries,
  lang,
  busyVoice,
  slotsFull,
  onAdd,
  onRemove,
}: {
  entries: VoiceEntry[]
  lang: string
  busyVoice: string | null
  slotsFull: boolean
  onAdd: (v: string) => void
  onRemove: (v: string) => void
}) {
  if (entries.length === 0) return null
  const { tierLabel, tierNote } = entries[0]
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold">{tierLabel}</h2>
        <span className="text-[11px] text-text-muted">{tierNote}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <VoiceCard
            key={entry.value}
            entry={entry}
            lang={lang}
            busy={busyVoice === entry.value}
            slotsFull={slotsFull}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  )
}

function VoiceCard({
  entry,
  lang,
  busy,
  slotsFull,
  onAdd,
  onRemove,
}: {
  entry: VoiceEntry
  lang: string
  busy: boolean
  slotsFull: boolean
  onAdd: (v: string) => void
  onRemove: (v: string) => void
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-surface p-4 ${
        entry.selected ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${avatarClass(entry.value)}`}
            >
              {initials(entry.name)}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-surface-high text-text-muted">
              <Icon name={GENDER_ICON[entry.gender] ?? 'graphic_eq'} className="text-[10px]" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{entry.name}</p>
            {entry.note && <p className="truncate text-[11px] text-text-muted">{entry.note}</p>}
          </div>
        </div>
        {entry.selected && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Icon name="check" className="text-[12px]" />
            Added
          </span>
        )}
      </div>

      <div className="mb-3 flex items-center justify-center rounded-lg border border-border bg-surface-high/40 py-3">
        <VoicePreviewButton voice={entry.value} lang={lang} className="border-0 bg-transparent" />
        <span className="text-xs text-text-muted">Listen to {entry.name}</span>
      </div>

      {entry.selected ? (
        <button
          onClick={() => onRemove(entry.value)}
          disabled={busy}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Icon name="remove_circle_outline" className="text-[15px]" />
          Remove
        </button>
      ) : !entry.addable ? (
        <Link
          to="/dashboard/billing"
          title={entry.lockedReason}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-primary"
        >
          <Icon name="lock" className="text-[15px]" />
          Upgrade to add
        </Link>
      ) : (
        <button
          onClick={() => onAdd(entry.value)}
          disabled={busy || slotsFull}
          title={slotsFull ? 'Remove a voice first' : 'Add to your voices'}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
        >
          <Icon name="add" className="text-[15px]" />
          Add to my voices
        </button>
      )}
    </div>
  )
}

export function Voices() {
  const [data, setData] = useState<VoiceCatalog | null>(null)
  const [lang, setLang] = useState<string>('hi')
  const [busyVoice, setBusyVoice] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setData(await fetchVoiceCatalog())
    } catch {
      setError('Could not load voices.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function onAdd(voice: string) {
    setBusyVoice(voice)
    setError('')
    try {
      await addVoice(voice)
      await load()
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes('400')
          ? 'That voice needs a plan upgrade or you’ve hit your limit.'
          : 'Could not add that voice.'
      )
    } finally {
      setBusyVoice(null)
    }
  }

  async function onRemove(voice: string) {
    setBusyVoice(voice)
    setError('')
    try {
      await removeVoice(voice)
      await load()
    } catch {
      setError('Could not remove that voice.')
    } finally {
      setBusyVoice(null)
    }
  }

  const slotsFull = !!data && data.selectedCount >= data.maxVoices
  const byTier = (tier: VoiceTier) => (data?.voices ?? []).filter((v) => v.tier === tier)

  return (
    <DashboardLayout>
      <PageHeader title="Voices" subtitle="Preview any voice, then add it to your agents' picker">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          {PREVIEW_LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                lang === l.code ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
        {!data ? (
          <div className="flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan/20 text-cyan">
                  <Icon name="graphic_eq" className="text-[20px]" />
                </div>
                <div>
                  <p className="text-sm font-bold">Your voice menu</p>
                  <p className="text-xs text-text-muted">Only added voices show up in the agent voice picker.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-high">
                  <div
                    className={`h-full rounded-full ${slotsFull ? 'bg-amber' : 'bg-cyan'}`}
                    style={{ width: `${(data.selectedCount / data.maxVoices) * 100}%` }}
                  />
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    slotsFull ? 'border-amber/40 bg-amber/10 text-amber' : 'border-border text-text-muted'
                  }`}
                >
                  {data.selectedCount} / {data.maxVoices}
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
                {error}
              </div>
            )}

            <TierGroup
              entries={byTier('premium')}
              lang={lang}
              busyVoice={busyVoice}
              slotsFull={slotsFull}
              onAdd={onAdd}
              onRemove={onRemove}
            />
            <TierGroup
              entries={byTier('standard')}
              lang={lang}
              busyVoice={busyVoice}
              slotsFull={slotsFull}
              onAdd={onAdd}
              onRemove={onRemove}
            />
            <TierGroup
              entries={byTier('lite')}
              lang={lang}
              busyVoice={busyVoice}
              slotsFull={slotsFull}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Voices
