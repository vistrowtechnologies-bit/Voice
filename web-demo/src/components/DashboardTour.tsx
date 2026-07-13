import { useLayoutEffect, useState } from 'react'
import { apiCompleteTour, useAuth } from '../lib/auth'

interface TourStep {
  selector: string
  title: string
  body: string
}

// Targets data-tour attributes on DashboardLayout's sidebar links + the
// HelpChatWidget FAB — same selectors, so if either component's markup
// changes, this silently stops finding a target and the step is skipped
// rather than floating a tooltip nowhere (see the rect.width === 0 guard).
const STEPS: TourStep[] = [
  {
    selector: '[data-tour="nav-dashboard"]',
    title: 'Your home base',
    body: 'Call volume, peak hours, and recent activity at a glance.',
  },
  {
    selector: '[data-tour="nav-agents"]',
    title: 'Build your agents',
    body: 'Set persona, voice, language, and knowledge for each AI agent.',
  },
  {
    selector: '[data-tour="nav-knowledge"]',
    title: 'Ground it in your docs',
    body: 'Upload PDFs or FAQs so agents answer from your own material, not guesses.',
  },
  {
    selector: '[data-tour="nav-integrations"]',
    title: 'Connect your tools',
    body: 'Google Calendar, Slack, WhatsApp, and more — all from here.',
  },
  {
    selector: '[data-tour="nav-settings"]',
    title: 'Manage your workspace',
    body: 'Invite teammates, set roles, and manage API keys.',
  },
  {
    selector: '[data-tour="help-chat"]',
    title: 'Stuck? Just ask',
    body: 'This help chat can answer questions about Vistrow Voice any time.',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/** First-run guided tour, shown once per user right after the onboarding
 * modal closes (see DashboardLayout: user.onboarded && !user.tourCompleted).
 * Spotlights real sidebar nav items via the box-shadow "cutout" trick — no
 * SVG mask, no new dependency. Silently renders nothing if a step's target
 * isn't in the layout (e.g. sidebar hidden below the lg breakpoint) rather
 * than floating a tooltip at the wrong spot. */
export function DashboardTour() {
  const { user, setUser } = useAuth()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(STEPS[step].selector)
      const r = el?.getBoundingClientRect()
      setRect(r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])

  if (!user) return null

  const finish = async () => {
    try {
      const { user: updated } = await apiCompleteTour()
      setUser(updated)
    } catch {
      // Same reasoning as OnboardingModal: don't trap the user behind a
      // failed network call — worst case the tour reappears next session.
      setUser({ ...user, tourCompleted: true })
    }
  }

  const next = () => {
    if (step === STEPS.length - 1) finish()
    else setStep((s) => s + 1)
  }
  const back = () => setStep((s) => Math.max(0, s - 1))

  if (!rect) return null

  const cardWidth = 280
  const onLeftHalf = rect.left < window.innerWidth / 2
  const left = onLeftHalf
    ? Math.min(rect.left + rect.width + 14, window.innerWidth - cardWidth - 16)
    : Math.max(rect.left - cardWidth - 14, 16)
  const top = Math.min(Math.max(rect.top - 8, 16), window.innerHeight - 200)

  return (
    <>
      <div
        className="fixed z-[60] rounded-lg transition-all duration-200"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="fixed z-[61] flex w-[280px] flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xl transition-all duration-200"
        style={{ top, left }}
      >
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s.selector} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{STEPS[step].title}</h3>
          <p className="mt-1 text-xs text-text-muted">{STEPS[step].body}</p>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs font-semibold text-text-muted hover:text-text">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={back}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-primary"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg transition-opacity hover:opacity-90"
            >
              {step === STEPS.length - 1 ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
