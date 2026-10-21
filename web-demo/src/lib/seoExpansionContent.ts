import type { Faq } from './marketingContent'

export interface CompareVendor {
  slug: string
  name: string
  category: string
  title: string
  description: string
  bestFor: string
  tradeoff: string
  buyerIntent: string
  rows: Array<{ dimension: string; vendor: string; vistrow: string }>
  faqs: Faq[]
  scenarios?: Array<{ title: string; body: string }>
  ask?: string[]
  steps?: string[]
  related?: Array<{ to: string; label: string }>
}

const BASE_COMPARE_VENDORS: CompareVendor[] = [
  {
    slug: 'exotel',
    name: 'Exotel',
    category: 'cloud telephony',
    title: 'Vistrow Voice vs Exotel | AI Voice Agent Comparison',
    description:
      'Compare Vistrow Voice with Exotel for teams evaluating AI voice agents, cloud telephony, inbound calls, outbound campaigns, transcripts, and CRM workflows.',
    bestFor: 'Teams that mainly need programmable cloud telephony, virtual numbers, call routing, SMS, and mature communications APIs.',
    tradeoff: 'If your real job is replacing repetitive conversations with a trained AI caller, you may still need to assemble the AI agent layer around telephony.',
    buyerIntent: 'Use this page when you are choosing between a communications platform and a voice-agent product for lead qualification or support calls.',
    rows: [
      { dimension: 'Primary job', vendor: 'Telephony infrastructure and customer communication workflows.', vistrow: 'AI agents that answer, qualify, summarize, and sync calls.' },
      { dimension: 'Agent setup', vendor: 'Often depends on how your team builds the call flow around the platform.', vistrow: 'No-code agent builder with prompt, voice, language, tools, and knowledge.' },
      { dimension: 'Website voice', vendor: 'Usually not the core buying reason.', vistrow: 'Built-in browser voice widget for website visitors.' },
      { dimension: 'Call record', vendor: 'Call logs and recordings depend on the configured setup.', vistrow: 'Recording, transcript, summary, lead fields, sentiment, and CRM status in one call view.' },
      { dimension: 'Where it fits', vendor: 'Ops teams with telephony-first requirements.', vistrow: 'Sales/support teams that want conversation automation first.' },
    ],
    faqs: [
      { q: 'Is Vistrow Voice a replacement for Exotel?', a: 'Not always. Exotel is commonly considered for telephony infrastructure. Vistrow Voice is built around AI conversations. Some teams may use telephony infrastructure underneath and Vistrow for the agent experience.' },
      { q: 'Which is better for real estate lead qualification?', a: 'If you want an AI agent to ask budget, location, timeline, answer project questions, and push a structured lead to CRM, Vistrow Voice is closer to that workflow out of the box.' },
      { q: 'Should I check Exotel pricing separately?', a: 'Yes. Vendor pricing and capabilities change, so always verify current plans directly before making a final decision.' },
    ],
  },
  {
    slug: 'knowlarity',
    name: 'Knowlarity',
    category: 'cloud telephony',
    title: 'Vistrow Voice vs Knowlarity | AI Calling Agent Comparison',
    description:
      'Compare Vistrow Voice with Knowlarity for businesses moving from cloud calling and IVR workflows to AI voice agents that qualify and summarize calls.',
    bestFor: 'Businesses looking for virtual numbers, IVR, call tracking, and cloud telephony workflows.',
    tradeoff: 'Conversation intelligence and autonomous qualification may need additional AI tooling depending on your setup.',
    buyerIntent: 'Useful if your team is asking whether to modernize a call center stack or deploy a voice agent for repetitive calls.',
    rows: [
      { dimension: 'Core use case', vendor: 'Business calling, IVR, tracking, and routing.', vistrow: 'AI-led inbound, outbound, and web conversations.' },
      { dimension: 'Caller experience', vendor: 'Structured call flows and routing logic.', vistrow: 'Natural spoken conversation with knowledge-grounded answers.' },
      { dimension: 'Languages', vendor: 'Depends on the call-flow/agent setup.', vistrow: 'More than 130 languages, including Hindi, English and 9 more Indian languages, with a default language per agent and mid-call switching.' },
      { dimension: 'CRM output', vendor: 'Depends on integration configuration.', vistrow: 'Lead fields, transcript, call outcome, and recording link are prepared for CRM sync.' },
      { dimension: 'Where it fits', vendor: 'Telephony-first teams.', vistrow: 'Teams that want the AI agent to do the first conversation.' },
    ],
    faqs: [
      { q: 'What is the main difference?', a: 'The key difference is buying intent: cloud telephony manages calls; Vistrow Voice manages AI conversations on calls.' },
      { q: 'Can Vistrow Voice handle phone and website conversations?', a: 'Yes. The same product supports phone calls and a browser voice widget, so website visitors can speak without dialing a number.' },
      { q: 'Can I keep my existing phone workflow?', a: 'Usually yes. The right architecture depends on your current number provider, routing, and compliance setup.' },
    ],
  },
  {
    slug: 'ozonetel',
    name: 'Ozonetel',
    category: 'contact center',
    title: 'Vistrow Voice vs Ozonetel | Voice AI and Contact Center Comparison',
    description:
      'Compare Vistrow Voice with Ozonetel for teams deciding between contact-center software and AI voice agents for qualification, support, and CRM-ready call records.',
    bestFor: 'Contact-center teams needing agent desktops, routing, queues, dialers, monitoring, and supervisor workflows.',
    tradeoff: 'If your goal is AI-first lead qualification or support automation, a contact-center suite may be broader than what you need.',
    buyerIntent: 'Use this if you are comparing a full contact-center platform with a specialized AI voice-agent layer.',
    rows: [
      { dimension: 'Product center', vendor: 'Contact-center operations and agent teams.', vistrow: 'AI agents doing repetitive conversations before human follow-up.' },
      { dimension: 'Human agent stack', vendor: 'Stronger fit when many human agents need dashboards and queues.', vistrow: 'Stronger fit when the AI should answer or qualify first.' },
      { dimension: 'Setup scope', vendor: 'Typically broader operational rollout.', vistrow: 'Focused agent creation, knowledge, call channels, and integrations.' },
      { dimension: 'Web widget', vendor: 'Not usually the core product story.', vistrow: 'Native website voice call widget.' },
      { dimension: 'Outcome record', vendor: 'Configured reporting and call records.', vistrow: 'Transcript, summary, fields, outcome, recording, and CRM push status around each call.' },
    ],
    faqs: [
      { q: 'Is Ozonetel more complete for call centers?', a: 'For large human-agent contact-center operations, a dedicated contact-center platform can be a better operational fit.' },
      { q: 'When is Vistrow Voice better?', a: 'When you want a voice AI agent to handle repetitive inbound, outbound, or website conversations and send the final result into your CRM.' },
      { q: 'Can both be used together?', a: 'Depending on routing and APIs, yes. Many teams separate telephony/contact-center infrastructure from the AI-agent layer.' },
    ],
  },
  {
    slug: 'sarvam-ai',
    name: 'Sarvam AI',
    category: 'speech and language AI',
    title: 'Vistrow Voice vs Sarvam AI | Build or Buy Voice Agents',
    description:
      'Compare Vistrow Voice with Sarvam AI for Indian-language voice agent teams deciding between raw speech/model capability and a ready customer-calling product.',
    bestFor: 'Engineering teams that want to build directly on Indian-language AI models, speech APIs, or agent infrastructure.',
    tradeoff: 'Building directly can be powerful, but you still own product UX, call logs, CRM sync, billing, monitoring, tenant controls, and support workflows.',
    buyerIntent: 'Use this page if you are asking whether to build your own voice-agent stack or buy a finished calling platform.',
    rows: [
      { dimension: 'What you buy', vendor: 'Model, speech, and/or agent capabilities for builders.', vistrow: 'Finished AI voice calling product for business users and operators.' },
      { dimension: 'Control', vendor: 'More low-level flexibility if your engineering team wants to assemble the stack.', vistrow: 'More product defaults: dashboard, calls, recordings, transcripts, integrations, widget.' },
      { dimension: 'Time to launch', vendor: 'Depends on your engineering build.', vistrow: 'Create an agent, connect knowledge/channel, test, and publish.' },
      { dimension: 'Cost control', vendor: 'Model/API costs depend on usage and architecture.', vistrow: 'Plans with usage visibility in the dashboard.' },
      { dimension: 'Where it fits', vendor: 'Teams building proprietary voice infrastructure.', vistrow: 'Teams that need working AI calls and CRM outcomes quickly.' },
    ],
    faqs: [
      { q: 'Is Sarvam AI a competitor or a provider?', a: 'It can be either depending on your architecture. Some teams evaluate model providers while also evaluating full products like Vistrow Voice.' },
      { q: 'Why would I choose Vistrow Voice instead of building?', a: 'Choose Vistrow if you want the product layer already handled: agent setup, widget, call history, transcripts, CRM status, analytics, billing, and tenant controls.' },
      { q: 'Should I compare latency on real calls?', a: 'Yes. Test phone and web calls with your target language, network, voice, STT, TTS, and LLM combination before choosing.' },
    ],
  },
  {
    slug: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'voice generation',
    title: 'Vistrow Voice vs ElevenLabs | TTS, Voice Quality, and AI Calls',
    description:
      'Compare Vistrow Voice with ElevenLabs for teams deciding between high-quality voice generation and a complete AI phone or website calling agent.',
    bestFor: 'Teams prioritizing expressive voice generation, voice libraries, dubbing, narration, or building their own voice experience.',
    tradeoff: 'A TTS provider alone is not the full calling system: you still need STT, LLM orchestration, telephony/web RTC, call records, and CRM workflows.',
    buyerIntent: 'Useful when buyers love a voice model but need to understand what else is required for production calls.',
    rows: [
      { dimension: 'Core value', vendor: 'Voice quality and speech generation.', vistrow: 'End-to-end AI calling workflow.' },
      { dimension: 'Stack required', vendor: 'Needs surrounding STT, LLM, transport, logging, and integrations for live calls.', vistrow: 'Bundles the call experience and operator dashboard.' },
      { dimension: 'Voice controls', vendor: 'Strong voice styling and generation options.', vistrow: 'Curated voices plus business call controls and records.' },
      { dimension: 'CRM sync', vendor: 'Requires implementation around the model/API.', vistrow: 'Built around sending qualified call outcomes to CRM/webhooks.' },
      { dimension: 'Where it fits', vendor: 'Voice-first media or custom engineering teams.', vistrow: 'Teams buying a business calling agent.' },
    ],
    faqs: [
      { q: 'Can Vistrow use ElevenLabs-style premium voices?', a: 'Vistrow Voice supports curated premium voice options where configured, but the product is focused on live business calls rather than standalone audio generation.' },
      { q: 'Why not just use a TTS API?', a: 'Because live calls need more than speech output: interruption handling, listening, latency control, transcripts, recordings, CRM sync, billing, and support tools.' },
      { q: 'What matters more: voice quality or latency?', a: 'Both matter. For live phone calls, a slightly less expressive but faster voice can outperform a beautiful voice that responds too slowly.' },
    ],
  },
  {
    slug: 'retell-ai',
    name: 'Retell AI',
    category: 'voice agent platform',
    title: 'Vistrow Voice vs Retell AI | AI Voice Agent Platform Comparison',
    description:
      'Compare Vistrow Voice with Retell AI for teams evaluating AI phone agents, web calling, Indian languages, CRM sync, and business-ready call workflows.',
    bestFor: 'Teams evaluating developer-friendly AI voice agent infrastructure and programmable voice workflows.',
    tradeoff: 'Global voice-agent platforms can be flexible, but Indian-language, CRM, and local workflow fit should be tested with real calls.',
    buyerIntent: 'Use this when shortlisting voice-agent platforms and testing how each performs on Indian customer calls.',
    rows: [
      { dimension: 'Target buyer', vendor: 'Often strong for technical teams building custom agents.', vistrow: 'Designed for Indian businesses that want phone, web, dashboard, and CRM workflow together.' },
      { dimension: 'India language fit', vendor: 'Must be tested per language and voice stack.', vistrow: 'Built around Indian-language and code-switching use cases.' },
      { dimension: 'Website calls', vendor: 'Depends on implementation and product fit.', vistrow: 'Native website widget with lead capture and call records.' },
      { dimension: 'CRM outcome', vendor: 'Implementation-dependent.', vistrow: 'Lead fields, summary, transcript, recording link, and delivery status are first-class.' },
      { dimension: 'Where it fits', vendor: 'Custom programmable agent builds.', vistrow: 'Revenue/support teams wanting faster rollout.' },
    ],
    faqs: [
      { q: 'How should I compare Retell AI and Vistrow Voice?', a: 'Run the same script, same language, same target caller profile, and same phone network. Measure first response, interruption handling, recovery, and CRM output quality.' },
      { q: 'Does Vistrow Voice focus on India?', a: 'Yes. The product is built around Indian-language customer calls, mixed-language speech, phone workflows, and CRM lead handoff.' },
      { q: 'Which is better for developers?', a: 'If you want maximum low-level control, compare developer tooling closely. If you want a business-ready workflow, compare dashboards, records, and integrations.' },
    ],
  },
  {
    slug: 'bland-ai',
    name: 'Bland AI',
    category: 'AI phone calls',
    title: 'Vistrow Voice vs Bland AI | AI Phone Calling Comparison',
    description:
      'Compare Vistrow Voice with Bland AI for teams evaluating AI phone calls, lead qualification, web voice widgets, multilingual support, and CRM-ready results.',
    bestFor: 'Teams exploring AI phone-call automation and programmable outbound/inbound calling.',
    tradeoff: 'For Indian businesses, language quality, local call behavior, and CRM fit should be validated with your own phone numbers and scripts.',
    buyerIntent: 'Use this page when comparing AI phone-call tools and deciding what matters beyond making a call connect.',
    rows: [
      { dimension: 'Calling focus', vendor: 'AI phone-call automation.', vistrow: 'AI phone plus website voice conversations for Indian business workflows.' },
      { dimension: 'Local language tests', vendor: 'Test your exact language pair and voice settings.', vistrow: 'Pages, demos, and configuration are centered around Indian-language scenarios.' },
      { dimension: 'Operator UI', vendor: 'Evaluate against your ops workflow.', vistrow: 'Agent builder, calls table, recordings, transcripts, CRM push status, and analytics.' },
      { dimension: 'CRM push', vendor: 'Depends on configured integrations.', vistrow: 'Structured lead payloads and webhook/CRM status are part of the call detail flow.' },
      { dimension: 'Where it fits', vendor: 'Teams comparing programmable AI call automation.', vistrow: 'Teams needing localized AI lead/support calls with business records.' },
    ],
    faqs: [
      { q: 'Is Bland AI only for outbound calls?', a: 'Check the current product documentation before deciding. For Vistrow Voice, both inbound and outbound workflows are part of the product story.' },
      { q: 'What should Indian teams test first?', a: 'Test language switching, interruption handling, noisy audio, phone network delay, name pronunciation, and whether the final CRM record is useful.' },
      { q: 'Can Vistrow handle website visitors too?', a: 'Yes. The website widget lets visitors start a voice conversation in the browser without dialing a phone number.' },
    ],
  },
  {
    slug: 'synthflow',
    name: 'Synthflow',
    category: 'AI voice agents',
    title: 'Vistrow Voice vs Synthflow | AI Voice Agent Comparison',
    description:
      'Compare Vistrow Voice with Synthflow for teams choosing AI voice agents for phone calls, lead qualification, appointments, multilingual support, and CRM workflows.',
    bestFor: 'Teams evaluating no-code AI voice-agent builders and automations.',
    tradeoff: 'No-code agent builders vary heavily in language quality, real-call latency, CRM payload quality, and local market fit.',
    buyerIntent: 'Useful if you want a no-code voice agent but need to test which product fits your language, CRM, and call type.',
    rows: [
      { dimension: 'Setup model', vendor: 'No-code/low-code voice-agent workflows.', vistrow: 'No-code agent builder with Indian language, phone, web widget, and CRM records.' },
      { dimension: 'Language fit', vendor: 'Test exact languages before rollout.', vistrow: 'Indian-language use cases and code-switching are core positioning.' },
      { dimension: 'Call channels', vendor: 'Evaluate phone/web support for your workflow.', vistrow: 'Phone calls plus website voice widget.' },
      { dimension: 'Records', vendor: 'Check transcript, recording, and webhook detail.', vistrow: 'Call detail page combines transcript, recording, intelligence, CRM status, and fields.' },
      { dimension: 'Where it fits', vendor: 'Teams comparing no-code global voice builders.', vistrow: 'Teams wanting localized calling plus CRM handoff.' },
    ],
    faqs: [
      { q: 'What should I test in a no-code voice agent?', a: 'Test setup speed, live latency, caller interruptions, multilingual behavior, hallucination controls, CRM payloads, and support for your exact call volume.' },
      { q: 'Does Vistrow Voice support appointments?', a: 'Yes. Appointment and next-step workflows are part of Vistrow’s product pages and call flow design.' },
      { q: 'Can I use Vistrow for both web and phone?', a: 'Yes. That is one of the key differences from phone-only calling tools.' },
    ],
  },
]

