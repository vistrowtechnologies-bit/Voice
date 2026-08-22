import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAgents } from '../lib/api'
import { apiAcceptConsent, apiCompleteOnboarding, apiUpdateAccount, useAuth } from '../lib/auth'
import type { AgentConfig } from '../lib/types'
import { BrowserTestModal } from './AgentTestCall'
import { Icon } from './Icon'

type Step = 'consent' | 'welcome' | 'try-agent' | 'next-steps'
const ALL_STEPS: Step[] = ['consent', 'welcome', 'try-agent', 'next-steps']

const NEXT_STEPS = [
  { to: '/dashboard/agents', icon: 'smart_toy', label: 'Customize your agent', hint: 'Persona, voice, language, and knowledge.' },
  { to: '/dashboard/numbers', icon: 'dialpad', label: 'Add a phone number', hint: 'Route real inbound calls to your agent.' },
  { to: '/dashboard/knowledge', icon: 'menu_book', label: 'Upload a knowledge base', hint: 'Ground answers in your own docs.' },
]

/** One-time first-run modal, shown once per account right after signup
 * (password or OAuth) until dismissed - DashboardLayout only mounts this
 * while user.onboarded is false, and finishing calls /onboarding/complete
 * so it never shows again. */
export function OnboardingModal() {
  const { user, setUser } = useAuth()
  // Skip the consent step entirely once accepted, rather than showing and
  // auto-advancing past it - a returning user re-triggering this modal
  // (e.g. the dismiss-call-failed fallback in finish() below) should never
  // see a "consent" screen with nothing left to consent to.
  const needsConsent = !!user && !user.consent.accepted
  const STEPS = needsConsent ? ALL_STEPS : ALL_STEPS.filter((s) => s !== 'consent')
  const [step, setStep] = useState<Step>(needsConsent ? 'consent' : 'welcome')
  const [consentChecked, setConsentChecked] = useState(false)
  const [workspaceName, setWorkspaceName] = useState(user?.accountName ?? '')
  const [saving, setSaving] = useState(false)
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [showTestCall, setShowTestCall] = useState(false)

  const finishConsent = async () => {
    if (!user || !consentChecked) return
    setSaving(true)
    try {
      const { user: updated } = await apiAcceptConsent(user.consent.currentVersion)
      setUser(updated)
      setStep('welcome')
    } catch {
      // A version mismatch (409) or transient failure shouldn't strand the
      // user with no way forward - let them retry the checkbox rather than
      // silently skip consent (unlike the best-effort fallbacks below, this
      // one is not optional, so no catch-and-continue here).
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchAgents()
      .then((agents) => setAgent(agents[0] ?? null))
      .catch(() => setAgent(null))
  }, [])

  if (!user) return null

  const finishWelcome = async () => {
    setSaving(true)
    try {
      const trimmed = workspaceName.trim()
      if (trimmed && trimmed !== user.accountName) {
        await apiUpdateAccount(trimmed)
      }
      setStep('try-agent')
    } catch {
      // Workspace rename failing shouldn't block onboarding - worth fixing
      // later from Settings, not worth stalling a first-run flow over.
      setStep('try-agent')
    } finally {
      setSaving(false)
    }
  }

  const finish = async () => {
    setSaving(true)
    try {
      const { user: updated } = await apiCompleteOnboarding()
      setUser(updated)
    } catch {
      // Even if the dismiss call fails, don't trap the user behind the
      // modal - they can always re-trigger it by reloading, and every
      // action underneath (agents, numbers, KB) already works standalone.
      setUser({ ...user, onboarded: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6">
        <div className="mb-5 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= STEPS.indexOf(step) ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        {step === 'consent' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Before you start</h2>
              <p className="mt-1 text-sm text-text-muted">
                Quick one - please review and accept to continue.
              </p>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-high/40 p-3 text-xs leading-relaxed text-text-muted">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="font-semibold text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="font-semibold text-primary hover:underline">
                  Privacy Policy
                </Link>
                , including that calls placed or received through this platform may be transcribed and
                recorded to provide and improve the service.
              </span>
            </label>
            <button
              onClick={finishConsent}
              disabled={saving || !consentChecked}
              className="mt-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Agree and continue'}
            </button>
          </div>
        )}

        {step === 'welcome' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Welcome to Vistrow Voice</h2>
              <p className="mt-1 text-sm text-text-muted">
                Let's get your workspace set up - this takes about a minute.
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Workspace name</span>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Acme Realty"
                className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <span className="text-[10px] text-text-muted">Shown across your dashboard - change it anytime in Settings.</span>
            </label>
            <button
              onClick={finishWelcome}
              disabled={saving || !workspaceName.trim()}
              className="mt-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'try-agent' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Meet {agent?.name || 'your agent'}</h2>
              <p className="mt-1 text-sm text-text-muted">
                Every new workspace starts with one ready-to-call agent. Try it right now in your browser -
                no phone number needed yet.
              </p>
            </div>
            <button
              onClick={() => setShowTestCall(true)}
              disabled={!agent}
              className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <Icon name="mic" className="text-[18px]" />
              Talk to {agent?.name || 'your agent'} now
            </button>
            <button
              onClick={() => setStep('next-steps')}
              className="text-xs font-semibold text-text-muted hover:text-text"
            >
              Skip for now →
            </button>
          </div>
        )}

        {step === 'next-steps' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">You're all set</h2>
              <p className="mt-1 text-sm text-text-muted">Here's what most teams do next:</p>
            </div>
            <div className="flex flex-col gap-2">
              {NEXT_STEPS.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  onClick={finish}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-high p-3 transition-colors hover:border-primary"
                >
                  <Icon name={s.icon} className="text-[20px] text-primary" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{s.label}</span>
                    <span className="block text-xs text-text-muted">{s.hint}</span>
                  </span>
                  <Icon name="arrow_forward" className="text-[16px] text-text-muted" />
                </Link>
              ))}
            </div>
            <button
              onClick={finish}
              disabled={saving}
              className="mt-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Finishing…' : 'Get started'}
            </button>
          </div>
        )}
      </div>

      {showTestCall && agent && <BrowserTestModal agent={agent} onClose={() => setShowTestCall(false)} />}
    </div>
  )
}
