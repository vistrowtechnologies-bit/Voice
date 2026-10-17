import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { useVoicePreview } from '../components/VoicePreviewButton'
import { addVoice, fetchVoiceCatalog, removeVoice } from '../lib/api'
import { BHARAT_MODEL_MULTIPLIER, LIVE_MODEL_MULTIPLIER, creditsPerMinuteLabel, formatCredits } from '../lib/plans'
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

// "2x credits · advanced natural voices" -> 2
function voiceMultiplier(entry: VoiceEntry): number {
  return Number(/([\d.]+)x\s*credits/i.exec(entry.tierNote)?.[1] ?? 1)
}

// What one minute costs with this voice on a Vistrow Bharat agent.
function voiceCredits(entry: VoiceEntry): string {
  return creditsPerMinuteLabel(voiceMultiplier(entry) * BHARAT_MODEL_MULTIPLIER)
}

// Vistrow Live bills by model: every version uses 3 minutes per minute
// (agent/plan_policy.py MODEL_TIER_MULTIPLIERS realtime).
function liveMultiplier(modelValue: string | undefined): number {
  const key = modelValue && (modelValue === 'gemini-live' || modelValue.includes('2.5')) ? '2.5' : 'default'
  return LIVE_MODEL_MULTIPLIER[key]
}
function liveCredits(modelValue: string | undefined): string {
  return creditsPerMinuteLabel(liveMultiplier(modelValue))
}

// "2 min/min" above a tab name: plan minutes one call minute uses on a
// Vistrow Bharat agent (1 credit = 1 standard minute).
function CreditBadge({ credits }: { credits: number }) {
  return (
    <span className="block text-[10px] font-bold leading-none tracking-wide text-primary/80" title={`Uses ${formatCredits(credits)} plan minute(s) per call minute`}>
      {formatCredits(credits)} min/min
    </span>
  )
}

function languageSummary(entry: VoiceEntry): string {
  if (entry.nativeLanguage) return `Native ${entry.nativeLanguage} · speaks ${entry.languageCount} languages`
  return entry.canSwitchLanguage ? `${entry.languageCount} languages` : `${entry.languageLabels[0] ?? 'One language'} only`
}

// Voices the preview can play in any language it speaks: one model, every
// language. Gemini voices are left out because their TTS quota is tiny.
const listensInAnyLanguage = (v: VoiceEntry) => v.value.startsWith('sarvam4:') || v.value.startsWith('google:chirp3:')

const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi', en: 'English', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
  ml: 'Malayalam', gu: 'Gujarati', bn: 'Bengali', pa: 'Punjabi', od: 'Odia',
}

// Realtime tabs are one per Live model: `rt:<model value>`.
type TabKey = 'sarvam4' | 'expressive' | 'hd' | 'native' | 'gemini' | 'premium' | `rt:${string}`
type FilterKey = 'all' | 'added' | 'female' | 'male'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'added', label: 'Added' },
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
]

// Realtime (speech-to-speech) is a model, not a voice: it is chosen on the agent.
// The tab exists so someone looking for it among the voices is sent to the right place.
// Live 3.1 is left out: 3.8 is its successor at the same price and the same 30
// voices, so a second tab only confused the page (owner, 2026-10-14). Agents
// already on 3.1 keep it under Model.
const REALTIME_MODELS = ADMIN_ONLY_MODELS.filter(
  (m) => m.value.startsWith('gemini-live') && m.value !== 'gemini-live:gemini-3.1-flash-live-preview',
)
// "Vistrow Live 3.1 · realtime" -> "Live 3.1"
const shortModelLabel = (label: string) => label.replace(/^Vistrow /, '').replace(/ · realtime$/, '')