export interface CompareExtra {
  scenarios: Array<{ title: string; body: string }>
  ask: string[]
  steps: string[]
  extraFaqs: Faq[]
  related: Array<{ to: string; label: string }>
}

const R_PRODUCT = { to: '/product/agents', label: 'Voice agents' }
const R_INBOUND = { to: '/product/inbound', label: 'Inbound calling' }
const R_OUTBOUND = { to: '/product/outbound', label: 'Outbound campaigns' }
const R_WIDGET = { to: '/product/widget', label: 'Website call widget' }
const R_KB = { to: '/product/knowledge-base', label: 'Knowledge base' }
const R_INTEG = { to: '/product/integrations', label: 'Integrations' }
const R_LANG = { to: '/languages', label: 'Supported languages' }
const R_IVR = { to: '/ai-ivr', label: 'AI IVR' }
const R_VSIVR = { to: '/vs-ivr', label: 'Voice agent vs IVR' }
const R_PRICING = { to: '/pricing', label: 'Pricing' }
const R_GUIDE = { to: '/best-ai-voice-calling-software-india', label: 'How to choose AI voice calling software' }
const R_RE = { to: '/solutions/real-estate', label: 'Real estate calling' }
const R_SUPPORT = { to: '/solutions/support', label: 'Customer support' }
const R_HINDI = { to: '/languages/hindi', label: 'Hindi voice agent' }

/** Decision-support content per comparison page. Category-level only: no claims
 * about a named vendor's features, pricing or quality (see SEO plan rules). No
 * prices or credit figures - those live on /pricing. */
