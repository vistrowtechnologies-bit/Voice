import { useEffect, useMemo, useState } from 'react'
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <VoicePreviewButton voice={entry.value} lang={lang} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon name={GENDER_ICON[entry.gender] ?? 'graphic_eq'} className="text-[15px] text-text-muted" />
          <span className="truncate text-sm font-semibold">{entry.name}</span>
          <TierPill entry={entry} />
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
      setError(e instanceof Error && e.message.includes('400') ? 'That voice needs a plan upgrade or you’ve hit your limit.' : 'Could not add that voice.')
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

  const selected = useMemo(() => (data?.voices ?? []).filter((v) => v.selected), [data])
  const available = useMemo(() => (data?.voices ?? []).filter((v) => !v.selected), [data])
  const slotsFull = !!data && data.selectedCount >= data.maxVoices

  return (
    <DashboardLayout>
      <PageHeader
        title="Voices"
        subtitle="Curate the voices your agents can use — listen before you add"
      >
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

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        {!data ? (
          <div className="flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
                {error}
              </div>
            )}

            {/* Your voices */}
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold">Your voices</p>
                  <p className="text-xs text-text-muted">
                    Only these appear in the agent voice picker.
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    slotsFull ? 'border-amber/40 bg-amber/10 text-amber' : 'border-border text-text-muted'
                  }`}
                >
                  {data.selectedCount} / {data.maxVoices}
                </span>
              </div>
              {selected.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-muted">
                  No voices yet — add some from the catalog below.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selected.map((v) => (
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
              )}
            </section>

            {/* Add voices */}
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
              <div>
                <p className="text-base font-bold">Add voices</p>
                <p className="text-xs text-text-muted">
                  Preview any voice, then add up to {data.maxVoices} total across all tiers.
                </p>
              </div>
              {available.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-muted">
                  Every available voice is already in your list.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {available.map((v) => (
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
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Voices
