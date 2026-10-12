import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { useVoicePreview } from '../components/VoicePreviewButton'
import { addVoice, fetchVoiceCatalog, removeVoice } from '../lib/api'
import { ADMIN_ONLY_MODELS } from '../lib/agentOptions'
import { useAuth } from '../lib/auth'
import type { VoiceCatalog, VoiceEntry } from '../lib/types'

const PREVIEW_LANGS = [
  { code: 'hi', label: 'Hindi' },
  { code: 'en', label: 'English' },
] as const

// Voices shown per category before "Show more". Keeps the page about one
// screen tall instead of listing the whole catalogue (it used to be ~13,000 px).
const PAGE_SIZE = 10

// Language chips shown in the spotlight before "+N more".
const LANG_CHIPS = 12

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

const GENDER_LABEL: Record<VoiceEntry['gender'], string> = { female: 'Female', male: 'Male', neutral: 'Neutral' }

// "2x credits · advanced natural voices" -> "2x"
function creditMultiplier(entry: VoiceEntry): string {
  return /([\d.]+x)\s*credits/i.exec(entry.tierNote)?.[1] ?? '1x'
}

function languageSummary(entry: VoiceEntry): string {
  return entry.canSwitchLanguage ? `${entry.languageCount} languages` : `${entry.languageLabels[0] ?? 'One language'} only`
}

type TabKey = 'expressive' | 'hd' | 'standard' | 'native' | 'gemini' | 'premium' | 'realtime'
type FilterKey = 'all' | 'added' | 'female' | 'male'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'added', label: 'Added' },
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
]

// Realtime (speech-to-speech) is a model, not a voice: it is chosen on the agent.
// The tab exists so someone looking for it among the voices is sent to the right place.
const REALTIME_MODELS = ADMIN_ONLY_MODELS.filter((m) => m.value.startsWith('gemini-live'))

interface Tab {
  key: TabKey
  label: string
  note: string
  voices: VoiceEntry[]
}

function VoicesSkeleton() {
  return (
    <div className="grid animate-pulse gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]" aria-hidden="true">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="h-10 rounded-xl bg-surface-high" />
        <div className="h-8 w-2/3 rounded-lg bg-surface-high" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[52px] rounded-lg bg-surface-high/60" />
        ))}
      </div>
      <div className="order-first h-[420px] rounded-3xl border border-border bg-surface lg:order-none" />
      <span className="sr-only" aria-live="polite">
        Loading voices
      </span>
    </div>
  )
}

function Orb({ entry, size, className = '' }: { entry: VoiceEntry; size: number; className?: string }) {
  return (
    <div
      className={`shrink-0 rounded-full ${className}`}
      // size 0 = fill the parent, for a responsively sized wrapper.
      style={{ width: size || '100%', height: size || '100%', background: avatarGradient(entry.value, entry.name) }}
      aria-hidden="true"
    />
  )
}

// Bars that move only while a preview is actually playing.
function Waveform({ playing, bars, className = '' }: { playing: boolean; bars: number; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-[3px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`vv-wave-bar w-[3px] rounded-full bg-primary ${playing ? 'is-playing' : ''}`}
          style={{ height: `${25 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 90}ms` }}
        />
      ))}
    </div>
  )
}

function VoiceRow({
  entry,
  active,
  playing,
  loading,
  onPlay,
  detail,
}: {
  entry: VoiceEntry
  // Replaces the languages line (realtime voices show style and HD voice).
  detail?: string
  active: boolean
  playing: boolean
  loading: boolean
  onPlay: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onPlay}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPlay()
        }
      }}
      className={`flex cursor-pointer items-center gap-3 border-l-[3px] px-4 py-2.5 transition-colors ${
        active ? 'border-primary bg-primary/[0.07]' : 'border-transparent hover:bg-primary/[0.04]'
      }`}
    >
      <Orb entry={entry} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{entry.name}</p>
        <p className="truncate text-xs text-text-muted">
          {GENDER_LABEL[entry.gender]} · {detail ?? languageSummary(entry)}
          {!detail && entry.canSwitchLanguage && <span className="text-cyan"> · switches live</span>}
        </p>
      </div>
      {entry.selected ? (
        <span className="hidden shrink-0 items-center gap-1 text-[11px] font-bold text-success sm:flex">
          <Icon name="check" className="text-[14px]" />
          Added
        </span>
      ) : (
        !entry.addable && <Icon name="lock" className="shrink-0 text-[15px] text-text-muted" />
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
        aria-label={playing ? `Pause ${entry.name}` : `Play ${entry.name}`}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
          playing ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-primary hover:border-primary'
        }`}
      >
        <Icon
          name={loading ? 'progress_activity' : playing ? 'pause' : 'play_arrow'}
          className={`text-[19px] ${loading ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  )
}

