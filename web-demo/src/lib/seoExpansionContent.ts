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
}

export const COMPARE_VENDORS: CompareVendor[] = [
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
      { dimension: 'Best fit', vendor: 'Ops teams with telephony-first requirements.', vistrow: 'Sales/support teams that want conversation automation first.' },
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
      { dimension: 'Languages', vendor: 'Depends on the call-flow/agent setup.', vistrow: 'Indian-language and global-language voice options with page-level language selection.' },
      { dimension: 'CRM output', vendor: 'Depends on integration configuration.', vistrow: 'Lead fields, transcript, call outcome, and recording link are prepared for CRM sync.' },
      { dimension: 'Best fit', vendor: 'Telephony-first teams.', vistrow: 'Teams that want the AI agent to do the first conversation.' },
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
      { dimension: 'Cost control', vendor: 'Model/API costs depend on usage and architecture.', vistrow: 'Credit-based plans with usage visibility in the dashboard.' },
      { dimension: 'Best fit', vendor: 'Teams building proprietary voice infrastructure.', vistrow: 'Teams that need working AI calls and CRM outcomes quickly.' },
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
      { dimension: 'Best fit', vendor: 'Voice-first media or custom engineering teams.', vistrow: 'Teams buying a business calling agent.' },
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
    buyerIntent: 'Use this when shortlisting voice-agent platforms and testing which one performs best for Indian customer calls.',
    rows: [
      { dimension: 'Target buyer', vendor: 'Often strong for technical teams building custom agents.', vistrow: 'Designed for Indian businesses that want phone, web, dashboard, and CRM workflow together.' },
      { dimension: 'India language fit', vendor: 'Must be tested per language and voice stack.', vistrow: 'Built around Indian-language and code-switching use cases.' },
      { dimension: 'Website calls', vendor: 'Depends on implementation and product fit.', vistrow: 'Native website widget with lead capture and call records.' },
      { dimension: 'CRM outcome', vendor: 'Implementation-dependent.', vistrow: 'Lead fields, summary, transcript, recording link, and delivery status are first-class.' },
      { dimension: 'Best fit', vendor: 'Custom programmable agent builds.', vistrow: 'Revenue/support teams wanting faster rollout.' },
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
      { dimension: 'Best fit', vendor: 'Teams comparing programmable AI call automation.', vistrow: 'Teams needing localized AI lead/support calls with business records.' },
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
      { dimension: 'Best fit', vendor: 'Teams comparing no-code global voice builders.', vistrow: 'Teams wanting localized calling plus CRM handoff.' },
    ],
    faqs: [
      { q: 'What should I test in a no-code voice agent?', a: 'Test setup speed, live latency, caller interruptions, multilingual behavior, hallucination controls, CRM payloads, and support for your exact call volume.' },
      { q: 'Does Vistrow Voice support appointments?', a: 'Yes. Appointment and next-step workflows are part of Vistrow’s product pages and call flow design.' },
      { q: 'Can I use Vistrow for both web and phone?', a: 'Yes. That is one of the key differences from phone-only calling tools.' },
    ],
  },
]

export interface BuyerGuide {
  slug: string
  title: string
  description: string
  eyebrow: string
  headline: string
  subhead: string
  sections: Array<{ title: string; body: string; bullets: string[] }>
  faqs: Faq[]
}

