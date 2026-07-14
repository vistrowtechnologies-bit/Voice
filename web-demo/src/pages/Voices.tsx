import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { VoicePreviewButton } from '../components/VoicePreviewButton'
import { addVoice, fetchVoiceCatalog, removeVoice } from '../lib/api'
import type { VoiceCatalog, VoiceEntry } from '../lib/types'

const PREVIEW_LANGS = [
  { code: 'hi', label: 'Hindi' },
  { code: 'en', label: 'English' },
] as const

const GENDER_ICON: Record<string, string> = { male: 'man', female: 'woman', neutral: 'graphic_eq' }

function TierPill({ entry }: { entry: VoiceEntry }) {
  const tone =
    entry.tier === 'premium'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : 'border-border bg-surface-high text-text-muted'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {entry.tierLabel}
    </span>
  )
}

function VoiceRow({
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
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        entry.selected ? 'border-primary/30 bg-primary/[0.04]' : 'border-border bg-surface'
      }`}
    >
      <VoicePreviewButton voice={entry.value} lang={lang} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon name={GENDER_ICON[entry.gender] ?? 'graphic_eq'} className="text-[15px] text-text-muted" />
          <span className="truncate text-sm font-semibold">{entry.name}</span>
          <TierPill entry={entry} />
          {entry.selected && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary">
              <Icon name="check_circle" className="text-[13px]" />
              Added
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-text-muted">
          {entry.note ? `${entry.note} · ` : ''}
          {entry.tierNote}
        </p>
      </div>
      {entry.selected ? (
        <button
          onClick={() => onRemove(entry.value)}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Icon name="remove" className="text-[15px]" />
          Remove
        </button>
      ) : !entry.addable ? (
        <Link
          to="/dashboard/billing"
          title={entry.lockedReason}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
        >
          <Icon name="lock" className="text-[15px]" />
          Upgrade
        </Link>
      ) : (
        <button
          onClick={() => onAdd(entry.value)}
          disabled={busy || slotsFull}
          title={slotsFull ? 'Remove a voice first' : 'Add to your voices'}
          className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
        >
          <Icon name="add" className="text-[15px]" />
          Add
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

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {!data ? (
          <div className="flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted">
                Only the voices you add here appear in the agent voice picker.
              </p>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  slotsFull ? 'border-amber/40 bg-amber/10 text-amber' : 'border-border text-text-muted'
                }`}
              >
                {data.selectedCount} / {data.maxVoices} added
              </span>
            </div>

            {error && (
              <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {data.voices.map((v) => (
                <VoiceRow
                  key={v.value}
                  entry={v}
                  lang={lang}
                  busy={busyVoice === v.value}
                  slotsFull={slotsFull}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Voices