function Spotlight({
  entry,
  sample,
  playState,
  progress,
  busy,
  onPlay,
  onAdd,
  onRemove,
  realtimeHd,
}: {
  entry: VoiceEntry
  // Set for a Gemini Live voice: the HD voice an agent picks to speak with it.
  realtimeHd?: VoiceEntry | null
  sample: string
  playState: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  progress: number
  busy: boolean
  onPlay: () => void
  onAdd: (v: string) => void
  onRemove: (v: string) => void
}) {
  const playing = playState === 'playing'
  // Paused keeps the words already spoken lit, so resuming picks up visibly.
  const started = playing || playState === 'paused'
  const words = sample ? sample.split(/\s+/) : []
  const lit = started ? Math.ceil(progress * words.length) : 0
  const moreLangs = Math.max(0, entry.languageCount - Math.min(entry.languageLabels.length, LANG_CHIPS))
  const realtime = realtimeHd !== undefined
  // The add/remove action always targets a voice that can sit in the picker.
  const target = realtime ? realtimeHd : entry

  return (
    <aside className="order-first overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_18px_44px_-24px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] lg:sticky lg:top-6 lg:order-none">
      <div className="relative bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-primary)_24%,transparent),transparent_70%)] px-5 pb-4 pt-5 text-center lg:px-6 lg:pb-5 lg:pt-7">
        <div className="relative mx-auto mb-3 h-20 w-20 lg:mb-4 lg:h-28 lg:w-28">
          {playing && <span className="absolute -inset-2 animate-ping rounded-full border-2 border-primary/50" aria-hidden="true" />}
          <Orb entry={entry} size={0} className={`ring-2 transition-shadow ${playing ? 'ring-primary/60' : 'ring-primary/15'}`} />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">{entry.name}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {GENDER_LABEL[entry.gender]} · {realtime ? 'Gemini Live voice' : entry.tierLabel}
        </p>
        {entry.note && (
          <p className="mx-auto mt-3 w-fit max-w-full rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{entry.note}</p>
        )}
        {/* Phones show the waveform and words only while playing, to keep the list in view. */}
        <Waveform playing={playing} bars={28} className={`mt-3 h-7 lg:mt-4 lg:h-9 ${started ? '' : 'max-lg:hidden'}`} />
        <button
          type="button"
          onClick={onPlay}
          disabled={playState === 'loading'}
          aria-label={playing ? 'Pause preview' : `Play ${entry.name}`}
          className="mx-auto mt-3 flex h-14 w-14 items-center lg:h-16 lg:w-16 justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_-8px_var(--color-primary)] transition-transform hover:scale-105 disabled:opacity-70"
        >
          <Icon
            name={playState === 'loading' ? 'progress_activity' : playing ? 'pause' : 'play_arrow'}
            className={`text-[30px] ${playState === 'loading' ? 'animate-spin' : ''}`}
          />
        </button>
        {playState === 'error' && <p className="mt-2 text-xs text-destructive">Preview unavailable. Try again.</p>}
      </div>

      <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
        {sample && (
          <p className={`font-display text-sm leading-relaxed lg:text-[15px] ${started ? '' : 'max-lg:hidden'}`} aria-label={sample}>
            {words.map((word, i) => (
              <span key={i} className={`transition-colors duration-200 ${i < lit ? 'text-text' : 'text-text-muted/70'}`}>
                {word}{' '}
              </span>
            ))}
          </p>
        )}

        {realtime ? (
          <div className="rounded-xl bg-surface-high px-4 py-3 text-sm leading-relaxed text-text-muted">
            {realtimeHd ? (
              <>
                A Gemini Live agent speaks in this voice when its voice is{' '}
                <span className="font-bold text-text">{realtimeHd.name}</span>.
              </>
            ) : (
              'No HD voice maps to this Gemini voice yet.'
            )}{' '}
            The preview is Gemini TTS in the same voice, so a live call can sound slightly different.
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-high px-2 py-2.5">
            <p className="font-display text-base font-semibold">{entry.languageCount}</p>
            <p className="text-[11px] font-bold text-text-muted">{entry.languageCount === 1 ? 'Language' : 'Languages'}</p>
          </div>
          <div className="rounded-xl bg-surface-high px-2 py-2.5">
            <p className={`font-display text-base font-semibold ${entry.canSwitchLanguage ? 'text-cyan' : 'text-amber'}`}>
              {entry.canSwitchLanguage ? 'Live' : 'Fixed'}
            </p>
            <p className="text-[11px] font-bold text-text-muted">Language switch</p>
          </div>
          <div className="rounded-xl bg-surface-high px-2 py-2.5">
            <p className="font-display text-base font-semibold">{creditMultiplier(entry)}</p>
            <p className="text-[11px] font-bold text-text-muted">Credits</p>
          </div>
        </div>
        )}

        <div className={`hidden flex-wrap gap-1.5 ${realtime ? '' : 'lg:flex'}`}>
          {entry.languageLabels.slice(0, LANG_CHIPS).map((label) => (
            <span key={label} className="rounded-md bg-surface-high px-2 py-0.5 text-[11px] font-bold text-text-muted">
              {label}
            </span>
          ))}
          {moreLangs > 0 && (
            <span className="rounded-md bg-surface-high px-2 py-0.5 text-[11px] font-bold text-text-muted">+{moreLangs} more</span>
          )}
        </div>

        {!target ? null : target.selected ? (
          <button
            type="button"
            onClick={() => onRemove(target.value)}
            disabled={busy}
            className="group flex h-11 items-center justify-center gap-1.5 rounded-xl border border-success/40 bg-success/10 text-sm font-extrabold text-success transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Icon name="check" className="text-[18px] group-hover:hidden" />
            <span className="group-hover:hidden">{realtime ? `${target.name} is in your picker` : 'Added to your picker'}</span>
            <span className="hidden group-hover:inline">{realtime ? `Remove ${target.name}` : 'Remove from picker'}</span>
          </button>
        ) : !target.addable ? (
          <Link
            to="/dashboard/billing"
            title={target.lockedReason}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-high text-sm font-extrabold text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Icon name="lock" className="text-[17px]" />
            Upgrade to use this voice
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(target.value)}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-extrabold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            <Icon name="add" className="text-[18px]" />
            {realtime ? `Add ${target.name} to your picker` : 'Add to your picker'}
          </button>
        )}
      </div>
    </aside>
  )
}

