import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipantAttribute, useRemoteParticipants, useRoomContext, useTrackVolume, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import {
  DEMO_CALL_CAP,
  getRemainingDemoCalls,
  hasDemoCallsRemaining,
  recordDemoCall,
} from '../lib/demoCallCap'
import { fetchLiveKitToken, randomId, submitDemoFeedback } from '../lib/livekit'
import { trackQualifyLead } from '../lib/analytics'
import { useOrchestratorCall } from '../lib/orchestratorCall'

type Phase = 'idle' | 'connecting' | 'active' | 'active-orchestrator' | 'denied' | 'capped' | 'unreachable' | 'feedback'

// How long the visitor's browser waits for the AI agent to actually join the
// room after connecting. A healthy dispatch + (cold) worker start is a few
// seconds; if no agent joins within this window the demo worker is genuinely
// unavailable (restarting/crashed/no capacity), so we surface a clean retry
// instead of leaving the visitor staring at a ticking timer over dead air.
const AGENT_JOIN_TIMEOUT_MS = 20_000

// Same hard cap the embeddable widget enforces (widget/src/widget.ts) - every
// minute of every call costs real STT/LLM/TTS spend. The marketing demo cuts
// it silently instead of showing a countdown: this card is a first
// impression, not a tool a visitor is relying on, so a visible timer just
// makes an unlimited-feeling product look metered.
const MAX_CALL_MS = 5 * 60 * 1000

// Cross-component call lock, shared with the embeddable widget
// (widget/src/widget.ts's own CALL_LOCK_KEY) via a plain window global -
// the only channel these two otherwise fully independent implementations
// (this is React, the widget ships as its own standalone vanilla-JS bundle)
// share on the same page. Without it, nothing stopped a visitor from
// having both the floating "Talk to us" widget AND this orb connected at
// once - two separate LiveKit rooms, two separate agent sessions, both
// audible simultaneously, heard live as several different openers
// overlapping in one garbled voice. This also protects against two
// DemoOrbCard instances on the same page (this component says it's reused
// across multiple sections) fighting the same way.
const CALL_LOCK_KEY = '__vistrowActiveCall'
function claimCallLock(): boolean {
  const w = window as unknown as Record<string, boolean>
  if (w[CALL_LOCK_KEY]) return false
  w[CALL_LOCK_KEY] = true
  return true
}
function releaseCallLock(): void {
  ;(window as unknown as Record<string, boolean>)[CALL_LOCK_KEY] = false
}

