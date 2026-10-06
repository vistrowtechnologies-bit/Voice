import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { VoicePreviewButton } from '../components/VoicePreviewButton'
import { addVoice, fetchVoiceCatalog, removeVoice } from '../lib/api'
import type { VoiceCatalog, VoiceEntry } from '../lib/types'
import { Tooltip } from '../components/ui/Tooltip'

const PREVIEW_LANGS = [
  { code: 'hi', label: 'Hindi' },
  { code: 'en', label: 'English' },
] as const

// Voices shown per category before "Show more". Keeps the page about one
// screen tall instead of listing the whole catalogue (it used to be ~13,000 px).
const PAGE_SIZE = 10

// A soft two-tone orb per voice, derived from the voice's own value so each one
// reads as a distinct character. Static on purpose: the old cards each ran an
// infinite spin animation, 86 of them at once.
const AVATAR_HUES = ['--color-primary', '--color-cyan', '--color-magenta', '--color-amber', '--color-success'] as const

// djb2: spreads short strings far more evenly than a multiply-add hash.
function hash(value: string): number {
  let h = 5381
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

function avatarGradient(value: string, name: string): string {
  const first = hash(value) % AVATAR_HUES.length
  const second = (first + 1 + (hash(name) % (AVATAR_HUES.length - 1))) % AVATAR_HUES.length
  return (
    `radial-gradient(circle at 25% 25%, var(${AVATAR_HUES[first]}) 0%, transparent 70%), ` +
    `radial-gradient(circle at 80% 75%, var(${AVATAR_HUES[second]}) 0%, transparent 70%), ` +
    'var(--color-surface-high)'
  )
}

type TabKey = 'expressive' | 'hd' | 'standard' | 'native' | 'gemini' | 'premium'

interface Tab {
  key: TabKey
  label: string
  note: string
  voices: VoiceEntry[]
}

function VoicesSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse" aria-hidden="true">
      <div className="h-9 rounded-lg border border-border bg-surface" />
      <div className="h-9 w-2/3 rounded-lg bg-surface-high" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-[60px] rounded-lg border border-border bg-surface" />
      ))}
      <span className="sr-only" aria-live="polite">
        Loading voices
      </span>
    </div>
  )
}