export const COMPARE_EXTRAS: Record<string, CompareExtra> = {
  exotel: {
    scenarios: [
      { title: 'Telephony first', body: 'Choose a cloud telephony provider when the main need is numbers, call routing, SMS and APIs that your own team builds on. The platform is the foundation, and the conversation logic is yours to design.' },
      { title: 'Conversation first', body: 'Choose a voice-agent product when the pain is repetitive conversations: qualifying enquiries, answering the same questions, booking appointments. The product runs the conversation itself and returns a finished record.' },
      { title: 'Layered together', body: 'Some teams keep their number and routing where they are and add an agent layer for the first conversation. Check early whether your existing number can be connected; Vistrow Voice connects numbers through its telephony provider setup, so confirm yours before planning around it.' },
    ],
    ask: [
      'Does the product place and answer calls with an AI agent itself, or provide lines for you to build the agent on?',
      'Who writes, tests and maintains the conversation logic after launch?',
      'How are concurrent-call limits, calling hours and Do-Not-Call rules set, and by whom?',
      'What does a finished call record contain, and how does it reach your CRM?',
      'How are mixed-language calls tested, and what happens when the automated side cannot help?',
    ],
    steps: [
      'Pick one narrow call type, such as after-hours enquiries or missed-call callbacks, and leave everything else untouched.',
      'Write 20 realistic test calls, including a wrong number, an interruption and a question the agent should not answer.',
      'Run the same calls against each option and compare the records as well as the audio.',
      'Route one line or one time window to the voice agent, keep a transfer number for hand-offs, and read the first week of transcripts before widening.',
    ],
    extraFaqs: [
      { q: 'Can we keep our current telephony provider?', a: 'Often the call infrastructure and the agent layer can be separate decisions. Vistrow Voice connects phone numbers through its own telephony setup, so ask us whether your existing number can be connected before you plan a migration.' },
      { q: 'Do we need developers to use a voice agent?', a: 'Not to build one in Vistrow Voice: the agent builder is no-code. A telephony platform used as a base usually involves more engineering, which is a reasonable trade when you need custom call flows.' },
      { q: 'What should we compare besides price?', a: 'Compare the finished outcome of a call: response speed, language handling, the quality of the transcript and lead fields, and how easily your team can change the agent. The pricing page explains what each Vistrow plan includes.' },
    ],
    related: [R_INBOUND, R_OUTBOUND, R_INTEG, R_IVR, R_RE, R_PRICING],
  },
  knowlarity: {
    scenarios: [
      { title: 'Cloud calling and IVR are enough', body: 'If callers only need routing to a few departments, in one or two languages, a cloud telephony menu is simple and familiar. An AI agent adds little when nothing needs to be understood.' },
      { title: 'Callers ask questions or book', body: 'If callers describe a need, ask about timings or availability, or want an appointment, a conversational agent can resolve many of these calls without a transfer, using your knowledge base.' },
      { title: 'Modernising in stages', body: 'You do not have to replace a call stack in one move. Start with one line or an after-hours window, keep the existing menu as fallback, and widen only after the transcripts look right.' },
    ],
    ask: [
      'Is the caller asked to press keys, or can they say what they need in their own language?',
      'How are callers who switch between languages mid-call handled?',
      'Can the system book appointments or take a callback request on the call itself?',
      'What is saved after each call: audio, transcript, captured fields, outcome?',
      'How do you update the answers when a price list, timing or policy changes?',
    ],
    steps: [
      'List the five reasons people call most and note what your team says on each one.',
      'Turn those answers into a knowledge base and a short agent prompt, then test them in the browser before any number is involved.',
      'Send a small share of real calls, or after-hours calls only, to the agent while the existing flow keeps handling the rest.',
      'Review transcripts and transfers weekly, then decide which lines can move.',
    ],
    extraFaqs: [
      { q: 'Is an AI voice agent the same as an IVR?', a: 'No. An IVR routes by keypress. A voice agent understands speech and answers or completes a task. When used to replace a menu, it is often called an AI IVR; see the dedicated page for the call flow.' },
      { q: 'Can the agent hand over to my team?', a: 'On phone calls, yes: set a transfer number and the agent can dial a colleague into the call, or take a callback request when nobody is free. Web calls cannot be transferred to a phone.' },
      { q: 'What should a pilot measure?', a: 'Measure how many calls were resolved without a transfer, how accurate the captured details were, how callers reacted, and how many hand-offs arrived with useful context.' },
    ],
    related: [R_IVR, R_VSIVR, R_INBOUND, R_KB, R_SUPPORT, R_LANG],
  },
  ozonetel: {
    scenarios: [
      { title: 'A large human team', body: 'When many people take calls, supervisors need queues, monitoring, dialers and agent desktops. A contact-center suite is built for that operation, and an AI agent does not replace it.' },
      { title: 'AI takes the first conversation', body: 'When most calls are repetitive and a human is needed only for some, a voice agent can answer, qualify and book first, and pass the rest to your people with a transcript.' },
      { title: 'Running both', body: 'The two can coexist: the contact-center platform keeps the human queue, while the voice agent handles overflow, after-hours calls or a single use case. This depends on routing, so check the hand-off path before you commit.' },
    ],
    ask: [
      'Is the product designed around human agents, around AI agents, or both?',
      'How are calls handed from an AI agent to a person, and what context travels with them?',
      'What reporting exists for AI-handled calls separately from human-handled ones?',
      'Who administers it day to day: a contact-center operations team or a business owner?',
      'How long does a first working use case take to go live?',
    ],
    steps: [
      'Choose the one call type that consumes agent time but needs little judgement, such as status checks or enquiry qualification.',
      'Build that single agent with a clear hand-off rule, and set the transfer number to your existing team.',
      'Run it on overflow or after-hours first, so your current queue is not at risk.',
      'Compare handle time, transfers and outcomes against the same period before the pilot.',
    ],
    extraFaqs: [
      { q: 'Does a voice agent replace the call team?', a: 'Usually not. It absorbs repetitive, high-volume calls so people spend their time on conversations that need judgement. Complaints and negotiations are better handled by a person.' },
      { q: 'What does the human receive after a hand-off?', a: 'The call has a transcript, a summary and the lead fields captured so far, so your colleague does not start from zero. A returning caller can also be recognised if memory is turned on.' },
      { q: 'Can we limit when the agent answers?', a: 'Yes. For inbound numbers you can set a daily window, active days and a concurrent-call limit; calls outside those rules are not answered by the agent.' },
    ],
    related: [R_INBOUND, R_PRODUCT, R_SUPPORT, R_INTEG, R_VSIVR, R_PRICING],
  },
  'sarvam-ai': {
    scenarios: [
      { title: 'Build on models', body: 'If you have engineers and want full control, building directly on speech and language models gives the most flexibility. You then own the product layer around them: call handling, recordings, logs, dashboards, billing and monitoring.' },
      { title: 'Buy a finished product', body: 'If the goal is working calls and CRM-ready records without a long build, a finished voice-agent product is the shorter path. You accept its defaults in return for speed.' },
      { title: 'Provider or product', body: 'These are not always rivals. A product can use model providers underneath, so ask any vendor which speech and language components sit behind the agent and how they are chosen per language.' },
    ],
    ask: [
      'Which parts of the stack do you operate for me: telephony, speech recognition, language model, voice, logs?',
      'Which Indian languages and mixed-language patterns have been tested on live phone audio?',
      'How is latency measured, and can I test it on my own network and numbers?',
      'What records and exports exist for every call, and can I audit them?',
      'What would my team have to build or maintain after launch?',
    ],
    steps: [
      'Write a short spec of the calls you want handled, the languages and the record your team needs afterwards.',
      'Estimate honestly what an in-house build would need: telephony, orchestration, a dashboard, call records, monitoring.',
      'Run the same 20 test calls on a prototype and on a ready product, in your languages, on a phone and in a browser.',
      'Compare time to a working pilot, caller experience and the maintenance each route leaves with your team.',
    ],
    extraFaqs: [
      { q: 'When does building make more sense?', a: 'When voice is core to your own product, when you need deep control over every component, or when you already have a platform team that will maintain the system.' },
      { q: 'What does Vistrow Voice already include?', a: 'An agent builder, a knowledge base with strict mode, phone and website channels, call transcripts and recordings, a Testing Lab, and CRM and webhook delivery. See the product pages for each.' },
      { q: 'Does Vistrow Voice cover Indian languages?', a: 'It speaks more than 130 languages, including ten Indian languages and English, including mixed Hindi-English speech, and keeps the same voice when the caller switches language. The languages page lists each one.' },
    ],
    related: [R_PRODUCT, R_LANG, R_HINDI, R_KB, R_INTEG, R_GUIDE],
  },
  elevenlabs: {
    scenarios: [
      { title: 'Voice is the product', body: 'For narration, dubbing, media or a custom experience where expressive speech is the main output, a voice-generation service is the right focus. You evaluate how the voice sounds.' },
      { title: 'Calls are the product', body: 'For a phone or website call, speech output is one part of a loop: listening, understanding, answering, handling interruptions and recording the result. Evaluate the whole loop, not one component.' },
      { title: 'Voice quality inside a calling product', body: 'These can meet: a calling product may offer premium voices as an option. Check which voices are available for your languages and how they behave in a live call, not only in a sample clip.' },
    ],
    ask: [
      'Is the voice available inside a live call loop, or only as generated audio?',
      'How long after the caller stops speaking does the first audio start, on a phone line?',
      'How does the voice handle numbers, names and mixed-language sentences?',
      'What else must I supply: speech recognition, a language model, telephony, call records?',
      'Can I preview the voices in the language my callers use?',
    ],
    steps: [
      'Shortlist two or three voices you like for your brand, and write a 30-second script using real names, numbers and a switch between languages.',
      'Listen to each in a live call, not only a sample, and note the pause before the first word.',
      'Try an interruption and a long answer, since the voice must stop gracefully.',
      'Decide using the full call experience, then check the transcript and record that comes out of it.',
    ],
    extraFaqs: [
      { q: 'Which voices does Vistrow Voice offer?', a: 'A curated set of voices across Indian languages and English that you can preview from the Voices page before adding them to an agent. Premium options are available where configured.' },
      { q: 'Does a better voice always mean a better call?', a: 'Not by itself. Callers respond to how quickly the agent answers, whether it understands them and whether it recovers from interruptions. A voice that sounds beautiful but arrives late can feel worse on a call.' },
      { q: 'Can I change voice delivery on an agent?', a: 'Yes. You can choose who speaks first, voice delivery, emotion intensity, noise suppression and background ambience on the agent’s page, and changes apply from the next call.' },
    ],
    related: [R_PRODUCT, R_LANG, R_WIDGET, R_VSIVR, R_GUIDE, R_PRICING],
  },
  'retell-ai': {
    scenarios: [
      { title: 'Programmable platform', body: 'If your engineers want to assemble custom agents, wire their own tools and control each component, a developer-oriented voice-agent platform offers that flexibility, with the build and upkeep being yours.' },
      { title: 'Business-ready workflow', body: 'If operators and sales or support managers need to change the agent, read transcripts and see CRM status without engineering help, compare dashboards and records as seriously as the voice itself.' },
      { title: 'Local fit matters most', body: 'If your callers speak Indian languages, mix them within a sentence or call on noisy lines, the deciding test is a real call in your language, whichever platform you shortlist.' },
    ],
    ask: [
      'Who can change the agent after launch: only developers, or business users too?',
      'How are phone numbers and website calls both supported?',
      'What does a failed or interrupted call look like in the logs?',
      'How are retries and delivery to my CRM handled when something fails?',
      'Can I test with my own phone numbers and languages before paying for a plan?',
    ],
    steps: [
      'Write one script and one set of caller personas, including a hurried caller and a caller who switches language.',
      'Build the same agent on each shortlisted platform with identical prompts and knowledge.',
      'Call each from a phone on the network your customers use, and from a browser if you need website calls.',
      'Score first-response time, interruption recovery, accuracy of captured details and the usefulness of the final record.',
    ],
    extraFaqs: [
      { q: 'Is a developer platform or a finished product better?', a: 'Neither is better in general. Developer platforms suit teams who want control and have engineers to maintain it; a finished product suits teams who want an agent live quickly and managed from a dashboard.' },
      { q: 'How do I keep the comparison fair?', a: 'Use identical scripts, knowledge, caller profiles and phone networks, and score on written criteria agreed beforehand rather than first impressions.' },
      { q: 'Can I test Vistrow Voice before committing?', a: 'Yes. You can talk to an agent in the browser with its real configuration, run the Testing Lab scenarios, and try the live demo on the site.' },
    ],
    related: [R_PRODUCT, R_WIDGET, R_INTEG, R_LANG, R_GUIDE, R_PRICING],
  },
  'bland-ai': {
    scenarios: [
      { title: 'Programmable phone automation', body: 'Teams that want to trigger large numbers of automated calls from their own systems may favour a programmable calling product, accepting that setup and monitoring sit with them.' },
      { title: 'Calls that are expected', body: 'Outbound works best when callers expect the call: reminders, follow-ups on an enquiry, confirmations. Consent and calling-hour rules matter more than any feature, and remain your business’s responsibility.' },
      { title: 'Inbound and web as well', body: 'If the same agent should also answer your number and talk to website visitors, check that the product handles all three channels with one set of knowledge and one call record.' },
    ],
    ask: [
      'Does it support inbound, outbound and website calls, or only some?',
      'How are Do-Not-Call lists, calling windows and consent handled?',
      'How do retries work when a call is not answered or the line is busy?',
      'How does the system behave on noisy audio and when the caller talks over the agent?',
      'What is delivered to my CRM after each call, and what happens if delivery fails?',
    ],
    steps: [
      'Start with a list of 20 to 30 contacts who expect to hear from you, with consent on record.',
      'Run a small batch, listen to every call and note where the agent stumbled or the caller got confused.',
      'Adjust the prompt, retry rules and calling window, then run another small batch before scaling.',
      'Check that every record reached your CRM with usable fields before adding volume.',
    ],
    extraFaqs: [
      { q: 'Does Vistrow Voice respect Do-Not-Call lists and calling hours?', a: 'Yes. Every outbound dial is checked against your Do-Not-Call list and, with the calling window enforced, your allowed hours and days. Blocked contacts are counted, not called. Consent obligations remain with your business.' },
      { q: 'How large should the first outbound test be?', a: 'Small. Start with a short list, review the calls, and talk to us before running a large campaign. The outbound page explains pace, retries and the channel limit.' },
      { q: 'Can the agent follow up on a new lead quickly?', a: 'Yes. Leads pushed from ArthaLeads, and any source that can send a webhook, can queue a call within roughly 15 to 30 seconds, subject to your compliance rules.' },
    ],
    related: [R_OUTBOUND, R_INBOUND, R_WIDGET, R_INTEG, R_LANG, R_PRICING],
  },
  synthflow: {
    scenarios: [
      { title: 'A no-code builder is the goal', body: 'If non-technical staff should build and edit the agent, a no-code builder is the right category. Differences then come from how deep the controls go and how reliably real calls behave.' },
      { title: 'Language and market fit', body: 'Builders vary in language quality and local behaviour. The only dependable check is a real call in your language, with your names, numbers and a switch between languages.' },
      { title: 'Records and follow-up', body: 'An agent that talks well but leaves a thin record creates manual work. Look at what lands in the call view and in your CRM before judging the conversation.' },
    ],
    ask: [
      'Which settings can a business user change without help: prompt, voice, language, functions?',
      'How can I test an agent before it takes real calls?',
      'What can the agent do on a call: book, capture fields, transfer, take a callback?',
      'How are answers kept to approved information, and what happens on an unknown question?',
      'What does the call record contain, and can it be sent to a webhook or CRM?',
    ],
    steps: [
      'Build the same simple agent on each builder in an afternoon: greeting, three questions, one booking.',
      'Note how long it took and how many settings were easy to find.',
      'Run an identical set of test calls, including silence, an angry caller and a language switch.',
      'Compare the call records, then choose the builder your team will actually keep maintaining.',
    ],
    extraFaqs: [
      { q: 'How do I test an agent before launch in Vistrow Voice?', a: 'Talk to it in the browser with its exact prompt and voice, or have it ring your phone. The Testing Lab replays scenarios such as an impatient caller or Hindi-English switching and checks the result.' },
      { q: 'Can the agent be limited to approved answers?', a: 'Yes. Strict mode in the knowledge base makes the agent quote your approved answers and say it will check with the team when something is not covered. It reduces improvised answers but cannot guarantee a perfect one, so test it.' },
      { q: 'Which actions can an agent take on a call?', a: 'Booking appointments, callback requests, lead capture and “do not call me again” are always available; end call, web search and keypad tones can be switched on or off. Phone calls can also be transferred to a person.' },
    ],
    related: [R_PRODUCT, R_KB, R_WIDGET, R_LANG, R_INTEG, R_GUIDE],
  },
}