// The recurring "LIVE DEMO" card - tapping the orb starts the call right
// here (no separate confirmation page/route): mic permission is the
// browser's own native prompt, then the same card shows live call state
// (status, timer, mute/end controls) in place of the idle "Tap to talk"
// content. Reused on the homepage hero and every solution/product page.
export function DemoOrbCard({
  spotlight = false,
  demoSlug,
}: {
  spotlight?: boolean
  /** Published industry-demo slug (e.g. 'healthcare'). Omitted on the
   * homepage, where the server resolves the platform-demo sales agent. */
  demoSlug?: string
}) {
  const [phase, setPhase] = useState<Phase>(() => (hasDemoCallsRemaining() ? 'idle' : 'capped'))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  // Backs off "Try Again" after repeated failures instead of letting a
  // frustrated visitor hammer it - every immediate re-click starts a brand
  // new agent dispatch, and under real capacity pressure that's exactly
  // what turns a temporary slowdown into a pile-up of abandoned jobs each
  // holding a worker slot for up to 90s. Escalates 8s -> 16s -> 30s (capped);
  // resets to zero on any successful connection.
  const consecutiveFailuresRef = useRef(0)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownRemainingS, setCooldownRemainingS] = useState(0)
  useEffect(() => {
    if (cooldownUntil === null) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownRemainingS(remaining)
      if (remaining <= 0) setCooldownUntil(null)
    }
    tick()
    const interval = window.setInterval(tick, 500)
    return () => window.clearInterval(interval)
  }, [cooldownUntil])
  const inCooldown = cooldownUntil !== null && cooldownRemainingS > 0

  const remaining = getRemainingDemoCalls()

  // Pre-warms a room + LiveKit token as soon as the visitor actually starts
  // a call, before the browser's microphone permission prompt. This overlaps
  // dispatch/config loading with the time they spend granting permission,
  // without dispatching paid agent jobs for every passive page view.
  // /api/token now pre-creates the room server-side (see token_api.py),
  // which dispatches the agent immediately - agent/main.py's entrypoint
  // starts connecting and loading its config in the background while the
  // visitor is still reading the page, the same head start /widget/warm
  // already gives the embeddable widget. Without this, every demo call
  // started the entire dispatch+connect+config-load chain from zero only
  // after the click, on top of mic-permission and greeting-TTS time.
  // Discarded (not reused) past PREWARM_MAX_AGE_MS: agent/main.py's
  // wait_for_participant times out at 90s, so a prewarmed room a visitor
  // sits on for minutes before clicking would otherwise hand them a token
  // for a room whose job already gave up and exited.
  const PREWARM_MAX_AGE_MS = 60_000
  const prewarmRef = useRef<{ token: string; url: string; identity: string; room: string; at: number } | null>(null)
  const prewarmPromiseRef = useRef<Promise<{ token: string; url: string; identity: string; room: string; at: number } | null> | null>(null)
  const prewarm = useCallback(() => {
    const cached = prewarmRef.current
    if (cached && Date.now() - cached.at < PREWARM_MAX_AGE_MS) return Promise.resolve(cached)
    if (prewarmPromiseRef.current) return prewarmPromiseRef.current
    if (!hasDemoCallsRemaining()) return Promise.resolve(null)
    const identity = randomId('visitor')
    const room = randomId('voice-agent-demo')
    const request = fetchLiveKitToken(identity, room, undefined, demoSlug)
      .then(({ token: newToken, url }) => {
        const warmed = { token: newToken, url, identity, room, at: Date.now() }
        prewarmRef.current = warmed
        return warmed
      })
      .catch(() => {
        // Best-effort - handleStart falls back to fetching its own token
        // live if this never lands or the room ends up rejected.
        return null
      })
    prewarmPromiseRef.current = request.finally(() => {
      prewarmPromiseRef.current = null
    })
    return prewarmPromiseRef.current
    // demoSlug decides WHICH agent the prewarmed room dispatches, so it has
    // to be a dependency — a stale closure here would silently warm the
    // homepage sales agent for an industry page.
  }, [demoSlug])

  // Only counts against the free-call cap once a call actually connects to
  // an agent - a visitor whose call fails end-to-end (LiveKit never joins
  // AND the orchestrator fallback also fails) shouldn't lose a credit for
  // an outage that wasn't their fault. The ref guards against a mid-call
  // provider fallback (LiveKit -> orchestrator) double-charging one attempt.
  const creditChargedRef = useRef(false)
  // The room name the call actually used - captured at dial time (there are
  // two paths: a fresh prewarm's room, or a live fetchLiveKitToken fallback)
  // so handleDisconnected can attach post-call feedback to the right call
  // record. fetchLiveKitToken returns {token, url} only, not the room it
  // was minted for - the room name is ours to begin with (we generate it),
  // so it's tracked here rather than round-tripped through the response.
  const lastRoomNameRef = useRef<string | null>(null)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const chargeDemoCall = useCallback(() => {
    if (creditChargedRef.current) return
    creditChargedRef.current = true
    consecutiveFailuresRef.current = 0
    recordDemoCall()
  }, [])

  const handleStart = useCallback(async () => {
    if (!hasDemoCallsRemaining()) {
      setPhase('capped')
      return
    }
    if (cooldownUntil !== null && Date.now() < cooldownUntil) return
    if (!claimCallLock()) {
      setErrorMessage('A conversation is already active on this page — please finish it first.')
      setPhase('unreachable')
      return
    }
    creditChargedRef.current = false
    setPhase('connecting')
    setErrorMessage(null)
    // Start dispatch before asking for microphone permission. On a first
    // visit the native permission prompt usually gives the worker several
    // seconds of useful head start; on repeat visits this still overlaps
    // with getUserMedia and WebRTC setup.
    const warming = prewarm()
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const warm = (await warming) ?? prewarmRef.current
      const isFresh = warm && Date.now() - warm.at < PREWARM_MAX_AGE_MS
      const room = isFresh ? warm.room : randomId('voice-agent-demo')
      const { token: newToken, url } =
        isFresh ? warm : await fetchLiveKitToken(randomId('visitor'), room, undefined, demoSlug)
      prewarmRef.current = null
      lastRoomNameRef.current = room
      setFeedbackSubmitted(false)
      trackQualifyLead('demo_call')
      setToken(newToken)
      setServerUrl(url)
      setPhase('active')
    } catch (err) {
      releaseCallLock()
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Mic access is blocked. Enable it in your browser settings to continue.')
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not connect. Please try again.')
      }
      setPhase('denied')
    }
  }, [cooldownUntil, prewarm])

  // Ending the call shows a brief feedback prompt in the same card (only
  // when the call actually connected to an agent - creditChargedRef mirrors
  // the same "only counts once connected" gate chargeDemoCall uses, so a
  // call that failed end-to-end never asks a visitor to rate a conversation
  // that didn't happen) before returning to idle - no separate summary page.
  const handleDisconnected = useCallback(() => {
    releaseCallLock()
    setToken(null)
    setServerUrl(null)
    setPhase(creditChargedRef.current && hasDemoCallsRemaining() ? 'feedback' : hasDemoCallsRemaining() ? 'idle' : 'capped')
    prewarm()
  }, [prewarm])

  const handleFeedbackDone = useCallback(() => {
    setPhase(hasDemoCallsRemaining() ? 'idle' : 'capped')
  }, [])

  // Not gated on feedbackSubmitted - called twice on a "not helpful" rating
  // (once bare the moment the thumbs-down is tapped, so the rating is
  // captured even if the visitor never writes anything; once more with the
  // comment if they do write one and hit Send). set_demo_feedback is a
  // plain UPDATE, so a second call for the same room safely just adds the
  // comment rather than double-counting anything.
  const handleFeedback = useCallback((rating: 'helpful' | 'not_helpful', comment?: string) => {
    const room = lastRoomNameRef.current
    if (!room) return
    setFeedbackSubmitted(true)
    submitDemoFeedback(room, rating, comment).catch(() => {
      // Best-effort - a visitor never needs to know this failed silently.
    })
  }, [])

  // The browser connected to the room but no AI agent ever joined (worker
  // cold-start/crash/restart - LiveKit Cloud's own agent worker, unrelated
  // to the orchestrator). Instead of just erroring, fall back to the
  // Railway-native orchestrator pipeline for this one call, same visitor
  // experience either way - only errors out if THAT also fails.
  const handleAgentUnavailable = useCallback(() => {
    setToken(null)
    setServerUrl(null)
    setPhase('active-orchestrator')
  }, [])

  const handleOrchestratorFailed = useCallback(() => {
    // Both providers failed for this attempt - genuinely over, unlike
    // handleAgentUnavailable above (which is just a mid-attempt handoff
    // and must NOT release the lock).
    releaseCallLock()
    // Both providers failed for this attempt - the strongest signal we have
    // that this is real capacity pressure, not a one-off blip. Second+
    // consecutive failure gets an honest "high demand" message plus a
    // cooldown instead of a bare "try again" that just invites another
    // immediate click - escalates 8s/16s/30s(capped) per repeat failure.
    consecutiveFailuresRef.current += 1
    const failures = consecutiveFailuresRef.current
    if (failures >= 2) {
      const cooldownMs = Math.min(30_000, 8_000 * 2 ** (failures - 2))
      setCooldownUntil(Date.now() + cooldownMs)
      setErrorMessage("We're seeing high demand right now — please wait a moment before trying again.")
    } else {
      setErrorMessage('Artha didn’t pick up just now - please try again.')
    }
    setPhase('unreachable')
  }, [])

  const exhausted = phase === 'capped'
  const isCallLive = phase === 'active'
  const isCallLiveOrchestrator = phase === 'active-orchestrator'
  const isIdleLike = !isCallLive && !isCallLiveOrchestrator

  // The idle/capped content includes a "Native support / Low latency"
  // footer the live-call states don't need, so swapping to InlineCallBody
  // used to visibly shrink the card mid-page - a jarring layout shift right
  // when a visitor taps to talk. Locking min-height to whatever the
  // idle/capped content actually measures (re-checked on resize, since text
  // wrapping changes across breakpoints) keeps every phase the same
  // footprint without duplicating that footer into the call UI itself.
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardMinHeight, setCardMinHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (!isIdleLike) return
    const measure = () => setCardMinHeight(cardRef.current?.offsetHeight)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isIdleLike, exhausted, phase])

  return (
    <div
      id="live-demo"
      className={`demo-card-shell relative mx-auto w-full max-w-[420px] scroll-mt-20 lg:mx-0 lg:ml-auto ${spotlight ? 'demo-card-spotlight' : ''}`}
    >
      {/* inset-x-0, not -inset-10: a negative horizontal inset made this box
          80px wider than the card, which overflowed the viewport on small
          screens and gave the whole page a horizontal scrollbar. The blur
          still paints well outside the box, so the glow looks identical -
          it just no longer contributes that width to layout. */}
      <div className="pointer-events-none absolute inset-x-0 -inset-y-10 rounded-full bg-primary/20 blur-[100px]" />
      <div
        ref={cardRef}
        style={cardMinHeight ? { minHeight: cardMinHeight } : undefined}
        className="relative flex w-full flex-col items-center rounded-[28px] border border-border bg-surface/80 p-8 text-center backdrop-blur-xl sm:p-10"
      >
        <span className="demo-start-label" aria-hidden="true">
          <Icon name="south_east" className="text-[15px]" /> Start here
        </span>
        <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-border bg-surface-high px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Live demo</span>
        </div>

        {isCallLive && token && serverUrl ? (
          // className="contents" - LiveKitRoom renders its own wrapping div
          // with no flex styling, which broke the card's `flex flex-col
          // items-center` centering for InlineCallBody's fixed-width w-48
          // orb (w-full children like the footer/button row still looked
          // fine since they just stretch to fill it). display:contents
          // removes that wrapper from layout entirely so InlineCallBody's
          // children are centered as if they were direct children of the
          // card again.
          <LiveKitRoom
            className="contents"
            serverUrl={serverUrl}
            token={token}
            connect
            audio
            onDisconnected={handleDisconnected}
          >
            <RoomAudioRenderer />
            <InlineCallBody onAgentUnavailable={handleAgentUnavailable} onConnected={chargeDemoCall} />
          </LiveKitRoom>
        ) : isCallLiveOrchestrator ? (
          <InlineOrchestratorCallBody onEnded={handleDisconnected} onFailed={handleOrchestratorFailed} onConnected={chargeDemoCall} />
        ) : phase === 'feedback' ? (
          <FeedbackPrompt submitted={feedbackSubmitted} onRate={handleFeedback} onDone={handleFeedbackDone} />
        ) : (
          <>
            <button
              type="button"
              onClick={exhausted ? undefined : handleStart}
              disabled={phase === 'connecting'}
              className="demo-start-target group relative my-6 flex h-48 w-48 items-center justify-center disabled:cursor-wait"
            >
              <span className="absolute inset-0 rounded-full border border-primary/20" />
              <span className="absolute inset-5 rounded-full border border-primary/10" />
              <span className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform group-hover:scale-105">
                <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
              </span>
              {phase === 'connecting' && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/50">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                </span>
              )}
            </button>

            <h3 className="font-display text-2xl font-semibold">
              {exhausted
                ? 'Book a live walkthrough'
                : phase === 'connecting'
                  ? 'Connecting…'
                  : phase === 'denied'
                    ? 'Mic access blocked'
                    : phase === 'unreachable'
                      ? 'Couldn’t reach Artha'
                      : 'Tap to talk'}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {exhausted
                ? 'You’ve used all your free demo calls'
                : phase === 'connecting'
                  ? `Connecting you to Artha…`
                  : phase === 'denied' || phase === 'unreachable'
                    ? errorMessage
                    : 'Try Artha, no signup required'}
            </p>

            {phase === 'denied' || phase === 'unreachable' ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={inCooldown}
                className="mt-5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inCooldown ? `Try again in ${cooldownRemainingS}s` : 'Try Again'}
              </button>
            ) : (
              <div className="mt-5 rounded-xl border border-border bg-bg px-4 py-2 text-sm">
                <span className="font-bold text-cyan">{remaining}/{DEMO_CALL_CAP}</span>{' '}
                <span className="text-text-muted">free calls left</span>
              </div>
            )}

            {exhausted && (
              <Link
                to="/contact"
                className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
              >
                Book a demo
              </Link>
            )}

            <DemoCardFooter />
          </>
        )}
      </div>
    </div>
  )
}

