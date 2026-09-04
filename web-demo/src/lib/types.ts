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
  arthaleadsStatus: 'sent' | 'failed' | null
  arthaleadsSyncedAt: string | null
  arthaleadsError: string | null
  // Never the raw storage key - just whether a recording exists. Fetch a
  // playback URL on demand via fetchCallRecordingUrl.
  hasRecording: boolean
  feedback: 'helpful' | 'not_helpful' | null
  feedbackComment: string | null
  connectLatencyMs: number | null
  agentJoinLatencyMs: number | null
  firstResponseLatencyMs: number | null
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
  modelTier?: 'standard' | 'premium' | 'premium_plus'
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

export interface DashboardPeriodComparison {
  days: number
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

export interface AgentConfig {
  id: number
  name: string
  description: string
  model: string
  voice: string
  language: string
  status: 'live' | 'paused'
  systemPrompt: string
  kbId: number | null
  tone: 'professional' | 'balanced' | 'casual'
  emotionIntensity: 'off' | 'subtle' | 'strong'
  ambientNoise: 'off' | 'on'
  isPlatformDemo: boolean
  // Conversation start
  firstSpeaker: 'agent' | 'user'
  welcomeMessage: string
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
  memoryEnabled: boolean
  liveCatalogEnabled: boolean
  createdAt: string
  updatedAt: string
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

export interface Integration {
  key: string
  name: string
  category: string
  description: string
  status: 'connected' | 'not_connected'
  config: Record<string, string>
  lastSync: string | null
  lastError: string | null
}

export interface BillingSummary {
  creditsTotal: number
  creditsUsed: number
  creditsRemaining: number
  minutesUsed: number
  minutesByType: Partial<Record<'browser' | 'widget' | 'phone', number>>
  creditRates: Partial<Record<'browser' | 'widget' | 'phone', number>>
  minutesByVoiceTier: Partial<Record<'economy' | 'standard' | 'premium', number>>
  voiceTierRates: Partial<Record<'economy' | 'standard' | 'premium', number>>
  modelTierRates?: Partial<Record<'standard' | 'premium' | 'premium_plus', number>>
  plan: string
  planPriceInr: number
  subscriptionStatus: 'inactive' | 'created' | 'active' | 'cancelled' | string
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
  notes: string
  created_at: string
  paid_at: string | null
}

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
}

export interface HelpFaq {
  question: string
  answer: string
}

export interface HelpChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ApiKey {
  id: number
  name: string
  prefix: string
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
  selected?: boolean
}

export interface VoiceCatalog {
  voices: VoiceEntry[]
  selectedCount: number
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
}
