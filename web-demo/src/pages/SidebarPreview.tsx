import { AuthContext } from '../lib/auth'
import type { AuthState } from '../lib/auth'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'

const previewAuth: AuthState = {
  user: {
    id: 0,
    name: 'Local preview',
    email: 'preview@vistrowvoice.local',
    phone: '',
    timezone: 'Asia/Kolkata',
    role: 'owner',
    accountId: 0,
    accountName: 'Vistrow Voice',
    accountCountry: 'IN',
    plan: 'preview',
    isPlatformOwner: false,
    onboarded: true,
    consent: { accepted: true, version: 'preview', currentVersion: 'preview' },
    tourCompleted: true,
    impersonating: false,
    authProvider: 'preview',
    passwordSet: true,
    avatarUrl: '',
  },
  loading: false,
  login: async () => {},
  signup: async () => ({ ok: true, verificationRequired: true, email: '', emailSent: false, resendAfter: 0 }),
  logout: async () => {},
  refresh: async () => {},
  setUser: () => {},
}

/** Isolated, development-only route for responsive dashboard review without
 * logging in or calling production account APIs. All figures are sample data. */
export function SidebarPreview() {
  return (
    <AuthContext.Provider value={previewAuth}>
      <DashboardLayout>
        <PageHeader title="Dashboard" subtitle="Overview of your voice AI platform" />
        <main className="mx-auto w-full max-w-[1500px] p-5 sm:p-7 xl:p-9">
          <div className="mb-6 flex gap-6 border-b border-border text-sm font-medium"><span className="border-b-2 border-primary pb-3 text-text">Overview</span><span className="pb-3 text-text-muted">Analytics</span></div>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> SAMPLE DASHBOARD</div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Good morning, team</h2>
              <p className="mt-1.5 text-sm text-text-muted">Here’s what’s happening across your voice workspace.</p>
            </div>
            <button type="button" className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text shadow-sm"><Icon name="calendar_today" className="text-[17px] text-text-muted" /> Last 7 days <Icon name="keyboard_arrow_down" className="text-[18px] text-text-muted" /></button>
          </div>

          <section aria-label="Sample quick actions" className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">Quick actions</h3>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
              {[
                { icon: 'mic', label: 'Test an agent' },
                { icon: 'campaign', label: 'Start campaign' },
                { icon: 'person_add', label: 'Add contact' },
                { icon: 'event', label: 'New appointment' },
                { icon: 'extension', label: 'Connect app' },
                { icon: 'widgets', label: 'Install widget' },
              ].map((action) => <div key={action.label} className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-border bg-surface p-3 text-sm font-semibold sm:p-4"><Icon name={action.icon} className="text-[22px] text-primary" /><span className="mt-4 flex items-end justify-between gap-1"><span className="min-w-0">{action.label}</span><Icon name="arrow_forward" className="shrink-0 text-[16px]" /></span></div>)}
            </div>
          </section>

          <section aria-label="Sample workspace metrics" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: 'Total conversations', value: '2,481', trend: '+12.8%', icon: 'forum', color: 'text-primary bg-primary/10' },
              { label: 'Calls handled', value: '1,906', trend: '+8.2%', icon: 'call', color: 'text-cyan bg-cyan/10' },
              { label: 'Appointments booked', value: '342', trend: '+18.4%', icon: 'event_available', color: 'text-emerald-600 bg-emerald-500/10' },
              { label: 'Active agents', value: '8', trend: 'All systems normal', icon: 'smart_toy', color: 'text-amber-600 bg-amber-500/10' },
            ].map((metric) => (
              <article key={metric.label} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-text-muted">{metric.label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.color}`}><Icon name={metric.icon} className="text-[19px]" /></span></div>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1"><p className="text-3xl font-bold tracking-tight tabular-nums">{metric.value}</p><span className={`text-xs font-semibold ${metric.label === 'Active agents' ? 'text-emerald-600' : 'text-emerald-600'}`}>{metric.trend}</span></div>
                <p className="mt-1 text-xs text-text-muted">vs. previous 7 days</p>
              </article>
            ))}
          </section>

          <section className="mt-5 grid gap-5 2xl:grid-cols-[1.5fr_1fr]">
            <article className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Conversation activity</h3><p className="mt-1 text-xs text-text-muted">Volume across your channels</p></div><button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5">View analytics <Icon name="arrow_forward" className="ml-1 align-middle text-[15px]" /></button></div>
              <div className="mt-7 flex h-48 items-end gap-2 border-b border-border px-1 sm:gap-4">
                {[42, 61, 50, 76, 58, 88, 69, 100, 73, 84, 63, 92, 70, 81].map((height, index) => <div key={index} className="group relative flex h-full flex-1 items-end"><div className="w-full rounded-t-md bg-primary/20 transition-colors group-hover:bg-primary/50" style={{ height: `${height}%` }} /></div>)}
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-text-muted"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
            </article>

            <article className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Recent activity</h3><p className="mt-1 text-xs text-text-muted">Latest updates from your workspace</p></div><button type="button" aria-label="More activity options" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-high"><Icon name="more_horiz" className="text-[20px]" /></button></div>
              <div className="mt-5 space-y-5">
                {[
                  { icon: 'event_available', tone: 'text-emerald-600 bg-emerald-500/10', title: 'Appointment booked', sub: 'Inbound agent · 4 minutes ago' },
                  { icon: 'call_received', tone: 'text-cyan bg-cyan/10', title: 'New conversation completed', sub: 'Website widget · 18 minutes ago' },
                  { icon: 'smart_toy', tone: 'text-primary bg-primary/10', title: 'Agent published', sub: 'Artha · Yesterday at 4:32 PM' },
                ].map((activity) => <div key={activity.title} className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activity.tone}`}><Icon name={activity.icon} className="text-[18px]" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{activity.title}</p><p className="mt-0.5 truncate text-xs text-text-muted">{activity.sub}</p></div><Icon name="chevron_right" className="text-[18px] text-text-muted" /></div>)}
              </div>
              <button type="button" className="mt-5 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-high">View all activity</button>
            </article>
          </section>

          <p className="mt-6 text-center text-[11px] text-text-muted">Local design preview · all dashboard figures and activity above are illustrative sample data.</p>
        </main>
      </DashboardLayout>
    </AuthContext.Provider>
  )
}
