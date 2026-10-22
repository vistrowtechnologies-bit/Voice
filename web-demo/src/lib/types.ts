export interface SiteVisit {
  property_id?: string
  date: string
  time: string
}

export interface LeadSummary {
  name?: string
  phone?: string
  budget?: string
  location?: string
  timeline?: string
  company?: string
  useCase?: string
  teamSize?: string
  siteVisit?: SiteVisit
}

export interface TranscriptEntry {
  id: string
  identity: string
  text: string
  isLocal: boolean
}

// Only statuses we can actually derive from a completed call row (calls.db).
export type LeadStatus = 'New' | 'Qualified' | 'Appointment Booked'
export type CallStatus = 'completed' | 'failed'
export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface LeadTranscriptLine {
  speaker: 'agent' | 'visitor'
  text: string
}

export interface CallDiagnosticEvent {
  id: string
  kind: string
  stage: string
  label: string
  status: 'info' | 'ok' | 'warning' | 'error'
  offsetMs: number
  durationMs?: number
}

export interface CallRecord {
  id: string
  name: string
  initials: string
  phone: string
  email: string
  budget: string
  location: string
  timeline: string
  company: string
  useCase: string
  teamSize: string
  status: LeadStatus
  callStatus: CallStatus
  sentiment: Sentiment
  channel: string
  callType: 'phone' | 'widget' | 'browser'
  // A call the operator placed themselves from the dashboard's Test Call
  // buttons. Listed like any other call, but labelled, and never billed.
  isDashboardTest?: boolean
  // Typed widget chat: no audio exists, so there is never a recording.
  isTextChat?: boolean
  direction: 'inbound' | 'outbound' | null
  website: string
  agent: string
  callDate: string
  durationSeconds: number | null
  replyLanguage: string | null
  siteVisit: SiteVisit | null
  transcript?: LeadTranscriptLine[]
  intelligence?: {
    summary: string
    sentiment: 'positive' | 'neutral' | 'negative'
    outcome: string
    qa_score: number
    disqualification_reason: string
    key_points: string[]
    action_items: string[]
  } | null
  // Per-call ArthaLeads delivery outcome - null means never attempted (the
  // call wasn't marked qualified, or nothing was connected at call time),
  // not the same as "failed". Separate from the integration's own
  // last_sync/last_error, which only reflect the most recent attempt
  // across every call.
  arthaleadsStatus: 'sent' | 'failed' | 'skipped' | null
  arthaleadsSyncedAt: string | null
  arthaleadsError: string | null
  // Never the raw storage key - just whether a recording exists. Fetch a
  // playback URL on demand via fetchCallRecordingUrl.
  hasRecording: boolean
  // What became of the audio: only 'failed' needs attention (the audio was lost);
  // 'discarded' = spoken consent declined, 'not_configured' = no storage set up.
  recordingStatus?: '' | 'saved' | 'failed' | 'discarded' | 'not_configured' | 'skipped_storage_full' | 'deleted'
  feedback: 'helpful' | 'not_helpful' | null
  feedbackComment: string | null
  connectLatencyMs: number | null
  agentJoinLatencyMs: number | null
  firstResponseLatencyMs: number | null
  // Per-turn timings the call agent stores (latency_metrics_json), e.g.
  // callerStopToFirstAudioMs: one value per caller turn, on every model.
  latencyMetrics?: { callerStopToFirstAudioMs?: number[] } & Record<string, unknown>
  // Browser-reported, widget calls only. For why a call of ANY channel
  // ended, use disconnectReason below.
  failureReason: string | null
  // LiveKit's CloseReason for this session. '' on calls recorded before the
  // column existed, so treat empty as "not recorded" rather than "unknown".
  disconnectReason: string
  // Widget calls only: location.pathname the visitor was on when they
  // opened the call. '' for phone/browser calls, or widget calls that
  // predate this column.
  pagePath: string
  // Operator-defined fields (agent.postCallFields) the post-call LLM pass
  // pulled from this specific call's transcript - the generic, per-business
  // extraction system underneath the fixed budget/location/timeline and
  // company/useCase/teamSize fields above. {} when the agent has no custom
  // fields configured, or extraction found nothing.
  extractedData: Record<string, string>
  // Only present on the single-call detail fetch (getCall), not list_calls -
  // computed from today's credit rates, so it reflects current pricing even
  // for an old call rather than what was charged at the time.
  creditsUsed?: number
  creditsPerMinute?: number
  voiceTier?: 'economy' | 'standard' | 'premium'
  modelTier?: 'standard' | 'premium' | 'premium_plus' | 'realtime_plus'
  // Present on the single-call detail response. `diagnosticsCaptured` is
  // false for historical calls whose limited milestones are reconstructed
  // only from the older measured latency columns.
  diagnosticEvents?: CallDiagnosticEvent[]
  diagnosticsCaptured?: boolean
  testRunId: string
  testScenarioId: number | null
  testScenarioKey: string
  testScenarioName: string
}