export const COMPARE_VENDORS: CompareVendor[] = BASE_COMPARE_VENDORS.map((vendor) => {
  const extra = COMPARE_EXTRAS[vendor.slug]
  return extra ? { ...vendor, scenarios: extra.scenarios, ask: extra.ask, steps: extra.steps, related: extra.related, faqs: [...vendor.faqs, ...extra.extraFaqs] } : vendor
})

export interface BuyerGuide {
  slug: string
  title: string
  description: string
  eyebrow: string
  headline: string
  subhead: string
  sections: Array<{ title: string; body: string; bullets: string[] }>
  faqs: Faq[]
  approaches?: Array<{ title: string; fits: string; tradeoff: string }>
  checklist?: Array<{ criterion: string; good: string; test: string }>
  trial?: string[]
  /** Heading over `trial`, when the steps are not a vendor shortlist. */
  trialTitle?: string
  related?: Array<{ to: string; label: string }>
}

const BASE_BUYER_GUIDES: BuyerGuide[] = [
  {
    slug: 'best-ai-voice-calling-software-india',
    title: 'How to Choose AI Calling Software in India | Vistrow Voice',
    description:
      'A checklist for choosing AI calling software in India: tool types, latency, Indian languages, phone and web channels, CRM records, compliance and a trial.',
    eyebrow: 'Buyer guide',
    headline: 'How to choose AI voice calling software in India.',
    subhead:
      'The right AI calling software is not the one with the flashiest demo. It is the one that handles your real calls, in your customer’s language, and leaves your team with a useful record.',
    sections: [
      {
        title: 'Start with the real call type',
        body: 'Inbound support, outbound follow-up, real estate qualification, collections, and website voice all stress the stack differently.',
        bullets: ['Test inbound and outbound separately', 'Use real phone numbers, not only browser demos', 'Include noisy callers and interruptions'],
      },
      {
        title: 'Measure latency like a caller',
        body: 'A call feels fast when listening, thinking, and speaking work together. Do not judge by TTS quality alone.',
        bullets: ['Track time from caller stop to first audio', 'Check barge-in handling', 'Test long answers and short confirmations'],
      },
      {
        title: 'Check Indian-language behavior',
        body: 'India calls are not clean textbook language. They include names, numbers, Hinglish, city names, and mid-sentence switching.',
        bullets: ['Test Hindi-English, Marathi-Hindi, Kannada-English, Telugu-English', 'Listen for number pronunciation', 'Check whether the agent stays in one voice'],
      },
      {
        title: 'Demand CRM-ready output',
        body: 'A pretty conversation is not enough. The final record should be useful to the sales or support team.',
        bullets: ['Transcript and summary', 'Captured fields and outcome', 'Recording link and retryable CRM delivery status'],
      },
    ],
    faqs: [
      { q: 'How do I choose AI voice calling software in India?', a: 'Choose the option that performs well on your exact language, call type, phone network and CRM workflow, judged by your own test calls rather than a demo. Use the checklist on this page to score each shortlisted product the same way, including Vistrow Voice.' },
      { q: 'Should I prioritize price or latency?', a: 'Prioritize call success first. A cheaper model that causes awkward pauses or bad answers can cost more in lost leads than it saves in API spend.' },
      { q: 'How many test calls should I run before launch?', a: 'Run at least 20–30 test calls across languages, noisy audio, interruptions, failed answers, and CRM delivery before trusting an agent with real leads.' },
    ],
  },
  {
    slug: 'ai-voice-bot-pricing-india',
    title: 'AI Voice Bot Pricing in India | Cost Factors and Estimates',
    description:
      'Understand AI voice bot pricing in India: telephony, STT, LLM, TTS, recordings, CRM sync, support, call minutes, and what to compare before buying.',
    eyebrow: 'Pricing guide',
    headline: 'What AI voice bot pricing really includes.',
    subhead:
      'A per-minute number can hide a lot. Real pricing depends on the full pipeline: phone transport, speech recognition, the LLM, voice generation, storage, integrations, and retries.',
    sections: [
      {
        title: 'The cost stack',
        body: 'Every live call uses several paid systems at once. You should understand which are included and which are passed through.',
        bullets: ['Telephony or web RTC minutes', 'Speech-to-text', 'LLM reasoning', 'Text-to-speech', 'Recording/transcript storage'],
      },
      {
        title: 'Cheap can become expensive',
        body: 'A low model bill does not help if the agent repeats itself, misses intent, or fails to push leads to CRM.',
        bullets: ['Measure successful outcomes, not only minutes', 'Watch retry and re-call volume', 'Check whether support and integrations are included'],
      },
      {
        title: 'What to ask vendors',
        body: 'Ask questions that expose hidden costs and operational gaps.',
        bullets: ['Are recordings included?', 'Are failed CRM pushes retried?', 'Are web-widget calls priced differently?', 'Can I cap spend per agent or workspace?'],
      },
      {
        title: 'How Vistrow thinks about pricing',
        body: 'Vistrow Voice uses credit-based plans so operators can see usage and scale call volume without learning every underlying model price.',
        bullets: ['Plan-level visibility', 'Call-level credit breakdown', 'Separate voice/model tiers where needed'],
      },
      {
        title: 'Phone calls and website calls cost differently',
        body: 'A phone call needs a number and carrier minutes on top of the AI conversation. A call from a website widget runs in the visitor’s browser, so there is no carrier charge, but it still uses speech recognition, the model and the voice. Ask whether a vendor prices the two channels the same way and whether telephony is included or billed by your provider.',
        bullets: ['Number rental and carrier minutes for phone calls', 'Browser calls without a phone number', 'Whether both channels draw from one balance'],
      },
      {
        title: 'Voice and model choices move the price',
        body: 'Most platforms let you trade quality against cost. A more expressive or premium voice usually costs more per minute than a standard one, and some models cost more than others. Pick the cheapest combination that still sounds natural in your callers’ language and answers correctly, and confirm it on recorded test calls rather than a preview button.',
        bullets: ['Compare voices on a real phone line', 'Check that the cheaper voice speaks your language well', 'Re-test after changing the model'],
      },
    ],
    checklist: [
      { criterion: 'Billing unit', good: 'You know whether you pay per minute, per call, per credit or per seat, and how a part-minute is counted.', test: 'Ask for the bill of one sample call broken down line by line.' },
      { criterion: 'Telephony', good: 'Number rental and carrier minutes are either included or clearly passed through.', test: 'Ask who issues the telephony invoice and in what currency.' },
      { criterion: 'Channels', good: 'Phone and website calls are priced in a way you can predict.', test: 'Price the same five-minute conversation on both channels.' },
      { criterion: 'Voice tiers', good: 'Each voice shows its cost before you choose it.', test: 'Look for the rate next to the voice in the dashboard, not only in a sales deck.' },
      { criterion: 'Model tiers', good: 'Model choices that change the rate are labelled.', test: 'Switch the model on a test agent and compare two otherwise identical calls.' },
      { criterion: 'Recordings and storage', good: 'Recordings, transcripts and retention are included or priced openly.', test: 'Ask how long recordings are kept and whether longer retention costs more.' },
      { criterion: 'Integrations', good: 'CRM and webhook delivery is part of the plan, with retries when a delivery fails.', test: 'Check which plan includes the integration you need.' },
      { criterion: 'Usage visibility', good: 'A usage view shows spend by day, agent and channel, and each call shows what it used.', test: 'Open the usage screen after a test day and reconcile it with your call list.' },
      { criterion: 'Limits and overage', good: 'You know what happens when the balance runs out or the call limit is reached.', test: 'Ask whether calls stop, queue or are billed at a higher rate.' },
      { criterion: 'Taxes and contract', good: 'GST, minimum terms and any setup or support fees are written down.', test: 'Get the full monthly figure for your expected volume in writing.' },
    ],
    trialTitle: 'Estimate a monthly budget in five steps.',
    trial: [
      'Count last month’s calls by type and note the average length of each type from your phone system or call logs.',
      'Decide which of those call types the agent should handle in the first month, and which stay with your team.',
      'Multiply the handled calls by their average length to get conversation minutes, then add a margin for test calls and retries.',
      'Apply each vendor’s rate for the voice and model you would actually use, plus telephony and taxes, to get a monthly range.',
      'Run a short pilot, compare the real usage screen with your estimate, and adjust before committing to a larger plan.',
    ],
    related: [
      { to: '/pricing', label: 'Vistrow Voice plans' },
      { to: '/help/billing/how-credits-work', label: 'How credits are counted' },
      { to: '/help/billing/plans', label: 'What each plan includes' },
      { to: '/resources/blog/ai-voice-agent-pricing-india', label: 'Estimating AI voice agent cost' },
      { to: '/best-ai-voice-calling-software-india', label: 'Buyer guide to AI calling software' },
      { to: '/voice-bot', label: 'What an AI voice bot is' },
      { to: '/compare/exotel', label: 'Vistrow Voice vs Exotel' },
      { to: '/compare/elevenlabs', label: 'Vistrow Voice vs ElevenLabs' },
    ],
    faqs: [
      { q: 'How much does an AI voice bot cost in India?', a: 'It depends on monthly minutes, phone vs web calls, voice quality, model choice, recording storage, and integrations. Compare the full workflow cost, not only one API price.' },
      { q: 'Why are voice AI calls priced per minute?', a: 'Because live calls consume streaming speech recognition, language-model reasoning, voice synthesis, transport, and storage while the conversation is happening.' },
      { q: 'Can I reduce cost by using a smaller LLM?', a: 'Yes, for structured qualification flows a smaller fast model can work well. You still need to test accuracy, hallucination controls, and latency on real calls.' },
      { q: 'Is a website voice widget cheaper than phone calls?', a: 'Usually, because a browser call needs no phone number or carrier minutes. The AI part of the conversation still costs the same kind of usage, so check how your vendor prices each channel.' },
      { q: 'Where are Vistrow Voice prices listed?', a: 'Pricing is shared on request while plans are being finalised; the pricing page lists what each plan includes. Each call in the dashboard shows the minutes it used.' },
    ],
  },
]