export const BUYER_GUIDES: BuyerGuide[] = [
  {
    slug: 'best-ai-voice-calling-software-india',
    title: 'Best AI Voice Calling Software in India | Vistrow Voice',
    description:
      'A practical buyer guide to choosing AI voice calling software in India across latency, Indian languages, phone calls, website widgets, CRM sync, recordings, and pricing.',
    eyebrow: 'Buyer guide',
    headline: 'How to choose AI voice calling software in India.',
    subhead:
      'The best tool is not the one with the flashiest demo. It is the one that handles your real calls, in your customer’s language, and leaves your team with a useful record.',
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
      { q: 'What is the best AI voice calling software in India?', a: 'For most teams, the best option is the one that performs well on their exact language, call type, phone network, and CRM workflow. Vistrow Voice is built specifically around Indian-language phone and website conversations.' },
      { q: 'Should I prioritize price or latency?', a: 'Prioritize call success first. A cheaper model that causes awkward pauses or bad answers can cost more in lost leads than it saves in API spend.' },
      { q: 'How many test calls should I run before launch?', a: 'Run at least 20–30 test calls across languages, noisy audio, interruptions, failed answers, and CRM delivery before trusting an agent with real leads.' },
    ],
  },
  {
    slug: 'ai-voice-bot-pricing-india',
    title: 'AI Voice Bot Pricing in India | Cost Factors and Calculator',
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
    ],
    faqs: [
      { q: 'How much does an AI voice bot cost in India?', a: 'It depends on monthly minutes, phone vs web calls, voice quality, model choice, recording storage, and integrations. Compare the full workflow cost, not only one API price.' },
      { q: 'Why are voice AI calls priced per minute?', a: 'Because live calls consume streaming speech recognition, language-model reasoning, voice synthesis, transport, and storage while the conversation is happening.' },
      { q: 'Can I reduce cost by using a smaller LLM?', a: 'Yes, for structured qualification flows a smaller fast model can work well. You still need to test accuracy, hallucination controls, and latency on real calls.' },
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
  faqs: Faq[]
}

export const DEMO_CALLS: DemoCall[] = [
  {
    slug: 'hindi-real-estate-lead-qualification',
    title: 'Hindi Real Estate Lead Qualification Demo Call',
    description:
      'See how Vistrow Voice qualifies a Hindi real estate lead, captures budget and plot size, summarizes the call, and prepares CRM-ready data.',
    language: 'Hindi + Hinglish',
    scenario: 'A buyer asks about a plotted development and shares investment intent.',
    outcome: 'Qualified investment lead with budget, preferred size, and next-step follow-up.',
    transcript: [
      { speaker: 'Agent', text: 'Namaste, I am calling about your interest in the Khopoli project. Are you exploring this for investment or self-use?' },
      { speaker: 'Caller', text: 'Investment ke liye.' },
      { speaker: 'Agent', text: 'Great. Which plot size are you roughly looking at, and do you have a budget range in mind?' },
      { speaker: 'Caller', text: 'Around 6000 square feet. Pricing bata dijiye.' },
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
    ],
  },
  {
    slug: 'marathi-site-visit-booking',
    title: 'Marathi Site Visit Booking Demo Call',
    description:
      'A Marathi real estate demo call showing how an AI voice agent confirms buyer interest, preferred time, and site-visit next steps.',
    language: 'Marathi + Hindi',
    scenario: 'A buyer wants to schedule a site visit for a project in Pune.',
    outcome: 'Site-visit request captured with preferred day and buyer context.',
    transcript: [
      { speaker: 'Agent', text: 'Namaskar, tumhi project sathi enquiry keli hoti. Site visit schedule karaychi aahe ka?' },
      { speaker: 'Caller', text: 'Ho, Saturday la possible aahe ka?' },
      { speaker: 'Agent', text: 'Saturday preference note karto. Morning ki afternoon convenient aahe?' },
      { speaker: 'Caller', text: 'Afternoon.' },
      { speaker: 'Agent', text: 'Perfect. Sales team exact slot confirm karun tumhala WhatsApp var details pathavel.' },
    ],
    fields: [
      { label: 'Language', value: 'Marathi' },
      { label: 'Intent', value: 'Site visit' },
      { label: 'Preferred time', value: 'Saturday afternoon' },
      { label: 'Next step', value: 'Confirm slot and send details' },
    ],
    faqs: [
      { q: 'Can Vistrow book directly on a calendar?', a: 'Yes, where a calendar integration is configured. Otherwise it can capture the preferred slot and hand it to the sales team.' },
      { q: 'Can the caller switch to Hindi?', a: 'Yes. The agent can follow mixed Marathi, Hindi, and English depending on the configured voice pipeline.' },
      { q: 'What does the sales team receive?', a: 'They receive the caller details, transcript, summary, preferred slot, and lead outcome.' },
    ],
  },
  {
    slug: 'kannada-inbound-property-enquiry',
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
    ],
  },
  {
    slug: 'telugu-website-widget-call',
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
    ],
  },
]