export type Lead = CallRecord

export interface TestScenario {
  id: number
  agentId: number | null
  name: string
  category: string
  description: string
  callerBrief: string
  expectedBehaviors: string[]
  createdAt: string
  updatedAt: string
}

// Native appointment/booking system - replaces Google Calendar/Cal.com.
export type AppointmentStatus = 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show'

export interface Appointment {
  id: number
  agentId: number | null
  callId: number | null
  name: string
  phone: string
  email: string
  purpose: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  durationMinutes: number
  status: AppointmentStatus
  source: 'agent' | 'manual'
  notes: string
  rescheduledFromId: number | null
  createdAt: string
  updatedAt: string
}

export interface AvailabilityConfig {
  timezone: string
  slot_minutes: number
  hours: Record<string, { open: string; close: string } | null>
  blackout_dates: string[]
}

export interface ActiveCallInfo {
  room: string
  visitor_identity: string
  state: string
  joined_at_ms: number
}

export interface DashboardSummary {
  totalCalls: number
  qualifiedCalls: number
  siteVisits: number
  qualifiedRatio: number
  conversionRatio: number
  totalMinutes: number
  avgDurationSeconds: number
  activeAgents: number
}

export interface LaunchReadiness {
  checks: { key: string; label: string; complete: boolean; to: string }[]
  completed: number
  total: number
  agents: { id: number; name: string; ready: boolean; checks: Record<string, boolean> }[]
}

export interface FeedbackSummary {
  helpful: number
  notHelpful: number
  total: number
  helpfulPercent: number | null
  firstResponseP50Ms: number | null
  firstResponseP95Ms: number | null
}

export interface UsageTrends {
  labels: string[]
  calls: number[]
  qualified: number[]
  minutes: number[]
}

export interface DashboardPeriodSnapshot {
  calls: number
  qualified: number
  booked: number
  minutes: number
  qualificationRate: number
  bookingRate: number
}

/** GET /dashboard/speed-to-lead: seconds from a lead reaching us to its first call. */
export interface SpeedToLead {
  days: number
  received: number
  called: number
  notCalled: number
  medianSeconds: number | null
  p90Seconds: number | null
  withinMinutePct: number | null
}

/** GET /dashboard/insights (Growth and Scale): the Analytics tab's business view. */
export interface InsightCall { id: number; title: string; qaScore: number; summary: string; durationSeconds: number; hasRecording: boolean; at: string | null }
export interface GrowthInsights {
  days: number
  pipeline: { qualifiedLeads: number; withBudget: number; totalInr: number; bookedLeads: number; bookedInr: number }
  ads: { ad: string; leads: number; called: number; qualified: number; booked: number }[]
  languages: { language: string; calls: number; qualified: number; avgSeconds: number }[]
  bestCall: InsightCall | null
  worstCall: InsightCall | null
  scoredCalls: number
}

export type MissedMoneyKind = 'uncalled_lead' | 'overdue_follow_up' | 'dropped_call' | 'upcoming_follow_up'

/** GET /dashboard/missed-money: people worth calling now, most urgent first. */
export interface MissedMoneyQueue {
  items: { kind: MissedMoneyKind; title: string; detail: string; at: string | null; contactId: number | null; callId: number | null; name: string; phone: string }[]
  counts: Record<MissedMoneyKind, number>
  toCall: number
}

export interface DashboardPeriodComparison {
  days: number
  /** Present when an exact range was asked for: the range and the one compared with it. */
  start?: string
  end?: string
  previousStart?: string
  previousEnd?: string
  current: DashboardPeriodSnapshot
  previous: DashboardPeriodSnapshot
  change: Record<'calls' | 'qualified' | 'booked' | 'minutes', number | null>
}