export interface LocalRealEstatePage {
  slug: string
  language: string
  city: string
  state: string
  native: string
  title: string
  description: string
  examples: string[]
  /** BCP-47 code for the sample lines (sets the lang attribute). */
  langCode: string
  /** How property calls in this market tend to sound. General observations, no statistics. */
  market: string
  /** Market-specific things to configure or test. */
  localNotes: string[]
  /** Written sample (not a recording), labelled as such on the page. */
  sample: Array<{ speaker: 'Caller' | 'Agent'; native: string; gloss: string }>
  /** Matching /demo-calls slug, when a sample transcript exists in this language. */
  demoCall?: string
}

export const LOCAL_REAL_ESTATE_PAGES: LocalRealEstatePage[] = [
  {
    slug: 'hindi-ai-calling-agent-real-estate',
    language: 'Hindi',
    city: 'Delhi NCR, Lucknow, Jaipur, and Hindi-speaking buyer markets',
    state: 'North India',
    native: 'हिन्दी',
    title: 'Hindi AI Calling Agent for Real Estate | Vistrow Voice',
    description:
      'Qualify Hindi and Hinglish real estate leads with an AI calling agent that asks budget, location, project interest, timeline, and syncs the outcome to CRM.',
    examples: ['Budget qualification for property enquiries', 'Project FAQ calls in Hindi or Hinglish', 'Site-visit follow-up after a website enquiry'],
    langCode: 'hi-IN',
    demoCall: 'hindi-real-estate-lead-qualification',
    market:
      'In Hindi-speaking markets, property enquiries rarely stay in one language. A caller from Noida or Lucknow will describe the requirement in Hindi and switch to English for the property terms: BHK, carpet area, possession, RERA number, loan approval. Buyers in Delhi NCR also compare projects across a wide area, so the same call can move between Noida, Greater Noida and Gurugram, and the agent needs to record which locality the caller actually means.',
    localNotes: [
      'Set the default language to Hindi; the agent follows callers who answer in English or Hinglish.',
      'Put RERA numbers, possession dates and approved loan partners in the knowledge base, so the agent quotes them instead of guessing.',
      'Record the locality as a separate field (for example sector or micro-market), because one project name can be shared by several phases.',
    ],
    sample: [
      { speaker: 'Caller', native: 'नोएडा एक्सटेंशन में 3 BHK देख रहे हैं, budget लगभग 80 लाख है.', gloss: 'Looking for a 3 BHK in Noida Extension, budget is around 80 lakh.' },
      { speaker: 'Agent', native: 'ज़रूर. आप ख़ुद रहने के लिए ले रहे हैं या investment के लिए?', gloss: 'Sure. Are you buying to live in or as an investment?' },
      { speaker: 'Caller', native: 'ख़ुद के लिए, अगले छह महीने में.', gloss: 'For ourselves, in the next six months.' },
      { speaker: 'Agent', native: 'ठीक है. क्या इस शनिवार site visit रख दूँ?', gloss: 'All right. Shall I book a site visit this Saturday?' },
    ],
  },
  {
    slug: 'marathi-ai-calling-agent-mumbai-real-estate',
    language: 'Marathi',
    city: 'Mumbai, Pune, Nashik, and Maharashtra',
    state: 'Maharashtra',
    native: 'मराठी',
    title: 'Marathi AI Calling Agent for Mumbai & Pune Real Estate',
    description:
      'Use a Marathi AI voice agent for Mumbai, Pune, and Maharashtra property leads: qualify buyer intent, budget, location, site visits, and CRM-ready outcomes.',
    examples: ['Mumbai project enquiries', 'Pune site-visit booking calls', 'Marathi-Hindi buyer follow-ups'],
    langCode: 'mr-IN',
    demoCall: 'marathi-site-visit-booking',
    market:
      'Maharashtra buyers move between Marathi, Hindi and English, often in one sentence. In Mumbai many callers open in Hindi even when the project brochure is in Marathi, while Pune and Nashik enquiries are more often in Marathi. Questions tend to focus on carpet area, possession timelines, society charges and distance to work hubs such as Hinjewadi, Kharadi or the Thane–Belapur belt.',
    localNotes: [
      'Marathi works well as the default for Pune and Nashik projects; for Mumbai, test both Marathi and Hindi openings with your own callers.',
      'Keep carpet area and possession dates per tower in the knowledge base; buyers ask for them by wing or building.',
      'Ask the agent to confirm the preferred visit day aloud: weekend site visits fill quickly and a misheard day costs a visit.',
    ],
    sample: [
      { speaker: 'Caller', native: 'हिंजवडीजवळ 2 BHK हवाय, budget साधारण 70 लाख.', gloss: 'Want a 2 BHK near Hinjewadi, budget around 70 lakh.' },
      { speaker: 'Agent', native: 'नक्की. possession कधीपर्यंत हवंय?', gloss: 'Sure. When do you need possession?' },
      { speaker: 'Caller', native: 'पुढच्या वर्षापर्यंत चालेल.', gloss: 'By next year is fine.' },
      { speaker: 'Agent', native: 'ठीक आहे. रविवारी सकाळी site visit book करू का?', gloss: 'Okay. Shall I book a site visit on Sunday morning?' },
    ],
  },
  {
    slug: 'kannada-ai-voice-bot-bangalore-real-estate',
    language: 'Kannada',
    city: 'Bengaluru and Karnataka',
    state: 'Karnataka',
    native: 'ಕನ್ನಡ',
    title: 'Kannada AI Voice Bot for Bangalore Real Estate',
    description:
      'Handle Bengaluru real estate enquiries in Kannada and English with an AI voice bot that qualifies requirements and creates structured follow-up records.',
    examples: ['Bengaluru apartment enquiries', 'Kannada-English project questions', 'Lead qualification before sales handoff'],
    langCode: 'kn-IN',
    demoCall: 'kannada-inbound-property-enquiry',
    market:
      'Bengaluru is one of the most mixed-language property markets in India. Many buyers moved to the city for work and call in English or Hindi, while Kannada-speaking families often mix Kannada with English property terms. Enquiries cluster around employment corridors such as Whitefield, Sarjapur Road, Electronic City and North Bengaluru, and buyers frequently ask about documentation, such as which kind of khata a property has.',
    localNotes: [
      'Choose the default language by audience: Kannada for local family buyers, English for projects marketed to people relocating to the city. The agent follows a caller who switches.',
      'Documentation questions such as khata type, approvals or OC status should be answered only from approved facts, or routed to your sales team.',
      'Capture the caller\'s work location as a field; commute is often the real requirement behind a locality.',
    ],
    sample: [
      { speaker: 'Caller', native: 'ವೈಟ್‌ಫೀಲ್ಡ್ ಹತ್ತಿರ 2 BHK ಬೇಕು, budget 90 lakh ಆಸುಪಾಸು.', gloss: 'Need a 2 BHK near Whitefield, budget around 90 lakh.' },
      { speaker: 'Agent', native: 'ಖಂಡಿತ. ಇದು ಸ್ವಂತಕ್ಕೆ ವಾಸ ಮಾಡೋಕಾ ಅಥವಾ investment ಗೋ?', gloss: 'Sure. Is this for self-use or for investment?' },
      { speaker: 'Caller', native: 'ಸ್ವಂತಕ್ಕೆ. ಈ ವರ್ಷದೊಳಗೆ ಬೇಕು.', gloss: 'For ourselves. We need it within this year.' },
      { speaker: 'Agent', native: 'ಸರಿ. ಶನಿವಾರ site visit booking ಮಾಡ್ಲಾ?', gloss: 'Okay. Shall I book a site visit on Saturday?' },
    ],
  },
  {
    slug: 'telugu-ai-calling-agent-hyderabad-real-estate',
    language: 'Telugu',
    city: 'Hyderabad, Vijayawada, Vizag, and Telugu-speaking markets',
    state: 'Telangana and Andhra Pradesh',
    native: 'తెలుగు',
    title: 'Telugu AI Calling Agent for Hyderabad Real Estate',
    description:
      'Qualify Hyderabad and Telugu real estate leads with an AI calling agent for phone and website conversations, transcripts, and CRM-ready summaries.',
    examples: ['Hyderabad plot or apartment enquiries', 'Telugu-English qualification calls', 'Follow-up calls after brochure downloads'],
    langCode: 'te-IN',
    demoCall: 'telugu-website-widget-call',
    market:
      'Telugu property markets cover two quite different kinds of enquiry. In Hyderabad, apartment and villa enquiries around Gachibowli, Kokapet, Kompally and the outer ring road often mix Telugu, English and Hindi. Around Vijayawada, Guntur and Visakhapatnam, open plots in approved layouts are common, and buyers describe size in square yards and ask about layout approvals. An agent for these markets has to be ready for both.',
    localNotes: [
      'Add a plot-size field in square yards alongside BHK, so plot and apartment enquiries both produce a usable record.',
      'Keep layout approval details (for example HMDA or DTCP references) in the knowledge base, and route anything not listed there to your team.',
      'Test Telugu numbers carefully: prices in lakhs and crores and plot sizes are the details callers check first.',
    ],
    sample: [
      { speaker: 'Caller', native: 'గచ్చిబౌలి దగ్గర 3 BHK కావాలి, budget దాదాపు 1.2 కోట్లు.', gloss: 'I need a 3 BHK near Gachibowli, budget about 1.2 crore.' },
      { speaker: 'Agent', native: 'తప్పకుండా. మీరు సొంతంగా ఉండటానికా, investment కోసమా?', gloss: 'Of course. Is it to live in yourself, or for investment?' },
      { speaker: 'Caller', native: 'సొంతానికే. మూడు నెలల్లో కొనాలని అనుకుంటున్నాం.', gloss: 'For ourselves. We plan to buy within three months.' },
      { speaker: 'Agent', native: 'సరే. ఈ ఆదివారం site visit బుక్ చేయమంటారా?', gloss: 'Okay. Shall I book a site visit this Sunday?' },
    ],
  },
  {
    slug: 'gujarati-ai-calling-agent-ahmedabad-real-estate',
    language: 'Gujarati',
    city: 'Ahmedabad, Surat, Vadodara, and Gujarat',
    state: 'Gujarat',
    native: 'ગુજરાતી',
    title: 'Gujarati AI Calling Agent for Ahmedabad Real Estate',
    description:
      'Use a Gujarati AI voice agent to qualify property leads in Ahmedabad, Surat, Vadodara, and Gujarat with call transcripts and CRM-ready lead fields.',
    examples: ['Gujarati property enquiry calls', 'Ahmedabad site-visit requests', 'Budget and location qualification before human follow-up'],
    langCode: 'gu-IN',
    market:
      'Gujarat buyers usually prefer to talk property in Gujarati, with English for the specifications and some Hindi in Surat and Vadodara. Enquiries in Ahmedabad cluster along SG Highway, Shela, Gota and the newer western suburbs, and in Surat around Vesu and Pal. Housing types are described in local terms such as tenement, row house and bungalow as well as flats, and buyers often ask about the booking amount and the payment schedule early in the call.',
    localNotes: [
      'Use Gujarati as the default language; the agent switches when a caller answers in Hindi or English.',
      'Include housing type (flat, tenement, row house, bungalow) as a field so the sales team knows which inventory to discuss.',
      'Keep the payment schedule and booking terms in the knowledge base in your own words, and route negotiation to a person.',
    ],
    sample: [
      { speaker: 'Caller', native: 'SG Highway પાસે 3 BHK જોઈએ છે, બજેટ લગભગ 85 લાખ.', gloss: 'I want a 3 BHK near SG Highway, budget about 85 lakh.' },
      { speaker: 'Agent', native: 'ચોક્કસ. તમે પોતાના રહેવા માટે લો છો કે investment માટે?', gloss: 'Certainly. Are you buying for personal use or for investment?' },
      { speaker: 'Caller', native: 'પોતાના રહેવા માટે, દિવાળી પહેલાં.', gloss: 'For personal use, before Diwali.' },
      { speaker: 'Agent', native: 'સરસ. શનિવારે site visit ગોઠવી દઉં?', gloss: 'Great. Shall I arrange a site visit on Saturday?' },
    ],
  },
]