export function Voices() {
  const { user } = useAuth()
  // Same audience as the model dropdown: the server refuses these models for everyone else.
  const showRealtime = !!user?.isPlatformOwner && !user?.impersonating && REALTIME_MODELS.length > 0
  const [data, setData] = useState<VoiceCatalog | null>(null)
  const [lang, setLang] = useState<string>('hi')
  const [busyVoice, setBusyVoice] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('expressive')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [expanded, setExpanded] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(null)
  const [playRequest, setPlayRequest] = useState<string | null>(null)

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
        note: '1x credits · fastest Google voices · switches language mid-call',
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

  // Gemini Live speaks with the Gemini voice named like the agent's HD voice
  // (agent/main.py _gemini_live_voice). The catalog's Gemini 3.8 Flash-Lite
  // entries carry each voice's gender and Google's style word, and preview it.
  const { realtimeVoices, realtimeHdFor } = useMemo(() => {
    const all = data?.voices ?? []
    const hdFor = new Map<string, VoiceEntry>()
    const list = all
      .filter((v) => v.value.startsWith('google38:'))
      .map((v) => {
        const persona = v.value.slice('google38:'.length)
        const hd = all.find((h) => h.value.toLowerCase() === `google:chirp3:${persona}`)
        if (hd) hdFor.set(v.value, hd)
        return {
          ...v,
          name: persona.charAt(0).toUpperCase() + persona.slice(1),
          note: `${v.note.split(' · ')[0]} voice${hd ? ` · ${hd.name}` : ''}`,
          selected: hd?.selected,
        }
      })
    return { realtimeVoices: list, realtimeHdFor: hdFor }
  }, [data])

  const query = search.trim().toLowerCase()
  const matches = (voice: VoiceEntry) =>
    [voice.name, voice.note, voice.tierLabel, ...voice.languageLabels].filter(Boolean).some((value) => value.toLowerCase().includes(query))
  const passesFilter = (voice: VoiceEntry) =>
    filter === 'all' || (filter === 'added' ? !!voice.selected : voice.gender === filter)

  const realtimeActive = showRealtime && tab === 'realtime' && !query
  const activeTab = realtimeActive ? undefined : (tabs.find((t) => t.key === tab) ?? tabs[0])
  // Search and the "Added" filter look across every category, not just the open tab.
  const everyVoice = tabs.flatMap((t) => t.voices)
  const base = realtimeActive
    ? realtimeVoices
    : query
      ? everyVoice.filter(matches)
      : filter === 'added'
        ? everyVoice
        : (activeTab?.voices ?? [])
  const shown = base.filter(passesFilter)
  const visible = query || expanded || (filter === 'added' && !realtimeActive) ? shown : shown.slice(0, PAGE_SIZE)
  const addedVoices = (data?.voices ?? []).filter((v) => v.selected)

  // The spotlight follows the chosen voice while it stays in view, else the
  // first one listed, so the panel is never empty when the list is not.
  const current = shown.find((v) => v.value === selectedValue) ?? shown[0]
  const previewLang = current ? current.forceLang || lang : lang
  const preview = useVoicePreview(current?.value ?? '', previewLang, { pausable: true })
  const sampleSet = data?.sampleTexts?.[previewLang]
  const sample = current ? (sampleSet?.[current.gender === 'female' ? 'female' : 'male'] ?? '') : ''

  // A row's play button selects that voice, then plays it once the spotlight
  // has switched to it (the hook resets whenever its voice changes).
  useEffect(() => {
    if (playRequest && current?.value === playRequest) {
      setPlayRequest(null)
      preview.toggle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest, current?.value])

  function playFromRow(voice: string) {
    if (voice === current?.value) preview.toggle()
    else {
      setSelectedValue(voice)
      setPlayRequest(voice)
    }
  }

  function chooseTab(key: TabKey) {
    setTab(key)
    setExpanded(false)
  }

  return (
    <DashboardLayout>
      <PageHeader title="Voices" subtitle="Pick a voice to hear it. Add the ones your agents should use." />

      <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
        {!data ? (
          <VoicesSkeleton />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setFilter(filter === 'added' ? 'all' : 'added')}
                aria-pressed={filter === 'added'}
                className="flex items-center gap-3 rounded-full border border-border bg-surface py-1.5 pl-2 pr-4 text-sm font-bold shadow-sm transition-colors hover:border-primary/50"
              >
                <span className="flex items-center">
                  {addedVoices.slice(0, 5).map((v, i) => (
                    <span key={v.value} className={`rounded-full border-2 border-surface ${i ? '-ml-2.5' : ''}`}>
                      <Orb entry={v} size={28} />
                    </span>
                  ))}
                  {addedVoices.length === 0 && <Icon name="graphic_eq" className="px-1 text-[20px] text-primary" />}
                </span>
                {data.selectedCount} {data.selectedCount === 1 ? 'voice' : 'voices'} in your agents' picker
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-text-muted">Only added voices appear in the agent voice picker.</p>
                {/* Preview language lives here, not in the header, so the header matches every other page. */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5" aria-label="Preview language">
                  {PREVIEW_LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLang(l.code)}
                      aria-pressed={lang === l.code}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                        lang === l.code ? 'bg-primary text-white' : 'bg-transparent text-text-muted hover:text-text'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">{error}</div>
            )}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border p-4">
                  <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-high/40 px-3 py-2 focus-within:border-primary">
                    <Icon name="search" className="text-[18px] text-text-muted" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search all voices by name or language"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Clear voice search"
                        className="bg-transparent text-text-muted hover:text-text"
                      >
                        <Icon name="close" className="text-[17px]" />
                      </button>
                    )}
                  </label>

                  {!query && (filter !== 'added' || realtimeActive) && (
                    <div
                      role="tablist"
                      aria-label="Voice categories"
                      className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          role="tab"
                          aria-selected={activeTab?.key === t.key}
                          onClick={() => chooseTab(t.key)}
                          className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                            activeTab?.key === t.key ? 'bg-primary/10 text-primary' : 'bg-transparent text-text-muted hover:text-text'
                          }`}
                        >
                          {t.label} <span className="text-[11px] font-medium opacity-70">{t.voices.length}</span>
                        </button>
                      ))}
                      {showRealtime && (
                        <button
                          role="tab"
                          aria-selected={realtimeActive}
                          onClick={() => chooseTab('realtime')}
                          className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                            realtimeActive ? 'bg-primary/10 text-primary' : 'bg-transparent text-text-muted hover:text-text'
                          }`}
                        >
                          Realtime <span className="text-[11px] font-medium opacity-70">{realtimeVoices.length || REALTIME_MODELS.length}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {(!realtimeActive || realtimeVoices.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFilter(f.key)}
                          aria-pressed={filter === f.key}
                          className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                            filter === f.key
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : 'border-border bg-transparent text-text-muted hover:border-primary/40 hover:text-text'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                      {!query && filter !== 'added' && activeTab && <span className="ml-auto text-[11px] text-text-muted">{activeTab.note}</span>}
                      {realtimeActive && <span className="ml-auto text-[11px] text-text-muted">Speech-to-speech models · owner only · set per agent</span>}
                    </div>
                  )}
                </div>

                {realtimeActive && (
                  <div className="flex flex-col gap-2 border-b border-border p-4">
                    <p className="text-sm leading-relaxed text-text-muted">
                      Realtime is a <span className="font-semibold text-text">model</span>, picked under Model on an agent. It speaks with the
                      Gemini voice named like the agent's HD voice. Listen to them below.
                    </p>
                    {REALTIME_MODELS.map((model) => (
                      <div key={model.value} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon name="bolt" className="text-[20px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{model.label}</p>
                          {model.tag && <p className="truncate text-xs text-text-muted">{model.tag}</p>}
                        </div>
                        <Link
                          to="/dashboard/agents"
                          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-105"
                        >
                          Choose on an agent
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                {(!realtimeActive || realtimeVoices.length > 0) && (
                  <div className="divide-y divide-border/60 py-1">
                    {visible.map((entry) => (
                      <VoiceRow
                        key={entry.value}
                        entry={entry}
                        active={entry.value === current?.value}
                        playing={entry.value === current?.value && preview.state === 'playing'}
                        loading={
                          (entry.value === current?.value && preview.state === 'loading') ||
                          (playRequest === entry.value && entry.value !== current?.value)
                        }
                        onPlay={() => playFromRow(entry.value)}
                        detail={realtimeActive ? entry.note : undefined}
                      />
                    ))}
                    {shown.length === 0 && (
                      <div className="px-6 py-12 text-center text-sm text-text-muted">
                        {query ? `No voices match “${search}”.` : filter === 'added' ? 'No voices added yet. Pick one and add it to your picker.' : 'No voices match this filter.'}
                      </div>
                    )}
                  </div>
                )}

                {!query && (filter !== 'added' || realtimeActive) && shown.length > PAGE_SIZE && (
                  <div className="flex justify-center border-t border-border p-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((open) => !open)}
                      className="rounded-lg border border-border bg-transparent px-4 py-2 text-xs font-bold text-text-muted hover:border-primary hover:text-primary"
                    >
                      {expanded ? 'Show fewer voices' : `Show ${shown.length - PAGE_SIZE} more voices`}
                    </button>
                  </div>
                )}
              </section>

              {current && (
                <Spotlight
                  entry={current}
                  realtimeHd={realtimeActive ? (realtimeHdFor.get(current.value) ?? null) : undefined}
                  sample={sample}
                  playState={preview.state}
                  progress={preview.progress}
                  busy={busyVoice === (realtimeActive ? realtimeHdFor.get(current.value)?.value : current.value)}
                  onPlay={preview.toggle}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Voices