function VoiceRow({
  entry,
  lang,
  busy,
  showTier,
  onAdd,
  onRemove,
}: {
  entry: VoiceEntry
  lang: string
  busy: boolean
  showTier: boolean
  onAdd: (v: string) => void
  onRemove: (v: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 ${
        entry.selected ? 'border-primary/40' : 'border-border'
      }`}
    >
      <div
        className="h-9 w-9 shrink-0 rounded-full"
        style={{ background: avatarGradient(entry.value, entry.name) }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{entry.name}</p>
          {showTier && (
            <span className="shrink-0 rounded-full bg-surface-high px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
              {entry.tierLabel}
            </span>
          )}
        </div>
        {/* What the voice can speak, in words: a single-language voice cannot
            follow a caller who switches language, and that is what this
            product is sold on, so it is said here rather than found on a call. */}
        {entry.canSwitchLanguage ? (
          <Tooltip content={`Speaks ${entry.languageCount} languages including ${entry.languageLabels.join(', ')}, and switches between them mid-call`}>
            <p className="truncate text-[11px] text-cyan">{entry.languageCount} languages · switches live</p>
          </Tooltip>
        ) : (
          <Tooltip content={`Speaks only ${entry.languageLabels.join(', ')}. It cannot follow a caller who switches language mid-call.`}>
            <p className="truncate text-[11px] text-amber-500">{entry.languageLabels[0] ?? 'Single'} only</p>
          </Tooltip>
        )}
      </div>

      <VoicePreviewButton voice={entry.value} lang={entry.forceLang || lang} />

      {entry.selected ? (
        <button
          onClick={() => onRemove(entry.value)}
          disabled={busy}
          className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Icon name="check" className="text-[14px] text-primary" />
          Added
        </button>
      ) : !entry.addable ? (
        <Tooltip content={entry.lockedReason}>
          <Link
            to="/dashboard/billing"
            className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Icon name="lock" className="text-[14px]" />
            Upgrade
          </Link>
        </Tooltip>
      ) : (
        <button
          onClick={() => onAdd(entry.value)}
          disabled={busy}
          className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="add" className="text-[14px]" />
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
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('expressive')
  const [expanded, setExpanded] = useState(false)

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
        e instanceof Error && e.message.includes('400') ? 'That voice needs a plan upgrade.' : 'Could not add that voice.'
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

  const tabs: Tab[] = useMemo(() => {
    const all = (data?.voices ?? []).filter((v) => !v.preview)
    const stable = (tier: string) => all.filter((v) => v.tier === tier)
    const isChirp = (v: VoiceEntry) => v.value.toLowerCase().includes('chirp3')
    const list: Tab[] = [
      {
        key: 'expressive',
        label: 'Expressive',
        note: '2x credits · most expressive · switches language live',
        voices: stable('premium').filter((v) => v.multilingual),
      },
      {
        key: 'hd',
        label: 'HD',
        note: '1x credits · fastest Google voices · ten Indian languages, switches mid-call',
        voices: stable('standard').filter(isChirp),
      },
      {
        key: 'standard',
        label: 'Standard',
        note: '1x credits · natural conversational voices',
        voices: stable('standard').filter((v) => !isChirp(v)),
      },
      {
        key: 'native',
        label: 'Native',
        note: '0.75x credits · native Indian languages',
        voices: stable('lite').filter((v) => v.value.startsWith('google:') && !v.multilingual),
      },
      {
        key: 'gemini',
        label: 'Gemini 3.8',
        note: '2x credits · expressive speech · try on a test call before using live',
        // These are flagged "preview" (owner-only), so they come from the full list
        // rather than from `all`, which drops previews.
        voices: (data?.voices ?? []).filter((v) => v.value.startsWith('google38:') || v.value.startsWith('google38flash:')),
      },
      {
        key: 'premium',
        label: 'Premium',
        note: '2x credits · natural conversational voices',
        voices: stable('premium').filter((v) => !v.multilingual),
      },
    ]
    return list.filter((t) => t.voices.length > 0)
  }, [data])

  const query = search.trim().toLowerCase()
  const matches = (voice: VoiceEntry) =>
    [voice.name, voice.note, voice.tierLabel, ...voice.languageLabels].filter(Boolean).some((value) => value.toLowerCase().includes(query))
  const searchResults = useMemo(
    () => (query ? tabs.flatMap((t) => t.voices).filter(matches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, query],
  )

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0]
  const shown = query ? searchResults : (activeTab?.voices ?? [])
  const visible = query || expanded ? shown : shown.slice(0, PAGE_SIZE)

  const row = (entry: VoiceEntry) => (
    <VoiceRow
      key={entry.value}
      entry={entry}
      lang={lang}
      busy={busyVoice === entry.value}
      showTier={Boolean(query)}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  )

  return (
    <DashboardLayout>
      <PageHeader title="Voices" subtitle="Preview a voice, then add it to your agents' picker">
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

      <div className="flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        {!data ? (
          <VoicesSkeleton />
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-primary">
              <Icon name="search" className="text-[18px] text-text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search all voices by name or language"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear voice search" className="text-text-muted hover:text-text">
                  <Icon name="close" className="text-[17px]" />
                </button>
              )}
            </label>

            {!query && (
              <div className="flex flex-col gap-1">
                <div role="tablist" aria-label="Voice categories" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-high/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={activeTab?.key === t.key}
                      onClick={() => {
                        setTab(t.key)
                        setExpanded(false)
                      }}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                        activeTab?.key === t.key ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {t.label} <span className="text-[11px] font-medium text-text-muted">{t.voices.length}</span>
                    </button>
                  ))}
                </div>
                {activeTab && <p className="px-1 text-[11px] text-text-muted">{activeTab.note}</p>}
              </div>
            )}

            {error && (
              <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">{error}</div>
            )}

            <div className="flex flex-col gap-2">{visible.map(row)}</div>

            {!query && shown.length > PAGE_SIZE && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="self-center rounded-lg border border-border px-4 py-2 text-xs font-bold text-text-muted hover:border-primary hover:text-primary"
              >
                {expanded ? 'Show fewer voices' : `Show ${shown.length - PAGE_SIZE} more voices`}
              </button>
            )}

            {query && searchResults.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-muted">
                No voices match “{search}”.
              </div>
            )}

            <p className="px-1 text-[11px] text-text-muted">
              {data.selectedCount} added · only added voices appear in the agent voice picker.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Voices