export interface DemoCall {
  slug: string
  title: string
  description: string
  language: string
  scenario: string
  outcome: string
  transcript: Array<{ speaker: 'Agent' | 'Caller'; text: string }>
  fields: Array<{ label: string; value: string }>
  /** What the caller hears and does, step by step, for this sample. */
  callerExperience: Array<{ title: string; body: string }>
  /** One paragraph on why this call type is worth automating - no stats. */
  whyItMatters: string
  /** What an operator sets up in the dashboard to run a call like this. */
  configure: Array<{ title: string; body: string; to?: string; link?: string }>
  /** Registered pages that go deeper on this scenario. */
  related: Array<{ to: string; label: string; body: string }>
  faqs: Faq[]
}

export const DEMO_CALLS: DemoCall[] = [
  {
    slug: 'hindi-real-estate-lead-qualification',
    callerExperience: [
      { title: '1. The agent opens with the reason for the call', body: 'It refers to the Khopoli project the person enquired about, then asks one question: investment or self-use. Purpose usually decides which plots an advisor offers, so it comes first.' },
      { title: '2. Questions follow the caller', body: 'The caller answers in Hinglish and the agent keeps going in the same mix, asking for a rough plot size and a budget range without a form or a menu.' },
      { title: '3. Pricing is not made up', body: 'When the caller asks for pricing, the agent says the sales team will confirm exact availability and price. It only quotes what your knowledge base contains, and strict mode keeps it to approved answers.' },
      { title: '4. The call ends with a clear note', body: 'The agent says back what it recorded, an investment enquiry for a larger plot, so the caller knows what will happen next.' },
    ],
    whyItMatters:
      'Plot enquiries often arrive without a budget or a purpose attached. Asking for both while the person is still on the line means your sales advisor opens the lead already knowing whether it is an investor or a family planning to build, and does not start with the same questions.',
    configure: [
      { title: 'Project facts', body: 'Upload the brochure and plot-size list as a knowledge base, or add the plots to the live catalog, and attach it to the agent.' },
      { title: 'Hindi voice and greeting', body: 'Choose a Hindi voice and write the welcome line. The agent follows the caller into English words without switching voice.' },
      { title: 'Fields to capture', body: 'Set post-call fields such as purpose, plot size and budget so each is saved on the call, ready for your CRM.' },
      { title: 'Where the lead goes', body: 'Send it to Zoho CRM, ArthaLeads, Google Sheets, Slack or any webhook, with the transcript attached.' },
    ],
    related: [
      { to: '/languages/hindi', label: 'Hindi AI voice calling agent', body: 'Hindi and Hinglish support, voices and use cases.' },
      { to: '/solutions/real-estate', label: 'Real estate calling workflow', body: 'Qualification, site visits and follow-up for property teams.' },
      { to: '/solutions/real-estate/hindi-ai-calling-agent-real-estate', label: 'Hindi real estate calls', body: 'The local Hindi page for property conversations.' },
      { to: '/integrations', label: 'Integrations', body: 'How leads and transcripts reach your CRM.' },
    ],
    title: 'Hindi Real Estate Lead Qualification Demo Call',
    description:
      'See how Vistrow Voice qualifies a Hindi real estate lead, captures budget and plot size, summarizes the call, and prepares CRM-ready data.',
    language: 'Hindi + Hinglish',
    scenario: 'A buyer asks about a plotted development and shares investment intent.',
    outcome: 'Qualified investment lead with budget, preferred size, and next-step follow-up.',
    transcript: [
      { speaker: 'Agent', text: 'Namaste, I am calling about your interest in the Khopoli project. Are you exploring this for investment or self-use?' },
      { speaker: 'Caller', text: 'Investment ke liye hai.' },
      { speaker: 'Agent', text: 'Great. Which plot size are you roughly looking at, and do you have a budget range in mind?' },
      { speaker: 'Caller', text: 'Lagbhag 6000 square feet. Pricing bata dijiye.' },
      { speaker: 'Agent', text: 'I will have the sales team confirm exact availability and pricing. I am noting this as an investment enquiry for a larger plot.' },
    ],
    fields: [
      { label: 'Language', value: 'Hindi + English' },
      { label: 'Purpose', value: 'Investment' },
      { label: 'Requirement', value: 'Approx. 6000 sq ft plot' },
      { label: 'Next step', value: 'Sales team pricing follow-up' },
    ],
    faqs: [
      { q: 'Is this a real customer recording?', a: 'This page shows a representative demo transcript. Real customer recordings should only be shown with consent and according to your retention policy.' },
      { q: 'Can this transcript be pushed to CRM?', a: 'Yes. Vistrow Voice prepares the transcript, summary, captured fields, outcome, and recording link for CRM/webhook delivery.' },
      { q: 'Can the same flow work in other Indian languages?', a: 'Yes. The same qualification structure can run in Marathi, Kannada, Telugu, Gujarati, and other supported languages.' },
      { q: 'What does the sales team see after a call like this?', a: 'The call record holds the transcript, the summary, the recording if recording is on, and the fields the agent saved, such as purpose and plot size. Your connected tools receive the same lead.' },
      { q: 'Will the agent quote prices it was not given?', a: 'It is set up not to. With the knowledge base or live catalog attached and strict mode on, it answers from approved material and says it will check with the team for anything else.' },
      { q: 'Can I run this on outbound calls to new enquiries?', a: 'Yes. Instant lead follow-up queues a call to a new lead within about 15 to 30 seconds, subject to your calling window and Do-Not-Call rules.' },
    ],
  },
  {
    slug: 'marathi-site-visit-booking',
    callerExperience: [
      { title: '1. The agent confirms the enquiry', body: 'It opens in Marathi, mentions the project enquiry and asks whether the caller wants to schedule a site visit.' },
      { title: '2. A day, then a part of the day', body: 'The caller prefers Saturday. The agent notes the day, then narrows it with one question: morning or afternoon.' },
      { title: '3. A clear next step', body: 'In this sample the agent captures the preference and says the sales team will confirm the exact slot and send the details. It does not promise a time it has not booked.' },
      { title: '4. Booking directly, if you set it up', body: 'With scheduling configured, the agent can instead offer real free slots and confirm only once the booking has saved. It can also take a callback request if no slot suits.' },
    ],
    whyItMatters:
      'Site visits are where many property enquiries either move forward or stall. Taking the preferred day and time during the first call, in the language the buyer is comfortable with, gives your team a concrete visit to confirm rather than a vague interest to chase.',
    configure: [
      { title: 'Bookable hours', body: 'Set business hours per day, slot length from 15 to 60 minutes, timezone and blackout dates under Settings, Scheduling.' },
      { title: 'Appointments calendar', body: 'Visits appear in Appointments, where your team can reschedule them or mark them confirmed, completed, cancelled or no-show.' },
      { title: 'Team follow-up', body: 'Send the call summary and the caller’s preference to your team through Slack, your CRM or a webhook, so they can confirm the visit.' },
      { title: 'Marathi and Hindi', body: 'The agent can follow a caller who moves between Marathi, Hindi and English mid-call.' },
    ],
    related: [
      { to: '/languages/marathi', label: 'Marathi AI voice calling agent', body: 'Marathi voices, code-switching and use cases.' },
      { to: '/solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate', label: 'Marathi real estate calls', body: 'The local Marathi page for property conversations.' },
      { to: '/help/appointments/manage-appointments', label: 'Bookings and availability', body: 'How slots, hours and appointment statuses work.' },
      { to: '/solutions/real-estate', label: 'Real estate calling workflow', body: 'Qualification, site visits and follow-up.' },
    ],
    title: 'Marathi Site Visit Booking Demo Call',
    description:
      'A Marathi real estate demo call showing how an AI voice agent confirms buyer interest, preferred time, and site-visit next steps.',
    language: 'Marathi + Hindi',
    scenario: 'A buyer wants to schedule a site visit for a project in Pune.',
    outcome: 'Site-visit request captured with preferred day and buyer context.',
    transcript: [
      { speaker: 'Agent', text: 'Namaskar, tumhi project sathi enquiry keli hoti. Site visit schedule karaychi aahe ka?' },
      { speaker: 'Caller', text: 'Ho, Saturday la possible aahe ka?' },
      { speaker: 'Agent', text: 'Saturday cha preference note karto. Morning ki afternoon chaalel?' },
      { speaker: 'Caller', text: 'Afternoon.' },
      { speaker: 'Agent', text: 'Perfect. Sales team exact slot confirm karun tumhala details pathavel.' },
    ],
    fields: [
      { label: 'Language', value: 'Marathi' },
      { label: 'Intent', value: 'Site visit' },
      { label: 'Preferred time', value: 'Saturday afternoon' },
      { label: 'Next step', value: 'Confirm slot and send details' },
    ],
    faqs: [
      { q: 'Can Vistrow book directly on a calendar?', a: 'Yes. Agents book into the Appointments calendar built into Vistrow Voice, using the hours, slot length and blackout dates you set. If you have not set scheduling up, the agent can capture the preferred slot and hand it to the sales team, as in this sample.' },
      { q: 'Can the caller switch to Hindi?', a: 'Yes. The agent can follow mixed Marathi, Hindi, and English depending on the configured voice pipeline.' },
      { q: 'What does the sales team receive?', a: 'They receive the caller details, transcript, summary, preferred slot, and lead outcome.' },
      { q: 'What if the caller cannot make any offered time?', a: 'The agent takes a callback request with the caller’s preferred date and time, so the call still ends with a next step for your team.' },
      { q: 'Does the agent really book, or just note a preference?', a: 'It depends on how you configure it. This sample shows a preference being captured. With scheduling set up, the agent offers real free slots and confirms only after the booking has saved.' },
      { q: 'How does the buyer get the details afterwards?', a: 'The agent tells them the sales team will send the details. You can send the call summary to your team through Slack, your CRM or a webhook so they follow up promptly.' },
    ],
  },
  {
    slug: 'kannada-inbound-property-enquiry',
    callerExperience: [
      { title: '1. The call is answered at once', body: 'The agent greets the caller in Kannada and English and asks whether they are looking for investment or self-use, instead of putting them on hold or into a menu.' },
      { title: '2. Mixed Kannada and English is normal', body: 'The caller asks for location and price details in a Kannada and English mix. The agent follows without asking them to pick a language.' },
      { title: '3. Availability is not guessed', body: 'The agent notes the requirement and says the team will confirm exact price and availability. It asks for a budget range so the follow-up has something to work with.' },
      { title: '4. The enquiry is summarised', body: 'It repeats what it recorded, a self-use enquiry with a budget of about one crore, so the caller can correct it before the call ends.' },
    ],
    whyItMatters:
      'Inbound calls come at any hour, including when your sales team is away from the phone. An agent that answers, asks the basics and records them means a call at night is waiting as a qualified enquiry in the morning rather than a missed number.',
    configure: [
      { title: 'An inbound number', body: 'Connect an EnableX number under Phone Numbers, choose the agent that answers it, and use Test call to check it. Set hours, days and limits under Inbound.', to: '/help/phone-numbers/connect-a-number', link: 'Connect a phone number' },
      { title: 'Project knowledge', body: 'Add project facts to the knowledge base, so questions about location are answered from approved information.' },
      { title: 'Strict mode', body: 'Keep the agent to your approved answers so it does not invent price or inventory.' },
      { title: 'Kannada voice', body: 'Choose a voice and default language, then test mixed Kannada and English calls on your own agent before going live.' },
    ],
    related: [
      { to: '/languages/kannada', label: 'Kannada AI voice calling agent', body: 'Kannada voices, mixed-language calls and use cases.' },
      { to: '/solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate', label: 'Kannada real estate calls', body: 'The local Kannada page for Bengaluru property enquiries.' },
      { to: '/product/inbound', label: 'Inbound call answering', body: 'How a phone number is routed to an agent.' },
      { to: '/solutions/real-estate', label: 'Real estate calling workflow', body: 'Qualification, site visits and follow-up.' },
    ],
    title: 'Kannada Inbound Property Enquiry Demo Call',
    description:
      'A Kannada inbound real estate call demo showing project questions, budget capture, and a clean sales handoff.',
    language: 'Kannada + English',
    scenario: 'A Bengaluru buyer asks about project details and availability.',
    outcome: 'Qualified enquiry with project interest and follow-up request.',
    transcript: [
      { speaker: 'Agent', text: 'Namaskara, thanks for calling. Are you looking for investment or self-use?' },
      { speaker: 'Caller', text: 'Self-use. Location mattu price details beku.' },
      { speaker: 'Agent', text: 'Sure. I can note your requirement and have the team confirm exact price and availability. What budget range are you considering?' },
      { speaker: 'Caller', text: 'Around one crore.' },
      { speaker: 'Agent', text: 'Noted. I will mark this as a self-use enquiry with budget around one crore.' },
    ],
    fields: [
      { label: 'Language', value: 'Kannada + English' },
      { label: 'Purpose', value: 'Self-use' },
      { label: 'Budget', value: 'Around ₹1 crore' },
      { label: 'Next step', value: 'Availability follow-up' },
    ],
    faqs: [
      { q: 'Does Vistrow handle Kannada-English mixed calls?', a: 'Yes. Mixed-language behavior should be tested on your exact agent, but the product is designed for multilingual Indian calls.' },
      { q: 'Can it answer project questions?', a: 'Yes, if project facts are added to the knowledge base. The agent should avoid inventing pricing or inventory.' },
      { q: 'Can it create a CRM lead?', a: 'Yes. The final call payload can include caller data, requirement, transcript, summary, and recording link.' },
      { q: 'Can the agent answer calls outside office hours?', a: 'Yes. Inbound settings let you choose the hours and days the agent answers, so you can cover evenings and weekends as well as busy periods.' },
      { q: 'How do I check how it handles Kannada before launch?', a: 'Use the Testing Lab and a test call on your own agent. Scenarios cover interruptions, language switching and unsupported questions, and you can review the results before publishing.' },
      { q: 'What if the caller wants a person?', a: 'Set a transfer phone number and the agent can dial a colleague into the call and stay on until they answer.' },
    ],
  },
  {
    slug: 'telugu-website-widget-call',
    callerExperience: [
      { title: '1. The visitor taps the button', body: 'On a project page, a visitor taps the call button. The call runs in the browser using their microphone, so there is no number to dial and nothing to install.' },
      { title: '2. A short greeting, then a question', body: 'The agent greets them in Telugu and asks what they want: pricing, availability or a site visit.' },
      { title: '3. It asks only what it needs', body: 'The visitor wants pricing and location details and says the interest is investment. The agent records that and does not push for more than the call needs.' },
      { title: '4. The page comes with the lead', body: 'The call record shows the website and the exact page the call started from, so the team knows which project the visitor was reading.' },
    ],
    whyItMatters:
      'A visitor who has a question but not enough patience to fill in a form often leaves. A voice button lets them ask in their own language at the moment they are interested, and the lead that results arrives with the page they were on.',
    configure: [
      { title: 'Add the website', body: 'In Website Widget, name the site, pick the agent, the corner and the button label, then paste the script tag or use the WordPress plugin.', to: '/help/website-widget/add-widget', link: 'Add the call button' },
      { title: 'Ask before starting', body: 'For name, phone and email choose Don’t ask, Optional or Required. With all three off the call starts on a single tap.' },
      { title: 'Page rules', body: 'Send visitors on a particular page to a different agent with its own greeting, for example one project page to an agent that knows only that project.', to: '/help/website-widget/page-rules', link: 'Page rules' },
      { title: 'Voice, chat or both', body: 'Offer voice, text chat only, or let the visitor choose. Microphone permission comes from the visitor’s browser.' },
    ],
    related: [
      { to: '/languages/telugu', label: 'Telugu AI voice calling agent', body: 'Telugu voices, mixed-language calls and use cases.' },
      { to: '/solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate', label: 'Telugu real estate calls', body: 'The local Telugu page for Hyderabad property enquiries.' },
      { to: '/product/widget', label: 'Website voice widget', body: 'How the website call button is set up and configured.' },
      { to: '/solutions/real-estate', label: 'Real estate calling workflow', body: 'Qualification, site visits and follow-up.' },
    ],
    title: 'Telugu Website Widget Voice Call Demo',
    description:
      'See how a Telugu-speaking website visitor can start a voice conversation in the browser and become a structured lead record.',
    language: 'Telugu + English',
    scenario: 'A website visitor taps the voice widget and asks about a property project.',
    outcome: 'Website conversation converted into a CRM-ready lead.',
    transcript: [
      { speaker: 'Agent', text: 'Namaskaram, thanks for visiting. Are you looking for pricing, availability, or a site visit?' },
      { speaker: 'Caller', text: 'Pricing and location details kavali.' },
      { speaker: 'Agent', text: 'I can help. Are you exploring for investment or own use?' },
      { speaker: 'Caller', text: 'Investment.' },
      { speaker: 'Agent', text: 'Noted. I will share your interest with the team along with this page and call summary.' },
    ],
    fields: [
      { label: 'Channel', value: 'Website widget' },
      { label: 'Language', value: 'Telugu + English' },
      { label: 'Purpose', value: 'Investment' },
      { label: 'Next step', value: 'Pricing/location follow-up' },
    ],
    faqs: [
      { q: 'Does the website visitor need a phone number?', a: 'No. The website widget starts a browser voice conversation. You can still collect name and phone before or during the call.' },
      { q: 'Can the page URL be sent to CRM?', a: 'Yes. Vistrow can include the website and page path in the call record and webhook payload.' },
      { q: 'Can widget calls be recorded?', a: 'Yes, where recording is enabled and compliant with your consent and retention policy.' },
      { q: 'Does the widget work on a phone browser?', a: 'Yes. It works in desktop and mobile browsers. The browser asks the visitor for microphone permission before the call begins.' },
      { q: 'Can different pages use different agents?', a: 'Yes. Page rules route visitors on matching pages to a different agent, with its own greeting and avatar.' },
      { q: 'Can a visitor type instead of speaking?', a: 'Yes, if you enable chat. The widget can be voice, text chat only, or let the visitor choose.' },
    ],
  },
]