interface Tab {
  key: TabKey
  // Plan minutes per call minute on a Vistrow Bharat agent; tabs are ordered by it.
  credits: number
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
  credits,
}: {
  entry: VoiceEntry
  // Replaces the languages line (realtime voices show style and HD voice).
  detail?: string
  // Plan minutes per call minute shown on the row; defaults to this voice on Vistrow Bharat.
  credits?: string
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
          {!detail && entry.canSwitchLanguage && !entry.nativeLanguage && <span className="text-cyan"> · switches live</span>}
          <span className="font-semibold text-text"> · {credits ?? voiceCredits(entry)}</span>
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
  realtimeModelLabel,
  stickyTop,
  nameRef,
  listenLangs,
  activeLang,
  onListenIn,
}: {
  entry: VoiceEntry
  // Languages this voice can be previewed in (code + name), the one playing
  // now, and a handler that switches the preview to another one and plays it.
  listenLangs: { code: string; name: string }[]
  activeLang: string
  onListenIn: (code: string) => void
  // Height of the dashboard's sticky header, so the panel sticks below it.
  stickyTop: number
  nameRef: React.RefObject<HTMLHeadingElement | null>
  // Set for a Gemini Live voice: the HD voice an agent picks to speak with it.
  realtimeHd?: VoiceEntry | null
  // The Live model whose tab is open, named in the setup steps.
  realtimeModelLabel?: string
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
    <aside
      style={{ top: stickyTop + 16 }}
      className="order-first overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_18px_44px_-24px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] lg:sticky lg:order-none"
    >
      <div className="relative bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-primary)_24%,transparent),transparent_70%)] px-5 pb-4 pt-5 text-center lg:px-6 lg:pb-5 lg:pt-7">
        <div className="relative mx-auto mb-3 h-20 w-20 lg:mb-4 lg:h-28 lg:w-28">
          {playing && <span className="absolute -inset-2 animate-ping rounded-full border-2 border-primary/50" aria-hidden="true" />}
          <Orb entry={entry} size={0} className={`ring-2 transition-shadow ${playing ? 'ring-primary/60' : 'ring-primary/15'}`} />
        </div>
        <h2 ref={nameRef} className="font-display text-xl font-semibold tracking-tight lg:text-2xl">
          {entry.name}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {GENDER_LABEL[entry.gender]} · {realtime ? 'Live voice' : entry.tierLabel}
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
                <p className="font-bold text-text">Use {entry.name} on a realtime call</p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
                  <li>
                    Add <span className="font-bold text-text">{realtimeHd.name}</span> to your picker (button below).
                  </li>
                  <li>
                    On the agent, set <span className="font-bold text-text">Model</span> to {realtimeModelLabel ?? 'a Vistrow Live model'}.
                  </li>
                  <li>
                    Set its <span className="font-bold text-text">Voice</span> to {realtimeHd.name}. Calls then speak in this voice.
                  </li>
                </ol>
                <p className="mt-2 text-xs">
                  Every Live model uses the same 30 voices. The preview is made by a different engine, so a live call can sound slightly different.{' '}
                  <Link to="/dashboard/agents" className="font-bold text-primary hover:underline">
                    Open agents →
                  </Link>
                </p>
              </>
            ) : (
              'No HD voice maps to this Live voice yet, so an agent cannot pick it.'
            )}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-high px-2 py-2.5">
            <p className="font-display text-base font-semibold">{entry.languageCount}</p>
            <p className="text-[11px] font-bold text-text-muted">{entry.languageCount === 1 ? 'Language' : 'Languages'}</p>
          </div>
          {entry.nativeLanguage ? (
            <div className="rounded-xl bg-surface-high px-2 py-2.5">
              <p className="font-display text-base font-semibold text-cyan">{entry.nativeLanguage}</p>
              <p className="text-[11px] font-bold text-text-muted">Native language</p>
            </div>
          ) : (
            <div className="rounded-xl bg-surface-high px-2 py-2.5">
              <p className={`font-display text-base font-semibold ${entry.canSwitchLanguage ? 'text-cyan' : 'text-amber'}`}>
                {entry.canSwitchLanguage ? 'Live' : 'Fixed'}
              </p>
              <p className="text-[11px] font-bold text-text-muted">Language switch</p>
            </div>
          )}
          <div className="rounded-xl bg-surface-high px-2 py-2.5">
            <p className="font-display text-base font-semibold">{voiceCredits(entry).replace(' min per min', '')}</p>
            <p className="text-[11px] font-bold text-text-muted">Minutes / min</p>
          </div>
        </div>
        )}

        {!realtime && listenLangs.length > 1 ? (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">Listen in</p>
            <div className="flex flex-wrap gap-1.5">
              {listenLangs.map((l) => {
                const on = l.code === activeLang
                const native = l.code === entry.nativeLang
                return (
                  <button
                    key={l.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onListenIn(l.code)}
                    title={native ? `${l.name}: the language this voice was made for` : `Hear this voice in ${l.name}`}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                      on
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:text-text'
                    }`}
                  >
                    <Icon name={on && playing ? 'graphic_eq' : 'play_arrow'} className="text-[14px]" />
                    {l.name}
                    {native && <span className={`text-[10px] ${on ? 'text-white/80' : 'text-primary'}`}>· native</span>}
                  </button>
                )
              })}
            </div>
            {entry.nativeLanguage && (
              <p className="mt-2 text-[11px] text-text-muted">Sounds most natural in {entry.nativeLanguage}. Same sentence in every language.</p>
            )}
            {entry.languageCount > listenLangs.length && (
              <p className="mt-1 text-[11px] text-text-muted">Also speaks {entry.languageCount - listenLangs.length} more languages.</p>
            )}
          </div>
        ) : (
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
        )}

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
  const [tab, setTab] = useState<TabKey>('sarvam4')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [expanded, setExpanded] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(null)
  const [playRequest, setPlayRequest] = useState<string | null>(null)
  // Preview language picked per voice with "Listen in"; otherwise the
  // voice's native language, else the page's Hindi/English switch.
  const [langChoice, setLangChoice] = useState<Record<string, string>>({})
  const [nativeFilter, setNativeFilter] = useState('')

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
        credits: 2 * BHARAT_MODEL_MULTIPLIER,
        label: 'Expressive',
        note: `${creditsPerMinuteLabel(2 * BHARAT_MODEL_MULTIPLIER)} · follows the caller’s emotion · about 0.7 s slower than HD`,
        voices: stable('premium').filter((v) => v.multilingual && v.value.startsWith('google:')),
      },
      {
        key: 'sarvam4',
        credits: 1 * BHARAT_MODEL_MULTIPLIER,
        label: 'Bharat',
        note: `${creditsPerMinuteLabel(1 * BHARAT_MODEL_MULTIPLIER)} · Indian persona voices first, then the classic voices · switches language live`,
        // Every non-Chirp standard voice is a Sarvam voice: v4 (`sarvam4:`) and
        // the classic Bulbul ids (pooja, shubh, ...). Since PR #85 billed v4 at
        // standard, a separate "Standard" tab listed all 201 v4 voices again.
        voices: [
          ...stable('standard').filter((v) => v.value.startsWith('sarvam4:')),
          ...stable('standard').filter((v) => !isChirp(v) && !v.value.startsWith('sarvam4:')),
        ],
      },
      {
        key: 'hd',
        credits: 1 * BHARAT_MODEL_MULTIPLIER,
        label: 'HD',
        note: `${creditsPerMinuteLabel(1 * BHARAT_MODEL_MULTIPLIER)} · fastest voices · switches language mid-call`,
        voices: stable('standard').filter(isChirp),
      },
      {
        key: 'native',
        credits: 1 * BHARAT_MODEL_MULTIPLIER,
        label: 'Native',
        note: `${creditsPerMinuteLabel(1 * BHARAT_MODEL_MULTIPLIER)} · native Indian languages · one language each · a little slower to start`,
        voices: (data?.voices ?? []).filter((v) => v.tier === 'lite' && v.value.startsWith('google:') && !v.multilingual),
      },
      {
        key: 'gemini',
        credits: 2 * BHARAT_MODEL_MULTIPLIER,
        label: 'Studio',
        note: `${creditsPerMinuteLabel(2 * BHARAT_MODEL_MULTIPLIER)} · text-to-speech for normal agents · not the realtime Live models`,
        // These are flagged "preview" (owner-only), so they come from the full list
        // rather than from `all`, which drops previews.
        voices: (data?.voices ?? []).filter((v) => v.value.startsWith('google38:') || v.value.startsWith('google38flash:')),
      },
      {
        key: 'premium',
        credits: 2 * BHARAT_MODEL_MULTIPLIER,
        label: 'Premium',
        note: `${creditsPerMinuteLabel(2 * BHARAT_MODEL_MULTIPLIER)} · natural conversational voices`,
        voices: stable('premium').filter((v) => !v.multilingual),
      },
    ]
    // Cheapest first; same-price tabs keep the order above (Array.sort is stable).
    return list.filter((t) => t.voices.length > 0).sort((a, b) => a.credits - b.credits)
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
        const gemini = persona.charAt(0).toUpperCase() + persona.slice(1)
        return {
          ...v,
          // The Indian name the agent picker uses (Myra); the vendor's voice
          // name (Achernar) is never shown (owner decision 2026-10-15).
          name: hd ? hd.name.replace(/ HD$/, '') : gemini,
          note: `${v.note.split(' · ')[0]} voice`,
          selected: hd?.selected,
          // Google's Live API documents 99 languages (checked 2026-10-15).
          languageCount: 99,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return { realtimeVoices: list, realtimeHdFor: hdFor }
  }, [data])

  const query = search.trim().toLowerCase()
  // Search relevance: the voice's name, then voices native to the searched
  // language, then single-language voices for it, then style/tier words, then
  // any voice that can also speak it. 0 = no match.
  const searchScore = (voice: VoiceEntry): number => {
    const has = (v?: string) => !!v && v.toLowerCase().includes(query)
    if (has(voice.name)) return 5
    if (has(voice.nativeLanguage)) return 4
    if (!voice.canSwitchLanguage && voice.languageLabels.some(has)) return 4
    if (has(voice.note) || has(voice.tierLabel)) return 2
    if (voice.languageLabels.some(has)) return 1
    return 0
  }
  const passesFilter = (voice: VoiceEntry) =>
    filter === 'all' || (filter === 'added' ? !!voice.selected : voice.gender === filter)

  const realtimeModel = REALTIME_MODELS.find((m) => tab === `rt:${m.value}`)
  const realtimeActive = showRealtime && !!realtimeModel && !query
  const activeTab = realtimeActive ? undefined : (tabs.find((t) => t.key === tab) ?? tabs[0])
  // Search and the "Added" filter look across every category, not just the open tab.
  const everyVoice = tabs.flatMap((t) => t.voices)
  const base = realtimeActive
    ? realtimeVoices
    : query
      ? everyVoice
          .map((v, i) => ({ v, i, score: searchScore(v) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.i - b.i)
          .map((x) => x.v)
      : filter === 'added'
        ? everyVoice
        : (activeTab?.voices ?? [])
  // "Native language" filter for tabs whose voices have one (Sarvam v4).
  const nativeOptions = [...new Set(base.map((v) => v.nativeLanguage).filter(Boolean) as string[])].sort()
  const nativeActive = nativeOptions.includes(nativeFilter) ? nativeFilter : ''
  const shown = base.filter(passesFilter).filter((v) => !nativeActive || v.nativeLanguage === nativeActive)
  const visible = query || expanded || (filter === 'added' && !realtimeActive) ? shown : shown.slice(0, PAGE_SIZE)
  const addedVoices = (data?.voices ?? []).filter((v) => v.selected)

  // The spotlight follows the chosen voice while it stays in view, else the
  // first one listed, so the panel is never empty when the list is not.
  const current = shown.find((v) => v.value === selectedValue) ?? shown[0]
  const previewLang = current ? langChoice[current.value] || current.forceLang || current.nativeLang || lang : lang
  const listenLangs =
    current && listensInAnyLanguage(current)
      ? [...new Set(current.languages.map((c) => c.split('-')[0]))]
          .filter((c) => data?.sampleTexts?.[c] && LANGUAGE_NAMES[c])
          .map((c) => ({ code: c, name: LANGUAGE_NAMES[c] }))
          .sort((a, b) => (a.code === current.nativeLang ? -1 : b.code === current.nativeLang ? 1 : 0))
      : []
  const listenIn = (code: string) => {
    if (!current) return
    setLangChoice((prev) => ({ ...prev, [current.value]: code }))
    setPlayRequest(current.value)
  }
  const preview = useVoicePreview(current?.value ?? '', previewLang, { pausable: true })
  const sampleSet = data?.sampleTexts?.[previewLang]
  const sample = current ? (sampleSet?.[current.gender === 'female' ? 'female' : 'male'] ?? '') : ''

  // The dashboard header is sticky; measure it so the spotlight and the
  // now-playing bar sit below it instead of sliding underneath.
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const header = [...document.querySelectorAll('header')].find(
      (h) => h.offsetHeight > 0 && getComputedStyle(h).position === 'sticky',
    )
    if (!header) return
    const measure = () => setHeaderHeight(header.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [data])

  // Show the now-playing bar once the spotlight's voice name is not fully in view.
  const spotlightNameRef = useRef<HTMLHeadingElement | null>(null)
  const [spotlightVisible, setSpotlightVisible] = useState(true)
  useEffect(() => {
    const target = spotlightNameRef.current
    if (!target) return
    const observer = new IntersectionObserver(([e]) => setSpotlightVisible(e.intersectionRatio >= 0.99), {
      rootMargin: `-${headerHeight}px 0px 0px 0px`,
      threshold: [0, 0.99],
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [headerHeight, current?.value, data])

  const nowPlaying = current && (preview.state === 'playing' || preview.state === 'paused') && !spotlightVisible
  const currentHd = realtimeActive && current ? realtimeHdFor.get(current.value) : undefined

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
        {nowPlaying && current && (
          <div
            style={{ top: headerHeight + 8 }}
            className="sticky z-10 flex items-center gap-3 rounded-2xl border border-primary/30 bg-surface/95 px-3 py-2 shadow-lg backdrop-blur"
            role="status"
          >
            <Orb entry={current} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                <span className="text-primary">{preview.state === 'playing' ? 'Playing' : 'Paused'}</span> · {current.name}
              </p>
              <p className="truncate text-xs text-text-muted">
                {GENDER_LABEL[current.gender]} · {realtimeActive ? `Live voice${currentHd ? ` · pick ${currentHd.name}` : ''}` : current.tierLabel}
              </p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-high">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(preview.progress * 100)}%` }} />
              </div>
            </div>
            <Waveform playing={preview.state === 'playing'} bars={10} className="hidden h-6 sm:flex" />
            <button
              type="button"
              onClick={preview.toggle}
              aria-label={preview.state === 'playing' ? 'Pause preview' : `Play ${current.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white"
            >
              <Icon name={preview.state === 'playing' ? 'pause' : 'play_arrow'} className="text-[20px]" />
            </button>
            <button
              type="button"
              onClick={() => spotlightNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="hidden shrink-0 rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-primary sm:block"
            >
              View
            </button>
          </div>
        )}
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
                      {[
                        ...tabs.map((t) => ({ key: t.key, label: t.label, count: t.voices.length, credits: t.credits })),
                        ...(showRealtime
                          ? REALTIME_MODELS.map((m) => ({
                              key: `rt:${m.value}` as TabKey,
                              label: shortModelLabel(m.label),
                              count: realtimeVoices.length,
                              credits: liveMultiplier(m.value),
                            }))
                          : []),
                      ]
                        // One row, cheapest first; same-price tabs keep their order.
                        .sort((a, b) => a.credits - b.credits)
                        .map((t) => {
                          const on = t.key.startsWith('rt:')
                            ? realtimeActive && `rt:${realtimeModel?.value}` === t.key
                            : !realtimeActive && activeTab?.key === t.key
                          return (
                            <button
                              key={t.key}
                              role="tab"
                              aria-selected={on}
                              onClick={() => chooseTab(t.key)}
                              className={`shrink-0 whitespace-nowrap rounded-lg px-3 pb-1.5 pt-1 text-left text-sm font-semibold transition-colors ${
                                on ? 'bg-primary/10 text-primary' : 'bg-transparent text-text-muted hover:text-text'
                              }`}
                            >
                              <CreditBadge credits={t.credits} />
                              {t.label} <span className="text-[11px] font-medium opacity-70">{t.count}</span>
                            </button>
                          )
                        })}
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
                      {nativeOptions.length > 1 && (
                        <select
                          value={nativeActive}
                          onChange={(e) => setNativeFilter(e.target.value)}
                          aria-label="Native language"
                          className={`rounded-full border px-3 py-1 text-xs font-bold outline-none transition-colors ${
                            nativeActive ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-transparent text-text-muted'
                          }`}
                        >
                          <option value="">Any native language</option>
                          {nativeOptions.map((n) => (
                            <option key={n} value={n}>
                              Native {n} ({base.filter((v) => v.nativeLanguage === n).length})
                            </option>
                          ))}
                        </select>
                      )}
                      {!query && filter !== 'added' && activeTab && <span className="ml-auto text-[11px] text-text-muted">{activeTab.note}</span>}
                      {realtimeActive && realtimeModel && (
                        <span className="ml-auto text-[11px] text-text-muted">
                          Voices for {realtimeModel.label} · owner only
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {realtimeActive && (
                  <div className="flex flex-col gap-2 border-b border-border p-4">
                    <p className="text-sm leading-relaxed text-text-muted">
                      {realtimeModel?.label} is a <span className="font-semibold text-text">model</span>, picked under Model on an agent. It
                      speaks in the Live version of the agent's HD voice. These are its voices; the other Live models use the same 30.
                      {' '}It bills <span className="font-semibold text-text">{liveCredits(realtimeModel?.value)}</span> whichever voice it uses.
                    </p>
                    {REALTIME_MODELS.filter((m) => m.value === realtimeModel?.value).map((model) => (
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
                        credits={realtimeActive ? liveCredits(realtimeModel?.value) : undefined}
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
                  stickyTop={headerHeight}
                  nameRef={spotlightNameRef}
                  realtimeHd={realtimeActive ? (realtimeHdFor.get(current.value) ?? null) : undefined}
                  realtimeModelLabel={realtimeModel?.label}
                  sample={sample}
                  listenLangs={listenLangs}
                  activeLang={previewLang}
                  onListenIn={listenIn}
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
