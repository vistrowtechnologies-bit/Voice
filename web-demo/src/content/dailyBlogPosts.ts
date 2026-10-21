import type { VoiceBlogPost, VoiceBlogSection } from './voiceBlog'

// Daily posts (from 21 Oct 2026), one buyer-intent keyword each. Plan,
// evidence and calendar: docs/SEO-BLOG-PLAN-2026-10-21.md.
// Rules: no prices, no named competitors, no invented statistics (every
// number is in SOURCES). Product statements must match the product: more
// than 130 languages (owner decision 21 Oct 2026; Studio voices), 10 Indian; phone numbers connect through the customer's
// telephony provider and overseas calling depends on that provider; the
// website voice widget works from any browser.

export type DailyBlogPost = Omit<VoiceBlogPost, 'image' | 'imageAlt' | 'updatedAt' | 'sources' | 'sections'> & {
  sections: VoiceBlogSection[]
}

export const DAILY_POSTS: DailyBlogPost[] = [
  {
    slug: 'multilingual-ai-receptionist-hindi-punjabi-english',
    title: 'Multilingual AI receptionist: answering Hindi, Punjabi and English callers with one agent',
    seoTitle: 'Multilingual AI Receptionist for Hindi & Punjabi Callers',
    metaDescription: 'How one AI receptionist can answer Hindi, Punjabi and English callers in the UK, Canada, the US and UAE, and what to test before you trust it.',
    shortAnswer: 'A multilingual AI receptionist answers every call, understands callers who speak Hindi, Punjabi, English or a mix of them, and replies in the same language. It suits businesses in the UK, Canada, the US and the Gulf with South Asian customers. Test it with native speakers, mixed-language calls and real names before going live.',
    excerpt: 'Many businesses in the UK, Canada, the US and the Gulf serve customers who are more comfortable in Hindi or Punjabi. Here is how to run one AI receptionist for all of them, and what to test before you trust it.',
    category: 'Languages & speech',
    publishedAt: '2026-10-21',
    readTime: '',
    related: ['how-to-choose-a-multilingual-voice-agent', 'website-voice-widget-for-lead-generation', 'what-is-an-ai-voice-agent'],
    sections: [
      { heading: 'Who needs a multilingual AI receptionist?', paragraphs: [
        'A clinic in Brampton, an immigration consultancy in Southall, a property developer selling to buyers in Dubai and a travel agency in New Jersey have the same problem. A large share of their callers would rather speak Hindi or Punjabi, often mixed with English, and the person who can do that is not always free when the phone rings.',
        'This is not a niche. In England and Wales, Panjabi is the main language of about 291,000 people, according to the 2021 Census. Canada counted 942,000 people who speak Punjabi and 761,000 who speak Hindi in 2021. A receptionist who answers only in English, or a phone menu that asks callers to press 1 for English, quietly loses part of that audience.',
        'A multilingual AI receptionist answers every call, greets the caller, and continues in the language the caller uses. The aim is simple: the caller should never have to adapt to the business.',
      ] },
      { heading: 'Which languages can a Hindi and Punjabi AI receptionist speak?', paragraphs: [
        'Vistrow Voice is an AI voice agent platform that answers phone calls and website conversations in more than 130 languages, including Hindi, English and nine other Indian languages: Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia. One agent can follow a caller from English into Hindi or Punjabi and back within the same call. Each language has its own page, for example the [Hindi AI voice agent overview](/languages/hindi) and the [Punjabi AI voice agent overview](/languages/punjabi).',
        'Test the languages your callers actually use rather than trusting a number. If many of your callers mix Punjabi, Hindi and English, or switch to a regional language when they get comfortable, make those mixes part of your pilot and listen to how the agent handles names, numbers and dates in each.',
      ] },
      { heading: 'What should "multilingual" mean on a real call?', paragraphs: [
        'A list of supported languages tells you very little. What matters is whether the agent can hold a useful conversation the way your callers actually speak. Our [multilingual voice agent evaluation checklist](/resources/blog/how-to-choose-a-multilingual-voice-agent) covers vendor testing in detail; on a receptionist line, four things matter most.',
      ], points: [
        'Mid-sentence switching. Callers say things like "mujhe Tuesday ka appointment chahiye" without thinking about it. The agent should understand mixed Hindi and English, and reply in the same style rather than forcing a formal register.',
        'Following the caller, not the caller ID. A Canadian mobile number tells you nothing about which language someone prefers. The agent should follow what the caller says, and let them ask to switch at any point.',
        'Names, places and numbers. Listen to how the agent says your business name, street names, dates, times and phone numbers in each language. These are the details that make a caller trust or doubt the call.',
        'Correct grammar for the voice. Hindi and Punjabi verbs change with the speaker’s gender. A male voice saying "main aa rahi hoon" sounds wrong to every native listener, so the agent’s phrasing must match the voice you choose.',
      ] },
      { heading: 'Phone number or website: where should callers reach the AI receptionist?', paragraphs: [
        'There are two ways callers reach the agent. The first is your phone number. The number stays with your telephony provider and is routed to the agent, as described on the [inbound AI call answering page](/product/inbound), so whether overseas callers can reach it, and at what rate, depends on that provider and the number you use. Check international calling support with your provider before you promise it to customers abroad.',
        'The second is a voice button on your website. A visitor taps it and talks from the browser, with no phone call at all. The [website voice widget](/product/widget) is often the simplest way to offer a conversation in Hindi or Punjabi to anyone, anywhere, without arranging numbers in every market.',
        'Many teams use both: the phone line for existing customers who already have the number, and the website button for new enquiries from search and social media.',
      ] },
      { heading: 'How do you test a multilingual AI receptionist before launch?', paragraphs: [
        'Pick one high-volume call type, such as new enquiries or appointment requests. Write the facts the agent may use, the questions it should ask, and the point at which it hands over to a person. Then run a one-week pilot the way your callers will use it, and measure response time as well as accuracy using our [voice AI latency testing guide](/resources/blog/voice-ai-latency-how-to-measure-it).',
      ], points: [
        'Ask three native speakers to call in Hindi, in Punjabi and in mixed Hindi and English, using ordinary speech and a normal mobile connection.',
        'Read the transcripts next to the recordings. Mark every name, number or date the agent got wrong.',
        'Check the handoff: does the person who takes over receive the caller’s name, need and language, so the caller does not repeat themselves? The [CRM handoff checklist](/resources/blog/connecting-voice-calls-to-your-crm) lists what that record should contain.',
        'Try the awkward cases: a caller who changes language halfway, background noise, a wrong number, and a request the agent should refuse.',
        'Decide what the agent must never do, such as quoting prices it was not given, and confirm it holds that line in every language.',
      ] },
      { heading: 'Which businesses benefit most?', paragraphs: [
        'The pattern is the same across industries: a high share of first calls are routine, and callers are more relaxed in their own language. Clinics use a receptionist to take appointment requests and answer opening-hours questions; the [healthcare voice AI overview](/solutions/healthcare) shows how that works with a human on hand for anything clinical. Property sellers use it to qualify buyers and book site visits, as described on the [real estate voice AI page](/solutions/real-estate).',
        'Immigration consultants, travel agencies, insurance brokers and restaurants serving South Asian communities see the same benefit: callers explain themselves fully the first time, and staff spend their time on the conversations that need them.',
      ] },
      { heading: 'Should callers be told they are speaking to an AI?', paragraphs: [
        'Yes. Tell callers they are speaking with an AI assistant and that the call may be recorded, in the language they are using. It costs one sentence and avoids the moment a caller realises it on their own. Keep a clear route to a person for complaints, sensitive questions and anything the agent is not sure about. Our guide to [AI call recordings and transcripts](/resources/blog/ai-call-recordings-and-transcripts) covers what to check once calls are recorded.',
        'Recording and disclosure rules differ between countries and regions. Agree your wording and retention period with whoever handles compliance for each market you serve; this article is practical guidance, not legal advice.',
      ] },
      { heading: 'What does good look like after launch?', paragraphs: [
        'Within a few weeks you should be able to answer three questions from the call history: how many calls each language received, how many ended with the caller’s need met or a clear next step, and where callers dropped off or asked for a person. If one language has noticeably more handoffs, listen to those calls first; the cause is usually a missing fact or a phrase the agent handles poorly, and both are quick to fix.',
        'A good multilingual receptionist does not replace the people who know your customers. It makes sure that every caller, in whatever language they are comfortable with, gets a prompt and useful first answer. When you are ready to size a pilot, compare plans on the [Vistrow Voice pricing page](/pricing).',
      ] },
    ],
    faqs: [
      { q: 'Can one AI receptionist speak Hindi, Punjabi and English on the same call?', a: 'Yes. A multilingual agent follows the language the caller uses and can switch mid-call, including mixed Hindi and English. Test it with native speakers before launch, because recognition of names and numbers varies between systems.' },
      { q: 'Which languages does Vistrow Voice speak?', a: 'More than 130, including Hindi, English, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia. Test the exact languages and mixes your callers use before launch.' },
      { q: 'Can callers outside India reach the AI receptionist?', a: 'By phone, that depends on the number and telephony provider you connect, so check international calling with your provider. From a website, anyone can talk to the agent in their browser through the [website voice widget](/product/widget).' },
      { q: 'Will the AI receptionist tell callers it is an AI?', a: 'It should. Open each call with a short disclosure in the caller’s language that they are speaking with an AI assistant and that the call may be recorded, and offer a person on request.' },
      { q: 'How long does it take to test a multilingual receptionist?', a: 'A focused one-week pilot on a single call type is usually enough to see where the agent mishears names or numbers, how handoffs work, and whether callers in each language reach a clear next step.' },
    ],
  },
]

export const DAILY_IMAGE_ALTS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'Large Hindi and Punjabi greetings and Hello beside a Sikh caller at a front desk, with an Artha AI badge',
}

export const DAILY_SOURCES: Record<string, VoiceBlogPost['sources']> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': [
    { title: 'Office for National Statistics: Language, England and Wales, Census 2021', url: 'https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/language/bulletins/languageenglandandwales/census2021' },
    { title: 'Statistics Canada: Asian History Month, let’s talk languages (2021 Census)', url: 'https://www.statcan.gc.ca/o1/en/plus/9158-asian-history-month-lets-talk-languages' },
  ],
}

export const DAILY_CONTEXTUAL_LINKS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'To see how this works for a small team, read how an [AI receptionist answers and routes calls](/ai-receptionist), or browse every [language the voice agent supports](/languages).',
}