const HUB_EXTRA: Pick<BuyerGuide, 'approaches' | 'checklist' | 'trial' | 'related'> & { extraFaqs: Faq[] } = {
  approaches: [
    {
      title: 'Cloud telephony and contact-center suites',
      fits: 'You need numbers, routing, queues, dialers or agent desktops for a human team, and you are comfortable building or buying the automation on top.',
      tradeoff: 'They provide the lines and the operation, but the AI conversation itself is usually something you assemble or add.',
    },
    {
      title: 'Speech and language model providers',
      fits: 'You have engineers, want full control of every component and are building a voice product of your own.',
      tradeoff: 'You also own call handling, logs, dashboards, monitoring and support, which is real ongoing work.',
    },
    {
      title: 'Programmable voice-agent platforms',
      fits: 'Developers want to assemble custom agents quickly without building the telephony and speech plumbing from scratch.',
      tradeoff: 'Flexibility comes with build and maintenance effort, and language and CRM fit still need testing for India.',
    },
    {
      title: 'Finished voice-agent products',
      fits: 'Business teams want an agent live quickly, editable from a dashboard, with transcripts and CRM delivery included.',
      tradeoff: 'You accept the product’s defaults in return for speed, so check that its controls cover what you need.',
    },
    {
      title: 'Menus, chatbots and receptionists',
      fits: 'Call volume is low, routing is simple, or customers mostly write instead of phoning.',
      tradeoff: 'Menus route but do not answer, and chatbots cannot take a phone call. The IVR comparison page covers this in detail.',
    },
  ],
  checklist: [
    { criterion: 'Languages', good: 'Handles your customers’ real speech, including mixed languages, names and numbers.', test: 'Call in each language you serve and switch language mid-sentence.' },
    { criterion: 'Response speed', good: 'The pause after the caller stops feels natural and does not vary wildly.', test: 'Time the gap to the first word on a phone line, not only in a browser.' },
    { criterion: 'Interruptions', good: 'The agent stops talking when the caller speaks and recovers cleanly.', test: 'Interrupt mid-sentence, stay silent, and talk over it.' },
    { criterion: 'Channels', good: 'Phone and website calls share one agent, one knowledge base and one record.', test: 'Run the same script on both channels.' },
    { criterion: 'Answer control', good: 'Answers come from approved material, and unknown questions get an honest reply.', test: 'Ask questions that are not in the knowledge base.' },
    { criterion: 'Call record', good: 'Transcript, summary, captured fields and outcome you can act on.', test: 'Open the record after a test call and see whether your team could follow up from it alone.' },
    { criterion: 'CRM delivery', good: 'Records arrive in your CRM or webhook, with visible status and a retry when it fails.', test: 'Break the connection on purpose and see what is shown.' },
    { criterion: 'Compliance controls', good: 'Consent, recording and retention settings, plus calling hours and Do-Not-Call handling for outbound.', test: 'Check the settings exist and that blocked calls are really blocked.' },
    { criterion: 'Human hand-off', good: 'A transfer or callback path with context travelling to the person.', test: 'Ask for a human on a phone call and see what the colleague receives.' },
    { criterion: 'Who can change it', good: 'Business users can edit prompts, voices and answers without an engineer.', test: 'Ask a non-technical colleague to change a greeting and re-test it.' },
  ],
  trial: [
    'Write down the call types you want handled, the languages, and the record your team needs afterwards.',
    'Shortlist two or three options from different categories above, so you learn what the trade-offs are.',
    'Build the same agent on each with identical prompts and knowledge, then run 20 to 30 scripted calls, including difficult ones.',
    'Score every option on the checklist with the same people and the same written criteria.',
    'Pilot one line or an after-hours window, read the transcripts weekly, and widen only when the results hold.',
  ],
  related: [
    { to: '/product/agents', label: 'Voice agents' },
    { to: '/product/inbound', label: 'Inbound calling' },
    { to: '/product/widget', label: 'Website call widget' },
    { to: '/languages', label: 'Supported languages' },
    { to: '/ai-ivr', label: 'AI IVR' },
    { to: '/vs-ivr', label: 'Voice agent vs IVR' },
    { to: '/compare/exotel', label: 'Vistrow Voice vs Exotel' },
    { to: '/compare/sarvam-ai', label: 'Build or buy voice agents' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/voice-ai-platform', label: 'Voice AI platform' },
    { to: '/ai-call-center', label: 'AI call center software' },
    { to: '/voice-bot', label: 'What an AI voice bot is' },
  ],
  extraFaqs: [
    { q: 'Do I need developers to run an AI voice agent?', a: 'It depends on the category. Programmable platforms and model providers assume engineering. A finished product such as Vistrow Voice has a no-code agent builder, so business teams can set the prompt, voice and language and test it themselves.' },
    { q: 'Should I start with phone calls or website calls?', a: 'Start where your enquiries already arrive. A website call widget needs no phone number and is quick to test; phone calls matter when most customers ring you. Choose a product that supports both on one agent.' },
    { q: 'Does an AI voice agent replace a call team?', a: 'Usually not. It takes repetitive, high-volume calls and passes the rest to people with a transcript, so your team spends its time on calls that need judgement.' },
    { q: 'How do I compare vendors fairly?', a: 'Use the same script, languages, phone network and scoring sheet for every option, and compare finished call records as well as audio. Verify vendor features and plans directly, because products change.' },
  ],
}

export const BUYER_GUIDES: BuyerGuide[] = BASE_BUYER_GUIDES.map((guide) =>
  guide.slug === 'best-ai-voice-calling-software-india'
    ? { ...guide, approaches: HUB_EXTRA.approaches, checklist: HUB_EXTRA.checklist, trial: HUB_EXTRA.trial, related: HUB_EXTRA.related, faqs: [...guide.faqs, ...HUB_EXTRA.extraFaqs] }
    : guide,
)
