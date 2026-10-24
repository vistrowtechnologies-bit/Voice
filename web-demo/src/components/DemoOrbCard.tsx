import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import {
  DEMO_CALL_CAP,
  getRemainingDemoCalls,
  hasDemoCallsRemaining,
  recordDemoCall,
} from '../lib/demoCallCap'
import { fetchLiveKitToken, randomId, submitDemoFeedback, TokenError } from '../lib/livekit'
import { clearDemoVisitor, looksLikeRealPhone, readDemoVisitor, saveDemoVisitor, type DemoVisitor } from '../lib/demoVisitor'
import { trackDemoCallStarted, trackMarketingCta, trackQualifyLead } from '../lib/analytics'
import { useOrchestratorCall } from '../lib/orchestratorCall'

// The LiveKit client (about 500 KB) loads only when a visitor starts a call,
// not with every marketing page. handleStart begins the download alongside the
// microphone prompt and token request, so it is normally ready first.
const loadLiveRoom = () => import('./DemoOrbLiveRoom')
const DemoOrbLiveRoom = lazy(() => loadLiveRoom().then((m) => ({ default: m.DemoOrbLiveRoom })))

type Phase = 'idle' | 'consent' | 'connecting' | 'active' | 'active-orchestrator' | 'denied' | 'capped' | 'unreachable' | 'feedback'

// How long the visitor's browser waits for the AI agent to actually join the
// room after connecting. A healthy dispatch + (cold) worker start is a few
// seconds; if no agent joins within this window the demo worker is genuinely
// unavailable (restarting/crashed/no capacity), so we surface a clean retry
// instead of leaving the visitor staring at a ticking timer over dead air.
export const AGENT_JOIN_TIMEOUT_MS = 20_000
// The agent can join the room and still never start (its job crashed loading
// its configuration). It reports lk.agent.state once it is really running.
export const AGENT_READY_TIMEOUT_MS = 25_000

// Same hard cap the embeddable widget enforces (widget/src/widget.ts) - every
// minute of every call costs real STT/LLM/TTS spend. The marketing demo cuts
// it silently instead of showing a countdown: this card is a first
// impression, not a tool a visitor is relying on, so a visible timer just
// makes an unlimited-feeling product look metered.
export const MAX_CALL_MS = 5 * 60 * 1000

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

// DPDP consent gate, shown before the mic prompt and before any token that
// would carry this visitor into a room. Same version AND storage key as the
// embeddable widget (widget/src/widget.ts CONSENT_VERSION) - on this site
// both surfaces share an origin, so accepting on one counts for the other.
// Bump both together whenever the consent wording materially changes.
const CONSENT_VERSION = '2026-09-14'
const CONSENT_STORAGE_KEY = `__vistrowConsent:${CONSENT_VERSION}`
// Module-level so every DemoOrbCard on the page shares it, and so an Accept
// still counts where localStorage is blocked (strict privacy modes).
let consentGrantedAt = ''
function readConsent(): string {
  if (consentGrantedAt) return consentGrantedAt
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
function grantConsent(): void {
  consentGrantedAt = new Date().toISOString()
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consentGrantedAt)
  } catch {
    // storage blocked: in-memory for this page view
  }
}
function consentArg(): { version: string; acceptedAt: string } | undefined {
  const acceptedAt = readConsent()
  return acceptedAt ? { version: CONSENT_VERSION, acceptedAt } : undefined
}