export interface ChannelStats {
  channel: string
  calls: number
  qualified: number
  minutes: number
}

export interface AgentStats {
  agent: string
  calls: number
  qualified: number
  minutes: number
}

export interface Analytics {
  languages: { language: string; count: number }[]
  peakHours: { hour: number; count: number }[]
  durationTrend: { day: string; avgSeconds: number }[]
  sentiment: Record<Sentiment, number>
  byChannel: ChannelStats[]
  byAgent: AgentStats[]
  funnel: { answered: number; engaged: number; qualified: number; visitBooked: number }
}

export interface CustomFunctionParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
}

export interface CustomFunction {
  name: string
  description: string
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: Record<string, string>
  parameters: CustomFunctionParam[]
}

export interface PostCallField {
  key: string
  type: 'string' | 'number' | 'boolean'
  description: string
}

/** Per-agent follow-up rules (agents.follow_up_policy) - the "Follow-ups"
 * panel. Retries by outcome and max tries drive the instant ArthaLeads
 * campaign and the agent's scheduled follow-up calls (bulk campaigns keep
 * their own retry settings); the three toggles schedule a call after a
 * callback request, a site-visit booking, or an interested call. The server
 * fills every key with its default when the row has none
 * (server/retry_rules.py follow_up_policy). */
export interface FollowUpPolicy {
  maxAttempts: number
  busyMinutes: number
  switchedOffMinutes: number
  noAnswerMinutes: number
  voicemailMinutes: number
  callbackEnabled: boolean
  visitReminderEnabled: boolean
  /** 'HH:MM' account time, the day before the visit. */
  visitReminderTime: string
  nurtureEnabled: boolean
  nurtureDays: number
  /** 'HH:MM' account time of the nurture call (server and agent: PR #246). */
  nurtureTime: string
  /** Nurture sequence: days after the first interested call (server and
   * agent: claude/nurture-sequences). Strictly increasing, 1..60, max 5. */
  nurtureSteps: number[]
  /** When a step's retries run out with no answer, move on to the next step. */
  nurtureAdvanceOnNoAnswer: boolean
  /** Wait before the first automatic call to a new lead: 0, 30, 60, 120,
   * 300 or 600 seconds. A "Call now" request is never delayed. */
  firstCallDelaySeconds: number
}

export const FIRST_CALL_DELAY_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 0, label: 'Immediately' },
  { seconds: 30, label: 'After 30 seconds' },
  { seconds: 60, label: 'After 1 minute' },
  { seconds: 120, label: 'After 2 minutes' },
  { seconds: 300, label: 'After 5 minutes' },
  { seconds: 600, label: 'After 10 minutes' },
]

export const FOLLOW_UP_DEFAULTS: FollowUpPolicy = {
  maxAttempts: 3,
  busyMinutes: 10,
  switchedOffMinutes: 120,
  noAnswerMinutes: 30,
  voicemailMinutes: 120,
  callbackEnabled: true,
  visitReminderEnabled: true,
  visitReminderTime: '11:00',
  nurtureEnabled: true,
  nurtureDays: 3,
  nurtureTime: '11:00',
  nurtureSteps: [2, 5, 10],
  nurtureAdvanceOnNoAnswer: true,
  firstCallDelaySeconds: 0,
}

export interface AgentVariable {
  /** The exact text between {{ and }} - "enquiry_bhk", or an operator's
   * own choice of "custom.enquiry_bhk" to also match a CSV column of that
   * name (see agent/main.py's _substitute_template_vars). */
  name: string
  /** Spoken/used only when the real per-call data has nothing for this
   * name - never overrides a genuine CRM/CSV value. */
  defaultValue: string
}

/** Per-agent call counts for the Agents page (GET /agents/activity). */
export interface AgentActivity {
  agentId: number
  today: number
  /** Calls per day for the last 7 days, oldest first, today last. */
  daily: number[]
  booked7: number
  lastCallAt: string | null
}