// Shown for a few seconds right after a real call ends, in the same card
// (no separate page/route) - mirrors the embeddable widget's own post-call
// feedback (widget/src/widget.ts's #av-complete panel): a quick thumbs up/
// down, with an optional comment box on a negative rating. Auto-returns to
// idle shortly after a choice is made, or immediately via "Skip" - a
// visitor who just finished talking to Artha shouldn't be stuck looking at
// a rating prompt if they don't want to leave one.
function FeedbackPrompt({
  submitted,
  onRate,
  onDone,
}: {
  submitted: boolean
  onRate: (rating: 'helpful' | 'not_helpful', comment?: string) => void
  onDone: () => void
}) {
  const [rated, setRated] = useState<'helpful' | 'not_helpful' | null>(null)
  const [comment, setComment] = useState('')
  const [commentSent, setCommentSent] = useState(false)

  useEffect(() => {
    if (!submitted) return
    // Give a moment to see the thanks (or write a comment on a negative
    // rating) before the card resets - not an instant jump back to idle.
    const delay = rated === 'not_helpful' && !commentSent ? 6000 : 1800
    const timer = window.setTimeout(onDone, delay)
    return () => window.clearTimeout(timer)
  }, [submitted, rated, commentSent, onDone])

  const handleRate = (rating: 'helpful' | 'not_helpful') => {
    setRated(rating)
    // Sent bare here (no comment yet) so the rating itself is captured even
    // if the visitor never types anything below - the Send button re-sends
    // with the comment attached as a second, safe UPDATE.
    onRate(rating)
  }

  return (
    <div className="flex w-full flex-col items-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon name="forum" className="text-[28px]" />
      </span>
      <h3 className="mt-5 font-display text-2xl font-semibold">
        {rated ? 'Thanks for the feedback!' : 'How was that?'}
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        {rated === 'not_helpful'
          ? 'Anything specific we should fix?'
          : rated
            ? 'That helps us build a better Artha.'
            : 'Rate your conversation with Artha'}
      </p>

      {!rated && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleRate('helpful')}
            aria-label="Helpful"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg text-xl transition-colors hover:border-success hover:bg-success/10"
          >
            <Icon name="thumb_up" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => handleRate('not_helpful')}
            aria-label="Not helpful"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg text-xl transition-colors hover:border-destructive hover:bg-destructive/10"
          >
            <Icon name="thumb_down" className="text-[20px]" />
          </button>
        </div>
      )}

      {rated === 'not_helpful' && !commentSent && (
        <div className="mt-4 w-full">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="What went wrong? (optional)"
            className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => {
              setCommentSent(true)
              if (comment.trim()) onRate('not_helpful', comment.trim())
            }}
            className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-bg transition-opacity hover:opacity-90"
          >
            Send
          </button>
        </div>
      )}

      {!rated && (
        <button type="button" onClick={onDone} className="mt-5 text-xs text-text-muted underline underline-offset-2 hover:text-text">
          Skip
        </button>
      )}
    </div>
  )
}