// The recurring "LIVE DEMO" card - tapping the orb starts the call right
// here (no separate confirmation page/route): mic permission is the
// browser's own native prompt, then the same card shows live call state
// (status, timer, mute/end controls) in place of the idle "Tap to talk"
// content. Reused on the homepage hero and every solution/product page.
export function DemoOrbCard({
  spotlight = false,
  demoSlug,
  language,
  badgeLabel = 'Live demo',
  accentHue,
  variant = 'default',
}: {
  spotlight?: boolean
  /** Published industry-demo slug (e.g. 'healthcare'). Omitted on the
   * homepage, where the server resolves the platform-demo sales agent. */
  demoSlug?: string
  /** Open the demo in this language instead of the agent's configured one. */
  language?: string
  /** Badge in the card corner. Industry pages say what the visitor is
   * actually about to phone ("Clinic demo") rather than a generic label. */
  badgeLabel?: string
  /** Hue rotation (e.g. '140deg') tinting the orb and its glow, so each
   * industry's demo reads as its own thing instead of five identical purple
   * cards. Omitted = the homepage's original purple, untouched. */
  accentHue?: string
  /** 'call' (homepage hero, owner 21 Oct): the idle card reads as an incoming
   * call - "Artha is calling you" with a green Answer button - and follows the
   * site theme (dark card / lavender card). The call itself is unchanged. */
  variant?: 'default' | 'call'
}) {
  // Hidden QA entry point: /?pipeline=sarvam-livekit sends only this demo
  // call to the dedicated demo worker's all-Sarvam LiveKit profile. It is
  // intentionally a URL switch rather than a public product toggle while we
  // collect latency and quality data.
  const pipelineProfile =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pipeline') === 'sarvam-livekit'
      ? 'sarvam-livekit' as const
      : undefined
  const [phase, setPhase] = useState<Phase>(() => (hasDemoCallsRemaining() ? 'idle' : 'capped'))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const handingOffRef = useRef(false)

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
  const prewarmRef = useRef<{ token: string; url: string; identity: string; room: string; at: number; consented: boolean } | null>(null)
  const prewarmPromiseRef = useRef<Promise<{ token: string; url: string; identity: string; room: string; at: number; consented: boolean } | null> | null>(null)
  const prewarmErrorRef = useRef<TokenError | null>(null)
  const prewarm = useCallback(() => {
    const cached = prewarmRef.current
    if (cached && Date.now() - cached.at < PREWARM_MAX_AGE_MS) return Promise.resolve(cached)
    if (prewarmPromiseRef.current) return prewarmPromiseRef.current
    if (!hasDemoCallsRemaining()) return Promise.resolve(null)
    const identity = randomId('visitor')
    const room = randomId('voice-agent-demo')
    const consent = consentArg()
    prewarmErrorRef.current = null
    const request = fetchLiveKitToken(identity, room, undefined, demoSlug, language, undefined, pipelineProfile, consent)
      .then(({ token: newToken, url }) => {
        const warmed = { token: newToken, url, identity, room, at: Date.now(), consented: !!consent }
        prewarmRef.current = warmed
        return warmed
      })
      .catch((err) => {
        // handleStart surfaces a retry. Repeating a failed request here
        // would double the waiting time and could dispatch another room.
        // A refusal from the server (daily limit, rejected details) keeps its
        // own message for handleStart to show.
        prewarmErrorRef.current = err instanceof TokenError ? err : null
        return null
      })
    prewarmPromiseRef.current = request.finally(() => {
      prewarmPromiseRef.current = null
    })
    return prewarmPromiseRef.current
    // demoSlug decides WHICH agent the prewarmed room dispatches, so it has
    // to be a dependency — a stale closure here would silently warm the
    // homepage sales agent for an industry page. language is baked into the
    // room's metadata at creation for the same reason.
  }, [demoSlug, language, pipelineProfile])

  // A warmed room carries its language in metadata, fixed when the room was
  // created — so a visitor who warms in Hindi and then picks French would be
  // handed a room that still opens in Hindi. Drop the warm room on a change
  // and let the next prewarm create one with the right metadata.
  useEffect(() => {
    prewarmRef.current = null
  }, [language])

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
    // DPDP gate - ahead of the call lock, the mic prompt and any token fetch,
    // so nothing is held or requested while the visitor is still deciding.
    // The homepage demo (no slug) also needs the visitor's name and phone
    // (owner 24 Oct): the server refuses its token without them.
    if (!readConsent() || (!demoSlug && !readDemoVisitor())) {
      setPhase('consent')
      return
    }
    if (!claimCallLock()) {
      setErrorMessage('A conversation is already active on this page. Please finish it first.')
      setPhase('unreachable')
      return
    }
    creditChargedRef.current = false
    handingOffRef.current = false
    setPhase('connecting')
    setErrorMessage(null)
    // Start dispatch before asking for microphone permission. On a first
    // visit the native permission prompt usually gives the worker several
    // seconds of useful head start; on repeat visits this still overlaps
    // with getUserMedia and WebRTC setup.
    const warming = prewarm()
    void loadLiveRoom().catch(() => {})
    try {
      // This stream only asks permission. LiveKit owns the actual call
      // stream; retaining both keeps an unused microphone capture alive.
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      permissionStream.getTracks().forEach((track) => track.stop())
      const warm = (await warming) ?? prewarmRef.current
      if (!warm) throw prewarmErrorRef.current ?? new Error('Could not connect to Artha. Please try again.')
      const isFresh = warm && warm.consented && Date.now() - warm.at < PREWARM_MAX_AGE_MS
      const room = isFresh ? warm.room : randomId('voice-agent-demo')
      const { token: newToken, url } =
        isFresh ? warm : await fetchLiveKitToken(randomId('visitor'), room, undefined, demoSlug, language, undefined, pipelineProfile, consentArg())
      prewarmRef.current = null
      lastRoomNameRef.current = room
      setFeedbackSubmitted(false)
      trackDemoCallStarted()
      setToken(newToken)
      setServerUrl(url)
      setPhase('active')
    } catch (err) {
      releaseCallLock()
      // The server refused the saved details (e.g. a number it now rejects):
      // forget them so the next tap shows the form again.
      if (err instanceof TokenError && err.status === 400) clearDemoVisitor()
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Mic access is blocked. Enable it in your browser settings to continue.')
        setPhase('denied')
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not connect. Please try again.')
        setPhase('unreachable')
      }
    }
  }, [cooldownUntil, prewarm, demoSlug, language, pipelineProfile])

  const handleConsentAccept = useCallback(
    (visitor: DemoVisitor | null) => {
      if (visitor) {
        saveDemoVisitor(visitor)
        trackQualifyLead('demo_form')
      }
      grantConsent()
      void handleStart()
    },
    [handleStart],
  )
  const handleConsentCancel = useCallback(() => setPhase('idle'), [])

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
    // Deliberately NOT prewarming here. This used to speculatively warm a
    // room for a hypothetical next call the moment one ended - but the
    // visitor has just hung up, so nobody is waiting on latency, and most
    // never call again. Every one of those rooms dispatched an agent that
    // sat out agent/main.py's 90s wait_for_participant and was billed as
    // agent session time: a guaranteed wasted 1.5 minutes per completed
    // call. Measured on the LiveKit August invoice, agent session minutes
    // ran ~11.8x actual participant minutes (9,125 vs 775). handleStart
    // still prewarms, where a caller genuinely is waiting.
  }, [])

  const handleLiveKitDisconnected = useCallback(() => {
    // Unmounting LiveKit during fallback can emit a late disconnect. It
    // must not reset the new connection attempt to the idle screen.
    if (!handingOffRef.current) handleDisconnected()
  }, [handleDisconnected])

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
    if (handingOffRef.current) return
    handingOffRef.current = true
    setToken(null)
    setServerUrl(null)
    if (pipelineProfile) {
      // Falling through to the non-LiveKit orchestrator would make this look
      // like a successful Sarvam measurement when it was actually a
      // different pipeline. Fail honestly and keep the A/B data clean.
      releaseCallLock()
      setErrorMessage('The latency lab did not pick up. Please try again.')
      setPhase('unreachable')
      return
    }
    setPhase('active-orchestrator')
  }, [pipelineProfile])

  const handleConnectionError = useCallback((error: Error) => {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      handingOffRef.current = true
      releaseCallLock()
      setToken(null)
      setServerUrl(null)
      setErrorMessage('Mic access is blocked. Enable it in your browser settings to continue.')
      setPhase('denied')
      return
    }
    handleAgentUnavailable()
  }, [handleAgentUnavailable])

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
      setErrorMessage("We're seeing high demand right now. Please wait a moment before trying again.")
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

  // Homepage hero only: while this card is on screen, fade out the floating
  // widget (its "I actually talk back!" bubble sat on the Answer button, two
  // Arthas competing). It comes back once the card scrolls away, and is never
  // hidden while the visitor has the widget's panel open.
  useEffect(() => {
    if (variant !== 'call') return
    const card = cardRef.current
    if (!card || typeof IntersectionObserver === 'undefined') return
    const root = document.documentElement
    const widgetOpen = () =>
      (document.getElementById('vistrow-voice-widget-host')?.shadowRoot?.getElementById('av-panel') as HTMLElement | null)?.style.display === 'flex'
    const observer = new IntersectionObserver(
      ([entry]) => root.classList.toggle('vv-hero-call-visible', entry.intersectionRatio > 0.2 && !widgetOpen()),
      { threshold: [0, 0.2, 0.5] },
    )
    observer.observe(card)
    return () => {
      observer.disconnect()
      root.classList.remove('vv-hero-call-visible')
    }
  }, [variant])

  // Grow-only: a shorter phase (the rating prompt) must not shrink the card
  // either. A resize starts over, since text wrap changes the natural height.
  useLayoutEffect(() => {
    if (!isIdleLike) return
    const measure = () => setCardMinHeight((current) => Math.max(current ?? 0, cardRef.current?.offsetHeight ?? 0) || undefined)
    const reset = () => { setCardMinHeight(undefined); requestAnimationFrame(measure) }
    measure()
    window.addEventListener('resize', reset)
    return () => window.removeEventListener('resize', reset)
  }, [isIdleLike, exhausted, phase])

  return (
    <div
      id="live-demo"
      // Live transcript can hold what the visitor said (name, number) — keep it out of Clarity recordings.
      data-clarity-mask="true"
      // Homepage hero: on desktop the card fills the hero's full height (the
      // text column beside it) and keeps it in every phase (owner, 21 Oct).
      className={`demo-card-shell relative mx-auto w-full max-w-[420px] scroll-mt-20 lg:mx-0 lg:ml-auto ${variant === 'call' ? 'lg:flex lg:h-full lg:flex-col' : ''} ${spotlight ? 'demo-card-spotlight' : ''}`}
      style={accentHue ? ({ '--demo-accent-hue': accentHue } as React.CSSProperties) : undefined}
    >
      {/* inset-x-0, not -inset-10: a negative horizontal inset made this box
          80px wider than the card, which overflowed the viewport on small
          screens and gave the whole page a horizontal scrollbar. The blur
          still paints well outside the box, so the glow looks identical -
          it just no longer contributes that width to layout. */}
      {/* Not on the homepage call card: there it read as a solid oval
          sticking out above and below the card (owner, 21 Oct). */}
      {variant !== 'call' && <div className="demo-glow pointer-events-none absolute inset-x-0 -inset-y-10 rounded-full bg-primary/20 blur-[100px]" />}
      <div
        ref={cardRef}
        style={cardMinHeight ? { minHeight: cardMinHeight } : undefined}
        className={
          variant === 'call'
            ? 'demo-call-card relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[28px] p-6 text-center sm:p-8 lg:flex-1'
            : 'relative flex w-full flex-col items-center rounded-[28px] border border-border bg-surface/80 p-8 text-center backdrop-blur-xl sm:p-10'
        }
      >
        {variant !== 'call' && (
          <span className="demo-start-label" aria-hidden="true">
            <Icon name="south_east" className="text-[15px]" /> Start here
          </span>
        )}
        <div className={`demo-accent absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-border bg-surface-high px-3 py-1 ${variant === 'call' ? 'hidden' : ''}`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">
            {pipelineProfile ? 'Latency lab' : badgeLabel}
          </span>
        </div>

        {isCallLive && token && serverUrl ? (
          <Suspense fallback={<LiveRoomLoading />}>
            <DemoOrbLiveRoom
              serverUrl={serverUrl}
              token={token}
              onDisconnected={handleLiveKitDisconnected}
              onError={handleConnectionError}
              onAgentUnavailable={handleAgentUnavailable}
              onConnected={chargeDemoCall}
            />
          </Suspense>
        ) : isCallLiveOrchestrator ? (
          <InlineOrchestratorCallBody onEnded={handleDisconnected} onFailed={handleOrchestratorFailed} onConnected={chargeDemoCall} />
        ) : phase === 'consent' ? (
          <ConsentPrompt askDetails={!demoSlug} onAccept={handleConsentAccept} onCancel={handleConsentCancel} />
        ) : phase === 'feedback' ? (
          <FeedbackPrompt submitted={feedbackSubmitted} onRate={handleFeedback} onDone={handleFeedbackDone} />
        ) : variant === 'call' ? (
          <CallInvite
            phase={phase}
            exhausted={exhausted}
            remaining={remaining}
            errorMessage={errorMessage}
            inCooldown={inCooldown}
            cooldownRemainingS={cooldownRemainingS}
            onStart={handleStart}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={exhausted ? undefined : handleStart}
              disabled={phase === 'connecting'}
              className="demo-start-target group relative my-6 flex h-48 w-48 items-center justify-center disabled:cursor-wait"
            >
              {/* Only these two ring borders get .demo-accent directly - the
                  shadow-wrapped video span two lines down already picks up
                  the same rotation via index.css's span:has(> video) rule,
                  and this button wraps that span, so tinting the whole
                  button would double-apply the rotation to it. */}
              <span className="demo-accent absolute inset-0 rounded-full border border-primary/20" />
              <span className="demo-accent absolute inset-5 rounded-full border border-primary/10" />
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
                onClick={() => trackMarketingCta('book_demo', 'demo_card_exhausted')}
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

// The homepage hero's idle card (variant="call"): Artha "calling you", so it
// is obvious that tapping starts a live voice call. Same states as the
// default card: connecting, mic blocked, unreachable (with cooldown), capped.
function CallInvite({ phase, exhausted, remaining, errorMessage, inCooldown, cooldownRemainingS, onStart }: {
  phase: Phase
  exhausted: boolean
  remaining: number
  errorMessage: string | null
  inCooldown: boolean
  cooldownRemainingS: number
  onStart: () => void
}) {
  const connecting = phase === 'connecting'
  const failed = phase === 'denied' || phase === 'unreachable'
  const proof = usePlatformProof()
  return (
    <>
      <p className="demo-call-kicker">Live demo · free</p>
      <button
        type="button"
        onClick={exhausted || connecting ? undefined : onStart}
        disabled={connecting}
        aria-label="Answer Artha's call"
        className="demo-start-target group relative my-5 flex h-32 w-32 items-center justify-center disabled:cursor-wait"
      >
        <span className="demo-call-ring" aria-hidden="true" />
        <span className="demo-call-ring demo-call-ring-2" aria-hidden="true" />
        {/* Zoomed so the video's black backdrop is cropped out of the circle. */}
        <span className="demo-call-orb relative h-28 w-28 overflow-hidden rounded-full transition-transform group-hover:scale-105">
          <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
        </span>
        {connecting && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/40">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </span>
        )}
      </button>
      <h3 className="font-display text-2xl font-bold">
        {exhausted
          ? 'Book a live walkthrough'
          : connecting
            ? 'Connecting…'
            : phase === 'denied'
              ? 'Mic access blocked'
              : phase === 'unreachable'
                ? 'Couldn’t reach Artha'
                : 'Artha is calling you'}
      </h3>
      <p className="demo-call-sub mt-1 text-sm">
        {exhausted
          ? 'You’ve used all your free demo calls'
          : connecting
            ? 'If your browser asks, tap Allow so Artha can hear you.'
            : failed
              ? errorMessage
              : 'Answer and talk to her live, like a real phone call.'}
      </p>
      {exhausted ? (
        <Link
          to="/contact"
          onClick={() => trackMarketingCta('book_demo', 'demo_card_exhausted')}
          className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-bg transition-opacity hover:opacity-90"
        >
          Book a demo
        </Link>
      ) : failed ? (
        <button
          type="button"
          onClick={onStart}
          disabled={inCooldown}
          className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {inCooldown ? `Try again in ${cooldownRemainingS}s` : 'Try again'}
        </button>
      ) : (
        <span className={`demo-call-tap mt-5 block w-full ${connecting ? 'demo-call-tap-off' : ''}`}>
          <button
            type="button"
            onClick={onStart}
            disabled={connecting}
            className="demo-call-answer flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-extrabold disabled:cursor-wait disabled:opacity-70"
          >
            <Icon name="call" className="text-[19px]" />
            Answer · talk live
          </button>
        </span>
      )}
      <ul className="demo-call-assure mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-semibold">
        <li className="flex items-center gap-1"><Icon name="mic" className="text-[14px]" />Your mic</li>
        <li className="flex items-center gap-1"><Icon name="graphic_eq" className="text-[14px]" />Sound on</li>
        <li className="flex items-center gap-1"><Icon name="verified" className="text-[14px]" />Free, no signup</li>
        <li>{remaining}/{DEMO_CALL_CAP} calls left</li>
      </ul>
      {proof && (
        <p className="demo-call-proof mt-3 flex items-center justify-center gap-1.5 text-[11.5px] font-bold">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          {proof}
        </p>
      )}
    </>
  )
}

// The same real, cached weekly count the floating widget shows ("N+ AI
// conversations this week"), read through the widget's own public site key
// and API base from its script tag. Nothing is shown below 50, the widget's
// threshold, or when the widget script is absent.
function usePlatformProof(): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const tag = document.querySelector<HTMLScriptElement>('script[data-site-key][data-api-base]')
    const siteKey = tag?.dataset.siteKey
    const apiBase = tag?.dataset.apiBase
    if (!siteKey || !apiBase) return
    let cancelled = false
    fetch(`${apiBase}/widget/site-config?siteKey=${encodeURIComponent(siteKey)}&path=${encodeURIComponent(location.pathname)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { platformConversationCount?: unknown } | null) => {
        const count = data?.platformConversationCount
        if (cancelled || typeof count !== 'number' || count < 50) return
        const base = count < 100 ? 10 : count < 1000 ? 50 : 100
        setLabel(`${(Math.floor(count / base) * base).toLocaleString('en-US')}+ AI conversations this week`)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return label
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
export function DemoCardFooter() {
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

// Shown only if the call module is still downloading when the token arrives.
function LiveRoomLoading() {
  return (
    <>
      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/20" />
        <span className="absolute inset-5 rounded-full border border-primary/10" />
        <span className="relative h-32 w-32 overflow-hidden rounded-full opacity-45 shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)]">
          <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/40">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          </span>
        </span>
      </div>
      <p className="mt-5 text-sm text-text-muted">Connecting to Artha…</p>
      <DemoCardFooter />
    </>
  )
}

// Agent's live turn state, mirrors ActiveCallUI.tsx's STATE_STYLES labels -
// fills what used to be the empty gap below the orb during an active call,
// and doubles as the same "is it stuck?" signal the dashboard test call has.
export const STATE_LABELS: Record<string, string> = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Agent is speaking…',
}
// Shown before lk.agent.state has any value yet — the window between the
// agent joining the room and it actually starting its turn (dispatch/cold
// start/greeting synthesis). Defaulting this to 'Listening…' read as "the
// agent skipped its greeting and is waiting on the caller", which isn't
// what's happening — it just hasn't started yet.
export const WAITING_LABEL = 'Connecting…'

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

// Video's ring animation spins at this rate while the agent is actively
// speaking (vs. 1x its authored speed the rest of the time) - matches
// ActiveCallUI.tsx's SPEAKING_PLAYBACK_RATE.
export const SPEAKING_PLAYBACK_RATE = 2.2

// The recording/processing notice a visitor must accept before the first
// demo call. Wording kept equivalent to the widget's dialog so both public
// surfaces make the same commitment under the same CONSENT_VERSION.
const COUNTRY_CODES = ['+91', '+971', '+1', '+44', '+65', '+61']

// Before the first call: the recording notice, and on the homepage demo the
// visitor's name, phone and one box covering both the notice and follow-up.
function ConsentPrompt({
  askDetails,
  onAccept,
  onCancel,
}: {
  askDetails: boolean
  onAccept: (visitor: DemoVisitor | null) => void
  onCancel: () => void
}) {
  const saved = readDemoVisitor()
  const [name, setName] = useState(saved?.name ?? '')
  const [code, setCode] = useState('+91')
  const [number, setNumber] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const box = 'rounded-xl border border-border bg-bg py-2.5 text-sm text-text outline-none transition-colors focus:border-primary'
  const field = `${box} w-full min-w-0 px-3.5`

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!askDetails) return onAccept(null)
    const phone = `${code}${number.replace(/^0+/, '')}`
    if (name.trim().length < 2) return setError('Please enter your name.')
    if (!looksLikeRealPhone(phone)) return setError('Please enter a valid mobile number.')
    if (!agreed) return setError('Please tick the box to continue.')
    onAccept({ name: name.trim().replace(/\s+/g, ' ').slice(0, 80), phone })
  }

  return (
    <form
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-consent-title"
      onSubmit={submit}
      noValidate
      className="my-6 flex w-full max-w-sm flex-col gap-3 text-left"
    >
      <h3 id="demo-consent-title" className="font-display text-2xl font-semibold">
        {askDetails ? 'Talk to Artha live' : 'Before we talk'}
      </h3>
      {askDetails && (
        <>
          <p className="text-sm text-text-muted">Tell us who’s calling, so we can follow up after your call.</p>
          <input
            className={field}
            placeholder="Your name"
            autoComplete="name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Your name"
          />
          <div className="flex gap-2">
            <select
              className={`${box} w-[5.5rem] shrink-0 px-2`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                if (e.target.value === '+91') setNumber((n) => n.slice(0, 10))
              }}
              aria-label="Country code"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={field}
              placeholder="98200 00000"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={code === '+91' ? 10 : 14}
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, code === '+91' ? 10 : 14))}
              aria-label="Mobile number"
            />
          </div>
        </>
      )}
      <p className="text-xs text-text-muted">
        This voice conversation is recorded and transcribed so Artha can respond and so we can follow up with you.
        The recording, transcript and any details you share are stored and processed by third-party service providers
        on our behalf. Please don’t share passwords, card numbers or other sensitive details. Read our{' '}
        <Link to="/privacy" className="text-primary underline">
          privacy policy
        </Link>
        .
      </p>
      {askDetails && (
        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-text">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>I agree to the above, and to Vistrow calling or messaging me on WhatsApp about this demo.</span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="mt-1 flex gap-3">
        <button
          type="submit"
          autoFocus={!askDetails}
          className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
        >
          {askDetails ? 'Start the call' : 'Accept and start'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border bg-bg px-5 py-2 text-xs font-bold transition-opacity hover:opacity-90"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
