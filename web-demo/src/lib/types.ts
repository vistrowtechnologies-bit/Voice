export interface SiteVisit {
  propertyId?: string
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
export type LeadStatus = 'New' | 'Qualified' | 'Site Visit Booked'
export type CallStatus = 'completed' | 'failed'
export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface LeadTranscriptLine {
  speaker: 'agent' | 'visitor'
  text: string
}

export interface CallRecord {
  id: string
  name: string
  initials: string
  phone: string
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
  website: string
  agent: string
  callDate: string
  durationSeconds: number | null
  replyLanguage: string | null
  siteVisit: { property_id?: string; date: string; time: string } | null
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
}

export type Lead = CallRecord

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

export interface UsageTrends {
  labels: string[]
  calls: number[]
  qualified: number[]
  minutes: number[]
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
  customFunctions: CustomFunction[]
  // Post-call + integrations
  postCallFields: PostCallField[]
  webhookUrl: string
  memoryEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: number
  name: string
  phone: string
  email: string
  status: string
  tags: string[]
  source: string
  lastCalledAt: string | null
  createdAt: string
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

// A draft pair from auto-extract — not saved yet, no id.
export interface QaDraft {
  question: string
  answer: string
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
  createdAt: string
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