export interface AgentConfig {
  id: number
  // 10-digit Agent ID for mapping in ArthaLeads and other platforms.
  publicId?: string
  name: string
  description: string
  model: string
  voice: string
  // Display name for `voice`, resolved server-side from the catalog. Never
  // the raw vendor string — see calls_db._agent_dict.
  voiceName?: string
  /** Speech recognition engine. Independent from the LLM and speaking voice. */
  sttProvider: 'sarvam' | 'google-chirp3'
  language: string
  status: 'live' | 'paused'
  systemPrompt: string
  kbId: number | null
  tone: 'professional' | 'balanced' | 'casual'
  emotionIntensity: 'off' | 'subtle' | 'strong'
  // 'on' is legacy (predates the picker) and means the same as 'office'.
  ambientNoise: 'off' | 'on' | 'office' | 'city' | 'call_center' | 'keyboard_typing' | 'keyboard_typing2' | 'forest' | 'hold_music'
  /** 0.0-1.0. Only meaningful when ambientNoise isn't 'off'. */
  ambientVolume: number
  isPlatformDemo: boolean
  // Conversation start
  firstSpeaker: 'agent' | 'user'
  welcomeMessage: string
  // Opening used only when WE placed the call. One agent serves both
  // directions; the outbound opener asks permission before it pitches.
  // Blank falls back to welcomeMessage.
  welcomeMessageOutbound?: string
  /** '' = channel default, 'off' = none, 'general' = wideband filter on phone calls too. */
  noiseCancellation?: string
  // Speech / turn-taking
  interruptionSensitivity: number
  silenceReminderMs: number
  silenceReminderMax: number
  endCallOnSilenceMs: number
  // Call limits
  maxCallDurationS: number
  // Functions
  enabledFunctions: string
  transferPhone: string
  emergencyFallbackNumber: string
  customFunctions: CustomFunction[]
  // Post-call + integrations
  postCallFields: PostCallField[]
  webhookUrl: string
  // Connected integration keys this agent fans out to (empty = all connected)
  crmIntegrationKeys: string[]
  variables: AgentVariable[]
  // Optional only so partially-built agent objects elsewhere still type-check;
  // the API always returns it complete.
  followUpPolicy?: FollowUpPolicy
  memoryEnabled: boolean
  liveCatalogEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** "Build with AI" draft - exactly the keys server/agent_builder.py returns,
 * already validated, saved as-is through POST then PATCH /agents. */
export type AgentDraft = Pick<
  AgentConfig,
  | 'name' | 'description' | 'model' | 'language' | 'voice' | 'tone' | 'firstSpeaker'
  | 'welcomeMessage' | 'systemPrompt' | 'enabledFunctions' | 'maxCallDurationS' | 'postCallFields'
> & { businessName: string; welcomeMessageOutbound: string }

export type AgentDraftSection = 'basics' | 'voice' | 'instructions' | 'conversation' | 'after'

export interface AgentDraftQuestion {
  id: string
  question: string
  options: string[]
}

export interface Contact {
  id: number
  name: string
  phone: string
  email: string
  company: string
  customFields: Record<string, string>
  status: string
  tags: string[]
  source: string
  lastCalledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ContactNote {
  id: number
  body: string
  createdBy: string
  createdAt: string
}

export interface ContactCallSummary {
  id: number
  startedAt: string
  durationSeconds: number
  callType: string
}

export interface ContactCampaignMembership {
  campaignId: number
  campaignName: string
  campaignStatus: string
  contactStatus: string
  outcome: string
  attempts: number
}

export interface ContactDetail extends Contact {
  callStats: {
    total: number
    completed: number
    noAnswer: number
    failed: number
    voicemail: number
    avgDurationSeconds: number
    totalDurationSeconds: number
  }
  calls: ContactCallSummary[]
  campaigns: ContactCampaignMembership[]
  notes: ContactNote[]
}

export interface CsvPreview {
  headers: string[]
  sampleRows: string[][]
}

export interface KnowledgeSource {
  id: number
  name: string
  type: string
  sizeChars: number
  createdAt: string
}

export interface KbQaPair {
  id: number
  question: string
  answer: string
}

// A draft pair from auto-extract - not saved yet, no id.
export interface QaDraft {
  question: string
  answer: string
}

// Optional live-catalog items synced from the tenant's own website feed. Deliberately
// separate from the knowledge base: KB text is stuffed into every system
// prompt under an 8k cap, so a growing catalogue would silently truncate.
// These reach the agent as a short index plus an on-demand lookup tool.
export interface ProjectListing {
  slug: string
  title: string
  developer: string
  location: string
  category: string
  status: string
  config: string
  area: string
  rera: string
  priceFrom: number | null
  priceLabel: string
  units: { type: string; area: string; price: string }[]
  url: string
  syncedAt: string
}

export interface ProjectListingsResponse {
  feedUrl: string
  listings: ProjectListing[]
}

export interface KnowledgeBase {
  id: number
  name: string
  strict: boolean
  createdAt: string
  sources: KnowledgeSource[]
  qa: KbQaPair[]
}

export interface InboundRoute {
  id: number
  phone_number: string | null
  agent_id: number | null
  timezone: string
  max_concurrent: number
  start_date: string | null
  end_date: string | null
  window_start: string | null
  window_end: string | null
  active_days: string
  status: string
  created_at: string
}

export interface CampaignStats {
  pending: number
  calling: number
  done: number
  no_answer: number
  failed: number
  blocked: number
  voicemail: number
  total: number
}

export interface CampaignContact {
  id: number
  name: string
  phone: string
  status: string
  attempts: number
  last_attempt_at: string | null
  outcome: string
  call_id: number | null
}

export interface Campaign {
  id: number
  name: string
  agent_id: number | null
  from_number: string
  contact_tag: string
  scheduled_date: string | null
  max_attempts: number
  retry_minutes: number
  concurrency: number
  status: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  stats: CampaignStats
  contacts?: CampaignContact[]
}

// ArthaLeads single-token handshake outcome; set by the server, never by the browser.
export interface IntegrationLink {
  status: 'linked' | 'pending' | 'rejected'
  org_name?: string
  linked_at?: string
  checked_at?: string
  error?: string
}

export interface Integration {
  key: string
  name: string
  category: string
  description: string
  status: 'connected' | 'not_connected'
  // Mostly strings (url, channel, google_email...), plus `events` (string[])
  // and the Sheets sheet_id (number). Tokens are redacted server-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any> & { link?: IntegrationLink }
  lastSync: string | null
  lastError: string | null
  // True for integrations switched off for new connections (Facebook Lead
  // Ads, WhatsApp): shown as "Coming soon" unless already connected.
  newConnectionsUnavailable?: boolean
}

/** One plan as the server sells it (agent/plan_policy.py public_plans). Prices INR,
 * GST extra; minutes are standard minutes (1 credit = 1 standard minute). */
export interface PublicPlan {
  plan: 'starter' | 'growth' | 'scale'
  monthlyPrice: number
  annualPrice: number
  monthlyMinutes: number
  annualMinutesPerMonth: number
  annualMinutesPerYear: number
  overagePerMinute: number
  clonedVoicesIncluded: number | null
  agents: number
  concurrentCalls: number
  knowledgeBases: number
  storageGb: number
}

export interface BillingSummary {
  // Minute pricing (17 Oct): "standard_minute" = 1 credit is 1 standard minute.
  creditUnit?: string
  liveMinutesPerMinute?: number
  planAnnualPriceInr?: number | null
  plans?: PublicPlan[]
  creditsTotal: number
  creditsUsed: number
  creditsRemaining: number
  minutesUsed: number
  minutesByType: Partial<Record<'browser' | 'widget' | 'phone', number>>
  creditRates: Partial<Record<'browser' | 'widget' | 'phone', number>>
  minutesByVoiceTier: Partial<Record<'economy' | 'standard' | 'premium', number>>
  voiceTierRates: Partial<Record<'economy' | 'standard' | 'premium', number>>
  modelTierRates?: Partial<Record<'standard' | 'premium' | 'premium_plus' | 'realtime_plus', number>>
  plan: string
  planPriceInr: number
  subscriptionStatus: 'inactive' | 'created' | 'active' | 'cancelled' | string
  /** A cancellation is scheduled: the plan runs to currentPeriodEnd and then does not renew. */
  cancelAtPeriodEnd?: boolean
  /** Why the owner cancelled (empty unless a cancellation is pending). */
  cancelReason?: string
  billingCycle: 'monthly' | 'annual'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  overageCredits: number
  overageRateInr: number
  overageAmountInr: number
  phoneNumberCount: number
  phoneNumberFeesInr: number
  estimatedNextInvoiceInr: number
}

export interface UsageBucket {
  key: string
  label: string
  minutes: number
  calls: number
  credits: number
}

/** GET /usage - the Usage page. Priced per call by the same formula as BillingSummary. */
export interface UsageReport {
  range: { from: string; to: string; tz: string }
  totals: { credits: number; minutes: number; calls: number; avgCreditsPerMinute: number; testOverageCredits: number }
  balance: { creditsTotal: number; creditsUsedCycle: number; creditsRemaining: number; estDaysLeft: number | null }
  daily: { date: string; credits: number; minutes: number; calls: number }[]
  byChannel: UsageBucket[]
  byAgent: UsageBucket[]
  byVoiceTier: UsageBucket[]
  byModelTier: UsageBucket[]
  byDirection: UsageBucket[]
  byNumber: UsageBucket[]
  topCalls: { id: string; startedAt: string; agentName: string; channel: string; minutes: number; credits: number; callerName: string }[]
  cycle: { start: string; end: string | null; allowance: number }
}

export interface Subscription {
  account_id: number
  plan: string
  billing_cycle: string
  razorpay_customer_id: string | null
  razorpay_subscription_id: string | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
}

export interface Invoice {
  id: number
  account_id: number
  kind: 'subscription' | 'overage' | 'topup' | 'phone_number'
  amount_inr: number
  gst_inr: number
  status: string
  period_start: string | null
  period_end: string | null
  credits: number | null
  /** Top-up pack bonus, granted on top of credits but not invoiced. */
  bonus_credits?: number
  notes: string
  created_at: string
  paid_at: string | null
  /** GST invoice number, given to a paid invoice (VV/2026-27/00001). */
  invoice_number?: string | null
}

/** POST /billing/topup - what Razorpay Checkout opens against. */
export interface TopupSession {
  razorpayKeyId: string
  orderId: string
  amountInr: number
  baseInr: number
  gstInr: number
  credits: number
  bonusCredits: number
  prefill: { name: string; email: string }
}

/** POST /billing/verify-payment - credits is base + bonus; alreadyApplied when the webhook won the race. */
export interface TopupResult {
  ok: boolean
  credits?: number
  alreadyApplied?: boolean
  creditsRemaining: number
  invoiceId: number
}

/** GET /billing/topups */
export interface TelephonyStatus {
  provider: string
  connected: boolean
  appIdHint: string
}

export interface PhoneNumber {
  id: number
  number: string
  label: string
  provider: string
  agentId: number | null
  status: string
  createdAt: string
}

export interface Site {
  id: number
  name: string
  siteKey: string
  allowedDomain: string
  agentId: number | null
  status: string
  widgetPosition: 'bottom-right' | 'bottom-left'
  widgetLabel: string
  widgetAvatar: string
  widgetGreeting: string
  widgetMode: 'voice' | 'chat' | 'both'
  widgetAskName: boolean
  widgetRequireName: boolean
  widgetAskPhone: boolean
  widgetRequirePhone: boolean
  widgetAskEmail: boolean
  widgetRequireEmail: boolean
  createdAt: string
}

export interface SiteSeenPath {
  path: string
  title: string
  source: 'seen' | 'wp'
}

export interface SitePageRoute {
  id: number
  siteId: number
  pathPattern: string
  agentId: number | null
  greetingOverride: string
  avatarOverride: string
  position: number
  createdAt: string
}

export interface WidgetAvatarOption {
  key: string
  label: string
  // True when the avatar has a video loop (artha.mp4 today). The picker
  // shows the moving version so the swatch matches the live call button.
  hasVideo?: boolean
}

export interface HelpFaq {
  question: string
  answer: string
}

export interface HelpChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestTicket?: boolean
  comingSoon?: boolean
  /** A help-centre article the bot answered from (only real slugs). */
  article?: { slug: string; title: string } | null
  /** A write the copilot proposed; runs only after POST /help/chat/confirm. */
  pendingAction?: CopilotPendingAction | null
  /** The user asked for a change their plan doesn't include. */
  upgrade?: boolean
  /** Plain lines for the lookups the copilot ran ("Looked at your agents"). */
  steps?: string[]
}

export interface CopilotPendingAction {
  token: string
  label: string
  tool: string
}

export type CopilotActionStatus = 'proposed' | 'confirmed' | 'cancelled' | 'failed' | 'expired'

export interface CopilotAction {
  id: number
  userId: number | null
  userName?: string
  tool: string
  args: Record<string, unknown>
  label: string
  status: CopilotActionStatus
  result: string
  createdAt: string
  decidedAt: string | null
}

/** read: every GET · calls: calls, campaigns, contacts, appointments ·
 *  agents: agents and knowledge bases · full: everything but account control. */
export type ApiKeyScope = 'read' | 'calls' | 'agents' | 'full'

export interface ApiKey {
  id: number
  name: string
  prefix: string
  scopes: ApiKeyScope[]
  lastUsedAt: string | null
  createdAt: string
}

export type VoiceTier = 'premium' | 'standard' | 'lite'

// One voice as returned by the /voices API - a catalog entry annotated for the
// current account (whether it's in their menu, addable on their plan, etc.).
export interface VoiceEntry {
  value: string
  name: string
  gender: 'male' | 'female' | 'neutral'
  note: string
  tier: VoiceTier
  tierLabel: string
  tierNote: string
  tierRank: number
  addable: boolean
  lockedReason: string
  // When set, previews of this voice always use this language regardless of
  // the picker's own language toggle (e.g. an English-accent voice should
  // always be auditioned in English, not the default Hindi sample line).
  forceLang: string
  // True when one voice persona can retain its identity while the call
  // switches between supported languages.
  multilingual: boolean
  // Test-only preview model; shown separately from stable production voices.
  preview: boolean
  // Which languages this voice can actually speak, and whether it can follow
  // a caller who switches language mid-sentence. A Google locale voice
  // ("Aditi (Hindi)") speaks exactly one and cannot switch - the single most
  // consequential thing about picking it, and previously invisible here.
  languages: string[]
  languageLabels: string[]
  // Authoritative total from the engine's own docs. Can exceed
  // languageLabels.length, which only holds the locales we name explicitly.
  languageCount: number
  canSwitchLanguage: boolean
  // Sarvam v4: the language Sarvam tuned the voice to sound native in
  // ("hi" / "Hindi"). Empty for other voices.
  nativeLang?: string
  nativeLanguage?: string
  selected?: boolean
}

export interface VoiceCatalog {
  voices: VoiceEntry[]
  selectedCount: number
  // Audition line per preview language and speaker gender (Hindi marks gender).
  sampleTexts?: Record<string, { female?: string | null; male?: string | null }>
}

// One item in the derived attention feed (GET /notifications). Computed
// server-side from live data on every read rather than stored, so an item
// vanishes on its own once the underlying problem is fixed. `id` is stable
// and content-derived: a new occurrence yields a new id, so a previously
// dismissed condition re-notifies instead of staying silent.
export interface AppNotification {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  body: string
  to: string
  at: string | null
  /** Activity items ('call', 'appointment') get their own icon; attention items leave it unset. */
  kind?: 'call' | 'appointment'
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketCategory = 'general' | 'technical' | 'billing' | 'feature' | 'account'

export interface SupportTicketFile {
  id: string
  filename: string
  contentType: string
  size: number
  /** False when storage wasn't configured: the file went by email only. */
  downloadable: boolean
  /** Deleted from storage 14 days after the ticket was solved. */
  purged?: boolean
}

export interface SupportTicketMessage {
  id: number
  /** 'note' = the support team's private note; only the admin inbox sees these. */
  authorType: 'customer' | 'support' | 'note'
  authorName: string
  body: string
  createdAt: string
  attachments: SupportTicketFile[]
}

export interface SupportTicket {
  id: number
  /** "VV-12" — the number quoted in emails. */
  ref: string
  accountId: number
  accountName: string
  userEmail: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  subject: string
  detail: string
  currentPage: string
  attachments: SupportTicketFile[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messageCount: number
  lastAuthor: 'customer' | 'support'
  rating: 'good' | 'bad' | null
  ratingComment: string
  firstResponseAt: string | null
  assignedUserId: number | null
  assigneeName: string
  messages?: SupportTicketMessage[]
}

export interface HelpArticle {
  slug: string
  title: string
  summary: string
  body: string
  /** A how-to video in lib/helpVideos.ts, shown above the article. */
  video?: string
}

export interface HelpTopic {
  slug: string
  title: string
  icon: string
  /** The dashboard page this topic explains. */
  route: string
  articles: HelpArticle[]
}

export interface HelpSearchHit {
  slug: string
  title: string
  summary: string
  topicSlug: string
  topicTitle: string
}