// Shared with the idle state so the card is the same height and never looks
// half-empty once a call is live - see InlineCallBody/InlineOrchestratorCallBody.
function DemoCardFooter() {
  return (
    <div className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-border pt-5 text-left">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Native support</p>
        {/* Ten Indian languages plus English = the 11 languages in LANGUAGE_NAMES.
            Hinglish isn't counted as a 12th - it's Hindi/English
            code-switching, and listing it as a separate language is
            what made the count drift across pages before. */}
        <p className="mt-1 text-xs text-text">Hindi · Tamil +9 more</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Low latency</p>
        <p className="mt-1 text-xs text-text">Real-time · emotion-aware</p>
      </div>
    </div>
  )
}

// Agent's live turn state, mirrors ActiveCallUI.tsx's STATE_STYLES labels -
// fills what used to be the empty gap below the orb during an active call,
// and doubles as the same "is it stuck?" signal the dashboard test call has.
const STATE_LABELS: Record<string, string> = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Agent is speaking…',
}
// Shown before lk.agent.state has any value yet — the window between the
// agent joining the room and it actually starting its turn (dispatch/cold
// start/greeting synthesis). Defaulting this to 'Listening…' read as "the
// agent skipped its greeting and is waiting on the caller", which isn't
// what's happening — it just hasn't started yet.
const WAITING_LABEL = 'Connecting…'

