import type { VoiceBlogPost, VoiceBlogSection } from './voiceBlog'

// Daily posts (from 21 Oct 2026), one buyer-intent keyword each. Plan,
// evidence and calendar: docs/SEO-BLOG-PLAN-2026-10-21.md.
// Rules: no prices, no named competitors, no invented statistics (every
// number is in SOURCES). Product statements must match the product: 12
// languages and no Urdu; phone numbers connect through the customer's
// telephony provider and overseas calling depends on that provider; the
// website voice widget works from any browser.

export interface DailyBlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readTime: string
  sections: VoiceBlogSection[]
}

export const DAILY_POSTS: DailyBlogPost[] = [
  {
    slug: 'multilingual-ai-receptionist-hindi-punjabi-english',
    title: 'Multilingual AI receptionist: answering Hindi, Punjabi and English callers with one agent',
    excerpt: 'Many businesses in the UK, Canada, the US and the Gulf serve customers who are more comfortable in Hindi or Punjabi. Here is how to run one AI receptionist for all of them, and what to test before you trust it.',
    category: 'Languages & speech',
    publishedAt: '2026-10-21',
    readTime: '',
    sections: [
      { heading: 'Who needs a receptionist that switches language', paragraphs: [
        'A clinic in Brampton, an immigration consultancy in Southall, a property developer selling to buyers in Dubai and a travel agency in New Jersey have the same problem. A large share of their callers would rather speak Hindi or Punjabi, often mixed with English, and the person who can do that is not always free when the phone rings.',
        'This is not a niche. In England and Wales, Panjabi is the main language of about 291,000 people, according to the 2021 Census. Canada counted 942,000 people who speak Punjabi and 761,000 who speak Hindi in 2021. A receptionist who answers only in English, or a phone menu that asks callers to press 1 for English, quietly loses a part of that audience.',
        'A multilingual AI receptionist answers every call, greets the caller, and continues in the language the caller uses. The aim is simple: the caller should never have to adapt to the business.',
      ] },
      { heading: 'What "multilingual" should mean on a real call', paragraphs: [
        'A list of supported languages tells you very little. What matters is whether the agent can hold a useful conversation the way your callers actually speak. In practice that means four things.',
      ], points: [
        'Mid-sentence switching. Callers say things like "mujhe Tuesday ka appointment chahiye" without thinking about it. The agent should understand mixed Hindi and English, and reply in the same style rather than forcing a formal register.',
        'Following the caller, not the caller ID. A Canadian mobile number tells you nothing about which language someone prefers. The agent should follow what the caller says, and let them ask to switch at any point.',
        'Names, places and numbers. Listen to how the agent says your business name, street names, dates, times and phone numbers in each language. These are the details that make a caller trust or doubt the call.',
        'Correct grammar for the voice. Hindi and Punjabi verbs change with the speaker’s gender. A male voice saying "main aa rahi hoon" sounds wrong to every native listener, so the agent’s phrasing must match the voice you choose.',
      ] },
      { heading: 'Phone line or website: where the conversation starts', paragraphs: [
        'There are two ways callers reach the agent. The first is your phone number. The number stays with your telephony provider and is routed to the agent, so whether overseas callers can reach it, and at what rate, depends on that provider and the number you use. Check international calling support with your provider before you promise it to customers abroad.',
        'The second is a voice button on your website. A visitor taps it and talks from the browser, with no phone call at all. For businesses whose customers are spread across countries, this is often the simplest way to offer a conversation in Hindi or Punjabi to anyone, anywhere, without arranging numbers in every market.',
        'Many teams use both: the phone line for existing customers who already have the number, and the website button for new enquiries from search and social media.',
      ] },
      { heading: 'A one-week pilot you can run before committing', paragraphs: [
        'Pick one high-volume call type, such as new enquiries or appointment requests. Write the facts the agent may use, the questions it should ask, and the point at which it hands over to a person. Then test it the way your callers will use it.',
      ], points: [
        'Ask three native speakers to call in Hindi, in Punjabi and in mixed Hindi and English, using ordinary speech and a normal mobile connection.',
        'Read the transcripts next to the recordings. Mark every name, number or date the agent got wrong.',
        'Check the handoff: does the person who takes over receive the caller’s name, need and language, so the caller does not repeat themselves?',
        'Try the awkward cases: a caller who changes language halfway, background noise, a wrong number, and a request the agent should refuse.',
        'Decide what the agent must never do, such as quoting prices it was not given, and confirm it holds that line in every language.',
      ] },
      { heading: 'Be open with callers', paragraphs: [
        'Tell callers they are speaking with an AI assistant and that the call may be recorded, in the language they are using. It costs one sentence and avoids the moment a caller realises it on their own. Keep a clear route to a person for complaints, sensitive questions and anything the agent is not sure about.',
        'Recording and disclosure rules differ between countries and regions. Agree your wording and retention period with whoever handles compliance for each market you serve; this article is practical guidance, not legal advice.',
      ] },
      { heading: 'What good looks like after launch', paragraphs: [
        'Within a few weeks you should be able to answer three questions from the call history: how many calls each language received, how many ended with the caller’s need met or a clear next step, and where callers dropped off or asked for a person. If one language has noticeably more handoffs, listen to those calls first; the cause is usually a missing fact or a phrase the agent handles poorly, and both are quick to fix.',
        'A good multilingual receptionist does not replace the people who know your customers. It makes sure that every caller, in whatever language they are comfortable with, gets a prompt and useful first answer.',
      ] },
    ],
  },
]

export const DAILY_IMAGE_ALTS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'Receptionist at a small clinic front desk answering a phone call while a customer waits',
}

export const DAILY_SOURCES: Record<string, VoiceBlogPost['sources']> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': [
    { title: 'Office for National Statistics: Language, England and Wales, Census 2021', url: 'https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/language/bulletins/languageenglandandwales/census2021' },
    { title: 'Statistics Canada: Asian History Month, let’s talk languages (2021 Census)', url: 'https://www.statcan.gc.ca/o1/en/plus/9158-asian-history-month-lets-talk-languages' },
  ],
}

export const DAILY_CONTEXTUAL_LINKS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'Before shortlisting a vendor, work through our [multilingual voice agent evaluation checklist](/resources/blog/how-to-choose-a-multilingual-voice-agent), and see how an [AI receptionist answers and routes calls](/ai-receptionist) for a small team.',
}