// Rendered inside <LiveKitRoom> once connected - same card, same footprint,
// swapped from the idle "Tap to talk" content to live call state: a running
// timer and mute/end-call controls. No "Listening…/Thinking…/Speaking…"
// status text - it read as distracting chatter rather than useful signal.
function InlineCallBody({ onAgentUnavailable, onConnected }: { onAgentUnavailable: () => void; onConnected: () => void }) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const agentJoined = !!agentParticipant

  useEffect(() => {
    if (agentJoined) onConnected()
  }, [agentJoined, onConnected])
  // Timer starts when the AGENT joins, not when the browser connects to the
  // room - otherwise a call that never got an agent still showed a ticking
  // "live" timer against silence, which read as a broken/dead agent.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (agentJoined && startedAt === null) setStartedAt(Date.now())
  }, [agentJoined, startedAt])

  useEffect(() => {
    if (startedAt === null) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  // If no agent joins within the timeout, the demo worker is unavailable -
  // bail out to an explicit retry instead of holding the visitor on a silent
  // dead call.
  useEffect(() => {
    if (agentJoined) return
    const timer = setTimeout(onAgentUnavailable, AGENT_JOIN_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [agentJoined, onAgentUnavailable])

  // Hard cap enforced silently - no visible countdown, see MAX_CALL_MS.
  useEffect(() => {
    if (elapsedMs >= MAX_CALL_MS) room.disconnect()
  }, [elapsedMs, room])

  return (
    <>
      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/20" />
        <span className="absolute inset-5 rounded-full border border-primary/10" />
        {agentParticipant ? (
          <AgentVisual agentParticipant={agentParticipant} />
        ) : (
          <span className="relative h-32 w-32 overflow-hidden rounded-full opacity-45 shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)]">
            <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/40">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
            </span>
          </span>
        )}
      </div>

      {agentJoined ? (
        <AgentStateLabel agentParticipant={agentParticipant} />
      ) : (
        <p className="mt-5 text-sm text-text-muted">Connecting to Artha…</p>
      )}

      <div className="mt-6 flex w-full items-center justify-center gap-4">
        <button
          aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-high text-text-muted transition-colors hover:text-text"
        >
          <Icon name={isMicrophoneEnabled ? 'mic' : 'mic_off'} />
        </button>
        <button
          aria-label="End call"
          onClick={() => room.disconnect()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white transition-opacity hover:opacity-90"
        >
          <Icon name="call_end" className="text-[24px]" />
        </button>
      </div>

      <DemoCardFooter />
    </>
  )
}

// Same card, same footprint as InlineCallBody, but driven by
// useOrchestratorCall's local state instead of LiveKit's room hooks - used
// when LiveKit's demo worker didn't pick up and DemoOrbCard fell back to
// the orchestrator (agentId omitted -> resolves the platform-demo agent).
function InlineOrchestratorCallBody({
  onEnded,
  onFailed,
  onConnected,
}: {
  onEnded: () => void
  onFailed: () => void
  onConnected: () => void
}) {
  const { phase, agentState, agentVolume, micEnabled, toggleMic, endCall, elapsedMs } = useOrchestratorCall()

  useEffect(() => {
    if (phase === 'error') onFailed()
    else if (phase === 'ended') onEnded()
  }, [phase, onFailed, onEnded])

  const connected = phase === 'active'

  useEffect(() => {
    if (connected) onConnected()
  }, [connected, onConnected])
  const speaking = agentState === 'speaking'

  // Hard cap enforced silently - no visible countdown, see MAX_CALL_MS.
  useEffect(() => {
    if (elapsedMs >= MAX_CALL_MS) endCall()
  }, [elapsedMs, endCall])

  return (
    <>
      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/20" />
        <span className="absolute inset-5 rounded-full border border-primary/10" />
        {connected ? (
          <InlineOrchestratorVisual volume={speaking ? agentVolume : 0} speaking={speaking} />
        ) : (
          <span className="relative h-32 w-32 overflow-hidden rounded-full opacity-45 shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)]">
            <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/40">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
            </span>
          </span>
        )}
      </div>

      {connected ? (
        <p className="mt-5 text-sm text-text-muted">{STATE_LABELS[agentState ?? ''] ?? WAITING_LABEL}</p>
      ) : (
        <p className="mt-5 text-sm text-text-muted">Connecting to Artha…</p>
      )}

      <div className="mt-6 flex w-full items-center justify-center gap-4">
        <button
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={toggleMic}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-high text-text-muted transition-colors hover:text-text"
        >
          <Icon name={micEnabled ? 'mic' : 'mic_off'} />
        </button>
        <button
          aria-label="End call"
          onClick={endCall}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white transition-opacity hover:opacity-90"
        >
          <Icon name="call_end" className="text-[24px]" />
        </button>
      </div>

      <DemoCardFooter />
    </>
  )
}

function InlineOrchestratorVisual({ volume, speaking }: { volume: number; speaking: boolean }) {
  const scale = 1 + Math.min(volume, 1) * 0.14
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speaking ? SPEAKING_PLAYBACK_RATE : 1
  }, [speaking])

  return (
    <span
      className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform duration-150 ease-out"
      style={{ transform: `scale(${scale})` }}
    >
      <video ref={videoRef} src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
    </span>
  )
}

// useParticipantAttribute throws if called before an agent participant
// exists, so these only ever mount once InlineCallBody has confirmed
// agentParticipant is defined - mirrors ActiveCallUI's AgentOrb pattern.
// Video's ring animation spins at this rate while the agent is actively
// speaking (vs. 1x its authored speed the rest of the time) - matches
// ActiveCallUI.tsx's SPEAKING_PLAYBACK_RATE.
const SPEAKING_PLAYBACK_RATE = 2.2

function AgentVisual({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const volume = useTrackVolume(agentTracks[0])
  const agentState = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const scale = 1 + Math.min(volume, 1) * 0.14
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = agentState === 'speaking' ? SPEAKING_PLAYBACK_RATE : 1
  }, [agentState])

  return (
    <span
      className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform duration-150 ease-out"
      style={{ transform: `scale(${scale})` }}
    >
      <video ref={videoRef} src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
    </span>
  )
}

// Separate component (not folded into AgentVisual) purely so InlineCallBody
// can place it below the mic/end-call row's divider instead of right under
// the orb - same gating rule applies: only mount once agentParticipant exists.
function AgentStateLabel({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentState = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  return <p className="mt-5 text-sm text-text-muted">{STATE_LABELS[agentState ?? ''] ?? WAITING_LABEL}</p>
}
